"""
Sistema de Gamificación - Modelos
Puntos, Badges y Leaderboard para incentivar participación ciudadana
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class TipoAccion(enum.Enum):
    """Tipos de acciones que otorgan puntos"""
    RECLAMO_CREADO = "reclamo_creado"
    RECLAMO_VERIFICADO = "reclamo_verificado"  # Cuando se confirma que es válido
    RECLAMO_RESUELTO = "reclamo_resuelto"      # Cuando su reclamo es resuelto
    RECLAMO_CON_FOTO = "reclamo_con_foto"
    RECLAMO_CON_UBICACION = "reclamo_con_ubicacion"
    PRIMER_RECLAMO = "primer_reclamo"
    RACHA_SEMANAL = "racha_semanal"            # Reportar algo cada semana
    CALIFICACION_DADA = "calificacion_dada"
    BADGE_OBTENIDO = "badge_obtenido"
    BONUS_ZONA_ACTIVA = "bonus_zona_activa"    # Bonus por reportar en zona con pocos reportes


class TipoBadge(enum.Enum):
    """Tipos de badges disponibles"""
    # Badges por cantidad de reclamos
    VECINO_ACTIVO = "vecino_activo"           # 5 reclamos
    OJOS_DE_LA_CIUDAD = "ojos_de_la_ciudad"   # 15 reclamos
    REPORTERO_ESTRELLA = "reportero_estrella" # 30 reclamos
    GUARDIAN_URBANO = "guardian_urbano"       # 50 reclamos
    HEROE_MUNICIPAL = "heroe_municipal"       # 100 reclamos

    # Badges por categorías
    CAZADOR_DE_BACHES = "cazador_de_baches"       # 10 reclamos de baches
    GUARDIAN_DE_LA_LUZ = "guardian_de_la_luz"     # 10 reclamos de alumbrado
    DEFENSOR_DEL_VERDE = "defensor_del_verde"     # 10 reclamos de espacios verdes
    VIGILANTE_DEL_AGUA = "vigilante_del_agua"     # 10 reclamos de agua/cloacas

    # Badges especiales
    PRIMER_PASO = "primer_paso"               # Primer reclamo
    FOTOGRAFO = "fotografo"                   # 10 reclamos con foto
    PRECISO = "preciso"                       # 10 reclamos con ubicación exacta
    CONSTANTE = "constante"                   # 4 semanas consecutivas reportando
    MADRUGADOR = "madrugador"                 # Reportar antes de las 7am
    NOCTURNO = "nocturno"                     # Reportar después de las 22pm
    TOP_DEL_MES = "top_del_mes"               # #1 en leaderboard mensual
    TOP_3_MES = "top_3_mes"                   # Top 3 en leaderboard mensual


# Configuración de puntos por acción
PUNTOS_POR_ACCION = {
    TipoAccion.RECLAMO_CREADO: 10,
    TipoAccion.RECLAMO_VERIFICADO: 15,
    TipoAccion.RECLAMO_RESUELTO: 20,
    TipoAccion.RECLAMO_CON_FOTO: 5,
    TipoAccion.RECLAMO_CON_UBICACION: 5,
    TipoAccion.PRIMER_RECLAMO: 25,
    TipoAccion.RACHA_SEMANAL: 30,
    TipoAccion.CALIFICACION_DADA: 5,
    TipoAccion.BADGE_OBTENIDO: 50,
    TipoAccion.BONUS_ZONA_ACTIVA: 10,
}

# Configuración de badges
BADGES_CONFIG = {
    TipoBadge.PRIMER_PASO: {
        "nombre": "Primer Paso",
        "descripcion": "Creaste tu primer reclamo",
        "icono": "footprints",
        "color": "#10b981",
        "requisito": "Crear 1 reclamo",
        "puntos_bonus": 25,
    },
    TipoBadge.VECINO_ACTIVO: {
        "nombre": "Vecino Activo",
        "descripcion": "Has reportado 5 problemas en tu ciudad",
        "icono": "user-check",
        "color": "#3b82f6",
        "requisito": "Crear 5 reclamos",
        "puntos_bonus": 50,
    },
    TipoBadge.OJOS_DE_LA_CIUDAD: {
        "nombre": "Ojos de la Ciudad",
        "descripcion": "Siempre atento a los problemas urbanos",
        "icono": "eye",
        "color": "#8b5cf6",
        "requisito": "Crear 15 reclamos",
        "puntos_bonus": 100,
    },
    TipoBadge.REPORTERO_ESTRELLA: {
        "nombre": "Reportero Estrella",
        "descripcion": "Un verdadero experto en reportar problemas",
        "icono": "star",
        "color": "#f59e0b",
        "requisito": "Crear 30 reclamos",
        "puntos_bonus": 200,
    },
    TipoBadge.GUARDIAN_URBANO: {
        "nombre": "Guardian Urbano",
        "descripcion": "Protector incansable de la ciudad",
        "icono": "shield",
        "color": "#ef4444",
        "requisito": "Crear 50 reclamos",
        "puntos_bonus": 300,
    },
    TipoBadge.HEROE_MUNICIPAL: {
        "nombre": "Héroe Municipal",
        "descripcion": "Leyenda viviente del civismo",
        "icono": "trophy",
        "color": "#fbbf24",
        "requisito": "Crear 100 reclamos",
        "puntos_bonus": 500,
    },
    TipoBadge.CAZADOR_DE_BACHES: {
        "nombre": "Cazador de Baches",
        "descripcion": "Experto en detectar baches y problemas viales",
        "icono": "construction",
        "color": "#ef4444",
        "requisito": "10 reclamos de baches",
        "puntos_bonus": 75,
    },
    TipoBadge.GUARDIAN_DE_LA_LUZ: {
        "nombre": "Guardián de la Luz",
        "descripcion": "Velando por el alumbrado público",
        "icono": "lightbulb",
        "color": "#f59e0b",
        "requisito": "10 reclamos de alumbrado",
        "puntos_bonus": 75,
    },
    TipoBadge.DEFENSOR_DEL_VERDE: {
        "nombre": "Defensor del Verde",
        "descripcion": "Protegiendo nuestros espacios verdes",
        "icono": "trees",
        "color": "#22c55e",
        "requisito": "10 reclamos de espacios verdes",
        "puntos_bonus": 75,
    },
    TipoBadge.VIGILANTE_DEL_AGUA: {
        "nombre": "Vigilante del Agua",
        "descripcion": "Cuidando el recurso más valioso",
        "icono": "droplets",
        "color": "#0ea5e9",
        "requisito": "10 reclamos de agua/cloacas",
        "puntos_bonus": 75,
    },
    TipoBadge.FOTOGRAFO: {
        "nombre": "Fotógrafo",
        "descripcion": "Siempre documentando con evidencia visual",
        "icono": "camera",
        "color": "#ec4899",
        "requisito": "10 reclamos con foto",
        "puntos_bonus": 50,
    },
    TipoBadge.PRECISO: {
        "nombre": "Preciso",
        "descripcion": "Ubicaciones exactas para mejor atención",
        "icono": "map-pin",
        "color": "#14b8a6",
        "requisito": "10 reclamos con ubicación",
        "puntos_bonus": 50,
    },
    TipoBadge.CONSTANTE: {
        "nombre": "Constante",
        "descripcion": "4 semanas seguidas ayudando a la ciudad",
        "icono": "calendar-check",
        "color": "#6366f1",
        "requisito": "4 semanas consecutivas",
        "puntos_bonus": 100,
    },
    TipoBadge.MADRUGADOR: {
        "nombre": "Madrugador",
        "descripcion": "Reportando antes que amanezca",
        "icono": "sunrise",
        "color": "#fb923c",
        "requisito": "Reportar antes de las 7am",
        "puntos_bonus": 25,
    },
    TipoBadge.NOCTURNO: {
        "nombre": "Nocturno",
        "descripcion": "Vigilante de la noche",
        "icono": "moon",
        "color": "#1e3a5f",
        "requisito": "Reportar después de las 22pm",
        "puntos_bonus": 25,
    },
    TipoBadge.TOP_DEL_MES: {
        "nombre": "Top del Mes",
        "descripcion": "El vecino más activo del mes",
        "icono": "crown",
        "color": "#fbbf24",
        "requisito": "#1 en leaderboard mensual",
        "puntos_bonus": 200,
    },
    TipoBadge.TOP_3_MES: {
        "nombre": "Top 3",
        "descripcion": "Entre los 3 más activos del mes",
        "icono": "medal",
        "color": "#94a3b8",
        "requisito": "Top 3 en leaderboard mensual",
        "puntos_bonus": 100,
    },
}


class PuntosUsuario(Base):
    """Puntos acumulados por usuario"""
    __tablename__ = "puntos_usuarios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Puntos
    puntos_totales = Column(Integer, default=0, nullable=False)
    puntos_mes_actual = Column(Integer, default=0, nullable=False)

    # Estadísticas
    reclamos_totales = Column(Integer, default=0, nullable=False)
    reclamos_resueltos = Column(Integer, default=0, nullable=False)
    reclamos_con_foto = Column(Integer, default=0, nullable=False)
    reclamos_con_ubicacion = Column(Integer, default=0, nullable=False)
    calificaciones_dadas = Column(Integer, default=0, nullable=False)

    # Racha
    semanas_consecutivas = Column(Integer, default=0, nullable=False)
    ultima_actividad = Column(DateTime(timezone=True), nullable=True)

    # Nivel calculado (1 punto = 1 nivel cada 100 puntos)
    @property
    def nivel(self) -> int:
        return (self.puntos_totales // 100) + 1

    @property
    def puntos_para_siguiente_nivel(self) -> int:
        return 100 - (self.puntos_totales % 100)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    user = relationship("User", backref="puntos")
    municipio = relationship("Municipio")


class HistorialPuntos(Base):
    """Historial de puntos ganados"""
    __tablename__ = "historial_puntos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Detalle de la acción
    tipo_accion = Column(SQLEnum(TipoAccion), nullable=False)
    puntos = Column(Integer, nullable=False)
    descripcion = Column(String(255), nullable=True)

    # Referencia opcional al reclamo
    reclamo_id = Column(Integer, ForeignKey("reclamos.id"), nullable=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    user = relationship("User")
    reclamo = relationship("Reclamo")


class BadgeUsuario(Base):
    """Badges obtenidos por usuario"""
    __tablename__ = "badges_usuarios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Badge
    tipo_badge = Column(SQLEnum(TipoBadge), nullable=False)

    # Timestamp
    obtenido_en = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    user = relationship("User", backref="badges")

    @property
    def config(self) -> dict:
        return BADGES_CONFIG.get(self.tipo_badge, {})


class LeaderboardMensual(Base):
    """Leaderboard mensual por zona"""
    __tablename__ = "leaderboard_mensual"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    zona_id = Column(Integer, ForeignKey("zonas.id"), nullable=True, index=True)  # NULL = leaderboard general

    # Período
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)  # 1-12

    # Ranking
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    posicion = Column(Integer, nullable=False)
    puntos = Column(Integer, nullable=False)
    reclamos = Column(Integer, nullable=False)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    user = relationship("User")
    zona = relationship("Zona")


class RecompensaDisponible(Base):
    """Recompensas que los usuarios pueden canjear"""
    __tablename__ = "recompensas_disponibles"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Detalles
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=True)
    icono = Column(String(50), default="gift")

    # Costo en puntos
    puntos_requeridos = Column(Integer, nullable=False)

    # Disponibilidad
    stock = Column(Integer, nullable=True)  # NULL = ilimitado
    activo = Column(Boolean, default=True)
    fecha_inicio = Column(DateTime(timezone=True), nullable=True)
    fecha_fin = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RecompensaCanjeada(Base):
    """Historial de recompensas canjeadas"""
    __tablename__ = "recompensas_canjeadas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    recompensa_id = Column(Integer, ForeignKey("recompensas_disponibles.id"), nullable=False)
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)

    # Puntos gastados
    puntos_gastados = Column(Integer, nullable=False)

    # Estado
    estado = Column(String(20), default="pendiente")  # pendiente, entregado, cancelado
    codigo_canje = Column(String(50), nullable=True)  # Código único para canjear

    # Timestamps
    canjeado_en = Column(DateTime(timezone=True), server_default=func.now())
    entregado_en = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    user = relationship("User")
    recompensa = relationship("RecompensaDisponible")
