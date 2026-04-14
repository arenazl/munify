"""
Script para iniciar el servidor usando la configuracion del .env.
Si el puerto configurado está en uso, busca el siguiente disponible.
"""
import os
import sys
import socket

# Desactivar bytecode caching para evitar problemas con hot-reload
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True

import uvicorn
from core.config import settings


def find_available_port(start_port: int, max_attempts: int = 10) -> int:
    """Busca un puerto disponible empezando desde start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                if offset == 0:
                    print(f"Puerto {port} en uso, buscando alternativa...")
    raise RuntimeError(f"No se encontró puerto disponible entre {start_port}-{start_port + max_attempts - 1}")


if __name__ == "__main__":
    port = find_available_port(settings.PORT)
    if port != settings.PORT:
        print(f"Puerto {settings.PORT} ocupado -> usando puerto {port}")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=[".", "api", "core", "models", "schemas", "services"],
        reload_delay=0.25,
        access_log=True,
        log_level="info",
    )
