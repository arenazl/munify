# -*- coding: utf-8 -*-
"""
Semilla del caso REAL de la tarjeta de San Pedro Norte, para ensayar en QA la
curacion y la feature del programado con destino tarjeta con exactamente la
situacion que tiene produccion (leida el 2026-09-11, ver
docs/produccion/02-tarjeta-spn-pagos-cargados-como-gastos.md).

SOLO QA. Idempotente y RE-EJECUTABLE: si ya corrio la curacion, la deshace
(borra los pagos de tarjeta marcados, reactiva los gastos, vuelve el programado
650 a como lo dejo Bartolo) para poder ensayar la curacion otra vez.

Deja, en el municipio 80 de QA:
  * caja 107 Cooparticipacion (origen) y caja 373 "Visa ····9594" (TARJETA, limite 0)
  * las 26 compras con tarjeta (gasto forma tarjeta + egreso en la 373), 6.247.510,07
  * CERO pagos en la tarjeta
  * los 3 pagos del resumen cargados como GASTO desde la 107 (uno manual, dos del
    programado 650), cada uno con su egreso en la 107
  * el programado 650 tal cual: contacto "Visa", 2.180.305,30 fijo, dia 10,
    proximo 2026-10-10, ultimo 2026-09-10, activo, sin tarjeta

Los ids de los gastos NO se fuerzan (en QA estan ocupados por otro municipio):
la curacion los busca por fecha + monto + descripcion, en QA y en prod igual.

Uso:
    DATABASE_URL_QA="$(gcloud secrets versions access latest --secret=DATABASE_URL_QA --project=munify-api)" \\
        python scripts/semilla_caso_tarjeta_spn.py --env qa --aplicar
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
CAJA_ORIGEN = (107, "Cooparticipación", "COPA", Decimal("4566592.43"))
CAJA_TARJETA = (373, "Visa ····9594", "TARJETA", Decimal("0"))
TARJETA = {"denominacion": "Visa", "marca": "Visa", "ultimos_4": "9594", "dia_cierre": 8}
PROGRAMADO = 650
PP_MONTO = Decimal("2180305.30")
MARCA_CURACION = "[curacion 2026-09-11"

# (fecha, monto, concepto): las 26 compras de prod, 6.247.510,07 en total.
COMPRAS = [
    ("2026-05-05", "120000.00", "TSA Online"),
    ("2026-05-06", "159999.00", "Pagos varios"),
    ("2026-05-07", "200000.00", "Pago de viaticos y movilidad"),
    ("2026-06-01", "23500.00", "Publicidad"),
    ("2026-06-02", "31668.97", "Compras varias"),
    ("2026-06-10", "64994.00", "Pagos varios"),
    ("2026-06-10", "90631.45", "Prensa"),
    ("2026-06-10", "145000.00", "Prensa"),
    ("2026-06-15", "82799.64", "Compras varias"),
    ("2026-06-18", "74244.00", "Compras varias"),
    ("2026-07-01", "24500.00", "Publicidad"),
    ("2026-07-06", "81708.59", "Deporte"),
    ("2026-07-12", "119992.00", "Compras varias"),
    ("2026-07-20", "341997.00", "Compra de materiales de oficina"),
    ("2026-07-20", "113999.00", "Compra de materiales de oficina"),
    ("2026-07-22", "38000.00", "Aportes varios"),
    ("2026-07-27", "225220.00", "Compra de herramientas y equipamiento"),
    ("2026-07-31", "42316.00", "Compra de materiales de oficina"),
    ("2026-08-03", "40432.74", "Compra de materiales de oficina"),
    ("2026-08-14", "764094.00", "Compra de materiales de obra"),
    ("2026-08-14", "118265.00", "Compra de materiales de oficina"),
    ("2026-08-19", "169990.00", "Compras varias"),
    ("2026-08-21", "257870.64", "Compra de materiales de obra"),
    ("2026-08-27", "2509198.20", "Compra de materiales de oficina"),
    ("2026-08-31", "177089.84", "Compra de materiales de oficina"),
    ("2026-09-10", "230000.00", "Aporte a subsidios y ayudas sociales"),
]

# Los pagos del resumen cargados como gasto (fecha, monto, forma, concepto, descripcion, programado)
PAGOS_COMO_GASTO = [
    ("2026-08-08", "2275730.90", "otro", "Pagos varios", "Pago Visa", None),
    ("2026-08-10", "2180305.30", "transferencia", "Servicios", "Tarjeta de crédito", PROGRAMADO),
    ("2026-09-10", "2180305.30", "transferencia", "Servicios", "Tarjeta de crédito", PROGRAMADO),
]


async def uno(c, sql, **p):
    return (await c.execute(text(sql), p)).first()


async def main():
    ap = parser_base("Semilla del caso de la tarjeta de SPN (solo QA)")
    args = ap.parse_args()
    ent = resolver_db(args)
    if ent.ambiente != "qa":
        sys.exit("Esta semilla es SOLO para QA.")
    aplicar = aplicar_o_seco(args)
    print(f"base: {ent.base} ({'APLICA' if aplicar else 'EN SECO, se deshace al final'})")

    eng = create_async_engine(ent.url)
    async with eng.connect() as c:
        tr = await c.begin()
        hechos: list[str] = []

        # --- quien firma los gastos: Bartolo si esta, si no el primer admin ---
        r = await uno(c, "SELECT id FROM usuarios WHERE municipio_id=:m AND rol='admin' ORDER BY (email='munisanpedronorte@gmail.com') DESC, id LIMIT 1", m=MUNI)
        if not r:
            sys.exit("no hay admin en el muni 80 de QA")
        creador = r[0]

        # --- cajas ---
        for cid, nombre, codigo, saldo in (CAJA_ORIGEN, CAJA_TARJETA):
            r = await uno(c, "SELECT municipio_id, codigo, saldo_inicial FROM tesoreria_cajas WHERE id=:id", id=cid)
            if not r:
                await c.execute(text(
                    "INSERT INTO tesoreria_cajas (id, municipio_id, nombre, codigo, saldo_inicial, activo, orden, created_at) "
                    "VALUES (:id, :m, :n, :c, :s, 1, 0, NOW())"), {"id": cid, "m": MUNI, "n": nombre, "c": codigo, "s": saldo})
                hechos.append(f"caja {cid} {nombre} creada")
            elif r[0] != MUNI:
                sys.exit(f"la caja {cid} es de otro municipio ({r[0]}): no se puede sembrar")
            elif cid == CAJA_TARJETA[0] and ((r[1] or "") != "TARJETA" or Decimal(r[2] or 0) != saldo):
                await c.execute(text("UPDATE tesoreria_cajas SET codigo='TARJETA', saldo_inicial=:s, activo=1 WHERE id=:id"), {"id": cid, "s": saldo})
                hechos.append(f"caja {cid}: codigo TARJETA y limite {saldo} (como prod)")

        # --- tarjeta de credito ---
        r = await uno(c, "SELECT id FROM tarjetas_credito WHERE municipio_id=:m AND ultimos_4=:u", m=MUNI, u=TARJETA["ultimos_4"])
        if r:
            tarjeta_id = r[0]
        else:
            res = await c.execute(text(
                "INSERT INTO tarjetas_credito (municipio_id, denominacion, marca, ultimos_4, dia_cierre, orden, activo, created_at) "
                "VALUES (:m, :d, :ma, :u, :dc, 0, 1, NOW())"), {"m": MUNI, "d": TARJETA["denominacion"], "ma": TARJETA["marca"], "u": TARJETA["ultimos_4"], "dc": TARJETA["dia_cierre"]})
            tarjeta_id = res.lastrowid
            hechos.append("tarjeta Visa 9594 creada")

        # --- contacto Visa ---
        r = await uno(c, "SELECT id FROM contactos WHERE municipio_id=:m AND nombre='Visa' ORDER BY id LIMIT 1", m=MUNI)
        if r:
            contacto_visa = r[0]
        else:
            res = await c.execute(text(
                "INSERT INTO contactos (municipio_id, nombre, tipo, activo, created_at) VALUES (:m, 'Visa', 'proveedor', 1, NOW())"), {"m": MUNI})
            contacto_visa = res.lastrowid
            hechos.append("contacto Visa creado")

        # --- deshacer una curacion previa (para poder ensayarla de nuevo) ---
        res = await c.execute(text(
            "DELETE FROM tesoreria_movimientos_caja WHERE municipio_id=:m AND caja_id=:t AND tipo='ingreso'"), {"m": MUNI, "t": CAJA_TARJETA[0]})
        if res.rowcount:
            hechos.append(f"{res.rowcount} pagos de tarjeta borrados (la tarjeta vuelve a deber todo)")
        res = await c.execute(text(
            "DELETE FROM tesoreria_movimientos_caja WHERE municipio_id=:m AND descripcion LIKE :marca"), {"m": MUNI, "marca": f"%{MARCA_CURACION}%"})
        if res.rowcount:
            hechos.append(f"{res.rowcount} egresos de la curacion borrados")

        # --- programado 650 tal cual lo dejo Bartolo ---
        valores = {"id": PROGRAMADO, "m": MUNI, "ct": contacto_visa, "cj": CAJA_ORIGEN[0], "monto": PP_MONTO}
        r = await uno(c, "SELECT municipio_id FROM tesoreria_pagos_programados WHERE id=:id", id=PROGRAMADO)
        if not r:
            await c.execute(text(
                "INSERT INTO tesoreria_pagos_programados (id, municipio_id, contacto_id, tarjeta_caja_id, caja_id, concepto, descripcion, "
                "monto_pesos, forma_pago, frecuencia, dia_del_mes, fecha_inicio, fecha_fin, proximo_pago, ultimo_pago, activo, created_at) "
                "VALUES (:id, :m, :ct, NULL, :cj, 'Servicios', 'Tarjeta de crédito', :monto, 'transferencia', 'mensual', 10, "
                "'2026-08-04', NULL, '2026-10-10', '2026-09-10', 1, '2026-08-04 13:21:50')"), valores)
            hechos.append("programado 650 creado como lo dejo Bartolo")
        elif r[0] != MUNI:
            sys.exit(f"el programado 650 es de otro municipio ({r[0]}): no se puede sembrar")
        else:
            await c.execute(text(
                "UPDATE tesoreria_pagos_programados SET contacto_id=:ct, tarjeta_caja_id=NULL, caja_id=:cj, concepto='Servicios', "
                "descripcion='Tarjeta de crédito', monto_pesos=:monto, forma_pago='transferencia', frecuencia='mensual', dia_del_mes=10, "
                "fecha_inicio='2026-08-04', fecha_fin=NULL, proximo_pago='2026-10-10', ultimo_pago='2026-09-10', activo=1 WHERE id=:id"), valores)
            hechos.append("programado 650 vuelto a como lo dejo Bartolo")

        # --- las compras que NO son del caso real se van (ensayos previos) ---
        esperadas = {(f, str(Decimal(m))) for f, m, _ in COMPRAS}
        sobrantes = [r for r in (await c.execute(text(
            "SELECT id, gasto_id, fecha, monto FROM tesoreria_movimientos_caja WHERE caja_id=:t AND tipo='egreso'"),
            {"t": CAJA_TARJETA[0]})).all() if (r[2].isoformat(), str(Decimal(r[3]))) not in esperadas]
        for mov_id, gasto_id, fecha, monto in sobrantes:
            await c.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE id=:id"), {"id": mov_id})
            if gasto_id:
                await c.execute(text("DELETE FROM gastos WHERE id=:g"), {"g": gasto_id})
        if sobrantes:
            hechos.append(f"{len(sobrantes)} compras de ensayo borradas (la tarjeta vuelve al resumen real)")

        # --- las 26 compras con tarjeta ---
        nuevas = 0
        for fecha, monto, concepto in COMPRAS:
            r = await uno(c, "SELECT id FROM tesoreria_movimientos_caja WHERE caja_id=:t AND tipo='egreso' AND fecha=:f AND monto=:mo",
                          t=CAJA_TARJETA[0], f=fecha, mo=monto)
            if r:
                continue
            res = await c.execute(text(
                "INSERT INTO gastos (municipio_id, creador_id, destino_tipo, concepto, monto_pesos, fecha, tipo_financiacion, forma_pago, "
                "estado_pago, caja_id, tarjeta_credito_id, activo, created_at) "
                "VALUES (:m, :cr, 'contacto', :co, :mo, :f, 'contado', 'tarjeta', 'concretado', :t, :tc, 1, NOW())"),
                {"m": MUNI, "cr": creador, "co": concepto, "mo": monto, "f": fecha, "t": CAJA_TARJETA[0], "tc": tarjeta_id})
            gasto_id = res.lastrowid
            await c.execute(text(
                "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, gasto_id, tipo, monto, fecha, concepto, conciliado, created_at) "
                "VALUES (:m, :t, :g, 'egreso', :mo, :f, :co, 0, NOW())"),
                {"m": MUNI, "t": CAJA_TARJETA[0], "g": gasto_id, "mo": monto, "f": fecha, "co": concepto})
            nuevas += 1
        if nuevas:
            hechos.append(f"{nuevas} compras con tarjeta agregadas")

        # --- los 3 pagos del resumen cargados como gasto ---
        for fecha, monto, forma, concepto, descripcion, pp in PAGOS_COMO_GASTO:
            r = await uno(c, "SELECT id, activo FROM gastos WHERE municipio_id=:m AND fecha=:f AND monto_pesos=:mo AND descripcion=:d ORDER BY id LIMIT 1",
                          m=MUNI, f=fecha, mo=monto, d=descripcion)
            if r:
                gasto_id = r[0]
                await c.execute(text(
                    "UPDATE gastos SET activo=1, caja_id=:cj, pago_programado_id=:pp, observaciones=NULL, forma_pago=:fo WHERE id=:id"),
                    {"id": gasto_id, "cj": CAJA_ORIGEN[0], "pp": pp, "fo": forma})
                if not r[1]:
                    hechos.append(f"gasto {gasto_id} ({descripcion} {fecha}) reactivado")
            else:
                res = await c.execute(text(
                    "INSERT INTO gastos (municipio_id, creador_id, destino_tipo, destino_contacto_id, concepto, descripcion, monto_pesos, fecha, "
                    "tipo_financiacion, forma_pago, estado_pago, caja_id, pago_programado_id, activo, created_at) "
                    "VALUES (:m, :cr, 'contacto', :ct, :co, :d, :mo, :f, 'contado', :fo, 'concretado', :cj, :pp, 1, NOW())"),
                    {"m": MUNI, "cr": creador, "ct": contacto_visa, "co": concepto, "d": descripcion, "mo": monto, "f": fecha,
                     "fo": forma, "cj": CAJA_ORIGEN[0], "pp": pp})
                gasto_id = res.lastrowid
                hechos.append(f"gasto {gasto_id} ({descripcion} {fecha}) creado")
            r = await uno(c, "SELECT id FROM tesoreria_movimientos_caja WHERE gasto_id=:g", g=gasto_id)
            if not r:
                await c.execute(text(
                    "INSERT INTO tesoreria_movimientos_caja (municipio_id, caja_id, gasto_id, tipo, monto, fecha, concepto, conciliado, created_at) "
                    "VALUES (:m, :cj, :g, 'egreso', :mo, :f, :co, 0, NOW())"),
                    {"m": MUNI, "cj": CAJA_ORIGEN[0], "g": gasto_id, "mo": monto, "f": fecha, "co": concepto})
                hechos.append(f"egreso en la 107 del gasto {gasto_id} creado")

        # --- foto final ---
        print("\nhecho:" if hechos else "\nnada que hacer: ya estaba sembrado")
        for h in hechos:
            print("  - " + h)
        r = await uno(c, "SELECT COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE -monto END),0), COUNT(*) FROM tesoreria_movimientos_caja WHERE caja_id=:t", t=CAJA_TARJETA[0])
        print(f"\ntarjeta 373: deuda {r[0]:,.2f} en {r[1]} movimientos")
        rows = (await c.execute(text(
            "SELECT id, fecha, monto_pesos, descripcion, pago_programado_id FROM gastos WHERE municipio_id=:m AND activo=1 AND caja_id=:cj "
            "AND descripcion IN ('Pago Visa','Tarjeta de crédito') ORDER BY fecha"), {"m": MUNI, "cj": CAJA_ORIGEN[0]})).all()
        for g in rows:
            print(f"gasto {g[0]} | {g[1]} | {g[2]:,.2f} | {g[3]} | programado {g[4]}")
        r = await uno(c, "SELECT contacto_id, tarjeta_caja_id, monto_pesos, proximo_pago, ultimo_pago, activo FROM tesoreria_pagos_programados WHERE id=:id", id=PROGRAMADO)
        print(f"programado 650: contacto {r[0]} | tarjeta {r[1]} | monto {r[2]} | proximo {r[3]} | ultimo {r[4]} | activo {r[5]}")

        if aplicar:
            await tr.commit()
            print("\nCOMMIT")
        else:
            await tr.rollback()
            print("\nROLLBACK (en seco)")
    await eng.dispose()


if __name__ == "__main__":
    asyncio.run(main())
