"""Notificaciones del ciclo de vida del turno (C.2 del turnero consolidado).

- Confirmación al reservar (in-app + push, con el código TRN).
- Recordatorio de "mañana/hoy tenés turno" — lo dispara un cron externo
  (Cloud Scheduler → POST /turnos-tramite/enviar-recordatorios con
  X-Cron-Key). Idempotente vía turnos.recordatorio_enviado_at.

Todo best-effort: un fallo de notificación jamás rompe la reserva.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.turno import Turno
from models.municipio_dependencia import MunicipioDependencia
from services.push_service import crear_notificacion_db, send_push_to_user

logger = logging.getLogger(__name__)


def codigo_trn(turno_id: int) -> str:
    return f"TRN-{turno_id:05d}"


def _fecha_legible(dt: datetime) -> str:
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    return f"{dias[dt.weekday()]} {dt.day}/{dt.month} a las {dt.strftime('%H:%M')}hs"


async def notificar_turno_reservado(
    db: AsyncSession,
    turno: Turno,
    tramite_nombre: str | None = None,
    dependencia_nombre: str | None = None,
) -> None:
    """Confirmación in-app + push al titular del turno (si tiene cuenta)."""
    if not turno.usuario_id:
        return
    try:
        titulo = f"Turno confirmado ({codigo_trn(turno.id)})"
        partes = []
        if tramite_nombre:
            partes.append(tramite_nombre)
        partes.append(_fecha_legible(turno.fecha_hora))
        if dependencia_nombre:
            partes.append(f"en {dependencia_nombre}")
        cuerpo = " — ".join(partes)

        await crear_notificacion_db(
            db, usuario_id=turno.usuario_id, titulo=titulo, mensaje=cuerpo,
            tipo="success", accion_url="/gestion/mis-turnos",
        )
        await send_push_to_user(
            db, user_id=turno.usuario_id, title=titulo, body=cuerpo,
            url="/gestion/mis-turnos",
        )
    except Exception as e:  # noqa: BLE001 — best-effort explícito
        logger.warning(f"[turnos] No se pudo notificar la reserva del turno {turno.id}: {e}")


async def enviar_recordatorios(db: AsyncSession) -> dict:
    """Recordatorio para turnos reservados de las próximas 24 horas que aún
    no lo recibieron. Idempotente: marca recordatorio_enviado_at, así el cron
    puede correr con cualquier cadencia sin duplicar avisos."""
    ahora = datetime.now()
    hasta = ahora + timedelta(hours=24)

    turnos = (await db.execute(
        select(Turno)
        .options(
            selectinload(Turno.tramite),
            selectinload(Turno.municipio_dependencia).selectinload(MunicipioDependencia.dependencia),
        )
        .where(
            Turno.estado == "reservado",
            Turno.usuario_id.isnot(None),
            Turno.recordatorio_enviado_at.is_(None),
            Turno.fecha_hora >= ahora,
            Turno.fecha_hora <= hasta,
        )
    )).scalars().all()

    enviados = 0
    for t in turnos:
        try:
            es_hoy = t.fecha_hora.date() == ahora.date()
            titulo = f"{'Hoy' if es_hoy else 'Mañana'} tenés turno ({codigo_trn(t.id)})"
            partes = []
            if t.tramite:
                partes.append(t.tramite.nombre)
            partes.append(_fecha_legible(t.fecha_hora))
            if t.municipio_dependencia and t.municipio_dependencia.dependencia:
                partes.append(f"en {t.municipio_dependencia.dependencia.nombre}")
            cuerpo = " — ".join(partes) + ". Recordá llevar la documentación."

            await crear_notificacion_db(
                db, usuario_id=t.usuario_id, titulo=titulo, mensaje=cuerpo,
                tipo="info", accion_url="/gestion/mis-turnos",
            )
            await send_push_to_user(
                db, user_id=t.usuario_id, title=titulo, body=cuerpo,
                url="/gestion/mis-turnos",
            )
            t.recordatorio_enviado_at = datetime.utcnow()
            enviados += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[turnos] Recordatorio del turno {t.id} falló: {e}")

    await db.commit()
    return {"candidatos": len(turnos), "enviados": enviados}
