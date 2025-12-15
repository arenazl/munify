from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ALGORITHM: str = "HS256"

    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    ENVIRONMENT: str = "development"

    # Puerto del servidor
    PORT: int = 8000

    # Gemini (Google - gratis con límites) - IA por defecto
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Grok (xAI) - alternativa
    GROK_API_KEY: str = ""
    GROK_MODEL: str = "grok-3-mini"

    # Pexels API (imagenes gratuitas)
    PEXELS_API_KEY: str = ""

    # CORS - URLs permitidas (separadas por coma en .env)
    CORS_ORIGINS: str = ""

    # Sentry (Error Tracking)
    SENTRY_DSN: str = ""

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Email SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "Sistema de Reclamos"

    # Validación de email (desactivar para demos/desarrollo)
    SKIP_EMAIL_VALIDATION: bool = True

    @property
    def cors_origins_list(self) -> List[str]:
        """Retorna lista de origenes CORS permitidos"""
        # Origenes de desarrollo (localhost)
        dev_origins = [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:5176",
            "http://localhost:5177",
            "http://localhost:5178",
            "http://localhost:5179",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://127.0.0.1:5175",
            "http://127.0.0.1:3000",
        ]

        # En desarrollo, agregar IPs de red local automáticamente
        if self.ENVIRONMENT == "development":
            import socket
            try:
                # Obtener IP local de la máquina
                hostname = socket.gethostname()
                local_ip = socket.gethostbyname(hostname)
                if local_ip:
                    for port in [5173, 5174, 5175, 3000, 8001]:
                        dev_origins.append(f"http://{local_ip}:{port}")
            except Exception:
                pass

            # En desarrollo, permitir cualquier origen (wildcard simplificado)
            # Esto permite IPs de Tailscale (100.x.x.x), redes locales, etc.
            dev_origins.append("*")

        # Agregar origenes de produccion desde .env
        if self.CORS_ORIGINS:
            prod_origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
            return dev_origins + prod_origins

        return dev_origins

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
