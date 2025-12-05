const express = require('express'); // Serve para criar o servidor web
const socketio = require('socket.io'); // Biblioteca para comunicação em tempo real via WebSockets
const http = require('http'); // Módulo nativo do Node.js para criar servidores HTTP

const { rooms } = require('./game/roomManager');
const { gameLoop } = require('./game/gameLoop');
const { updateTimer } = require('./game/match');
const { registerSocketHandlers } = require('./game/socketHandlers');

const app = express(); // Cria uma aplicação Express, na qual a variável app recebe todas as funcionalidades do Express 
const server = http.createServer(app); // Cria um servidor HTTP usando a aplicação Express
const io = socketio(server, { // Cria uma instância do Socket.IO vinculada ao servidor HTTP
    cors: {
        origin: '*', // Permite conexões de qualquer origem
        methods: ['GET', 'POST'], // Permite apenas métodos GET e POST
    },
    allowEIO3: true, // Habilita compatibilidade com clientes que usam a versão 3 do Engine.IO
});

app.use(express.static('public')); // Serve arquivos estáticos da pasta 'public'

// Registra os manipuladores de eventos do Socket.IO
registerSocketHandlers(io);

// Função para executar os loops de jogo em cada sala
function runGameLoops() {
    rooms.forEach((room) => gameLoop(room, io));
}

// Função para atualizar os temporizadores em cada sala
function handleTimers() {
    rooms.forEach((room) => updateTimer(room, io));
}

// Configura intervalos para executar os loops de jogo e atualizar temporizadores
setInterval(runGameLoops, 1000 / 60); // Executa o loop de jogo a 60 FPS
setInterval(handleTimers, 1000); // Atualiza os temporizadores a cada segundo

// Inicia o servidor na porta especificada ou na porta 3000 por padrão
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { // server.listen inicia o servidor para escutar conexões na porta especificada e 0.0.0.0 indica que aceita conexões de qualquer endereço IP
    console.log(`Servidor rodando na porta ${PORT}`);
});