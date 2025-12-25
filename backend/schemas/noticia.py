from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class NoticiaBase(BaseModel):
    titulo: str
    descripcion: str
    imagen_url: Optional[str] = None

class NoticiaCreate(NoticiaBase):
    municipio_id: int

class NoticiaUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    activo: Optional[bool] = None

class NoticiaResponse(NoticiaBase):
    id: int
    municipio_id: int
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True
