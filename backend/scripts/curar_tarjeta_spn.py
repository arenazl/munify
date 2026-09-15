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
     egreso, igual que hace la app al eliminar un gasto) y registra en su lugar
     PAGOS DE TARJETA de verdad: ingreso en la caja-tarjeta + egreso en la caja
     del banco. El gasto deja de estar duplicado.
  2. Convierte el programado en un pago de tarjeta: sin contacto, sin monto
     (paga todo lo que deba el dia que vence).

DOS MODOS, porque los numeros del municipio no cierran entre si (ver doc 02: los
tres pagos suman 6.636.341,50 y las compras cargadas 6.247.510,07):

  --modo cero    (default) UN solo pago por la deuda exacta del dia, fechado en
                 el ultimo pago que registro el municipio. La tarjeta queda en
                 CERO, que es de donde tiene que arrancar el circuito nuevo. La
                 caja del banco recupera la diferencia que se habia pagado de
                 mas. Es lo que pidio el dueño el 2026-09-12: *"le sacamos esos
                 registros que hizo el equivocadamente, le dejamos el saldo en
                 cero, y que a partir del mes que viene funcione bien"*.
  --modo espejo  un pago por cada gasto, con su misma fecha y monto. La caja del
                 banco queda igual al centavo y la tarjeta refleja la diferencia
                 como saldo a favor. Sirve cuando los numeros del municipio SI
                 cierran y no se le quiere tocar el banco.

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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.tesoreria_tarjeta import plata  # noqa: E402

BACKEND = Path(__file__).resolve().parent.parent
# El .env local (si existe) aporta DATABASE_URL para trabajar en QA sin exportar
# nada. Infra en prod no tiene .env: ahi la URL viene por entorno. El guard de
# coherencia de _entorno decide igual, asi que esto no relaja nada.
load_dotenv(BACKEND / ".env")

def hoy_iso() -> str:
    from datetime import date
    return date.today().isoformat()


MARCA = "[curacion 2026-09-11"
AGOSTO_10 = ("2026-08-10", Decimal("2180305.30"))


async def uno(c, sql, **p):
    return (await c.execute(text(sql), p)).first()


async def saldo_caja(c, caja_id) -> Decimal:
    r = await uno(c, "SELECT saldo_inicial + COALESCE((SELECT SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) "
                     "FROM tesoreria_movimientos_caja WHERE caja_id=:id),0) FROM tesoreria_cajas WHERE id=:id", id=caja_id)
    return Decimal(r[0])


async def deuda_tarjeta(c, caja_id, hasta: str | None = None) -> Decimal:
    """Lo que la tarjeta debe. Con `hasta`, lo que debia ESE dia.

    La distincion no es cosmetica: el municipio pago su resumen el 10 y siguio
    comprando el 13 y el 14. Un pago fechado el 10 por el total de hoy estaria
    cancelando compras que todavia no habian pasado.
    """
    sql = ("SELECT COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE -monto END),0) "
           "FROM tesoreria_movimientos_caja WHERE caja_id=:id")
    if hasta:
        sql += " AND fecha <= :hasta"
    r = await uno(c, sql, id=caja_id, **({"hasta": hasta} if hasta else {}))
    return Decimal(r[0])


async def resolver_ids(c, caso, base: str):
    """Los ids del caso son los de PRODUCCION. Devuelve los que valen en ESTA base.

    Por que hace falta: la validacion seria se hace sobre San Pedro clonado a QA,
    y ahi los ids son otros (la caja 373 es la 1000520, el programado 650 es el
    1001192). Sin esto el caso `spn` solo se puede correr en produccion, que es
    justo donde uno no quiere probar.

    No se adivina nada: cada cosa tiene que ser UNICA o aborta.
      - la tarjeta      la unica caja activa con codigo TARJETA del municipio
      - el programado   el que tiene la descripcion y el monto del caso, activo
      - la caja origen  la del programado; es de donde salieron los gastos

    En PRODUCCION los tres tienen que coincidir con los declarados en el caso.
    Si no coinciden, aborta: los ids fijos dejan de ser un estorbo y pasan a ser
    la red de seguridad de que estamos tocando lo que creemos.
    """
    es_prod = not base.lower().endswith("-qa")

    filas = (await c.execute(text(
        "SELECT id FROM tesoreria_cajas WHERE municipio_id=:m AND UPPER(codigo)='TARJETA' AND activo=1"),
        {"m": caso.municipio_id})).all()
    if len(filas) != 1:
        raise SystemExit(f"ABORTA: el muni {caso.municipio_id} tiene {len(filas)} cajas TARJETA activas, "
                         f"se esperaba 1: {[f[0] for f in filas]}")
    tarjeta_id = filas[0][0]

    filas = (await c.execute(text(
        "SELECT id, caja_id FROM tesoreria_pagos_programados "
        " WHERE municipio_id=:m AND activo=1 AND descripcion=:de AND monto_pesos=:mo"),
        {"m": caso.municipio_id, "de": caso.descripcion_programado, "mo": caso.programado_monto})).all()
    if len(filas) != 1:
        raise SystemExit(f"ABORTA: se esperaba 1 programado '{caso.descripcion_programado}' de "
                         f"{caso.programado_monto} y hay {len(filas)}: {[f[0] for f in filas]}")
    programado_id, origen_id = filas[0]
    if origen_id is None:
        raise SystemExit(f"ABORTA: el programado {programado_id} no dice de que caja sale la plata")

    declarados = (caso.tarjeta_caja_id, caso.programado_id, caso.caja_origen_id)
    resueltos = (tarjeta_id, programado_id, origen_id)
    if es_prod:
        distintos = [f"   {n}: el caso dice {d}, la base tiene {r}" for n, d, r in
                     zip(("tarjeta", "programado", "caja origen"), declarados, resueltos)
                     if d is not None and d != r]
        if distintos:
            raise SystemExit("\n".join(["ABORTA en PRODUCCION: los ids no son los del caso."] + distintos))
    elif declarados != resueltos:
        print(f"   (base clonada: tarjeta {caso.tarjeta_caja_id}->{tarjeta_id}, "
              f"programado {caso.programado_id}->{programado_id}, "
              f"caja origen {caso.caja_origen_id}->{origen_id})")
    return tarjeta_id, programado_id, origen_id


async def curar(args, ent, eng) -> int:
    caso = buscar_caso(args.caso)
    aplicar = aplicar_o_seco(args)
    MUNI = caso.municipio_id
    print(f"base: {ent.base} · caso {caso.clave} (muni {MUNI}) "
          f"({'APLICA' if aplicar else 'EN SECO'}) | modo={args.modo}")

    async with eng.connect() as c:
        tr = await c.begin()

        TARJETA, pp_id, ORIGEN = await resolver_ids(c, caso, ent.base)
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

        async def registrar_pago(monto, fecha, detalle, pp_del_pago, restante=Decimal(0)):
            """Los dos movimientos de un pago de tarjeta: entra en la tarjeta, sale
            del banco. La constancia lleva el MONTO escrito, igual que la que deja
            la app: es el comprobante que le queda al municipio."""
            cierre = "la tarjeta queda en cero" if restante <= 0 else f"sigue debiendo {plata(restante)}"
            constancia = (f"Pago de {nombre_tarjeta} por {plata(monto)} desde {nombre_origen}: "
                          f"{cierre} {MARCA}, {detalle}]")
            for caja, tipo in ((TARJETA, "ingreso"), (ORIGEN, "egreso")):
                await c.execute(text(
                    "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, tipo, monto, fecha, concepto, descripcion, pago_programado_id, conciliado, created_at) "
                    f"VALUES (:m, :caja, '{tipo}', :mo, :f, :co, :d, :pp, 0, NOW())"),
                    {"m": MUNI, "caja": caja, "mo": monto, "f": fecha, "co": concepto,
                     "d": constancia, "pp": pp_del_pago})

        # Los gastos mal cargados se van SIEMPRE: no eran gastos.
        for gid, pago in gastos:
            await c.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE gasto_id=:g"), {"g": gid})
            await c.execute(text(
                "UPDATE gastos SET activo=0, observaciones=CONCAT(COALESCE(observaciones,''), :nota) WHERE id=:g"),
                {"g": gid, "nota": f" {MARCA}] no era un gasto: era un pago de la tarjeta"})
            print(f"  gasto {gid} ({pago.descripcion} {pago.fecha} {pago.monto:,.2f}): dado de baja")

        if args.modo == "cero":
            # UN pago por lo que la tarjeta debe hoy. Queda en cero, que es de
            # donde tiene que arrancar el circuito nuevo. Se fecha en el ultimo
            # pago que registro el municipio, para no inventar una fecha futura.
            # La fecha y el monto van JUNTOS. Dos cortes posibles:
            #   --corte pago (default)  el pago se fecha el dia en que el municipio
            #       pago de verdad su ultimo resumen y cubre lo que la tarjeta
            #       debia ESE dia; lo comprado despues queda como deuda viva y lo
            #       paga sola la proxima corrida del programado. Es lo que paso.
            #   --corte hoy  se fecha hoy y cubre todo: la tarjeta queda
            #       literalmente en cero, al costo de sacarle al banco la
            #       diferencia entre lo que el municipio pago y lo que debe hoy.
            # La primera version fechaba al 10 y pagaba el total de HOY: un pago
            # del 10 cancelando compras del 13 y del 14.
            fecha_pago = hoy_iso() if args.corte == "hoy" else max(p.fecha for p in caso.pagos)
            monto_pago = await deuda_tarjeta(c, TARJETA, hasta=fecha_pago)
            queda = deuda_antes - monto_pago
            await registrar_pago(monto_pago, fecha_pago, f"resumen pagado al {fecha_pago}",
                                 pp_id, restante=queda)
            print(f"  pago de tarjeta {plata(monto_pago)} al {fecha_pago}: "
                  + ("la tarjeta queda en CERO" if queda <= 0 else
                     f"quedan {plata(queda)} comprados despues del {fecha_pago}"))
        else:
            for gid, pago in gastos:
                if args.agosto_doble == "borrar" and (pago.fecha, pago.monto) == AGOSTO_10:
                    print(f"  gasto {gid} ({pago.fecha}): no se registra como pago (duplicado de agosto)")
                    continue
                await registrar_pago(pago.monto, pago.fecha, f"ex gasto #{gid}",
                                     pp_id if pago.del_programado else None)
                print(f"  pago de tarjeta {plata(pago.monto)} al {pago.fecha} (ex gasto #{gid})")

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
        diferencia = saldo_despues - saldo_antes
        print(f"\ndespues: caja {nombre_origen} {saldo_despues:,.2f} (antes {saldo_antes:,.2f}, diferencia {diferencia:,.2f})")
        print(f"         deuda {nombre_tarjeta} {deuda_despues:,.2f} (antes {deuda_antes:,.2f})")
        print(f"         gastos 'pago de tarjeta' activos: {activos}")

        if args.modo == "cero":
            # La tarjeta tiene que quedar en cero AL CORTE. Lo que siga debiendo
            # es exactamente lo comprado despues, ni un peso mas.
            pagado_antes = sum(p.monto for p in caso.pagos)
            if deuda_despues != queda or activos != 0:
                print(f"\nABORTA: la tarjeta deberia quedar debiendo {plata(queda)} "
                      f"y quedo en {plata(deuda_despues)}. Se deshace todo")
                await tr.rollback()
                return 1
            if queda > 0:
                print(f"\n   quedan {plata(queda)} de compras posteriores al {fecha_pago}: "
                      f"las paga sola la proxima corrida del programado, el {caso.proximo_pago}.")
            if diferencia > 0:
                print(f"   el municipio habia registrado {pagado_antes:,.2f} de pagos y la tarjeta debia "
                      f"{monto_pago:,.2f} al {fecha_pago}: {diferencia:,.2f} VUELVEN a la caja {nombre_origen}.")
            elif diferencia < 0:
                print(f"   el municipio habia registrado {pagado_antes:,.2f} de pagos y la tarjeta debia "
                      f"{monto_pago:,.2f} al {fecha_pago}: SALEN {-diferencia:,.2f} mas de la caja {nombre_origen}.")
        else:
            esperado = Decimal(0) if args.agosto_doble == "convertir" else AGOSTO_10[1]
            if diferencia != esperado or activos != 0:
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
    ap.add_argument("--modo", choices=["cero", "espejo"], default="cero",
                    help="cero = un pago por la deuda exacta y la tarjeta queda en 0 (default); "
                         "espejo = un pago por cada gasto, el banco no cambia")
    ap.add_argument("--corte", choices=["pago", "hoy"], default="pago",
                    help="solo en modo cero: 'pago' (default) fecha el pago el dia en que el municipio "
                         "pago su ultimo resumen y cubre lo que debia ese dia; 'hoy' paga todo al dia de hoy")
    ap.add_argument("--agosto-doble", choices=["convertir", "borrar"], default="convertir",
                    help="solo en modo espejo: que hacer con el pago del 10 de agosto")
    args = ap.parse_args()
    ent = resolver_db(args)
    eng = create_async_engine(ent.url)
    try:
        return await curar(args, ent, eng)
    finally:
        await eng.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(correr()))
