"""Suscripción push del directorio /calls.

Tabla propia y NO `push_subscriptions` porque /calls es una pantalla PÚBLICA
sin login: no hay `user_id` que poner (esa columna es NOT NULL con FK). Acá la
identidad es el propio endpoint del navegador.

Guarda además el PROGRESO del día que reporta el cliente (las llamadas viven en
su localStorage, el servidor no las conoce de otra forma): es lo que permite que
el recordatorio del mediodía sepa si arrancó y el de la tarde cuántas le faltan.
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Date
from core.database import Base
from datetime import datetime


class CallsPushSub(Base):
    __tablename__ = "calls_push_subs"

    id = Column(Integer, primary_key=True, index=True)

    # Igual que en push_subscriptions: VARCHAR(500) y no TEXT — lleva UNIQUE y
    # MySQL no indexa TEXT sin longitud de clave.
    endpoint = Column(String(500), nullable=False, unique=True)
    p256dh_key = Column(String(255), nullable=False)
    auth_key = Column(String(255), nullable=False)
    user_agent = Column(String(500), nullable=True)
    activo = Column(Boolean, default=True)

    # --- El progreso que reporta el cliente ---
    dia = Column(Date, nullable=True)              # a qué día corresponde
    hechas = Column(Integer, default=0)            # llamadas del día
    meta = Column(Integer, default=5)              # objetivo del día
    proximo = Column(String(120), nullable=True)   # a quién le toca (para el texto)
    # Qué recordatorios ya se mandaron hoy ("manana", "manana,mediodia"): sin
    # esto, un cron que corra dos veces manda la misma notificación dos veces.
    enviados = Column(String(60), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
