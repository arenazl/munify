"""Config de derivacion a SalesBot por municipio.

Tabla APARTE, desacoplada de WhatsAppConfig (la integracion Meta es enorme y
requiere negocio aprobado). Esto es SOLO una derivacion: un numero de WhatsApp
al que SalesBot manda los prospectos + un switch de habilitado. Un municipio
puede estar en SalesBot SIN tener la integracion de WhatsApp Business.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from core.database import Base
from datetime import datetime


class SalesbotConfig(Base):
    __tablename__ = "salesbot_configs"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(
        Integer, ForeignKey("municipios.id"), unique=True, nullable=False, index=True
    )
    # Numero al que SalesBot deriva los prospectos. Formato internacional: +54 9 ...
    whatsapp = Column(String(30), nullable=True)
    # Si el municipio se ofrece / aparece como destino de derivacion en SalesBot.
    habilitado = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
