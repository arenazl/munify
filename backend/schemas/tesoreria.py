"""Schemas Pydantic del modulo Tesoreria.

Cubre:
  - MunicipioModulo (feature flags)
  - Contacto (agenda)
  - Gasto + GastoCuota (registros y cuotas)
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Literal

from pydantic import BaseModel, Field, ConfigDict


# ============================================================
# Modulo (feature flag)
# ============================================================

class ModuloBase(BaseModel):
    modulo: str = Field(..., max_length=50, examples=["tesoreria"])
    activo: bool = True


class ModuloResponse(ModuloBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    municipio_id: int


# ============================================================
# Contacto
# ============================================================

TipoContactoStr = Literal[
    "concejal", "empleado", "profesional",
    "proveedor", "contratista", "beneficiario", "otro",
]


class ContactoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    apellido: Optional[str] = Field(None, max_length=100)
    dni: Optional[str] = Field(None, max_length=20)
    telefono: Optional[str] = Field(None, max_length=30)
    email: Optional[str] = Field(None, max_length=150)
    direccion: Optional[str] = Field(None, max_length=255)
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    alias_pago: Optional[str] = Field(None, max_length=60)
    tipo: TipoContactoStr = "beneficiario"
    subtipo: Optional[str] = Field(None, max_length=50)
    notas: Optional[str] = None


class ContactoCreate(ContactoBase):
    pass


class ContactoUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    apellido: Optional[str] = Field(None, max_length=100)
    dni: Optional[str] = Field(None, max_length=20)
    telefono: Optional[str] = Field(None, max_length=30)
    email: Optional[str] = Field(None, max_length=150)
    direccion: Optional[str] = Field(None, max_length=255)
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    alias_pago: Optional[str] = Field(None, max_length=60)
    tipo: Optional[TipoContactoStr] = None
    subtipo: Optional[str] = Field(None, max_length=50)
    notas: Optional[str] = None
    activo: Optional[bool] = None


class ContactoResponse(ContactoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime


# ============================================================
# Gasto + Cuota
# ============================================================

DestinoGastoStr = Literal["dependencia", "contacto"]
TipoFinanciacionStr = Literal["contado", "cuotas", "prestamo", "recurrente"]
FrecuenciaStr = Literal["semanal", "quincenal", "mensual", "bimestral", "trimestral", "anual"]
FormaPagoStr = Literal["efectivo", "transferencia", "cheque", "tarjeta", "mercadopago", "otro"]
EstadoCuotaStr = Literal["pendiente", "pagada", "vencida", "cancelada"]


class GastoCuotaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gasto_id: int
    numero: int
    monto: Decimal
    fecha_vencimiento: date
    fecha_pago: Optional[date]
    estado: EstadoCuotaStr
    forma_pago: Optional[FormaPagoStr]
    comprobante: Optional[str]
    notas: Optional[str]


class GastoCuotaPagarPayload(BaseModel):
    fecha_pago: Optional[date] = None  # default = hoy
    forma_pago: Optional[FormaPagoStr] = None
    comprobante: Optional[str] = None
    notas: Optional[str] = None


class GastoBase(BaseModel):
    destino_tipo: DestinoGastoStr
    destino_dependencia_id: Optional[int] = None
    destino_contacto_id: Optional[int] = None

    concepto: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None

    monto_pesos: Decimal = Field(..., gt=0)
    cotizacion_usd: Optional[Decimal] = Field(None, gt=0)

    fecha: date

    tipo_financiacion: TipoFinanciacionStr = "contado"
    forma_pago: FormaPagoStr = "transferencia"

    cuotas_total: Optional[int] = Field(None, ge=1, le=120)
    frecuencia: Optional[FrecuenciaStr] = None
    fecha_fin_recurrencia: Optional[date] = None


class GastoCreate(GastoBase):
    pass


class GastoUpdate(BaseModel):
    concepto: Optional[str] = Field(None, min_length=1, max_length=150)
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class GastoResponse(GastoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    municipio_id: int
    creador_id: int
    monto_usd: Optional[Decimal] = None
    activo: bool
    created_at: datetime
    updated_at: datetime
    cuotas: List[GastoCuotaResponse] = []


# ============================================================
# Cotizacion USD
# ============================================================

class CotizacionUSDResponse(BaseModel):
    fecha: date
    fuente: str           # "bluelytics" | "bcra" | "manual"
    blue_compra: Optional[Decimal] = None
    blue_venta: Optional[Decimal] = None
    oficial_compra: Optional[Decimal] = None
    oficial_venta: Optional[Decimal] = None
    # Valor sugerido para usar en gastos (promedio blue venta).
    valor_sugerido: Optional[Decimal] = None


# ============================================================
# Proyecciones (cobros futuros)
# ============================================================

class ProyeccionMes(BaseModel):
    anio: int
    mes: int
    total_pesos: Decimal
    total_usd: Optional[Decimal] = None
    cantidad_cuotas: int


class ProyeccionResponse(BaseModel):
    desde: date
    hasta: date
    total_pesos: Decimal
    cantidad_cuotas: int
    por_mes: List[ProyeccionMes]
