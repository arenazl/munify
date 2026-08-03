"""Modelo para suscripciones de Push Notifications"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime


class PushSubscription(Base):
    """Suscripción de push notification por usuario"""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    # Datos de la suscripción.
    #
    # `endpoint` es VARCHAR(500) y no TEXT a propósito: lleva UNIQUE, y MySQL
    # no acepta un índice sobre TEXT sin longitud de clave ("BLOB/TEXT column
    # used in key specification without a key length"). Con TEXT, un
    # `create_all` contra una base VACÍA se caía y el backend no arrancaba —
    # las bases existentes nunca lo mostraron porque la tabla ya estaba creada.
    # 500 caracteres cubren de sobra un endpoint de Web Push (FCM ronda los
    # 200) y en utf8mb4 quedan 2000 bytes, debajo del límite de 3072 de InnoDB.
    endpoint = Column(String(500), nullable=False, unique=True)
    p256dh_key = Column(String(255), nullable=False)  # Public key
    auth_key = Column(String(255), nullable=False)    # Auth secret

    # Metadata
    user_agent = Column(String(500), nullable=True)
    activo = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    user = relationship("User", back_populates="push_subscriptions")
