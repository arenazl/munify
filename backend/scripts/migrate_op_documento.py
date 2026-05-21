"""Migracion: ampliar OrdenPago + Contacto + Municipio para soportar el
documento de Orden de Pago en formato municipal argentino (modelo San
Pedro Norte / Tribunal de Cuentas).

Campos nuevos:

  ordenes_pago:
    - codigo_imputacion       -> "1.1.01.03"
    - imputacion_descripcion  -> "SEGURO (ART)"
    - tipo_pago               -> "transferencia" | "cheque" | "efectivo" | "vep"
    - nro_comprobante_pago    -> "627571"
    - cuenta_destino          -> "421/07-CORDOBA"
    - contaduria_nombre       -> firmante V*B* Contaduria
    - secretario_nombre       -> firmante Secretario
    - intendente_nombre       -> firmante Intendente

  contactos (datos fiscales del beneficiario):
    - cuit                    -> "20-16649811-3"
    - iibb                    -> "0" / "12345-6"
    - condicion_iva           -> "Resp. Inscripto" | "Monotributista" | "Exento"
    - codigo_tributario       -> "6592" (codigo interno del muni)

  municipios:
    - cuit                    -> "30-68225087-5"
    - intendente_nombre       -> nombre default para imprimir en OPs
    - secretario_nombre       -> idem
    - contador_nombre         -> idem

Todos los campos son NULLABLE, no rompe nada en datos existentes.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings


COLUMNS = [
    # (tabla, columna, definicion SQL)
    ("ordenes_pago", "codigo_imputacion", "VARCHAR(50) NULL"),
    ("ordenes_pago", "imputacion_descripcion", "VARCHAR(150) NULL"),
    ("ordenes_pago", "tipo_pago", "VARCHAR(30) NULL"),
    ("ordenes_pago", "nro_comprobante_pago", "VARCHAR(50) NULL"),
    ("ordenes_pago", "cuenta_destino", "VARCHAR(100) NULL"),
    ("ordenes_pago", "contaduria_nombre", "VARCHAR(150) NULL"),
    ("ordenes_pago", "secretario_nombre", "VARCHAR(150) NULL"),
    ("ordenes_pago", "intendente_nombre", "VARCHAR(150) NULL"),
    ("contactos", "cuit", "VARCHAR(20) NULL"),
    ("contactos", "iibb", "VARCHAR(20) NULL"),
    ("contactos", "condicion_iva", "VARCHAR(50) NULL"),
    ("contactos", "codigo_tributario", "VARCHAR(20) NULL"),
    ("municipios", "cuit", "VARCHAR(20) NULL"),
    ("municipios", "intendente_nombre", "VARCHAR(150) NULL"),
    ("municipios", "secretario_nombre", "VARCHAR(150) NULL"),
    ("municipios", "contador_nombre", "VARCHAR(150) NULL"),
]


async def column_exists(conn, table: str, column: str) -> bool:
    res = await conn.execute(text(
        """
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :t
          AND column_name = :c
        """
    ), {"t": table, "c": column})
    return (res.scalar_one() or 0) > 0


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for table, column, definition in COLUMNS:
            if await column_exists(conn, table, column):
                print(f"  skip  {table}.{column} (ya existe)")
                continue
            sql = f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
            print(f"  add   {table}.{column}")
            await conn.execute(text(sql))
    await engine.dispose()
    print("OK migracion completa.")


if __name__ == "__main__":
    asyncio.run(migrate())
