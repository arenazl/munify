# -*- coding: utf-8 -*-
"""
EL PASE DE LA TARJETA DE SAN PEDRO NORTE. Un solo comando, sin decisiones.

    python scripts/pase_tarjeta_spn.py --env prod              # mira y dice que haria
    python scripts/pase_tarjeta_spn.py --env prod --aplicar    # lo hace

No hay flags que elegir ni criterios que interpretar: todo lo que habia que
decidir se decidio el 2026-09-12 y esta adentro. Si algo no esta como tiene que
estar, ABORTA y dice que falta. Si ya se corrio, dice "ya curado" y sale.

QUE HACE, en este orden:
  1. Chequea que el terreno este listo: migracion aplicada en prod, codigo vivo,
     y el municipio en el estado exacto que se relevo.
  2. Muestra la foto ANTES.
  3. Corre `curar_tarjeta_spn.py --caso spn --modo cero`, que es el mismo script
     que ya se ensayo en Merlo con estos mismos numeros.
  4. Verifica el DESPUES contra lo esperado, numero por numero.
  5. Imprime el reporte para pegar.

QUE ESPERA ENCONTRAR (relevado en prod el 2026-09-11 y sin cambios al 12):
  caja 373 "Visa ····9594"   debe 6.247.510,07 en 26 compras, 0 pagos
  caja 107 "Cooparticipación"  es la que paga
  3 gastos activos que en realidad eran pagos del resumen
  programado 650 agendando un gasto fijo de 2.180.305,30 todos los 10

QUE TIENE QUE QUEDAR:
  la tarjeta en 0,00
  la caja 107 con 388.831,43 MAS (lo que se habia pagado de mas)
  0 gastos de "pago de tarjeta" activos
  el programado 650 pagando la tarjeta, sin monto fijo, modo aprobacion

Contexto completo: docs/produccion/04-handoff-pase-tarjeta-spn.md
"""
from __future__ import annotations

import asyncio
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from _entorno import parser_base, resolver_db, aplicar_o_seco
from casos_tarjeta import caso as buscar_caso
from services.tesoreria_tarjeta import plata  # noqa: E402

BACKEND = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND / ".env")

CASO = "spn"
DEUDA_ESPERADA = Decimal("6247510.07")
COMPRAS_ESPERADAS = 26
PAGADO_DE_MAS = Decimal("388831.43")
COLUMNAS = [
    ("tesoreria_pagos_programados", "tarjeta_caja_id"),
    ("tesoreria_pagos_programados", "modo_ejecucion"),
    ("tesoreria_pagos_programados", "ejecutado_auto_en"),
    ("tesoreria_movimientos_caja", "pago_programado_id"),
    ("tesoreria_movimientos_caja", "fecha_programada"),
    ("gastos", "fecha_programada"),
]


def titulo(t):
    print(f"\n{'=' * 70}\n  {t}\n{'=' * 70}")


async def uno(c, q, **p):
    return (await c.execute(text(q), p)).first()


async def deuda(c, caja):
    return Decimal((await uno(c, "SELECT COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE -monto END),0) "
                                 "FROM tesoreria_movimientos_caja WHERE caja_id=:t", t=caja))[0])


async def saldo(c, caja):
    return Decimal((await uno(c, "SELECT saldo_inicial + COALESCE((SELECT SUM(CASE WHEN tipo='ingreso' THEN monto "
                                 "ELSE -monto END) FROM tesoreria_movimientos_caja WHERE caja_id=:i),0) "
                                 "FROM tesoreria_cajas WHERE id=:i", i=caja))[0])


async def foto(c, caso):
    """Los cuatro numeros que importan, antes y despues."""
    pp = await uno(c, "SELECT tarjeta_caja_id, contacto_id, monto_pesos, modo_ejecucion, proximo_pago "
                      "FROM tesoreria_pagos_programados WHERE id=:p", p=caso.programado_id)
    activos = (await uno(c, "SELECT COUNT(*) FROM gastos WHERE municipio_id=:m AND activo=1 AND caja_id=:cj "
                            "AND descripcion IN :ds", m=caso.municipio_id, cj=caso.caja_origen_id,
                         ds=tuple({p.descripcion for p in caso.pagos})))[0]
    return {
        "deuda": await deuda(c, caso.tarjeta_caja_id),
        "caja": await saldo(c, caso.caja_origen_id),
        "gastos_activos": activos,
        "programado_paga_tarjeta": pp[0] == caso.tarjeta_caja_id if pp else None,
        "programado": pp,
    }


async def main() -> int:
    ap = parser_base("El pase de la tarjeta de San Pedro Norte")
    args = ap.parse_args()
    ent = resolver_db(args)
    aplicar = aplicar_o_seco(args)
    caso = buscar_caso(CASO)

    titulo(f"PASE TARJETA SPN · base {ent.base} · {'APLICA' if aplicar else 'SOLO MIRA'}")

    eng = create_async_engine(ent.url)
    try:
        async with eng.connect() as c:
            # ---------- 1. el terreno ----------
            print("\n1. EL TERRENO")
            problemas = []

            for tabla, col in COLUMNAS:
                cols = {r[0] for r in (await c.execute(text(f"SHOW COLUMNS FROM {tabla}"))).all()}
                if col not in cols:
                    problemas.append(f"falta la columna {tabla}.{col}: la migracion no esta aplicada")
            print(f"   migracion: {'aplicada' if not problemas else 'FALTA'}")

            f = await foto(c, caso)
            ya = f["programado_paga_tarjeta"]
            if ya:
                titulo("YA ESTA HECHO")
                print(f"   El programado {caso.programado_id} ya paga la tarjeta.")
                print(f"   Deuda de la tarjeta: {plata(f['deuda'])}")
                print(f"   Caja {caso.caja_origen_id}: {plata(f['caja'])}")
                print("\n   No hay nada que correr. Si necesitas revisar el resultado, esta todo")
                print("   en docs/produccion/04-handoff-pase-tarjeta-spn.md")
                return 0

            if f["deuda"] != DEUDA_ESPERADA:
                problemas.append(f"la tarjeta debe {plata(f['deuda'])} y se esperaba {plata(DEUDA_ESPERADA)}: "
                                 "el municipio cargo o pago algo desde el relevamiento. PARAR y volver a mirar")
            compras = (await uno(c, "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE caja_id=:t AND tipo='egreso'",
                                 t=caso.tarjeta_caja_id))[0]
            if compras != COMPRAS_ESPERADAS:
                problemas.append(f"la tarjeta tiene {compras} compras y se esperaban {COMPRAS_ESPERADAS}")
            pagos_previos = (await uno(c, "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE caja_id=:t "
                                          "AND tipo='ingreso'", t=caso.tarjeta_caja_id))[0]
            if pagos_previos:
                problemas.append(f"la tarjeta ya tiene {pagos_previos} pagos registrados")
            if f["gastos_activos"] != len(caso.pagos):
                problemas.append(f"hay {f['gastos_activos']} gastos de pago de tarjeta activos y se esperaban "
                                 f"{len(caso.pagos)}")

            print(f"   tarjeta {caso.tarjeta_caja_id}: debe {plata(f['deuda'])} en {compras} compras, "
                  f"{pagos_previos} pagos")
            print(f"   caja {caso.caja_origen_id}: {plata(f['caja'])}")
            print(f"   gastos que en realidad eran pagos: {f['gastos_activos']}")
            pp = f["programado"]
            print(f"   programado {caso.programado_id}: monto {pp[2]}, modo {pp[3]}, vence {pp[4]}")

            if problemas:
                titulo("ABORTA: el terreno no esta como se relevo")
                for p in problemas:
                    print(f"   - {p}")
                print("\n   NO se toco nada. Leer docs/produccion/04-handoff-pase-tarjeta-spn.md")
                print("   antes de forzar cualquier cosa.")
                return 1
            print("\n   Todo como se relevo. Se puede seguir.")
            antes = f

        # ---------- 2. la curacion ----------
        titulo("2. LA CURACION" + ("" if aplicar else " (en seco)"))
        cmd = [sys.executable, "scripts/curar_tarjeta_spn.py", "--caso", CASO, "--env", args.env]
        if aplicar:
            cmd.append("--aplicar")
        print(f"   $ {' '.join(cmd[1:])}\n")
        r = subprocess.run(cmd, cwd=str(BACKEND), text=True, encoding="utf-8", errors="replace",
                           capture_output=True, input="munify_prod\n")
        for linea in (r.stdout or "").splitlines():
            if linea.strip():
                print("   " + linea)
        if r.returncode != 0:
            titulo("LA CURACION FALLO")
            print((r.stderr or "")[-1500:])
            return 1

        if not aplicar:
            titulo("ESTO ES LO QUE HARIA")
            print("   Nada quedo escrito. Para hacerlo de verdad, el mismo comando con --aplicar")
            return 0

        # ---------- 3. el resultado ----------
        async with eng.connect() as c:
            despues = await foto(c, caso)

        titulo("3. EL RESULTADO")
        fallas = []
        if despues["deuda"] != 0:
            fallas.append(f"la tarjeta quedo en {plata(despues['deuda'])} y tenia que quedar en cero")
        if despues["caja"] - antes["caja"] != PAGADO_DE_MAS:
            fallas.append(f"la caja se movio {plata(despues['caja'] - antes['caja'])} y se esperaba "
                          f"{plata(PAGADO_DE_MAS)}")
        if despues["gastos_activos"] != 0:
            fallas.append(f"quedaron {despues['gastos_activos']} gastos de pago de tarjeta activos")
        if not despues["programado_paga_tarjeta"]:
            fallas.append("el programado no quedo apuntando a la tarjeta")

        print(f"   tarjeta:     {plata(antes['deuda'])}  ->  {plata(despues['deuda'])}")
        print(f"   caja {caso.caja_origen_id}:   {plata(antes['caja'])}  ->  {plata(despues['caja'])}"
              f"   ({plata(despues['caja'] - antes['caja'])})")
        print(f"   gastos:      {antes['gastos_activos']}  ->  {despues['gastos_activos']}")
        pp = despues["programado"]
        print(f"   programado {caso.programado_id}: paga la tarjeta {pp[0]}, sin monto fijo ({pp[2]}), "
              f"modo {pp[3]}, vence {pp[4]}")

        if fallas:
            titulo("OJO: el resultado no es el esperado")
            for x in fallas:
                print(f"   - {x}")
            print("\n   La curacion corre en UNA transaccion: o quedo todo o no quedo nada.")
            print("   Verificar a mano antes de volver a correr.")
            return 1

        titulo("PASE COMPLETO")
        print("   La tarjeta quedo en cero y el programado la paga solo el dia 10.")
        print(f"   {plata(PAGADO_DE_MAS)} volvieron a la caja: es lo que el municipio habia pagado de mas,")
        print("   y la señal de que le faltan compras por cargar.")
        print("\n   El municipio NO tiene que hacer nada este mes.")
        print("   Avisar a Infra por el canal entre agentes.")
        return 0
    finally:
        await eng.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
