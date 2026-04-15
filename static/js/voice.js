// voice.js - Gemini Live Voice Integration
class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.isActive = false;
        this.isReady = false;
        
        this.initUI();
    }

    initUI() {
        const btn = document.createElement('button');
        btn.innerHTML = '🎙️';
        btn.id = 'voice-assistant-btn';
        btn.title = 'Hablar con Asistente';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#0056b3',
            color: 'white',
            border: 'none',
            fontSize: '24px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            zIndex: '1000',
            transition: 'all 0.3s ease'
        });

        btn.onclick = () => this.toggleVoice();
        document.body.appendChild(btn);
    }

    async toggleVoice() {
        if (this.isActive) {
            this.stopVoice();
        } else {
            await this.startVoice();
        }
    }

    async startVoice() {
        const btn = document.getElementById('voice-assistant-btn');
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/gemini`);

            this.ws.onopen = () => {
                this.isActive = true;
                this.isReady = false; // Reset al conectar
                btn.style.backgroundColor = '#28a745'; // verde activo
                btn.classList.add('pulse-animation');
                
                // Configurar Gemini
                this.ws.send(JSON.stringify({
                    setup: {
                        model: 'models/gemini-2.5-flash-native-audio-latest',
                        system_instruction: {
                            parts: [{text: "Eres un asistente de voz amable en la página personal del autor Ciro Edwin Portocarrero Pimentel. Tu objetivo es dar una bienvenida muy breve y amigable. Responde siempre de forma corta, oral, y con tono cálido invitando a explorar sus historias y su música. Ocasionalmente menciona tu nombre, Rimi."}]
                        },
                        generation_config: {
                            response_modalities: ["AUDIO"],
                            speech_config: { voice_config: { prebuilt_voice_config: { voice_name: "Aoede" } } }
                        }
                    }
                }));

                // Forzamos a que el modelo inicie la charla al conectarse
                setTimeout(() => {
                    if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            client_content: {
                                turns: [{
                                    role: "user",
                                    parts: [{ text: "Hola Rimi, acabo de entrar a la página." }]
                                }],
                                turn_complete: true
                            }
                        }));
                    }
                }, 500);

                const source = this.audioContext.createMediaStreamSource(this.mediaStream);
                // Buffer 2048 = menor latencia; mono (1 canal entrada, 1 salida)
                this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
                
                source.connect(this.processor);
                this.processor.connect(this.audioContext.destination);

                this.processor.onaudioprocess = (e) => {
                    if (!this.isActive || !this.isReady) return;
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                    const inputData = e.inputBuffer.getChannelData(0);
                    // Conversión Float32 → Int16 (PCM 16-bit little-endian)
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        // Clampear entre -1 y 1 antes de escalar
                        const clamped = Math.max(-1.0, Math.min(1.0, inputData[i]));
                        pcm16[i] = clamped < 0
                            ? Math.round(clamped * 32768)
                            : Math.round(clamped * 32767);
                    }
                    
                    // Convertir el buffer Int16 a base64
                    const bytes = new Uint8Array(pcm16.buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    const base64Audio = btoa(binary);

                    // Estructura exacta que espera la API Gemini BidiGenerateContent
                    this.ws.send(JSON.stringify({
                        realtime_input: {
                            media_chunks: [{
                                mime_type: 'audio/pcm;rate=16000',
                                data: base64Audio
                            }]
                        }
                    }));
                };
            };

            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    
                    if (response.setup_complete) {
                        this.isReady = true;
                        console.log("Rimi está listo para escuchar.");
                    }

                    if (response.server_content && response.server_content.model_turn) {
                        const parts = response.server_content.model_turn.parts;
                        parts.forEach(part => {
                            if (part.inline_data && part.inline_data.data) {
                                this.playAudioBase64(part.inline_data.data);
                            }
                        });
                    } else if (response.error) {
                        console.error("Error del servidor:", response.error);
                        alert(response.error);
                        this.stopVoice();
                    }
                } catch(e) { /* Ignorar mensajes mal formados */ }
            };
            
            this.ws.onclose = (event) => {
                console.warn(`[VoiceAssistant] WebSocket cerrado. Código: ${event.code}, Razón: "${event.reason || 'ninguna'}"`);
                // 1007 = Invalid frame payload data (error de formato de audio)
                if (event.code === 1007) {
                    console.error('[VoiceAssistant] ERROR 1007: el servidor rechazó el audio. Revisa la codificación PCM.');
                }
                this.stopVoice();
            };
            this.ws.onerror = (err) => {
                console.error('[VoiceAssistant] WebSocket error:', err);
            };

        } catch (error) {
            console.error("Error al iniciar voz:", error);
            alert("No se pudo acceder al micrófono.");
            this.stopVoice();
        }
    }

    playAudioBase64(base64) {
        if (!this.isActive || !this.audioContext) return;
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const pcm16 = new Int16Array(bytes.buffer);
        const audioBuffer = this.audioContext.createBuffer(1, pcm16.length, 24000); 
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < pcm16.length; i++) {
            channelData[i] = pcm16[i] / 32768.0;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        source.start(0);
    }

    stopVoice() {
        this.isActive = false;
        this.isReady = false;
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        const btn = document.getElementById('voice-assistant-btn');
        if (btn) {
            btn.style.backgroundColor = '#0056b3';
            btn.classList.remove('pulse-animation');
        }
    }
}

// Botón animado
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 15px rgba(40, 167, 69, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
    }
    .pulse-animation {
        animation: pulse 1.5s infinite;
    }
`;
document.head.appendChild(style);

window.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});
