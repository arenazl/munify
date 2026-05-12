"""Schemas Pydantic del modulo Tesoreria.

Cubre:
  - MunicipioModulo (feature flags)
  - Contacto (agenda)
  - Gasto + GastoCuota (registros y cuotas)
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, field_validator

from models.contacto import TipoContacto
from models.gasto import (
    DestinoGasto, TipoFinanciacion, FrecuenciaRecurrencia,
    FormaPago, EstadoGastoCuota,
)
from models.proyecto import EstadoProyecto


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

# Alias para retrocompatibilidad — usar los Enum directamente.
TipoContactoStr = TipoContacto


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
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime


# ============================================================
# Gasto + Cuota
# ============================================================

DestinoGastoStr = DestinoGasto
TipoFinanciacionStr = TipoFinanciacion
FrecuenciaStr = FrecuenciaRecurrencia
FormaPagoStr = FormaPago
EstadoCuotaStr = EstadoGastoCuota


class GastoCuotaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

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


class GastoProyectoAssignment(BaseModel):
    """Imputacion del gasto a un proyecto (parcial o total)."""
    proyecto_id: int
    monto_asignado: Decimal = Field(..., gt=0)


class GastoProyectoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    proyecto_id: int
    proyecto_nombre: str
    monto_asignado: Decimal


class GastoBase(BaseModel):
    destino_tipo: DestinoGastoStr
    destino_dependencia_id: Optional[int] = None
    destino_contacto_id: Optional[int] = None

    concepto: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None

    monto_pesos: Decimal = Field(..., gt=0)
    cotizacion_usd: Optional[Decimal] = Field(None, gt=0)

    fecha: date

    tipo_financiacion: TipoFinanciacionStr = "contado"
    forma_pago: FormaPagoStr = "transferencia"

    cuotas_total: Optional[int] = Field(None, ge=1, le=120)
    frecuencia: Optional[FrecuenciaStr] = None
    fecha_fin_recurrencia: Optional[date] = None


class GastoCreate(GastoBase):
    # Imputaciones opcionales a proyectos. La suma de monto_asignado
    # debe ser <= monto_pesos (validado en el endpoint).
    proyectos: List[GastoProyectoAssignment] = []


class GastoUpdate(BaseModel):
    concepto: Optional[str] = Field(None, min_length=1, max_length=150)
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    activo: Optional[bool] = None
    # Si se manda, reemplaza las imputaciones existentes. Si se omite,
    # quedan como estaban.
    proyectos: Optional[List[GastoProyectoAssignment]] = None


class GastoResponse(GastoBase):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    municipio_id: int
    creador_id: int
    monto_usd: Optional[Decimal] = None
    activo: bool
    created_at: datetime
    updated_at: datetime
    cuotas: List[GastoCuotaResponse] = []
    proyectos: List[GastoProyectoResponse] = []


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
    # NUEVO: cuotas con estado VENCIDA (fecha_vencimiento ya paso). Default 0
    # asi callers viejos que construyen ProyeccionMes a mano no se rompen.
    cuotas_vencidas: int = 0


class DesgloseTipoFinanciacion(BaseModel):
    """Desglose de la proyeccion por tipo de financiacion (cuotas/prestamo/recurrente)."""
    tipo: str  # valor del enum TipoFinanciacion en string
    total_pesos: Decimal
    cantidad_cuotas: int


class ProyeccionResponse(BaseModel):
    desde: date
    hasta: date
    total_pesos: Decimal
    cantidad_cuotas: int
    cuotas_vencidas: int = 0
    # Mes con mayor total_pesos dentro del rango (None si por_mes esta vacio).
    mes_pico: Optional[ProyeccionMes] = None
    por_mes: List[ProyeccionMes]
    desglose_por_tipo: List[DesgloseTipoFinanciacion] = []


class CuotaProyeccionResponse(BaseModel):
    """Detalle de una cuota individual en el drill-down de proyecciones."""
    cuota_id: int
    gasto_id: int
    concepto: str
    contacto_nombre: Optional[str] = None
    dependencia_nombre: Optional[str] = None
    monto: Decimal
    fecha_vencimiento: date
    estado: str
    numero_cuota: int
    total_cuotas: Optional[int] = None
    tipo_financiacion: str


# ============================================================
# Proyecto (control de obras / iniciativas con varios gastos)
# ============================================================

EstadoProyectoStr = EstadoProyecto


class ProyectoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None
    presupuesto: Optional[Decimal] = Field(None, gt=0)
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    estado: EstadoProyectoStr = "activo"


class ProyectoCreate(ProyectoBase):
    pass


class ProyectoUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=150)
    descripcion: Optional[str] = None
    presupuesto: Optional[Decimal] = Field(None, gt=0)
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    estado: Optional[EstadoProyectoStr] = None
    activo: Optional[bool] = None


class ProyectoResumen(BaseModel):
    """Suma de imputaciones del proyecto y cantidad de gastos vinculados."""
    total_imputado: Decimal
    cantidad_gastos: int
    porcentaje_presupuesto: Optional[float] = None  # null si no hay presupuesto


class ProyectoResponse(ProyectoBase):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime
    resumen: Optional[ProyectoResumen] = None
