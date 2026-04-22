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

    # URL del frontend (para links en notificaciones)
    FRONTEND_URL: str = "http://localhost:5173"

    # IA Provider - Orden de prioridad ("gemini,groq" o "groq,gemini")
    AI_PROVIDER_ORDER: str = "gemini,groq"

    # Gemini (Google - gratis con límites)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Groq (API rápida)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Pexels API (imagenes gratuitas)
    PEXELS_API_KEY: str = ""

    # WhatsApp Business API (Meta Cloud API)
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = ""
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = "reclamos_municipales_2024"

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

    # Web Push (VAPID keys)
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_EMAIL: str = "mailto:admin@municipio.gob.ar"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Didit — KYC verification (identidad con foto DNI + selfie + liveness)
    # https://didit.me  — 500 verificaciones gratis/mes (Core KYC nivel A)
    DIDIT_APP_ID: str = ""
    DIDIT_API_KEY: str = ""
    DIDIT_BASE_URL: str = "https://verification.didit.me"
    DIDIT_WEBHOOK_SECRET: str = ""
    # Workflow creado en el dashboard de Didit (define que checks corre).
    # Si vacío, no se permite iniciar sesiones.
    DIDIT_WORKFLOW_ID: str = ""

    # ---- Gateway de pagos (Fase 2 bundle) ----
    # Provider global por defecto ('mock' sigue funcionando para dev).
    # La resolucion real es por muni (ver services/pagos/__init__.py).
    GATEWAY_PAGO_PROVIDER: str = "mock"
    # Base URL publica del backend para que los providers manden webhooks.
    # Ej: "https://api.munify.ar". Se usa al crear preferences de MP.
    WEBHOOK_BASE_URL: str = ""
    # Clave para cifrar access_tokens de providers en DB (Fernet).
    # Generar con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Si vacia, los secretos se guardan en base64 plano (dev only).
    FERNET_KEY: str = ""

    # WhatsApp — modo de envio (Fase 7 bundle pagos).
    # "wa_me" (default): genera links click-to-chat que el operador envia
    #   manualmente desde su WhatsApp Web o celular. No requiere Business API.
    # "business_api": envia automaticamente usando la config del muni
    #   (Meta/Twilio). Requiere templates aprobados — hoy dormido, se habilita
    #   cuando algun muni quiera automatizar con numero oficial verificado.
    WHATSAPP_AUTOSEND_MODE: str = "wa_me"

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
