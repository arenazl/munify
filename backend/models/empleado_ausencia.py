from sqlalchemy import Column, Integer, String, Boolean, Date, Text, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import date


class EmpleadoAusencia(Base):
    """Registro de ausencias de empleados (vacaciones, licencias, etc)"""
    __tablename__ = "empleado_ausencias"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False, index=True)

    tipo = Column(String(50), nullable=False)  # vacaciones, licencia_medica, etc
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    motivo = Column(Text, nullable=True)

    # Aprobacion
    aprobado = Column(Boolean, default=False)
    aprobado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_aprobacion = Column(Date, nullable=True)

    created_at = Column(Date, default=date.today)

    # Relaciones
    empleado = relationship("Empleado", back_populates="ausencias")
    aprobado_por = relationship("User", foreign_keys=[aprobado_por_id])
