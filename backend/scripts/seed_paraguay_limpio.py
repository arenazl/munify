"""
Seed white-label RICO: municipio "Paraguay Limpio" (Asunción, Departamento Central).
=====================================================================================

Marca cliente (front paraguay-limpio.netlify.app) que corre sobre el MISMO backend
Munify. Este script deja una demo 100% funcional y RICA de RECLAMOS + TRÁMITES sobre
datos REALES de Asunción, con TODA la cadena de participantes (vecino → supervisor →
cuadrilla/empleado → orden de trabajo → inventario), sin tocar ningún otro municipio.

Qué crea (idempotente — seguro de correr N veces; NO duplica):
  - Municipio "Asunción, Departamento Central" (codigo `asuncion`), branding verde,
    es_demo=True (expone la botonera de login rápido).
  - 20 categorías default (10 reclamo + 10 trámite).
  - Las 12 dependencias del catálogo global habilitadas (organigrama COMPLETO), de las
    cuales 5 son OPERATIVAS (Servicios Públicos, Obras Públicas, Tránsito, Zoonosis,
    Seguridad) con supervisor y contenido demo + mapeo categoría → dependencia (cubre
    las 10 categorías de reclamo sin huérfanos).
  - 68 barrios REALES del catálogo oficial VigiCanPY/MSPBS, geocodificados con
    Nominatim (66/68 con coords; 2 sin coord conocida quedan en NULL — nunca coords
    inventadas).
  - Usuarios (password `demo123`, dominio `@asuncion.demo.com` para que los muestre la
    botonera): admin, 1 supervisor por dependencia (5), 3 vecinos paraguayos y el login
    de 2 empleados destacados (para ver el caso desde el POV del operario de campo).
  - 6 zonas + 10 empleados (nombres paraguayos, DEMO) repartidos por secretaría con las
    especialidades típicas + 4 cuadrillas (líder + miembros).
  - 10 reclamos temáticos de Asunción con CADENA COMPLETA y coherente: coords reales
    sobre barrios, estados variados, historial con comentarios de cada actor, su ORDEN
    DE TRABAJO (materiales, horas, estado, notas de cierre) y cruce con INVENTARIO
    (activos reservados + consumibles descontados). 2 casos trabados por falta de
    insumos (OT BLOQUEADA + nota explícita "a la espera de reposición de inventario").
  - 13 trámites completos (con documentos requeridos; TODA categoría de trámite queda
    con al menos 1 tipo y TODO trámite con su dependencia) + 10 solicitudes en estados
    variados (solicitante = vecinos), mapeadas a su dependencia.
  - Inventario (activos + consumibles) coherente con los materiales de las OT.
  - SLA configs por categoría.
  - TODOS los módulos opt-in HABILITADOS (visibles en el sidebar): ordenes_trabajo,
    inventario, sueldos, contaduria, tesoreria.

Correr (desde backend/):  python -m scripts.seed_paraguay_limpio
Usa settings.DATABASE_URL (el ambiente donde apunte el backend). En QA lo corre Infra.
"""
import asyncio
import hashlib
import unicodedata
from datetime import date, datetime, time as dtime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.security import get_password_hash
from models.enums import (
    RolUsuario, EstadoReclamo, EstadoOrdenTrabajo, PrioridadOT,
    NaturalezaInventario, EstadoActivo, TipoRecursoOT,
)
from models.municipio import Municipio
from models.user import User
from models.barrio import Barrio
from models.dependencia import Dependencia
from models.municipio_dependencia import MunicipioDependencia
from models.municipio_dependencia_categoria import MunicipioDependenciaCategoria
from models.municipio_dependencia_tramite import MunicipioDependenciaTramite
from models.categoria_reclamo import CategoriaReclamo
from models.categoria_tramite import CategoriaTramite
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.calificacion import Calificacion
from models.tramite import Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from models.tramite_documento_requerido import TramiteDocumentoRequerido
from models.municipio_modulo import MunicipioModulo
from models.zona import Zona
from models.empleado import Empleado
from models.empleado_categoria import empleado_categoria
from models.cuadrilla import Cuadrilla
from models.cuadrilla_categoria import cuadrilla_categoria
from models.empleado_cuadrilla import EmpleadoCuadrilla
from models.sla import SLAConfig
from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
from models.inventario import InventarioItem, OrdenTrabajoRecurso
from models.poi import PoiTipo, PuntoInteres
from services.categorias_default import crear_categorias_default
from services.inventario_seed import seed_inventario
from services.poi_seed import seed_poi_tipos, activar_modulo_poi
from services.poi_matching import recalcular_pois_municipio
from scripts.migrate_add_poi import (
    DDL_POI_TIPOS, DDL_PUNTOS_INTERES, ALTER_RECLAMOS, ALTER_ORDENES,
    _col_existe, _tabla_existe,
)


# ============================================================
# Datos del municipio
# ============================================================
CODIGO = "asuncion"
NOMBRE = "Asunción, Dpto. Central"
# Centroide de los barrios geocodificados (centro real de la ciudad).
CENTRO_LAT = -25.286557
CENTRO_LON = -57.598648
COLOR_PRIMARIO = "#1b7a3d"    # verde del logo Paraguay Limpio
COLOR_SECUNDARIO = "#5cb85c"
LOGO_URL = "/brands/paraguay-limpio/logo.png"

PASSWORD_DEMO = "demo123"

# ============================================================
# Barrios de Asunción (catálogo oficial VigiCanPY/MSPBS)
# (codigo_oficial, nombre, lat, lon) — coords Nominatim (66/68)
# ============================================================
BARRIOS_ASUNCION = [
    ( 1, "Sajonia", -25.292364, -57.661977),
    ( 2, "San Antonio", -25.281845, -57.657161),
    ( 3, "Dr. Gaspar Rodríguez de Francia", -25.277358, -57.647996),
    ( 4, "Itá Pytã Punta", -25.284299, -57.664687),
    ( 5, "La Encarnación", -25.281089, -57.638719),
    ( 6, "Tacumbú", -25.296526, -57.650481),
    ( 7, "Jukyty", -25.339176, -57.645995),
    ( 8, "La Catedral", -25.285734, -57.633864),
    ( 9, "Gral. José Eduvigis Díaz", -25.292103, -57.641774),
    (10, "Obrero Intendente B. Guggiari", -25.299438, -57.644562),
    (11, "Roberto L. Petit", None, None),
    (12, "Ricardo Brugada", -25.279437, -57.631739),
    (13, "San Roque", -25.289706, -57.626822),
    (14, "Tte. Silvio Pettirossi", -25.291379, -57.625874),
    (15, "San Vicente", -25.311569, -57.625287),
    (16, "Pinozá", -25.305914, -57.613533),
    (17, "Vista Alegre", -25.314428, -57.603199),
    (18, "Mburicaó", -25.300796, -57.601562),
    (19, "Gral. Bernardino Caballero", -25.298986, -57.608838),
    (20, "Ciudad Nueva", -25.294367, -57.619449),
    (21, "Las Mercedes", -25.280612, -57.612773),
    (22, "Bañado Cará Cará", None, None),
    (23, "Jara", -25.277801, -57.605442),
    (24, "Mariscal Francisco Solano López", -25.278689, -57.634647),
    (25, "Virgen del Huerto", -25.276342, -57.596707),
    (26, "Banco San Miguel", -25.259325, -57.61377),
    (27, "San Cayetano", -25.323711, -57.656679),
    (28, "Republicano", -25.317989, -57.632657),
    (29, "Santa Ana", -25.315389, -57.65848),
    (30, "Itá Enramada", -25.353923, -57.639434),
    (31, "Santa Librada", -25.300326, -57.663981),
    (32, "De la Residenta", -25.238003, -57.544838),
    (33, "Presidente Carlos Antonio López", -25.194167, -57.63061),
    (34, "Nazareth", -25.319469, -57.595291),
    (35, "Terminal", -25.325548, -57.593286),
    (36, "Hipódromo", -25.317441, -57.584989),
    (37, "San Pablo", -25.324885, -57.5768),
    (38, "Villa Aurelia", -25.31202, -57.562124),
    (39, "Los Laureles", -25.311355, -57.577007),
    (40, "Tembetary", -25.307327, -57.590012),
    (41, "Recoleta", -25.297808, -57.586241),
    (42, "Villa Morra", -25.288011, -57.580675),
    (43, "Mcal. José Félix Estigarribia", -25.304768, -57.571126),
    (44, "San Cristóbal", -25.294787, -57.566974),
    (45, "Ycuá Satí", -25.287682, -57.56466),
    (46, "Luis Alberto de Herrera", -25.300666, -57.556215),
    (47, "Santa María", -25.301584, -57.549568),
    (48, "Ytay", -25.28229, -57.543742),
    (49, "San Jorge", -25.284132, -57.552068),
    (50, "Tablada Nueva", -25.25836, -57.60002),
    (51, "Virgen de Fátima", -25.254459, -57.589846),
    (52, "Santa Rosa", -25.252122, -57.584648),
    (53, "Virgen de la Asunción", -25.261056, -57.585633),
    (54, "Bella Vista", -25.278948, -57.588816),
    (55, "Santo Domingo", -25.281921, -57.584262),
    (56, "Cañada del Ybyray", -25.267619, -57.578168),
    (57, "Santísima Trinidad", -25.256776, -57.577834),
    (58, "Manorá", -25.284279, -57.572659),
    (59, "Las Lomas", -25.277124, -57.570448),
    (60, "Mburucuyá", -25.265755, -57.5662),
    (61, "Madame Elisa Alicia Linch", -25.318673, -57.559338),
    (62, "Salvador del Mundo", -25.27443, -57.550561),
    (63, "Mbocayaty", -25.260314, -57.557765),
    (64, "Ñu Guazú", -25.26615, -57.543175),
    (65, "Loma Pytá", -25.246547, -57.54111),
    (66, "San Blas", -25.241143, -57.536276),
    (67, "Botánico", -25.242021, -57.577662),
    (68, "Zeballos Cué", -25.232477, -57.562022),
]

# ============================================================
# Dependencias: organigrama COMPLETO + subset operativo.
# Los códigos existen en el catálogo global (services/dependencias_default.py).
# ============================================================
# Se habilitan las 12 dependencias del catálogo canónico para que Asunción
# tenga el organigrama real y completo (regla del dueño: catálogos SIEMPRE
# completos — antes se habilitaban solo 5 y el organigrama quedaba mocho).
DEPENDENCIAS = [
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

# Subset OPERATIVO (curado): solo estas 5 reciben supervisor con login demo y
# concentran los reclamos/OT de ejemplo. El resto del organigrama queda
# habilitado (visible y asignable) pero sin bandeja cargada — el set operativo
# de la demo sigue chico y curado (regla 3).
DEPENDENCIAS_OPERATIVAS = [
    "SERVICIOS_PUBLICOS", "OBRAS_PUBLICAS", "TRANSITO_VIAL", "ZOONOSIS", "SEGURIDAD",
]

# Mapeo categoría de reclamo -> dependencia (cubre las 10 default sin huérfanos).
DEP_CATEGORIAS_MAP = {
    "SERVICIOS_PUBLICOS": [
        "Alumbrado público", "Recolección de residuos",
        "Arbolado y espacios verdes", "Agua y cloacas", "Higiene urbana",
    ],
    "OBRAS_PUBLICAS": ["Bacheo y calles"],
    "TRANSITO_VIAL": ["Tránsito y señalización"],
    "ZOONOSIS": ["Plagas y control", "Animales sueltos"],
    "SEGURIDAD": ["Ruidos y convivencia"],
}

# ============================================================
# 3 vecinos demo (nombres paraguayos plausibles — datos de DEMO).
# Emails @asuncion.demo.com para que los muestre la botonera de login rápido.
# ============================================================
VECINOS = [
    {"email": "vecino@asuncion.demo.com",         "nombre": "Derlis",  "apellido": "González", "sexo": "M", "tel": "+595 981 111222"},
    {"email": "vecino-liz@asuncion.demo.com",     "nombre": "Liz",     "apellido": "Benítez",  "sexo": "F", "tel": "+595 982 333444"},
    {"email": "vecino-rodrigo@asuncion.demo.com", "nombre": "Rodrigo", "apellido": "Villalba", "sexo": "M", "tel": "+595 983 555666"},
]

# ============================================================
# 6 zonas de Asunción (coords de un barrio representativo de cada sector).
# codigo <= 20 chars (VARCHAR(20)); se sufija con muni_id para unicidad global.
# ============================================================
ZONAS = [
    # Nombres REALES de sectores/barrios ancla de Asunción (pedido del dueño:
    # nada de Norte/Sur/Este genéricos). El codigo se mantiene estable para que
    # el rename sea idempotente sobre las zonas ya sembradas.
    ("Microcentro",        "AS-CEN",  -25.285734, -57.633864),  # La Catedral
    ("Santísima Trinidad", "AS-NOR",  -25.256776, -57.577834),
    ("Tacumbú",            "AS-SUR",  -25.296526, -57.650481),
    ("Villa Morra",        "AS-ESTE", -25.288011, -57.580675),
    ("Chacarita",          "AS-COST", -25.279437, -57.631739),  # Ricardo Brugada
    ("Zeballos Cué",       "AS-PERI", -25.232477, -57.562022),
]

# ============================================================
# 10 empleados demo (nombres paraguayos — datos de DEMO), repartidos por
# secretaría con las especialidades de los reclamos típicos de la ciudad.
# (nombre, apellido, tel, tipo, especialidad, categoria_reclamo, zona, dep_codigo)
# ============================================================
EMPLEADOS = [
    ("Wilson",    "Ayala",    "+595 971 100001", "operario",       "Bacheo y pavimento",       "Bacheo y calles",            "Tacumbú",            "OBRAS_PUBLICAS"),
    ("Derlis",    "Cardozo",  "+595 971 100002", "operario",       "Recolección y limpieza",   "Recolección de residuos",    "Microcentro",        "SERVICIOS_PUBLICOS"),
    ("Gustavo",   "Benítez",  "+595 971 100003", "operario",       "Electricidad pública",     "Alumbrado público",          "Santísima Trinidad", "SERVICIOS_PUBLICOS"),
    ("Cristhian", "Ojeda",    "+595 971 100004", "operario",       "Poda y espacios verdes",   "Arbolado y espacios verdes", "Villa Morra",        "SERVICIOS_PUBLICOS"),
    ("Nelson",    "Duarte",   "+595 971 100005", "operario",       "Higiene urbana",           "Higiene urbana",             "Chacarita",          "SERVICIOS_PUBLICOS"),
    ("Hugo",      "Espínola", "+595 971 100006", "operario",       "Agua y desagües",          "Agua y cloacas",             "Microcentro",        "SERVICIOS_PUBLICOS"),
    ("Óscar",     "Cabral",   "+595 971 100007", "operario",       "Señalización vial",        "Tránsito y señalización",    "Villa Morra",        "TRANSITO_VIAL"),
    ("Rubén",     "Villalba", "+595 971 100008", "operario",       "Fumigación y descacharrado", "Plagas y control",         "Tacumbú",            "ZOONOSIS"),
    ("Fabián",    "Gauto",    "+595 971 100009", "operario",       "Control y rescate animal", "Animales sueltos",           "Zeballos Cué",       "ZOONOSIS"),
    ("Carolina",  "Franco",   "+595 971 100010", "administrativo", "Inspección y convivencia", "Ruidos y convivencia",       "Microcentro",        "SEGURIDAD"),
]

# Índices (en EMPLEADOS) de los 2 empleados destacados con login propio,
# para ver el caso desde el POV del operario de campo.
EMPLEADOS_LOGIN_IDX = [2, 0]  # Gustavo (Alumbrado), Wilson (Bacheo)

# ============================================================
# 4 cuadrillas (líder + 1 miembro), tomados de los 10 empleados.
# (nombre, descripcion, categoria, zona, lider_idx, miembro_idx)
# ============================================================
CUADRILLAS = [
    ("Cuadrilla Bacheo",      "Equipo de reparación de baches y calzada",           "Bacheo y calles",            "Tacumbú",            0, 5),
    ("Cuadrilla Alumbrado",   "Equipo de mantenimiento eléctrico y luminarias",     "Alumbrado público",          "Santísima Trinidad", 2, 3),
    ("Cuadrilla Recolección", "Equipo de recolección e higiene urbana",             "Recolección de residuos",    "Microcentro",        1, 4),
    ("Cuadrilla Zoonosis",    "Equipo de fumigación y control de plagas/animales",  "Plagas y control",           "Tacumbú",            7, 8),
]

# ============================================================
# SLA configs (por categoría + general).
# (categoria_o_None, resp_h, reso_h, alerta_h)
# ============================================================
SLA_CONFIGS = [
    ("Bacheo y calles",         24, 72,  48),
    ("Alumbrado público",       12, 48,  24),
    ("Recolección de residuos",  8, 24,  16),
    ("Tránsito y señalización",  6, 24,  12),
    ("Agua y cloacas",           6, 24,  12),
    ("Plagas y control",        24, 72,  48),
    (None,                      48, 168, 96),  # General (fallback)
]

# ============================================================
# 10 reclamos con CADENA COMPLETA (coords reales sobre barrios de Asunción).
# Cada uno lleva su Orden de Trabajo (ot) y su historial con comentarios de
# cada actor. `vecino` = índice en VECINOS. `barrio_cod` = código en
# BARRIOS_ASUNCION. `dias` = hace cuántos días se creó (mapa de calor < 30d).
#
# ot: dict con el circuito de campo — cuadrilla (idx en CUADRILLAS | None),
#     empleado (idx en EMPLEADOS | None), estado (EstadoOrdenTrabajo),
#     prioridad, materiales (JSON), h_est/h_real, notas_cierre, y recursos
#     (cruce con inventario: lista de (item_nombre, tipo, cantidad)).
# historial: [{actor: vecino|supervisor|empleado, accion, estado_anterior,
#              estado_nuevo, comentario}]
# ============================================================
def _jitter(i: int, amp: float) -> tuple:
    """Desplazamiento determinístico (dlat, dlon) en ~[-amp, +amp] por índice de
    reclamo. Reemplaza cualquier random.* (regla dura: NUNCA coords random
    presentadas como reales). Con amp chico los reclamos de un mismo barrio caen
    JUNTOS y forman un hotspot; con amp grande se dispersan naturalmente."""
    h = int(hashlib.sha1(f"asuncion-jitter-{i}".encode()).hexdigest(), 16)
    dlat = ((h % 4001) / 2000.0 - 1.0) * amp
    dlon = (((h >> 20) % 4001) / 2000.0 - 1.0) * amp
    return round(dlat, 6), round(dlon, 6)

RECLAMOS = [
    {  # 1 — recolección, EN_CURSO, OT en curso
        "titulo": "Basura acumulada sobre calle Colón",
        "descripcion": "Hace cuatro días que no pasa el recolector por Colón casi Estados Unidos. La basura se amontona en la esquina y hay mal olor.",
        "categoria": "Recolección de residuos", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 1, "canal": "app", "dias": 3, "vecino": 0,
        "direccion": "Colón c/ Estados Unidos, Sajonia",
        "ot": {"titulo": "Retiro de residuos acumulados y refuerzo de recolección",
               "estado": EstadoOrdenTrabajo.EN_CURSO, "prioridad": PrioridadOT.ALTA,
               "cuadrilla": 2, "empleado": 1, "dias_prog": 0,
               "materiales": None, "h_est": 3.0, "h_real": None, "notas_cierre": None,
               "recursos": [("Camioneta utilitaria", "reserva", None)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Cargué el reclamo desde la app con foto de la esquina."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se generó la OT y se asignó a la Cuadrilla Recolección (Derlis Cardozo) para recorrida extra."},
            {"actor": "empleado", "accion": "Nota",
             "comentario": "Salgo con el móvil al sector, confirmo retiro al terminar la cuadra."},
        ],
    },
    {  # 2 — higiene urbana, RECIBIDO, OT pendiente
        "titulo": "Microbasural en terreno baldío",
        "descripcion": "Un terreno baldío sobre Palma se convirtió en microbasural. Los vecinos piden limpieza y que se cierre el predio.",
        "categoria": "Higiene urbana", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.RECIBIDO, "barrio_cod": 8, "canal": "whatsapp", "dias": 1, "vecino": 1,
        "direccion": "Palma c/ Alberdi, La Catedral",
        "ot": {"titulo": "Limpieza de microbasural en baldío",
               "estado": EstadoOrdenTrabajo.PENDIENTE, "prioridad": PrioridadOT.MEDIA,
               "cuadrilla": None, "empleado": None, "dias_prog": 3,
               "materiales": [{"descripcion": "Bolsas de residuo reforzadas", "cantidad": 20, "unidad": "u"}],
               "h_est": 4.0, "h_real": None, "notas_cierre": None, "recursos": []},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Mandé el reclamo por WhatsApp con la ubicación del baldío."},
        ],
    },
    {  # 3 — alumbrado, EN_CURSO, OT BLOQUEADA por falta de inventario
        "titulo": "Recambio de luminarias LED en Av. Mcal. López",
        "descripcion": "Tramo de tres cuadras sin alumbrado sobre Av. Mcal. López. Se pidió el recambio a LED de todo el tramo.",
        "categoria": "Alumbrado público", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 42, "canal": "app", "dias": 8, "vecino": 2,
        "direccion": "Av. Mcal. López c/ San Martín, Villa Morra",
        "ot": {"titulo": "Recambio de tramo de luminarias a LED",
               "estado": EstadoOrdenTrabajo.BLOQUEADA, "prioridad": PrioridadOT.ALTA,
               "cuadrilla": 1, "empleado": 2, "dias_prog": -1,
               "materiales": [{"descripcion": "Lámpara LED 150W", "cantidad": 8, "unidad": "u"}],
               "h_est": 6.0, "h_real": None, "notas_cierre": None,
               "recursos": [("Camioneta 4x4", "reserva", None),
                            ("Lámpara LED 150W", "consumo", 8)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Todo el tramo quedó a oscuras, es peligroso de noche."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "OT generada y asignada a la Cuadrilla Alumbrado (Gustavo Benítez)."},
            {"actor": "empleado", "accion": "Nota",
             "comentario": "Trabajo en pausa: sin stock de luminarias LED 150W en depósito. A la espera de reposición de inventario para completar el tramo."},
        ],
    },
    {  # 4 — arbolado, FINALIZADO, OT completada
        "titulo": "Poda de árbol que toca los cables",
        "descripcion": "Un árbol grande sobre Av. España tiene ramas enredadas en los cables de media tensión. Riesgo con viento.",
        "categoria": "Arbolado y espacios verdes", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.FINALIZADO, "barrio_cod": 41, "canal": "app", "dias": 20, "vecino": 0,
        "direccion": "Av. España c/ Brasil, Recoleta",
        "confirmado_vecino": True,
        "ot": {"titulo": "Poda correctiva de arbolado sobre línea eléctrica",
               "estado": EstadoOrdenTrabajo.COMPLETADA, "prioridad": PrioridadOT.ALTA,
               "cuadrilla": None, "empleado": 3, "dias_prog": -3,
               "materiales": [{"descripcion": "Combustible motosierra", "cantidad": 8, "unidad": "l"}],
               "h_est": 5.0, "h_real": 4.5,
               "notas_cierre": "Poda realizada y ramas retiradas. Se despejaron los cables junto con la distribuidora eléctrica.",
               "recursos": [("Motosierra", "reserva", None),
                            ("Camioneta utilitaria", "reserva", None)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Con viento las ramas hacen chispas contra el cable."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se coordinó con la distribuidora eléctrica el corte programado y se asignó a Cristhian Ojeda."},
            {"actor": "empleado", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO,
             "estado_nuevo": EstadoReclamo.FINALIZADO,
             "comentario": "Poda terminada, ramas retiradas y cables despejados."},
        ],
    },
    {  # 5 — bacheo, EN_CURSO, OT asignada
        "titulo": "Bache profundo sobre Eusebio Ayala",
        "descripcion": "Bache de gran tamaño sobre Av. Eusebio Ayala que ya rompió la rueda de dos autos. Urgente.",
        "categoria": "Bacheo y calles", "dep": "OBRAS_PUBLICAS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 18, "canal": "web_publica", "dias": 4, "vecino": 1,
        "direccion": "Av. Eusebio Ayala c/ Molas López, Mburicaó",
        "ot": {"titulo": "Bacheo de calzada y compactado",
               "estado": EstadoOrdenTrabajo.ASIGNADA, "prioridad": PrioridadOT.URGENTE,
               "cuadrilla": 0, "empleado": 0, "dias_prog": 1,
               "materiales": [{"descripcion": "Asfalto en frío", "cantidad": 6, "unidad": "bolsas"},
                              {"descripcion": "Arena", "cantidad": 3, "unidad": "m3"}],
               "h_est": 4.0, "h_real": None, "notas_cierre": None,
               "recursos": [("Camión volcador", "reserva", None),
                            ("Arena", "consumo", 3)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "El bache ya rompió ruedas, hay que arreglarlo urgente."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "OT urgente generada, asignada a la Cuadrilla Bacheo (Wilson Ayala) para mañana temprano."},
        ],
    },
    {  # 6 — recolección, FINALIZADO, OT completada
        "titulo": "Contenedor desbordado frente al Botánico",
        "descripcion": "El contenedor de la entrada del Jardín Botánico está desbordado hace días, con residuos alrededor.",
        "categoria": "Recolección de residuos", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.FINALIZADO, "barrio_cod": 67, "canal": "whatsapp", "dias": 15, "vecino": 2,
        "direccion": "Av. Artigas, acceso Jardín Botánico",
        "confirmado_vecino": True,
        "ot": {"titulo": "Vaciado de contenedor y limpieza del sector",
               "estado": EstadoOrdenTrabajo.COMPLETADA, "prioridad": PrioridadOT.MEDIA,
               "cuadrilla": 2, "empleado": 1, "dias_prog": -6,
               "materiales": None, "h_est": 3.0, "h_real": 2.5,
               "notas_cierre": "Contenedor vaciado y zona limpiada. Se coordinó recolección reforzada del sector.",
               "recursos": [("Camión volcador", "reserva", None)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "El contenedor de la entrada del Botánico está rebalsado."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Recolección reforzada asignada al sector."},
            {"actor": "empleado", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO,
             "estado_nuevo": EstadoReclamo.FINALIZADO,
             "comentario": "Contenedor vaciado y zona limpiada."},
        ],
    },
    {  # 7 — plagas, EN_CURSO, OT en curso
        "titulo": "Foco de mosquitos: piden fumigación",
        "descripcion": "Zona con agua estancada y muchos mosquitos. Los vecinos piden fumigación y control de foco de dengue.",
        "categoria": "Plagas y control", "dep": "ZOONOSIS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 6, "canal": "app", "dias": 5, "vecino": 0,
        "direccion": "Bajada Tacumbú, zona costera",
        "ot": {"titulo": "Fumigación y descacharrado del foco",
               "estado": EstadoOrdenTrabajo.EN_CURSO, "prioridad": PrioridadOT.ALTA,
               "cuadrilla": 3, "empleado": 7, "dias_prog": 0,
               "materiales": [{"descripcion": "Insecticida para fumigación", "cantidad": 4, "unidad": "l"}],
               "h_est": 5.0, "h_real": None, "notas_cierre": None,
               "recursos": [("Hidrolavadora", "reserva", None)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Hay agua estancada y muchísimos mosquitos, tememos por el dengue."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se programó la Cuadrilla Zoonosis (Rubén Villalba) para fumigación y descacharrado."},
            {"actor": "empleado", "accion": "Nota",
             "comentario": "Iniciamos el descacharrado casa por casa antes de la fumigación de la tarde."},
        ],
    },
    {  # 8 — tránsito, RECIBIDO, OT pendiente
        "titulo": "Semáforo apagado en cruce concurrido",
        "descripcion": "El semáforo de Brasil y Cerro Corá está apagado desde ayer. El cruce es muy transitado y hay riesgo de choques.",
        "categoria": "Tránsito y señalización", "dep": "TRANSITO_VIAL",
        "estado": EstadoReclamo.RECIBIDO, "barrio_cod": 13, "canal": "web_publica", "dias": 1, "vecino": 1,
        "direccion": "Brasil c/ Cerro Corá, San Roque",
        "ot": {"titulo": "Reparación de semáforo apagado",
               "estado": EstadoOrdenTrabajo.PENDIENTE, "prioridad": PrioridadOT.URGENTE,
               "cuadrilla": None, "empleado": None, "dias_prog": 1,
               "materiales": [{"descripcion": "Controlador semafórico", "cantidad": 1, "unidad": "u"}],
               "h_est": 3.0, "h_real": None, "notas_cierre": None, "recursos": []},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "El cruce quedó sin semáforo y es un caos, va a haber un accidente."},
        ],
    },
    {  # 9 — higiene, EN_CURSO, OT BLOQUEADA por falta de inventario
        "titulo": "Reparación de contenedores en el Mercado 4",
        "descripcion": "Varios contenedores del Mercado 4 tienen las tapas rotas y no cierran. Piden reparación.",
        "categoria": "Higiene urbana", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 14, "canal": "ventanilla_asistida", "dias": 10, "vecino": 2,
        "direccion": "Mercado 4, Pettirossi c/ Rca. Francesa",
        "ot": {"titulo": "Reparación de tapas de contenedores",
               "estado": EstadoOrdenTrabajo.BLOQUEADA, "prioridad": PrioridadOT.MEDIA,
               "cuadrilla": None, "empleado": 4, "dias_prog": -2,
               "materiales": [{"descripcion": "Bisagras de contenedor", "cantidad": 12, "unidad": "u"},
                              {"descripcion": "Tapas de repuesto", "cantidad": 6, "unidad": "u"}],
               "h_est": 4.0, "h_real": None, "notas_cierre": None, "recursos": []},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Los contenedores del Mercado 4 no cierran y se vuela la basura."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Orden de trabajo emitida a Nelson Duarte (higiene urbana)."},
            {"actor": "empleado", "accion": "Nota",
             "comentario": "En espera de insumos: faltan bisagras y tapas de repuesto en inventario, pendiente de reposición/compra."},
        ],
    },
    {  # 10 — agua y cloacas, FINALIZADO, OT completada
        "titulo": "Pérdida de agua sobre Av. Artigas",
        "descripcion": "Caño roto sobre Av. Artigas con pérdida constante de agua hacia la calzada. Se desperdicia agua y se forma un charco.",
        "categoria": "Agua y cloacas", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.FINALIZADO, "barrio_cod": 21, "canal": "app", "dias": 25, "vecino": 0,
        "direccion": "Av. Artigas c/ Gral. Santos, Las Mercedes",
        "confirmado_vecino": True,
        "ot": {"titulo": "Reparación de caño roto y restitución de calzada",
               "estado": EstadoOrdenTrabajo.COMPLETADA, "prioridad": PrioridadOT.ALTA,
               "cuadrilla": 0, "empleado": 5, "dias_prog": -4,
               "materiales": [{"descripcion": "Caño PVC 110mm", "cantidad": 2, "unidad": "u"}],
               "h_est": 6.0, "h_real": 5.5,
               "notas_cierre": "Caño reparado y calzada restituida. Se acompañó a la prestataria de agua en la reparación.",
               "recursos": [("Retroexcavadora", "reserva", None),
                            ("Caño PVC 110mm", "consumo", 2)]},
        "historial": [
            {"actor": "vecino", "accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": "Hay una pérdida de agua enorme que corre por toda la calle."},
            {"actor": "supervisor", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO,
             "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se derivó a la prestataria de agua y se asignó a Hugo Espínola para la vía pública."},
            {"actor": "empleado", "accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO,
             "estado_nuevo": EstadoReclamo.FINALIZADO,
             "comentario": "Caño reparado y calzada restituida."},
        ],
    },
]

# ============================================================
# Reclamos "LIGEROS" — pueblan el mapa para que las 4 features luzcan:
#   mapa de calor (mancha rica), HOTSPOTS (concentraciones), TIME-LAPSE
#   (created_at repartidos en ~90 días) y DIBUJAR ZONA (contenido en cualquier área).
# No llevan la cadena pesada (OT / inventario / historial rico) de los 10 "hero"
# de arriba: son reclamos realistas sobre barrios REALES de Asunción.
#
#   - cluster=True  -> jitter chico (~±22 m): caen JUNTOS en el barrio y forman un
#     hotspot (recurrentHotspots pide >=3 reclamos a <80 m en los últimos 90 días).
#     Concentramos a propósito en Mercado 4, Centro/La Catedral, Sajonia y Tacumbú.
#   - cluster=False -> se dispersan por barrios distintos (mapa poblado, sin
#     hotspots espurios).
#   - dias reparte los created_at en ~90 días para que el time-lapse muestre avance.
#
# (titulo, descripcion, categoria, estado, barrio_cod, canal, dias, vecino, direccion, cluster)
# La dependencia se deriva de la categoría (_CAT_DEP) para no desalinear el mapeo.
# ============================================================
_CAT_DEP = {cat: dep for dep, cats in DEP_CATEGORIAS_MAP.items() for cat in cats}

_E_REC = EstadoReclamo.RECIBIDO
_E_CUR = EstadoReclamo.EN_CURSO
_E_FIN = EstadoReclamo.FINALIZADO

RECLAMOS_LIGEROS = [
    # ---- Concentración MERCADO 4 (barrio 14) — hotspot fuerte ----
    ("Puesto ambulante bloquea la vereda en el Mercado 4", "Un puesto ocupa toda la vereda sobre Pettirossi y obliga a los peatones a bajar a la calle.", "Higiene urbana", _E_REC, 14, "app", 6, 1, "Mercado 4, Pettirossi c/ Rca. Francesa", True),
    ("Basura sin recolectar detrás del Mercado 4", "Montículo de residuos de los puestos que no se retiró en varios días.", "Recolección de residuos", _E_CUR, 14, "whatsapp", 11, 0, "Mercado 4, sector carnicerías", True),
    ("Olor nauseabundo por desagüe tapado en el Mercado 4", "El desagüe del pasillo central está tapado y desborda con olor fuerte.", "Agua y cloacas", _E_REC, 14, "ventanilla_asistida", 17, 2, "Mercado 4, pasillo central", True),
    ("Roedores en la zona de alimentos del Mercado 4", "Comerciantes reportan ratas cerca de los puestos de alimentos, piden control.", "Plagas y control", _E_CUR, 14, "app", 23, 1, "Mercado 4, sector alimentos", True),
    ("Cables sueltos de un puesto en el Mercado 4", "Instalación eléctrica precaria de un puesto colgada sobre el paso de la gente.", "Alumbrado público", _E_REC, 14, "app", 29, 0, "Mercado 4, Rca. Francesa", True),
    ("Micro-basural en la esquina del Mercado 4", "Se juntó basura en la esquina y nadie la retira, atrae moscas.", "Higiene urbana", _E_FIN, 14, "web_publica", 38, 2, "Mercado 4, esquina Pettirossi", True),
    ("Auto abandonado frente al Mercado 4", "Un vehículo lleva semanas abandonado ocupando lugar de carga y descarga.", "Tránsito y señalización", _E_REC, 14, "app", 44, 1, "Mercado 4, calle lateral", True),
    ("Ruidos molestos de parlantes en el Mercado 4", "Puestos con parlantes a todo volumen desde temprano, vecinos piden control.", "Ruidos y convivencia", _E_CUR, 14, "whatsapp", 52, 0, "Mercado 4, sobre Pettirossi", True),

    # ---- Concentración CENTRO / LA CATEDRAL (barrio 8) — hotspot ----
    ("Semáforo intermitente sobre Palma", "El semáforo de Palma y Chile queda en amarillo intermitente, confunde el cruce.", "Tránsito y señalización", _E_CUR, 8, "app", 7, 1, "Palma c/ Chile, Centro", True),
    ("Vereda rota frente a Correo Central", "Baldosas levantadas en la vereda del microcentro, riesgo de caídas.", "Bacheo y calles", _E_REC, 8, "web_publica", 14, 0, "Alberdi c/ El Paraguayo Independiente", True),
    ("Cesto de basura desbordado en peatonal Palma", "El cesto de la peatonal está lleno hace días y la basura se vuela.", "Recolección de residuos", _E_FIN, 8, "app", 21, 2, "Peatonal Palma, Centro", True),
    ("Luminaria apagada en la plaza del Centro", "Una columna de la plaza quedó sin luz, la zona queda oscura de noche.", "Alumbrado público", _E_REC, 8, "app", 33, 1, "Plaza de la Independencia, Centro", True),
    ("Árbol con ramas caídas en el microcentro", "Un árbol dejó ramas grandes sobre la vereda tras la última tormenta.", "Arbolado y espacios verdes", _E_CUR, 8, "whatsapp", 41, 0, "Chile c/ Palma, Centro", True),
    ("Grafitis y suciedad en fachada pública", "Fachada de un edificio municipal con pintadas, piden limpieza.", "Higiene urbana", _E_REC, 8, "ventanilla_asistida", 58, 2, "14 de Mayo, Centro", True),

    # ---- Concentración SAJONIA (barrio 1) — hotspot ----
    ("Calle anegada tras la lluvia en Sajonia", "El agua no drena en la esquina y se forma una laguna que tapa la calle.", "Agua y cloacas", _E_CUR, 1, "app", 9, 0, "Colón c/ Estados Unidos, Sajonia", True),
    ("Bache grande sobre calle de Sajonia", "Bache profundo que ya dañó autos, sobre calle empedrada.", "Bacheo y calles", _E_REC, 1, "web_publica", 19, 1, "Sajonia, calle interna", True),
    ("Perro suelto agresivo en Sajonia", "Un perro sin dueño anda suelto y asustó a chicos que iban a la escuela.", "Animales sueltos", _E_FIN, 1, "whatsapp", 31, 2, "Sajonia, cerca de la escuela", True),
    ("Poste de luz inclinado en Sajonia", "Un poste quedó inclinado y con cables tensos, temen que caiga.", "Alumbrado público", _E_REC, 1, "app", 47, 0, "Sajonia, sobre avenida", True),
    ("Contenedor roto en Sajonia", "El contenedor del barrio tiene la tapa rota y se llena de agua.", "Higiene urbana", _E_CUR, 1, "app", 70, 1, "Sajonia, esquina del barrio", True),

    # ---- Concentración TACUMBÚ (barrio 6) — hotspot ----
    ("Descarga clandestina de escombros en Tacumbú", "Camiones descargan escombros de noche en un baldío del barrio.", "Higiene urbana", _E_REC, 6, "app", 12, 2, "Tacumbú, zona baldíos", True),
    ("Zanja abierta sin señalizar en Tacumbú", "Una zanja quedó abierta sin vallas ni señales, riesgo para autos.", "Bacheo y calles", _E_CUR, 6, "web_publica", 27, 0, "Tacumbú, bajada al puerto", True),
    ("Agua estancada foco de mosquitos en Tacumbú", "Charco permanente con larvas, piden descacharrado.", "Plagas y control", _E_REC, 6, "whatsapp", 49, 1, "Tacumbú, zona costera", True),
    ("Falta de recolección en Tacumbú", "Hace días que no pasa el camión recolector por varias cuadras.", "Recolección de residuos", _E_FIN, 6, "app", 62, 2, "Tacumbú, calles internas", True),

    # ---- Dispersos por la ciudad (barrios distintos, sin hotspot) ----
    ("Luminaria quemada en San Vicente", "Media cuadra sin luz desde hace una semana.", "Alumbrado público", _E_REC, 15, "app", 5, 0, "San Vicente, Asunción", False),
    ("Poda pendiente en Vista Alegre", "Árbol tapa la señal de tránsito de la esquina.", "Arbolado y espacios verdes", _E_CUR, 17, "web_publica", 16, 1, "Vista Alegre, Asunción", False),
    ("Bache en Ciudad Nueva", "Bache sobre la avenida principal del barrio.", "Bacheo y calles", _E_REC, 20, "app", 24, 2, "Ciudad Nueva, Asunción", False),
    ("Recolección irregular en Jara", "El camión pasa salteado y la basura se acumula.", "Recolección de residuos", _E_FIN, 23, "whatsapp", 35, 0, "Jara, Asunción", False),
    ("Semáforo sin funcionar en Nazareth", "El semáforo de la avenida no anda desde ayer.", "Tránsito y señalización", _E_CUR, 34, "app", 8, 1, "Nazareth, Asunción", False),
    ("Basural en un baldío de Hipódromo", "Terreno baldío convertido en basural del barrio.", "Higiene urbana", _E_REC, 36, "web_publica", 45, 2, "Hipódromo, Asunción", False),
    ("Fumigación solicitada en Los Laureles", "Piden fumigación por aumento de mosquitos.", "Plagas y control", _E_REC, 39, "app", 55, 0, "Los Laureles, Asunción", False),
    ("Caño perdiendo agua en Estigarribia", "Pérdida de agua constante sobre la calzada.", "Agua y cloacas", _E_CUR, 43, "whatsapp", 20, 1, "Mcal. Estigarribia, Asunción", False),
    ("Perro suelto en Luis A. de Herrera", "Perro sin dueño merodea la parada de colectivos.", "Animales sueltos", _E_FIN, 46, "app", 66, 2, "Luis A. de Herrera, Asunción", False),
    ("Vereda rota en Tablada Nueva", "Baldosas flojas frente a un comercio.", "Bacheo y calles", _E_REC, 50, "web_publica", 28, 0, "Tablada Nueva, Asunción", False),
    ("Ruidos molestos de un local en Bella Vista", "Música alta de un local hasta la madrugada.", "Ruidos y convivencia", _E_CUR, 54, "app", 40, 1, "Bella Vista, Asunción", False),
    ("Alcantarilla tapada en Cañada del Ybyray", "La alcantarilla no traga y se inunda con lluvia leve.", "Agua y cloacas", _E_REC, 56, "whatsapp", 73, 2, "Cañada del Ybyray, Asunción", False),
    ("Columna de luz sin foco en Mburucuyá", "Columna nueva instalada pero sin luminaria.", "Alumbrado público", _E_REC, 60, "app", 51, 0, "Mburucuyá, Asunción", False),
    ("Espacio verde sin mantenimiento en Ñu Guazú", "Pasto muy alto en la plaza del barrio.", "Arbolado y espacios verdes", _E_CUR, 64, "web_publica", 60, 1, "Ñu Guazú, Asunción", False),
    ("Contenedor volcado en San Blas", "Un contenedor volcado desparrama basura en la esquina.", "Recolección de residuos", _E_FIN, 66, "app", 80, 2, "San Blas, Asunción", False),
    ("Cartel de tránsito derribado en Itá Enramada", "Un cartel de PARE quedó tirado tras un choque.", "Tránsito y señalización", _E_REC, 30, "whatsapp", 88, 0, "Itá Enramada, Asunción", False),
]


def _historial_ligero(estado, canal, direccion):
    """Historial mínimo pero coherente por estado (creado -> asignado -> cerrado)."""
    canal_txt = canal.replace("_", " ")
    hist = [{"actor": "vecino", "accion": "Reclamo creado",
             "estado_nuevo": EstadoReclamo.RECIBIDO,
             "comentario": f"Reclamo cargado por {canal_txt} — {direccion}."}]
    if estado in (EstadoReclamo.EN_CURSO, EstadoReclamo.FINALIZADO):
        hist.append({"actor": "supervisor", "accion": "Cambio de estado",
                     "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
                     "comentario": "Reclamo tomado por la dependencia y derivado a la cuadrilla."})
    if estado == EstadoReclamo.FINALIZADO:
        hist.append({"actor": "empleado", "accion": "Cambio de estado",
                     "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO,
                     "comentario": "Trabajo realizado y verificado en el sitio."})
    return hist


for _lig in RECLAMOS_LIGEROS:
    _tit, _desc, _cat, _est, _bar, _can, _dias, _vec, _dir, _clu = _lig
    RECLAMOS.append({
        "titulo": _tit, "descripcion": _desc, "categoria": _cat,
        "dep": _CAT_DEP.get(_cat), "estado": _est, "barrio_cod": _bar,
        "canal": _can, "dias": _dias, "vecino": _vec, "direccion": _dir,
        "confirmado_vecino": (_est == EstadoReclamo.FINALIZADO) or None,
        "cluster": _clu, "ot": None,
        "historial": _historial_ligero(_est, _can, _dir),
    })


# 2 OT extra sin reclamo (preventiva completada + cancelada) para mostrar todos
# los estados del circuito de campo.
# (titulo, estado, cuadrilla_idx|None, empleado_idx|None, dias_prog, materiales,
#  h_est, h_real, notas_cierre, motivo_cancelacion, prioridad)
OTS_EXTRA = [
    ("Mantenimiento preventivo de luminarias del corredor", EstadoOrdenTrabajo.COMPLETADA, 1, 2, -5,
     [{"descripcion": "Lámpara LED 150W", "cantidad": 4, "unidad": "u"}], 4.0, 3.5,
     "Recorrida completa del corredor. 4 luminarias recambiadas.", None, PrioridadOT.BAJA),
    ("Desmalezado de banquinas en Av. Costanera", EstadoOrdenTrabajo.CANCELADA, 3, None, -1,
     None, 6.0, None, None, "Se reprogramó por lluvia; se resolvió antes de salir a campo.", PrioridadOT.BAJA),
]

# ============================================================
# 13 trámites completos (categoria_tramite por nombre; docs requeridos).
# Regla del dueño: TODA categoría de trámite default tiene al menos 1 tipo y
# TODO trámite tiene dependencia (`dep` NUNCA es None — con el organigrama de
# 12 habilitado siempre hay una dep con afinidad semántica; el mapeo canónico
# categoría→dep sale de TIPOS_A_DEPENDENCIAS de
# scripts/seed_chacabuco_dependencias.py). Se mapea vía
# MunicipioDependenciaTramite.
# Los 3 últimos son de COMPLETITUD de catálogo (Catastro / Desarrollo Social /
# Cementerios, que quedaban con 0 tipos): estructura desde los seeds canónicos
# (scripts/seed_10_demos.py y scripts/seed_tramites_sugeridos.py); el costo en
# guaraníes es valor DEMO en la escala de este archivo (la fuente canónica
# trae precios argentinos). SOLICITUDES no los referencia, así el set
# operativo sigue acotado (regla 3).
# ============================================================
TRAMITES = [
    {"nombre": "Licencia de conducir - Primera vez", "cat": "Tránsito y Transporte", "dep": "TRANSITO_VIAL",
     "descripcion": "Obtención de la licencia de conducir para quienes no poseen una previa.",
     "dias": 15, "costo": 250000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 45,
     "docs": [("Cédula de identidad (frente y dorso)", "Copia del documento", True),
              ("Certificado médico", "Emitido por centro habilitado, vigencia 30 días", True),
              ("Foto tipo carnet", "Fondo blanco, actualizada", True)]},
    {"nombre": "Renovación de licencia de conducir", "cat": "Tránsito y Transporte", "dep": "TRANSITO_VIAL",
     "descripcion": "Renovación de la licencia de conducir vigente, sin cambio de categoría.",
     "dias": 5, "costo": 180000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 20,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Licencia anterior", "Licencia a renovar", True)]},
    {"nombre": "Habilitación comercial", "cat": "Habilitaciones Comerciales", "dep": "HABILITACIONES",
     "descripcion": "Habilitación para la apertura de un nuevo comercio o actividad comercial.",
     "dias": 30, "costo": 450000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True),
              ("Plano del local", "Plano firmado por profesional", True),
              ("Constancia de RUC", "Inscripción tributaria vigente", True)]},
    {"nombre": "Renovación de habilitación comercial", "cat": "Habilitaciones Comerciales", "dep": "HABILITACIONES",
     "descripcion": "Renovación anual de la habilitación comercial vigente.",
     "dias": 10, "costo": 200000.0, "tipo_pago": "boton_pago", "modo": "presencial_sin_turno", "turno_min": 30,
     "docs": [("Habilitación anterior", "Constancia de la habilitación a renovar", True)]},
    {"nombre": "Permiso de obra menor", "cat": "Obras Particulares", "dep": "OBRAS_PUBLICAS",
     "descripcion": "Autorización para obras menores (cercos, veredas, refacciones).",
     "dias": 20, "costo": 150000.0, "tipo_pago": "boton_pago", "modo": "presencial_sin_turno", "turno_min": 30,
     "docs": [("Cédula del propietario", "Copia del documento", True),
              ("Croquis de obra", "Plano o croquis firmado", True)]},
    {"nombre": "Certificado de libre deuda municipal", "cat": "Tasas y Tributos", "dep": "RENTAS",
     "descripcion": "Certificado que acredita la inexistencia de deudas con la Municipalidad.",
     "dias": 5, "costo": 60000.0, "tipo_pago": "boton_pago", "modo": "online", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True),
              ("Última boleta municipal", "Boleta del último período abonado", False)]},
    {"nombre": "Pago de tasa de recolección de residuos", "cat": "Tasas y Tributos", "dep": "SERVICIOS_PUBLICOS",
     "descripcion": "Liquidación y pago de la tasa municipal de recolección de residuos.",
     "dias": 1, "costo": 90000.0, "tipo_pago": "boton_pago", "modo": "online", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True)]},
    {"nombre": "Certificado de residencia", "cat": "Certificados y Documentación", "dep": "ATENCION_VECINO",
     "descripcion": "Constancia que acredita el domicilio del solicitante en la ciudad.",
     "dias": 3, "costo": 40000.0, "tipo_pago": "boton_pago", "modo": "presencial_sin_turno", "turno_min": 15,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Comprobante de domicilio", "Factura de servicio a nombre del solicitante", True)]},
    {"nombre": "Permiso de poda de árbol", "cat": "Espacios Públicos", "dep": "SERVICIOS_PUBLICOS",
     "descripcion": "Autorización para la poda de arbolado urbano frente al domicilio.",
     "dias": 12, "costo": 0.0, "tipo_pago": None, "modo": "presencial_sin_turno", "turno_min": 20,
     "docs": [("Cédula del solicitante", "Copia del documento", True),
              ("Foto del árbol", "Foto que muestre el estado del árbol", False)]},
    {"nombre": "Habilitación de transporte de alimentos", "cat": "Salud y Bromatología", "dep": "BROMATOLOGIA",
     "descripcion": "Habilitación bromatológica de vehículos de transporte de alimentos.",
     "dias": 15, "costo": 300000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True),
              ("Cédula verde del vehículo", "Documento del vehículo", True),
              ("Certificado de desinfección", "Emitido por empresa habilitada", True)]},
    # --- Completitud de catálogo (categorías que quedaban con 0 tipos) ---
    {"nombre": "Certificado catastral", "cat": "Catastro", "dep": "CATASTRO",
     "descripcion": "Certificado con los datos catastrales del inmueble.",
     "dias": 10, "costo": 80000.0, "tipo_pago": "boton_pago", "modo": "online", "turno_min": 30,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Título de propiedad o partida", "Documento que acredite la titularidad del inmueble", True)]},
    {"nombre": "Tarjeta alimentaria", "cat": "Desarrollo Social", "dep": "DESARROLLO_SOCIAL",
     "descripcion": "Inscripción al programa municipal de asistencia alimentaria.",
     "dias": 15, "costo": 0.0, "tipo_pago": None, "modo": "presencial_sin_turno", "turno_min": 20,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Constancia de ingresos o informe social", "Documentación que respalde la situación socioeconómica", True)]},
    {"nombre": "Concesión de parcela en cementerio", "cat": "Cementerios", "dep": "ATENCION_VECINO",
     "descripcion": "Solicitud de concesión de parcela en el cementerio municipal.",
     "dias": 30, "costo": 350000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 30,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Certificado de defunción", "Documentación del fallecido", True)]},
]

# 10 solicitudes de ejemplo: (indice_tramite, indice_vecino, estado)
SOLICITUDES = [
    (0, 0, EstadoSolicitud.RECIBIDO),
    (2, 1, EstadoSolicitud.EN_CURSO),
    (5, 2, EstadoSolicitud.FINALIZADO),
    (6, 0, EstadoSolicitud.EN_CURSO),
    (7, 1, EstadoSolicitud.RECIBIDO),
    (8, 2, EstadoSolicitud.POSPUESTO),
    (1, 0, EstadoSolicitud.FINALIZADO),
    (9, 1, EstadoSolicitud.RECIBIDO),
    (4, 2, EstadoSolicitud.EN_CURSO),
    (3, 0, EstadoSolicitud.FINALIZADO),
]


# ============================================================
# Helpers
# ============================================================
def _slug(codigo: str) -> str:
    """slug de email desde un código de dependencia: OBRAS_PUBLICAS -> obras-publicas."""
    return codigo.lower().replace("_", "-")


def _slug_palabra(texto: str) -> str:
    """Primera palabra significativa sin acentos, en minúscula (para email de empleado)."""
    limpio = unicodedata.normalize("NFD", texto)
    limpio = "".join(c for c in limpio if unicodedata.category(c) != "Mn")
    return limpio.lower().split()[0]


# ============================================================
# Seed — municipio
# ============================================================
async def _get_or_create_muni(db: AsyncSession) -> Municipio:
    muni = (await db.execute(select(Municipio).where(Municipio.codigo == CODIGO))).scalar_one_or_none()
    if muni:
        muni.nombre = NOMBRE
        muni.color_primario = COLOR_PRIMARIO
        muni.color_secundario = COLOR_SECUNDARIO
        muni.logo_url = LOGO_URL
        muni.latitud = CENTRO_LAT
        muni.longitud = CENTRO_LON
        muni.es_demo = True
        muni.activo = True
        await db.flush()
        print(f"[muni] existente -> actualizado branding (id={muni.id})")
        return muni
    muni = Municipio(
        nombre=NOMBRE, codigo=CODIGO,
        descripcion="Demo white-label Paraguay Limpio — Asunción, Departamento Central.",
        latitud=CENTRO_LAT, longitud=CENTRO_LON, radio_km=12.0,
        logo_url=LOGO_URL, color_primario=COLOR_PRIMARIO, color_secundario=COLOR_SECUNDARIO,
        direccion="Asunción, Departamento Central, Paraguay",
        zoom_mapa_default=12, es_demo=True, activo=True, abm_en_sidebar=False,
    )
    db.add(muni)
    await db.flush()
    print(f"[muni] creado (id={muni.id})")
    return muni


# ============================================================
# Dependencias (las 12 del catálogo global) + mapeo categoría->dep.
# Idempotente por código.
# ============================================================
async def _seed_dependencias(db: AsyncSession, muni_id: int, cats: dict) -> dict:
    cat_deps = (await db.execute(
        select(Dependencia).where(Dependencia.codigo.in_(DEPENDENCIAS))
    )).scalars().all()
    dep_por_codigo = {d.codigo: d for d in cat_deps}
    if not dep_por_codigo:
        print("[deps] WARNING: catálogo global de Dependencia vacío — reclamos quedarán sin dependencia")
        return {}

    existentes = {
        md.dependencia_id: md for md in (await db.execute(
            select(MunicipioDependencia).where(MunicipioDependencia.municipio_id == muni_id)
        )).scalars().all()
    }
    muni_deps = {}  # dep_code -> MunicipioDependencia
    creadas = 0
    for i, cod in enumerate(DEPENDENCIAS):
        dep = dep_por_codigo.get(cod)
        if not dep:
            continue
        md = existentes.get(dep.id)
        if not md:
            md = MunicipioDependencia(municipio_id=muni_id, dependencia_id=dep.id, activo=True, orden=i)
            db.add(md)
            creadas += 1
        muni_deps[cod] = md
    await db.flush()

    # Mapeo categoría -> dependencia (idempotente por par).
    mapeos_existentes = {
        (m.municipio_dependencia_id, m.categoria_id) for m in (await db.execute(
            select(MunicipioDependenciaCategoria).where(
                MunicipioDependenciaCategoria.municipio_id == muni_id)
        )).scalars().all()
    }
    for cod, cat_nombres in DEP_CATEGORIAS_MAP.items():
        md = muni_deps.get(cod)
        if not md:
            continue
        for cat_nombre in cat_nombres:
            cat = cats.get(cat_nombre)
            if not cat:
                continue
            if (md.id, cat.id) in mapeos_existentes:
                continue
            db.add(MunicipioDependenciaCategoria(
                municipio_id=muni_id, dependencia_id=md.dependencia_id,
                categoria_id=cat.id, municipio_dependencia_id=md.id, activo=True,
            ))
    await db.flush()
    print(f"[deps] {len(muni_deps)} dependencias ({creadas} nuevas) + mapeo de categorías")
    return muni_deps


# ============================================================
# Usuarios: admin + supervisor por dep + 3 vecinos. Idempotente por email.
# (los empleado-login se crean luego, cuando ya existen los Empleado.)
# ============================================================
async def _seed_usuarios(db: AsyncSession, muni_id: int, muni_deps: dict) -> dict:
    hash_demo = get_password_hash(PASSWORD_DEMO)
    creados = 0

    async def ensure_user(email: str, **kwargs) -> User:
        nonlocal creados
        u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if u:
            # Reafirmar el vínculo con la dependencia por si cambió (supervisores).
            if "municipio_dependencia_id" in kwargs:
                u.municipio_dependencia_id = kwargs["municipio_dependencia_id"]
            return u
        u = User(email=email, password_hash=hash_demo, municipio_id=muni_id,
                 activo=True, cuenta_verificada=True, **kwargs)
        db.add(u)
        creados += 1
        return u

    admin = await ensure_user("admin@asuncion.demo.com", nombre="Administración",
                              apellido="Municipal", rol=RolUsuario.ADMIN)

    # Un supervisor por dependencia OPERATIVA (nombre bonito desde el catálogo).
    # Las demás dependencias del organigrama quedan sin login demo a propósito:
    # habilitadas y asignables, pero sin bandeja cargada (regla 3).
    supervisores_by_dep = {}
    for cod in DEPENDENCIAS_OPERATIVAS:
        md = muni_deps.get(cod)
        if not md:
            continue
        dep_obj = await db.get(Dependencia, md.dependencia_id)
        dep_nombre = dep_obj.nombre if dep_obj else cod
        sup = await ensure_user(
            f"supervisor-{_slug(cod)}@asuncion.demo.com",
            nombre="Supervisor", apellido=dep_nombre,
            rol=RolUsuario.SUPERVISOR, municipio_dependencia_id=md.id,
        )
        supervisores_by_dep[cod] = sup

    vecinos = []
    for v in VECINOS:
        u = await ensure_user(v["email"], nombre=v["nombre"], apellido=v["apellido"],
                              telefono=v["tel"], sexo=v["sexo"], nacionalidad="PRY",
                              rol=RolUsuario.VECINO, nivel_verificacion=2)
        vecinos.append(u)
    await db.flush()
    print(f"[usuarios] {creados} nuevos (admin + {len(supervisores_by_dep)} supervisores + {len(vecinos)} vecinos)")
    return {"admin": admin, "supervisores_by_dep": supervisores_by_dep, "vecinos": vecinos}


# ============================================================
# Barrios (68). Idempotente (por nombre).
# ============================================================
async def _seed_barrios(db: AsyncSession, muni_id: int) -> dict:
    existentes = {b.nombre: b for b in (await db.execute(
        select(Barrio).where(Barrio.municipio_id == muni_id)
    )).scalars().all()}
    barrios = dict(existentes)
    creados = 0
    for _cod, nombre, lat, lon in BARRIOS_ASUNCION:
        if nombre in barrios:
            continue
        b = Barrio(municipio_id=muni_id, nombre=nombre, latitud=lat, longitud=lon,
                   tipo="suburb", validado=lat is not None)
        db.add(b)
        barrios[nombre] = b
        creados += 1
    await db.flush()
    con_coord = sum(1 for _c, _n, la, _lo in BARRIOS_ASUNCION if la is not None)
    print(f"[barrios] {len(barrios)} totales ({creados} nuevos, {con_coord} con coords reales)")
    return barrios


# ============================================================
# Zonas (6). Idempotente por nombre.
# ============================================================
async def _seed_zonas(db: AsyncSession, muni_id: int) -> dict:
    # Match por CODIGO (estable) para poder RENOMBRAR zonas ya sembradas con
    # nombres genéricos viejos (Centro/Norte/Sur...) a los sectores reales de
    # Asunción sin duplicar filas ni romper FKs.
    existentes = (await db.execute(
        select(Zona).where(Zona.municipio_id == muni_id)
    )).scalars().all()
    por_codigo = {z.codigo: z for z in existentes}
    por_nombre = {z.nombre: z for z in existentes}
    zonas: dict = {}
    for nombre, cod, lat, lon in ZONAS:
        codigo = f"{cod}-{muni_id}"
        z = por_codigo.get(codigo) or por_nombre.get(nombre)
        if z:
            if z.nombre != nombre:
                print(f"[zonas] rename '{z.nombre}' -> '{nombre}'")
                z.nombre = nombre
            z.latitud_centro, z.longitud_centro, z.activo = lat, lon, True
        else:
            z = Zona(municipio_id=muni_id, nombre=nombre, codigo=codigo,
                     latitud_centro=lat, longitud_centro=lon, activo=True)
            db.add(z)
        zonas[nombre] = z
    await db.flush()
    print(f"[zonas] {len(zonas)} zonas")
    return zonas


async def _asignar_zonas_reclamos(db: AsyncSession, muni_id: int, zonas: dict) -> None:
    """zona_id para TODOS los reclamos del muni por cercanía REAL (lat/lng al
    centro de zona). Sin esto, los charts 'Cobertura por Zona' y 'Reclamos por
    Zona' del dashboard quedaban en 0. Determinístico e idempotente."""
    zlist = [z for z in zonas.values() if z.latitud_centro and z.longitud_centro]
    default = zonas.get("Microcentro")
    recs = (await db.execute(
        select(Reclamo).where(Reclamo.municipio_id == muni_id)
    )).scalars().all()
    n = 0
    for r in recs:
        if r.latitud and r.longitud:
            z = min(zlist, key=lambda t: (t.latitud_centro - r.latitud) ** 2 +
                                         (t.longitud_centro - r.longitud) ** 2)
        else:
            z = default
        if z and r.zona_id != z.id:
            r.zona_id = z.id
            n += 1
    await db.flush()
    print(f"[zonas-reclamos] {n} reclamos re-asignados a zona")


async def _vitalizar_dashboard(db: AsyncSession, muni_id: int) -> None:
    """Fechas relativas a HOY para que los widgets del dashboard tengan vida:
    - 'Para hoy': 3 reclamos EN_CURSO con fecha_programada = hoy.
    - 'Resueltos (semana)': 5 finalizados con fecha_resolucion en los últimos
      6 días + 3 en la semana anterior (para el comparativo vs sem. ant.).
    Idempotente: recalcula las fechas en cada corrida (semilla de demo)."""
    ahora = datetime.now()
    en_curso = (await db.execute(
        select(Reclamo).where(Reclamo.municipio_id == muni_id,
                              Reclamo.estado == EstadoReclamo.EN_CURSO)
        .order_by(Reclamo.id)
    )).scalars().all()
    for r in en_curso[:3]:
        r.fecha_programada = ahora
    finalizados = (await db.execute(
        select(Reclamo).where(Reclamo.municipio_id == muni_id,
                              Reclamo.estado == EstadoReclamo.FINALIZADO)
        .order_by(Reclamo.id)
    )).scalars().all()
    # 5 de esta semana + 3 de la anterior (offsets en días, determinísticos)
    offsets = [1, 2, 3, 4, 6, 9, 11, 12]
    for r, off in zip(finalizados, offsets):
        r.fecha_resolucion = ahora - timedelta(days=off)
    await db.flush()
    print(f"[dashboard] para_hoy={min(3, len(en_curso))} "
          f"resueltos_recientes={min(len(finalizados), len(offsets))}")


# ============================================================
# Calificaciones de vecinos sobre reclamos FINALIZADOS ("la voz del vecino"
# del Dashboard, GET /calificaciones/estadisticas?dias=90).
# La tabla calificaciones tiene UNIQUE(reclamo_id) — 1 calificación por
# reclamo, misma regla que valida la API — así que la cantidad la manda el
# número de reclamos finalizados del muni (no se inventan cierres extra).
# Distribución realista: mayoría 5-4, algunas 3, pocas 1-2.
# Idempotente: upsert por reclamo_id; fechas DETERMINÍSTICAS (sin random),
# 1-3 días después de la fecha_resolucion, dentro de los últimos 90 días.
#
# titulo -> (puntuacion, tiempo_respuesta, calidad_trabajo, atencion,
#            comentario, tags)  — comentarios [DEMO] verosímiles, firmados
# por el vecino creador del reclamo (usuario_id = creador_id).
# ============================================================
CALIFICACIONES_POR_TITULO = {
    "Poda de árbol que toca los cables": (
        5, 5, 5, 5,
        "Vinieron a los dos días, podaron todo y dejaron la vereda limpia. Muy buen trabajo de la cuadrilla.",
        "rapidos,prolijos"),
    "Contenedor desbordado frente al Botánico": (
        4, 3, 4, 5,
        "Resolvieron bien y limpiaron todo el sector, aunque tardaron unos días en venir.",
        "amables"),
    "Pérdida de agua sobre Av. Artigas": (
        5, 4, 5, 5,
        "Arreglaron el caño y dejaron la calzada como estaba antes. Excelente atención del personal.",
        "prolijos,buena atencion"),
    "Micro-basural en la esquina del Mercado 4": (
        4, 4, 4, 4,
        "Retiraron toda la basura de la esquina. Ojalá mantengan la frecuencia para que no se junte de vuelta.",
        None),
    "Cesto de basura desbordado en peatonal Palma": (
        3, 2, 4, 3,
        "Lo vaciaron y quedó bien, pero tardaron bastante en pasar por la peatonal.",
        None),
    "Perro suelto agresivo en Sajonia": (
        5, 5, 4, 5,
        "Vinieron el mismo día y se llevaron al perro con mucho cuidado. Los chicos ya van tranquilos a la escuela.",
        "rapidos,buena atencion"),
    "Falta de recolección en Tacumbú": (
        2, 2, 3, 3,
        "Pasó el camión una vez y después volvió a faltar varios días. Cerraron el reclamo igual.",
        None),
    "Recolección irregular en Jara": (
        4, 4, 4, 4,
        "Se normalizó la recolección en el barrio. Buen seguimiento desde la app.",
        None),
    "Perro suelto en Luis A. de Herrera": (
        5, 4, 5, 5,
        "Retiraron al perro de la parada y nos avisaron enseguida por la app. Muy atentos.",
        "buena atencion"),
    "Contenedor volcado en San Blas": (
        1, 2, 1, 2,
        "Cerraron el reclamo pero el contenedor sigue roto y la basura se desparrama igual.",
        None),
}

# Fallback determinístico para finalizados que no estén en el mapa de arriba
# (ej. reclamos previos del muni en QA): (puntuacion, comentario, tags).
CALIF_FALLBACK = [
    (5, "Muy conforme, el equipo municipal resolvió rápido y avisaron por la app.", "rapidos"),
    (4, "Se resolvió correctamente, aunque tardaron un poco más de lo esperado.", None),
    (5, "Excelente respuesta, el trabajo quedó impecable.", "prolijos"),
    (4, "Buen trabajo de la cuadrilla, conforme con la solución.", None),
    (3, "Lo resolvieron, pero hubo que insistir para que vinieran.", None),
    (5, "Vinieron enseguida y dejaron todo en orden.", "rapidos,prolijos"),
    (4, "Conforme con la gestión, se nota el seguimiento del reclamo.", None),
    (2, "Cerraron el reclamo pero la solución duró poco.", None),
]


async def _seed_calificaciones(db: AsyncSession, muni_id: int) -> dict:
    finalizados = (await db.execute(
        select(Reclamo).where(
            Reclamo.municipio_id == muni_id,
            Reclamo.estado.in_((EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO)),
        ).order_by(Reclamo.id)
    )).scalars().all()
    if not finalizados:
        print("[calificaciones] sin reclamos finalizados — skip")
        return {}

    existentes = {c.reclamo_id: c for c in (await db.execute(
        select(Calificacion)
        .join(Reclamo, Calificacion.reclamo_id == Reclamo.id)
        .where(Reclamo.municipio_id == muni_id)
    )).scalars().all()}

    ahora = datetime.utcnow()
    dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    nuevas = 0
    for i, rec in enumerate(finalizados):
        spec = CALIFICACIONES_POR_TITULO.get(rec.titulo)
        if spec:
            punt, t_resp, cal_t, aten, comentario, tags = spec
        else:
            punt, comentario, tags = CALIF_FALLBACK[i % len(CALIF_FALLBACK)]
            t_resp = max(1, min(5, punt - (rec.id % 2)))
            cal_t = punt
            aten = max(1, min(5, punt + (i % 2)))

        # Fecha determinística: el vecino califica 1-3 días después de la
        # resolución (fecha_resolucion la fija _vitalizar_dashboard antes).
        if rec.fecha_resolucion is not None:
            creada = rec.fecha_resolucion + timedelta(days=1 + (rec.id % 3), hours=(rec.id * 5) % 12)
        else:
            creada = ahora - timedelta(days=7 + (rec.id * 3) % 80)
        if creada > ahora:
            creada = ahora - timedelta(hours=2)
        if creada < ahora - timedelta(days=89):  # ventana del dashboard (dias=90)
            creada = ahora - timedelta(days=89)

        c = existentes.get(rec.id)
        if c:
            c.usuario_id = rec.creador_id
            c.puntuacion = punt
            c.tiempo_respuesta = t_resp
            c.calidad_trabajo = cal_t
            c.atencion = aten
            c.comentario = comentario
            c.tags = tags
            c.created_at = creada
        else:
            db.add(Calificacion(
                reclamo_id=rec.id, usuario_id=rec.creador_id, puntuacion=punt,
                tiempo_respuesta=t_resp, calidad_trabajo=cal_t, atencion=aten,
                comentario=comentario, tags=tags, created_at=creada,
            ))
            nuevas += 1
        dist[punt] += 1
    await db.flush()
    print(f"[calificaciones] {len(finalizados)} reclamos finalizados calificados "
          f"({nuevas} nuevas) — distribución {dist}")
    return dist


# ============================================================
# Empleados (10) + categoría principal en tabla intermedia. Idempotente por
# (nombre, apellido). Devuelve lista alineada al orden de EMPLEADOS.
# ============================================================
async def _seed_empleados(db: AsyncSession, muni_id: int, cats: dict,
                          zonas: dict, muni_deps: dict) -> list:
    existentes = {
        (e.nombre, e.apellido): e for e in (await db.execute(
            select(Empleado).where(Empleado.municipio_id == muni_id)
        )).scalars().all()
    }
    empleados = []
    nuevos = 0
    for nombre, apellido, tel, tipo, esp, cat_nombre, zona_nombre, dep_cod in EMPLEADOS:
        e = existentes.get((nombre, apellido))
        if e:
            empleados.append(e)
            continue
        cat = cats.get(cat_nombre)
        zona = zonas.get(zona_nombre)
        md = muni_deps.get(dep_cod)
        e = Empleado(
            municipio_id=muni_id, nombre=nombre, apellido=apellido, telefono=tel,
            tipo=tipo, especialidad=esp,
            categoria_principal_id=cat.id if cat else None,
            zona_id=zona.id if zona else None,
            municipio_dependencia_id=md.id if md else None,
            capacidad_maxima=8, activo=True,
        )
        db.add(e)
        empleados.append(e)
        nuevos += 1
    await db.flush()

    # Tabla intermedia empleado_categorias (categoría principal). Idempotente.
    ya = {
        (r.empleado_id, r.categoria_id) for r in (await db.execute(
            empleado_categoria.select().where(
                empleado_categoria.c.empleado_id.in_([e.id for e in empleados])
            )
        ))
    } if empleados else set()
    for e, datos in zip(empleados, EMPLEADOS):
        cat = cats.get(datos[5])
        if cat and (e.id, cat.id) not in ya:
            await db.execute(empleado_categoria.insert().values(
                empleado_id=e.id, categoria_id=cat.id, es_principal=True))
    await db.flush()
    print(f"[empleados] {len(empleados)} totales ({nuevos} nuevos)")
    return empleados


# ============================================================
# Login de 2 empleados destacados (rol EMPLEADO con empleado_id). Idempotente.
# ============================================================
async def _seed_empleados_login(db: AsyncSession, muni_id: int, empleados: list) -> dict:
    hash_demo = get_password_hash(PASSWORD_DEMO)
    login_by_idx = {}
    nuevos = 0
    for idx in EMPLEADOS_LOGIN_IDX:
        if idx >= len(empleados):
            continue
        emp = empleados[idx]
        datos = EMPLEADOS[idx]
        slug = _slug_palabra(datos[4])  # especialidad -> primera palabra
        email = f"empleado-{slug}@asuncion.demo.com"
        u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if u:
            u.empleado_id = emp.id  # reafirmar el vínculo (empleado idempotente => id estable)
        else:
            u = User(email=email, password_hash=hash_demo, municipio_id=muni_id,
                     nombre=datos[0], apellido=datos[1], rol=RolUsuario.EMPLEADO,
                     empleado_id=emp.id, activo=True, cuenta_verificada=True)
            db.add(u)
            nuevos += 1
        login_by_idx[idx] = u
    await db.flush()
    print(f"[empleados-login] {len(login_by_idx)} logins de empleado ({nuevos} nuevos)")
    return login_by_idx


# ============================================================
# Cuadrillas (4) con líder + miembro. Idempotente por nombre.
# ============================================================
async def _seed_cuadrillas(db: AsyncSession, muni_id: int, empleados: list,
                          cats: dict, zonas: dict) -> list:
    existentes = {c.nombre: c for c in (await db.execute(
        select(Cuadrilla).where(Cuadrilla.municipio_id == muni_id)
    )).scalars().all()}
    cuadrillas = []
    nuevas = 0
    for nombre, desc, cat_nombre, zona_nombre, _li, _mi in CUADRILLAS:
        c = existentes.get(nombre)
        if c:
            cuadrillas.append(c)
            continue
        cat = cats.get(cat_nombre)
        zona = zonas.get(zona_nombre)
        c = Cuadrilla(
            municipio_id=muni_id, nombre=nombre, descripcion=desc,
            especialidad=cat_nombre, categoria_principal_id=cat.id if cat else None,
            zona_id=zona.id if zona else None, capacidad_maxima=12, activo=True,
        )
        db.add(c)
        cuadrillas.append(c)
        nuevas += 1
    await db.flush()

    # Miembros (líder + miembro) + categoría principal. Idempotente.
    ya_miembros = {
        (m.empleado_id, m.cuadrilla_id) for m in (await db.execute(
            select(EmpleadoCuadrilla).where(
                EmpleadoCuadrilla.cuadrilla_id.in_([c.id for c in cuadrillas]))
        )).scalars().all()
    } if cuadrillas else set()
    ya_cat = {
        (r.cuadrilla_id, r.categoria_id) for r in (await db.execute(
            cuadrilla_categoria.select().where(
                cuadrilla_categoria.c.cuadrilla_id.in_([c.id for c in cuadrillas]))
        ))
    } if cuadrillas else set()

    for c, datos in zip(cuadrillas, CUADRILLAS):
        _n, _d, cat_nombre, _z, lider_idx, miembro_idx = datos
        for emp_idx, es_lider in ((lider_idx, True), (miembro_idx, False)):
            if emp_idx is None or emp_idx >= len(empleados):
                continue
            emp = empleados[emp_idx]
            if (emp.id, c.id) in ya_miembros:
                continue
            db.add(EmpleadoCuadrilla(empleado_id=emp.id, cuadrilla_id=c.id,
                                     es_lider=es_lider, fecha_ingreso=date.today(), activo=True))
            ya_miembros.add((emp.id, c.id))
        cat = cats.get(cat_nombre)
        if cat and (c.id, cat.id) not in ya_cat:
            await db.execute(cuadrilla_categoria.insert().values(
                cuadrilla_id=c.id, categoria_id=cat.id, es_principal=True))
    await db.flush()
    print(f"[cuadrillas] {len(cuadrillas)} totales ({nuevas} nuevas) con líder + miembro")
    return cuadrillas


# ============================================================
# SLA configs. Idempotente por (categoria_id or None).
# ============================================================
async def _seed_sla(db: AsyncSession, muni_id: int, cats: dict) -> int:
    existentes = {
        s.categoria_id for s in (await db.execute(
            select(SLAConfig).where(SLAConfig.municipio_id == muni_id)
        )).scalars().all()
    }
    creados = 0
    for cat_nombre, resp, reso, alerta in SLA_CONFIGS:
        cat_id = None
        if cat_nombre:
            cat = cats.get(cat_nombre)
            if not cat:
                continue
            cat_id = cat.id
        if cat_id in existentes:
            continue
        db.add(SLAConfig(municipio_id=muni_id, categoria_id=cat_id, prioridad=None,
                         tiempo_respuesta=resp, tiempo_resolucion=reso,
                         tiempo_alerta_amarilla=alerta, activo=True))
        existentes.add(cat_id)
        creados += 1
    await db.flush()
    print(f"[sla] {creados} configs nuevas")
    return creados


# ============================================================
# Reclamos (upsert por título) + reconstrucción del historial rico.
# ============================================================
async def _seed_reclamos(db: AsyncSession, muni_id: int, cats: dict, muni_deps: dict,
                        barrios_por_cod: dict, usuarios: dict, empleados: list,
                        empleados_login: dict) -> list:
    existentes = {r.titulo: r for r in (await db.execute(
        select(Reclamo).where(Reclamo.municipio_id == muni_id)
    )).scalars().all()}
    vecinos = usuarios["vecinos"]
    reclamos = []  # alineado con RECLAMOS

    for i, r in enumerate(RECLAMOS):
        cat = cats.get(r["categoria"])
        if not cat:
            print(f"[reclamos] categoría no encontrada: {r['categoria']} — skip")
            reclamos.append(None)
            continue
        barrio = barrios_por_cod.get(r["barrio_cod"])
        md = muni_deps.get(r["dep"])
        base_lat = barrio.latitud if (barrio and barrio.latitud is not None) else CENTRO_LAT
        base_lon = barrio.longitud if (barrio and barrio.longitud is not None) else CENTRO_LON
        # Cluster -> jitter chico (caen juntos = hotspot); si no, jitter amplio.
        amp = 0.0002 if r.get("cluster") else 0.0009
        jlat, jlon = _jitter(i, amp)
        lat = round(base_lat + jlat, 6)
        lon = round(base_lon + jlon, 6)
        creador = vecinos[r["vecino"]]
        created = datetime.utcnow() - timedelta(days=r["dias"])
        # Reclamos cerrados: fecha_resolucion coherente (entre created y hoy) para
        # que el tiempo medio de resolución / KPIs del mapa no queden en s/d.
        resuelto = r["estado"] in (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO)
        fecha_res = created + timedelta(days=max(1, r["dias"] // 2)) if resuelto else None

        rec = existentes.get(r["titulo"])
        if rec:
            rec.descripcion = r["descripcion"]
            rec.estado = r["estado"]
            rec.direccion = r["direccion"]
            rec.latitud = lat
            rec.longitud = lon
            rec.categoria_id = cat.id
            rec.barrio_id = barrio.id if barrio else None
            rec.creador_id = creador.id
            rec.municipio_dependencia_id = md.id if md else None
            rec.canal = r["canal"]
            rec.confirmado_vecino = r.get("confirmado_vecino")
            rec.fecha_resolucion = fecha_res
        else:
            rec = Reclamo(
                municipio_id=muni_id, titulo=r["titulo"], descripcion=r["descripcion"],
                estado=r["estado"], prioridad=3, direccion=r["direccion"],
                latitud=lat, longitud=lon, categoria_id=cat.id,
                barrio_id=barrio.id if barrio else None, creador_id=creador.id,
                municipio_dependencia_id=md.id if md else None, canal=r["canal"],
                confirmado_vecino=r.get("confirmado_vecino"), created_at=created,
                fecha_resolucion=fecha_res,
            )
            db.add(rec)
        reclamos.append(rec)
    await db.flush()

    # Reconstruir historial rico: borrar el existente de estos reclamos y re-crear
    # con el comentario de cada actor (vecino / supervisor / empleado).
    ids = [rec.id for rec in reclamos if rec is not None]
    if ids:
        await db.execute(
            text("DELETE FROM historial_reclamos WHERE reclamo_id IN "
                 "(SELECT id FROM reclamos WHERE municipio_id = :m)"),
            {"m": muni_id},
        )
    admin = usuarios["admin"]
    supervisores = usuarios["supervisores_by_dep"]
    for rec, r in zip(reclamos, RECLAMOS):
        if rec is None:
            continue
        dep_cod = r["dep"]
        emp_idx = (r.get("ot") or {}).get("empleado")
        # usuario para actor "empleado": login del empleado si existe, si no supervisor/admin.
        emp_user = empleados_login.get(emp_idx) if emp_idx is not None else None
        sup_user = supervisores.get(dep_cod) or admin
        creador = vecinos[r["vecino"]]
        base_created = datetime.utcnow() - timedelta(days=r["dias"])
        for k, h in enumerate(r["historial"]):
            actor = h.get("actor", "vecino")
            if actor == "vecino":
                uid = creador.id
            elif actor == "empleado":
                uid = (emp_user or sup_user).id
            else:
                uid = sup_user.id
            db.add(HistorialReclamo(
                reclamo_id=rec.id, usuario_id=uid, accion=h["accion"],
                estado_anterior=h.get("estado_anterior"), estado_nuevo=h.get("estado_nuevo"),
                comentario=h.get("comentario"),
                created_at=base_created + timedelta(hours=k * 6),
            ))
    await db.flush()
    print(f"[reclamos] {len(ids)} reclamos con historial rico (comentarios por actor)")
    return reclamos


# ============================================================
# Órdenes de trabajo (una por reclamo de campo + 2 extra) cruzadas con inventario.
# Idempotente: crea la OT solo si su número no existe; recursos solo si la OT
# no tiene ninguno (evita doble descuento de stock).
# ============================================================
async def _seed_ordenes_trabajo(db: AsyncSession, muni_id: int, reclamos: list,
                                cuadrillas: list, empleados: list, creador_id: int,
                                inv_por_nombre: dict) -> dict:
    ahora = datetime.utcnow()
    hoy = date.today()
    year = hoy.year

    existentes = {ot.numero: ot for ot in (await db.execute(
        select(OrdenTrabajo).where(OrdenTrabajo.municipio_id == muni_id)
    )).scalars().all()}

    def _cuad(idx):
        return cuadrillas[idx].id if (idx is not None and idx < len(cuadrillas)) else None

    def _emp(idx):
        return empleados[idx].id if (idx is not None and idx < len(empleados)) else None

    activos = 0
    stats = {"ot": 0, "recursos": 0, "reservas": 0, "consumos": 0}

    async def _crear_ot(numero, spec, reclamo=None):
        nonlocal activos
        estado = spec["estado"]
        ot = existentes.get(numero)
        recien = ot is None
        if recien:
            ot = OrdenTrabajo(
                municipio_id=muni_id, numero=numero, estado=estado,
                titulo=spec["titulo"],
                descripcion=f"{spec['titulo']} — circuito de campo Paraguay Limpio (demo).",
                prioridad=spec.get("prioridad", PrioridadOT.MEDIA),
                cuadrilla_id=_cuad(spec.get("cuadrilla")),
                empleado_id=_emp(spec.get("empleado")),
                fecha_programada=hoy + timedelta(days=spec.get("dias_prog", 0)),
                hora_inicio=dtime(8, 0), hora_fin=dtime(12, 0),
                materiales=spec.get("materiales"),
                horas_estimadas=spec.get("h_est"), horas_reales=spec.get("h_real"),
                notas_cierre=spec.get("notas_cierre"),
                motivo_cancelacion=spec.get("motivo_cancelacion")
                if estado == EstadoOrdenTrabajo.CANCELADA else None,
                fecha_inicio_real=(ahora - timedelta(hours=3)) if estado in (
                    EstadoOrdenTrabajo.EN_CURSO, EstadoOrdenTrabajo.BLOQUEADA,
                    EstadoOrdenTrabajo.COMPLETADA) else None,
                fecha_completada=(ahora - timedelta(days=abs(spec.get("dias_prog", 0))))
                if estado == EstadoOrdenTrabajo.COMPLETADA else None,
                creador_id=creador_id,
            )
            db.add(ot)
            await db.flush()
            stats["ot"] += 1
        # Pivot OT<->reclamo
        if reclamo is not None:
            existe_pivot = (await db.execute(
                select(OrdenTrabajoReclamo).where(
                    OrdenTrabajoReclamo.orden_trabajo_id == ot.id,
                    OrdenTrabajoReclamo.reclamo_id == reclamo.id)
            )).scalar_one_or_none()
            if not existe_pivot:
                db.add(OrdenTrabajoReclamo(orden_trabajo_id=ot.id, reclamo_id=reclamo.id))

        # Recursos de inventario (solo si la OT aún no tiene ninguno).
        tiene_recursos = (await db.execute(
            select(OrdenTrabajoRecurso).where(OrdenTrabajoRecurso.orden_trabajo_id == ot.id)
        )).first()
        if not tiene_recursos:
            for item_nombre, tipo, cantidad in spec.get("recursos", []) or []:
                item = inv_por_nombre.get(item_nombre)
                if not item:
                    continue
                if tipo == "reserva":
                    db.add(OrdenTrabajoRecurso(
                        orden_trabajo_id=ot.id, item_id=item.id,
                        tipo=TipoRecursoOT.RESERVA, item_nombre=item.nombre, aplicado=False))
                    stats["reservas"] += 1
                    stats["recursos"] += 1
                    # Activo tomado mientras la OT está vigente; liberado si terminó.
                    if item.naturaleza == NaturalezaInventario.ACTIVO:
                        if estado in (EstadoOrdenTrabajo.ASIGNADA, EstadoOrdenTrabajo.EN_CURSO,
                                      EstadoOrdenTrabajo.BLOQUEADA):
                            item.estado_activo = EstadoActivo.EN_USO
                            item.ocupado_por_ot_id = ot.id
                        elif item.ocupado_por_ot_id in (None, ot.id):
                            # OT terminada: libera el activo, pero NO pisa una
                            # reserva vigente de otra OT que comparte el mismo bien.
                            item.estado_activo = EstadoActivo.DISPONIBLE
                            item.ocupado_por_ot_id = None
                else:  # consumo
                    aplicado = estado == EstadoOrdenTrabajo.COMPLETADA
                    db.add(OrdenTrabajoRecurso(
                        orden_trabajo_id=ot.id, item_id=item.id,
                        tipo=TipoRecursoOT.CONSUMO, cantidad=cantidad,
                        item_nombre=item.nombre, aplicado=aplicado))
                    stats["consumos"] += 1
                    stats["recursos"] += 1
                    if aplicado and item.stock_actual is not None and cantidad:
                        item.stock_actual = max(0.0, float(item.stock_actual) - float(cantidad))
        if estado in (EstadoOrdenTrabajo.ASIGNADA, EstadoOrdenTrabajo.EN_CURSO,
                      EstadoOrdenTrabajo.BLOQUEADA):
            activos += 1
        return ot

    # OTs de los reclamos de campo (solo los "hero" tienen OT; los ligeros no).
    n = 0
    for rec, r in zip(reclamos, RECLAMOS):
        if rec is None or not r.get("ot"):
            continue
        n += 1
        await _crear_ot(f"OT-{year}-{n:04d}", r["ot"], reclamo=rec)

    # OTs extra (preventiva + cancelada).
    for titulo, estado, c_idx, e_idx, dias, mat, h_est, h_real, notas, motivo, prio in OTS_EXTRA:
        n += 1
        spec = {"titulo": titulo, "estado": estado, "prioridad": prio,
                "cuadrilla": c_idx, "empleado": e_idx, "dias_prog": dias,
                "materiales": mat, "h_est": h_est, "h_real": h_real,
                "notas_cierre": notas, "motivo_cancelacion": motivo,
                "recursos": [("Lámpara LED 150W", "consumo", 4)] if estado == EstadoOrdenTrabajo.COMPLETADA else []}
        await _crear_ot(f"OT-{year}-{n:04d}", spec)

    await db.flush()
    print(f"[ordenes_trabajo] {stats['ot']} OT nuevas, {stats['recursos']} recursos "
          f"({stats['reservas']} reservas / {stats['consumos']} consumos)")
    return stats


# ============================================================
# Trámites (upsert por nombre) + mapeo trámite->dependencia.
# ============================================================
async def _seed_tramites(db: AsyncSession, muni_id: int, cats_tram: dict,
                        muni_deps: dict) -> int:
    existentes = {t.nombre: t for t in (await db.execute(
        select(Tramite).where(Tramite.municipio_id == muni_id)
    )).scalars().all()}
    tramites = {}  # nombre -> Tramite
    nuevos = 0
    for i, t in enumerate(TRAMITES):
        cat = cats_tram.get(t["cat"])
        if not cat:
            print(f"[tramites] categoría trámite no encontrada: {t['cat']} — skip")
            continue
        tr = existentes.get(t["nombre"])
        if tr:
            tramites[t["nombre"]] = tr
            continue
        docs = [TramiteDocumentoRequerido(nombre=dn, descripcion=dd, obligatorio=ob, orden=j)
                for j, (dn, dd, ob) in enumerate(t["docs"])]
        tr = Tramite(
            municipio_id=muni_id, categoria_tramite_id=cat.id, nombre=t["nombre"],
            descripcion=t["descripcion"], tiempo_estimado_dias=t["dias"], costo=t["costo"],
            tipo_pago=t.get("tipo_pago"), momento_pago=("inicio" if t.get("tipo_pago") else None),
            modo_atencion=t["modo"], duracion_turno_min=t["turno_min"],
            activo=True, orden=i, documentos_requeridos=docs,
        )
        db.add(tr)
        tramites[t["nombre"]] = tr
        nuevos += 1
    await db.flush()

    # Mapeo trámite -> dependencia (para las 5 activas). Idempotente por par.
    ya = {
        (m.municipio_dependencia_id, m.tramite_id) for m in (await db.execute(
            select(MunicipioDependenciaTramite).join(
                MunicipioDependencia,
                MunicipioDependencia.id == MunicipioDependenciaTramite.municipio_dependencia_id)
            .where(MunicipioDependencia.municipio_id == muni_id)
        )).scalars().all()
    }
    mapeos = 0
    for t in TRAMITES:
        if not t.get("dep"):
            continue
        md = muni_deps.get(t["dep"])
        tr = tramites.get(t["nombre"])
        if not md or not tr or (md.id, tr.id) in ya:
            continue
        db.add(MunicipioDependenciaTramite(municipio_dependencia_id=md.id, tramite_id=tr.id, activo=True))
        mapeos += 1
    await db.flush()
    print(f"[tramites] {len(tramites)} totales ({nuevos} nuevos) + {mapeos} mapeos a dependencia")
    return len(tramites)


# ============================================================
# Solicitudes (borra + recrea para atarlas a los 3 vecinos nuevos). 10 en
# estados variados, con historial e id de dependencia cuando corresponde.
# ============================================================
async def _seed_solicitudes(db: AsyncSession, muni_id: int, usuarios: dict,
                           muni_deps: dict) -> int:
    # Borrar solicitudes previas del muni (y TODAS sus hijas por FK, en orden)
    # para recrearlas ricas. Las hijas son las 4 que referencian solicitudes
    # en el schema (documentos, historial, pagos, turnos): con el uso real de
    # la demo cualquiera puede tener filas.
    for hija in ("documentos_solicitudes", "historial_solicitudes", "pago_sesiones", "turnos"):
        await db.execute(text(f"DELETE FROM {hija} WHERE solicitud_id IN "
                              "(SELECT id FROM solicitudes WHERE municipio_id = :m)"), {"m": muni_id})
    await db.execute(text("DELETE FROM solicitudes WHERE municipio_id = :m"), {"m": muni_id})
    await db.flush()

    tramites = {t.nombre: t for t in (await db.execute(
        select(Tramite).where(Tramite.municipio_id == muni_id)
    )).scalars().all()}
    tramite_por_idx = [tramites.get(t["nombre"]) for t in TRAMITES]
    dep_por_idx = [muni_deps.get(t["dep"]) if t.get("dep") else None for t in TRAMITES]
    vecinos = usuarios["vecinos"]
    admin = usuarios["admin"]

    year = datetime.utcnow().year
    r = await db.execute(text(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(numero_tramite, 10) AS UNSIGNED)), 0) "
        "FROM solicitudes WHERE numero_tramite LIKE :patt"
    ), {"patt": f"SOL-{year}-%"})
    offset = int(r.scalar() or 0)

    creadas = 0
    for k, (t_idx, v_idx, estado) in enumerate(SOLICITUDES):
        tr = tramite_por_idx[t_idx] if t_idx < len(tramite_por_idx) else None
        if not tr:
            continue
        v = vecinos[v_idx]
        md = dep_por_idx[t_idx]
        numero = f"SOL-{year}-{(offset + k + 1):05d}"
        sol = Solicitud(
            municipio_id=muni_id, numero_tramite=numero, tramite_id=tr.id,
            asunto=f"{tr.nombre} — {v.nombre} {v.apellido}",
            descripcion="Solicitud generada para la demo de Paraguay Limpio.",
            estado=estado, solicitante_id=v.id,
            nombre_solicitante=v.nombre, apellido_solicitante=v.apellido,
            email_solicitante=v.email, telefono_solicitante=v.telefono,
            municipio_dependencia_id=md.id if md else None,
            canal="app", prioridad=2 + (k % 3),
        )
        db.add(sol)
        await db.flush()
        db.add(HistorialSolicitud(
            solicitud_id=sol.id, usuario_id=v.id, estado_nuevo=EstadoSolicitud.RECIBIDO,
            accion="Solicitud creada", comentario="Solicitud iniciada por el vecino."))
        if estado != EstadoSolicitud.RECIBIDO:
            db.add(HistorialSolicitud(
                solicitud_id=sol.id, usuario_id=admin.id,
                estado_anterior=EstadoSolicitud.RECIBIDO, estado_nuevo=estado,
                accion=f"Cambio a {estado.value}", comentario="Avance del trámite (demo)."))
        creadas += 1
    await db.flush()
    print(f"[solicitudes] {creadas} solicitudes (atadas a los 3 vecinos) con historial")
    return creadas


# ============================================================
# Desactivar cuentas demo LEGACY de la versión básica del seed
# (@asuncion.gov.py / @demo.py). Los endpoints públicos filtran por
# activo=True, así la botonera queda limpia con SOLO los @asuncion.demo.com.
# No se borran (reversible) para no romper posibles referencias históricas.
# ============================================================
async def _desactivar_legacy(db: AsyncSession, muni_id: int) -> int:
    res = await db.execute(text(
        "UPDATE usuarios SET activo=0 WHERE municipio_id=:m AND activo=1 "
        "AND (email LIKE '%@asuncion.gov.py' OR email LIKE '%@demo.py')"),
        {"m": muni_id})
    n = res.rowcount or 0
    if n:
        print(f"[legacy] {n} cuentas demo viejas (@asuncion.gov.py / @demo.py) desactivadas")
    return n


# ============================================================
# Módulos opt-in visibles.
# ============================================================
async def _habilitar_modulos(db: AsyncSession, muni_id: int) -> None:
    existentes = {m.modulo for m in (await db.execute(
        select(MunicipioModulo).where(MunicipioModulo.municipio_id == muni_id)
    )).scalars().all()}
    for mod in ("ordenes_trabajo", "inventario", "sueldos", "contaduria", "tesoreria"):
        if mod not in existentes:
            db.add(MunicipioModulo(municipio_id=muni_id, modulo=mod, activo=True))
    await db.flush()
    print("[modulos] opt-in habilitados (ordenes_trabajo, inventario, sueldos, contaduria, tesoreria)")


# ============================================================
# Puntos de Interés (POI) — habilita el modo "Puntos" del mapa.
# ============================================================
# POIs anclados al centroide REAL del barrio (coords Nominatim de
# BARRIOS_ASUNCION). Nombres de instituciones reales/plausibles de Asunción; la
# coord es la del barrio (no la del edificio exacto) — mismo criterio honesto que
# los reclamos. tipo_nombre debe existir en poi_seed.TEMPLATE_TIPOS.
# Se ubican sobre barrios CON reclamos activos para que la zona tenga conteo > 0.
# (nombre, tipo_nombre, barrio_cod, radio_metros, notas)
POIS_ASUNCION = [
    ("Hospital de Clínicas",                    "Hospital",  1, 2000, "Zona de influencia sanitaria — Sajonia."),
    ("Cuartel Central de Bomberos Voluntarios", "Bomberos",  8, 2000, "Cobertura del microcentro."),
    ("Comisaría Central Mercado 4",             "Comisaría", 14, 1500, "Seguridad del Mercado 4 y alrededores."),
    ("Escuela Básica de Tacumbú",               "Escuela",   6, 1000, "Entorno escolar — Tacumbú."),
    ("Plaza de la Democracia",                  "Plaza",     13, 500, "Espacio público del casco céntrico."),
]


async def _ensure_poi_schema(engine) -> None:
    """DDL idempotente de POI (tablas poi_tipos/puntos_interes + columnas poi_id
    en reclamos/ordenes_trabajo). Mismo criterio que migrate_add_poi.py, embebido
    para que el seed sea autosuficiente en QA (CLAUDE.md: migraciones sin preguntar)."""
    async with engine.begin() as conn:
        if not await _tabla_existe(conn, "poi_tipos"):
            await conn.execute(text(DDL_POI_TIPOS))
        if not await _tabla_existe(conn, "puntos_interes"):
            await conn.execute(text(DDL_PUNTOS_INTERES))
        if not await _col_existe(conn, "reclamos", "poi_id"):
            await conn.execute(text(ALTER_RECLAMOS))
        if not await _col_existe(conn, "ordenes_trabajo", "poi_id"):
            await conn.execute(text(ALTER_ORDENES))
    print("[poi-schema] tablas/columnas POI verificadas (idempotente)")


async def _seed_poi(db: AsyncSession, muni_id: int, barrios_por_cod: dict) -> int:
    """Habilita el módulo `poi`, siembra el template de tipos y 5 POIs reales de
    Asunción, y recalcula el matching reclamo<->POI (setea reclamos.poi_id para
    que el panel de Puntos muestre el conteo por zona). Idempotente por nombre."""
    n_tipos = await seed_poi_tipos(db, muni_id)
    await activar_modulo_poi(db, muni_id)
    tipos = {t.nombre: t for t in (await db.execute(
        select(PoiTipo).where(PoiTipo.municipio_id == muni_id)
    )).scalars().all()}
    existentes = {p.nombre for p in (await db.execute(
        select(PuntoInteres).where(PuntoInteres.municipio_id == muni_id)
    )).scalars().all()}
    creados = 0
    for nombre, tipo_nombre, barrio_cod, radio, notas in POIS_ASUNCION:
        if nombre in existentes:
            continue
        tipo = tipos.get(tipo_nombre)
        barrio = barrios_por_cod.get(barrio_cod)
        if not tipo or not barrio or barrio.latitud is None:
            continue
        db.add(PuntoInteres(
            municipio_id=muni_id, tipo_id=tipo.id, nombre=nombre,
            direccion=f"{barrio.nombre}, Asunción",
            latitud=barrio.latitud, longitud=barrio.longitud,
            radio_metros=radio, activo=True, notas=notas,
        ))
        creados += 1
    await db.flush()
    en_zona = await recalcular_pois_municipio(db, muni_id)
    print(f"[poi] {n_tipos} tipos nuevos, {creados} POIs nuevos, "
          f"{en_zona} reclamos en zona (módulo poi activo)")
    return en_zona


# ============================================================
# Main
# ============================================================
async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    await _ensure_poi_schema(engine)  # tablas/columnas POI antes de tocar data
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        muni = await _get_or_create_muni(db)
        await db.commit()

        # Categorías (10 reclamo + 10 trámite). crear_categorias_default commitea.
        tiene_cats = (await db.execute(
            select(CategoriaReclamo).where(CategoriaReclamo.municipio_id == muni.id)
        )).scalars().first()
        if not tiene_cats:
            await crear_categorias_default(db, muni.id)
            print("[categorias] 10 reclamo + 10 trámite sembradas")
        else:
            print("[categorias] ya existen — skip")

        cats = {c.nombre: c for c in (await db.execute(
            select(CategoriaReclamo).where(CategoriaReclamo.municipio_id == muni.id)
        )).scalars().all()}
        cats_tram = {c.nombre: c for c in (await db.execute(
            select(CategoriaTramite).where(CategoriaTramite.municipio_id == muni.id)
        )).scalars().all()}

        muni_deps = await _seed_dependencias(db, muni.id, cats)
        usuarios = await _seed_usuarios(db, muni.id, muni_deps)
        barrios = await _seed_barrios(db, muni.id)
        zonas = await _seed_zonas(db, muni.id)

        # barrio por código oficial (para los reclamos).
        barrios_por_cod = {}
        for cod, nom, _la, _lo in BARRIOS_ASUNCION:
            if nom in barrios:
                barrios_por_cod[cod] = barrios[nom]

        empleados = await _seed_empleados(db, muni.id, cats, zonas, muni_deps)
        empleados_login = await _seed_empleados_login(db, muni.id, empleados)
        cuadrillas = await _seed_cuadrillas(db, muni.id, empleados, cats, zonas)
        await _seed_sla(db, muni.id, cats)

        # Inventario ANTES de las OT (para cruzar activos/consumibles).
        # OJO: services/inventario_seed.py tiene un bug pre-existente al RE-correr
        # sobre un muni que YA tiene items (hace `i.nombre` sobre strings de
        # `select(InventarioItem.nombre).scalars()`). Solo sobrevive porque
        # seed_demo lo llama una vez por muni nuevo. Para que ESTE seed sea
        # idempotente, solo llamamos a seed_inventario si el inventario está vacío.
        inv_existentes = (await db.execute(
            select(InventarioItem).where(InventarioItem.municipio_id == muni.id)
        )).scalars().all()
        if not inv_existentes:
            inv_res = await seed_inventario(db, muni.id, incluir_demo=True)
            inv_items_total = inv_res["items"]
        else:
            inv_items_total = len(inv_existentes)
            print(f"[inventario] ya existen {inv_items_total} items — skip seed_inventario")
        inv_por_nombre = {i.nombre: i for i in (await db.execute(
            select(InventarioItem).where(InventarioItem.municipio_id == muni.id)
        )).scalars().all()}
        # Trabar el caso de alumbrado: sin stock de luminarias LED (justifica la OT BLOQUEADA).
        lamp = inv_por_nombre.get("Lámpara LED 150W")
        if lamp is not None:
            lamp.stock_actual = 0.0
        await db.flush()

        reclamos = await _seed_reclamos(db, muni.id, cats, muni_deps, barrios_por_cod,
                                        usuarios, empleados, empleados_login)
        ot_stats = await _seed_ordenes_trabajo(db, muni.id, reclamos, cuadrillas, empleados,
                                               usuarios["admin"].id, inv_por_nombre)
        await _seed_tramites(db, muni.id, cats_tram, muni_deps)
        sols = await _seed_solicitudes(db, muni.id, usuarios, muni_deps)
        await _desactivar_legacy(db, muni.id)
        await _habilitar_modulos(db, muni.id)
        poi_en_zona = await _seed_poi(db, muni.id, barrios_por_cod)
        # Vitalidad del dashboard: zonas reales en TODOS los reclamos + fechas
        # relativas a hoy para los widgets (para-hoy / resueltos de la semana).
        await _asignar_zonas_reclamos(db, muni.id, zonas)
        await _vitalizar_dashboard(db, muni.id)
        # Calificaciones DESPUÉS de _vitalizar_dashboard (usa fecha_resolucion).
        await _seed_calificaciones(db, muni.id)

        await db.commit()

        print(f"\nOK — Paraguay Limpio (Asunción) RICO listo. muni_id={muni.id}, codigo={CODIGO}")
        print(f"  reclamos={len(RECLAMOS)}, OT_nuevas={ot_stats['ot']}, inventario_items={inv_items_total}, "
              f"solicitudes={sols}, POIs=5 ({poi_en_zona} reclamos en zona)")
        print("Login demo (password demo123, dominio @asuncion.demo.com):")
        print("  admin@asuncion.demo.com | supervisor-<dep>@asuncion.demo.com (x5) |")
        print("  empleado-electricidad@ / empleado-bacheo@ | vecino@ / vecino-liz@ / vecino-rodrigo@")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
