# -*- coding: utf-8 -*-
"""Prueba del circuito de TARJETA DE CREDITO de punta a punta, en QA.

El circuito que pidio el dueño (2026-09-14), tal cual:

    crear la tarjeta (arranca en cero) -> tres gastos con esa tarjeta
      -> pagar la tarjeta -> el saldo tiene que volver a CERO

Por que este circuito y no otro: el pago de tarjeta **nunca funciono bien en
produccion** y se arreglo la semana pasada. Es lo que el cliente mas pide y lo
que menos rodaje tiene: en produccion hay UNA tarjeta, tocada por ultima vez el
27 de julio. Un circuito asi no se verifica mirando: se verifica con una prueba
que se pueda correr en cada cambio.

LAS DOS COSAS QUE VERIFICA, y la segunda es la que importa:

  1. La deuda de la tarjeta vuelve a CERO despues del pago.
  2. La cantidad de GASTOS **no aumenta** al pagar.

La 2 es el bug historico, y esta escrito en el propio servicio: "NUNCA un
Gasto: el gasto ya se registro al comprar con la tarjeta; volver a registrarlo
es contar la plata dos veces, que es justo lo que le paso a San Pedro Norte
durante cuatro meses". Una prueba que solo mire el saldo daria en verde con la
plata contada dos veces.

SOLO QA. Aborta si la base no se llama como QA. Limpia lo que crea, siempre:
la tarjeta, sus movimientos y sus gastos se borran al final aunque la prueba
falle, asi se puede correr las veces que haga falta.

    DATABASE_URL_QA=...  python scripts/test_circuito_tarjeta.py
    DATABASE_URL_QA=...  python scripts/test_circuito_tarjeta.py --municipio 80
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date
from decimal import Decimal

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(AQUI)
sys.path.insert(0, BACKEND)
sys.path.insert(0, AQUI)

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from models import Gasto, TesoreriaCaja  # noqa: E402
from services.tesoreria_tarjeta import (  # noqa: E402
    deuda_de_tarjeta,
    registrar_pago_tarjeta,
)
# La MISMA funcion que usa el endpoint de gastos para llevar el gasto a la caja.
# Insertar el Gasto y nada mas NO genera deuda: la deuda sale de los movimientos
# de caja, no de la tabla de gastos. Lo descubrio esta prueba (los tres gastos
# daban deuda cero) y es justamente el tipo de cosa que se saltea un test que
# escribe en la base por abajo en vez de usar la logica de la app.
from api.gastos import _sincronizar_movimiento_caja  # noqa: E402

MARCA = "[TEST-TARJETA]"      # todo lo que crea la prueba lleva esta marca
MONTOS = [Decimal("125000.50"), Decimal("89000.00"), Decimal("34500.25")]


def _async_url(u: str) -> str:
    u = u.strip()
    if u.startswith("mysql+pymysql://"):
        return u.replace("mysql+pymysql://", "mysql+aiomysql://", 1)
    if u.startswith("mysql://"):
        return u.replace("mysql://", "mysql+aiomysql://", 1)
    return u


def plata(v) -> str:
    return f"$ {float(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


class Resultado:
    def __init__(self):
        self.pasos: list[tuple[str, bool, str]] = []

    def check(self, nombre: str, ok: bool, detalle: str = ""):
        self.pasos.append((nombre, ok, detalle))
        print(f"   {'OK  ' if ok else 'FALLA'} {nombre}" + (f"  -> {detalle}" if detalle else ""))

    @property
    def paso_todo(self) -> bool:
        return all(ok for _, ok, _ in self.pasos)


async def correr(municipio_id: int) -> bool:
    url = os.environ.get("DATABASE_URL_QA") or os.environ.get("DATABASE_URL", "")
    if not url:
        raise SystemExit("Falta DATABASE_URL_QA en el entorno.")
    engine = create_async_engine(_async_url(url))
    Sesion = async_sessionmaker(engine, expire_on_commit=False)

    r = Resultado()
    tarjeta_id = origen_id = None

    async with Sesion() as db:
        base = (await db.execute(text("SELECT DATABASE()"))).scalar()
        if "qa" not in (base or "").lower():
            raise SystemExit(f"ABORTA: '{base}' no parece QA. Esta prueba escribe, y solo escribe en QA.")
        print(f"base: {base} · municipio: {municipio_id}\n")

        try:
            # ---- 1. la tarjeta, recien creada: tiene que arrancar en cero
            caja_origen = (await db.execute(
                select(TesoreriaCaja).where(
                    TesoreriaCaja.municipio_id == municipio_id,
                    TesoreriaCaja.codigo.isnot(None), TesoreriaCaja.codigo != "TARJETA",
                ).limit(1))).scalar_one_or_none()
            if not caja_origen:
                raise SystemExit("El municipio no tiene ninguna caja comun de donde pagar.")
            origen_id = caja_origen.id

            # Un gasto necesita quien lo cargo: se usa un usuario real del muni.
            creador_id = (await db.execute(text(
                "SELECT id FROM usuarios WHERE municipio_id = :m AND rol <> 'vecino' "
                "ORDER BY activo DESC, id LIMIT 1"), {"m": municipio_id})).scalar()
            if not creador_id:
                raise SystemExit("El municipio no tiene ningun usuario de gestion.")

            # Un gasto le paga a ALGUIEN: se usa un proveedor real del muni, que
            # es como carga el municipio (compra en la ferreteria con la tarjeta).
            proveedor_id = (await db.execute(text(
                "SELECT id FROM contactos WHERE municipio_id = :m AND tipo = 'proveedor' "
                "ORDER BY id LIMIT 1"), {"m": municipio_id})).scalar()
            if not proveedor_id:
                raise SystemExit("El municipio no tiene ningun proveedor cargado.")

            # La tarjeta es UNA sola cosa: una caja con codigo 'TARJETA'. Ahi
            # apunta `gastos.caja_id`, ahi se acumula la deuda y sobre esa se
            # registra el pago. Hubo una segunda entidad (`tarjetas_credito`,
            # pura etiqueta) y esta misma prueba la encontro con un error de
            # foreign key; se elimino en 20260915_tarjeta_unica.
            tarjeta = TesoreriaCaja(
                municipio_id=municipio_id,
                nombre=f"{MARCA} Visa de prueba",
                codigo="TARJETA",
                activo=True,
                saldo_inicial=0,
            )
            db.add(tarjeta)
            await db.flush()
            tarjeta_id = tarjeta.id

            deuda0 = await deuda_de_tarjeta(db, tarjeta.id)
            r.check("la tarjeta nace en cero", deuda0 == 0, plata(deuda0))

            # ---- 2. tres gastos con esa tarjeta
            gastos_antes = (await db.execute(text(
                "SELECT COUNT(*) FROM gastos WHERE municipio_id = :m"), {"m": municipio_id})).scalar()

            creados: list[Gasto] = []
            for i, monto in enumerate(MONTOS, start=1):
                g = Gasto(
                    municipio_id=municipio_id,
                    creador_id=creador_id,
                    destino_tipo="contacto",
                    destino_contacto_id=proveedor_id,
                    concepto=f"{MARCA} compra {i}",
                    descripcion="gasto de prueba del circuito de tarjeta",
                    monto_pesos=monto,
                    fecha=date.today(),
                    forma_pago="tarjeta",
                    estado_pago="concretado",
                    caja_id=tarjeta.id,
                    activo=True,
                )
                db.add(g)
                creados.append(g)
            await db.flush()
            for g in creados:
                await _sincronizar_movimiento_caja(db, g, municipio_id)
            await db.flush()

            esperado = sum(MONTOS)
            deuda1 = await deuda_de_tarjeta(db, tarjeta.id)
            r.check(f"tres gastos suman {plata(esperado)}", deuda1 == esperado,
                    f"la tarjeta debe {plata(deuda1)}")

            # ---- 3. pagar la tarjeta ENTERA (sin monto = todo lo que deba)
            res = await registrar_pago_tarjeta(
                db, municipio_id, tarjeta, caja_origen,
                monto=None, fecha=date.today(),
                concepto=f"{MARCA} pago del resumen",
            )
            await db.flush()

            # ---- 4. lo que tiene que dar
            deuda2 = await deuda_de_tarjeta(db, tarjeta.id)
            r.check("despues de pagar, la tarjeta queda en CERO", deuda2 == 0, plata(deuda2))

            gastos_despues = (await db.execute(text(
                "SELECT COUNT(*) FROM gastos WHERE municipio_id = :m"), {"m": municipio_id})).scalar()
            r.check(
                "pagar NO crea un gasto nuevo (el bug que duplicaba la plata)",
                gastos_despues == gastos_antes + len(MONTOS),
                f"gastos: {gastos_antes} -> {gastos_despues} (los 3 de la compra, ninguno del pago)")

            movs = (await db.execute(text("""
                SELECT COUNT(*) FROM tesoreria_movimientos_caja
                 WHERE caja_id IN (:t, :o) AND (descripcion LIKE :m OR concepto LIKE :m)"""),
                {"t": tarjeta_id, "o": origen_id, "m": f"%{MARCA}%"})).scalar()
            r.check("el pago deja DOS movimientos (ingreso en la tarjeta, egreso en la caja)",
                    movs >= 2, f"{movs} movimientos")

            if getattr(res, "monto", None) is not None:
                r.check("el pago fue por el total de la deuda", Decimal(str(res.monto)) == esperado,
                        plata(res.monto))

        finally:
            # ---- limpieza: siempre, aunque algo haya fallado
            await db.rollback()
            async with Sesion() as limpieza:
                await limpieza.execute(text(
                    "DELETE FROM tesoreria_movimientos_caja WHERE caja_id IN "
                    "(SELECT id FROM tesoreria_cajas WHERE nombre LIKE :m AND municipio_id = :mu)"),
                    {"m": f"%{MARCA}%", "mu": municipio_id})
                await limpieza.execute(text(
                    "DELETE FROM gastos WHERE municipio_id = :mu AND concepto LIKE :m"),
                    {"mu": municipio_id, "m": f"%{MARCA}%"})
                await limpieza.execute(text(
                    "DELETE FROM tesoreria_cajas WHERE municipio_id = :mu AND nombre LIKE :m"),
                    {"mu": municipio_id, "m": f"%{MARCA}%"})
                await limpieza.commit()
            print("\n   (limpieza: se borro todo lo que creo la prueba)")

    await engine.dispose()

    print("\n" + "=" * 62)
    print("  CIRCUITO DE TARJETA: " + ("TODO BIEN" if r.paso_todo else "HAY FALLAS"))
    print("=" * 62)
    return r.paso_todo


def main():
    ap = argparse.ArgumentParser(description="Prueba el circuito de tarjeta de credito en QA.")
    ap.add_argument("--municipio", type=int, default=1000149, help="municipio de QA (default: Merlo)")
    a = ap.parse_args()
    ok = asyncio.run(correr(a.municipio))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
