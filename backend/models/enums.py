import enum
# Force rebuild - enum values are lowercase to match MySQL ENUM

class RolUsuario(str, enum.Enum):
    VECINO = "vecino"
    EMPLEADO = "empleado"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"
    OPERADOR_VENTANILLA = "operador_ventanilla"

class EstadoReclamo(str, enum.Enum):
    # Estados activos
    RECIBIDO = "recibido"      # Dependencia recibió el reclamo
    EN_CURSO = "en_curso"      # Trabajo en progreso
    FINALIZADO = "finalizado"  # Trabajo completado
    POSPUESTO = "pospuesto"    # Trabajo diferido
    RECHAZADO = "rechazado"    # Rechazado (disponible siempre)
    # Legacy - mantener por compatibilidad con datos existentes
    NUEVO = "nuevo"
    ASIGNADO = "asignado"
    EN_PROCESO = "en_proceso"
    PENDIENTE_CONFIRMACION = "pendiente_confirmacion"
    RESUELTO = "resuelto"

class MotivoRechazo(str, enum.Enum):
    NO_COMPETENCIA = "no_competencia"
    DUPLICADO = "duplicado"
    INFO_INSUFICIENTE = "info_insuficiente"
    FUERA_JURISDICCION = "fuera_jurisdiccion"
    OTRO = "otro"


class EstadoOrdenTrabajo(str, enum.Enum):
    """Ciclo de vida de una orden de trabajo (OT) de campo.

    Circuito: pendiente → asignada → en_curso → (bloqueada) → completada/cancelada.
    BLOQUEADA es un estado NO final: la OT está frenada en campo (falta material,
    clima, vecino ausente) pero se retoma para completarse o se cancela.
    """
    PENDIENTE = "pendiente"      # Creada, sin cuadrilla/empleado asignado
    ASIGNADA = "asignada"        # Con cuadrilla y/o empleado responsable
    EN_CURSO = "en_curso"        # Trabajo iniciado en campo
    BLOQUEADA = "bloqueada"      # Frenada en campo (falta material/clima/vecino ausente)
    COMPLETADA = "completada"    # Trabajo terminado (no cierra los reclamos)
    CANCELADA = "cancelada"


class PrioridadOT(str, enum.Enum):
    """Prioridad de una orden de trabajo (para la planilla / el formato)."""
    BAJA = "baja"
    MEDIA = "media"
    ALTA = "alta"
    URGENTE = "urgente"


class OrigenOT(str, enum.Enum):
    """Cómo nació una OT (F6 · OT universal).

    - MANUAL: la creó un gestor desde la pantalla de Órdenes (ciclo propio,
      confirmación humana en cada transición).
    - IMPLICITA: la generó automáticamente una asignación de reclamo (1:1 con
      su reclamo). Espeja el estado del reclamo y queda oculta en munis simples.
    - CONSOLIDADA_POI: OT de zona de un Punto de Interés (Etapa B). Agrupa
      varios reclamos cercanos con prioridad alta.
    """
    MANUAL = "manual"
    IMPLICITA = "implicita"
    CONSOLIDADA_POI = "consolidada_poi"


class NaturalezaInventario(str, enum.Enum):
    """Dos naturalezas de inventario, con mecánicas opuestas.

    - ACTIVO: bien reutilizable (camioneta, retro, motosierra). No se
      consume: una OT lo *toma* y queda ocupado hasta que se libera.
    - CONSUMIBLE: material que se gasta (cemento, caños, pintura). Tiene
      stock; una OT lo *descuenta* al completarse.
    """
    ACTIVO = "activo"
    CONSUMIBLE = "consumible"


class EstadoActivo(str, enum.Enum):
    """Estado operativo de un bien de inventario (solo naturaleza ACTIVO)."""
    DISPONIBLE = "disponible"        # Libre para asignar a una OT
    EN_USO = "en_uso"                # Tomado por una OT vigente
    MANTENIMIENTO = "mantenimiento"  # Fuera de servicio temporal
    BAJA = "baja"                    # Dado de baja (no operativo)


class TipoRecursoOT(str, enum.Enum):
    """Cómo una OT usa un ítem de inventario."""
    RESERVA = "reserva"   # Toma un activo (se libera al cerrar la OT)
    CONSUMO = "consumo"   # Gasta un consumible (descuenta stock al completar)


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
