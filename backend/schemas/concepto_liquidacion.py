"""Schemas para el catalogo de conceptos de liquidacion."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class ConceptoLiquidacionBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(None, max_length=20)
    icono: Optional[str] = Field(None, max_length=60)
    orden: int = 0


class ConceptoLiquidacionCreate(ConceptoLiquidacionBase):
    pass


class ConceptoLiquidacionUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(None, max_length=20)
    icono: Optional[str] = Field(None, max_length=60)
    orden: Optional[int] = None
    activo: Optional[bool] = None


class ConceptoLiquidacionResponse(ConceptoLiquidacionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    municipio_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime
