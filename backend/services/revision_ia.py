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


async def _call_gemini(prompt: str, max_tokens: int = 8000) -> Optional[str]:
    """Llama a Gemini REST. None si key no configurada o falla."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        async with httpx.AsyncClient(timeout=28.0) as client:
            response = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": max_tokens,
                        "responseMimeType": "application/json",
                        # gemini-2.5-flash usa "thinking" interno que duplica
                        # latencia con prompts grandes. Lo desactivamos.
                        "thinkingConfig": {"thinkingBudget": 0},
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


async def _call_groq(prompt: str, max_tokens: int = 8000) -> Optional[str]:
    """Llama a Groq (OpenAI-compatible). Tier gratuito generoso con Llama 3.3.
    None si key no configurada o falla."""
    if not settings.GROQ_API_KEY:
        return None
    try:
        url = "https://api.groq.com/openai/v1/chat/completions"
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": max_tokens,
                    "response_format": {"type": "json_object"},
                },
            )
        if response.status_code != 200:
            logger.error(
                "[RevisionIA] Groq status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            return None
        data = response.json()
        return (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
    except Exception as e:
        logger.exception("[RevisionIA] Error llamando Groq: %s", e)
        return None


async def _call_llm(prompt: str, max_tokens: int = 8000) -> Optional[str]:
    """Intenta primero Gemini; si no responde, cae a Groq. Devuelve el texto
    de la respuesta o None si ambos fallan / no estan configurados."""
    text = await _call_gemini(prompt, max_tokens=max_tokens)
    if text:
        return text
    logger.info("[RevisionIA] Gemini sin respuesta, intentando Groq...")
    text = await _call_groq(prompt, max_tokens=max_tokens)
    if text:
        logger.info("[RevisionIA] Groq respondio OK")
    return text


def _parse_json_safely(text: str) -> Optional[Any]:
    """Gemini a veces devuelve texto con prefijo/sufijo, o trunca por
    maxOutputTokens. Intentamos:
      1. JSON puro
      2. Extraer primer bloque { ... } o [ ... ]
      3. Si el array fue truncado mid-item, cerramos a mano hasta el ultimo
         item completo.
    """
    if not text:
        return None
    text = text.strip()
    # 1. JSON puro
    try:
        return json.loads(text)
    except Exception:
        pass
    # 2. Buscar primer { ... } o [ ... ]
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if not match:
        logger.warning("[RevisionIA] No se encontro JSON en respuesta (len=%d): %s", len(text), text[:400])
        return None
    candidate = match.group()
    try:
        return json.loads(candidate)
    except Exception as e:
        logger.warning("[RevisionIA] JSON inválido (%s) — intento recuperar. body=%s", e, candidate[:500])

    # 2.bis: a veces Groq devuelve { "items": [...] } o varios objetos seguidos
    # sin wrapper. Intentamos rescatar items con regex iterativo.
    items_match = re.findall(r"\{[^{}]*\"reclamo_id\"[^{}]*\}|\{[^{}]*\"solicitud_id\"[^{}]*\}", candidate)
    if items_match:
        rescued = []
        for it in items_match:
            try:
                rescued.append(json.loads(it))
            except Exception:
                continue
        if rescued:
            logger.info("[RevisionIA] Rescatados %d items via regex iterativo", len(rescued))
            return rescued

    # 3. Recuperar array truncado: cortar hasta la ultima '},' que parsea OK
    if candidate.startswith('['):
        # Busca el ultimo '}' que cierre un item bien formado
        for cut in range(len(candidate) - 1, 0, -1):
            if candidate[cut] == '}':
                attempt = candidate[: cut + 1] + ']'
                try:
                    parsed = json.loads(attempt)
                    logger.info("[RevisionIA] Recuperado array truncado, items=%d", len(parsed) if isinstance(parsed, list) else 0)
                    return parsed
                except Exception:
                    continue
    logger.warning("[RevisionIA] No se pudo recuperar JSON truncado")
    return None


# ===================================================================
# Reclamos
# ===================================================================

# Prompt curado para detectar items revisables en un set de reclamos.
# El output debe ser un JSON array con shape:
#   [{ "reclamo_id": int, "tipo": "duplicado"|"sospechoso"|"sin_asignar"|"datos_pobres",
#      "confianza": 0-100, "hint": "<frase corta para el supervisor>" }, ...]
RECLAMOS_PROMPT_TEMPLATE = """Sos un asistente que ayuda a un supervisor municipal a priorizar reclamos.
Analizá los reclamos y devolvé un JSON array con MÁXIMO 6 items (los más
relevantes). Tipos posibles:

- "duplicado": describe lo mismo que otro reclamo (mismo lugar / mismo problema).
  Incluí en hint el ID del duplicado.
- "sospechoso": texto corto, random, spam, dirección incoherente.
- "sin_asignar": creado hace >7 días y sigue en estado "nuevo" sin dependencia.
- "datos_pobres": falta dirección concreta o descripción.

Formato exacto de cada item (hint MUY corto, max 80 chars):
  {{"reclamo_id": <int>, "tipo": "<tipo>", "confianza": <0-100>, "hint": "<frase corta>"}}

REGLAS DURAS:
- Devolvé SOLO el array JSON, sin texto antes ni después.
- MÁXIMO 6 items. Si no encontrás nada, devolvé [].
- hint no debe superar 80 caracteres.

Reclamos:
{reclamos_json}
"""


def _is_demo_items(items: List[Dict[str, Any]]) -> bool:
    """Detecta si lo que esta en cache son items DEMO (para no cachearlos)."""
    return any(it.get("es_demo") for it in items)


def _build_reclamos_demo(reason: str = "no_key") -> List[Dict[str, Any]]:
    """Fallback. `reason` ayuda a saber por que cayo:
      - "no_key": GEMINI_API_KEY no configurada.
      - "ia_fail": la IA respondio pero no se pudo parsear.
    """
    hints = {
        "no_key":  "[DEMO] Configurar GEMINI_API_KEY para análisis real",
        "ia_fail": "[DEMO] La IA no devolvió un análisis válido en este intento. Reintentar más tarde.",
    }
    return [
        {
            "reclamo_id": 0,
            "tipo": "sin_asignar",
            "confianza": 75,
            "hint": hints.get(reason, hints["no_key"]),
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

    if not settings.GEMINI_API_KEY and not settings.GROQ_API_KEY:
        # Sin IA configurada (ningun proveedor): devolvemos demo.
        return _build_reclamos_demo("no_key")

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
    text = await _call_llm(prompt)
    if not text:
        logger.warning("[RevisionIA] Ningun LLM respondio (reclamos)")
        return _build_reclamos_demo("ia_fail")

    parsed = _parse_json_safely(text)
    if not isinstance(parsed, list):
        logger.warning("[RevisionIA] Parse fallo. Body len=%d head=%s", len(text), text[:400])
        return _build_reclamos_demo("ia_fail")
    if len(parsed) == 0:
        # IA dijo "no encontre nada interesante" — eso es valido. Cacheamos
        # array vacio para no repetir la llamada.
        _cache_set(municipio_id, "reclamos", [])
        return []

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


# ===================================================================
# Tramites (Solicitudes)
# ===================================================================

TRAMITES_PROMPT_TEMPLATE = """Sos un asistente que ayuda a un supervisor municipal a priorizar solicitudes de tramites.
Analizá las solicitudes y devolvé un JSON array con MÁXIMO 6 items (los más
relevantes). Tipos posibles:

- "duplicado": misma solicitud que otra (mismo solicitante + mismo tramite, o asunto repetido).
  Incluí en hint el ID del duplicado.
- "sospechoso": asunto/descripcion corto, random, spam, datos del solicitante incoherentes.
- "sin_asignar": creado hace >7 días y sigue en estado "recibido" sin dependencia.
- "datos_pobres": falta descripcion o datos del solicitante.
- "atrasado": hace mas de 15 dias en "en_curso" sin resolverse.

Formato exacto de cada item (hint MUY corto, max 80 chars):
  {{"solicitud_id": <int>, "tipo": "<tipo>", "confianza": <0-100>, "hint": "<frase corta>"}}

REGLAS DURAS:
- Devolvé SOLO el array JSON, sin texto antes ni después.
- MÁXIMO 6 items. Si no encontrás nada, devolvé [].
- hint no debe superar 80 caracteres.

Solicitudes:
{solicitudes_json}
"""


def _build_tramites_demo(reason: str = "no_key") -> List[Dict[str, Any]]:
    hints = {
        "no_key":  "[DEMO] Configurar GEMINI_API_KEY para análisis real",
        "ia_fail": "[DEMO] La IA no devolvió un análisis válido en este intento. Reintentar más tarde.",
    }
    return [
        {
            "solicitud_id": 0,
            "tipo": "sin_asignar",
            "confianza": 75,
            "hint": hints.get(reason, hints["no_key"]),
            "titulo": "Ejemplo de revisión",
            "fecha": "",
            "es_demo": True,
        }
    ]


async def analizar_tramites(
    municipio_id: int,
    solicitudes: List[Dict[str, Any]],
    *,
    force: bool = False,
) -> List[Dict[str, Any]]:
    """Devuelve los items revisables del set de solicitudes pasado.

    `solicitudes` debe ser una lista de dicts con al menos:
      { id, asunto, descripcion, estado, tramite, solicitante, fecha_iso, categoria, dependencia }
    """
    if not force:
        cached = _cache_get(municipio_id, "tramites")
        if cached is not None:
            return cached

    if not settings.GEMINI_API_KEY and not settings.GROQ_API_KEY:
        return _build_tramites_demo("no_key")

    compact = []
    for s in solicitudes:
        compact.append({
            "id": s.get("id"),
            "asunto": (s.get("asunto") or "")[:120],
            "descripcion": (s.get("descripcion") or "")[:200],
            "estado": s.get("estado"),
            "tramite": (s.get("tramite") or "")[:120],
            "solicitante": (s.get("solicitante") or "")[:120],
            "fecha": s.get("fecha_iso"),
            "categoria": s.get("categoria"),
            "dependencia": s.get("dependencia"),
        })

    prompt = TRAMITES_PROMPT_TEMPLATE.format(solicitudes_json=json.dumps(compact, ensure_ascii=False))
    text = await _call_llm(prompt)
    if not text:
        logger.warning("[RevisionIA] Ningun LLM respondio (tramites)")
        return _build_tramites_demo("ia_fail")

    parsed = _parse_json_safely(text)
    if not isinstance(parsed, list):
        logger.warning("[RevisionIA][tramites] Parse fallo. head=%s", text[:400])
        return _build_tramites_demo("ia_fail")
    if len(parsed) == 0:
        _cache_set(municipio_id, "tramites", [])
        return []

    valid_ids = {s.get("id") for s in compact}
    by_id = {s.get("id"): s for s in compact}
    out: List[Dict[str, Any]] = []
    for it in parsed:
        if not isinstance(it, dict):
            continue
        sid = it.get("solicitud_id")
        if sid not in valid_ids:
            continue
        original = by_id.get(sid, {})
        out.append({
            "solicitud_id": sid,
            "tipo": str(it.get("tipo") or "sospechoso")[:30],
            "confianza": int(it.get("confianza") or 50),
            "hint": str(it.get("hint") or "")[:200],
            "titulo": original.get("asunto", "") or original.get("tramite", ""),
            "categoria": original.get("categoria"),
            "fecha": original.get("fecha"),
            "es_demo": False,
        })
        if len(out) >= 6:
            break

    _cache_set(municipio_id, "tramites", out)
    return out
