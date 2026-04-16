from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class EstadoSolicitud(str, enum.Enum):
    """Estados de una solicitud de trámite - alineados con reclamos"""
    # Estados activos (en orden de flujo)
    RECIBIDO = "recibido"           # Solicitud recibida
    EN_CURSO = "en_curso"           # En proceso
    FINALIZADO = "finalizado"       # Completado exitosamente
    POSPUESTO = "pospuesto"         # Diferido
    RECHAZADO = "rechazado"         # Rechazado

    # Estados legacy (para compatibilidad con datos existentes)
    INICIADO = "INICIADO"
    EN_REVISION = "EN_REVISION"
    REQUIERE_DOCUMENTACION = "REQUIERE_DOCUMENTACION"
    EN_PROCESO = "EN_PROCESO"
    APROBADO = "APROBADO"


class Tramite(Base):
    """
    Trámite específico ofrecido por un municipio.

    Cada municipio es dueño absoluto de sus trámites: los crea desde cero
    a través del ABM y define su lista de documentos requeridos.

    Reemplaza al modelo `Tramite` viejo (catálogo global) y elimina el
    nivel intermedio `TipoTramite`. Ahora cuelga directamente de
    `CategoriaTramite`, que también es per-municipio.
    """
    __tablename__ = "tramites"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(
        Integer,
        ForeignKey("municipios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    municipio = relationship("Municipio", back_populates="tramites")

    # Categoría a la que pertenece (también per-municipio)
    categoria_tramite_id = Column(
        Integer,
        ForeignKey("categorias_tramite.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    categoria_tramite = relationship("CategoriaTramite", back_populates="tramites")

    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), nullable=True)

    # Validación de identidad requerida para iniciar el trámite
    requiere_validacion_dni = Column(Boolean, default=False)
    requiere_validacion_facial = Column(Boolean, default=False)

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
    documentos_requeridos = relationship(
        "TramiteDocumentoRequerido",
        back_populates="tramite",
        cascade="all, delete-orphan",
        order_by="TramiteDocumentoRequerido.orden",
    )


class Solicitud(Base):
    """
    Instancia de un trámite creada por un vecino.
    Ejemplo: SOL-2025-00001 - Juan García solicita Permiso de obra nueva.
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
    estado = Column(
        Enum(EstadoSolicitud, values_callable=lambda x: [e.value for e in x]),
        default=EstadoSolicitud.RECIBIDO,
        nullable=False,
        index=True,
    )

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

    # Prioridad (1=urgente, 5=baja)
    prioridad = Column(Integer, default=3)

    # Dependencia asignada
    municipio_dependencia_id = Column(
        Integer, ForeignKey("municipio_dependencias.id"), nullable=True, index=True
    )
    dependencia_asignada = relationship(
        "MunicipioDependencia", back_populates="solicitudes"
    )

    # Responsable (empleado concreto de la dependencia). Opcional — para cuando
    # el supervisor quiere asignar el tramite a una persona especifica segun
    # sus horarios/carga. Si es NULL, el tramite es responsabilidad colectiva
    # de la dependencia.
    empleado_id = Column(
        Integer, ForeignKey("empleados.id", ondelete="SET NULL"), nullable=True, index=True
    )
    empleado = relationship("Empleado", foreign_keys=[empleado_id])

    # Resolución
    respuesta = Column(Text, nullable=True)
    observaciones = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    fecha_resolucion = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    historial = relationship(
        "HistorialSolicitud",
        back_populates="solicitud",
        order_by="HistorialSolicitud.created_at.desc()",
    )
    documentos = relationship(
        "DocumentoSolicitud",
        back_populates="solicitud",
        cascade="all, delete-orphan",
    )


class HistorialSolicitud(Base):
    """Historial de cambios en una solicitud"""
    __tablename__ = "historial_solicitudes"

    id = Column(Integer, primary_key=True, index=True)
    solicitud_id = Column(Integer, ForeignKey("solicitudes.id"), nullable=False)
    solicitud = relationship("Solicitud", back_populates="historial")

    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario = relationship("User")

    estado_anterior = Column(
        Enum(EstadoSolicitud, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    estado_nuevo = Column(
        Enum(EstadoSolicitud, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    accion = Column(String(100), nullable=False)
    comentario = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
