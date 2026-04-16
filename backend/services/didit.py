"""Cliente Didit (KYC) — crea sesiones de verificacion y consulta resultados.

Docs: https://docs.didit.me/
Pricing: 500 sesiones Core KYC gratis por mes (id_verification + face_match +
liveness). Despues ~$0.30/verif.

Flujo de uso:
  1. Backend: crear_sesion(vendor_data="user-123") -> {session_id, url}
  2. Frontend: redirigir al url, el vecino se saca fotos DNI + selfie
  3. Didit redirige al callback_url (configurado en dashboard)
  4. Backend: consultar_sesion(session_id) -> { status, id_verification, ... }
  5. Backend: si status == "Approved", crear User con datos filiatorios.

Requiere DIDIT_API_KEY y DIDIT_WORKFLOW_ID en env.
"""
from typing import Any
import httpx
import logging

from core.config import settings

logger = logging.getLogger(__name__)


class DiditError(Exception):
    pass


class DiditNotConfigured(DiditError):
    """Didit no esta configurado (faltan env vars)."""


def _require_config() -> tuple[str, str, str]:
    if not settings.DIDIT_API_KEY:
        raise DiditNotConfigured("DIDIT_API_KEY no configurado")
    if not settings.DIDIT_WORKFLOW_ID:
        raise DiditNotConfigured("DIDIT_WORKFLOW_ID no configurado")
    return settings.DIDIT_API_KEY, settings.DIDIT_WORKFLOW_ID, settings.DIDIT_BASE_URL.rstrip("/")


async def crear_sesion(
    vendor_data: str | None = None,
    callback_url: str | None = None,
) -> dict[str, Any]:
    """Crea una session de verificacion en Didit.

    `vendor_data` es un string libre que vuelve en el webhook/response (usalo
    para correlacionar con tu user, ej. "register:abc-email").
    `callback_url` sobrescribe el callback default del workflow si querés
    redirigir al frontend.

    Retorna dict con session_id, url (redirigir al user) y otros metadatos.
    """
    api_key, workflow_id, base_url = _require_config()

    payload: dict[str, Any] = {"workflow_id": workflow_id}
    if vendor_data:
        payload["vendor_data"] = vendor_data
    if callback_url:
        payload["callback"] = callback_url

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{base_url}/v2/session/",
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code >= 400:
            logger.error("Didit crear_sesion fallo %s: %s", resp.status_code, resp.text)
            raise DiditError(f"Didit {resp.status_code}: {resp.text}")
        return resp.json()


async def consultar_sesion(session_id: str) -> dict[str, Any]:
    """Trae el estado y datos de una session de Didit.

    Campos relevantes del response:
      - status: "Not Started" | "In Progress" | "Approved" | "Declined" | ...
      - id_verification: { first_name, last_name, document_number, date_of_birth,
          gender, nationality, address, parsed_address, expiration_date, ... }
      - face_match: { status, score }
      - liveness: { status }
      - vendor_data: el que pasamos en crear_sesion
    """
    api_key, _, base_url = _require_config()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{base_url}/v2/session/{session_id}/decision/",
            headers={"x-api-key": api_key},
        )
        if resp.status_code >= 400:
            logger.error("Didit consultar_sesion fallo %s: %s", resp.status_code, resp.text)
            raise DiditError(f"Didit {resp.status_code}: {resp.text}")
        return resp.json()


def extraer_datos_filiatorios(decision: dict[str, Any]) -> dict[str, Any]:
    """Del JSON de Didit, devuelve dict listo para crear/actualizar un User.

    Keys retornadas (todas pueden ser None si Didit no las extrajo):
      dni, nombre, apellido, sexo, fecha_nacimiento (date), nacionalidad,
      direccion, session_id
    """
    id_ver = decision.get("id_verification") or {}

    # Address: preferimos formatted, sino raw.
    direccion = id_ver.get("formatted_address") or id_ver.get("address") or None

    # Fecha: viene como "YYYY-MM-DD".
    fecha_str = id_ver.get("date_of_birth")
    fecha_nac = None
    if fecha_str:
        from datetime import date
        try:
            fecha_nac = date.fromisoformat(fecha_str)
        except ValueError:
            fecha_nac = None

    # Sexo: Didit devuelve M/F; normalizo a 1 char.
    sexo_raw = id_ver.get("gender")
    sexo = None
    if sexo_raw:
        sexo = sexo_raw[0].upper() if sexo_raw else None
        if sexo not in ("M", "F", "X"):
            sexo = None

    return {
        "dni": id_ver.get("document_number"),
        "nombre": id_ver.get("first_name"),
        "apellido": id_ver.get("last_name"),
        "sexo": sexo,
        "fecha_nacimiento": fecha_nac,
        "nacionalidad": id_ver.get("nationality"),
        "direccion": direccion,
        "session_id": decision.get("session_id"),
    }
