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
from datetime import datetime, timedelta
from decimal import Decimal
from secrets import token_hex
from typing import Optional

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
    MedioPagoGateway,
)
from models.tasas import Deuda, EstadoDeuda, Pago, MedioPago as MedioPagoTasa, Partida
from services.pagos import get_provider


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
    comprobante: dict


# ============================================================
# Helpers
# ============================================================

def _generar_session_id() -> str:
    """ID publico no enumerable: PB-ABC123DEF456 (14 chars hex)."""
    return f"PB-{token_hex(7).upper()}"


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

    provider = get_provider()
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

    provider = get_provider()
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

    # Si es momento_pago=inicio, dejar el tramite en pendiente_pago hasta que se confirme
    if solicitud.tramite.momento_pago == "inicio" and solicitud.estado == EstadoSolicitud.RECIBIDO:
        solicitud.estado = EstadoSolicitud.PENDIENTE_PAGO

    await db.commit()

    return CrearSesionResponse(
        session_id=sesion_id,
        checkout_url=sesion_ext.checkout_url,
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

    provider = get_provider()
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
    # En el futuro: chequear sesion.solicitud.tramite.tipo_pago tambien

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

    # Si era pago de un tramite, avanzar el estado segun momento_pago
    if sesion.solicitud_id:
        from models.tramite import Solicitud, EstadoSolicitud
        sol_q = await db.execute(
            select(Solicitud).options(selectinload(Solicitud.tramite)).where(Solicitud.id == sesion.solicitud_id)
        )
        solicitud = sol_q.scalar_one_or_none()
        if solicitud and solicitud.tramite:
            momento = solicitud.tramite.momento_pago or "inicio"
            if momento == "inicio":
                # Pago al inicio: pasa de pendiente_pago/recibido a recibido (listo para que la dependencia lo tome)
                solicitud.estado = EstadoSolicitud.RECIBIDO
            elif momento == "fin":
                # Pago al final: la dependencia ya termino el trabajo, ahora se finaliza
                solicitud.estado = EstadoSolicitud.FINALIZADO

    await db.commit()

    return ConfirmarPagoResponse(
        session_id=sesion.id,
        estado=sesion.estado,
        external_id=sesion.external_id or "",
        comprobante={
            "concepto": sesion.concepto,
            "monto": str(sesion.monto),
            "medio_pago": body.medio_pago.value,
            "fecha": sesion.completed_at.isoformat() if sesion.completed_at else None,
            "numero_operacion": sesion.external_id,
            "provider": sesion.provider,
        },
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
    await db.commit()
    return {"estado": sesion.estado.value}
