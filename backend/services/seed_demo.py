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
from sqlalchemy import select, func

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
DEPENDENCIA_CATEGORIAS_MAP = {
    "OBRAS_PUBLICAS": ["Bacheo y calles"],
    "SERVICIOS_PUBLICOS": [
        "Alumbrado público",
        "Recolección de residuos",
        "Arbolado y espacios verdes",
        "Agua y cloacas",
    ],
    "TRANSITO_VIAL": ["Tránsito y señalización"],
    "GENERAL": [
        "Higiene urbana",
        "Plagas y control",
        "Animales sueltos",
        "Ruidos y convivencia",
    ],
}

DEPENDENCIAS_CODIGOS = [
    "OBRAS_PUBLICAS",
    "SERVICIOS_PUBLICOS",
    "TRANSITO_VIAL",
    "HABILITACIONES",
    "GENERAL",
]

TRAMITES_DEMO = [
    {
        "nombre": "Licencia de conducir - Primera vez",
        "descripcion": "Obtención de la licencia de conducir para personas que no poseen una previa.",
        "categoria_tramite_nombre": "Tránsito y Transporte",
        "dep_codigo": "TRANSITO_VIAL",
        "tiempo_estimado_dias": 15,
        "costo": 8500.0,
        "documentos": [
            ("DNI (frente y dorso)", "Copia digitalizada del documento nacional de identidad", True),
            ("Certificado médico psicofísico", "Emitido por centro habilitado, vigencia 30 días", True),
            ("Foto carnet 4x4", "Fondo blanco, actualizada", True),
        ],
    },
    {
        "nombre": "Habilitación comercial",
        "descripcion": "Habilitación para apertura de un nuevo comercio o actividad comercial.",
        "categoria_tramite_nombre": "Habilitaciones Comerciales",
        "dep_codigo": "HABILITACIONES",
        "tiempo_estimado_dias": 30,
        "costo": 15000.0,
        "documentos": [
            ("DNI del titular", "Copia digitalizada del documento nacional de identidad", True),
            ("Plano del local", "Plano aprobado por profesional matriculado", True),
            ("Constancia de inscripción AFIP", "Constancia de CUIT actualizada", True),
        ],
    },
    {
        "nombre": "Permiso de obra menor",
        "descripcion": "Autorización para realizar obras menores (cercos, veredas, refacciones).",
        "categoria_tramite_nombre": "Obras Particulares",
        "dep_codigo": "OBRAS_PUBLICAS",
        "tiempo_estimado_dias": 20,
        "costo": 5000.0,
        "documentos": [
            ("DNI del propietario", "Copia digitalizada del documento nacional de identidad", True),
            ("Plano de obra", "Croquis o plano firmado por profesional", True),
        ],
    },
    {
        "nombre": "Certificado de libre deuda municipal",
        "descripcion": "Certificado que acredita la inexistencia de deudas con el municipio.",
        "categoria_tramite_nombre": "Tasas y Tributos",
        "dep_codigo": "GENERAL",
        "tiempo_estimado_dias": 5,
        "costo": 2000.0,
        "documentos": [
            ("DNI del titular", "Copia digitalizada del documento nacional de identidad", True),
            ("Última boleta de tasa municipal", "Boleta del último período abonado", False),
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
# (titulo, descripcion, categoria_nombre, estado, direccion,
#  dep_codigo, zona_nombre, barrio_nombre, lat_offset, lng_offset, historial)
RECLAMOS_DEMO = [
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

    # Un supervisor por cada dependencia habilitada
    supervisores_demo: list[User] = []
    for dep_codigo, muni_dep in muni_deps.items():
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
    # verificada con datos filiatorios completos. Asi al crear tramites/reclamos
    # el wizard se autocompleta y la demo muestra la experiencia ideal.
    from datetime import date, datetime as _dt
    vecino_demo = User(
        email=f"vecino@{codigo}.demo.com",
        nombre="Vecino",
        apellido="Demo",
        dni="30123456",
        telefono="+54 9 11 5555-0123",
        direccion="Av. Sarmiento 1234",
        sexo="M",
        fecha_nacimiento=date(1985, 3, 15),
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
    # 5. Zonas + Barrios (geografía para mapa y selectors)
    # ------------------------------------------------------------------
    zonas = await _seed_zonas(db, municipio_id, codigo, muni_lat, muni_lng)
    barrios = await _seed_barrios(db, municipio_id, muni_lat, muni_lng)

    # ------------------------------------------------------------------
    # 6. Empleados + Cuadrillas (personal operativo)
    # ------------------------------------------------------------------
    empleados = await _seed_empleados(db, municipio_id, cats_reclamo, zonas)
    cuadrillas = await _seed_cuadrillas(db, municipio_id, empleados, cats_reclamo, zonas)

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
    for r_data in RECLAMOS_DEMO:
        cat = cats_reclamo.get(r_data["categoria_nombre"])
        if not cat:
            continue
        muni_dep = muni_deps.get(r_data["dependencia_codigo"])
        zona = zonas.get(r_data["zona_nombre"])
        barrio = barrios.get(r_data["barrio_nombre"])

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

    # ------------------------------------------------------------------
    # 9. 1 Solicitud de ejemplo
    # ------------------------------------------------------------------
    solicitud_creada = False
    if tramites_creados:
        year = datetime.now().year
        prefix = f"SOL-{year}-"
        max_q = await db.execute(
            select(func.max(Solicitud.numero_tramite)).where(
                Solicitud.numero_tramite.like(f"{prefix}%"),
            )
        )
        max_numero = max_q.scalar()
        if max_numero:
            seq = int(max_numero.split("-")[-1])
            numero = f"{prefix}{str(seq + 1).zfill(5)}"
        else:
            numero = f"{prefix}00001"

        solicitud = Solicitud(
            municipio_id=municipio_id,
            numero_tramite=numero,
            tramite_id=tramites_creados[0].id,
            asunto=f"Solicitud: {tramites_creados[0].nombre}",
            descripcion="Solicitud de ejemplo creada con la demo.",
            estado=EstadoSolicitud.RECIBIDO,
            solicitante_id=vecino_demo.id,
            nombre_solicitante="Vecino",
            apellido_solicitante="Demo",
            email_solicitante=f"vecino@{codigo}.demo.com",
            prioridad=3,
        )
        db.add(solicitud)
        await db.flush()

        db.add(HistorialSolicitud(
            solicitud_id=solicitud.id,
            usuario_id=vecino_demo.id,
            estado_nuevo=EstadoSolicitud.RECIBIDO,
            accion="Solicitud creada",
            comentario=f"Trámite: {tramites_creados[0].nombre}",
        ))
        solicitud_creada = True

    return {
        "dependencias": len(muni_deps),
        "tramites": len(tramites_creados),
        "usuarios": 3,
        "zonas": len(zonas),
        "barrios": len(barrios),
        "empleados": len(empleados),
        "cuadrillas": len(cuadrillas),
        "sla_configs": sla_count,
        "reclamos": reclamos_creados,
        "solicitudes": 1 if solicitud_creada else 0,
    }
