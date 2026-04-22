"""API del Operador de Ventanilla (Fase 6 bundle).

Endpoints para que el empleado municipal cree tramites presenciales a
nombre del vecino (caso adultos mayores u otros sin acceso a app):

  POST /operador/tramite-presencial/iniciar
    Body: {
      dni, nombre, apellido, email?, telefono?, tramite_id, municipio_id,
      dj_firmada: bool,   -- operador tilda DJ de validacion presencial
      monto?: float       -- override opcional del costo del tramite
    }
    -> Busca/crea User (ghost vecino), crea Solicitud canal='ventanilla_asistida',
       registra DJ + operador_user_id. Si el tramite tiene costo, crea
       automaticamente la PagoSesion y devuelve checkout_url + codigo_cut_qr.

  POST /operador/tramite-presencial/{id}/marcar-kyc-presencial
    Body: { }
    -> Marca al user vinculado como kyc_modo='assisted' + kyc_operador_id = self.
       Setea nivel_verificacion=2 (operador valido identidad presencialmente).

  GET  /operador/mostrador/home
    -> Metricas del dia para el operador (cuantos inicio, cuantos pago, etc).

Permisos: OPERADOR_VENTANILLA | SUPERVISOR | ADMIN del muni.
"""
from datetime import datetime
from decimal import Decimal
from secrets import token_hex
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.tramite import Solicitud, Tramite, HistorialSolicitud, EstadoSolicitud


router = APIRouter(prefix="/operador", tags=["Operador Ventanilla"])


def _asegurar_operador(user: User) -> None:
    if user.rol not in (RolUsuario.OPERADOR_VENTANILLA, RolUsuario.SUPERVISOR, RolUsuario.ADMIN):
        raise HTTPException(status_code=403, detail="Solo operador de ventanilla, supervisor o admin")


def _asegurar_muni(user: User, municipio_id: int) -> None:
    if not user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")
    if int(user.municipio_id) != int(municipio_id):
        raise HTTPException(status_code=403, detail="No podes operar sobre otro municipio")


class IniciarTramiteRequest(BaseModel):
    municipio_id: int
    tramite_id: int
    dni: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    telefono: Optional[str] = None
    dj_firmada: bool = False       # operador tilda DJ de validacion presencial
    dj_texto: Optional[str] = None  # texto custom de la DJ (por si el muni tiene una propia)


class IniciarTramiteResponse(BaseModel):
    solicitud_id: int
    numero_tramite: str
    user_id: int
    requiere_pago: bool
    checkout_url: Optional[str] = None
    codigo_cut_qr: Optional[str] = None
    session_id: Optional[str] = None
    monto: Optional[float] = None


DJ_DEFAULT_TEXTO = (
    "Se realiza validación presencial de identidad frente a funcionario "
    "público. El operador confirma haber verificado el DNI del solicitante "
    "en persona al momento de iniciar el trámite."
)


@router.post("/tramite-presencial/iniciar", response_model=IniciarTramiteResponse)
async def iniciar_tramite_presencial(
    body: IniciarTramiteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea solicitud presencial + (opcional) PagoSesion con checkout link."""
    _asegurar_operador(current_user)
    _asegurar_muni(current_user, body.municipio_id)

    if not body.dj_firmada:
        raise HTTPException(
            status_code=400,
            detail="El operador debe firmar la declaración jurada de validación presencial",
        )

    # Validar tramite
    t_q = await db.execute(
        select(Tramite).where(
            Tramite.id == body.tramite_id,
            Tramite.municipio_id == body.municipio_id,
            Tramite.activo == True,  # noqa: E712
        )
    )
    tramite = t_q.scalar_one_or_none()
    if not tramite:
        raise HTTPException(status_code=404, detail="Tramite no disponible para este municipio")

    dni = (body.dni or "").strip()
    if not dni or len(dni) < 6:
        raise HTTPException(status_code=400, detail="DNI invalido")

    # Buscar user existente por DNI en el muni, sino por email, sino crear ghost.
    u_q = await db.execute(
        select(User).where(
            User.dni == dni,
            (User.municipio_id == body.municipio_id) | (User.municipio_id.is_(None)),
        ).limit(1)
    )
    user = u_q.scalar_one_or_none()

    if not user and body.email:
        em = body.email.strip().lower()
        if em:
            eq = await db.execute(select(User).where(User.email == em).limit(1))
            user = eq.scalar_one_or_none()

    if not user:
        # Ghost vecino — hash aleatorio que nadie conoce. El dia que se
        # registre solo por su cuenta, hace "olvide mi password" con el
        # mismo email y reclama la cuenta.
        from core.security import hash_password
        random_pwd = token_hex(16)
        user = User(
            email=(body.email or f"ghost-{dni}-{token_hex(3)}@munify.local").strip().lower(),
            nombre=body.nombre.strip(),
            apellido=body.apellido.strip(),
            dni=dni,
            telefono=(body.telefono or "").strip() or None,
            municipio_id=body.municipio_id,
            rol=RolUsuario.VECINO,
            hashed_password=hash_password(random_pwd),
            nivel_verificacion=0,
            activo=True,
        )
        db.add(user)
        await db.flush()

    # Marcar al user con kyc_modo=assisted + operador (si estaba en 0, sube a 2)
    user.kyc_modo = "assisted"
    user.kyc_operador_id = current_user.id
    if (user.nivel_verificacion or 0) < 2:
        user.nivel_verificacion = 2
        user.verificado_at = datetime.utcnow()

    # Generar numero_tramite — formato SOL-YYYY-NNNNN por muni
    year = datetime.utcnow().year
    count_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.municipio_id == body.municipio_id,
            Solicitud.created_at >= datetime(year, 1, 1),
        )
    )
    count_year = int(count_q.scalar() or 0) + 1
    numero_tramite = f"SOL-{year}-{count_year:05d}"

    dj_texto_final = (body.dj_texto or "").strip() or DJ_DEFAULT_TEXTO

    solicitud = Solicitud(
        municipio_id=body.municipio_id,
        numero_tramite=numero_tramite,
        tramite_id=tramite.id,
        asunto=f"[Ventanilla] {tramite.nombre}",
        descripcion=f"Trámite iniciado presencialmente por {current_user.nombre or current_user.email}",
        estado=EstadoSolicitud.RECIBIDO,
        solicitante_id=user.id,
        nombre_solicitante=user.nombre,
        apellido_solicitante=user.apellido,
        dni_solicitante=user.dni,
        email_solicitante=user.email,
        telefono_solicitante=user.telefono,
        canal="ventanilla_asistida",
        operador_user_id=current_user.id,
        validacion_presencial_at=datetime.utcnow(),
        dj_validacion_presencial=dj_texto_final,
    )
    db.add(solicitud)
    await db.flush()

    # Historial
    db.add(HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id,
        estado_nuevo=EstadoSolicitud.RECIBIDO,
        accion="🧑‍💼 Trámite iniciado en ventanilla",
        comentario=f"Operador {current_user.email} — DJ firmada — Vecino {user.nombre} {user.apellido} (DNI {user.dni})",
    ))

    # Si el tramite tiene costo, creamos PagoSesion ya mismo para que el
    # operador muestre el QR / envie por WhatsApp / cobre en efectivo.
    requiere_pago = bool(tramite.costo and float(tramite.costo) > 0)
    checkout_url: Optional[str] = None
    codigo_cut_qr: Optional[str] = None
    session_id: Optional[str] = None
    monto: Optional[float] = None

    if requiere_pago:
        from models.pago_sesion import PagoSesion, EstadoSesionPago
        from services.pagos import get_provider_para_muni

        session_id = f"PB-{token_hex(7).upper()}"
        provider = await get_provider_para_muni(db, body.municipio_id)
        concepto = f"{tramite.nombre} — Solicitud {numero_tramite}"
        monto = float(tramite.costo)

        sesion_ext = await provider.crear_sesion(
            concepto=concepto,
            monto=Decimal(str(monto)),
            sesion_id=session_id,
            return_url="/mostrador",
        )
        sesion = PagoSesion(
            id=session_id,
            solicitud_id=solicitud.id,
            municipio_id=body.municipio_id,
            vecino_user_id=user.id,
            concepto=concepto,
            monto=Decimal(str(monto)),
            estado=EstadoSesionPago.PENDING,
            provider=provider.nombre,
            external_id=sesion_ext.external_id,
            checkout_url=sesion_ext.checkout_url,
            return_url="/mostrador",
            canal="ventanilla_asistida",
            operador_user_id=current_user.id,
        )
        db.add(sesion)

        checkout_url = sesion_ext.checkout_url

        db.add(HistorialSolicitud(
            solicitud_id=solicitud.id,
            usuario_id=current_user.id,
            accion="💳 Link de pago generado",
            comentario=f"Sesión {session_id} · ${monto:.2f} · vía {provider.nombre}",
        ))

    await db.commit()
    await db.refresh(solicitud)

    return IniciarTramiteResponse(
        solicitud_id=solicitud.id,
        numero_tramite=numero_tramite,
        user_id=user.id,
        requiere_pago=requiere_pago,
        checkout_url=checkout_url,
        codigo_cut_qr=codigo_cut_qr,
        session_id=session_id,
        monto=monto,
    )


class MostradorMetricas(BaseModel):
    tramites_hoy: int
    pagados_hoy: int
    monto_hoy: str
    operador_nombre: str


@router.get("/mostrador/home", response_model=MostradorMetricas)
async def mostrador_home(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _asegurar_operador(current_user)
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio")

    hoy_inicio = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    t_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.operador_user_id == current_user.id,
            Solicitud.created_at >= hoy_inicio,
        )
    )
    tramites_hoy = int(t_q.scalar() or 0)

    from models.pago_sesion import PagoSesion, EstadoSesionPago
    p_q = await db.execute(
        select(func.count(PagoSesion.id), func.coalesce(func.sum(PagoSesion.monto), 0)).where(
            PagoSesion.operador_user_id == current_user.id,
            PagoSesion.estado == EstadoSesionPago.APPROVED,
            PagoSesion.completed_at >= hoy_inicio,
        )
    )
    cant, monto = p_q.one()

    nombre = f"{current_user.nombre or ''} {current_user.apellido or ''}".strip() or current_user.email

    return MostradorMetricas(
        tramites_hoy=tramites_hoy,
        pagados_hoy=int(cant or 0),
        monto_hoy=str(monto or 0),
        operador_nombre=nombre,
    )
