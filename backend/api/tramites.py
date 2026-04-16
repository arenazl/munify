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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, date
import logging
import cloudinary
import cloudinary.uploader

import secrets

from core.database import get_db
from core.security import get_current_user, get_current_user_optional, require_roles, get_password_hash
from core.config import settings
from models.tramite import Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from models.tramite_documento_requerido import TramiteDocumentoRequerido
from models.categoria_tramite import CategoriaTramite
from models.documento_solicitud import DocumentoSolicitud
from models.municipio_dependencia import MunicipioDependencia
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

# Resolución de municipio centralizada en core/tenancy.py (antes había 10
# copias duplicadas, una por archivo de API). Ahora todas usan la misma.
from core.tenancy import get_effective_municipio_id  # noqa: E402


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


async def _todos_obligatorios_subidos(db: AsyncSession, solicitud: Solicitud) -> bool:
    """True si todos los documentos obligatorios del tramite tienen archivo
    subido (aunque todavia no esten verificados por el supervisor)."""
    if not solicitud.tramite_id:
        return False
    req_q = await db.execute(
        select(TramiteDocumentoRequerido).where(
            TramiteDocumentoRequerido.tramite_id == solicitud.tramite_id,
            TramiteDocumentoRequerido.obligatorio == True,
        )
    )
    requeridos = req_q.scalars().all()
    if not requeridos:
        return False
    docs_q = await db.execute(
        select(DocumentoSolicitud.tramite_documento_requerido_id).where(
            DocumentoSolicitud.solicitud_id == solicitud.id,
            DocumentoSolicitud.tramite_documento_requerido_id.is_not(None),
        )
    )
    ids_subidos = {row[0] for row in docs_q.all()}
    return all(r.id in ids_subidos for r in requeridos)


async def _ya_envio_documentos_revision(db: AsyncSession, solicitud_id: int) -> bool:
    """True si existe una entrada de historial 'Documentos enviados' para
    esta solicitud. Usado para evitar reenvios duplicados."""
    q = await db.execute(
        select(HistorialSolicitud).where(
            HistorialSolicitud.solicitud_id == solicitud_id,
            HistorialSolicitud.accion == "Documentos enviados para revisión",
        ).limit(1)
    )
    return q.scalar_one_or_none() is not None


async def _todos_obligatorios_verificados(db: AsyncSession, solicitud: Solicitud) -> bool:
    """True si todos los documentos obligatorios de la solicitud están verificados."""
    if not solicitud.tramite_id:
        return False
    req_q = await db.execute(
        select(TramiteDocumentoRequerido).where(
            TramiteDocumentoRequerido.tramite_id == solicitud.tramite_id,
            TramiteDocumentoRequerido.obligatorio == True,
        )
    )
    requeridos = req_q.scalars().all()
    if not requeridos:
        return False  # sin requeridos → no amerita auto-transición
    docs_q = await db.execute(
        select(DocumentoSolicitud.tramite_documento_requerido_id).where(
            DocumentoSolicitud.solicitud_id == solicitud.id,
            DocumentoSolicitud.verificado == True,
            DocumentoSolicitud.tramite_documento_requerido_id.is_not(None),
        )
    )
    ids_verificados = {row[0] for row in docs_q.all()}
    return all(r.id in ids_verificados for r in requeridos)


async def _intentar_auto_transicion_a_en_curso(
    db: AsyncSession, solicitud_id: int, user_id: int
) -> bool:
    """
    Si el estado actual es RECIBIDO y todos los docs obligatorios ya están
    verificados, avanza automáticamente a EN_CURSO + deja rastro en historial.
    Retorna True si se hizo la transición.
    """
    r = await db.execute(select(Solicitud).where(Solicitud.id == solicitud_id))
    solicitud = r.scalar_one_or_none()
    if not solicitud or solicitud.estado != EstadoSolicitud.RECIBIDO:
        return False
    if not await _todos_obligatorios_verificados(db, solicitud):
        return False
    solicitud.estado = EstadoSolicitud.EN_CURSO
    db.add(HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=user_id,
        estado_anterior=EstadoSolicitud.RECIBIDO,
        estado_nuevo=EstadoSolicitud.EN_CURSO,
        accion="Transición automática",
        comentario="Todos los documentos obligatorios fueron verificados.",
    ))
    await db.commit()
    return True


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

    # Re-querear con selectinload para evitar lazy-load fuera del contexto
    # async después del commit (los atributos quedan expirados).
    result = await db.execute(
        select(Tramite)
        .options(
            selectinload(Tramite.categoria_tramite),
            selectinload(Tramite.documentos_requeridos),
        )
        .where(Tramite.id == tramite.id)
    )
    return result.scalar_one()


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

    # Re-querear con selectinload (mismo motivo que en crear_tramite)
    result = await db.execute(
        select(Tramite)
        .options(
            selectinload(Tramite.categoria_tramite),
            selectinload(Tramite.documentos_requeridos),
        )
        .where(Tramite.id == tramite_id)
    )
    return result.scalar_one()


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
        selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
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
        selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
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
            selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
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
            selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
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


# El helper `_resolver_o_crear_vecino` se extrajo a `services/vecinos.py`
# para poder reusarlo desde `api/reclamos.py`. Mantenemos este alias local
# con el mismo nombre para no tocar los call sites existentes.
from services.vecinos import resolver_o_crear_vecino as _resolver_o_crear_vecino  # noqa: E402


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

    # ================================================================
    # Resolver el solicitante (dueño real del trámite, no quien lo cargó)
    # ================================================================
    #
    # Hay 3 escenarios posibles:
    #
    # 1. No hay `current_user` (solicitud pública/anónima desde portal):
    #    exigimos al menos email o teléfono para poder contactar. La
    #    solicitud queda sin `solicitante_id` (legacy, mantener compat).
    #
    # 2. `current_user` es rol `vecino`: el vecino está cargando SU propia
    #    solicitud desde la web/app. `solicitante_id = current_user.id`
    #    y los campos vacíos del form se completan con los datos del perfil.
    #
    # 3. `current_user` es rol `admin` o `supervisor`: el empleado está
    #    cargando en ventanilla una solicitud a nombre de otra persona.
    #    En este caso NO queremos que `solicitante_id` apunte al empleado
    #    — tiene que apuntar al vecino. Entonces:
    #      a) Buscamos un User con ese DNI en el municipio. Si existe,
    #         linkeamos ahí (es el vecino, sea "ghost" o ya registrado).
    #      b) Si no, buscamos por email (si el empleado cargó uno).
    #      c) Si nada matchea, creamos un "ghost vecino" — un User normal
    #         en `usuarios` con rol=vecino y un password_hash inutilizable
    #         (bcrypt de un token random que nadie conoce). El día que el
    #         vecino se registre por su cuenta, hace "olvidé mi contraseña"
    #         con el mismo email y reclama la cuenta + su historial.
    #
    # El empleado que CREÓ la solicitud queda auditado en
    # `historial_solicitudes.usuario_id`, que es el lugar correcto.

    solicitante_id: Optional[int] = None
    overrides_perfil: dict = {}

    if current_user is None:
        # Escenario 1: anónimo
        if not solicitud_data.email_solicitante and not solicitud_data.telefono_solicitante:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar email o teléfono para seguimiento",
            )
    elif current_user.rol == RolUsuario.VECINO:
        # Escenario 2: vecino cargando su propia solicitud
        solicitante_id = current_user.id
        for campo in ["nombre", "apellido", "email", "telefono", "dni", "direccion"]:
            campo_sol = f"{campo}_solicitante"
            if not getattr(solicitud_data, campo_sol, None):
                overrides_perfil[campo_sol] = getattr(current_user, campo, None)

        # Merge "solo primera vez": si el vecino tipeó un dato en el wizard y
        # su User lo tenía vacío, lo guardamos para precargarlo la proxima.
        # Si ya lo tenía seteado, NUNCA pisamos — la direccion/tel del wizard
        # puede ser contextual al tramite (ej: direccion del local comercial,
        # tel de contacto alternativo) y no queremos que pise su perfil.
        for campo in ["nombre", "apellido", "telefono", "dni", "direccion"]:
            form_valor = getattr(solicitud_data, f"{campo}_solicitante", None)
            if not form_valor:
                continue
            if getattr(current_user, campo, None):
                continue  # ya tenía valor: no pisar
            setattr(current_user, campo, form_valor)
    else:
        # Escenario 3: empleado/admin cargando en ventanilla para un tercero.
        # Resolvemos o creamos el vecino.
        vecino = await _resolver_o_crear_vecino(
            db=db,
            municipio_id=municipio_id,
            dni=solicitud_data.dni_solicitante,
            email=solicitud_data.email_solicitante,
            nombre=solicitud_data.nombre_solicitante,
            apellido=solicitud_data.apellido_solicitante,
            telefono=solicitud_data.telefono_solicitante,
            direccion=solicitud_data.direccion_solicitante,
        )
        solicitante_id = vecino.id

    # ================================================================
    # Generar número único + INSERT con retry por race de concurrencia
    # ================================================================
    #
    # `Solicitud.numero_tramite` tiene índice UNIQUE global (no per-muni),
    # porque el endpoint público /solicitudes/consultar/{numero_tramite}
    # busca por número sin filtro de municipio y debe resolver a una sola
    # fila. Por eso el contador acá también tiene que ser global: si
    # filtrásemos por municipio_id, dos munis distintos calcularían ambos
    # SOL-2026-00001 como su primer número y el segundo chocaría contra
    # el índice UNIQUE. El costo es cosmético — los números por muni
    # quedan salteados (muni A ve 1, 4, 7... y muni B ve 2, 3, 5...).
    #
    # El patrón "SELECT MAX + INSERT" no es atómico: dos requests paralelas
    # pueden leer el mismo MAX bajo el snapshot de InnoDB (REPEATABLE READ)
    # y terminar ambas intentando insertar el mismo número, rompiendo el
    # índice UNIQUE. Por eso envolvemos el flush en un savepoint y
    # reintentamos si chocamos: el perdedor del reintento vuelve a leer
    # MAX (que ahora sí ve la fila del ganador ya commited en su savepoint)
    # y toma el siguiente número libre.
    year = datetime.now().year
    prefix = f"SOL-{year}-"
    MAX_RETRIES = 5
    solicitud: Optional[Solicitud] = None

    logger.info(f"[crear_solicitud] START retry-loop muni={municipio_id} prefix={prefix}")
    for attempt in range(MAX_RETRIES):
        max_q = await db.execute(
            select(func.max(Solicitud.numero_tramite)).where(
                Solicitud.numero_tramite.like(f"{prefix}%"),
            )
        )
        max_numero = max_q.scalar()
        if max_numero:
            seq = int(max_numero.split("-")[-1])
            numero_tramite = f"{prefix}{str(seq + 1).zfill(5)}"
        else:
            numero_tramite = f"{prefix}00001"

        logger.info(
            f"[crear_solicitud] attempt={attempt + 1}/{MAX_RETRIES} "
            f"max_numero={max_numero!r} -> numero_tramite={numero_tramite}"
        )

        solicitud = Solicitud(
            municipio_id=municipio_id,
            numero_tramite=numero_tramite,
            estado=EstadoSolicitud.RECIBIDO,
            solicitante_id=solicitante_id,
            **solicitud_data.model_dump(),
        )
        for campo_sol, valor in overrides_perfil.items():
            setattr(solicitud, campo_sol, valor)

        try:
            async with db.begin_nested():
                db.add(solicitud)
                await db.flush()
            logger.info(f"[crear_solicitud] OK numero={numero_tramite} id={solicitud.id}")
            break
        except IntegrityError as e:
            # El savepoint ya revirtió el INSERT. Si la colisión fue por
            # `numero_tramite`, reintentamos; cualquier otro IntegrityError
            # (FK, NOT NULL, etc.) se propaga tal cual.
            logger.warning(
                f"[crear_solicitud] IntegrityError attempt={attempt + 1} "
                f"numero={numero_tramite} err={e.orig!r}"
            )
            if "numero_tramite" not in str(e.orig).lower():
                raise
            if attempt == MAX_RETRIES - 1:
                raise HTTPException(
                    status_code=503,
                    detail="No se pudo generar un número único de solicitud. Reintente.",
                )
            solicitud = None  # siguiente iter lo reconstruye con MAX fresco

    # Auto-asignación a dependencia: si el trámite está mapeado a una dep del
    # muni (via MunicipioDependenciaTramite), setear municipio_dependencia_id
    # de una. Si no hay mapeo, queda NULL y el admin puede asignarla manual.
    from models.municipio_dependencia_tramite import MunicipioDependenciaTramite
    from models.municipio_dependencia import MunicipioDependencia
    auto_dep_q = await db.execute(
        select(MunicipioDependenciaTramite.municipio_dependencia_id).where(
            and_(
                MunicipioDependenciaTramite.municipio_dependencia_id.in_(
                    select(MunicipioDependencia.id).where(
                        MunicipioDependencia.municipio_id == municipio_id
                    )
                ),
                MunicipioDependenciaTramite.tramite_id == solicitud.tramite_id,
                MunicipioDependenciaTramite.activo == True,
            )
        ).limit(1)
    )
    auto_dep_id = auto_dep_q.scalar_one_or_none()
    if auto_dep_id:
        solicitud.municipio_dependencia_id = auto_dep_id

    historial = HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id if current_user else None,
        estado_nuevo=EstadoSolicitud.RECIBIDO,
        accion="Solicitud creada",
        comentario=f"Trámite: {tramite.nombre}",
    )
    db.add(historial)
    await db.commit()

    # Re-querear para evitar lazy-load en pydantic post-commit
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
            selectinload(Solicitud.solicitante),
            selectinload(Solicitud.dependencia_asignada).selectinload(
                MunicipioDependencia.dependencia
            ),
        )
        .where(Solicitud.id == solicitud.id)
    )
    solicitud_full = result.scalar_one()

    # Las notificaciones en background quedaron deshabilitadas porque
    # el `db` session se cierra al terminar este request y romperia las tasks
    # asyncio. Si se reactivan, hay que crear una sesion nueva dentro de cada
    # task usando `async with AsyncSessionLocal() as fresh_db:`.
    return solicitud_full


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

    # Re-querear con relaciones para evitar lazy-load en pydantic.
    from models.municipio_dependencia import MunicipioDependencia
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
            selectinload(Solicitud.solicitante),
            selectinload(Solicitud.dependencia_asignada).selectinload(
                MunicipioDependencia.dependencia
            ),
        )
        .where(Solicitud.id == solicitud_id)
    )
    return result.scalar_one()


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

    # Re-querear con relaciones (greenlet-safe)
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.categoria_tramite),
            selectinload(Solicitud.solicitante),
            selectinload(Solicitud.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
        )
        .where(Solicitud.id == solicitud_id)
    )
    return result.scalar_one()


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
            documento_tipo=doc.tipo if doc else None,
            verificado=bool(doc and doc.verificado),
            verificado_por_id=doc.verificado_por_id if doc else None,
            verificado_por_nombre=verificado_por_nombre,
            fecha_verificacion=doc.fecha_verificacion if doc else None,
        ))

    total_obligatorios = sum(1 for r in requeridos if r.obligatorio)
    total_obligatorios_verif = sum(
        1 for it in items if it.obligatorio and it.verificado
    )
    total_obligatorios_subidos = sum(
        1 for it in items if it.obligatorio and it.documento_id is not None
    )

    # Chequear si el vecino ya disparo el envio a revision (entrada en historial).
    envio_q = await db.execute(
        select(HistorialSolicitud).where(
            HistorialSolicitud.solicitud_id == solicitud_id,
            HistorialSolicitud.accion == "Documentos enviados para revisión",
        ).order_by(HistorialSolicitud.created_at.desc()).limit(1)
    )
    envio_entry = envio_q.scalar_one_or_none()

    return ChecklistDocumentosResponse(
        solicitud_id=solicitud_id,
        items=items,
        todos_verificados=(total_obligatorios == total_obligatorios_verif),
        total_obligatorios=total_obligatorios,
        total_obligatorios_verificados=total_obligatorios_verif,
        total_obligatorios_subidos=total_obligatorios_subidos,
        documentos_enviados_revision=envio_entry is not None,
        fecha_envio_revision=envio_entry.created_at if envio_entry else None,
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
    auto = await _intentar_auto_transicion_a_en_curso(db, solicitud_id, current_user.id)
    return {"message": "Documento verificado", "id": documento.id, "auto_transicion_a_en_curso": auto}


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


@router.post("/solicitudes/{solicitud_id}/requeridos/{requerido_id}/verificar-visual")
async def verificar_visual_sin_archivo(
    solicitud_id: int,
    requerido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Marca un `TramiteDocumentoRequerido` como verificado SIN archivo adjunto.

    Caso de uso: el empleado recibe el documento físico en ventanilla y lo
    ve con sus propios ojos, pero no lo digitaliza. Solo tilda "OK verificado".

    Lógica:
    - Si ya existe un `DocumentoSolicitud` vinculado a este `requerido_id`,
      se lo marca como verificado (como el endpoint `verificar_documento`).
    - Si no existe ninguno, se crea un placeholder con `url=''`, `tipo='verificacion_manual'`
      y se marca verificado de una.

    El placeholder cuenta igual que un archivo verificado para la validación
    de transición `recibido → en_curso` porque tiene `verificado=true` y
    `tramite_documento_requerido_id` seteado.
    """
    # Validar que la solicitud existe
    sol_q = await db.execute(select(Solicitud).where(Solicitud.id == solicitud_id))
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Validar que el requerido existe y pertenece al trámite de esta solicitud
    req_q = await db.execute(
        select(TramiteDocumentoRequerido).where(
            TramiteDocumentoRequerido.id == requerido_id,
            TramiteDocumentoRequerido.tramite_id == solicitud.tramite_id,
        )
    )
    requerido = req_q.scalar_one_or_none()
    if not requerido:
        raise HTTPException(
            status_code=404,
            detail="Documento requerido no encontrado para este trámite",
        )

    # ¿Ya existe un DocumentoSolicitud para este requerido?
    existing_q = await db.execute(
        select(DocumentoSolicitud).where(
            DocumentoSolicitud.solicitud_id == solicitud_id,
            DocumentoSolicitud.tramite_documento_requerido_id == requerido_id,
        )
    )
    existing = existing_q.scalar_one_or_none()

    now = datetime.utcnow()

    if existing:
        # Solo marcar como verificado
        existing.verificado = True
        existing.verificado_por_id = current_user.id
        existing.fecha_verificacion = now
        doc = existing
    else:
        # Crear un placeholder sin archivo
        doc = DocumentoSolicitud(
            solicitud_id=solicitud_id,
            usuario_id=current_user.id,
            nombre_original="Verificado en ventanilla",
            url="",
            public_id=None,
            tipo="verificacion_manual",
            mime_type=None,
            tamanio=None,
            tipo_documento="verificacion_visual",
            descripcion=f"Documento verificado visualmente: {requerido.nombre}",
            etapa="creacion",
            tramite_documento_requerido_id=requerido_id,
            verificado=True,
            verificado_por_id=current_user.id,
            fecha_verificacion=now,
        )
        db.add(doc)

    # Flush para que el id del placeholder recién creado esté disponible
    await db.flush()

    # Capturar escalares ANTES del commit para evitar greenlet error al acceder
    # a attrs expired después del commit.
    doc_id = doc.id
    doc_tipo = doc.tipo

    await db.commit()
    auto = await _intentar_auto_transicion_a_en_curso(db, solicitud_id, current_user.id)

    return {
        "message": "Documento verificado visualmente",
        "id": doc_id,
        "tramite_documento_requerido_id": requerido_id,
        "tipo": doc_tipo,
        "auto_transicion_a_en_curso": auto,
    }


@router.post("/solicitudes/{solicitud_id}/enviar-documentos")
async def enviar_documentos_a_revision(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    El vecino marca que ya subio todos los documentos obligatorios y quiere
    que la dependencia los revise. Deja rastro en historial + notifica al
    supervisor. NO cambia el estado (sigue en RECIBIDO hasta que el sup
    verifique los docs y el sistema auto-transicione a EN_CURSO).
    """
    sol_q = await db.execute(select(Solicitud).where(Solicitud.id == solicitud_id))
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Solo el solicitante (o admin) puede marcar envio.
    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No podés enviar documentos de una solicitud ajena")

    if await _ya_envio_documentos_revision(db, solicitud_id):
        raise HTTPException(status_code=400, detail="Ya enviaste los documentos para revisión")

    if not await _todos_obligatorios_subidos(db, solicitud):
        raise HTTPException(
            status_code=400,
            detail="Faltan documentos obligatorios por subir antes de enviar a revisión",
        )

    db.add(HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id,
        estado_anterior=solicitud.estado,
        estado_nuevo=solicitud.estado,
        accion="Documentos enviados para revisión",
        comentario="El vecino terminó de subir los documentos obligatorios.",
    ))
    await db.commit()

    # Notificacion al supervisor (best-effort, no rompe si falla).
    try:
        from services.push_service import notificar_cambio_estado_solicitud
        await notificar_cambio_estado_solicitud(db, solicitud, solicitud.estado, solicitud.estado)
    except Exception as e:
        logger.warning(f"[PUSH] Error notificando envio de docs: {e}")

    return {
        "message": "Documentos enviados para revisión",
        "enviado_at": datetime.utcnow().isoformat(),
    }


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
