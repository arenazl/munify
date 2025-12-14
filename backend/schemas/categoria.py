from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CategoriaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tiempo_resolucion_estimado: int = 48
    prioridad_default: int = 3

class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    tiempo_resolucion_estimado: Optional[int] = None
    prioridad_default: Optional[int] = None
    activo: Optional[bool] = None

class CategoriaResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str]
    icono: Optional[str]
    color: Optional[str]
    tiempo_resolucion_estimado: int
    prioridad_default: int
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True
