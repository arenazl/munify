# -*- coding: utf-8 -*-
"""
`inventario` + `flota` se fusionan en UN modulo: `patrimonio`.

POR QUE (dueño, 2026-09-02): "campo no se entiende un choto, y que flota sea
otro modulo esta mal". Y tiene razon en los dos puntos:

- En el MODELO nunca estuvieron separados: un vehiculo es un `inventario_items`
  con `naturaleza=ACTIVO` y su dominio en `identificador`. `flota_cargas` solo
  apunta ahi con `item_id` — es la bitacora de combustible, no otra entidad.
  El propio codigo lo dice: "no hay tabla de vehiculos aparte".
- `inventario` ademas era un modulo FANTASMA: la tabla y el sidebar lo usaban,
  pero no figuraba en el catalogo (`lib/enums/modulos.ts`), asi que no se podia
  prender ni apagar desde Configuracion.

`patrimonio` es la palabra que los municipios ya usan (Direccion de Patrimonio,
numero patrimonial, altas y bajas) y abarca las dos naturalezas: consumibles
(cemento, luminarias) y activos (el auto, la motosierra, el salon).

QUE HACE
1. `inventario` -> `patrimonio` (conserva el activo/inactivo de cada muni).
2. Si un muni tenia `flota` prendido y `patrimonio` apagado, lo deja prendido:
   nadie pierde acceso a algo que ya usaba.
3. Borra las filas de `flota`.
4. Con `--merlo`, deja `patrimonio` activo en Merlo, que es el tenant de prueba.

GUARDA: aborta si la DATABASE_URL apunta a produccion. En prod lo corre Infra.

    python backend/scripts/fusionar_modulo_patrimonio.py            # dry-run
    python backend/scripts/fusionar_modulo_patrimonio.py --aplicar --merlo
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

BASES_PRODUCCION = ("sugerenciasmun", "munify_prod")
CODIGO_MERLO = "merlo"


async def main(aplicar: bool, merlo: bool) -> None:
    base = settings.DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    if base in BASES_PRODUCCION:
        print(f"ABORTADO: `{base}` es PRODUCCION. Eso lo ejecuta Infra.")
        return
    print(f"Base: {base}    modo: {'APLICAR' if aplicar else 'dry-run'}\n")

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            for m in ("inventario", "flota", "patrimonio"):
                r = (await conn.execute(
                    text("SELECT COUNT(*), COALESCE(SUM(activo),0) FROM municipio_modulos WHERE modulo=:m"),
                    {"m": m},
                )).first()
                print(f"  antes  {m:11} filas={r[0]:4} activos={r[1]}")

            # Munis que quedarian sin acceso: tenian flota y no inventario.
            huerfanos = (await conn.execute(text("""
                SELECT DISTINCT municipio_id FROM municipio_modulos
                WHERE modulo='flota' AND activo=1
                  AND municipio_id NOT IN (
                      SELECT municipio_id FROM municipio_modulos WHERE modulo='inventario')
            """))).scalars().all()
            print(f"\n  munis con flota ON y sin fila de inventario: {list(huerfanos) or 'ninguno'}")

            if not aplicar:
                print("\nDry-run: no se escribio nada. Volve a correrlo con --aplicar.")
                return

            await conn.execute(text(
                "UPDATE municipio_modulos SET modulo='patrimonio' WHERE modulo='inventario'"))
            for mid in huerfanos:
                await conn.execute(text("""
                    INSERT INTO municipio_modulos (municipio_id, modulo, activo, created_at, updated_at)
                    VALUES (:mid, 'patrimonio', 1, NOW(), NOW())
                """), {"mid": mid})
            # Los que tenian flota prendido conservan el acceso.
            await conn.execute(text("""
                UPDATE municipio_modulos SET activo=1
                WHERE modulo='patrimonio' AND municipio_id IN (
                    SELECT municipio_id FROM (
                        SELECT municipio_id FROM municipio_modulos WHERE modulo='flota' AND activo=1
                    ) AS t)
            """))
            await conn.execute(text("DELETE FROM municipio_modulos WHERE modulo='flota'"))

            if merlo:
                mid = (await conn.execute(
                    text("SELECT id FROM municipios WHERE codigo=:c"), {"c": CODIGO_MERLO})).scalar()
                if mid:
                    ya = (await conn.execute(text(
                        "SELECT id FROM municipio_modulos WHERE municipio_id=:m AND modulo='patrimonio'"),
                        {"m": mid})).scalar()
                    if ya:
                        await conn.execute(text(
                            "UPDATE municipio_modulos SET activo=1 WHERE id=:i"), {"i": ya})
                    else:
                        await conn.execute(text("""
                            INSERT INTO municipio_modulos (municipio_id, modulo, activo, created_at, updated_at)
                            VALUES (:m, 'patrimonio', 1, NOW(), NOW())
                        """), {"m": mid})
                    print(f"\n  Merlo (id {mid}): patrimonio ACTIVO")

            print()
            for m in ("inventario", "flota", "patrimonio"):
                r = (await conn.execute(
                    text("SELECT COUNT(*), COALESCE(SUM(activo),0) FROM municipio_modulos WHERE modulo=:m"),
                    {"m": m},
                )).first()
                print(f"  despues {m:11} filas={r[0]:4} activos={r[1]}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--aplicar" in sys.argv, "--merlo" in sys.argv))
