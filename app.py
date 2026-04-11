from flask import Flask, render_template, abort
import os

# Configuración: los recursos (css, imgs) están en 'static' pero se sirven como si estuvieran en '/'
app = Flask(__name__, static_folder='static', static_url_path='/')

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/<path:page>')
def render_page(page):
    # Permitir navegación mediante nombres directos (ej. libros.html)
    if page.endswith('.html'):
        templates_dir = os.path.join(app.root_path, 'templates')
        # Verificar si el archivo HTML realmente existe en la carpeta templates
        if os.path.exists(os.path.join(templates_dir, page)):
            return render_template(page)
    
    # Si la página no se encuentra o no termina en .html
    abort(404)

if __name__ == '__main__':
    # Railway y otros PAAS proveen el puerto en la variable de entorno 'PORT'
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
