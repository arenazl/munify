from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class TramiteDocumentoRequerido(Base):
    """
    Sub-tabla del Tramite: lista de documentos que el ciudadano debe
    presentar al iniciar una solicitud y que el supervisor debe verificar
    una vez subidos antes de poder pasar la solicitud de `recibido` a
    `en_curso`.

    Ejemplo: para "Licencia de Conducir - Primera vez" los documentos
    requeridos podrían ser: "Trámite AFIP", "Certificado médico",
    "Certificado libre deuda municipal".
    """
    __tablename__ = "tramite_documentos_requeridos"

    id = Column(Integer, primary_key=True, index=True)
    tramite_id = Column(
        Integer,
        ForeignKey("tramites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    obligatorio = Column(Boolean, default=True, nullable=False)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    tramite = relationship("Tramite", back_populates="documentos_requeridos")
    documentos_subidos = relationship(
        "DocumentoSolicitud",
        back_populates="documento_requerido",
    )
