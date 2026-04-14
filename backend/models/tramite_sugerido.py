from sqlalchemy import Column, Integer, String, Text, Float, DateTime
from sqlalchemy.sql import func
from core.database import Base


class TramiteSugerido(Base):
    """
    Catálogo global de trámites sugeridos para autocomplete.

    A diferencia de `Tramite` (per-municipio), esta tabla es **común a todos
    los municipios** y se usa solo como knowledge base para sugerir nombres
    de trámites al admin cuando está creando uno nuevo. No tiene `municipio_id`
    ni `categoria_tramite_id` porque:

    - Las categorías son per-municipio y dinámicas (el admin las crea/edita/borra),
      así que mapear una sugerencia a una categoría específica no tiene sentido
      a nivel global.
    - El admin elige la categoría en el wizard cuando crea el trámite.

    Al seleccionar una sugerencia, el frontend precarga los campos del form
    (nombre, descripción, tiempo_estimado_dias, costo) y convierte el string
    `documentos_sugeridos` (CSV con "|" o ",") en drafts del editor de
    documentos requeridos.

    Sembrada una vez al desplegar el sistema con los ~100 trámites típicos de
    municipios argentinos (ver `scripts/seed_tramites_sugeridos.py`).
    """
    __tablename__ = "tramites_sugeridos"

    id = Column(Integer, primary_key=True, index=True)

    nombre = Column(String(200), nullable=False, index=True)
    descripcion = Column(Text, nullable=True)

    # Valores sugeridos (el admin los puede editar al confirmar el trámite)
    tiempo_estimado_dias = Column(Integer, nullable=True)
    costo = Column(Float, nullable=True)

    # Documentos sugeridos como texto libre separado por comas o "|".
    # Ej: "DNI, Certificado psicofísico, Curso vial"
    # Al elegir la sugerencia, el frontend los convierte en drafts obligatorios.
    documentos_sugeridos = Column(Text, nullable=True)

    # Rubro aproximado para agrupación visual en el autocomplete
    # (no es FK a nada, es solo un label descriptivo).
    rubro = Column(String(100), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
