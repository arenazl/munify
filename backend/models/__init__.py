from .municipio import Municipio  # IMPORTANTE: Municipio debe ir primero por las relaciones FK
from .user import User
from .categoria import Categoria
from .zona import Zona
from .empleado_categoria import empleado_categoria
from .empleado import Empleado
from .reclamo import Reclamo
from .historial import HistorialReclamo
from .documento import Documento
from .configuracion import Configuracion
from .notificacion import Notificacion
from .sla import SLAConfig, SLAViolacion
from .calificacion import Calificacion
from .escalado import ConfiguracionEscalado, HistorialEscalado
from .enums import EstadoReclamo, RolUsuario, MotivoRechazo
from .gamificacion import (
    PuntosUsuario, HistorialPuntos, BadgeUsuario,
    LeaderboardMensual, RecompensaDisponible, RecompensaCanjeada,
    TipoAccion, TipoBadge, PUNTOS_POR_ACCION, BADGES_CONFIG
)
from .whatsapp_config import WhatsAppConfig, WhatsAppLog, WhatsAppProvider
from .noticia import Noticia

__all__ = [
    "Municipio",
    "User",
    "Categoria",
    "Zona",
    "Empleado",
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
    "Noticia"
]
