"""Read-only: estado de los datos 'General' (tab Configuracion) por municipio.

Muestra, para cada municipio activo:
  - id, nombre, codigo, lat/long (columna real de `municipios`), telefono col.
  - cuales de las 5 claves de General ya estan cargadas en `configuraciones`.

No escribe nada. Solo para decidir que completar sin pisar datos reales (SPN).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.municipio import Municipio  # noqa: E402
from models.configuracion import Configuracion  # noqa: E402

GENERAL_KEYS = [
    "nombre_municipio", "direccion_municipio",
    "latitud_municipio", "longitud_municipio", "telefono_contacto",
]


async def main():
    async with AsyncSessionLocal() as db:
        munis = (await db.execute(
            select(Municipio).order_by(Municipio.id)
        )).scalars().all()

        cfgs = (await db.execute(
            select(Configuracion).where(Configuracion.clave.in_(GENERAL_KEYS))
        )).scalars().all()

        # {municipio_id: {clave: valor}}
        by_muni = {}
        for c in cfgs:
            by_muni.setdefault(c.municipio_id, {})[c.clave] = c.valor

        print(f"\n{'='*100}")
        print(f"TOTAL municipios: {len(munis)}")
        print(f"{'='*100}\n")

        for m in munis:
            loaded = by_muni.get(m.id, {})
            faltan = [k for k in GENERAL_KEYS if not (loaded.get(k) or "").strip()]
            estado = "COMPLETO" if not faltan else f"FALTAN: {', '.join(faltan)}"
            print(f"[{m.id:>3}] {m.nombre[:45]:<45} cod={m.codigo[:20]:<20} activo={m.activo}")
            print(f"      muni.lat={m.latitud} muni.long={m.longitud} muni.tel={m.telefono!r} muni.dir={m.direccion!r}")
            print(f"      General -> {estado}")
            if loaded:
                for k, v in loaded.items():
                    print(f"         {k} = {v!r}")
            print()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
