# -*- coding: utf-8 -*-
"""Corre UNA migracion de Alembic contra la base que se le diga, sin `alembic`.

Por que existe: en QA la tabla `alembic_version` esta VACIA -el esquema se fue
armando con scripts ad-hoc- asi que `alembic upgrade head` no sirve: intentaria
correr la historia entera sobre una base que ya la tiene aplicada.

Lo que NO queremos es la salida facil: escribir el SQL dos veces, una en la
migracion (la que corre Infra en produccion) y otra en un script suelto para
QA. Dos copias divergen, y entonces lo que se probo no es lo que se promueve.

Esto carga el ARCHIVO de migracion y ejecuta su `upgrade()` -el mismo codigo,
byte por byte- contra la conexion, enchufandole un `op` de verdad en lugar del
proxy que Alembic arma por su cuenta.

    DATABASE_URL_QA=...  python scripts/correr_migracion.py 20260915_tarjeta_unica
    ...                  python scripts/correr_migracion.py 20260915_tarjeta_unica --downgrade

Solo QA: aborta si el nombre de la base no dice qa. Produccion la promueve
Infra con `alembic upgrade`, que es para lo que la migracion esta escrita.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import sys

from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, text

AQUI = os.path.dirname(os.path.abspath(__file__))
VERSIONES = os.path.join(os.path.dirname(AQUI), "alembic", "versions")


def _sync_url(u: str) -> str:
    u = u.strip()
    if u.startswith("mysql+aiomysql://"):
        return u.replace("mysql+aiomysql://", "mysql+pymysql://", 1)
    if u.startswith("mysql://"):
        return u.replace("mysql://", "mysql+pymysql://", 1)
    return u


def _cargar(nombre: str):
    """Encuentra el archivo de migracion por su revision o por su nombre."""
    candidatos = [f for f in os.listdir(VERSIONES) if f.endswith(".py")]
    exacto = [f for f in candidatos if f[:-3] == nombre]
    if not exacto:
        exacto = [f for f in candidatos if nombre in f]
    if not exacto:
        # por revision id, que es como se la nombra en el handoff
        for f in candidatos:
            ruta = os.path.join(VERSIONES, f)
            with open(ruta, encoding="utf-8") as fh:
                if f'revision: str = "{nombre}"' in fh.read():
                    exacto = [f]
                    break
    if len(exacto) != 1:
        raise SystemExit(f"No se pudo identificar una sola migracion con '{nombre}': {exacto}")
    ruta = os.path.join(VERSIONES, exacto[0])
    spec = importlib.util.spec_from_file_location("migracion_suelta", ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    print(f"migracion: {exacto[0]}  (revision {getattr(mod, 'revision', '?')})")
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("migracion", help="revision id o nombre del archivo")
    ap.add_argument("--downgrade", action="store_true")
    ap.add_argument("--permitir-prod", action="store_true",
                    help="NO usar: produccion la promueve Infra con alembic")
    a = ap.parse_args()

    url = os.environ.get("DATABASE_URL_QA") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Falta DATABASE_URL_QA en el entorno.")

    mod = _cargar(a.migracion)
    engine = create_engine(_sync_url(url))
    with engine.begin() as conn:
        base = conn.execute(text("SELECT DATABASE()")).scalar() or ""
        if "qa" not in base.lower() and not a.permitir_prod:
            raise SystemExit(f"ABORTA: '{base}' no es QA.")
        print(f"base: {base}")

        # El `op` real, en lugar del proxy que arma `alembic upgrade`. La
        # migracion hace `from alembic import op`, asi que alcanza con
        # reemplazar ese nombre en el modulo que acabamos de cargar.
        ctx = MigrationContext.configure(conn)
        mod.op = Operations(ctx)

        if a.downgrade:
            mod.downgrade()
            print("downgrade aplicado")
        else:
            mod.upgrade()
            print("upgrade aplicado")
    engine.dispose()


if __name__ == "__main__":
    main()
