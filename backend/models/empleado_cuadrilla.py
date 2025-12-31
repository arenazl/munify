from sqlalchemy import Column, Integer, Boolean, Date, ForeignKey
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import date


class EmpleadoCuadrilla(Base):
    """Relacion entre empleados y cuadrillas (N:M)"""
    __tablename__ = "empleado_cuadrillas"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False, index=True)
    cuadrilla_id = Column(Integer, ForeignKey("cuadrillas.id", ondelete="CASCADE"), nullable=False, index=True)

    es_lider = Column(Boolean, default=False)  # Es el lider/encargado de la cuadrilla
    fecha_ingreso = Column(Date, default=date.today)
    activo = Column(Boolean, default=True)

    # Relaciones
    empleado = relationship("Empleado", back_populates="cuadrillas_asignadas")
    cuadrilla = relationship("Cuadrilla", back_populates="empleados_asignados")
