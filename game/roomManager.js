const { BALL_RADIUS, MATCH_DURATION, MAX_PLAYERS_PER_ROOM } = require('./constants');

const rooms = new Map();
let roomSequence = 1;

const defaultBallState = () => ({
    x: 400,
    y: 300,
    radius: BALL_RADIUS,
    speedX: 0,
    speedY: 0,
});

function sanitizeRoomId(roomId) {
    if (typeof roomId !== 'string') return null;
    const trimmed = roomId.trim().toLowerCase();
    if (!trimmed) return null;
    const normalized = trimmed
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 32);
    return normalized || null;
}

function generateRoomId() {
    let candidate;
    do {
        candidate = `room-${roomSequence++}`;
    } while (rooms.has(candidate));
    return candidate;
}

function createRoom(roomId = generateRoomId()) {
    const id = rooms.has(roomId) ? generateRoomId() : roomId;
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
        nextBallPosition: null,
        ballResetInProgress: false,
        lastGoalTime: 0,
        goalCooldown: 500,
        waitingForRestart: false,
        playersReady: new Set(),
    };
    rooms.set(id, roomState);
    console.log(`Sala criada: ${id}`);
    return roomState;
}

function getPlayerCount(room) {
    return Object.keys(room.players).length;
}

function getOrCreateAvailableRoom() {
    for (const room of rooms.values()) {
        if (getPlayerCount(room) < MAX_PLAYERS_PER_ROOM) {
            return room;
        }
    }
    return createRoom();
}

function allocateRoom(requestedRoomId) {
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