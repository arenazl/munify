"""Completa los 5 campos de la tab 'General' (Configuracion) para TODOS los
municipios que los tengan vacios. Escribe en la tabla `configuraciones`
(key-value, por municipio) — exactamente lo que guarda el boton "Guardar datos
del municipio" del admin.

HONESTIDAD (regla dura del proyecto):
  - nombre/lat/long: REALES, derivados del registro `municipios` (no se inventan
    coords; se copian las que ya estan en la columna NOT NULL).
  - direccion/telefono: INVENTADOS (placeholders coherentes). NO son datos reales.

Idempotente: solo completa claves vacias/inexistentes. NUNCA pisa un valor ya
cargado (protege el dato real de SPN u otro muni que ya tenga algo).

Uso:
  python scripts/_seed_general_config.py           # dry-run (no escribe)
  python scripts/_seed_general_config.py --apply    # escribe en la BD
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.municipio import Municipio  # noqa: E402
from models.configuracion import Configuracion  # noqa: E402

GENERAL_KEYS = [
    "nombre_municipio", "direccion_municipio",
    "latitud_municipio", "longitud_municipio", "telefono_contacto",
]

# Calles tipicas donde suele estar la municipalidad (placeholder coherente).
_CALLES = [
    "Av. San Martin", "Belgrano", "Av. Mitre", "Sarmiento",
    "Av. Hipolito Yrigoyen", "9 de Julio", "Rivadavia", "25 de Mayo",
]


def _direccion_placeholder(m: Municipio) -> str:
    calle = _CALLES[m.id % len(_CALLES)]
    numero = 100 + (m.id % 20) * 50  # 100..1050
    return f"{calle} {numero}"


def _telefono_placeholder(m: Municipio) -> str:
    # Linea 0800 de informacion municipal (inventada, coherente, no es real).
    return f"0800-345-{m.id:04d}"


def _valores_para(m: Municipio) -> dict:
    return {
        "nombre_municipio": f"Municipalidad de {m.nombre}",
        "direccion_municipio": _direccion_placeholder(m),
        "latitud_municipio": str(m.latitud),
        "longitud_municipio": str(m.longitud),
        "telefono_contacto": _telefono_placeholder(m),
    }


async def main(apply: bool):
    creados = 0
    saltados = 0
    async with AsyncSessionLocal() as db:
        munis = (await db.execute(
            select(Municipio).where(Municipio.activo == True).order_by(Municipio.id)  # noqa: E712
        )).scalars().all()

        existentes = (await db.execute(
            select(Configuracion).where(Configuracion.clave.in_(GENERAL_KEYS))
        )).scalars().all()
        # {(municipio_id, clave): valor}
        idx = {(c.municipio_id, c.clave): c for c in existentes}

        for m in munis:
            valores = _valores_para(m)
            for clave, valor in valores.items():
                ya = idx.get((m.id, clave))
                if ya and (ya.valor or "").strip():
                    saltados += 1
                    continue
                if ya:  # existe pero vacia -> completar
                    ya.valor = valor
                else:
                    db.add(Configuracion(
                        clave=clave,
                        valor=valor,
                        descripcion="Dato del municipio (tab General)",
                        tipo="string",
                        editable=True,
                        municipio_id=m.id,
                    ))
                creados += 1
                tag = "[REAL]" if clave in ("nombre_municipio", "latitud_municipio", "longitud_municipio") else "[INVENTADO]"
                print(f"  muni {m.id:>3} {clave:<20} = {valor!r:<40} {tag}")

        if apply:
            await db.commit()
            print(f"\nAPLICADO. {creados} claves escritas, {saltados} ya cargadas (intactas).")
        else:
            await db.rollback()
            print(f"\nDRY-RUN. {creados} claves se escribirian, {saltados} ya cargadas (se respetan). "
                  f"Correr con --apply para escribir.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(apply="--apply" in sys.argv))
