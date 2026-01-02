from .municipio import Municipio  # IMPORTANTE: Municipio debe ir primero por las relaciones FK
from .user import User
from .categoria import Categoria
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
from .tramite import TipoTramite, Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from .documento_solicitud import DocumentoSolicitud
from .push_subscription import PushSubscription

__all__ = [
    "Municipio",
    "User",
    "Categoria",
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
    "DocumentoSolicitud",
    # Push Notifications
    "PushSubscription"
]
