"""
Modelo de Barrio - Datos geográficos de barrios/localidades de un municipio.
Se llenan automáticamente con IA al crear el municipio.
Usado para métricas y análisis.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import deferred, relationship
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

    # La zona (unidad operativa) a la que pertenece el barrio: es la jerarquía
    # municipio -> zona -> barrio que dibuja `api/zonas.py::regiones_mapa`. La
    # columna ya existía en la base (QA y prod); faltaba en el modelo, y por eso
    # los barrios de las demos nacían huérfanos de zona.
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True, index=True)

    # Contorno del barrio ([[lat, lng], ...] en JSON) y su id en OSM. Los
    # escribe el alta de la demo (paquete offline) y los lee
    # `api/zonas.py::regiones_mapa` por SQL. `deferred`: el polígono pesa y el
    # listado de barrios no lo necesita — se carga sólo si alguien lo pide.
    osm_id = Column(String(40), nullable=True)
    poligono = deferred(Column(Text, nullable=True))

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="barrios")

    def __repr__(self):
        return f"<Barrio {self.nombre} ({self.municipio_id})>"
