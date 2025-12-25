"""
Script de desarrollo con auto-reload mejorado
Reinicia el servidor cuando detecta cambios en archivos .py
"""
import os
import sys
import time
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class CodeChangeHandler(FileSystemEventHandler):
    def __init__(self):
        self.process = None
        self.last_restart = 0
        self.start_server()

    def start_server(self):
        if self.process:
            print("🔄 Deteniendo servidor...")
            self.process.terminate()
            self.process.wait()

        print("🚀 Iniciando servidor...")
        self.process = subprocess.Popen([sys.executable, "run.py"])
        self.last_restart = time.time()

    def on_modified(self, event):
        if event.src_path.endswith('.py'):
            # Evitar reiniciar demasiado rápido
            if time.time() - self.last_restart > 2:
                print(f"📝 Cambio detectado: {event.src_path}")
                self.start_server()

if __name__ == "__main__":
    print("👀 Vigilando cambios en archivos Python...")
    print("Presiona Ctrl+C para detener\n")

    handler = CodeChangeHandler()
    observer = Observer()

    # Vigilar estas carpetas
    for folder in ['api', 'core', 'models', 'schemas', 'services']:
        path = Path(folder)
        if path.exists():
            observer.schedule(handler, str(path), recursive=True)

    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        if handler.process:
            handler.process.terminate()

    observer.join()
