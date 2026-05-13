"""Parajes: regiones del municipio (rurales/semi-rurales) que se usan
como ubicacion alternativa a la direccion en contactos.

Ejemplo: en San Pedro Norte, parajes como "Santa Rita", "Los Alamos",
"El Cerrito" — zonas donde no hay calles formales con numero.

Cada paraje tiene un poligono opcional pintado sobre el mapa (lista de
[lat, lon] como JSON) para visualizar el area. El centroide se calcula
del poligono cuando existe.

Relacion: contactos.paraje_id (FK, nullable) — un contacto puede tener
direccion exacta O paraje (alternativos).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey,
)
from sqlalchemy.sql import func
from core.database import Base


class TesoreriaParaje(Base):
    __tablename__ = "tesoreria_parajes"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    nombre = Column(String(100), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    icono = Column(String(60), nullable=True)

    # Poligono: JSON con lista de [lat, lon]. Nullable cuando todavia no
    # se dibujo el area en el mapa.
    poligono = Column(Text, nullable=True)
    # Centroide (cached, calculado del poligono al guardar).
    centro_lat = Column(Float, nullable=True)
    centro_lon = Column(Float, nullable=True)

    orden = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Paraje {self.id} muni={self.municipio_id} {self.nombre}>"
