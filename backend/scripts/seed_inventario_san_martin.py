"""Siembra el módulo de inventario en San Martín (muni 120, demo).

- Activa el flag `inventario`.
- Siembra categorías template + ítems demo (idempotente).
- Vincula recursos a 1-2 OTs vigentes para mostrar el circuito en la demo
  (un activo queda `en_uso`, un consumible queda planeado para descontar).

Datos demo genéricos (numeración interna, no patentes reales).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal  # noqa: E402
from models import (  # noqa: E402
    Municipio, OrdenTrabajo, InventarioItem, OrdenTrabajoRecurso,
    EstadoActivo, NaturalezaInventario, TipoRecursoOT, EstadoOrdenTrabajo,
)
from services.inventario_seed import seed_inventario, activar_modulo_inventario  # noqa: E402

MUNI_ID = 145  # General San Martín (caso de demo)


async def run():
    async with AsyncSessionLocal() as db:
        muni = (await db.execute(select(Municipio).where(Municipio.id == MUNI_ID))).scalar_one_or_none()
        if not muni:
            print(f"[ERROR] No existe el municipio {MUNI_ID}")
            return
        print(f"Municipio {MUNI_ID}: {muni.nombre}")

        await activar_modulo_inventario(db, MUNI_ID)
        res = await seed_inventario(db, MUNI_ID, incluir_demo=True)
        await db.commit()
        print(f"Flag 'inventario' activado. Categorías creadas: {res['categorias']}, ítems creados: {res['items']}")

        # Vincular recursos a OTs vigentes para que la demo muestre el cruce.
        ots = (await db.execute(
            select(OrdenTrabajo).where(
                OrdenTrabajo.municipio_id == MUNI_ID,
                OrdenTrabajo.estado.in_([EstadoOrdenTrabajo.ASIGNADA, EstadoOrdenTrabajo.EN_CURSO]),
            ).order_by(OrdenTrabajo.id).limit(2)
        )).scalars().all()

        activos = (await db.execute(
            select(InventarioItem).where(
                InventarioItem.municipio_id == MUNI_ID,
                InventarioItem.naturaleza == NaturalezaInventario.ACTIVO,
                InventarioItem.estado_activo == EstadoActivo.DISPONIBLE,
            ).order_by(InventarioItem.id).limit(4)
        )).scalars().all()
        consumibles = (await db.execute(
            select(InventarioItem).where(
                InventarioItem.municipio_id == MUNI_ID,
                InventarioItem.naturaleza == NaturalezaInventario.CONSUMIBLE,
            ).order_by(InventarioItem.id).limit(4)
        )).scalars().all()

        async def ya_vinculado(ot_id, item_id):
            return (await db.execute(select(OrdenTrabajoRecurso.id).where(
                OrdenTrabajoRecurso.orden_trabajo_id == ot_id,
                OrdenTrabajoRecurso.item_id == item_id,
            ))).scalar_one_or_none() is not None

        vinculos = 0
        for idx, ot in enumerate(ots):
            if idx < len(activos):
                act = activos[idx]
                if not await ya_vinculado(ot.id, act.id):
                    db.add(OrdenTrabajoRecurso(
                        orden_trabajo_id=ot.id, item_id=act.id,
                        tipo=TipoRecursoOT.RESERVA, item_nombre=act.nombre,
                    ))
                    act.estado_activo = EstadoActivo.EN_USO
                    act.ocupado_por_ot_id = ot.id
                    vinculos += 1
            if idx < len(consumibles):
                con = consumibles[idx]
                if not await ya_vinculado(ot.id, con.id):
                    db.add(OrdenTrabajoRecurso(
                        orden_trabajo_id=ot.id, item_id=con.id,
                        tipo=TipoRecursoOT.CONSUMO, cantidad=5, item_nombre=con.nombre,
                    ))
                    vinculos += 1
        await db.commit()
        print(f"OTs vigentes usadas: {len(ots)}. Recursos vinculados: {vinculos}")


if __name__ == "__main__":
    asyncio.run(run())
