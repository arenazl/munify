"""Excepciones al calendario habitual de una dependencia, por fecha puntual.

    tipo='cierre'            -> NO atiende ese dia (feriado, receso).
    tipo='apertura_especial' -> atiende ese dia con horario override.

Los feriados son per-dependencia (no hay tabla global): los feriados municipales
argentinos varian entre munis. El override de horario usa Time (no string) para
no parsear formatos a mano -- correccion de la critica de diseno.
"""
from sqlalchemy import (
    Column, Integer, String, Date, Time, ForeignKey, DateTime, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class AgendaExcepcion(Base):
    __tablename__ = "agenda_excepciones"
    __table_args__ = (
        UniqueConstraint(
            "municipio_dependencia_id", "fecha", name="uq_excepcion_dep_fecha"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    municipio_id = Column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    municipio_dependencia_id = Column(
        Integer, ForeignKey("municipio_dependencias.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    fecha = Column(Date, nullable=False, index=True)
    # 'cierre' | 'apertura_especial'
    tipo = Column(String(20), nullable=False, default="cierre")
    motivo = Column(String(200), nullable=True)

    # Para apertura_especial: horario que rige ese dia (nullable = horario normal).
    hora_inicio_override = Column(Time, nullable=True)
    hora_fin_override = Column(Time, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    municipio_dependencia = relationship("MunicipioDependencia")
