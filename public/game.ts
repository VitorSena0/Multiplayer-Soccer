// ===============================
// Configuração base do jogo
// - Tamanhos de canvas, campo, jogadores, bola e gols
// - Esses valores são usados em vários pontos (desenho, colisão, etc.)
// ===============================
// Configuração do jogo
interface Config {
  canvas: {
    width: number;
    height: number;
  };
  field: {
    cornerSize: number;
  };
  player: {
    radius: number;
  };
  ball: {
    radius: number;
  };
  goal: {
    width: number;
    height: number;
  };
}

const config: Config = {
  canvas: {
    width: 800,
    height: 600,
  },
  field: {
    cornerSize: 80,
  },
  player: {
    radius: 20,
  },
  ball: {
    radius: 10,
  },
  goal: {
    width: 50,
    height: 200,
  },
};

// ===============================
// Elementos do DOM
// - Criamos tudo via JavaScript para deixar o index.html mais limpo
// - `container` agrupa canvas, HUD e telas de feedback (espera, vencedor, etc.)
// ===============================
interface Elements {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ui: HTMLDivElement;
  waitingScreen: HTMLDivElement;
  winnerDisplay: HTMLDivElement;
  restartButton: HTMLButtonElement;
  roomInfo: HTMLDivElement;
  ping: HTMLDivElement;
  scoreboard: HTMLDivElement;
  hudBottom: HTMLDivElement;
  timerBottom: HTMLDivElement;
}

const elements: Elements = {
  container: document.createElement('div'),
  canvas: document.createElement('canvas'),
  ui: document.createElement('div'),
  waitingScreen: document.createElement('div'),
  winnerDisplay: document.createElement('div'),
  restartButton: document.createElement('button'),
  roomInfo: document.createElement('div'),
  ping: document.createElement('div'),
  scoreboard: document.createElement('div'),
  hudBottom: document.createElement('div'),
  timerBottom: document.createElement('div'),
};

// ===============================
// Estado do jogo (client-side)
// - Guarda informações que o cliente precisa para desenhar e interagir
// - `gameState` é sincronizado pelo servidor via Socket.IO
// - `inputs` guarda o que o jogador está apertando no momento
// ===============================
interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
}

interface Ball {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;
}

interface Score {
  red: number;
  blue: number;
}

interface Teams {
  red: string[];
  blue: string[];
}

interface Player {
  x: number;
  y: number;
  team: 'red' | 'blue';
  input: Omit<PlayerInput, 'action'>;
}

interface GameState {
  players: { [socketId: string]: Player };
  ball: Ball;
  score: Score;
  teams: Teams;
  matchTime: number;
  isPlaying: boolean;
  width: number;
  height: number;
}

interface State {
  matchEnded: boolean;
  canMove: boolean;
  currentTeam: 'red' | 'blue' | 'spectator';
  roomId: string | null;
  roomCapacity: number;
  roomPlayerCount: number;
  requestedRoomId: string | null;
  ping: number | null;
  inputs: PlayerInput;
  gameState: GameState;
  isMobile: boolean;
}

const state: State = {
  matchEnded: false,
  canMove: false,
  currentTeam: 'spectator',
  roomId: null,
  roomCapacity: 0,
  roomPlayerCount: 0,
  requestedRoomId: null,
  ping: null, // Latência em ms
  inputs: { left: false, right: false, up: false, down: false, action: false },
  gameState: {
    players: {},
    ball: { x: 400, y: 300, radius: config.ball.radius, speedX: 0, speedY: 0 },
    score: { red: 0, blue: 0 },
    teams: { red: [], blue: [] },
    matchTime: 60,
    isPlaying: false,
    width: config.canvas.width,
    height: config.canvas.height,
  },
  isMobile: false,
};

function getRequestedRoomId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('room');
  return value ? value.trim() : null;
}

// Verifica se o dispositivo é móvel (touch)
// Usado para decidir se mostramos controles de joystick na tela
function isMobileDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  );
}

// Inicialização do canvas e container principal do jogo
// - Cria o contexto 2D
// - Ajusta o tamanho "lógico" do canvas
// - Faz um resize inicial para caber melhor na tela do usuário
function initCanvas(): CanvasRenderingContext2D {
  const ctx = elements.canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível obter o contexto 2D do canvas');
  }

  elements.container.id = 'game-container';
  document.body.appendChild(elements.container);

  elements.canvas.width = config.canvas.width;
  elements.canvas.height = config.canvas.height;
  elements.container.appendChild(elements.canvas);

  resizeCanvasForViewport();

  return ctx;
}

// Ajusta o tamanho VISUAL do canvas (CSS) mantendo a proporção
// O tamanho lógico (config.canvas.width/height) continua o mesmo
function resizeCanvasForViewport(): void {
  const aspect = config.canvas.width / config.canvas.height;
  const maxWidth = Math.min(window.innerWidth - 24, 900);
  const width = Math.max(280, maxWidth);
  const height = width / aspect;
  elements.canvas.style.width = `${width}px`;
  elements.canvas.style.height = `${height}px`;
}

// Atualiza o display de ping
// - Se ainda não medimos, mostra "-- ms"
// - Depois que o servidor responde, mostra a latência medida
function atualizarDisplayPing(): void {
  if (!elements.ping) return;
  if (state.ping === null) {
    elements.ping.textContent = 'Ping: -- ms';
  } else {
    elements.ping.textContent = `Ping: ${state.ping} ms`;
  }
}

const ctx = initCanvas();
state.isMobile = isMobileDevice();

// ===============================
// Inicialização da UI
// - Cria HUD inferior (ping, cronômetro, placar)
// - Cria elementos de texto (esperando jogador, vencedor, info da sala)
// - Tudo é anexado ao `elements.container`
// ===============================
function initUI(): void {
  elements.ping.id = 'ping';
  elements.ping.textContent = 'Ping: -- ms';

  elements.ui.id = 'game-ui';
  elements.waitingScreen.id = 'waiting-screen';
  elements.waitingScreen.textContent = 'Aguardando outro jogador...';
  elements.winnerDisplay.id = 'winner-display';
  elements.roomInfo.id = 'room-info';
  elements.roomInfo.textContent = 'Conectando a uma sala...';
  elements.restartButton.id = 'restart-button';
  elements.restartButton.textContent = 'Jogar Novamente';
  elements.restartButton.style.display = 'none';

  elements.ui.appendChild(elements.waitingScreen);
  elements.ui.appendChild(elements.winnerDisplay);
  elements.ui.appendChild(elements.roomInfo);
  elements.ui.appendChild(elements.restartButton);

  // HUD inferior
  elements.hudBottom.id = 'hud-bottom';
  elements.timerBottom.id = 'timer-bottom';
  elements.timerBottom.textContent = '1:00';
  elements.scoreboard.id = 'scoreboard';
  elements.scoreboard.textContent = 'Red: 0 | Blue: 0';

  elements.hudBottom.appendChild(elements.ping);
  elements.hudBottom.appendChild(elements.timerBottom);
  elements.hudBottom.appendChild(elements.scoreboard);

  elements.container.appendChild(elements.canvas);
  elements.container.appendChild(elements.ui);
  elements.container.appendChild(elements.hudBottom);
}

initUI();
atualizarDisplayPing();

state.requestedRoomId = getRequestedRoomId();
state.roomId = state.requestedRoomId;

// Salva o ID da sala na URL (?room=XYZ)
// Assim o jogador pode recarregar a página ou compartilhar o link
function persistRoomInUrl(roomId: string): void {
  if (!roomId) return;
  const params = new URLSearchParams(window.location.search);
  params.set('room', roomId);
  const query = params.toString();
  window.history.replaceState({}, '', `/${query ? `?${query}` : ''}`);
  state.requestedRoomId = roomId;
}

// Atualiza o texto que mostra qual sala o jogador está
// Ex.: "Sala abc123 (1/4)"
function updateRoomInfoDisplay(): void {
  if (!elements.roomInfo) return;
  if (!state.roomId) {
    elements.roomInfo.textContent = 'Conectando a uma sala...';
    return;
  }
  const playersInRoom = state.roomPlayerCount || Object.keys(state.gameState.players).length;
  const capacityText = state.roomCapacity ? ` (${playersInRoom}/${state.roomCapacity})` : '';
  elements.roomInfo.textContent = `Sala ${state.roomId}${capacityText}`;
}

updateRoomInfoDisplay();

// ===============================
// Conexão com o servidor (Socket.IO)
// - Enviamos opcionalmente o roomId desejado
// - O servidor decide se aloca em uma sala existente ou cria outra
// ===============================
// Socket.IO é carregado via CDN no HTML e tipos são fornecidos por @types/socket.io-client

const socket = io(window.location.origin, {
  query: { roomId: state.requestedRoomId || '' },
});

// ===============================
// Handlers de eventos do Socket.IO
// Cada chave do objeto abaixo corresponde a um evento vindo do servidor
// ===============================
interface InitData {
  team: 'red' | 'blue';
  gameState: Partial<GameState>;
  canMove: boolean;
  roomId?: string;
}

interface RoomAssignedData {
  roomId: string;
  capacity: number;
  players: number;
}

interface RoomFullData {
  roomId: string;
  capacity: number;
}

interface PlayerConnectedData {
  playerId: string;
  team: 'red' | 'blue';
  gameState: { teams: Teams };
}

interface UpdateData {
  players: { [socketId: string]: Player };
  ball: Ball;
  score: Score;
  teams: Teams;
  matchTime: number;
  isPlaying: boolean;
  roomId?: string;
}

interface MatchStartData {
  gameState: Partial<GameState>;
  canMove: boolean;
}

interface PlayerReadyUpdateData {
  players: { [socketId: string]: Player };
  readyCount: number;
  totalPlayers: number;
  canMove: boolean;
}

interface TeamChangedData {
  newTeam: 'red' | 'blue';
  gameState: GameState;
}

interface PlayerDisconnectedData {
  playerId: string;
  gameState: GameState;
}

interface MatchEndData {
  winner: 'red' | 'blue' | 'draw';
  gameState: GameState;
}

interface TimerUpdateData {
  matchTime: number;
}

interface WaitingForPlayersData {
  redCount: number;
  blueCount: number;
}

interface GoalScoredData {
  team: 'red' | 'blue';
}

interface BallResetData {
  ball: Ball;
}

const socketHandlers = {
  init: (data: InitData) => {
    state.currentTeam = data.team;
    state.gameState = { ...state.gameState, ...data.gameState };
    state.canMove = data.canMove;
    state.roomId = data.roomId || state.roomId;
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    if (data.roomId) {
      persistRoomInUrl(data.roomId);
    }
    updateRoomInfoDisplay();
    updateUI();
  },

  roomAssigned: (data: RoomAssignedData) => {
    state.roomId = data.roomId;
    state.roomCapacity = data.capacity;
    state.roomPlayerCount = data.players;
    persistRoomInUrl(data.roomId);
    updateRoomInfoDisplay();
  },

  roomFull: (data: RoomFullData) => {
    const message = `Sala ${data.roomId} está cheia (${data.capacity} jogadores). Escolha outra sala.`;
    elements.waitingScreen.style.display = 'block';
    elements.waitingScreen.textContent = message;
    state.canMove = false;
    alert(message);
  },

  playerConnected: (data: PlayerConnectedData) => {
    if (state.gameState.teams.red.length + state.gameState.teams.blue.length < 2) {
      elements.winnerDisplay.textContent = '';
      elements.winnerDisplay.style.display = 'none';
      state.matchEnded = false;
    }

    state.gameState.players[data.playerId] = {
      x: data.team === 'red' ? 100 : 700,
      y: 300,
      team: data.team,
      input: { left: false, right: false, up: false, down: false },
    };
    state.gameState.teams = data.gameState.teams;
    state.canMove = state.gameState.teams.red.length > 0 && state.gameState.teams.blue.length > 0;
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    updateRoomInfoDisplay();
    updateUI();
  },

  update: (newState: UpdateData) => {
    state.gameState = { ...state.gameState, ...newState };
    state.roomId = newState.roomId || state.roomId;
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    state.canMove =
      state.gameState.isPlaying &&
      ((state.currentTeam === 'red' && state.gameState.teams.blue.length > 0) ||
        (state.currentTeam === 'blue' && state.gameState.teams.red.length > 0));
    updateRoomInfoDisplay();
    updateUI();
  },

  cleanPreviousMatch: () => {
    elements.winnerDisplay.textContent = '';
    elements.winnerDisplay.style.display = 'none';
    state.matchEnded = false;
    draw();
  },

  matchStart: (data: MatchStartData) => {
    state.gameState = { ...state.gameState, ...data.gameState, isPlaying: true };
    state.matchEnded = false;
    state.canMove = true;
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    updateRoomInfoDisplay();
    hideWinner();
    updateUI();
  },

  playerReadyUpdate: (data: PlayerReadyUpdateData) => {
    state.gameState.players = data.players;
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    updateRoomInfoDisplay();
    if (state.matchEnded) {
      const readyText = `Prontos: ${data.readyCount}/${data.totalPlayers}`;
      elements.waitingScreen.textContent =
        state.currentTeam === 'spectator'
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

  teamChanged: (data: TeamChangedData) => {
    state.currentTeam = data.newTeam;
    state.gameState = data.gameState;
    if (state.gameState.players[socket.id]) {
      state.gameState.players[socket.id].x = state.currentTeam === 'red' ? 100 : 700;
      state.gameState.players[socket.id].y = 300;
    }
    alert(`Você foi movido para o time ${state.currentTeam.toUpperCase()}`);
    updateUI();
  },

  playerDisconnected: (data: PlayerDisconnectedData) => {
    state.gameState = data.gameState;
    delete state.gameState.players[data.playerId];
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    updateRoomInfoDisplay();
    updateUI();
    if (
      state.matchEnded &&
      state.gameState.teams.red.length > 0 &&
      state.gameState.teams.blue.length > 0
    ) {
      socket.emit('requestRestart');
    }
  },

  matchEnd: (data: MatchEndData) => {
    state.gameState.isPlaying = false;
    state.matchEnded = true;
    state.gameState.players = data.gameState.players;
    state.roomPlayerCount = Object.keys(state.gameState.players).length;
    updateRoomInfoDisplay();
    showWinner(data.winner);
    elements.restartButton.style.display = 'block';
    elements.waitingScreen.textContent = 'Partida terminada. Aguardando todos jogadores...';
    elements.waitingScreen.style.display = 'block';
  },

  timerUpdate: (data: TimerUpdateData) => {
    state.gameState.matchTime = data.matchTime;
    updateTimerDisplay();
  },

  waitingForPlayers: (data: WaitingForPlayersData) => {
    const waitingText = `Aguardando jogadores... Vermelho: ${data.redCount} | Azul: ${data.blueCount}`;
    elements.waitingScreen.textContent = waitingText;
    elements.waitingScreen.style.display = 'block';
    state.canMove = false;
    state.roomPlayerCount = data.redCount + data.blueCount;
    updateRoomInfoDisplay();
    updateUI();
  },

  goalScored: (data: GoalScoredData) => {
    state.gameState.ball.x = -1000;
    state.gameState.ball.y = -1000;
    console.log(`GOL do time ${data.team}!`);
  },

  ballReset: (data: BallResetData) => {
    state.gameState.ball = data.ball;
  },
};

// Registrar handlers de todos os eventos definidos acima
Object.entries(socketHandlers).forEach(([event, handler]) => {
  socket.on(event, handler);
});

// Medição de ping
// - O servidor envia o timestamp atual
// - Calculamos a diferença para obter a latência aproximada
socket.on('ping', (serverTimestamp: number) => {
  const now = Date.now();
  const latencia = now - serverTimestamp;
  state.ping = latencia;
  atualizarDisplayPing();
});

// ===============================
// Funções de UI
// ===============================
function updateUI(): void {
  updateRoomInfoDisplay();
  updateScoreboard();
  if (state.matchEnded) {
    elements.waitingScreen.style.display = 'block';
    elements.waitingScreen.textContent = 'Partida terminada. Aguardando todos jogadores...\n';
    state.canMove = false;
  } else {
    const hasOpponent =
      (state.currentTeam === 'red' && state.gameState.teams.blue.length > 0) ||
      (state.currentTeam === 'blue' && state.gameState.teams.red.length > 0);
    elements.waitingScreen.style.display = hasOpponent ? 'none' : 'block';
    state.canMove = hasOpponent && state.gameState.isPlaying;
  }
}

// Atualiza o texto do placar no HUD inferior
function updateScoreboard(): void {
  if (!elements.scoreboard) return;
  elements.scoreboard.textContent = `Red: ${state.gameState.score.red} | Blue: ${state.gameState.score.blue}`;
}

// Desenha o ID de cada jogador acima da cabeça (ajustado ao tamanho do canvas na tela)
function updatePlayerIDs(): void {
  document.querySelectorAll('.player-id').forEach((el) => el.remove());

  for (const [id, player] of Object.entries(state.gameState.players)) {
    if (player) {
      const idElement = document.createElement('div');
      idElement.className = 'player-id';
      idElement.textContent = id.substring(0, 5);

      if (id === socket.id) {
        idElement.classList.add('my-player');
      }

      const canvasRect = elements.canvas.getBoundingClientRect();
      const scaleX = canvasRect.width / config.canvas.width;
      const scaleY = canvasRect.height / config.canvas.height;

      idElement.style.position = 'absolute';
      idElement.style.left = `${canvasRect.left + player.x * scaleX}px`;
      idElement.style.top = `${canvasRect.top + player.y * scaleY - config.player.radius + 10}px`;
      idElement.style.zIndex = '10';
      document.body.appendChild(idElement);
    }
  }
}

function showWinner(winner: 'red' | 'blue' | 'draw'): void {
  elements.winnerDisplay.style.display = 'block';
  elements.winnerDisplay.style.opacity = '1';
  elements.winnerDisplay.textContent = winner === 'draw' ? 'Empate!' : `Time ${winner.toUpperCase()} venceu!`;
}

function hideWinner(): void {
  elements.winnerDisplay.style.opacity = '0';
  setTimeout(() => {
    elements.winnerDisplay.style.display = 'none';
  }, 500);
}

// Atualiza o cronômetro mostrado no HUD inferior
function updateTimerDisplay(): void {
  const minutes = Math.floor(state.gameState.matchTime / 60);
  const seconds = state.gameState.matchTime % 60;
  const text = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  elements.timerBottom.textContent = text;
}

// ===============================
// Controles
// - Configura joystick virtual para mobile
// - Configura botão de ação (se visível)
// - Atualiza o objeto `state.inputs` que será enviado ao servidor
// ===============================
function setupControls(): void {
  const mobileControls = document.getElementById('mobile-controls');
  if (!mobileControls) return;

  // Ativa controles no mobile; esconde o botão de chute
  if (state.isMobile) {
    mobileControls.style.display = 'flex';
    const actionBtnHide = document.getElementById('action-btn');
    if (actionBtnHide) actionBtnHide.style.display = 'none';
  }

  if (mobileControls.style.display === 'none') return;

  const joystickThumb = document.getElementById('joystick-thumb');
  const joystickBase = document.getElementById('joystick-base');
  const actionBtn = document.getElementById('action-btn');

  if (!joystickThumb || !joystickBase) {
    console.warn('Elementos de controle móvel não encontrados');
    return;
  }

  let activeTouchId: number | string | null = null;
  const joystickRadius = 50;
  let centerPosition = { x: 0, y: 0 };

  const recalcCenter = () => {
    const rect = joystickBase.getBoundingClientRect();
    centerPosition = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  recalcCenter();

  window.addEventListener('resize', recalcCenter);
  window.addEventListener('scroll', recalcCenter, { passive: true });

  const updateJoystickPosition = (touch: { clientX: number; clientY: number }) => {
    const touchX = touch.clientX - centerPosition.x;
    const touchY = touch.clientY - centerPosition.y;

    const distance = Math.sqrt(touchX * touchX + touchY * touchY);
    const angle = Math.atan2(touchY, touchX);

    const limitedDistance = Math.min(distance, joystickRadius);
    const newX = Math.cos(angle) * limitedDistance;
    const newY = Math.sin(angle) * limitedDistance;

    (joystickThumb as HTMLElement).style.transform = `translate(${newX}px, ${newY}px)`;

    const deadZone = 0.2;
    const normalizedX = newX / joystickRadius;
    const normalizedY = newY / joystickRadius;

    state.inputs.left = normalizedX < -deadZone;
    state.inputs.right = normalizedX > deadZone;
    state.inputs.up = normalizedY < -deadZone;
    state.inputs.down = normalizedY > deadZone;
  };

  const resetJoystick = () => {
    (joystickThumb as HTMLElement).style.transform = 'translate(0, 0)';
    activeTouchId = null;
    state.inputs.left = false;
    state.inputs.right = false;
    state.inputs.up = false;
    state.inputs.down = false;
  };

  joystickBase.addEventListener('touchstart', (e: TouchEvent) => {
    if (activeTouchId !== null) return;
    const touch = e.changedTouches[0];
    activeTouchId = touch.identifier;
    recalcCenter();
    updateJoystickPosition(touch);
    e.preventDefault();
  });

  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (activeTouchId === null) return;
      const touch = Array.from(e.changedTouches).find((t) => t.identifier === activeTouchId);
      if (touch) {
        updateJoystickPosition(touch);
        e.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener('touchend', (e: TouchEvent) => {
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === activeTouchId);
    if (touch) {
      resetJoystick();
      e.preventDefault();
    }
  });

  joystickBase.addEventListener('mousedown', (e: MouseEvent) => {
    if (activeTouchId !== null) return;
    activeTouchId = 'mouse';
    recalcCenter();
    updateJoystickPosition(e);
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
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

  // Botão de ação (fica oculto no mobile; mantém funcionalidade para desktop se visível)
  if (actionBtn) {
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
}

// ===============================
// Renderização principal do jogo
// - Desenha campo, áreas, gols, jogadores e bola
// - Chama `updatePlayerIDs` para alinhar labels com o canvas
// - Usa `requestAnimationFrame(draw)` para animar continuamente
// ===============================
function draw(): void {
  try {
    ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);

    // Fundo base
    ctx.fillStyle = '#28412f';
    ctx.fillRect(0, 0, config.canvas.width, config.canvas.height);

    // Textura de gramado
    const stripeHeight = 24;
    for (let y = 0; y < config.canvas.height; y += stripeHeight) {
      ctx.fillStyle = Math.floor(y / stripeHeight) % 2 === 0 ? '#2f4b37' : '#25382b';
      ctx.fillRect(0, y, config.canvas.width, stripeHeight);
    }

    // Cantos triangulares
    const cornerSize = config.field.cornerSize || 0;
    if (cornerSize > 0) {
      ctx.fillStyle = '#1f2f35';

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cornerSize, 0);
      ctx.lineTo(0, cornerSize);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(config.canvas.width - cornerSize, 0);
      ctx.lineTo(config.canvas.width, 0);
      ctx.lineTo(config.canvas.width, cornerSize);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, config.canvas.height - cornerSize);
      ctx.lineTo(0, config.canvas.height);
      ctx.lineTo(cornerSize, config.canvas.height);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(config.canvas.width - cornerSize, config.canvas.height);
      ctx.lineTo(config.canvas.width, config.canvas.height);
      ctx.lineTo(config.canvas.width, config.canvas.height - cornerSize);
      ctx.closePath();
      ctx.fill();
    }

    // Linhas do campo
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    const padding = 0;
    const innerWidth = config.canvas.width - padding * 2;
    const innerHeight = config.canvas.height - padding * 2;

    ctx.strokeRect(padding, padding, innerWidth, innerHeight);

    // Linha central
    ctx.beginPath();
    ctx.moveTo(config.canvas.width / 2, padding);
    ctx.lineTo(config.canvas.width / 2, config.canvas.height - padding);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(config.canvas.width / 2, config.canvas.height / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(config.canvas.width / 2, config.canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f5f5';
    ctx.fill();

    // Áreas e gols
    const bigBoxWidth = 140;
    const bigBoxHeight = 260;
    const smallBoxWidth = 70;
    const smallBoxHeight = 140;
    const goalLineTop = (config.canvas.height - bigBoxHeight) / 2;
    const goalLineBottom = goalLineTop + bigBoxHeight;

    ctx.strokeRect(padding, goalLineTop, bigBoxWidth, bigBoxHeight);
    ctx.strokeRect(padding, (config.canvas.height - smallBoxHeight) / 2, smallBoxWidth, smallBoxHeight);
    ctx.beginPath();
    ctx.arc(padding + 90, config.canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeRect(config.canvas.width - padding - bigBoxWidth, goalLineTop, bigBoxWidth, bigBoxHeight);
    ctx.strokeRect(
      config.canvas.width - padding - smallBoxWidth,
      (config.canvas.height - smallBoxHeight) / 2,
      smallBoxWidth,
      smallBoxHeight
    );
    ctx.beginPath();
    ctx.arc(config.canvas.width - padding - 90, config.canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(padding + bigBoxWidth, config.canvas.height / 2, 60, Math.PI * 1.5, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(config.canvas.width - padding - bigBoxWidth, config.canvas.height / 2, 60, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();

    // Gols
    ctx.fillStyle = '#ff000055';
    ctx.fillRect(0, config.canvas.height / 2 - config.goal.height / 2, config.goal.width, config.goal.height);
    ctx.fillStyle = '#0000ff55';
    ctx.fillRect(
      config.canvas.width - config.goal.width,
      config.canvas.height / 2 - config.goal.height / 2,
      config.goal.width,
      config.goal.height
    );

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

    // Sem placar / cronômetro desenhados no canvas (fica no HUD inferior)
  } catch (error) {
    console.error('Erro na renderização:', error);
  }

  updatePlayerIDs();
  requestAnimationFrame(draw);
}

// ===============================
// Event listeners globais (carregamento, resize e teclado)
// ===============================
window.addEventListener('load', () => {
  if (state.isMobile || /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'flex';
    const actionBtn = document.getElementById('action-btn');
    if (actionBtn) actionBtn.style.display = 'none';
  }

  setupControls();
  resizeCanvasForViewport();
});

// Redimensiona canvas e reposiciona labels quando a janela mudar de tamanho
window.addEventListener('resize', () => {
  resizeCanvasForViewport();
  updatePlayerIDs();
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!state.canMove || state.currentTeam === 'spectator' || state.matchEnded) return;

  switch (e.key) {
    case 'ArrowLeft':
      state.inputs.left = true;
      break;
    case 'ArrowRight':
      state.inputs.right = true;
      break;
    case 'ArrowUp':
      state.inputs.up = true;
      break;
    case 'ArrowDown':
      state.inputs.down = true;
      break;
  }
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowLeft':
      state.inputs.left = false;
      break;
    case 'ArrowRight':
      state.inputs.right = false;
      break;
    case 'ArrowUp':
      state.inputs.up = false;
      break;
    case 'ArrowDown':
      state.inputs.down = false;
      break;
  }
});

// Botão "Jogar Novamente" após o fim da partida
elements.restartButton.addEventListener('click', () => {
  socket.emit('requestRestart');
  elements.restartButton.style.display = 'none';
  elements.waitingScreen.textContent = 'Você está pronto! Aguardando adversário...\n';
});

// Loop de input
// - A cada frame (~60 FPS) envia o estado atual das teclas para o servidor
setInterval(() => {
  if (state.currentTeam !== 'spectator' && state.canMove) {
    socket.emit('input', state.inputs);
  }
}, 1000 / 60);

// Inicia o loop de renderização do jogo
draw();
