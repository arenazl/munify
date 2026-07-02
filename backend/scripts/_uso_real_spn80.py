# -*- coding: utf-8 -*-
"""Auditoria READ-ONLY del uso real de SPN (municipio_id=80). Solo SELECTs."""
import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from core.database import engine

MUNI = 80


async def q(conn, sql, **params):
    return (await conn.execute(text(sql), params or {})).fetchall()


async def scalar(conn, sql, **params):
    return (await conn.execute(text(sql), params or {})).scalar()


async def group(conn, table, col, extra_where="", label=None):
    rows = await q(conn,
        f"SELECT {col} k, COUNT(*) c FROM {table} WHERE municipio_id={MUNI} {extra_where} GROUP BY {col} ORDER BY c DESC")
    print(f"  por {label or col}: " + (", ".join(f"{r._mapping['k']}={r._mapping['c']}" for r in rows) if rows else "(vacio)"))


async def main():
    async with engine.connect() as conn:
        tablas = {list(r._mapping.values())[0] for r in await q(conn, "SHOW TABLES")}

        def existe(t):
            if t not in tablas:
                print(f"\n== {t} == TABLA NO EXISTE")
                return False
            return True

        print("=" * 70)
        print("1. TESORERIA / EGRESOS (municipio_id=80)")
        print("=" * 70)

        if existe("gastos"):
            r = (await q(conn, f"SELECT COUNT(*) c, SUM(monto_pesos) m, MIN(fecha) mn, MAX(fecha) mx, SUM(activo=1) act FROM gastos WHERE municipio_id={MUNI}"))[0]._mapping
            print(f"\n== gastos ==\n  total: {r['c']} (activos: {r['act']}) | monto total: ${r['m']} | fechas: {r['mn']} a {r['mx']}")
            await group(conn, "gastos", "estado_pago")
            await group(conn, "gastos", "tipo_financiacion")
            await group(conn, "gastos", "forma_pago")

        if existe("gastos_cuotas"):
            r = (await q(conn, f"SELECT COUNT(*) c, SUM(gc.monto) m FROM gastos_cuotas gc JOIN gastos g ON g.id=gc.gasto_id WHERE g.municipio_id={MUNI}"))[0]._mapping
            print(f"\n== gastos_cuotas (join gastos) ==\n  total: {r['c']} | monto: ${r['m']}")
            rows = await q(conn, f"SELECT gc.estado k, COUNT(*) c FROM gastos_cuotas gc JOIN gastos g ON g.id=gc.gasto_id WHERE g.municipio_id={MUNI} GROUP BY gc.estado")
            print("  por estado: " + (", ".join(f"{x._mapping['k']}={x._mapping['c']}" for x in rows) if rows else "(vacio)"))

        if existe("tesoreria_cajas"):
            rows = await q(conn, f"SELECT nombre, codigo, saldo_inicial, activo FROM tesoreria_cajas WHERE municipio_id={MUNI} ORDER BY orden")
            print(f"\n== tesoreria_cajas == total: {len(rows)}")
            for x in rows:
                m = x._mapping
                print(f"  - {m['nombre']} (cod={m['codigo']}, saldo_inicial=${m['saldo_inicial']}, activo={m['activo']})")

        if existe("tesoreria_movimientos_caja"):
            r = (await q(conn, f"SELECT COUNT(*) c FROM tesoreria_movimientos_caja WHERE municipio_id={MUNI}"))[0]._mapping
            print(f"\n== tesoreria_movimientos_caja == total: {r['c']}")
            rows = await q(conn, f"SELECT tipo k, COUNT(*) c, SUM(monto) m FROM tesoreria_movimientos_caja WHERE municipio_id={MUNI} GROUP BY tipo")
            for x in rows:
                print(f"  tipo {x._mapping['k']}: {x._mapping['c']} movs, ${x._mapping['m']}")
            conc = await scalar(conn, f"SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE municipio_id={MUNI} AND conciliado=1")
            print(f"  conciliados: {conc}")

        if existe("tesoreria_pagos_programados"):
            r = (await q(conn, f"SELECT COUNT(*) c, SUM(activo=1) act, SUM(monto_pesos) m FROM tesoreria_pagos_programados WHERE municipio_id={MUNI}"))[0]._mapping
            print(f"\n== tesoreria_pagos_programados == total: {r['c']} (activos: {r['act']}) | monto mensualizado bruto: ${r['m']}")
            await group(conn, "tesoreria_pagos_programados", "frecuencia")
            await group(conn, "tesoreria_pagos_programados", "forma_pago")

        if existe("contactos"):
            r = (await q(conn, f"SELECT COUNT(*) c, SUM(activo=1) act FROM contactos WHERE municipio_id={MUNI}"))[0]._mapping
            print(f"\n== contactos == total: {r['c']} (activos: {r['act']})")
            await group(conn, "contactos", "tipo")

        if existe("ordenes_pago"):
            r = (await q(conn, f"SELECT COUNT(*) c, SUM(monto_pesos) m, MIN(fecha_emision) mn, MAX(fecha_emision) mx FROM ordenes_pago WHERE municipio_id={MUNI}"))[0]._mapping
            print(f"\n== ordenes_pago == total: {r['c']} | monto: ${r['m']} | emision: {r['mn']} a {r['mx']}")
            await group(conn, "ordenes_pago", "estado")
            await group(conn, "ordenes_pago", "etapa_contable")

        for t, desc in [
            ("contaduria_retenciones", "retenciones"),
            ("tesoreria_conceptos", "conceptos gastos"),
            ("tesoreria_tipos_concepto", "tipos de concepto"),
            ("tesoreria_conceptos_liquidacion", "conceptos liquidacion"),
            ("tesoreria_tipos_empleado", "tipos de empleado"),
            ("tesoreria_premios", "premios"),
            ("tesoreria_parajes", "parajes"),
            ("proyectos", "proyectos"),
            ("tarjetas_credito", "tarjetas de credito"),
        ]:
            if existe(t):
                r = (await q(conn, f"SELECT COUNT(*) c, SUM(activo=1) act FROM {t} WHERE municipio_id={MUNI}"))[0]._mapping
                print(f"\n== {t} ({desc}) == total: {r['c']} (activos: {r['act']})")
                if r['c'] and r['c'] <= 25:
                    try:
                        rows = await q(conn, f"SELECT nombre FROM {t} WHERE municipio_id={MUNI} ORDER BY id")
                        print("  nombres: " + ", ".join(x._mapping['nombre'] for x in rows))
                    except Exception:
                        await conn.rollback()
                        print("  (tabla sin columna nombre)")

        print()
        print("=" * 70)
        print("2. RECAUDACION (municipio_id=80)")
        print("=" * 70)

        if existe("tasas_partidas"):
            c = await scalar(conn, f"SELECT COUNT(*) FROM tasas_partidas WHERE municipio_id={MUNI}")
            print(f"  tasas_partidas: {c}")
        if existe("tasas_deudas"):
            c = await scalar(conn, f"SELECT COUNT(*) FROM tasas_deudas d JOIN tasas_partidas p ON p.id=d.partida_id WHERE p.municipio_id={MUNI}")
            print(f"  tasas_deudas (via partida): {c}")
        if existe("tasas_pagos"):
            c = await scalar(conn, f"SELECT COUNT(*) FROM tasas_pagos tp JOIN tasas_deudas d ON d.id=tp.deuda_id JOIN tasas_partidas p ON p.id=d.partida_id WHERE p.municipio_id={MUNI}")
            print(f"  tasas_pagos (via deuda->partida): {c}")
        if existe("pago_sesiones"):
            c = await scalar(conn, f"SELECT COUNT(*) FROM pago_sesiones WHERE municipio_id={MUNI}")
            print(f"  pago_sesiones: {c}")
        for t in ("municipio_proveedores_pago", "municipio_proveedor_pago"):
            if t in tablas:
                rows = await q(conn, f"SELECT proveedor, activo, test_mode FROM {t} WHERE municipio_id={MUNI}")
                print(f"  {t}: {len(rows)}" + ("".join(f" | {x._mapping['proveedor']} activo={x._mapping['activo']} test={x._mapping['test_mode']}" for x in rows)))
                break
        else:
            print("  municipio_proveedores_pago: TABLA NO EXISTE")

        print()
        print("=" * 70)
        print("3. MUNICIPIO_MODULOS (muni 80)")
        print("=" * 70)
        if existe("municipio_modulos"):
            rows = await q(conn, f"SELECT modulo, activo FROM municipio_modulos WHERE municipio_id={MUNI} ORDER BY modulo")
            for x in rows:
                print(f"  {x._mapping['modulo']}: {'ON' if x._mapping['activo'] else 'off'}")
            if not rows:
                print("  (sin filas)")

        print()
        print("=" * 70)
        print("4. ULTIMA ACTIVIDAD (MAX created_at / updated_at)")
        print("=" * 70)
        for t in ("gastos", "tesoreria_movimientos_caja", "ordenes_pago", "tesoreria_pagos_programados", "contactos"):
            if t in tablas:
                r = (await q(conn, f"SELECT MAX(created_at) cr, MAX(updated_at) up FROM {t} WHERE municipio_id={MUNI}"))[0]._mapping
                print(f"  {t}: max created_at={r['cr']} | max updated_at={r['up']}")

        print()
        print("=" * 70)
        print("5. USUARIOS de muni 80")
        print("=" * 70)
        rows = await q(conn, f"SELECT rol, COUNT(*) c, SUM(activo=1) act FROM usuarios WHERE municipio_id={MUNI} GROUP BY rol ORDER BY c DESC")
        tot = 0
        for x in rows:
            m = x._mapping
            tot += m['c']
            print(f"  {m['rol']}: {m['c']} (activos: {m['act']})")
        print(f"  TOTAL: {tot}")

    await engine.dispose()


asyncio.run(main())
