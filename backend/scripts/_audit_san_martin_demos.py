"""Read-only: compara completitud de los munis demo san-martin (120 y 121)."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.user import User  # noqa: E402
from models.reclamo import Reclamo  # noqa: E402
from models.tramite import Tramite, Solicitud  # noqa: E402
from models.categoria_reclamo import CategoriaReclamo  # noqa: E402
from models.municipio_dependencia import MunicipioDependencia  # noqa: E402
from models.municipio import Municipio  # noqa: E402
from models.municipio_modulo import MunicipioModulo  # noqa: E402
from models.barrio import Barrio  # noqa: E402


async def count(db, model, muni_id, col="municipio_id"):
    return (await db.execute(
        select(func.count()).select_from(model).where(getattr(model, col) == muni_id)
    )).scalar()


async def main():
    async with AsyncSessionLocal() as db:
        for mid in (120, 121):
            m = (await db.execute(select(Municipio).where(Municipio.id == mid))).scalar_one()
            users = await count(db, User, mid)
            reclamos = await count(db, Reclamo, mid)
            tramites = await count(db, Tramite, mid)
            categorias = await count(db, CategoriaReclamo, mid)
            deps = await count(db, MunicipioDependencia, mid)
            barrios = await count(db, Barrio, mid)
            mods = (await db.execute(
                select(MunicipioModulo.modulo, MunicipioModulo.activo)
                .where(MunicipioModulo.municipio_id == mid)
            )).all()
            sols = (await db.execute(
                select(func.count()).select_from(Solicitud)
                .join(Tramite, Solicitud.tramite_id == Tramite.id)
                .where(Tramite.municipio_id == mid)
            )).scalar()
            print(f"--- muni {mid} ({m.codigo!r}, nombre={m.nombre!r}, created={m.created_at}) ---")
            print(f"users={users} reclamos={reclamos} tramites={tramites} solicitudes={sols}")
            print(f"categorias_reclamo={categorias} dependencias={deps} barrios={barrios}")
            print(f"modulos={[(mo, ac) for mo, ac in mods]}")
            print(f"branding: logo={m.logo_url!r} portada={bool(m.imagen_portada)} "
                  f"colores=({m.color_primario},{m.color_secundario}) tema={bool(m.tema_config)}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
