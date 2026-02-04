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
    estado = Column(Enum(EstadoReclamo, values_callable=lambda x: [e.value for e in x]), default=EstadoReclamo.NUEVO, nullable=False, index=True)
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

    # Dependencia asignada (nuevo modelo desacoplado)
    municipio_dependencia_id = Column(Integer, ForeignKey("municipio_dependencias.id"), nullable=True, index=True)
    dependencia_asignada = relationship("MunicipioDependencia", back_populates="reclamos")

    # Programación del trabajo
    fecha_programada = Column(Date, nullable=True)
    hora_inicio = Column(Time, nullable=True)
    hora_fin = Column(Time, nullable=True)

    # Tiempo estimado de resolución (al recibir el reclamo)
    tiempo_estimado_dias = Column(Integer, nullable=True, default=0)
    tiempo_estimado_horas = Column(Integer, nullable=True, default=0)
    fecha_estimada_resolucion = Column(DateTime(timezone=True), nullable=True)
    fecha_recibido = Column(DateTime(timezone=True), nullable=True)  # Cuando la dependencia aceptó

    # Rechazo
    motivo_rechazo = Column(Enum(MotivoRechazo, values_callable=lambda x: [e.value for e in x]), nullable=True)
    descripcion_rechazo = Column(Text, nullable=True)

    # Resolución
    resolucion = Column(Text, nullable=True)
    fecha_resolucion = Column(DateTime(timezone=True), nullable=True)

    # Confirmación del vecino (feedback después de finalizar)
    # None = sin respuesta, True = solucionado, False = sigue el problema
    confirmado_vecino = Column(Boolean, nullable=True, default=None)
    fecha_confirmacion_vecino = Column(DateTime(timezone=True), nullable=True)
    comentario_confirmacion_vecino = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    historial = relationship("HistorialReclamo", back_populates="reclamo", order_by="HistorialReclamo.created_at.desc()")
    documentos = relationship("Documento", back_populates="reclamo")
    calificacion = relationship("Calificacion", back_populates="reclamo", uselist=False)
    personas = relationship("ReclamoPersona", back_populates="reclamo", cascade="all, delete-orphan")
