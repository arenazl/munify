"""Configuracion de horarios de atencion por dependencia x dia de semana,
para el calculo de disponibilidad de turnos.

Reemplaza las constantes hardcodeadas de turnos_tramite.py. Si una dependencia
NO tiene filas aca, el calculo de slots usa el fallback historico
(lun-vie 08:30-13:00), garantizando cero regresion.

HORARIO PARTIDO soportado: varias filas para el mismo (dependencia, dia_semana)
representan tramos distintos (ej. 08:00-12:00 y 16:00-20:00). Por eso NO hay
UNIQUE(dep, dia) -- la critica de diseno lo marco como limitacion a evitar.
"""
from sqlalchemy import Column, Integer, Boolean, Time, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class AgendaConfig(Base):
    __tablename__ = "agenda_configs"

    id = Column(Integer, primary_key=True, index=True)

    municipio_id = Column(
        Integer, ForeignKey("municipios.id"), nullable=False, index=True
    )
    municipio_dependencia_id = Column(
        Integer, ForeignKey("municipio_dependencias.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # 0=lunes ... 6=domingo (mismo convenio que el enum DiaSemana existente)
    dia_semana = Column(Integer, nullable=False)
    hora_inicio = Column(Time, nullable=False)
    hora_fin = Column(Time, nullable=False)

    # Turnos simultaneos por slot. 1 = comportamiento historico (1 por slot).
    cupo_max_por_slot = Column(Integer, nullable=False, default=1)
    activo = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    municipio_dependencia = relationship("MunicipioDependencia")

    __table_args__ = (
        Index("idx_agenda_dep_dia", "municipio_dependencia_id", "dia_semana"),
    )
