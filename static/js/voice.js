// voice.js - Gemini Live Voice Integration
class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.isActive = false;
        
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
                btn.style.backgroundColor = '#28a745'; // verde activo
                btn.classList.add('pulse-animation');
                
                // Configurar Gemini
                this.ws.send(JSON.stringify({
                    setup: {
                        model: 'models/gemini-2.0-flash-exp',
                        systemInstruction: {
                            parts: [{text: "Eres un asistente de voz amable en la página personal del autor Ciro Edwin Portocarrero Pimentel. Tu objetivo es dar una bienvenida muy breve y amigable. Responde siempre de forma corta, oral, y con tono cálido invitando a explorar sus historias y su música. Ocasionalmente menciona tu nombre, Rimi."}]
                        },
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
                        }
                    }
                }));

                // Forzamos a que el modelo inicie la charla al conectarse
                setTimeout(() => {
                    if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            clientContent: {
                                turns: [{
                                    role: "user",
                                    parts: [{ text: "Hola Rimi, acabo de entrar a la página." }]
                                }],
                                turnComplete: true
                            }
                        }));
                    }
                }, 500);

                const source = this.audioContext.createMediaStreamSource(this.mediaStream);
                this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
                
                source.connect(this.processor);
                this.processor.connect(this.audioContext.destination);

                this.processor.onaudioprocess = (e) => {
                    if (!this.isActive) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        let s = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    
                    const bytes = new Uint8Array(pcm16.buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    
                    this.ws.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: btoa(binary)
                            }]
                        }
                    }));
                };
            };

            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.serverContent && response.serverContent.modelTurn) {
                        const parts = response.serverContent.modelTurn.parts;
                        parts.forEach(part => {
                            if (part.inlineData && part.inlineData.data) {
                                this.playAudioBase64(part.inlineData.data);
                            }
                        });
                    } else if (response.error) {
                        console.error("Error del servidor:", response.error);
                        alert(response.error);
                        this.stopVoice();
                    }
                } catch(e) { /* Ignorar mensajes mal formados */ }
            };
            
            this.ws.onclose = () => this.stopVoice();

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
