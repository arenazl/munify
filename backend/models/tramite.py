from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, Enum, ForeignKey, UniqueConstraint
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
    Nivel 1: Categorías principales de trámites - CATÁLOGO GENÉRICO
    Ejemplo: Obras Privadas, Comercio, Tránsito, Rentas, Salud
    Los municipios habilitan tipos mediante MunicipioTipoTramite
    """
    __tablename__ = "tipos_tramites"

    id = Column(Integer, primary_key=True, index=True)
    # Ya no tiene municipio_id - es genérico

    nombre = Column(String(200), nullable=False, unique=True)
    descripcion = Column(Text, nullable=True)
    codigo = Column(String(50), nullable=True, unique=True)
    icono = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    tramites = relationship("Tramite", back_populates="tipo_tramite", order_by="Tramite.orden")
    municipios_habilitados = relationship("MunicipioTipoTramite", back_populates="tipo_tramite")


class MunicipioTipoTramite(Base):
    """
    Tabla intermedia: Qué tipos de trámite tiene habilitado cada municipio
    """
    __tablename__ = "municipio_tipos_tramites"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'tipo_tramite_id', name='uq_municipio_tipo_tramite'),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    tipo_tramite_id = Column(Integer, ForeignKey("tipos_tramites.id"), nullable=False, index=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)  # Orden personalizado por municipio

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="tipos_tramites_habilitados")
    tipo_tramite = relationship("TipoTramite", back_populates="municipios_habilitados")


class Tramite(Base):
    """
    Nivel 2: Trámites específicos dentro de cada tipo - CATÁLOGO GENÉRICO
    Ejemplo: [Obras] Permiso de obra nueva, Ampliación, Regularización
             [Comercio] Habilitación comercial, Renovación, Cambio de rubro
    Los municipios habilitan trámites mediante MunicipioTramite
    """
    __tablename__ = "tramites"

    id = Column(Integer, primary_key=True, index=True)
    tipo_tramite_id = Column(Integer, ForeignKey("tipos_tramites.id"), nullable=False, index=True)
    tipo_tramite = relationship("TipoTramite", back_populates="tramites")

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)

    # Requisitos y documentación (valores por defecto, municipios pueden personalizar)
    requisitos = Column(Text, nullable=True)
    documentos_requeridos = Column(Text, nullable=True)

    # Info del trámite (valores por defecto)
    tiempo_estimado_dias = Column(Integer, default=15)
    costo = Column(Float, nullable=True)
    url_externa = Column(String(500), nullable=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    solicitudes = relationship("Solicitud", back_populates="tramite")
    municipios_habilitados = relationship("MunicipioTramite", back_populates="tramite")


class MunicipioTramite(Base):
    """
    Tabla intermedia: Qué trámites tiene habilitado cada municipio
    Permite personalizar tiempo, costo, requisitos por municipio
    """
    __tablename__ = "municipio_tramites"
    __table_args__ = (
        UniqueConstraint('municipio_id', 'tramite_id', name='uq_municipio_tramite'),
    )

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    tramite_id = Column(Integer, ForeignKey("tramites.id"), nullable=False, index=True)

    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)

    # Personalizaciones por municipio (NULL = usar valor genérico)
    tiempo_estimado_dias = Column(Integer, nullable=True)
    costo = Column(Float, nullable=True)
    requisitos = Column(Text, nullable=True)
    documentos_requeridos = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    municipio = relationship("Municipio", back_populates="tramites_habilitados")
    tramite = relationship("Tramite", back_populates="municipios_habilitados")


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

    # Dirección organizativa asignada (unidad municipal que gestiona esta solicitud)
    direccion_id = Column(Integer, ForeignKey("direcciones.id"), nullable=True, index=True)
    direccion_asignada = relationship("Direccion", back_populates="solicitudes")

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
    documentos = relationship("DocumentoSolicitud", back_populates="solicitud", cascade="all, delete-orphan")


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
