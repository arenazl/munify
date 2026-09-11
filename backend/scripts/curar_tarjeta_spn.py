# -*- coding: utf-8 -*-
"""
Curacion de la tarjeta Visa de San Pedro Norte (muni 80). Corre IGUAL en QA y
en produccion; en prod la ejecuta Infra.

Que paso (docs/produccion/02-tarjeta-spn-pagos-cargados-como-gastos.md): los
pagos del resumen se cargaron como GASTOS desde Cooparticipacion (caja 107),
asi que la plata quedo contada dos veces (compras + pagos) y la tarjeta (caja
373) nunca bajo. Encima el programado 650 seguia agendando un gasto fijo cada
10.

Que hace, en UNA transaccion:
  1. Da de baja los 3 gastos que eran pagos del resumen (baja logica + borra
     su egreso, igual que hace la app al eliminar un gasto) y los reemplaza por
     PAGOS DE TARJETA con la misma fecha y monto: ingreso en la 373 + egreso en
     la 107. El banco queda igual al centavo; la tarjeta baja; el gasto deja de
     estar duplicado.
  2. Convierte el programado 650 en un pago de tarjeta: destino la caja 373,
     sin contacto, sin monto (paga todo lo que deba el dia 10).

Los gastos se buscan por fecha + monto + descripcion (no por id: en QA los ids
de prod estan ocupados por otro municipio). Cada uno tiene que matchear
EXACTAMENTE uno, activo, en la caja 107, con un solo egreso: si no, aborta sin
tocar nada.

`--agosto-doble borrar`: SOLO si Bartolo confirma que el 10 de agosto NO hubo
un segundo pago real. Entonces ese gasto se da de baja sin convertirse y el
banco recupera 2.180.305,30. Default: `convertir` (el banco no cambia).

Uso:
    python scripts/curar_tarjeta_spn.py --env qa                  (en seco)
    python scripts/curar_tarjeta_spn.py --env qa --aplicar
    DATABASE_URL_PROD="..." python scripts/curar_tarjeta_spn.py --env prod --aplicar   (Infra)
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from decimal import Decimal

sys.stdout.reconfigure(encoding="utf-8")
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from dotenv import load_dotenv

from _entorno import parser_base, resolver_db, aplicar_o_seco

BACKEND = Path(__file__).resolve().parent.parent
# El .env local (si existe) aporta DATABASE_URL para trabajar en QA sin exportar
# nada. Infra en prod no tiene .env: ahi la URL viene por entorno. El guard de
# coherencia de _entorno decide igual, asi que esto no relaja nada.
load_dotenv(BACKEND / ".env")

MUNI = 80
CAJA_ORIGEN = 107
CAJA_TARJETA = 373
PROGRAMADO = 650
PP_MONTO_ESPERADO = Decimal("2180305.30")
MARCA = "[curacion 2026-09-11"

# (fecha, monto, descripcion, viene del programado)
PAGOS = [
    ("2026-08-08", Decimal("2275730.90"), "Pago Visa", False),
    ("2026-08-10", Decimal("2180305.30"), "Tarjeta de crédito", True),
    ("2026-09-10", Decimal("2180305.30"), "Tarjeta de crédito", True),
]
AGOSTO_10 = ("2026-08-10", Decimal("2180305.30"))


async def uno(c, sql, **p):
    return (await c.execute(text(sql), p)).first()


async def saldo_caja(c, caja_id) -> Decimal:
    r = await uno(c, "SELECT saldo_inicial + COALESCE((SELECT SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) "
                     "FROM tesoreria_movimientos_caja WHERE caja_id=:id),0) FROM tesoreria_cajas WHERE id=:id", id=caja_id)
    return Decimal(r[0])


async def deuda_tarjeta(c) -> Decimal:
    r = await uno(c, "SELECT COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE -monto END),0) "
                     "FROM tesoreria_movimientos_caja WHERE caja_id=:id", id=CAJA_TARJETA)
    return Decimal(r[0])


async def curar(args, ent, eng) -> int:
    """Devuelve el codigo de salida. La transaccion se abre y cierra aca adentro."""
    aplicar = aplicar_o_seco(args)
    print(f"base: {ent.base} ({'APLICA' if aplicar else 'EN SECO'}) | agosto-doble={args.agosto_doble}")

    async with eng.connect() as c:
        tr = await c.begin()

        # ---------- ya curado? ----------
        pp = await uno(c, "SELECT municipio_id, contacto_id, tarjeta_caja_id, monto_pesos, caja_id, activo, proximo_pago, ultimo_pago "
                          "FROM tesoreria_pagos_programados WHERE id=:id", id=PROGRAMADO)
        marcados = (await uno(c, "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE municipio_id=:m AND descripcion LIKE :k",
                              m=MUNI, k=f"%{MARCA}%"))[0]
        if pp and pp[2] == CAJA_TARJETA and marcados:
            print(f"ya curado: el programado 650 apunta a la tarjeta y hay {marcados} movimientos de curacion. Nada que hacer.")
            await tr.rollback()
            return 0

        # ---------- chequeos previos ----------
        errores: list[str] = []
        tarjeta = await uno(c, "SELECT nombre, codigo FROM tesoreria_cajas WHERE id=:id AND municipio_id=:m", id=CAJA_TARJETA, m=MUNI)
        if not tarjeta or (tarjeta[1] or "").upper() != "TARJETA":
            errores.append(f"la caja {CAJA_TARJETA} no es la tarjeta del muni {MUNI}")
        origen = await uno(c, "SELECT nombre FROM tesoreria_cajas WHERE id=:id AND municipio_id=:m", id=CAJA_ORIGEN, m=MUNI)
        if not origen:
            errores.append(f"la caja {CAJA_ORIGEN} no es del muni {MUNI}")
        ingresos = (await uno(c, "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE caja_id=:id AND tipo='ingreso'", id=CAJA_TARJETA))[0]
        if ingresos:
            errores.append(f"la tarjeta ya tiene {ingresos} pagos registrados: revisar a mano antes de curar")
        if not pp or pp[0] != MUNI:
            errores.append("el programado 650 no existe o no es del muni 80")
        elif pp[2] is not None or Decimal(pp[3] or 0) != PP_MONTO_ESPERADO or not pp[5]:
            errores.append(f"el programado 650 no esta como se esperaba (tarjeta={pp[2]}, monto={pp[3]}, activo={pp[5]})")

        gastos = []
        for fecha, monto, descripcion, del_pp in PAGOS:
            rows = (await c.execute(text(
                "SELECT id, caja_id FROM gastos WHERE municipio_id=:m AND activo=1 AND fecha=:f AND monto_pesos=:mo AND descripcion=:d"),
                {"m": MUNI, "f": fecha, "mo": monto, "d": descripcion})).all()
            if len(rows) != 1:
                errores.append(f"gasto {descripcion} {fecha} {monto}: se esperaba 1 activo y hay {len(rows)}")
                continue
            gid, caja_id = rows[0]
            if caja_id != CAJA_ORIGEN:
                errores.append(f"gasto {gid} no sale de la caja {CAJA_ORIGEN} (caja {caja_id})")
            movs = (await c.execute(text(
                "SELECT id, caja_id, tipo, monto FROM tesoreria_movimientos_caja WHERE gasto_id=:g"), {"g": gid})).all()
            if len(movs) != 1 or movs[0][1] != CAJA_ORIGEN or movs[0][2] != "egreso" or Decimal(movs[0][3]) != monto:
                errores.append(f"gasto {gid}: se esperaba un solo egreso de {monto} en la caja {CAJA_ORIGEN}, hay {movs}")
            op = await uno(c, "SELECT numero FROM ordenes_pago WHERE gasto_id=:g AND estado <> 'anulada' LIMIT 1", g=gid)
            if op:
                errores.append(f"gasto {gid} tiene la orden de pago {op[0]} vinculada")
            gastos.append((gid, fecha, monto, descripcion, del_pp))

        if errores:
            print("\nABORTA, no se toco nada:")
            for e in errores:
                print("  - " + e)
            await tr.rollback()
            return 1

        nombre_tarjeta = tarjeta[0]
        nombre_origen = origen[0]
        saldo_antes = await saldo_caja(c, CAJA_ORIGEN)
        deuda_antes = await deuda_tarjeta(c)
        print(f"\nantes: caja {nombre_origen} {saldo_antes:,.2f} | deuda {nombre_tarjeta} {deuda_antes:,.2f}")

        # ---------- acciones ----------
        concepto = f"Pago de tarjeta {nombre_tarjeta}"[:150]
        for gid, fecha, monto, descripcion, del_pp in gastos:
            borrar_sin_convertir = args.agosto_doble == "borrar" and (fecha, monto) == AGOSTO_10
            await c.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE gasto_id=:g"), {"g": gid})
            nota = ("pago duplicado de agosto, dado de baja sin convertir" if borrar_sin_convertir
                    else "era un pago de tarjeta, reemplazado por pago de tarjeta")
            await c.execute(text(
                "UPDATE gastos SET activo=0, observaciones=CONCAT(COALESCE(observaciones,''), :nota) WHERE id=:g"),
                {"g": gid, "nota": f" {MARCA}] {nota}"})
            if borrar_sin_convertir:
                print(f"  gasto {gid} ({descripcion} {fecha} {monto:,.2f}): baja sin convertir")
                continue
            pp_id = PROGRAMADO if del_pp else None
            await c.execute(text(
                "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, tipo, monto, fecha, concepto, descripcion, pago_programado_id, conciliado, created_at) "
                "VALUES (:m, :t, 'ingreso', :mo, :f, :co, :d, :pp, 0, NOW())"),
                {"m": MUNI, "t": CAJA_TARJETA, "mo": monto, "f": fecha, "co": concepto,
                 "d": f"Pago desde {nombre_origen} {MARCA}, ex gasto #{gid}]", "pp": pp_id})
            await c.execute(text(
                "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, tipo, monto, fecha, concepto, descripcion, pago_programado_id, conciliado, created_at) "
                "VALUES (:m, :cj, 'egreso', :mo, :f, :co, :d, :pp, 0, NOW())"),
                {"m": MUNI, "cj": CAJA_ORIGEN, "mo": monto, "f": fecha, "co": concepto,
                 "d": f"Pago de {nombre_tarjeta} {MARCA}, ex gasto #{gid}]", "pp": pp_id})
            print(f"  gasto {gid} ({descripcion} {fecha} {monto:,.2f}): convertido en pago de tarjeta")

        await c.execute(text(
            "UPDATE tesoreria_pagos_programados SET tarjeta_caja_id=:t, contacto_id=NULL, monto_pesos=NULL, concepto=:co, "
            "descripcion='Paga todo lo que deba el dia 10', caja_id=:cj, dia_del_mes=10, proximo_pago='2026-10-10', "
            "ultimo_pago='2026-09-10', activo=1 WHERE id=:id"),
            {"t": CAJA_TARJETA, "co": concepto, "cj": CAJA_ORIGEN, "id": PROGRAMADO})
        print(f"  programado 650: ahora paga la tarjeta {nombre_tarjeta} desde {nombre_origen}, todo lo que deba, los 10")

        # ---------- chequeos posteriores ----------
        saldo_despues = await saldo_caja(c, CAJA_ORIGEN)
        deuda_despues = await deuda_tarjeta(c)
        activos = (await uno(c, "SELECT COUNT(*) FROM gastos WHERE municipio_id=:m AND activo=1 AND caja_id=:cj AND descripcion IN ('Pago Visa','Tarjeta de crédito')",
                             m=MUNI, cj=CAJA_ORIGEN))[0]
        print(f"\ndespues: caja {nombre_origen} {saldo_despues:,.2f} (antes {saldo_antes:,.2f}, diferencia {saldo_despues - saldo_antes:,.2f})")
        print(f"         deuda {nombre_tarjeta} {deuda_despues:,.2f} (antes {deuda_antes:,.2f})"
              + ("  -> saldo A FAVOR: compras del resumen real que nunca se cargaron" if deuda_despues < 0 else ""))
        print(f"         gastos 'pago de tarjeta' activos: {activos}")
        esperado = Decimal(0) if args.agosto_doble == "convertir" else AGOSTO_10[1]
        if saldo_despues - saldo_antes != esperado or activos != 0:
            print("\nABORTA: los chequeos posteriores no cierran, se deshace todo")
            await tr.rollback()
            return 1

        if aplicar:
            await tr.commit()
            print("\nCOMMIT: curacion aplicada")
        else:
            await tr.rollback()
            print("\nROLLBACK (en seco): nada quedo escrito")
        return 0


async def correr() -> int:
    ap = parser_base("Curacion de la tarjeta Visa de SPN")
    ap.add_argument("--agosto-doble", choices=["convertir", "borrar"], default="convertir",
                    help="que hacer con el pago del 10 de agosto (default: convertir)")
    args = ap.parse_args()
    ent = resolver_db(args)
    eng = create_async_engine(ent.url)
    try:
        return await curar(args, ent, eng)
    finally:
        await eng.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(correr()))
