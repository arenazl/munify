from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ZonaCreate(BaseModel):
    nombre: str
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    latitud_centro: Optional[float] = None
    longitud_centro: Optional[float] = None

class ZonaUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    latitud_centro: Optional[float] = None
    longitud_centro: Optional[float] = None
    activo: Optional[bool] = None

class ZonaResponse(BaseModel):
    id: int
    nombre: str
    codigo: Optional[str]
    descripcion: Optional[str]
    latitud_centro: Optional[float]
    longitud_centro: Optional[float]
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True
