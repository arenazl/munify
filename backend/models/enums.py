import enum

class RolUsuario(str, enum.Enum):
    VECINO = "vecino"
    EMPLEADO = "empleado"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"

class EstadoReclamo(str, enum.Enum):
    NUEVO = "nuevo"
    ASIGNADO = "asignado"
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
