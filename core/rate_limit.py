"""
Rate limiting para proteger la API de abusos.
Usa slowapi con límites configurables.
"""
import os
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


def get_client_ip(request: Request) -> str:
    """Obtener IP del cliente, considerando proxies."""
    # En testing, usar IP única por request para evitar rate limit
    if os.environ.get("ENVIRONMENT") == "testing":
        import uuid
        return str(uuid.uuid4())

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Limiter global
limiter = Limiter(key_func=get_client_ip)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Handler personalizado para límite excedido."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Demasiadas solicitudes. Por favor, espere un momento.",
            "retry_after": exc.detail
        }
    )


# Límites predefinidos para diferentes endpoints
LIMITS = {
    "default": "100/minute",
    "auth": "10/minute",      # Login/register más restrictivo
    "create": "30/minute",    # Crear reclamos
    "upload": "20/minute",    # Subir fotos
}
