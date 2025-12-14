from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Documento(Base):
    __tablename__ = "documentos"

    id = Column(Integer, primary_key=True, index=True)

    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False)
    reclamo = relationship("Reclamo", back_populates="documentos")

    # Quién subió el documento
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario = relationship("User")

    # Información del archivo
    nombre_original = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)  # URL de Cloudinary
    public_id = Column(String(255), nullable=True)  # ID de Cloudinary para eliminación
    tipo = Column(String(50), nullable=False)  # "imagen", "documento"
    mime_type = Column(String(100), nullable=True)
    tamanio = Column(Integer, nullable=True)  # Tamaño en bytes

    # Contexto del documento
    etapa = Column(String(50), nullable=True)  # "creacion", "proceso", "resolucion"

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
