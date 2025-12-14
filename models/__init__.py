from .municipio import Municipio  # IMPORTANTE: Municipio debe ir primero por las relaciones FK
from .user import User
from .categoria import Categoria
from .zona import Zona
from .cuadrilla_categoria import cuadrilla_categoria
from .cuadrilla import Cuadrilla
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
    "Cuadrilla",
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
