const { ENABLE_WEBRTC, WEBRTC_TICK_RATE } = require('./webrtc-config');
const { getWebRTCReadySockets } = require('./webrtcSignaling');
const { buildGameState } = require('./roomManager');

/**
 * WebRTC game loop that sends state updates at a reduced tick rate via Socket.IO
 * This simulates sending data through DataChannel (actual DataChannel communication
 * would be handled on the client side using native WebRTC APIs)
 * 
 * @param {Object} room - Room object
 * @param {Object} io - Socket.IO server instance
 */
function webrtcGameLoop(room, io) {
    if (!ENABLE_WEBRTC || !room.isPlaying) {
        return;
    }

    // Get players with active WebRTC DataChannels
    const webrtcSockets = getWebRTCReadySockets(room.id);
    
    if (webrtcSockets.length === 0) {
        return;
    }

    // Build a lightweight state update for WebRTC clients
    const webrtcUpdate = {
        players: room.players,
        ball: room.ball,
        score: room.score,
        matchTime: room.matchTime,
        isPlaying: room.isPlaying,
    };

    // Send to WebRTC-ready clients through Socket.IO
    // In a real implementation with native DataChannels on the server,
    // this would be sent through the DataChannel connection
    webrtcSockets.forEach((socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.emit('webrtc:update', webrtcUpdate);
        }
    });
}

/**
 * Start the WebRTC game loop for all rooms
 * @param {Map} rooms - Map of all rooms
 * @param {Object} io - Socket.IO server instance
 */
function startWebRTCGameLoop(rooms, io) {
    if (!ENABLE_WEBRTC) {
        console.log('WebRTC is disabled. Using Socket.IO only.');
        return null;
    }

    console.log(`Starting WebRTC game loop at ${WEBRTC_TICK_RATE} FPS`);
    
    const interval = setInterval(() => {
        rooms.forEach((room) => webrtcGameLoop(room, io));
    }, 1000 / WEBRTC_TICK_RATE);

    return interval;
}

module.exports = {
    webrtcGameLoop,
    startWebRTCGameLoop,
};
