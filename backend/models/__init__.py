from .municipio import Municipio  # IMPORTANTE: Municipio debe ir primero por las relaciones FK
from .barrio import Barrio  # Barrios del municipio (cargados via IA)
from .user import User
from .categoria import Categoria, MunicipioCategoria
from .zona import Zona
from .cuadrilla_categoria import cuadrilla_categoria
from .cuadrilla import Cuadrilla  # Debe ir antes de Reclamo por la relación FK
from .empleado_categoria import empleado_categoria
from .empleado import Empleado
from .empleado_cuadrilla import EmpleadoCuadrilla
from .empleado_ausencia import EmpleadoAusencia
from .empleado_horario import EmpleadoHorario
from .empleado_metrica import EmpleadoMetrica
from .empleado_capacitacion import EmpleadoCapacitacion
from .reclamo import Reclamo
from .historial import HistorialReclamo
from .documento import Documento
from .configuracion import Configuracion
from .notificacion import Notificacion
from .sla import SLAConfig, SLAViolacion
from .calificacion import Calificacion
from .escalado import ConfiguracionEscalado, HistorialEscalado
from .enums import EstadoReclamo, RolUsuario, MotivoRechazo, TipoAusencia, DiaSemana
from .gamificacion import (
    PuntosUsuario, HistorialPuntos, BadgeUsuario,
    LeaderboardMensual, RecompensaDisponible, RecompensaCanjeada,
    TipoAccion, TipoBadge, PUNTOS_POR_ACCION, BADGES_CONFIG
)
from .whatsapp_config import WhatsAppConfig, WhatsAppLog, WhatsAppProvider
from .noticia import Noticia
from .tramite import TipoTramite, Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud, MunicipioTipoTramite, MunicipioTramite
from .documento_solicitud import DocumentoSolicitud
from .tramite_doc import TramiteDoc
from .push_subscription import PushSubscription
from .consulta_guardada import ConsultaGuardada
from .email_validation import EmailValidation

__all__ = [
    "Municipio",
    "Barrio",
    "User",
    "Categoria",
    "MunicipioCategoria",
    "Zona",
    "Cuadrilla",
    "Empleado",
    "EmpleadoCuadrilla",
    "EmpleadoAusencia",
    "EmpleadoHorario",
    "EmpleadoMetrica",
    "EmpleadoCapacitacion",
    "TipoAusencia",
    "DiaSemana",
    "Reclamo",
    "HistorialReclamo",
    "Documento",
    "Configuracion",
    "Notificacion",
    "SLAConfig",
    "SLAViolacion",
    "Calificacion",
    "ConfiguracionEscalado",
    "HistorialEscalado",
    "EstadoReclamo",
    "RolUsuario",
    "MotivoRechazo",
    # Gamificación
    "PuntosUsuario",
    "HistorialPuntos",
    "BadgeUsuario",
    "LeaderboardMensual",
    "RecompensaDisponible",
    "RecompensaCanjeada",
    "TipoAccion",
    "TipoBadge",
    "PUNTOS_POR_ACCION",
    "BADGES_CONFIG",
    # WhatsApp
    "WhatsAppConfig",
    "WhatsAppLog",
    "WhatsAppProvider",
    # Noticias
    "Noticia",
    # Tramites
    "TipoTramite",
    "Tramite",
    "Solicitud",
    "HistorialSolicitud",
    "EstadoSolicitud",
    "MunicipioTipoTramite",
    "MunicipioTramite",
    "DocumentoSolicitud",
    "TramiteDoc",
    # Push Notifications
    "PushSubscription",
    # Consultas guardadas / BI
    "ConsultaGuardada",
    # Email validation
    "EmailValidation"
]

# Direcciones (DEPRECATED - usar Dependencias)
from .direccion import Direccion
from .direccion_categoria import DireccionCategoria
from .direccion_tipo_tramite import DireccionTipoTramite

# Dependencias (nuevo modelo desacoplado del municipio)
from .dependencia import Dependencia, TipoGestionDependencia
from .municipio_dependencia import MunicipioDependencia
from .municipio_dependencia_categoria import MunicipioDependenciaCategoria
from .municipio_dependencia_tipo_tramite import MunicipioDependenciaTipoTramite
from .municipio_dependencia_tramite import MunicipioDependenciaTramite

__all__ += [
    # Direcciones (DEPRECATED)
    "Direccion",
    "DireccionCategoria",
    "DireccionTipoTramite",
    # Dependencias (nuevo modelo)
    "Dependencia",
    "TipoGestionDependencia",
    "MunicipioDependencia",
    "MunicipioDependenciaCategoria",
    "MunicipioDependenciaTipoTramite",
    "MunicipioDependenciaTramite",
]
