"""
Migracion: simplificar conceptos quitando la dependencia obligatoria con
tipos_concepto. Especificamente para San Pedro Norte (sugerencia user
14-may-2026), aplicable a cualquier muni.

Plan:
 1) ALTER tesoreria_conceptos: tipo_concepto_id -> NULLABLE.
 2) Por cada muni que tenga modulo tesoreria activo:
    a) Crear (o reusar) un tipo "General" idempotente.
    b) Marcar los conceptos viejos como activo=False (los preserva para
       no orfanar gastos historicos que ya los referencian).
    c) Insertar los 32 nuevos apuntando al tipo "General".
"""
import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

sys.path.insert(0, '/d/Code/sugerenciasMun/backend')
sys.path.insert(0, 'backend')
sys.path.insert(0, '.')

from core.config import settings  # noqa: E402

# Listado curado: 32 conceptos planos por verbo
NUEVOS_CONCEPTOS = [
    # Pagos
    "Pago de sueldos y jornales",
    "Pago de aguinaldo / SAC",
    "Pago de honorarios profesionales",
    "Pago de viaticos y movilidad",
    "Pago de servicios publicos (luz, agua, gas)",
    "Pago de Internet y telefonia",
    "Pago de alquileres",
    "Pago de seguros",
    "Pago de impuestos y tasas",
    "Pago de gastos bancarios",
    "Pago de prestamos / devoluciones",
    "Pagos varios",
    # Compras
    "Compra de combustible",
    "Compra de materiales de obra",
    "Compra de materiales de oficina",
    "Compra de insumos de limpieza",
    "Compra de herramientas y equipamiento",
    "Compras varias",
    # Reparaciones
    "Reparacion de vehiculos",
    "Reparacion de edificios e instalaciones",
    "Reparacion de equipos (aire, computadoras, etc.)",
    "Reparaciones varias",
    # Contrataciones
    "Contratacion de fletes y transporte",
    "Contratacion de eventos y actividades culturales",
    "Contratacion de servicios profesionales",
    "Contrataciones varias",
    # Aportes
    "Aporte a salud / prestaciones medicas",
    "Aporte a subsidios y ayudas sociales",
    "Aportes varios",
    # Obras
    "Obra publica / construccion",
    "Obras varias",
    # Cierre
    "Otros gastos",
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:

        # 1) tipo_concepto_id -> NULLABLE
        try:
            await conn.execute(text(
                "ALTER TABLE tesoreria_conceptos "
                "MODIFY COLUMN tipo_concepto_id INT NULL"
            ))
            print("[OK] tesoreria_conceptos.tipo_concepto_id ahora es NULLABLE")
        except Exception as e:
            print(f"[SKIP] ALTER: {e}")

        # 2) Por cada muni con modulo tesoreria
        munis = (await conn.execute(text("""
            SELECT DISTINCT m.id, m.nombre, m.codigo
            FROM municipios m
            JOIN municipio_modulos mm ON mm.municipio_id = m.id
            WHERE mm.modulo = 'tesoreria' AND mm.activo = 1
            ORDER BY m.id
        """))).fetchall()

        if not munis:
            print("[WARN] No hay municipios con modulo tesoreria activo.")
            return

        for muni in munis:
            muni_id, muni_nombre, muni_codigo = muni
            print(f"\n--- Municipio {muni_id} ({muni_codigo} / {muni_nombre}) ---")

            # a) Tipo "General" idempotente
            general_row = (await conn.execute(text("""
                SELECT id FROM tesoreria_tipos_concepto
                WHERE municipio_id = :mid AND nombre = 'General' LIMIT 1
            """), {"mid": muni_id})).fetchone()

            if general_row:
                general_id = general_row[0]
                print(f"  Tipo 'General' ya existe (id={general_id})")
            else:
                res = await conn.execute(text("""
                    INSERT INTO tesoreria_tipos_concepto
                        (municipio_id, nombre, descripcion, orden, activo)
                    VALUES (:mid, 'General', 'Concepto general (listado plano)', 0, 1)
                """), {"mid": muni_id})
                general_id = res.lastrowid
                print(f"  Tipo 'General' creado (id={general_id})")

            # b) Marcar conceptos viejos como inactivos (los que NO son 'General')
            r = await conn.execute(text("""
                UPDATE tesoreria_conceptos
                SET activo = 0
                WHERE municipio_id = :mid AND (tipo_concepto_id IS NULL OR tipo_concepto_id != :gid)
            """), {"mid": muni_id, "gid": general_id})
            print(f"  Conceptos viejos marcados inactivos: {r.rowcount}")

            # c) Insertar los 32 nuevos (idempotente por nombre dentro del muni)
            existentes = {row[0] for row in (await conn.execute(text("""
                SELECT nombre FROM tesoreria_conceptos
                WHERE municipio_id = :mid AND tipo_concepto_id = :gid
            """), {"mid": muni_id, "gid": general_id})).fetchall()}

            inserted = 0
            for orden, nombre in enumerate(NUEVOS_CONCEPTOS):
                if nombre in existentes:
                    # Reactivar si estaba inactivo
                    await conn.execute(text("""
                        UPDATE tesoreria_conceptos
                        SET activo = 1, orden = :orden
                        WHERE municipio_id = :mid AND tipo_concepto_id = :gid AND nombre = :nombre
                    """), {"orden": orden, "mid": muni_id, "gid": general_id, "nombre": nombre})
                else:
                    await conn.execute(text("""
                        INSERT INTO tesoreria_conceptos
                            (municipio_id, tipo_concepto_id, nombre, descripcion, orden, activo)
                        VALUES (:mid, :gid, :nombre, NULL, :orden, 1)
                    """), {"mid": muni_id, "gid": general_id, "nombre": nombre, "orden": orden})
                    inserted += 1
            print(f"  Conceptos nuevos insertados/reactivados: {inserted}/{len(NUEVOS_CONCEPTOS)}")

    await engine.dispose()
    print("\n[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
