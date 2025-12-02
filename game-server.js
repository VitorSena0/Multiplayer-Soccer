const express = require('express');
const socketio = require('socket.io');
const http = require('http');

const { rooms } = require('./game/roomManager');
const { gameLoop } = require('./game/gameLoop');
const { updateTimer } = require('./game/match');
const { registerSocketHandlers } = require('./game/socketHandlers');

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

// Registra handlers do socket
registerSocketHandlers(io);

// Loops globais
function runGameLoops() {
    rooms.forEach((room) => gameLoop(room, io));
}

function handleTimers() {
    rooms.forEach((room) => updateTimer(room, io));
}

setInterval(runGameLoops, 1000 / 60);
setInterval(handleTimers, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});