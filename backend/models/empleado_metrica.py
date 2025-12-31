from sqlalchemy import Column, Integer, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import date


class EmpleadoMetrica(Base):
    """Metricas de rendimiento mensual por empleado"""
    __tablename__ = "empleado_metricas"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False, index=True)

    # Periodo (primer dia del mes)
    periodo = Column(Date, nullable=False)

    # Metricas de reclamos
    reclamos_asignados = Column(Integer, default=0)
    reclamos_resueltos = Column(Integer, default=0)
    reclamos_rechazados = Column(Integer, default=0)

    # Tiempos (en minutos)
    tiempo_promedio_respuesta = Column(Integer, default=0)
    tiempo_promedio_resolucion = Column(Integer, default=0)

    # Calidad
    calificacion_promedio = Column(Float, default=0.0)  # 1-5 estrellas
    sla_cumplido_porcentaje = Column(Float, default=0.0)  # 0-100%

    created_at = Column(Date, default=date.today)

    # Relaciones
    empleado = relationship("Empleado", back_populates="metricas")
