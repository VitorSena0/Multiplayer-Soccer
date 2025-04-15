// Configuração do jogo
const config = {
    canvas: {
      width: 800,
      height: 600
    },
    player: {
      radius: 20
    },
    ball: {
      radius: 10
    },
    goal: {
      width: 50,
      height: 200
    }
  };
  
  // Elementos do DOM
  const elements = {
    canvas: document.createElement('canvas'),
    ui: document.createElement('div'),
    timer: document.createElement('div'),
    waitingScreen: document.createElement('div'),
    winnerDisplay: document.createElement('div'),
    restartButton: document.createElement('button')
  };
  
  // Estado do jogo
  const state = {
    matchEnded: false,
    canMove: false,
    currentTeam: 'spectator',
    inputs: { left: false, right: false, up: false, down: false, action: false },
    gameState: {
      players: {},
      ball: { x: 400, y: 300, radius: config.ball.radius, speedX: 0, speedY: 0 },
      score: { red: 0, blue: 0 },
      teams: { red: [], blue: [] },
      matchTime: 180,
      isPlaying: false,
      width: config.canvas.width,
      height: config.canvas.height
    }
  };
  
  // Inicialização do canvas
  function initCanvas() {
    const ctx = elements.canvas.getContext('2d');
    document.body.appendChild(elements.canvas);
    elements.canvas.width = config.canvas.width;
    elements.canvas.height = config.canvas.height;
    
    // Centraliza o canvas
    elements.canvas.style.margin = '0 auto';
    elements.canvas.style.display = 'block';
    
    return ctx;
  }
  // Verifica se o dispositivo é móvel
  function isMobileDevice() {
    return ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0) || 
           (navigator.msMaxTouchPoints > 0);
  }
  

  const ctx = initCanvas();
  
  // Inicialização da UI
  function initUI() {
    elements.ui.id = 'game-ui';
    document.body.appendChild(elements.ui);
    
    elements.timer.id = 'timer';
    elements.timer.textContent = '1:00';
    elements.ui.appendChild(elements.timer);
    
    elements.waitingScreen.id = 'waiting-screen';
    elements.waitingScreen.textContent = 'Aguardando outro jogador...';
    elements.ui.appendChild(elements.waitingScreen);
    
    elements.winnerDisplay.id = 'winner-display';
    elements.ui.appendChild(elements.winnerDisplay);
    
    elements.restartButton.id = 'restart-button';
    elements.restartButton.textContent = 'Jogar Novamente';
    elements.restartButton.style.display = 'none';
    elements.ui.appendChild(elements.restartButton);
  }
  
  initUI();
  
  // Conexão com o servidor
  const socket = io(window.location.origin);
  
  // Handlers de socket
  const socketHandlers = {
    init: (data) => {
      state.currentTeam = data.team;
      state.gameState = { ...state.gameState, ...data.gameState };
      state.canMove = data.canMove;
      updateUI();
    },
    
    playerConnected: (data) => {
      if (state.gameState.teams.red.length + state.gameState.teams.blue.length < 2) {
        elements.winnerDisplay.textContent = '';
        elements.winnerDisplay.style.display = 'none';
        state.matchEnded = false;
      }
      
      state.gameState.players[data.playerId] = {
        x: data.team === 'red' ? 100 : 700,
        y: 300,
        team: data.team,
        input: { left: false, right: false, up: false, down: false }
      };
      state.gameState.teams = data.gameState.teams;
      state.canMove = state.gameState.teams.red.length > 0 && state.gameState.teams.blue.length > 0;
      updateUI();
    },
    
    update: (newState) => {
      state.gameState = { ...state.gameState, ...newState };
      state.canMove = state.gameState.isPlaying && 
        ((state.currentTeam === 'red' && state.gameState.teams.blue.length > 0) || 
         (state.currentTeam === 'blue' && state.gameState.teams.red.length > 0));
      updateUI();
    },
    
    cleanPreviousMatch: () => {
      elements.winnerDisplay.textContent = '';
      elements.winnerDisplay.style.display = 'none';
      state.matchEnded = false;
      draw();
    },
    
    matchStart: (data) => {
      state.gameState = { ...state.gameState, ...data.gameState, isPlaying: true };
      state.matchEnded = false;
      state.canMove = true;
      hideWinner();
      updateUI();
    },
    
    playerReadyUpdate: (data) => {
      state.gameState.players = data.players;
      if (state.matchEnded) {
        const readyText = `Prontos: ${data.readyCount}/${data.totalPlayers}`;
        elements.waitingScreen.textContent = state.currentTeam === 'spectator' 
          ? 'Aguardando jogadores...' 
          : `Você está pronto! ${readyText}`;
        state.canMove = false;
      }
      draw();
    },
    
    waitingForOpponent: () => {
      elements.waitingScreen.textContent = 'Aguardando outro jogador para começar...\n';
      elements.restartButton.style.display = 'none';
    },
    
    teamChanged: (data) => {
      state.currentTeam = data.newTeam;
      state.gameState = data.gameState;
      if (state.gameState.players[socket.id]) {
        state.gameState.players[socket.id].x = state.currentTeam === 'red' ? 100 : 700;
        state.gameState.players[socket.id].y = 300;
      }
      alert(`Você foi movido para o time ${state.currentTeam.toUpperCase()}`);
      updateUI();
    },
    
    playerDisconnected: (data) => {
      state.gameState = data.gameState;
      delete state.gameState.players[data.playerId];
      updateUI();
      if (state.matchEnded && state.gameState.teams.red.length > 0 && state.gameState.teams.blue.length > 0) {
        socket.emit('requestRestart');
      }
    },
    
    matchEnd: (data) => {
      state.gameState.isPlaying = false;
      state.matchEnded = true;
      state.gameState.players = data.gameState.players;
      showWinner(data.winner);
      elements.restartButton.style.display = 'block';
      elements.waitingScreen.textContent = 'Partida terminada. Aguardando todos jogadores...';
      elements.waitingScreen.style.display = 'block';
    },
    
    timerUpdate: (data) => {
      state.gameState.matchTime = data.matchTime;
      updateTimerDisplay();
    },
    
    waitingForPlayers: (data) => {
      console.log(`Status: ${data.redCount} jogador(es) red, ${data.blueCount} jogador(es) blue`);
      updateUI();
    },
    
    goalScored: (data) => {
        state.gameState.ball.x = -1000;
        state.gameState.ball.y = -1000;
        console.log(`GOL do time ${data.team}!`);
      },
    
    ballReset: (data) => {
      state.gameState.ball = data.ball;
    }
  };
  
  // Registrar handlers
  Object.entries(socketHandlers).forEach(([event, handler]) => {
    socket.on(event, handler);
  });
  
  // Funções de UI
  function updateUI() {
    if (state.matchEnded) {
      elements.waitingScreen.style.display = 'block';
      elements.waitingScreen.textContent = 'Partida terminada. Aguardando todos jogadores...\n';
      state.canMove = false;
    } else {
      const hasOpponent = (state.currentTeam === 'red' && state.gameState.teams.blue.length > 0) || 
                         (state.currentTeam === 'blue' && state.gameState.teams.red.length > 0);
      elements.waitingScreen.style.display = hasOpponent ? 'none' : 'block';
      state.canMove = hasOpponent && state.gameState.isPlaying;
    }
  }
  
  function updatePlayerIDs() {
    document.querySelectorAll('.player-id').forEach(el => el.remove());
    
    for (const [id, player] of Object.entries(state.gameState.players)) {
      if (player) {
        const idElement = document.createElement('div');
        idElement.className = 'player-id';
        idElement.textContent = id.substring(0, 5);
        
        if (id === socket.id) {
          idElement.classList.add('my-player');
        }
        
        const canvasRect = elements.canvas.getBoundingClientRect();
        idElement.style.position = 'absolute';
        idElement.style.left = `${canvasRect.left + player.x }px`;
        idElement.style.top = `${canvasRect.top + player.y - config.player.radius + 10}px`;
        idElement.style.zIndex = '10';
        document.body.appendChild(idElement);
      }
    }
  }
  
  function showWinner(winner) {
    elements.winnerDisplay.style.display = 'block';
    elements.winnerDisplay.style.opacity = '1';
    elements.winnerDisplay.textContent = winner === 'draw' ? 'Empate!' : `Time ${winner.toUpperCase()} venceu!`;
  }
  
  function hideWinner() {
    elements.winnerDisplay.style.opacity = '0';
    setTimeout(() => {
      elements.winnerDisplay.style.display = 'none';
    }, 500);
  }
  
  function updateTimerDisplay() {
    const minutes = Math.floor(state.gameState.matchTime / 60);
    const seconds = state.gameState.matchTime % 60;
    elements.timer.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  
  // Controles
  function setupControls() {
    const mobileControls = document.getElementById('mobile-controls');
    if (!mobileControls || mobileControls.style.display === 'none') return;
  
    const joystickThumb = document.getElementById('joystick-thumb');
    const joystickBase = document.getElementById('joystick-base');
    const actionBtn = document.getElementById('action-btn');
    
    if (!joystickThumb || !joystickBase || !actionBtn) {
      console.warn('Elementos de controle móvel não encontrados');
      return;
    }
    
    let activeTouchId = null;
    const joystickRadius = 50;
    const baseRect = joystickBase.getBoundingClientRect();
    const centerPosition = { 
      x: baseRect.left + baseRect.width / 2, 
      y: baseRect.top + baseRect.height / 2 
    };
  
    // Função para atualizar posição do joystick
    const updateJoystickPosition = (touch) => {
      const touchX = touch.clientX - centerPosition.x;
      const touchY = touch.clientY - centerPosition.y;
      
      const distance = Math.sqrt(touchX * touchX + touchY * touchY);
      const angle = Math.atan2(touchY, touchX);
      
      const limitedDistance = Math.min(distance, joystickRadius);
      const newX = Math.cos(angle) * limitedDistance;
      const newY = Math.sin(angle) * limitedDistance;
      
      joystickThumb.style.transform = `translate(${newX}px, ${newY}px)`;
      
      // Atualiza inputs (sensibilidade ajustada)
      const deadZone = 0.2; // Zona morta para evitar movimentos acidentais
      const normalizedX = newX / joystickRadius;
      const normalizedY = newY / joystickRadius;
      
      state.inputs.left = normalizedX < -deadZone;
      state.inputs.right = normalizedX > deadZone;
      state.inputs.up = normalizedY < -deadZone;
      state.inputs.down = normalizedY > deadZone;
    };
  
    const resetJoystick = () => {
      joystickThumb.style.transform = 'translate(0, 0)';
      activeTouchId = null;
      state.inputs.left = false;
      state.inputs.right = false;
      state.inputs.up = false;
      state.inputs.down = false;
    };
  
    // Eventos de toque
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
    }, { passive: false });
  
    document.addEventListener('touchend', (e) => {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
      if (touch) {
        resetJoystick();
        e.preventDefault();
      }
    });
  
    // Eventos de mouse (para testes em desktop)
    joystickBase.addEventListener('mousedown', (e) => {
      if (activeTouchId !== null) return;
      activeTouchId = 'mouse';
      updateJoystickPosition(e);
      e.preventDefault();
    });
  
    document.addEventListener('mousemove', (e) => {
      if (activeTouchId === 'mouse') {
        updateJoystickPosition(e);
        e.preventDefault();
      }
    });
  
    document.addEventListener('mouseup', () => {
      if (activeTouchId === 'mouse') {
        resetJoystick();
      }
    });
  
    // Botão de ação
    const handleActionStart = () => {
      state.inputs.action = true;
      actionBtn.style.backgroundColor = 'rgba(255, 0, 0, 0.6)';
    };
    
    const handleActionEnd = () => {
      state.inputs.action = false;
      actionBtn.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
    };
  
    actionBtn.addEventListener('touchstart', handleActionStart);
    actionBtn.addEventListener('touchend', handleActionEnd);
    actionBtn.addEventListener('mousedown', handleActionStart);
    actionBtn.addEventListener('mouseup', handleActionEnd);
    actionBtn.addEventListener('mouseleave', handleActionEnd);
  }
  
  // Renderização
  function draw() {
    try {
      // Limpar canvas
      ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);
      
      // Fundo
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(0, 0, config.canvas.width, config.canvas.height);
  
      // Gols
      ctx.fillStyle = '#ff000055';
      ctx.fillRect(0, (config.canvas.height/2 - config.goal.height/2), config.goal.width, config.goal.height);
      ctx.fillStyle = '#0000ff55';
      ctx.fillRect(config.canvas.width - config.goal.width, (config.canvas.height/2 - config.goal.height/2), config.goal.width, config.goal.height);
  
      // Jogadores
      for (const [id, player] of Object.entries(state.gameState.players)) {
        if (player) {
          ctx.globalAlpha = state.matchEnded && !state.canMove ? 0.7 : 1.0;
          ctx.fillStyle = player.team;
          ctx.beginPath();
          ctx.arc(player.x, player.y, config.player.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
          
          if (id === socket.id) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, config.player.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
  
      // Bola
      if (state.gameState.ball.x >= -50 && state.gameState.ball.x <= config.canvas.width + 50) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(state.gameState.ball.x, state.gameState.ball.y, state.gameState.ball.radius, 0, Math.PI * 2);
        ctx.fill();
      }
  
      // Placar
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.fillText(`Red: ${state.gameState.score.red} | Blue: ${state.gameState.score.blue}`, 20, 30);
  
    } catch (error) {
      console.error('Erro na renderização:', error);
    }
    
    updatePlayerIDs();
    requestAnimationFrame(draw);
  }
  
  // Event listeners
  window.addEventListener('load', () => {
    // Verifica se é mobile e mostra os controles
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      document.getElementById('mobile-controls').style.display = 'flex';
    }
    
    setupControls();
    const controlsHeight = document.getElementById('mobile-controls').offsetHeight;
    elements.canvas.style.marginBottom = `${controlsHeight + 20}px`;
  });


  window.addEventListener('keydown', (e) => {
    if (!state.canMove || state.currentTeam === 'spectator' || state.matchEnded) return;
    
    switch(e.key) {
      case 'ArrowLeft': state.inputs.left = true; break;
      case 'ArrowRight': state.inputs.right = true; break;
      case 'ArrowUp': state.inputs.up = true; break;
      case 'ArrowDown': state.inputs.down = true; break;
    }
  });
  
  window.addEventListener('keyup', (e) => {
    switch(e.key) {
      case 'ArrowLeft': state.inputs.left = false; break;
      case 'ArrowRight': state.inputs.right = false; break;
      case 'ArrowUp': state.inputs.up = false; break;
      case 'ArrowDown': state.inputs.down = false; break;
    }
  });
  
  elements.restartButton.addEventListener('click', () => {
    socket.emit('requestRestart');
    elements.restartButton.style.display = 'none';
    elements.waitingScreen.textContent = 'Você está pronto! Aguardando adversário...\n';
  });
  
  // Loop de input
  setInterval(() => {
    if (state.currentTeam !== 'spectator' && state.canMove) {
      socket.emit('input', state.inputs);
    }
  }, 1000 / 60);
  
  // Iniciar renderização
  draw();