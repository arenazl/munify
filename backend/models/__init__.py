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
    "MotivoRechazo"
]
