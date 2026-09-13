"""Consolidación de Tesorería — PARTE B1: la tabla pasa a llamarse `personas`.

Plan: `docs/tesoreria/02-plan-consolidacion.md`.

`RENAME TABLE` en MySQL es una operación de METADATA: no toca una sola fila y las
foreign keys que apuntan a la tabla se actualizan solas en el catálogo. Los 8.423
gastos, los 272 pagos programados y las 20 órdenes de pago de San Pedro Norte
siguen apuntando exactamente al mismo id.

Y como el nombre de una tabla no viaja en el JSON, **esto no cambia ninguna
respuesta de la API**: después de correrlo, el gate de paridad tiene que seguir
dando DIFERENCIA CERO. Si da otra cosa, algo más se rompió.

El código que nombra la tabla se cambia en el mismo commit:
  - `models/contacto.py`      __tablename__
  - `models/gasto.py`, `models/orden_pago.py`, `models/tesoreria_extra.py`   FK
  - `services/dashboard_ia.py`   3 JOIN de SQL crudo

Es idempotente y reversible con `--revertir`.

    python scripts/migrar_personas_parte_b1.py --dry-run
    python scripts/migrar_personas_parte_b1.py
    python scripts/migrar_personas_parte_b1.py --revertir   # vuelve a `contactos`
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402


async def _existe(conn, tabla):
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema=DATABASE() AND table_name=:n"), {"n": tabla})
    return r.scalar() > 0


async def correr(dry_run: bool, revertir: bool):
    origen, destino = ("personas", "contactos") if revertir else ("contactos", "personas")
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base: {db}")
        if "prod" in (db or "").lower():
            raise SystemExit("ABORTADO: esto no se corre contra producción.")

        if not await _existe(conn, origen):
            if await _existe(conn, destino):
                print(f"\nNada que hacer: la tabla ya se llama `{destino}`.")
                await engine.dispose()
                return
            raise SystemExit(f"No existe ni `{origen}` ni `{destino}`. Algo anda mal.")

        filas = (await conn.execute(text(f"SELECT COUNT(*) FROM {origen}"))).scalar()
        # Las FK entrantes que se van a re-apuntar solas.
        r = await conn.execute(text("""
            SELECT table_name, column_name FROM information_schema.key_column_usage
             WHERE table_schema=DATABASE() AND referenced_table_name=:t
             ORDER BY table_name"""), {"t": origen})
        entrantes = r.fetchall()

        print(f"\n`{origen}` tiene {filas} filas y {len(entrantes)} claves que la apuntan:")
        for tabla, columna in entrantes:
            print(f"    {tabla}.{columna}")

        if dry_run:
            print(f"\nSE HARÍA: RENAME TABLE {origen} TO {destino}")
        else:
            await conn.execute(text(f"RENAME TABLE {origen} TO {destino}"))
            print(f"\nHECHO: RENAME TABLE {origen} TO {destino}")

    if not dry_run:
        # Verificación: mismas filas, mismas claves entrantes, ahora contra el nombre nuevo.
        async with engine.connect() as conn:
            filas2 = (await conn.execute(text(f"SELECT COUNT(*) FROM {destino}"))).scalar()
            r = await conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.key_column_usage
                 WHERE table_schema=DATABASE() AND referenced_table_name=:t"""), {"t": destino})
            entrantes2 = r.scalar()
            print(f"\nVerificación: {filas2} filas (antes {filas}) · "
                  f"{entrantes2} claves entrantes (antes {len(entrantes)})")
            if filas2 != filas or entrantes2 != len(entrantes):
                raise SystemExit("LAS CUENTAS NO DAN. Revisar antes de seguir.")
            print("Coincide. Ninguna fila se movió y ninguna clave se perdió.")
            print("\nAhora: reiniciar el backend y correr el gate — debe dar DIFERENCIA CERO.")

    await engine.dispose()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revertir", action="store_true")
    a = ap.parse_args()
    asyncio.run(correr(a.dry_run, a.revertir))
