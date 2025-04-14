const express = require('express');
const socketio = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    cors: {
      origin: ["https://seu-frontend.com", "http://localhost:3000"], // Adicione o domínio do seu frontend
      methods: ["GET", "POST"],
      transports: ['websocket', 'polling'], // Adicione esta linha
      credentials: true
    },
    allowEIO3: true // Adicione para compatibilidade
  });
app.use(express.static('public'));

// Constantes do jogo
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 10;
const GOAL_HEIGHT = 200;
const GOAL_WIDTH = 50;
const MATCH_DURATION = 60; // 3 minutos em segundos

// Configuração do jogo
const Game = {
    width: 800,
    height: 600,
    players: {},
    ball: { x: 400, y: 300, radius: 10, speedX: 0, speedY: 0 },
    score: { red: 0, blue: 0 },
    teams: { red: [], blue: [] },
    maxPlayers: 5,
    matchTime: MATCH_DURATION,
    isPlaying: false,
    waitingPlayers: [],
    isResettingBall: false,
    nextBallPosition: null,
    ballResetInProgress: false,
    lastGoalTime: 0,
    goalCooldown: 500, // ms
    waitingForRestart: false,
    playersReady: new Set()
};

function resetBall(direction) {
    const thirdWidth = Game.width / 3;
    const minX = Game.width / 2 - thirdWidth / 2;
    const maxX = Game.width / 2 + thirdWidth / 2;
    const thirdHeight = Game.height / 3;
    const minY = Game.height / 2 - thirdHeight / 2;
    const maxY = Game.height / 2 + thirdHeight / 2;

    Game.ball = {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
        radius: BALL_RADIUS,
        speedX: 0,
        speedY: 0
    };
    
    // Envie uma atualização imediata
    io.emit('ballReset', { ball: Game.ball });
}

function checkRestartConditions() {
    balanceTeams();
    const hasRedPlayers = Game.teams.red.length > 0;
    const hasBluePlayers = Game.teams.blue.length > 0;
    
    console.log(`Verificando times: Red: ${Game.teams.red.length}, Blue: ${Game.teams.blue.length}`); // Log para debug
    
    if (hasRedPlayers && hasBluePlayers) {
        if (Game.teams.red.length > 0 && Game.teams.blue.length > 0) {
            console.log("Dois jogadores conectados - iniciando partida!");
            startNewMatch();
        }
    } else {
        console.log("Ainda esperando por dois jogadores...");
        // Envia atualização para todos os jogadores
        io.emit('waitingForPlayers', {
            redCount: Game.teams.red.length,
            blueCount: Game.teams.blue.length
        });
    }
}

function startNewMatch() {
    Game.isPlaying = true;
    Game.waitingForRestart = false;
    Game.playersReady.clear();
    Game.score = { red: 0, blue: 0 };
    Game.matchTime = MATCH_DURATION;
    resetBall('none');

    // Reposiciona todos os jogadores
    Object.keys(Game.players).forEach(id => {
        const player = Game.players[id];
        player.x = player.team === 'red' ? 100 : 700;
        player.y = 300;
    });
    
    // Envia comando para limpar o estado anterior nos clients
    io.emit('cleanPreviousMatch');
    
    // Inicia a nova partida
    io.emit('matchStart', { 
        gameState: Game,
        canMove: true
    });
  }

function updateTimer() {
    if (Game.isPlaying) {
        Game.matchTime--;
        
        if (Game.matchTime <= 0) {
            Game.isPlaying = false;
            Game.waitingForRestart = true;
            const winner = Game.score.red > Game.score.blue ? 'red' : 
                          Game.score.blue > Game.score.red ? 'blue' : 'draw';
            
            // Remove todos os jogadores do campo (mas mantém nos times)
            Object.keys(Game.players).forEach(id => {
                Game.players[id].x = -100; // Posição fora da tela
                Game.players[id].y = -100;
            });
            
            io.emit('matchEnd', { 
                winner,
                gameState: Game 
            });
        }
        
        io.emit('timerUpdate', { matchTime: Game.matchTime });
    }
}

//função para balancear os times
function balanceTeams() {
    const redCount = Game.teams.red.length;
    const blueCount = Game.teams.blue.length;
    
    // Se a diferença for maior que 1, balanceie
    if (Math.abs(redCount - blueCount) > 1) {
        console.log(`Desbalanceamento detectado: Red ${redCount} vs Blue ${blueCount}. Balanceando...`);
        
        // Determina qual time tem mais jogadores
        const [largerTeam, smallerTeam] = redCount > blueCount ? 
            ['red', 'blue'] : ['blue', 'red'];
        
        // Move o último jogador que entrou para o time menor
        const playerToMove = Game.teams[largerTeam].pop();
        if (playerToMove) {
            Game.teams[smallerTeam].push(playerToMove);
            
            // Atualiza o time do jogador
            if (Game.players[playerToMove]) {
                Game.players[playerToMove].team = smallerTeam;
                
                // Notifica o jogador sobre a mudança
                const playerSocket = io.sockets.sockets.get(playerToMove);
                if (playerSocket) {
                    playerSocket.emit('teamChanged', { 
                        newTeam: smallerTeam,
                        gameState: Game
                    });
                }
            }
        }
    }
    
    // Se tiver pelo menos 1 em cada time, permite iniciar partida
    if (Game.teams.red.length > 0 && Game.teams.blue.length > 0) {
        startNewMatch();
    } else {
        io.emit('waitingForPlayers', {
            redCount: Game.teams.red.length,
            blueCount: Game.teams.blue.length
        });
    }
}

// Lógica de conexão
io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    // Verifica se já está em um time (reconexão)
    let team;
    for (const t of ['red', 'blue']) {
        if (Game.teams[t].includes(socket.id)) {
            team = t;
            break;
        }
    }

    // Se não encontrado, atribui novo time
    if (!team) {
        const redCount = Game.teams.red.length;
        const blueCount = Game.teams.blue.length;
        
        team = redCount <= blueCount ? 'red' : 'blue';
        Game.teams[team].push(socket.id);
        
        console.log(`Jogador ${socket.id} atribuído ao time ${team}`);
    }

    // Cria/atualiza jogador
    Game.players[socket.id] = {
        x: team === 'red' ? 100 : 700,
        y: 300,
        team: team,
        input: { left: false, right: false, up: false, down: false }
    };

    // Envia estado inicial
    socket.emit('init', {
        team: team,
        gameState: Game,
        canMove: Game.teams.red.length > 0 && Game.teams.blue.length > 0
    });

    // Verifica se pode começar
    checkRestartConditions();

    socket.on('requestRestart', () => {
        if (Game.waitingForRestart) {
            Game.playersReady.add(socket.id);
            
            // Mostra o jogador que está pronto (mas ainda bloqueado)
            if (Game.players[socket.id]) {
                Game.players[socket.id].x = Game.players[socket.id].team === 'red' ? 100 : 700;
                Game.players[socket.id].y = 300;
            }
            
            // Verifica se todos os jogadores estão prontos
            const allPlayers = [...Game.teams.red, ...Game.teams.blue];
            const allReady = allPlayers.every(id => Game.playersReady.has(id));
            
            if (allReady) {
                // Verifica se temos dois jogadores
                if (Game.teams.red.length > 0 && Game.teams.blue.length > 0) {
                    startNewMatch();
                } else {
                    io.emit('waitingForOpponent');
                }
            }
            
            // Atualiza todos os clientes
            io.emit('playerReadyUpdate', {
                players: Game.players,
                readyCount: Game.playersReady.size,
                totalPlayers: allPlayers.length,
                canMove: false // Movimento ainda bloqueado
            });
        }
    });

    // Receber inputs do jogador
    socket.on('input', (input) => {
        if (Game.players[socket.id] && Game.isPlaying) {
          Game.players[socket.id].input = input;
        }
      });

    // Desconexão
    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        const team = Game.players[socket.id]?.team;
        
        if (team) {
            // Remove o jogador do time
            Game.teams[team] = Game.teams[team].filter(id => id !== socket.id);
            delete Game.players[socket.id];
            
            // Verifica se precisa balancear
            balanceTeams();
            
            // Atualiza todos os clientes
            io.emit('playerDisconnected', {
                playerId: socket.id,
                gameState: Game
            });
        }
        
        Game.waitingPlayers = Game.waitingPlayers.filter(id => id !== socket.id);
    });

});

// Game loop
function gameLoop() {
    if (!Game.isPlaying) return; // Adicione esta verificação
    // Movimento dos jogadores
    Object.values(Game.players).forEach(player => {
        const speed = 5;
        player.x += (player.input.right ? speed : 0) - (player.input.left ? speed : 0);
        player.y += (player.input.down ? speed : 0) - (player.input.up ? speed : 0);

        player.x = Math.max(PLAYER_RADIUS, Math.min(Game.width - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(Game.height - PLAYER_RADIUS, player.y));
    });

    // Física da bola e colisões
    let goalScored = false;
    
    // Colisão com jogadores
    Object.values(Game.players).forEach(player => {
        const dx = Game.ball.x - player.x;
        const dy = Game.ball.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_RADIUS + BALL_RADIUS) {
            const angle = Math.atan2(dy, dx);
            const overlap = (PLAYER_RADIUS + BALL_RADIUS) - distance;
            
            Game.ball.x += Math.cos(angle) * overlap * 1.1;
            Game.ball.y += Math.sin(angle) * overlap * 1.1;

            const playerVelocity = {
                x: (player.input.right ? 5 : 0) - (player.input.left ? 5 : 0),
                y: (player.input.down ? 5 : 0) - (player.input.up ? 5 : 0)
            };
            
            Game.ball.speedX = Math.cos(angle) * 12 + playerVelocity.x;
            Game.ball.speedY = Math.sin(angle) * 12 + playerVelocity.y;
        }
    });

    // Atualização da posição da bola
    Game.ball.x += Game.ball.speedX;
    Game.ball.y += Game.ball.speedY;

    // Atrito
    Game.ball.speedX *= 0.89;
    Game.ball.speedY *= 0.89;

    // Colisão com paredes
    if (Game.ball.x < BALL_RADIUS || Game.ball.x > Game.width - BALL_RADIUS) {
        Game.ball.speedX *= -0.7;
        Game.ball.x = Math.max(BALL_RADIUS, Math.min(Game.width - BALL_RADIUS, Game.ball.x));
    }
    if (Game.ball.y < BALL_RADIUS || Game.ball.y > Game.height - BALL_RADIUS) {
        Game.ball.speedY *= -0.7;
        Game.ball.y = Math.max(BALL_RADIUS, Math.min(Game.height - BALL_RADIUS, Game.ball.y));
    }

   // Verificação de gols
   const now = Date.now();
   if (!Game.ballResetInProgress && now - Game.lastGoalTime > Game.goalCooldown) {
       if (Game.ball.x < GOAL_WIDTH) {
           if (Game.ball.y > (Game.height/2 - GOAL_HEIGHT/2) && 
               Game.ball.y < (Game.height/2 + GOAL_HEIGHT/2)) {
               Game.score.blue++;
               Game.lastGoalTime = now;
               Game.ballResetInProgress = true;
               io.emit('goalScored', { team: 'blue' });
               setTimeout(() => {
                   resetBall('right');
                   Game.ballResetInProgress = false;
               }, Game.goalCooldown);
           }
       } 
       else if (Game.ball.x > Game.width - GOAL_WIDTH) {
           if (Game.ball.y > (Game.height/2 - GOAL_HEIGHT/2) && 
               Game.ball.y < (Game.height/2 + GOAL_HEIGHT/2)) {
               Game.score.red++;
               Game.lastGoalTime = now;
               Game.ballResetInProgress = true;
               io.emit('goalScored', { team: 'red' });
               setTimeout(() => {
                   resetBall('left');
                   Game.ballResetInProgress = false;
               }, Game.goalCooldown);
           }
       }
    }

    // Reset da bola se sair do campo
    if (!goalScored && (Game.ball.x < 0 || Game.ball.x > Game.width)) {
        resetBall(Game.ball.x < 0 ? 'right' : 'left');
    }

    io.emit('update', {
        players: Game.players,
        ball: Game.ball,
        score: Game.score,
        matchTime: Game.matchTime,
        isPlaying: Game.isPlaying,
        teams: Game.teams
    });
}

// Iniciar intervalos
let gameInterval = setInterval(gameLoop, 1000 / 60);
let timerInterval = setInterval(updateTimer, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});