from .municipio import Municipio  # IMPORTANTE: Municipio debe ir primero por las relaciones FK
from .barrio import Barrio  # Barrios del municipio (cargados via IA)
from .user import User
from .categoria_reclamo import CategoriaReclamo
from .categoria_reclamo_sugerida import CategoriaReclamoSugerida
from .categoria_tramite import CategoriaTramite
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
from .reclamo_persona import ReclamoPersona
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
from .tramite import Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from .tramite_documento_requerido import TramiteDocumentoRequerido
from .tramite_sugerido import TramiteSugerido
from .documento_solicitud import DocumentoSolicitud
from .push_subscription import PushSubscription
from .consulta_guardada import ConsultaGuardada
from .email_validation import EmailValidation
from .audit_log import AuditLog
from .captura_movil_sesion import (
    CapturaMovilSesion,
    EstadoCapturaMovil,
    ModoCapturaMovil,
)

__all__ = [
    "Municipio",
    "Barrio",
    "User",
    "CategoriaReclamo",
    "CategoriaReclamoSugerida",
    "CategoriaTramite",
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
    "ReclamoPersona",
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
    "Tramite",
    "Solicitud",
    "HistorialSolicitud",
    "EstadoSolicitud",
    "TramiteDocumentoRequerido",
    "TramiteSugerido",
    "DocumentoSolicitud",
    # Push Notifications
    "PushSubscription",
    # Consultas guardadas / BI
    "ConsultaGuardada",
    # Email validation
    "EmailValidation",
    # Audit logs
    "AuditLog",
    # Captura móvil (handoff PC ↔ celular)
    "CapturaMovilSesion",
    "EstadoCapturaMovil",
    "ModoCapturaMovil",
]

# Dependencias (modelo desacoplado del municipio)
from .dependencia import Dependencia, TipoGestionDependencia
from .municipio_dependencia import MunicipioDependencia
from .municipio_dependencia_categoria import MunicipioDependenciaCategoria
from .municipio_dependencia_tramite import MunicipioDependenciaTramite

__all__ += [
    "Dependencia",
    "TipoGestionDependencia",
    "MunicipioDependencia",
    "MunicipioDependenciaCategoria",
    "MunicipioDependenciaTramite",
]

# Tasas (3er pilar: catalogo maestro cross-muni + padron por muni)
from .tasas import (
    TipoTasa,
    Partida,
    Deuda,
    Pago,
    CicloTasa,
    EstadoPartida,
    EstadoDeuda,
    MedioPago,
    EstadoPago,
)

__all__ += [
    "TipoTasa",
    "Partida",
    "Deuda",
    "Pago",
    "CicloTasa",
    "EstadoPartida",
    "EstadoDeuda",
    "MedioPago",
    "EstadoPago",
]

# Pagos (gateway externo PayBridge / Aura / MP — provider-agnostic)
from .pago_sesion import (
    PagoSesion,
    EstadoSesionPago,
    EstadoImputacion,
    MedioPagoGateway,
)
from .municipio_proveedor_pago import MunicipioProveedorPago
from .pago_webhook_evento import PagoWebhookEvento
from .exportacion_imputacion import ExportacionImputacion
from .municipio_sidebar_item import MunicipioSidebarItem

__all__ += [
    "PagoSesion",
    "EstadoSesionPago",
    "EstadoImputacion",
    "MedioPagoGateway",
    "MunicipioProveedorPago",
    "PagoWebhookEvento",
    "ExportacionImputacion",
    "MunicipioSidebarItem",
]
