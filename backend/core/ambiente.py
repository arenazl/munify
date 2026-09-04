"""
Qué ambiente es ESTE proceso, inferido por el nombre de la base conectada.

Fuente única para las reglas que cambian entre QA y producción (por ejemplo,
las demos de QA nacen sin PIN). `admin_ops` tiene su propia inferencia con
el marcador `_ambiente`; acá va la versión liviana para el código de negocio,
que no puede depender del router de operaciones.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DB_PROD = "sugerenciasmun"
DB_QA = "sugerenciasmun-qa"


def inferir_entorno(db_name: str) -> str:
    if db_name == DB_QA or (db_name and db_name.endswith("-qa")):
        return "qa"
    if db_name == DB_PROD or db_name == "munify_prod":
        return "prod"
    return "desconocido"


async def nombre_db(db: AsyncSession) -> str:
    return (await db.execute(text("SELECT DATABASE()"))).scalar() or ""


async def es_qa(db: AsyncSession) -> bool:
    """True sólo cuando la conexión apunta a la base de QA."""
    return inferir_entorno(await nombre_db(db)) == "qa"
