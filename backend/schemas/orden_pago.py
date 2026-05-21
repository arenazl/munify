"""Schemas Pydantic para Orden de Pago."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict

from models.orden_pago import EstadoOrdenPago


class OrdenPagoBase(BaseModel):
    destino_tipo: str = Field(..., pattern="^(contacto|dependencia)$")
    destino_contacto_id: Optional[int] = None
    destino_dependencia_id: Optional[int] = None

    concepto: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None
    monto_pesos: Decimal = Field(..., gt=0)

    caja_id: Optional[int] = None

    fecha_emision: date
    fecha_vencimiento: Optional[date] = None

    nro_factura: Optional[str] = Field(None, max_length=50)
    factura_url: Optional[str] = Field(None, max_length=500)

    notas: Optional[str] = None


class OrdenPagoCreate(OrdenPagoBase):
    pass


class OrdenPagoUpdate(BaseModel):
    """Solo permite editar OPs en estado pendiente (validado en endpoint)."""
    destino_tipo: Optional[str] = Field(None, pattern="^(contacto|dependencia)$")
    destino_contacto_id: Optional[int] = None
    destino_dependencia_id: Optional[int] = None
    concepto: Optional[str] = Field(None, min_length=1, max_length=150)
    descripcion: Optional[str] = None
    monto_pesos: Optional[Decimal] = Field(None, gt=0)
    caja_id: Optional[int] = None
    fecha_emision: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    nro_factura: Optional[str] = Field(None, max_length=50)
    factura_url: Optional[str] = Field(None, max_length=500)
    notas: Optional[str] = None


class OrdenPagoResponse(OrdenPagoBase):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    municipio_id: int
    numero: str
    estado: EstadoOrdenPago

    fecha_autorizacion: Optional[datetime] = None
    fecha_pago: Optional[datetime] = None
    fecha_anulacion: Optional[datetime] = None

    creador_id: int
    autorizado_por_id: Optional[int] = None
    anulado_por_id: Optional[int] = None

    gasto_id: Optional[int] = None
    motivo_anulacion: Optional[str] = None

    # Enriquecidos por el endpoint (no estan en la DB):
    contacto_nombre: Optional[str] = None
    dependencia_nombre: Optional[str] = None
    caja_nombre: Optional[str] = None
    creador_nombre: Optional[str] = None
    autorizado_por_nombre: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class AnularRequest(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=500)


class PagarOPRequest(BaseModel):
    """Body del POST /ordenes-pago/{id}/pagar.

    Si caja_id NO viene, se usa la caja_id de la OP (si la tiene).
    Si tampoco, falla con 422.
    fecha_pago default = hoy.
    """
    caja_id: Optional[int] = None
    fecha_pago: Optional[date] = None
    forma_pago: Optional[str] = None
