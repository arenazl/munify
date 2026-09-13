"""Catálogo de tipos de persona: semilla por municipio y espejo con el enum viejo.

Por qué existe: los cuatro demos creados entre el 06 y el 12 de septiembre nacieron sin
catálogo y dejaron 80 contactos sin rol (`docs/tesoreria/03-...md`, hallazgo 2). El alta
de municipio y el creador de demos llaman a `sembrar_persona_tipos`; el script
`scripts/migrar_personas_parte_a.py` hace lo mismo para los que ya existían.

`tipo_legacy` es la regla de convivencia con el backend publicado: `contactos.tipo` es un
ENUM de MySQL con siete valores fijos y el código viejo lo valida al leer. Mientras ese
código viva, el tipo REAL vive en `persona_roles` y en la columna vieja se escribe
siempre el valor legacy más cercano. Nunca un valor nuevo.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.persona import PersonaTipo

# codigo, nombre, orden, cobra, activo. Los siete del enum viejo, en el mismo orden de
# negocio. "otro" nace APAGADO en los municipios nuevos (dueño, 2026-09-13): es la bolsa
# de "no sé qué es" y sale del circuito; San Pedro Norte lo conserva activo hasta curar
# sus fichas. Cada municipio agrega o apaga tipos desde Configuración.
TIPOS_SEMILLA = (
    ("empleado",     "Empleado",     10, True, True),
    ("proveedor",    "Proveedor",    20, True, True),
    ("contratista",  "Contratista",  30, True, True),
    ("profesional",  "Profesional",  40, True, True),
    ("concejal",     "Concejal",     50, True, True),
    ("beneficiario", "Beneficiario", 60, True, True),
    ("otro",         "Otro",         90, True, False),
)

# Valores que el enum `contactos.tipo` acepta hoy. Un tipo nuevo del catálogo
# (p. ej. "organismo") se espeja al legacy más cercano.
LEGACY = {t[0] for t in TIPOS_SEMILLA}
ESPEJO_POR_DEFECTO = "otro"


def tipo_legacy(codigo: str | None) -> str:
    """El valor que va en `contactos.tipo` para un código del catálogo."""
    if codigo in LEGACY:
        return codigo
    return ESPEJO_POR_DEFECTO


async def sembrar_persona_tipos(db: AsyncSession, municipio_id: int) -> int:
    """Crea los tipos base que le falten al municipio. Idempotente. Devuelve cuántos creó."""
    existentes = set((await db.execute(
        select(PersonaTipo.codigo).where(PersonaTipo.municipio_id == municipio_id)
    )).scalars().all())
    creados = 0
    for codigo, nombre, orden, cobra, activo in TIPOS_SEMILLA:
        if codigo in existentes:
            continue
        db.add(PersonaTipo(municipio_id=municipio_id, codigo=codigo, nombre=nombre,
                           orden=orden, cobra=cobra, activo=activo))
        creados += 1
    if creados:
        await db.flush()
    return creados
