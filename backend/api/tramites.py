"""
API de Trámites (per-municipio).

Estructura:
- /tramites               → CRUD de Tramite (per-municipio, con FK a CategoriaTramite)
- /tramites/{id}/documentos-requeridos → CRUD de la sub-tabla
- /tramites/solicitudes...             → Solicitudes (instancias creadas por vecinos)
- /tramites/solicitudes/{id}/checklist-documentos → Checklist de verificación
- /tramites/solicitudes/{id}/documentos/{doc_id}/verificar → Marca verificado

Reglas de negocio:
- No hay catálogo global. Cada municipio es dueño de sus categorías y trámites.
- Una solicitud no puede pasar de `recibido` → `en_curso` si quedan documentos
  obligatorios sin verificar (ver `validar_transicion_a_en_curso`).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, date
import logging
import cloudinary
import cloudinary.uploader

from core.database import get_db
from core.security import get_current_user, get_current_user_optional, require_roles
from core.config import settings
from models.tramite import Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from models.tramite_documento_requerido import TramiteDocumentoRequerido
from models.categoria_tramite import CategoriaTramite
from models.documento_solicitud import DocumentoSolicitud
from models.user import User
from models.enums import RolUsuario
from schemas.tramite import (
    TramiteCreate, TramiteUpdate, TramiteResponse,
    TramiteDocumentoRequeridoCreate, TramiteDocumentoRequeridoUpdate,
    TramiteDocumentoRequeridoResponse,
    SolicitudCreate, SolicitudUpdate, SolicitudResponse, SolicitudGestionResponse,
    SolicitudAsignar, HistorialSolicitudResponse,
    DocumentoSolicitudChecklistItem, ChecklistDocumentosResponse,
)

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================
# HELPERS
# ============================================================

def get_effective_municipio_id(request: Request, current_user: User) -> int:
    """Obtiene el municipio_id efectivo (header X-Municipio-ID si admin/supervisor)."""
    if current_user and current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        header_municipio_id = request.headers.get("X-Municipio-ID")
        if header_municipio_id:
            try:
                return int(header_municipio_id)
            except (ValueError, TypeError):
                pass
    if not current_user or current_user.municipio_id is None:
        raise HTTPException(
            status_code=400,
            detail="Usuario sin municipio asignado. Indicar X-Municipio-ID.",
        )
    return current_user.municipio_id


async def enviar_notificacion_solicitud(db, solicitud, tramite_nombre=None):
    try:
        from services.push_service import notificar_solicitud_recibida
        await notificar_solicitud_recibida(db, solicitud, tramite_nombre)
    except Exception as e:
        logger.warning(f"[PUSH] Error notificando solicitud: {e}")


async def enviar_notificacion_supervisores_solicitud(db, solicitud, tramite_nombre=None):
    try:
        from services.push_service import notificar_dependencia_solicitud_nueva
        await notificar_dependencia_solicitud_nueva(db, solicitud, tramite_nombre)
    except Exception as e:
        logger.warning(f"[PUSH] Error notificando supervisores: {e}")


async def enviar_email_solicitud_creada(db, solicitud, usuario, tramite_nombre=None):
    try:
        from services.email_service import email_service, EmailTemplates
        email_destino = usuario.email if usuario else solicitud.email_solicitante
        if not email_destino:
            return
        solicitante_nombre = (
            f"{usuario.nombre} {usuario.apellido}".strip()
            if usuario else solicitud.nombre_solicitante
        )
        html_content = EmailTemplates.solicitud_creada(
            numero_tramite=solicitud.numero_tramite,
            tramite_nombre=tramite_nombre or "Trámite",
            asunto=solicitud.asunto or "Sin asunto",
            descripcion=solicitud.descripcion,
            solicitante_nombre=solicitante_nombre,
        )
        await email_service.send_email(
            to_email=email_destino,
            subject=f"Trámite #{solicitud.numero_tramite} generado exitosamente",
            body_html=html_content,
            body_text=f"Su trámite #{solicitud.numero_tramite} fue generado exitosamente.",
        )
    except Exception as e:
        logger.warning(f"[EMAIL] Error: {e}")


async def enviar_notificacion_cambio_estado_solicitud(db, solicitud, estado_anterior, estado_nuevo):
    try:
        from services.push_service import notificar_cambio_estado_solicitud
        await notificar_cambio_estado_solicitud(db, solicitud, estado_anterior, estado_nuevo)
    except Exception as e:
        logger.warning(f"[PUSH] Error notificando cambio de estado: {e}")


async def validar_transicion_a_en_curso(db: AsyncSession, solicitud: Solicitud) -> None:
    """
    Bloquea pasar de `recibido` → `en_curso` si quedan documentos obligatorios
    sin verificar. Lanza HTTPException 400 con la lista de faltantes.
    """
    if not solicitud.tramite_id:
        return  # Solicitud sin trámite asociado, nada que validar

    # Cargar requeridos obligatorios del trámite
    req_q = await db.execute(
        select(TramiteDocumentoRequerido).where(
            TramiteDocumentoRequerido.tramite_id == solicitud.tramite_id,
            TramiteDocumentoRequerido.obligatorio == True,
        )
    )
    requeridos = req_q.scalars().all()
    if not requeridos:
        return

    # Cargar todos los documentos verificados de esta solicitud
    docs_q = await db.execute(
        select(DocumentoSolicitud).where(
            DocumentoSolicitud.solicitud_id == solicitud.id,
            DocumentoSolicitud.verificado == True,
            DocumentoSolicitud.tramite_documento_requerido_id.is_not(None),
        )
    )
    docs_verificados = docs_q.scalars().all()
    ids_verificados = {d.tramite_documento_requerido_id for d in docs_verificados}

    faltantes = [r.nombre for r in requeridos if r.id not in ids_verificados]
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=f"Faltan verificar documentos obligatorios: {', '.join(faltantes)}",
        )


# ============================================================
# CRUD DE TRÁMITES (per-municipio)
# ============================================================

@router.get("", response_model=List[TramiteResponse])
async def listar_tramites(
    request: Request,
    categoria_tramite_id: Optional[int] = Query(None),
    activo: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
):
    """
    Lista los trámites del municipio actual. Si el usuario no está logueado,
    requiere `X-Municipio-ID` o `municipio_id` query.
    """
    # Para usuarios no logueados (vecinos navegando), permitir municipio_id en query
    municipio_id = None
    if current_user:
        municipio_id = get_effective_municipio_id(request, current_user)
    else:
        header_id = request.headers.get("X-Municipio-ID")
        if header_id:
            try:
                municipio_id = int(header_id)
            except (ValueError, TypeError):
                pass

    if not municipio_id:
        raise HTTPException(status_code=400, detail="municipio_id requerido")

    query = select(Tramite).where(Tramite.municipio_id == municipio_id)
    if categoria_tramite_id is not None:
        query = query.where(Tramite.categoria_tramite_id == categoria_tramite_id)
    if activo is not None:
        query = query.where(Tramite.activo == activo)

    query = query.options(
        selectinload(Tramite.categoria_tramite),
        selectinload(Tramite.documentos_requeridos),
    ).order_by(Tramite.orden, Tramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{tramite_id}", response_model=TramiteResponse)
async def get_tramite(
    request: Request,
    tramite_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
):
    result = await db.execute(
        select(Tramite)
        .options(
            selectinload(Tramite.categoria_tramite),
            selectinload(Tramite.documentos_requeridos),
        )
        .where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()
    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")
    return tramite


@router.post("", response_model=TramiteResponse, status_code=201)
async def crear_tramite(
    request: Request,
    data: TramiteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Crea un trámite nuevo en el municipio actual junto con sus documentos
    requeridos en una sola transacción.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validar que la categoría existe y pertenece al mismo municipio
    cat_q = await db.execute(
        select(CategoriaTramite).where(
            CategoriaTramite.id == data.categoria_tramite_id,
            CategoriaTramite.municipio_id == municipio_id,
        )
    )
    if not cat_q.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="La categoría no existe o no pertenece al municipio",
        )

    payload = data.model_dump(exclude={"documentos_requeridos"})
    tramite = Tramite(municipio_id=municipio_id, **payload)
    db.add(tramite)
    await db.flush()

    for doc in data.documentos_requeridos:
        db.add(TramiteDocumentoRequerido(tramite_id=tramite.id, **doc.model_dump()))

    await db.commit()
    await db.refresh(tramite, ["categoria_tramite", "documentos_requeridos"])
    return tramite


@router.put("/{tramite_id}", response_model=TramiteResponse)
async def actualizar_tramite(
    request: Request,
    tramite_id: int,
    data: TramiteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Tramite).where(
            Tramite.id == tramite_id,
            Tramite.municipio_id == municipio_id,
        )
    )
    tramite = result.scalar_one_or_none()
    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    # Si cambia la categoría, validar que pertenece al mismo municipio
    update_data = data.model_dump(exclude_unset=True)
    if "categoria_tramite_id" in update_data:
        cat_q = await db.execute(
            select(CategoriaTramite).where(
                CategoriaTramite.id == update_data["categoria_tramite_id"],
                CategoriaTramite.municipio_id == municipio_id,
            )
        )
        if not cat_q.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="La categoría no existe o no pertenece al municipio",
            )

    for k, v in update_data.items():
        setattr(tramite, k, v)

    await db.commit()
    await db.refresh(tramite, ["categoria_tramite", "documentos_requeridos"])
    return tramite


@router.delete("/{tramite_id}", status_code=204)
async def eliminar_tramite(
    request: Request,
    tramite_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Elimina un trámite. Si tiene solicitudes asociadas, hace soft delete
    (activo=false) para preservar el historial.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Tramite).where(
            Tramite.id == tramite_id,
            Tramite.municipio_id == municipio_id,
        )
    )
    tramite = result.scalar_one_or_none()
    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    count_q = await db.execute(
        select(func.count(Solicitud.id)).where(Solicitud.tramite_id == tramite_id)
    )
    cnt = count_q.scalar() or 0

    if cnt > 0:
        tramite.activo = False
        await db.commit()
        return
    else:
        await db.delete(tramite)
        await db.commit()
        return


# ============================================================
# DOCUMENTOS REQUERIDOS (sub-tabla del trámite)
# ============================================================

@router.get("/{tramite_id}/documentos-requeridos", response_model=List[TramiteDocumentoRequeridoResponse])
async def listar_documentos_requeridos(
    tramite_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
):
    result = await db.execute(
        select(TramiteDocumentoRequerido)
        .where(TramiteDocumentoRequerido.tramite_id == tramite_id)
        .order_by(TramiteDocumentoRequerido.orden)
    )
    return result.scalars().all()


@router.post("/{tramite_id}/documentos-requeridos", response_model=TramiteDocumentoRequeridoResponse, status_code=201)
async def crear_documento_requerido(
    request: Request,
    tramite_id: int,
    data: TramiteDocumentoRequeridoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validar que el trámite pertenece al municipio
    tramite_q = await db.execute(
        select(Tramite).where(
            Tramite.id == tramite_id,
            Tramite.municipio_id == municipio_id,
        )
    )
    if not tramite_q.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    nuevo = TramiteDocumentoRequerido(tramite_id=tramite_id, **data.model_dump())
    db.add(nuevo)
    await db.commit()
    await db.refresh(nuevo)
    return nuevo


@router.put("/documentos-requeridos/{doc_req_id}", response_model=TramiteDocumentoRequeridoResponse)
async def actualizar_documento_requerido(
    request: Request,
    doc_req_id: int,
    data: TramiteDocumentoRequeridoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(TramiteDocumentoRequerido)
        .join(Tramite, Tramite.id == TramiteDocumentoRequerido.tramite_id)
        .where(
            TramiteDocumentoRequerido.id == doc_req_id,
            Tramite.municipio_id == municipio_id,
        )
    )
    doc_req = result.scalar_one_or_none()
    if not doc_req:
        raise HTTPException(status_code=404, detail="Documento requerido no encontrado")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(doc_req, k, v)

    await db.commit()
    await db.refresh(doc_req)
    return doc_req


@router.delete("/documentos-requeridos/{doc_req_id}", status_code=204)
async def eliminar_documento_requerido(
    request: Request,
    doc_req_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(TramiteDocumentoRequerido)
        .join(Tramite, Tramite.id == TramiteDocumentoRequerido.tramite_id)
        .where(
            TramiteDocumentoRequerido.id == doc_req_id,
            Tramite.municipio_id == municipio_id,
        )
    )
    doc_req = result.scalar_one_or_none()
    if not doc_req:
        raise HTTPException(status_code=404, detail="Documento requerido no encontrado")

    await db.delete(doc_req)
    await db.commit()


# ============================================================
# SOLICITUDES (instancias del trámite)
# ============================================================

@router.get("/solicitudes/list", response_model=List[SolicitudResponse])
async def listar_solicitudes(
    municipio_id: int = Query(..., description="ID del municipio"),
    estado: Optional[EstadoSolicitud] = Query(None),
    tramite_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Lista solicitudes. Vecino ve las suyas, gestor ve todas."""
    query = select(Solicitud).where(Solicitud.municipio_id == municipio_id)

    if current_user and current_user.rol == RolUsuario.VECINO:
        query = query.where(Solicitud.solicitante_id == current_user.id)
    elif not current_user:
        raise HTTPException(status_code=401, detail="Debe iniciar sesión")

    if estado:
        query = query.where(Solicitud.estado == estado)
    if tramite_id:
        query = query.where(Solicitud.tramite_id == tramite_id)

    query = query.options(
        selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
        selectinload(Solicitud.solicitante),
    ).order_by(Solicitud.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/solicitudes/mis-solicitudes", response_model=List[SolicitudResponse])
async def listar_mis_solicitudes(
    estado: Optional[EstadoSolicitud] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario no tiene municipio asignado")

    query = select(Solicitud).where(
        Solicitud.municipio_id == current_user.municipio_id,
        Solicitud.solicitante_id == current_user.id,
    )
    if estado:
        query = query.where(Solicitud.estado == estado)

    query = query.options(
        selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
        selectinload(Solicitud.solicitante),
    ).order_by(Solicitud.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/solicitudes/consultar/{numero_tramite}", response_model=SolicitudResponse)
async def consultar_solicitud_por_numero(
    numero_tramite: str,
    db: AsyncSession = Depends(get_db),
):
    """Consulta pública por número de trámite."""
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
            selectinload(Solicitud.solicitante),
        )
        .where(Solicitud.numero_tramite == numero_tramite)
    )
    solicitud = result.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return solicitud


@router.get("/solicitudes/detalle/{solicitud_id}", response_model=SolicitudResponse)
async def obtener_solicitud(
    solicitud_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
            selectinload(Solicitud.solicitante),
        )
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if current_user and current_user.rol == RolUsuario.VECINO:
        if solicitud.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso")

    return solicitud


@router.post("/solicitudes", response_model=SolicitudResponse)
async def crear_solicitud(
    solicitud_data: SolicitudCreate,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Crea una nueva solicitud de trámite."""
    # Validar que el trámite existe, está activo y pertenece al municipio
    result = await db.execute(
        select(Tramite)
        .options(selectinload(Tramite.categoria_tramite))
        .where(
            and_(
                Tramite.id == solicitud_data.tramite_id,
                Tramite.activo == True,
                Tramite.municipio_id == municipio_id,
            )
        )
    )
    tramite = result.scalar_one_or_none()
    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no disponible para este municipio")

    # Generar número único
    year = datetime.now().year
    prefix = f"SOL-{year}-"
    max_q = await db.execute(
        select(func.max(Solicitud.numero_tramite)).where(
            and_(
                Solicitud.municipio_id == municipio_id,
                Solicitud.numero_tramite.like(f"{prefix}%"),
            )
        )
    )
    max_numero = max_q.scalar()
    if max_numero:
        seq = int(max_numero.split("-")[-1])
        numero_tramite = f"{prefix}{str(seq + 1).zfill(5)}"
    else:
        numero_tramite = f"{prefix}00001"

    solicitud = Solicitud(
        municipio_id=municipio_id,
        numero_tramite=numero_tramite,
        estado=EstadoSolicitud.RECIBIDO,
        **solicitud_data.model_dump(),
    )

    if current_user:
        solicitud.solicitante_id = current_user.id
        for campo in ["nombre", "apellido", "email", "telefono", "dni", "direccion"]:
            campo_sol = f"{campo}_solicitante"
            if not getattr(solicitud, campo_sol, None):
                setattr(solicitud, campo_sol, getattr(current_user, campo, None))
    else:
        if not solicitud_data.email_solicitante and not solicitud_data.telefono_solicitante:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar email o teléfono para seguimiento",
            )

    db.add(solicitud)
    await db.commit()
    await db.refresh(solicitud)

    historial = HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id if current_user else None,
        estado_nuevo=EstadoSolicitud.RECIBIDO,
        accion="Solicitud creada",
        comentario=f"Trámite: {tramite.nombre}",
    )
    db.add(historial)
    await db.commit()
    await db.refresh(solicitud, ["tramite"])

    # Notificaciones en background
    import asyncio
    if current_user:
        asyncio.create_task(enviar_notificacion_solicitud(db, solicitud, tramite.nombre))
    asyncio.create_task(enviar_notificacion_supervisores_solicitud(db, solicitud, tramite.nombre))
    if current_user:
        asyncio.create_task(enviar_email_solicitud_creada(db, solicitud, current_user, tramite.nombre))

    return solicitud


@router.put("/solicitudes/detalle/{solicitud_id}", response_model=SolicitudResponse)
async def actualizar_solicitud(
    solicitud_id: int,
    solicitud_data: SolicitudUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza una solicitud (solo personal municipal).
    Si pasa de `recibido` → `en_curso`, valida que todos los documentos
    obligatorios estén verificados.
    """
    result = await db.execute(
        select(Solicitud)
        .options(selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite))
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    estado_anterior = solicitud.estado

    cambio_estado = (
        solicitud_data.estado is not None
        and solicitud_data.estado != estado_anterior
    )

    # Validación: bloqueo recibido -> en_curso si faltan docs verificados
    if cambio_estado and solicitud_data.estado == EstadoSolicitud.EN_CURSO:
        await validar_transicion_a_en_curso(db, solicitud)

    for field, value in solicitud_data.model_dump(exclude_unset=True).items():
        setattr(solicitud, field, value)

    if cambio_estado:
        if solicitud_data.estado in [EstadoSolicitud.FINALIZADO, EstadoSolicitud.RECHAZADO]:
            solicitud.fecha_resolucion = datetime.utcnow()

        historial = HistorialSolicitud(
            solicitud_id=solicitud.id,
            usuario_id=current_user.id,
            estado_anterior=estado_anterior,
            estado_nuevo=solicitud_data.estado,
            accion=f"Estado cambiado a {solicitud_data.estado.value}",
            comentario=solicitud_data.observaciones,
        )
        db.add(historial)

    await db.commit()
    await db.refresh(solicitud)

    if cambio_estado:
        import asyncio
        asyncio.create_task(enviar_notificacion_cambio_estado_solicitud(
            db, solicitud,
            estado_anterior.value if hasattr(estado_anterior, "value") else str(estado_anterior),
            solicitud_data.estado.value,
        ))

    return solicitud


@router.get("/solicitudes/{solicitud_id}/historial", response_model=List[HistorialSolicitudResponse])
async def obtener_historial_solicitud(
    solicitud_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    sol_q = await db.execute(select(Solicitud).where(Solicitud.id == solicitud_id))
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if current_user and current_user.rol == RolUsuario.VECINO:
        if solicitud.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso")

    result = await db.execute(
        select(HistorialSolicitud)
        .where(HistorialSolicitud.solicitud_id == solicitud_id)
        .order_by(HistorialSolicitud.created_at.desc())
    )
    return result.scalars().all()


@router.post("/solicitudes/{solicitud_id}/asignar", response_model=SolicitudResponse)
async def asignar_solicitud(
    solicitud_id: int,
    asignacion: SolicitudAsignar,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db),
):
    """Asigna una dependencia a una solicitud de trámite."""
    from models.municipio_dependencia import MunicipioDependencia

    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
            selectinload(Solicitud.solicitante),
            selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
        )
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    md_q = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(
            and_(
                MunicipioDependencia.id == asignacion.municipio_dependencia_id,
                MunicipioDependencia.municipio_id == solicitud.municipio_id,
                MunicipioDependencia.activo == True,
            )
        )
    )
    municipio_dependencia = md_q.scalar_one_or_none()
    if not municipio_dependencia:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada o no disponible")

    dependencia_anterior_id = solicitud.municipio_dependencia_id
    estado_anterior = solicitud.estado
    solicitud.municipio_dependencia_id = asignacion.municipio_dependencia_id

    dependencia_nombre = municipio_dependencia.dependencia.nombre if municipio_dependencia.dependencia else "Dependencia"
    accion = "Dependencia asignada" if not dependencia_anterior_id else "Dependencia reasignada"

    historial = HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=solicitud.estado,
        accion=f"{accion}: {dependencia_nombre}",
        comentario=asignacion.comentario,
    )
    db.add(historial)
    await db.commit()
    await db.refresh(solicitud)
    return solicitud


# ============================================================
# DOCUMENTOS DE SOLICITUD (upload + verificación)
# ============================================================

ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/gif", "application/pdf"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/solicitudes/{solicitud_id}/documentos")
async def upload_documento_solicitud(
    solicitud_id: int,
    file: UploadFile = File(...),
    tramite_documento_requerido_id: Optional[int] = Query(None),
    tipo_documento: Optional[str] = Query(None),
    descripcion: Optional[str] = Query(None),
    etapa: str = Query("creacion"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sube un documento a una solicitud, opcionalmente vinculado a un requerido."""
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo no permitido. Permitidos: {', '.join(ALLOWED_FILE_TYPES)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Archivo excede 10MB")
    await file.seek(0)

    sol_q = await db.execute(select(Solicitud).where(Solicitud.id == solicitud_id))
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tiene permiso")

    try:
        resource_type = "image" if file.content_type.startswith("image/") else "raw"
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder=f"solicitudes/{solicitud_id}",
            resource_type=resource_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir: {str(e)}")

    tipo = "imagen" if file.content_type.startswith("image/") else "documento"

    documento = DocumentoSolicitud(
        solicitud_id=solicitud_id,
        usuario_id=current_user.id,
        nombre_original=file.filename,
        url=upload_result["secure_url"],
        public_id=upload_result["public_id"],
        tipo=tipo,
        mime_type=file.content_type,
        tamanio=upload_result.get("bytes"),
        tipo_documento=tipo_documento,
        descripcion=descripcion,
        etapa=etapa,
        tramite_documento_requerido_id=tramite_documento_requerido_id,
    )
    db.add(documento)
    await db.commit()
    await db.refresh(documento)

    return {
        "message": "Archivo subido correctamente",
        "id": documento.id,
        "url": documento.url,
        "nombre": documento.nombre_original,
        "tipo": documento.tipo,
        "tramite_documento_requerido_id": documento.tramite_documento_requerido_id,
    }


@router.get("/solicitudes/{solicitud_id}/documentos")
async def listar_documentos_solicitud(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sol_q = await db.execute(select(Solicitud).where(Solicitud.id == solicitud_id))
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tiene permiso")

    result = await db.execute(
        select(DocumentoSolicitud)
        .where(DocumentoSolicitud.solicitud_id == solicitud_id)
        .order_by(DocumentoSolicitud.created_at.desc())
    )
    documentos = result.scalars().all()
    return [
        {
            "id": d.id,
            "nombre_original": d.nombre_original,
            "url": d.url,
            "tipo": d.tipo,
            "tipo_documento": d.tipo_documento,
            "descripcion": d.descripcion,
            "etapa": d.etapa,
            "mime_type": d.mime_type,
            "tamanio": d.tamanio,
            "tramite_documento_requerido_id": d.tramite_documento_requerido_id,
            "verificado": d.verificado,
            "verificado_por_id": d.verificado_por_id,
            "fecha_verificacion": d.fecha_verificacion,
            "created_at": d.created_at,
        }
        for d in documentos
    ]


@router.delete("/solicitudes/{solicitud_id}/documentos/{documento_id}")
async def eliminar_documento_solicitud(
    solicitud_id: int,
    documento_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentoSolicitud).where(
            DocumentoSolicitud.id == documento_id,
            DocumentoSolicitud.solicitud_id == solicitud_id,
        )
    )
    documento = result.scalar_one_or_none()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if current_user.rol == RolUsuario.VECINO and documento.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tiene permiso")

    if documento.public_id:
        try:
            cloudinary.uploader.destroy(documento.public_id)
        except Exception as e:
            logger.error(f"Error eliminando de Cloudinary: {e}")

    await db.delete(documento)
    await db.commit()
    return {"message": "Documento eliminado correctamente"}


# ============================================================
# CHECKLIST DE VERIFICACIÓN DE DOCUMENTOS
# ============================================================

@router.get("/solicitudes/{solicitud_id}/checklist-documentos", response_model=ChecklistDocumentosResponse)
async def get_checklist_documentos(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el checklist combinado: cada `TramiteDocumentoRequerido` del trámite
    + el `DocumentoSolicitud` asociado (si fue subido) + estado de verificación.
    """
    sol_q = await db.execute(
        select(Solicitud)
        .options(selectinload(Solicitud.tramite))
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tiene permiso")

    if not solicitud.tramite_id:
        return ChecklistDocumentosResponse(
            solicitud_id=solicitud_id,
            items=[],
            todos_verificados=True,
            total_obligatorios=0,
            total_obligatorios_verificados=0,
        )

    # Cargar requeridos del trámite
    req_q = await db.execute(
        select(TramiteDocumentoRequerido)
        .where(TramiteDocumentoRequerido.tramite_id == solicitud.tramite_id)
        .order_by(TramiteDocumentoRequerido.orden)
    )
    requeridos = req_q.scalars().all()

    # Cargar documentos subidos para esta solicitud
    docs_q = await db.execute(
        select(DocumentoSolicitud)
        .options(selectinload(DocumentoSolicitud.verificado_por))
        .where(DocumentoSolicitud.solicitud_id == solicitud_id)
    )
    documentos = docs_q.scalars().all()
    docs_por_requerido = {
        d.tramite_documento_requerido_id: d
        for d in documentos
        if d.tramite_documento_requerido_id is not None
    }

    items: List[DocumentoSolicitudChecklistItem] = []
    for req in requeridos:
        doc = docs_por_requerido.get(req.id)
        verificado_por_nombre = None
        if doc and doc.verificado_por:
            verificado_por_nombre = f"{doc.verificado_por.nombre} {doc.verificado_por.apellido or ''}".strip()
        items.append(DocumentoSolicitudChecklistItem(
            requerido_id=req.id,
            nombre=req.nombre,
            descripcion=req.descripcion,
            obligatorio=req.obligatorio,
            orden=req.orden,
            documento_id=doc.id if doc else None,
            documento_url=doc.url if doc else None,
            documento_nombre=doc.nombre_original if doc else None,
            verificado=bool(doc and doc.verificado),
            verificado_por_id=doc.verificado_por_id if doc else None,
            verificado_por_nombre=verificado_por_nombre,
            fecha_verificacion=doc.fecha_verificacion if doc else None,
        ))

    total_obligatorios = sum(1 for r in requeridos if r.obligatorio)
    total_obligatorios_verif = sum(
        1 for it in items if it.obligatorio and it.verificado
    )

    return ChecklistDocumentosResponse(
        solicitud_id=solicitud_id,
        items=items,
        todos_verificados=(total_obligatorios == total_obligatorios_verif),
        total_obligatorios=total_obligatorios,
        total_obligatorios_verificados=total_obligatorios_verif,
    )


@router.post("/solicitudes/{solicitud_id}/documentos/{documento_id}/verificar")
async def verificar_documento(
    solicitud_id: int,
    documento_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """Marca un documento como verificado por el supervisor."""
    result = await db.execute(
        select(DocumentoSolicitud).where(
            DocumentoSolicitud.id == documento_id,
            DocumentoSolicitud.solicitud_id == solicitud_id,
        )
    )
    documento = result.scalar_one_or_none()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    documento.verificado = True
    documento.verificado_por_id = current_user.id
    documento.fecha_verificacion = datetime.utcnow()
    await db.commit()
    return {"message": "Documento verificado", "id": documento.id}


@router.post("/solicitudes/{solicitud_id}/documentos/{documento_id}/desverificar")
async def desverificar_documento(
    solicitud_id: int,
    documento_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    result = await db.execute(
        select(DocumentoSolicitud).where(
            DocumentoSolicitud.id == documento_id,
            DocumentoSolicitud.solicitud_id == solicitud_id,
        )
    )
    documento = result.scalar_one_or_none()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    documento.verificado = False
    documento.verificado_por_id = None
    documento.fecha_verificacion = None
    await db.commit()
    return {"message": "Documento desverificado", "id": documento.id}


# ============================================================
# ESTADÍSTICAS / GESTIÓN
# ============================================================

@router.get("/stats/resumen")
async def resumen_solicitudes(
    municipio_id: int = Query(...),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Solicitud.estado, func.count(Solicitud.id))
        .where(Solicitud.municipio_id == municipio_id)
        .group_by(Solicitud.estado)
    )
    por_estado = {row[0].value.lower(): row[1] for row in result.all()}

    total_q = await db.execute(
        select(func.count(Solicitud.id)).where(Solicitud.municipio_id == municipio_id)
    )
    total = total_q.scalar() or 0

    hoy_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            and_(
                Solicitud.municipio_id == municipio_id,
                func.date(Solicitud.created_at) == date.today(),
            )
        )
    )
    hoy = hoy_q.scalar() or 0

    return {"total": total, "hoy": hoy, "por_estado": por_estado}


@router.get("/stats/conteo-estados")
async def conteo_estados_solicitudes(
    municipio_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db),
):
    muni_id = municipio_id or current_user.municipio_id
    result = await db.execute(
        select(Solicitud.estado, func.count(Solicitud.id))
        .where(Solicitud.municipio_id == muni_id)
        .group_by(Solicitud.estado)
    )
    return {row[0].value.lower(): row[1] for row in result.all()}


@router.get("/stats/conteo-categorias")
async def conteo_solicitudes_por_categoria(
    municipio_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db),
):
    """Conteo de solicitudes agrupadas por categoría de trámite."""
    muni_id = municipio_id or current_user.municipio_id
    result = await db.execute(
        select(
            CategoriaTramite.id,
            CategoriaTramite.nombre,
            CategoriaTramite.icono,
            CategoriaTramite.color,
            func.count(Solicitud.id).label("cantidad"),
        )
        .select_from(Solicitud)
        .join(Tramite, Solicitud.tramite_id == Tramite.id)
        .join(CategoriaTramite, Tramite.categoria_tramite_id == CategoriaTramite.id)
        .where(Solicitud.municipio_id == muni_id)
        .group_by(CategoriaTramite.id, CategoriaTramite.nombre, CategoriaTramite.icono, CategoriaTramite.color)
        .order_by(func.count(Solicitud.id).desc())
    )
    return [
        {"id": r[0], "nombre": r[1], "icono": r[2], "color": r[3], "cantidad": r[4]}
        for r in result.all()
    ]


@router.get("/gestion/solicitudes", response_model=List[SolicitudGestionResponse])
async def listar_solicitudes_gestion(
    municipio_id: int = Query(...),
    estado: Optional[EstadoSolicitud] = Query(None),
    tramite_id: Optional[int] = Query(None),
    categoria_tramite_id: Optional[int] = Query(None),
    municipio_dependencia_id: Optional[int] = Query(None),
    sin_asignar: bool = Query(False),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db),
):
    """Lista solicitudes para gestión con paginación y filtros."""
    from models.municipio_dependencia import MunicipioDependencia

    query = select(Solicitud).where(Solicitud.municipio_id == municipio_id)

    if estado:
        query = query.where(Solicitud.estado == estado)
    if tramite_id:
        query = query.where(Solicitud.tramite_id == tramite_id)
    if categoria_tramite_id:
        query = query.join(Tramite, Solicitud.tramite_id == Tramite.id).where(
            Tramite.categoria_tramite_id == categoria_tramite_id
        )
    if municipio_dependencia_id:
        query = query.where(Solicitud.municipio_dependencia_id == municipio_dependencia_id)
    if sin_asignar:
        query = query.where(Solicitud.municipio_dependencia_id.is_(None))
    if search:
        st = f"%{search}%"
        query = query.where(
            (Solicitud.numero_tramite.ilike(st))
            | (Solicitud.asunto.ilike(st))
            | (Solicitud.nombre_solicitante.ilike(st))
            | (Solicitud.apellido_solicitante.ilike(st))
            | (Solicitud.dni_solicitante.ilike(st))
        )

    query = query.options(
        selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
        selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
    ).order_by(Solicitud.created_at.desc(), Solicitud.prioridad).offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()
