from flask import Flask, render_template, abort
from flask_sock import Sock
import os
import threading

# Configuración: los recursos (css, imgs) están en 'static' pero se sirven como si estuvieran en '/'
app = Flask(__name__, static_folder='static', static_url_path='/')
sock = Sock(app)

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# Función auxiliar para recibir desde Gemini en un hilo
def receive_from_gemini(ws, gemini_ws):
    try:
        for message in gemini_ws:
            # Gemini envía JSON como frames BINARIOS (bytes), no como texto.
            # flask_sock necesita strings → decodificamos a UTF-8 antes de reenviar.
            if isinstance(message, bytes):
                print(f"[Gemini→Browser] Frame binario ({len(message)} bytes) → decodificando a texto")
                try:
                    message = message.decode('utf-8')
                except UnicodeDecodeError:
                    # Si no es UTF-8 puro, lo enviamos tal cual (datos binarios raros)
                    print(f"[Gemini→Browser] No es UTF-8, reenviando como bytes")
            else:
                print(f"[Gemini→Browser] Frame texto: {len(message)} chars")
            ws.send(message)
    except Exception as e:
        error_msg = f"La conexión con Gemini se cerró: {str(e)}"
        print(f"[ERROR receive_from_gemini] {error_msg}")
        try:
            ws.send(f'{{"error": "{error_msg}"}}')
        except:
            pass

@sock.route('/ws/gemini')
def gemini_ws_proxy(ws):
    if not GEMINI_API_KEY:
        ws.send('{"error": "API Key no configurada en el servidor"}')
        return

    import websockets.sync.client
    ws_url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"
    
    try:
        # Aumentar timeout para conexiones de larga duración (voz)
        with websockets.sync.client.connect(
            ws_url,
            additional_headers={"Content-Type": "application/json"},
            open_timeout=30
        ) as gemini_ws:
            # Iniciar hilo que lee de Gemini y envía al cliente (Navegador)
            t = threading.Thread(target=receive_from_gemini, args=(ws, gemini_ws), daemon=True)
            t.start()

            # Bucle principal: Leer del cliente (Navegador) y mandar a Gemini
            while True:
                data = ws.receive()
                if data is None:
                    print("[Browser→Gemini] Cliente desconectado.")
                    break
                # Solo reenviamos texto (JSON) - el audio viene ya como base64 en JSON
                if isinstance(data, str):
                    gemini_ws.send(data)
                else:
                    # Si llegara binario del browser, también lo pasamos
                    gemini_ws.send(data)
    except Exception as e:
        import traceback
        error_msg = f"Error en conexión: {str(e)}"
        print(f"[ERROR proxy] {error_msg}")
        print(traceback.format_exc())
        try:
            ws.send(f'{{"error": "{error_msg}"}}')
        except:
            pass


@app.route('/')
def home():
    return render_template('index.html')

@app.route('/debug_models')
def debug_models():
    import urllib.request
    import json
    if not GEMINI_API_KEY:
        return {"error": "API Key no configurada"}
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        return {"error": str(e)}


# ── Rutas explícitas para cada página HTML ──────────────────────────────────
# IMPORTANTE: Con static_url_path='/', el manejador estático de Flask
# intercepta /<path> antes que nuestra ruta genérica ← ese era el bug 404.
# Las rutas explícitas sin wildcard siempre tienen máxima prioridad en Flask.

@app.route('/libros.html')
def page_libros():
    return render_template('libros.html')

@app.route('/blog.html')
def page_blog():
    return render_template('blog.html')

@app.route('/galeria.html')
def page_galeria():
    return render_template('galeria.html')

@app.route('/contacto.html')
def page_contacto():
    return render_template('contacto.html')

@app.route('/post-ejemplo.html')
def page_post_ejemplo():
    return render_template('post-ejemplo.html')

# Ruta genérica de fallback (por si se añaden más páginas)
@app.route('/<path:page>')
def render_page(page):
    if page.endswith('.html'):
        templates_dir = os.path.join(app.root_path, 'templates')
        if os.path.exists(os.path.join(templates_dir, page)):
            return render_template(page)
    abort(404)


if __name__ == '__main__':
    # Railway y otros PAAS proveen el puerto en la variable de entorno 'PORT'
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
