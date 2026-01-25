"""
Modelo de Barrio - Datos geográficos de barrios/localidades de un municipio.
Se llenan automáticamente con IA al crear el municipio.
Usado para métricas y análisis.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Barrio(Base):
    """
    Barrios/localidades de un municipio.
    Se cargan automáticamente via IA (Gemini) al crear el municipio.
    """
    __tablename__ = "barrios"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    nombre = Column(String(200), nullable=False)

    # Coordenadas (pueden ser NULL si Nominatim no las encontró)
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)

    # Info adicional de Nominatim
    display_name = Column(Text, nullable=True)  # Dirección completa
    tipo = Column(String(100), nullable=True)  # suburb, village, town, etc.
    importancia = Column(Float, nullable=True)  # Score de Nominatim

    # Estado de validación
    validado = Column(Boolean, default=False)  # True si Nominatim encontró coordenadas

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="barrios")

    def __repr__(self):
        return f"<Barrio {self.nombre} ({self.municipio_id})>"
