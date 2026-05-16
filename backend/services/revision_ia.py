"""Servicio Revisión IA — analiza un set de items (reclamos por ahora) y
detecta cosas que un supervisor humano querría revisar: duplicados,
descripciones sospechosas, montos inusuales, items sin asignar hace mucho,
etc. Devuelve una lista de cards listas para mostrar en el side panel.

Hoy soporta Reclamos. Cuando se sume Tramites/Tasas/Pagos, agregar funciones
analogas y reusar el cliente Gemini de abajo.

Cache: in-memory por (municipio_id, kind). TTL 1 hora. Evita quemar tokens.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

# Cache simple por proceso. Key = (municipio_id, kind). TTL 1h.
_CACHE: Dict[tuple, tuple[float, List[Dict[str, Any]]]] = {}
_TTL_SECONDS = 60 * 60


def _cache_get(municipio_id: int, kind: str) -> Optional[List[Dict[str, Any]]]:
    key = (municipio_id, kind)
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, items = entry
    if time.time() - ts > _TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return items


def _cache_set(municipio_id: int, kind: str, items: List[Dict[str, Any]]) -> None:
    _CACHE[(municipio_id, kind)] = (time.time(), items)


def cache_invalidate(municipio_id: int, kind: Optional[str] = None) -> None:
    """Invalida el cache. Si kind es None, limpia todo del muni."""
    if kind is None:
        for key in list(_CACHE.keys()):
            if key[0] == municipio_id:
                _CACHE.pop(key, None)
    else:
        _CACHE.pop((municipio_id, kind), None)


async def _call_gemini(prompt: str, max_tokens: int = 4000) -> Optional[str]:
    """Llama a Gemini REST y devuelve el texto plano de la respuesta.
    Devuelve None si no hay key configurada o falla la llamada.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("[RevisionIA] GEMINI_API_KEY no configurada")
        return None
    try:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": max_tokens,
                        "responseMimeType": "application/json",
                    },
                },
            )
        if response.status_code != 200:
            logger.error(
                "[RevisionIA] Gemini status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            return None
        data = response.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
    except Exception as e:
        logger.exception("[RevisionIA] Error llamando Gemini: %s", e)
        return None


def _parse_json_safely(text: str) -> Optional[Any]:
    """Gemini a veces devuelve texto con prefijo/sufijo. Extrae el primer JSON valido."""
    if not text:
        return None
    text = text.strip()
    # Si ya es JSON puro
    try:
        return json.loads(text)
    except Exception:
        pass
    # Buscar primer { ... } o [ ... ]
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except Exception:
        logger.warning("[RevisionIA] JSON inválido: %s", text[:200])
        return None


# ===================================================================
# Reclamos
# ===================================================================

# Prompt curado para detectar items revisables en un set de reclamos.
# El output debe ser un JSON array con shape:
#   [{ "reclamo_id": int, "tipo": "duplicado"|"sospechoso"|"sin_asignar"|"datos_pobres",
#      "confianza": 0-100, "hint": "<frase corta para el supervisor>" }, ...]
RECLAMOS_PROMPT_TEMPLATE = """Sos un asistente que ayuda a un supervisor municipal a priorizar reclamos
vecinales. Te paso una lista de reclamos recientes. Detectá los que valen la
pena revisar y devolvé un JSON array con hasta 6 items. Tipos posibles:

- "duplicado": el reclamo describe la misma cosa que otro (mismo lugar / mismo
  problema / dentro de pocos días). Incluí en el hint los IDs de los duplicados.
- "sospechoso": descripción muy corta, palabras random, texto que parece
  autogenerado o spam, dirección incoherente.
- "sin_asignar": creado hace más de 7 días y todavía está en estado "nuevo"
  sin empleado asignado (atención del supervisor para asignar dependencia).
- "datos_pobres": falta dirección concreta o descripción detallada, debería
  pedirse más info al vecino.

Formato de cada item del array:
  {{ "reclamo_id": <int>, "tipo": "<tipo>", "confianza": <0-100>, "hint": "<frase corta en español>" }}

Devolvé SOLO el JSON array, sin texto extra. Si no encontrás nada interesante,
devolvé [].

Reclamos (JSON):
{reclamos_json}
"""


def _build_reclamos_demo() -> List[Dict[str, Any]]:
    """Fallback cuando no hay API key o falla Gemini. Marca explicitamente
    'demo' para que el frontend lo pueda distinguir si quiere."""
    return [
        {
            "reclamo_id": 0,
            "tipo": "sin_asignar",
            "confianza": 75,
            "hint": "[DEMO] Configurar GEMINI_API_KEY para análisis real",
            "titulo": "Ejemplo de revisión",
            "fecha": "",
            "es_demo": True,
        }
    ]


async def analizar_reclamos(
    municipio_id: int,
    reclamos: List[Dict[str, Any]],
    *,
    force: bool = False,
) -> List[Dict[str, Any]]:
    """Devuelve los items revisables del set de reclamos pasado.

    `reclamos` debe ser una lista de dicts con al menos:
      { id, titulo, descripcion, estado, direccion, fecha_iso, categoria, dependencia }

    Si `force` es True, ignora el cache.
    """
    if not force:
        cached = _cache_get(municipio_id, "reclamos")
        if cached is not None:
            return cached

    if not settings.GEMINI_API_KEY:
        # Sin IA configurada: devolvemos demo claramente marcado.
        return _build_reclamos_demo()

    # Recortamos las descripciones a 200 chars para no explotar el prompt.
    compact = []
    for r in reclamos:
        compact.append({
            "id": r.get("id"),
            "titulo": (r.get("titulo") or "")[:120],
            "descripcion": (r.get("descripcion") or "")[:200],
            "estado": r.get("estado"),
            "direccion": (r.get("direccion") or "")[:120],
            "fecha": r.get("fecha_iso"),
            "categoria": r.get("categoria"),
            "dependencia": r.get("dependencia"),
        })

    prompt = RECLAMOS_PROMPT_TEMPLATE.format(reclamos_json=json.dumps(compact, ensure_ascii=False))
    text = await _call_gemini(prompt)
    if not text:
        return _build_reclamos_demo()

    parsed = _parse_json_safely(text)
    if not isinstance(parsed, list):
        logger.warning("[RevisionIA] Gemini no devolvio array, devuelve demo")
        return _build_reclamos_demo()

    # Sanitizamos cada item — solo pasa los que tienen reclamo_id valido y
    # cuyo id existe realmente en el set que mandamos.
    valid_ids = {r.get("id") for r in compact}
    out: List[Dict[str, Any]] = []
    by_id = {r.get("id"): r for r in compact}
    for it in parsed:
        if not isinstance(it, dict):
            continue
        rid = it.get("reclamo_id")
        if rid not in valid_ids:
            continue
        original = by_id.get(rid, {})
        out.append({
            "reclamo_id": rid,
            "tipo": str(it.get("tipo") or "sospechoso")[:30],
            "confianza": int(it.get("confianza") or 50),
            "hint": str(it.get("hint") or "")[:200],
            "titulo": original.get("titulo", ""),
            "categoria": original.get("categoria"),
            "fecha": original.get("fecha"),
            "es_demo": False,
        })
        if len(out) >= 6:
            break

    _cache_set(municipio_id, "reclamos", out)
    return out
