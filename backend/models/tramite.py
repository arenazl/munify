from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class EstadoSolicitud(str, enum.Enum):
    """Estados de una solicitud de trámite"""
    INICIADO = "INICIADO"
    EN_REVISION = "EN_REVISION"
    REQUIERE_DOCUMENTACION = "REQUIERE_DOCUMENTACION"
    EN_PROCESO = "EN_PROCESO"
    APROBADO = "APROBADO"
    RECHAZADO = "RECHAZADO"
    FINALIZADO = "FINALIZADO"


class TipoTramite(Base):
    """
    Nivel 1: Categorías principales de trámites (~15)
    Ejemplo: Obras Privadas, Comercio, Tránsito, Rentas, Salud
    """
    __tablename__ = "tipos_tramites"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio", back_populates="tipos_tramites")

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    codigo = Column(String(50), nullable=True)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    tramites = relationship("Tramite", back_populates="tipo_tramite", order_by="Tramite.orden")


class Tramite(Base):
    """
    Nivel 2: Trámites específicos dentro de cada tipo (~500 total)
    Ejemplo: [Obras] Permiso de obra nueva, Ampliación, Regularización
             [Comercio] Habilitación comercial, Renovación, Cambio de rubro
    """
    __tablename__ = "tramites"

    id = Column(Integer, primary_key=True, index=True)
    tipo_tramite_id = Column(Integer, ForeignKey("tipos_tramites.id"), nullable=False, index=True)
    tipo_tramite = relationship("TipoTramite", back_populates="tramites")

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)

    # Requisitos y documentación
    requisitos = Column(Text, nullable=True)
    documentos_requeridos = Column(Text, nullable=True)

    # Info del trámite
    tiempo_estimado_dias = Column(Integer, default=15)
    costo = Column(Float, nullable=True)
    url_externa = Column(String(500), nullable=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    solicitudes = relationship("Solicitud", back_populates="tramite")


class Solicitud(Base):
    """
    Nivel 3: Solicitudes diarias creadas por vecinos
    Ejemplo: SOL-2025-00001 - Juan García solicita Permiso de obra nueva
    """
    __tablename__ = "solicitudes"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio", back_populates="solicitudes")

    # Número único de solicitud
    numero_tramite = Column(String(50), unique=True, index=True)  # SOL-2025-00001

    # Trámite solicitado
    tramite_id = Column(Integer, ForeignKey("tramites.id"), nullable=True, index=True)
    tramite = relationship("Tramite", back_populates="solicitudes")

    # Datos de la solicitud
    asunto = Column(String(300), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Estado
    estado = Column(Enum(EstadoSolicitud), default=EstadoSolicitud.INICIADO, nullable=False, index=True)

    # Solicitante (usuario registrado o anónimo)
    solicitante_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    solicitante = relationship("User", back_populates="solicitudes")

    # Datos del solicitante (para anónimos o para guardar snapshot)
    nombre_solicitante = Column(String(100), nullable=True)
    apellido_solicitante = Column(String(100), nullable=True)
    dni_solicitante = Column(String(20), nullable=True)
    email_solicitante = Column(String(200), nullable=True)
    telefono_solicitante = Column(String(50), nullable=True)
    direccion_solicitante = Column(String(300), nullable=True)

    # Empleado asignado
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    empleado_asignado = relationship("Empleado", back_populates="solicitudes_asignadas")

    # Prioridad (1=urgente, 5=baja)
    prioridad = Column(Integer, default=3)

    # Resolución
    respuesta = Column(Text, nullable=True)
    observaciones = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    fecha_resolucion = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    historial = relationship("HistorialSolicitud", back_populates="solicitud", order_by="HistorialSolicitud.created_at.desc()")


class HistorialSolicitud(Base):
    """Historial de cambios en una solicitud"""
    __tablename__ = "historial_solicitudes"

    id = Column(Integer, primary_key=True, index=True)
    solicitud_id = Column(Integer, ForeignKey("solicitudes.id"), nullable=False)
    solicitud = relationship("Solicitud", back_populates="historial")

    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario = relationship("User")

    estado_anterior = Column(Enum(EstadoSolicitud), nullable=True)
    estado_nuevo = Column(Enum(EstadoSolicitud), nullable=True)
    accion = Column(String(100), nullable=False)
    comentario = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
