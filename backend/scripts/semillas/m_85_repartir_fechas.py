"""Reparte en el tiempo los reclamos que la semilla creo todos el mismo dia.

QUE PROBLEMA RESUELVE
Los reclamos se crean por API, y la API los sella con la fecha de HOY — no hay
forma de pedirle otra. Con eso, los 321 reclamos de las categorias nuevas
quedaron todos en el mismo dia: el tablero mostraba "324 entraron / 3
resueltos" en agosto, o sea una tasa del 1% que no es de la gestion sino de
como se sembro. Y el bloque de tendencia, que compara MESES, quedaba leyendo
un mes de un solo dia con 324 ingresos.

Este modulo los reparte sobre los TRES MESES CALENDARIO COMPLETOS anteriores al
actual, y cierra una parte, para que la serie sea comparable mes a mes.

POR QUE MESES COMPLETOS Y NO "LOS ULTIMOS 90 DIAS"
Porque el bloque de tendencia compara MESES. Si se reparte por dias corridos,
el mes en curso entra a la comparacion con los dias que lleva: hoy, dia 1,
seria un "mes" de una jornada al lado de otro de treinta y uno. El promedio
por dia sale disparado y la lectura miente. Repartiendo por mes calendario,
los tres que se comparan tienen todos su mes entero.

LA CURVA NO ES PLANA NI AL AZAR
Se reparte con una intencion: el mes mas viejo entra menos y cierra peor, y
hacia el presente entra mas y se cierra mejor. Asi la tendencia MUESTRA UN
CAMBIO —que es lo unico que un tablero de gestion tiene para decir— en vez de
tres meses iguales. Los fines de semana entra bastante menos que los dias
habiles, como en un municipio de verdad.

Deterministico: no usa random. La distribucion sale de una funcion del indice
del reclamo, asi que dos corridas dan exactamente el mismo reparto.

ESCRITURA DIRECTA
No hay endpoint para cambiar la fecha de alta de un reclamo (y esta bien que
no lo haya). Es uno de los casos que el README del kit contempla: SQLAlchemy
directo, SIEMPRE envuelto en guard_qa(), que aborta si la URL no es de QA.
"""
from __future__ import annotations

import asyncio
import os
from calendar import monthrange
from datetime import date, datetime, time, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from _api import guard_qa

MARCA = "[repartir]"

# Solo toca lo que sembro el kit: el prefijo [DEMO] y el token de m_80.
PATRON = "%[DEMO]%Set ampliado%"

# Cuantos meses completos hacia atras se llenan (el bloque compara tres).
MESES = 3
# Cuanto del total cae en cada mes, del mas viejo al mas nuevo: el volumen
# CRECE (un municipio que se pone en marcha recibe mas denuncias, no menos).
PESO_MES = (0.24, 0.33, 0.43)
# Que proporcion se cierra en cada mes: la gestion MEJORA con el tiempo. Este
# es el dato que da la narrativa — la brecha entre lo que entra y lo que se
# cierra se va achicando, que es lo que el tablero tiene para mostrar.
CIERRE_MES = (0.61, 0.78, 0.93)


def _url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise SystemExit(
            f"{MARCA} falta DATABASE_URL en el entorno.\n"
            f"                tiene que ser la de QA — este modulo escribe tabla directa."
        )
    return guard_qa(url)


def _meses_previos(hoy: date, cantidad: int) -> list[date]:
    """Primer dia de los `cantidad` meses completos anteriores al de `hoy`.

    Del mas viejo al mas nuevo. El mes en curso queda afuera a proposito: ver
    la nota de arriba sobre por que un mes a medio andar no es comparable.
    """
    meses = []
    ancla = hoy.replace(day=1)
    for _ in range(cantidad):
        ancla = (ancla - timedelta(days=1)).replace(day=1)
        meses.append(ancla)
    return list(reversed(meses))


def _reparto(total: int, hoy: date) -> list[tuple[date, bool]]:
    """(fecha_de_alta, se_cierra) para cada reclamo. Deterministico."""
    salida: list[tuple[date, bool]] = []
    cupos = [int(total * p) for p in PESO_MES]
    cupos[-1] += total - sum(cupos)  # el resto al ultimo, sin perder ninguno

    for indice, primero in enumerate(_meses_previos(hoy, MESES)):
        ultimo_dia = monthrange(primero.year, primero.month)[1]
        cupo = cupos[indice]
        for i in range(cupo):
            # 7919 es primo y no divide a 28/29/30/31: el paso recorre todos
            # los dias del mes antes de repetir, en vez de amontonarse.
            dia = 1 + (i * 7919) % ultimo_dia
            fecha = date(primero.year, primero.month, dia)
            # Sabados y domingos: dos de cada tres se corren al lunes. Un
            # municipio recibe menos el fin de semana, pero no cero.
            if fecha.weekday() >= 5 and i % 3 != 0:
                fecha += timedelta(days=7 - fecha.weekday())
                if fecha.month != primero.month:  # no cruzar de mes
                    fecha -= timedelta(days=3)
            # Cierres repartidos parejo entre TODOS los del mes (Bresenham),
            # no los primeros N: si no, los cerrados se amontonan en los
            # mismos dias y la curva de resueltos queda escalonada.
            # La proporcion se toma sobre el cupo del mes — compararla contra
            # un 100 fijo daba la misma tasa en meses de cupo distinto.
            ratio = CIERRE_MES[indice]
            cierra = int((i + 1) * ratio) > int(i * ratio)
            salida.append((fecha, cierra))
    return salida


async def _correr() -> dict:
    engine = create_async_engine(_url(), pool_pre_ping=True)
    creados = 0
    try:
        async with engine.begin() as conn:
            ids = [r[0] for r in (await conn.execute(
                text("SELECT id FROM reclamos WHERE titulo LIKE :p ORDER BY id"),
                {"p": PATRON},
            )).all()]

            if not ids:
                print(f"{MARCA} no hay reclamos del kit para repartir.")
                return {"creados": 0, "existentes": 0}

            plan = _reparto(len(ids), date.today())
            for rid, (dia, cierra) in zip(ids, plan):
                alta = datetime.combine(
                    dia,
                    # Hora habil, escalonada: un municipio no recibe todo a las 00:00.
                    time(8 + (rid % 9), (rid * 7) % 60),
                )
                if cierra:
                    # Cerrado entre 1 y 9 dias despues, nunca en el futuro.
                    demora = 1 + (rid % 9)
                    cierre = min(alta + timedelta(days=demora), datetime.now() - timedelta(hours=1))
                    await conn.execute(text("""
                        UPDATE reclamos
                           SET created_at = :alta,
                               updated_at = :cierre,
                               fecha_resolucion = :cierre,
                               estado = 'finalizado'
                         WHERE id = :id
                    """), {"alta": alta, "cierre": cierre, "id": rid})
                else:
                    await conn.execute(text("""
                        UPDATE reclamos
                           SET created_at = :alta,
                               updated_at = :alta,
                               fecha_resolucion = NULL
                         WHERE id = :id
                    """), {"alta": alta, "id": rid})
                creados += 1
    finally:
        await engine.dispose()

    print(f"[repartir] reclamos repartidos={creados}")
    return {"creados": creados, "existentes": 0}


def sembrar(api, hoy: date) -> dict:
    """El kit llama a esto; el trabajo es tabla directa (no hay endpoint)."""
    return asyncio.run(_correr())


if __name__ == "__main__":
    asyncio.run(_correr())
