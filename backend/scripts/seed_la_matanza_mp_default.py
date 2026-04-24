"""Configura MercadoPago como provider default de La Matanza (muni 78) y
unifica todos sus tramites con costo > 0 en tipo_pago='boton_pago'.

Motivo: el usuario va a probar pagos reales con MP desde La Matanza. El
flujo "boton_pago" es el que soporta el checkout de MP directamente.
Los casos "rapipago"/"adhesion_debito" requeririan GIRE (sigue activo
como fallback).

No persiste credenciales — eso lo hace el admin desde la UI (Ajustes >
Proveedores de Pago > Conectar credenciales reales).

Ejecutar: python backend/scripts/seed_la_matanza_mp_default.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings

MUNI_ID = 78  # La Matanza


async def run():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # 1) Activar MP en La Matanza (upsert)
    async with engine.begin() as conn:
        r = await conn.execute(text("""
            SELECT id, activo, productos_activos FROM municipio_proveedores_pago
            WHERE municipio_id = :m AND proveedor = 'mercadopago'
        """), {"m": MUNI_ID})
        existente = r.first()

        productos_json = '{"boton_pago": true, "qr": true}'

        if existente:
            await conn.execute(text("""
                UPDATE municipio_proveedores_pago
                SET activo = 1,
                    productos_activos = :prods,
                    test_mode = 1
                WHERE id = :id
            """), {"prods": productos_json, "id": existente[0]})
            print(f"OK   MP actualizado para La Matanza (row id {existente[0]})")
        else:
            await conn.execute(text("""
                INSERT INTO municipio_proveedores_pago
                (municipio_id, proveedor, activo, productos_activos, test_mode, created_at)
                VALUES (:m, 'mercadopago', 1, :prods, 1, NOW())
            """), {"m": MUNI_ID, "prods": productos_json})
            print("OK   MP creado para La Matanza")

    # 2) Actualizar todos los tramites con costo > 0 de La Matanza -> boton_pago
    async with engine.begin() as conn:
        # Mostrar antes
        r = await conn.execute(text("""
            SELECT tipo_pago, COUNT(*) FROM tramites
            WHERE municipio_id = :m AND costo > 0 AND activo = 1
            GROUP BY tipo_pago
        """), {"m": MUNI_ID})
        print("\nAntes del update (tipo_pago en La Matanza):")
        for row in r.fetchall():
            print(f"  {row[0]!r}: {row[1]}")

        res = await conn.execute(text("""
            UPDATE tramites
            SET tipo_pago = 'boton_pago',
                momento_pago = 'inicio'
            WHERE municipio_id = :m AND costo > 0 AND activo = 1
        """), {"m": MUNI_ID})
        print(f"\nOK   {res.rowcount} tramites actualizados a tipo_pago='boton_pago', momento='inicio'")

    # 3) Verificar estado final
    async with engine.begin() as conn:
        print("\n== ESTADO FINAL ==")
        r = await conn.execute(text("""
            SELECT proveedor, activo, productos_activos
            FROM municipio_proveedores_pago WHERE municipio_id = :m
            ORDER BY proveedor
        """), {"m": MUNI_ID})
        print("Providers de La Matanza:")
        for row in r.fetchall():
            print(f"  proveedor={row[0]:15s} activo={row[1]}  productos={row[2]}")

        r = await conn.execute(text("""
            SELECT id, nombre, costo, tipo_pago, momento_pago
            FROM tramites WHERE municipio_id = :m AND costo > 0 AND activo = 1
            ORDER BY id
        """), {"m": MUNI_ID})
        print("\nTramites con costo en La Matanza:")
        for row in r.fetchall():
            print(f"  [{row[0]}] {row[1]:40s} ${row[2]:.2f}  {row[3]}/{row[4]}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
