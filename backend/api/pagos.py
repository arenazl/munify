"""Endpoints del gateway de pagos externo (PayBridge / GIRE / MP).

Flow del vecino pagando una tasa:

  1. Frontend Mis Tasas → click "Pagar" sobre una Deuda.
     → POST /pagos/crear-sesion { deuda_id }
     → devuelve { session_id, checkout_url }

  2. Frontend redirige a checkout_url (una pagina con branding externo que
     visualmente es otra plataforma).
     → GET /pagos/sesiones/{session_id} devuelve los datos para renderizar.

  3. Vecino elige medio de pago y confirma.
     → POST /pagos/sesiones/{session_id}/confirmar { medio_pago }
     → simula el procesamiento, cambia estado a APPROVED.

  4. En paralelo, el provider dispara webhook (en real, Aura; en mock, lo
     disparamos nosotros al confirmar).
     → POST /pagos/webhook/{provider}
     → marca la Deuda como PAGADA, crea registro de Pago.

  5. Frontend redirige al vecino de vuelta a Mis Tasas con success flag.
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from secrets import token_hex
from typing import Optional, List

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from core.config import settings
from models.user import User
from models.enums import RolUsuario
from models.pago_sesion import (
    PagoSesion,
    EstadoSesionPago,
    EstadoImputacion,
    MedioPagoGateway,
)
from models.tasas import Deuda, EstadoDeuda, Pago, MedioPago as MedioPagoTasa, Partida
from services.pagos import get_provider, get_provider_para_muni


router = APIRouter(prefix="/pagos", tags=["Pagos"])


# ============================================================
# Schemas
# ============================================================

class CrearSesionRequest(BaseModel):
    deuda_id: int
    return_url: Optional[str] = None


class CrearSesionResponse(BaseModel):
    session_id: str
    checkout_url: str
    expires_at: datetime


class SesionPagoPublica(BaseModel):
    """Datos de la sesion que el frontend del checkout PayBridge consume."""
    session_id: str
    estado: EstadoSesionPago
    concepto: str
    monto: Decimal
    municipio_nombre: str
    vecino_nombre: str
    medios_soportados: list[MedioPagoGateway]
    return_url: Optional[str] = None
    provider: str

    class Config:
        from_attributes = True


class ConfirmarPagoRequest(BaseModel):
    medio_pago: MedioPagoGateway
    # Datos del medio (tarjeta, etc). Como es mock no validamos.
    # En real, estos datos NUNCA viajan a Munify — van directo al provider.
    metadatos: Optional[dict] = None


class ConfirmarPagoResponse(BaseModel):
    session_id: str
    estado: EstadoSesionPago
    external_id: str
    codigo_cut_qr: Optional[str] = None
    comprobante: dict


# ============================================================
# Helpers
# ============================================================

def _generar_session_id() -> str:
    """ID publico no enumerable: PB-ABC123DEF456 (14 chars hex)."""
    return f"PB-{token_hex(7).upper()}"


async def _generar_cut_unico(db: AsyncSession, intentos: int = 6) -> str:
    """Genera un CUT corto (CUT-A3F2B1) garantizando unicidad en DB.

    Colision practicamente imposible con 6 chars hex (16M combinaciones), pero
    reintentamos igual si el UNIQUE INDEX rechaza. Si despues de N intentos
    no lo logramos, caemos a un CUT largo con timestamp para no fallar.
    """
    from sqlalchemy import exists as _exists, select as _select
    for _ in range(intentos):
        candidato = f"CUT-{token_hex(3).upper()}"
        q = await db.execute(_select(PagoSesion.id).where(PagoSesion.codigo_cut_qr == candidato))
        if q.scalar_one_or_none() is None:
            return candidato
    # Fallback — larguisimo, pero garantizado unico
    return f"CUT-{token_hex(6).upper()}"


# ============================================================
# 1. Crear sesion de pago (desde Munify)
# ============================================================

@router.post("/crear-sesion", response_model=CrearSesionResponse)
async def crear_sesion_pago(
    body: CrearSesionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El vecino hizo click en 'Pagar' sobre una deuda. Creamos la sesion."""
    # Cargar deuda + partida + municipio
    q = await db.execute(
        select(Deuda)
        .options(
            selectinload(Deuda.partida).selectinload(Partida.municipio),
            selectinload(Deuda.partida).selectinload(Partida.tipo_tasa),
        )
        .where(Deuda.id == body.deuda_id)
    )
    deuda = q.scalar_one_or_none()
    if not deuda:
        raise HTTPException(status_code=404, detail="Deuda no encontrada")

    if deuda.estado == EstadoDeuda.PAGADA:
        raise HTTPException(status_code=400, detail="Esta deuda ya fue pagada")

    partida = deuda.partida
    if not partida:
        raise HTTPException(status_code=500, detail="La deuda no tiene partida asociada")

    # Permiso: vecino solo paga lo suyo
    if current_user.rol == RolUsuario.VECINO:
        permitido = partida.titular_user_id == current_user.id or (
            current_user.dni and partida.titular_dni == current_user.dni
        )
        if not permitido:
            raise HTTPException(status_code=403, detail="No podés pagar una deuda ajena")

    provider = await get_provider_para_muni(db, partida.municipio_id)
    sesion_id = _generar_session_id()
    concepto = f"{partida.tipo_tasa.nombre if partida.tipo_tasa else 'Tasa'} - {partida.municipio.nombre.replace('Municipalidad de ', '')} - {deuda.periodo}"

    # Crear sesion en el provider (devuelve external_id + checkout_url)
    sesion_ext = await provider.crear_sesion(
        concepto=concepto,
        monto=Decimal(str(deuda.importe)),
        sesion_id=sesion_id,
        return_url=body.return_url or "/gestion/mis-tasas",
    )

    # Persistir nuestra sesion
    expires_at = datetime.utcnow() + timedelta(seconds=sesion_ext.expires_in_seconds)
    sesion = PagoSesion(
        id=sesion_id,
        deuda_id=deuda.id,
        municipio_id=partida.municipio_id,
        vecino_user_id=current_user.id,
        concepto=concepto,
        monto=Decimal(str(deuda.importe)),
        estado=EstadoSesionPago.PENDING,
        provider=provider.nombre,
        external_id=sesion_ext.external_id,
        checkout_url=sesion_ext.checkout_url,
        return_url=body.return_url,
        expires_at=expires_at,
    )
    db.add(sesion)
    await db.commit()

    return CrearSesionResponse(
        session_id=sesion_id,
        checkout_url=sesion_ext.checkout_url,
        expires_at=expires_at,
    )


# ============================================================
# 2. Obtener sesion (desde el checkout externo)
# ============================================================

class CrearSesionTramiteRequest(BaseModel):
    solicitud_id: int
    return_url: Optional[str] = None


@router.post("/sesion-tramite", response_model=CrearSesionResponse)
async def crear_sesion_tramite(
    body: CrearSesionTramiteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    El vecino hizo click en 'Pagar' sobre una solicitud de tramite.
    Crea la sesion de pago y devuelve el checkout_url.
    """
    from models.tramite import Solicitud, EstadoSolicitud, Tramite
    from sqlalchemy.orm import selectinload as _sl

    q = await db.execute(
        select(Solicitud)
        .options(_sl(Solicitud.tramite))
        .where(Solicitud.id == body.solicitud_id)
    )
    solicitud = q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if not solicitud.tramite or not solicitud.tramite.costo or solicitud.tramite.costo <= 0:
        raise HTTPException(status_code=400, detail="Este tramite no tiene costo")

    # Permiso: vecino solo paga lo suyo
    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No podes pagar una solicitud ajena")

    if solicitud.estado in (EstadoSolicitud.FINALIZADO, EstadoSolicitud.RECHAZADO):
        raise HTTPException(status_code=400, detail=f"Esta solicitud esta {solicitud.estado.value}")

    provider = await get_provider_para_muni(db, solicitud.municipio_id)
    sesion_id = _generar_session_id()
    concepto = f"{solicitud.tramite.nombre} — Solicitud {solicitud.numero_tramite}"

    sesion_ext = await provider.crear_sesion(
        concepto=concepto,
        monto=Decimal(str(solicitud.tramite.costo)),
        sesion_id=sesion_id,
        return_url=body.return_url or "/gestion/mis-tramites",
    )

    expires_at = datetime.utcnow() + timedelta(seconds=sesion_ext.expires_in_seconds)
    sesion = PagoSesion(
        id=sesion_id,
        solicitud_id=solicitud.id,
        municipio_id=solicitud.municipio_id,
        vecino_user_id=current_user.id,
        concepto=concepto,
        monto=Decimal(str(solicitud.tramite.costo)),
        estado=EstadoSesionPago.PENDING,
        provider=provider.nombre,
        external_id=sesion_ext.external_id,
        checkout_url=sesion_ext.checkout_url,
        return_url=body.return_url,
        expires_at=expires_at,
    )
    db.add(sesion)

    # Auditoría: dejar rastro en historial de la solicitud
    from models.tramite import HistorialSolicitud
    db.add(HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id,
        accion="Sesión de pago iniciada",
        comentario=f"Sesión {sesion_id} · ${solicitud.tramite.costo:.2f} · vía {provider.nombre}",
    ))

    await db.commit()

    return CrearSesionResponse(
        session_id=sesion_id,
        checkout_url=sesion_ext.checkout_url,
        expires_at=expires_at,
    )


# ============================================================
# 2.b Cupon WhatsApp para una solicitud (modo Mostrador)
# ============================================================

# PARCHE TESTING — fuerza que todos los cupones del Mostrador salgan a $1.
# Permite validar el flujo end-to-end con MP real sin gastar plata real.
# Quitar (poner en None) antes de produccion.
CUPON_TEST_OVERRIDE_MONTO: Optional[Decimal] = Decimal("1.00")


class CuponWaResponse(BaseModel):
    session_id: str
    checkout_url: str
    wa_me_url: Optional[str]
    mensaje_wa: str
    monto: str
    vecino_telefono: Optional[str]
    expires_at: datetime


@router.post("/cupon-tramite-wa/{solicitud_id}", response_model=CuponWaResponse)
async def cupon_tramite_wa(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera un cupon de pago para una solicitud y arma la URL `wa.me`
    con el mensaje pre-cargado para que el operador del Mostrador lo abra
    desde la PC con WhatsApp Web logueado en el numero del muni.

    El operador clickea, WA Web abre el chat al telefono del vecino con
    el texto listo, presiona Enviar y le llega el cupon. Cuando el vecino
    paga, el webhook del provider marca la solicitud como pagada y la
    saca de PENDIENTE_PAGO.
    """
    from models.tramite import Solicitud, EstadoSolicitud, Tramite, HistorialSolicitud
    from sqlalchemy.orm import selectinload as _sl
    from services.wa_me import armar_wa_me_url, mensaje_link_pago

    q = await db.execute(
        select(Solicitud)
        .options(
            _sl(Solicitud.tramite),
            _sl(Solicitud.solicitante),
        )
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Permisos: vecino solo lo suyo; admin/supervisor/operador del mismo muni.
    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No podes pagar una solicitud ajena")
    if current_user.rol != RolUsuario.VECINO and current_user.municipio_id != solicitud.municipio_id:
        raise HTTPException(status_code=403, detail="No podes operar sobre otro municipio")

    if not solicitud.tramite or not solicitud.tramite.costo or solicitud.tramite.costo <= 0:
        raise HTTPException(status_code=400, detail="Este tramite no tiene costo")
    if solicitud.estado in (EstadoSolicitud.FINALIZADO, EstadoSolicitud.RECHAZADO):
        raise HTTPException(status_code=400, detail=f"Esta solicitud esta {solicitud.estado.value}")

    # Si ya hay una sesion PENDING activa para esta solicitud, la reusamos
    # en vez de crear duplicados (idempotencia simple).
    q_sesion = await db.execute(
        select(PagoSesion)
        .where(
            PagoSesion.solicitud_id == solicitud.id,
            PagoSesion.estado.in_([EstadoSesionPago.PENDING, EstadoSesionPago.IN_CHECKOUT]),
        )
        .order_by(PagoSesion.created_at.desc())
        .limit(1)
    )
    sesion = q_sesion.scalar_one_or_none()

    if sesion is None:
        provider = await get_provider_para_muni(db, solicitud.municipio_id)
        sesion_id = _generar_session_id()
        # PARCHE TESTING: si CUPON_TEST_OVERRIDE_MONTO esta seteado, el cupon
        # cobra ese monto en lugar del costo real del tramite. La DB queda
        # intacta — solo afecta a la PagoSesion creada para este cobro.
        monto_real = Decimal(str(solicitud.tramite.costo))
        monto_a_cobrar = CUPON_TEST_OVERRIDE_MONTO or monto_real
        suffix_test = " (TEST $1)" if CUPON_TEST_OVERRIDE_MONTO else ""
        concepto = f"{solicitud.tramite.nombre} — Solicitud {solicitud.numero_tramite}{suffix_test}"

        sesion_ext = await provider.crear_sesion(
            concepto=concepto,
            monto=monto_a_cobrar,
            sesion_id=sesion_id,
            return_url="/gestion/mis-tramites",
        )

        expires_at = datetime.utcnow() + timedelta(seconds=sesion_ext.expires_in_seconds)
        sesion = PagoSesion(
            id=sesion_id,
            solicitud_id=solicitud.id,
            municipio_id=solicitud.municipio_id,
            vecino_user_id=solicitud.solicitante_id,
            concepto=concepto,
            monto=monto_a_cobrar,
            estado=EstadoSesionPago.PENDING,
            provider=provider.nombre,
            external_id=sesion_ext.external_id,
            checkout_url=sesion_ext.checkout_url,
            return_url="/gestion/mis-tramites",
            expires_at=expires_at,
            canal="ventanilla_asistida" if current_user.rol != RolUsuario.VECINO else "app",
            operador_user_id=current_user.id if current_user.rol != RolUsuario.VECINO else None,
        )
        db.add(sesion)
        db.add(HistorialSolicitud(
            solicitud_id=solicitud.id,
            usuario_id=current_user.id,
            accion="Cupón de pago generado",
            comentario=(
                f"Sesión {sesion_id} · ${monto_a_cobrar:.2f}"
                + (f" (real ${monto_real:.2f}, override testing)" if CUPON_TEST_OVERRIDE_MONTO else "")
                + f" · vía {provider.nombre} (cupón WhatsApp)"
            ),
        ))
        await db.commit()
        await db.refresh(sesion)

    # Armar mensaje + wa.me url. El checkout_url puede venir relativo (mock
    # provider) — para wa.me + clipboard necesitamos URL absoluta.
    checkout_raw = sesion.checkout_url or ""
    if checkout_raw.startswith("/"):
        base = settings.FRONTEND_URL.rstrip("/")
        checkout_absoluto = f"{base}{checkout_raw}"
    else:
        checkout_absoluto = checkout_raw

    vecino = solicitud.solicitante
    nombre_vecino = (vecino.nombre or "").strip() if vecino else ""
    telefono = (vecino.telefono or "").strip() if vecino else ""
    mensaje = mensaje_link_pago(
        nombre_vecino=nombre_vecino,
        tramite_nombre=solicitud.tramite.nombre,
        checkout_url=checkout_absoluto,
        numero_tramite=solicitud.numero_tramite,
        monto=sesion.monto,
    )
    wa_url = armar_wa_me_url(telefono, mensaje) if telefono else None

    return CuponWaResponse(
        session_id=sesion.id,
        checkout_url=checkout_absoluto,
        wa_me_url=wa_url,
        mensaje_wa=mensaje,
        monto=str(sesion.monto),
        vecino_telefono=telefono or None,
        expires_at=sesion.expires_at or datetime.utcnow(),
    )


@router.get("/sesiones/{session_id}", response_model=SesionPagoPublica)
async def obtener_sesion(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve los datos publicos de una sesion de pago.

    Endpoint abierto: el checkout externo necesita leer sin JWT de Munify
    porque conceptualmente es otra plataforma. La seguridad la da el
    session_id no-enumerable (hex random de 14 chars).
    """
    from models.tramite import Solicitud as _Solicitud, Tramite as _Tramite

    q = await db.execute(
        select(PagoSesion)
        .options(
            selectinload(PagoSesion.municipio),
            selectinload(PagoSesion.vecino),
            selectinload(PagoSesion.deuda).selectinload(Deuda.partida).selectinload(Partida.tipo_tasa),
        )
        .where(PagoSesion.id == session_id)
    )
    sesion = q.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    # Marcar 'in_checkout' al primer acceso (para tracking)
    if sesion.estado == EstadoSesionPago.PENDING:
        sesion.estado = EstadoSesionPago.IN_CHECKOUT
        await db.commit()

    muni_nombre = sesion.municipio.nombre.replace("Municipalidad de ", "") if sesion.municipio else ""
    vecino_nombre = f"{sesion.vecino.nombre} {sesion.vecino.apellido or ''}".strip() if sesion.vecino else ""

    provider = await get_provider_para_muni(db, sesion.municipio_id)
    medios_todos = provider.medios_soportados()

    # Filtrar por tipo_pago configurado en la tasa/tramite del origen.
    # Mapeo tipo_pago (config catalogo) -> medios validos en la sesion.
    TIPO_PAGO_TO_MEDIOS = {
        "boton_pago": [MedioPagoGateway.TARJETA, MedioPagoGateway.QR],
        "rapipago": [MedioPagoGateway.EFECTIVO_CUPON],
        "adhesion_debito": [MedioPagoGateway.DEBITO_AUTOMATICO],
        "qr": [MedioPagoGateway.QR],
    }
    tipo_pago_origen = None
    if sesion.deuda and sesion.deuda.partida and sesion.deuda.partida.tipo_tasa:
        tipo_pago_origen = sesion.deuda.partida.tipo_tasa.tipo_pago
    elif sesion.solicitud_id:
        # Pago de tramite — leer tipo_pago del tramite asociado a la solicitud
        sq = await db.execute(
            select(_Solicitud).options(selectinload(_Solicitud.tramite)).where(_Solicitud.id == sesion.solicitud_id)
        )
        sol = sq.scalar_one_or_none()
        if sol and sol.tramite:
            tipo_pago_origen = sol.tramite.tipo_pago

    if tipo_pago_origen and tipo_pago_origen in TIPO_PAGO_TO_MEDIOS:
        permitidos = set(TIPO_PAGO_TO_MEDIOS[tipo_pago_origen])
        medios_filtrados = [m for m in medios_todos if m in permitidos]
        if medios_filtrados:
            medios_todos = medios_filtrados

    return SesionPagoPublica(
        session_id=sesion.id,
        estado=sesion.estado,
        concepto=sesion.concepto,
        monto=Decimal(str(sesion.monto)),
        municipio_nombre=muni_nombre,
        vecino_nombre=vecino_nombre,
        medios_soportados=medios_todos,
        return_url=sesion.return_url,
        provider=sesion.provider,
    )


# ============================================================
# 3. Confirmar pago (desde el checkout externo)
# ============================================================

@router.post("/sesiones/{session_id}/confirmar", response_model=ConfirmarPagoResponse)
async def confirmar_pago(
    session_id: str,
    body: ConfirmarPagoRequest,
    db: AsyncSession = Depends(get_db),
):
    """El vecino eligio medio de pago y confirmo en el checkout externo."""
    q = await db.execute(
        select(PagoSesion)
        .options(selectinload(PagoSesion.deuda))
        .where(PagoSesion.id == session_id)
    )
    sesion = q.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    if sesion.estado == EstadoSesionPago.APPROVED:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado")

    if sesion.estado in (EstadoSesionPago.EXPIRED, EstadoSesionPago.CANCELLED):
        raise HTTPException(status_code=400, detail=f"Sesion {sesion.estado.value}")

    # En un provider real acá haríamos POST al provider y esperaríamos webhook.
    # Como es mock, simulamos el camino feliz: marcamos aprobado directo.
    sesion.estado = EstadoSesionPago.APPROVED
    sesion.medio_pago = body.medio_pago
    sesion.completed_at = datetime.utcnow()
    sesion.metadatos = (sesion.metadatos or {}) | {
        "medio_detalle": body.metadatos or {},
        "simulado": True,
    }

    # Generar CUT (Codigo Unico de Tramite) si aun no lo tiene —
    # el operador de ventanilla lo escanea para verificar el pago.
    if not sesion.codigo_cut_qr:
        sesion.codigo_cut_qr = await _generar_cut_unico(db)

    # Marcar pendiente de imputacion contable. Contaduria despues lo pasa
    # a 'imputado' cuando carga el asiento en el sistema tributario (RAFAM).
    if sesion.imputacion_estado is None:
        sesion.imputacion_estado = EstadoImputacion.PENDIENTE

    # Marcar la deuda como pagada + crear registro de Pago
    if sesion.deuda:
        sesion.deuda.estado = EstadoDeuda.PAGADA
        sesion.deuda.fecha_pago = datetime.utcnow()
        sesion.deuda.pago_externo_id = sesion.external_id

        # Mapear el medio del gateway al medio de pago de Tasas
        medio_tasa_map = {
            MedioPagoGateway.TARJETA: MedioPagoTasa.TARJETA_CREDITO,
            MedioPagoGateway.QR: MedioPagoTasa.QR,
            MedioPagoGateway.EFECTIVO_CUPON: MedioPagoTasa.RAPIPAGO,
            MedioPagoGateway.TRANSFERENCIA: MedioPagoTasa.TRANSFERENCIA,
            MedioPagoGateway.DEBITO_AUTOMATICO: MedioPagoTasa.DEBITO_AUTOMATICO,
        }
        db.add(Pago(
            deuda_id=sesion.deuda.id,
            usuario_id=sesion.vecino_user_id,
            monto=sesion.monto,
            medio=medio_tasa_map.get(body.medio_pago, MedioPagoTasa.TARJETA_CREDITO),
            pago_externo_id=sesion.external_id,
            estado="confirmado",
            payload_externo=sesion.metadatos,
        ))

    # Si era pago de un tramite: registrar el evento y, si estaba en
    # PENDIENTE_PAGO (cobro al inicio), pasar la solicitud a RECIBIDO ahora
    # que el dinero ya entró. Las dependencias recién la pueden trabajar.
    solicitud_pasa_a_recibido = False
    if sesion.solicitud_id:
        from models.tramite import Solicitud, EstadoSolicitud, HistorialSolicitud
        sol_q = await db.execute(
            select(Solicitud).options(selectinload(Solicitud.tramite)).where(Solicitud.id == sesion.solicitud_id)
        )
        solicitud = sol_q.scalar_one_or_none()
        if solicitud:
            estado_previo = solicitud.estado
            costo_fmt = f"${sesion.monto:,.2f}".replace(",", ".") if sesion.monto else ""

            estado_nuevo = estado_previo
            if estado_previo == EstadoSolicitud.PENDIENTE_PAGO:
                solicitud.estado = EstadoSolicitud.RECIBIDO
                estado_nuevo = EstadoSolicitud.RECIBIDO
                solicitud_pasa_a_recibido = True

            db.add(HistorialSolicitud(
                solicitud_id=solicitud.id,
                usuario_id=sesion.vecino_user_id,
                estado_anterior=estado_previo,
                estado_nuevo=estado_nuevo,
                accion=f"💳 Pago aprobado · {body.medio_pago.value if hasattr(body.medio_pago, 'value') else body.medio_pago}",
                comentario=f"Sesión {sesion.id} · {costo_fmt} · N° operación {sesion.external_id}",
            ))

    await db.commit()

    # F7 — notificacion de pago confirmado por Business API.
    # Solo corre si el muni activo el modo automatico (hoy dormido por default).
    # En modo wa_me el vecino ve la confirmacion en la pantalla del checkout;
    # si hay que reforzar, el operador arma otro link desde el Mostrador.
    if settings.WHATSAPP_AUTOSEND_MODE == "business_api":
        try:
            from services.whatsapp_pagos import notificar_pago_confirmado
            vq = await db.execute(select(User).where(User.id == sesion.vecino_user_id))
            vecino = vq.scalar_one_or_none()
            if vecino and vecino.telefono:
                await notificar_pago_confirmado(
                    db,
                    municipio_id=sesion.municipio_id,
                    telefono=vecino.telefono,
                    nombre_vecino=f"{vecino.nombre or ''} {vecino.apellido or ''}".strip(),
                    concepto=sesion.concepto,
                    monto=sesion.monto,
                    cut=sesion.codigo_cut_qr,
                    usuario_id=vecino.id,
                )
        except Exception:
            pass  # no bloquea

    return ConfirmarPagoResponse(
        session_id=sesion.id,
        estado=sesion.estado,
        external_id=sesion.external_id or "",
        codigo_cut_qr=sesion.codigo_cut_qr,
        comprobante={
            "concepto": sesion.concepto,
            "monto": str(sesion.monto),
            "medio_pago": body.medio_pago.value,
            "fecha": sesion.completed_at.isoformat() if sesion.completed_at else None,
            "numero_operacion": sesion.external_id,
            "provider": sesion.provider,
            "cut": sesion.codigo_cut_qr,
        },
    )


# ============================================================
# 3.5. Consulta publica por CUT (operador de ventanilla)
# ============================================================

class CUTInfo(BaseModel):
    """Info publica que devuelve /pagos/cut/{codigo}.

    Para el operador de ventanilla: sirve para verificar en el mostrador
    que un vecino efectivamente pago, sin que el operador tenga que
    loguearse como el vecino ni revelar datos sensibles.
    """
    codigo_cut_qr: str
    concepto: str
    monto: str
    medio_pago: Optional[str]
    estado: str
    fecha_pago: Optional[str]
    provider: str
    numero_operacion: Optional[str]
    municipio_nombre: Optional[str]
    vecino_nombre: Optional[str]
    imputacion_estado: Optional[str]


@router.get("/cut/{codigo}", response_model=CUTInfo)
async def obtener_por_cut(codigo: str, db: AsyncSession = Depends(get_db)):
    """Endpoint publico — el operador escanea el CUT y valida el pago.

    Abierto (sin JWT): el CUT es no-enumerable y solo revela info minima
    necesaria para confirmar que el pago existe y esta aprobado. Si la
    sesion no esta APPROVED devuelve 404 para evitar fishing de estados.
    """
    q = await db.execute(
        select(PagoSesion)
        .options(
            selectinload(PagoSesion.municipio),
            selectinload(PagoSesion.vecino),
        )
        .where(PagoSesion.codigo_cut_qr == codigo.upper())
    )
    sesion = q.scalar_one_or_none()
    if not sesion or sesion.estado != EstadoSesionPago.APPROVED:
        raise HTTPException(status_code=404, detail="CUT no encontrado o pago no aprobado")

    muni_nombre = (
        sesion.municipio.nombre.replace("Municipalidad de ", "")
        if sesion.municipio else None
    )
    vecino_nombre = (
        f"{sesion.vecino.nombre or ''} {sesion.vecino.apellido or ''}".strip()
        if sesion.vecino else None
    )

    return CUTInfo(
        codigo_cut_qr=sesion.codigo_cut_qr,
        concepto=sesion.concepto,
        monto=str(sesion.monto),
        medio_pago=sesion.medio_pago.value if sesion.medio_pago else None,
        estado=sesion.estado.value,
        fecha_pago=sesion.completed_at.isoformat() if sesion.completed_at else None,
        provider=sesion.provider,
        numero_operacion=sesion.external_id,
        municipio_nombre=muni_nombre,
        vecino_nombre=vecino_nombre,
        imputacion_estado=sesion.imputacion_estado.value if sesion.imputacion_estado else None,
    )


# ============================================================
# 4. Cancelar sesion (desde el checkout externo)
# ============================================================

@router.post("/sesiones/{session_id}/cancelar")
async def cancelar_sesion(session_id: str, db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(PagoSesion).where(PagoSesion.id == session_id))
    sesion = q.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    if sesion.estado in (EstadoSesionPago.APPROVED, EstadoSesionPago.CANCELLED):
        return {"estado": sesion.estado.value}
    sesion.estado = EstadoSesionPago.CANCELLED

    # Auditoría de cancelación si era de un tramite
    if sesion.solicitud_id:
        from models.tramite import HistorialSolicitud
        db.add(HistorialSolicitud(
            solicitud_id=sesion.solicitud_id,
            usuario_id=sesion.vecino_user_id,
            accion="✗ Pago cancelado",
            comentario=f"Sesión {sesion.id} cancelada antes de confirmar",
        ))
    await db.commit()
    return {"estado": sesion.estado.value}


# ============================================================
# 5. Webhook del provider real (Mercado Pago / MODO / GIRE) — Fase 2
# ============================================================
#
# MP llama a este endpoint cuando un pago cambia de estado. El body es
# como `{"action": "payment.updated", "data": {"id": "12345"}}`.
# Validamos firma (cuando el provider la manda), registramos el evento en
# bitacora, y si es `approved` ejecutamos el mismo path que /confirmar.
#
# Endpoint abierto (sin auth): la seguridad viene de la firma + idempotencia.
# ============================================================

import hashlib
import hmac as _hmac
from fastapi import Request
from models.municipio_proveedor_pago import MunicipioProveedorPago, PROVEEDOR_MERCADOPAGO
from models.pago_webhook_evento import PagoWebhookEvento


async def _validar_firma_mercadopago(
    raw_body: bytes,
    signature_header: str,
    request_id: str,
    data_id: str,
    webhook_secret: str,
) -> bool:
    """Valida la firma HMAC-SHA256 del webhook de MP.

    MP envia el header `x-signature: ts=<ts>,v1=<hash>` donde el hash
    se calcula sobre `id:<data_id>;request-id:<req_id>;ts:<ts>;`.
    Si el muni no tiene webhook_secret configurado, saltamos validacion
    (pero marcamos firma_ok=false y loguea warning).
    """
    if not webhook_secret or not signature_header:
        return False
    try:
        parts = dict(
            p.strip().split("=", 1) for p in signature_header.split(",") if "=" in p
        )
        ts = parts.get("ts", "")
        v1 = parts.get("v1", "")
        if not ts or not v1:
            return False
        manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
        calc = _hmac.new(
            webhook_secret.encode(),
            manifest.encode(),
            hashlib.sha256,
        ).hexdigest()
        return _hmac.compare_digest(calc, v1)
    except Exception:
        return False


@router.post("/webhook/mercadopago")
async def webhook_mercadopago(request: Request, db: AsyncSession = Depends(get_db)):
    """Recibe notificacion de MP.

    Devolvemos 200 rapido siempre (MP reintenta si no). El procesamiento
    real queda registrado en `pago_webhook_eventos` y, si es 'approved',
    propaga al mismo path de confirmar_pago.
    """
    raw_body = await request.body()
    try:
        body = await request.json()
    except Exception:
        body = {}

    evento = body.get("action") or body.get("type") or "unknown"
    data_id = str((body.get("data") or {}).get("id") or body.get("id") or "")

    if not data_id:
        logger.warning("Webhook MP sin data.id — body: %s", body)
        return {"received": True}

    # Registrar en bitacora (idempotente por UNIQUE provider+external+evento)
    firma_header = request.headers.get("x-signature", "")
    request_id = request.headers.get("x-request-id", "")

    # Buscar la sesion por external_reference (el preference_id lo
    # almacenamos en external_id cuando creamos la sesion). MP a veces
    # manda payment_id, que no es preference_id — en ese caso buscamos
    # por pago completo con /v1/payments/{id} y obtenemos el external_reference.
    sesion: Optional[PagoSesion] = None
    external_ref: Optional[str] = None

    # Por ahora: si el evento es payment.updated, consultamos MP para
    # obtener el external_reference real (que es nuestro sesion_id).
    # Esto requiere tener credenciales validas para el muni en cuestion.
    # Como no sabemos el muni hasta resolver la sesion, buscamos por
    # external_id primero (preference_id) y sino ignoramos silenciosamente.

    q = await db.execute(
        select(PagoSesion).where(PagoSesion.external_id == data_id)
    )
    sesion = q.scalar_one_or_none()

    # Validar firma si tenemos el muni
    firma_ok = False
    if sesion:
        cfg_q = await db.execute(
            select(MunicipioProveedorPago).where(
                MunicipioProveedorPago.municipio_id == sesion.municipio_id,
                MunicipioProveedorPago.proveedor == PROVEEDOR_MERCADOPAGO,
                MunicipioProveedorPago.activo == True,  # noqa: E712
            )
        )
        cfg = cfg_q.scalar_one_or_none()
        if cfg and cfg.webhook_secret:
            firma_ok = await _validar_firma_mercadopago(
                raw_body, firma_header, request_id, data_id, cfg.webhook_secret
            )

    # Persistir el evento (unique key dedupea reentregas de MP)
    evt = PagoWebhookEvento(
        provider="mercadopago",
        external_id=data_id,
        evento=evento,
        session_id=sesion.id if sesion else None,
        payload=body,
        firma_ok=firma_ok,
    )
    db.add(evt)
    try:
        await db.commit()
    except Exception as e:
        # UNIQUE constraint — evento ya procesado, responder 200 y salir
        await db.rollback()
        logger.info("Webhook MP duplicado ignorado: %s %s %s -> %s", evento, data_id, sesion and sesion.id, e)
        return {"received": True, "duplicate": True}

    # Si no teniamos sesion, no hay mas nada que hacer — el evento queda
    # en bitacora para inspeccion manual.
    if not sesion:
        return {"received": True, "session_resolved": False}

    # Consultar estado real en MP (el payload del webhook no lo trae)
    provider = await get_provider_para_muni(db, sesion.municipio_id)
    try:
        estado_ext = await provider.consultar_estado(data_id)
    except Exception as e:
        evt.error = str(e)[:500]
        await db.commit()
        logger.error("Webhook MP no pudo consultar estado: %s", e)
        return {"received": True, "error": "consulta_estado_fallo"}

    if estado_ext.aprobado and sesion.estado != EstadoSesionPago.APPROVED:
        # Ejecutar el mismo path que /confirmar (marcar deuda pagada + pago)
        sesion.estado = EstadoSesionPago.APPROVED
        sesion.medio_pago = estado_ext.medio_pago or sesion.medio_pago
        sesion.completed_at = datetime.utcnow()
        sesion.metadatos = (sesion.metadatos or {}) | {"webhook": evento, "mp_payload": estado_ext.payload_raw or {}}
        if not sesion.codigo_cut_qr:
            sesion.codigo_cut_qr = await _generar_cut_unico(db)
        if sesion.imputacion_estado is None:
            sesion.imputacion_estado = EstadoImputacion.PENDIENTE
        if sesion.deuda_id:
            dq = await db.execute(select(Deuda).where(Deuda.id == sesion.deuda_id))
            deuda = dq.scalar_one_or_none()
            if deuda and deuda.estado != EstadoDeuda.PAGADA:
                deuda.estado = EstadoDeuda.PAGADA
                deuda.fecha_pago = datetime.utcnow()
                deuda.pago_externo_id = sesion.external_id
                medio_tasa_map = {
                    MedioPagoGateway.TARJETA: MedioPagoTasa.TARJETA_CREDITO,
                    MedioPagoGateway.QR: MedioPagoTasa.QR,
                    MedioPagoGateway.EFECTIVO_CUPON: MedioPagoTasa.RAPIPAGO,
                    MedioPagoGateway.TRANSFERENCIA: MedioPagoTasa.TRANSFERENCIA,
                    MedioPagoGateway.DEBITO_AUTOMATICO: MedioPagoTasa.DEBITO_AUTOMATICO,
                }
                db.add(Pago(
                    deuda_id=deuda.id,
                    usuario_id=sesion.vecino_user_id,
                    monto=sesion.monto,
                    medio=medio_tasa_map.get(sesion.medio_pago, MedioPagoTasa.TARJETA_CREDITO) if sesion.medio_pago else MedioPagoTasa.TARJETA_CREDITO,
                    pago_externo_id=sesion.external_id,
                    estado="confirmado",
                    payload_externo=sesion.metadatos,
                ))

    evt.procesado_at = datetime.utcnow()
    await db.commit()

    return {"received": True, "procesado": True, "session_id": sesion.id}


# ============================================================
# Probar credenciales del provider (admin / supervisor)
# ============================================================

class ProbarCredencialesRequest(BaseModel):
    proveedor: str           # "mercadopago"
    access_token: str
    test_mode: bool = True


@router.post("/proveedores/probar-credenciales")
async def probar_credenciales_provider(
    body: ProbarCredencialesRequest,
    current_user: User = Depends(get_current_user),
):
    """Valida contra el provider que las credenciales funcionan.

    No guarda nada en DB — solo testea. El guardado lo hace /proveedores-pago.
    """
    if current_user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="No tenes permiso")
    if body.proveedor == "mercadopago":
        from services.pagos.mercadopago import MercadoPagoProvider, MercadoPagoError
        try:
            prov = MercadoPagoProvider(
                access_token=body.access_token,
                webhook_base_url="https://example.com",
                test_mode=body.test_mode,
            )
            info = await prov.probar_credenciales()
        except MercadoPagoError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error validando: {e}")
        return {
            "ok": True,
            "proveedor": "mercadopago",
            "cuenta": {
                "nickname": info.get("nickname"),
                "email": info.get("email"),
                "id": info.get("id"),
                "country_id": info.get("country_id"),
            },
        }
    raise HTTPException(status_code=400, detail=f"Proveedor no soportado aun: {body.proveedor}")


# ============================================================
# Endpoint para que la UI muestre el estado de pagos de una solicitud
# ============================================================

class SesionPagoResumen(BaseModel):
    session_id: str
    estado: str
    monto: str
    medio_pago: Optional[str] = None
    provider: str
    external_id: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None

    class Config:
        from_attributes = True


class EstadoPagoSolicitud(BaseModel):
    solicitud_id: int
    requiere_pago: bool
    costo: float
    pagado: bool                           # True si hay sesion APPROVED
    monto_pagado: Optional[str] = None     # monto de la sesion aprobada
    fecha_pago: Optional[str] = None       # ISO
    medio_pago: Optional[str] = None       # tarjeta, qr, efectivo_cupon, ...
    sesion_aprobada_id: Optional[str] = None
    intentos_total: int = 0
    intentos_fallidos: int = 0
    sesiones: List[SesionPagoResumen] = []


@router.get("/estado-solicitud/{solicitud_id}", response_model=EstadoPagoSolicitud)
async def estado_pago_solicitud(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resumen del estado de pago para una solicitud (info para el modal del admin)."""
    from models.tramite import Solicitud as _Sol
    sq = await db.execute(
        select(_Sol).options(selectinload(_Sol.tramite)).where(_Sol.id == solicitud_id)
    )
    sol = sq.scalar_one_or_none()
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    costo = float(sol.tramite.costo) if (sol.tramite and sol.tramite.costo) else 0.0
    requiere_pago = costo > 0

    pq = await db.execute(
        select(PagoSesion).where(PagoSesion.solicitud_id == solicitud_id)
        .order_by(PagoSesion.created_at.desc())
    )
    sesiones = pq.scalars().all()

    aprobada = next((s for s in sesiones if s.estado == EstadoSesionPago.APPROVED), None)
    fallidas = sum(1 for s in sesiones if s.estado in (EstadoSesionPago.REJECTED, EstadoSesionPago.EXPIRED, EstadoSesionPago.CANCELLED))

    sesiones_payload = [
        SesionPagoResumen(
            session_id=s.id,
            estado=s.estado.value if hasattr(s.estado, 'value') else str(s.estado),
            monto=str(s.monto),
            medio_pago=s.medio_pago.value if s.medio_pago and hasattr(s.medio_pago, 'value') else (str(s.medio_pago) if s.medio_pago else None),
            provider=s.provider,
            external_id=s.external_id,
            created_at=s.created_at.isoformat() if s.created_at else None,
            completed_at=s.completed_at.isoformat() if s.completed_at else None,
        )
        for s in sesiones
    ]

    return EstadoPagoSolicitud(
        solicitud_id=solicitud_id,
        requiere_pago=requiere_pago,
        costo=costo,
        pagado=aprobada is not None,
        monto_pagado=str(aprobada.monto) if aprobada else None,
        fecha_pago=aprobada.completed_at.isoformat() if aprobada and aprobada.completed_at else None,
        medio_pago=(aprobada.medio_pago.value if aprobada and aprobada.medio_pago and hasattr(aprobada.medio_pago, 'value') else None),
        sesion_aprobada_id=aprobada.id if aprobada else None,
        intentos_total=len(sesiones),
        intentos_fallidos=fallidas,
        sesiones=sesiones_payload,
    )
