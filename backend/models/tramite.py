from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class EstadoTramite(str, enum.Enum):
    INICIADO = "iniciado"
    EN_REVISION = "en_revision"
    REQUIERE_DOCUMENTACION = "requiere_documentacion"
    EN_PROCESO = "en_proceso"
    APROBADO = "aprobado"
    RECHAZADO = "rechazado"
    FINALIZADO = "finalizado"


class ServicioTramite(Base):
    """Servicios/Categorías de trámites disponibles en el municipio"""
    __tablename__ = "servicios_tramites"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio", back_populates="servicios_tramites")

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)  # nombre del icono lucide
    color = Column(String(20), nullable=True)  # color hex

    # Requisitos y documentación necesaria
    requisitos = Column(Text, nullable=True)  # JSON o texto con requisitos
    documentos_requeridos = Column(Text, nullable=True)  # Lista de documentos necesarios

    # Información del trámite
    tiempo_estimado_dias = Column(Integer, default=15)  # Días hábiles estimados
    costo = Column(Float, nullable=True)  # Costo del trámite (si aplica)
    url_externa = Column(String(500), nullable=True)  # Link a sistema externo si existe

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)  # Para ordenar en el listado
    favorito = Column(Boolean, default=False)  # Mostrar como botón rápido en UI (máx 6)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    tramites = relationship("Tramite", back_populates="servicio")


class Tramite(Base):
    """Solicitud de trámite realizada por un vecino"""
    __tablename__ = "tramites"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio", back_populates="tramites")

    # Información básica
    numero_tramite = Column(String(50), unique=True, index=True)  # Ej: TRM-2025-00001
    asunto = Column(String(300), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Estado
    estado = Column(Enum(EstadoTramite), default=EstadoTramite.INICIADO, nullable=False, index=True)

    # Servicio/Categoría
    servicio_id = Column(Integer, ForeignKey("servicios_tramites.id"), nullable=False)
    servicio = relationship("ServicioTramite", back_populates="tramites")

    # Usuario solicitante
    solicitante_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    solicitante = relationship("User", back_populates="tramites")

    # Datos del solicitante (para usuarios anónimos o no registrados)
    nombre_solicitante = Column(String(100), nullable=True)
    apellido_solicitante = Column(String(100), nullable=True)
    dni_solicitante = Column(String(20), nullable=True)
    email_solicitante = Column(String(200), nullable=True)
    telefono_solicitante = Column(String(50), nullable=True)
    direccion_solicitante = Column(String(300), nullable=True)

    # Empleado asignado
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    empleado_asignado = relationship("Empleado", back_populates="tramites_asignados")

    # Prioridad (1-5, donde 1 es más urgente)
    prioridad = Column(Integer, default=3)

    # Respuesta/Resolución
    respuesta = Column(Text, nullable=True)
    observaciones = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    fecha_resolucion = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    historial = relationship("HistorialTramite", back_populates="tramite", order_by="HistorialTramite.created_at.desc()")


class HistorialTramite(Base):
    """Historial de cambios en un trámite"""
    __tablename__ = "historial_tramites"

    id = Column(Integer, primary_key=True, index=True)
    tramite_id = Column(Integer, ForeignKey("tramites.id"), nullable=False)
    tramite = relationship("Tramite", back_populates="historial")

    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario = relationship("User")

    estado_anterior = Column(Enum(EstadoTramite), nullable=True)
    estado_nuevo = Column(Enum(EstadoTramite), nullable=True)
    accion = Column(String(100), nullable=False)
    comentario = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
