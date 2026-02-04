from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class TramiteDoc(Base):
    """
    Documentos/requisitos visuales asociados a un trámite.
    Cada trámite puede tener múltiples documentos con imagen.
    """
    __tablename__ = "tramite_docs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tramite_id = Column(Integer, ForeignKey("tramites.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    imagen = Column(String(500), nullable=True)
    orden = Column(Integer, default=0, index=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    # Relación con Tramite
    tramite = relationship("Tramite", back_populates="documentos")

    def __repr__(self):
        return f"<TramiteDoc {self.id}: {self.nombre}>"

    def to_dict(self):
        return {
            "id": self.id,
            "tramite_id": self.tramite_id,
            "nombre": self.nombre,
            "descripcion": self.descripcion,
            "imagen": self.imagen,
            "orden": self.orden,
            "activo": self.activo,
        }
