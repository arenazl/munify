"""Modelo para suscripciones de Push Notifications"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime


class PushSubscription(Base):
    """Suscripción de push notification por usuario"""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    # Datos de la suscripción
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh_key = Column(String(255), nullable=False)  # Public key
    auth_key = Column(String(255), nullable=False)    # Auth secret

    # Metadata
    user_agent = Column(String(500), nullable=True)
    activo = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    user = relationship("User", back_populates="push_subscriptions")
