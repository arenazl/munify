"""
Helpers para el módulo de audit logs:
- is_super_admin / require_super_admin
- derive_action: deriva un string semántico ("reclamo.creado") del path+method
- sanitize_body: limpia campos sensibles antes de loggear
- get_debug_mode: lee el flag de configuraciones con cache en memoria

El cache de debug_mode evita 1 query a la DB por cada request del middleware.
TTL corto (30s) — un super admin que activa el debug ve el efecto en <30s.
"""
import re
import time
from typing import Any, Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db, AsyncSessionLocal
from core.security import get_current_user
from models.user import User
from models.configuracion import Configuracion


# ============================================================
# Super admin detection
# ============================================================
def is_super_admin(user: User) -> bool:
    """Super admin = usuario sin municipio asignado (cross-tenant)."""
    return user is not None and user.municipio_id is None


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependencia FastAPI: 403 si no es super admin."""
    if not is_super_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo super admin puede acceder a este recurso",
        )
    return current_user


# ============================================================
# Sanitización de payloads
# ============================================================
SENSITIVE_KEYS = frozenset({
    "password", "password_hash", "passwd", "pwd",
    "token", "access_token", "refresh_token", "id_token",
    "secret", "api_key", "apikey", "authorization",
    "credit_card", "card_number", "cvv",
})


def sanitize_payload(value: Any, max_depth: int = 5) -> Any:
    """
    Recursivamente reemplaza valores de keys sensibles con "***REDACTED***".
    Limita profundidad para evitar loops infinitos en estructuras circulares.
    """
    if max_depth <= 0:
        return "***MAX_DEPTH***"
    if isinstance(value, dict):
        return {
            k: ("***REDACTED***" if k.lower() in SENSITIVE_KEYS
                else sanitize_payload(v, max_depth - 1))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [sanitize_payload(item, max_depth - 1) for item in value[:50]]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)[:500]


# ============================================================
# Derivar action semántica del path+method
# ============================================================
# Lista ordenada: regex(path) -> {method: action}
# Primer match gana. Si nada matchea, action queda None.
ACTION_RULES = [
    (r"^/api/auth/login$",                  {"POST": "auth.login"}),
    (r"^/api/auth/logout$",                 {"POST": "auth.logout"}),
    (r"^/api/auth/register$",               {"POST": "auth.register"}),
    (r"^/api/auth/me$",                     {"GET": "auth.me"}),

    (r"^/api/municipios/crear-demo$",       {"POST": "demo.creado"}),
    (r"^/api/municipios/demo/[^/]+$",       {"DELETE": "demo.eliminado"}),
    (r"^/api/municipios$",                  {"POST": "municipio.creado"}),
    (r"^/api/municipios/\d+$",              {"PUT": "municipio.actualizado",
                                             "DELETE": "municipio.eliminado",
                                             "GET": "municipio.consultado"}),

    (r"^/api/reclamos$",                    {"POST": "reclamo.creado",
                                             "GET": "reclamo.listado"}),
    (r"^/api/reclamos/\d+$",                {"GET": "reclamo.consultado",
                                             "PUT": "reclamo.actualizado",
                                             "DELETE": "reclamo.eliminado"}),
    (r"^/api/reclamos/\d+/estado$",         {"PUT": "reclamo.estado_cambiado"}),
    (r"^/api/reclamos/\d+/asignar$",        {"POST": "reclamo.asignado"}),
    (r"^/api/reclamos/\d+/comentario$",     {"POST": "reclamo.comentario"}),

    (r"^/api/tramites$",                    {"POST": "tramite.creado",
                                             "GET": "tramite.listado"}),
    (r"^/api/tramites/\d+$",                {"PUT": "tramite.actualizado",
                                             "DELETE": "tramite.eliminado"}),
    (r"^/api/tramites/solicitudes$",        {"POST": "solicitud.creada"}),
    (r"^/api/tramites/solicitudes/[^/]+$",  {"GET": "solicitud.consultada"}),

    (r"^/api/empleados",                    {"POST": "empleado.creado",
                                             "PUT": "empleado.actualizado",
                                             "DELETE": "empleado.eliminado"}),
    (r"^/api/cuadrillas",                   {"POST": "cuadrilla.creada",
                                             "PUT": "cuadrilla.actualizada",
                                             "DELETE": "cuadrilla.eliminada"}),
    (r"^/api/zonas",                        {"POST": "zona.creada",
                                             "PUT": "zona.actualizada",
                                             "DELETE": "zona.eliminada"}),
    (r"^/api/dependencias",                 {"POST": "dependencia.creada",
                                             "PUT": "dependencia.actualizada",
                                             "DELETE": "dependencia.eliminada"}),
    (r"^/api/categorias",                   {"POST": "categoria.creada",
                                             "PUT": "categoria.actualizada",
                                             "DELETE": "categoria.eliminada"}),

    (r"^/api/admin/audit-logs",             {"GET": "audit.consultado"}),
    (r"^/api/admin/settings/debug_mode$",   {"PUT": "audit.debug_toggle"}),
]

_ACTION_RULES_COMPILED = [(re.compile(pattern), methods) for pattern, methods in ACTION_RULES]


def derive_action(method: str, path: str) -> Optional[str]:
    """Devuelve action semántico para un (method, path), o None si no hay match."""
    for regex, methods in _ACTION_RULES_COMPILED:
        if regex.match(path):
            return methods.get(method.upper())
    return None


# ============================================================
# Cache de debug_mode (TTL 30s)
# ============================================================
class _DebugModeCache:
    """Cache simple en memoria del worker. Se invalida al hacer PUT al setting."""
    def __init__(self, ttl_seconds: int = 30):
        self._value: Optional[bool] = None
        self._loaded_at: float = 0
        self._ttl = ttl_seconds

    async def get(self) -> bool:
        now = time.time()
        if self._value is not None and (now - self._loaded_at) < self._ttl:
            return self._value
        # Cache miss / expirado — leer de DB
        try:
            async with AsyncSessionLocal() as db:
                r = await db.execute(
                    select(Configuracion).where(
                        Configuracion.clave == "audit.debug_mode",
                        Configuracion.municipio_id.is_(None),
                    )
                )
                conf = r.scalar_one_or_none()
                self._value = (conf.valor.lower() == "true") if conf else False
        except Exception:
            # En fallo, default a False (modo conservador)
            self._value = False
        self._loaded_at = now
        return self._value

    def invalidate(self):
        """Llamar después de actualizar el setting."""
        self._value = None
        self._loaded_at = 0


debug_mode_cache = _DebugModeCache()


async def get_debug_mode() -> bool:
    return await debug_mode_cache.get()


def invalidate_debug_mode_cache():
    debug_mode_cache.invalidate()
