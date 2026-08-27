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
# 140 = 50 reclamos + 50 solicitudes + el domicilio de los vecinos, con margen
# para que las direcciones NO se repitan salvo en los focos deliberados.
PUNTOS_GEO = 140


# ============================================================
# LA DEMO SON TRES MESES DE VIDA MUNICIPAL
# ============================================================
# Regla del dueño: "50 reclamos, 50 trámites y 50 cobros o pagos repartidos en
# tres meses hacia atrás; esa es la única parte estática. Cómo se resuelve cada
# caso se genera con cierta aleatoriedad para que ninguna demo sea igual."
#
# El VOLUMEN y la VENTANA son parámetros (abajo). Los CIRCUITOS —quién asignó,
# si hubo cuadrilla, si el vecino disputó el cierre— se sortean con una semilla
# que mezcla el código del municipio con su id, así dos demos de la MISMA ciudad
# salen distintas. Lo que NO se toca es la geografía: `geo_ciudad` siembra con el
# slug del nombre, o sea que las zonas, los barrios y las coordenadas de Luján
# son siempre las mismas, se cree la demo las veces que se cree.
VENTANA_DIAS = 90
OBJETIVO_RECLAMOS = 50
OBJETIVO_SOLICITUDES = 50
# Movimientos de plata (los "50 cobros o pagos"): 44 gastos históricos + 6 pagos
# programados. El reparto lo consume `seed_demo_tesoreria`. Se eligió 44/6 —y no
# 25/25— porque un pago programado es una REGLA que se repite todos los meses
# (sueldo, presentismo): con 25 la pantalla de Pagos Programados quedaría con más
# reglas que empleados tiene el municipio demo, mientras que el gasto es el hecho
# puntual y es el que llena la historia de los tres meses.
OBJETIVO_GASTOS = 44
OBJETIVO_PAGOS_PROGRAMADOS = 6

# Densidad: exponente de la curva índice→antigüedad. >1 concentra los casos en
# las semanas recientes (una bandeja con trabajo de esta semana, no un archivo
# muerto) sin dejar huecos: con 50 casos en 90 días el salto más grande entre
# dos consecutivos es de ~3 días.
CURVA_DENSIDAD = 1.55

# Cuántos reclamos comparten cada esquina recurrente. Regla del dueño: toda demo
# nace con RECURRENCIA real, para que el mapa de focos ("Dónde se repiten los
# reclamos", que agrupa por dirección con mínimo 2) tenga recorrido desde el día
# uno. El resto de los reclamos cae en un punto propio.
FOCOS_DEMO = (4, 3, 2)

# Reparto de la actividad entre los tres vecinos demo. Despareja a propósito:
# en un municipio real hay un vecino que reclama por todo y otros dos que
# aparecen de vez en cuando.
VECINOS_REPARTO = (0.50, 0.30, 0.20)

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
    # Con 50 reclamos repartidos en 9 categorías, los 5 operarios de arriba
    # dejaban Agua y cloacas y Zoonosis SIN nadie a cargo: el reclamo caía en el
    # round-robin y lo terminaba ejecutando el electricista. Estos dos cierran la
    # cobertura de las categorías que la demo usa.
    ("Sergio",  "Medina",    "+5491155550008", "operario",       "Redes de agua y cloacas", "Agua y cloacas",               None),
    ("Diego",   "Vera",      "+5491155550009", "operario",       "Zoonosis y plagas",       "Animales sueltos",             None),
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
    ("Cuadrilla Zoonosis",  "Equipo de control animal y plagas",             "Animales sueltos",           "Este",  8, 7),
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
    reclamos se apilan en tres esquinas (4 + 3 + 2, ver FOCOS_DEMO) para que el
    mapa de focos ("Dónde se repiten los reclamos" agrupa por dirección, mínimo
    2) tenga recorrido desde el día uno; el resto se dispersa en puntos propios.
    """
    acumulado = 0
    for foco, cuantos in enumerate(FOCOS_DEMO):
        if i < acumulado + cuantos:
            return foco
        acumulado += cuantos
    return i - acumulado + len(FOCOS_DEMO)


def rng_circuitos(codigo: str, municipio_id: int):
    """La ALEATORIEDAD ACOTADA de los circuitos, y SOLO de los circuitos.

    La semilla mezcla el código del municipio con su `id` —que es distinto en
    cada alta, aunque sea la misma ciudad—, así dos demos de Luján creadas el
    mismo día no muestran la misma bandeja: cambian las proporciones de
    resueltos/disputados/pospuestos y a quién le tocó cada caso.

    Lo que NO pasa por acá es la GEOGRAFÍA: `geo_ciudad.armar()` siembra con el
    slug del nombre de la ciudad y sigue siendo idéntica entre altas — las zonas,
    los barrios y las coordenadas de Luján son las de Luján siempre. Si un
    vendedor muestra la demo dos veces, no se le mueve el mapa abajo de los pies;
    lo que cambia es la historia.
    """
    import random as _random
    return _random.Random(f"{codigo}:{municipio_id}")


def _dias_atras(i: int, total: int) -> int:
    """Antigüedad del caso `i` de `total`, dentro de la ventana de 3 meses.

    Curva, no reparto parejo: `frac ** CURVA_DENSIDAD` amontona los casos en las
    semanas recientes (la mitad cae en el último mes) y estira los viejos, que es
    como se ve una bandeja de verdad. El índice 0 es HOY y el último es el borde
    de los 90 días; entre dos consecutivos nunca hay más de ~3 días, así que la
    tendencia mensual no muestra semanas en blanco.
    """
    frac = (i + 0.5) / max(total, 1)
    dias = int(round(VENTANA_DIAS * (frac ** CURVA_DENSIDAD)))
    return max(0, min(VENTANA_DIAS - 1, dias))


def _fecha_historica(i: int, total: int, rnd=None) -> datetime:
    """`created_at` del caso `i`: su antigüedad por la curva, a una hora hábil.

    Regla del dueño: sin componente histórico no es una demo funcional. La hora
    sale del índice (o del sorteo, si hay rnd) dentro de la franja 07-19: un
    reclamo cargado a las 3 de la mañana delata la semilla tanto como uno de
    medianoche.
    """
    dias = _dias_atras(i, total)
    hora = rnd.randint(7, 19) if rnd else 7 + (i * 5) % 13
    minuto = rnd.randint(0, 59) if rnd else (i * 17) % 60
    fecha = (datetime.utcnow() - timedelta(days=dias)).replace(
        hour=hora, minute=minuto, second=0, microsecond=0)
    # Nunca futura: con dias=0 la hora hábil puede caer más tarde que el momento
    # real en que se está creando la demo.
    return min(fecha, datetime.utcnow() - timedelta(minutes=20))


def _mezcla(objetivo: int, base: list[tuple], rnd) -> dict:
    """Cuántos casos lleva cada circuito, con jitter acotado.

    `base` son (clave, peso, madurez). Si las cantidades fueran fijas, dos demos
    de la misma ciudad tendrían EXACTAMENTE la misma bandeja y la aleatoriedad
    sería decorativa; si fueran libres, una demo podría salir sin un solo reclamo
    resuelto. Se mueve ±2 sobre el peso base y se corrige el redondeo contra los
    circuitos más grandes, así el total siempre da `objetivo` y ningún circuito
    desaparece.
    """
    cuentas = {clave: max(1, peso + rnd.randint(-2, 2)) for clave, peso, _m in base}
    orden = [clave for clave, _p, _m in sorted(base, key=lambda b: -b[1])]
    while sum(cuentas.values()) != objetivo:
        delta = 1 if sum(cuentas.values()) < objetivo else -1
        for clave in orden:
            if sum(cuentas.values()) == objetivo:
                break
            if delta < 0 and cuentas[clave] <= 1:
                continue
            cuentas[clave] += delta
    return cuentas


def _circuitos_por_antiguedad(cuentas: dict, base: list[tuple], rnd) -> list:
    """Ordena las instancias de circuito de la más RECIENTE a la más vieja.

    Cada circuito tiene una `madurez` (0 = recién entrado, 1 = caso viejo). Un
    reclamo resuelto con orden de trabajo y calificación del vecino no puede ser
    de anteayer, y uno sin asignar tampoco puede llevar tres meses en la cola. Se
    ordena por madurez con un ruido de ±0,18 para que igual haya casos que
    rompan la regla: el que se resolvió en el día y el que se está arrastrando.
    """
    madurez = {clave: m for clave, _p, m in base}
    instancias = []
    for clave, n in cuentas.items():
        for _ in range(n):
            instancias.append((madurez[clave] + rnd.uniform(-0.18, 0.18), clave))
    instancias.sort(key=lambda x: x[0])
    return [clave for _score, clave in instancias]


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


def _fecha_solicitud(i: int, total: int, rnd=None) -> datetime:
    """created_at de una solicitud: misma curva de densidad que los reclamos,
    pero en HORARIO DE MOSTRADOR (08 a 13).

    Que el orden por antigüedad se corresponda con el estado —las cerradas
    viejas, las abiertas de esta semana— ya no lo decide esta función: lo decide
    `_circuitos_por_antiguedad`, que reparte los circuitos sobre estas fechas.
    """
    dias = _dias_atras(i, total)
    if rnd:
        hh, mm = rnd.randint(8, 13), rnd.randint(0, 59)
    else:
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


# ============================================================
# EL CATÁLOGO DE RECLAMOS: qué le pasa a la gente en una ciudad
# ============================================================
# Antes había 13 reclamos escritos a mano, cada uno con su dirección y su
# historial fijo. Con 50 casos eso no escala y, peor, esas direcciones eran
# inventadas ("Villa Norte", "Los Álamos"): la ubicación REAL sale de
# `geo_ciudad`, así que acá queda SOLO el asunto — el qué pasó, no el dónde.
#
# 6 asuntos por cada una de las 9 categorías que la demo opera (la décima,
# Ruidos y convivencia, depende de Seguridad, que no es una dependencia activa y
# por lo tanto no tiene supervisor que gestione: un reclamo ahí quedaría sin
# nadie que lo cierre, y eso es peor que no tenerlo).
RECLAMOS_CATALOGO = {
    "Alumbrado público": [
        ("Luminaria quemada en la esquina", "La luz de la esquina lleva más de una semana sin funcionar y de noche no se ve nada."),
        ("Media cuadra sin alumbrado", "Desde la última tormenta quedaron cuatro luminarias apagadas seguidas. Los vecinos evitan pasar de noche."),
        ("Poste de luz caído sobre la vereda", "El poste quedó tumbado después del temporal y los cables están al alcance de la mano."),
        ("Luminaria que prende y apaga toda la noche", "La luz titila sin parar desde hace días; además del molestar, deja la cuadra a oscuras a ratos."),
        ("Plaza a oscuras desde hace dos semanas", "Los reflectores de la plaza no encienden y los chicos no pueden usar los juegos a la tarde."),
        ("Cables sueltos colgando del poste", "Hay cables sueltos a menos de dos metros del piso. Con lluvia es un peligro concreto."),
    ],
    "Bacheo y calles": [
        ("Bache profundo en el medio de la calzada", "El pozo tiene casi medio metro y ya reventó la goma de dos autos esta semana."),
        ("Vereda hundida por raíces", "Las raíces de un árbol levantaron las baldosas y varios vecinos ya tropezaron."),
        ("Zanja sin señalizar tras arreglo de cañería", "Quedó una zanja abierta después del arreglo de agua, sin vallado ni cinta de precaución."),
        ("Badén roto que hace saltar a los autos", "El badén se partió al medio y los autos lo cruzan a los saltos a cualquier hora."),
        ("Calle de tierra intransitable después de la lluvia", "Con cada lluvia la cuadra queda hecha un barrial y no entra ni la ambulancia."),
        ("Cordón cuneta destruido", "El cordón está partido en varios tramos y el agua se mete a los terrenos."),
    ],
    "Recolección de residuos": [
        ("El camión no pasa hace tres días", "Hace tres días que no pasa el recolector y la basura se está acumulando en la esquina."),
        ("Contenedor desbordado", "El contenedor está desbordado y las bolsas terminan en la calle."),
        ("Basural clandestino en el terreno baldío", "Están tirando escombros y restos de poda en el baldío de la esquina."),
        ("Contenedor roto y volcado", "El contenedor quedó volcado y con la tapa arrancada; los perros desparraman todo."),
        ("Restos de poda sin retirar hace dos semanas", "Los vecinos podaron y las ramas siguen apiladas en la vereda, tapando el paso."),
        ("Recolección que pasa de madrugada y saltea cuadras", "El camión pasa a las 4 de la mañana y hay cuadras que directamente no hace."),
    ],
    "Higiene urbana": [
        ("Desagüe pluvial tapado", "La boca de tormenta está tapada con hojas y tierra; con cualquier lluvia se inunda la esquina."),
        ("Falta barrido en la zona comercial", "Hace semanas que no barren la cuadra de los comercios y está llena de papeles."),
        ("Cartelería ilegal pegada en toda la cuadra", "Pegaron carteles sobre los postes y las paredes de toda la cuadra."),
        ("Graffiti en el frente del edificio municipal", "Aparecieron pintadas en el frente del edificio durante el fin de semana."),
        ("Terreno baldío con pasto de un metro", "El baldío está sin desmalezar y ya es refugio de alimañas."),
        ("Vereda con barro acumulado del desagüe", "El agua de la cuneta desemboca en la vereda y quedó una capa de barro permanente."),
    ],
    "Arbolado y espacios verdes": [
        ("Árbol caído tras el temporal", "El árbol cayó sobre la vereda y bloquea el paso completo."),
        ("Rama a punto de caer sobre la calle", "Hay una rama grande quebrada que quedó colgando justo arriba de la calzada."),
        ("Poda urgente: ramas contra los cables", "Las ramas están rozando los cables de luz y hacen chispas con el viento."),
        ("Juegos de la plaza rotos", "Dos hamacas están cortadas y el tobogán tiene una chapa levantada."),
        ("Riego cortado en el cantero central", "El cantero central está seco hace un mes y las plantas se están perdiendo."),
        ("Bancos de la plaza vandalizados", "Rompieron tres bancos de la plaza y quedaron los hierros a la vista."),
    ],
    "Tránsito y señalización": [
        ("Semáforo en intermitente desde ayer", "El semáforo de la esquina quedó en amarillo intermitente y el cruce es un caos."),
        ("Cartel de PARE caído", "El cartel está tirado en el pasto desde el fin de semana; la esquina quedó sin señalización."),
        ("Senda peatonal borrada frente a la escuela", "La senda peatonal de la escuela no se ve más y los chicos cruzan entre los autos."),
        ("Falta cartel de reductor de velocidad", "Los autos pasan a toda velocidad por una cuadra con dos escuelas."),
        ("Semáforo apagado por completo", "El semáforo no enciende desde anoche y no hay ningún inspector en el cruce."),
        ("Lomo de burro sin pintar", "El lomo de burro no tiene la pintura reflectiva y de noche no se ve."),
    ],
    "Agua y cloacas": [
        ("Pérdida de agua en la vía pública", "Hay una pérdida importante que corre por la calle hace días; se está perdiendo muchísima agua."),
        ("Cloaca desbordada", "La cloaca desborda en la esquina y el olor es insoportable."),
        ("Tapa de cámara faltante", "Falta la tapa de la cámara y quedó el pozo abierto en plena vereda."),
        ("Sin presión de agua en toda la cuadra", "Desde el martes que no sube el agua a los tanques en toda la cuadra."),
        ("Caño roto que socavó el asfalto", "La pérdida socavó abajo del asfalto y se está hundiendo la calzada."),
        ("Corte de suministro sin aviso", "Cortaron el agua sin aviso previo y estuvimos todo el día sin servicio."),
    ],
    "Plagas y control": [
        ("Enjambre de avispas en la plaza", "Hay un panal de avispas en un árbol de la plaza y varios vecinos ya fueron picados."),
        ("Roedores en el baldío", "Se ven ratas grandes saliendo del baldío hacia las casas vecinas."),
        ("Foco de mosquitos en agua estancada", "Quedó agua estancada de la última lluvia y hay una nube de mosquitos."),
        ("Colonia de palomas en el galpón municipal", "Las palomas se metieron al galpón y está lleno de guano."),
        ("Hormigueros que arruinaron el cantero", "Los hormigueros se comieron todo el cantero de la entrada."),
        ("Necesidad de fumigación en la manzana", "Después de la crecida quedó todo lleno de bichos; piden fumigación."),
    ],
    "Animales sueltos": [
        ("Perros sueltos en la plaza", "Hay una jauría dando vueltas por la plaza; ya hubo un intento de mordedura a un chico."),
        ("Perro atropellado necesita atención", "Un perro sin dueño aparente fue atropellado y está herido sobre la vereda."),
        ("Caballos sueltos en la avenida", "Hay dos caballos sueltos caminando por la avenida; es un riesgo para los autos."),
        ("Animal muerto en la vía pública", "Hay un animal muerto en el cordón desde ayer y nadie lo retira."),
        ("Denuncia por maltrato animal", "Un vecino tiene un perro atado al sol todo el día sin agua."),
        ("Gatos sin castrar en la esquina", "Se juntaron muchos gatos en la esquina; piden campaña de castración."),
    ],
}

# Categoría → dependencia responsable, derivado de DEPENDENCIA_CATEGORIAS_MAP
# (fuente única) para no repetir el mapeo al revés.
CATEGORIA_RECLAMO_DEP = {
    cat: dep
    for dep, cats in DEPENDENCIA_CATEGORIAS_MAP.items()
    for cat in cats
}

# Categorías que la demo OPERA: las de las 4 dependencias activas que manejan
# reclamos. Se derivan, no se listan: si mañana Seguridad entra a
# DEPENDENCIAS_ACTIVAS, Ruidos y convivencia empieza a tener casos sola.
CATEGORIAS_RECLAMO_DEMO = [
    cat for cat in RECLAMOS_CATALOGO
    if CATEGORIA_RECLAMO_DEP.get(cat) in DEPENDENCIAS_ACTIVAS
]


# ============================================================
# LOS CIRCUITOS: cómo termina cada reclamo
# ============================================================
# (clave, peso_base, madurez). La `madurez` es qué tan VIEJO tiende a ser ese
# circuito: 1 = caso de hace tres meses, 0 = entró esta semana. Un reclamo
# resuelto, con orden de trabajo y calificación del vecino no puede ser de
# anteayer; uno sin asignar no puede llevar tres meses en la cola. El ruido de
# `_circuitos_por_antiguedad` deja igual algunos que rompen la regla — el que se
# resolvió en el día y el que se viene arrastrando.
CIRCUITOS_RECLAMO = [
    ("resuelto_directo",      12, 0.85),  # el vecino avisa, van y lo arreglan
    ("resuelto_con_ot",        8, 0.90),  # con OT, materiales consumidos y máquina
    ("reabierto_disputado",    4, 0.80),  # el vecino NO conformó el cierre
    ("esperando_visto_bueno",  4, 0.45),  # terminado en campo, falta que el supervisor cierre
    ("en_curso_cuadrilla",     7, 0.30),  # cuadrilla asignada, trabajando
    ("pospuesto",              4, 0.60),  # diferido con motivo
    ("rechazado",              4, 0.55),  # no corresponde al municipio / duplicado
    ("sin_asignar",            7, 0.08),  # la cola del supervisor, sin tocar
]

# Estado FINAL de cada circuito. Sale de acá y de ningún otro lado: el historial
# se construye para llegar exactamente a este estado.
ESTADO_FINAL_RECLAMO = {
    "resuelto_directo": EstadoReclamo.FINALIZADO,
    "resuelto_con_ot": EstadoReclamo.FINALIZADO,
    "reabierto_disputado": EstadoReclamo.EN_CURSO,
    "esperando_visto_bueno": EstadoReclamo.EN_CURSO,
    "en_curso_cuadrilla": EstadoReclamo.EN_CURSO,
    "pospuesto": EstadoReclamo.POSPUESTO,
    "rechazado": EstadoReclamo.RECHAZADO,
    "sin_asignar": EstadoReclamo.RECIBIDO,
}

# Circuitos que abren una orden de trabajo, y en qué estado queda.
OT_POR_CIRCUITO = {
    "resuelto_con_ot": "completada",
    "esperando_visto_bueno": "completada",
    "en_curso_cuadrilla": "en_curso",
    "pospuesto": "bloqueada",
}

MOTIVOS_POSPUESTO = [
    "Se difiere hasta la próxima licitación de materiales.",
    "Frenado por el temporal: la cuadrilla no puede intervenir con esta lluvia.",
    "Depende de una obra de la empresa de agua que todavía no tiene fecha.",
    "Se pospone hasta terminar el bacheo del corredor, para no romper dos veces.",
]

# (motivo_rechazo del enum, descripción para el vecino)
MOTIVOS_RECHAZO = [
    ("no_competencia", "El tendido es de la distribuidora eléctrica: se derivó el pedido y se le informó al vecino."),
    ("duplicado", "Ya existe un reclamo abierto por el mismo hecho; se unifica el seguimiento en el original."),
    ("info_insuficiente", "No se pudo ubicar el lugar con los datos aportados. Se le pidió al vecino que amplíe y no hubo respuesta."),
    ("fuera_jurisdiccion", "La calle es de jurisdicción provincial; se giró el reclamo a Vialidad."),
]

DISPUTAS_VECINO = [
    "Volvieron a taparlo con tierra y a los dos días estaba igual que antes.",
    "Dicen que está resuelto pero nadie vino. Sigue exactamente igual.",
    "Lo arreglaron a medias: quedó el pozo tapado pero la vereda sigue rota.",
    "Estuvo bien tres días y volvió a fallar. Pido que lo vean de nuevo.",
]

RESOLUCIONES_RECLAMO = [
    "Trabajo terminado y verificado en el lugar.",
    "Resuelto por la cuadrilla; se dejó el sector limpio.",
    "Se normalizó el servicio en toda la cuadra.",
    "Reparación terminada. Se notificó al vecino.",
    "Intervención completa; se recomienda revisión a los 90 días.",
]


# ============================================================
# LOS CIRCUITOS DE TRÁMITE (misma mecánica que los de reclamo)
# ============================================================
# Un mostrador de verdad no tiene todo finalizado ni todo en cola: tiene
# expedientes esperando un papel que el vecino no trajo, otros esperando que
# pague, y algunos que se pospusieron. Esos son los que hay que poder mostrar.
CIRCUITOS_SOLICITUD = [
    ("finalizado",             16, 0.88),
    ("rechazado",               4, 0.62),
    ("pospuesto",               4, 0.58),
    ("esperando_documentacion", 6, 0.45),
    ("pendiente_pago",          6, 0.35),
    ("en_curso",                9, 0.25),
    ("recibido",                5, 0.06),
]

ESTADO_FINAL_SOLICITUD = {
    "finalizado": EstadoSolicitud.FINALIZADO,
    "rechazado": EstadoSolicitud.RECHAZADO,
    "pospuesto": EstadoSolicitud.POSPUESTO,
    # No hay estado propio "espera documentación" fuera de los legacy en
    # MAYÚSCULAS (REQUIERE_DOCUMENTACION), que son de datos viejos y no los
    # dibuja ninguna pantalla. El expediente queda EN_CURSO —que es la verdad:
    # el municipio ya lo está trabajando— y lo que falta se lee en el historial
    # y en `observaciones`.
    "esperando_documentacion": EstadoSolicitud.EN_CURSO,
    "pendiente_pago": EstadoSolicitud.PENDIENTE_PAGO,
    "en_curso": EstadoSolicitud.EN_CURSO,
    "recibido": EstadoSolicitud.RECIBIDO,
}

DOCS_FALTANTES = [
    "Falta el certificado médico psicofísico: el presentado está vencido.",
    "Falta la constancia de CUIT actualizada.",
    "El plano presentado no está firmado por profesional matriculado.",
    "Falta el comprobante de pago de la tasa de inicio.",
    "La copia del DNI está ilegible; se pidió que la vuelva a subir.",
]

MOTIVOS_RECHAZO_SOLICITUD = [
    "El rubro solicitado no está permitido para esa zona según el código de habilitaciones.",
    "El solicitante registra deuda vigente; se le informó el plan de pago disponible.",
    "Documentación incompleta después de dos intimaciones. Se archiva el expediente.",
    "El inmueble no está dentro del ejido municipal.",
]

MOTIVOS_POSPUESTO_SOLICITUD = [
    "En espera del informe del área técnica.",
    "Suspendido a pedido del solicitante hasta el mes que viene.",
    "Frenado hasta que se resuelva el expediente de obra vinculado.",
    "En espera de la inspección conjunta con Bromatología.",
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
    codigos_usados: set[str] = set()
    for z in zonas_reales:
        nombre = (z.get("nombre") or "").strip()
        if not nombre or nombre in zonas:
            continue
        # "Asentamiento San Antonio" y "Asentamiento B. Belgrano" truncan al
        # mismo ASENTAMIEN-<muni> y `zonas.codigo` es UNIQUE: el alta de San
        # Salvador de Jujuy moria en el INSERT con Duplicate entry. Ante
        # colision, sufijo numerico deterministico sobre la misma base.
        codigo = _codigo_zona(nombre, municipio_id)
        seq = 1
        while codigo in codigos_usados:
            seq += 1
            base = re.sub(r"[^A-Z0-9]+", "", _sin_tildes(nombre).upper())[:10] or "Z"
            codigo = f"{base}{seq}-{municipio_id}"[:20]
        codigos_usados.add(codigo)
        zona = Zona(
            municipio_id=municipio_id,
            nombre=nombre[:100],
            codigo=codigo,
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

    # --- Los OTROS DOS vecinos ---
    # Con 50 reclamos y 50 trámites colgando de un único vecino la demo se
    # rompe sola: nadie tiene 50 reclamos, y sobre todo NO se puede mostrar la
    # óptica del vecino (que ve SOLO lo suyo) si lo suyo es todo. Tres vecinos
    # con actividad despareja (50/30/20, ver VECINOS_REPARTO) muestran un vecino
    # que reclama por todo y dos que aparecen cada tanto.
    #
    # El email va `vecino-<nombre>@{codigo}.demo.com`: el patrón `vecino-%` ya lo
    # matchea la botonera del picker (ver api/municipios.py, endpoint
    # `/public/{codigo}/demo-users`), así que los tres entran con un click y con
    # la misma password que el resto de los usuarios demo.
    vecinos_demo: list[User] = [vecino_demo]
    for _n in (2, 3):
        _hv = int(hashlib.sha1(f"{codigo}-vecino-{_n}".encode()).hexdigest(), 16)
        _sx = _hv % 2
        _nom = (_NOMBRES_M if _sx == 0 else _NOMBRES_F)[(_hv >> 3) % 8]
        _ape = _APELLIDOS[(_hv >> 7) % len(_APELLIDOS)]
        # Sin choque de nombre con el vecino principal: dos "Juan González" en la
        # misma demo se leen como un bug, no como dos vecinos.
        if (_nom, _ape) == (_nombre_demo, _apellido_demo):
            _ape = _APELLIDOS[((_hv >> 7) + 5) % len(_APELLIDOS)]
        _dir = None
        if geo:
            _pv = geo[(_hv + _n * 7) % len(geo)]
            _dir = _pv["direccion"] + (f", {_pv['barrio']}" if _pv.get("barrio") else "")
        _tel = str(_hv % 100_000_000).zfill(8)
        _otro = User(
            email=f"vecino-{_slug_palabra(_nom)}@{codigo}.demo.com",
            nombre=_nom,
            apellido=_ape,
            dni=str(25_000_000 + (_hv % 23_000_000)),
            telefono=f"+54 9 11 {_tel[:4]}-{_tel[4:]}",
            direccion=_dir,
            sexo="M" if _sx == 0 else "F",
            fecha_nacimiento=date(1965 + ((_hv >> 11) % 36),
                                  1 + ((_hv >> 17) % 12),
                                  1 + ((_hv >> 23) % 28)),
            nacionalidad="ARG",
            # Solo el vecino principal viene con biometría hecha: los otros dos
            # quedan en nivel 1 a propósito, para poder mostrar el trámite que
            # PIDE KYC y todavía no lo tiene (licencia de conducir).
            nivel_verificacion=1,
            password_hash=hash_demo,
            rol=RolUsuario.VECINO,
            municipio_id=municipio_id,
            activo=True,
            cuenta_verificada=True,
        )
        db.add(_otro)
        vecinos_demo.append(_otro)
    await db.flush()
    log.hito("usuarios", admin=1, vecinos=len(vecinos_demo),
             supervisores=len(supervisores_demo),
             emails_vecinos=[v.email for v in vecinos_demo],
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
    # empleado.id → su usuario de login. Es lo que permite que el historial
    # diga "lo ejecutó Carlos Gómez" con el usuario REAL de Carlos y no con el
    # admin: sin este mapeo la traza por actor no existe.
    user_de_empleado: dict[int, User] = {}
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
        user_de_empleado[empleados[idx].id] = emp_user
    await db.flush()

    # ------------------------------------------------------------------
    # 7. SLA configs
    # ------------------------------------------------------------------
    sla_count = await _seed_sla_configs(db, municipio_id, cats_reclamo)
    log.hito("sla", sla_configs=sla_count)

    # ------------------------------------------------------------------
    # 8. Inventario (VA ANTES QUE LAS OT: las órdenes consumen de acá)
    # ------------------------------------------------------------------
    # Antes se sembraba después de las OT y por eso ninguna orden podía tener
    # materiales de verdad: la lista `materiales` era un JSON suelto que no
    # descontaba stock ni tomaba una máquina. Ahora el inventario existe primero
    # y las OT completadas descuentan de verdad.
    from services.inventario_seed import seed_inventario
    inv_res = await seed_inventario(db, municipio_id, incluir_demo=True)
    log.hito("inventario", items=inv_res["items"])

    # ------------------------------------------------------------------
    # 9. TRES MESES DE VIDA MUNICIPAL — 50 reclamos con su circuito
    # ------------------------------------------------------------------
    # La aleatoriedad de acá para abajo es ACOTADA y va toda por `rnd`: cambia
    # QUIÉN atendió, CUÁNTO tardó y CÓMO terminó cada caso. Lo que no cambia es
    # el volumen, la ventana de 90 días ni la geografía.
    rnd = rng_circuitos(codigo, municipio_id)

    # --- Quién es quién (los actores de la traza) ---
    sup_por_dep: dict[str, User] = {}
    for _dep_cod, _sup in zip(
            [d for d in DEPENDENCIAS_ACTIVAS if d in muni_deps], supervisores_demo):
        sup_por_dep[_dep_cod] = _sup
    _sup_fallback = supervisores_demo[0] if supervisores_demo else admin_demo

    _operarios = [e for e, d in zip(empleados, EMPLEADOS_DEMO) if d[3] == "operario"]
    _administrativos = [e for e, d in zip(empleados, EMPLEADOS_DEMO) if d[3] == "administrativo"]
    _op_por_cat: dict[int, Empleado] = {
        e.categoria_principal_id: e for e in _operarios if e.categoria_principal_id
    }
    _cuad_por_cat: dict[int, Cuadrilla] = {
        c.categoria_principal_id: c for c in cuadrillas if c.categoria_principal_id
    }

    def _operario_para(cat_id: Optional[int], i: int) -> Optional[Empleado]:
        """El operario a cargo: el de ESA categoría si existe, si no el que
        sigue en la rueda. Nunca None mientras haya operarios — un reclamo
        asignado sin nadie adentro es justo lo que la traza tiene que evitar."""
        emp = _op_por_cat.get(cat_id) if cat_id else None
        if emp:
            return emp
        return _operarios[i % len(_operarios)] if _operarios else None

    def _cuadrilla_para(cat_id: Optional[int], i: int) -> Optional[Cuadrilla]:
        cua = _cuad_por_cat.get(cat_id) if cat_id else None
        if cua:
            return cua
        return cuadrillas[i % len(cuadrillas)] if cuadrillas else None

    def _actor_operario(emp: Optional[Empleado]) -> User:
        """El USUARIO con el que ese operario entra a la app. Si el empleado no
        tiene login propio (los administrativos no lo tienen), firma el
        supervisor: el historial no puede quedar sin actor."""
        if emp is not None and emp.id in user_de_empleado:
            return user_de_empleado[emp.id]
        return _sup_fallback

    def _linea_de_tiempo(creado: datetime, pasos: int, dias: int) -> list:
        """Las fechas de los movimientos de un caso, SIEMPRE hacia adelante.

        Nada puede caer después de ahora (un reclamo cerrado el mes que viene se
        nota de inmediato) ni antes de su creación. Se reparten dentro de la
        ventana [creación, creación + duración del circuito], con un jitter chico
        para que los pasos intermedios no queden a intervalos de reloj.
        """
        tope = datetime.utcnow() - timedelta(minutes=10)
        fin = min(creado + timedelta(days=max(dias, 1)), tope)
        span = max((fin - creado).total_seconds(), 60.0)
        fechas = [creado]
        for k in range(1, pasos):
            frac = k / max(pasos - 1, 1)
            if 0 < k < pasos - 1:
                frac = min(max(frac + rnd.uniform(-0.06, 0.06), 0.02), 0.98)
            fechas.append(creado + timedelta(seconds=span * frac))
        return fechas

    # --- El reparto de la actividad entre los tres vecinos ---
    def _reparto(objetivo: int, corrimiento: int = 0) -> list:
        """Qué vecino es dueño de cada caso: 50 / 30 / 20 barajado.

        `corrimiento` rota el reparto para que el vecino que más RECLAMA no sea
        automáticamente el que más TRÁMITES inicia — se parecen más a tres
        personas distintas y no a un mismo perfil clonado.
        """
        pool = []
        for k, parte in enumerate(VECINOS_REPARTO):
            idx = (k + corrimiento) % len(vecinos_demo)
            pool += [vecinos_demo[idx]] * int(round(objetivo * parte))
        while len(pool) < objetivo:
            pool.append(vecinos_demo[0])
        pool = pool[:objetivo]
        rnd.shuffle(pool)
        return pool

    # --- El catálogo de asuntos, repartido entre las 9 categorías operadas ---
    _cats_demo = [c for c in CATEGORIAS_RECLAMO_DEMO if c in cats_reclamo]
    _asuntos: list[tuple] = []
    if _cats_demo:
        _max_por_cat = max(len(RECLAMOS_CATALOGO[c]) for c in _cats_demo)
        for _j in range(_max_por_cat):          # rueda por categoría: ninguna
            for _c in _cats_demo:               # se queda sin casos
                if _j < len(RECLAMOS_CATALOGO[_c]):
                    _asuntos.append((_c, *RECLAMOS_CATALOGO[_c][_j]))
    _asuntos = _asuntos[:OBJETIVO_RECLAMOS]
    rnd.shuffle(_asuntos)

    cuentas_rec = _mezcla(OBJETIVO_RECLAMOS, CIRCUITOS_RECLAMO, rnd)
    circuitos_rec = _circuitos_por_antiguedad(cuentas_rec, CIRCUITOS_RECLAMO, rnd)
    duenios_rec = _reparto(OBJETIVO_RECLAMOS)

    _zonas_pool = list(zonas.values())
    _barrios_pool = list(barrios.values())
    total_rec = min(OBJETIVO_RECLAMOS, len(_asuntos)) if _asuntos else 0

    reclamos_creados_list: list[Reclamo] = []
    trazas_rec: list[list[dict]] = []   # historial de cada reclamo, ya con actor
    plan_ots: list[dict] = []           # las OT que hay que abrir después
    resumen_circuitos: dict[str, int] = {}

    for i in range(total_rec):
        cat_nombre, titulo, descripcion = _asuntos[i]
        cat = cats_reclamo.get(cat_nombre)
        if not cat:
            continue
        circuito = circuitos_rec[i] if i < len(circuitos_rec) else "sin_asignar"
        resumen_circuitos[circuito] = resumen_circuitos.get(circuito, 0) + 1
        vecino = duenios_rec[i]
        dep_codigo = CATEGORIA_RECLAMO_DEP.get(cat_nombre)
        muni_dep = muni_deps.get(dep_codigo) if dep_codigo else None
        supervisor = sup_por_dep.get(dep_codigo) or _sup_fallback

        # La ubicación sale del punto REAL de la ciudad (con sus focos
        # repetidos); zona y barrio ya vienen resueltos por el geocoding.
        punto = geo[_punto_con_focos(i) % len(geo)] if geo else None
        zona = zonas.get(punto.get("zona_nombre")) if punto else None
        barrio = barrios.get(punto.get("barrio")) if punto else None
        if zona is None and _zonas_pool:
            zona = _zonas_pool[i % len(_zonas_pool)]
        if barrio is None and _barrios_pool:
            barrio = _barrios_pool[i % len(_barrios_pool)]

        creado = _fecha_historica(i, total_rec, rnd)
        emp = None if circuito in ("sin_asignar", "rechazado") else _operario_para(cat.id, i)
        cua = _cuadrilla_para(cat.id, i) if circuito in (
            "resuelto_con_ot", "en_curso_cuadrilla", "esperando_visto_bueno", "pospuesto") else None
        actor_campo = _actor_operario(emp)

        # --- LA TRAZA: quién hizo qué, en orden ---
        pasos: list[dict] = [{
            "accion": "Reclamo creado",
            "estado_nuevo": EstadoReclamo.RECIBIDO,
            "comentario": None,
            "usuario": vecino,
        }]
        extra: dict = {}
        dias_circuito = 1

        if circuito == "sin_asignar":
            dias_circuito = 0

        elif circuito == "rechazado":
            dias_circuito = rnd.randint(1, 4)
            motivo, texto = MOTIVOS_RECHAZO[i % len(MOTIVOS_RECHAZO)]
            pasos.append({
                "accion": "Reclamo rechazado",
                "estado_anterior": EstadoReclamo.RECIBIDO,
                "estado_nuevo": EstadoReclamo.RECHAZADO,
                "comentario": texto, "usuario": supervisor,
            })
            extra = {"motivo_rechazo": motivo, "descripcion_rechazo": texto,
                     "cierra": True}

        elif circuito == "pospuesto":
            dias_circuito = rnd.randint(2, 9)
            motivo = MOTIVOS_POSPUESTO[i % len(MOTIVOS_POSPUESTO)]
            pasos.append({
                "accion": "Asignado a la dependencia",
                "estado_anterior": EstadoReclamo.RECIBIDO,
                "estado_nuevo": EstadoReclamo.EN_CURSO,
                "comentario": f"Asignado a {emp.nombre} {emp.apellido}." if emp else
                              "Tomado por la dependencia.",
                "usuario": supervisor,
            })
            pasos.append({
                "accion": "Trabajo diferido",
                "estado_anterior": EstadoReclamo.EN_CURSO,
                "estado_nuevo": EstadoReclamo.POSPUESTO,
                "comentario": motivo, "usuario": supervisor,
            })

        elif circuito == "en_curso_cuadrilla":
            dias_circuito = rnd.randint(1, 5)
            pasos.append({
                "accion": "Cuadrilla asignada",
                "estado_anterior": EstadoReclamo.RECIBIDO,
                "estado_nuevo": EstadoReclamo.EN_CURSO,
                "comentario": f"Se despachó {cua.nombre}." if cua else "Se despachó la cuadrilla.",
                "usuario": supervisor,
            })
            pasos.append({
                "accion": "Parte de campo",
                "comentario": "La cuadrilla llegó al lugar y está trabajando.",
                "usuario": actor_campo,
            })

        elif circuito == "esperando_visto_bueno":
            dias_circuito = rnd.randint(2, 8)
            pasos.append({
                "accion": "Cuadrilla asignada",
                "estado_anterior": EstadoReclamo.RECIBIDO,
                "estado_nuevo": EstadoReclamo.EN_CURSO,
                "comentario": f"Se despachó {cua.nombre}." if cua else "Se despachó la cuadrilla.",
                "usuario": supervisor,
            })
            pasos.append({
                "accion": "Trabajo terminado en campo",
                "comentario": "Terminado. Queda a la espera del visto bueno del supervisor "
                              "para cerrar el reclamo.",
                "usuario": actor_campo,
            })

        elif circuito in ("resuelto_directo", "resuelto_con_ot"):
            dias_circuito = rnd.randint(1, 6) if circuito == "resuelto_directo" else rnd.randint(3, 12)
            pasos.append({
                "accion": "Asignado" if circuito == "resuelto_directo" else "Cuadrilla asignada",
                "estado_anterior": EstadoReclamo.RECIBIDO,
                "estado_nuevo": EstadoReclamo.EN_CURSO,
                "comentario": (f"Asignado a {emp.nombre} {emp.apellido}." if emp else
                               "Tomado por la dependencia.") if circuito == "resuelto_directo"
                              else (f"Se despachó {cua.nombre} con materiales." if cua else
                                    "Se despachó la cuadrilla con materiales."),
                "usuario": supervisor,
            })
            pasos.append({
                "accion": "Parte de campo",
                "comentario": "Trabajo ejecutado en el lugar.",
                "usuario": actor_campo,
            })
            resolucion = RESOLUCIONES_RECLAMO[i % len(RESOLUCIONES_RECLAMO)]
            pasos.append({
                "accion": "Reclamo finalizado",
                "estado_anterior": EstadoReclamo.EN_CURSO,
                "estado_nuevo": EstadoReclamo.FINALIZADO,
                "comentario": resolucion, "usuario": supervisor,
            })
            pasos.append({
                "accion": "El vecino confirmó la solución",
                "comentario": "El vecino verificó el trabajo y lo dio por resuelto.",
                "usuario": vecino,
            })
            extra = {"resolucion": resolucion, "cierra": True, "confirmado": True}

        elif circuito == "reabierto_disputado":
            dias_circuito = rnd.randint(6, 20)
            disputa = DISPUTAS_VECINO[i % len(DISPUTAS_VECINO)]
            pasos.append({
                "accion": "Asignado",
                "estado_anterior": EstadoReclamo.RECIBIDO,
                "estado_nuevo": EstadoReclamo.EN_CURSO,
                "comentario": f"Asignado a {emp.nombre} {emp.apellido}." if emp else
                              "Tomado por la dependencia.",
                "usuario": supervisor,
            })
            pasos.append({
                "accion": "Reclamo finalizado",
                "estado_anterior": EstadoReclamo.EN_CURSO,
                "estado_nuevo": EstadoReclamo.FINALIZADO,
                "comentario": "Se dio por resuelto tras el paso de la cuadrilla.",
                "usuario": supervisor,
            })
            pasos.append({
                "accion": "El vecino NO conformó el cierre",
                "estado_anterior": EstadoReclamo.FINALIZADO,
                "estado_nuevo": EstadoReclamo.EN_CURSO,
                "comentario": disputa, "usuario": vecino,
            })
            pasos.append({
                "accion": "Reabierto y reasignado",
                "comentario": f"Se reabre por disputa del vecino y se reasigna a "
                              f"{emp.nombre} {emp.apellido}." if emp else
                              "Se reabre por disputa del vecino.",
                "usuario": supervisor,
            })
            extra = {"disputa": disputa}

        fechas = _linea_de_tiempo(creado, len(pasos), dias_circuito)
        for _p_idx, _p in enumerate(pasos):
            _p["created_at"] = fechas[_p_idx]

        # Prioridad: la que trae la categoría, salvo la tanda que el municipio
        # marcó URGENTE (la cola con urgentes que ve el supervisor).
        prioridad = getattr(cat, "prioridad_default", None) or 3
        if rnd.random() < 0.16:
            prioridad = 1

        reclamo = Reclamo(
            municipio_id=municipio_id,
            titulo=titulo,
            descripcion=descripcion,
            estado=ESTADO_FINAL_RECLAMO[circuito],
            created_at=creado,
            fecha_recibido=fechas[1] if len(fechas) > 1 else None,
            fecha_resolucion=(fechas[-2] if circuito in ("resuelto_directo", "resuelto_con_ot")
                              else fechas[-1]) if extra.get("cierra") else None,
            resolucion=extra.get("resolucion"),
            motivo_rechazo=extra.get("motivo_rechazo"),
            descripcion_rechazo=extra.get("descripcion_rechazo"),
            confirmado_vecino=(True if extra.get("confirmado")
                               else (False if extra.get("disputa") else None)),
            fecha_confirmacion_vecino=(fechas[-1] if extra.get("confirmado")
                                       else (fechas[-2] if extra.get("disputa") else None)),
            comentario_confirmacion_vecino=extra.get("disputa"),
            prioridad=prioridad,
            # SIN PUNTO REAL NO SE INVENTA UNA DIRECCION (regla 11): queda el
            # nombre del municipio (que es cierto) y sin coordenada, así el mapa
            # no muestra un pin falso. `direccion` es NOT NULL.
            direccion=punto["direccion"] if punto else (muni.nombre if muni else codigo),
            latitud=punto["lat"] if punto else None,
            longitud=punto["lon"] if punto else None,
            categoria_id=cat.id,
            zona_id=zona.id if zona else None,
            barrio_id=barrio.id if barrio else None,
            creador_id=vecino.id,
            empleado_id=emp.id if emp else None,
            municipio_dependencia_id=muni_dep.id if muni_dep else None,
            canal=["app", "app", "whatsapp", "ventanilla_asistida"][i % 4],
        )
        db.add(reclamo)
        reclamos_creados_list.append(reclamo)
        trazas_rec.append(pasos)

        if circuito in OT_POR_CIRCUITO:
            plan_ots.append({
                "reclamo_pos": len(reclamos_creados_list) - 1,
                "estado": OT_POR_CIRCUITO[circuito],
                "titulo": titulo,
                "categoria_id": cat.id,
                "cuadrilla": cua,
                "empleado": emp,
                "inicio": fechas[1] if len(fechas) > 1 else creado,
                "fin": fechas[-1],
            })

    await db.flush()   # UN solo flush para los 50 ids

    historiales = []
    for reclamo, pasos in zip(reclamos_creados_list, trazas_rec):
        for p in pasos:
            historiales.append(HistorialReclamo(
                reclamo_id=reclamo.id,
                usuario_id=p["usuario"].id,
                accion=p["accion"],
                estado_anterior=p.get("estado_anterior"),
                estado_nuevo=p.get("estado_nuevo"),
                comentario=p.get("comentario"),
                created_at=p["created_at"],
            ))
    db.add_all(historiales)
    await db.flush()

    reclamos_creados = len(reclamos_creados_list)
    _con_coord = sum(1 for r in reclamos_creados_list if r.latitud is not None)
    log.hito("reclamos", reclamos=reclamos_creados,
             con_coordenada_real=_con_coord,
             con_zona=sum(1 for r in reclamos_creados_list if r.zona_id),
             con_barrio=sum(1 for r in reclamos_creados_list if r.barrio_id),
             con_empleado_asignado=sum(1 for r in reclamos_creados_list if r.empleado_id),
             urgentes=sum(1 for r in reclamos_creados_list if r.prioridad == 1),
             movimientos_de_historial=len(historiales),
             circuitos=[f"{k}: {v}" for k, v in sorted(resumen_circuitos.items())],
             direcciones=[r.direccion for r in reclamos_creados_list[:10]],
             estado="ok" if _con_coord == reclamos_creados else "degradado",
             motivo=None if _con_coord == reclamos_creados else
             f"{reclamos_creados - _con_coord} reclamos sin coordenada: no habia "
             f"geografia real para esta ciudad (no se inventa una direccion)")

    # 9.bis. Calificaciones: la devolución del vecino sobre lo que se cerró.
    calificaciones_creadas = await _seed_calificaciones(db, reclamos_creados_list)
    log.hito("calificaciones", calificaciones=calificaciones_creadas)

    # ------------------------------------------------------------------
    # 10. Órdenes de trabajo (el circuito de campo formal sobre los reclamos)
    # ------------------------------------------------------------------
    ot_counts = await _seed_ordenes_trabajo(
        db, municipio_id, reclamos_creados_list, plan_ots, cuadrillas,
        _operarios, admin_demo.id, rnd,
    )
    ots_creadas = ot_counts["ordenes_trabajo"]
    log.hito("ordenes_trabajo", **ot_counts)

    # ------------------------------------------------------------------
    # 11. Solicitudes de trámite: 50 expedientes con sus circuitos
    # ------------------------------------------------------------------
    # numero_tramite es UNIQUE GLOBAL (no por municipio). Arrancar desde el max
    # actual del año para no chocar con demos creadas previamente.
    _year = date.today().year
    _r = await db.execute(text(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(numero_tramite, 10) AS UNSIGNED)), 0) "
        "FROM solicitudes WHERE numero_tramite LIKE :patt"
    ), {"patt": f"SOL-{_year}-%"})
    _sol_offset = int(_r.scalar() or 0)

    _ASUNTOS_EXTRA = [
        "Solicitud iniciada por la app.",
        "Solicitud iniciada por ventanilla.",
        "Necesito resolver esto antes de fin de mes.",
        "Lo inicio ahora para tenerlo listo cuando abra el local.",
    ]

    cuentas_sol = _mezcla(OBJETIVO_SOLICITUDES, CIRCUITOS_SOLICITUD, rnd)
    circuitos_sol = _circuitos_por_antiguedad(cuentas_sol, CIRCUITOS_SOLICITUD, rnd)
    # Corrimiento 1: el vecino que más reclama no es el que más trámites inicia.
    duenios_sol = _reparto(OBJETIVO_SOLICITUDES, corrimiento=1)
    resumen_circuitos_sol: dict[str, int] = {}

    solicitudes_nuevas: list[tuple] = []   # (Solicitud, pasos, circuito)
    if tramites_operativos:
        for i in range(OBJETIVO_SOLICITUDES):
            tramite, t_data = tramites_operativos[i % len(tramites_operativos)]
            circuito = circuitos_sol[i] if i < len(circuitos_sol) else "recibido"
            # Un trámite gratis no puede estar "pendiente de pago": el circuito
            # se degrada al que sí corresponde en vez de mentir un cobro.
            if circuito == "pendiente_pago" and not (tramite.costo or 0) > 0:
                circuito = "en_curso"
            resumen_circuitos_sol[circuito] = resumen_circuitos_sol.get(circuito, 0) + 1

            # 4 de cada 5 expedientes son de los vecinos demo; el quinto entra
            # por ventanilla a nombre de otra persona (sin cuenta), que es como
            # llega buena parte del trabajo real de un municipio.
            del_vecino = (i % 5) != 4
            vecino = duenios_sol[i]
            _sh = int(hashlib.sha1(f"{codigo}-sol-{i}".encode()).hexdigest(), 16)
            if del_vecino:
                _nom_sol, _ape_sol = vecino.nombre, vecino.apellido
                _dni_sol, _tel_sol = vecino.dni, vecino.telefono
                _mail_sol, _dir_sol = vecino.email, vecino.direccion
            else:
                _nom_sol = ["Mariana", "Roberto", "Claudia", "Héctor", "Patricia"][_sh % 5]
                _ape_sol = ["Díaz", "Morales", "Herrera", "Castro", "Ríos"][_sh % 5]
                _dni_sol = str(30_000_000 + (_sh % 18_000_000))
                _tel_sol = _dir_sol = None
                _mail_sol = f"{_nom_sol.lower()}.{_ape_sol.lower()}@mail.com"

            dep_code = t_data.get("dep_codigo") or CATEGORIA_TRAMITE_DEP_MAP.get(
                t_data["categoria_tramite_nombre"])
            muni_dep_sol = muni_deps.get(dep_code) if dep_code else None
            supervisor_sol = sup_por_dep.get(dep_code) or _sup_fallback
            # El expediente lo trabaja un administrativo, no un operario de campo.
            emp_sol = _administrativos[i % len(_administrativos)] if _administrativos else None

            creado_sol = _fecha_solicitud(i, OBJETIVO_SOLICITUDES, rnd)
            dur = _duracion_tramite_dias(tramite.nombre, i)
            estado_final = ESTADO_FINAL_SOLICITUD[circuito]

            pasos_sol: list[dict] = [{
                "accion": "Solicitud creada",
                "estado_nuevo": EstadoSolicitud.RECIBIDO,
                "comentario": ("Iniciada por el vecino desde la app."
                               if del_vecino else
                               "Iniciada en ventanilla con los datos del solicitante."),
                # Si la inició otra persona sin cuenta, el actor es el
                # administrativo que la cargó en el mostrador.
                "usuario": vecino if del_vecino else supervisor_sol,
            }]
            observaciones = None

            if circuito == "recibido":
                dur = 0
            elif circuito == "pendiente_pago":
                pasos_sol.append({
                    "accion": "A la espera del pago",
                    "estado_anterior": EstadoSolicitud.RECIBIDO,
                    "estado_nuevo": EstadoSolicitud.PENDIENTE_PAGO,
                    "comentario": f"Se emitió la boleta por ${tramite.costo:,.0f}. "
                                  f"El trámite avanza cuando se acredite el pago.",
                    "usuario": supervisor_sol,
                })
            elif circuito == "esperando_documentacion":
                observaciones = DOCS_FALTANTES[i % len(DOCS_FALTANTES)]
                pasos_sol.append({
                    "accion": "Expediente en curso",
                    "estado_anterior": EstadoSolicitud.RECIBIDO,
                    "estado_nuevo": EstadoSolicitud.EN_CURSO,
                    "comentario": "Se abrió el expediente y se revisó la documentación.",
                    "usuario": supervisor_sol,
                })
                pasos_sol.append({
                    "accion": "Se pidió documentación al vecino",
                    "comentario": observaciones,
                    "usuario": supervisor_sol,
                })
            elif circuito == "en_curso":
                pasos_sol.append({
                    "accion": "Expediente en curso",
                    "estado_anterior": EstadoSolicitud.RECIBIDO,
                    "estado_nuevo": EstadoSolicitud.EN_CURSO,
                    "comentario": f"Tomado por {emp_sol.nombre} {emp_sol.apellido}."
                                  if emp_sol else "Tomado por la dependencia.",
                    "usuario": supervisor_sol,
                })
            elif circuito == "pospuesto":
                observaciones = MOTIVOS_POSPUESTO_SOLICITUD[i % len(MOTIVOS_POSPUESTO_SOLICITUD)]
                pasos_sol.append({
                    "accion": "Expediente en curso",
                    "estado_anterior": EstadoSolicitud.RECIBIDO,
                    "estado_nuevo": EstadoSolicitud.EN_CURSO,
                    "comentario": "Se abrió el expediente.",
                    "usuario": supervisor_sol,
                })
                pasos_sol.append({
                    "accion": "Trámite pospuesto",
                    "estado_anterior": EstadoSolicitud.EN_CURSO,
                    "estado_nuevo": EstadoSolicitud.POSPUESTO,
                    "comentario": observaciones, "usuario": supervisor_sol,
                })
            elif circuito == "rechazado":
                observaciones = MOTIVOS_RECHAZO_SOLICITUD[i % len(MOTIVOS_RECHAZO_SOLICITUD)]
                pasos_sol.append({
                    "accion": "Expediente en curso",
                    "estado_anterior": EstadoSolicitud.RECIBIDO,
                    "estado_nuevo": EstadoSolicitud.EN_CURSO,
                    "comentario": "Se abrió el expediente y pasó a revisión.",
                    "usuario": supervisor_sol,
                })
                pasos_sol.append({
                    "accion": "Trámite rechazado",
                    "estado_anterior": EstadoSolicitud.EN_CURSO,
                    "estado_nuevo": EstadoSolicitud.RECHAZADO,
                    "comentario": observaciones, "usuario": supervisor_sol,
                })
            else:  # finalizado
                if (tramite.costo or 0) > 0:
                    pasos_sol.append({
                        "accion": "Pago acreditado",
                        "comentario": f"Se acreditó el pago de ${tramite.costo:,.0f}.",
                        "usuario": vecino if del_vecino else supervisor_sol,
                    })
                pasos_sol.append({
                    "accion": "Expediente en curso",
                    "estado_anterior": EstadoSolicitud.RECIBIDO,
                    "estado_nuevo": EstadoSolicitud.EN_CURSO,
                    "comentario": f"Tomado por {emp_sol.nombre} {emp_sol.apellido}."
                                  if emp_sol else "Tomado por la dependencia.",
                    "usuario": supervisor_sol,
                })
                pasos_sol.append({
                    "accion": "Trámite finalizado",
                    "estado_anterior": EstadoSolicitud.EN_CURSO,
                    "estado_nuevo": EstadoSolicitud.FINALIZADO,
                    "comentario": "Trámite terminado. Se notificó al solicitante para el retiro.",
                    "usuario": supervisor_sol,
                })

            fechas_sol = _linea_de_tiempo(creado_sol, len(pasos_sol), max(dur, 1))
            for _k, _p in enumerate(pasos_sol):
                _p["created_at"] = fechas_sol[_k]

            sol = Solicitud(
                municipio_id=municipio_id,
                numero_tramite=f"SOL-{_year}-{(_sol_offset + i + 1):05d}",
                tramite_id=tramite.id,
                asunto=f"{tramite.nombre} — {_nom_sol} {_ape_sol}",
                descripcion=_ASUNTOS_EXTRA[i % len(_ASUNTOS_EXTRA)],
                estado=estado_final,
                solicitante_id=vecino.id if del_vecino else None,
                nombre_solicitante=_nom_sol,
                apellido_solicitante=_ape_sol,
                dni_solicitante=_dni_sol,
                email_solicitante=_mail_sol,
                telefono_solicitante=_tel_sol,
                direccion_solicitante=_dir_sol,
                municipio_dependencia_id=muni_dep_sol.id if muni_dep_sol else None,
                empleado_id=emp_sol.id if emp_sol and circuito != "recibido" else None,
                observaciones=observaciones,
                canal="app" if del_vecino else "ventanilla_asistida",
                prioridad=2 + (i % 3),
                created_at=creado_sol,
                fecha_resolucion=fechas_sol[-1] if circuito in ("finalizado", "rechazado") else None,
            )
            db.add(sol)
            solicitudes_nuevas.append((sol, pasos_sol, circuito))

    await db.flush()   # UN flush para los 50 ids (antes era uno POR solicitud)

    hist_sol = []
    for sol, pasos_sol, _circ in solicitudes_nuevas:
        for p in pasos_sol:
            hist_sol.append(HistorialSolicitud(
                solicitud_id=sol.id,
                usuario_id=p["usuario"].id if p.get("usuario") is not None else None,
                estado_anterior=p.get("estado_anterior"),
                estado_nuevo=p.get("estado_nuevo"),
                accion=p["accion"],
                comentario=p.get("comentario"),
                created_at=p["created_at"],
            ))
    db.add_all(hist_sol)
    await db.flush()
    solicitudes_creadas = len(solicitudes_nuevas)
    log.hito("solicitudes", solicitudes=solicitudes_creadas,
             movimientos_de_historial=len(hist_sol),
             de_los_vecinos_demo=sum(1 for s, _p, _c in solicitudes_nuevas if s.solicitante_id),
             por_ventanilla=sum(1 for s, _p, _c in solicitudes_nuevas if not s.solicitante_id),
             circuitos=[f"{k}: {v}" for k, v in sorted(resumen_circuitos_sol.items())])

    # ------------------------------------------------------------------
    # 12. TRAZABILIDAD POR ACTOR + reparto en el tiempo
    # ------------------------------------------------------------------
    # Lo que el dueño quiere leer en la pantalla "Semilla" sin abrir la base:
    # quién creó qué, quién lo gestionó y quién lo ejecutó.
    def _por_actor(pares: list) -> list:
        """[(nombre, 1), ...] → ["Nombre — N"], de mayor a menor."""
        acc: dict[str, int] = {}
        for nombre, cuanto in pares:
            acc[nombre] = acc.get(nombre, 0) + cuanto
        return [f"{k} — {v}" for k, v in sorted(acc.items(), key=lambda kv: -kv[1])]

    _nom_user = {v.id: f"{v.nombre} {v.apellido or ''}".strip() for v in vecinos_demo}
    _nom_sup = {s.id: f"{s.nombre} {s.apellido or ''}".strip() for s in supervisores_demo}

    _mes = {}
    for r in reclamos_creados_list:
        k = (r.created_at or datetime.utcnow()).strftime("%Y-%m")
        _mes[k] = _mes.get(k, 0) + 1
    _mes_sol = {}
    for s, _p, _c in solicitudes_nuevas:
        k = (s.created_at or datetime.utcnow()).strftime("%Y-%m")
        _mes_sol[k] = _mes_sol.get(k, 0) + 1

    _gestion_sup = []
    for _r_obj, _pasos in zip(reclamos_creados_list, trazas_rec):
        for _p in _pasos:
            if _p["usuario"].id in _nom_sup:
                _gestion_sup.append((_nom_sup[_p["usuario"].id], 1))
    for _s_obj, _pasos_s, _c in solicitudes_nuevas:
        for _p in _pasos_s:
            if _p["usuario"] is not None and _p["usuario"].id in _nom_sup:
                _gestion_sup.append((_nom_sup[_p["usuario"].id], 1))

    log.hito(
        "trazabilidad",
        reclamos_por_vecino=_por_actor(
            [(_nom_user.get(r.creador_id, "?"), 1) for r in reclamos_creados_list]),
        solicitudes_por_vecino=_por_actor(
            [(_nom_user.get(s.solicitante_id, "por ventanilla"), 1)
             for s, _p, _c in solicitudes_nuevas]),
        movimientos_por_supervisor=_por_actor(_gestion_sup),
        ots_por_cuadrilla=ot_counts.get("por_cuadrilla") or [],
        ots_por_operario=ot_counts.get("por_operario") or [],
        reclamos_por_mes=[f"{k}: {v}" for k, v in sorted(_mes.items())],
        solicitudes_por_mes=[f"{k}: {v}" for k, v in sorted(_mes_sol.items())],
        ventana_dias=VENTANA_DIAS,
    )

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
        # admin + los 3 vecinos + supervisores + logins de empleado
        "usuarios": 1 + len(vecinos_demo) + len(supervisores_demo) + len(empleados_login),
        "vecinos": len(vecinos_demo),
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
    """Califica DOS DE CADA TRES reclamos cerrados (determinístico).

    Que califiquen todos es tan falso como que no califique nadie: en la
    realidad contesta una parte. Con puntuaciones 3-5 y alguna 2 (un municipio
    con 5,0 perfecto no le cree nadie), sub-puntajes coherentes con la nota
    general y 1 de cada 3 sin comentario. La fecha es 1-5 días DESPUÉS de la
    resolución — el vecino contesta cuando ya vio el trabajo hecho.

    Como el `usuario_id` sale de `reclamo.creador_id`, las calificaciones se
    reparten solas entre los tres vecinos demo, en la misma proporción en la
    que reclamaron.
    """
    from models.calificacion import Calificacion

    ahora = datetime.utcnow()
    cerrados = [r for r in reclamos
                if r.estado in (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO)]
    creadas = 0
    nuevas = []
    for k, rec in enumerate(cerrados):
        if k % 3 == 2:  # dos sí, uno no
            continue
        # `n` es el número de calificación (no de reclamo): así las primeras
        # tres ya cubren un 5, un 3 y un 4. Con el ciclo sobre `k` un demo
        # chico daba 5-5-4 y un promedio de 4,7 que no le cree nadie.
        n = creadas
        puntuacion = (5, 3, 4, 5, 2, 4, 5, 3)[n % 8]
        base = rec.fecha_resolucion or rec.created_at or ahora
        cuando = base + timedelta(days=1 + (n % 5), hours=(n * 7) % 10)
        if cuando >= ahora:
            cuando = ahora - timedelta(hours=6)
        nuevas.append(Calificacion(
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
    db.add_all(nuevas)
    await db.flush()
    return creadas


# ============================================================
# Órdenes de trabajo demo (circuito de campo formal)
# ============================================================

async def _seed_ordenes_trabajo(
    db: AsyncSession,
    municipio_id: int,
    reclamos: list,
    plan: list,
    cuadrillas: list,
    operarios: list,
    creador_id: int,
    rnd,
) -> dict:
    """Las órdenes de trabajo que PIDIERON los reclamos, más las preventivas.

    Antes eran 10 OTs de una lista fija cuyos `materiales` eran un JSON suelto:
    una OT "completada" que decía haber usado 4 bolsas de cemento sin que el
    inventario del municipio se enterara. Ahora:

      - cada OT nace del circuito de su reclamo (`plan`), con la MISMA cuadrilla
        y el mismo operario que figuran en el historial del reclamo y con fechas
        dentro de la vida de ese reclamo;
      - una OT completada CONSUME de verdad (descuenta stock del consumible y
        deja el `OrdenTrabajoRecurso` aplicado) y devuelve el activo que tomó;
      - una OT en curso tiene el activo TOMADO (el ítem queda `en_uso` y sabe
        qué OT lo tiene), que es lo que hace demostrable la pantalla de
        inventario;
      - las preventivas (sin reclamo), la cancelada y las pendientes sin asignar
        se agregan al final para que la cola de la cuadrilla no quede vacía.

    Devuelve counts para el log de seeding.
    """
    from datetime import date, time as _time, timedelta
    from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
    from models.inventario import InventarioItem, OrdenTrabajoRecurso
    from models.enums import (
        EstadoOrdenTrabajo, PrioridadOT, NaturalezaInventario, EstadoActivo,
        TipoRecursoOT,
    )

    hoy = date.today()
    ahora = datetime.utcnow()

    items = (await db.execute(
        select(InventarioItem).where(InventarioItem.municipio_id == municipio_id)
    )).scalars().all()
    activos = [i for i in items if i.naturaleza == NaturalezaInventario.ACTIVO]
    consumibles = [i for i in items if i.naturaleza == NaturalezaInventario.CONSUMIBLE]

    _ESTADOS = {
        "completada": EstadoOrdenTrabajo.COMPLETADA,
        "en_curso": EstadoOrdenTrabajo.EN_CURSO,
        "bloqueada": EstadoOrdenTrabajo.BLOQUEADA,
        "asignada": EstadoOrdenTrabajo.ASIGNADA,
        "pendiente": EstadoOrdenTrabajo.PENDIENTE,
        "cancelada": EstadoOrdenTrabajo.CANCELADA,
    }

    # Las órdenes preventivas y de cola: no salen de un reclamo, salen de la
    # planificación del municipio. Sin ellas la pantalla de OT sería un espejo
    # exacto de la de reclamos, y no lo es.
    PREVENTIVAS = [
        ("Mantenimiento preventivo de luminarias del corredor", "completada", -18),
        ("Recorrida de desmalezado de banquinas", "completada", -9),
        ("Limpieza de sumideros antes de la temporada de lluvias", "en_curso", 0),
        ("Pintura de sendas peatonales de las escuelas", "asignada", 3),
        ("Reposición de cartelería del casco urbano", "pendiente", 6),
        ("Poda programada del arbolado del boulevard", "pendiente", 9),
        ("Bacheo del acceso norte", "cancelada", -4),
    ]

    filas: list[tuple] = []   # (OrdenTrabajo, reclamo|None, clave_estado)
    numero = 0

    def _nueva(titulo, clave, cuadrilla, empleado, inicio, fin, dias_prog,
               categoria_id=None, reclamo=None):
        nonlocal numero
        numero += 1
        estado = _ESTADOS[clave]
        completada = clave == "completada"
        arrancada = clave in ("completada", "en_curso", "bloqueada")
        h_est = float(rnd.choice([2, 3, 4, 5, 6, 8]))
        ot = OrdenTrabajo(
            municipio_id=municipio_id,
            numero=f"OT-{hoy.year}-{numero:04d}",
            estado=estado,
            titulo=titulo[:200],
            descripcion=f"{titulo} — trabajo de campo del municipio.",
            categoria_id=categoria_id,
            prioridad=rnd.choice([PrioridadOT.BAJA, PrioridadOT.MEDIA,
                                  PrioridadOT.MEDIA, PrioridadOT.ALTA,
                                  PrioridadOT.URGENTE]),
            cuadrilla_id=cuadrilla.id if cuadrilla is not None else None,
            empleado_id=empleado.id if empleado is not None else None,
            fecha_programada=(inicio.date() if inicio else hoy + timedelta(days=dias_prog)),
            hora_inicio=_time(8, 0),
            hora_fin=_time(12, 0),
            horas_estimadas=h_est,
            horas_reales=round(h_est + rnd.uniform(-1.5, 1.5), 1) if completada else None,
            notas_cierre=("Trabajo terminado y verificado en el lugar."
                          if completada else None),
            motivo_cancelacion=("Se resolvió por administración antes de salir a campo."
                                if clave == "cancelada" else None),
            fecha_inicio_real=inicio if arrancada else None,
            fecha_completada=fin if completada else None,
            creador_id=creador_id,
        )
        db.add(ot)
        filas.append((ot, reclamo, clave))
        return ot

    for p in plan:
        rec = reclamos[p["reclamo_pos"]] if p["reclamo_pos"] < len(reclamos) else None
        _nueva(p["titulo"], p["estado"], p.get("cuadrilla"), p.get("empleado"),
               p.get("inicio"), p.get("fin"), 0,
               categoria_id=p.get("categoria_id"), reclamo=rec)

    for titulo, clave, dias in PREVENTIVAS:
        cua = rnd.choice(cuadrillas) if cuadrillas and clave != "pendiente" else None
        emp = rnd.choice(operarios) if operarios and clave not in ("pendiente", "cancelada") else None
        inicio = (ahora + timedelta(days=dias)) if dias < 0 else None
        fin = (ahora + timedelta(days=dias, hours=5)) if dias < 0 else None
        _nueva(titulo, clave, cua, emp, inicio, fin, dias)

    await db.flush()   # UN flush para todos los ids (antes era uno por OT)

    # --- Vínculos con los reclamos + recursos de inventario ---
    vinculos = []
    recursos = []
    materiales_por_ot: dict[int, list] = {}
    con_consumo = con_activo = 0
    activos_tomados = 0
    i_act = i_con = 0

    for ot, rec, clave in filas:
        if rec is not None:
            vinculos.append(OrdenTrabajoReclamo(orden_trabajo_id=ot.id, reclamo_id=rec.id))

        # CONSUMO: solo las que efectivamente se ejecutaron. Una OT completada
        # sin materiales es lo que el WO pide evitar.
        if clave == "completada" and consumibles:
            cuantos = 1 + (i_con % 2)
            usados = []
            for k in range(cuantos):
                item = consumibles[(i_con + k) % len(consumibles)]
                cant = float(rnd.randint(1, 6))
                recursos.append(OrdenTrabajoRecurso(
                    orden_trabajo_id=ot.id, item_id=item.id,
                    tipo=TipoRecursoOT.CONSUMO, cantidad=cant,
                    item_nombre=item.nombre, aplicado=True,
                ))
                # El stock BAJA de verdad: si no, la pantalla de inventario
                # muestra el stock inicial intacto después de 20 trabajos.
                item.stock_actual = max(0.0, (item.stock_actual or 0.0) - cant)
                usados.append({"descripcion": item.nombre, "cantidad": cant,
                               "unidad": item.unidad or "u"})
            materiales_por_ot[ot.id] = usados
            i_con += cuantos
            con_consumo += 1

        # RESERVA de un activo. Las en curso lo tienen TOMADO; las completadas
        # lo tomaron y lo devolvieron (queda el registro, el ítem vuelve libre).
        if clave in ("completada", "en_curso") and activos:
            item = activos[i_act % len(activos)]
            i_act += 1
            ya_ocupado = item.estado_activo == EstadoActivo.EN_USO
            if not (clave == "en_curso" and ya_ocupado):
                recursos.append(OrdenTrabajoRecurso(
                    orden_trabajo_id=ot.id, item_id=item.id,
                    tipo=TipoRecursoOT.RESERVA, cantidad=None,
                    item_nombre=item.nombre, aplicado=True,
                ))
                con_activo += 1
                if clave == "en_curso":
                    item.estado_activo = EstadoActivo.EN_USO
                    item.ocupado_por_ot_id = ot.id
                    activos_tomados += 1

    for ot, _rec, _clave in filas:
        if ot.id in materiales_por_ot:
            ot.materiales = materiales_por_ot[ot.id]

    db.add_all(vinculos)
    db.add_all(recursos)
    await db.flush()

    por_estado: dict[str, int] = {}
    for _ot, _rec, clave in filas:
        por_estado[clave] = por_estado.get(clave, 0) + 1

    por_cuadrilla: dict[str, int] = {}
    por_operario: dict[str, int] = {}
    nom_cua = {c.id: c.nombre for c in cuadrillas}
    nom_ope = {e.id: f"{e.nombre} {e.apellido}" for e in operarios}
    for ot, _rec, _clave in filas:
        if ot.cuadrilla_id in nom_cua:
            por_cuadrilla[nom_cua[ot.cuadrilla_id]] = por_cuadrilla.get(
                nom_cua[ot.cuadrilla_id], 0) + 1
        if ot.empleado_id in nom_ope:
            por_operario[nom_ope[ot.empleado_id]] = por_operario.get(
                nom_ope[ot.empleado_id], 0) + 1

    return {
        "ordenes_trabajo": len(filas),
        "desde_reclamo": len(plan),
        "preventivas_y_cola": len(filas) - len(plan),
        "vinculos_ot_reclamo": len(vinculos),
        "con_materiales_consumidos": con_consumo,
        "con_activo_reservado": con_activo,
        "activos_en_uso_ahora": activos_tomados,
        "por_estado": [f"{k}: {v}" for k, v in sorted(por_estado.items())],
        "por_cuadrilla": [f"{k} — {v}" for k, v in sorted(por_cuadrilla.items(),
                                                          key=lambda kv: -kv[1])],
        "por_operario": [f"{k} — {v}" for k, v in sorted(por_operario.items(),
                                                         key=lambda kv: -kv[1])],
    }


# ============================================================
# Turnero demo — se corre al FINAL del pipeline de crear-demo
# (después de seed_10_demos, que agrega trámites sin modo de atención)
# ============================================================

_MODOS_ONLINE_KW = ("libre deuda", "certificado", "constancia", "boleta")
_MODOS_SIN_TURNO_KW = ("denuncia", "reclamo")
_MODOS_KYC_KW = ("licencia", "conducir")


async def seed_turnero_demo(db: AsyncSession, municipio_id: int, log=None) -> dict:
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

    # ==================================================================
    # LOS TURNOS CUELGAN DE EXPEDIENTES QUE EXISTEN
    # ==================================================================
    # Antes los turnos se inventaban sueltos: 15 futuros + 22 pasados sobre un
    # trámite cualquiera y siempre del mismo vecino. Un turno "cumplido" de una
    # solicitud que nunca existió es exactamente lo que el WO prohíbe, y además
    # dejaba la agenda desconectada del mostrador.
    #
    # Ahora cada turno sale de una SOLICITUD real del muni:
    #   - expediente cerrado (finalizado / rechazado) -> turno PASADO, entre su
    #     creación y su resolución, con resultado (cumplido / ausente / cancelado);
    #   - expediente abierto y viejo -> turno pasado, ya atendido;
    #   - expediente abierto y reciente -> turno FUTURO reservado.
    # El dueño del turno es el solicitante; si la solicitud entró por ventanilla
    # a nombre de otra persona, el turno queda con el nombre y el DNI de esa
    # persona y sin usuario, que es como se ve un turno de mostrador.
    if con_turno and deps:
        dep_de = {}
        for fila in (await db.execute(
            select(MunicipioDependenciaTramite).join(
                MunicipioDependencia,
                MunicipioDependencia.id == MunicipioDependenciaTramite.municipio_dependencia_id)
            .where(MunicipioDependencia.municipio_id == municipio_id)
        )).scalars().all():
            dep_de[fila.tramite_id] = fila.municipio_dependencia_id

        ids_con_turno = {t.id: t for t in con_turno}
        solicitudes = (await db.execute(
            select(Solicitud).where(
                Solicitud.municipio_id == municipio_id,
                Solicitud.tramite_id.in_(list(ids_con_turno.keys())),
            ).order_by(Solicitud.id)
        )).scalars().all()

        def _dia_habil(base: date, delta: int) -> date:
            d = base + timedelta(days=delta)
            while d.weekday() >= 5:
                d += timedelta(days=1 if delta >= 0 else -1)
            return d

        hoy = date.today()
        ahora = datetime.now()
        nuevos_turnos = []
        # Sólo 2 de cada 3 expedientes de trámite presencial sacan turno: el
        # resto se atendió por orden de llegada. Que TODOS tengan turno se lee
        # tan sintético como que no lo tenga ninguno.
        for k, sol in enumerate(solicitudes):
            if k % 3 == 2:
                continue
            dep_id = dep_de.get(sol.tramite_id)
            if not dep_id:
                continue
            tram = ids_con_turno[sol.tramite_id]
            creada = sol.created_at or (datetime.utcnow() - timedelta(days=5))
            if creada.tzinfo is not None:
                creada = creada.replace(tzinfo=None)
            cerrada = sol.fecha_resolucion
            if cerrada is not None and cerrada.tzinfo is not None:
                cerrada = cerrada.replace(tzinfo=None)
            dias_desde = (ahora - creada).days

            if cerrada is not None:
                # Entre que entró y que se resolvió: el día en que lo atendieron.
                margen = max((cerrada - creada).days, 1)
                fecha = _dia_habil(creada.date(), max(1, margen // 2))
                if fecha > cerrada.date():
                    fecha = _dia_habil(cerrada.date(), 0)
                estado = _estado_turno_pasado(k)
            elif dias_desde >= 4:
                fecha = _dia_habil(creada.date(), 2)
                estado = _estado_turno_pasado(k)
            else:
                # Expediente de esta semana: el turno todavía no llegó. Se
                # reparte en los próximos 12 días hábiles para que la agenda
                # tenga "hoy", "esta semana" y "el mes".
                fecha = _dia_habil(hoy, k % 13)
                estado = "reservado"

            hora = 8 + (k * 3) % 5
            minuto = (0, 30)[k % 2]
            fh = datetime.combine(fecha, datetime.min.time()).replace(
                hour=hora, minute=minuto)
            # Guardarraíl: un turno cuya hora YA pasó no puede quedar
            # "reservado" — pasa con los de hoy cuando la demo se crea a la
            # tarde. Se cierra con el mismo mix determinístico.
            if fh < ahora and estado == "reservado":
                estado = _estado_turno_pasado(k)
            if fh > ahora and estado != "reservado":
                # Y al revés: nada atendido en el futuro.
                fh = datetime.combine(_dia_habil(hoy, -1), datetime.min.time()).replace(
                    hour=hora, minute=minuto)

            nombre_sol = f"{sol.nombre_solicitante or ''} {sol.apellido_solicitante or ''}".strip()
            nuevos_turnos.append(Turno(
                motivo_tipo="tramite",
                solicitud_id=sol.id,
                origen_id=sol.id,
                tramite_id=tram.id,
                usuario_id=sol.solicitante_id,
                municipio_dependencia_id=dep_id,
                municipio_id=municipio_id,
                fecha_hora=fh,
                duracion_min=tram.duracion_turno_min or 30,
                estado=estado,
                nombre_solicitante=nombre_sol or None,
                dni_solicitante=sol.dni_solicitante,
                telefono_solicitante=sol.telefono_solicitante,
                recordatorio_enviado_at=(datetime.utcnow() - timedelta(days=1))
                if estado != "reservado" else None,
            ))
        db.add_all(nuevos_turnos)
        counts["turnos"] = len(nuevos_turnos)
        counts["turnos_futuros"] = sum(1 for t in nuevos_turnos if t.estado == "reservado")
        counts["turnos_del_mostrador"] = sum(
            1 for t in nuevos_turnos if t.usuario_id is None)
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

    # El reparto REAL de la agenda, para el log del super admin: no alcanza con
    # "37 turnos" — lo que se mira es cuántos se cumplieron, cuántos faltaron y
    # cuánto queda por atender.
    por_estado = dict((await db.execute(text(
        "SELECT estado, COUNT(*) FROM turnos WHERE municipio_id = :m GROUP BY estado"
    ), {"m": municipio_id})).fetchall())
    counts["por_estado"] = [f"{k}: {v}" for k, v in sorted(por_estado.items())]
    if log is not None:
        log.hito("turnos", **{k: v for k, v in counts.items()
                              if k not in ("estado", "motivo", "nombre")})

    # NOTA: antes había un "balanceo" acá que le inyectaba 2 reclamos
    # sintéticos a CUALQUIER dependencia con <2 reclamos — incluidas las 6
    # dependencias habilitadas pero sin contenido demo (ver
    # DEPENDENCIAS_ACTIVAS en seed_demo.py). Eso llenaba de ruido el
    # organigrama y contradice la curación: solo las dependencias activas
    # deben mostrar actividad, el resto queda deliberadamente vacío.
    return counts
