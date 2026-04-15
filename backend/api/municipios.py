"""
API de Municipios - Endpoints publicos y protegidos
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import Optional, List
from pydantic import BaseModel
from math import radians, cos, sin, asin, sqrt
import cloudinary
import cloudinary.uploader

from core.database import get_db
from core.security import get_current_user, require_roles
from core.config import settings
from models.municipio import Municipio
from models.user import User
from models.enums import RolUsuario
from services.categorias_default import crear_categorias_default

router = APIRouter()

# Configurar Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)


# ============ Schemas ============

class MunicipioPublic(BaseModel):
    """Datos publicos de un municipio (sin info sensible)"""
    id: int
    nombre: str
    codigo: str
    latitud: float
    longitud: float
    radio_km: float
    logo_url: Optional[str] = None
    color_primario: str
    activo: bool
    # Flag de UI: si es True, los ABMs de categorías / tipos de trámite se
    # muestran como items del sidebar. Si es False, quedan sólo en Ajustes.
    abm_en_sidebar: bool = True

    class Config:
        from_attributes = True


class MunicipioDetalle(MunicipioPublic):
    """Datos completos del municipio"""
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sitio_web: Optional[str] = None
    zoom_mapa_default: int = 13
    color_secundario: str = "#1E40AF"
    tema_config: Optional[dict] = None
    imagen_portada: Optional[str] = None  # URL de imagen para header/banner del dashboard


class MunicipioCreate(BaseModel):
    nombre: str
    codigo: str
    latitud: float
    longitud: float
    radio_km: float = 10.0
    descripcion: Optional[str] = None
    logo_url: Optional[str] = None
    color_primario: str = "#3B82F6"
    color_secundario: str = "#1E40AF"
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sitio_web: Optional[str] = None
    zoom_mapa_default: int = 13


class MunicipioUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    radio_km: Optional[float] = None
    logo_url: Optional[str] = None
    color_primario: Optional[str] = None
    color_secundario: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sitio_web: Optional[str] = None
    zoom_mapa_default: Optional[int] = None
    activo: Optional[bool] = None


class MunicipioCercano(MunicipioPublic):
    """Municipio con distancia calculada"""
    distancia_km: float


# ============ Funciones auxiliares ============

def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """
    Calcula la distancia en km entre dos puntos usando la formula de Haversine.
    """
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radio de la Tierra en km
    return c * r


# ============ Endpoints PUBLICOS (sin autenticacion) ============

@router.get("/public", response_model=List[MunicipioPublic])
async def listar_municipios_publico(
    activo: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """
    Lista todos los municipios activos (endpoint PUBLICO).
    Usado por la landing page para mostrar opciones.
    """
    query = select(Municipio).where(Municipio.activo == activo)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/public/cercano", response_model=Optional[MunicipioCercano])
async def buscar_municipio_cercano(
    lat: float = Query(..., description="Latitud del usuario"),
    lng: float = Query(..., description="Longitud del usuario"),
    db: AsyncSession = Depends(get_db)
):
    """
    Busca el municipio mas cercano a las coordenadas dadas (endpoint PUBLICO).
    Retorna el municipio si el usuario esta dentro de su radio de cobertura.
    """
    query = select(Municipio).where(Municipio.activo == True)
    result = await db.execute(query)
    municipios = result.scalars().all()

    if not municipios:
        return None

    # Encontrar el municipio mas cercano
    mejor_municipio = None
    menor_distancia = float('inf')

    for muni in municipios:
        distancia = haversine(lng, lat, muni.longitud, muni.latitud)
        if distancia < menor_distancia:
            menor_distancia = distancia
            mejor_municipio = muni

    # Verificar si esta dentro del radio de cobertura
    if mejor_municipio and menor_distancia <= mejor_municipio.radio_km:
        return MunicipioCercano(
            id=mejor_municipio.id,
            nombre=mejor_municipio.nombre,
            codigo=mejor_municipio.codigo,
            latitud=mejor_municipio.latitud,
            longitud=mejor_municipio.longitud,
            radio_km=mejor_municipio.radio_km,
            logo_url=mejor_municipio.logo_url,
            color_primario=mejor_municipio.color_primario,
            activo=mejor_municipio.activo,
            distancia_km=round(menor_distancia, 2)
        )

    # Si no hay municipio dentro del radio, retornar el mas cercano de todas formas
    # pero indicando la distancia
    if mejor_municipio:
        return MunicipioCercano(
            id=mejor_municipio.id,
            nombre=mejor_municipio.nombre,
            codigo=mejor_municipio.codigo,
            latitud=mejor_municipio.latitud,
            longitud=mejor_municipio.longitud,
            radio_km=mejor_municipio.radio_km,
            logo_url=mejor_municipio.logo_url,
            color_primario=mejor_municipio.color_primario,
            activo=mejor_municipio.activo,
            distancia_km=round(menor_distancia, 2)
        )

    return None


@router.get("/public/{codigo}", response_model=MunicipioDetalle)
async def obtener_municipio_por_codigo(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene un municipio por su codigo (endpoint PUBLICO).
    Usado para cargar datos del municipio desde la URL.
    """
    query = select(Municipio).where(
        Municipio.codigo == codigo,
        Municipio.activo == True
    )
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    return municipio


class DemoUser(BaseModel):
    """Usuario de prueba para acceso rápido"""
    email: str
    nombre: str
    apellido: str
    nombre_completo: str
    rol: str
    dependencia_nombre: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/public/{codigo}/demo-users", response_model=List[DemoUser])
async def obtener_usuarios_demo(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene los usuarios de prueba de un municipio (endpoint PUBLICO).
    Usado para los botones de acceso rápido en modo demo.
    """
    # Primero obtener el municipio (case-insensitive)
    from sqlalchemy import func
    query = select(Municipio).where(
        func.lower(Municipio.codigo) == func.lower(codigo),
        Municipio.activo == True
    )
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Buscar usuarios de prueba con tres patrones:
    # 1. @{codigo}.test.com (patrón original)
    # 2. @{codigo}.demo.com (patrón nuevo del seed)
    # 3. @demo.com (patrón genérico)
    # Incluir los 3 usuarios demo principales (admin, supervisor, vecino)
    from sqlalchemy import or_
    email_pattern1 = f"%@{codigo}.test.com"
    email_pattern2 = f"%@{codigo}.demo.com"
    email_pattern3 = "%@demo.com"
    query = select(User).where(
        User.municipio_id == municipio.id,
        or_(
            User.email.like(email_pattern1),
            User.email.like(email_pattern2),
            User.email.like(email_pattern3),
        ),
        User.activo == True,
        # Roles demo: admin, vecino, y supervisores (uno por dependencia).
        # El prefijo `supervisor-` matchea `supervisor-obras-publicas@...`
        # además del `supervisor@` legacy.
        or_(
            User.email.like("admin@%"),
            User.email.like("supervisor@%"),
            User.email.like("supervisor-%"),
            User.email.like("vecino@%"),
        ),
    )
    from sqlalchemy.orm import selectinload
    from models.municipio_dependencia import MunicipioDependencia
    from models.dependencia import Dependencia as DepModel
    query = query.options(
        selectinload(User.dependencia).selectinload(MunicipioDependencia.dependencia)
    )
    result = await db.execute(query)
    users = result.scalars().all()

    # Ordenar por rol: admin, supervisor, empleado, vecino
    rol_order = {
        RolUsuario.ADMIN: 0,
        RolUsuario.SUPERVISOR: 1,
        RolUsuario.EMPLEADO: 2,
        RolUsuario.VECINO: 3
    }
    users_sorted = sorted(users, key=lambda u: rol_order.get(u.rol, 99))

    return [
        DemoUser(
            email=u.email,
            nombre=u.nombre,
            apellido=u.apellido,
            nombre_completo=f"{u.nombre} {u.apellido}",
            rol=u.rol.value,
            dependencia_nombre=(
                u.dependencia.dependencia.nombre
                if u.dependencia and u.dependencia.dependencia
                else None
            ),
        )
        for u in users_sorted
    ]


class DependenciaUser(BaseModel):
    """Usuario de dependencia para acceso rápido"""
    email: str
    nombre_dependencia: str
    color: Optional[str] = None
    icono: Optional[str] = None
    reclamos_count: int = 0
    tramites_count: int = 0
    maneja_reclamos: bool = False
    maneja_tramites: bool = False

    class Config:
        from_attributes = True


@router.get("/public/{codigo}/dependencia-users", response_model=List[DependenciaUser])
async def obtener_usuarios_dependencias(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene los usuarios de dependencias de un municipio (endpoint PUBLICO).
    Usado para los botones de acceso rápido por dependencia.
    """
    from sqlalchemy import func, exists
    from models.reclamo import Reclamo
    from models.municipio_dependencia import MunicipioDependencia
    from models.dependencia import Dependencia
    from models.municipio_dependencia_categoria import MunicipioDependenciaCategoria
    from models.municipio_dependencia_tramite import MunicipioDependenciaTramite

    # Primero obtener el municipio
    query = select(Municipio).where(
        func.lower(Municipio.codigo) == func.lower(codigo),
        Municipio.activo == True
    )
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Buscar usuarios con municipio_dependencia_id asignado
    query = select(
        User.email,
        User.municipio_dependencia_id,
        Dependencia.nombre.label('nombre_dependencia'),
        Dependencia.color,
        Dependencia.icono,
    ).select_from(User).join(
        MunicipioDependencia, User.municipio_dependencia_id == MunicipioDependencia.id
    ).join(
        Dependencia, MunicipioDependencia.dependencia_id == Dependencia.id
    ).where(
        User.municipio_id == municipio.id,
        User.municipio_dependencia_id.isnot(None),
        User.activo == True
    ).order_by(
        Dependencia.nombre
    )

    result = await db.execute(query)
    rows = result.all()

    # Para cada usuario, verificar si su dependencia maneja reclamos o trámites
    dependencia_users = []
    for row in rows:
        # Verificar si maneja reclamos (tiene categorías asignadas)
        cat_query = select(func.count(MunicipioDependenciaCategoria.id)).where(
            MunicipioDependenciaCategoria.municipio_dependencia_id == row.municipio_dependencia_id
        )
        cat_result = await db.execute(cat_query)
        maneja_reclamos = cat_result.scalar() > 0

        # Verificar si maneja trámites (tiene trámites asignados)
        tram_query = select(func.count(MunicipioDependenciaTramite.id)).where(
            MunicipioDependenciaTramite.municipio_dependencia_id == row.municipio_dependencia_id
        )
        tram_result = await db.execute(tram_query)
        maneja_tramites = tram_result.scalar() > 0

        dependencia_users.append(DependenciaUser(
            email=row.email,
            nombre_dependencia=row.nombre_dependencia,
            color=row.color,
            icono=row.icono,
            reclamos_count=0,
            tramites_count=0,
            maneja_reclamos=maneja_reclamos,
            maneja_tramites=maneja_tramites,
        ))

    return dependencia_users


# ============ Endpoints PROTEGIDOS (requieren autenticacion) ============

@router.get("", response_model=List[MunicipioDetalle])
async def listar_municipios(
    skip: int = 0,
    limit: int = 100,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista municipios según permisos del usuario:
    - Super admin (sin municipio_id): ve todos
    - Admin/otros con municipio_id: ve solo su municipio
    """
    query = select(Municipio)

    # Si NO es super admin (tiene municipio_id), filtrar por su municipio
    if current_user.municipio_id:
        query = query.where(Municipio.id == current_user.municipio_id)

    if activo is not None:
        query = query.where(Municipio.activo == activo)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{municipio_id}", response_model=MunicipioDetalle)
async def obtener_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene un municipio por ID.
    """
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    return municipio


class MunicipioCreateResponse(MunicipioDetalle):
    """Respuesta al crear municipio con info del seed"""
    seed_info: Optional[dict] = None


class MunicipioDemoCreate(BaseModel):
    """Input mínimo para crear un municipio de demo desde la landing pública."""
    nombre: str


class MunicipioDemoResponse(BaseModel):
    """Respuesta del create demo — lo mínimo que el frontend necesita
    para redirigir a la landing del muni nuevo."""
    id: int
    nombre: str
    codigo: str
    redirect_path: str


def _normalizar_codigo(nombre: str) -> str:
    """Convierte 'San Pedro' → 'san-pedro', saca acentos, espacios y símbolos."""
    import unicodedata
    import re
    s = unicodedata.normalize("NFD", nombre.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


@router.post("/crear-demo", response_model=MunicipioDemoResponse)
async def crear_municipio_demo(
    data: MunicipioDemoCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Crea un municipio de demo SIN autenticación.

    Uso: la pantalla pública `/demo` (comercial) le deja a un prospecto
    tipear el nombre de su municipio y ver la plataforma funcionando al
    instante. Arma un seed completo:

      - Categorías default (10 de reclamo + 10 de trámite)
      - 5 dependencias reales con mapeos categoría→dependencia
      - 4 trámites con documentos requeridos
      - 3 usuarios demo (admin, supervisor, vecino) con password `demo123`
      - 4 reclamos de ejemplo en distintos estados
      - 1 solicitud de trámite de ejemplo

    La redirección devuelta (`redirect_path`) apunta a la landing del muni
    con los botones de quick-login ya funcionales.
    """
    from services.categorias_default import crear_categorias_default
    from services.seed_demo import seed_demo_completo

    nombre_limpio = (data.nombre or "").strip()
    if len(nombre_limpio) < 3:
        raise HTTPException(
            status_code=400,
            detail="El nombre del municipio debe tener al menos 3 caracteres",
        )

    # Normalizar código. Si ya existe, sufijar con -2, -3... hasta encontrar
    # uno libre. Así el prospecto puede tipear "Pergamino" dos veces y se
    # crean demos separados sin choque.
    base_codigo = _normalizar_codigo(nombre_limpio)
    if not base_codigo:
        raise HTTPException(status_code=400, detail="Nombre inválido")
    codigo = base_codigo
    suffix = 1
    while True:
        r = await db.execute(select(Municipio).where(Municipio.codigo == codigo))
        if not r.scalar_one_or_none():
            break
        suffix += 1
        codigo = f"{base_codigo}-{suffix}"

    # 1. Geocodificar el nombre del muni con Nominatim (OpenStreetMap).
    # Best-effort: si falla o no encuentra, usa fallback de CABA centro.
    # Esto permite que los reclamos demo y el mapa del muni caigan en
    # la ubicación real del municipio en Argentina.
    lat, lng = -34.603722, -58.381592  # default CABA
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as hc:
            r = await hc.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{nombre_limpio}, Argentina",
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "ar",
                },
                headers={"User-Agent": "Munify/1.0 (demo creator)"},
            )
            if r.status_code == 200:
                data = r.json()
                if data:
                    lat = float(data[0]["lat"])
                    lng = float(data[0]["lon"])
    except Exception:
        # Silenciamos el error — el fallback de CABA ya está asignado
        pass

    # 2. Crear fila del municipio con coords (reales o fallback)
    municipio = Municipio(
        nombre=nombre_limpio,
        codigo=codigo,
        latitud=lat,
        longitud=lng,
        radio_km=10.0,
        color_primario="#0088cc",
        color_secundario="#005fa3",
        zoom_mapa_default=13,
        activo=True,
        abm_en_sidebar=False,
    )
    db.add(municipio)
    await db.flush()

    # 2. Sembrar categorías default (10 reclamo + 10 trámite)
    await crear_categorias_default(db, municipio.id)
    await db.flush()

    # 3. Seed completo: dependencias, trámites, usuarios, reclamos, solicitud
    seed_info = await seed_demo_completo(db, municipio.id, codigo)

    await db.commit()
    await db.refresh(municipio)

    return MunicipioDemoResponse(
        id=municipio.id,
        nombre=municipio.nombre,
        codigo=municipio.codigo,
        redirect_path=f"/demo/listo?muni={municipio.codigo}",
    )


@router.post("", response_model=MunicipioCreateResponse)
async def crear_municipio(
    data: MunicipioCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Crea un nuevo municipio (solo super admin).
    Automáticamente crea:
    - 10 categorías de reclamo + 10 categorías de trámite por defecto
      (ver services/categorias_seed.py)
    - Barrios del municipio buscados con IA + Nominatim
    - Usuarios demo (admin, supervisor, vecino) si seed_municipio_completo lo permite

    Trámites concretos arrancan vacíos: el admin del municipio los carga
    desde /gestion/tramites-config (refactor 2026-04 trámites per-municipio).
    """
    from services.barrios_auto import cargar_barrios_municipio

    # Solo super admin (sin municipio_id) puede crear municipios
    if current_user.municipio_id is not None:
        raise HTTPException(status_code=403, detail="Solo el super admin puede crear municipios")

    # Verificar que no exista un municipio con el mismo codigo
    query = select(Municipio).where(Municipio.codigo == data.codigo)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe un municipio con ese codigo")

    municipio = Municipio(**data.model_dump())
    db.add(municipio)
    await db.flush()

    # 1. Sembrar categorías default (10 reclamo + 10 trámite per-municipio)
    #    El admin del municipio puede luego renombrar/agregar/eliminar libremente.
    await crear_categorias_default(db, municipio.id)
    await db.flush()

    # 2. Cargar barrios automáticamente con IA + Nominatim (best-effort)
    barrios_creados = 0
    try:
        barrios_creados = await cargar_barrios_municipio(
            db=db,
            municipio_id=municipio.id,
            nombre_municipio=municipio.nombre,
            provincia="Buenos Aires",
        )
        print(f"[MUNICIPIO] {barrios_creados} barrios creados para {municipio.nombre}")
    except Exception as e:
        print(f"[MUNICIPIO] Error cargando barrios para {municipio.nombre}: {e}")

    # 3. Seed completo: dependencias, trámites, usuarios demo, reclamos, solicitud
    from services.seed_demo import seed_demo_completo
    seed_info = await seed_demo_completo(db, municipio.id, municipio.codigo)

    await db.commit()
    await db.refresh(municipio)

    # Construir respuesta
    response_data = {
        **municipio.__dict__,
        "seed_info": {
            "categorias_reclamo": 10,
            "categorias_tramite": 10,
            "barrios": barrios_creados,
            **seed_info,
            "mensaje": "Municipio creado con seed completo. Listo para usar.",
        },
    }
    response_data.pop("_sa_instance_state", None)

    return response_data


@router.put("/{municipio_id}", response_model=MunicipioDetalle)
async def actualizar_municipio(
    municipio_id: int,
    data: MunicipioUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Actualiza un municipio (solo admin).
    """
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(municipio, key, value)

    await db.commit()
    await db.refresh(municipio)
    return municipio


@router.delete("/{municipio_id}")
async def eliminar_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Desactiva un municipio (soft delete, solo admin).
    """
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    municipio.activo = False
    await db.commit()

    return {"message": "Municipio desactivado correctamente"}


@router.delete("/demo/{codigo}")
async def eliminar_municipio_demo(
    codigo: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Elimina un municipio demo (hard delete con cascade).
    Endpoint PÚBLICO — solo borra munis que tengan usuarios @demo.com.
    No permite borrar municipios "reales" (producción).
    """
    from sqlalchemy import func as sqla_func
    query = select(Municipio).where(
        sqla_func.lower(Municipio.codigo) == sqla_func.lower(codigo)
    )
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar que es un municipio demo (tiene users @demo.com)
    demo_check = await db.execute(
        select(User).where(
            User.municipio_id == municipio.id,
            User.email.like(f"%@{codigo}.demo.com"),
        )
    )
    if not demo_check.scalars().first():
        raise HTTPException(
            status_code=403,
            detail="Solo se pueden eliminar municipios de demo",
        )

    muni_id = municipio.id
    await db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

    # Primero borrar tablas intermedias sin municipio_id via JOIN
    # (para que el loop plano de abajo no falle en borrar el padre)
    for join_sql in [
        # Historiales + tablas hijas de reclamos/solicitudes/tramites
        "DELETE hr FROM historial_reclamos hr JOIN reclamos r ON hr.reclamo_id = r.id WHERE r.municipio_id = :mid",
        "DELETE hs FROM historial_solicitudes hs JOIN solicitudes s ON hs.solicitud_id = s.id WHERE s.municipio_id = :mid",
        "DELETE td FROM tramite_documentos_requeridos td JOIN tramites t ON td.tramite_id = t.id WHERE t.municipio_id = :mid",
        "DELETE sv FROM sla_violaciones sv JOIN reclamos r ON sv.reclamo_id = r.id WHERE r.municipio_id = :mid",
        # Intermedias de empleados (via JOIN con empleados.municipio_id)
        "DELETE ec FROM empleado_cuadrillas ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = :mid",
        "DELETE ec FROM empleado_categorias ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = :mid",
        "DELETE ea FROM empleado_ausencias ea JOIN empleados e ON ea.empleado_id = e.id WHERE e.municipio_id = :mid",
        "DELETE eh FROM empleado_horarios eh JOIN empleados e ON eh.empleado_id = e.id WHERE e.municipio_id = :mid",
        "DELETE em FROM empleado_metricas em JOIN empleados e ON em.empleado_id = e.id WHERE e.municipio_id = :mid",
        "DELETE ec FROM empleado_capacitaciones ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = :mid",
        # Intermedia de cuadrillas
        "DELETE cc FROM cuadrilla_categorias cc JOIN cuadrillas c ON cc.cuadrilla_id = c.id WHERE c.municipio_id = :mid",
    ]:
        try:
            await db.execute(text(join_sql), {"mid": muni_id})
        except Exception:
            pass

    # Cascade delete de todas las tablas con municipio_id
    tables_with_muni = [
        "historial_reclamos", "reclamo_personas", "historial_solicitudes",
        "solicitudes", "reclamos", "tramite_documentos_requeridos",
        "tramites", "categorias_reclamo", "categorias_tramite",
        "municipio_dependencia_categorias", "municipio_dependencias",
        "notificaciones", "push_subscriptions", "barrios", "zonas",
        "badges_usuarios", "puntos_usuarios", "historial_puntos",
        "email_validations",
        # Nuevos (seed demo completo)
        "cuadrillas", "empleados", "sla_config",
    ]
    for t in tables_with_muni:
        try:
            await db.execute(text(f"DELETE FROM {t} WHERE municipio_id = :mid"), {"mid": muni_id})
        except Exception:
            pass

    # Usuarios
    await db.execute(text("DELETE FROM usuarios WHERE municipio_id = :mid"), {"mid": muni_id})

    # Municipio
    await db.execute(text("DELETE FROM municipios WHERE id = :mid"), {"mid": muni_id})

    await db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    await db.commit()

    return {"message": f"Municipio demo '{codigo}' eliminado correctamente"}


@router.post("/{municipio_id}/branding", response_model=MunicipioDetalle)
async def actualizar_branding(
    municipio_id: int,
    color_primario: str = Form(default=None),
    color_secundario: str = Form(default=None),
    logo: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Actualiza el branding (logo y colores) de un municipio.
    Admin y supervisor pueden modificar.
    Sube el logo a Cloudinary.
    """
    print(f"DEBUG branding: municipio_id={municipio_id}, color_primario={color_primario}, color_secundario={color_secundario}, logo={logo}")
    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar que el usuario es admin del municipio o super admin
    if current_user.municipio_id and current_user.municipio_id != municipio_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este municipio")

    # Actualizar colores (solo si se proporcionaron)
    if color_primario:
        municipio.color_primario = color_primario
    if color_secundario:
        municipio.color_secundario = color_secundario

    # Procesar logo si se subió uno
    if logo and logo.filename:
        # Validar tipo de archivo
        allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "image/gif", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon"]
        print(f"DEBUG logo content_type: {logo.content_type}, filename: {logo.filename}")
        if logo.content_type and logo.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {logo.content_type}. Tipos permitidos: {', '.join(allowed_types)}")

        # Validar tamaño (2MB max)
        content = await logo.read()
        if len(content) > 2 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo de 2MB")

        # Subir a Cloudinary
        try:
            # Eliminar logo anterior de Cloudinary si existe
            if municipio.logo_url and "cloudinary" in municipio.logo_url:
                # Extraer public_id del URL anterior
                try:
                    old_public_id = municipio.logo_url.split("/")[-1].split(".")[0]
                    old_folder = f"municipios/{municipio.codigo}"
                    cloudinary.uploader.destroy(f"{old_folder}/{old_public_id}")
                except Exception:
                    pass  # Ignorar errores al eliminar logo anterior

            # Subir nuevo logo
            await logo.seek(0)  # Resetear el puntero del archivo
            upload_result = cloudinary.uploader.upload(
                logo.file,
                folder=f"municipios/{municipio.codigo}",
                resource_type="image",
                transformation=[
                    {"width": 400, "height": 400, "crop": "limit"},
                    {"quality": "auto:good"},
                    {"fetch_format": "auto"}
                ]
            )

            # Actualizar URL del logo con la URL de Cloudinary
            municipio.logo_url = upload_result["secure_url"]

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al subir imagen: {str(e)}")

    await db.commit()
    await db.refresh(municipio)

    return municipio


class TemaConfigUpdate(BaseModel):
    """Configuración completa del tema del municipio"""
    # Nuevo sistema de presets
    presetId: Optional[str] = None
    variant: Optional[str] = None
    # Campos legacy (para compatibilidad)
    theme: Optional[str] = None  # dark, light, blue, brown, amber
    customPrimary: Optional[str] = None
    customSidebar: Optional[str] = None
    customSidebarText: Optional[str] = None
    # Imágenes de fondo
    sidebarBgImage: Optional[str] = None
    sidebarBgOpacity: Optional[float] = None
    contentBgImage: Optional[str] = None
    contentBgOpacity: Optional[float] = None
    # Opciones de portada
    portadaSinFiltro: Optional[bool] = None  # Desactiva overlay de colores en imagen de portada
    portadaOpacity: Optional[float] = None  # Opacidad de la imagen de portada (0-1)
    # Opciones de cabecera (top bar)
    cabeceraFiltroColor: Optional[str] = None  # 'grafito' o 'blanco'
    cabeceraOpacity: Optional[float] = None  # Opacidad del filtro (0-1)
    cabeceraBlur: Optional[int] = None  # Blur de la imagen (0-20)


@router.put("/{municipio_id}/tema", response_model=MunicipioDetalle)
async def actualizar_tema(
    municipio_id: int,
    tema: TemaConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Actualiza la configuración completa del tema de un municipio.
    Admin y supervisor pueden modificar.
    """
    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar que el usuario es admin del municipio o super admin
    if current_user.municipio_id and current_user.municipio_id != municipio_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este municipio")

    # Guardar configuración del tema como JSON
    municipio.tema_config = tema.model_dump(exclude_none=True)

    await db.commit()
    await db.refresh(municipio)

    return municipio


@router.post("/{municipio_id}/imagen-portada", response_model=MunicipioDetalle)
async def actualizar_imagen_portada(
    municipio_id: int,
    imagen: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Actualiza la imagen de portada (banner del dashboard) de un municipio.
    Admin y supervisor pueden modificar.
    Sube la imagen a Cloudinary.
    """
    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar que el usuario es admin del municipio o super admin
    if current_user.municipio_id and current_user.municipio_id != municipio_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este municipio")

    # Validar tipo de archivo
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if imagen.content_type and imagen.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {imagen.content_type}. Tipos permitidos: PNG, JPEG, WebP")

    # Validar tamaño (5MB max para imágenes de portada más grandes)
    content = await imagen.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo de 5MB")

    # Subir a Cloudinary
    try:
        # Eliminar imagen anterior de Cloudinary si existe
        if municipio.imagen_portada and "cloudinary" in municipio.imagen_portada:
            try:
                old_public_id = municipio.imagen_portada.split("/")[-1].split(".")[0]
                old_folder = f"municipios/{municipio.codigo}/portadas"
                cloudinary.uploader.destroy(f"{old_folder}/{old_public_id}")
            except Exception:
                pass  # Ignorar errores al eliminar imagen anterior

        # Subir nueva imagen de portada
        await imagen.seek(0)
        upload_result = cloudinary.uploader.upload(
            imagen.file,
            folder=f"municipios/{municipio.codigo}/portadas",
            resource_type="image",
            transformation=[
                {"width": 1920, "height": 600, "crop": "fill", "gravity": "center"},
                {"quality": "auto:good"},
                {"fetch_format": "auto"}
            ]
        )

        # Actualizar URL de la imagen de portada
        municipio.imagen_portada = upload_result["secure_url"]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir imagen: {str(e)}")

    await db.commit()
    await db.refresh(municipio)

    return municipio


@router.post("/{municipio_id}/sidebar-bg", response_model=dict)
async def actualizar_sidebar_bg(
    municipio_id: int,
    imagen: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Actualiza la imagen de fondo del sidebar de un municipio.
    Admin y supervisor pueden modificar.
    Sube la imagen a Cloudinary y devuelve la URL.
    """
    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar permisos
    if current_user.municipio_id and current_user.municipio_id != municipio_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este municipio")

    # Validar tipo de archivo
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if imagen.content_type and imagen.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {imagen.content_type}")

    # Validar tamaño (2MB max)
    content = await imagen.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo de 2MB")

    # Subir a Cloudinary
    try:
        await imagen.seek(0)
        upload_result = cloudinary.uploader.upload(
            imagen.file,
            folder=f"municipios/{municipio.codigo}/sidebar",
            resource_type="image",
            transformation=[
                {"width": 800, "height": 1200, "crop": "limit"},
                {"quality": "auto:good"},
                {"fetch_format": "auto"}
            ]
        )

        sidebar_bg_url = upload_result["secure_url"]

        # Actualizar tema_config con la nueva URL
        tema_config = municipio.tema_config or {}
        tema_config["sidebarBgImage"] = sidebar_bg_url
        municipio.tema_config = tema_config

        await db.commit()

        return {"sidebar_bg_url": sidebar_bg_url}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir imagen: {str(e)}")


@router.delete("/{municipio_id}/imagen-portada", response_model=MunicipioDetalle)
async def eliminar_imagen_portada(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Elimina la imagen de portada de un municipio.
    Admin y supervisor pueden modificar.
    """
    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar permisos
    if current_user.municipio_id and current_user.municipio_id != municipio_id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este municipio")

    # Eliminar de Cloudinary si existe
    if municipio.imagen_portada and "cloudinary" in municipio.imagen_portada:
        try:
            old_public_id = municipio.imagen_portada.split("/")[-1].split(".")[0]
            old_folder = f"municipios/{municipio.codigo}/portadas"
            cloudinary.uploader.destroy(f"{old_folder}/{old_public_id}")
        except Exception:
            pass

    municipio.imagen_portada = None

    await db.commit()
    await db.refresh(municipio)

    return municipio


# ============ Endpoints de Barrios ============

class BarrioSugerido(BaseModel):
    """Un barrio sugerido por la IA y validado con Nominatim"""
    nombre: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    display_name: Optional[str] = None
    validado: bool = False


class BarriosResponse(BaseModel):
    """Respuesta de búsqueda de barrios"""
    municipio: str
    provincia: str
    barrios: List[BarrioSugerido]
    centro: Optional[dict] = None


class ImportarBarriosRequest(BaseModel):
    """Request para importar barrios como zonas"""
    barrios: List[BarrioSugerido]


class BarrioGuardado(BaseModel):
    """Un barrio ya guardado en la BD"""
    id: int
    nombre: str
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    validado: bool = False

    class Config:
        from_attributes = True


@router.get("/{municipio_id}/barrios", response_model=List[BarrioGuardado])
async def obtener_barrios_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene los barrios ya guardados de un municipio.
    """
    from models.barrio import Barrio

    # Verificar que el municipio existe
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Obtener barrios
    query = select(Barrio).where(Barrio.municipio_id == municipio_id).order_by(Barrio.nombre)
    result = await db.execute(query)
    barrios = result.scalars().all()

    return barrios


@router.post("/{municipio_id}/barrios/cargar")
async def cargar_barrios_con_ia(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Carga barrios de un municipio usando IA + Nominatim.
    Guarda directamente en la tabla barrios (no zonas).
    """
    from services.barrios_auto import cargar_barrios_municipio

    # Verificar que el municipio existe
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Cargar barrios
    try:
        barrios_creados = await cargar_barrios_municipio(
            db=db,
            municipio_id=municipio_id,
            nombre_municipio=municipio.nombre,
            provincia="Buenos Aires"
        )
        await db.commit()

        return {
            "message": f"{barrios_creados} barrios cargados para {municipio.nombre}",
            "barrios_creados": barrios_creados
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cargando barrios: {str(e)}")


@router.get("/{municipio_id}/barrios/buscar", response_model=BarriosResponse)
async def buscar_barrios_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Busca barrios/localidades de un municipio usando IA + Nominatim.
    Solo admin puede usar este endpoint.

    Retorna lista de barrios sugeridos con coordenadas cuando están disponibles.
    """
    from services.barrios_service import buscar_barrios_municipio as buscar_barrios, obtener_centro_municipio

    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Buscar barrios
    barrios = await buscar_barrios(municipio.nombre, "Buenos Aires")

    # Obtener centro del municipio
    centro = await obtener_centro_municipio(municipio.nombre, "Buenos Aires")

    return BarriosResponse(
        municipio=municipio.nombre,
        provincia="Buenos Aires",
        barrios=[BarrioSugerido(**b) for b in barrios],
        centro=centro
    )


@router.post("/{municipio_id}/barrios/importar")
async def importar_barrios_como_zonas(
    municipio_id: int,
    data: ImportarBarriosRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Importa barrios seleccionados como Zonas del municipio.
    Solo admin puede usar este endpoint.
    """
    from models.zona import Zona

    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    zonas_creadas = []
    zonas_existentes = []

    for barrio in data.barrios:
        # Verificar si ya existe
        query_existe = select(Zona).where(
            Zona.nombre == barrio.nombre,
            Zona.municipio_id == municipio_id
        )
        result_existe = await db.execute(query_existe)
        if result_existe.scalar_one_or_none():
            zonas_existentes.append(barrio.nombre)
            continue

        # Generar código
        codigo = f"{municipio.codigo[:3].upper()}-{barrio.nombre[:3].upper()}"

        # Crear zona
        zona = Zona(
            municipio_id=municipio_id,
            nombre=barrio.nombre,
            codigo=codigo,
            latitud_centro=barrio.lat,
            longitud_centro=barrio.lng,
            descripcion=barrio.display_name,
            activo=True
        )
        db.add(zona)
        zonas_creadas.append(barrio.nombre)

    await db.commit()

    return {
        "message": f"Se crearon {len(zonas_creadas)} zonas",
        "zonas_creadas": zonas_creadas,
        "zonas_existentes": zonas_existentes
    }


@router.post("/{municipio_id}/direcciones/generar")
async def generar_direcciones(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Genera 6 direcciones/departamentos para un municipio usando IA.
    Asocia tipos de trámites a cada dirección automáticamente.
    Solo super admin puede usar este endpoint.
    """
    from services.direcciones_auto import cargar_direcciones_completo

    # Solo super admin
    if current_user.municipio_id is not None:
        raise HTTPException(status_code=403, detail="Solo el super admin puede generar direcciones")

    # Obtener municipio
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Generar direcciones con IA
    resultado = await cargar_direcciones_completo(
        db=db,
        municipio_id=municipio_id,
        nombre_municipio=municipio.nombre
    )

    await db.commit()

    return {
        "message": f"Se crearon {resultado['direcciones_creadas']} direcciones con {resultado['tramites_asociados']} trámites asociados",
        "direcciones_creadas": resultado["direcciones_creadas"],
        "tramites_asociados": resultado["tramites_asociados"]
    }
