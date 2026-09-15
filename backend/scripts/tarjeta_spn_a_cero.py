# -*- coding: utf-8 -*-
"""Deja la tarjeta de San Pedro EN CERO y hace que el mes que viene se pague sola.

El problema, medido en produccion el 2026-09-15:

  - La caja de la tarjeta tiene 28 egresos y CERO ingresos desde el 5 de mayo:
    la deuda ($6.663.721,28) nunca bajo un peso.
  - No es que el boton "Pagar tarjeta" no funcione -se probo por HTTP y anda-.
    Lo que pasa es que el resumen se paga con un PAGO PROGRAMADO que genera un
    gasto comun de $2.180.305,30 todos los 10 contra Coparticipacion. La plata
    sale, el gasto queda... y la caja de la tarjeta nunca se entera.
  - Efecto doble: la deuda sube para siempre Y la plata se cuenta dos veces
    (una en la compra, otra en el "pago" cargado como gasto).

Que hace este script, en el orden que pidio el dueño:

  1. APUNTA EL PROGRAMADO A LA TARJETA (`tarjeta_caja_id`). Es la capacidad que
     se agrego para esto y que ya esta viva en produccion, pero que nadie uso
     todavia: hay CERO programados con destino tarjeta. Desde el mes que viene
     el pago se descuenta solo de la tarjeta y no hace falta tocar nada mas.
  2. Si hay MAS DE UN programado apuntando al resumen, deja uno solo -el de la
     tarjeta que corresponde- y consolida el importe.
  3. DEJA LA TARJETA EN CERO con un pago por la deuda de hoy. Es por unica vez,
     para arrancar limpio: el historico NO se reconstruye (dueño, 2026-09-15).
  4. Muestra la foto ANTES y DESPUES, numero por numero.

No inventa el monto: la deuda se lee de la base en el momento de grabar, que es
lo mismo que hace el boton.

    python scripts/tarjeta_spn_a_cero.py                      # mira y dice que haria
    python scripts/tarjeta_spn_a_cero.py --aplicar --si-estoy-seguro
    python scripts/tarjeta_spn_a_cero.py --municipio 80 --env qa
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(AQUI)
sys.path.insert(0, BACKEND)
sys.path.insert(0, AQUI)

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from models import TesoreriaCaja  # noqa: E402
from services.tesoreria_tarjeta import (  # noqa: E402
    deuda_de_tarjeta,
    registrar_pago_tarjeta,
)

SPN = 80


def _async_url(u: str) -> str:
    u = u.strip()
    if u.startswith("mysql+pymysql://"):
        return u.replace("mysql+pymysql://", "mysql+aiomysql://", 1)
    if u.startswith("mysql://"):
        return u.replace("mysql://", "mysql+aiomysql://", 1)
    return u


def plata(v) -> str:
    return f"$ {float(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


async def correr(municipio_id: int, aplicar: bool, url: str, forzado: int | None = None):
    engine = create_async_engine(_async_url(url))
    Sesion = async_sessionmaker(engine, expire_on_commit=False)

    async with Sesion() as db:
        base = (await db.execute(text("SELECT DATABASE()"))).scalar()
        print(f"base: {base}  ·  municipio: {municipio_id}  ·  "
              f"{'APLICA' if aplicar else 'SOLO MIRA'}\n")

        # ---------- la tarjeta
        tarjetas = list((await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.municipio_id == municipio_id,
                TesoreriaCaja.codigo == "TARJETA",
            ))).scalars())
        if not tarjetas:
            raise SystemExit("ABORTA: el municipio no tiene ninguna caja de tipo TARJETA.")

        print("1. LAS TARJETAS")
        deudas = {}
        for t in tarjetas:
            d = await deuda_de_tarjeta(db, t.id)
            deudas[t.id] = d
            print(f"   caja {t.id} · {t.nombre} · debe {plata(d)}")

        # La que corresponde: la que mas debe. Si hay una sola, es esa.
        tarjeta = max(tarjetas, key=lambda t: deudas[t.id])
        if len(tarjetas) > 1:
            print(f"   -> se consolida en la caja {tarjeta.id} ({tarjeta.nombre}), que es la que debe")

        # ---------- el programado que paga el resumen
        print("\n2. LOS PAGOS PROGRAMADOS QUE PAGAN EL RESUMEN")
        # OJO CON EL CRITERIO. La primera version buscaba "programados grandes"
        # (monto >= 1.000.000) y en el modo seco eligio el equivocado y propuso
        # DESACTIVAR NUEVE pagos legitimos del municipio -sueldos, incentivos,
        # honorarios-. Un municipio tiene muchos pagos grandes; ninguno de eso
        # lo hace el pago de una tarjeta.
        #
        # El criterio correcto no adivina: el pago del resumen es el programado
        # que YA GENERO los gastos que pagan la tarjeta. Esos gastos llevan
        # `pago_programado_id`, asi que se pregunta por ahi. Si no se puede
        # deducir sin ambiguedad, se exige `--programado <id>` y no se toca nada.
        candidatos = list((await db.execute(text("""
            SELECT p.id, p.concepto, p.monto_pesos, p.caja_id, p.tarjeta_caja_id,
                   p.dia_del_mes, p.activo
              FROM tesoreria_pagos_programados p
             WHERE p.municipio_id = :m AND p.activo = 1
               AND (p.tarjeta_caja_id IS NOT NULL OR p.id = :forzado OR EXISTS (
                     SELECT 1 FROM gastos g
                      WHERE g.pago_programado_id = p.id
                        AND g.municipio_id = p.municipio_id
                        AND g.fecha >= DATE_SUB(CURDATE(), INTERVAL 45 DAY)
                        AND (g.concepto LIKE '%arjeta%' OR g.descripcion LIKE '%arjeta%'
                             OR g.concepto LIKE '%esumen%')))
             ORDER BY (p.tarjeta_caja_id IS NOT NULL) DESC, p.monto_pesos DESC"""),
            {"m": municipio_id, "forzado": forzado or -1})).fetchall())

        ya_ok = [p for p in candidatos if p[4] is not None]
        sin_destino = [p for p in candidatos if p[4] is None]
        for p in candidatos:
            marca = "  <- ya apunta a la tarjeta" if p[4] else ""
            print(f"   #{p[0]} '{p[1]}' {plata(p[2])} dia {p[5]} caja={p[3]}{marca}")

        if forzado:
            elegido = next((p for p in candidatos if p[0] == forzado), None)
            if not elegido:
                raise SystemExit(f"ABORTA: el programado #{forzado} no existe, no esta activo o no es de este municipio.")
            print(f"   -> indicado a mano: #{elegido[0]} ({plata(elegido[2])})")
        elif ya_ok:
            elegido = ya_ok[0]
            print(f"   -> ya apunta a la tarjeta: #{elegido[0]}")
        elif len(sin_destino) == 1:
            elegido = sin_destino[0]
            print(f"   -> el unico que paga la tarjeta: #{elegido[0]} ({plata(elegido[2])})")
        else:
            elegido = None
            print("   -> NO se puede deducir cual es el pago del resumen.")
            print("      Volver a correr con --programado <id>. No se toca nada.")

        # Sobrantes = SOLO los que tambien apuntan a una tarjeta. Nunca se toca
        # un programado que paga otra cosa.
        sobrantes = [p for p in ya_ok if elegido and p[0] != elegido[0]]

        # ---------- que se haria
        deuda_hoy = deudas[tarjeta.id]
        print("\n3. LO QUE SE VA A HACER")
        if elegido:
            print(f"   a) el programado #{elegido[0]} pasa a tener DESTINO TARJETA (caja {tarjeta.id})")
        if sobrantes:
            print(f"   b) se desactivan {len(sobrantes)} programados duplicados: {[p[0] for p in sobrantes]}")
        print(f"   c) se paga la tarjeta por {plata(deuda_hoy)} y queda en CERO (por unica vez)")
        print("      el historico NO se reconstruye: de aca en mas el programado la descuenta solo")

        if not aplicar:
            print("\nEN SECO: no se escribio nada. Para aplicarlo:")
            print("   python scripts/tarjeta_spn_a_cero.py --aplicar --si-estoy-seguro")
            await engine.dispose()
            return True

        # ---------- aplicar
        origen = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.municipio_id == municipio_id,
                TesoreriaCaja.codigo != "TARJETA",
                TesoreriaCaja.id == (elegido[3] if elegido else None),
            ))).scalar_one_or_none()
        if origen is None:
            origen = (await db.execute(
                select(TesoreriaCaja).where(
                    TesoreriaCaja.municipio_id == municipio_id,
                    TesoreriaCaja.codigo != "TARJETA",
                ).limit(1))).scalar_one_or_none()
        if origen is None:
            raise SystemExit("ABORTA: no hay caja comun de donde salga la plata.")

        print("\n4. APLICANDO")
        if elegido:
            await db.execute(text("""
                UPDATE tesoreria_pagos_programados
                   SET tarjeta_caja_id = :t, contacto_id = NULL, updated_at = NOW()
                 WHERE id = :id"""), {"t": tarjeta.id, "id": elegido[0]})
            print(f"   + el programado #{elegido[0]} ahora paga la tarjeta {tarjeta.id}")
        for p in sobrantes:
            await db.execute(text(
                "UPDATE tesoreria_pagos_programados SET activo = 0, updated_at = NOW() WHERE id = :id"),
                {"id": p[0]})
            print(f"   + programado #{p[0]} desactivado (duplicado)")

        if deuda_hoy > 0:
            res = await registrar_pago_tarjeta(
                db, municipio_id, tarjeta, origen,
                monto=None, fecha=date.today(),
                concepto="Pago del resumen — puesta en cero",
                descripcion="Por unica vez: la tarjeta arranca en cero. De aca en mas la paga el programado.",
            )
            print(f"   + pago registrado por {plata(getattr(res, 'monto', deuda_hoy))}")
        else:
            print("   + la tarjeta ya estaba en cero")

        await db.commit()

        # ---------- verificacion
        print("\n5. COMO QUEDO")
        async with Sesion() as fresca:
            d = await deuda_de_tarjeta(fresca, tarjeta.id)
            print(f"   deuda de la tarjeta: {plata(d)}")
            ok_deuda = abs(float(d)) < 0.01
            n = (await fresca.execute(text(
                "SELECT COUNT(*) FROM tesoreria_pagos_programados "
                "WHERE municipio_id = :m AND activo = 1 AND tarjeta_caja_id IS NOT NULL"),
                {"m": municipio_id})).scalar()
            print(f"   programados activos que pagan la tarjeta: {n}")
            ok_prog = n == 1
            ing = (await fresca.execute(text(
                "SELECT COUNT(*) FROM tesoreria_movimientos_caja WHERE caja_id = :k AND tipo = 'ingreso'"),
                {"k": tarjeta.id})).scalar()
            print(f"   ingresos en la caja de la tarjeta: {ing} (antes eran 0)")

        bien = ok_deuda and ok_prog
        print("\n" + "=" * 62)
        print("  TARJETA A CERO: " + ("TODO BIEN" if bien else "REVISAR (arriba)"))
        print("=" * 62)
        await engine.dispose()
        return bien


def main():
    ap = argparse.ArgumentParser(description="Deja la tarjeta de SPN en cero y el programado apuntando a ella.")
    ap.add_argument("--municipio", type=int, default=SPN)
    ap.add_argument("--env", choices=("qa", "prod"), default="qa")
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--si-estoy-seguro", dest="seguro", action="store_true")
    ap.add_argument("--programado", type=int, default=None,
                    help="id del pago programado que paga el resumen, cuando no se puede deducir")
    a = ap.parse_args()
    if a.aplicar and not a.seguro:
        raise SystemExit("Falta --si-estoy-seguro. Sin las dos banderas no escribe nada.")
    url = os.environ.get("DATABASE_URL_PROD" if a.env == "prod" else "DATABASE_URL_QA") or os.environ.get("DATABASE_URL", "")
    if not url:
        raise SystemExit(f"Falta DATABASE_URL_{'PROD' if a.env == 'prod' else 'QA'} en el entorno.")
    ok = asyncio.run(correr(a.municipio, a.aplicar and a.seguro, url, a.programado))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
