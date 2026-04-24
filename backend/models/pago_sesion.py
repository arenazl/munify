"""Modelo de sesion de pago para el gateway PayBridge (mock de cobros externo).

Una PagoSesion representa un intento de pago de una Deuda (o en el futuro una
Solicitud de tramite con costo). El flow:

  1. Munify crea una PagoSesion vinculada a una Deuda (estado=pending).
  2. Redirige al vecino al checkout PayBridge con el session_id.
  3. Vecino elige medio de pago + confirma.
  4. PayBridge actualiza la sesion a 'approved' y notifica a Munify.
  5. Munify marca la Deuda como PAGADA y registra el Pago.

El provider se intercambia (mock/gire/mercadopago) via env var sin cambiar
este modelo. La sesion es el contrato interno, independiente del rail real.
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Numeric, JSON, Index,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class EstadoSesionPago(str, enum.Enum):
    PENDING = "pending"          # recien creada, aun no inicio el checkout
    IN_CHECKOUT = "in_checkout"  # el vecino esta en la pantalla de PayBridge
    APPROVED = "approved"        # pago confirmado
    REJECTED = "rejected"        # pago rechazado (tarjeta invalida, etc)
    EXPIRED = "expired"          # pasaron 30 min sin confirmar
    CANCELLED = "cancelled"      # el vecino cancelo


class EstadoImputacion(str, enum.Enum):
    """Estado de la imputacion contable del pago en el sistema del muni (RAFAM).

    Relevante solo para sesiones APPROVED. El vecino ya pago — lo que
    trackea este campo es si Contaduria/Tesoreria cargo el asiento en
    su sistema tributario interno.
    """
    NO_APLICA = "no_aplica"                      # pago no requiere imputacion (ej: tramite 100% digital sin contrapartida contable)
    PENDIENTE = "pendiente"                      # default — aprobado pero nadie lo cargo aun en RAFAM
    IMPUTADO = "imputado"                        # contaduria lo cargo + dejo referencia externa
    RECHAZADO_IMPUTACION = "rechazado_imputacion"  # contaduria no pudo imputarlo; queda visible para retry


class MedioPagoGateway(str, enum.Enum):
    TARJETA = "tarjeta"                    # credito/debito
    QR = "qr"                              # QR interoperable (tipo MODO/MP/BNA)
    EFECTIVO_CUPON = "efectivo_cupon"      # cupon con codigo barras, se paga en Rapipago/Pago Facil/etc
    TRANSFERENCIA = "transferencia"        # CBU/CVU
    DEBITO_AUTOMATICO = "debito_automatico"  # adhesion via CBU
    EFECTIVO_VENTANILLA = "efectivo_ventanilla"  # caja del muni — Fase 8 bundle pagos


class PagoSesion(Base):
    __tablename__ = "pago_sesiones"

    # ID publico en formato UUID-like (ej "PB-A3F2B1C4E5D6") para que
    # no se pueda enumerar en la URL del checkout.
    id = Column(String(40), primary_key=True)

    # Qué esta pagando esta sesion. Hoy solo Deuda de Tasas, pero en el
    # futuro tambien una Solicitud de tramite con costo (dejamos los dos
    # campos opcionales para no re-migrar).
    deuda_id = Column(Integer, ForeignKey("tasas_deudas.id"), nullable=True, index=True)
    solicitud_id = Column(Integer, ForeignKey("solicitudes.id"), nullable=True, index=True)

    # Contexto
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    vecino_user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)

    # Datos del pago
    concepto = Column(String(200), nullable=False)  # "ABL - Pilar - Abril 2026"
    monto = Column(Numeric(12, 2), nullable=False)

    estado = Column(
        SQLEnum(EstadoSesionPago, values_callable=lambda x: [e.value for e in x]),
        default=EstadoSesionPago.PENDING,
        nullable=False,
        index=True,
    )
    medio_pago = Column(
        SQLEnum(MedioPagoGateway, values_callable=lambda x: [e.value for e in x]),
        nullable=True,  # se completa cuando el vecino elige
    )

    # Provider (mock / gire / mercadopago)
    provider = Column(String(40), nullable=False, default="mock")
    # ID de la transaccion del provider externo (en mock lo generamos nosotros)
    external_id = Column(String(100), nullable=True, index=True)

    # URLs
    return_url = Column(String(500), nullable=True)  # a donde volver post-pago
    checkout_url = Column(String(500), nullable=True)  # URL del checkout del provider

    # Auditoria + data cruda del provider (payload webhook, response crear-sesion, etc)
    metadatos = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # CUT (Codigo Unico de Tramite) — hash corto humanamente dictable que
    # el operador de ventanilla escanea/tipea para verificar el pago.
    # Ej: "CUT-A3F2B1". Se genera al pasar a APPROVED.
    codigo_cut_qr = Column(String(30), nullable=True, unique=True, index=True)

    # Imputacion contable (ver EstadoImputacion). Se popula al aprobar.
    imputacion_estado = Column(
        SQLEnum(EstadoImputacion, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        index=True,
    )
    imputado_at = Column(DateTime(timezone=True), nullable=True)
    imputado_por_usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    imputacion_observacion = Column(String(500), nullable=True)
    imputacion_referencia_externa = Column(String(100), nullable=True)  # N° asiento RAFAM

    # Canal (Fase 6 bundle) — omnicanalidad: distingue pagos iniciados en
    # app vs ventanilla asistida vs whatsapp. Feeds el dashboard F9.
    canal = Column(String(30), nullable=True)
    operador_user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # Relaciones
    deuda = relationship("Deuda")
    municipio = relationship("Municipio")
    vecino = relationship("User", foreign_keys=[vecino_user_id])
    imputado_por = relationship("User", foreign_keys=[imputado_por_usuario_id])

    __table_args__ = (
        Index("ix_pago_sesiones_vecino_estado", "vecino_user_id", "estado"),
        Index("ix_pago_sesiones_imputacion", "municipio_id", "imputacion_estado", "completed_at"),
    )
