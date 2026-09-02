# -*- coding: utf-8 -*-
"""Acceso por link a las demos: agrega `municipios.demo_token` y
`municipios.demo_publica`, y le pone llave a las demos que ya existen.

QUE RESUELVE (dueño, 2026-09-02): la grilla de /demo mostraba todas las demos
generadas con un boton "Entrar" y otro de BORRAR, los dos publicos y sin
credencial. Cualquiera entraba a la demo de otro —que puede tener datos
cargados por esa persona— y cualquiera podia borrarla. Ahora la grilla es
vitrina: se ve todo, se entra solo con el link personal de quien la genero.

POR QUE NO ES `alembic upgrade head`: el arbol de Alembic tiene MULTIPLES HEADS
y `upgrade head` falla. Este script hace lo justo, es idempotente y se puede
correr las veces que haga falta.

GUARDA DURA: aborta si la DATABASE_URL apunta a produccion. La misma columna en
produccion la agrega Infra (esta declarada en `promote_schema_prod.py`).

    python backend/scripts/agregar_acceso_demos.py
    python backend/scripts/agregar_acceso_demos.py --muestra merlo
"""
import argparse
import asyncio
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

BASES_PRODUCCION = ("sugerenciasmun", "munify_prod")

COLUMNAS = [
    ("demo_token", "ALTER TABLE `municipios` ADD COLUMN `demo_token` VARCHAR(64) NULL"),
    ("demo_publica", "ALTER TABLE `municipios` ADD COLUMN `demo_publica` "
                     "TINYINT(1) NOT NULL DEFAULT 0"),
]
INDICE = ("ix_municipios_demo_token",
          "CREATE INDEX `ix_municipios_demo_token` ON `municipios` (`demo_token`)")


async def main(muestra: str | None) -> None:
    base = settings.DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    if base in BASES_PRODUCCION:
        print(f"ABORTADO: `{base}` es la base de PRODUCCION. Eso lo ejecuta Infra.")
        return
    print(f"Base destino: {base}")

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            for col, ddl in COLUMNAS:
                existe = await conn.execute(text(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'municipios' "
                    "AND COLUMN_NAME = :c"), {"c": col})
                if existe.scalar():
                    print(f"[SKIP] columna {col} ya existe")
                    continue
                await conn.execute(text(ddl))
                print(f"[OK]   columna {col} creada")

            nombre_ix, ddl_ix = INDICE
            hay_ix = await conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'municipios' "
                "AND INDEX_NAME = :i"), {"i": nombre_ix})
            if hay_ix.scalar():
                print(f"[SKIP] indice {nombre_ix} ya existe")
            else:
                await conn.execute(text(ddl_ix))
                print(f"[OK]   indice {nombre_ix} creado")

            # Llave para las demos que ya estaban. Sin esto quedan cerradas
            # para siempre: nadie tendria como entrar ni borrarlas. Se emite
            # una a cada una y se listan abajo, que es la unica vez que se ven.
            pendientes = await conn.execute(text(
                "SELECT id, codigo FROM municipios "
                "WHERE es_demo = 1 AND (demo_token IS NULL OR demo_token = '')"))
            filas = pendientes.fetchall()
            for mid, codigo in filas:
                await conn.execute(
                    text("UPDATE municipios SET demo_token = :t WHERE id = :i"),
                    {"t": secrets.token_urlsafe(24), "i": mid})
            print(f"[OK]   llave emitida para {len(filas)} demos existentes")

            if muestra:
                r = await conn.execute(
                    text("UPDATE municipios SET demo_publica = 1 "
                         "WHERE codigo = :c AND es_demo = 1"), {"c": muestra})
                print(f"[OK]   `{muestra}` marcado como municipio de muestra"
                      if r.rowcount else
                      f"[AVISO] no se encontro la demo `{muestra}`")

            publicas = await conn.execute(text(
                "SELECT codigo FROM municipios WHERE demo_publica = 1"))
            print("Municipios de muestra (entran sin llave): "
                  + (", ".join(c for (c,) in publicas.fetchall()) or "ninguno"))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--muestra", help="codigo de la demo que se abre sin llave (ej. merlo)")
    args = ap.parse_args()
    asyncio.run(main(args.muestra))
