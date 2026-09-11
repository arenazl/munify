# -*- coding: utf-8 -*-
"""
El pago programado puede tener destino TARJETA (registro formal en
alembic/versions/20260911_programado_tarjeta.py; este script aplica lo mismo,
idempotente, sin pasar por alembic porque QA no lleva la tabla de versiones).

  * tesoreria_pagos_programados.contacto_id  -> NULL permitido
  * tesoreria_pagos_programados.monto_pesos  -> NULL permitido (NULL = paga todo)
  * tesoreria_pagos_programados.tarjeta_caja_id (FK tesoreria_cajas, SET NULL, indice)
  * tesoreria_movimientos_caja.pago_programado_id (FK pagos_programados, SET NULL, indice)

Uso:
    python scripts/migrate_programado_tarjeta.py --env qa --aplicar

Contra produccion la corre Infra con su propio DATABASE_URL:
    DATABASE_URL=<prod> python scripts/migrate_programado_tarjeta.py --env prod --aplicar
"""
import argparse
import asyncio
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

PP = "tesoreria_pagos_programados"
MOV = "tesoreria_movimientos_caja"


async def columnas(c, tabla):
    return {r[0]: r for r in (await c.execute(text(f"SHOW COLUMNS FROM {tabla}"))).all()}


async def indices(c, tabla):
    return {r[2] for r in (await c.execute(text(f"SHOW INDEX FROM {tabla}"))).all()}


async def fks(c, tabla, db_name):
    rows = (await c.execute(text(
        "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS "
        "WHERE TABLE_SCHEMA=:db AND TABLE_NAME=:t AND CONSTRAINT_TYPE='FOREIGN KEY'"
    ), {"db": db_name, "t": tabla})).all()
    return {r[0] for r in rows}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", required=True, choices=["qa", "prod"])
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()
    load_dotenv(".env")
    url = os.environ["DATABASE_URL"]
    db_name = url.rsplit("/", 1)[-1].split("?", 1)[0]
    es_qa = db_name.endswith("-qa")
    if args.env == "qa" and not es_qa:
        print("ABORTA: --env qa pero DATABASE_URL no apunta a una base -qa.")
        return
    if args.env == "prod" and es_qa:
        print("ABORTA: --env prod pero DATABASE_URL apunta a una base -qa.")
        return
    print(f"base: {db_name} ({'APLICA' if args.aplicar else 'EN SECO'})")

    eng = create_async_engine(url)
    async with eng.begin() as c:
        pasos = []
        cols_pp = await columnas(c, PP)
        # Null = 'YES' en la columna 3 de SHOW COLUMNS
        if cols_pp["contacto_id"][2] != "YES":
            pasos.append(f"ALTER TABLE {PP} MODIFY contacto_id INT NULL")
        if cols_pp["monto_pesos"][2] != "YES":
            pasos.append(f"ALTER TABLE {PP} MODIFY monto_pesos DECIMAL(15,2) NULL")
        if "tarjeta_caja_id" not in cols_pp:
            pasos.append(f"ALTER TABLE {PP} ADD COLUMN tarjeta_caja_id INT NULL")
        if "ix_tesoreria_pagos_programados_tarjeta_caja_id" not in await indices(c, PP):
            pasos.append(f"CREATE INDEX ix_tesoreria_pagos_programados_tarjeta_caja_id ON {PP} (tarjeta_caja_id)")
        if "fk_pp_tarjeta_caja" not in await fks(c, PP, db_name):
            pasos.append(f"ALTER TABLE {PP} ADD CONSTRAINT fk_pp_tarjeta_caja FOREIGN KEY (tarjeta_caja_id) "
                         f"REFERENCES tesoreria_cajas(id) ON DELETE SET NULL")

        cols_mov = await columnas(c, MOV)
        if "pago_programado_id" not in cols_mov:
            pasos.append(f"ALTER TABLE {MOV} ADD COLUMN pago_programado_id INT NULL")
        if "ix_tesoreria_movimientos_caja_pago_programado_id" not in await indices(c, MOV):
            pasos.append(f"CREATE INDEX ix_tesoreria_movimientos_caja_pago_programado_id ON {MOV} (pago_programado_id)")
        if "fk_mov_caja_pago_programado" not in await fks(c, MOV, db_name):
            pasos.append(f"ALTER TABLE {MOV} ADD CONSTRAINT fk_mov_caja_pago_programado FOREIGN KEY (pago_programado_id) "
                         f"REFERENCES {PP}(id) ON DELETE SET NULL")

        if not pasos:
            print("nada que hacer: ya esta aplicada")
        for sql in pasos:
            print(("  -> " if args.aplicar else "  (seco) ") + sql)
            if args.aplicar:
                await c.execute(text(sql))
    await eng.dispose()
    print("OK")


if __name__ == "__main__":
    asyncio.run(main())
