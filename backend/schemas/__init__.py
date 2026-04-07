from .user import UserCreate, UserUpdate, UserResponse, UserLogin, Token
from .categoria_reclamo import CategoriaReclamoCreate, CategoriaReclamoUpdate, CategoriaReclamoResponse
from .categoria_tramite import CategoriaTramiteCreate, CategoriaTramiteUpdate, CategoriaTramiteResponse
from .zona import ZonaCreate, ZonaUpdate, ZonaResponse
from .cuadrilla import CuadrillaCreate, CuadrillaUpdate, CuadrillaResponse
from .reclamo import ReclamoCreate, ReclamoUpdate, ReclamoResponse, ReclamoAsignar, ReclamoRechazar, ReclamoResolver
from .historial import HistorialResponse
from .documento import DocumentoResponse
from .configuracion import ConfiguracionCreate, ConfiguracionUpdate, ConfiguracionResponse
from .notificacion import NotificacionResponse

__all__ = [
    "UserCreate", "UserUpdate", "UserResponse", "UserLogin", "Token",
    "CategoriaReclamoCreate", "CategoriaReclamoUpdate", "CategoriaReclamoResponse",
    "CategoriaTramiteCreate", "CategoriaTramiteUpdate", "CategoriaTramiteResponse",
    "ZonaCreate", "ZonaUpdate", "ZonaResponse",
    "CuadrillaCreate", "CuadrillaUpdate", "CuadrillaResponse",
    "ReclamoCreate", "ReclamoUpdate", "ReclamoResponse", "ReclamoAsignar", "ReclamoRechazar", "ReclamoResolver",
    "HistorialResponse",
    "DocumentoResponse",
    "ConfiguracionCreate", "ConfiguracionUpdate", "ConfiguracionResponse",
    "NotificacionResponse",
]
