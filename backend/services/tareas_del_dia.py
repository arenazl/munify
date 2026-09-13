"""El cron que vive DENTRO del API, sin depender de nada externo.

POR QUE NO UN TIMER COMUN. El backend corre en Cloud Run con escalado a cero:
cuando nadie usa la app no hay ningun proceso vivo, asi que un `asyncio` que
duerme hasta las 3 AM sencillamente no existe a esa hora. Y cuando hay trafico
Cloud Run levanta hasta 10 instancias, cada una con su propio timer: la tarea se
ejecutaria hasta 10 veces. Un scheduler interno clasico necesitaria una
instancia prendida 24/7 (que se paga) mas un candado distribuido.

COMO FUNCIONA. Las tareas se cuelgan del trafico normal: la PRIMERA request del
dia dispara las pendientes en segundo plano, sin demorar su respuesta. El
candado es una fila en `configuraciones` con la fecha de la ultima corrida, y se
toma con un UPDATE condicional: de 10 instancias que lleguen a la vez, el
UPDATE solo le cambia la fila a UNA (las demas ven rowcount=0 y se van). Es el
mismo truco que usa el claim anti doble-ejecucion de los pagos programados.

LIMITE, dicho de frente: si un dia NADIE abre la app, las tareas de ese dia
esperan a la primera visita siguiente. Para un municipio que se usa todos los
dias habiles alcanza; si hace falta garantia dura, el endpoint
`/tesoreria/agenda/ejecutar-automaticos` sigue ahi para que lo golpee un
scheduler externo, y los dos caminos conviven sin pisarse gracias al candado.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import AsyncSessionLocal
from models.configuracion import Configuracion

logger = logging.getLogger(__name__)

ART = ZoneInfo("America/Argentina/Buenos_Aires")
CLAVE_CANDADO = "tareas_del_dia_ultima_corrida"

# Se recuerda en memoria del proceso para no ir a la base en cada request. Es
# solo un atajo: la verdad esta en la fila del candado, que es lo que decide.
_ultima_vista: date | None = None


def hoy_ar() -> date:
    return datetime.now(ART).date()


async def _tomar_candado(db: AsyncSession, hoy: date) -> bool:
    """True si a esta instancia le toca correr las tareas de hoy.

    Es una optimizacion, NO la garantia de correccion: lo que impide de verdad
    que un pago salga dos veces es el claim atomico de cada pago programado
    (`ultimo_pago < limite`). Por eso aca alcanza con un UPDATE condicional y no
    hace falta un lock perfecto: en el peor caso dos instancias hacen el
    recorrido y la segunda no encuentra nada que pagar.
    """
    fila = (await db.execute(
        select(Configuracion).where(Configuracion.clave == CLAVE_CANDADO).limit(1)
    )).scalar_one_or_none()

    if fila is None:
        db.add(Configuracion(
            clave=CLAVE_CANDADO,
            valor=hoy.isoformat(),
            descripcion="Ultimo dia en que corrieron las tareas diarias. Evita que varias "
                        "instancias repitan el recorrido; la seguridad real la da el claim "
                        "de cada pago.",
            editable=False,
        ))
        try:
            await db.commit()
            return True
        except Exception:
            await db.rollback()
            return False

    if fila.valor == hoy.isoformat():
        return False

    res = await db.execute(
        update(Configuracion)
        .where(Configuracion.id == fila.id, Configuracion.valor != hoy.isoformat())
        .values(valor=hoy.isoformat())
    )
    await db.commit()
    return res.rowcount > 0


def hay_algo_pendiente() -> bool:
    """Chequeo de costo cero que corre en CADA request: compara dos fechas en
    memoria. Solo si el dia cambio se toca la base."""
    return _ultima_vista != hoy_ar()


async def correr_tareas_del_dia() -> dict:
    """Ejecuta lo que haya pendiente para hoy. Segura de llamar muchas veces:
    si ya corrio, no hace nada. Nunca levanta excepcion hacia el request que la
    disparo: un error en una tarea de fondo no puede romperle la pantalla a
    nadie."""
    global _ultima_vista
    hoy = hoy_ar()
    if _ultima_vista == hoy:
        return {"corrio": False, "motivo": "ya corrio en esta instancia"}

    resultado: dict = {"corrio": False, "fecha": hoy.isoformat()}
    try:
        async with AsyncSessionLocal() as db:
            if not await _tomar_candado(db, hoy):
                _ultima_vista = hoy
                return {"corrio": False, "motivo": "otra instancia la tomo", "fecha": hoy.isoformat()}

            _ultima_vista = hoy
            # Import adentro para no cerrar un ciclo de imports con la API.
            from api.tesoreria_agenda import ejecutar_programados_automaticos
            pagos = await ejecutar_programados_automaticos(db, hasta=hoy)
            resultado.update({"corrio": True, "pagos_automaticos": pagos})
            if pagos.get("ejecutados"):
                logger.info("Tareas del dia %s: %s pagos automaticos por %s",
                            hoy, pagos["ejecutados"], pagos["monto_total"])
    except Exception as e:  # noqa: BLE001 — jamas hacia arriba
        logger.exception("Las tareas del dia fallaron: %s", e)
        resultado["error"] = f"{type(e).__name__}: {e}"
    return resultado
