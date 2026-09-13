"""Schemas de Personas: la libreta única y su catálogo de tipos con subtipos.

Plan: docs/tesoreria/04-plan-integral-persona-y-obras.md (F1) y 05 (subtipos).
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------- catálogo: Persona -> tipo -> subtipo ----------

class PersonaTipoBase(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=40)
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: int = 0
    cobra: bool = True
    activo: bool = True
    padre_id: Optional[int] = None


class PersonaTipoCreate(PersonaTipoBase):
    pass


class PersonaTipoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: Optional[int] = None
    cobra: Optional[bool] = None
    activo: Optional[bool] = None
    padre_id: Optional[int] = None


class PersonaTipoOut(PersonaTipoBase):
    id: int
    cantidad: int = 0                    # personas con este tipo (o subtipo)
    subtipos: List["PersonaTipoOut"] = []

    class Config:
        from_attributes = True


# ---------- la persona ----------

class PersonaRolOut(BaseModel):
    tipo_id: int
    codigo: str
    nombre: str
    padre_codigo: Optional[str] = None   # si es subtipo, el tipo del que cuelga
    principal: bool = False


class FichaLaboralOut(BaseModel):
    empleado_id: int
    modalidad: Optional[str] = None
    tipo_legacy: Optional[str] = None    # operario | administrativo (columna vieja)
    especialidad: Optional[str] = None
    dependencia: Optional[str] = None
    zona: Optional[str] = None
    cuadrillas: List[str] = []
    activo: bool = True


class EconomicaOut(BaseModel):
    gastos: int = 0
    total_gastos: Decimal = Decimal("0")
    pagos_programados_activos: int = 0
    ultimo_pago: Optional[datetime] = None


class AccesoOut(BaseModel):
    usuario_id: int
    email: Optional[str] = None
    rol: str
    activo: bool = True


class PersonaResumen(BaseModel):
    """Una fila de la lista."""
    id: int
    nombre: str
    apellido: Optional[str] = None
    nombre_completo: str
    dni: Optional[str] = None
    cuit: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    tipo_legacy: str                     # el enum viejo, espejo
    roles: List[PersonaRolOut] = []
    tiene_ficha_laboral: bool = False
    tiene_login: bool = False
    activo: bool = True
    created_at: Optional[datetime] = None


class PersonaFicha(PersonaResumen):
    """La ficha completa: identidad + sólo las secciones que la persona tiene."""
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    iibb: Optional[str] = None
    condicion_iva: Optional[str] = None
    codigo_tributario: Optional[str] = None
    alias_pago: Optional[str] = None
    notas: Optional[str] = None
    laboral: Optional[FichaLaboralOut] = None
    economica: Optional[EconomicaOut] = None
    acceso: Optional[AccesoOut] = None


class PersonaListado(BaseModel):
    items: List[PersonaResumen]
    total: int
    page: int
    page_size: int
    # KPIs del hero, sobre TODO el padrón del municipio (no sólo la página)
    total_personas: int = 0
    cobran_este_mes: int = 0
    trabajan: int = 0
    sin_documento: int = 0
    sin_tipo: int = 0                    # tipo "otro": lo que falta curar


class PersonaCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    apellido: Optional[str] = None
    dni: Optional[str] = None
    cuit: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    iibb: Optional[str] = None
    condicion_iva: Optional[str] = None
    codigo_tributario: Optional[str] = None
    alias_pago: Optional[str] = None
    notas: Optional[str] = None
    # Qué es: ids del catálogo (tipos o subtipos). El primero es el principal.
    tipo_ids: List[int] = Field(default_factory=list)
    # Sólo si es empleado: la ficha laboral se crea junto con la persona.
    modalidad: Optional[str] = None
    municipio_dependencia_id: Optional[int] = None


class PersonaUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    dni: Optional[str] = None
    cuit: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    iibb: Optional[str] = None
    condicion_iva: Optional[str] = None
    codigo_tributario: Optional[str] = None
    alias_pago: Optional[str] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None
    tipo_ids: Optional[List[int]] = None
    modalidad: Optional[str] = None
    municipio_dependencia_id: Optional[int] = None
