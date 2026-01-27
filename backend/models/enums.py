import enum
# Force rebuild - enum values are lowercase to match MySQL ENUM

class RolUsuario(str, enum.Enum):
    VECINO = "vecino"
    EMPLEADO = "empleado"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"

class EstadoReclamo(str, enum.Enum):
    NUEVO = "nuevo"
    RECIBIDO = "recibido"  # Dependencia aceptó, tiene tiempo estimado de resolución
    ASIGNADO = "asignado"  # Legacy - mantener por compatibilidad
    EN_PROCESO = "en_proceso"
    PENDIENTE_CONFIRMACION = "pendiente_confirmacion"  # Empleado terminó, espera confirmación del supervisor
    RESUELTO = "resuelto"
    RECHAZADO = "rechazado"

class MotivoRechazo(str, enum.Enum):
    NO_COMPETENCIA = "no_competencia"
    DUPLICADO = "duplicado"
    INFO_INSUFICIENTE = "info_insuficiente"
    FUERA_JURISDICCION = "fuera_jurisdiccion"
    OTRO = "otro"


class TipoAusencia(str, enum.Enum):
    VACACIONES = "vacaciones"
    LICENCIA_MEDICA = "licencia_medica"
    LICENCIA_PERSONAL = "licencia_personal"
    CAPACITACION = "capacitacion"
    FRANCO_COMPENSATORIO = "franco_compensatorio"
    OTRO = "otro"


class DiaSemana(int, enum.Enum):
    LUNES = 0
    MARTES = 1
    MIERCOLES = 2
    JUEVES = 3
    VIERNES = 4
    SABADO = 5
    DOMINGO = 6
