const { BALL_RADIUS, MATCH_DURATION, MAX_PLAYERS_PER_ROOM } = require('./constants');

const rooms = new Map(); // Mapa que armazena as salas de jogo, onde a chave é o ID da sala e o valor é o estado da sala
let roomSequence = 1;


// Função que retorna o estado inicial padrão da bola em uma sala
const defaultBallState = () => ({
    x: 400,
    y: 300,
    radius: BALL_RADIUS,
    speedX: 0,
    speedY: 0,
});

// Função que sanitiza o ID da sala para garantir que esteja em um formato válido, ex: "room-1"
function sanitizeRoomId(roomId) {
    if (typeof roomId !== 'string') return null;
    const trimmed = roomId.trim().toLowerCase(); // Remove espaços em branco e converte para minúsculas
    if (!trimmed) return null;
    const normalized = trimmed
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 32); // Limita o comprimento a 32 caracteres
    return normalized || null; // Retorna null se o ID resultante for uma string vazia
}


// Função que gera um ID único para uma nova sala
function generateRoomId() {
    let candidate; // Variável para armazenar o ID candidato
    do {
        candidate = `room-${roomSequence++}`; // Gera um ID no formato "room-<número sequencial>"
    } while (rooms.has(candidate)); // Verifica se o ID já existe; se existir, gera outro
    return candidate;
}

function createRoom(roomId = generateRoomId()) {
    const id = rooms.has(roomId) ? generateRoomId() : roomId; // Se o ID fornecido já existir, gera um novo ID
    const roomState = {
        id,
        width: 800,
        height: 600,
        players: {},
        ball: defaultBallState(),
        score: { red: 0, blue: 0 },
        teams: { red: [], blue: [] },
        matchTime: MATCH_DURATION,
        isPlaying: false,
        isResettingBall: false,
        nextBallPosition: null, // Posição para onde a bola será movida após o reset
        ballResetInProgress: false, // Indica se o reset da bola está em andamento
        lastGoalTime: 0, // Timestamp do último gol marcado
        goalCooldown: 500,
        waitingForRestart: false,
        playersReady: new Set(), // Conjunto para rastrear jogadores prontos para reiniciar o jogo
    };
    rooms.set(id, roomState);
    console.log(`Sala criada: ${id}`);
    return roomState;
}

// Função que retorna o número de jogadores em uma sala
function getPlayerCount(room) {
    return Object.keys(room.players).length;
}

// Função que retorna uma sala disponível ou cria uma nova se todas estiverem cheias
function getOrCreateAvailableRoom() {
    for (const room of rooms.values()) {
        if (getPlayerCount(room) < MAX_PLAYERS_PER_ROOM) {
            return room;
        }
    }
    return createRoom();
}


// Função que aloca uma sala com base no ID solicitado ou cria uma nova se necessário
function allocateRoom(requestedRoomId) { // requestedRoomId é do tipo string ou undefined
    if (requestedRoomId) {
        const sanitized = sanitizeRoomId(requestedRoomId);
        if (!sanitized) {
            return { room: getOrCreateAvailableRoom() };
        }
        const room = rooms.get(sanitized) || createRoom(sanitized);
        if (getPlayerCount(room) < MAX_PLAYERS_PER_ROOM) {
            return { room };
        }
        return { error: 'room-full', roomId: sanitized };
    }

    return { room: getOrCreateAvailableRoom() };
}

// Função que constrói o estado do jogo a ser enviado aos clientes
function buildGameState(room) {
    return {
        width: room.width,
        height: room.height,
        players: room.players,
        ball: room.ball,
        score: room.score,
        teams: room.teams,
        matchTime: room.matchTime,
        isPlaying: room.isPlaying,
        roomId: room.id,
    };
}

// Função que remove a sala se estiver vazia
function cleanupRoomIfEmpty(room) {
    if (room && getPlayerCount(room) === 0) {
        rooms.delete(room.id);
        console.log(`Sala removida: ${room.id}`);
    }
}

module.exports = {
    rooms,
    allocateRoom,
    createRoom,
    getPlayerCount,
    getOrCreateAvailableRoom,
    buildGameState,
    cleanupRoomIfEmpty,
};