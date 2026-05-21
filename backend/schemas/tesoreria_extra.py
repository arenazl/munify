"""Schemas Pydantic para los modelos extra de Tesoreria:
TipoEmpleado, Caja, MovimientoCaja, PagoProgramado, Premio.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict

from models.tesoreria_extra import TipoMovimientoCaja, FrecuenciaPago


# ============================================================
# Premio (catalogo global de plus/bonificaciones variables)
# ============================================================

class PremioBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    monto: Decimal = Field(..., ge=0)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: int = 0


class PremioCreate(PremioBase):
    pass


class PremioUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    monto: Optional[Decimal] = Field(None, ge=0)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class PremioResponse(PremioBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime


# ============================================================
# Ejecutar pago programado (con monto custom + premios)
# ============================================================

class PremioAplicado(BaseModel):
    """Item de premio que se aplico en este pago. Snapshoteamos el monto al
    momento del pago para que si despues se edita el catalogo, el historico
    no cambie."""
    premio_id: int
    monto: Decimal


class EjecutarPagoRequest(BaseModel):
    """Body del POST /agenda/{id}/ejecutar.

    Si `monto_base` viene, sobrescribe el monto del pago programado para
    este pago especifico (ej. sueldo de este mes distinto al base). Los
    `premios` son IDs del catalogo de TesoreriaPremio que se aplican
    este mes. El total = monto_base + sum(premios.monto).
    """
    fecha_pago: Optional[date] = None
    monto_base: Optional[Decimal] = Field(None, gt=0)
    premio_ids: List[int] = []
    notas: Optional[str] = None


class EjecutarPagoResponse(BaseModel):
    ok: bool
    gasto_id: int
    monto_total: Decimal
    monto_base: Decimal
    premios_aplicados: List[PremioAplicado] = []
    proximo_pago: Optional[str] = None


# ============================================================
# TipoEmpleado
# ============================================================

class TipoEmpleadoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: int = 0


class TipoEmpleadoCreate(TipoEmpleadoBase):
    pass


class TipoEmpleadoUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class TipoEmpleadoResponse(TipoEmpleadoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    municipio_id: int
    activo: bool
    cantidad_empleados: Optional[int] = None
    created_at: datetime
    updated_at: datetime


# ============================================================
# Caja
# ============================================================

class CajaBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=80)
    codigo: Optional[str] = Field(None, max_length=30)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    saldo_inicial: Decimal = Decimal(0)
    fecha_apertura: Optional[date] = None
    orden: int = 0


class CajaCreate(CajaBase):
    pass


class CajaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=80)
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    saldo_inicial: Optional[Decimal] = None
    fecha_apertura: Optional[date] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class CajaResponse(CajaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime
    # Calculados:
    total_ingresos: Optional[Decimal] = None
    total_egresos: Optional[Decimal] = None
    saldo_actual: Optional[Decimal] = None


# ============================================================
# Movimiento de caja
# ============================================================

class MovimientoCajaBase(BaseModel):
    caja_id: int
    tipo: TipoMovimientoCaja
    monto: Decimal = Field(..., gt=0)
    fecha: date
    concepto: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None


class MovimientoCajaCreate(MovimientoCajaBase):
    pass


class MovimientoCajaResponse(MovimientoCajaBase):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: int
    municipio_id: int
    gasto_id: Optional[int] = None
    caja_nombre: Optional[str] = None
    created_at: datetime


# ============================================================
# Pago programado
# ============================================================

class PagoProgramadoBase(BaseModel):
    contacto_id: int
    caja_id: Optional[int] = None
    concepto: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None
    monto_pesos: Decimal = Field(..., gt=0)
    forma_pago: str = "transferencia"
    frecuencia: FrecuenciaPago = FrecuenciaPago.MENSUAL
    dia_del_mes: int = Field(1, ge=1, le=28)
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    notas: Optional[str] = None


class PagoProgramadoCreate(PagoProgramadoBase):
    pass


class PagoProgramadoUpdate(BaseModel):
    contacto_id: Optional[int] = None
    caja_id: Optional[int] = None
    concepto: Optional[str] = None
    descripcion: Optional[str] = None
    monto_pesos: Optional[Decimal] = None
    forma_pago: Optional[str] = None
    frecuencia: Optional[FrecuenciaPago] = None
    dia_del_mes: Optional[int] = Field(None, ge=1, le=28)
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    proximo_pago: Optional[date] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None


class PagoProgramadoResponse(PagoProgramadoBase):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: int
    municipio_id: int
    proximo_pago: date
    ultimo_pago: Optional[date] = None
    activo: bool
    contacto_nombre: Optional[str] = None
    caja_nombre: Optional[str] = None
    created_at: datetime
    updated_at: datetime
