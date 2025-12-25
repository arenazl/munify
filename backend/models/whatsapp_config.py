"""
Modelos para configuración de WhatsApp
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime
import enum


class WhatsAppProvider(str, enum.Enum):
    """Proveedores de WhatsApp Business API"""
    META = "meta"  # Meta Cloud API (oficial)
    TWILIO = "twilio"  # Twilio WhatsApp API


class WhatsAppConfig(Base):
    """Configuración de WhatsApp por municipio"""
    __tablename__ = "whatsapp_configs"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), unique=True, nullable=False)

    # Estado general
    habilitado = Column(Boolean, default=False)

    # Proveedor
    provider = Column(SQLEnum(WhatsAppProvider), default=WhatsAppProvider.META)

    # Configuración Meta Cloud API
    meta_phone_number_id = Column(String(100), nullable=True)
    meta_access_token = Column(String(500), nullable=True)
    meta_business_account_id = Column(String(100), nullable=True)
    meta_webhook_verify_token = Column(String(100), nullable=True)

    # Configuración Twilio
    twilio_account_sid = Column(String(100), nullable=True)
    twilio_auth_token = Column(String(100), nullable=True)
    twilio_phone_number = Column(String(20), nullable=True)  # Número WhatsApp de Twilio

    # Configuración de notificaciones
    notificar_reclamo_recibido = Column(Boolean, default=True)
    notificar_reclamo_asignado = Column(Boolean, default=True)
    notificar_cambio_estado = Column(Boolean, default=True)
    notificar_reclamo_resuelto = Column(Boolean, default=True)
    notificar_comentarios = Column(Boolean, default=False)

    # Templates de mensajes (IDs de Meta o mensajes personalizados)
    template_reclamo_recibido = Column(String(100), nullable=True)
    template_reclamo_asignado = Column(String(100), nullable=True)
    template_cambio_estado = Column(String(100), nullable=True)
    template_reclamo_resuelto = Column(String(100), nullable=True)

    # Auditoría
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    municipio = relationship("Municipio", back_populates="whatsapp_config")
    logs = relationship("WhatsAppLog", back_populates="config", cascade="all, delete-orphan")


class WhatsAppLog(Base):
    """Log de mensajes enviados por WhatsApp"""
    __tablename__ = "whatsapp_logs"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("whatsapp_configs.id"), nullable=False)

    # Destinatario
    telefono = Column(String(20), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # Mensaje
    tipo_mensaje = Column(String(50), nullable=False)  # reclamo_recibido, cambio_estado, etc.
    mensaje = Column(Text, nullable=True)
    template_usado = Column(String(100), nullable=True)

    # Referencia
    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=True)

    # Estado de envío
    enviado = Column(Boolean, default=False)
    message_id = Column(String(100), nullable=True)  # ID del mensaje del proveedor
    error = Column(Text, nullable=True)

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    config = relationship("WhatsAppConfig", back_populates="logs")
    usuario = relationship("User")
    reclamo = relationship("Reclamo")
