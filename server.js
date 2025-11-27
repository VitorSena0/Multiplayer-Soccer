const express = require('express');
const socketio = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    allowEIO3: true,
});

app.use(express.static('public'));

// Constantes do jogo
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 10;
const GOAL_HEIGHT = 200;
const GOAL_WIDTH = 50;
const MATCH_DURATION = 60;
const MAX_PLAYERS_PER_ROOM = 6;
const CORNER_SIZE = 80;

const rooms = new Map();
let roomSequence = 1;

const defaultBallState = () => ({
    x: 400,
    y: 300,
    radius: BALL_RADIUS,
    speedX: 0,
    speedY: 0,
});

function sanitizeRoomId(roomId) {
    if (typeof roomId !== 'string') return null;
    const trimmed = roomId.trim().toLowerCase();
    if (!trimmed) return null;
    const normalized = trimmed
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 32);
    return normalized || null;
}

function generateRoomId() {
    let candidate;
    do {
        candidate = `room-${roomSequence++}`;
    } while (rooms.has(candidate));
    return candidate;
}

function createRoom(roomId = generateRoomId()) {
    const id = rooms.has(roomId) ? generateRoomId() : roomId;
    const roomState = {
        id,
        width: 800,
        height: 600,
        players: {},
        ball: defaultBallState(),
        score: { red: 0, blue: 0 },
        teams: { red: [], blue: [] },
        matchTime: MATCH_DURATION,
        isPlaying: false,
        isResettingBall: false,
        nextBallPosition: null,
        ballResetInProgress: false,
        lastGoalTime: 0,
        goalCooldown: 500,
        waitingForRestart: false,
        playersReady: new Set(),
    };
    rooms.set(id, roomState);
    console.log(`Sala criada: ${id}`);
    return roomState;
}

function getPlayerCount(room) {
    return Object.keys(room.players).length;
}

function getOrCreateAvailableRoom() {
    for (const room of rooms.values()) {
        if (getPlayerCount(room) < MAX_PLAYERS_PER_ROOM) {
            return room;
        }
    }
    return createRoom();
}

function allocateRoom(requestedRoomId) {
    if (requestedRoomId) {
        const sanitized = sanitizeRoomId(requestedRoomId);
        if (!sanitized) {
            return { room: getOrCreateAvailableRoom() };
        }
        const room = rooms.get(sanitized) || createRoom(sanitized);
        if (getPlayerCount(room) < MAX_PLAYERS_PER_ROOM) {
            return { room };
        }
        return { error: 'room-full', roomId: sanitized };
    }

    return { room: getOrCreateAvailableRoom() };
}

function buildGameState(room) {
    return {
        width: room.width,
        height: room.height,
        players: room.players,
        ball: room.ball,
        score: room.score,
        teams: room.teams,
        matchTime: room.matchTime,
        isPlaying: room.isPlaying,
        roomId: room.id,
    };
}

function resetBall(room) {
    const thirdWidth = room.width / 3;
    const minX = room.width / 2 - thirdWidth / 2;
    const maxX = room.width / 2 + thirdWidth / 2;
    const thirdHeight = room.height / 3;
    const minY = room.height / 2 - thirdHeight / 2;
    const maxY = room.height / 2 + thirdHeight / 2;

    room.ball = {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
        radius: BALL_RADIUS,
        speedX: 0,
        speedY: 0,
    };

    room.ballResetInProgress = false;

    io.to(room.id).emit('ballReset', { ball: room.ball });
}

function getCornerDefinitions(room) {
    const cs = CORNER_SIZE;
    return [
        {
            region: (ball) => ball.x < cs && ball.y < cs,
            p1: { x: 0, y: cs },
            p2: { x: cs, y: 0 },
            inside: { x: cs * 2, y: cs * 2 },
        },
        {
            region: (ball) => ball.x > room.width - cs && ball.y < cs,
            p1: { x: room.width - cs, y: 0 },
            p2: { x: room.width, y: cs },
            inside: { x: Math.max(room.width - cs * 2, room.width / 2), y: cs * 2 },
        },
        {
            region: (ball) => ball.x < cs && ball.y > room.height - cs,
            p1: { x: 0, y: room.height - cs },
            p2: { x: cs, y: room.height },
            inside: { x: cs * 2, y: Math.max(room.height - cs * 2, room.height / 2) },
        },
        {
            region: (ball) => ball.x > room.width - cs && ball.y > room.height - cs,
            p1: { x: room.width - cs, y: room.height },
            p2: { x: room.width, y: room.height - cs },
            inside: {
                x: Math.max(room.width - cs * 2, room.width / 2),
                y: Math.max(room.height - cs * 2, room.height / 2),
            },
        },
    ];
}

function enforceCornerBoundaries(room) {
    const corners = getCornerDefinitions(room);
    const ball = room.ball;

    for (const corner of corners) {
        if (!corner.region(ball)) {
            continue;
        }

        const A = corner.p2.y - corner.p1.y;
        const B = -(corner.p2.x - corner.p1.x);
        const C = (corner.p2.x - corner.p1.x) * corner.p1.y - (corner.p2.y - corner.p1.y) * corner.p1.x;
        const norm = Math.hypot(A, B) || 1;
        const insideValue = A * corner.inside.x + B * corner.inside.y + C;
        const insideSign = Math.sign(insideValue) || 1;
        const signedDistance = ((A * ball.x + B * ball.y + C) / norm) * insideSign;

        if (signedDistance >= BALL_RADIUS) {
            continue;
        }

        const penetration = BALL_RADIUS - signedDistance;
        const normalX = (A / norm) * insideSign;
        const normalY = (B / norm) * insideSign;

        ball.x += normalX * penetration;
        ball.y += normalY * penetration;

        const velocityAlongNormal = ball.speedX * normalX + ball.speedY * normalY;
        if (velocityAlongNormal < 0) {
            const damping = 0.7;
            ball.speedX -= (1 + damping) * velocityAlongNormal * normalX;
            ball.speedY -= (1 + damping) * velocityAlongNormal * normalY;
        }

        break;
    }
}

function balanceTeams(room) {
    const redCount = room.teams.red.length;
    const blueCount = room.teams.blue.length;

    if (Math.abs(redCount - blueCount) <= 1) {
        return;
    }

    const [largerTeam, smallerTeam] = redCount > blueCount ? ['red', 'blue'] : ['blue', 'red'];
    const playerToMove = room.teams[largerTeam].pop();

    if (!playerToMove) {
        return;
    }

    room.teams[smallerTeam].push(playerToMove);

    const player = room.players[playerToMove];
    if (player) {
        player.team = smallerTeam;
        player.x = smallerTeam === 'red' ? 100 : room.width - 100;
        player.y = room.height / 2;

        const playerSocket = io.sockets.sockets.get(playerToMove);
        if (playerSocket) {
            playerSocket.emit('teamChanged', {
                newTeam: smallerTeam,
                gameState: buildGameState(room),
            });
        }
    }
}

function checkRestartConditions(room) {
    balanceTeams(room);

    const hasRedPlayers = room.teams.red.length > 0;
    const hasBluePlayers = room.teams.blue.length > 0;

    if (hasRedPlayers && hasBluePlayers) {
        if (!room.isPlaying && !room.waitingForRestart) {
            startNewMatch(room);
        }
    } else {
        room.isPlaying = false;
        io.to(room.id).emit('waitingForPlayers', {
            redCount: room.teams.red.length,
            blueCount: room.teams.blue.length,
        });
    }
}

function startNewMatch(room) {
    room.isPlaying = true;
    room.waitingForRestart = false;
    room.playersReady.clear();
    room.score = { red: 0, blue: 0 };
    room.matchTime = MATCH_DURATION;
    resetBall(room);

    Object.keys(room.players).forEach((id) => {
        const player = room.players[id];
        player.x = player.team === 'red' ? 100 : room.width - 100;
        player.y = room.height / 2;
    });

    io.to(room.id).emit('cleanPreviousMatch');
    io.to(room.id).emit('matchStart', {
        gameState: buildGameState(room),
        canMove: true,
    });
}

function updateTimer(room) {
    if (!room.isPlaying) {
        return;
    }

    room.matchTime -= 1;

    if (room.matchTime <= 0) {
        room.isPlaying = false;
        room.waitingForRestart = true;
        const winner = room.score.red > room.score.blue ? 'red' : room.score.blue > room.score.red ? 'blue' : 'draw';

        Object.keys(room.players).forEach((id) => {
            room.players[id].x = -100;
            room.players[id].y = -100;
        });

        io.to(room.id).emit('matchEnd', {
            winner,
            gameState: buildGameState(room),
        });
    }

    io.to(room.id).emit('timerUpdate', { matchTime: room.matchTime });
}

function handleTimers() {
    rooms.forEach((room) => updateTimer(room));
}

function runGameLoops() {
    rooms.forEach((room) => gameLoop(room));
}

function cleanupRoomIfEmpty(room) {
    if (room && getPlayerCount(room) === 0) {
        rooms.delete(room.id);
        console.log(`Sala removida: ${room.id}`);
    }
}

function gameLoop(room) {
    if (!room.isPlaying) {
        return;
    }

    Object.values(room.players).forEach((player) => {
        const speed = 5;
        player.x += (player.input.right ? speed : 0) - (player.input.left ? speed : 0);
        player.y += (player.input.down ? speed : 0) - (player.input.up ? speed : 0);

        player.x = Math.max(PLAYER_RADIUS, Math.min(room.width - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(room.height - PLAYER_RADIUS, player.y));
    });

    Object.values(room.players).forEach((player) => {
        const dx = room.ball.x - player.x;
        const dy = room.ball.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_RADIUS + BALL_RADIUS) {
            const angle = Math.atan2(dy, dx);
            const overlap = PLAYER_RADIUS + BALL_RADIUS - distance;

            room.ball.x += Math.cos(angle) * overlap * 1.1;
            room.ball.y += Math.sin(angle) * overlap * 1.1;

            const playerVelocity = {
                x: (player.input.right ? 5 : 0) - (player.input.left ? 5 : 0),
                y: (player.input.down ? 5 : 0) - (player.input.up ? 5 : 0),
            };

            room.ball.speedX = Math.cos(angle) * 12 + playerVelocity.x;
            room.ball.speedY = Math.sin(angle) * 12 + playerVelocity.y;
        }
    });

    room.ball.x += room.ball.speedX;
    room.ball.y += room.ball.speedY;

    room.ball.speedX *= 0.89;
    room.ball.speedY *= 0.89;

    if (room.ball.x < BALL_RADIUS || room.ball.x > room.width - BALL_RADIUS) {
        room.ball.speedX *= -0.7;
        room.ball.x = Math.max(BALL_RADIUS, Math.min(room.width - BALL_RADIUS, room.ball.x));
    }

    if (room.ball.y < BALL_RADIUS || room.ball.y > room.height - BALL_RADIUS) {
        room.ball.speedY *= -0.7;
        room.ball.y = Math.max(BALL_RADIUS, Math.min(room.height - BALL_RADIUS, room.ball.y));
    }

    enforceCornerBoundaries(room);

    const now = Date.now();
    if (!room.ballResetInProgress && now - room.lastGoalTime > room.goalCooldown) {
        if (room.ball.x < GOAL_WIDTH) {
            if (room.ball.y > room.height / 2 - GOAL_HEIGHT / 2 && room.ball.y < room.height / 2 + GOAL_HEIGHT / 2) {
                room.score.blue += 1;
                room.lastGoalTime = now;
                room.ballResetInProgress = true;
                io.to(room.id).emit('goalScored', { team: 'blue' });
                setTimeout(() => {
                    resetBall(room);
                }, room.goalCooldown);
            }
        } else if (room.ball.x > room.width - GOAL_WIDTH) {
            if (room.ball.y > room.height / 2 - GOAL_HEIGHT / 2 && room.ball.y < room.height / 2 + GOAL_HEIGHT / 2) {
                room.score.red += 1;
                room.lastGoalTime = now;
                room.ballResetInProgress = true;
                io.to(room.id).emit('goalScored', { team: 'red' });
                setTimeout(() => {
                    resetBall(room);
                }, room.goalCooldown);
            }
        }
    }

    if (!room.ballResetInProgress && (room.ball.x < 0 || room.ball.x > room.width)) {
        resetBall(room);
    }

    io.to(room.id).emit('update', {
        players: room.players,
        ball: room.ball,
        score: room.score,
        matchTime: room.matchTime,
        isPlaying: room.isPlaying,
        teams: room.teams,
        roomId: room.id,
    });
}

io.on('connection', (socket) => {
    const requestedRoomId = socket.handshake.query?.roomId;
    const allocation = allocateRoom(requestedRoomId);

    if (allocation.error === 'room-full') {
        socket.emit('roomFull', {
            roomId: allocation.roomId,
            capacity: MAX_PLAYERS_PER_ROOM,
        });
        socket.disconnect(true);
        return;
    }

    const room = allocation.room;
    socket.join(room.id);
    socket.data.roomId = room.id;

    const redCount = room.teams.red.length;
    const blueCount = room.teams.blue.length;
    const team = redCount <= blueCount ? 'red' : 'blue';
    room.teams[team].push(socket.id);

    room.players[socket.id] = {
        x: team === 'red' ? 100 : room.width - 100,
        y: room.height / 2,
        team,
        input: { left: false, right: false, up: false, down: false },
    };

    socket.emit('roomAssigned', {
        roomId: room.id,
        capacity: MAX_PLAYERS_PER_ROOM,
        players: getPlayerCount(room),
    });

    socket.emit('init', {
        team,
        gameState: buildGameState(room),
        canMove: room.isPlaying && room.teams.red.length > 0 && room.teams.blue.length > 0,
        roomId: room.id,
    });

    checkRestartConditions(room);

    const pingInterval = setInterval(() => {
        socket.emit('ping', Date.now());
    }, 1000);

    socket.on('requestRestart', () => {
        if (!room.waitingForRestart) {
            return;
        }

        room.playersReady.add(socket.id);

        if (room.players[socket.id]) {
            room.players[socket.id].x = room.players[socket.id].team === 'red' ? 100 : room.width - 100;
            room.players[socket.id].y = room.height / 2;
        }

        const allPlayers = [...room.teams.red, ...room.teams.blue];
        const allReady = allPlayers.length > 0 && allPlayers.every((id) => room.playersReady.has(id));

        if (allReady) {
            if (room.teams.red.length > 0 && room.teams.blue.length > 0) {
                startNewMatch(room);
            } else {
                io.to(room.id).emit('waitingForOpponent');
            }
        }

        io.to(room.id).emit('playerReadyUpdate', {
            players: room.players,
            readyCount: room.playersReady.size,
            totalPlayers: allPlayers.length,
            canMove: false,
        });
    });

    socket.on('input', (input) => {
        if (room.players[socket.id] && room.isPlaying) {
            room.players[socket.id].input = input;
        }
    });

    socket.on('disconnect', () => {
        clearInterval(pingInterval);
        console.log('Jogador desconectado:', socket.id);

        const player = room.players[socket.id];
        if (player) {
            room.teams[player.team] = room.teams[player.team].filter((id) => id !== socket.id);
            delete room.players[socket.id];

            room.playersReady.delete(socket.id);

            io.to(room.id).emit('playerDisconnected', {
                playerId: socket.id,
                gameState: buildGameState(room),
            });

            checkRestartConditions(room);
        }

        cleanupRoomIfEmpty(room);
    });
});

setInterval(runGameLoops, 1000 / 60);
setInterval(handleTimers, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});