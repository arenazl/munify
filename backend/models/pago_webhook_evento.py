"""Bitacora de eventos webhook recibidos del provider (MP/MODO/GIRE).

Cada vez que el provider nos llama al endpoint de webhook, registramos
UN evento acá — se haya procesado bien o mal — para poder:

  1. Debugear firmas invalidas (firma_ok=false pero payload guardado).
  2. Evitar procesar dos veces el mismo evento (UNIQUE en provider+external_id+evento).
  3. Re-procesar manualmente si algo fallo (procesado_at NULL => pendiente).

El handler del webhook primero escribe acá y despues procesa — si el
INSERT falla por unique constraint ya sabemos que el evento es duplicado
y no hacemos nada.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, JSON,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class PagoWebhookEvento(Base):
    __tablename__ = "pago_webhook_eventos"

    id = Column(Integer, primary_key=True, index=True)

    # Identificadores del evento
    provider = Column(String(40), nullable=False)           # "mercadopago" / "modo" / "gire"
    external_id = Column(String(100), nullable=False)       # ID del pago en el provider
    evento = Column(String(60), nullable=False)             # "approved", "payment.updated", etc.

    # Link a nuestra sesion (si la podemos resolver). Nullable — si el evento
    # viene por un external_id que no conocemos, igual lo guardamos.
    session_id = Column(String(40), ForeignKey("pago_sesiones.id", ondelete="SET NULL"), nullable=True, index=True)

    # Payload crudo recibido del provider (para debug + reprocess).
    payload = Column(JSON, nullable=True)

    # Validacion de firma HMAC (si el provider la envia).
    firma_ok = Column(Boolean, nullable=False, default=False)

    # Cuando procesamos el evento correctamente (o NULL si pendiente).
    procesado_at = Column(DateTime(timezone=True), nullable=True)

    # Mensaje de error si el handler falló procesandolo.
    error = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    sesion = relationship("PagoSesion", foreign_keys=[session_id])

    __table_args__ = (
        UniqueConstraint("provider", "external_id", "evento", name="uq_pwe_dedup"),
        Index("ix_pwe_provider_external", "provider", "external_id"),
    )
