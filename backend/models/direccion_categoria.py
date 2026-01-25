from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class DireccionCategoria(Base):
    """
    Tabla intermedia que asigna una CATEGORÍA DE RECLAMO a una dirección.
    
    Relación Muchos a Muchos con propiedades adicionales.
    
    IMPORTANTE: Tiene municipio_id para multi-tenant.
    """
    __tablename__ = "direccion_categorias"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'direccion_id', 'categoria_id', name='uq_direccion_categoria'),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    # Multi-tenant: Cada dirección_categoria pertenece a un municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio")
    
    # FK a Dirección
    direccion_id = Column(Integer, ForeignKey("direcciones.id"), nullable=False, index=True)
    direccion = relationship("Direccion", back_populates="categorias_asignadas")
    
    # FK a Categoría (de reclamos)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False, index=True)
    categoria = relationship("Categoria")
    
    # Personalizaciones por dirección
    tiempo_resolucion_estimado = Column(Integer, nullable=True)  # horas (override)
    prioridad_default = Column(Integer, nullable=True)           # 1-5 (override)
    
    activo = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<DireccionCategoria {self.direccion.nombre} - {self.categoria.nombre}>"