from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from core.database import Base


class CategoriaReclamoSugerida(Base):
    """
    Catálogo global de categorías de reclamo sugeridas para el autocomplete
    del wizard admin.

    Cross-municipio: no tiene `municipio_id`. Se siembra una sola vez al
    bootstrap del sistema con las ~20 categorías típicas de municipios
    argentinos. Cuando un admin crea una categoría nueva en su municipio,
    escribe en el input "Nombre" y le aparece un dropdown con sugerencias
    de esta tabla. Al elegir una, se precarga nombre/descripcion/icono/
    color/tiempo/prioridad y el admin confirma (puede editar cualquier
    campo antes de guardar).

    Espejo exacto de `tramites_sugeridos` pero para el lado de reclamos.
    La tabla per-municipio (`categorias_reclamo`) sigue siendo la fuente
    de verdad de lo que ve el vecino — esta tabla es solo knowledge base
    para simplificar la carga del admin.
    """
    __tablename__ = "categorias_reclamo_sugeridas"

    id = Column(Integer, primary_key=True, index=True)

    nombre = Column(String(100), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)

    # Icono (Lucide) y color hex por default, editables al elegir la sugerencia
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)

    # Valores operativos sugeridos
    tiempo_resolucion_estimado = Column(Integer, nullable=True)  # horas
    prioridad_default = Column(Integer, nullable=True)           # 1-5

    # Rubro (agrupación visual opcional en el autocomplete)
    rubro = Column(String(100), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
