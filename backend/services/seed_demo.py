"""
Seed completo para municipios demo.

Crea toda la estructura que un municipio necesita para ser funcional
desde el minuto 0: dependencias, trámites con docs requeridos, usuarios,
zonas, barrios, empleados, cuadrillas, SLAs, reclamos de ejemplo (con
coordenadas reales para el mapa) y una solicitud — además de las
categorías que ya siembra `crear_categorias_default()`.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from core.security import get_password_hash
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
# Zonas (offsets sobre el centro del muni, ~2km de radio)
# ============================================================
ZONAS_DEMO = [
    ("Centro",    "Z-CENTRO",    0.000,  0.000),
    ("Norte",     "Z-NORTE",    -0.020,  0.000),
    ("Sur",       "Z-SUR",       0.020,  0.000),
    ("Este",      "Z-ESTE",      0.000,  0.020),
    ("Oeste",     "Z-OESTE",     0.000, -0.020),
    ("Periferia", "Z-PERIFERIA", 0.025,  0.025),
]

# ============================================================
# Barrios (offsets sobre el centro, sin Nominatim)
# ============================================================
BARRIOS_DEMO = [
    ("Centro",         0.000,  0.000),
    ("Villa Norte",   -0.015,  0.002),
    ("San Martín",    -0.010, -0.008),
    ("Belgrano",       0.012,  0.005),
    ("Güemes",         0.008, -0.012),
    ("Sarmiento",     -0.005,  0.015),
    ("Rivadavia",      0.003,  0.018),
    ("Los Álamos",    -0.012, -0.015),
    ("Las Lomas",      0.018,  0.010),
    ("Parque",        -0.008,  0.010),
    ("La Estación",    0.005, -0.005),
    ("Periferia Sur",  0.022,  0.020),
]

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
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Sarmiento y Los Álamos",
        "dependencia_codigo": "SERVICIOS_PUBLICOS",
        "zona_nombre": "Oeste",
        "barrio_nombre": "Los Álamos",
        "lat_offset": -0.014,
        "lng_offset": -0.017,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
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
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Güemes al 250",
        "dependencia_codigo": "OBRAS_PUBLICAS",
        "zona_nombre": "Este",
        "barrio_nombre": "Güemes",
        "lat_offset": 0.007,
        "lng_offset": -0.011,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
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
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "La Estación y Belgrano",
        "dependencia_codigo": "TRANSITO_VIAL",
        "zona_nombre": "Centro",
        "barrio_nombre": "La Estación",
        "lat_offset": 0.004,
        "lng_offset": -0.004,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
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
        "estado": EstadoReclamo.RECIBIDO,
        "direccion": "Plaza de Los Álamos",
        "dependencia_codigo": "ZOONOSIS",
        "zona_nombre": "Oeste",
        "barrio_nombre": "Los Álamos",
        "lat_offset": -0.013,
        "lng_offset": -0.014,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
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

async def _seed_zonas(
    db: AsyncSession,
    municipio_id: int,
    codigo_muni: str,
    muni_lat: float,
    muni_lng: float,
) -> dict[str, Zona]:
    """Crea 6 zonas con coords offset sobre el centro del municipio."""
    zonas = {}
    for nombre, cod_zona, dlat, dlng in ZONAS_DEMO:
        # Sufijar con municipio_id (numérico, corto) para garantizar unicidad
        # global sin superar los 20 chars del VARCHAR(20) de Zona.codigo.
        zona = Zona(
            municipio_id=municipio_id,
            nombre=nombre,
            codigo=f"{cod_zona}-{municipio_id}",
            latitud_centro=muni_lat + dlat,
            longitud_centro=muni_lng + dlng,
            activo=True,
        )
        db.add(zona)
        zonas[nombre] = zona
    await db.flush()
    return zonas


async def _seed_barrios(
    db: AsyncSession,
    municipio_id: int,
    muni_lat: float,
    muni_lng: float,
) -> dict[str, Barrio]:
    """Crea 12 barrios hardcoded alrededor del centro del municipio."""
    barrios = {}
    for nombre, dlat, dlng in BARRIOS_DEMO:
        barrio = Barrio(
            municipio_id=municipio_id,
            nombre=nombre,
            latitud=muni_lat + dlat,
            longitud=muni_lng + dlng,
            tipo="suburb",
            validado=False,
        )
        db.add(barrio)
        barrios[nombre] = barrio
    await db.flush()
    return barrios


async def _seed_empleados(
    db: AsyncSession,
    municipio_id: int,
    cats_reclamo: dict[str, CategoriaReclamo],
    zonas: dict[str, Zona],
) -> list[Empleado]:
    """Crea 7 empleados con categoría principal, zona y telefono."""
    empleados = []
    for nombre, apellido, telefono, tipo, especialidad, cat_nombre, zona_nombre in EMPLEADOS_DEMO:
        cat = cats_reclamo.get(cat_nombre) if cat_nombre else None
        zona = zonas.get(zona_nombre) if zona_nombre else None
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
    for nombre, desc, cat_nombre, zona_nombre, lider_idx, miembro_idx in CUADRILLAS_DEMO:
        cat = cats_reclamo.get(cat_nombre)
        zona = zonas.get(zona_nombre)
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
) -> dict:
    """
    Arma toda la estructura de datos para que un municipio demo sea
    funcional desde el primer login.

    Asume que las categorías (reclamo + trámite) ya fueron creadas por
    `crear_categorias_default()` y que la sesión tiene un flush pendiente
    con el municipio ya insertado.

    Retorna un dict con info del seed para la response del endpoint.
    """
    hash_demo = get_password_hash("demo123")

    # Cargar municipio para usar sus coords como centro de zonas/barrios/reclamos
    muni = await db.get(Municipio, municipio_id)
    muni_lat = muni.latitud if muni and muni.latitud else -34.603722
    muni_lng = muni.longitud if muni and muni.longitud else -58.381592

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

    # ------------------------------------------------------------------
    # 3. Crear trámites con documentos requeridos
    # ------------------------------------------------------------------
    r = await db.execute(
        select(CategoriaTramite).where(CategoriaTramite.municipio_id == municipio_id)
    )
    cats_tramite = {c.nombre: c for c in r.scalars().all()}

    tramites_creados = []
    tramite_to_dep: dict[int, int] = {}  # tramite.id → muni_dep.id (post-flush)
    for i, t_data in enumerate(TRAMITES_DEMO):
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
        tramites_creados.append((tramite, t_data.get("dep_codigo")))
    await db.flush()

    # Mapeo trámite → dependencia (tabla pivot MunicipioDependenciaTramite).
    # Esto permite auto-asignar la dep al crear una solicitud desde el vecino.
    from models.municipio_dependencia_tramite import MunicipioDependenciaTramite
    for tramite, dep_codigo in tramites_creados:
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
    # Back-compat: resto del código espera list de Tramite
    tramites_creados = [t for t, _ in tramites_creados]

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

    # Dirección: reverse-geocode contra Nominatim con un offset determinístico
    # al centro del muni (~500m-2km). Así cada vecino demo vive en una calle
    # REAL de su muni, geocodeable en el mapa. Si Nominatim falla, queda None
    # y el vecino la carga al crear su primer trámite (que tiene autocomplete).
    _direccion_demo: Optional[str] = None
    try:
        import httpx as _httpx
        # Offset entre -0.01° y +0.01° (~1km) para no caer siempre en el mismo
        # punto, pero sin salir del muni.
        _dlat = ((((_h >> 37) % 2000) - 1000) / 100000.0)
        _dlng = ((((_h >> 43) % 2000) - 1000) / 100000.0)
        async with _httpx.AsyncClient(timeout=5.0) as _hc:
            _r = await _hc.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": muni_lat + _dlat,
                    "lon": muni_lng + _dlng,
                    "format": "json",
                    "zoom": 18,  # street-level
                    "addressdetails": 1,
                },
                headers={"User-Agent": "Munify/1.0 (demo seed)"},
            )
            if _r.status_code == 200:
                _data = _r.json()
                _addr = _data.get("address", {}) if isinstance(_data, dict) else {}
                _road = _addr.get("road") or _addr.get("pedestrian") or _addr.get("street")
                if _road:
                    _num = 100 + ((_h >> 31) % 4900)
                    _loc = _addr.get("suburb") or _addr.get("city_district") or _addr.get("city") or _addr.get("town") or _addr.get("village") or ""
                    _direccion_demo = f"{_road} {_num}" + (f", {_loc}" if _loc else "")
    except Exception:
        # Nominatim caido o timeout — el vecino queda sin direccion,
        # la completa al crear su primer tramite.
        pass

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

    # ------------------------------------------------------------------
    # 5. Zonas + Barrios (geografía para mapa y selectors)
    # ------------------------------------------------------------------
    zonas = await _seed_zonas(db, municipio_id, codigo, muni_lat, muni_lng)
    barrios = await _seed_barrios(db, municipio_id, muni_lat, muni_lng)

    # ------------------------------------------------------------------
    # 6. Empleados + Cuadrillas (personal operativo)
    # ------------------------------------------------------------------
    empleados = await _seed_empleados(db, municipio_id, cats_reclamo, zonas)
    cuadrillas = await _seed_cuadrillas(db, municipio_id, empleados, cats_reclamo, zonas)

    # Usuarios con rol EMPLEADO — sin esto no hay con qué entrar como el
    # operario de campo (ve "Mis Trabajos" y, si el módulo está activo, sus
    # Órdenes de Trabajo). Vinculados a los 2 empleados que ya tienen
    # reclamos/OTs asignados en la semilla curada (Bacheo y Alumbrado).
    empleados_login: list[User] = []
    for idx, slug in ((0, "bacheo"), (1, "alumbrado")):
        if idx < len(empleados):
            emp_user = User(
                email=f"empleado-{slug}@{codigo}.demo.com",
                nombre=EMPLEADOS_DEMO[idx][0],
                apellido=EMPLEADOS_DEMO[idx][1],
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
        zona = zonas.get(r_data["zona_nombre"])
        barrio = barrios.get(r_data["barrio_nombre"])

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

        reclamo = Reclamo(
            municipio_id=municipio_id,
            titulo=r_data["titulo"],
            descripcion=r_data["descripcion"],
            estado=r_data["estado"],
            prioridad=3,
            direccion=r_data["direccion"],
            latitud=muni_lat + r_data["lat_offset"],
            longitud=muni_lng + r_data["lng_offset"],
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
        for h_data in hist_list:
            db.add(HistorialReclamo(
                reclamo_id=reclamo.id,
                usuario_id=vecino_demo.id,
                accion=h_data["accion"],
                estado_anterior=h_data.get("estado_anterior"),
                estado_nuevo=h_data.get("estado_nuevo"),
                comentario=h_data.get("comentario"),
            ))
    reclamos_creados = len(reclamos_creados_list)
    await db.flush()

    # 9. Solicitudes de ejemplo: 2 por trámite del catálogo (estados variados).
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
    _ESTADOS_CICLO = [
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.EN_CURSO,
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.FINALIZADO,
        EstadoSolicitud.EN_CURSO,
        EstadoSolicitud.POSPUESTO,
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.FINALIZADO,
    ]

    for t_idx, tramite in enumerate(tramites_creados):
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

            # Buscar dep asignada para este trámite. Si no hay match, fallback
            # a una dependencia random del muni para no dejar la solicitud
            # huérfana (causaba que las queries por dependencia las omitieran).
            dep_id_sol = None
            if t_idx < len(TRAMITES_DEMO):
                dep_code = TRAMITES_DEMO[t_idx].get("dep_codigo")
                if dep_code:
                    muni_dep_obj = muni_deps.get(dep_code)
                    if muni_dep_obj:
                        dep_id_sol = muni_dep_obj.id
            if dep_id_sol is None and muni_deps:
                import random as _random
                dep_id_sol = _random.choice(list(muni_deps.values())).id

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
            )
            db.add(sol)
            await db.flush()

            db.add(HistorialSolicitud(
                solicitud_id=sol.id,
                usuario_id=vecino_demo.id if es_del_vecino else None,
                estado_nuevo=EstadoSolicitud.RECIBIDO,
                accion="Solicitud creada",
                comentario="Solicitud generada automáticamente en la demo.",
            ))
            if estado != EstadoSolicitud.RECIBIDO:
                db.add(HistorialSolicitud(
                    solicitud_id=sol.id,
                    usuario_id=supervisores_demo[0].id if supervisores_demo else None,
                    estado_anterior=EstadoSolicitud.RECIBIDO,
                    estado_nuevo=estado,
                    accion=f"Cambio a {estado.value}",
                    comentario="Avance del trámite (demo).",
                ))
            solicitudes_creadas += 1
    await db.flush()

    # ------------------------------------------------------------------
    # 10. Órdenes de trabajo (el circuito de campo formal sobre los reclamos)
    # ------------------------------------------------------------------
    ots_creadas = await _seed_ordenes_trabajo(
        db, municipio_id, reclamos_creados_list, cuadrillas, empleados, admin_demo.id,
    )

    # Activar los módulos opt-in en los munis demo, así la demo muestra el
    # circuito completo (campo + sueldos + contaduría). El seed corre una
    # sola vez por muni nuevo, no hace falta chequear duplicados.
    from models.municipio_modulo import MunicipioModulo
    for _mod in ('ordenes_trabajo', 'sueldos', 'contaduria'):
        db.add(MunicipioModulo(municipio_id=municipio_id, modulo=_mod, activo=True))
    await db.flush()

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
        "solicitudes": solicitudes_creadas,
        "ordenes_trabajo": ots_creadas,
    }


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
        # (delta_dias, hora, minuto, estado, recordatorio)
        # delta 0 = HOY: la Agenda del día muestra actividad apenas entran
        # (uno ya atendido a la mañana + dos reservados para más tarde).
        TURNOS = [
            # Hoy: la Agenda del día muestra actividad apenas entran
            # (uno ya atendido a la mañana + dos reservados para más tarde).
            (0, 8, 30, "cumplido", True),
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
            # Pasados recientes — cumplidos/ausentes/cancelado con recordatorio
            (-2, 9, 0, "cumplido", True),
            (-3, 9, 30, "cumplido", True),
            (-4, 10, 0, "cumplido", True),
            (-5, 11, 0, "ausente", True),
            (-6, 11, 30, "cancelado", False),
            # Resto del mes hacia atrás — completa la vista calendario
            (-8, 9, 0, "cumplido", True),
            (-9, 10, 0, "cumplido", True),
            (-11, 9, 30, "ausente", True),
            (-12, 11, 0, "cumplido", True),
        ]
        for j, (delta, hh, mm, estado, recordado) in enumerate(TURNOS):
            t = con_turno[j % len(con_turno)]
            dep_id = dep_de.get(t.id)
            if not dep_id:
                continue
            fh = datetime.combine(_dia_habil(hoy, delta), datetime.min.time()).replace(hour=hh, minute=mm)
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

    # NOTA: antes había un "balanceo" acá que le inyectaba 2 reclamos
    # sintéticos a CUALQUIER dependencia con <2 reclamos — incluidas las 6
    # dependencias habilitadas pero sin contenido demo (ver
    # DEPENDENCIAS_ACTIVAS en seed_demo.py). Eso llenaba de ruido el
    # organigrama y contradice la curación: solo las dependencias activas
    # deben mostrar actividad, el resto queda deliberadamente vacío.
    return counts
