# -*- coding: utf-8 -*-
"""
CORRECCION DE DATOS — gastos con tarjeta que descontaron una caja real.

EL PROBLEMA QUE ARREGLA
-----------------------
Hasta el pase de `tarjeta de credito como caja` (commit 9a2fe95), el wizard de
gastos EXIGIA elegir una caja real aunque la forma de pago fuera tarjeta, y el
backend, para un gasto CONCRETADO con caja_id, genera un movimiento de egreso
(api/gastos.py). Resultado en produccion: cada compra con tarjeta le descontó
plata de verdad a una caja (en San Pedro Norte, la de coparticipacion) cuando
en realidad debia acumularse como DEUDA de la tarjeta hasta pagar el resumen.

QUE HACE
--------
Reapunta esos gastos —y sus movimientos de caja— a la caja-tarjeta del
municipio. La plata vuelve sola a la caja real (el egreso deja de pesar sobre
ella) y la deuda queda donde corresponde. NO borra ni crea gastos: solo mueve
el `caja_id`, asi el importe, la fecha y el comprobante quedan intactos.

SEGURIDAD (esto corre en PRODUCCION)
------------------------------------
  · Modo PLAN por defecto: lista lo que haria y NO toca nada. Para ejecutar hay
    que pasar --apply Y --si-estoy-seguro.
  · BACKUP obligatorio antes de escribir: JSON con el estado previo de cada
    gasto y movimiento tocado (permite revertir con --revertir <archivo>).
  · IDEMPOTENTE: un gasto que ya apunta a una caja-tarjeta se saltea. Correrlo
    dos veces no duplica nada.
  · Una sola transaccion: o entra todo o no entra nada.
  · No lee ni imprime credenciales. La DATABASE_URL sale del entorno del
    contenedor (o de backend/.env), nunca de un parametro.

USO
---
    python -m scripts.fix_gastos_tarjeta_prod --muni 80                 # plan
    python -m scripts.fix_gastos_tarjeta_prod --muni 80 --apply --si-estoy-seguro
    python -m scripts.fix_gastos_tarjeta_prod --revertir backup_xxx.json --apply --si-estoy-seguro
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import bindparam, text                         # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine         # noqa: E402

CODIGO_TARJETA = "TARJETA"


def _url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    from core.config import settings          # noqa: PLC0415
    return settings.DATABASE_URL


def _json(v):
    """Serializa lo que MySQL devuelve. `fecha` viene como `date` (no datetime):
    sin esta rama el backup explota justo antes de escribir — pasó al probarlo
    en QA, que es exactamente para lo que se prueba en QA."""
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


async def _tarjeta_destino(conn, muni: int, tarjeta_id: int | None) -> dict:
    """La caja-tarjeta a la que se reapuntan los gastos."""
    if tarjeta_id:
        row = (await conn.execute(text(
            "SELECT id, nombre, codigo FROM tesoreria_cajas "
            "WHERE id=:t AND municipio_id=:m"), {"t": tarjeta_id, "m": muni})).mappings().first()
        if not row:
            raise SystemExit(f"ERROR: la caja {tarjeta_id} no existe en el municipio {muni}")
        if (row["codigo"] or "").strip().upper() != CODIGO_TARJETA:
            raise SystemExit(f"ERROR: la caja {tarjeta_id} ({row['nombre']}) NO es una caja-tarjeta "
                             f"(codigo='{row['codigo']}', se esperaba '{CODIGO_TARJETA}')")
        return dict(row)

    filas = (await conn.execute(text(
        "SELECT id, nombre, codigo FROM tesoreria_cajas "
        "WHERE municipio_id=:m AND UPPER(TRIM(codigo))=:c AND activo=1"),
        {"m": muni, "c": CODIGO_TARJETA})).mappings().all()
    if not filas:
        raise SystemExit(
            "ERROR: el municipio no tiene ninguna caja-tarjeta (codigo='TARJETA').\n"
            "       Creala primero con: python -m scripts.seed_caja_tarjeta\n"
            "       o pasa --tarjeta <id> si ya existe con otro codigo.")
    if len(filas) > 1:
        detalle = ", ".join(f"{f['id']}={f['nombre']}" for f in filas)
        raise SystemExit(f"ERROR: hay {len(filas)} cajas-tarjeta ({detalle}). "
                         f"Elegi una con --tarjeta <id>.")
    return dict(filas[0])


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--muni", type=int, help="municipio_id (ej. 80 = San Pedro Norte)")
    ap.add_argument("--tarjeta", type=int, default=None,
                    help="id de la caja-tarjeta destino (si hay mas de una)")
    ap.add_argument("--apply", action="store_true", help="ejecuta (sin esto: solo plan)")
    ap.add_argument("--si-estoy-seguro", dest="seguro", action="store_true",
                    help="confirmacion obligatoria junto con --apply")
    ap.add_argument("--revertir", metavar="BACKUP.json",
                    help="deshace una corrida previa desde su backup")
    args = ap.parse_args()

    eng = create_async_engine(_url())
    try:
        if args.revertir:
            await _revertir(eng, args)
            return
        if not args.muni:
            raise SystemExit("ERROR: falta --muni")
        await _corregir(eng, args)
    finally:
        await eng.dispose()


async def _corregir(eng, args) -> None:
    async with eng.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        tarjeta = await _tarjeta_destino(conn, args.muni, args.tarjeta)

        # Gastos con tarjeta apuntando a una caja que NO es tarjeta.
        gastos = (await conn.execute(text("""
            SELECT g.id, g.fecha, g.concepto, g.monto_pesos, g.caja_id, g.estado_pago,
                   c.nombre AS caja_nombre
            FROM gastos g
            JOIN tesoreria_cajas c ON c.id = g.caja_id
            WHERE g.municipio_id = :m
              AND g.forma_pago = 'tarjeta'
              AND UPPER(TRIM(COALESCE(c.codigo,''))) <> :cod
            ORDER BY g.fecha
        """), {"m": args.muni, "cod": CODIGO_TARJETA})).mappings().all()

        ids = [g["id"] for g in gastos]
        movs = []
        if ids:
            movs = (await conn.execute(text("""
                SELECT m.id, m.caja_id, m.gasto_id, m.tipo, m.monto, c.nombre AS caja_nombre
                FROM tesoreria_movimientos_caja m
                JOIN tesoreria_cajas c ON c.id = m.caja_id
                WHERE m.gasto_id IN :ids
            """).bindparams(bindparam("ids", expanding=True)), {"ids": ids})).mappings().all()

        print("=" * 70)
        print(f"BASE: {db}   MUNICIPIO: {args.muni}")
        print(f"TARJETA DESTINO: #{tarjeta['id']} {tarjeta['nombre']}")
        print("=" * 70)
        print(f"Gastos con tarjeta apuntando a una caja real: {len(gastos)}")
        if not gastos:
            print("Nada para corregir. (Idempotente: quiza ya se corrio.)")
            return

        por_caja: dict[str, list] = {}
        for g in gastos:
            por_caja.setdefault(g["caja_nombre"], []).append(g)
        print("\nPor caja afectada:")
        for nombre, lista in por_caja.items():
            total = sum(Decimal(str(g["monto_pesos"] or 0)) for g in lista)
            print(f"  - {nombre}: {len(lista)} gastos, ${total:,.2f} que le fueron descontados de mas")

        print(f"\nMovimientos de caja a reapuntar: {len(movs)}")
        print("\nDetalle (ultimos 10):")
        for g in gastos[-10:]:
            print(f"  #{g['id']} {g['fecha']} ${Decimal(str(g['monto_pesos'] or 0)):>12,.2f}  "
                  f"{(g['concepto'] or '')[:38]:<38} {g['caja_nombre']}")

        if not (args.apply and args.seguro):
            print("\n>>> MODO PLAN: no se toco nada.")
            print(">>> Para ejecutar: --apply --si-estoy-seguro")
            return

        # --- BACKUP antes de escribir ---
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ruta = Path(__file__).parent / f"_backup_gastos_tarjeta_{args.muni}_{stamp}.json"
        ruta.write_text(json.dumps({
            "db": db, "municipio_id": args.muni, "tarjeta_destino": tarjeta["id"],
            "generado": stamp,
            "gastos": [{k: _json(v) for k, v in dict(g).items()} for g in gastos],
            "movimientos": [{k: _json(v) for k, v in dict(m).items()} for m in movs],
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nBACKUP: {ruta}")

        await conn.execute(text(
            "UPDATE gastos SET caja_id = :t WHERE id IN :ids"
        ).bindparams(bindparam("ids", expanding=True)), {"t": tarjeta["id"], "ids": ids})
        if movs:
            await conn.execute(text(
                "UPDATE tesoreria_movimientos_caja SET caja_id = :t WHERE id IN :ids"
            ).bindparams(bindparam("ids", expanding=True)),
                {"t": tarjeta["id"], "ids": [m["id"] for m in movs]})

        print(f"OK: {len(gastos)} gastos y {len(movs)} movimientos reapuntados a "
              f"la tarjeta #{tarjeta['id']}.")
        print("Las cajas reales recuperan su saldo; la deuda queda en la tarjeta.")


async def _revertir(eng, args) -> None:
    datos = json.loads(Path(args.revertir).read_text(encoding="utf-8"))
    print(f"REVERTIR desde {args.revertir}: {len(datos['gastos'])} gastos, "
          f"{len(datos['movimientos'])} movimientos")
    if not (args.apply and args.seguro):
        print(">>> MODO PLAN: no se toco nada. Para ejecutar: --apply --si-estoy-seguro")
        return
    async with eng.begin() as conn:
        for g in datos["gastos"]:
            await conn.execute(text("UPDATE gastos SET caja_id=:c WHERE id=:i"),
                               {"c": g["caja_id"], "i": g["id"]})
        for m in datos["movimientos"]:
            await conn.execute(text("UPDATE tesoreria_movimientos_caja SET caja_id=:c WHERE id=:i"),
                               {"c": m["caja_id"], "i": m["id"]})
    print("OK: estado previo restaurado.")


if __name__ == "__main__":
    asyncio.run(main())
