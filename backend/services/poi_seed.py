"""Semilla de tipos de Punto de Interés — template genérico configurable.

Mismo criterio que las categorías de reclamo / tipos de OT: se siembra un set
amplio que el municipio customiza. Idempotente (match por nombre).

Iconos: nombres válidos de lucide-react (PascalCase), cero emojis. `radio_default`
es el radio sugerido (m) al crear un POI de ese tipo (D15: default global 2.000 m).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PoiTipo
from models.municipio_modulo import MunicipioModulo


# (nombre, icono_lucide, color, radio_default_metros, orden)
TEMPLATE_TIPOS = [
    ("Hospital", "Hospital", "#ef4444", 2000, 1),
    ("Salita", "Stethoscope", "#ec4899", 1500, 2),
    ("Escuela", "School", "#3b82f6", 1000, 3),
    ("Jardín", "Baby", "#f59e0b", 800, 4),
    ("Bomberos", "Flame", "#f97316", 2000, 5),
    ("Comisaría", "Shield", "#6366f1", 1500, 6),
    ("Geriátrico", "Accessibility", "#8b5cf6", 1000, 7),
    ("Club", "Trophy", "#06b6d4", 800, 8),
    ("Plaza", "Trees", "#22c55e", 500, 9),
]


async def seed_poi_tipos(db: AsyncSession, municipio_id: int) -> int:
    """Siembra el template de tipos de POI. Devuelve cuántos creó. Idempotente."""
    existentes = {
        n for n in (await db.execute(
            select(PoiTipo.nombre).where(PoiTipo.municipio_id == municipio_id)
        )).scalars().all()
    }
    creados = 0
    for nombre, icono, color, radio_default, orden in TEMPLATE_TIPOS:
        if nombre in existentes:
            continue
        db.add(PoiTipo(
            municipio_id=municipio_id, nombre=nombre, icono=icono, color=color,
            radio_default_metros=radio_default, orden=orden, activo=True,
        ))
        creados += 1
    await db.flush()
    return creados


async def activar_modulo_poi(db: AsyncSession, municipio_id: int) -> None:
    """Activa (o crea) el flag `poi` en municipio_modulos."""
    row = (await db.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == municipio_id,
            MunicipioModulo.modulo == "poi",
        )
    )).scalar_one_or_none()
    if row:
        row.activo = True
    else:
        db.add(MunicipioModulo(municipio_id=municipio_id, modulo="poi", activo=True))
    await db.flush()
