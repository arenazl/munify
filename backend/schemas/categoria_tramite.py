from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CategoriaTramiteCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    orden: int = 0


class CategoriaTramiteUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class CategoriaTramiteResponse(BaseModel):
    id: int
    municipio_id: int
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    orden: int
    activo: bool
    created_at: datetime
    # Cuantos tramites cuelgan de esta categoria. Ver el listado.
    en_uso: Optional[int] = None

    class Config:
        from_attributes = True
