"""
API del catálogo global de trámites sugeridos (cross-municipios).

Solo expone lectura — la tabla se puebla una vez por deploy con
`scripts/seed_tramites_sugeridos.py`.

Usado por el wizard de alta de trámite para ofrecer autocomplete al admin.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List, Optional
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user
from models.tramite_sugerido import TramiteSugerido
from models.user import User
from schemas.tramite_sugerido import TramiteSugeridoResponse

router = APIRouter()


def _parse_docs(raw: Optional[str]) -> List[str]:
    """Convierte el string CSV de documentos_sugeridos a lista limpia."""
    if not raw:
        return []
    # Soportar separadores "|" y ","
    parts = []
    for chunk in raw.replace(",", "|").split("|"):
        s = chunk.strip()
        if s:
            parts.append(s)
    return parts


def _score_match(nombre: str, descripcion: Optional[str], q_lower: str) -> int:
    """
    Devuelve un score de relevancia (menor = mejor).
    Prioriza:
      0-99   → el nombre empieza con el query (mejor match: más corto gana)
      100-299→ el query está dentro del nombre (ordenado por posición del match)
      300+   → match solo en descripción
    """
    nombre_lower = (nombre or "").lower()
    desc_lower = (descripcion or "").lower()

    if nombre_lower.startswith(q_lower):
        return len(nombre)  # prefix: más corto gana (0-99 aprox)

    idx_nombre = nombre_lower.find(q_lower)
    if idx_nombre >= 0:
        return 100 + idx_nombre  # contains en nombre, más cerca del inicio gana

    idx_desc = desc_lower.find(q_lower)
    if idx_desc >= 0:
        return 300 + idx_desc  # solo match en descripción

    return 9999  # no debería pasar porque el WHERE ya filtró


@router.get("", response_model=List[TramiteSugeridoResponse])
async def listar_tramites_sugeridos(
    q: Optional[str] = Query(None, description="Texto de búsqueda (fuzzy en nombre)"),
    rubro: Optional[str] = Query(None, description="Filtrar por rubro aproximado"),
    limit: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca trámites sugeridos para autocomplete.

    Si `q` está presente, hace LIKE case-insensitive en nombre y descripción.
    El orden se resuelve en Python aplicando un scoring que prioriza los
    matches al inicio del nombre (ver `_score_match`).
    """
    query = select(TramiteSugerido)

    q_clean = (q or "").strip()
    if q_clean:
        pattern = f"%{q_clean}%"
        query = query.where(
            or_(
                TramiteSugerido.nombre.ilike(pattern),
                TramiteSugerido.descripcion.ilike(pattern),
            )
        )
        # Traemos hasta 50 candidatos sin limit para poder reordenar en Python.
        # El limit final se aplica después del sort.
    else:
        query = query.order_by(TramiteSugerido.rubro.asc(), TramiteSugerido.nombre.asc())

    if rubro:
        query = query.where(TramiteSugerido.rubro == rubro)

    # Traer suficientes candidatos para reordenar con scoring
    query = query.limit(max(limit * 3, 50) if q_clean else limit)

    result = await db.execute(query)
    items = list(result.scalars().all())

    # Reordenar por relevancia cuando hay query
    if q_clean:
        q_lower = q_clean.lower()
        items.sort(key=lambda it: (_score_match(it.nombre, it.descripcion, q_lower), it.nombre.lower()))
        items = items[:limit]

    return [
        TramiteSugeridoResponse(
            id=it.id,
            nombre=it.nombre,
            descripcion=it.descripcion,
            tiempo_estimado_dias=it.tiempo_estimado_dias,
            costo=it.costo,
            documentos_sugeridos=it.documentos_sugeridos,
            rubro=it.rubro,
            documentos_lista=_parse_docs(it.documentos_sugeridos),
        )
        for it in items
    ]


@router.get("/rubros", response_model=List[str])
async def listar_rubros(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista los rubros únicos disponibles, para filtros en UI."""
    result = await db.execute(
        select(TramiteSugerido.rubro)
        .distinct()
        .where(TramiteSugerido.rubro.is_not(None))
        .order_by(TramiteSugerido.rubro)
    )
    return [r[0] for r in result.all() if r[0]]


class DocumentoFrecuenteItem(BaseModel):
    nombre: str
    frecuencia: int        # cuántos trámites del catálogo lo usan
    score: int             # score final (más alto = mejor)
    from_match: bool       # true si el doc viene de un match por nombre


class DocumentosFrecuentesResponse(BaseModel):
    items: List[DocumentoFrecuenteItem]
    total_tramites_analizados: int


@router.get("/documentos-frecuentes", response_model=DocumentosFrecuentesResponse)
async def documentos_frecuentes(
    rubro: Optional[str] = Query(None, description="Rubro/categoría aproximada (fuzzy ILIKE)"),
    nombre: Optional[str] = Query(None, description="Nombre del trámite para boost por match"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve los documentos más frecuentes del catálogo, útiles como chips
    sugeridos en el Step 3 del wizard de alta de trámite.

    Combina dos fuentes:
      1. Trámites del mismo `rubro` (si viene) — base de frecuencia por rubro.
      2. Trámites que matchean con `nombre` (si viene) — boost extra.

    Ranking: docs ordenados por score descendente. Score =
        frecuencia_rubro * 10   (aparece en N trámites del rubro)
      + 50 si el doc viene de un match por nombre del trámite
      + 20 por cada match extra por nombre (hasta 3 matches)
    """
    # 1. Trámites del rubro
    tramites_rubro: list = []
    if rubro and rubro.strip():
        q_rubro = select(TramiteSugerido).where(
            TramiteSugerido.rubro.ilike(f"%{rubro.strip()}%")
        )
        r = await db.execute(q_rubro)
        tramites_rubro = list(r.scalars().all())

    # 2. Trámites que matchean por nombre
    tramites_match: list = []
    if nombre and nombre.strip():
        q_nombre = (
            select(TramiteSugerido)
            .where(TramiteSugerido.nombre.ilike(f"%{nombre.strip()}%"))
            .limit(5)
        )
        r = await db.execute(q_nombre)
        tramites_match = list(r.scalars().all())

    # 3. Si no viene ni rubro ni nombre, no hay nada que sugerir
    if not tramites_rubro and not tramites_match:
        return DocumentosFrecuentesResponse(items=[], total_tramites_analizados=0)

    # 4. Construir diccionario de documentos → {frecuencia, en_match}
    # Usamos el nombre del doc en minúscula como clave para agrupar variantes
    # ("DNI" y "dni" cuentan como el mismo doc).
    docs_map: dict = {}  # key_lower → {"nombre": canonical, "frecuencia": N, "en_match": bool, "match_count": N}

    for t in tramites_rubro:
        for doc_nombre in _parse_docs(t.documentos_sugeridos):
            key = doc_nombre.lower().strip()
            if key not in docs_map:
                docs_map[key] = {
                    "nombre": doc_nombre,
                    "frecuencia": 0,
                    "en_match": False,
                    "match_count": 0,
                }
            docs_map[key]["frecuencia"] += 1

    for t in tramites_match:
        for doc_nombre in _parse_docs(t.documentos_sugeridos):
            key = doc_nombre.lower().strip()
            if key not in docs_map:
                docs_map[key] = {
                    "nombre": doc_nombre,
                    "frecuencia": 0,
                    "en_match": False,
                    "match_count": 0,
                }
            docs_map[key]["en_match"] = True
            docs_map[key]["match_count"] += 1

    # 5. Scoring: frecuencia en rubro * 10 + 50 si viene de match + 20 por cada match extra
    items = []
    for data in docs_map.values():
        score = data["frecuencia"] * 10
        if data["en_match"]:
            score += 50
            score += min(data["match_count"], 3) * 20
        items.append(
            DocumentoFrecuenteItem(
                nombre=data["nombre"],
                frecuencia=data["frecuencia"],
                score=score,
                from_match=data["en_match"],
            )
        )

    # 6. Ordenar por score desc, luego por frecuencia desc, luego alfabético
    items.sort(key=lambda x: (-x.score, -x.frecuencia, x.nombre.lower()))

    return DocumentosFrecuentesResponse(
        items=items[:limit],
        total_tramites_analizados=len(set(t.id for t in (tramites_rubro + tramites_match))),
    )
