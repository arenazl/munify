"""Configuracion de IA por municipio.

El uso de IA (asistentes, clasificacion automatica, dashboards/insights con LLM)
se habilita/deshabilita POR MUNICIPIO, y SOLO el superadmin lo controla (no el
intendente). Cuando esta deshabilitada, el front oculta todas las superficies de
IA y el backend cae a los fallbacks no-IA (clasificacion local, dashboards solo
SQL, asistente 503). Tambien define que modelo de Gemini usa ese municipio.

Default: deshabilitada (habilitada=False). Si un municipio no tiene fila, se
considera deshabilitada (ver core/ia_config.py).
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from core.database import Base
from datetime import datetime


class MunicipioIaConfig(Base):
    __tablename__ = "municipio_ia_config"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(
        Integer, ForeignKey("municipios.id"), unique=True, nullable=False, index=True
    )
    # Switch maestro de IA para este municipio.
    habilitada = Column(Boolean, default=False, nullable=False)
    # Sub-switch: IA en el modulo Tesoreria (paneles operativos al costado +
    # banner de curacion Bartolo). Solo aplica si `habilitada` esta en True.
    # Permite tener IA prendida en general pero apagada en Tesoreria.
    tesoreria = Column(Boolean, default=True, nullable=False)
    # Proveedor (hoy solo 'gemini'; se deja por extensibilidad).
    provider = Column(String(30), default="gemini", nullable=False)
    # Modelo concreto (ej: gemini-2.5-flash, gemini-1.5-flash, gemini-1.5-pro).
    modelo = Column(String(60), default="gemini-2.5-flash", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
