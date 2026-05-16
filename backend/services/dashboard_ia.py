"""Dashboard IA — análisis multi-sección para Reclamos / Trámites / Tesorería.

Reemplaza el viejo `revision_ia` (que era item-por-item) por un dashboard
operativo: urgentes + recomendaciones (LLM) + secciones estadísticas (SQL).

Estructura de respuesta:
  {
    "urgentes": [{titulo, descripcion, accion, items_relacionados[], severidad}],
    "recomendaciones": [{titulo, descripcion, accion, items_relacionados[]}],
    "secciones": [{key, titulo, icono, color, items: [{label, value, sub?, badge?}]}],
    "generadoEn": iso8601,
  }

LLM se usa SOLO para `urgentes` y `recomendaciones`. Las secciones son SQL
puro — funcionan aunque Gemini falle.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings

logger = logging.getLogger(__name__)

# Cache simple por proceso. Key = (municipio_id, modulo). TTL 15 min.
_CACHE: Dict[tuple, tuple[float, Dict[str, Any]]] = {}
_TTL_SECONDS = 15 * 60


def _cache_get(municipio_id: int, modulo: str) -> Optional[Dict[str, Any]]:
    key = (municipio_id, modulo)
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > _TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return data


def _cache_set(municipio_id: int, modulo: str, data: Dict[str, Any]) -> None:
    _CACHE[(municipio_id, modulo)] = (time.time(), data)


def cache_invalidate(municipio_id: int, modulo: Optional[str] = None) -> None:
    if modulo is None:
        for k in list(_CACHE.keys()):
            if k[0] == municipio_id:
                _CACHE.pop(k, None)
    else:
        _CACHE.pop((municipio_id, modulo), None)


# ===================================================================
# LLM caller
# ===================================================================

async def _call_gemini(prompt: str, max_tokens: int = 4000) -> Optional[str]:
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
                        "thinkingConfig": {"thinkingBudget": 0},
                    },
                },
            )
        if response.status_code != 200:
            logger.error("[DashboardIA] Gemini status=%s", response.status_code)
            return None
        data = response.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
    except Exception as e:
        logger.exception("[DashboardIA] Gemini exc: %s", e)
        return None


def _parse_json_safely(text_resp: str) -> Optional[Any]:
    if not text_resp:
        return None
    try:
        return json.loads(text_resp.strip())
    except Exception:
        pass
    import re
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text_resp)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except Exception:
        return None


# ===================================================================
# Helpers de presentación
# ===================================================================

def _seccion(key: str, titulo: str, icono: str, color: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "key": key,
        "titulo": titulo,
        "icono": icono,
        "color": color,
        "items": items,
    }


def _tendencia_arrow(pct: float) -> str:
    if pct >= 10:
        return "↑"
    if pct <= -10:
        return "↓"
    return "→"


# ===================================================================
# RECLAMOS
# ===================================================================

RECLAMOS_PROMPT = """Sos un asistente que analiza datos operativos de reclamos municipales para el intendente.
Te paso STATS agregados + una lista corta de items críticos. Devolvé un JSON con DOS arrays:

{{
  "urgentes": [
    {{"titulo": "...", "descripcion": "...", "accion": "...", "severidad": "alta"|"media", "items": [id1, id2]}}
  ],
  "recomendaciones": [
    {{"titulo": "...", "descripcion": "...", "accion": "...", "items": [id1, id2]}}
  ]
}}

REGLAS:
- urgentes: máximo 3, cosas que requieren acción HOY (palabras clave críticas como gas/agua/incendio, SLA vencido, sin asignar >7d).
- recomendaciones: máximo 4, decisiones operativas (foco de barrio, dependencia saturada, pico categoría, comunicación pendiente).
- "accion" tiene que ser un imperativo corto (ej: "Asigná los 12 reclamos sin dependencia").
- "items" es el array de ids de reclamos relacionados (max 5 por tip).
- Texto en castellano rioplatense, sin emojis.

STATS:
{stats_json}

ITEMS_CRITICOS:
{items_json}
"""


async def build_reclamos_dashboard(db: AsyncSession, municipio_id: int, force: bool = False) -> Dict[str, Any]:
    if not force:
        cached = _cache_get(municipio_id, "reclamos")
        if cached:
            return cached

    now = datetime.now(timezone.utc)
    hace_7d = now - timedelta(days=7)
    hace_30d = now - timedelta(days=30)

    # ---------- SQL: SECCIONES ----------
    # Barrios top
    barrios = (await db.execute(text("""
        SELECT b.nombre, COUNT(r.id) as total
        FROM reclamos r
        LEFT JOIN barrios b ON b.id = r.barrio_id
        WHERE r.municipio_id = :mid AND r.created_at >= :desde
        GROUP BY b.nombre
        ORDER BY total DESC
        LIMIT 5
    """), {"mid": municipio_id, "desde": hace_30d})).fetchall()

    # Categorías top + tendencia (30d vs 7d previos)
    categorias = (await db.execute(text("""
        SELECT c.nombre, c.color,
               SUM(CASE WHEN r.created_at >= :desde30 THEN 1 ELSE 0 END) as total_30d,
               SUM(CASE WHEN r.created_at >= :desde7 THEN 1 ELSE 0 END) as total_7d
        FROM reclamos r
        JOIN categorias_reclamo c ON c.id = r.categoria_id
        WHERE r.municipio_id = :mid AND r.created_at >= :desde30
        GROUP BY c.id, c.nombre, c.color
        ORDER BY total_30d DESC
        LIMIT 5
    """), {"mid": municipio_id, "desde30": hace_30d, "desde7": hace_7d})).fetchall()

    # Dependencias con carga
    dependencias = (await db.execute(text("""
        SELECT d.nombre,
               SUM(CASE WHEN r.estado IN ('recibido','nuevo','asignado','en_curso','en_proceso','pendiente_confirmacion') THEN 1 ELSE 0 END) as abiertos,
               SUM(CASE WHEN r.estado IN ('recibido','nuevo') AND r.created_at < :hace7 THEN 1 ELSE 0 END) as atrasados
        FROM reclamos r
        LEFT JOIN municipio_dependencias md ON md.id = r.municipio_dependencia_id
        LEFT JOIN dependencias d ON d.id = md.dependencia_id
        WHERE r.municipio_id = :mid
        GROUP BY d.nombre
        HAVING abiertos > 0
        ORDER BY atrasados DESC, abiertos DESC
        LIMIT 5
    """), {"mid": municipio_id, "hace7": hace_7d})).fetchall()

    # Items críticos para el LLM
    criticos_rows = (await db.execute(text("""
        SELECT r.id, r.titulo, LEFT(r.descripcion, 150) as descripcion, r.estado, r.direccion,
               r.created_at, c.nombre as categoria,
               (CASE WHEN r.municipio_dependencia_id IS NULL THEN 1 ELSE 0 END) as sin_dep,
               TIMESTAMPDIFF(DAY, r.created_at, NOW()) as dias
        FROM reclamos r
        LEFT JOIN categorias_reclamo c ON c.id = r.categoria_id
        WHERE r.municipio_id = :mid
          AND r.estado IN ('recibido','nuevo','asignado','en_curso')
        ORDER BY
          (r.titulo LIKE '%%gas%%' OR r.titulo LIKE '%%agua%%' OR r.titulo LIKE '%%incendio%%') DESC,
          r.created_at ASC
        LIMIT 20
    """), {"mid": municipio_id})).fetchall()

    items_criticos = [
        {
            "id": r.id,
            "titulo": r.titulo[:100] if r.titulo else "",
            "descripcion": r.descripcion or "",
            "estado": r.estado,
            "categoria": r.categoria,
            "sin_dependencia": bool(r.sin_dep),
            "dias_creacion": r.dias,
        }
        for r in criticos_rows
    ]

    stats = {
        "total_abiertos": sum(d.abiertos for d in dependencias),
        "total_atrasados": sum(d.atrasados for d in dependencias),
        "top_categorias": [{"nombre": c.nombre, "total_30d": c.total_30d, "total_7d": c.total_7d} for c in categorias],
        "top_barrios": [{"nombre": b.nombre or "Sin clasificar", "total": b.total} for b in barrios],
        "top_dependencias": [{"nombre": d.nombre, "abiertos": d.abiertos, "atrasados": d.atrasados} for d in dependencias],
    }

    # ---------- LLM: URGENTES + RECOMENDACIONES ----------
    urgentes: List[Dict[str, Any]] = []
    recomendaciones: List[Dict[str, Any]] = []
    if (settings.GEMINI_API_KEY or settings.GROQ_API_KEY) and items_criticos:
        prompt = RECLAMOS_PROMPT.format(
            stats_json=json.dumps(stats, ensure_ascii=False),
            items_json=json.dumps(items_criticos, ensure_ascii=False),
        )
        text_resp = await _call_gemini(prompt)
        parsed = _parse_json_safely(text_resp) if text_resp else None
        if isinstance(parsed, dict):
            urgentes = parsed.get("urgentes", [])[:3]
            recomendaciones = parsed.get("recomendaciones", [])[:4]

    # ---------- SECCIONES ----------
    secciones = []
    if barrios:
        secciones.append(_seccion(
            "barrios", "Barrios con más reclamos", "MapPin", "#3b82f6",
            [{"label": b.nombre or "Sin clasificar", "value": str(b.total), "sub": "últimos 30 días"} for b in barrios]
        ))
    if categorias:
        secciones.append(_seccion(
            "categorias", "Categorías más demandadas", "Tag", "#8b5cf6",
            [{
                "label": c.nombre,
                "value": str(c.total_30d),
                "sub": f"{_tendencia_arrow(((c.total_7d or 0) * 4 - (c.total_30d or 0)) / max(c.total_30d or 1, 1) * 100)} 30d",
                "color": c.color,
            } for c in categorias]
        ))
    if dependencias:
        secciones.append(_seccion(
            "dependencias", "Dependencias / carga", "Users", "#f59e0b",
            [{
                "label": d.nombre or "Sin asignar",
                "value": f"{d.abiertos} abiertos",
                "sub": f"{d.atrasados} atrasados" if d.atrasados else "al día",
                "badge": "warning" if d.atrasados > 5 else None,
            } for d in dependencias]
        ))

    result = {
        "urgentes": urgentes,
        "recomendaciones": recomendaciones,
        "secciones": secciones,
        "generadoEn": now.isoformat(),
    }
    _cache_set(municipio_id, "reclamos", result)
    return result


# ===================================================================
# TRAMITES
# ===================================================================

TRAMITES_PROMPT = """Asistente operativo para trámites municipales.
Devolvé JSON con urgentes (max 3) y recomendaciones (max 4) en formato:
{{ "urgentes": [{{"titulo","descripcion","accion","severidad","items"}}], "recomendaciones": [{{"titulo","descripcion","accion","items"}}] }}

REGLAS: castellano rioplatense, sin emojis. accion es imperativo corto. items = array de ids.

STATS: {stats_json}
ITEMS_CRITICOS: {items_json}
"""


async def build_tramites_dashboard(db: AsyncSession, municipio_id: int, force: bool = False) -> Dict[str, Any]:
    if not force:
        cached = _cache_get(municipio_id, "tramites")
        if cached:
            return cached

    now = datetime.now(timezone.utc)
    hace_15d = now - timedelta(days=15)
    hace_30d = now - timedelta(days=30)

    # Top tipos
    tipos = (await db.execute(text("""
        SELECT t.nombre, COUNT(s.id) as total
        FROM solicitudes s
        JOIN tramites t ON t.id = s.tramite_id
        WHERE s.municipio_id = :mid AND s.created_at >= :desde
        GROUP BY t.id, t.nombre
        ORDER BY total DESC
        LIMIT 5
    """), {"mid": municipio_id, "desde": hace_30d})).fetchall()

    # Dependencias
    dependencias = (await db.execute(text("""
        SELECT d.nombre,
               SUM(CASE WHEN s.estado IN ('recibido','en_curso','pendiente_pago') THEN 1 ELSE 0 END) as abiertos,
               SUM(CASE WHEN s.estado IN ('recibido') AND s.created_at < :hace15 THEN 1 ELSE 0 END) as atrasados
        FROM solicitudes s
        LEFT JOIN municipio_dependencias md ON md.id = s.municipio_dependencia_id
        LEFT JOIN dependencias d ON d.id = md.dependencia_id
        WHERE s.municipio_id = :mid
        GROUP BY d.nombre
        HAVING abiertos > 0
        ORDER BY atrasados DESC
        LIMIT 5
    """), {"mid": municipio_id, "hace15": hace_15d})).fetchall()

    # Items críticos
    criticos_rows = (await db.execute(text("""
        SELECT s.id, s.asunto, LEFT(s.descripcion, 150) as descripcion, s.estado,
               t.nombre as tramite,
               (CASE WHEN s.municipio_dependencia_id IS NULL THEN 1 ELSE 0 END) as sin_dep,
               TIMESTAMPDIFF(DAY, s.created_at, NOW()) as dias
        FROM solicitudes s
        LEFT JOIN tramites t ON t.id = s.tramite_id
        WHERE s.municipio_id = :mid
          AND s.estado IN ('recibido','en_curso','pendiente_pago')
        ORDER BY s.created_at ASC
        LIMIT 20
    """), {"mid": municipio_id})).fetchall()

    items_criticos = [
        {
            "id": r.id,
            "asunto": (r.asunto or "")[:100],
            "estado": r.estado,
            "tramite": r.tramite,
            "sin_dependencia": bool(r.sin_dep),
            "dias_creacion": r.dias,
        }
        for r in criticos_rows
    ]

    stats = {
        "total_abiertos": sum(d.abiertos for d in dependencias),
        "total_atrasados": sum(d.atrasados for d in dependencias),
        "top_tipos": [{"nombre": t.nombre, "total": t.total} for t in tipos],
        "top_dependencias": [{"nombre": d.nombre, "abiertos": d.abiertos, "atrasados": d.atrasados} for d in dependencias],
    }

    urgentes: List[Dict[str, Any]] = []
    recomendaciones: List[Dict[str, Any]] = []
    if (settings.GEMINI_API_KEY or settings.GROQ_API_KEY) and items_criticos:
        prompt = TRAMITES_PROMPT.format(
            stats_json=json.dumps(stats, ensure_ascii=False),
            items_json=json.dumps(items_criticos, ensure_ascii=False),
        )
        text_resp = await _call_gemini(prompt)
        parsed = _parse_json_safely(text_resp) if text_resp else None
        if isinstance(parsed, dict):
            urgentes = parsed.get("urgentes", [])[:3]
            recomendaciones = parsed.get("recomendaciones", [])[:4]

    secciones = []
    if tipos:
        secciones.append(_seccion(
            "tipos", "Trámites más solicitados", "FileText", "#8b5cf6",
            [{"label": t.nombre, "value": str(t.total), "sub": "últimos 30 días"} for t in tipos]
        ))
    if dependencias:
        secciones.append(_seccion(
            "dependencias", "Dependencias / carga", "Users", "#f59e0b",
            [{
                "label": d.nombre or "Sin asignar",
                "value": f"{d.abiertos} abiertos",
                "sub": f"{d.atrasados} atrasados" if d.atrasados else "al día",
                "badge": "warning" if d.atrasados > 5 else None,
            } for d in dependencias]
        ))

    result = {
        "urgentes": urgentes,
        "recomendaciones": recomendaciones,
        "secciones": secciones,
        "generadoEn": now.isoformat(),
    }
    _cache_set(municipio_id, "tramites", result)
    return result


# ===================================================================
# TESORERIA
# ===================================================================

TESORERIA_PROMPT = """Asistente financiero para gastos del intendente.
Devolvé JSON {{ "urgentes": [...], "recomendaciones": [...] }} con detección de:
- pagos programados vencidos
- gastos atípicos (monto inusual vs histórico)
- contactos con muchos pagos sin geolocalizar
- conceptos posiblemente mal clasificados

REGLAS: castellano rioplatense, sin emojis. accion = imperativo. items = ids.

STATS: {stats_json}
ITEMS_CRITICOS: {items_json}
"""


async def build_tesoreria_dashboard(db: AsyncSession, municipio_id: int, force: bool = False) -> Dict[str, Any]:
    if not force:
        cached = _cache_get(municipio_id, "tesoreria")
        if cached:
            return cached

    now = datetime.now(timezone.utc)
    hace_30d = now - timedelta(days=30)

    # Top conceptos (por monto total)
    conceptos = (await db.execute(text("""
        SELECT g.concepto, COUNT(*) as cantidad, SUM(g.monto_pesos) as total
        FROM gastos g
        WHERE g.municipio_id = :mid AND g.activo = 1 AND g.fecha >= :desde
        GROUP BY g.concepto
        ORDER BY total DESC
        LIMIT 5
    """), {"mid": municipio_id, "desde": hace_30d.date()})).fetchall()

    # Top contactos
    contactos = (await db.execute(text("""
        SELECT CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) as nombre,
               COUNT(g.id) as cantidad, SUM(g.monto_pesos) as total
        FROM gastos g
        JOIN contactos c ON c.id = g.destino_contacto_id
        WHERE g.municipio_id = :mid AND g.activo = 1
          AND g.destino_tipo = 'contacto' AND g.fecha >= :desde
        GROUP BY c.id, c.nombre, c.apellido
        ORDER BY total DESC
        LIMIT 5
    """), {"mid": municipio_id, "desde": hace_30d.date()})).fetchall()

    # Cajas - saldo
    cajas = (await db.execute(text("""
        SELECT cj.nombre,
               COALESCE((SELECT SUM(monto_pesos) FROM gastos WHERE caja_id = cj.id AND activo = 1 AND fecha >= :desde), 0) as gastado_30d
        FROM cajas cj
        WHERE cj.municipio_id = :mid AND cj.activa = 1
        ORDER BY gastado_30d DESC
        LIMIT 5
    """), {"mid": municipio_id, "desde": hace_30d.date()})).fetchall()

    # Próximos pagos (agenda)
    proximos = (await db.execute(text("""
        SELECT p.id, p.concepto, c.nombre, c.apellido, p.monto_pesos, p.proximo_pago,
               DATEDIFF(p.proximo_pago, CURDATE()) as dias
        FROM pagos_programados p
        LEFT JOIN contactos c ON c.id = p.contacto_id
        WHERE p.municipio_id = :mid AND p.activo = 1
          AND p.proximo_pago <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
        ORDER BY p.proximo_pago ASC
        LIMIT 8
    """), {"mid": municipio_id})).fetchall()

    # Items críticos: gastos con monto atípico o sin clasificar bien + pagos vencidos
    vencidos = (await db.execute(text("""
        SELECT p.id, p.concepto, c.nombre, p.monto_pesos,
               DATEDIFF(CURDATE(), p.proximo_pago) as dias_vencido
        FROM pagos_programados p
        LEFT JOIN contactos c ON c.id = p.contacto_id
        WHERE p.municipio_id = :mid AND p.activo = 1
          AND p.proximo_pago < CURDATE()
          AND (p.ultimo_pago IS NULL OR p.ultimo_pago < p.proximo_pago)
        ORDER BY p.proximo_pago ASC
        LIMIT 10
    """), {"mid": municipio_id})).fetchall()

    items_criticos = [
        {
            "id": v.id,
            "tipo": "pago_vencido",
            "concepto": v.concepto,
            "contacto": v.nombre,
            "monto": float(v.monto_pesos or 0),
            "dias_vencido": v.dias_vencido,
        }
        for v in vencidos
    ]

    stats = {
        "top_conceptos": [{"concepto": c.concepto, "cantidad": c.cantidad, "total": float(c.total or 0)} for c in conceptos],
        "top_contactos": [{"nombre": c.nombre.strip(), "cantidad": c.cantidad, "total": float(c.total or 0)} for c in contactos],
        "cajas": [{"nombre": cj.nombre, "gastado_30d": float(cj.gastado_30d or 0)} for cj in cajas],
        "pagos_vencidos": len(vencidos),
        "pagos_proximos": len(proximos),
    }

    urgentes: List[Dict[str, Any]] = []
    recomendaciones: List[Dict[str, Any]] = []
    if (settings.GEMINI_API_KEY or settings.GROQ_API_KEY) and items_criticos:
        prompt = TESORERIA_PROMPT.format(
            stats_json=json.dumps(stats, ensure_ascii=False),
            items_json=json.dumps(items_criticos, ensure_ascii=False),
        )
        text_resp = await _call_gemini(prompt)
        parsed = _parse_json_safely(text_resp) if text_resp else None
        if isinstance(parsed, dict):
            urgentes = parsed.get("urgentes", [])[:3]
            recomendaciones = parsed.get("recomendaciones", [])[:4]

    secciones = []
    if conceptos:
        secciones.append(_seccion(
            "conceptos", "Top conceptos", "Tag", "#3b82f6",
            [{
                "label": c.concepto,
                "value": f"${float(c.total or 0):,.0f}".replace(",", "."),
                "sub": f"{c.cantidad} mov.",
            } for c in conceptos]
        ))
    if contactos:
        secciones.append(_seccion(
            "contactos", "Top contactos por monto", "Users", "#8b5cf6",
            [{
                "label": c.nombre.strip(),
                "value": f"${float(c.total or 0):,.0f}".replace(",", "."),
                "sub": f"{c.cantidad} pagos",
            } for c in contactos]
        ))
    if cajas:
        secciones.append(_seccion(
            "cajas", "Cajas / gasto 30 días", "Wallet", "#f59e0b",
            [{
                "label": cj.nombre,
                "value": f"${float(cj.gastado_30d or 0):,.0f}".replace(",", "."),
                "sub": "últimos 30 días",
            } for cj in cajas]
        ))
    if proximos:
        secciones.append(_seccion(
            "proximos", "Próximos pagos (14 días)", "CalendarClock", "#10b981",
            [{
                "label": f"{p.concepto} · {(p.nombre or '').strip()}",
                "value": f"${float(p.monto_pesos or 0):,.0f}".replace(",", "."),
                "sub": "hoy" if p.dias == 0 else f"en {p.dias}d" if p.dias > 0 else f"vencido {abs(p.dias)}d",
                "badge": "danger" if p.dias < 0 else ("warning" if p.dias <= 3 else None),
            } for p in proximos]
        ))

    result = {
        "urgentes": urgentes,
        "recomendaciones": recomendaciones,
        "secciones": secciones,
        "generadoEn": now.isoformat(),
    }
    _cache_set(municipio_id, "tesoreria", result)
    return result
