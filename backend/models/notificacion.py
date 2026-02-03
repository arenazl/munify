from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)

    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario = relationship("User", back_populates="notificaciones")

    # Contenido
    titulo = Column(String(200), nullable=False)
    mensaje = Column(Text, nullable=False)
    tipo = Column(String(50), nullable=False)  # "info", "success", "warning", "error"

    # Referencia opcional a un reclamo
    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=True)
    reclamo = relationship("Reclamo")

    # Referencia opcional a una solicitud de trámite
    solicitud_id = Column(Integer, ForeignKey("solicitudes.id"), nullable=True)
    solicitud = relationship("Solicitud")

    # Estado
    leida = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
