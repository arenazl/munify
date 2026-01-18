"""
Modelo para consultas guardadas / cubos de BI.
Permite a los usuarios guardar consultas frecuentes para reutilizarlas.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class ConsultaGuardada(Base):
    """
    Consulta SQL guardada por un usuario para reutilizar.
    Similar a "favoritos" o "cubos" de BI.
    """
    __tablename__ = "consultas_guardadas"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio", back_populates="consultas_guardadas")

    # Usuario que creó la consulta
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    usuario = relationship("User", back_populates="consultas_guardadas")

    # Datos de la consulta
    nombre = Column(String(100), nullable=False)  # "Reclamos por zona este mes"
    descripcion = Column(Text, nullable=True)  # Descripción opcional
    icono = Column(String(50), default="database")  # Ícono para mostrar
    color = Column(String(20), default="#3b82f6")  # Color del badge/card

    # La consulta en sí
    pregunta_original = Column(Text, nullable=False)  # La pregunta en lenguaje natural
    sql_query = Column(Text, nullable=True)  # El SQL generado (para cache)

    # Configuración de visualización
    tipo_visualizacion = Column(String(50), default="tabla")  # tabla, cards, chart
    config_visualizacion = Column(JSON, nullable=True)  # Configuración del gráfico si aplica

    # Compartir
    es_publica = Column(Boolean, default=False)  # Si otros usuarios del municipio pueden verla
    es_predeterminada = Column(Boolean, default=False)  # Si aparece por defecto en el panel

    # Uso
    veces_ejecutada = Column(Integer, default=0)  # Para ordenar por popularidad
    ultima_ejecucion = Column(DateTime(timezone=True), nullable=True)

    # Estado
    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
