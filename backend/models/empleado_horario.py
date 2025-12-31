from sqlalchemy import Column, Integer, Boolean, Time, ForeignKey, Enum
from sqlalchemy.orm import relationship
from core.database import Base
from .enums import DiaSemana


class EmpleadoHorario(Base):
    """Horario de trabajo por dia de semana para cada empleado"""
    __tablename__ = "empleado_horarios"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False, index=True)

    dia_semana = Column(Integer, nullable=False)  # 0=Lunes, 6=Domingo
    hora_entrada = Column(Time, nullable=False)
    hora_salida = Column(Time, nullable=False)
    activo = Column(Boolean, default=True)  # Trabaja ese dia?

    # Relaciones
    empleado = relationship("Empleado", back_populates="horarios")
