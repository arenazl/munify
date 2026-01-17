from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CategoriaSimple(BaseModel):
    id: int
    nombre: str
    color: Optional[str] = None
    icono: Optional[str] = None

    class Config:
        from_attributes = True

class EmpleadoCreate(BaseModel):
    nombre: str
    apellido: Optional[str] = None
    email: str  # Email para login
    password: str  # Password para login
    telefono: Optional[str] = None
    dni: Optional[str] = None
    descripcion: Optional[str] = None
    especialidad: Optional[str] = None
    tipo: str = "operario"  # operario | administrativo
    zona_id: Optional[int] = None
    capacidad_maxima: int = 10
    categoria_principal_id: Optional[int] = None
    categoria_ids: Optional[List[int]] = None

class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    descripcion: Optional[str] = None
    especialidad: Optional[str] = None
    tipo: Optional[str] = None  # operario | administrativo
    zona_id: Optional[int] = None
    capacidad_maxima: Optional[int] = None
    activo: Optional[bool] = None
    categoria_principal_id: Optional[int] = None
    categoria_ids: Optional[List[int]] = None

class MiembroSimple(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = ""
    email: str

    class Config:
        from_attributes = True

class EmpleadoResponse(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    descripcion: Optional[str] = None
    especialidad: Optional[str] = None
    tipo: Optional[str] = "operario"  # operario | administrativo
    zona_id: Optional[int] = None
    capacidad_maxima: int
    activo: bool
    created_at: datetime
    categoria_principal_id: Optional[int] = None
    categoria_principal: Optional[CategoriaSimple] = None
    categorias: List[CategoriaSimple] = []
    miembros: List[MiembroSimple] = []

    class Config:
        from_attributes = True


class HorarioSimple(BaseModel):
    dia_semana: int  # 0=Lunes, 6=Domingo
    hora_entrada: str
    hora_salida: str
    activo: bool = True

    class Config:
        from_attributes = True


class EmpleadoDisponibilidad(BaseModel):
    """Empleado con información de disponibilidad y horarios"""
    id: int
    nombre: str
    apellido: Optional[str] = None
    especialidad: Optional[str] = None
    tipo: str
    capacidad_maxima: int
    carga_actual: int  # Cantidad de trámites/reclamos pendientes
    disponibilidad: int  # capacidad_maxima - carga_actual
    porcentaje_ocupacion: float  # (carga_actual / capacidad_maxima) * 100
    horarios: List[HorarioSimple] = []
    horario_texto: str  # Ej: "Lun-Vie 8:00-16:00"

    class Config:
        from_attributes = True
