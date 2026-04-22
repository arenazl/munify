"""Revert the test payment made during smoke (deuda 8812)."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def revert():
    e = create_async_engine(settings.DATABASE_URL)
    async with e.begin() as c:
        r = await c.execute(text(
            "UPDATE tasas_deudas SET estado='pendiente', fecha_pago=NULL, "
            "pago_externo_id=NULL WHERE id=8812"
        ))
        print(f"deuda revertida: {r.rowcount} filas")
        r2 = await c.execute(text("DELETE FROM pagos WHERE deuda_id=8812"))
        print(f"registro pago eliminado: {r2.rowcount} filas")
    await e.dispose()


if __name__ == "__main__":
    asyncio.run(revert())
