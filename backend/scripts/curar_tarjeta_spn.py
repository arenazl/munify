# -*- coding: utf-8 -*-
"""
Curacion de la tarjeta de credito: los pagos del resumen que se cargaron como
GASTO pasan a ser pagos de la tarjeta, y el pago programado que agendaba un
monto fijo pasa a pagar la tarjeta.

Corre IGUAL en QA y en produccion, y sobre dos casos (`--caso`), que es lo que
permite ensayarlo antes de tocar un cliente:

  merlo  el sandbox de PRODUCCION (muni 1000149), sembrado con los mismos
         numeros que San Pedro Norte. Es el ensayo.
  spn    San Pedro Norte (muni 80), el caso real. Es la corrida de verdad.

El codigo es el mismo para los dos: lo unico que cambia son los ids, que viven
en `casos_tarjeta.py`.

QUE PASO (docs/produccion/02-tarjeta-spn-pagos-cargados-como-gastos.md): los
pagos del resumen se cargaron como gastos desde la caja del banco, asi que la
plata quedo contada dos veces (las compras con tarjeta YA eran gastos) y la
tarjeta nunca bajo. Encima el programado seguia agendando un gasto fijo cada 10.

QUE HACE, en UNA transaccion:
  1. Da de baja los gastos que eran pagos del resumen (baja logica + borra su
     egreso, igual que hace la app al eliminar un gasto) y los reemplaza por
     PAGOS DE TARJETA con la misma fecha y monto: ingreso en la caja-tarjeta +
     egreso en la caja del banco. El banco queda igual al centavo; la tarjeta
     baja; el gasto deja de estar duplicado.
  2. Convierte el programado en un pago de tarjeta: sin contacto, sin monto
     (paga todo lo que deba el dia que vence).

Los gastos se buscan por fecha + monto + descripcion, no por id: en cada base
los ids son distintos. Cada uno tiene que matchear EXACTAMENTE uno, activo, en
la caja del banco y con un solo egreso; si no, aborta sin tocar nada.

`--agosto-doble borrar`: SOLO si el municipio confirma que el 10 de agosto NO
hubo un segundo pago real. Entonces ese gasto se da de baja sin convertirse y el
banco recupera 2.180.305,30. Default: `convertir` (el banco no cambia).

Uso:
    python scripts/curar_tarjeta_spn.py --caso merlo --env prod            (en seco)
    python scripts/curar_tarjeta_spn.py --caso merlo --env prod --aplicar
    python scripts/curar_tarjeta_spn.py --caso spn   --env prod --aplicar  (el cliente real)
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from decimal import Decimal

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from _entorno import parser_base, resolver_db, aplicar_o_seco
from casos_tarjeta import caso as buscar_caso

BACKEND = Path(__file__).resolve().parent.parent
# El .env local (si existe) aporta DATABASE_URL para trabajar en QA sin exportar
# nada. Infra en prod no tiene .env: ahi la URL viene por entorno. El guard de
# coherencia de _entorno decide igual, asi que esto no relaja nada.
load_dotenv(BACKEND / ".env")

MARCA = "[curacion 2026-09-11"
AGOSTO_10 = ("2026-08-10", Decimal("2180305.30"))


async def uno(c, sql, **p):
    return (await c.execute(text(sql), p)).first()


async def saldo_caja(c, caja_id) -> Decimal:
    r = await uno(c, "SELECT saldo_inicial + COALESCE((SELECT SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) "
                     "FROM tesoreria_movimientos_caja WHERE caja_id=:id),0) FROM tesoreria_cajas WHERE id=:id", id=caja_id)
    return Decimal(r[0])


async def deuda_tarjeta(c, caja_id) -> Decimal:
    r = await uno(c, "SELECT COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE -monto END),0) "
                     "FROM tesoreria_movimientos_caja WHERE caja_id=:id", id=caja_id)
    return Decimal(r[0])


async def buscar_programado(c, caso, contacto_ids) -> int | None:
    """El programado a convertir. Si el caso no fija un id (Merlo), se lo
    reconoce por su descripcion dentro del municipio."""
    if caso.programado_id:
        return caso.programado_id
    r = await uno(c, "SELECT id FROM tesoreria_pagos_programados WHERE municipio_id=:m AND descripcion=:de "
                     "AND activo=1 ORDER BY id LIMIT 1", m=caso.municipio_id, de=caso.descripcion_programado)
    return r[0] if r else None


async def curar(args, ent, eng) -> int:
    caso = buscar_caso(args.caso)
    aplicar = aplicar_o_seco(args)
    MUNI, ORIGEN, TARJETA = caso.municipio_id, caso.caja_origen_id, caso.tarjeta_caja_id
    print(f"base: {ent.base} · caso {caso.clave} (muni {MUNI}) "
          f"({'APLICA' if aplicar else 'EN SECO'}) | agosto-doble={args.agosto_doble}")

    async with eng.connect() as c:
        tr = await c.begin()

        pp_id = await buscar_programado(c, caso, None)
        pp = await uno(c, "SELECT municipio_id, contacto_id, tarjeta_caja_id, monto_pesos, caja_id, activo "
                          "FROM tesoreria_pagos_programados WHERE id=:id", id=pp_id) if pp_id else None

        # ---------- ya curado? ----------
        marcados = (await uno(c, "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE municipio_id=:m AND descripcion LIKE :k",
                              m=MUNI, k=f"%{MARCA}%"))[0]
        if pp and pp[2] == TARJETA and marcados:
            print(f"ya curado: el programado {pp_id} apunta a la tarjeta y hay {marcados} movimientos de curacion. Nada que hacer.")
            await tr.rollback()
            return 0

        # ---------- chequeos previos ----------
        errores: list[str] = []
        tarjeta = await uno(c, "SELECT nombre, codigo FROM tesoreria_cajas WHERE id=:id AND municipio_id=:m", id=TARJETA, m=MUNI)
        if not tarjeta or (tarjeta[1] or "").upper() != "TARJETA":
            errores.append(f"la caja {TARJETA} no es la tarjeta del muni {MUNI}")
        origen = await uno(c, "SELECT nombre FROM tesoreria_cajas WHERE id=:id AND municipio_id=:m", id=ORIGEN, m=MUNI)
        if not origen:
            errores.append(f"la caja {ORIGEN} no es del muni {MUNI}")
        ingresos = (await uno(c, "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE caja_id=:id AND tipo='ingreso'", id=TARJETA))[0]
        if ingresos:
            errores.append(f"la tarjeta ya tiene {ingresos} pagos registrados: revisar a mano antes de curar")
        if not pp_id or not pp:
            errores.append(f"no se encontro el pago programado a convertir (caso {caso.clave})")
        elif pp[0] != MUNI:
            errores.append(f"el programado {pp_id} no es del muni {MUNI}")
        elif pp[2] is not None or Decimal(pp[3] or 0) != caso.programado_monto or not pp[5]:
            errores.append(f"el programado {pp_id} no esta como se esperaba (tarjeta={pp[2]}, monto={pp[3]}, activo={pp[5]})")

        gastos = []
        for pago in caso.pagos:
            rows = (await c.execute(text(
                "SELECT id, caja_id FROM gastos WHERE municipio_id=:m AND activo=1 AND fecha=:f AND monto_pesos=:mo AND descripcion=:d"),
                {"m": MUNI, "f": pago.fecha, "mo": pago.monto, "d": pago.descripcion})).all()
            if len(rows) != 1:
                errores.append(f"gasto {pago.descripcion} {pago.fecha} {pago.monto}: se esperaba 1 activo y hay {len(rows)}")
                continue
            gid, caja_id = rows[0]
            if caja_id != ORIGEN:
                errores.append(f"gasto {gid} no sale de la caja {ORIGEN} (caja {caja_id})")
            movs = (await c.execute(text(
                "SELECT id, caja_id, tipo, monto FROM tesoreria_movimientos_caja WHERE gasto_id=:g"), {"g": gid})).all()
            if len(movs) != 1 or movs[0][1] != ORIGEN or movs[0][2] != "egreso" or Decimal(movs[0][3]) != pago.monto:
                errores.append(f"gasto {gid}: se esperaba un solo egreso de {pago.monto} en la caja {ORIGEN}, hay {movs}")
            op = await uno(c, "SELECT numero FROM ordenes_pago WHERE gasto_id=:g AND estado <> 'anulada' LIMIT 1", g=gid)
            if op:
                errores.append(f"gasto {gid} tiene la orden de pago {op[0]} vinculada")
            gastos.append((gid, pago))

        if errores:
            print("\nABORTA, no se toco nada:")
            for e in errores:
                print("  - " + e)
            await tr.rollback()
            return 1

        nombre_tarjeta, nombre_origen = tarjeta[0], origen[0]
        saldo_antes = await saldo_caja(c, ORIGEN)
        deuda_antes = await deuda_tarjeta(c, TARJETA)
        print(f"\nantes: caja {nombre_origen} {saldo_antes:,.2f} | deuda {nombre_tarjeta} {deuda_antes:,.2f}")

        # ---------- acciones ----------
        concepto = f"Pago de tarjeta {nombre_tarjeta}"[:150]
        for gid, pago in gastos:
            borrar_sin_convertir = args.agosto_doble == "borrar" and (pago.fecha, pago.monto) == AGOSTO_10
            await c.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE gasto_id=:g"), {"g": gid})
            nota = ("pago duplicado de agosto, dado de baja sin convertir" if borrar_sin_convertir
                    else "era un pago de tarjeta, reemplazado por pago de tarjeta")
            await c.execute(text(
                "UPDATE gastos SET activo=0, observaciones=CONCAT(COALESCE(observaciones,''), :nota) WHERE id=:g"),
                {"g": gid, "nota": f" {MARCA}] {nota}"})
            if borrar_sin_convertir:
                print(f"  gasto {gid} ({pago.descripcion} {pago.fecha} {pago.monto:,.2f}): baja sin convertir")
                continue
            pp_del_pago = pp_id if pago.del_programado else None
            await c.execute(text(
                "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, tipo, monto, fecha, concepto, descripcion, pago_programado_id, conciliado, created_at) "
                "VALUES (:m, :t, 'ingreso', :mo, :f, :co, :d, :pp, 0, NOW())"),
                {"m": MUNI, "t": TARJETA, "mo": pago.monto, "f": pago.fecha, "co": concepto,
                 "d": f"Pago desde {nombre_origen} {MARCA}, ex gasto #{gid}]", "pp": pp_del_pago})
            await c.execute(text(
                "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, tipo, monto, fecha, concepto, descripcion, pago_programado_id, conciliado, created_at) "
                "VALUES (:m, :cj, 'egreso', :mo, :f, :co, :d, :pp, 0, NOW())"),
                {"m": MUNI, "cj": ORIGEN, "mo": pago.monto, "f": pago.fecha, "co": concepto,
                 "d": f"Pago de {nombre_tarjeta} {MARCA}, ex gasto #{gid}]", "pp": pp_del_pago})
            print(f"  gasto {gid} ({pago.descripcion} {pago.fecha} {pago.monto:,.2f}): convertido en pago de tarjeta")

        await c.execute(text(
            "UPDATE tesoreria_pagos_programados SET tarjeta_caja_id=:t, contacto_id=NULL, monto_pesos=NULL, concepto=:co, "
            "descripcion=:de, caja_id=:cj, dia_del_mes=:dia, proximo_pago=:prox, ultimo_pago=:ult, activo=1 WHERE id=:id"),
            {"t": TARJETA, "co": concepto, "de": f"Paga todo lo que deba el dia {caso.dia_del_mes}", "cj": ORIGEN,
             "dia": caso.dia_del_mes, "prox": caso.proximo_pago, "ult": caso.ultimo_pago, "id": pp_id})
        print(f"  programado {pp_id}: ahora paga la tarjeta {nombre_tarjeta} desde {nombre_origen}, "
              f"todo lo que deba, los {caso.dia_del_mes}")

        # ---------- chequeos posteriores ----------
        saldo_despues = await saldo_caja(c, ORIGEN)
        deuda_despues = await deuda_tarjeta(c, TARJETA)
        activos = (await uno(c, "SELECT COUNT(*) FROM gastos WHERE municipio_id=:m AND activo=1 AND caja_id=:cj "
                                "AND descripcion IN :ds", m=MUNI, cj=ORIGEN,
                             ds=tuple({p.descripcion for p in caso.pagos})))[0]
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
    ap = parser_base("Curacion de la tarjeta de credito")
    ap.add_argument("--caso", default="spn", choices=["spn", "merlo"],
                    help="spn = San Pedro Norte, el caso real (default); merlo = el ensayo en el sandbox")
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
