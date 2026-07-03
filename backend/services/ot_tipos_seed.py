"""Semilla de tipos de trabajo de OT — template genérico configurable.

Mismo criterio que las categorías de reclamo / inventario: se siembra un set
amplio que el municipio customiza. Idempotente (match por nombre).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import OrdenTrabajoTipo


# (nombre, icono, color, orden)
TEMPLATE_TIPOS = [
    ("Poda", "TreeDeciduous", "#22c55e", 1),
    ("Bacheo", "Construction", "#f59e0b", 2),
    ("Alumbrado", "Lightbulb", "#eab308", 3),
    ("Limpieza", "Sparkles", "#06b6d4", 4),
    ("Recolección", "Truck", "#3b82f6", 5),
    ("Mantenimiento", "Wrench", "#8b5cf6", 6),
    ("Obra", "HardHat", "#ef4444", 7),
    ("Señalización", "TrafficCone", "#f97316", 8),
    ("Preventivo", "CalendarClock", "#64748b", 9),
    ("Otro", "Tag", "#78716c", 10),
]


async def seed_tipos_trabajo(db: AsyncSession, municipio_id: int) -> int:
    """Siembra el template de tipos de trabajo. Devuelve cuántos creó."""
    existentes = {
        n for n in (await db.execute(
            select(OrdenTrabajoTipo.nombre).where(OrdenTrabajoTipo.municipio_id == municipio_id)
        )).scalars().all()
    }
    creados = 0
    for nombre, icono, color, orden in TEMPLATE_TIPOS:
        if nombre in existentes:
            continue
        db.add(OrdenTrabajoTipo(
            municipio_id=municipio_id, nombre=nombre, icono=icono, color=color, orden=orden, activo=True,
        ))
        creados += 1
    await db.flush()
    return creados
