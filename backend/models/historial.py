from sqlalchemy import Column, Integer, String, DateTime, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import EstadoReclamo

class HistorialReclamo(Base):
    __tablename__ = "historial_reclamos"

    id = Column(Integer, primary_key=True, index=True)

    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False)
    reclamo = relationship("Reclamo", back_populates="historial")

    # Quién realizó la acción
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario = relationship("User")

    # Cambio de estado
    estado_anterior = Column(Enum(EstadoReclamo, values_callable=lambda x: [e.value for e in x]), nullable=True)
    estado_nuevo = Column(Enum(EstadoReclamo, values_callable=lambda x: [e.value for e in x]), nullable=False)

    # Descripción de la acción
    accion = Column(String(100), nullable=False)  # "creado", "asignado", "en_proceso", etc.
    comentario = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
