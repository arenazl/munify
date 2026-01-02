from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class DocumentoSolicitud(Base):
    __tablename__ = "documentos_solicitudes"

    id = Column(Integer, primary_key=True, index=True)

    solicitud_id = Column(Integer, ForeignKey("solicitudes.id"), nullable=False)
    solicitud = relationship("Solicitud", back_populates="documentos")

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

    # Tipo de documento del trámite
    tipo_documento = Column(String(100), nullable=True)  # "dni", "comprobante", "formulario", etc.
    descripcion = Column(String(500), nullable=True)

    # Etapa en la que se subió
    etapa = Column(String(50), nullable=True)  # "creacion", "proceso", "resolucion"

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
