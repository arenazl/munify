"""Semilla: crea la caja tipo TARJETA DE CREDITO de un municipio.

La tarjeta de credito se modela como una CAJA (mismo contenedor) con
`codigo == 'TARJETA'`. Ver models/tesoreria_extra.CODIGO_CAJA_TARJETA:

  - `saldo_inicial` = LIMITE de la tarjeta (el cliente lo edita despues desde
    el ABM de cajas; hoy son 3M, manana pueden ser 8M).
  - `saldo_actual`  = credito DISPONIBLE (limite - gastos + pagos).

Es IDEMPOTENTE: si ya existe una caja TARJETA con ese nombre para el muni, no
la duplica (solo informa).

Uso:
    # apunta a la DB del .env del backend
    python scripts/seed_caja_tarjeta.py

    # o explicito (qa / prod)
    DATABASE_URL="mysql+aiomysql://..." python scripts/seed_caja_tarjeta.py

    # parametros opcionales
    python scripts/seed_caja_tarjeta.py --municipio 80 --nombre "Visa Cordobesa 9594" --limite 3000000
"""
import argparse
import asyncio
import os
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker  # noqa: E402

from models.tesoreria_extra import TesoreriaCaja, CODIGO_CAJA_TARJETA  # noqa: E402

# Defaults para San Pedro Norte (muni 80). El limite es un valor de arranque
# aproximado: el cliente lo mantiene desde Configuracion -> Cajas.
MUNICIPIO_DEFAULT = 80
NOMBRE_DEFAULT = "Visa Cordobesa 9594"
LIMITE_DEFAULT = Decimal("3000000")


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_path = Path(__file__).resolve().parent.parent / ".env"
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("No encontre DATABASE_URL (ni en env ni en backend/.env)")


async def main(municipio_id: int, nombre: str, limite: Decimal, aplicar: bool):
    url = _database_url()
    engine = create_async_engine(url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        existente = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.municipio_id == municipio_id,
                TesoreriaCaja.codigo == CODIGO_CAJA_TARJETA,
                TesoreriaCaja.nombre == nombre,
            )
        )).scalar_one_or_none()

        if existente:
            print(f"[=] Ya existe: caja #{existente.id} '{existente.nombre}' "
                  f"(codigo={existente.codigo}, limite=${existente.saldo_inicial})")
            print("    Nada que hacer (idempotente).")
            await engine.dispose()
            return

        otras = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.municipio_id == municipio_id,
                TesoreriaCaja.codigo == CODIGO_CAJA_TARJETA,
            )
        )).scalars().all()
        if otras:
            print(f"[i] El muni ya tiene {len(otras)} tarjeta(s): "
                  + ", ".join(f"#{o.id} {o.nombre}" for o in otras))

        caja = TesoreriaCaja(
            municipio_id=municipio_id,
            nombre=nombre,
            codigo=CODIGO_CAJA_TARJETA,
            descripcion=(
                "Tarjeta de credito. El saldo inicial es el LIMITE y el saldo "
                "actual es el credito disponible. Los gastos con esta tarjeta "
                "no salen de ninguna caja: se pagan despues con 'Pagar tarjeta'."
            ),
            color="#8b5cf6",
            icono="CreditCard",
            saldo_inicial=limite,
            orden=99,
            activo=True,
        )

        if not aplicar:
            print("[DRY-RUN] Se crearia la caja-tarjeta:")
            print(f"    muni={municipio_id} | nombre={nombre!r} | codigo={CODIGO_CAJA_TARJETA} "
                  f"| limite=${limite:,.2f}")
            print("    Reejecuta con --aplicar para crearla.")
            await engine.dispose()
            return

        db.add(caja)
        await db.commit()
        await db.refresh(caja)
        print(f"[OK] Caja-tarjeta creada: #{caja.id} '{caja.nombre}' "
              f"| limite=${Decimal(caja.saldo_inicial):,.2f} | disponible inicial = el mismo limite")

    await engine.dispose()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", type=int, default=MUNICIPIO_DEFAULT)
    ap.add_argument("--nombre", default=NOMBRE_DEFAULT)
    ap.add_argument("--limite", type=Decimal, default=LIMITE_DEFAULT)
    ap.add_argument("--aplicar", action="store_true", help="sin esto es dry-run")
    a = ap.parse_args()
    asyncio.run(main(a.municipio, a.nombre, a.limite, a.aplicar))
