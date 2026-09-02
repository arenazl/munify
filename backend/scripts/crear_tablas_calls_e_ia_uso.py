# -*- coding: utf-8 -*-
"""Crea las tablas nuevas (ia_uso, ia_uso_diario, calls_*) y siembra los dos
usuarios del directorio de llamados.

POR QUE NO ES `alembic upgrade head`: el arbol de Alembic de este repo tiene
MULTIPLES HEADS (migraciones viejas sin encadenar) y la base de QA recien
rehecha no tiene version estampada. Correr alembic ahi intentaria replicar toda
la historia sobre una base que ya tiene las tablas. Este script hace lo unico
que hace falta: crear las tablas que faltan, con `checkfirst`, sin tocar nada
de lo que ya existe. Las migraciones quedan igual en el repo para cuando el
arbol se ordene.

GUARDA DURA: aborta si la DATABASE_URL apunta a produccion. Escribir en
produccion es de Infra.

    python backend/scripts/crear_tablas_calls_e_ia_uso.py            # crea tablas
    python backend/scripts/crear_tablas_calls_e_ia_uso.py --usuarios # + siembra usuarios
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402
from core.database import Base  # noqa: E402
from core.security import get_password_hash  # noqa: E402
from models.calls import CallsEvento, CallsRegistro, CallsUsuario  # noqa: E402
from models.ia_uso import IaUso, IaUsoDiario  # noqa: E402

BASES_PRODUCCION = ("sugerenciasmun", "munify_prod")

TABLAS = [
    IaUso.__table__,
    IaUsoDiario.__table__,
    CallsUsuario.__table__,
    CallsRegistro.__table__,
    CallsEvento.__table__,
]

# Las claves las define el dueño; se guardan hasheadas (bcrypt), nunca en claro.
USUARIOS = [
    {"usuario": "lucas", "nombre": "Lucas", "clave": os.environ.get("CLAVE_LUCAS", "")},
    {"usuario": "sofi", "nombre": "Sofía", "clave": os.environ.get("CLAVE_SOFI", "")},
]


async def main(sembrar: bool) -> None:
    base = settings.DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    if base in BASES_PRODUCCION:
        print(f"ABORTADO: `{base}` es la base de PRODUCCION. Eso lo ejecuta Infra.")
        return
    print(f"Base destino: {base}")

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, tables=TABLAS, checkfirst=True)
        print("Tablas creadas/verificadas: " + ", ".join(t.name for t in TABLAS))

        if not sembrar:
            print("(sin --usuarios: no se sembro ningun usuario)")
            return

        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as s:
            for u in USUARIOS:
                if not u["clave"]:
                    print(f"  {u['usuario']}: SALTEADO (falta la clave en el entorno)")
                    continue
                fila = (await s.execute(
                    select(CallsUsuario).where(CallsUsuario.usuario == u["usuario"])
                )).scalar_one_or_none()
                if fila:
                    # Reset de clave: el dueño la cambia sin tener que borrar la fila.
                    fila.password_hash = get_password_hash(u["clave"])
                    fila.activo = True
                    print(f"  {u['usuario']}: clave actualizada")
                else:
                    s.add(CallsUsuario(
                        usuario=u["usuario"],
                        nombre=u["nombre"],
                        password_hash=get_password_hash(u["clave"]),
                    ))
                    print(f"  {u['usuario']}: creado")
            await s.commit()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--usuarios" in sys.argv))
