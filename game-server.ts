import express from 'express'; // Freamework web servir arquivos estáticos e gerenciar rotas
import { Server as SocketIOServer } from 'socket.io'; // Biblioteca para comunicação em tempo real via WebSockets
import http from 'http'; // Módulo nativo do Node.js para criar servidores HTTP

import { rooms } from './game/roomManager';
import { gameLoop } from './game/gameLoop';
import { updateTimer } from './game/match';
import { registerSocketHandlers } from './game/socketHandlers';

const app = express(); // Cria uma aplicação Express, na qual a variável app recebe todas as funcionalidades do Express 
const server = http.createServer(app); // Cria um servidor HTTP usando a aplicação Express
const io = new SocketIOServer(server, { // Cria uma instância do Socket.IO vinculada ao servidor HTTP
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
function runGameLoops(): void {
    rooms.forEach((room) => gameLoop(room, io));
}

// Função para atualizar os temporizadores em cada sala
function handleTimers(): void {
    rooms.forEach((room) => updateTimer(room, io));
}

// Configura intervalos para executar os loops de jogo e atualizar temporizadores
setInterval(runGameLoops, 1000 / 60); // Executa o loop de jogo a 60 FPS
setInterval(handleTimers, 1000); // Atualiza os temporizadores a cada segundo

// Inicia o servidor na porta especificada ou na porta 3000 por padrão
const PORT: number = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', () => { // server.listen inicia o servidor para escutar conexões na porta especificada e 0.0.0.0 indica que aceita conexões de qualquer endereço IP
    console.log(`Servidor rodando na porta ${PORT}`);
});
