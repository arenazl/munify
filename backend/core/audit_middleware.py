"""
Middleware de audit logging.

Diseño:
- Skip total para paths no /api/* — overhead 0 para estáticos, health, etc.
- Cuando debug_mode=False: solo loggea POST/PUT/DELETE/PATCH + cualquier 4xx/5xx + auth.*
- Cuando debug_mode=True: loggea también GETs, query_params y request_body sanitizado
- Fire-and-forget con asyncio.create_task: el response NO espera el INSERT.
- Sesión separada (AsyncSessionLocal) — independiente del request principal.
- Try/except total: NUNCA rompe el request si falla el log.
"""
import asyncio
import json
import logging
import time
from typing import Optional

from fastapi import Request, Response
from jose import jwt, JWTError

from core.config import settings
from core.database import AsyncSessionLocal
from core.audit_helpers import (
    derive_action, sanitize_payload, get_debug_mode,
)
from models.audit_log import AuditLog
from models.user import User
from sqlalchemy import select


logger = logging.getLogger(__name__)

# Métodos que SIEMPRE se loggean (independiente de debug_mode)
ALWAYS_LOG_METHODS = {"POST", "PUT", "DELETE", "PATCH"}


async def audit_middleware(request: Request, call_next):
    """Captura el request, mide latencia, persiste en background sin bloquear."""
    # Skip rápido si no es endpoint API
    if not request.url.path.startswith("/api"):
        return await call_next(request)

    t0 = time.time()

    # Cachear body antes de que el endpoint lo consuma
    # Solo si vale la pena (POST/PUT/PATCH)
    body_bytes: Optional[bytes] = None
    if request.method in {"POST", "PUT", "PATCH"} and request.headers.get("content-length"):
        try:
            body_bytes = await request.body()
            # Re-inyectar el body para que el endpoint pueda leerlo
            async def receive():
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            request._receive = receive
        except Exception:
            body_bytes = None

    response = await call_next(request)
    duration_ms = int((time.time() - t0) * 1000)

    # Print rápido a stdout (compatible con el log_requests viejo)
    print(f"{request.method} {request.url.path} - {response.status_code} ({duration_ms}ms)", flush=True)

    # Decidir si vale la pena persistir
    debug_mode = await get_debug_mode()
    is_error = response.status_code >= 400
    is_mutation = request.method in ALWAYS_LOG_METHODS
    if not (is_mutation or is_error or debug_mode):
        return response

    # Fire-and-forget: persistir en background, response sale ya
    asyncio.create_task(_persist_audit(
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
        query_params=dict(request.query_params),
        body_bytes=body_bytes if debug_mode else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        auth_header=request.headers.get("authorization"),
    ))
    return response


async def _persist_audit(
    method: str,
    path: str,
    status_code: int,
    duration_ms: int,
    query_params: dict,
    body_bytes: Optional[bytes],
    ip_address: Optional[str],
    user_agent: str,
    auth_header: Optional[str],
):
    """
    Persiste 1 fila en audit_logs. NUNCA debe rompler nada — todo en try/except.
    """
    try:
        # Decode JWT sin DB para sacar usuario_id (el JWT solo tiene `sub` = user_id)
        usuario_id = _decode_user_id_from_token(auth_header)

        # Sanitizar body
        request_body_json = None
        if body_bytes:
            try:
                parsed = json.loads(body_bytes)
                request_body_json = sanitize_payload(parsed)
            except (json.JSONDecodeError, ValueError):
                # body no es JSON — guardamos preview truncado
                request_body_json = {"raw_preview": body_bytes[:200].decode("utf-8", errors="replace")}

        async with AsyncSessionLocal() as audit_db:
            # 1 SELECT para resolver email/rol/municipio_id del user
            usuario_email = None
            usuario_rol = None
            municipio_id = None
            if usuario_id:
                r = await audit_db.execute(
                    select(User.email, User.rol, User.municipio_id).where(User.id == int(usuario_id))
                )
                row = r.first()
                if row:
                    usuario_email = row[0]
                    usuario_rol = row[1].value if hasattr(row[1], "value") else str(row[1])
                    municipio_id = row[2]

            audit_db.add(AuditLog(
                usuario_id=int(usuario_id) if usuario_id else None,
                usuario_email=usuario_email,
                usuario_rol=usuario_rol,
                municipio_id=municipio_id,
                method=method,
                path=path,
                status_code=status_code,
                duracion_ms=duration_ms,
                action=derive_action(method, path),
                query_params=query_params if query_params else None,
                request_body=request_body_json,
                ip_address=ip_address,
                user_agent=user_agent,
            ))
            await audit_db.commit()
    except Exception as e:
        # Heroku conserva stdout — esto es la red de seguridad, NO la fuente de verdad
        logger.error(f"audit_log write failed: {type(e).__name__}: {e}", exc_info=True)


def _decode_user_id_from_token(auth_header: Optional[str]) -> Optional[str]:
    """Decodea el JWT y saca el user_id (campo `sub`). None si no hay token o es inválido."""
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
