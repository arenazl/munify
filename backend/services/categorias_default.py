"""
Wrapper retrocompatible: delega al nuevo `categorias_seed.seed_categorias_municipio`.

El nombre `crear_categorias_default` se mantiene porque es invocado desde
`api/municipios.py` cuando se da de alta un municipio. Ahora siembra
20 categorías (10 reclamo + 10 trámite) per-municipio en lugar del viejo
catálogo global con tabla intermedia.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from services.categorias_seed import seed_categorias_municipio


async def crear_categorias_default(db: AsyncSession, municipio_id: int) -> int:
    """
    Siembra las categorías iniciales del municipio (10 reclamo + 10 trámite).
    Retorna 20 (la cantidad sembrada) para mantener la firma anterior.
    """
    await seed_categorias_municipio(municipio_id, db)
    await db.commit()
    return 20
