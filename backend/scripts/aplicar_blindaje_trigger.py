"""Crea el trigger `municipios_blindaje`. SOLO el trigger: no toca schema ni datos.

Por que existe separado de `aplicar_20260904_blindaje.py`: aquel hace TRES cosas
—agrega `municipios.provincia`, la rellena desde `demo_seed_logs` y crea el
trigger—. Las dos primeras son de la auditoria de demos (filtro por provincia) y
NO hacen falta para blindar: el trigger solo mira `OLD.id` y `OLD.codigo`.
Meter un ALTER TABLE en produccion para proteger tres municipios de un DELETE es
cambiar mas de lo que el problema pide. Este script hace lo minimo.

Es idempotente (DROP IF EXISTS + CREATE) y se puede correr las veces que haga
falta. No borra nada, no modifica ninguna fila.

QUE PROTEGE
    id = 80              San Pedro Norte, el unico cliente productivo.
    codigo = 'asuncion'  Paraguay Limpio, la demo de venta white-label.
    codigo = 'merlo'     el SANDBOX DE PRODUCCION (dueno, 2026-09-10): ahi se
                         prueban los circuitos de un hotfix, para no escribir
                         nunca sobre los datos de un cliente real.

Es la ULTIMA barrera, detras de `services/demo_borrado.es_intocable`. Existe
porque el borrado en cascada corre con `FOREIGN_KEY_CHECKS = 0`, y eso apaga las
FK pero NO apaga los triggers. Tambien tapa el caso que el codigo no puede tapar:
alguien con un cliente SQL en la mano.

Se blinda por CODIGO y no por id porque el id cambia entre bases —Merlo es 153 en
QA y 1000149 en produccion— y el nombre no es clave: hay cuatro municipios
argentinos llamados "Merlo".

Uso:
    python scripts/aplicar_blindaje_trigger.py            # usa DATABASE_URL del .env
    DATABASE_URL="<prod>" python scripts/aplicar_blindaje_trigger.py    # Infra, prod
"""
from __future__ import annotations

import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402

SQL_DROP = "DROP TRIGGER IF EXISTS municipios_blindaje"

SQL_CREATE = """
CREATE TRIGGER municipios_blindaje BEFORE DELETE ON municipios
FOR EACH ROW
BEGIN
    IF OLD.id = 80 OR LOWER(OLD.codigo) IN ('asuncion', 'merlo') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Municipio blindado: no se borra (SPN, asuncion, merlo)';
    END IF;
END
"""


async def main() -> None:
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print("Base:", db)

        # Antes de crear nada: que filas va a proteger EN ESTA BASE. Si el
        # codigo no coincide, el trigger existe y no protege a nadie — que se
        # vea aca y no el dia que alguien borra la demo.
        filas = (await conn.execute(text(
            "SELECT id, codigo, nombre FROM municipios "
            "WHERE id = 80 OR LOWER(codigo) IN ('asuncion', 'merlo') "
            "ORDER BY id"
        ))).fetchall()
        print("Municipios que quedan protegidos en esta base: %d" % len(filas))
        for f in filas:
            print("   id=%-9s codigo=%-18r %s" % (f.id, f.codigo, f.nombre))
        if not filas:
            print("AVISO: ninguna fila coincide. El trigger se crea igual, pero")
            print("       revisa los `codigo` antes de darlo por blindado.")

        await conn.execute(text(SQL_DROP))
        await conn.execute(text(SQL_CREATE))
        print("\ntrigger municipios_blindaje: creado")
        print("triggers sobre municipios:",
              [t[0] for t in (await conn.execute(
                  text("SHOW TRIGGERS LIKE 'municipios'"))).fetchall()])
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
