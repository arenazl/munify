"""
Script para iniciar el servidor usando la configuracion del .env
"""
import os
import sys

# Desactivar bytecode caching para evitar problemas con hot-reload
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True

import uvicorn
from core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
        reload_dirs=[".", "api", "core", "models", "schemas", "services"],
        reload_delay=0.25,
        access_log=True,  # Forzar logs de acceso
        log_level="info",  # Nivel de log info
    )
