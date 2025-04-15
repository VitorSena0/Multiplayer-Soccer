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
const inputs = { 
  left: false, 
  right: false, 
  up: false, 
  down: false,
  action: false // Novo input para ações
};
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

// Inicie o monitoramento de ping quando a conexão for estabelecida
socket.on('connect', () => {
    // Limpa intervalo anterior se existir
    if (pingInterval) clearInterval(pingInterval);
    
    // Novo intervalo de ping a cada segundo
    pingInterval = setInterval(() => {
        pingStartTime = Date.now();
        socket.emit('clientPing', pingStartTime);
    }, 1000);
});

// Handler para a resposta do servidor
socket.on('serverPong', (clientTime) => {
    playerLatency = Date.now() - clientTime;
    updateLatencyDisplay();
});

// Função para atualizar o display
function updateLatencyDisplay() {
    const latencyElement = document.getElementById('latency-display');
    if (!latencyElement) return;
    
    latencyElement.textContent = `Ping: ${playerLatency}ms`;
    
    // Código de cores
    if (playerLatency < 100) {
        latencyElement.style.color = '#00ff00';
    } else if (playerLatency < 200) {
        latencyElement.style.color = '#ffff00';
    } else {
        latencyElement.style.color = '#ff0000';
    }
}

// Desative o ping quando desconectar
socket.on('disconnect', () => {
    if (pingInterval) clearInterval(pingInterval);
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
          const canvasRect = canvas.getBoundingClientRect();
          idElement.style.position = 'absolute';
          idElement.style.left = `${canvasRect.left + player.x - 10}px`;
          idElement.style.top = `${canvasRect.top + player.y - PLAYER_RADIUS - 20}px`;
          idElement.style.zIndex = '10'; // Garante que fique acima do canvas
          document.body.appendChild(idElement);
      }
  }
}

// Detecção de dispositivo móvel melhorada
function isMobileDevice() {
  return (('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      (navigator.msMaxTouchPoints > 0));
}

// Controles para todos os dispositivos
function setupControls() {
  const joystickThumb = document.getElementById('joystick-thumb');
  const joystickBase = document.getElementById('joystick-base');
  const actionBtn = document.getElementById('action-btn');
  
  let activeTouchId = null;
  let isMouseDown = false;
  const joystickRadius = 60;
  const centerPosition = { x: 60, y: 60 };

  // Controles Touch
  joystickBase.addEventListener('touchstart', handleControlStart);
  document.addEventListener('touchmove', handleControlMove);
  document.addEventListener('touchend', handleControlEnd);

  // Controles Mouse
  joystickBase.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      handleControlStart({
          clientX: e.clientX,
          clientY: e.clientY,
          preventDefault: () => {}
      });
  });

  document.addEventListener('mousemove', (e) => {
      if (isMouseDown) {
          handleControlMove({
              changedTouches: [{
                  clientX: e.clientX,
                  clientY: e.clientY
              }],
              preventDefault: () => {}
          });
      }
  });

  document.addEventListener('mouseup', () => {
      if (isMouseDown) {
          isMouseDown = false;
          handleControlEnd();
      }
  });

  function handleControlStart(e) {
      if (activeTouchId !== null) return;
      activeTouchId = 'mouse'; // Usamos 'mouse' como identificador
      updateJoystickPosition(e);
      e.preventDefault();
  }

  function handleControlMove(e) {
      if (activeTouchId === null) return;
      updateJoystickPosition(e.changedTouches[0]);
      e.preventDefault();
  }

  function handleControlEnd() {
      resetJoystick();
  }

  function updateJoystickPosition(touch) {
      const rect = joystickBase.getBoundingClientRect();
      const centerX = rect.left + joystickRadius;
      const centerY = rect.top + joystickRadius;
      
      const touchX = touch.clientX - centerX;
      const touchY = touch.clientY - centerY;
      
      const distance = Math.sqrt(touchX * touchX + touchY * touchY);
      const angle = Math.atan2(touchY, touchX);
      
      const limitedDistance = Math.min(distance, joystickRadius);
      const newX = Math.cos(angle) * limitedDistance;
      const newY = Math.sin(angle) * limitedDistance;
      
      joystickThumb.style.transform = `translate(${newX}px, ${newY}px)`;
      
      // Atualiza inputs
      const normalizedX = newX / joystickRadius;
      const normalizedY = newY / joystickRadius;
      
      inputs.left = normalizedX < -0.3;
      inputs.right = normalizedX > 0.3;
      inputs.up = normalizedY < -0.3;
      inputs.down = normalizedY > 0.3;
  }

  function resetJoystick() {
      joystickThumb.style.transform = 'translate(0, 0)';
      activeTouchId = null;
      inputs.left = false;
      inputs.right = false;
      inputs.up = false;
      inputs.down = false;
  }

  // Botão de Ação
  const handleActionStart = () => inputs.action = true;
  const handleActionEnd = () => inputs.action = false;

  actionBtn.addEventListener('touchstart', handleActionStart);
  actionBtn.addEventListener('touchend', handleActionEnd);
  actionBtn.addEventListener('mousedown', handleActionStart);
  actionBtn.addEventListener('mouseup', handleActionEnd);
  actionBtn.addEventListener('mouseleave', handleActionEnd); // Caso o mouse sair do botão
}

// Inicializa controles quando o jogo carregar
window.addEventListener('load', () => {
  setupControls();
  
  // Ajusta o tamanho do canvas para deixar espaço para os controles
  const canvas = document.querySelector('canvas');
  const controlsHeight = document.getElementById('mobile-controls').offsetHeight;
  canvas.style.marginBottom = `${controlsHeight + 20}px`;
});

// Ajusta tamanho dos controles para telas pequenas
function resizeControls() {
  if (!isMobileDevice()) return;
  
  const screenWidth = window.innerWidth;
  const scale = Math.min(1, screenWidth / 400);
  
  const controls = document.getElementById('mobile-controls');
  controls.style.transform = `scale(${scale})`;
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  setupMobileControls();
  
  // Garante que o canvas não cubra os controles
  const canvas = document.querySelector('canvas');
  canvas.style.zIndex = '1';
});

function setupMobileControls() {
  // Verifica se é mobile
  if (!/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      return;
  }

  const joystickThumb = document.getElementById('joystick-thumb');
  const joystickBase = document.getElementById('joystick-base');
  const actionBtn = document.getElementById('action-btn');
  
  let activeTouchId = null;
  const joystickRadius = 60;
  const centerPosition = { x: 60, y: 60 };

  // Controle do Joystick
  joystickBase.addEventListener('touchstart', (e) => {
      if (activeTouchId !== null) return;
      
      const touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      updateJoystickPosition(touch);
      e.preventDefault();
  });

  document.addEventListener('touchmove', (e) => {
      if (activeTouchId === null) return;
      
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
      if (touch) {
          updateJoystickPosition(touch);
          e.preventDefault();
      }
  });

  document.addEventListener('touchend', (e) => {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
      if (touch) {
          resetJoystick();
          e.preventDefault();
      }
  });

  function updateJoystickPosition(touch) {
      const rect = joystickBase.getBoundingClientRect();
      const centerX = rect.left + joystickRadius;
      const centerY = rect.top + joystickRadius;
      
      const touchX = touch.clientX - centerX;
      const touchY = touch.clientY - centerY;
      
      const distance = Math.sqrt(touchX * touchX + touchY * touchY);
      const angle = Math.atan2(touchY, touchX);
      
      const limitedDistance = Math.min(distance, joystickRadius);
      const newX = Math.cos(angle) * limitedDistance;
      const newY = Math.sin(angle) * limitedDistance;
      
      joystickThumb.style.transform = `translate(${newX}px, ${newY}px)`;
      
      // Atualiza inputs
      const normalizedX = newX / joystickRadius;
      const normalizedY = newY / joystickRadius;
      
      inputs.left = normalizedX < -0.3;
      inputs.right = normalizedX > 0.3;
      inputs.up = normalizedY < -0.3;
      inputs.down = normalizedY > 0.3;
  }

  function resetJoystick() {
      joystickThumb.style.transform = 'translate(0, 0)';
      activeTouchId = null;
      inputs.left = false;
      inputs.right = false;
      inputs.up = false;
      inputs.down = false;
  }

  // Botão de Ação
  actionBtn.addEventListener('touchstart', (e) => {
      inputs.action = true;
      e.preventDefault();
  });

  actionBtn.addEventListener('touchend', (e) => {
      inputs.action = false;
      e.preventDefault();
  });
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


// Inicializa controles mobile quando o jogo carregar
window.addEventListener('load', setupMobileControls);

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
