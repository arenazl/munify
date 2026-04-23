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

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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
    # Si el operador valido con Didit presencialmente, viene el session_id.
    # Los datos filiatorios (DNI, nombre, apellido) se pueden leer tambien
    # desde Didit — si el form los trae, se validan contra el KYC.
    kyc_session_id: Optional[str] = None


class IniciarTramiteResponse(BaseModel):
    solicitud_id: int
    numero_tramite: str
    user_id: int
    requiere_pago: bool
    checkout_url: Optional[str] = None
    codigo_cut_qr: Optional[str] = None
    session_id: Optional[str] = None
    monto: Optional[float] = None
    # F7 wa.me: link pre-armado para que el operador abra desde su WhatsApp
    # Web y envie manualmente. None si el vecino no tiene telefono cargado.
    wa_me_url: Optional[str] = None
    wa_me_mensaje: Optional[str] = None
    telefono_vecino: Optional[str] = None


DJ_DEFAULT_TEXTO = (
    "Se realiza validación presencial de identidad frente a funcionario "
    "público. El operador confirma haber verificado el DNI del solicitante "
    "en persona al momento de iniciar el trámite."
)


# ============================================================
# KYC presencial — biometria via Didit desde la consola del operador
# ============================================================


class IniciarKycRequest(BaseModel):
    municipio_id: int
    callback_url: Optional[str] = None  # a donde volver cuando Didit termine


class IniciarKycResponse(BaseModel):
    session_id: str
    url: str                            # URL hosted de Didit (abrir en popup)


class EstadoKycResponse(BaseModel):
    session_id: str
    status: str                         # "Not Started" / "In Progress" / "Approved" / "Declined"
    aprobado: bool
    datos: Optional[dict] = None        # dni, nombre, apellido, sexo, fecha_nac, etc.
    motivo_rechazo: Optional[str] = None


@router.post("/kyc/iniciar", response_model=IniciarKycResponse)
async def iniciar_kyc_presencial(
    body: IniciarKycRequest,
    current_user: User = Depends(get_current_user),
):
    """Crea una sesion Didit para validar biometricamente al vecino en ventanilla.

    El operador abre la URL devuelta en popup desde la PC del mostrador.
    El SDK Didit toma la webcam + (opcional) scanner de DNI. Cuando termina,
    el frontend hace polling a /kyc/{session_id}/estado para saber si
    aprobo y cargar los datos filiatorios prellenados.
    """
    _asegurar_operador(current_user)
    _asegurar_muni(current_user, body.municipio_id)

    from services.didit import crear_sesion as didit_crear_sesion, DiditNotConfigured, DiditError
    try:
        # vendor_data marca que es un KYC asistido (mostrador) con operador.
        vendor = f"mostrador:{body.municipio_id}:op{current_user.id}"
        data = await didit_crear_sesion(
            vendor_data=vendor,
            callback_url=body.callback_url,
        )
    except DiditNotConfigured as e:
        raise HTTPException(
            status_code=503,
            detail=f"Biometría no disponible: {e}. Cargá los datos a mano.",
        )
    except DiditError as e:
        raise HTTPException(status_code=502, detail=f"Didit: {e}")

    session_id = data.get("session_id") or data.get("id")
    url = data.get("url") or data.get("session_url")
    if not session_id or not url:
        raise HTTPException(status_code=502, detail="Didit no devolvio session_id/url")

    return IniciarKycResponse(session_id=session_id, url=url)


@router.get("/kyc/{session_id}/estado", response_model=EstadoKycResponse)
async def estado_kyc_presencial(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Consulta el estado de una sesion Didit — para polling desde el frontend.

    Mientras status != Approved/Declined, devolve "In Progress" y el
    frontend reintenta cada 2s. Al aprobar devuelve los datos filiatorios
    ya extraidos, listos para prellenar el form.
    """
    _asegurar_operador(current_user)
    from services.didit import (
        consultar_sesion as didit_consultar,
        extraer_datos_filiatorios,
        DiditNotConfigured, DiditError,
    )
    try:
        decision = await didit_consultar(session_id)
    except DiditNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except DiditError as e:
        raise HTTPException(status_code=502, detail=f"Didit: {e}")

    status = decision.get("status") or "In Progress"
    aprobado = status == "Approved"

    datos = None
    motivo = None
    if aprobado:
        raw = extraer_datos_filiatorios(decision)
        # Serializar date a string ISO
        fn = raw.get("fecha_nacimiento")
        datos = {
            "dni": raw.get("dni"),
            "nombre": raw.get("nombre"),
            "apellido": raw.get("apellido"),
            "sexo": raw.get("sexo"),
            "fecha_nacimiento": fn.isoformat() if fn else None,
            "nacionalidad": raw.get("nacionalidad"),
            "direccion": raw.get("direccion"),
        }
    elif status == "Declined":
        motivo = decision.get("decline_reason") or decision.get("reason") or "Rechazada"

    return EstadoKycResponse(
        session_id=session_id,
        status=status,
        aprobado=aprobado,
        datos=datos,
        motivo_rechazo=motivo,
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

    # Marcar al user con kyc_modo=assisted + operador.
    user.kyc_modo = "assisted"
    user.kyc_operador_id = current_user.id
    # Si vino una sesion Didit aprobada, persistimos referencia + sube nivel.
    if body.kyc_session_id:
        user.didit_session_id = body.kyc_session_id
        user.nivel_verificacion = 2
        user.verificado_at = datetime.utcnow()
    elif (user.nivel_verificacion or 0) < 2:
        # Fallback: el operador firma DJ presencial sin biometria (ej. Didit
        # no disponible). Queda como assisted pero sin session_id Didit.
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

    # F7 — notificar al vecino segun WHATSAPP_AUTOSEND_MODE
    # - "business_api" (futuro, dormido por default): envia automatico.
    # - "wa_me" (default): solo armamos el link, el operador lo envia manual.
    wa_me_url: Optional[str] = None
    wa_me_msg: Optional[str] = None
    from core.config import settings as _cfg
    if requiere_pago and user.telefono and checkout_url:
        from services.wa_me import armar_wa_me_url, mensaje_link_pago
        wa_me_msg = mensaje_link_pago(
            nombre_vecino=f"{user.nombre or ''} {user.apellido or ''}".strip(),
            tramite_nombre=tramite.nombre,
            checkout_url=checkout_url,
            numero_tramite=numero_tramite,
        )
        wa_me_url = armar_wa_me_url(user.telefono, wa_me_msg)

        if _cfg.WHATSAPP_AUTOSEND_MODE == "business_api":
            try:
                from services.whatsapp_pagos import notificar_link_pago
                await notificar_link_pago(
                    db,
                    municipio_id=body.municipio_id,
                    telefono=user.telefono,
                    nombre_vecino=f"{user.nombre or ''} {user.apellido or ''}".strip(),
                    tramite_nombre=tramite.nombre,
                    checkout_url=checkout_url,
                    numero_tramite=numero_tramite,
                    usuario_id=user.id,
                )
            except Exception:
                pass  # no bloquea el flujo si WhatsApp falla

    return IniciarTramiteResponse(
        solicitud_id=solicitud.id,
        numero_tramite=numero_tramite,
        user_id=user.id,
        requiere_pago=requiere_pago,
        checkout_url=checkout_url,
        codigo_cut_qr=codigo_cut_qr,
        session_id=session_id,
        monto=monto,
        wa_me_url=wa_me_url,
        wa_me_mensaje=wa_me_msg,
        telefono_vecino=user.telefono,
    )


class MostradorMetricas(BaseModel):
    tramites_hoy: int
    pagados_hoy: int
    monto_hoy: str
    operador_nombre: str


class GenerarWaMeRequest(BaseModel):
    solicitud_id: int
    # Si se pasa, sobreescribe el telefono del User y lo persiste — util
    # cuando el operador carga trámite sin teléfono y lo completa después.
    telefono_override: Optional[str] = None


class GenerarWaMeResponse(BaseModel):
    wa_me_url: Optional[str] = None
    mensaje: str
    telefono: Optional[str] = None
    ok: bool
    motivo_error: Optional[str] = None


@router.post("/tramite-presencial/wa-me-url", response_model=GenerarWaMeResponse)
async def generar_wa_me_url(
    body: GenerarWaMeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Arma el link wa.me para que el operador abra en su WhatsApp y envie.

    Si `telefono_override` viene, actualiza el telefono del vecino y
    persiste — sirve para cuando el operador lo completo despues.
    """
    _asegurar_operador(current_user)

    sol_q = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite),
            selectinload(Solicitud.solicitante),
        )
        .where(Solicitud.id == body.solicitud_id)
    )
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _asegurar_muni(current_user, solicitud.municipio_id)

    vecino = solicitud.solicitante
    if not vecino:
        raise HTTPException(status_code=400, detail="Solicitud sin solicitante vinculado")

    # Si el operador paso un telefono override, lo persistimos en el user
    if body.telefono_override:
        vecino.telefono = body.telefono_override.strip()
        await db.flush()

    telefono = vecino.telefono

    # Buscar la ultima sesion con checkout_url
    from models.pago_sesion import PagoSesion
    s_q = await db.execute(
        select(PagoSesion)
        .where(PagoSesion.solicitud_id == solicitud.id)
        .order_by(PagoSesion.created_at.desc())
        .limit(1)
    )
    sesion = s_q.scalar_one_or_none()
    if not sesion or not sesion.checkout_url:
        raise HTTPException(status_code=400, detail="No hay link de pago activo")

    from services.wa_me import armar_wa_me_url, mensaje_link_pago
    mensaje = mensaje_link_pago(
        nombre_vecino=f"{vecino.nombre or ''} {vecino.apellido or ''}".strip(),
        tramite_nombre=solicitud.tramite.nombre if solicitud.tramite else "tu tramite",
        checkout_url=sesion.checkout_url,
        numero_tramite=solicitud.numero_tramite,
    )

    if not telefono:
        await db.commit()
        return GenerarWaMeResponse(
            wa_me_url=None,
            mensaje=mensaje,
            telefono=None,
            ok=False,
            motivo_error="El vecino no tiene teléfono cargado",
        )

    url = armar_wa_me_url(telefono, mensaje)
    await db.commit()

    if not url:
        return GenerarWaMeResponse(
            wa_me_url=None,
            mensaje=mensaje,
            telefono=telefono,
            ok=False,
            motivo_error="No pude normalizar el teléfono (formato inválido)",
        )

    return GenerarWaMeResponse(
        wa_me_url=url,
        mensaje=mensaje,
        telefono=telefono,
        ok=True,
    )


# ============================================================
# Fase 8 — Pago en efectivo en caja del muni
# ============================================================
#
# Flow: operador carga un tramite presencialmente (F6), el vecino paga en
# la caja fisica del palacio municipal, trae el ticket al operador y este
# lo registra acá subiendo foto del comprobante. La sesion queda APPROVED
# directo + medio=efectivo_ventanilla + canal=ventanilla_asistida, y entra
# al flujo normal de imputacion (F1). Audit trail: registrado_por_operador_id.
# ============================================================


@router.post("/pagos/efectivo/registrar")
async def registrar_pago_efectivo(
    solicitud_id: int = Form(...),
    monto: float = Form(...),
    numero_comprobante: str = Form(...),
    foto: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registra un pago efectivo en caja del muni con foto del ticket."""
    _asegurar_operador(current_user)
    if not numero_comprobante.strip():
        raise HTTPException(status_code=400, detail="N° de comprobante obligatorio")
    if monto <= 0:
        raise HTTPException(status_code=400, detail="Monto debe ser > 0")

    sol_q = await db.execute(
        select(Solicitud).options(selectinload(Solicitud.tramite)).where(Solicitud.id == solicitud_id)
    )
    solicitud = sol_q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _asegurar_muni(current_user, solicitud.municipio_id)

    # Subir foto a Cloudinary si se envio
    foto_url: Optional[str] = None
    if foto and foto.filename:
        try:
            import cloudinary.uploader
            content = await foto.read()
            if len(content) > 10 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Foto > 10MB")
            await foto.seek(0)
            up = cloudinary.uploader.upload(
                foto.file,
                folder=f"pagos_efectivo/{solicitud.municipio_id}",
                resource_type="image",
            )
            foto_url = up.get("secure_url")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error subiendo foto: {e}")

    # Crear PagoSesion APPROVED + medio efectivo_ventanilla
    from models.pago_sesion import PagoSesion, EstadoSesionPago, MedioPagoGateway, EstadoImputacion
    from models.tasas import Pago, MedioPago as MedioPagoTasa

    session_id = f"PB-{token_hex(7).upper()}"
    cut = f"CUT-{token_hex(3).upper()}"
    ahora = datetime.utcnow()
    concepto = f"{solicitud.tramite.nombre if solicitud.tramite else 'Tramite'} — {solicitud.numero_tramite} (efectivo)"

    sesion = PagoSesion(
        id=session_id,
        solicitud_id=solicitud.id,
        municipio_id=solicitud.municipio_id,
        vecino_user_id=solicitud.solicitante_id,
        concepto=concepto,
        monto=Decimal(str(monto)),
        estado=EstadoSesionPago.APPROVED,
        medio_pago=MedioPagoGateway.EFECTIVO_VENTANILLA,
        provider="caja_muni",
        external_id=numero_comprobante.strip()[:100],
        completed_at=ahora,
        codigo_cut_qr=cut,
        imputacion_estado=EstadoImputacion.PENDIENTE,
        canal="ventanilla_asistida",
        operador_user_id=current_user.id,
        metadatos={"numero_comprobante": numero_comprobante.strip(), "foto_url": foto_url},
    )
    db.add(sesion)

    # Historial
    db.add(HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id,
        accion="💵 Pago en efectivo registrado",
        comentario=f"Comprobante #{numero_comprobante} · ${monto:.2f} · Operador {current_user.email}",
    ))

    await db.commit()

    return {
        "session_id": session_id,
        "codigo_cut_qr": cut,
        "monto": monto,
        "foto_comprobante_url": foto_url,
    }


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
