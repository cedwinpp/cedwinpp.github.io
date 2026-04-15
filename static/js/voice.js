// voice.js - Gemini Live Voice Integration (v3 - fix playback + timing)
class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.inputContext = null;   // 16 kHz — para el micrófono
        this.outputContext = null;  // 24 kHz — para reproducir respuestas de Gemini
        this.mediaStream = null;
        this.processor = null;
        this.isActive = false;
        this.isReady = false;
        this.modelSpeaking = false; // Rimi está hablando → pausar envío de mic
        this.nextPlayTime = 0;      // scheduling secuencial de chunks de audio

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
            // Contexto de ENTRADA: 16 kHz (micrófono → Gemini)
            this.inputContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            // Contexto de SALIDA: 24 kHz (Gemini → altavoz)
            this.outputContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });

            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,   // elimina el eco del altavoz
                    noiseSuppression: true,   // reduce ruido de fondo
                    autoGainControl: true,    // nivel de mic consistente
                    sampleRate: 16000
                }
            });

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/gemini`);

            this.ws.onopen = () => {
                this.isActive = true;
                this.isReady = false;
                btn.style.backgroundColor = '#ffc107'; // amarillo = conectando
                btn.classList.add('pulse-animation');

                // 1) Enviar configuración de Gemini
                this.ws.send(JSON.stringify({
                    setup: {
                        model: 'models/gemini-2.5-flash-native-audio-latest',
                        system_instruction: {
                            parts: [{ text: "Eres Rimi, un asistente de voz amable en la página personal del autor Ciro Edwin Portocarrero Pimentel. Da una bienvenida breve y cálida, invitando a explorar sus historias y su música. Sé conciso y usa un tono oral y cercano." }]
                        },
                        generation_config: {
                            response_modalities: ["AUDIO"],
                            speech_config: {
                                language_code: "es-PE",
                                voice_config: {
                                    prebuilt_voice_config: { voice_name: "Aoede" }
                                }
                            }
                        }
                    }
                }));

                // 2) Iniciar captura del micrófono
                const source = this.inputContext.createMediaStreamSource(this.mediaStream);
                // Buffer 2048 = menor latencia; mono (1 canal entrada, 1 salida)
                this.processor = this.inputContext.createScriptProcessor(2048, 1, 1);

                // GainNode en 0: el processor necesita estar conectado al destination
                // para que onaudioprocess se dispare, pero NO queremos oír el micrófono.
                const silentGain = this.inputContext.createGain();
                silentGain.gain.value = 0;

                source.connect(this.processor);
                this.processor.connect(silentGain);
                silentGain.connect(this.inputContext.destination);

                this.processor.onaudioprocess = (e) => {
                    if (!this.isActive || !this.isReady) return;
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                    // Pausar envío mientras Rimi habla (evita eco → error 1011)
                    if (this.modelSpeaking) return;

                    const inputData = e.inputBuffer.getChannelData(0);
                    // Float32 → PCM Int16 little-endian
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const clamped = Math.max(-1.0, Math.min(1.0, inputData[i]));
                        pcm16[i] = clamped < 0
                            ? Math.round(clamped * 32768)
                            : Math.round(clamped * 32767);
                    }

                    const bytes = new Uint8Array(pcm16.buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }

                    this.ws.send(JSON.stringify({
                        realtime_input: {
                            media_chunks: [{
                                mime_type: 'audio/pcm;rate=16000',
                                data: btoa(binary)
                            }]
                        }
                    }));
                };
            };

            this.ws.onmessage = async (event) => {
                try {
                    // Gemini puede enviar frames binarios → el browser los recibe como Blob
                    // Convertimos a string antes de JSON.parse
                    let rawData = event.data;
                    if (rawData instanceof Blob) {
                        console.log(`[Gemini→] Frame binario (Blob ${rawData.size} bytes) → convirtiendo a texto`);
                        rawData = await rawData.text();
                    }

                    const response = JSON.parse(rawData);

                    // Log de todos los mensajes para diagnóstico (sin datos de audio)
                    const logSafe = JSON.parse(JSON.stringify(response));
                    const sc = logSafe.serverContent || logSafe.server_content;
                    if (sc) {
                        const mt = sc.modelTurn || sc.model_turn;
                        if (mt && mt.parts) {
                            mt.parts.forEach(p => {
                                const id = p.inlineData || p.inline_data;
                                if (id) id.data = '[BASE64_AUDIO]';
                            });
                        }
                    }
                    console.log('[Gemini→]', JSON.stringify(logSafe).substring(0, 300));

                    // ── Setup completo ──────────────────────────────────────────
                    if (response.setupComplete || response.setup_complete) {
                        this.isReady = true;
                        btn.style.backgroundColor = '#28a745'; // verde = listo
                        console.log('✅ Rimi está listo para escuchar.');

                        // Saludo inicial SOLO tras recibir setup_complete
                        if (this.ws.readyState === WebSocket.OPEN) {
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
                        return;
                    }

                    // ── Respuesta de audio del modelo ───────────────────────────
                    const serverContent = response.serverContent || response.server_content;
                    if (serverContent) {
                        const modelTurn = serverContent.modelTurn || serverContent.model_turn;
                        if (modelTurn && modelTurn.parts) {
                            this.modelSpeaking = true; // Rimi empieza a hablar
                            modelTurn.parts.forEach(part => {
                                const inlineData = part.inlineData || part.inline_data;
                                if (inlineData && inlineData.data) {
                                    console.log(`🔊 Audio recibido: ${inlineData.data.length} bytes base64, mime: ${inlineData.mimeType || inlineData.mime_type}`);
                                    this.playAudioBase64(inlineData.data);
                                }
                            });
                        }

                        // Turno completo → Rimi terminó de hablar
                        if (serverContent.turnComplete || serverContent.turn_complete) {
                            console.log('🔄 Turno completo — Rimi terminó de hablar.');
                            // Esperar a que el último chunk termine antes de reactivar mic
                            const waitMs = Math.max(0, (this.nextPlayTime - this.outputContext.currentTime) * 1000);
                            setTimeout(() => {
                                this.modelSpeaking = false;
                                this.nextPlayTime = 0; // reset para próxima respuesta
                                console.log('🎤 Micrófono reactivado — escuchando...');
                            }, waitMs + 200); // +200ms de margen
                        }
                        return;
                    }

                    // ── Error del servidor proxy ────────────────────────────────
                    if (response.error) {
                        console.error('❌ Error del servidor:', response.error);
                        alert(response.error);
                        this.stopVoice();
                    }

                } catch (e) {
                    console.warn('[Gemini→] Mensaje no-JSON o parse error:', e.message, event.data?.substring?.(0, 100));
                }
            };

            this.ws.onclose = (event) => {
                console.warn(`[VoiceAssistant] WebSocket cerrado. Código: ${event.code}, Razón: "${event.reason || 'ninguna'}"`);
                if (event.code === 1007) {
                    console.error('❌ ERROR 1007: formato de audio inválido.');
                } else if (event.code === 1011) {
                    console.error('❌ ERROR 1011: error interno en Gemini. Revisa el setup JSON.');
                }
                this.stopVoice();
            };

            this.ws.onerror = (err) => {
                console.error('[VoiceAssistant] WebSocket error:', err);
            };

        } catch (error) {
            console.error('Error al iniciar voz:', error);
            alert('No se pudo acceder al micrófono: ' + error.message);
            this.stopVoice();
        }
    }

    // Reproduce chunks de audio PCM-16 en secuencia (sin solapamiento)
    playAudioBase64(base64) {
        if (!this.isActive || !this.outputContext) return;
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const pcm16 = new Int16Array(bytes.buffer);
            const audioBuffer = this.outputContext.createBuffer(1, pcm16.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
            }

            const source = this.outputContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputContext.destination);

            // ── Scheduling secuencial ──────────────────────────────────────
            // Cada chunk empieza justo cuando termina el anterior,
            // evitando que todos se reproduzcan al mismo tiempo.
            const now = this.outputContext.currentTime;
            if (this.nextPlayTime < now) {
                this.nextPlayTime = now; // resync si hay silencio
            }
            source.start(this.nextPlayTime);
            this.nextPlayTime += audioBuffer.duration; // avanzar el cursor
            // ──────────────────────────────────────────────────────────────

        } catch (e) {
            console.error('[playAudioBase64] Error reproduciendo audio:', e);
        }
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
        if (this.inputContext) {
            this.inputContext.close();
            this.inputContext = null;
        }
        if (this.outputContext) {
            this.outputContext.close();
            this.outputContext = null;
        }

        const btn = document.getElementById('voice-assistant-btn');
        if (btn) {
            btn.style.backgroundColor = '#0056b3';
            btn.classList.remove('pulse-animation');
        }
    }
}

// Animación del botón
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0%   { transform: scale(1);   box-shadow: 0 0 0 0   rgba(40, 167, 69, 0.7); }
        70%  { transform: scale(1.1); box-shadow: 0 0 0 15px rgba(40, 167, 69, 0);   }
        100% { transform: scale(1);   box-shadow: 0 0 0 0   rgba(40, 167, 69, 0);   }
    }
    .pulse-animation { animation: pulse 1.5s infinite; }
`;
document.head.appendChild(style);

window.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});
