# -*- coding: utf-8 -*-
"""
Recordatorios del directorio /calls — tres por día, con Web Push.

Por que una capa propia y no `api/push.py`: /calls es una pantalla PUBLICA sin
login y aquella exige `current_user` + `user_id` NOT NULL. Acá la identidad es
el endpoint del navegador, y el estado (cuantas llamadas hizo hoy) lo REPORTA
el cliente, porque vive en su localStorage.

Los tres momentos (regla del dueño, 2026-08-28):
  · manana   — el envion: "tenes N llamadas hoy", con el primero de la cola.
  · mediodia — solo si NO arranco, o si va a mitad de camino.
  · tarde    — el ultimo empujon: "dale que hoy tenes que terminar".
Cumplida la meta, el dia se calla: una notificacion que no aporta entrena a
ignorar las que si aportan.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi import Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pywebpush import webpush, WebPushException

from core.config import settings
from core.database import get_db
from models.calls_push import CallsPushSub

logger = logging.getLogger(__name__)
router = APIRouter()

ART = timezone(timedelta(hours=-3))
MOMENTOS = ("manana", "mediodia", "tarde")


class SubIn(BaseModel):
    endpoint: str = Field(max_length=500)
    p256dh: str = Field(max_length=255)
    auth: str = Field(max_length=255)
    user_agent: Optional[str] = Field(default=None, max_length=500)


class ProgresoIn(BaseModel):
    endpoint: str = Field(max_length=500)
    hechas: int = Field(ge=0, le=99)
    meta: int = Field(default=5, ge=1, le=20)
    proximo: Optional[str] = Field(default=None, max_length=120)


async def _por_endpoint(db: AsyncSession, endpoint: str) -> Optional[CallsPushSub]:
    r = await db.execute(select(CallsPushSub).where(CallsPushSub.endpoint == endpoint))
    return r.scalar_one_or_none()


@router.get("/push/clave")
async def clave_publica():
    """La VAPID publica que el navegador necesita para suscribirse."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="VAPID no configurado en el servidor")
    return {"clave": settings.VAPID_PUBLIC_KEY}


@router.post("/push/suscribir")
async def suscribir(data: SubIn, db: AsyncSession = Depends(get_db)):
    """Alta (o reactivacion) de este navegador. Idempotente por endpoint."""
    sub = await _por_endpoint(db, data.endpoint)
    if sub:
        sub.p256dh_key, sub.auth_key = data.p256dh, data.auth
        sub.user_agent, sub.activo = data.user_agent, True
    else:
        sub = CallsPushSub(
            endpoint=data.endpoint, p256dh_key=data.p256dh, auth_key=data.auth,
            user_agent=data.user_agent, activo=True, hechas=0, meta=5,
        )
        db.add(sub)
    await db.commit()
    return {"ok": True}


@router.post("/push/baja")
async def baja(data: SubIn, db: AsyncSession = Depends(get_db)):
    sub = await _por_endpoint(db, data.endpoint)
    if sub:
        sub.activo = False
        await db.commit()
    return {"ok": True}


@router.post("/push/progreso")
async def progreso(data: ProgresoIn, db: AsyncSession = Depends(get_db)):
    """El cliente reporta como viene el dia. Sin esto el cron no puede decir
    'te faltan 3': las llamadas viven en el localStorage del navegador."""
    sub = await _por_endpoint(db, data.endpoint)
    if not sub:
        raise HTTPException(status_code=404, detail="Este navegador no esta suscripto")
    hoy = datetime.now(ART).date()
    if sub.dia != hoy:
        sub.dia, sub.enviados = hoy, None      # dia nuevo, recordatorios de cero
    sub.hechas, sub.meta, sub.proximo = data.hechas, data.meta, data.proximo
    await db.commit()
    return {"ok": True}


def _mensaje(momento: str, hechas: int, meta: int, proximo: Optional[str]) -> Optional[tuple]:
    """(titulo, cuerpo) del recordatorio, o None si hoy no corresponde hablar."""
    faltan = max(meta - hechas, 0)
    quien = f" Arrancá por {proximo}." if proximo else ""
    if momento == "manana":
        return ("Tenés " + (f"{meta} llamadas" if meta != 1 else "1 llamada") + " hoy",
                f"Objetivo del día: {meta}.{quien}")
    if hechas >= meta:
        return None                              # meta cumplida: silencio
    if momento == "mediodia":
        if hechas == 0:
            return ("Todavía no llamaste a nadie",
                    f"Vas 0 de {meta}.{quien} Con una arrancás.")
        return (f"Vas {hechas} de {meta}",
                f"Te {'falta 1' if faltan == 1 else f'faltan {faltan}'} para cerrar el día.{quien}")
    # tarde
    if hechas == 0:
        return ("Dale, que hoy no llamaste a nadie",
                f"Todavía estás a tiempo de hacer {meta}.{quien}")
    return ("Dale que hoy tenés que terminar",
            f"Vas {hechas} de {meta}: te {'falta 1' if faltan == 1 else f'faltan {faltan}'}.{quien}")


def _enviar(sub: CallsPushSub, titulo: str, cuerpo: str) -> bool:
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh_key, "auth": sub.auth_key},
            },
            data=json.dumps({
                "title": titulo, "body": cuerpo,
                "icon": "/calls/icono-192.png", "badge": "/calls/icono-192.png",
                "url": "/calls/",
            }),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_EMAIL},
        )
        return True
    except WebPushException as e:
        logger.error("calls push fallo: %s", e)
        if e.response is not None and e.response.status_code in (404, 410):
            sub.activo = False      # el navegador se dio de baja solo
        return False


@router.post("/push/cron")
async def cron(request: Request, momento: Optional[str] = None,
               db: AsyncSession = Depends(get_db)):
    """Dispara el recordatorio del momento. Lo llama Cloud Scheduler 3 veces al
    dia (9:00, 13:00 y 17:30 ART) con `?momento=`; sin el, se deduce de la hora.

    Auth: header X-Cron-Key contra CRON_SECRET (mismo patron que turnos)."""
    if not settings.CRON_SECRET:
        raise HTTPException(status_code=503, detail="CRON_SECRET no configurado")
    if request.headers.get("X-Cron-Key") != settings.CRON_SECRET:
        raise HTTPException(status_code=403, detail="Clave de cron invalida")

    ahora = datetime.now(ART)
    if momento not in MOMENTOS:
        momento = "manana" if ahora.hour < 12 else ("mediodia" if ahora.hour < 16 else "tarde")

    hoy = ahora.date()
    r = await db.execute(select(CallsPushSub).where(CallsPushSub.activo == True))  # noqa: E712
    subs = r.scalars().all()

    enviadas = saltadas = 0
    for sub in subs:
        # Progreso de OTRO día = no reportó hoy: se asume que no arrancó.
        hechas = sub.hechas or 0 if sub.dia == hoy else 0
        ya = set((sub.enviados or "").split(",")) if sub.dia == hoy else set()
        if momento in ya:
            saltadas += 1
            continue
        texto = _mensaje(momento, hechas, sub.meta or 5, sub.proximo)
        if texto is None:
            saltadas += 1
            continue
        if _enviar(sub, *texto):
            enviadas += 1
            sub.dia = hoy
            sub.enviados = ",".join(sorted(ya | {momento}))
    await db.commit()
    return {"momento": momento, "suscripciones": len(subs),
            "enviadas": enviadas, "saltadas": saltadas}


@router.post("/push/probar")
async def probar(data: SubIn, db: AsyncSession = Depends(get_db)):
    """Una notificación de prueba al toque, para que el que activa VEA que
    funciona (sin esto, activar es un acto de fe hasta la mañana siguiente)."""
    sub = await _por_endpoint(db, data.endpoint)
    if not sub:
        raise HTTPException(status_code=404, detail="Este navegador no esta suscripto")
    ok = _enviar(sub, "Listo, vas a recibir los recordatorios",
                 "Tres por día: a la mañana, al mediodía y a la tarde.")
    await db.commit()
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudo enviar la notificacion")
    return {"ok": True}
