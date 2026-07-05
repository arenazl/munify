"""Puntos de Interés (POI) — F6 · Etapa B.

Dos entidades, mismo criterio que las categorías de reclamo / tipos de OT
(catálogo per-muni + template idempotente):

  - PoiTipo:      catálogo configurable por municipio (Hospital, Escuela,
                  Bomberos, ...). Define icono/color y un radio default opcional.
  - PuntoInteres: el POI concreto ubicado en el mapa (lat/long + radio en
                  metros). Los reclamos/OTs que caen dentro del radio se
                  vinculan por `poi_id` y se recomiendan para consolidar en
                  una OT de zona (prioridad alta).

Opt-in por `municipio_modulos.modulo = 'poi'`. 100% aditivo.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, Float,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class PoiTipo(Base):
    """Tipo de punto de interés por municipio (catálogo configurable — template).

    Mismo patrón que OrdenTrabajoTipo: se siembra un set genérico (Hospital,
    Escuela, Bomberos, ...) que el municipio customiza. `radio_default_metros`
    es el radio sugerido al crear un POI de este tipo (editable por POI).
    """
    __tablename__ = "poi_tipos"
    __table_args__ = (
        UniqueConstraint("municipio_id", "nombre", name="uq_poi_tipo_muni_nombre"),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String(100), nullable=False)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)
    # Radio sugerido (m) al crear un POI de este tipo. NULL = usar el default global (2.000 m).
    radio_default_metros = Column(Integer, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PuntoInteres(Base):
    """Punto de interés concreto ubicado en el mapa (radio circular en metros).

    Los reclamos activos con coords que caen dentro de `radio_metros` se
    vinculan (`reclamo.poi_id`) y se pueden consolidar en una OT de zona
    (`ordenes_trabajo.poi_id`, origen='consolidada_poi', prioridad alta).
    """
    __tablename__ = "puntos_interes"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id", ondelete="CASCADE"), nullable=False, index=True)
    # ON DELETE RESTRICT: no se borra un tipo con POIs asociados (borrado inteligente en el router).
    tipo_id = Column(Integer, ForeignKey("poi_tipos.id", ondelete="RESTRICT"), nullable=False, index=True)
    tipo = relationship("PoiTipo")

    nombre = Column(String(100), nullable=False)
    direccion = Column(String(255), nullable=True)
    latitud = Column(Float, nullable=False)
    longitud = Column(Float, nullable=False)
    # Radio de influencia (m). Default 2.000 (D15); editable por POI (100–10.000).
    radio_metros = Column(Integer, nullable=False, default=2000)
    activo = Column(Boolean, default=True, nullable=False)
    notas = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
