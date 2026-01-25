from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Time, Text, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import EstadoReclamo, MotivoRechazo


class Reclamo(Base):
    __tablename__ = "reclamos"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant: FK al municipio
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=True, index=True)
    municipio = relationship("Municipio", back_populates="reclamos")

    # Informacion basica
    titulo = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=False)

    # Estado y prioridad
    estado = Column(Enum(EstadoReclamo), default=EstadoReclamo.NUEVO, nullable=False, index=True)
    prioridad = Column(Integer, default=3)  # 1-5, donde 1 es más urgente

    # Ubicación del reclamo (donde está el problema)
    direccion = Column(String(255), nullable=False)
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)
    referencia = Column(String(255), nullable=True)  # "Frente a la plaza", etc.

    # Categoría del reclamo
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False)
    categoria = relationship("Categoria", back_populates="reclamos")

    # Zona geográfica (legacy - usar barrio_id preferentemente)
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True)
    zona = relationship("Zona", back_populates="reclamos")

    # Barrio detectado automáticamente desde la dirección
    barrio_id = Column(Integer, ForeignKey("barrios.id"), nullable=True, index=True)
    barrio = relationship("Barrio")

    # Usuario que creó el reclamo
    creador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creador = relationship("User", back_populates="reclamos_creados", foreign_keys=[creador_id])

    # Dirección organizativa asignada (unidad municipal que gestiona este reclamo)
    direccion_id = Column(Integer, ForeignKey("direcciones.id"), nullable=True, index=True)
    direccion_asignada = relationship("Direccion", back_populates="reclamos")

    # Programación del trabajo
    fecha_programada = Column(Date, nullable=True)
    hora_inicio = Column(Time, nullable=True)
    hora_fin = Column(Time, nullable=True)

    # Rechazo
    motivo_rechazo = Column(Enum(MotivoRechazo), nullable=True)
    descripcion_rechazo = Column(Text, nullable=True)

    # Resolución
    resolucion = Column(Text, nullable=True)
    fecha_resolucion = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    historial = relationship("HistorialReclamo", back_populates="reclamo", order_by="HistorialReclamo.created_at.desc()")
    documentos = relationship("Documento", back_populates="reclamo")
    calificacion = relationship("Calificacion", back_populates="reclamo", uselist=False)
