"""
Schemas de WhatsApp para validación y serialización
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class WhatsAppProviderEnum(str, Enum):
    META = "meta"
    TWILIO = "twilio"


# === Schemas de Configuración ===

class WhatsAppConfigBase(BaseModel):
    """Base para configuración de WhatsApp"""
    habilitado: bool = False
    provider: WhatsAppProviderEnum = WhatsAppProviderEnum.META

    # Meta Cloud API
    meta_phone_number_id: Optional[str] = None
    meta_access_token: Optional[str] = None
    meta_business_account_id: Optional[str] = None
    meta_webhook_verify_token: Optional[str] = None

    # Twilio
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None

    # Notificaciones
    notificar_reclamo_recibido: bool = True
    notificar_reclamo_asignado: bool = True
    notificar_cambio_estado: bool = True
    notificar_reclamo_resuelto: bool = True
    notificar_comentarios: bool = False

    # Templates
    template_reclamo_recibido: Optional[str] = None
    template_reclamo_asignado: Optional[str] = None
    template_cambio_estado: Optional[str] = None
    template_reclamo_resuelto: Optional[str] = None


class WhatsAppConfigCreate(WhatsAppConfigBase):
    """Schema para crear configuración"""
    pass


class WhatsAppConfigUpdate(BaseModel):
    """Schema para actualizar configuración (todos campos opcionales)"""
    habilitado: Optional[bool] = None
    provider: Optional[WhatsAppProviderEnum] = None

    meta_phone_number_id: Optional[str] = None
    meta_access_token: Optional[str] = None
    meta_business_account_id: Optional[str] = None
    meta_webhook_verify_token: Optional[str] = None

    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None

    notificar_reclamo_recibido: Optional[bool] = None
    notificar_reclamo_asignado: Optional[bool] = None
    notificar_cambio_estado: Optional[bool] = None
    notificar_reclamo_resuelto: Optional[bool] = None
    notificar_comentarios: Optional[bool] = None

    template_reclamo_recibido: Optional[str] = None
    template_reclamo_asignado: Optional[str] = None
    template_cambio_estado: Optional[str] = None
    template_reclamo_resuelto: Optional[str] = None


class WhatsAppConfigResponse(WhatsAppConfigBase):
    """Schema de respuesta con datos de configuración"""
    id: int
    municipio_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class WhatsAppConfigPublic(BaseModel):
    """Schema público (sin credenciales sensibles)"""
    id: int
    municipio_id: int
    habilitado: bool
    provider: WhatsAppProviderEnum

    # Solo indicamos si están configuradas, no mostramos los valores
    meta_configurado: bool = False
    twilio_configurado: bool = False

    notificar_reclamo_recibido: bool
    notificar_reclamo_asignado: bool
    notificar_cambio_estado: bool
    notificar_reclamo_resuelto: bool
    notificar_comentarios: bool

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# === Schemas de Logs ===

class WhatsAppLogBase(BaseModel):
    """Base para log de WhatsApp"""
    telefono: str
    tipo_mensaje: str
    mensaje: Optional[str] = None
    template_usado: Optional[str] = None
    reclamo_id: Optional[int] = None


class WhatsAppLogCreate(WhatsAppLogBase):
    """Schema para crear log"""
    usuario_id: Optional[int] = None


class WhatsAppLogResponse(WhatsAppLogBase):
    """Schema de respuesta de log"""
    id: int
    config_id: int
    usuario_id: Optional[int] = None
    enviado: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# === Schemas de Test ===

class WhatsAppTestMessage(BaseModel):
    """Schema para enviar mensaje de prueba"""
    telefono: str = Field(..., description="Número de teléfono con código de país (ej: +5491155551234)")
    mensaje: Optional[str] = Field(None, description="Mensaje personalizado (opcional)")


class WhatsAppTestResponse(BaseModel):
    """Respuesta de mensaje de prueba"""
    success: bool
    message: str
    message_id: Optional[str] = None
    error: Optional[str] = None


# === Schemas de Webhook ===

class WhatsAppWebhookVerify(BaseModel):
    """Schema para verificación de webhook de Meta"""
    hub_mode: str = Field(..., alias="hub.mode")
    hub_verify_token: str = Field(..., alias="hub.verify_token")
    hub_challenge: str = Field(..., alias="hub.challenge")


class WhatsAppIncomingMessage(BaseModel):
    """Schema para mensaje entrante de WhatsApp"""
    from_number: str
    message_id: str
    timestamp: str
    text: Optional[str] = None
    type: str  # text, image, document, etc.


# === Schemas de Estadísticas ===

class WhatsAppStats(BaseModel):
    """Estadísticas de WhatsApp"""
    total_enviados: int = 0
    total_fallidos: int = 0
    enviados_hoy: int = 0
    enviados_semana: int = 0
    por_tipo: dict = {}  # {"reclamo_recibido": 10, "cambio_estado": 5, ...}
