"""Creación de reclamos, en UN solo lugar (F3 · creación unificada).

Antes toda la lógica de alta vivía inline dentro de `POST /reclamos`
(`api.reclamos.create_reclamo`): construir el reclamo, detectar barrio,
auto-asignar dependencia por categoría, dejar el historial, matchear POI,
gamificación y disparar notificaciones. Este service la concentra para que el
endpoint quede fino (solo resuelve QUIÉN es el creador — vecino propio, modo
mostrador o ghost de ventanilla — que es lógica de auth) y delegue acá el alta.

Decisiones aplicadas (F3):
- Estado inicial SIEMPRE `RECIBIDO` (no hay más `NUEVO` al crear). El default
  del modelo también es `RECIBIDO`.
- Historial COHERENTE: la primera entrada registra `estado_nuevo=RECIBIDO`
  (antes decía `NUEVO`, que ya no era el estado real — era un rastro mentiroso).

Multi-tenant: el `municipio_id` sale SIEMPRE de `actor_user.municipio_id`; las
sub-consultas (dependencia por categoría) filtran por ese municipio.
"""
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.user import User
from models.enums import EstadoReclamo
from models.municipio_dependencia_categoria import MunicipioDependenciaCategoria
from models.categoria_reclamo import CategoriaReclamo
from schemas.reclamo import ReclamoCreate
from services.gamificacion_service import GamificacionService
from services.poi_matching import match_reclamo_a_poi

logger = logging.getLogger(__name__)

# Campos del payload que NO son columnas del reclamo: datos de contacto y de
# solicitante (ya consumidos por el endpoint para resolver el creador) más los
# de modo mostrador. Se excluyen antes de expandir el dict sobre `Reclamo(...)`.
_CAMPOS_NO_RECLAMO = {
    "nombre_contacto", "telefono_contacto", "email_contacto", "recibir_notificaciones",
    "nombre_solicitante", "apellido_solicitante", "dni_solicitante",
    "email_solicitante", "telefono_solicitante", "direccion_solicitante",
    "actuando_como_user_id", "dj_validacion_presencial",
}


async def create_reclamo(
    db: AsyncSession,
    *,
    data: ReclamoCreate,
    creador_id: int,
    actor_user: User,
    canal_ingreso: str,
    es_ventanilla_asistida: bool,
) -> Reclamo:
    """Crea el reclamo y devuelve la instancia persistida (con `id`).

    El caller (endpoint) ya resolvió `creador_id` (dueño real del reclamo) y
    `canal_ingreso`. Acá se hace: construir el reclamo en estado RECIBIDO,
    detectar barrio, auto-asignar dependencia por categoría, dejar la primera
    entrada de historial (coherente), matchear POI, commitear, gamificar y
    disparar notificaciones (push al vecino, push a la dependencia, email).
    El endpoint recarga luego con relaciones para serializar.
    """
    municipio_id = actor_user.municipio_id

    # Solo los campos que son columnas del reclamo (ver _CAMPOS_NO_RECLAMO).
    reclamo_data = data.model_dump(exclude=_CAMPOS_NO_RECLAMO)

    reclamo = Reclamo(
        **reclamo_data,
        creador_id=creador_id,
        municipio_id=municipio_id,
        estado=EstadoReclamo.RECIBIDO,
        canal=canal_ingreso,
    )

    # Detectar barrio automáticamente desde la dirección. Best-effort: una falla
    # NO impide crear el reclamo.
    try:
        from services.barrio_detector import detectar_barrio
        barrio_id = await detectar_barrio(
            db=db,
            municipio_id=municipio_id,
            direccion=data.direccion,
            latitud=data.latitud,
            longitud=data.longitud,
        )
        if barrio_id:
            reclamo.barrio_id = barrio_id
            logger.info("[BARRIO] Detectado barrio_id=%s para %r", barrio_id, data.direccion)
        else:
            logger.info("[BARRIO] Sin barrio para %r", data.direccion)
    except Exception as e:
        logger.warning("[BARRIO] Error detectando barrio: %s", e)

    # Auto-asignar a dependencia según la categoría. Usamos .first() (no
    # scalar_one_or_none) porque si quedó data sucia con filas activas duplicadas
    # para la misma (municipio, categoria) preferimos tomar la más reciente antes
    # que tirar excepción y dejar el reclamo sin dependencia. Multi-tenant estricto.
    try:
        asignacion = await db.execute(
            select(MunicipioDependenciaCategoria)
            .where(
                MunicipioDependenciaCategoria.municipio_id == municipio_id,
                MunicipioDependenciaCategoria.categoria_id == data.categoria_id,
                MunicipioDependenciaCategoria.activo == True,  # noqa: E712
            )
            .order_by(MunicipioDependenciaCategoria.created_at.desc())
        )
        mdc = asignacion.scalars().first()
        if mdc:
            reclamo.municipio_dependencia_id = mdc.municipio_dependencia_id
            logger.info(
                "[DEPENDENCIA] Auto-asignado a dependencia_id=%s por categoría",
                mdc.municipio_dependencia_id,
            )
        else:
            logger.info(
                "[DEPENDENCIA] Sin dependencia configurada para categoría %s en municipio %s",
                data.categoria_id, municipio_id,
            )
    except Exception as e:
        logger.warning("[DEPENDENCIA] Error auto-asignando dependencia: %s", e)

    db.add(reclamo)
    await db.flush()

    # Primera entrada de historial. estado_nuevo=RECIBIDO (COHERENTE con el
    # estado real; antes se registraba NUEVO por error). Si fue por ventanilla
    # asistida dejamos el rastro del operador y la DJ para auditoría; el prefijo
    # "Reclamo creado en ventanilla" es el que usa el filtro que oculta la cocina
    # interna al vecino (api.reclamos.get_reclamo_historial), no cambiar.
    comentario_hist = "Reclamo creado"
    if es_ventanilla_asistida:
        operador = (
            f"{actor_user.nombre or ''} {actor_user.apellido or ''}".strip()
            or actor_user.email
        )
        dj_extra = ""
        if data.dj_validacion_presencial:
            dj_extra = f" — DJ: {data.dj_validacion_presencial[:200]}"
        comentario_hist = f"Reclamo creado en ventanilla por operador {operador}{dj_extra}"

    db.add(HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=actor_user.id,
        estado_nuevo=EstadoReclamo.RECIBIDO,
        accion="creado",
        comentario=comentario_hist,
    ))

    # F6·B — matching geográfico reclamo <-> POI: si tiene coords y cae en el
    # radio de un POI activo del muni, queda vinculado (reclamo.poi_id). Sin
    # coords o sin POIs activos es un no-op barato. Best-effort.
    try:
        await match_reclamo_a_poi(db, reclamo)
    except Exception as e:
        logger.warning("[POI] Error en matching geografico: %s", e)

    await db.commit()
    logger.info("Reclamo #%s creado exitosamente en BD", reclamo.id)

    # Gamificación: otorgar puntos por crear reclamo. No debe romper el alta.
    try:
        puntos, badges = await GamificacionService.procesar_reclamo_creado(
            db, reclamo, actor_user
        )
        logger.info(
            "Gamificacion procesada para reclamo #%s: %s puntos, %s badges",
            reclamo.id, puntos, len(badges),
        )
    except Exception as e:
        logger.warning("Error en gamificacion para reclamo #%s: %s", reclamo.id, e)

    # Nombre de la categoría para las notificaciones
    categoria_nombre = None
    try:
        cat = (await db.execute(
            select(CategoriaReclamo).where(CategoriaReclamo.id == data.categoria_id)
        )).scalar_one_or_none()
        if cat:
            categoria_nombre = cat.nombre
    except Exception as e:
        logger.warning("Error obteniendo categoria para reclamo #%s: %s", reclamo.id, e)

    # Notificaciones en background (no bloquean la respuesta). Los helpers viven
    # en api.reclamos porque los comparten otros endpoints; import diferido para
    # no crear un ciclo de importación con este service.
    from api.reclamos import (
        enviar_notificacion_push,
        enviar_notificacion_dependencia,
        enviar_email_reclamo_creado,
    )

    # 1. Vecino (push + in-app)
    asyncio.create_task(enviar_notificacion_push(
        reclamo_id=reclamo.id,
        tipo_notificacion="reclamo_recibido",
    ))

    # 2. Dependencia asignada (push + in-app)
    if reclamo.municipio_dependencia_id:
        asyncio.create_task(enviar_notificacion_dependencia(
            reclamo_id=reclamo.id,
            municipio_dependencia_id=reclamo.municipio_dependencia_id,
            categoria_nombre=categoria_nombre,
        ))

    # 3. Email de confirmación
    asyncio.create_task(enviar_email_reclamo_creado(
        reclamo_id=reclamo.id,
        usuario_id=actor_user.id,
        usuario_email=actor_user.email,
        reclamo_titulo=reclamo.titulo,
        categoria_nombre=categoria_nombre,
        reclamo_descripcion=reclamo.descripcion,
        creador_nombre=f"{actor_user.nombre or ''} {actor_user.apellido or ''}".strip(),
    ))

    return reclamo
