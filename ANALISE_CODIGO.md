# Análise do Projeto Multiplayer Soccer

## Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Back-end: Servidor de Jogo](#2-back-end-servidor-de-jogo)
3. [Front-end: Cliente Web](#3-front-end-cliente-web)
4. [Comunicação Cliente-Servidor](#4-comunicação-cliente-servidor)
5. [Fluxo de Execução do Jogo](#5-fluxo-de-execução-do-jogo)
6. [Principais Pontos do Código](#6-principais-pontos-do-código)

---

## 1. Visão Geral da Arquitetura

### Estrutura do Projeto

```
Multiplayer-Soccer/
├── game-server.js              # Ponto de entrada do servidor
├── game/                       # Lógica do servidor
│   ├── constants.js           # Constantes do jogo
│   ├── roomManager.js         # Gerenciamento de salas
│   ├── match.js               # Controle de partidas
│   ├── ball.js                # Física da bola
│   ├── gameLoop.js            # Loop principal do jogo
│   └── socketHandlers.js      # Eventos Socket.IO
└── public/                     # Cliente (front-end)
    ├── index.html             # Página HTML
    ├── style.css              # Estilos
    └── game.js                # Lógica do cliente
```

### Stack Tecnológica

**Back-end:**
- **Node.js**: Runtime JavaScript no servidor
- **Express**: Framework web para servir arquivos estáticos
- **Socket.IO**: Comunicação em tempo real via WebSockets

**Front-end:**
- **HTML5 Canvas**: Renderização gráfica 2D
- **JavaScript Vanilla**: Lógica do cliente
- **Socket.IO Client**: Comunicação com o servidor

### Modelo Arquitetural

Este projeto segue um modelo **cliente-servidor autoritativo**, onde:
- O **servidor** é a autoridade sobre o estado do jogo
- Os **clientes** enviam inputs e recebem atualizações de estado
- A física e a lógica do jogo são processadas no servidor para evitar trapaças

---

## 2. Back-end: Servidor de Jogo

### 2.1 Ponto de Entrada: `game-server.js`

**Responsabilidades:**
- Inicializar o servidor HTTP com Express
- Configurar Socket.IO para comunicação em tempo real
- Servir arquivos estáticos da pasta `public/`
- Executar loops de atualização do jogo

**Principais Componentes:**

```javascript
const app = express();                    // Aplicação Express
const server = http.createServer(app);    // Servidor HTTP
const io = socketio(server, { ... });     // Socket.IO
```

**Loops de Execução:**

1. **Game Loop (60 FPS)**
   ```javascript
   setInterval(runGameLoops, 1000 / 60);
   ```
   - Atualiza física, colisões e estado do jogo
   - Executa 60 vezes por segundo para movimento suave

2. **Timer Loop (1 Hz)**
   ```javascript
   setInterval(handleTimers, 1000);
   ```
   - Decrementa o cronômetro da partida
   - Executa 1 vez por segundo

**Configuração CORS:**
- Permite conexões de qualquer origem (`origin: '*'`)
- Aceita métodos GET e POST
- Habilita compatibilidade com Engine.IO v3

---

### 2.2 Gerenciamento de Salas: `roomManager.js`

**Função Principal:** Gerenciar múltiplas salas de jogo independentes.

**Estrutura de Dados:**

```javascript
const rooms = new Map();  // Mapa de salas: roomId -> roomState
```

**Estado de uma Sala:**
```javascript
{
    id: 'room-1',
    width: 800,
    height: 600,
    players: {},                     // Jogadores na sala
    ball: { x, y, speedX, speedY },  // Estado da bola
    score: { red: 0, blue: 0 },      // Placar
    teams: { red: [], blue: [] },    // Times
    matchTime: 60,                   // Tempo restante
    isPlaying: false,                // Partida em andamento?
    waitingForRestart: false,        // Aguardando reinício?
    playersReady: new Set(),         // Jogadores prontos
    ballResetInProgress: false,      // Reset da bola em andamento?
    lastGoalTime: 0,                 // Timestamp do último gol
    goalCooldown: 500                // Cooldown entre gols (ms)
}
```

**Funções Principais:**

1. **`allocateRoom(requestedRoomId)`**
   - Procura ou cria uma sala disponível
   - Sanitiza IDs de sala (apenas letras, números, `-` e `_`)
   - Limita a 6 jogadores por sala (`MAX_PLAYERS_PER_ROOM`)
   - Retorna `{ room }` ou `{ error: 'room-full' }`

2. **`createRoom(roomId)`**
   - Cria uma nova sala com estado inicial
   - Gera ID sequencial (`room-1`, `room-2`, etc.) se não fornecido
   - Inicializa bola no centro, placar zerado

3. **`cleanupRoomIfEmpty(room)`**
   - Remove salas vazias para economizar memória
   - Chamada quando o último jogador desconecta

4. **`sanitizeRoomId(roomId)`**
   - Remove caracteres especiais
   - Converte para minúsculas
   - Limita a 32 caracteres
   - Previne injeção de código

**Sistema de Salas:**
- Sala padrão: geração automática (`room-1`, `room-2`, ...)
- Sala customizada: URL com parâmetro `?room=nome`
- Capacidade máxima: 6 jogadores
- Isolamento: cada sala tem jogo independente

---

### 2.3 Controle de Partidas: `match.js`

**Função Principal:** Gerenciar o ciclo de vida das partidas.

**Principais Funções:**

1. **`balanceTeams(room, io)`**
   - Mantém equilíbrio entre times vermelho e azul
   - Diferença máxima: 1 jogador
   - Move jogadores automaticamente quando necessário
   - Notifica o jogador movido com evento `teamChanged`

2. **`startNewMatch(room, io)`**
   - Inicia uma nova partida quando há jogadores em ambos os times
   - Zera o placar e redefine o cronômetro para `MATCH_DURATION` (60s)
   - Reposiciona todos os jogadores:
     - Time vermelho: x=100, y=300 (esquerda)
     - Time azul: x=700, y=300 (direita)
   - Reseta a bola para o centro com `resetBall()`
   - Emite eventos:
     - `cleanPreviousMatch`: limpa dados da partida anterior
     - `matchStart`: notifica início da partida

3. **`checkRestartConditions(room, io)`**
   - Verifica se há jogadores em ambos os times
   - Inicia partida automaticamente se condições atendidas
   - Emite `waitingForPlayers` se faltar jogadores em algum time

4. **`updateTimer(room, io)`**
   - Decrementa cronômetro a cada segundo
   - Quando tempo zera:
     - Para a partida (`isPlaying = false`)
     - Determina vencedor (red/blue/draw)
     - Move jogadores para fora da tela (x=-100, y=-100)
     - Emite `matchEnd` com resultado
     - Ativa modo de espera para reinício

**Fluxo de Reinício:**
1. Partida termina → todos clicam "Jogar Novamente"
2. Servidor rastreia jogadores prontos (`playersReady`)
3. Quando todos prontos → `startNewMatch()`
4. Nova partida inicia automaticamente

---

### 2.4 Física da Bola: `ball.js`

**Função Principal:** Controlar posicionamento e colisões da bola.

**Principais Funções:**

1. **`resetBall(room, io)`**
   - Reposiciona a bola após gols ou início de partida
   - Posicionamento aleatório no terço central do campo:
     ```javascript
     minX = width/2 - width/6
     maxX = width/2 + width/6
     minY = height/2 - height/6
     maxY = height/2 + height/6
     ```
   - Zera velocidade (`speedX = 0`, `speedY = 0`)
   - Emite evento `ballReset` para sincronizar clientes

2. **`enforceCornerBoundaries(room)`**
   - Implementa colisões com os cantos triangulares do campo
   - 4 regiões de canto definidas (superior-esquerdo, superior-direito, etc.)
   - Usa matemática vetorial:
     - Calcula distância da bola à linha do canto
     - Se penetração detectada, empurra bola para fora
     - Aplica reflexão com amortecimento (0.7) na velocidade
   - Previne que a bola fique presa nos cantos

3. **`getCornerDefinitions(room)`**
   - Define geometria dos cantos triangulares
   - Cada canto tem:
     - `region`: função que verifica se bola está na região
     - `p1, p2`: pontos da linha diagonal do triângulo
     - `inside`: ponto de referência dentro do campo

**Sistema de Colisão nos Cantos:**
- Usa equação da reta para calcular distância perpendicular
- Normaliza vetores para direção correta
- Aplica penetração mínima (`BALL_RADIUS`)
- Reflete velocidade com damping (0.7)

---

### 2.5 Loop Principal do Jogo: `gameLoop.js`

**Função Principal:** Atualizar física e detectar eventos a cada frame (60 FPS).

**`gameLoop(room, io)` - Ordem de Execução:**

1. **Movimento dos Jogadores**
   ```javascript
   const speed = 5;
   player.x += (input.right ? speed : 0) - (input.left ? speed : 0);
   player.y += (input.down ? speed : 0) - (input.up ? speed : 0);
   ```
   - Aplica velocidade baseada no input do jogador
   - Limita posição aos limites do campo (`PLAYER_RADIUS` de margem)

2. **Colisão Jogador-Bola**
   ```javascript
   distance = sqrt(dx² + dy²)
   if (distance < PLAYER_RADIUS + BALL_RADIUS) {
       // Colisão detectada
   }
   ```
   - Calcula distância entre centro do jogador e bola
   - Se colidem:
     - Empurra bola para fora (overlap * 1.1)
     - Calcula ângulo de colisão com `atan2(dy, dx)`
     - Transfere momento: velocidade do jogador + impulso (12)
     - Bola herda velocidade do jogador

3. **Atualização da Bola**
   - Aplica velocidade: `ball.x += ball.speedX`
   - Aplica atrito: `ball.speed *= 0.89` (11% de desaceleração)

4. **Colisões com Paredes**
   - Horizontais: inverte `speedX` com amortecimento (-0.7)
   - Verticais: inverte `speedY` com amortecimento (-0.7)
   - Limita posição da bola aos limites do campo

5. **Colisões com Cantos**
   - Chama `enforceCornerBoundaries(room)`

6. **Detecção de Gols**
   ```javascript
   if (!ballResetInProgress && now - lastGoalTime > goalCooldown) {
       if (ball.x < GOAL_WIDTH && ball.y dentro da área) {
           // Gol do time azul
       }
   }
   ```
   - Verifica se bola entrou na área do gol (50px de largura, 200px de altura)
   - Sistema de cooldown (500ms) previne gols múltiplos
   - Incrementa placar
   - Emite evento `goalScored`
   - Agenda reset da bola com `setTimeout()`

7. **Sincronização com Clientes**
   - Emite evento `update` com estado completo:
     - Posições de todos os jogadores
     - Posição e velocidade da bola
     - Placar, tempo, times

**Sistemas de Prevenção:**
- **Cooldown de gols:** Evita múltiplos gols em < 500ms
- **Flag de reset:** `ballResetInProgress` previne detecções durante reset
- **Fallback:** Se bola sair muito para fora (x < 0 ou x > width), reseta

---

### 2.6 Handlers de Socket: `socketHandlers.js`

**Função Principal:** Gerenciar eventos de conexão, desconexão e inputs dos jogadores.

**Eventos do Servidor:**

1. **`connection` (novo jogador conecta)**
   ```javascript
   const requestedRoomId = socket.handshake.query?.roomId;
   const allocation = allocateRoom(requestedRoomId);
   ```
   - Extrai `roomId` da query string
   - Aloca sala disponível ou cria nova
   - Se sala cheia:
     - Emite `roomFull`
     - Desconecta jogador
   - Balanceamento de times:
     - Escolhe time com menos jogadores
     - Adiciona jogador ao time
   - Cria estado inicial do jogador:
     ```javascript
     {
         x: team === 'red' ? 100 : 700,
         y: 300,
         team: 'red' | 'blue',
         input: { left, right, up, down }
     }
     ```
   - Emite eventos:
     - `roomAssigned`: informações da sala
     - `init`: estado inicial do jogo e time
   - Chama `checkRestartConditions()` para iniciar partida
   - Inicia ping interval (1 vez por segundo)

2. **`input` (jogador envia comandos)**
   ```javascript
   socket.on('input', (input) => {
       if (room.players[socket.id] && room.isPlaying) {
           room.players[socket.id].input = input;
       }
   });
   ```
   - Atualiza estado de input do jogador
   - Apenas aceita se partida está em andamento
   - Input: `{ left, right, up, down, action }`

3. **`requestRestart` (jogador quer jogar de novo)**
   - Adiciona jogador ao conjunto `playersReady`
   - Reposiciona jogador no seu lado do campo
   - Verifica se todos estão prontos:
     ```javascript
     allReady = allPlayers.every(id => playersReady.has(id))
     ```
   - Se todos prontos e ambos times têm jogadores:
     - Chama `startNewMatch()`
   - Emite `playerReadyUpdate` com contador de prontos

4. **`disconnect` (jogador desconecta)**
   - Para o interval de ping
   - Remove jogador do time e da sala
   - Remove do conjunto `playersReady`
   - Emite `playerDisconnected` para outros jogadores
   - Chama `checkRestartConditions()` para rebalancear
   - Chama `cleanupRoomIfEmpty()` se sala ficou vazia

**Sistema de Ping/Latência:**
```javascript
const pingInterval = setInterval(() => {
    socket.emit('ping', Date.now());
}, 1000);
```
- Envia timestamp do servidor a cada segundo
- Cliente calcula latência: `now - serverTimestamp`
- Usado para mostrar ping na UI

---

### 2.7 Constantes: `constants.js`

Define valores fixos usados em todo o servidor:

```javascript
const PLAYER_RADIUS = 20;           // Raio do jogador em pixels
const BALL_RADIUS = 10;             // Raio da bola em pixels
const GOAL_HEIGHT = 200;            // Altura do gol em pixels
const GOAL_WIDTH = 50;              // Largura do gol em pixels
const MATCH_DURATION = 60;          // Duração da partida em segundos
const MAX_PLAYERS_PER_ROOM = 6;     // Capacidade máxima da sala
const CORNER_SIZE = 80;             // Tamanho dos cantos triangulares
```

**Uso:**
- Garantir consistência entre módulos
- Facilitar ajustes de balanceamento
- Centralizar configurações do jogo

---

## 3. Front-end: Cliente Web

### 3.1 Estrutura HTML: `index.html`

**Componentes Principais:**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <title>Multiplayer Soccer</title>
    <link rel="stylesheet" href="/style.css" />
</head>
<body>
    <!-- Controles Mobile -->
    <div id="mobile-controls">
        <div id="joystick-container">
            <div id="joystick-base">
                <div id="joystick-thumb"></div>
            </div>
        </div>
        <button id="action-btn">CHUTAR</button>
    </div>
    
    <!-- Scripts -->
    <script src="/socket.io/socket.io.js"></script>
    <script src="/game.js"></script>
</body>
</html>
```

**Características:**
- HTML mínimo: Canvas e UI são criados dinamicamente via JavaScript
- Controles mobile: joystick virtual para dispositivos touch
- Scripts carregados: Socket.IO client e lógica do jogo

**Detecção Mobile:**
```javascript
if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    document.getElementById('mobile-controls').style.display = 'flex';
    actionBtn.style.display = 'none';  // Esconde botão de chute
}
```

---

### 3.2 Estilos: `style.css`

**Layout Principal:**

1. **Body**
   - Fundo escuro (`#1a1a1a`)
   - Centralizado com flexbox
   - Overflow controlado
   - `touch-action: manipulation` para mobile

2. **Canvas**
   ```css
   canvas {
       width: 100%;
       aspect-ratio: 4 / 3;
       background-color: #2c3e50;
       border: 2px solid #000000;
   }
   ```
   - Responsivo: adapta-se ao viewport
   - Mantém proporção 4:3
   - Sombra para destaque

3. **UI do Jogo (`#game-ui`)**
   - Posicionado absolutamente no topo-esquerdo
   - Fundo semi-transparente
   - Contém: status de espera, vencedor, info da sala

4. **HUD Inferior (`#hud-bottom`)**
   - Posicionado abaixo do canvas
   - Contém: ping, cronômetro, placar
   - Flexbox para organização responsiva

5. **Controles Mobile**
   - Joystick virtual com base e thumb
   - Posicionado no bottom-left
   - `pointer-events: none` no container (apenas elementos internos clicáveis)
   - Botão de ação (escondido por padrão em mobile)

**Animações:**
```css
@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
}
```
- Aplicada ao ID do jogador local
- Pulsação amarela brilhante

**Responsividade:**
```css
@media (max-width: 768px) {
    #game-ui {
        position: static;
        width: 100%;
    }
    #mobile-controls {
        display: flex;
    }
}
```

---

### 3.3 Lógica do Cliente: `game.js`

#### 3.3.1 Configuração e Estado

**Configuração do Jogo:**
```javascript
const config = {
    canvas: { width: 800, height: 600 },
    field: { cornerSize: 80 },
    player: { radius: 20 },
    ball: { radius: 10 },
    goal: { width: 50, height: 200 }
};
```

**Estado do Cliente:**
```javascript
const state = {
    matchEnded: false,              // Partida terminou?
    canMove: false,                 // Pode mover o jogador?
    currentTeam: 'spectator',       // Time do jogador
    roomId: null,                   // ID da sala
    ping: null,                     // Latência
    inputs: { left, right, up, down, action },
    gameState: {                    // Estado sincronizado do servidor
        players: {},
        ball: {},
        score: { red: 0, blue: 0 },
        teams: { red: [], blue: [] },
        matchTime: 60,
        isPlaying: false
    }
};
```

#### 3.3.2 Inicialização

**`initCanvas()`**
- Cria elemento canvas
- Define dimensões (800x600)
- Adiciona ao container
- Chama `resizeCanvasForViewport()`
- Retorna contexto 2D

**`initUI()`**
- Cria elementos do DOM:
  - `#game-ui`: informações de status
  - `#waiting-screen`: mensagens de espera
  - `#winner-display`: resultado da partida
  - `#room-info`: informações da sala
  - `#hud-bottom`: ping, cronômetro, placar
- Adiciona ao container
- Inicialmente esconde elementos não necessários

**`resizeCanvasForViewport()`**
```javascript
const maxWidth = Math.min(window.innerWidth - 24, 900);
const height = width / (4/3);  // Mantém aspect ratio
elements.canvas.style.width = `${width}px`;
```
- Adapta canvas ao tamanho da janela
- Limita largura máxima a 900px
- Mantém proporção 4:3

#### 3.3.3 Conexão Socket.IO

**Inicialização:**
```javascript
const socket = io(window.location.origin, {
    query: { roomId: state.requestedRoomId || '' }
});
```
- Conecta ao servidor na mesma origem
- Envia `roomId` da URL (se fornecido)

**Extração do Room ID:**
```javascript
function getRequestedRoomId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.trim() || null;
}
```

**Persistência na URL:**
```javascript
function persistRoomInUrl(roomId) {
    const params = new URLSearchParams(window.location.search);
    params.set('room', roomId);
    window.history.replaceState({}, '', `/?${params}`);
}
```
- Atualiza URL sem recarregar página
- Permite compartilhar link da sala

#### 3.3.4 Handlers de Eventos do Socket

**1. `init` - Estado Inicial**
```javascript
socketHandlers.init = (data) => {
    state.currentTeam = data.team;           // red ou blue
    state.gameState = data.gameState;        // Estado completo
    state.canMove = data.canMove;            // Pode mover?
    state.roomId = data.roomId;
    persistRoomInUrl(data.roomId);
    updateUI();
};
```

**2. `update` - Atualização do Jogo (60 FPS)**
```javascript
socketHandlers.update = (newState) => {
    state.gameState = { ...state.gameState, ...newState };
    state.canMove = state.gameState.isPlaying && hasOpponent;
    updateUI();
};
```
- Recebe novo estado a cada frame
- Mescla com estado existente
- Atualiza flag `canMove`

**3. `matchStart` - Início de Partida**
```javascript
socketHandlers.matchStart = (data) => {
    state.gameState = { ...data.gameState, isPlaying: true };
    state.matchEnded = false;
    state.canMove = true;
    hideWinner();
    updateUI();
};
```

**4. `matchEnd` - Fim de Partida**
```javascript
socketHandlers.matchEnd = (data) => {
    state.gameState.isPlaying = false;
    state.matchEnded = true;
    showWinner(data.winner);                 // red, blue ou draw
    elements.restartButton.style.display = 'block';
    elements.waitingScreen.textContent = 'Aguardando todos jogadores...';
};
```

**5. `timerUpdate` - Atualização do Cronômetro**
```javascript
socketHandlers.timerUpdate = (data) => {
    state.gameState.matchTime = data.matchTime;
    updateTimerDisplay();  // Formato MM:SS
};
```

**6. `goalScored` - Gol Marcado**
```javascript
socketHandlers.goalScored = (data) => {
    state.gameState.ball.x = -1000;  // Esconde bola temporariamente
    console.log(`GOL do time ${data.team}!`);
};
```

**7. `ballReset` - Bola Reposicionada**
```javascript
socketHandlers.ballReset = (data) => {
    state.gameState.ball = data.ball;  // Nova posição
};
```

**8. `ping` - Medição de Latência**
```javascript
socket.on('ping', (serverTimestamp) => {
    const latencia = Date.now() - serverTimestamp;
    state.ping = latencia;
    atualizarDisplayPing();  // "Ping: 45 ms"
};
```

**9. `roomFull` - Sala Cheia**
```javascript
socketHandlers.roomFull = (data) => {
    alert(`Sala ${data.roomId} está cheia (${data.capacity} jogadores)`);
    state.canMove = false;
};
```

**10. `teamChanged` - Balanceamento de Times**
```javascript
socketHandlers.teamChanged = (data) => {
    state.currentTeam = data.newTeam;
    // Reposiciona jogador no novo lado
    alert(`Você foi movido para o time ${data.newTeam.toUpperCase()}`);
};
```

#### 3.3.5 Controles

**Teclado (Desktop):**
```javascript
window.addEventListener('keydown', (e) => {
    if (!state.canMove) return;
    switch (e.key) {
        case 'ArrowLeft':  state.inputs.left = true; break;
        case 'ArrowRight': state.inputs.right = true; break;
        case 'ArrowUp':    state.inputs.up = true; break;
        case 'ArrowDown':  state.inputs.down = true; break;
    }
});
```

**Joystick Virtual (Mobile):**
```javascript
function setupControls() {
    const joystickThumb = document.getElementById('joystick-thumb');
    const joystickBase = document.getElementById('joystick-base');
    
    // Calcula posição do toque relativa ao centro
    const updateJoystickPosition = (touch) => {
        const touchX = touch.clientX - centerPosition.x;
        const touchY = touch.clientY - centerPosition.y;
        const distance = Math.sqrt(touchX² + touchY²);
        const angle = Math.atan2(touchY, touchX);
        
        // Limita ao raio máximo
        const limitedDistance = Math.min(distance, joystickRadius);
        const newX = Math.cos(angle) * limitedDistance;
        const newY = Math.sin(angle) * limitedDistance;
        
        // Aplica transformação visual
        joystickThumb.style.transform = `translate(${newX}px, ${newY}px)`;
        
        // Zona morta de 20%
        const deadZone = 0.2;
        const normalizedX = newX / joystickRadius;
        const normalizedY = newY / joystickRadius;
        
        state.inputs.left = normalizedX < -deadZone;
        state.inputs.right = normalizedX > deadZone;
        state.inputs.up = normalizedY < -deadZone;
        state.inputs.down = normalizedY > deadZone;
    };
    
    joystickBase.addEventListener('touchstart', ...);
    document.addEventListener('touchmove', ...);
    document.addEventListener('touchend', resetJoystick);
}
```

**Envio de Inputs:**
```javascript
setInterval(() => {
    if (state.canMove) {
        socket.emit('input', state.inputs);
    }
}, 1000 / 60);  // 60 vezes por segundo
```

#### 3.3.6 Renderização

**Loop de Renderização:**
```javascript
function draw() {
    ctx.clearRect(0, 0, config.canvas.width, config.canvas.height);
    
    // 1. Fundo
    // 2. Textura de gramado (listras)
    // 3. Cantos triangulares
    // 4. Linhas do campo
    // 5. Áreas e gols
    // 6. Jogadores
    // 7. Bola
    
    updatePlayerIDs();
    requestAnimationFrame(draw);
}
```

**Renderização do Campo:**

1. **Fundo Base**
   ```javascript
   ctx.fillStyle = '#28412f';  // Verde escuro
   ctx.fillRect(0, 0, width, height);
   ```

2. **Listras de Gramado**
   ```javascript
   const stripeHeight = 24;
   for (let y = 0; y < height; y += stripeHeight) {
       ctx.fillStyle = y % 2 === 0 ? '#2f4b37' : '#25382b';
       ctx.fillRect(0, y, width, stripeHeight);
   }
   ```

3. **Cantos Triangulares**
   ```javascript
   const cornerSize = 80;
   // Canto superior-esquerdo
   ctx.beginPath();
   ctx.moveTo(0, 0);
   ctx.lineTo(cornerSize, 0);
   ctx.lineTo(0, cornerSize);
   ctx.closePath();
   ctx.fill();
   // ... outros 3 cantos
   ```

4. **Linhas do Campo**
   - Borda externa
   - Linha central vertical
   - Círculo central (raio 60px)
   - Áreas de gol (grande e pequena)
   - Semicírculos nas áreas

5. **Gols**
   ```javascript
   ctx.fillStyle = '#ff000055';  // Vermelho semi-transparente (esquerda)
   ctx.fillRect(0, height/2 - goalHeight/2, goalWidth, goalHeight);
   ctx.fillStyle = '#0000ff55';  // Azul semi-transparente (direita)
   ctx.fillRect(width - goalWidth, height/2 - goalHeight/2, goalWidth, goalHeight);
   ```

**Renderização dos Jogadores:**
```javascript
for (const [id, player] of Object.entries(state.gameState.players)) {
    // Transparência se partida terminou
    ctx.globalAlpha = state.matchEnded ? 0.7 : 1.0;
    
    // Cor do time
    ctx.fillStyle = player.team;  // 'red' ou 'blue'
    
    // Círculo do jogador
    ctx.beginPath();
    ctx.arc(player.x, player.y, config.player.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Destaque para jogador local
    if (id === socket.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.arc(player.x, player.y, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
    }
}
```

**IDs dos Jogadores:**
```javascript
function updatePlayerIDs() {
    document.querySelectorAll('.player-id').forEach(el => el.remove());
    
    for (const [id, player] of Object.entries(state.gameState.players)) {
        const idElement = document.createElement('div');
        idElement.className = 'player-id';
        idElement.textContent = id.substring(0, 5);  // Primeiros 5 caracteres
        
        // Destaque para jogador local
        if (id === socket.id) {
            idElement.classList.add('my-player');  // Amarelo pulsante
        }
        
        // Posiciona acima do jogador (escala para canvas responsivo)
        const canvasRect = elements.canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / config.canvas.width;
        const scaleY = canvasRect.height / config.canvas.height;
        
        idElement.style.left = `${canvasRect.left + player.x * scaleX}px`;
        idElement.style.top = `${canvasRect.top + player.y * scaleY - 30}px`;
        
        document.body.appendChild(idElement);
    }
}
```

**Renderização da Bola:**
```javascript
if (ball.x >= -50 && ball.x <= width + 50) {  // Só renderiza se visível
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
}
```

#### 3.3.7 UI e Feedback

**Cronômetro:**
```javascript
function updateTimerDisplay() {
    const minutes = Math.floor(state.gameState.matchTime / 60);
    const seconds = state.gameState.matchTime % 60;
    elements.timerBottom.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

**Placar:**
```javascript
function updateScoreboard() {
    elements.scoreboard.textContent = 
        `Red: ${state.gameState.score.red} | Blue: ${state.gameState.score.blue}`;
}
```

**Vencedor:**
```javascript
function showWinner(winner) {
    elements.winnerDisplay.style.display = 'block';
    elements.winnerDisplay.style.opacity = '1';
    elements.winnerDisplay.textContent = 
        winner === 'draw' ? 'Empate!' : `Time ${winner.toUpperCase()} venceu!`;
}
```

**Info da Sala:**
```javascript
function updateRoomInfoDisplay() {
    const playersInRoom = Object.keys(state.gameState.players).length;
    const capacityText = state.roomCapacity ? ` (${playersInRoom}/${state.roomCapacity})` : '';
    elements.roomInfo.textContent = `Sala ${state.roomId}${capacityText}`;
}
```

---

## 4. Comunicação Cliente-Servidor

### 4.1 Fluxo de Eventos

**Conexão Inicial:**
```
Cliente                           Servidor
  |                                  |
  |-------- connect ---------------→ |
  |      (query: roomId)             |
  |                                  | allocateRoom()
  |                                  | balanceTeams()
  | ←------ roomAssigned ----------- |
  | ←------ init ------------------- |
  |      (team, gameState)           |
```

**Durante o Jogo:**
```
Cliente                           Servidor
  |                                  |
  |-------- input ----------------→ |
  |      60 FPS                      |
  |                                  | gameLoop()
  | ←------ update ----------------- |  60 FPS
  |      (gameState)                 |
  |                                  |
  | ←------ ping ------------------- |  1 Hz
  | ←------ timerUpdate ------------ |  1 Hz
```

**Evento de Gol:**
```
Cliente                           Servidor
  |                                  |
  |                                  | detecção de gol
  | ←------ goalScored ------------ |
  |      (team)                      |
  |                                  | setTimeout(500ms)
  | ←------ ballReset -------------- |
  |      (ball)                      |
```

**Fim de Partida e Reinício:**
```
Cliente                           Servidor
  |                                  |
  | ←------ matchEnd --------------- |
  |      (winner)                    |
  |                                  |
  | (clica "Jogar Novamente")        |
  |-------- requestRestart --------→ |
  |                                  | playersReady.add()
  | ←------ playerReadyUpdate ------ |
  |                                  | if (allReady)
  | ←------ cleanPreviousMatch ----- |
  | ←------ matchStart ------------- |
```

### 4.2 Sincronização de Estado

**Modelo Autoritativo do Servidor:**
- Servidor mantém estado verdadeiro
- Cliente renderiza estado recebido (sem predição)
- Evita discrepâncias e trapaças

**Frequência de Atualização:**
- Game loop: 60 FPS (16.67ms)
- Input do cliente: 60 FPS
- Timer: 1 Hz (1000ms)
- Ping: 1 Hz

**Dados Sincronizados:**
```javascript
// A cada frame (60 FPS)
{
    players: {
        [socketId]: { x, y, team, input }
    },
    ball: { x, y, radius, speedX, speedY },
    score: { red, blue },
    teams: { red: [ids], blue: [ids] },
    matchTime: number,
    isPlaying: boolean
}
```

### 4.3 Gerenciamento de Latência

**Medição de Ping:**
```javascript
// Servidor
socket.emit('ping', Date.now());

// Cliente
socket.on('ping', (serverTimestamp) => {
    const latencia = Date.now() - serverTimestamp;
    state.ping = latencia;
});
```

**Não Há Predição do Cliente:**
- Cliente apenas renderiza estado recebido
- Simplicidade: evita complexidade de reconciliação
- Trade-off: movimento pode parecer menos responsivo em alta latência

**Mitigação:**
- Taxa de atualização alta (60 FPS)
- Envio frequente de inputs
- Latência típica: < 100ms em boas conexões

---

## 5. Fluxo de Execução do Jogo

### 5.1 Inicialização do Sistema

**Servidor:**
```
1. game-server.js inicia
2. Cria servidor HTTP + Express
3. Configura Socket.IO
4. Serve arquivos estáticos de /public
5. Registra socketHandlers
6. Inicia game loop (60 FPS)
7. Inicia timer loop (1 Hz)
8. Escuta na porta 3000
```

**Cliente:**
```
1. Navegador carrega index.html
2. Carrega style.css
3. Carrega Socket.IO client
4. Executa game.js:
   a. initCanvas()
   b. initUI()
   c. setupControls()
   d. Conecta Socket.IO
   e. Registra event handlers
   f. Inicia loop de renderização
   g. Inicia envio de inputs
```

### 5.2 Ciclo de Vida de uma Partida

**1. Jogador Entra:**
```
Cliente                           Servidor
  |                                  |
  |-------- connect ---------------→ |
  |                                  | allocateRoom()
  |                                  | balanceTeams()
  |                                  | createPlayer()
  | ←------ init ------------------- |
  |                                  | checkRestartConditions()
  | ←------ matchStart (se pronto)-- |
```

**2. Jogo em Andamento:**
```
Loop (60 FPS):
  Cliente envia input
    ↓
  Servidor processa:
    - Move jogadores
    - Atualiza física da bola
    - Detecta colisões
    - Verifica gols
    ↓
  Servidor envia update
    ↓
  Cliente renderiza estado

Loop (1 Hz):
  Servidor decrementa timer
    ↓
  Envia timerUpdate
    ↓
  Cliente atualiza display
```

**3. Gol Marcado:**
```
1. gameLoop detecta bola no gol
2. Incrementa placar
3. Define ballResetInProgress = true
4. Emite goalScored
5. Clientes escondem bola
6. setTimeout(500ms):
   a. Reposiciona bola
   b. Define ballResetInProgress = false
   c. Emite ballReset
7. Clientes renderizam bola na nova posição
```

**4. Fim de Partida:**
```
1. Timer chega a 0
2. match.js:updateTimer():
   a. Define isPlaying = false
   b. Determina vencedor
   c. Move jogadores para fora
   d. Emite matchEnd
3. Clientes:
   a. Param de enviar inputs
   b. Mostram vencedor
   c. Mostram botão "Jogar Novamente"
4. Aguarda todos clicarem restart
```

**5. Reinício:**
```
1. Jogadores clicam "Jogar Novamente"
2. Clientes emitem requestRestart
3. Servidor:
   a. Adiciona a playersReady
   b. Emite playerReadyUpdate
   c. Se todos prontos:
      - Zera placar
      - Reseta timer
      - Reposiciona jogadores
      - Reseta bola
      - Emite cleanPreviousMatch
      - Emite matchStart
4. Nova partida começa
```

### 5.3 Gerenciamento de Salas

**Criação de Sala:**
```
Cenário A: Sem parâmetro room
  → Procura sala disponível
  → Se nenhuma encontrada, cria room-1
  → Jogador entra

Cenário B: Com parâmetro ?room=amigos
  → Sanitiza "amigos"
  → Procura sala "amigos"
  → Se não existe, cria
  → Se existe e não está cheia, entra
  → Se cheia, emite roomFull
```

**Balanceamento de Times:**
```
1. Novo jogador conecta
2. Conta jogadores em cada time
3. Atribui ao time com menos jogadores
4. Se diferença > 1:
   a. Move jogador do time maior
   b. Emite teamChanged
   c. Reposiciona jogador
```

**Limpeza de Salas:**
```
1. Jogador desconecta
2. Remove de players e team
3. checkRestartConditions()
4. cleanupRoomIfEmpty():
   → Se sala vazia, remove do Map
```

---

## 6. Principais Pontos do Código

### 6.1 Pontos Fortes

**1. Arquitetura Modular**
- Separação clara de responsabilidades
- Módulos independentes e testáveis
- Fácil manutenção e extensão

**2. Autoridade do Servidor**
- Toda lógica de jogo no servidor
- Previne trapaças
- Estado consistente entre clientes

**3. Sistema de Salas Robusto**
- Suporta múltiplas partidas simultâneas
- Balanceamento automático de times
- Salas customizadas via URL
- Limpeza automática de salas vazias

**4. Física Simples mas Eficaz**
- Colisões funcionais
- Atrito e amortecimento realistas
- Sistema de cantos único

**5. UI Responsiva**
- Adapta-se a diferentes tamanhos de tela
- Suporte mobile com joystick virtual
- Canvas escalável mantendo proporção

**6. Feedback em Tempo Real**
- Ping visível
- Cronômetro atualizado
- Eventos de gol instantâneos
- IDs dos jogadores sobre avatares

### 6.2 Decisões de Design Importantes

**1. Taxa de Atualização de 60 FPS**
- Movimento suave e responsivo
- Trade-off: maior uso de CPU e rede
- Adequado para jogos de ação

**2. Sem Predição do Cliente**
- Simplicidade de implementação
- Evita bugs de reconciliação
- Depende de baixa latência

**3. Sistema de Cooldown para Gols**
- Previne detecção múltipla
- 500ms de espera após gol
- Flag `ballResetInProgress`

**4. Balanceamento Automático**
- Mantém jogo justo
- Pode mover jogadores forçosamente
- Notifica com alert

**5. Reinício Consensual**
- Todos devem estar prontos
- Previne reinícios acidentais
- Sistema de contador visual

### 6.3 Possíveis Melhorias

**1. Predição do Cliente**
- Movimento mais responsivo
- Corrigir discrepâncias com reconciliação
- Complexidade adicional

**2. Interpolação**
- Suavizar movimento em latência alta
- Buffer de estados
- Melhor experiência visual

**3. Persistência**
- Salvar estatísticas de jogadores
- Histórico de partidas
- Sistema de ranking

**4. Autenticação**
- Login de usuários
- Nomes customizados
- Avatares personalizados

**5. Melhorias Visuais**
- Partículas em colisões
- Animações de gol
- Trilha da bola
- Sons e efeitos

**6. Otimização de Rede**
- Compressão de dados
- Delta encoding (enviar apenas mudanças)
- Rate limiting adaptativo

**7. Sistemas de Jogo Avançados**
- Power-ups
- Obstáculos dinâmicos
- Diferentes modos de jogo
- Torneios

**8. Observabilidade**
- Logs estruturados
- Métricas de performance
- Monitoramento de salas
- Analytics de jogadores

### 6.4 Fluxo de Dados Resumido

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTE (Navegador)                  │
├─────────────────────────────────────────────────────────┤
│  game.js                                                 │
│  ┌────────────┐    ┌──────────────┐   ┌──────────────┐ │
│  │  Inputs    │───→│  Socket.IO   │←──│   Eventos    │ │
│  │ (teclado/  │    │    Client    │   │  do Servidor │ │
│  │ joystick)  │    └──────┬───────┘   └──────────────┘ │
│  └────────────┘           │                             │
│                            │                             │
│  ┌────────────┐           │           ┌──────────────┐ │
│  │   Canvas   │←──────────┴──────────→│    State     │ │
│  │ Rendering  │                        │  Management  │ │
│  └────────────┘                        └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                             │
                             │ WebSocket
                             │
┌─────────────────────────────────────────────────────────┐
│                  SERVIDOR (Node.js)                      │
├─────────────────────────────────────────────────────────┤
│  game-server.js                                          │
│  ┌────────────────────┐                                 │
│  │   Socket.IO Server  │                                │
│  └──────────┬──────────┘                                │
│             │                                            │
│  ┌──────────▼──────────┐      ┌────────────────────┐   │
│  │  socketHandlers.js  │      │   roomManager.js   │   │
│  │  - connection       │◄────►│   - Gerencia salas │   │
│  │  - input            │      │   - Balanceamento  │   │
│  │  - disconnect       │      └────────────────────┘   │
│  └──────────┬──────────┘                                │
│             │                                            │
│  ┌──────────▼──────────┐                                │
│  │   Game Loop (60Hz)  │                                │
│  │  ┌───────────────┐  │      ┌────────────────────┐   │
│  │  │  gameLoop.js  │──┼─────►│     match.js       │   │
│  │  │  - Movimento  │  │      │  - Timer           │   │
│  │  │  - Colisões   │  │      │  - Reinício        │   │
│  │  │  - Física     │◄─┼──────│  - Balanceamento   │   │
│  │  └───────┬───────┘  │      └────────────────────┘   │
│  │          │           │                                │
│  │  ┌───────▼───────┐  │                                │
│  │  │    ball.js    │  │                                │
│  │  │  - Reset      │  │                                │
│  │  │  - Cantos     │  │                                │
│  │  └───────────────┘  │                                │
│  └─────────────────────┘                                │
│                                                           │
│  Timer Loop (1Hz)                                        │
│  └─ updateTimer() → timerUpdate evento                   │
└─────────────────────────────────────────────────────────┘
```

### 6.5 Padrões de Código Utilizados

**1. Module Pattern (CommonJS no servidor)**
```javascript
// Exportação
module.exports = { function1, function2 };

// Importação
const { function1 } = require('./module');
```

**2. Observer Pattern (Eventos Socket.IO)**
```javascript
// Servidor emite
io.to(roomId).emit('event', data);

// Cliente escuta
socket.on('event', (data) => { ... });
```

**3. State Management (Estado Centralizado)**
```javascript
// Estado global no cliente
const state = { ... };

// Estado por sala no servidor
const rooms = new Map();
```

**4. Singleton Pattern (Socket.IO)**
```javascript
// Uma única instância do socket
const socket = io(origin);
```

**5. Factory Pattern (Criação de Salas)**
```javascript
function createRoom(roomId) {
    return {
        id, width, height,
        players: {}, ball: {}, ...
    };
}
```

---

## Conclusão

Este projeto demonstra uma implementação funcional e bem estruturada de um jogo multiplayer em tempo real. A arquitetura modular facilita manutenção e extensão, enquanto o modelo cliente-servidor autoritativo garante integridade do jogo.

**Principais Características:**
- **Back-end**: Gerencia estado autoritativo, física, colisões e lógica de partida
- **Front-end**: Renderização, controles e feedback visual
- **Comunicação**: Socket.IO para sincronização em tempo real a 60 FPS
- **Escalabilidade**: Sistema de salas permite múltiplas partidas simultâneas

**Relacionamento Front-Back:**
- Cliente envia inputs → Servidor processa → Cliente renderiza estado
- Servidor é fonte única de verdade
- Cliente é "thin" (leve), sem lógica de jogo
- Sincronização unidirecional (servidor → cliente para estado)

O código é claro, comentado e segue boas práticas de desenvolvimento JavaScript moderno.
