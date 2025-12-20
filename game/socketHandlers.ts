// Importa constantes e funções auxiliares do jogo
import { Server as SocketIOServer, Socket } from 'socket.io';
import { MAX_PLAYERS_PER_ROOM } from './constants';
import { allocateRoom, buildGameState, cleanupRoomIfEmpty } from './roomManager';
import { checkRestartConditions, startNewMatch } from './match';
import { PlayerInput } from './types';

// Registra todos os handlers de eventos do Socket.IO relacionados ao jogo
export function registerSocketHandlers(io: SocketIOServer): void {
    // Dispara sempre que um novo cliente se conecta ao servidor
    io.on('connection', (socket: Socket) => {
        // ID da sala requisitada pelo cliente (via query string), se existir
        const requestedRoomId = socket.handshake.query?.roomId as string | undefined;

        // Aloca o jogador em uma sala (nova ou existente)
        const allocation = allocateRoom(requestedRoomId);

        // Se a sala estiver cheia, informa o cliente e encerra a conexão
        if (allocation.error === 'room-full') {
            socket.emit('roomFull', {
                roomId: allocation.roomId,
                capacity: MAX_PLAYERS_PER_ROOM,
            });
            socket.disconnect(true);
            return;
        }

        const room = allocation.room!;

        // Adiciona o socket à sala do Socket.IO e guarda o ID da sala nos dados do socket
        socket.join(room.id);
        socket.data.roomId = room.id;

        // Define o time do jogador tentando balancear a quantidade entre vermelho e azul
        const redCount = room.teams.red.length;
        const blueCount = room.teams.blue.length;
        const team: 'red' | 'blue' = redCount <= blueCount ? 'red' : 'blue';
        room.teams[team].push(socket.id);

        // Cria o estado inicial do jogador dentro da sala
        room.players[socket.id] = {
            x: team === 'red' ? 100 : room.width - 100,
            y: room.height / 2,
            team,
            // Entradas de movimento começam todas como falsas (parado)
            input: { left: false, right: false, up: false, down: false },
        };

        // Informa ao cliente em qual sala ele entrou e quantos jogadores existem
        socket.emit('roomAssigned', { // Indica que o jogador foi atribuído a uma sala
            roomId: room.id,
            capacity: MAX_PLAYERS_PER_ROOM,
            players: Object.keys(room.players).length,
        });

        // Envia o estado inicial do jogo para o cliente (time, jogadores, bola, etc.)
        socket.emit('init', {
            team,
            gameState: buildGameState(room),
            // Só pode se mover se o jogo estiver ativo e houver jogadores nos dois times
            canMove: room.isPlaying && room.teams.red.length > 0 && room.teams.blue.length > 0,
            roomId: room.id,
        });

        // Verifica se já existem condições para iniciar/reiniciar a partida
        checkRestartConditions(room, io);

        // Envia pings regulares para medir a latência do cliente
        const pingInterval = setInterval(() => {
            socket.emit('ping', Date.now());
        }, 1000);

        // Cliente solicita para reiniciar a partida após o término do jogo
        socket.on('requestRestart', () => {
            // Se a sala não estiver aguardando reinício, ignora o pedido
            if (!room.waitingForRestart) {
                return;
            }

            // Marca este jogador como pronto para reiniciar
            room.playersReady.add(socket.id);

            // Reseta a posição do jogador para a posição inicial do seu time
            if (room.players[socket.id]) {
                room.players[socket.id].x =
                    room.players[socket.id].team === 'red' ? 100 : room.width - 100;
                room.players[socket.id].y = room.height / 2;
            }

            // Lista de todos os jogadores da sala
            const allPlayers = [...room.teams.red, ...room.teams.blue];

            // Verifica se todos os jogadores marcaram que estão prontos
            const allReady =
                allPlayers.length > 0 && allPlayers.every((id) => room.playersReady.has(id));

            // Se todos estiverem prontos, decide entre iniciar nova partida ou aguardar oponente
            if (allReady) {
                // Só inicia nova partida se houver jogadores em ambos os times
                if (room.teams.red.length > 0 && room.teams.blue.length > 0) {
                    startNewMatch(room, io);
                } else {
                    // Caso contrário, avisa que está esperando oponente
                    io.to(room.id).emit('waitingForOpponent');
                }
            }

            // Atualiza todos na sala sobre o número de jogadores prontos
            io.to(room.id).emit('playerReadyUpdate', {
                players: room.players,
                readyCount: room.playersReady.size,
                totalPlayers: allPlayers.length,
                canMove: false,
            });
        });

        // Atualiza a entrada de movimento do jogador (teclas pressionadas)
        socket.on('input', (input: PlayerInput) => {
            if (room.players[socket.id] && room.isPlaying) {
                room.players[socket.id].input = input;
            }
        });

        // Quando o jogador desconecta do servidor
        socket.on('disconnect', () => {
            // Para o envio de pings para este cliente
            clearInterval(pingInterval);
            console.log('Jogador desconectado:', socket.id);

            const player = room.players[socket.id];
            if (player) {
                // Remove o jogador do time correspondente
                room.teams[player.team] = room.teams[player.team].filter((id) => id !== socket.id);
                // Remove o jogador do mapa de jogadores da sala
                delete room.players[socket.id];

                // Garante que o jogador seja removido da lista de prontos
                room.playersReady.delete(socket.id);

                // Notifica os demais jogadores da sala sobre a desconexão
                io.to(room.id).emit('playerDisconnected', {
                    playerId: socket.id,
                    gameState: buildGameState(room),
                });

                // Reavalia se ainda é possível reiniciar ou continuar a partida
                checkRestartConditions(room, io);
            }

            // Se a sala ficar vazia, faz a limpeza de recursos
            cleanupRoomIfEmpty(room);
        });
    });
}
