"""Schemas Pydantic para el catalogo de Retenciones."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class RetencionBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=200)
    porcentaje: Decimal = Field(..., ge=0, lt=100)
    color: Optional[str] = Field(None, max_length=20)
    orden: int = 0


class RetencionCreate(RetencionBase):
    pass


class RetencionUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=200)
    porcentaje: Optional[Decimal] = Field(None, ge=0, lt=100)
    color: Optional[str] = Field(None, max_length=20)
    orden: Optional[int] = None
    activo: Optional[bool] = None


class RetencionResponse(RetencionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime
