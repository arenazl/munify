"""
Seed white-label: municipio "Paraguay Limpio" (Asunción, Departamento Central).
=================================================================================

Marca cliente (front paraguay-limpio.netlify.app) que corre sobre el MISMO backend
Munify. Este script deja una demo 100% funcional de RECLAMOS + TRÁMITES sobre datos
REALES de Asunción, sin tocar ningún otro municipio.

Qué crea (idempotente — seguro de correr N veces):
  - Municipio "Asunción, Departamento Central" (codigo `asuncion`), branding verde,
    es_demo=True (expone la botonera de login rápido).
  - 20 categorías default (10 reclamo + 10 trámite).
  - 4 dependencias operativas (Servicios Públicos, Obras Públicas, Tránsito, Zoonosis)
    con su mapeo categoría -> dependencia.
  - 68 barrios REALES del catálogo oficial VigiCanPY/MSPBS, geocodificados con
    Nominatim (66/68 con coords; 2 sin coord conocida quedan en NULL — nunca coords
    inventadas).
  - 5 usuarios con password `demo123`: admin, supervisor y 3 vecinos (botonera).
  - 10 reclamos variados (distintos estados, comentarios, 2 trabados a la espera de
    inventario / con orden de trabajo) con coords reales sobre barrios de Asunción y
    created_at reciente (para que el mapa de calor los muestre).
  - 10 trámites completos con documentos requeridos + 8 solicitudes en estados variados.
  - TODOS los módulos opt-in quedan HABILITADOS (visibles en el sidebar) pero SIN datos
    cargados — solo reclamos y trámites llevan contenido.

Correr (desde backend/):  python -m scripts.seed_paraguay_limpio
Usa settings.DATABASE_URL (el ambiente donde apunte el backend). En QA lo corre Infra.
"""
import asyncio
import hashlib
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.security import get_password_hash
from models.enums import RolUsuario, EstadoReclamo
from models.municipio import Municipio
from models.user import User
from models.barrio import Barrio
from models.dependencia import Dependencia
from models.municipio_dependencia import MunicipioDependencia
from models.municipio_dependencia_categoria import MunicipioDependenciaCategoria
from models.categoria_reclamo import CategoriaReclamo
from models.categoria_tramite import CategoriaTramite
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.tramite import Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from models.tramite_documento_requerido import TramiteDocumentoRequerido
from models.municipio_modulo import MunicipioModulo
from services.categorias_default import crear_categorias_default


# ============================================================
# Datos del municipio
# ============================================================
CODIGO = "asuncion"
NOMBRE = "Asunción, Departamento Central"
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
# Dependencias operativas (4) + mapeo categoría de reclamo -> dependencia
# Los códigos existen en el catálogo global (models/dependencia.py).
# ============================================================
DEPENDENCIAS = ["SERVICIOS_PUBLICOS", "OBRAS_PUBLICAS", "TRANSITO_VIAL", "ZOONOSIS"]
DEP_CATEGORIAS_MAP = {
    "SERVICIOS_PUBLICOS": [
        "Alumbrado público", "Recolección de residuos",
        "Arbolado y espacios verdes", "Agua y cloacas", "Higiene urbana",
    ],
    "OBRAS_PUBLICAS": ["Bacheo y calles"],
    "TRANSITO_VIAL": ["Tránsito y señalización"],
    "ZOONOSIS": ["Plagas y control", "Animales sueltos"],
}

# ============================================================
# 3 vecinos demo (nombres paraguayos plausibles — datos de DEMO)
# ============================================================
VECINOS = [
    {"email": "derlis@demo.py",  "nombre": "Derlis",  "apellido": "González", "sexo": "M", "tel": "+595 981 111222"},
    {"email": "liz@demo.py",     "nombre": "Liz",     "apellido": "Benítez",  "sexo": "F", "tel": "+595 982 333444"},
    {"email": "rodrigo@demo.py", "nombre": "Rodrigo", "apellido": "Villalba", "sexo": "M", "tel": "+595 983 555666"},
]

# ============================================================
# 10 reclamos variados (coords reales sobre barrios de Asunción)
# barrio_cod: código del barrio en BARRIOS_ASUNCION.
# dias: hace cuántos días se creó (para el mapa de calor: todos < 30d).
# vecino: índice en VECINOS (creador).
# ============================================================
_H = int(hashlib.sha1(b"asuncion-reclamos").hexdigest(), 16)  # jitter determinístico

RECLAMOS = [
    {
        "titulo": "Basura acumulada sobre calle Colón",
        "descripcion": "Hace cuatro días que no pasa el recolector por Colón casi Estados Unidos. La basura se amontona en la esquina y hay mal olor.",
        "categoria": "Recolección de residuos", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 1, "canal": "app", "dias": 3, "vecino": 0,
        "direccion": "Colón c/ Estados Unidos, Sajonia",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se coordinó recorrida extra del camión recolector para la zona."},
        ],
    },
    {
        "titulo": "Microbasural en terreno baldío",
        "descripcion": "Un terreno baldío sobre Palma se convirtió en microbasural. Los vecinos piden limpieza y que se cierre el predio.",
        "categoria": "Higiene urbana", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.RECIBIDO, "barrio_cod": 8, "canal": "whatsapp", "dias": 1, "vecino": 1,
        "direccion": "Palma c/ Alberdi, La Catedral",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Recambio de luminarias LED en Av. Mcal. López",
        "descripcion": "Tramo de tres cuadras sin alumbrado sobre Av. Mcal. López. Se pidió el recambio a LED de todo el tramo.",
        "categoria": "Alumbrado público", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 42, "canal": "app", "dias": 8, "vecino": 2,
        "direccion": "Av. Mcal. López c/ San Martín, Villa Morra",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Orden de trabajo OT-0007 generada, cuadrilla de electricidad asignada."},
            {"accion": "Nota",
             "comentario": "Trabajo en pausa: sin stock de luminarias LED 100W en depósito. A la espera de reposición de inventario para completar el tramo."},
        ],
    },
    {
        "titulo": "Poda de árbol que toca los cables",
        "descripcion": "Un árbol grande sobre Av. España tiene ramas enredadas en los cables de media tensión. Riesgo con viento.",
        "categoria": "Arbolado y espacios verdes", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.FINALIZADO, "barrio_cod": 41, "canal": "app", "dias": 20, "vecino": 0,
        "direccion": "Av. España c/ Brasil, Recoleta",
        "confirmado_vecino": True,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Cuadrilla de poda coordinada con la distribuidora eléctrica para el corte programado."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO,
             "comentario": "Poda realizada y ramas retiradas. Se despejaron los cables."},
        ],
    },
    {
        "titulo": "Bache profundo sobre Eusebio Ayala",
        "descripcion": "Bache de gran tamaño sobre Av. Eusebio Ayala que ya rompió la rueda de dos autos. Urgente.",
        "categoria": "Bacheo y calles", "dep": "OBRAS_PUBLICAS",
        "estado": EstadoReclamo.RECIBIDO, "barrio_cod": 18, "canal": "web_publica", "dias": 2, "vecino": 1,
        "direccion": "Av. Eusebio Ayala c/ Molas López, Mburicaó",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Contenedor desbordado frente al Botánico",
        "descripcion": "El contenedor de la entrada del Jardín Botánico está desbordado hace días, con residuos alrededor.",
        "categoria": "Recolección de residuos", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.FINALIZADO, "barrio_cod": 67, "canal": "whatsapp", "dias": 15, "vecino": 2,
        "direccion": "Av. Artigas, acceso Jardín Botánico",
        "confirmado_vecino": True,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Recolección reforzada asignada al sector."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO,
             "comentario": "Contenedor vaciado y zona limpiada."},
        ],
    },
    {
        "titulo": "Foco de mosquitos: piden fumigación",
        "descripcion": "Zona con agua estancada y muchos mosquitos. Los vecinos piden fumigación y control de foco de dengue.",
        "categoria": "Plagas y control", "dep": "ZOONOSIS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 6, "canal": "app", "dias": 5, "vecino": 0,
        "direccion": "Bajada Tacumbú, zona costera",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se programó la cuadrilla de fumigación y descacharrado para esta semana."},
        ],
    },
    {
        "titulo": "Semáforo apagado en cruce concurrido",
        "descripcion": "El semáforo de Brasil y Cerro Corá está apagado desde ayer. El cruce es muy transitado y hay riesgo de choques.",
        "categoria": "Tránsito y señalización", "dep": "TRANSITO_VIAL",
        "estado": EstadoReclamo.RECIBIDO, "barrio_cod": 13, "canal": "web_publica", "dias": 1, "vecino": 1,
        "direccion": "Brasil c/ Cerro Corá, San Roque",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
        ],
    },
    {
        "titulo": "Reparación de contenedores en el Mercado 4",
        "descripcion": "Varios contenedores del Mercado 4 tienen las tapas rotas y no cierran. Piden reparación.",
        "categoria": "Higiene urbana", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.EN_CURSO, "barrio_cod": 14, "canal": "ventanilla_asistida", "dias": 10, "vecino": 2,
        "direccion": "Mercado 4, Pettirossi c/ Rca. Francesa",
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Orden de trabajo emitida a la cuadrilla de mantenimiento."},
            {"accion": "Nota",
             "comentario": "En espera de insumos: faltan bisagras y tapas de repuesto en inventario, pendiente de compra."},
        ],
    },
    {
        "titulo": "Pérdida de agua sobre Av. Artigas",
        "descripcion": "Caño roto sobre Av. Artigas con pérdida constante de agua hacia la calzada. Se desperdicia agua y se forma un charco.",
        "categoria": "Agua y cloacas", "dep": "SERVICIOS_PUBLICOS",
        "estado": EstadoReclamo.FINALIZADO, "barrio_cod": 21, "canal": "app", "dias": 25, "vecino": 0,
        "direccion": "Av. Artigas c/ Gral. Santos, Las Mercedes",
        "confirmado_vecino": True,
        "historial": [
            {"accion": "Reclamo creado", "estado_nuevo": EstadoReclamo.RECIBIDO},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.RECIBIDO, "estado_nuevo": EstadoReclamo.EN_CURSO,
             "comentario": "Se derivó a la prestataria de agua y se acompañó la reparación de la vía pública."},
            {"accion": "Cambio de estado", "estado_anterior": EstadoReclamo.EN_CURSO, "estado_nuevo": EstadoReclamo.FINALIZADO,
             "comentario": "Caño reparado y calzada restituida."},
        ],
    },
]

# ============================================================
# 10 trámites completos (categoria_tramite por nombre; docs requeridos)
# ============================================================
TRAMITES = [
    {"nombre": "Licencia de conducir - Primera vez", "cat": "Tránsito y Transporte",
     "descripcion": "Obtención de la licencia de conducir para quienes no poseen una previa.",
     "dias": 15, "costo": 250000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 45,
     "docs": [("Cédula de identidad (frente y dorso)", "Copia del documento", True),
              ("Certificado médico", "Emitido por centro habilitado, vigencia 30 días", True),
              ("Foto tipo carnet", "Fondo blanco, actualizada", True)]},
    {"nombre": "Renovación de licencia de conducir", "cat": "Tránsito y Transporte",
     "descripcion": "Renovación de la licencia de conducir vigente, sin cambio de categoría.",
     "dias": 5, "costo": 180000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 20,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Licencia anterior", "Licencia a renovar", True)]},
    {"nombre": "Habilitación comercial", "cat": "Habilitaciones Comerciales",
     "descripcion": "Habilitación para la apertura de un nuevo comercio o actividad comercial.",
     "dias": 30, "costo": 450000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True),
              ("Plano del local", "Plano firmado por profesional", True),
              ("Constancia de RUC", "Inscripción tributaria vigente", True)]},
    {"nombre": "Renovación de habilitación comercial", "cat": "Habilitaciones Comerciales",
     "descripcion": "Renovación anual de la habilitación comercial vigente.",
     "dias": 10, "costo": 200000.0, "tipo_pago": "boton_pago", "modo": "presencial_sin_turno", "turno_min": 30,
     "docs": [("Habilitación anterior", "Constancia de la habilitación a renovar", True)]},
    {"nombre": "Permiso de obra menor", "cat": "Obras Particulares",
     "descripcion": "Autorización para obras menores (cercos, veredas, refacciones).",
     "dias": 20, "costo": 150000.0, "tipo_pago": "boton_pago", "modo": "presencial_sin_turno", "turno_min": 30,
     "docs": [("Cédula del propietario", "Copia del documento", True),
              ("Croquis de obra", "Plano o croquis firmado", True)]},
    {"nombre": "Certificado de libre deuda municipal", "cat": "Tasas y Tributos",
     "descripcion": "Certificado que acredita la inexistencia de deudas con la Municipalidad.",
     "dias": 5, "costo": 60000.0, "tipo_pago": "boton_pago", "modo": "online", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True),
              ("Última boleta municipal", "Boleta del último período abonado", False)]},
    {"nombre": "Pago de tasa de recolección de residuos", "cat": "Tasas y Tributos",
     "descripcion": "Liquidación y pago de la tasa municipal de recolección de residuos.",
     "dias": 1, "costo": 0.0, "tipo_pago": "boton_pago", "modo": "online", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True)]},
    {"nombre": "Certificado de residencia", "cat": "Certificados y Documentación",
     "descripcion": "Constancia que acredita el domicilio del solicitante en la ciudad.",
     "dias": 3, "costo": 40000.0, "tipo_pago": "boton_pago", "modo": "presencial_sin_turno", "turno_min": 15,
     "docs": [("Cédula de identidad", "Copia del documento", True),
              ("Comprobante de domicilio", "Factura de servicio a nombre del solicitante", True)]},
    {"nombre": "Permiso de poda de árbol", "cat": "Espacios Públicos",
     "descripcion": "Autorización para la poda de arbolado urbano frente al domicilio.",
     "dias": 12, "costo": 0.0, "tipo_pago": None, "modo": "presencial_sin_turno", "turno_min": 20,
     "docs": [("Cédula del solicitante", "Copia del documento", True),
              ("Foto del árbol", "Foto que muestre el estado del árbol", False)]},
    {"nombre": "Habilitación de transporte de alimentos", "cat": "Salud y Bromatología",
     "descripcion": "Habilitación bromatológica de vehículos de transporte de alimentos.",
     "dias": 15, "costo": 300000.0, "tipo_pago": "boton_pago", "modo": "presencial_con_turno", "turno_min": 30,
     "docs": [("Cédula del titular", "Copia del documento", True),
              ("Cédula verde del vehículo", "Documento del vehículo", True),
              ("Certificado de desinfección", "Emitido por empresa habilitada", True)]},
]

# 8 solicitudes de ejemplo: (indice_tramite, indice_vecino, estado)
SOLICITUDES = [
    (0, 0, EstadoSolicitud.RECIBIDO),
    (2, 1, EstadoSolicitud.EN_CURSO),
    (5, 2, EstadoSolicitud.FINALIZADO),
    (6, 0, EstadoSolicitud.EN_CURSO),
    (7, 1, EstadoSolicitud.RECIBIDO),
    (8, 2, EstadoSolicitud.POSPUESTO),
    (1, 0, EstadoSolicitud.FINALIZADO),
    (9, 1, EstadoSolicitud.RECIBIDO),
]


# ============================================================
# Seed
# ============================================================
async def _get_or_create_muni(db: AsyncSession) -> Municipio:
    muni = (await db.execute(select(Municipio).where(Municipio.codigo == CODIGO))).scalar_one_or_none()
    if muni:
        # Actualizar branding/estado por si cambió (idempotente).
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


async def _seed_usuarios(db: AsyncSession, muni_id: int, sup_dep_id: Optional[int]) -> list[User]:
    """Admin + supervisor + 3 vecinos (password demo123). Idempotente por email."""
    hash_demo = get_password_hash(PASSWORD_DEMO)
    creados = []

    async def ensure_user(**kwargs) -> User:
        u = (await db.execute(select(User).where(User.email == kwargs["email"]))).scalar_one_or_none()
        if u:
            return u
        u = User(password_hash=hash_demo, municipio_id=muni_id, activo=True,
                 cuenta_verificada=True, **kwargs)
        db.add(u)
        creados.append(u)
        return u

    await ensure_user(email="admin@asuncion.gov.py", nombre="Administración",
                      apellido="Municipal", rol=RolUsuario.ADMIN)
    await ensure_user(email="supervisor@asuncion.gov.py", nombre="Supervisor",
                      apellido="Servicios Públicos", rol=RolUsuario.SUPERVISOR,
                      municipio_dependencia_id=sup_dep_id)
    vecinos = []
    for v in VECINOS:
        u = await ensure_user(email=v["email"], nombre=v["nombre"], apellido=v["apellido"],
                              telefono=v["tel"], sexo=v["sexo"], nacionalidad="PRY",
                              rol=RolUsuario.VECINO, nivel_verificacion=2)
        vecinos.append(u)
    await db.flush()
    print(f"[usuarios] {len(creados)} creados (admin + supervisor + 3 vecinos si faltaban)")
    return vecinos


async def _seed_dependencias(db: AsyncSession, muni_id: int, cats: dict) -> dict:
    """Habilita 4 dependencias del catálogo global + mapeo categoría->dep. Idempotente."""
    existentes = (await db.execute(
        select(MunicipioDependencia).where(MunicipioDependencia.municipio_id == muni_id)
    )).scalars().all()
    if existentes:
        print(f"[deps] ya existen {len(existentes)} — skip")
        return {d.dependencia_id: d for d in existentes}

    cat_deps = (await db.execute(
        select(Dependencia).where(Dependencia.codigo.in_(DEPENDENCIAS))
    )).scalars().all()
    dep_por_codigo = {d.codigo: d for d in cat_deps}
    if not dep_por_codigo:
        print("[deps] WARNING: catálogo global de Dependencia vacío — reclamos quedarán sin dependencia")
        return {}

    muni_deps = {}
    for i, cod in enumerate(DEPENDENCIAS):
        dep = dep_por_codigo.get(cod)
        if not dep:
            continue
        md = MunicipioDependencia(municipio_id=muni_id, dependencia_id=dep.id, activo=True, orden=i)
        db.add(md)
        muni_deps[cod] = md
    await db.flush()

    for cod, cat_nombres in DEP_CATEGORIAS_MAP.items():
        md = muni_deps.get(cod)
        if not md:
            continue
        for cat_nombre in cat_nombres:
            cat = cats.get(cat_nombre)
            if not cat:
                continue
            db.add(MunicipioDependenciaCategoria(
                municipio_id=muni_id, dependencia_id=md.dependencia_id,
                categoria_id=cat.id, municipio_dependencia_id=md.id, activo=True,
            ))
    await db.flush()
    print(f"[deps] {len(muni_deps)} dependencias + mapeo de categorías creados")
    return muni_deps


async def _seed_barrios(db: AsyncSession, muni_id: int) -> dict:
    """Los 68 barrios oficiales. Idempotente (por nombre)."""
    n = (await db.execute(
        select(Barrio).where(Barrio.municipio_id == muni_id)
    )).scalars().all()
    if n:
        print(f"[barrios] ya existen {len(n)} — skip")
        return {b.nombre: b for b in n}
    barrios = {}
    for _cod, nombre, lat, lon in BARRIOS_ASUNCION:
        b = Barrio(municipio_id=muni_id, nombre=nombre, latitud=lat, longitud=lon,
                   tipo="suburb", validado=lat is not None)
        db.add(b)
        barrios[nombre] = b
    await db.flush()
    con_coord = sum(1 for _c, _n, la, _lo in BARRIOS_ASUNCION if la is not None)
    print(f"[barrios] {len(barrios)} creados ({con_coord} con coords reales)")
    return barrios


async def _seed_reclamos(db: AsyncSession, muni_id: int, cats: dict, muni_deps: dict,
                         barrios_por_cod: dict, vecinos: list[User]) -> int:
    n = (await db.execute(select(Reclamo).where(Reclamo.municipio_id == muni_id))).scalars().all()
    if n:
        print(f"[reclamos] ya existen {len(n)} — skip")
        return 0
    creados = []
    historiales = []
    for i, r in enumerate(RECLAMOS):
        cat = cats.get(r["categoria"])
        if not cat:
            print(f"[reclamos] categoría no encontrada: {r['categoria']} — skip reclamo")
            continue
        barrio = barrios_por_cod.get(r["barrio_cod"])
        md = muni_deps.get(r["dep"])
        # Coord = coord del barrio + jitter determinístico (~120m) para que no
        # queden todos en el mismo punto. Si el barrio no tiene coord, cae al centro.
        base_lat = barrio.latitud if (barrio and barrio.latitud is not None) else CENTRO_LAT
        base_lon = barrio.longitud if (barrio and barrio.longitud is not None) else CENTRO_LON
        jlat = (((_H >> (i * 3)) % 200) - 100) / 100000.0
        jlon = (((_H >> (i * 3 + 1)) % 200) - 100) / 100000.0
        rec = Reclamo(
            municipio_id=muni_id, titulo=r["titulo"], descripcion=r["descripcion"],
            estado=r["estado"], prioridad=3, direccion=r["direccion"],
            latitud=round(base_lat + jlat, 6), longitud=round(base_lon + jlon, 6),
            categoria_id=cat.id, barrio_id=(barrio.id if barrio else None),
            creador_id=vecinos[r["vecino"]].id,
            municipio_dependencia_id=(md.id if md else None),
            canal=r["canal"],
            confirmado_vecino=r.get("confirmado_vecino"),
            created_at=datetime.utcnow() - timedelta(days=r["dias"]),
        )
        db.add(rec)
        creados.append(rec)
        historiales.append((r["historial"], vecinos[r["vecino"]].id))
    await db.flush()
    for rec, (hist, uid) in zip(creados, historiales):
        for h in hist:
            db.add(HistorialReclamo(
                reclamo_id=rec.id, usuario_id=uid, accion=h["accion"],
                estado_anterior=h.get("estado_anterior"), estado_nuevo=h.get("estado_nuevo"),
                comentario=h.get("comentario"),
            ))
    await db.flush()
    print(f"[reclamos] {len(creados)} creados con historial")
    return len(creados)


async def _seed_tramites(db: AsyncSession, muni_id: int, cats_tram: dict,
                         vecinos: list[User]) -> tuple[int, int]:
    n = (await db.execute(select(Tramite).where(Tramite.municipio_id == muni_id))).scalars().all()
    if n:
        print(f"[tramites] ya existen {len(n)} — skip")
        return 0, 0
    tramites = []
    for i, t in enumerate(TRAMITES):
        cat = cats_tram.get(t["cat"])
        if not cat:
            print(f"[tramites] categoría trámite no encontrada: {t['cat']} — skip")
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
        tramites.append(tr)
    await db.flush()

    # Solicitudes en estados variados.
    year = datetime.utcnow().year
    r = await db.execute(text(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(numero_tramite, 10) AS UNSIGNED)), 0) "
        "FROM solicitudes WHERE numero_tramite LIKE :patt"
    ), {"patt": f"SOL-{year}-%"})
    offset = int(r.scalar() or 0)
    sols = 0
    for k, (t_idx, v_idx, estado) in enumerate(SOLICITUDES):
        if t_idx >= len(tramites):
            continue
        tr = tramites[t_idx]
        v = vecinos[v_idx]
        numero = f"SOL-{year}-{(offset + k + 1):05d}"
        sol = Solicitud(
            municipio_id=muni_id, numero_tramite=numero, tramite_id=tr.id,
            asunto=f"{tr.nombre} — {v.nombre} {v.apellido}",
            descripcion="Solicitud generada para la demo de Paraguay Limpio.",
            estado=estado, solicitante_id=v.id,
            nombre_solicitante=v.nombre, apellido_solicitante=v.apellido,
            email_solicitante=v.email, telefono_solicitante=v.telefono,
            prioridad=2 + (k % 3),
        )
        db.add(sol)
        await db.flush()
        db.add(HistorialSolicitud(
            solicitud_id=sol.id, usuario_id=v.id, estado_nuevo=EstadoSolicitud.RECIBIDO,
            accion="Solicitud creada", comentario="Solicitud iniciada por el vecino.",
        ))
        if estado != EstadoSolicitud.RECIBIDO:
            db.add(HistorialSolicitud(
                solicitud_id=sol.id, usuario_id=v.id,
                estado_anterior=EstadoSolicitud.RECIBIDO, estado_nuevo=estado,
                accion=f"Cambio a {estado.value}", comentario="Avance del trámite (demo).",
            ))
        sols += 1
    await db.flush()
    print(f"[tramites] {len(tramites)} trámites + {sols} solicitudes creados")
    return len(tramites), sols


async def _habilitar_modulos(db: AsyncSession, muni_id: int) -> None:
    """Deja TODOS los módulos opt-in visibles en el sidebar (SIN datos)."""
    existentes = {m.modulo for m in (await db.execute(
        select(MunicipioModulo).where(MunicipioModulo.municipio_id == muni_id)
    )).scalars().all()}
    for mod in ("ordenes_trabajo", "inventario", "sueldos", "contaduria", "tesoreria"):
        if mod not in existentes:
            db.add(MunicipioModulo(municipio_id=muni_id, modulo=mod, activo=True))
    await db.flush()
    print("[modulos] opt-in habilitados (visibles, sin datos)")


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
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
        sup_dep = muni_deps.get("SERVICIOS_PUBLICOS")
        vecinos = await _seed_usuarios(db, muni.id, sup_dep.id if sup_dep else None)
        barrios = await _seed_barrios(db, muni.id)
        barrios_por_cod = {}
        # mapear código oficial -> barrio (para los reclamos)
        nombre_por_cod = {cod: nom for cod, nom, _la, _lo in BARRIOS_ASUNCION}
        for cod, nom in nombre_por_cod.items():
            if nom in barrios:
                barrios_por_cod[cod] = barrios[nom]

        await _seed_reclamos(db, muni.id, cats, muni_deps, barrios_por_cod, vecinos)
        await _seed_tramites(db, muni.id, cats_tram, vecinos)
        await _habilitar_modulos(db, muni.id)
        await db.commit()
        print(f"\nOK — Paraguay Limpio (Asunción) listo. muni_id={muni.id}, codigo={CODIGO}")
        print("Login demo (password demo123): admin@asuncion.gov.py, supervisor@asuncion.gov.py,")
        print("  derlis@demo.py, liz@demo.py, rodrigo@demo.py")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
