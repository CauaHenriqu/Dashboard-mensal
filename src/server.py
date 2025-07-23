import http.server
import socketserver
import webbrowser
import os

PORT = 5500

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(os.path.dirname(__file__), '..'), **kwargs)

def run_server():
    port = PORT
    while True:
        try:
            with socketserver.TCPServer(("", port), Handler) as httpd:
                print("====================================================")
                print(f"Servidor rodando!")
                print(f"Para acessar nesta máquina: http://localhost:{port}")
                print(f"Para acessar em outra máquina na mesma rede: http://<SEU_IP_LOCAL>:{port}")
                print("====================================================")
                webbrowser.open_new_tab(f"http://localhost:{port}")
                httpd.serve_forever()
        except OSError:
            print(f"Porta {port} já está em uso. Tentando a próxima...")
            port += 1

if __name__ == "__main__":
    run_server()