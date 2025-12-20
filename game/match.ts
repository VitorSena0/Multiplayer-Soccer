import { Server as SocketIOServer, Socket } from 'socket.io';
import { MATCH_DURATION } from './constants';
import { buildGameState } from './roomManager';
import { resetBall } from './ball';
import { Room, Player } from './types';

function balanceTeams(room: Room, io: SocketIOServer): void {
    const redCount = room.teams.red.length;
    const blueCount = room.teams.blue.length;

    if (Math.abs(redCount - blueCount) <= 1) {
        return;
    }

    const [largerTeam, smallerTeam]: ['red' | 'blue', 'red' | 'blue'] = redCount > blueCount ? ['red', 'blue'] : ['blue', 'red'];
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

export function startNewMatch(room: Room, io: SocketIOServer): void {
    room.isPlaying = true;
    room.waitingForRestart = false;
    room.playersReady.clear();
    room.score = { red: 0, blue: 0 };
    room.matchTime = MATCH_DURATION;
    resetBall(room, io);

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

export function checkRestartConditions(room: Room, io: SocketIOServer): void {
    balanceTeams(room, io);

    const hasRedPlayers = room.teams.red.length > 0;
    const hasBluePlayers = room.teams.blue.length > 0;

    if (hasRedPlayers && hasBluePlayers) {
        if (!room.isPlaying && !room.waitingForRestart) {
            startNewMatch(room, io);
        }
    } else {
        room.isPlaying = false;
        io.to(room.id).emit('waitingForPlayers', {
            redCount: room.teams.red.length,
            blueCount: room.teams.blue.length,
        });
    }
}

export function updateTimer(room: Room, io: SocketIOServer): void {
    if (!room.isPlaying) {
        return;
    }

    room.matchTime -= 1;

    if (room.matchTime <= 0) {
        room.isPlaying = false;
        room.waitingForRestart = true;
        const winner =
            room.score.red > room.score.blue
                ? 'red'
                : room.score.blue > room.score.red
                ? 'blue'
                : 'draw';

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
