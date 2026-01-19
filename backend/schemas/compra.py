from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class CompraCreate(BaseModel):
    municipio_id: int
    fecha: date
    activo: bool = True


class CompraUpdate(BaseModel):
    municipio_id: Optional[int] = None
    fecha: Optional[date] = None
    activo: Optional[bool] = None


class CompraResponse(BaseModel):
    id: int
    municipio_id: int
    fecha: date
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
