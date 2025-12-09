const { ENABLE_WEBRTC, RTC_CONFIGURATION } = require('./webrtc-config');

// Store WebRTC connection state per socket
const webrtcConnections = new Map();

/**
 * Initialize WebRTC signaling handlers for a socket
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socket - Socket instance
 * @param {Object} room - Room object
 */
function initializeWebRTCSignaling(io, socket, room) {
    if (!ENABLE_WEBRTC) {
        return;
    }

    // Send RTC configuration to client
    socket.emit('webrtc:config', {
        enabled: true,
        config: RTC_CONFIGURATION,
    });

    // Handle WebRTC offer from client
    socket.on('webrtc:offer', (data) => {
        const { offer } = data;
        
        // In a server-to-client WebRTC setup, the server would create an answer
        // For now, we'll implement a relay signaling pattern
        // The client creates the offer, and we acknowledge it
        socket.emit('webrtc:offer-received', { success: true });
        
        // Store that this client is attempting WebRTC
        webrtcConnections.set(socket.id, {
            roomId: room.id,
            ready: false,
            offer: offer,
        });
    });

    // Handle WebRTC answer from client (if server sends offer)
    socket.on('webrtc:answer', (data) => {
        const { answer } = data;
        const connection = webrtcConnections.get(socket.id);
        
        if (connection) {
            connection.answer = answer;
            socket.emit('webrtc:answer-received', { success: true });
        }
    });

    // Handle ICE candidates from client
    socket.on('webrtc:ice-candidate', (data) => {
        const { candidate } = data;
        const connection = webrtcConnections.get(socket.id);
        
        if (connection) {
            if (!connection.iceCandidates) {
                connection.iceCandidates = [];
            }
            connection.iceCandidates.push(candidate);
        }
    });

    // Handle DataChannel ready signal from client
    socket.on('webrtc:datachannel-ready', () => {
        const connection = webrtcConnections.get(socket.id);
        if (connection) {
            connection.ready = true;
            console.log(`WebRTC DataChannel ready for player ${socket.id} in room ${room.id}`);
        }
    });

    // Handle input from DataChannel (forwarded through Socket.IO as fallback mechanism)
    socket.on('webrtc:input', (input) => {
        if (room.players[socket.id] && room.isPlaying) {
            room.players[socket.id].input = input;
        }
    });
}

/**
 * Check if a socket has an active WebRTC DataChannel
 * @param {string} socketId - Socket ID
 * @returns {boolean}
 */
function hasActiveDataChannel(socketId) {
    const connection = webrtcConnections.get(socketId);
    return connection && connection.ready;
}

/**
 * Get all sockets in a room with active DataChannels
 * @param {string} roomId - Room ID
 * @returns {string[]} Array of socket IDs
 */
function getWebRTCReadySockets(roomId) {
    const readySockets = [];
    for (const [socketId, connection] of webrtcConnections.entries()) {
        if (connection.roomId === roomId && connection.ready) {
            readySockets.push(socketId);
        }
    }
    return readySockets;
}

/**
 * Clean up WebRTC connections for a room
 * @param {string} roomId - Room ID
 */
function cleanupRoomWebRTC(roomId) {
    for (const [socketId, connection] of webrtcConnections.entries()) {
        if (connection.roomId === roomId) {
            webrtcConnections.delete(socketId);
        }
    }
}

module.exports = {
    initializeWebRTCSignaling,
    hasActiveDataChannel,
    getWebRTCReadySockets,
    cleanupRoomWebRTC,
    webrtcConnections,
};
