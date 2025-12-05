const { MAX_PLAYERS_PER_ROOM } = require('./constants');
const { allocateRoom, buildGameState, cleanupRoomIfEmpty } = require('./roomManager');
const { checkRestartConditions, startNewMatch } = require('./match');

function registerSocketHandlers(io) {
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

        socket.emit('roomAssigned', { // Indica que o jogador foi atribuído a uma sala
            roomId: room.id,
            capacity: MAX_PLAYERS_PER_ROOM,
            players: Object.keys(room.players).length,
        });

        socket.emit('init', {
            team,
            gameState: buildGameState(room),
            canMove: room.isPlaying && room.teams.red.length > 0 && room.teams.blue.length > 0,
            roomId: room.id,
        });

        checkRestartConditions(room, io);

        // Envia pings regulares para medir a latência
        const pingInterval = setInterval(() => {
            socket.emit('ping', Date.now());
        }, 1000);

        socket.on('requestRestart', () => {
            if (!room.waitingForRestart) {
                return;
            }

            room.playersReady.add(socket.id);

            if (room.players[socket.id]) {
                room.players[socket.id].x =
                    room.players[socket.id].team === 'red' ? 100 : room.width - 100;
                room.players[socket.id].y = room.height / 2;
            }

            const allPlayers = [...room.teams.red, ...room.teams.blue];
            const allReady =
                allPlayers.length > 0 && allPlayers.every((id) => room.playersReady.has(id));

            if (allReady) {
                if (room.teams.red.length > 0 && room.teams.blue.length > 0) {
                    startNewMatch(room, io);
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

                checkRestartConditions(room, io);
            }

            cleanupRoomIfEmpty(room);
        });
    });
}

module.exports = {
    registerSocketHandlers,
};