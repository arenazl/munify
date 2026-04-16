"""Schemas pydantic para el modulo Tasas."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Any
from pydantic import BaseModel, Field

from models.tasas import CicloTasa, EstadoPartida, EstadoDeuda


# ==================== TipoTasa (catalogo maestro) ====================

class TipoTasaResponse(BaseModel):
    id: int
    codigo: str
    nombre: str
    descripcion: Optional[str] = None
    icono: str
    color: str
    ciclo: CicloTasa
    activo: bool
    orden: int

    class Config:
        from_attributes = True


# ==================== Partida ====================

class PartidaBase(BaseModel):
    tipo_tasa_id: int
    identificador: str = Field(..., max_length=80)
    titular_dni: Optional[str] = Field(None, max_length=20)
    titular_nombre: Optional[str] = Field(None, max_length=200)
    objeto: Optional[dict[str, Any]] = None


class PartidaCreate(PartidaBase):
    municipio_id: int
    titular_user_id: Optional[int] = None


class PartidaUpdate(BaseModel):
    titular_dni: Optional[str] = None
    titular_nombre: Optional[str] = None
    titular_user_id: Optional[int] = None
    objeto: Optional[dict[str, Any]] = None
    estado: Optional[EstadoPartida] = None


class PartidaResponse(BaseModel):
    id: int
    municipio_id: int
    tipo_tasa_id: int
    tipo_tasa: Optional[TipoTasaResponse] = None
    identificador: str
    titular_user_id: Optional[int] = None
    titular_dni: Optional[str] = None
    titular_nombre: Optional[str] = None
    objeto: Optional[dict[str, Any]] = None
    estado: EstadoPartida
    created_at: datetime
    # Resumen de deudas (opcional, se llena en endpoints de listado)
    deudas_pendientes: Optional[int] = 0
    monto_pendiente: Optional[Decimal] = Decimal("0.00")

    class Config:
        from_attributes = True


class PartidaBulkItem(PartidaBase):
    """Item para ingesta masiva via POST /tasas/partidas/bulk."""
    pass


class PartidaBulkRequest(BaseModel):
    municipio_id: int
    # Comportamiento: si una partida con el mismo (muni + tipo + identificador)
    # ya existe, se UPDATEA. Si no, se inserta.
    items: List[PartidaBulkItem]


class PartidaBulkResponse(BaseModel):
    creadas: int
    actualizadas: int
    errores: List[str] = []


# ==================== Deuda ====================

class DeudaBase(BaseModel):
    periodo: str = Field(..., max_length=20, description="ej '2026-04', '2026-Q1', '2026'")
    importe: Decimal
    importe_original: Optional[Decimal] = None
    recargo: Decimal = Decimal("0.00")
    descuento: Decimal = Decimal("0.00")
    fecha_emision: date
    fecha_vencimiento: date
    codigo_barras: Optional[str] = None
    observaciones: Optional[str] = None


class DeudaCreate(DeudaBase):
    partida_id: int


class DeudaBulkItem(DeudaBase):
    partida_identificador: str  # para resolver la partida


class DeudaBulkRequest(BaseModel):
    municipio_id: int
    tipo_tasa_id: int
    items: List[DeudaBulkItem]


class DeudaBulkResponse(BaseModel):
    creadas: int
    actualizadas: int
    errores: List[str] = []


class DeudaResponse(BaseModel):
    id: int
    partida_id: int
    periodo: str
    importe: Decimal
    importe_original: Optional[Decimal] = None
    recargo: Decimal
    descuento: Decimal
    fecha_emision: date
    fecha_vencimiento: date
    estado: EstadoDeuda
    fecha_pago: Optional[datetime] = None
    pago_externo_id: Optional[str] = None
    codigo_barras: Optional[str] = None
    observaciones: Optional[str] = None
    created_at: datetime
    # Datos denormalizados para listados del vecino
    tipo_tasa_nombre: Optional[str] = None
    partida_identificador: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Vistas agregadas ====================

class ResumenTasasVecino(BaseModel):
    """Resumen para la home del vecino — cuántas tasas debe y cuánto."""
    partidas_total: int
    deudas_pendientes: int
    deudas_vencidas: int
    monto_total_pendiente: Decimal
    proxima_vencimiento: Optional[date] = None
