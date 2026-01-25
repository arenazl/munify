from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class DireccionTipoTramite(Base):
    """
    Tabla intermedia que asigna un TIPO DE TRÁMITE a una dirección.
    
    Relación Muchos a Muchos con propiedades adicionales.
    
    IMPORTANTE: Tiene municipio_id para multi-tenant.
    """
    __tablename__ = "direccion_tipos_tramites"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'direccion_id', 'tipo_tramite_id', name='uq_direccion_tipo_tramite'),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    # Multi-tenant: Cada direccion_tipo_tramite pertenece a un municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio")
    
    # FK a Dirección
    direccion_id = Column(Integer, ForeignKey("direcciones.id"), nullable=False, index=True)
    direccion = relationship("Direccion", back_populates="tipos_tramite_asignados")
    
    # FK a TipoTramite
    tipo_tramite_id = Column(Integer, ForeignKey("tipos_tramites.id"), nullable=False, index=True)
    tipo_tramite = relationship("TipoTramite")
    
    activo = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<DireccionTipoTramite {self.direccion.nombre} - {self.tipo_tramite.nombre}>"