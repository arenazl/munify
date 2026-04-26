"""
Seed de la estructura jerarquica Secretaria -> Direcciones para La Matanza.

- Carga las Secretarias y Direcciones en el catalogo global de `dependencias`
  con tipo_jerarquico y dependencia_padre_id.
- Las habilita todas para La Matanza (municipio_id=78) via municipio_dependencias.
- Es idempotente: si la dependencia ya existe (match por nombre), no la duplica
  pero garantiza que tipo_jerarquico/padre/color queden correctos y la habilita
  para el municipio si todavia no lo estaba.

Ejecutar:
    cd backend && python -m scripts.seed_matanza_jerarquia
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from core.config import settings
from models import Dependencia, MunicipioDependencia


MUNICIPIO_ID = 78  # La Matanza


# (Secretaria, color, icono, [Direcciones...])
ESTRUCTURA = [
    ("Secretaria de Salud", "#ef4444", "HeartPulse", [
        "Direccion de Discapacidad",
        "Direccion de Atencion Primaria",
        "Direccion de Epidemiologia",
        "Direccion de Zoonosis",
    ]),
    ("Secretaria de Gobierno", "#6366f1", "Landmark", [
        "Direccion de Entidades de Bien Publico",
        "Direccion de Mesa de Entradas",
        "Direccion de Culto",
        "Direccion de Instituciones Intermedias",
    ]),
    ("Secretaria de Seguridad", "#0ea5e9", "Shield", [
        "Direccion de Defensa Civil",
        "Direccion de Transito",
        "Direccion de Transporte",
        "Direccion de Monitoreo",
    ]),
    ("Secretaria de Hacienda", "#10b981", "Wallet", [
        "Direccion de Ingresos Publicos",
        "Direccion de Compras y Suministros",
        "Direccion de Presupuesto",
        "Direccion de Tesoreria",
    ]),
    ("Secretaria de Obras y Servicios Publicos", "#f59e0b", "HardHat", [
        "Direccion de Catastro",
        "Direccion de Obras Particulares",
        "Direccion de Redes Pluviales",
        "Direccion de Pavimentacion",
    ]),
    ("Secretaria de Medio Ambiente", "#22c55e", "Leaf", [
        "Direccion de Higiene Urbana",
        "Direccion de Arbolado Publico",
        "Direccion de Educacion Ambiental",
    ]),
    ("Secretaria de Desarrollo Social", "#a855f7", "Users", [
        "Direccion de Ninez y Adolescencia",
        "Direccion de Politicas de Genero",
        "Direccion de Asistencia Directa",
    ]),
]


def codigo_desde_nombre(nombre: str) -> str:
    return (nombre.upper()
            .replace(" ", "_")
            .replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
            .replace("Ñ", "N"))[:50]


async def get_or_upsert_dependencia(
    db: AsyncSession,
    *,
    nombre: str,
    tipo_jerarquico: str,
    padre_id: int | None,
    color: str,
    icono: str,
) -> Dependencia:
    """Busca por nombre exacto. Si no existe, la crea. Si existe, ajusta jerarquia."""
    res = await db.execute(select(Dependencia).where(Dependencia.nombre == nombre))
    dep = res.scalar_one_or_none()
    if dep:
        # Asegurar que la jerarquia y datos visuales esten al dia.
        dep.tipo_jerarquico = tipo_jerarquico
        dep.dependencia_padre_id = padre_id
        if not dep.color or dep.color == "#6366f1":
            dep.color = color
        if not dep.icono or dep.icono == "Building2":
            dep.icono = icono
        if not dep.codigo:
            dep.codigo = codigo_desde_nombre(nombre)
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


async def habilitar_para_municipio(db: AsyncSession, dep: Dependencia, municipio_id: int) -> bool:
    """Crea MunicipioDependencia si todavia no existe. Devuelve True si la creo."""
    res = await db.execute(
        select(MunicipioDependencia).where(
            MunicipioDependencia.municipio_id == municipio_id,
            MunicipioDependencia.dependencia_id == dep.id,
        )
    )
    if res.scalar_one_or_none():
        return False
    md = MunicipioDependencia(
        municipio_id=municipio_id,
        dependencia_id=dep.id,
        activo=True,
        orden=dep.orden,
    )
    db.add(md)
    await db.flush()
    return True


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    creadas_secretarias = 0
    creadas_direcciones = 0
    habilitadas = 0

    async with Session() as db:
        print(f"\n=== SEED LA MATANZA — JERARQUIA (municipio_id={MUNICIPIO_ID}) ===\n")

        for secretaria_nombre, color, icono, direcciones in ESTRUCTURA:
            print(f"-- {secretaria_nombre}")
            sec = await get_or_upsert_dependencia(
                db,
                nombre=secretaria_nombre,
                tipo_jerarquico="SECRETARIA",
                padre_id=None,
                color=color,
                icono=icono,
            )
            if sec.id is None:
                creadas_secretarias += 1
            if await habilitar_para_municipio(db, sec, MUNICIPIO_ID):
                habilitadas += 1
                print(f"   habilitada para La Matanza")

            for dir_nombre in direcciones:
                d = await get_or_upsert_dependencia(
                    db,
                    nombre=dir_nombre,
                    tipo_jerarquico="DIRECCION",
                    padre_id=sec.id,
                    color=color,
                    icono="Building2",
                )
                creadas_direcciones += 1
                if await habilitar_para_municipio(db, d, MUNICIPIO_ID):
                    habilitadas += 1
                    print(f"     + {dir_nombre} (habilitada)")
                else:
                    print(f"     . {dir_nombre} (ya existia)")

        await db.commit()

    await engine.dispose()
    print("\n" + "=" * 60)
    print(f"Resumen: {creadas_secretarias} secretarias procesadas, "
          f"{creadas_direcciones} direcciones procesadas, "
          f"{habilitadas} habilitaciones nuevas para La Matanza.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
