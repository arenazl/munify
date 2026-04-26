"""
Seed de prueba: para cada municipio demo (excepto La Matanza, que ya tiene su
seed dedicado, y test/basura), habilita 3 Secretarias y 1 Direccion bajo cada
una. Las dependencias se reusan del catalogo global si ya existen (por nombre).

Sirve para que cada demo tenga estructura jerarquica para mostrar el arbol en
la pantalla de configuracion sin duplicar trabajo del seed de La Matanza.

Ejecutar:
    cd backend && python -m scripts.seed_demos_jerarquia
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from core.config import settings
from models import Dependencia, MunicipioDependencia


# Municipios a saltear (La Matanza ya esta, "fgfdg" es basura de test)
SKIP_CODIGOS = {"la-matanza", "fgfdg"}


# 3 Secretarias minimas + 1 Direccion cada una. Se reusan del catalogo
# (los nombres son los mismos que carga seed_matanza_jerarquia.py para no
# duplicar entradas en el catalogo global).
ESTRUCTURA_DEMO = [
    {
        "secretaria": "Secretaria de Salud",
        "color": "#ef4444",
        "icono": "HeartPulse",
        "direcciones": ["Direccion de Atencion Primaria"],
    },
    {
        "secretaria": "Secretaria de Obras y Servicios Publicos",
        "color": "#f59e0b",
        "icono": "HardHat",
        "direcciones": ["Direccion de Pavimentacion"],
    },
    {
        "secretaria": "Secretaria de Hacienda",
        "color": "#10b981",
        "icono": "Wallet",
        "direcciones": ["Direccion de Tesoreria"],
    },
]


def codigo_desde_nombre(nombre: str) -> str:
    return (nombre.upper()
            .replace(" ", "_")
            .replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
            .replace("Ñ", "N"))[:50]


async def get_or_create_dep(
    db: AsyncSession,
    *, nombre: str, tipo_jerarquico: str, padre_id: int | None,
    color: str, icono: str,
) -> Dependencia:
    res = await db.execute(select(Dependencia).where(Dependencia.nombre == nombre))
    dep = res.scalar_one_or_none()
    if dep:
        # No pisamos jerarquia/color si ya existe — el seed de La Matanza
        # establecio los buenos defaults globales.
        return dep
    dep = Dependencia(
        nombre=nombre,
        codigo=codigo_desde_nombre(nombre),
        tipo_gestion="AMBOS",
        tipo_jerarquico=tipo_jerarquico,
        dependencia_padre_id=padre_id,
        color=color,
        icono=icono,
        activo=True,
        orden=0,
    )
    db.add(dep)
    await db.flush()
    return dep


async def habilitar(db: AsyncSession, dep: Dependencia, municipio_id: int) -> bool:
    res = await db.execute(
        select(MunicipioDependencia).where(
            MunicipioDependencia.municipio_id == municipio_id,
            MunicipioDependencia.dependencia_id == dep.id,
        )
    )
    if res.scalar_one_or_none():
        return False
    db.add(MunicipioDependencia(
        municipio_id=municipio_id,
        dependencia_id=dep.id,
        activo=True,
        orden=dep.orden,
    ))
    await db.flush()
    return True


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        munis = (await db.execute(text(
            "SELECT id, codigo, nombre FROM municipios ORDER BY id"
        ))).all()

        total_habs = 0
        for m_id, m_codigo, m_nombre in munis:
            if m_codigo in SKIP_CODIGOS:
                print(f"[skip] {m_nombre} ({m_codigo})")
                continue

            print(f"\n== Municipio {m_id}: {m_nombre} ({m_codigo}) ==")
            for blk in ESTRUCTURA_DEMO:
                sec = await get_or_create_dep(
                    db,
                    nombre=blk["secretaria"],
                    tipo_jerarquico="SECRETARIA",
                    padre_id=None,
                    color=blk["color"],
                    icono=blk["icono"],
                )
                if await habilitar(db, sec, m_id):
                    total_habs += 1
                    print(f"  + {sec.nombre}")
                else:
                    print(f"  . {sec.nombre} (ya habilitada)")

                for dir_nombre in blk["direcciones"]:
                    d = await get_or_create_dep(
                        db,
                        nombre=dir_nombre,
                        tipo_jerarquico="DIRECCION",
                        padre_id=sec.id,
                        color=blk["color"],
                        icono="Building2",
                    )
                    if await habilitar(db, d, m_id):
                        total_habs += 1
                        print(f"     + {d.nombre}")
                    else:
                        print(f"     . {d.nombre} (ya habilitada)")

        await db.commit()

    await engine.dispose()
    print(f"\nTotal habilitaciones nuevas: {total_habs}")


if __name__ == "__main__":
    asyncio.run(main())
