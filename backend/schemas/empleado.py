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
    descripcion: Optional[str] = None
    especialidad: Optional[str] = None
    zona_id: Optional[int] = None
    capacidad_maxima: int = 10
    categoria_principal_id: Optional[int] = None
    categoria_ids: Optional[List[int]] = None

class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    descripcion: Optional[str] = None
    especialidad: Optional[str] = None
    zona_id: Optional[int] = None
    capacidad_maxima: Optional[int] = None
    activo: Optional[bool] = None
    categoria_principal_id: Optional[int] = None
    categoria_ids: Optional[List[int]] = None

class MiembroSimple(BaseModel):
    id: int
    nombre: str
    apellido: str
    email: str

    class Config:
        from_attributes = True

class EmpleadoResponse(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None
    descripcion: Optional[str] = None
    especialidad: Optional[str] = None
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
