from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class PedidoCreate(BaseModel):
    municipio_id: int
    fecha: date
    activo: bool = True


class PedidoUpdate(BaseModel):
    municipio_id: Optional[int] = None
    fecha: Optional[date] = None
    activo: Optional[bool] = None


class PedidoResponse(BaseModel):
    id: int
    municipio_id: int
    fecha: date
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
