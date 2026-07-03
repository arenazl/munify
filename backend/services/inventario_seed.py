"""Semilla del módulo de inventario.

`TEMPLATE_CATEGORIAS` es el template genérico que arranca todo municipio
(igual criterio que las categorías de reclamo): rubros amplios con su
naturaleza (activo | consumible). El municipio después lo customiza.

`ITEMS_DEMO` son ítems de ejemplo para las demos. Datos claramente demo:
los vehículos/máquinas usan numeración interna municipal ("Móvil 1"),
NO patentes inventadas. El stock son cantidades plausibles, no reales.

`seed_inventario(db, municipio_id, incluir_demo)` es idempotente: no
duplica categorías ni ítems ya existentes (match por nombre).
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import InventarioCategoria, InventarioItem
from models.enums import NaturalezaInventario, EstadoActivo


# (nombre, icono, color, naturaleza, orden)
TEMPLATE_CATEGORIAS = [
    ("Vehículos", "Truck", "#3b82f6", NaturalezaInventario.ACTIVO, 1),
    ("Maquinaria", "Forklift", "#6366f1", NaturalezaInventario.ACTIVO, 2),
    ("Herramientas", "Wrench", "#8b5cf6", NaturalezaInventario.ACTIVO, 3),
    ("Materiales", "Package", "#10b981", NaturalezaInventario.CONSUMIBLE, 4),
    ("Insumos", "Container", "#f59e0b", NaturalezaInventario.CONSUMIBLE, 5),
]

# categoria -> lista de ítems.
# Activos:     (nombre, identificador)
# Consumibles: (nombre, stock_actual, stock_minimo, unidad)
ITEMS_DEMO_ACTIVOS = {
    "Vehículos": [
        ("Camioneta utilitaria", "Móvil 1"),
        ("Camión volcador", "Móvil 2"),
        ("Camioneta 4x4", "Móvil 3"),
    ],
    "Maquinaria": [
        ("Retroexcavadora", "Máquina 1"),
        ("Motoniveladora", "Máquina 2"),
    ],
    "Herramientas": [
        ("Motosierra", "Herramienta 1"),
        ("Hidrolavadora", "Herramienta 2"),
        ("Grupo electrógeno", "Herramienta 3"),
    ],
}
ITEMS_DEMO_CONSUMIBLES = {
    "Materiales": [
        ("Cemento Portland 50kg", 40, 10, "bolsas"),
        ("Arena", 15, 5, "m3"),
        ("Caño PVC 110mm", 60, 20, "u"),
        ("Tosca", 8, 3, "m3"),
    ],
    "Insumos": [
        ("Guantes de trabajo", 50, 12, "pares"),
        ("Pintura vial", 12, 4, "l"),
        ("Lámpara LED 150W", 25, 8, "u"),
    ],
}


async def seed_inventario(db: AsyncSession, municipio_id: int, incluir_demo: bool = True) -> dict:
    """Siembra categorías template (y opcionalmente ítems demo) para un muni.

    Idempotente: saltea lo que ya exista (match por nombre). Devuelve conteos.
    """
    # --- Categorías template ---
    existentes = {
        c.nombre: c for c in (await db.execute(
            select(InventarioCategoria).where(InventarioCategoria.municipio_id == municipio_id)
        )).scalars().all()
    }
    cats_por_nombre = dict(existentes)
    cats_creadas = 0
    for nombre, icono, color, naturaleza, orden in TEMPLATE_CATEGORIAS:
        if nombre in cats_por_nombre:
            continue
        cat = InventarioCategoria(
            municipio_id=municipio_id, nombre=nombre, icono=icono, color=color,
            naturaleza=naturaleza, orden=orden, activo=True,
        )
        db.add(cat)
        cats_por_nombre[nombre] = cat
        cats_creadas += 1
    await db.flush()

    if not incluir_demo:
        return {"categorias": cats_creadas, "items": 0}

    # --- Ítems demo ---
    items_existentes = {
        i.nombre for i in (await db.execute(
            select(InventarioItem.nombre).where(InventarioItem.municipio_id == municipio_id)
        )).scalars().all()
    }
    items_creados = 0

    for cat_nombre, items in ITEMS_DEMO_ACTIVOS.items():
        cat = cats_por_nombre.get(cat_nombre)
        if not cat:
            continue
        for nombre, identificador in items:
            if nombre in items_existentes:
                continue
            db.add(InventarioItem(
                municipio_id=municipio_id, categoria_id=cat.id, nombre=nombre,
                naturaleza=NaturalezaInventario.ACTIVO, identificador=identificador,
                estado_activo=EstadoActivo.DISPONIBLE, activo=True,
            ))
            items_creados += 1

    for cat_nombre, items in ITEMS_DEMO_CONSUMIBLES.items():
        cat = cats_por_nombre.get(cat_nombre)
        if not cat:
            continue
        for nombre, stock, minimo, unidad in items:
            if nombre in items_existentes:
                continue
            db.add(InventarioItem(
                municipio_id=municipio_id, categoria_id=cat.id, nombre=nombre,
                naturaleza=NaturalezaInventario.CONSUMIBLE,
                stock_actual=float(stock), stock_minimo=float(minimo), unidad=unidad,
                activo=True,
            ))
            items_creados += 1

    await db.flush()
    return {"categorias": cats_creadas, "items": items_creados}


async def activar_modulo_inventario(db: AsyncSession, municipio_id: int) -> None:
    """Activa (o crea) el flag `inventario` en municipio_modulos."""
    from models.municipio_modulo import MunicipioModulo
    row = (await db.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == municipio_id,
            MunicipioModulo.modulo == "inventario",
        )
    )).scalar_one_or_none()
    if row:
        row.activo = True
    else:
        db.add(MunicipioModulo(municipio_id=municipio_id, modulo="inventario", activo=True))
    await db.flush()
