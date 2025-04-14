// Configuração do canvas
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.body.appendChild(canvas);
canvas.width = 800;
canvas.height = 600;

// Constantes do jogo
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 10;
const GOAL_HEIGHT = 200;
const GOAL_WIDTH = 50;

// Estado do jogo
let matchEnded = false;
let canMove = false;
let currentTeam = 'spectator';
const inputs = { left: false, right: false, up: false, down: false };

// Elementos da UI
const gameUIContainer = document.createElement('div');
gameUIContainer.id = 'game-ui';
document.body.appendChild(gameUIContainer);

const timerDisplay = document.createElement('div');
timerDisplay.id = 'timer';
timerDisplay.textContent = '1:00';
gameUIContainer.appendChild(timerDisplay);

const waitingScreen = document.createElement('div');
waitingScreen.id = 'waiting-screen';
waitingScreen.textContent = 'Aguardando outro jogador...';
gameUIContainer.appendChild(waitingScreen);

const winnerDisplay = document.createElement('div');
winnerDisplay.id = 'winner-display';
gameUIContainer.appendChild(winnerDisplay);

const restartButton = document.createElement('button');
restartButton.id = 'restart-button';
restartButton.textContent = 'Jogar Novamente';
restartButton.style.display = 'none';
gameUIContainer.appendChild(restartButton);

// Conexão com o servidor
const socket = io(window.location.origin); // Conecta ao mesmo domínio

// Estado inicial do jogo
let gameState = {
  players: {},
  ball: { x: 400, y: 300, radius: BALL_RADIUS, speedX: 0, speedY: 0 },
  score: { red: 0, blue: 0 },
  teams: { red: [], blue: [] },
  matchTime: 180,
  isPlaying: false,
  width: 800,
  height: 600
};

// Handlers de conexão
socket.on('init', (data) => {
    
  currentTeam = data.team;
  gameState = {
    ...gameState,
    players: data.gameState.players || {},
    ball: data.gameState.ball || { x: 400, y: 300, radius: BALL_RADIUS, speedX: 0, speedY: 0 },
    score: data.gameState.score || { red: 0, blue: 0 },
    teams: data.gameState.teams || { red: [], blue: [] }
  };
  canMove = data.canMove;
  updateUI();
});

// Conexão de jogador
socket.on('playerConnected', (data) => {
    // Se um jogador sair e ficar só um, limpa o estado anterior
    if (gameState.teams.red.length + gameState.teams.blue.length < 2) {
        winnerDisplay.textContent = '';
        winnerDisplay.style.display = 'none';
        matchEnded = false;
    }
    
    // Restante do código existente
    gameState.players[data.playerId] = {
        x: data.team === 'red' ? 100 : 700,
        y: 300,
        team: data.team,
        input: { left: false, right: false, up: false, down: false }
    };
    gameState.teams = data.gameState.teams;
    canMove = gameState.teams.red.length > 0 && gameState.teams.blue.length > 0;
    updateUI();
});

socket.on('update', (state) => {
    gameState = {
        ...gameState,
        ...state
      };
      
      // Atualize canMove baseado no estado atual
      canMove = gameState.isPlaying && 
               ((currentTeam === 'red' && gameState.teams.blue.length > 0) || 
                (currentTeam === 'blue' && gameState.teams.red.length > 0));

    updateUI();
  });

  socket.on('cleanPreviousMatch', () => {
    // Limpa completamente o estado visual anterior
    winnerDisplay.textContent = '';
    winnerDisplay.style.display = 'none';
    matchEnded = false;
    
    // Força redesenho imediato
    draw();
});

socket.on('matchStart', (data) => {
  gameState = {
    ...gameState,
    ...data.gameState,
    isPlaying: true
  };
  matchEnded = false;
  canMove = true;
  hideWinner();
  updateUI();
});

// Atualização de jogadores
socket.on('playerReadyUpdate', (data) => {
    // Atualiza posições dos jogadores
    gameState.players = data.players;
    
    // Atualiza UI
    if (matchEnded) {
        const readyText = `Prontos: ${data.readyCount}/${data.totalPlayers}`;
        waitingScreen.textContent = currentTeam === 'spectator' 
            ? 'Aguardando jogadores...' 
            : `Você está pronto! ${readyText}`;
        
        // Mostra jogadores mas mantém bloqueio
        canMove = false;
    }
    
    // Força redesenho
    draw();
});
socket.on('waitingForOpponent', () => {
    waitingScreen.textContent = 'Aguardando outro jogador para começar...\n';
    restartButton.style.display = 'none';
});

socket.on('teamChanged', (data) => {
    currentTeam = data.newTeam;
    gameState = data.gameState;
    
    // Atualiza a posição do jogador
    if (gameState.players[socket.id]) {
        gameState.players[socket.id].x = currentTeam === 'red' ? 100 : 700;
        gameState.players[socket.id].y = 300;
    }
    
    alert(`Você foi movido para o time ${currentTeam.toUpperCase()}`);
    updateUI();
});

socket.on('playerDisconnected', (data) => {
    gameState = data.gameState;
    delete gameState.players[data.playerId];
    updateUI();
    
    // Se estiver esperando reinício, verifica se pode começar
    if (matchEnded && Game.teams.red.length > 0 && Game.teams.blue.length > 0) {
        socket.emit('requestRestart');
    }
});

socket.on('matchEnd', (data) => {
    gameState.isPlaying = false;
    matchEnded = true;
    gameState.players = data.gameState.players;
    
    // Mostra o resultado
    showWinner(data.winner);
    
    // Mostra o botão de reinício
    restartButton.style.display = 'block';
    waitingScreen.textContent = 'Partida terminada. Aguardando todos jogadores...';
    waitingScreen.style.display = 'block';
});

socket.on('timerUpdate', (data) => {
  gameState.matchTime = data.matchTime;
  updateTimerDisplay();
});

socket.on('waitingForPlayers', (data) => {
    console.log(`Status: ${data.redCount} jogador(es) red, ${data.blueCount} jogador(es) blue`);
    updateUI();
});

socket.on('goalScored', (data) => {
    // Esconda a bola visualmente
    gameState.ball.x = -1000;
    gameState.ball.y = -1000;
    
    // Mostre efeito visual de gol
    console.log(`GOL do time ${data.team}!`);
});

socket.on('ballReset', (data) => {
    gameState.ball = data.ball;
});

// Funções de UI
function updateUI() {
    if (matchEnded) {
        waitingScreen.style.display = 'block';
        waitingScreen.textContent = 'Partida terminada. Aguardando todos jogadores...\n';
        canMove = false;
    } else {
        const hasOpponent = (currentTeam === 'red' && gameState.teams.blue.length > 0) || 
                          (currentTeam === 'blue' && gameState.teams.red.length > 0);
        
        waitingScreen.style.display = hasOpponent ? 'none' : 'block';
        canMove = hasOpponent && gameState.isPlaying;
    }
}

function updatePlayerIDs() {
    // Remove todos os IDs antigos
    document.querySelectorAll('.player-id').forEach(el => el.remove());
    
    // Adiciona novos IDs
    for (const [id, player] of Object.entries(gameState.players)) {
        if (player) {
            const idElement = document.createElement('div');
            idElement.className = 'player-id';
            idElement.textContent = id.substring(0, 5);
            
            // Destaca o jogador atual
            if (id === socket.id) {
                idElement.classList.add('my-player');
            }
            
            // Posiciona o elemento
            idElement.style.left = `${player.x - 10 + canvas.offsetLeft}px`;
            idElement.style.top = `${player.y - PLAYER_RADIUS - 5 + canvas.offsetTop}px`;
            document.body.appendChild(idElement);
        }
    }
}

function showWinner(winner) {
    winnerDisplay.style.display = 'block';
    winnerDisplay.style.opacity = '1';
    winnerDisplay.textContent = winner === 'draw' ? 'Empate!' : `Time ${winner.toUpperCase()} venceu!`;
}

function hideWinner() {
    winnerDisplay.style.opacity = '0';
    setTimeout(() => {
        winnerDisplay.style.display = 'none';
    }, 500); // Tempo para a transição de fade
}

function updateTimerDisplay() {
  const minutes = Math.floor(gameState.matchTime / 60);
  const seconds = gameState.matchTime % 60;
  timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Controles
window.addEventListener('keydown', (e) => {
  if (!canMove || currentTeam === 'spectator' || matchEnded) return;
  
  switch(e.key) {
    case 'ArrowLeft': inputs.left = true; break;
    case 'ArrowRight': inputs.right = true; break;
    case 'ArrowUp': inputs.up = true; break;
    case 'ArrowDown': inputs.down = true; break;
  }
});

window.addEventListener('keyup', (e) => {
  switch(e.key) {
    case 'ArrowLeft': inputs.left = false; break;
    case 'ArrowRight': inputs.right = false; break;
    case 'ArrowUp': inputs.up = false; break;
    case 'ArrowDown': inputs.down = false; break;
  }
});

// Loop de input
setInterval(() => {
    if (currentTeam !== 'spectator' && canMove) {
      socket.emit('input', inputs);
    }
  }, 1000 / 60);

// Renderização
function draw() {
  try {
   // Limpar canvas
   ctx.clearRect(0, 0, canvas.width, canvas.height);
        
   // Fundo
   ctx.fillStyle = '#2c3e50';
   ctx.fillRect(0, 0, canvas.width, canvas.height);

   // Gols
   ctx.fillStyle = '#ff000055';
   ctx.fillRect(0, (canvas.height/2 - GOAL_HEIGHT/2), GOAL_WIDTH, GOAL_HEIGHT);
   ctx.fillStyle = '#0000ff55';
   ctx.fillRect(canvas.width - GOAL_WIDTH, (canvas.height/2 - GOAL_HEIGHT/2), GOAL_WIDTH, GOAL_HEIGHT);

   // Jogadores
   for (const [id, player] of Object.entries(gameState.players)) {
    if (matchEnded && !canMove && player) {
        ctx.globalAlpha = 0.7; // Efeito visual de "esperando"
        // Desenha jogador
        ctx.fillStyle = player.team;
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        if (id === socket.id) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, PLAYER_RADIUS + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
    }else if (player) {
           ctx.fillStyle = player.team;
           ctx.beginPath();
           ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
           ctx.fill();
           

       }
   }
    // Bola
    if (gameState.ball.x < -50 || gameState.ball.x > canvas.width + 50) {
        // Não renderiza a bola quando está fora da tela (durante reset)
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(gameState.ball.x, gameState.ball.y, gameState.ball.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Placar
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.fillText(`Red: ${gameState.score.red} | Blue: ${gameState.score.blue}`, 20, 30);

  } catch (error) {
    console.error('Erro na renderização:', error);
  }
  
  updatePlayerIDs();
  requestAnimationFrame(draw);
}

// Evento de reinício
restartButton.addEventListener('click', () => {
    socket.emit('requestRestart');
    restartButton.style.display = 'none';
    waitingScreen.textContent = 'Você está pronto! Aguardando adversário...\n';
});

// Iniciar renderização
draw();
