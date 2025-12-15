from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Zona(Base):
    __tablename__ = "zonas"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio", back_populates="zonas")

    nombre = Column(String(100), nullable=False)  # Removido unique=True para permitir mismo nombre en distintos municipios
    codigo = Column(String(20), unique=True, nullable=True)  # Código corto: "B01", "Z-CENTRO"
    descripcion = Column(Text, nullable=True)

    # Límites geográficos (opcional, para visualización en mapa)
    latitud_centro = Column(Float, nullable=True)
    longitud_centro = Column(Float, nullable=True)

    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    reclamos = relationship("Reclamo", back_populates="zona")
    empleados = relationship("Empleado", back_populates="zona_asignada")
