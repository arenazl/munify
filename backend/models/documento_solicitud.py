from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class DocumentoSolicitud(Base):
    """
    Documento adjuntado a una Solicitud por el ciudadano.

    A diferencia del modelo viejo, ahora puede vincularse opcionalmente a
    un `TramiteDocumentoRequerido` para indicar a qué requisito del trámite
    corresponde, y soporta verificación por parte del supervisor.
    """
    __tablename__ = "documentos_solicitudes"

    id = Column(Integer, primary_key=True, index=True)

    solicitud_id = Column(Integer, ForeignKey("solicitudes.id"), nullable=False)
    solicitud = relationship("Solicitud", back_populates="documentos")

    # Quién subió el documento
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario = relationship("User", foreign_keys=[usuario_id])

    # Información del archivo
    nombre_original = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)  # URL de Cloudinary
    public_id = Column(String(255), nullable=True)  # ID de Cloudinary para eliminación
    tipo = Column(String(50), nullable=False)  # "imagen", "documento"
    mime_type = Column(String(100), nullable=True)
    tamanio = Column(Integer, nullable=True)  # Tamaño en bytes

    # Tipo de documento del trámite
    tipo_documento = Column(String(100), nullable=True)  # "dni", "comprobante", etc.
    descripcion = Column(String(500), nullable=True)

    # Etapa en la que se subió
    etapa = Column(String(50), nullable=True)  # "creacion", "proceso", "resolucion"

    # Vínculo opcional con el documento requerido del trámite
    tramite_documento_requerido_id = Column(
        Integer,
        ForeignKey("tramite_documentos_requeridos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    documento_requerido = relationship(
        "TramiteDocumentoRequerido",
        back_populates="documentos_subidos",
    )

    # Verificación por supervisor
    verificado = Column(Boolean, default=False, nullable=False)
    verificado_por_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    verificado_por = relationship("User", foreign_keys=[verificado_por_id])
    fecha_verificacion = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
