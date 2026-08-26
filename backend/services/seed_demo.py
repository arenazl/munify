"""
Seed completo para municipios demo.

Crea toda la estructura que un municipio necesita para ser funcional
desde el minuto 0: dependencias, trámites con docs requeridos, usuarios,
zonas, barrios, empleados, cuadrillas, SLAs, reclamos de ejemplo (con
coordenadas reales para el mapa) y una solicitud — además de las
categorías que ya siembra `crear_categorias_default()`.
"""
import re
import unicodedata
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from core.security import get_password_hash
from services import geo_ciudad
from models.user import User
from models.enums import RolUsuario, EstadoReclamo
from models.municipio import Municipio
from models.dependencia import Dependencia
from models.municipio_dependencia import MunicipioDependencia
from models.municipio_dependencia_categoria import MunicipioDependenciaCategoria
from models.categoria_reclamo import CategoriaReclamo
from models.categoria_tramite import CategoriaTramite
from models.tramite import Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from models.tramite_documento_requerido import TramiteDocumentoRequerido
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.zona import Zona
from models.barrio import Barrio
from models.empleado import Empleado
from models.empleado_categoria import empleado_categoria
from models.cuadrilla import Cuadrilla
from models.cuadrilla_categoria import cuadrilla_categoria
from models.empleado_cuadrilla import EmpleadoCuadrilla
from models.sla import SLAConfig


# ============================================================
# Mapeo dependencia → categorías de reclamo (por nombre)
# ============================================================
# Cubre las 10 categorías default sin huérfanos: TODA categoría tiene una
# dependencia responsable, aunque esa dependencia no sea una de las
# "activas" (con supervisor + contenido demo — ver DEPENDENCIAS_ACTIVAS).
DEPENDENCIA_CATEGORIAS_MAP = {
    "SERVICIOS_PUBLICOS": [
        "Alumbrado público",
        "Recolección de residuos",
        "Arbolado y espacios verdes",
        "Agua y cloacas",
        "Higiene urbana",
    ],
    "OBRAS_PUBLICAS": ["Bacheo y calles"],
    "TRANSITO_VIAL": ["Tránsito y señalización"],
    "ZOONOSIS": ["Plagas y control", "Animales sueltos"],
    "SEGURIDAD": ["Ruidos y convivencia"],
}

# Catálogo completo: las 12 dependencias/secretarías se habilitan siempre
# para que el municipio demo tenga el organigrama real y completo.
DEPENDENCIAS_CODIGOS = [
    "ATENCION_VECINO",
    "OBRAS_PUBLICAS",
    "SERVICIOS_PUBLICOS",
    "TRANSITO_VIAL",
    "SEGURIDAD",
    "ZOONOSIS",
    "CATASTRO",
    "RENTAS",
    "HABILITACIONES",
    "OBRAS_PARTICULARES",
    "BROMATOLOGIA",
    "DESARROLLO_SOCIAL",
]

# Subconjunto curado: solo estas dependencias reciben supervisor + reclamos +
# trámites de ejemplo. Las 6 restantes del catálogo quedan habilitadas (se ven
# en el organigrama) pero sin bandeja cargada — evita abrumar la demo con
# actividad en las 12 a la vez, priorizando calidad sobre cantidad.
DEPENDENCIAS_ACTIVAS = [
    "SERVICIOS_PUBLICOS",   # estrella: alumbrado público + servicios urbanos
    "OBRAS_PUBLICAS",
    "TRANSITO_VIAL",
    "ZOONOSIS",
    "HABILITACIONES",
    "RENTAS",
]

TRAMITES_DEMO = [
    {
        "nombre": "Licencia de conducir - Primera vez",
        "descripcion": "Obtención de la licencia de conducir para personas que no poseen una previa.",
        "categoria_tramite_nombre": "Tránsito y Transporte",
        "dep_codigo": "TRANSITO_VIAL",
        "tiempo_estimado_dias": 15,
        "costo": 8500.0,
        "tipo_pago": "boton_pago",
        "momento_pago": "inicio",
        # Turnero: el trámite insignia del flujo turno-first — presencial,
        # con biometría obligatoria (la regla de identidad de la casa).
        "modo_atencion": "presencial_con_turno",
        "duracion_turno_min": 45,
        "requiere_kyc": True,
        "nivel_kyc_minimo": 2,
        "documentos": [
            ("DNI (frente y dorso)", "Copia digitalizada del documento nacional de identidad", True),
            ("Certificado médico psicofísico", "Emitido por centro habilitado, vigencia 30 días", True),
            ("Foto carnet 4x4", "Fondo blanco, actualizada", True),
        ],
    },
    {
        "nombre": "Renovación de licencia de conducir",
        "descripcion": "Renovación de la licencia de conducir vigente, sin cambio de categoría.",
        "categoria_tramite_nombre": "Tránsito y Transporte",
        "dep_codigo": "TRANSITO_VIAL",
        "tiempo_estimado_dias": 5,
        "costo": 6000.0,
        "tipo_pago": "adhesion_debito",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_con_turno",
        "duracion_turno_min": 20,
        "documentos": [
            ("DNI (frente y dorso)", "Copia digitalizada del documento nacional de identidad", True),
            ("Licencia anterior", "Licencia de conducir a renovar", True),
        ],
    },
    {
        "nombre": "Habilitación comercial",
        "descripcion": "Habilitación para apertura de un nuevo comercio o actividad comercial.",
        "categoria_tramite_nombre": "Habilitaciones Comerciales",
        "dep_codigo": "HABILITACIONES",
        "tiempo_estimado_dias": 30,
        "costo": 15000.0,
        "tipo_pago": "adhesion_debito",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_con_turno",
        "duracion_turno_min": 30,
        "documentos": [
            ("DNI del titular", "Copia digitalizada del documento nacional de identidad", True),
            ("Plano del local", "Plano aprobado por profesional matriculado", True),
            ("Constancia de inscripción AFIP", "Constancia de CUIT actualizada", True),
        ],
    },
    {
        "nombre": "Renovación de habilitación comercial",
        "descripcion": "Renovación anual de la habilitación comercial vigente.",
        "categoria_tramite_nombre": "Habilitaciones Comerciales",
        "dep_codigo": "HABILITACIONES",
        "tiempo_estimado_dias": 10,
        "costo": 6000.0,
        "tipo_pago": "adhesion_debito",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_sin_turno",
        "documentos": [
            ("Habilitación anterior", "Constancia de la habilitación a renovar", True),
        ],
    },
    {
        "nombre": "Permiso de obra menor",
        "descripcion": "Autorización para realizar obras menores (cercos, veredas, refacciones).",
        "categoria_tramite_nombre": "Obras Particulares",
        "dep_codigo": "OBRAS_PUBLICAS",
        "tiempo_estimado_dias": 20,
        "costo": 5000.0,
        "tipo_pago": "boton_pago",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_sin_turno",
        "documentos": [
            ("DNI del propietario", "Copia digitalizada del documento nacional de identidad", True),
            ("Plano de obra", "Croquis o plano firmado por profesional", True),
        ],
    },
    {
        "nombre": "Certificado de libre deuda municipal",
        "descripcion": "Certificado que acredita la inexistencia de deudas con el municipio.",
        "categoria_tramite_nombre": "Tasas y Tributos",
        "dep_codigo": "RENTAS",
        "tiempo_estimado_dias": 5,
        "costo": 2000.0,
        "tipo_pago": "rapipago",
        "momento_pago": "fin",
        "modo_atencion": "online",
        "documentos": [
            ("DNI del titular", "Copia digitalizada del documento nacional de identidad", True),
            ("Última boleta de tasa municipal", "Boleta del último período abonado", False),
        ],
    },
    {
        "nombre": "Plan de pago de tasas",
        "descripcion": "Refinanciación de deuda de tasas municipales en cuotas.",
        "categoria_tramite_nombre": "Tasas y Tributos",
        "dep_codigo": "RENTAS",
        "tiempo_estimado_dias": 3,
        "costo": 0.0,
        "tipo_pago": None,
        "momento_pago": None,
        "modo_atencion": "presencial_sin_turno",
        "documentos": [
            ("DNI del titular", "Copia digitalizada del documento nacional de identidad", True),
            ("Último resumen de deuda", "Detalle de las boletas adeudadas", False),
        ],
    },
]

# ============================================================
# Completitud del catálogo de trámites (regla del dueño: NINGUNA categoría
# de trámite queda con 0 tipos en la demo)
# ============================================================
# Mapeo categoría de trámite → dependencia responsable. Fuente canónica:
# TIPOS_A_DEPENDENCIAS de scripts/seed_chacabuco_dependencias.py (el "mapeo
# consciente" tipo de trámite → dependencia), traducido a los nombres default
# de CATEGORIAS_TRAMITE_DEFAULT (services/categorias_seed.py). Se usa para los
# trámites de TRAMITES_CATALOGO_EXTRA (los de TRAMITES_DEMO ya traen su
# dep_codigo curado inline).
CATEGORIA_TRAMITE_DEP_MAP = {
    "Tránsito y Transporte": "TRANSITO_VIAL",
    "Habilitaciones Comerciales": "HABILITACIONES",
    "Obras Particulares": "OBRAS_PARTICULARES",
    "Catastro": "CATASTRO",
    "Tasas y Tributos": "RENTAS",
    "Salud y Bromatología": "BROMATOLOGIA",
    # "Espacio Público" → HABILITACIONES en la fuente (permisos de uso).
    "Espacios Públicos": "HABILITACIONES",
    # "Documentación Personal" → ATENCION_VECINO en la fuente.
    "Certificados y Documentación": "ATENCION_VECINO",
    "Desarrollo Social": "DESARROLLO_SOCIAL",
    # "Cementerio" → ATENCION_VECINO en la fuente (no hay dep específica).
    "Cementerios": "ATENCION_VECINO",
}

# Trámites de completitud: 1 tipo por cada categoría de trámite default que
# TRAMITES_DEMO no cubre (Catastro, Salud y Bromatología, Espacios Públicos,
# Certificados y Documentación, Desarrollo Social, Cementerios). Fuentes
# canónicas: nombre/descripción/tiempo/costo de TRAMITES_CATALOGO de
# scripts/seed_10_demos.py (el catálogo por categoría del pipeline de demos)
# y documentos del rubro homólogo en scripts/seed_tramites_sugeridos.py.
# `solo_catalogo=True` = completan el catálogo pero NO generan solicitudes de
# ejemplo — el set operativo de la demo sigue curado y acotado (regla 3).
TRAMITES_CATALOGO_EXTRA = [
    {
        "nombre": "Certificado de dominio",
        "descripcion": "Solicitud de certificado de titularidad de un inmueble en el municipio.",
        "categoria_tramite_nombre": "Catastro",
        "tiempo_estimado_dias": 7,
        "costo": 1500.0,
        "tipo_pago": "rapipago",
        "momento_pago": "fin",
        "modo_atencion": "online",
        "solo_catalogo": True,
        "documentos": [
            ("DNI del solicitante", "Copia digitalizada del documento nacional de identidad", True),
            ("Partida inmobiliaria", "Número de partida o título de propiedad del inmueble", True),
        ],
    },
    {
        "nombre": "Carnet de manipulación de alimentos",
        "descripcion": "Certificado obligatorio para personal de gastronomía y comercios alimenticios.",
        "categoria_tramite_nombre": "Salud y Bromatología",
        "tiempo_estimado_dias": 7,
        "costo": 2500.0,
        "tipo_pago": "boton_pago",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_con_turno",
        "duracion_turno_min": 30,
        "solo_catalogo": True,
        "documentos": [
            ("DNI del solicitante", "Copia digitalizada del documento nacional de identidad", True),
            ("Análisis clínicos", "Estudios exigidos por el área de bromatología", True),
        ],
    },
    {
        "nombre": "Permiso de uso de plaza",
        "descripcion": "Autorización para realizar un evento público en plaza o espacio verde municipal.",
        "categoria_tramite_nombre": "Espacios Públicos",
        "tiempo_estimado_dias": 10,
        "costo": 3000.0,
        "tipo_pago": "boton_pago",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_sin_turno",
        "solo_catalogo": True,
        "documentos": [
            ("Descripción del evento", "Detalle de la actividad, fecha y horario propuestos", True),
            ("Seguro de responsabilidad civil", "Póliza que cubra el evento", True),
        ],
    },
    {
        "nombre": "Certificado de residencia",
        "descripcion": "Acreditación de domicilio dentro del municipio para trámites administrativos.",
        "categoria_tramite_nombre": "Certificados y Documentación",
        "tiempo_estimado_dias": 2,
        "costo": 500.0,
        "tipo_pago": "rapipago",
        "momento_pago": "fin",
        "modo_atencion": "online",
        "solo_catalogo": True,
        "documentos": [
            ("DNI del solicitante", "Copia digitalizada del documento nacional de identidad", True),
            ("Servicio a nombre del solicitante", "Factura de un servicio que acredite el domicilio", True),
        ],
    },
    {
        "nombre": "Tarjeta alimentaria",
        "descripcion": "Inscripción al programa de asistencia alimentaria para familias en situación vulnerable.",
        "categoria_tramite_nombre": "Desarrollo Social",
        "tiempo_estimado_dias": 15,
        "costo": 0.0,
        "tipo_pago": None,
        "momento_pago": None,
        "modo_atencion": "presencial_sin_turno",
        "solo_catalogo": True,
        "documentos": [
            ("DNI del solicitante", "Copia digitalizada del documento nacional de identidad", True),
            ("Constancia de AUH o ingresos", "Documentación que respalde la situación socioeconómica", True),
        ],
    },
    {
        "nombre": "Renovación de bóveda",
        "descripcion": "Renovación del derecho de uso de bóveda familiar en el cementerio municipal.",
        "categoria_tramite_nombre": "Cementerios",
        "tiempo_estimado_dias": 5,
        "costo": 12000.0,
        "tipo_pago": "adhesion_debito",
        "momento_pago": "inicio",
        "modo_atencion": "presencial_sin_turno",
        "solo_catalogo": True,
        "documentos": [
            ("DNI del solicitante", "Copia digitalizada del documento nacional de identidad", True),
            ("Concesión anterior", "Constancia del derecho de uso a renovar", True),
        ],
    },
]

# ============================================================
# Zonas y barrios: SALEN DE LA CIUDAD, no de una lista
# ============================================================
# Aca vivian ZONAS_DEMO ("Centro / Norte / Sur / Este / Oeste / Periferia") y
# BARRIOS_DEMO ("Villa Norte", "Los Alamos", "Periferia Sur"): offsets fijos
# sobre el centro del municipio. Estan BORRADAS y no vuelven.
#
# El dueño creo la demo de Lujan y vio "Centro / Norte / Sur" donde tenian que
# decir Ameghino, Open Door, Jauregui, Lezica y Torrezuri. Son puntos cardinales
# inventados presentados como los barrios de la ciudad del cliente --- justo lo
# que la regla 11 prohibe, y justo lo que esta demo tiene que vender.
#
# Ahora la geografia sale de `services/geo_ciudad.py`: poligono real del
# municipio (tabla `municipios_catalogo`) + UNA consulta a Overpass cacheada. Si
# OSM no tiene barrios para esa ciudad, las zonas toman el nombre de sus calles
# principales REALES; si no tiene ni eso, el municipio queda SIN zonas y el alta
# lo informa. Nunca mas un nombre inventado.

# Cuantos puntos geolocalizados se le piden a la ciudad. Es un PARAMETRO, no un
# numero atado al volumen de reclamos: cuando la semilla suba de 13 a 50 casos
# alcanza con subir esto, y aunque quede corto no rompe nada --- el consumidor
# recorre la lista con modulo, solo se repiten calles.
PUNTOS_GEO = 80

# ============================================================
# Empleados demo
# ============================================================
# (nombre, apellido, telefono, tipo, especialidad, categoria_reclamo_nombre, zona_nombre)
EMPLEADOS_DEMO = [
    ("Juan",    "Pérez",     "+5491155550001", "operario",       "Bacheo y pavimento",      "Bacheo y calles",              "Sur"),
    ("Carlos",  "Gómez",     "+5491155550002", "operario",       "Electricidad pública",    "Alumbrado público",            "Norte"),
    ("Luis",    "Rodríguez", "+5491155550003", "operario",       "Recolección y limpieza",  "Recolección de residuos",      "Centro"),
    ("Martín",  "López",     "+5491155550004", "operario",       "Poda y parquización",     "Arbolado y espacios verdes",   "Oeste"),
    ("Pedro",   "Sánchez",   "+5491155550005", "operario",       "Señalización vial",       "Tránsito y señalización",      "Este"),
    ("Laura",   "Torres",    "+5491155550006", "administrativo", "Habilitaciones",          None,                           None),
    ("Ana",     "Ruiz",      "+5491155550007", "administrativo", "Atención al vecino",      None,                           None),
]

# ============================================================
# Cuadrillas demo
# ============================================================
# (nombre, descripcion, categoria_nombre, zona_nombre, lider_idx, miembro_idx)
# idx se refiere al orden en EMPLEADOS_DEMO
CUADRILLAS_DEMO = [
    ("Cuadrilla Bacheo",    "Equipo de reparación de baches y pavimento",   "Bacheo y calles",            "Sur",   0, 2),
    ("Cuadrilla Alumbrado", "Equipo de mantenimiento eléctrico",            "Alumbrado público",          "Norte", 1, 4),
    ("Cuadrilla Poda",      "Equipo de poda y mantenimiento de espacios verdes", "Arbolado y espacios verdes", "Oeste", 3, 2),
]

# ============================================================
# SLA configs (por categoría + general)
# ============================================================
# (categoria_nombre_o_None, tiempo_respuesta_h, tiempo_resolucion_h, tiempo_alerta_amarilla_h)
SLA_CONFIGS_DEMO = [
    ("Bacheo y calles",         24, 72,  48),
    ("Alumbrado público",       12, 48,  24),
    ("Recolección de residuos",  8, 24,  16),
    ("Tránsito y señalización",  6, 24,  12),
    (None,                      48, 168, 96),  # General (fallback)
]

# ============================================================
# Reclamos demo (enriquecidos con coords + zona + barrio)
# ============================================================
# Curados a propósito: 3-4 por cada una de las 4 dependencias "activas" que
# manejan reclamos (Servicios Públicos, Obras Públicas, Tránsito, Zoonosis).
# Servicios Públicos incluye 3 de alumbrado público a propósito — es el
# reclamo insignia que más se muestra en las demos.
# (titulo, descripcion, categoria_nombre, estado, direccion,
#  dep_codigo, zona_nombre, barrio_nombre, lat_offset, lng_offset, historial)
def _punto_con_focos(i: int) -> int:
    """Regla del dueño: toda demo nace con RECURRENCIA real. Los primeros
    reclamos se apilan en dos esquinas (3 + 2) para que el mapa de focos
    ("Dónde se repiten los reclamos" agrupa por dirección, mínimo 2) tenga
    recorrido desde el día uno; el resto se dispersa en puntos propios."""
    if i < 3:
        return 0
    if i < 5:
        return 1
    return i - 3


def _fecha_historica(i: int) -> datetime:
    """Regla del dueño: sin componente histórico no es una demo funcional.
    Reparte los reclamos ~3 meses hacia atrás de forma DETERMINÍSTICA (día
    3, 10, 17... por índice, sin randoms) para que la tendencia mensual del
    dashboard tenga movimiento y comparación reales."""
    return datetime.utcnow() - timedelta(days=3 + i * 7, hours=(i * 5) % 12)


# ============================================================
# Historia de TRÁMITES y TURNOS (misma regla que _fecha_historica)
# ============================================================
# Regla del dueño: "los demos tienen que parecer apps en funcionamiento".
# Una solicitud que nace y se cierra en el mismo segundo delata la semilla
# (el KPI de tiempo de resolución da 0 y la bandeja no tiene pasado), igual
# que un turno vencido que sigue en "reservado". Todo lo de abajo se deriva
# del ÍNDICE — determinístico, sin randoms, reproducible entre demos.

# Días que tarda cada FAMILIA de trámite, de mínimo a máximo. Las claves se
# buscan dentro del nombre normalizado, así el mapeo sobrevive a que se
# sumen trámites nuevos al catálogo (el que no matchea cae al default).
DURACION_TRAMITE_DIAS = [
    (("habilitacion",), (12, 20)),   # inspección de rubro + verificación
    (("obra",), (5, 10)),            # visado de planos
    (("licencia",), (1, 3)),         # psicofísico y entrega
    (("libre deuda",), (0, 0)),      # se emite en el mostrador, mismo día
    (("plan de pago",), (1, 2)),
]
DURACION_TRAMITE_DEFAULT = (2, 5)


def _hora_mostrador(i: int) -> tuple:
    """Hora de atención al público (08 a 13). Que todas las solicitudes de
    la demo tengan la misma hora — o peor, medianoche — es lo primero que
    se nota al abrir la bandeja ordenada por fecha."""
    return 8 + (i * 5) % 6, (i * 17) % 60


def _duracion_tramite_dias(nombre: str, i: int) -> int:
    """Días que tarda ESE tipo de trámite en resolverse. Dos solicitudes del
    mismo trámite no tardan igual, pero una habilitación comercial siempre
    tarda más que un libre deuda: el ranking por tipo se sostiene."""
    nom = _sin_tildes(nombre or "").lower()
    lo, hi = DURACION_TRAMITE_DEFAULT
    for claves, rango in DURACION_TRAMITE_DIAS:
        if any(c in nom for c in claves):
            lo, hi = rango
            break
    return lo + (i % (hi - lo + 1))


def _fecha_solicitud(i: int, estado) -> datetime:
    """created_at de una solicitud, esparcido ~90 días hacia atrás.
    Las CERRADAS son viejas (25-89 días) para que su resolución también
    caiga en el pasado; las pospuestas quedan en el medio (son las que
    "vienen arrastrándose"); las abiertas son recientes (0-12 días) — una
    bandeja con trabajo activo de esta semana, no un archivo muerto."""
    if estado in (EstadoSolicitud.FINALIZADO, EstadoSolicitud.RECHAZADO):
        dias = 25 + (i * 7) % 65
    elif estado == EstadoSolicitud.POSPUESTO:
        dias = 18 + (i * 11) % 40
    else:
        dias = (i * 5) % 13
    hh, mm = _hora_mostrador(i)
    fecha = (datetime.utcnow() - timedelta(days=dias)).replace(
        hour=hh, minute=mm, second=0, microsecond=0)
    # Nunca futura: con dias=0 la hora de mostrador puede caer más tarde que
    # el momento real de la creación de la demo.
    return min(fecha, datetime.utcnow() - timedelta(hours=1))


def _fecha_resolucion_solicitud(creado: datetime, nombre_tramite: str, i: int) -> datetime:
    """Cierre = creación + la duración del TIPO de trámite. Nunca futura y
    nunca igual a la creación (el libre deuda cierra el mismo día, pero unas
    horas después: es un mostrador, no un batch)."""
    dias = _duracion_tramite_dias(nombre_tramite, i)
    resol = (creado + timedelta(days=dias)).replace(
        hour=9 + (i * 3) % 5, minute=(i * 23) % 60, second=0, microsecond=0)
    if resol <= creado:
        resol = creado + timedelta(hours=1 + i % 3)
    return min(resol, datetime.utcnow() - timedelta(hours=1))


# Mix de una agenda REAL: la mayoría de los turnos se cumple, algunos faltan
# y alguno se cancela. 8 cumplidos / 2 ausentes / 1 cancelado por cada 11,
# repartidos por índice (no al azar) para que los KPIs de la agenda den
# siempre lo mismo en todas las demos.
_CICLO_TURNO_PASADO = (
    "cumplido", "cumplido", "ausente", "cumplido", "cumplido", "cancelado",
    "cumplido", "cumplido", "ausente", "cumplido", "cumplido",
)


def _estado_turno_pasado(i: int) -> str:
    """Estado con el que se cierra un turno cuya fecha ya pasó. NINGÚN turno
    vencido puede quedar en 'reservado' — es el síntoma más visible de que
    la data es sintética."""
    return _CICLO_TURNO_PASADO[i % len(_CICLO_TURNO_PASADO)]


# Devoluciones de vecinos sobre reclamos cerrados. Cortas y con matices
# (no todas elogiosas), como las de una app en uso.
COMENTARIOS_CALIFICACION = [
    "Vinieron al otro día y lo dejaron impecable.",
    "Tardaron un poco pero lo resolvieron bien.",
    "Muy buen trato de la cuadrilla, muy amables.",
    "Se solucionó, aunque nadie avisó cuándo iban a venir.",
    "Rápido y prolijo, se nota el trabajo.",
    "Lo arreglaron, pero hubo que insistir por teléfono.",
    "Quedó bien resuelto, gracias por el seguimiento.",
    "Conforme con el resultado, ojalá siempre sea así.",
]


RECLAMOS_DEMO = [
    # --- Servicios Públicos (4 — alumbrado x3 + residuos x1) ---
    {
        "titulo": "Luminaria quemada en Plaza Central",
        "descripcion": "La luminaria de la esquina noroeste de la plaza central lleva una semana sin funcionar. La zona queda muy oscura de noche.",
        "categoria_nombre": "Alumbrado público",
        "estado": EstadoReclamo.EN_CURSO,
        "direccion": "Plaza Central, esquina noroeste",
        "dependencia_codigo": "SERVICIOS_PUBLICOS",
        "zona_nombre": "Centro",
        "barrio_nombre": "Centro",
        "lat_offset": 0.002,
        "lng_offset": 0.001,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Asignado a Carlos Gómez (Cuadrilla Alumbrado). Se envió cuadrilla de mantenimiento."},
        ],
    },
    {
        "titulo": "Falta de alumbrado en Villa Norte",
        "descripcion": "Toda la cuadra de Villa Norte está sin luz desde hace varios días, los vecinos piden recorrida urgente.",
        "categoria_nombre": "Alumbrado público",
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Calle Güemes al 400, Villa Norte",
        "dependencia_codigo": "SERVICIOS_PUBLICOS",
        "zona_nombre": "Norte",
        "barrio_nombre": "Villa Norte",
        "lat_offset": -0.018,
        "lng_offset": 0.003,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Poste de luz caído tras la tormenta",
        "descripcion": "Un poste de alumbrado quedó caído sobre la vereda después de la tormenta de anoche. Riesgo para los peatones.",
        "categoria_nombre": "Alumbrado público",
        "estado": EstadoReclamo.FINALIZADO,
        "direccion": "Sarmiento y Los Álamos",
        "dependencia_codigo": "SERVICIOS_PUBLICOS",
        "zona_nombre": "Oeste",
        "barrio_nombre": "Los Álamos",
        "lat_offset": -0.014,
        "lng_offset": -0.017,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Cuadrilla de Alumbrado despachada por riesgo eléctrico."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO, "comentario": "Se retiró el poste caído y se repuso la luminaria."},
        ],
    },
    {
        "titulo": "Basura acumulada en esquina",
        "descripcion": "Hace tres días que no pasa el recolector por la esquina de Mitre y Belgrano. La basura se está acumulando.",
        "categoria_nombre": "Recolección de residuos",
        "estado": EstadoReclamo.FINALIZADO,
        "direccion": "Mitre y Belgrano",
        "dependencia_codigo": "SERVICIOS_PUBLICOS",
        "zona_nombre": "Norte",
        "barrio_nombre": "Belgrano",
        "lat_offset": -0.012,
        "lng_offset": 0.008,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Se coordinó con el servicio de recolección"},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO, "comentario": "Recolección normalizada en la zona"},
        ],
    },
    # --- Obras Públicas (3) ---
    {
        "titulo": "Bache peligroso en Av. San Martín",
        "descripcion": "Hay un bache de gran tamaño en Av. San Martín al 800 que representa un riesgo para los vehículos y peatones.",
        "categoria_nombre": "Bacheo y calles",
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Av. San Martín 800",
        "dependencia_codigo": "OBRAS_PUBLICAS",
        "zona_nombre": "Sur",
        "barrio_nombre": "San Martín",
        "lat_offset": 0.015,
        "lng_offset": -0.010,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Vereda hundida por raíces",
        "descripcion": "Las raíces de un árbol levantaron las baldosas de la vereda, varios vecinos ya tropezaron.",
        "categoria_nombre": "Bacheo y calles",
        "estado": EstadoReclamo.FINALIZADO,
        "direccion": "Güemes al 250",
        "dependencia_codigo": "OBRAS_PUBLICAS",
        "zona_nombre": "Este",
        "barrio_nombre": "Güemes",
        "lat_offset": 0.007,
        "lng_offset": -0.011,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Se programó la reconstrucción del tramo con Obras Públicas."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO, "comentario": "Vereda reconstruida y raíz podada por espacios verdes."},
        ],
    },
    {
        "titulo": "Zanja sin señalizar tras arreglo de cañería",
        "descripcion": "Quedó una zanja abierta después de un arreglo de agua y no tiene ningún vallado ni cinta de precaución.",
        "categoria_nombre": "Bacheo y calles",
        "estado": EstadoReclamo.EN_CURSO,
        "direccion": "Rivadavia y Belgrano",
        "dependencia_codigo": "OBRAS_PUBLICAS",
        "zona_nombre": "Periferia",
        "barrio_nombre": "Las Lomas",
        "lat_offset": 0.021,
        "lng_offset": 0.012,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Cuadrilla de bacheo asignada para vallar y reparar."},
        ],
    },
    # --- Tránsito y Vialidad (3) ---
    {
        "titulo": "Semáforo intermitente en Rivadavia y Sarmiento",
        "descripcion": "El semáforo de la intersección Rivadavia y Sarmiento está en modo intermitente desde ayer a la tarde.",
        "categoria_nombre": "Tránsito y señalización",
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Rivadavia y Sarmiento",
        "dependencia_codigo": "TRANSITO_VIAL",
        "zona_nombre": "Este",
        "barrio_nombre": "Rivadavia",
        "lat_offset": 0.005,
        "lng_offset": 0.018,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Falta de señalización en cruce escolar",
        "descripcion": "El cruce peatonal frente a la escuela no tiene demarcación horizontal ni cartel de reductor de velocidad.",
        "categoria_nombre": "Tránsito y señalización",
        "estado": EstadoReclamo.FINALIZADO,
        "direccion": "La Estación y Belgrano",
        "dependencia_codigo": "TRANSITO_VIAL",
        "zona_nombre": "Centro",
        "barrio_nombre": "La Estación",
        "lat_offset": 0.004,
        "lng_offset": -0.004,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Se pidió la demarcación al área de señalamiento vial."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO, "comentario": "Senda peatonal demarcada y cartel de reductor colocado."},
        ],
    },
    {
        "titulo": "Cartel de PARE caído en Belgrano y Mitre",
        "descripcion": "El cartel de PARE de la esquina está tirado en el pasto desde el fin de semana, la esquina quedó sin señalización.",
        "categoria_nombre": "Tránsito y señalización",
        "estado": EstadoReclamo.EN_CURSO,
        "direccion": "Belgrano y Mitre",
        "dependencia_codigo": "TRANSITO_VIAL",
        "zona_nombre": "Norte",
        "barrio_nombre": "Belgrano",
        "lat_offset": -0.011,
        "lng_offset": 0.006,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Cuadrilla de señalización notificada para reposición."},
        ],
    },
    # --- Zoonosis (3) ---
    {
        "titulo": "Perros sueltos en Plaza Central",
        "descripcion": "Una jauría de perros sueltos anda por la plaza central, ya hubo un intento de mordedura a un chico.",
        "categoria_nombre": "Animales sueltos",
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Plaza Central",
        "dependencia_codigo": "ZOONOSIS",
        "zona_nombre": "Centro",
        "barrio_nombre": "Centro",
        "lat_offset": 0.001,
        "lng_offset": 0.002,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Enjambre de avispas en plaza del barrio",
        "descripcion": "Hay un panal de avispas en un árbol de la plaza del barrio, varios vecinos ya fueron picados.",
        "categoria_nombre": "Plagas y control",
        "estado": EstadoReclamo.FINALIZADO,
        "direccion": "Plaza de Los Álamos",
        "dependencia_codigo": "ZOONOSIS",
        "zona_nombre": "Oeste",
        "barrio_nombre": "Los Álamos",
        "lat_offset": -0.013,
        "lng_offset": -0.014,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Se despachó el equipo de control de plagas."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO, "comentario": "Panal removido; se recomendó no acercarse por 48 horas."},
        ],
    },
    {
        "titulo": "Perro atropellado necesita atención veterinaria",
        "descripcion": "Un perro sin dueño aparente fue atropellado y está herido sobre la vereda, necesita asistencia urgente.",
        "categoria_nombre": "Animales sueltos",
        "estado": EstadoReclamo.EN_CURSO,
        "direccion": "Parque Municipal",
        "dependencia_codigo": "ZOONOSIS",
        "zona_nombre": "Sur",
        "barrio_nombre": "Parque",
        "lat_offset": 0.011,
        "lng_offset": 0.009,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO, "comentario": "Se coordinó traslado con la veterinaria municipal."},
        ],
    },
]


# ============================================================
# Funciones helper de seed
# ============================================================

def _slug_palabra(texto: str) -> str:
    """Primera palabra significativa de un texto, sin acentos y en minúscula.
    Usado para derivar slugs de email (ej: "Alumbrado público" → "alumbrado")
    sin hardcodear un mapeo nombre→slug por fuera de los datos."""
    import unicodedata
    limpio = unicodedata.normalize("NFD", texto)
    limpio = "".join(c for c in limpio if unicodedata.category(c) != "Mn")
    return limpio.lower().split()[0]


def _sin_tildes(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()


def _codigo_zona(nombre: str, municipio_id: int) -> str:
    """Codigo corto y unico para una zona. `Zona.codigo` es VARCHAR(20)."""
    base = re.sub(r"[^A-Z0-9]+", "", _sin_tildes(nombre).upper())[:10] or "Z"
    return f"{base}-{municipio_id}"[:20]


async def _seed_zonas(
    db: AsyncSession,
    municipio_id: int,
    zonas_reales: list[dict],
) -> dict[str, Zona]:
    """Las zonas del municipio: las localidades REALES de esa ciudad, o ninguna.

    `zonas_reales` viene de `geo_ciudad` y son places de OpenStreetMap dentro
    del poligono oficial del municipio: en Lujan, Olivera / Open Door / Torres /
    Carlos Keen / Jauregui / Lezica y Torrezuri --- las localidades del partido,
    con su coordenada real.

    Si la lista viene vacia el municipio queda SIN zonas, a proposito. Antes
    caia a Centro/Norte/Sur/Este/Periferia y eso es peor que no tener nada: una
    zona vacia se nota y se corrige, un nombre inventado se toma por bueno.
    """
    zonas: dict[str, Zona] = {}
    for z in zonas_reales:
        nombre = (z.get("nombre") or "").strip()
        if not nombre or nombre in zonas:
            continue
        zona = Zona(
            municipio_id=municipio_id,
            nombre=nombre[:100],
            codigo=_codigo_zona(nombre, municipio_id),
            latitud_centro=z.get("lat"),
            longitud_centro=z.get("lon"),
            activo=True,
        )
        db.add(zona)
        zonas[nombre] = zona
    await db.flush()
    return zonas


async def _seed_barrios(
    db: AsyncSession,
    municipio_id: int,
    barrios_reales: list[dict],
) -> dict[str, Barrio]:
    """Los barrios REALES del municipio, o ninguno.

    Salen de OSM (`place=suburb|neighbourhood|quarter`) y por eso nacen
    `validado=True`: la coordenada es la que tiene mapeada OpenStreetMap, no una
    que calculamos nosotros.
    """
    barrios: dict[str, Barrio] = {}
    for b in barrios_reales:
        nombre = (b.get("nombre") or "").strip()
        if not nombre or nombre in barrios:
            continue
        barrio = Barrio(
            municipio_id=municipio_id,
            nombre=nombre[:100],
            latitud=b.get("lat"),
            longitud=b.get("lon"),
            tipo=b.get("tipo") or "suburb",
            validado=True,
        )
        db.add(barrio)
        barrios[nombre] = barrio
    await db.flush()
    return barrios


def _zona_para(zonas: dict[str, Zona], zona_nombre: Optional[str],
               idx: int) -> Optional[Zona]:
    """La zona de un empleado o cuadrilla, ahora que las zonas son REALES.

    `EMPLEADOS_DEMO`/`CUADRILLAS_DEMO` traen nombres de zona genéricos ("Sur",
    "Norte") que eran los de la lista vieja. Con las zonas de la ciudad de
    verdad ese match no da nunca, y sin esto los 7 empleados quedaban con
    `zona_id` NULL — el reparto por zona del tablero mostraba todo vacío.

    Se reparten por POSICIÓN sobre las zonas reales: determinístico, y cada
    operario queda a cargo de una localidad que existe.
    """
    if zona_nombre and zona_nombre in zonas:
        return zonas[zona_nombre]
    if not zona_nombre:
        return None  # los administrativos no tienen zona a propósito
    pool = list(zonas.values())
    return pool[idx % len(pool)] if pool else None


async def _seed_empleados(
    db: AsyncSession,
    municipio_id: int,
    cats_reclamo: dict[str, CategoriaReclamo],
    zonas: dict[str, Zona],
) -> list[Empleado]:
    """Crea 7 empleados con categoría principal, zona y telefono."""
    empleados = []
    for _i, (nombre, apellido, telefono, tipo, especialidad, cat_nombre,
             zona_nombre) in enumerate(EMPLEADOS_DEMO):
        cat = cats_reclamo.get(cat_nombre) if cat_nombre else None
        zona = _zona_para(zonas, zona_nombre, _i)
        empleado = Empleado(
            municipio_id=municipio_id,
            nombre=nombre,
            apellido=apellido,
            telefono=telefono,
            tipo=tipo,
            especialidad=especialidad,
            categoria_principal_id=cat.id if cat else None,
            zona_id=zona.id if zona else None,
            capacidad_maxima=8,
            activo=True,
        )
        db.add(empleado)
        empleados.append(empleado)
    await db.flush()

    # Poblar tabla intermedia empleado_categorias con la categoria principal
    for empleado, datos in zip(empleados, EMPLEADOS_DEMO):
        cat_nombre = datos[5]
        if cat_nombre:
            cat = cats_reclamo.get(cat_nombre)
            if cat:
                await db.execute(
                    empleado_categoria.insert().values(
                        empleado_id=empleado.id,
                        categoria_id=cat.id,
                        es_principal=True,
                    )
                )
    await db.flush()
    return empleados


async def _seed_cuadrillas(
    db: AsyncSession,
    municipio_id: int,
    empleados: list[Empleado],
    cats_reclamo: dict[str, CategoriaReclamo],
    zonas: dict[str, Zona],
) -> list[Cuadrilla]:
    """Crea 3 cuadrillas con líder + 1 miembro cada una."""
    cuadrillas = []
    from datetime import date
    for _i, (nombre, desc, cat_nombre, zona_nombre, lider_idx,
             miembro_idx) in enumerate(CUADRILLAS_DEMO):
        cat = cats_reclamo.get(cat_nombre)
        zona = _zona_para(zonas, zona_nombre, _i)
        cuadrilla = Cuadrilla(
            municipio_id=municipio_id,
            nombre=nombre,
            descripcion=desc,
            especialidad=cat_nombre if cat_nombre else None,
            categoria_principal_id=cat.id if cat else None,
            zona_id=zona.id if zona else None,
            capacidad_maxima=12,
            activo=True,
        )
        db.add(cuadrilla)
        cuadrillas.append(cuadrilla)
    await db.flush()

    # Asignar líder + miembro a cada cuadrilla
    for cuadrilla, datos in zip(cuadrillas, CUADRILLAS_DEMO):
        _, _, cat_nombre, _, lider_idx, miembro_idx = datos
        # Líder
        db.add(EmpleadoCuadrilla(
            empleado_id=empleados[lider_idx].id,
            cuadrilla_id=cuadrilla.id,
            es_lider=True,
            fecha_ingreso=date.today(),
            activo=True,
        ))
        # Miembro (evitar duplicar si líder == miembro)
        if miembro_idx != lider_idx:
            db.add(EmpleadoCuadrilla(
                empleado_id=empleados[miembro_idx].id,
                cuadrilla_id=cuadrilla.id,
                es_lider=False,
                fecha_ingreso=date.today(),
                activo=True,
            ))

        # Categoría principal en tabla intermedia
        if cat_nombre:
            cat = cats_reclamo.get(cat_nombre)
            if cat:
                await db.execute(
                    cuadrilla_categoria.insert().values(
                        cuadrilla_id=cuadrilla.id,
                        categoria_id=cat.id,
                        es_principal=True,
                    )
                )
    await db.flush()
    return cuadrillas


async def _seed_sla_configs(
    db: AsyncSession,
    municipio_id: int,
    cats_reclamo: dict[str, CategoriaReclamo],
) -> int:
    """Crea 5 SLA configs (4 por categoría + 1 general)."""
    count = 0
    for cat_nombre, resp, reso, alerta in SLA_CONFIGS_DEMO:
        cat_id = None
        if cat_nombre:
            cat = cats_reclamo.get(cat_nombre)
            if not cat:
                continue
            cat_id = cat.id
        db.add(SLAConfig(
            municipio_id=municipio_id,
            categoria_id=cat_id,
            prioridad=None,
            tiempo_respuesta=resp,
            tiempo_resolucion=reso,
            tiempo_alerta_amarilla=alerta,
            activo=True,
        ))
        count += 1
    await db.flush()
    return count


# ============================================================
# Función principal
# ============================================================

async def seed_demo_completo(
    db: AsyncSession,
    municipio_id: int,
    codigo: str,
    password: str = "demo123",
    log=None,
) -> dict:
    """
    Arma toda la estructura de datos para que un municipio demo sea
    funcional desde el primer login.

    Asume que las categorías (reclamo + trámite) ya fueron creadas por
    `crear_categorias_default()` y que la sesión tiene un flush pendiente
    con el municipio ya insertado.

    `log` es un `services.seed_log.SeedLog` opcional: si viene, cada etapa deja
    su nombre, estado, counts y duracion para la consola del super admin.

    Retorna un dict con info del seed para la response del endpoint.
    """
    from services.seed_log import SeedLog

    # Demo protegida por PIN: el alta puede pasar otra password (el PIN) y
    # todos los usuarios demo del muni nacen con ella en vez de demo123.
    hash_demo = get_password_hash(password)

    # Cargar municipio para usar sus coords como centro de zonas/barrios/reclamos
    muni = await db.get(Municipio, municipio_id)
    muni_lat = muni.latitud if muni and muni.latitud else -34.603722
    muni_lng = muni.longitud if muni and muni.longitud else -58.381592

    # Sin log del llamador se arma uno propio y no se guarda: asi los pasos se
    # escriben una sola vez y los scripts no necesitan saber que existe.
    log = log or SeedLog(muni.nombre if muni else codigo, codigo=codigo)

    # LA GEOGRAFIA DE ESTA CIUDAD, EN VIVO Y SIN CACHE PREVIO.
    # Poligono oficial desde `municipios_catalogo` + UNA consulta a Overpass
    # (cacheada en disco para la proxima demo de la misma ciudad). De ahi salen
    # las zonas, los barrios y los puntos con direccion real. Si algo no esta
    # disponible, `geografia` degrada y lo explica en `degradacion` --- nunca
    # levanta y nunca inventa nombres.
    geo_ctx = await geo_ciudad.geografia(
        db,
        nombre=muni.nombre if muni else codigo,
        pais=(muni.pais if muni and muni.pais else "AR"),
        cantidad_puntos=PUNTOS_GEO,
        lat=muni_lat, lon=muni_lng,
        log=log,
    )
    geo = geo_ctx["puntos"]

    # ------------------------------------------------------------------
    # 1. Habilitar dependencias del catálogo global
    # ------------------------------------------------------------------
    # Un solo SELECT con IN() en vez de N round-trips
    r = await db.execute(
        select(Dependencia).where(Dependencia.codigo.in_(DEPENDENCIAS_CODIGOS))
    )
    deps_por_codigo = {d.codigo: d for d in r.scalars().all()}
    muni_deps: dict[str, MunicipioDependencia] = {}
    for dep_codigo in DEPENDENCIAS_CODIGOS:
        dep = deps_por_codigo.get(dep_codigo)
        if not dep:
            continue
        muni_dep = MunicipioDependencia(
            municipio_id=municipio_id,
            dependencia_id=dep.id,
            activo=True,
            orden=len(muni_deps),
        )
        db.add(muni_dep)
        muni_deps[dep_codigo] = muni_dep
    await db.flush()
    log.hito("dependencias", dependencias=len(muni_deps),
             nombres=list(muni_deps.keys()))

    # ------------------------------------------------------------------
    # 2. Mapear categorías de reclamo → dependencias
    # ------------------------------------------------------------------
    r = await db.execute(
        select(CategoriaReclamo).where(CategoriaReclamo.municipio_id == municipio_id)
    )
    cats_reclamo = {c.nombre: c for c in r.scalars().all()}

    for dep_codigo, cat_nombres in DEPENDENCIA_CATEGORIAS_MAP.items():
        muni_dep = muni_deps.get(dep_codigo)
        if not muni_dep:
            continue
        # muni_dep.dependencia_id ya lo tenemos — no hace falta re-querear la Dependencia
        for cat_nombre in cat_nombres:
            cat = cats_reclamo.get(cat_nombre)
            if not cat:
                continue
            db.add(MunicipioDependenciaCategoria(
                municipio_id=municipio_id,
                dependencia_id=muni_dep.dependencia_id,
                categoria_id=cat.id,
                municipio_dependencia_id=muni_dep.id,
                activo=True,
            ))
    await db.flush()
    log.hito("categorias_reclamo", categorias=len(cats_reclamo))

    # ------------------------------------------------------------------
    # 3. Crear trámites con documentos requeridos
    # ------------------------------------------------------------------
    r = await db.execute(
        select(CategoriaTramite).where(CategoriaTramite.municipio_id == municipio_id)
    )
    cats_tramite = {c.nombre: c for c in r.scalars().all()}

    # Se crean los trámites OPERATIVOS (TRAMITES_DEMO, con solicitudes/turnos)
    # y los de COMPLETITUD (TRAMITES_CATALOGO_EXTRA): así ninguna categoría de
    # trámite del default queda con 0 tipos.
    tramites_creados: list[tuple] = []  # [(Tramite, t_data del seed)]
    for i, t_data in enumerate(TRAMITES_DEMO + TRAMITES_CATALOGO_EXTRA):
        cat = cats_tramite.get(t_data["categoria_tramite_nombre"])
        if not cat:
            continue
        # Crear docs como relación (cascade) — evita flush por trámite.
        docs = [
            TramiteDocumentoRequerido(
                nombre=doc_nombre,
                descripcion=doc_desc,
                obligatorio=obligatorio,
                orden=j,
            )
            for j, (doc_nombre, doc_desc, obligatorio) in enumerate(t_data["documentos"])
        ]
        tramite = Tramite(
            municipio_id=municipio_id,
            categoria_tramite_id=cat.id,
            nombre=t_data["nombre"],
            descripcion=t_data["descripcion"],
            tiempo_estimado_dias=t_data["tiempo_estimado_dias"],
            costo=t_data["costo"],
            tipo_pago=t_data.get("tipo_pago"),
            momento_pago=t_data.get("momento_pago"),
            modo_atencion=t_data.get("modo_atencion", "online"),
            duracion_turno_min=t_data.get("duracion_turno_min", 30),
            requiere_kyc=t_data.get("requiere_kyc", False),
            nivel_kyc_minimo=t_data.get("nivel_kyc_minimo"),
            activo=True,
            orden=i,
            documentos_requeridos=docs,
        )
        db.add(tramite)
        tramites_creados.append((tramite, t_data))
    await db.flush()

    # Mapeo trámite → dependencia (tabla pivot MunicipioDependenciaTramite).
    # Esto permite auto-asignar la dep al crear una solicitud desde el vecino.
    # Regla: CERO trámites huérfanos — el dep_codigo curado del seed manda y,
    # si el trámite no lo trae, se resuelve por su categoría con el mapa
    # canónico CATEGORIA_TRAMITE_DEP_MAP.
    from models.municipio_dependencia_tramite import MunicipioDependenciaTramite
    for tramite, t_data in tramites_creados:
        dep_codigo = t_data.get("dep_codigo") or CATEGORIA_TRAMITE_DEP_MAP.get(
            t_data["categoria_tramite_nombre"]
        )
        if not dep_codigo:
            continue
        muni_dep = muni_deps.get(dep_codigo)
        if not muni_dep:
            continue
        db.add(MunicipioDependenciaTramite(
            municipio_dependencia_id=muni_dep.id,
            tramite_id=tramite.id,
            activo=True,
        ))
    await db.flush()
    # Solo los trámites de TRAMITES_DEMO llevan actividad de ejemplo
    # (solicitudes) — los `solo_catalogo` completan el catálogo sin sumar
    # ruido al set operativo curado (regla 3).
    tramites_operativos = [
        (t, d) for t, d in tramites_creados if not d.get("solo_catalogo")
    ]
    log.hito("tramites", tramites=len(tramites_creados),
             operativos=len(tramites_operativos))

    # ------------------------------------------------------------------
    # 4. Crear usuarios demo
    # ------------------------------------------------------------------
    # Admin (1), supervisores (1 por dependencia habilitada) y vecino (1).
    # Los supervisores tienen email `supervisor-{dep_slug}@{codigo}.demo.com`
    # para que cada dependencia tenga su login demo independiente.
    admin_demo = User(
        email=f"admin@{codigo}.demo.com",
        nombre="Admin",
        apellido="Demo",
        password_hash=hash_demo,
        rol=RolUsuario.ADMIN,
        municipio_id=municipio_id,
        activo=True,
        cuenta_verificada=True,
    )
    db.add(admin_demo)

    # Un supervisor solo para las dependencias "activas" (las que tienen
    # contenido demo real) — el resto del catálogo queda habilitado pero sin
    # usuario propio, para no abrumar la demo con logins que no llevan a
    # ninguna bandeja cargada.
    supervisores_demo: list[User] = []
    for dep_codigo in DEPENDENCIAS_ACTIVAS:
        muni_dep = muni_deps.get(dep_codigo)
        if not muni_dep:
            continue
        # Nombre legible desde el código (ej: OBRAS_PUBLICAS → Obras Públicas)
        # Buscamos la Dependencia global para obtener el nombre bonito
        dep_obj = await db.get(Dependencia, muni_dep.dependencia_id)
        dep_nombre = dep_obj.nombre if dep_obj else dep_codigo
        slug = dep_codigo.lower().replace("_", "-")
        sup = User(
            email=f"supervisor-{slug}@{codigo}.demo.com",
            nombre="Supervisor",
            apellido=dep_nombre,
            password_hash=hash_demo,
            rol=RolUsuario.SUPERVISOR,
            municipio_id=municipio_id,
            municipio_dependencia_id=muni_dep.id,
            activo=True,
            cuenta_verificada=True,
        )
        db.add(sup)
        supervisores_demo.append(sup)

    # Vecino demo "como si ya hubiera pasado KYC Didit" — simula identidad
    # verificada con datos filiatorios completos. Los datos se derivan del
    # `codigo` del muni via hash determinístico: mismo muni => mismo vecino
    # siempre, pero munis distintos tienen DNIs/nombres/direcciones distintos.
    # Así las demos se ven realistas y no chocan entre sí.
    from datetime import date, datetime as _dt
    import hashlib

    _NOMBRES_M = ["Juan", "Carlos", "Jorge", "Pedro", "Martín", "Diego", "Pablo", "Lucas"]
    _NOMBRES_F = ["Ana", "María", "Laura", "Sofía", "Valentina", "Lucía", "Carolina", "Florencia"]
    _APELLIDOS = ["González", "Rodríguez", "López", "Martínez", "García", "Pérez",
                  "Fernández", "Sánchez", "Romero", "Torres", "Álvarez", "Ruiz"]

    # Hash determinístico a partir del código del muni.
    _h = int(hashlib.sha1(codigo.encode()).hexdigest(), 16)
    _sexo_idx = _h % 2
    _sexo_demo = "M" if _sexo_idx == 0 else "F"
    _nombre_demo = (_NOMBRES_M if _sexo_idx == 0 else _NOMBRES_F)[(_h >> 3) % 8]
    _apellido_demo = _APELLIDOS[(_h >> 7) % len(_APELLIDOS)]
    # DNI en rango plausible 25M-48M (mayores de edad con DNI argentino).
    _dni_demo = str(25_000_000 + (_h % 23_000_000))
    # Fecha nacimiento: 1965-2000 aprox (25-60 años).
    _anio = 1965 + ((_h >> 11) % 36)
    _mes = 1 + ((_h >> 17) % 12)
    _dia = 1 + ((_h >> 23) % 28)
    _fecha_nac_demo = date(_anio, _mes, _dia)
    # Tel: +54 9 11 + 4 dígitos del hash + 4 dígitos del hash.
    _tel_suffix = str(_h % 100_000_000).zfill(8)
    _telefono_demo = f"+54 9 11 {_tel_suffix[:4]}-{_tel_suffix[4:]}"

    # Direccion del vecino demo. Sale de los puntos ya geolocalizados de esta
    # ciudad: una calle real, con la altura que devolvio el geocoding o sin
    # altura si no la hay.
    #
    # OJO con lo que habia antes: se pedia el reverse a Nominatim EN VIVO dentro
    # del alta (con lo que la demo dependia de un servicio externo para crearse)
    # y a la calle real se le pegaba un numero de puerta sacado de un hash
    # ---`100 + ((_h >> 31) % 4900)`---, o sea una altura inventada presentada como
    # direccion real. Sin cache ahora queda la calle sola: preferible una
    # direccion incompleta a una que parece precisa y no lo es.
    _direccion_demo: Optional[str] = None
    if geo:
        _p_vecino = geo[_h % len(geo)]
        _direccion_demo = _p_vecino["direccion"]
        if _p_vecino.get("barrio"):
            _direccion_demo = f"{_direccion_demo}, {_p_vecino['barrio']}"

    vecino_demo = User(
        email=f"vecino@{codigo}.demo.com",
        nombre=_nombre_demo,
        apellido=_apellido_demo,
        dni=_dni_demo,
        telefono=_telefono_demo,
        direccion=_direccion_demo,
        sexo=_sexo_demo,
        fecha_nacimiento=_fecha_nac_demo,
        nacionalidad="ARG",
        nivel_verificacion=2,
        didit_session_id=f"demo-{codigo}",
        verificado_at=_dt.utcnow(),
        password_hash=hash_demo,
        rol=RolUsuario.VECINO,
        municipio_id=municipio_id,
        activo=True,
        cuenta_verificada=True,
    )
    db.add(vecino_demo)
    await db.flush()
    log.hito("usuarios", admin=1, vecino=1, supervisores=len(supervisores_demo),
             direccion_vecino=_direccion_demo)

    # ------------------------------------------------------------------
    # Tasas demo: partidas ABL + Patente + Multa + sus deudas
    # Determinístico por hash del codigo del muni. Asi cuando el vecino entra
    # ya ve tasas para pagar (engagement de la home).
    # ------------------------------------------------------------------
    from models.tasas import (
        TipoTasa, Partida, Deuda, EstadoPartida, EstadoDeuda,
    )
    from decimal import Decimal
    from datetime import date as _date, timedelta

    # Buscar tipos de tasa del catalogo global (cargados por seed_tipos_tasa.py).
    tipos_q = await db.execute(
        select(TipoTasa).where(TipoTasa.codigo.in_(["abl", "patente_automotor", "multa_transito"]))
    )
    tipos_map = {t.codigo: t for t in tipos_q.scalars().all()}

    # Solo generar si el catalogo esta poblado.
    if tipos_map:
        hoy = _date.today()

        # === Partida ABL === (asociada al domicilio del vecino)
        if "abl" in tipos_map:
            partida_abl = Partida(
                municipio_id=municipio_id,
                tipo_tasa_id=tipos_map["abl"].id,
                identificador=f"ABL-{((_h >> 7) % 900000 + 100000)}/{(_h % 9) + 1}",
                titular_user_id=vecino_demo.id,
                titular_dni=_dni_demo,
                titular_nombre=f"{_nombre_demo} {_apellido_demo}",
                objeto={
                    "direccion": _direccion_demo,
                    "superficie_m2": 80 + ((_h >> 11) % 120),
                    "zona": "B",
                },
                estado=EstadoPartida.ACTIVA,
            )
            db.add(partida_abl)
            await db.flush()

            # 3 boletas ABL: una pagada anterior, una pendiente actual, una vencida
            importe_abl = Decimal(str(12000 + ((_h >> 13) % 8000)))
            db.add_all([
                Deuda(  # vencida (bimestre anterior)
                    partida_id=partida_abl.id,
                    periodo=f"{hoy.year}-{str(max(1, hoy.month - 3)).zfill(2)}",
                    importe=importe_abl,
                    fecha_emision=hoy - timedelta(days=90),
                    fecha_vencimiento=hoy - timedelta(days=60),
                    estado=EstadoDeuda.VENCIDA,
                ),
                Deuda(  # pagada anterior
                    partida_id=partida_abl.id,
                    periodo=f"{hoy.year}-{str(max(1, hoy.month - 2)).zfill(2)}",
                    importe=importe_abl,
                    fecha_emision=hoy - timedelta(days=60),
                    fecha_vencimiento=hoy - timedelta(days=30),
                    estado=EstadoDeuda.PAGADA,
                    fecha_pago=_dt.utcnow() - timedelta(days=25),
                ),
                Deuda(  # pendiente actual
                    partida_id=partida_abl.id,
                    periodo=f"{hoy.year}-{str(hoy.month).zfill(2)}",
                    importe=importe_abl,
                    fecha_emision=hoy - timedelta(days=5),
                    fecha_vencimiento=hoy + timedelta(days=15),
                    estado=EstadoDeuda.PENDIENTE,
                ),
            ])

        # === Partida Patente === (dominio inventado)
        if "patente_automotor" in tipos_map:
            _letras = ["AB", "AC", "AD", "AE", "AF"]
            _letras2 = ["CD", "DF", "GH", "JK", "LM"]
            dominio = f"{_letras[(_h >> 17) % 5]}{((_h >> 19) % 900) + 100}{_letras2[(_h >> 23) % 5]}"
            partida_pat = Partida(
                municipio_id=municipio_id,
                tipo_tasa_id=tipos_map["patente_automotor"].id,
                identificador=dominio,
                titular_user_id=vecino_demo.id,
                titular_dni=_dni_demo,
                titular_nombre=f"{_nombre_demo} {_apellido_demo}",
                objeto={
                    "dominio": dominio,
                    "marca": ["Fiat", "Peugeot", "Volkswagen", "Toyota", "Ford"][(_h >> 25) % 5],
                    "modelo": ["Cronos", "208", "Gol", "Corolla", "Ka"][(_h >> 25) % 5],
                    "anio": 2018 + ((_h >> 27) % 7),
                },
                estado=EstadoPartida.ACTIVA,
            )
            db.add(partida_pat)
            await db.flush()

            importe_pat = Decimal(str(28000 + ((_h >> 29) % 15000)))
            db.add(Deuda(
                partida_id=partida_pat.id,
                periodo=f"{hoy.year}-Q{((hoy.month - 1) // 3) + 1}",
                importe=importe_pat,
                fecha_emision=hoy - timedelta(days=10),
                fecha_vencimiento=hoy + timedelta(days=20),
                estado=EstadoDeuda.PENDIENTE,
            ))

        # === Multa de transito === (one-shot)
        if "multa_transito" in tipos_map:
            partida_multa = Partida(
                municipio_id=municipio_id,
                tipo_tasa_id=tipos_map["multa_transito"].id,
                identificador=f"ACTA-{((_h >> 31) % 90000) + 10000}",
                titular_user_id=vecino_demo.id,
                titular_dni=_dni_demo,
                titular_nombre=f"{_nombre_demo} {_apellido_demo}",
                objeto={
                    "infraccion": "Estacionamiento en lugar prohibido",
                    "lugar": _direccion_demo,
                    "fecha_acta": (hoy - timedelta(days=20)).isoformat(),
                },
                estado=EstadoPartida.ACTIVA,
            )
            db.add(partida_multa)
            await db.flush()

            db.add(Deuda(
                partida_id=partida_multa.id,
                periodo=f"{hoy.year}-{str(max(1, hoy.month - 1)).zfill(2)}",
                importe=Decimal(str(15000 + ((_h >> 33) % 20000))),
                fecha_emision=hoy - timedelta(days=20),
                fecha_vencimiento=hoy + timedelta(days=10),
                estado=EstadoDeuda.PENDIENTE,
            ))

        await db.flush()
    log.hito("tasas", tipos_de_tasa=len(tipos_map),
             motivo=None if tipos_map else "catalogo global de tipos de tasa vacio",
             estado="ok" if tipos_map else "degradado")

    # ------------------------------------------------------------------
    # 5. Zonas + Barrios (geografía para mapa y selectors)
    # ------------------------------------------------------------------
    with log.paso("zonas") as _p:
        zonas = await _seed_zonas(db, municipio_id, geo_ctx["zonas"])
        if zonas:
            _p.ok(zonas=len(zonas), nombres=list(zonas.keys()))
        else:
            _p.degradado(
                "OSM no devolvio ninguna division para esta ciudad; el municipio "
                "queda sin zonas (antes se inventaban Centro/Norte/Sur)")
    with log.paso("barrios") as _p:
        barrios = await _seed_barrios(db, municipio_id, geo_ctx["barrios"])
        if barrios:
            _p.ok(barrios=len(barrios), nombres=list(barrios.keys())[:15])
        else:
            _p.degradado("OSM no tiene barrios mapeados dentro del poligono")

    # ------------------------------------------------------------------
    # 6. Empleados + Cuadrillas (personal operativo)
    # ------------------------------------------------------------------
    empleados = await _seed_empleados(db, municipio_id, cats_reclamo, zonas)
    cuadrillas = await _seed_cuadrillas(db, municipio_id, empleados, cats_reclamo, zonas)
    log.hito("empleados_cuadrillas", empleados=len(empleados),
             cuadrillas=len(cuadrillas),
             con_zona=sum(1 for e in empleados if e.zona_id))

    # Usuarios con rol EMPLEADO — sin esto no hay con qué entrar como el
    # operario de campo (ve "Mis Trabajos" y, si el módulo está activo, sus
    # Órdenes de Trabajo). Genérico y agnóstico: uno por cada empleado
    # "operario" de EMPLEADOS_DEMO (los "administrativo" no hacen campo), con
    # slug derivado de su categoría — nada hardcodeado a nombres puntuales,
    # así escala igual en cualquier demo nueva que se genere.
    empleados_login: list[User] = []
    for idx, (nombre, apellido, _tel, tipo, _esp, cat_nombre, _zona) in enumerate(EMPLEADOS_DEMO):
        if tipo != "operario" or idx >= len(empleados):
            continue
        slug = _slug_palabra(cat_nombre) if cat_nombre else f"campo-{idx + 1}"
        emp_user = User(
            email=f"empleado-{slug}@{codigo}.demo.com",
            nombre=nombre,
            apellido=apellido,
            password_hash=hash_demo,
            rol=RolUsuario.EMPLEADO,
            municipio_id=municipio_id,
            empleado_id=empleados[idx].id,
            activo=True,
            cuenta_verificada=True,
        )
        db.add(emp_user)
        empleados_login.append(emp_user)
    await db.flush()

    # ------------------------------------------------------------------
    # 7. SLA configs
    # ------------------------------------------------------------------
    sla_count = await _seed_sla_configs(db, municipio_id, cats_reclamo)
    log.hito("sla", sla_configs=sla_count)

    # ------------------------------------------------------------------
    # 8. Reclamos de ejemplo (con coords + zona + barrio)
    # ------------------------------------------------------------------
    # Crear reclamos y sus historiales en 2 pasos (no uno por uno):
    #   paso A: agregar todos los reclamos y flush UNA vez para obtener ids.
    #   paso B: agregar todos los historiales referenciando esos ids.
    reclamos_creados_list: list[Reclamo] = []
    historiales_data: list[tuple[int, list[dict]]] = []  # (idx_reclamo_en_lista, historial_dicts)
    import random as _random_rec
    _zonas_pool = list(zonas.values())
    _barrios_pool = list(barrios.values())
    _muni_deps_pool = list(muni_deps.values())
    for r_data in RECLAMOS_DEMO:
        cat = cats_reclamo.get(r_data["categoria_nombre"])
        if not cat:
            continue
        muni_dep = muni_deps.get(r_data["dependencia_codigo"])
        # Con puntos reales, la ubicacion del reclamo sale del punto y no del
        # offset: direccion de una calle que existe, y zona/barrio ya resueltos
        # --- el distrito por el poligono donde cayo, el barrio por el geocoding ---
        # asi que no hay que adivinarlos por nombre.
        idx_reclamo = len(reclamos_creados_list)
        punto = geo[_punto_con_focos(idx_reclamo) % len(geo)] if geo else None
        if punto:
            zona = zonas.get(punto.get("zona_nombre"))
            barrio = barrios.get(punto.get("barrio"))
        else:
            # Sin geografia real no hay zona ni barrio que adjudicar: los
            # nombres de `RECLAMOS_DEMO` son de la lista generica vieja y no
            # existen mas. Quedan en None y el fallback de abajo los reparte
            # entre las zonas reales, si las hay.
            zona = barrio = None

        # Fallback random si el match por nombre no devolvió nada — evita
        # quedar con FKs en NULL que rompen las queries agrupadas.
        if zona is None and _zonas_pool:
            zona = _random_rec.choice(_zonas_pool)
        if barrio is None and _barrios_pool:
            barrio = _random_rec.choice(_barrios_pool)
        if muni_dep is None and _muni_deps_pool:
            muni_dep = _random_rec.choice(_muni_deps_pool)

        # Mezcla de canales para que el demo muestre la omnicanalidad
        _canal_demo = ["app", "whatsapp", "ventanilla_asistida"][len(reclamos_creados_list) % 3]

        # Historia retrodatada + resolución coherente (posterior a la creación)
        # para los cerrados: la tendencia mensual y los focos "desde hace X
        # días" nacen con datos reales, no con todo apilado en hoy.
        _creado = _fecha_historica(idx_reclamo)
        _cerrado = r_data["estado"] in (EstadoReclamo.RESUELTO, EstadoReclamo.FINALIZADO)

        reclamo = Reclamo(
            municipio_id=municipio_id,
            titulo=r_data["titulo"],
            descripcion=r_data["descripcion"],
            estado=r_data["estado"],
            created_at=_creado,
            fecha_resolucion=(_creado + timedelta(days=2 + idx_reclamo % 4)) if _cerrado else None,
            prioridad=3,
            # SIN PUNTO REAL NO SE INVENTA UNA DIRECCION (regla 11). Antes caia
            # a "Calle Guemes al 400" con un offset sobre el centro del muni:
            # una calle que no existe y una chinche donde no paso nada. Ahora
            # queda el nombre del municipio (que es cierto) y SIN coordenada,
            # asi el mapa no muestra un pin falso. `direccion` es NOT NULL.
            direccion=punto["direccion"] if punto else (
                muni.nombre if muni else codigo),
            latitud=punto["lat"] if punto else None,
            longitud=punto["lon"] if punto else None,
            categoria_id=cat.id,
            zona_id=zona.id if zona else None,
            barrio_id=barrio.id if barrio else None,
            creador_id=vecino_demo.id,
            municipio_dependencia_id=muni_dep.id if muni_dep else None,
            canal=_canal_demo,
        )
        db.add(reclamo)
        reclamos_creados_list.append(reclamo)
        historiales_data.append(r_data["historial"])

    await db.flush()  # UN solo flush para obtener los ids de los 4 reclamos

    for reclamo, hist_list in zip(reclamos_creados_list, historiales_data):
        # El historial se reparte ENTRE la creación y el cierre del reclamo.
        # Si todos los pasos quedan con la hora del seed, la línea de tiempo
        # del detalle muestra un reclamo de hace 2 meses resuelto "hoy" —
        # el mismo síntoma que la solicitud que nace y muere en el mismo
        # segundo. El primer paso siempre es la creación.
        _ini = reclamo.created_at or datetime.utcnow()
        _fin = reclamo.fecha_resolucion or min(
            _ini + timedelta(days=2), datetime.utcnow())
        _pasos = max(len(hist_list) - 1, 1)
        for h_idx, h_data in enumerate(hist_list):
            _cuando = _ini if h_idx == 0 else _ini + (_fin - _ini) * h_idx / _pasos
            db.add(HistorialReclamo(
                reclamo_id=reclamo.id,
                usuario_id=vecino_demo.id,
                accion=h_data["accion"],
                estado_anterior=h_data.get("estado_anterior"),
                estado_nuevo=h_data.get("estado_nuevo"),
                comentario=h_data.get("comentario"),
                created_at=_cuando,
            ))
    reclamos_creados = len(reclamos_creados_list)
    await db.flush()
    _con_coord = sum(1 for r in reclamos_creados_list if r.latitud is not None)
    log.hito("reclamos", reclamos=reclamos_creados,
             con_coordenada_real=_con_coord,
             con_zona=sum(1 for r in reclamos_creados_list if r.zona_id),
             con_barrio=sum(1 for r in reclamos_creados_list if r.barrio_id),
             direcciones=[r.direccion for r in reclamos_creados_list[:10]],
             estado="ok" if _con_coord == reclamos_creados else "degradado",
             motivo=None if _con_coord == reclamos_creados else
             f"{reclamos_creados - _con_coord} reclamos sin coordenada: no habia "
             f"geografia real para esta ciudad (no se inventa una direccion)")

    # 8.bis. Calificaciones: parte de los reclamos cerrados ya viene con la
    # devolución del vecino, así la pantalla de calidad de atención nace con
    # datos en vez de "todavía no hay calificaciones".
    calificaciones_creadas = await _seed_calificaciones(db, reclamos_creados_list)
    log.hito("calificaciones", calificaciones=calificaciones_creadas)

    # 9. Solicitudes de ejemplo: 2 por trámite OPERATIVO (estados variados) —
    # los trámites `solo_catalogo` no generan solicitudes (regla 3).
    # Genera datos de demo realistas. El vecino demo es solicitante de la mitad;
    # el resto se genera como "otro vecino" sin user asociado (solo datos de contacto).
    solicitudes_creadas = 0

    # numero_tramite es UNIQUE GLOBAL (no por municipio). Arrancar desde el max
    # actual del año para no chocar con demos creadas previamente.
    _year = date.today().year
    _r = await db.execute(text(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(numero_tramite, 10) AS UNSIGNED)), 0) "
        "FROM solicitudes WHERE numero_tramite LIKE :patt"
    ), {"patt": f"SOL-{_year}-%"})
    _sol_offset = int(_r.scalar() or 0)
    _ASUNTOS_EXTRA = [
        "Solicitud iniciada por ventanilla",
        "Necesito resolver esto antes de fin de mes",
    ]
    # Una ventanilla que funciona CIERRA la mayor parte de lo que recibe: con
    # 2 finalizados cada 8 el KPI de tiempo de resolución se calculaba sobre 3
    # expedientes y el promedio no significaba nada. Ahora ~1 de cada 3 está
    # cerrado, con su duración por tipo de trámite.
    _ESTADOS_CICLO = [
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.FINALIZADO,
        EstadoSolicitud.EN_CURSO,
        EstadoSolicitud.FINALIZADO,
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.POSPUESTO,
        EstadoSolicitud.EN_CURSO,
        EstadoSolicitud.FINALIZADO,
    ]

    for t_idx, (tramite, t_data) in enumerate(tramites_operativos):
        for j in range(2):
            sol_idx = t_idx * 2 + j
            _sh = int(hashlib.sha1(f"{codigo}-sol-{sol_idx}".encode()).hexdigest(), 16)
            estado = _ESTADOS_CICLO[sol_idx % len(_ESTADOS_CICLO)]

            es_del_vecino = (sol_idx % 2 == 0)
            _nom_sol = _nombre_demo if es_del_vecino else (
                ["Mariana", "Roberto", "Claudia", "Héctor", "Patricia"][_sh % 5]
            )
            _ape_sol = _apellido_demo if es_del_vecino else (
                ["Díaz", "Morales", "Herrera", "Castro", "Ríos"][_sh % 5]
            )
            _dni_sol = _dni_demo if es_del_vecino else str(30_000_000 + (_sh % 18_000_000))

            # Buscar dep asignada para este trámite (el t_data del seed viaja
            # junto al Tramite, así el índice nunca se desalinea). Si no hay
            # match, fallback a una dependencia random del muni para no dejar
            # la solicitud huérfana (las queries por dependencia la omitirían).
            dep_id_sol = None
            dep_code = t_data.get("dep_codigo")
            if dep_code:
                muni_dep_obj = muni_deps.get(dep_code)
                if muni_dep_obj:
                    dep_id_sol = muni_dep_obj.id
            if dep_id_sol is None and muni_deps:
                import random as _random
                dep_id_sol = _random.choice(list(muni_deps.values())).id

            # Historia del expediente: nace repartida ~90 días hacia atrás y
            # cierra tantos días después como tarde ESE tipo de trámite (una
            # habilitación comercial no se resuelve como un libre deuda).
            _creado_sol = _fecha_solicitud(sol_idx, estado)
            _cerrada = estado in (EstadoSolicitud.FINALIZADO, EstadoSolicitud.RECHAZADO)
            _resol_sol = _fecha_resolucion_solicitud(
                _creado_sol, tramite.nombre, sol_idx) if _cerrada else None
            # Paso intermedio (en curso / pospuesto / cierre): entre la
            # creación y hoy, nunca en el futuro.
            _cambio_sol = _resol_sol or min(
                _creado_sol + timedelta(days=1 + sol_idx % 3),
                datetime.utcnow() - timedelta(hours=1))

            numero = f"SOL-{_year}-{(_sol_offset + sol_idx + 1):05d}"
            sol = Solicitud(
                municipio_id=municipio_id,
                numero_tramite=numero,
                tramite_id=tramite.id,
                asunto=f"{tramite.nombre} — {_nom_sol} {_ape_sol}",
                descripcion=_ASUNTOS_EXTRA[j % len(_ASUNTOS_EXTRA)],
                estado=estado,
                solicitante_id=vecino_demo.id if es_del_vecino else None,
                nombre_solicitante=_nom_sol,
                apellido_solicitante=_ape_sol,
                dni_solicitante=_dni_sol,
                email_solicitante=f"vecino@{codigo}.demo.com" if es_del_vecino else f"{_nom_sol.lower()}@mail.com",
                telefono_solicitante=_telefono_demo if es_del_vecino else None,
                direccion_solicitante=_direccion_demo if es_del_vecino else None,
                municipio_dependencia_id=dep_id_sol,
                prioridad=2 + (sol_idx % 3),
                created_at=_creado_sol,
                fecha_resolucion=_resol_sol,
            )
            db.add(sol)
            await db.flush()

            db.add(HistorialSolicitud(
                solicitud_id=sol.id,
                usuario_id=vecino_demo.id if es_del_vecino else None,
                estado_nuevo=EstadoSolicitud.RECIBIDO,
                accion="Solicitud creada",
                comentario="Solicitud generada automáticamente en la demo.",
                created_at=_creado_sol,
            ))
            if estado != EstadoSolicitud.RECIBIDO:
                db.add(HistorialSolicitud(
                    solicitud_id=sol.id,
                    usuario_id=supervisores_demo[0].id if supervisores_demo else None,
                    estado_anterior=EstadoSolicitud.RECIBIDO,
                    estado_nuevo=estado,
                    accion=f"Cambio a {estado.value}",
                    comentario="Avance del trámite (demo).",
                    created_at=_cambio_sol,
                ))
            solicitudes_creadas += 1
    await db.flush()
    log.hito("solicitudes", solicitudes=solicitudes_creadas)

    # ------------------------------------------------------------------
    # 10. Órdenes de trabajo (el circuito de campo formal sobre los reclamos)
    # ------------------------------------------------------------------
    ots_creadas = await _seed_ordenes_trabajo(
        db, municipio_id, reclamos_creados_list, cuadrillas, empleados, admin_demo.id,
    )

    # Inventario demo (activos + consumibles) — se cruza con las OT.
    log.hito("ordenes_trabajo", ordenes_trabajo=ots_creadas)

    from services.inventario_seed import seed_inventario
    inv_res = await seed_inventario(db, municipio_id, incluir_demo=True)
    log.hito("inventario", items=inv_res["items"])

    # La OT ya no tiene catálogo propio de "tipos de trabajo": clasifica con las
    # categorías de reclamo del muni (sembradas en categorias_seed), así que acá
    # no hay nada extra que sembrar.

    # Activar los módulos opt-in en los munis demo, así la demo muestra el
    # circuito completo (campo + inventario + sueldos + contaduría). El seed
    # corre una sola vez por muni nuevo, no hace falta chequear duplicados.
    from models.municipio_modulo import MunicipioModulo
    _modulos = ('ordenes_trabajo', 'inventario', 'sueldos', 'contaduria')
    for _mod in _modulos:
        db.add(MunicipioModulo(municipio_id=municipio_id, modulo=_mod, activo=True))
    await db.flush()
    log.hito("modulos", modulos=list(_modulos))

    return {
        "dependencias": len(muni_deps),
        "dependencias_activas": len(supervisores_demo),
        "tramites": len(tramites_creados),
        "usuarios": 2 + len(supervisores_demo) + len(empleados_login),  # admin + vecino + supervisores + logins de empleado
        "zonas": len(zonas),
        "barrios": len(barrios),
        "empleados": len(empleados),
        "cuadrillas": len(cuadrillas),
        "sla_configs": sla_count,
        "reclamos": reclamos_creados,
        "calificaciones": calificaciones_creadas,
        "solicitudes": solicitudes_creadas,
        "ordenes_trabajo": ots_creadas,
        "inventario_items": inv_res["items"],
        # La demo tiene que poder DECIR si hablo de la ciudad del cliente o si
        # se quedo corta. Sin esto una demo sin geografia se ve igual de bien en
        # la respuesta del alta y el problema aparece recien en pantalla.
        "geografia": {
            "fuente_poligono": geo_ctx.get("fuente_poligono"),
            "degradacion": geo_ctx.get("degradacion"),
            "zonas_reales": [z["nombre"] for z in geo_ctx.get("zonas") or []],
            "barrios_reales": [b["nombre"] for b in geo_ctx.get("barrios") or []],
            "puntos": len(geo),
        },
    }


# ============================================================
# Calificaciones demo (la devolución del vecino sobre lo cerrado)
# ============================================================

async def _seed_calificaciones(db: AsyncSession, reclamos: list) -> int:
    """Califica la MITAD (determinística) de los reclamos cerrados.

    Que califiquen todos es tan falso como que no califique nadie: en la
    realidad contesta una parte. Se toma uno sí y uno no sobre los cerrados,
    con puntuaciones 3-5 y alguna 2 (un municipio con 5,0 perfecto no le
    cree nadie), sub-puntajes coherentes con la nota general y 1 de cada 3
    sin comentario. La fecha es 1-5 días DESPUÉS de la resolución — el
    vecino contesta cuando ya vio el trabajo hecho.
    """
    from models.calificacion import Calificacion

    ahora = datetime.utcnow()
    cerrados = [r for r in reclamos
                if r.estado in (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO)]
    creadas = 0
    for k, rec in enumerate(cerrados):
        if k % 2:  # uno sí, uno no
            continue
        # `n` es el número de calificación (no de reclamo): así las primeras
        # tres ya cubren un 5, un 3 y un 4. Con el ciclo sobre `k` un demo
        # chico daba 5-5-4 y un promedio de 4,7 que no le cree nadie.
        n = k // 2
        puntuacion = (5, 3, 4, 5, 2, 4, 5, 3)[n % 8]
        base = rec.fecha_resolucion or rec.created_at or ahora
        cuando = base + timedelta(days=1 + (n % 5), hours=(n * 7) % 10)
        if cuando >= ahora:
            cuando = ahora - timedelta(hours=6)
        db.add(Calificacion(
            reclamo_id=rec.id,
            usuario_id=rec.creador_id,
            puntuacion=puntuacion,
            # El que puntúa alto suele quejarse igual de la demora, y al
            # revés: los sub-puntajes se mueven alrededor de la nota, no la
            # repiten.
            tiempo_respuesta=max(1, min(5, puntuacion - (1 if n % 3 == 0 else 0))),
            calidad_trabajo=max(1, min(5, puntuacion + (1 if n % 4 == 0 else 0))),
            atencion=max(1, min(5, puntuacion + (1 if puntuacion < 5 else 0))),
            comentario=None if n % 3 == 2 else COMENTARIOS_CALIFICACION[
                n % len(COMENTARIOS_CALIFICACION)],
            tags="rapido,amable" if puntuacion >= 4 else "demoro",
            created_at=cuando,
        ))
        creadas += 1
    await db.flush()
    return creadas


# ============================================================
# Órdenes de trabajo demo (circuito de campo formal)
# ============================================================

async def _seed_ordenes_trabajo(
    db: AsyncSession,
    municipio_id: int,
    reclamos: list,
    cuadrillas: list,
    empleados: list,
    creador_id: int,
) -> int:
    """10 OTs en estados variados, vinculadas a los reclamos demo.

    Cubre los casos que se muestran en demo: OT pendiente sin asignar,
    asignada a cuadrilla, en curso, completada (con horas reales y notas)
    y cancelada. Incluye 1 reclamo con 2 OTs (poda + bacheo del mismo
    evento), 1 OT que agrupa 2 reclamos, y 2 preventivas sin reclamo.
    """
    from datetime import date, time as _time, timedelta
    from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
    from models.enums import EstadoOrdenTrabajo

    hoy = date.today()
    ahora = datetime.utcnow()

    def _c(i):
        return cuadrillas[i % len(cuadrillas)].id if cuadrillas else None

    def _e(i):
        return empleados[i % len(empleados)].id if empleados else None

    def _r(i):
        return reclamos[i % len(reclamos)] if reclamos else None

    # (titulo, estado, cuadrilla_idx|None, empleado_idx|None, dias_prog,
    #  materiales, h_est, h_real, notas_cierre, reclamo_idxs)
    OTS = [
        ("Bacheo de la calzada", EstadoOrdenTrabajo.PENDIENTE, None, None, 3,
         [{"descripcion": "Asfalto en frío", "cantidad": 6, "unidad": "bolsas"}], 4.0, None, None, [0]),
        ("Reposición de luminaria", EstadoOrdenTrabajo.PENDIENTE, None, None, 2,
         [{"descripcion": "Lámpara LED 150W", "cantidad": 1, "unidad": "u"}], 2.0, None, None, [1]),
        ("Retiro de residuos acumulados", EstadoOrdenTrabajo.ASIGNADA, 0, 2, 1,
         None, 3.0, None, None, [2]),
        ("Recambio de semáforo", EstadoOrdenTrabajo.ASIGNADA, 1, 4, 2,
         [{"descripcion": "Controlador semafórico", "cantidad": 1, "unidad": "u"}], 6.0, None, None, [3]),
        ("Poda correctiva de arbolado", EstadoOrdenTrabajo.EN_CURSO, 2, 3, 0,
         [{"descripcion": "Combustible motosierra", "cantidad": 10, "unidad": "l"}], 5.0, None, None, [0]),
        ("Limpieza integral del sector", EstadoOrdenTrabajo.EN_CURSO, 0, 2, 0,
         None, 4.0, None, None, [1, 2]),
        ("Nivelación y compactado", EstadoOrdenTrabajo.EN_CURSO, 0, 0, 0,
         [{"descripcion": "Tosca", "cantidad": 2, "unidad": "m3"}], 8.0, None, None, [3]),
        ("Reparación de vereda hundida", EstadoOrdenTrabajo.COMPLETADA, 0, 0, -2,
         [{"descripcion": "Cemento", "cantidad": 4, "unidad": "bolsas"}], 6.0, 5.0,
         "Trabajo terminado sin observaciones. Se repuso la baldosa faltante.", [0]),
        ("Mantenimiento preventivo de luminarias", EstadoOrdenTrabajo.COMPLETADA, 1, 1, -5,
         [{"descripcion": "Lámpara LED 150W", "cantidad": 4, "unidad": "u"}], 4.0, 3.5,
         "Recorrida completa del corredor. 4 luminarias recambiadas.", []),
        ("Desmalezado de banquinas", EstadoOrdenTrabajo.CANCELADA, 2, None, -1,
         None, 6.0, None, None, []),
    ]

    creadas = 0
    for i, (titulo, estado, c_idx, e_idx, dias, mat, h_est, h_real, notas, r_idxs) in enumerate(OTS):
        ot = OrdenTrabajo(
            municipio_id=municipio_id,
            numero=f"OT-{hoy.year}-{i + 1:04d}",
            estado=estado,
            titulo=titulo,
            descripcion=f"{titulo} — generada como ejemplo del circuito de campo.",
            cuadrilla_id=_c(c_idx) if c_idx is not None else None,
            empleado_id=_e(e_idx) if e_idx is not None else None,
            fecha_programada=hoy + timedelta(days=dias),
            hora_inicio=_time(8, 0),
            hora_fin=_time(12, 0),
            materiales=mat,
            horas_estimadas=h_est,
            horas_reales=h_real,
            notas_cierre=notas,
            motivo_cancelacion="Se resolvió por administración antes de salir a campo."
            if estado == EstadoOrdenTrabajo.CANCELADA else None,
            fecha_inicio_real=ahora - timedelta(hours=3)
            if estado in (EstadoOrdenTrabajo.EN_CURSO, EstadoOrdenTrabajo.COMPLETADA) else None,
            fecha_completada=ahora - timedelta(days=abs(dias))
            if estado == EstadoOrdenTrabajo.COMPLETADA else None,
            creador_id=creador_id,
        )
        db.add(ot)
        await db.flush()
        for r_idx in r_idxs:
            rec = _r(r_idx)
            if rec is not None:
                db.add(OrdenTrabajoReclamo(orden_trabajo_id=ot.id, reclamo_id=rec.id))
        creadas += 1
    await db.flush()
    return creadas


# ============================================================
# Turnero demo — se corre al FINAL del pipeline de crear-demo
# (después de seed_10_demos, que agrega trámites sin modo de atención)
# ============================================================

_MODOS_ONLINE_KW = ("libre deuda", "certificado", "constancia", "boleta")
_MODOS_SIN_TURNO_KW = ("denuncia", "reclamo")
_MODOS_KYC_KW = ("licencia", "conducir")


async def seed_turnero_demo(db: AsyncSession, municipio_id: int) -> dict:
    """Deja el turnero demoable: cura el modo de atención de TODOS los
    trámites del muni (los de seed_10_demos nacen 'online'), asegura que
    cada trámite presencial tenga oficina mapeada, y carga turnos de
    ejemplo (futuros reservados + pasados cumplidos/ausentes para que las
    estadísticas de la agenda muestren datos)."""
    import unicodedata
    from datetime import date, timedelta
    from models.municipio_dependencia_tramite import MunicipioDependenciaTramite
    from models.turno import Turno

    def _norm(s: str) -> str:
        s = unicodedata.normalize("NFD", (s or "").lower())
        return "".join(c for c in s if unicodedata.category(c) != "Mn")

    from datetime import time as _time
    from models.agenda_config import AgendaConfig

    tramites = (await db.execute(
        select(Tramite).where(Tramite.municipio_id == municipio_id, Tramite.activo == True)  # noqa: E712
    )).scalars().all()
    deps = (await db.execute(
        select(MunicipioDependencia).where(MunicipioDependencia.municipio_id == municipio_id)
    )).scalars().all()

    # Horarios de atención por dependencia (pantalla "Horarios" con datos
    # reales de demo, en vez del fallback invisible). La primera dependencia
    # muestra horario PARTIDO (mañana + tarde) — el caso que más vende.
    ya_config = set((await db.execute(
        select(AgendaConfig.municipio_dependencia_id).where(
            AgendaConfig.municipio_id == municipio_id)
    )).scalars().all())
    configs_creadas = 0
    for d_idx, dep in enumerate(deps):
        if dep.id in ya_config:
            continue
        if d_idx == 0:
            tramos = [(_time(8, 0), _time(12, 0), 3), (_time(14, 0), _time(17, 0), 2)]
            dias = range(0, 5)
        elif d_idx == len(deps) - 1:
            tramos = [(_time(9, 0), _time(13, 0), 2)]
            dias = range(0, 6)  # incluye sábado
        else:
            tramos = [(_time(8, 0), _time(13, 0), 2)]
            dias = range(0, 5)
        for dia in dias:
            for hi, hf, cupo in tramos:
                db.add(AgendaConfig(
                    municipio_id=municipio_id,
                    municipio_dependencia_id=dep.id,
                    dia_semana=dia, hora_inicio=hi, hora_fin=hf,
                    cupo_max_por_slot=cupo, activo=True,
                ))
                configs_creadas += 1
    await db.flush()

    # Feriados / aperturas especiales de ejemplo (pantalla "Horarios" nacía
    # siempre en "Sin feriados cargados" — vacío no vende el turnero).
    from models.agenda_excepcion import AgendaExcepcion
    ya_excepciones = set((await db.execute(
        select(AgendaExcepcion.municipio_dependencia_id).where(
            AgendaExcepcion.municipio_id == municipio_id)
    )).scalars().all())
    excepciones_creadas = 0
    hoy_exc = date.today()
    if deps:
        dep_feriado = deps[0]
        if dep_feriado.id not in ya_excepciones:
            db.add(AgendaExcepcion(
                municipio_id=municipio_id,
                municipio_dependencia_id=dep_feriado.id,
                fecha=hoy_exc + timedelta(days=9),
                tipo="cierre",
                motivo="Feriado provincial",
            ))
            excepciones_creadas += 1
        dep_apertura = deps[-1]
        if dep_apertura.id not in ya_excepciones:
            db.add(AgendaExcepcion(
                municipio_id=municipio_id,
                municipio_dependencia_id=dep_apertura.id,
                fecha=hoy_exc + timedelta(days=16),
                tipo="apertura_especial",
                motivo="Jornada especial de atención",
                hora_inicio_override=_time(9, 0),
                hora_fin_override=_time(13, 0),
            ))
            excepciones_creadas += 1
        await db.flush()

    vecino = (await db.execute(
        select(User).where(User.municipio_id == municipio_id, User.rol == RolUsuario.VECINO).limit(1)
    )).scalars().first()

    mapeados = set((await db.execute(
        select(MunicipioDependenciaTramite.tramite_id)
        .join(MunicipioDependencia,
              MunicipioDependencia.id == MunicipioDependenciaTramite.municipio_dependencia_id)
        .where(MunicipioDependencia.municipio_id == municipio_id)
    )).scalars().all())

    counts = {"con_turno": 0, "online": 0, "sin_turno": 0, "mapeados": 0,
              "turnos": 0, "agenda_configs": configs_creadas,
              "excepciones": excepciones_creadas}
    dep_i = 0
    con_turno: list[Tramite] = []
    for t in tramites:
        nom = _norm(t.nombre)
        if any(k in nom for k in _MODOS_KYC_KW):
            t.modo_atencion = "presencial_con_turno"
            t.duracion_turno_min = 45
            t.requiere_kyc = True
            t.nivel_kyc_minimo = 2
            counts["con_turno"] += 1
        elif any(k in nom for k in _MODOS_ONLINE_KW):
            t.modo_atencion = "online"
            counts["online"] += 1
        elif any(k in nom for k in _MODOS_SIN_TURNO_KW):
            t.modo_atencion = "presencial_sin_turno"
            counts["sin_turno"] += 1
        else:
            t.modo_atencion = "presencial_con_turno"
            t.duracion_turno_min = t.duracion_turno_min or 30
            counts["con_turno"] += 1
        if t.modo_atencion != "online":
            if t.id not in mapeados and deps:
                db.add(MunicipioDependenciaTramite(
                    municipio_dependencia_id=deps[dep_i % len(deps)].id,
                    tramite_id=t.id, activo=True,
                ))
                dep_i += 1
                counts["mapeados"] += 1
            if t.modo_atencion == "presencial_con_turno":
                con_turno.append(t)
    await db.flush()

    # Turnos de ejemplo sobre los trámites con turno (si hay vecino demo).
    # Futuros: próximos días hábiles a la mañana. Pasados: última semana con
    # estados variados para que los KPIs de la agenda no arranquen en cero.
    if vecino and con_turno and deps:
        dep_de = {}
        for fila in (await db.execute(
            select(MunicipioDependenciaTramite).join(
                MunicipioDependencia,
                MunicipioDependencia.id == MunicipioDependenciaTramite.municipio_dependencia_id)
            .where(MunicipioDependencia.municipio_id == municipio_id)
        )).scalars().all():
            dep_de[fila.tramite_id] = fila.municipio_dependencia_id

        def _dia_habil(base: date, delta: int) -> date:
            d = base + timedelta(days=delta)
            while d.weekday() >= 5:
                d += timedelta(days=1 if delta >= 0 else -1)
            return d

        hoy = date.today()
        nombre_vec = f"{vecino.nombre} {vecino.apellido or ''}".strip()
        # (delta_dias, hora, minuto, estado, recordatorio). delta 0 = HOY.
        TURNOS = [
            # Hoy: la Agenda del día muestra actividad apenas entran. El de
            # las 8:30 nace "reservado" a propósito — el guardarraíl de abajo
            # lo cierra si esa hora ya pasó. Al revés (nacer "cumplido") la
            # demo creada a las 7 de la mañana muestra un turno atendido en
            # el futuro, que es la misma mentira al espejo.
            (0, 8, 30, "reservado", True),
            (0, 11, 30, "reservado", True),
            (0, 12, 0, "reservado", True),
            # Próximos días hábiles (semana actual y siguiente)
            (1, 9, 0, "reservado", False),
            (1, 11, 0, "reservado", False),
            (2, 9, 30, "reservado", False),
            (2, 12, 30, "reservado", False),
            (3, 10, 0, "reservado", False),
            (4, 10, 30, "reservado", False),
            # Resto del mes hacia adelante — puebla la vista calendario
            (6, 9, 0, "reservado", False),
            (7, 9, 30, "reservado", False),
            (8, 11, 0, "reservado", False),
            (9, 10, 0, "reservado", False),
            (10, 9, 0, "reservado", False),
            (12, 10, 30, "reservado", False),
        ]
        # Historia del turnero: ~2 meses hacia atrás, un turno cada 3 días
        # hábiles, con el mix de una agenda real (8 cumplidos / 2 ausentes /
        # 1 cancelado por cada 11 — ver _estado_turno_pasado). Sin esta cola
        # la agenda arranca sin pasado y las estadísticas de asistencia no
        # tienen de dónde salir.
        for k in range(22):
            TURNOS.append((-(2 + k * 3), 8 + (k * 2) % 5, (0, 30)[k % 2],
                           _estado_turno_pasado(k), True))
        for j, (delta, hh, mm, estado, recordado) in enumerate(TURNOS):
            t = con_turno[j % len(con_turno)]
            dep_id = dep_de.get(t.id)
            if not dep_id:
                continue
            fh = datetime.combine(_dia_habil(hoy, delta), datetime.min.time()).replace(hour=hh, minute=mm)
            # Guardarraíl: un turno cuya hora YA pasó no puede quedar
            # "reservado" — pasa con los de hoy cuando la demo se crea a la
            # tarde. Se cierra con el mismo mix determinístico.
            if fh < datetime.now() and estado == "reservado":
                estado = _estado_turno_pasado(j)
            db.add(Turno(
                motivo_tipo="tramite",
                tramite_id=t.id,
                usuario_id=vecino.id,
                municipio_dependencia_id=dep_id,
                municipio_id=municipio_id,
                fecha_hora=fh,
                duracion_min=t.duracion_turno_min or 30,
                estado=estado,
                nombre_solicitante=nombre_vec or None,
                dni_solicitante=vecino.dni,
                telefono_solicitante=vecino.telefono,
                recordatorio_enviado_at=datetime.utcnow() - timedelta(days=abs(delta))
                if recordado else None,
            ))
            counts["turnos"] += 1
        await db.flush()

    # Turnos que ENVEJECIERON: una demo creada hace semanas queda con turnos
    # "reservados" de fecha vencida — el síntoma más visible de que la data
    # es sintética. Re-correr la semilla del turnero sobre ese muni los
    # cierra con el mismo mix determinístico (por id, así el resultado es
    # reproducible). En un muni recién creado esto no encuentra nada.
    vencidos = (await db.execute(
        select(Turno).where(
            Turno.municipio_id == municipio_id,
            Turno.estado == "reservado",
            Turno.fecha_hora < datetime.now(),
        )
    )).scalars().all()
    for t_viejo in vencidos:
        t_viejo.estado = _estado_turno_pasado(t_viejo.id)
    counts["vencidos_cerrados"] = len(vencidos)
    await db.flush()

    # NOTA: antes había un "balanceo" acá que le inyectaba 2 reclamos
    # sintéticos a CUALQUIER dependencia con <2 reclamos — incluidas las 6
    # dependencias habilitadas pero sin contenido demo (ver
    # DEPENDENCIAS_ACTIVAS en seed_demo.py). Eso llenaba de ruido el
    # organigrama y contradice la curación: solo las dependencias activas
    # deben mostrar actividad, el resto queda deliberadamente vacío.
    return counts
