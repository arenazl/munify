"""
QA SOLAMENTE: saca el PIN de todas las demos (dueño, 2026-09-03: "sacá el PIN
numérico para QA"). Pone `demo_protegido = 0` y deja a los usuarios demo de
esas demos con la contraseña `demo123`, que es la que usa el quick-login.

Se niega a correr contra cualquier base que no sea la de QA.
"""
from __future__ import annotations

import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(AQUI)
sys.path.insert(0, BACKEND)

from sqlalchemy import text  # noqa: E402
from core.ambiente import inferir_entorno  # noqa: E402
from core.database import engine  # noqa: E402
from core.security import get_password_hash  # noqa: E402
from services.demo_borrado import PATRONES_EMAIL_DEMO  # noqa: E402


async def main() -> None:
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar() or ""
        if inferir_entorno(db) != "qa":
            raise SystemExit(f"Esta base es '{db}', no QA. No se toca.")
        protegidas = (await conn.execute(text(
            "SELECT id, codigo FROM municipios WHERE es_demo = 1 AND demo_protegido = 1"))).fetchall()
        print("demos con PIN en QA:", [c for _, c in protegidas])
        if not protegidas:
            return
        ids = [i for i, _ in protegidas]
        marcadores = ",".join(f":m{i}" for i in range(len(ids)))
        params = {f"m{i}": mid for i, mid in enumerate(ids)}
        cond_demo = " OR ".join(f"email LIKE :p{i}" for i in range(len(PATRONES_EMAIL_DEMO)))
        params.update({f"p{i}": p for i, p in enumerate(PATRONES_EMAIL_DEMO)})
        r = await conn.execute(text(
            f"UPDATE usuarios SET password_hash = :h "
            f"WHERE municipio_id IN ({marcadores}) AND ({cond_demo})"),
            {"h": get_password_hash("demo123"), **params})
        print("usuarios demo con contraseña demo123:", r.rowcount)
        r = await conn.execute(text(
            f"UPDATE municipios SET demo_protegido = 0 WHERE id IN ({marcadores})"), params)
        print("demos desprotegidas:", r.rowcount)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
