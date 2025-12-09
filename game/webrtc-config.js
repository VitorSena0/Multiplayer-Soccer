// WebRTC configuration and feature flag
const ENABLE_WEBRTC = process.env.ENABLE_WEBRTC === 'true';

// Reduced tick rate for WebRTC state updates (30 FPS instead of 60 FPS)
const WEBRTC_TICK_RATE = 30; // Hz

// WebRTC configuration for ICE servers
const RTC_CONFIGURATION = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

module.exports = {
    ENABLE_WEBRTC,
    WEBRTC_TICK_RATE,
    RTC_CONFIGURATION,
};
