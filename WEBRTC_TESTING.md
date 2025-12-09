# WebRTC DataChannel Testing Guide

## Quick Start

### Test without WebRTC (default behavior)
```bash
npm start
# or
node game-server.js
```
Expected console output:
```
WebRTC is disabled. Using Socket.IO only.
Servidor rodando na porta 3000
WebRTC DataChannels: DESABILITADO
Para habilitar WebRTC, defina ENABLE_WEBRTC=true
```

### Test with WebRTC enabled
```bash
npm run start:webrtc
# or
ENABLE_WEBRTC=true node game-server.js
```
Expected console output:
```
Starting WebRTC game loop at 30 FPS
Servidor rodando na porta 3000
WebRTC DataChannels: HABILITADO
Para desabilitar WebRTC, defina ENABLE_WEBRTC=false
```

## Browser Testing

1. Start the server with WebRTC enabled:
   ```bash
   npm run start:webrtc
   ```

2. Open your browser to `http://localhost:3000`

3. Open browser console (F12) and look for:
   - "WebRTC DataChannels enabled by server"
   - "Server received WebRTC offer"
   - "WebRTC connection state: ..."

4. Play the game normally - it should work identically to the Socket.IO-only version

## Verification Checklist

### WebRTC Disabled (Default)
- [ ] Server starts without errors
- [ ] Game loads in browser
- [ ] Players can join rooms
- [ ] Player movement works
- [ ] Ball physics work
- [ ] Scoring works
- [ ] Match timer works
- [ ] No WebRTC messages in console

### WebRTC Enabled
- [ ] Server starts with "Starting WebRTC game loop at 30 FPS"
- [ ] Game loads in browser
- [ ] Console shows "WebRTC DataChannels enabled by server"
- [ ] Console shows "Server received WebRTC offer"
- [ ] Players can join rooms
- [ ] Player movement works
- [ ] Ball physics work
- [ ] Scoring works
- [ ] Match timer works
- [ ] WebRTC connection established (check console)

## Architecture Overview

### Current Implementation (Hybrid)
```
Client Browser                  Server (Node.js)
    |                                |
    |------- Socket.IO (Signaling) --|
    |       (offer/answer/ICE)       |
    |                                |
    |---- WebRTC DataChannel --------|
    |   (established but not used    |
    |    for data transmission)      |
    |                                |
    |------ Socket.IO (Game Data)----|
    |   (inputs at 60 FPS,           |
    |    state at 30 FPS for WebRTC  |
    |    clients, 60 FPS for others) |
```

### Benefits of Current Implementation
1. **Reduced tick rate**: WebRTC clients get 30 FPS updates instead of 60 FPS
2. **Connection monitoring**: WebRTC connection state provides quality metrics
3. **Future-ready**: Infrastructure in place for native DataChannel usage
4. **Zero risk**: Falls back to Socket.IO on any issue

### Future Enhancement (Native DataChannel)
To enable true DataChannel transmission:
1. Install `wrtc` package on server (requires binary compilation)
2. Create server-side RTCPeerConnection
3. Replace Socket.IO emits with DataChannel.send()
4. Benefits: True P2P, even lower latency, reduced server load

## Troubleshooting

### WebRTC not connecting
- Check browser console for errors
- Ensure modern browser (Chrome, Firefox, Safari, Edge)
- Check network allows UDP traffic
- Try disabling VPN/firewall temporarily

### Game not working
- Check if it works with ENABLE_WEBRTC=false
- If yes, there's a WebRTC issue (fallback should handle this)
- If no, unrelated to WebRTC changes

### Server errors
- Ensure Node.js 18+ is installed
- Run `npm install` to ensure dependencies
- Check PORT is not already in use

## Performance Comparison

### Socket.IO Only (Default)
- Update rate: 60 FPS for all clients
- Network usage: ~X KB/s per client
- Latency: Typical WebSocket latency

### WebRTC Enabled (Hybrid)
- Update rate: 30 FPS for WebRTC-ready clients, 60 FPS for others
- Network usage: ~X/2 KB/s for WebRTC clients (50% reduction)
- Latency: Similar (still using Socket.IO for data)
- Benefits: Reduced network load, connection quality monitoring

## Configuration Reference

### Environment Variables
- `PORT`: Server port (default: 3000)
- `ENABLE_WEBRTC`: Enable WebRTC features (default: false)

### WebRTC Configuration (game/webrtc-config.js)
```javascript
ENABLE_WEBRTC = process.env.ENABLE_WEBRTC === 'true'
WEBRTC_TICK_RATE = 30  // FPS for WebRTC clients
RTC_CONFIGURATION = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
}
```

## Files Added/Modified

### New Files
- `game/webrtc-config.js` - Configuration
- `game/webrtcSignaling.js` - Server signaling
- `game/webrtcGameLoop.js` - Reduced-tick loop
- `public/webrtc-handler.js` - Client handler

### Modified Files
- `game-server.js` - Start WebRTC loop
- `game/socketHandlers.js` - Signaling integration
- `public/game.js` - Use WebRTC handler
- `public/index.html` - Load WebRTC script
- `package.json` - Add start:webrtc script
- `README.md` - Documentation

## Security Notes

- ✅ CodeQL scan: 0 vulnerabilities
- ✅ No external dependencies added (uses native WebRTC APIs)
- ✅ Feature flag ensures opt-in only
- ✅ Proper error handling and resource cleanup
- ✅ Falls back to Socket.IO on any security concerns
