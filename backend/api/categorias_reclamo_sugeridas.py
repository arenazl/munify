"""
API del catálogo global de categorías de reclamo sugeridas (cross-municipios).

Solo expone lectura con filtro por texto. La tabla se puebla una vez por
deploy con `scripts/seed_categorias_reclamo_sugeridas.py`.

Usado por el autocomplete del wizard admin en `/gestion/categorias-reclamo`
para que el admin pueda elegir una categoría típica y precargar sus
campos (nombre, descripción, ícono, color, tiempo, prioridad) en lugar de
tipearlo todo desde cero.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List, Optional

from core.database import get_db
from core.security import get_current_user
from models.categoria_reclamo_sugerida import CategoriaReclamoSugerida
from models.user import User
from schemas.categoria_reclamo_sugerida import CategoriaReclamoSugeridaResponse

router = APIRouter()


def _score_match(nombre: str, descripcion: Optional[str], q_lower: str) -> int:
    """
    Score de relevancia (menor = mejor), mismo patrón que
    `tramites_sugeridos`. Prioriza: prefix > contains en nombre >
    match en descripción.
    """
    nombre_lower = (nombre or "").lower()
    desc_lower = (descripcion or "").lower()

    if nombre_lower.startswith(q_lower):
        return len(nombre)
    idx_nombre = nombre_lower.find(q_lower)
    if idx_nombre >= 0:
        return 100 + idx_nombre
    idx_desc = desc_lower.find(q_lower)
    if idx_desc >= 0:
        return 300 + idx_desc
    return 9999


@router.get("", response_model=List[CategoriaReclamoSugeridaResponse])
async def listar_categorias_reclamo_sugeridas(
    q: Optional[str] = Query(None, description="Texto de búsqueda (fuzzy)"),
    limit: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca sugerencias del catálogo global por texto parcial en nombre o
    descripción. Sin query devuelve todas ordenadas alfabéticamente.
    """
    query = select(CategoriaReclamoSugerida)

    q_clean = (q or "").strip()
    if q_clean:
        pattern = f"%{q_clean}%"
        query = query.where(
            or_(
                CategoriaReclamoSugerida.nombre.ilike(pattern),
                CategoriaReclamoSugerida.descripcion.ilike(pattern),
            )
        )
        # Traer más candidatos para reordenar en Python
        query = query.limit(max(limit * 3, 50))
    else:
        query = query.order_by(CategoriaReclamoSugerida.nombre.asc()).limit(limit)

    result = await db.execute(query)
    items = list(result.scalars().all())

    if q_clean:
        q_lower = q_clean.lower()
        items.sort(
            key=lambda it: (
                _score_match(it.nombre, it.descripcion, q_lower),
                it.nombre.lower(),
            )
        )
        items = items[:limit]

    return items
