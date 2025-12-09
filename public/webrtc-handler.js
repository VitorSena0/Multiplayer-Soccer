/**
 * WebRTC DataChannel handler for client-side
 * Establishes a WebRTC DataChannel connection for low-latency game state updates
 */

class WebRTCHandler {
    constructor(socket) {
        this.socket = socket;
        this.peerConnection = null;
        this.dataChannel = null;
        this.enabled = false;
        this.config = null;
        this.ready = false;
        this.onInputSend = null; // Callback for sending inputs
        this.onStateReceive = null; // Callback for receiving state updates
        
        this.setupSignaling();
    }

    setupSignaling() {
        // Listen for WebRTC configuration from server
        this.socket.on('webrtc:config', (data) => {
            if (data.enabled) {
                console.log('WebRTC DataChannels enabled by server');
                this.enabled = true;
                this.config = data.config;
                this.initializePeerConnection();
            } else {
                console.log('WebRTC DataChannels disabled - using Socket.IO only');
            }
        });

        // Handle offer received acknowledgment
        this.socket.on('webrtc:offer-received', (data) => {
            if (data.success) {
                console.log('Server received WebRTC offer');
            }
        });

        // Listen for WebRTC state updates (sent through Socket.IO as proxy for now)
        this.socket.on('webrtc:update', (update) => {
            if (this.onStateReceive) {
                this.onStateReceive(update);
            }
        });
    }

    initializePeerConnection() {
        try {
            // Create RTCPeerConnection
            this.peerConnection = new RTCPeerConnection(this.config);

            // Set up ICE candidate handler
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc:ice-candidate', {
                        candidate: event.candidate,
                    });
                }
            };

            // Set up connection state change handler
            this.peerConnection.onconnectionstatechange = () => {
                console.log('WebRTC connection state:', this.peerConnection.connectionState);
                
                if (this.peerConnection.connectionState === 'failed') {
                    console.warn('WebRTC connection failed, falling back to Socket.IO');
                    this.enabled = false;
                    this.ready = false;
                }
            };

            // Create data channel
            this.dataChannel = this.peerConnection.createDataChannel('gameData', {
                ordered: false, // Allow out-of-order delivery for lower latency
                maxRetransmits: 0, // No retransmissions for real-time data
            });

            this.setupDataChannel();
            this.createAndSendOffer();

        } catch (error) {
            console.error('Error initializing WebRTC:', error);
            this.enabled = false;
        }
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('WebRTC DataChannel opened');
            this.ready = true;
            this.socket.emit('webrtc:datachannel-ready');
        };

        this.dataChannel.onclose = () => {
            console.log('WebRTC DataChannel closed');
            this.ready = false;
        };

        this.dataChannel.onerror = (error) => {
            console.error('WebRTC DataChannel error:', error);
            this.ready = false;
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onStateReceive) {
                    this.onStateReceive(data);
                }
            } catch (error) {
                console.error('Error parsing WebRTC message:', error);
            }
        };
    }

    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('webrtc:offer', {
                offer: offer,
            });
        } catch (error) {
            console.error('Error creating WebRTC offer:', error);
            this.enabled = false;
        }
    }

    sendInput(input) {
        if (this.ready && this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                // Send through DataChannel for lower latency
                // Note: In this implementation, we're still using Socket.IO as a proxy
                // because true server-side DataChannel requires native Node.js support
                this.socket.emit('webrtc:input', input);
                return true;
            } catch (error) {
                console.error('Error sending input through DataChannel:', error);
                return false;
            }
        }
        return false;
    }

    isReady() {
        return this.enabled && this.ready;
    }

    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.ready = false;
    }
}

// Export for use in game.js
window.WebRTCHandler = WebRTCHandler;
