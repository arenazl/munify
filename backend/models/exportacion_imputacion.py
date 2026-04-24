"""Registro de exportaciones batch de pagos (Fase 4 bundle).

Cada vez que contaduria baja un archivo para importar en RAFAM u otro
sistema contable, dejamos una fila aca con quien lo pidio, rango, formato
y los session_ids incluidos. El archivo se regenera on-demand (no lo
almacenamos en blob).
"""
from sqlalchemy import (
    Column, Integer, String, DateTime, Date, ForeignKey, JSON, Numeric, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class ExportacionImputacion(Base):
    __tablename__ = "exportaciones_imputacion"

    id = Column(Integer, primary_key=True, index=True)

    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False)
    formato = Column(String(40), nullable=False)  # "rafam_ba" | "csv" | "json"

    fecha_desde = Column(Date, nullable=True)
    fecha_hasta = Column(Date, nullable=True)

    cantidad_pagos = Column(Integer, nullable=False, default=0)
    monto_total = Column(Numeric(14, 2), nullable=False, default=0)

    # Lista de PagoSesion.id incluidos en el archivo (para regenerar exacto).
    session_ids = Column(JSON, nullable=True)

    # Filtros usados al generar (para poder re-ejecutar si hace falta).
    filtros = Column(JSON, nullable=True)

    generado_por_usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    generado_por = relationship("User", foreign_keys=[generado_por_usuario_id])
    municipio = relationship("Municipio")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_ei_muni_fecha", "municipio_id", "created_at"),
    )
