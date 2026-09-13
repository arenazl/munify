# -*- coding: utf-8 -*-
"""
Siembra el caso REAL de la tarjeta de San Pedro Norte para poder ensayar la
curacion con los mismos numeros que tiene produccion (leidos el 2026-09-11, ver
docs/produccion/02-tarjeta-spn-pagos-cargados-como-gastos.md).

Donde se puede sembrar:
  --caso merlo   el sandbox de PRODUCCION (muni 1000149). Es el ensayo previo a
                 tocar un cliente: mismos montos, mismas fechas, mismo script de
                 curacion. Tambien sirve en QA.
  --caso spn     SOLO en QA. En produccion esos gastos son reales y los cargo el
                 municipio: el script se niega.

Idempotente y RE-EJECUTABLE: si ya se corrio la curacion, la deshace (borra los
pagos de tarjeta, reactiva los gastos, vuelve el programado a como estaba) y
borra las compras de ensayo, para dejar SIEMPRE el mismo punto de partida:

  * la caja-tarjeta con las 26 compras (6.247.510,07) y CERO pagos
  * los 3 pagos del resumen cargados como GASTO desde la caja de origen
  * el pago programado agendando un gasto fijo de 2.180.305,30 todos los 10

Los ids de los gastos NO se fuerzan (en otra base estan ocupados): la curacion
los busca por fecha + monto + descripcion, igual en QA que en produccion.

Uso:
    python scripts/semilla_caso_tarjeta_spn.py --caso merlo --env prod --aplicar
    python scripts/semilla_caso_tarjeta_spn.py --caso spn   --env qa   --aplicar
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

MARCA_CURACION = "[curacion 2026-09-11"


async def uno(c, sql, **p):
    return (await c.execute(text(sql), p)).first()


async def sembrar(args, ent, eng) -> int:
    caso = buscar_caso(args.caso)
    aplicar = aplicar_o_seco(args)

    # --- la guarda que importa: no se siembra encima de datos de un cliente ---
    if not caso.sembrable and ent.es_prod:
        print(f"ABORTA: el caso '{caso.clave}' son datos REALES de un cliente en produccion. "
              "No se siembra encima. Para ensayar en prod, --caso merlo.")
        return 1
    print(f"base: {ent.base} · caso {caso.clave} (muni {caso.municipio_id}) "
          f"({'APLICA' if aplicar else 'EN SECO, se deshace al final'})")

    async with eng.connect() as c:
        tr = await c.begin()
        hechos: list[str] = []
        MUNI, ORIGEN, TARJETA = caso.municipio_id, caso.caja_origen_id, caso.tarjeta_caja_id

        # --- las cajas tienen que existir y ser lo que dicen ser ---
        t = await uno(c, "SELECT municipio_id, codigo, nombre FROM tesoreria_cajas WHERE id=:id", id=TARJETA)
        o = await uno(c, "SELECT municipio_id, codigo, nombre FROM tesoreria_cajas WHERE id=:id", id=ORIGEN)
        if not t or t[0] != MUNI or (t[1] or "").upper() != "TARJETA":
            print(f"ABORTA: la caja {TARJETA} no es una tarjeta del muni {MUNI} ({t})")
            await tr.rollback()
            return 1
        if not o or o[0] != MUNI:
            print(f"ABORTA: la caja {ORIGEN} no es del muni {MUNI} ({o})")
            await tr.rollback()
            return 1
        if (o[1] or "").upper() == "TARJETA":
            print(f"ABORTA: la caja de origen {ORIGEN} es otra tarjeta")
            await tr.rollback()
            return 1
        print(f"  tarjeta: {t[2]}  ·  origen: {o[2]}")

        # --- quien firma los gastos ---
        r = await uno(c, "SELECT id FROM usuarios WHERE municipio_id=:m AND rol='admin' ORDER BY id LIMIT 1", m=MUNI)
        if not r:
            print(f"ABORTA: el muni {MUNI} no tiene ningun admin que pueda figurar como creador")
            await tr.rollback()
            return 1
        creador = r[0]

        # --- el contacto al que apuntaba el programado mal armado ---
        r = await uno(c, "SELECT id FROM contactos WHERE municipio_id=:m AND nombre='Visa' ORDER BY id LIMIT 1", m=MUNI)
        if r:
            contacto_visa = r[0]
        else:
            res = await c.execute(text(
                "INSERT INTO contactos (municipio_id, nombre, tipo, activo, created_at) "
                "VALUES (:m, 'Visa', 'proveedor', 1, NOW())"), {"m": MUNI})
            contacto_visa = res.lastrowid
            hechos.append("contacto Visa creado")

        # --- deshacer una curacion previa, para poder ensayarla de nuevo ---
        res = await c.execute(text(
            "DELETE FROM tesoreria_movimientos_caja WHERE municipio_id=:m AND caja_id=:t AND tipo='ingreso'"),
            {"m": MUNI, "t": TARJETA})
        if res.rowcount:
            hechos.append(f"{res.rowcount} pagos de tarjeta borrados (la tarjeta vuelve a deber todo)")
        res = await c.execute(text(
            "DELETE FROM tesoreria_movimientos_caja WHERE municipio_id=:m AND descripcion LIKE :k"),
            {"m": MUNI, "k": f"%{MARCA_CURACION}%"})
        if res.rowcount:
            hechos.append(f"{res.rowcount} egresos de la curacion borrados")

        # --- las compras que no son del caso se van (ensayos anteriores) ---
        esperadas = {(f, str(Decimal(m))) for f, m, _ in caso.compras}
        sobrantes = [r for r in (await c.execute(text(
            "SELECT id, gasto_id, fecha, monto FROM tesoreria_movimientos_caja WHERE caja_id=:t AND tipo='egreso'"),
            {"t": TARJETA})).all() if (r[2].isoformat(), str(Decimal(r[3]))) not in esperadas]
        for mov_id, gasto_id, _f, _mo in sobrantes:
            await c.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE id=:id"), {"id": mov_id})
            if gasto_id:
                await c.execute(text("DELETE FROM gastos WHERE id=:g"), {"g": gasto_id})
        if sobrantes:
            hechos.append(f"{len(sobrantes)} compras de ensayo borradas")

        # --- el pago programado, tal como lo dejo el municipio ---
        pp_id = caso.programado_id
        valores = {"m": MUNI, "ct": contacto_visa, "cj": ORIGEN, "monto": caso.programado_monto,
                   "co": caso.concepto_programado, "de": caso.descripcion_programado,
                   "dia": caso.dia_del_mes, "prox": caso.proximo_pago, "ult": caso.ultimo_pago}
        existente = None
        if pp_id:
            existente = await uno(c, "SELECT municipio_id FROM tesoreria_pagos_programados WHERE id=:id", id=pp_id)
        else:
            # Sin id fijo: se lo reconoce por contacto + descripcion, para no
            # duplicarlo en cada corrida.
            r = await uno(c, "SELECT id FROM tesoreria_pagos_programados WHERE municipio_id=:m AND contacto_id=:ct "
                             "AND descripcion=:de ORDER BY id LIMIT 1",
                          m=MUNI, ct=contacto_visa, de=caso.descripcion_programado)
            if r:
                pp_id, existente = r[0], (MUNI,)
        if existente and existente[0] != MUNI:
            print(f"ABORTA: el programado {pp_id} es de otro municipio ({existente[0]})")
            await tr.rollback()
            return 1
        if existente:
            await c.execute(text(
                "UPDATE tesoreria_pagos_programados SET contacto_id=:ct, tarjeta_caja_id=NULL, caja_id=:cj, concepto=:co, "
                "descripcion=:de, monto_pesos=:monto, forma_pago='transferencia', frecuencia='mensual', dia_del_mes=:dia, "
                "fecha_fin=NULL, proximo_pago=:prox, ultimo_pago=:ult, activo=1 WHERE id=:id"), {**valores, "id": pp_id})
            hechos.append(f"programado {pp_id} vuelto a como lo dejo el municipio")
        else:
            campos = ("(municipio_id, contacto_id, tarjeta_caja_id, caja_id, concepto, descripcion, monto_pesos, forma_pago, "
                      "frecuencia, dia_del_mes, fecha_inicio, fecha_fin, proximo_pago, ultimo_pago, activo, created_at)")
            vals = "(:m, :ct, NULL, :cj, :co, :de, :monto, 'transferencia', 'mensual', :dia, '2026-08-04', NULL, :prox, :ult, 1, NOW())"
            if pp_id:
                campos = "(id, " + campos[1:]
                vals = "(:id, " + vals[1:]
                valores["id"] = pp_id
            res = await c.execute(text(f"INSERT INTO tesoreria_pagos_programados {campos} VALUES {vals}"), valores)
            pp_id = pp_id or res.lastrowid
            hechos.append(f"programado {pp_id} creado como lo dejo el municipio")

        # --- las compras con tarjeta ---
        nuevas = 0
        for fecha, monto, concepto in caso.compras:
            if await uno(c, "SELECT id FROM tesoreria_movimientos_caja WHERE caja_id=:t AND tipo='egreso' "
                             "AND fecha=:f AND monto=:mo", t=TARJETA, f=fecha, mo=monto):
                continue
            res = await c.execute(text(
                "INSERT INTO gastos (municipio_id, creador_id, destino_tipo, concepto, monto_pesos, fecha, tipo_financiacion, "
                "forma_pago, estado_pago, caja_id, activo, created_at) "
                "VALUES (:m, :cr, 'contacto', :co, :mo, :f, 'contado', 'tarjeta', 'concretado', :t, 1, NOW())"),
                {"m": MUNI, "cr": creador, "co": concepto, "mo": monto, "f": fecha, "t": TARJETA})
            await c.execute(text(
                "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, gasto_id, tipo, monto, fecha, concepto, conciliado, created_at) "
                "VALUES (:m, :t, :g, 'egreso', :mo, :f, :co, 0, NOW())"),
                {"m": MUNI, "t": TARJETA, "g": res.lastrowid, "mo": monto, "f": fecha, "co": concepto})
            nuevas += 1
        if nuevas:
            hechos.append(f"{nuevas} compras con tarjeta agregadas")

        # --- los pagos del resumen, cargados como gasto (el error a curar) ---
        for pago in caso.pagos:
            r = await uno(c, "SELECT id, activo FROM gastos WHERE municipio_id=:m AND fecha=:f AND monto_pesos=:mo "
                             "AND descripcion=:d ORDER BY id LIMIT 1",
                          m=MUNI, f=pago.fecha, mo=pago.monto, d=pago.descripcion)
            pp_del_pago = pp_id if pago.del_programado else None
            if r:
                gasto_id = r[0]
                await c.execute(text(
                    "UPDATE gastos SET activo=1, caja_id=:cj, pago_programado_id=:pp, observaciones=NULL, forma_pago=:fo WHERE id=:id"),
                    {"id": gasto_id, "cj": ORIGEN, "pp": pp_del_pago, "fo": pago.forma_pago})
                if not r[1]:
                    hechos.append(f"gasto {gasto_id} ({pago.descripcion} {pago.fecha}) reactivado")
            else:
                res = await c.execute(text(
                    "INSERT INTO gastos (municipio_id, creador_id, destino_tipo, destino_contacto_id, concepto, descripcion, "
                    "monto_pesos, fecha, tipo_financiacion, forma_pago, estado_pago, caja_id, pago_programado_id, activo, created_at) "
                    "VALUES (:m, :cr, 'contacto', :ct, :co, :d, :mo, :f, 'contado', :fo, 'concretado', :cj, :pp, 1, NOW())"),
                    {"m": MUNI, "cr": creador, "ct": contacto_visa, "co": pago.concepto, "d": pago.descripcion,
                     "mo": pago.monto, "f": pago.fecha, "fo": pago.forma_pago, "cj": ORIGEN, "pp": pp_del_pago})
                gasto_id = res.lastrowid
                hechos.append(f"gasto {gasto_id} ({pago.descripcion} {pago.fecha}) creado")
            if not await uno(c, "SELECT id FROM tesoreria_movimientos_caja WHERE gasto_id=:g", g=gasto_id):
                await c.execute(text(
                    "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, gasto_id, tipo, monto, fecha, concepto, conciliado, created_at) "
                    "VALUES (:m, :cj, :g, 'egreso', :mo, :f, :co, 0, NOW())"),
                    {"m": MUNI, "cj": ORIGEN, "g": gasto_id, "mo": pago.monto, "f": pago.fecha, "co": pago.concepto})
                hechos.append(f"egreso en la caja de origen del gasto {gasto_id} creado")

        # --- foto final ---
        print("\nhecho:" if hechos else "\nnada que hacer: ya estaba sembrado")
        for h in hechos:
            print("  - " + h)
        r = await uno(c, "SELECT COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE -monto END),0), COUNT(*) "
                         "FROM tesoreria_movimientos_caja WHERE caja_id=:t", t=TARJETA)
        print(f"\ntarjeta {TARJETA}: deuda {r[0]:,.2f} en {r[1]} movimientos")
        for g in (await c.execute(text(
                "SELECT id, fecha, monto_pesos, descripcion, pago_programado_id FROM gastos WHERE municipio_id=:m AND activo=1 "
                "AND caja_id=:cj AND descripcion IN :ds ORDER BY fecha"),
                {"m": MUNI, "cj": ORIGEN, "ds": tuple({p.descripcion for p in caso.pagos})})).all():
            print(f"gasto {g[0]} | {g[1]} | {g[2]:,.2f} | {g[3]} | programado {g[4]}")
        r = await uno(c, "SELECT contacto_id, tarjeta_caja_id, monto_pesos, proximo_pago, ultimo_pago, activo "
                         "FROM tesoreria_pagos_programados WHERE id=:id", id=pp_id)
        print(f"programado {pp_id}: contacto {r[0]} | tarjeta {r[1]} | monto {r[2]} | proximo {r[3]} | ultimo {r[4]} | activo {r[5]}")

        if aplicar:
            await tr.commit()
            print("\nCOMMIT")
        else:
            await tr.rollback()
            print("\nROLLBACK (en seco)")
        return 0


async def correr() -> int:
    ap = parser_base("Siembra el caso de la tarjeta para ensayar la curacion")
    ap.add_argument("--caso", default="merlo", choices=["merlo", "spn"],
                    help="merlo = sandbox de produccion (default); spn = solo QA")
    args = ap.parse_args()
    # La guarda del caso va ANTES de resolver la base: contra produccion
    # `resolver_db` pide confirmacion interactiva, y no tiene sentido pedirsela a
    # nadie para algo que de todas formas se va a negar.
    caso = buscar_caso(args.caso)
    if not caso.sembrable and args.env == "prod":
        print(f"ABORTA: el caso '{caso.clave}' son datos REALES de un cliente en produccion. "
              "No se siembra encima. Para ensayar en prod, --caso merlo.")
        return 1
    ent = resolver_db(args)
    eng = create_async_engine(ent.url)
    try:
        return await sembrar(args, ent, eng)
    finally:
        await eng.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(correr()))
