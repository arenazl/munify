"""Modelo de calificaciones de vecinos"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class Calificacion(Base):
    """Calificación de un vecino sobre la resolución de su reclamo"""
    __tablename__ = "calificaciones"

    id = Column(Integer, primary_key=True, index=True)

    # Relación con reclamo (1 calificación por reclamo)
    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=False, unique=True)
    reclamo = relationship("Reclamo", back_populates="calificacion")

    # Quien califica (el creador del reclamo)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario = relationship("User")

    # Calificación 1-5 estrellas
    puntuacion = Column(Integer, nullable=False)
    __table_args__ = (
        CheckConstraint('puntuacion >= 1 AND puntuacion <= 5', name='check_puntuacion_rango'),
    )

    # Aspectos específicos (opcionales, 1-5)
    tiempo_respuesta = Column(Integer, nullable=True)  # Qué tan rápido respondieron
    calidad_trabajo = Column(Integer, nullable=True)   # Calidad del trabajo realizado
    atencion = Column(Integer, nullable=True)          # Trato del personal

    # Comentario del vecino
    comentario = Column(Text, nullable=True)

    # Tags predefinidos que el usuario puede seleccionar
    tags = Column(String(500), nullable=True)  # JSON: ["rapido", "profesional", "amable"]

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
