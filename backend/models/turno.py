"""Modelo de Turno presencial vinculado a una Solicitud de tramite.

Si un tramite tiene `requiere_turno=True`, al crearse la solicitud el vecino
elige (o se le asigna) un slot de atencion en la dependencia responsable.

La disponibilidad se calcula dinamicamente a partir de:
  - Horarios de la dependencia (lun-vie 08:30-13:00 por default).
  - Duracion del slot (tramite.duracion_turno_min).
  - Turnos ya reservados en esa dependencia.

No hay tabla de "slots disponibles" — los slots se generan on-the-fly y se
restan los `turnos.fecha_hora` ya tomados.
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Turno(Base):
    __tablename__ = "turnos"

    id = Column(Integer, primary_key=True, index=True)

    solicitud_id = Column(
        Integer, ForeignKey("solicitudes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    municipio_dependencia_id = Column(
        Integer, ForeignKey("municipio_dependencias.id"),
        nullable=False, index=True,
    )
    municipio_id = Column(
        Integer, ForeignKey("municipios.id"),
        nullable=False, index=True,
    )

    fecha_hora = Column(DateTime, nullable=False)
    duracion_min = Column(Integer, nullable=False, default=30)

    # reservado | cumplido | cancelado | ausente
    estado = Column(String(20), nullable=False, default="reservado")
    notas = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    solicitud = relationship("Solicitud", backref="turno_unico", uselist=False)
    municipio_dependencia = relationship("MunicipioDependencia")

    __table_args__ = (
        Index("idx_dep_fecha", "municipio_dependencia_id", "fecha_hora"),
        Index("idx_muni_fecha", "municipio_id", "fecha_hora"),
    )
