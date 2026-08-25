"""
Acceso DIRECTO con boton + PIN a un tenant clonado en QA.

Para el flujo del dueño: cada tanto refresca en QA el tenant productivo
(San Pedro Norte) con un dump de produccion, y quiere entrar con UN boton
en la pantalla de login del muni, sin tipear credenciales. Este script se
re-corre despues de CADA refresh (el dump pisa el flag y el usuario):

    python scripts/acceso_qa_tenant.py --muni 80 --pin 1680

Que hace (idempotente):
  1. municipios.demo_protegido = 1  -> el login del muni muestra la
     botonera de acceso rapido (endpoints demo-users la exponen tambien
     para no-demos protegidos) y el click pide el PIN.
  2. Upsert del usuario admin@{codigo}.demo.com (rol admin, password=PIN,
     nombre visible "Acceso Directo") -> es el UNICO que matchea los
     patrones de la botonera: los usuarios reales del tenant jamas se
     exponen.
  3. es_demo NO se toca: el muni sigue fuera de la grilla publica /demo.

En produccion nada de esto existe (flag en 0 y sin ese usuario), asi que
el codigo puede promoverse sin efecto.

JAMAS correr contra la DB de produccion (como todo script de escritura).
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402
from core.security import get_password_hash  # noqa: E402


async def main(muni_id: int, pin: str):
    if not pin.isdigit() or not (4 <= len(pin) <= 8):
        print("[ERROR] El PIN debe ser numerico, de 4 a 8 digitos")
        return
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        fila = (await conn.execute(text(
            "SELECT codigo, nombre FROM municipios WHERE id = :m"), {"m": muni_id})).fetchone()
        if not fila:
            print(f"[ERROR] No existe el municipio {muni_id}")
            return
        codigo, nombre = fila
        await conn.execute(text(
            "UPDATE municipios SET demo_protegido = 1 WHERE id = :m"), {"m": muni_id})

        email = f"admin@{codigo}.demo.com"
        hash_pin = get_password_hash(pin)
        existe = (await conn.execute(text(
            "SELECT id FROM usuarios WHERE email = :e"), {"e": email})).fetchone()
        if existe:
            await conn.execute(text(
                "UPDATE usuarios SET password_hash = :h, municipio_id = :m, activo = 1 WHERE id = :i"),
                {"h": hash_pin, "m": muni_id, "i": existe[0]})
            print(f"[OK] usuario {email} actualizado (password = PIN)")
        else:
            await conn.execute(text(
                "INSERT INTO usuarios (municipio_id, email, password_hash, nombre, apellido, rol, activo) "
                "VALUES (:m, :e, :h, 'Acceso', 'Directo', 'admin', 1)"),
                {"m": muni_id, "e": email, "h": hash_pin})
            print(f"[OK] usuario {email} creado (rol admin, password = PIN)")
        print(f"[OK] {nombre} ({codigo}) protegido con PIN: boton en /{codigo}, click pide {pin}")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--muni", type=int, required=True)
    ap.add_argument("--pin", type=str, required=True)
    a = ap.parse_args()
    asyncio.run(main(a.muni, a.pin))
