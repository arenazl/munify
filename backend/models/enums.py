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


class MotivoPausa(str, enum.Enum):
    """POR QUE un trabajo quedo diferido. El companero de MotivoRechazo.

    `pospuesto` ya encuadra todo --"no lo pude resolver"-- y por eso no se
    agregan estados: lo que cambia no es la situacion sino la RAZON, y la razon
    es un atributo, igual que en los rechazos.

    Existe tipificado y no como comentario libre porque un motivo escrito en
    prosa no se puede contar. Hoy la razon esta en el historial en frases como
    "se difiere hasta la proxima licitacion de materiales": perfecta para leer
    UN reclamo, inservible para contestar "cuantos estan frenados por
    materiales" sin recorrer todos los reclamos en cada consulta (dueno,
    2026-09-05). Con el motivo tipificado eso es un GROUP BY.

    La lista es corta a proposito: si hay veinte motivos, el que carga elige
    "otro" siempre y el dato se muere.
    """
    MATERIALES = "materiales"          # falta comprar, o no llego
    CLIMA = "clima"                    # no se puede intervenir
    TERCERO = "tercero"                # empresa de agua, gas, cooperativa
    OTRA_OBRA = "otra_obra"            # para no romper dos veces
    PERSONAL = "personal"              # no hay cuadrilla disponible
    SIN_ACCESO = "sin_acceso"          # no se pudo entrar al lugar
    PRESUPUESTO = "presupuesto"        # necesita partida o licitacion
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


class TipoMovimientoInventario(str, enum.Enum):
    """Por que se movio el stock. Todo cambio de `stock_actual` deja uno.

    Los tres primeros los carga una persona; los tres ultimos los escribe el
    sistema cuando una OT toma, devuelve o gasta algo. Separarlos permite
    contestar "quien lo saco" sin tener que abrir cada orden de trabajo.
    """
    ENTRADA = "entrada"          # compra, donacion, devolucion de proveedor
    SALIDA = "salida"            # entrega a un area, prestamo, baja
    AJUSTE = "ajuste"            # conteo fisico, rotura, robo, error de carga
    CONSUMO_OT = "consumo_ot"    # lo gasto una orden de trabajo al completarse
    RESERVA_OT = "reserva_ot"    # una OT tomo un activo
    DEVOLUCION_OT = "devolucion_ot"  # la OT lo devolvio al cerrarse


class EstadoOrdenCompra(str, enum.Enum):
    """Ciclo de una orden de compra, corto a proposito.

    Un municipio chico no necesita aprobaciones en cadena: se arma, se manda
    al proveedor y se recibe (entera o en partes). Cada recepcion genera los
    movimientos de ENTRADA correspondientes.
    """
    BORRADOR = "borrador"
    ENVIADA = "enviada"
    RECIBIDA_PARCIAL = "recibida_parcial"
    RECIBIDA = "recibida"
    CANCELADA = "cancelada"


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
