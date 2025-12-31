from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import date


class EmpleadoCapacitacion(Base):
    """Capacitaciones y certificaciones de empleados"""
    __tablename__ = "empleado_capacitaciones"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False, index=True)

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    institucion = Column(String(200), nullable=True)

    fecha_inicio = Column(Date, nullable=True)
    fecha_fin = Column(Date, nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)  # Para certificaciones que vencen

    certificado_url = Column(String(500), nullable=True)

    created_at = Column(Date, default=date.today)

    # Relaciones
    empleado = relationship("Empleado", back_populates="capacitaciones")
