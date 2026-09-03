"""
API de Municipios - Endpoints publicos y protegidos
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from sqlalchemy.exc import IntegrityError
from typing import Optional, List
from pydantic import BaseModel
from math import radians, cos, sin, asin, sqrt
import cloudinary
import cloudinary.uploader

from core.database import get_db
from core.security import get_current_user, require_roles, get_password_hash
from core.config import settings
from models.municipio import Municipio
from models.user import User
from models.enums import RolUsuario
from services.categorias_default import crear_categorias_default
from services.email_service import email_service, EmailTemplates
import secrets

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
    # ISO-3166 alpha-2: en que pais busca direcciones el autocomplete.
    pais: str = "AR"
    latitud: float
    longitud: float
    radio_km: float
    logo_url: Optional[str] = None
    color_primario: str
    activo: bool
    # Unica demo que se entra sin llave: la de muestra. El resto se ve en la
    # grilla pero necesita el link personal de quien la genero.
    demo_publica: bool = False
    # Flag de UI: si es True, los ABMs de categorías / tipos de trámite se
    # muestran como items del sidebar. Si es False, quedan sólo en Ajustes.
    abm_en_sidebar: bool = True
    # True = demo de venta (aparece en /demo, expone accesos rápidos).
    # False = cliente productivo (oculto de /demo, sin accesos rápidos).
    es_demo: bool = True
    # True = demo con PIN: la botonera se ve, pero el quick-login pide la
    # clave numérica (que es la password real de los usuarios demo del muni).
    demo_protegido: bool = False

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
    Lista los municipios DEMO activos (endpoint PUBLICO).
    Usado por la grilla de /demo. Los clientes productivos (es_demo=False) se
    excluyen a propósito: no deben figurar en el listado público de demos.
    """
    query = select(Municipio).where(
        Municipio.activo == activo,
        Municipio.es_demo == True,
    )
    result = await db.execute(query)
    return result.scalars().all()


class DemoStats(BaseModel):
    """El listado comercial de la pagina publica: cuantos municipios armaron
    su demo, y cuales."""
    generadas: int
    municipios: List[str]


@router.get("/public/demo-stats", response_model=DemoStats)
async def stats_demos(db: AsyncSession = Depends(get_db)):
    """Los municipios que generaron su demo alguna vez (endpoint PUBLICO).

    OJO CON EL ORDEN: va declarada ANTES de `/public/{codigo}`, si no ese
    comodin se come "demo-stats" y devuelve 404.

    Devuelve NOMBRES Y NADA MAS. Es material comercial —"mira cuantos ya la
    tienen"—, no un indice de acceso: con el nombre no se entra a ninguna, y
    el codigo, que es lo que sirve para entrar, no sale de aca.

    Tres decisiones, todas del dueño (2026-09-02):

    - Cuenta el HISTORICO, no lo que esta vivo. Las demos dadas de baja fueron
      municipios reales que armaron la suya y se borraron por comodidad
      nuestra; no contarlas seria subdeclarar algo que paso. Y sube con cada
      una nueva, aunque a esa no se le de acceso: se genero igual.

    - Solo lo que existe en el CATALOGO OFICIAL. Ahi se caen las pruebas
      (`demo2`, `fgfdg`, `lucas`, `San Kika`, `QA Turnero Test 2`...) sin
      mantener una lista negra a mano: si no es un municipio de verdad, no
      entra. Se compara tambien contra el nombre antes de la coma, porque hay
      demos que arrastran el departamento ("Asuncion, Dpto. Central") y son
      municipios reales igual.

    - Sin la de muestra: esa es nuestra, no un municipio que se acerco solo.
      Contarla infla el numero, y ademas vive en su propio boton.

    El numero que sale de aca es REAL: no hay piso decorativo. Se evaluo poner
    uno de 40 a mano y no hizo falta, el dato ya lo supera.
    """
    # COLLATE explicito: `municipios` es utf8mb4_general_ci y
    # `municipios_catalogo` es utf8mb4_unicode_ci. Sin esto MySQL corta con
    # "Illegal mix of collations" y el endpoint entero devuelve 500.
    filas = (await db.execute(text("""
        SELECT DISTINCT m.nombre
        FROM municipios m
        JOIN municipios_catalogo c
          ON (c.nombre = m.nombre COLLATE utf8mb4_unicode_ci
              OR c.nombre = SUBSTRING_INDEX(m.nombre, ',', 1) COLLATE utf8mb4_unicode_ci)
         AND c.pais = m.pais COLLATE utf8mb4_unicode_ci
        WHERE m.es_demo = 1
          AND COALESCE(m.demo_publica, 0) = 0
        ORDER BY m.nombre
    """))).fetchall()
    nombres = [f[0] for f in filas]
    return DemoStats(generadas=len(nombres), municipios=nombres)


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
    t: Optional[str] = None,
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

    # La botonera sale para TODA demo, con o sin llave. Cliente productivo:
    # nunca (salvo el clon de tenant en QA, que ademas gatea cada perfil con
    # el PIN). Ver `_botonera_visible` por que la llave `t` ya no cuenta aca.
    if not _botonera_visible(municipio):
        return []

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
        # Roles demo: admin, vecino, supervisores (uno por dependencia) y
        # empleados de campo (uno por área operativa). El prefijo `supervisor-`
        # matchea `supervisor-obras-publicas@...` además del `supervisor@`
        # legacy; `empleado-` matchea `empleado-bacheo@...`.
        or_(
            User.email.like("admin@%"),
            User.email.like("supervisor@%"),
            User.email.like("supervisor-%"),
            User.email.like("empleado-%"),
            User.email.like("vecino@%"),
            # Munis con varios vecinos demo (ej. asuncion: vecino-liz@, vecino-rodrigo@).
            User.email.like("vecino-%"),
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
    t: Optional[str] = None,
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

    # Misma puerta que demo-users: los accesos rapidos por dependencia son
    # otra forma de entrar, asi que siguen la misma regla.
    if not _botonera_visible(municipio):
        return []

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
        # Contar reclamos asignados a la dep (via categorías)
        cat_query = select(func.count(MunicipioDependenciaCategoria.id)).where(
            MunicipioDependenciaCategoria.municipio_dependencia_id == row.municipio_dependencia_id
        )
        reclamos_count = (await db.execute(cat_query)).scalar() or 0

        # Contar trámites asignados a la dep
        tram_query = select(func.count(MunicipioDependenciaTramite.id)).where(
            MunicipioDependenciaTramite.municipio_dependencia_id == row.municipio_dependencia_id
        )
        tramites_count = (await db.execute(tram_query)).scalar() or 0

        dependencia_users.append(DependenciaUser(
            email=row.email,
            nombre_dependencia=row.nombre_dependencia,
            color=row.color,
            icono=row.icono,
            reclamos_count=reclamos_count,
            tramites_count=tramites_count,
            maneja_reclamos=reclamos_count > 0,
            maneja_tramites=tramites_count > 0,
        ))

    return dependencia_users


# ============ Endpoints PROTEGIDOS (requieren autenticacion) ============

# Paises con catalogo de municipios cargado. Se llenan por batch
# (`scripts/cargar_catalogo_latam.py`), nunca en vivo: el alta de una demo no
# puede depender de un servicio externo. Agregar uno es cargar su nivel con
# intendente/alcalde y sumar su bandera en `components/ui/BanderaPais.tsx`.
PAISES_CATALOGO = {"AR", "PY", "CL", "UY", "PE", "BO"}


@router.get("/catalogo")
async def buscar_municipios_catalogo(
    q: str = "",
    pais: str = "AR",
    provincia: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Autocomplete PÚBLICO del catálogo oficial de municipios.

    Sólo se puede crear una demo con un municipio REAL elegido de esta lista.
    Fuentes: Argentina, dataset georef de datos.gob.ar (2.082); Paraguay,
    registro del INE + las intendencias creadas después del censo 2012 (263);
    Chile, Uruguay, Perú y Bolivia, GeoNames (CC-BY) al nivel donde hay
    intendente o alcalde —comuna, departamento, distrito y municipio
    respectivamente—, que no es el mismo en los cuatro.

    Busca por nombre Y por ALIAS: un municipio se conoce por más de un nombre
    —el oficial de la ley y el que usa la gente— y quien crea la demo escribe
    el que conoce ("Campo 9", no "Doctor J. Eulogio Estigarribia").

    La provincia/departamento desambigua homónimos: hay 6 'San Martín' en
    Argentina y dos 'Asunción' en Paraguay.
    """
    q = (q or "").strip()
    pais = (pais or "AR").upper()
    if pais not in PAISES_CATALOGO:
        raise HTTPException(status_code=400, detail=f"País no soportado: {pais}")
    if len(q) < 2:
        return []
    # `provincia` es opcional: la pantalla de demos deja elegir provincia
    # primero para desambiguar homonimos (6 'San Martin' en Argentina).
    params = {"pais": pais, "patt": f"%{q}%", "prefijo": f"{q}%"}
    filtro_prov = ""
    if (provincia or "").strip():
        filtro_prov = " AND provincia = :provincia"
        params["provincia"] = provincia.strip()
    rows = (await db.execute(text(f"""
        SELECT id, nombre, provincia, lat, lng, pais, alias
        FROM municipios_catalogo
        WHERE pais = :pais AND (nombre LIKE :patt OR alias LIKE :patt){filtro_prov}
        ORDER BY (nombre LIKE :prefijo) DESC, CHAR_LENGTH(nombre), nombre
        LIMIT 10
    """), params)).fetchall()
    return [
        {"id": r[0], "nombre": r[1], "provincia": r[2],
         "lat": float(r[3]), "lng": float(r[4]), "pais": r[5],
         "alias": [a for a in (r[6] or "").split("|") if a]}
        for r in rows
    ]


@router.get("/catalogo/provincias")
async def provincias_catalogo(
    pais: str = "AR",
    db: AsyncSession = Depends(get_db),
):
    """Provincias/departamentos de un pais, con cuantos municipios tiene cada una.

    Alimenta el combo de la pantalla publica de demos (sitio comercial): el
    prospecto elige su provincia y el autocomplete de municipio filtra por ahi.
    El conteo NO es decorativo — es lo que dibuja la barra de cada provincia,
    asi que sale de la tabla, nunca hardcodeado.

    El nombre del nivel cambia por pais (provincia en AR/PY, region en CL,
    departamento en UY/BO, departamento en PE); la clave se llama `provincia`
    en todos porque es la columna del catalogo.
    """
    pais = (pais or "AR").upper()
    if pais not in PAISES_CATALOGO:
        raise HTTPException(status_code=400, detail=f"Pais no soportado: {pais}")
    rows = (await db.execute(text("""
        SELECT provincia, COUNT(*) AS total
        FROM municipios_catalogo
        WHERE pais = :pais AND provincia IS NOT NULL AND provincia <> ''
        GROUP BY provincia
        ORDER BY total DESC, provincia
    """), {"pais": pais})).fetchall()
    return [{"provincia": r[0], "total": int(r[1])} for r in rows]


@router.get("/argentina")
async def buscar_municipios_argentina(
    q: str = "",
    db: AsyncSession = Depends(get_db),
):
    """DEPRECADO: quedó del catálogo mono-país. Usar `/catalogo?pais=AR`."""
    return await buscar_municipios_catalogo(q=q, pais="AR", db=db)


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
    """Input mínimo para crear un municipio de demo desde la landing pública.

    lat/lng/provincia vienen del autocomplete oficial (tabla
    municipios_argentina, dataset georef). Si vienen, se usan directo y se
    saltea el geocoding por Nominatim (más rápido y sin ambigüedad de
    homónimos: hay 6 "San Martín" en el país)."""
    nombre: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    provincia: Optional[str] = None
    # País del catálogo (ISO-3166 alpha-2). Decide dónde se busca el POLÍGONO
    # oficial del municipio en `municipios_catalogo` y, con él, los barrios y
    # calles reales de la ciudad (ver services/geo_ciudad.py). Sin esto, una
    # demo de Encarnación buscaba su contorno entre los municipios argentinos.
    pais: Optional[str] = "AR"
    # PIN numérico opcional (4-8 dígitos). Si viene, la demo nace PROTEGIDA:
    # los usuarios demo se crean con el PIN como password (en vez de demo123)
    # y el frontend pide la clave al tocar un perfil de la botonera.
    demo_pin: Optional[str] = None


class MunicipioDemoResponse(BaseModel):
    """Respuesta del create demo — lo mínimo que el frontend necesita
    para redirigir a la landing del muni nuevo."""
    id: int
    nombre: str
    codigo: str
    redirect_path: str
    # LA LLAVE, y esta es la UNICA vez que sale del backend: la grilla publica
    # no la devuelve nunca. El frontend la guarda en el localStorage del que
    # creo la demo y arma con ella el link para compartir. Si se pierde, se
    # pierde: no hay recupero por UI (a proposito).
    demo_token: Optional[str] = None


def _botonera_visible(municipio: Municipio) -> bool:
    """Si el login de este municipio muestra los perfiles preseteados.

    Toda DEMO los muestra, tenga o no la llave el que entra: las demos son
    paginas de prueba y cualquiera con el link `/demo/<codigo>` tiene que
    poder entrar — ningun municipal va a tener anotadas las catorce claves
    en un archivo. Lo "no publico" es otra cosa: la grilla de la landing no
    da entrada, y las demos con PIN siguen pidiendo el PIN por perfil.
    (Dueño, 2026-09-02: "que no sea publico" se habia leido como "gatear la
    botonera con la llave" — no era eso.)

    Cliente productivo: nunca, salvo el clon de tenant en QA
    (`demo_protegido`), que ademas gatea cada perfil con el PIN.
    """
    return bool(municipio.es_demo or municipio.demo_protegido)


def _demo_acceso_ok(municipio: Municipio, token: Optional[str]) -> bool:
    """Si el que golpea la puerta es el DUEÑO de esta demo (borrarla, etc.).

    Tres casos, en orden:
      - No es demo: es un cliente productivo. Solo pasa el clon de tenant en
        QA (`demo_protegido`), que ademas tiene su quick-login gateado por PIN.
      - Demo DE MUESTRA (`demo_publica`): entra cualquiera, es la vitrina.
      - Demo de alguien: solo con la llave que se emitio al crearla.

    Las demos viejas (sin `demo_token`) quedan cerradas a proposito: nadie
    borra una demo con los datos que cargo otro (dueño, 2026-09-02). Para
    VER la botonera de perfiles la llave no hace falta: `_botonera_visible`.
    """
    if not municipio.es_demo:
        return bool(municipio.demo_protegido)
    if municipio.demo_publica:
        return True
    guardada = municipio.demo_token or ""
    entregada = (token or "").strip()
    if not guardada or not entregada:
        return False
    # compare_digest y no ==: comparar llaves con corte temprano filtra, de a
    # un caracter y por tiempo de respuesta, cual era el prefijo correcto.
    return secrets.compare_digest(entregada, guardada)


def _normalizar_codigo(nombre: str) -> str:
    """Convierte 'San Pedro' → 'san-pedro', saca acentos, espacios y símbolos."""
    import unicodedata
    import re
    s = unicodedata.normalize("NFD", nombre.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


class LiberarDniDemoRequest(BaseModel):
    dni: str


@router.post("/demo/liberar-dni")
async def liberar_dni_demo(
    body: LiberarDniDemoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN])),
):
    """
    Libera un DNI para volver a registrarse en las demos.

    Herramienta del demostrador: cada registro real (QR + foto del DNI) deja
    un vecino verificado con ese DNI, y la próxima demo lo rechaza como "ya
    registrado". Esto ANONIMIZA esos vecinos (dni y email a placeholder,
    verificación a cero) SOLO en municipios demo — el mismo DNI como cliente
    real de un municipio productivo (San Pedro Norte) jamás se toca. No borra
    usuarios: sus reclamos/historial de demo siguen colgando del registro
    anónimo, así no se rompe ninguna FK.
    """
    dni_limpio = "".join(c for c in body.dni if c.isdigit())
    if len(dni_limpio) < 6:
        raise HTTPException(status_code=400, detail="DNI inválido")

    # Solo se opera DESDE un municipio demo.
    mq = await db.execute(
        select(Municipio).where(Municipio.id == current_user.municipio_id)
    )
    muni_actual = mq.scalar_one_or_none()
    if not (muni_actual and muni_actual.es_demo):
        raise HTTPException(
            status_code=403,
            detail="Esta herramienta sólo está disponible en municipios demo.",
        )

    # Vecinos con ese DNI en CUALQUIER municipio demo. El join con es_demo
    # es el guardarraíl: un tenant productivo nunca entra en el resultado.
    q = await db.execute(
        select(User, Municipio.nombre)
        .join(Municipio, User.municipio_id == Municipio.id)
        .where(
            User.dni == dni_limpio,
            Municipio.es_demo == True,  # noqa: E712 — comparación SQL
            User.rol == RolUsuario.VECINO,
        )
    )
    filas = q.all()

    municipios_afectados: list[str] = []
    for usuario, muni_nombre in filas:
        usuario.dni = None
        usuario.email = f"liberado+{usuario.id}@demo.local"
        usuario.cuenta_verificada = False
        usuario.nivel_verificacion = 0
        usuario.didit_session_id = None
        municipios_afectados.append(muni_nombre)

    await db.commit()
    return {
        "liberados": len(municipios_afectados),
        "municipios": sorted(set(municipios_afectados)),
        "dni": dni_limpio,
    }


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
    from services.seed_log import SeedLog

    def _counts(d) -> dict:
        """Counts de un sub-seed, sin las claves reservadas del log.

        `hito(nombre, motivo, estado, **detalle)`: si un sub-seed devolviera un
        count llamado `estado`, pisaria el estado del paso y el log mentiria.
        """
        return {k: v for k, v in (d or {}).items()
                if k not in ("estado", "motivo", "nombre")}

    nombre_limpio = (data.nombre or "").strip()
    if len(nombre_limpio) < 3:
        raise HTTPException(
            status_code=400,
            detail="El nombre del municipio debe tener al menos 3 caracteres",
        )

    # PIN opcional de demo protegida (ver MunicipioDemoCreate.demo_pin).
    import re as _re
    demo_pin = (data.demo_pin or "").strip() or None
    if demo_pin and not _re.fullmatch(r"\d{4,8}", demo_pin):
        raise HTTPException(
            status_code=400,
            detail="El PIN debe ser numérico, de 4 a 8 dígitos",
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
        libre_muni = r.scalar_one_or_none() is None
        # No alcanza con que el CODIGO este libre: los usuarios del seed se
        # llaman `<rol>@<codigo>.demo.com` y su email es unico en toda la base.
        # Si quedaron usuarios de una demo anterior (un borrado a medias, un
        # alta que reventó despues de crearlos), el codigo figura libre y el
        # alta muere con "Duplicate entry ... ix_usuarios_email" — pasó en qa
        # con la segunda demo de Moreno, delante del prospecto.
        r2 = await db.execute(
            select(User.id).where(User.email.like(f"%@{codigo}.demo.com")).limit(1)
        )
        libre_mail = r2.scalar_one_or_none() is None
        if libre_muni and libre_mail:
            break
        suffix += 1
        codigo = f"{base_codigo}-{suffix}"

    # BITACORA DE LA CREACION. Se abre ACA, antes de tocar la base, porque el
    # caso que hay que poder mirar es justamente el alta que se rompe a mitad:
    # el log se escribe en su propia sesion (ver services/seed_log.py) y queda
    # aunque la transaccion del alta se revierta.
    log = SeedLog(nombre_limpio, codigo=codigo, pais=(data.pais or "AR"),
                  provincia=data.provincia, origen="endpoint")

    # 1. Coordenadas del municipio. Si el autocomplete oficial ya las trajo
    # (tabla municipios_argentina), se usan directo. Si no, fallback al
    # geocoding por Nominatim (best-effort, default CABA).
    lat, lng = -34.603722, -58.381592  # default CABA
    if data.lat is not None and data.lng is not None:
        lat, lng = data.lat, data.lng
    else:
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
                    geo = r.json()
                    if geo:
                        lat = float(geo[0]["lat"])
                        lng = float(geo[0]["lon"])
        except Exception:
            # Silenciamos el error — el fallback de CABA ya está asignado
            pass

    # ============================================================
    # ALTA + SEMILLA, con reintento si el nombre quedo ocupado
    #
    # Entre el chequeo de disponibilidad y el INSERT pasan ~20 segundos de
    # semilla. En el medio otro vendedor puede estar creando la misma ciudad,
    # o puede quedar algun rastro que choque. Si eso pasa, el que lo paga es
    # el que esta hablando por telefono con el intendente: ve "no pudimos
    # crear la demo" y se queda sin nada que mostrar.
    #
    # Por eso una colision de unicidad NO se propaga: se reintenta con el
    # sufijo siguiente (moreno-2, moreno-3) y el vendedor no se entera.
    # Cualquier otro error si se propaga — si la base esta caida o el seed
    # tiene un bug, reintentar es esconder el problema y hacer esperar tres
    # veces de gusto.
    # ============================================================
    async def _alta(codigo_actual: str):
        # 2. Crear fila del municipio con coords (reales o fallback)
        municipio = Municipio(
            nombre=nombre_limpio,
            codigo=codigo_actual,
            pais=(data.pais or "AR").upper(),
            latitud=lat,
            longitud=lng,
            radio_km=10.0,
            color_primario="#0088cc",
            color_secundario="#005fa3",
            zoom_mapa_default=13,
            activo=True,
            abm_en_sidebar=False,
            demo_protegido=bool(demo_pin),
            # La llave de acceso, que viaja una sola vez en la respuesta del
            # alta. 24 bytes url-safe (32 caracteres): entra comodo en un link
            # de WhatsApp y no se adivina. Una demo generada por un visitante
            # NUNCA nace publica: la de muestra se marca a mano.
            demo_token=secrets.token_urlsafe(24),
            demo_publica=False,
            # Las demos NUEVAS abren en MARINO, el azul oscuro de la marca
            # (decisión del dueño, 2026-08-30): el vendedor las muestra en
            # pantalla compartida justo después de la página comercial, que
            # también es azul oscuro — el salto de identidad se notaba. El
            # claro queda a un click (la luna) y cae en Hielo, el claro frío
            # de la misma familia. El usuario que elige otro tema pisa esto
            # (prioridad: localStorage > tema_config > default global). Las
            # demos existentes no se tocan.
            tema_config={"presetId": "marino"},
        )
        db.add(municipio)
        await db.flush()

        # 2. Sembrar categorías default (10 reclamo + 10 trámite)
        await crear_categorias_default(db, municipio.id)
        await db.flush()

        # 3. Seed completo: dependencias, trámites, usuarios, reclamos, solicitud.
        # Es LA semilla única y coherente — categorías, trámites y reclamos ya
        # nacen mapeados a su dependencia correcta (ver seed_demo.py). Ya no se
        # corre un seed extra de 10+10 al azar (scripts/seed_10_demos.py): rompía
        # la coherencia dependencia↔categoría con asignaciones random.
        #
        # Va envuelto para que el log quede grabado TAMBIÉN si revienta acá: es el
        # caso que hay que poder mirar desde la consola del super admin.
        # El id se captura ANTES del try: si la semilla revienta, la sesión queda
        # con rollback pendiente y `municipio.id` ya no se puede leer
        # (PendingRollbackError) — la bitácora del alta fallido se perdía justo en
        # el caso que tenía que cubrir (visto con San Salvador de Jujuy).
        muni_id = municipio.id
        try:
            seed_info = await seed_demo_completo(db, municipio.id, codigo_actual,
                                                 password=demo_pin or "demo123",
                                                 log=log)
            await db.commit()
        except Exception:
            await db.rollback()
            # La fila del municipio puede sobrevivir al rollback (se escribio antes
            # del punto que fallo). Sin esto queda una cascara: municipio sin un
            # solo usuario, imposible de usar, y encima ocupando el nombre para el
            # proximo intento. Se limpia en su propia operacion, best-effort.
            try:
                await db.execute(delete(Municipio).where(
                    Municipio.id == muni_id, Municipio.codigo == codigo_actual))
                await db.commit()
            except Exception:
                await db.rollback()
            # El helper limpia y propaga; QUIEN decide que hacer con el error
            # es el bucle de afuera. Si guardara la bitacora aca, un reintento
            # que despues sale bien dejaria un "fallo" escrito igual — y peor,
            # reusaria en la vuelta siguiente un log ya cerrado.
            raise
        return municipio, muni_id, seed_info

    intentos = 0
    while True:
        try:
            municipio, muni_id, seed_info = await _alta(codigo)
            break
        except IntegrityError:
            intentos += 1
            if intentos >= 3:
                log.hito("colision", estado="fallo",
                         motivo="tres nombres seguidos ocupados")
                await log.guardar(municipio_id=None)
                raise HTTPException(
                    status_code=409,
                    detail="No pudimos reservar un nombre para la demo. Probá de nuevo.",
                )
            suffix += 1
            codigo = f"{base_codigo}-{suffix}"
            log.hito("colision", estado="degradado",
                     motivo=f"nombre ocupado, reintento como {codigo}")
        except Exception as e:
            # Base caida, seed roto, timeout: esto NO se reintenta — seria
            # esconder el problema y hacer esperar tres veces de gusto.
            log.error(e)
            await log.guardar(municipio_id=None)
            raise

    # 4. Turnero (best-effort): agenda, horarios y turnos de ejemplo sobre
    # los trámites ya creados en el paso 3.
    try:
        from services.seed_demo import seed_turnero_demo
        turnero_counts = await seed_turnero_demo(db, municipio.id, log=log)
        print(f"[CREAR DEMO] Turnero seed: {turnero_counts}")
        await db.commit()
        log.hito("turnero", **_counts(turnero_counts))
    except Exception as e:
        print(f"[CREAR DEMO] Seed de turnero fallo (best-effort): {e}")
        await db.rollback()
        log.hito("turnero", estado="fallo", motivo=f"{type(e).__name__}: {str(e)[:300]}")

    # 5. Tasas: NO se siembran (dueño, 2026-08-29). Munify no cubre el cobro de
    # tasas hoy, y la demo mostraba al vecino boletas vencidas de un circuito
    # que el producto no ofrece. El módulo ademas paso a OPT-IN
    # (lib/enums/modulos.ts): sin fila explicita ya no aparece en ningun lado.
    # El seeder sigue existiendo (scripts/seed_tasas_completo.py) para cuando
    # se retome: se vuelve a enganchar aca.

    # 6. Seed Tesoreria (best-effort): activa el modulo + carga catalogos
    # (15 tipos concepto, 300 conceptos, 10 tipos empleado), 5 cajas/fondos
    # (Tesoro+Copa+FOFINDE+FODEMEP+FOMEP), 5 parajes con poligonos demo,
    # ~20 contactos, ~50 gastos historicos, 3 proyectos, 2 pagos programados.
    try:
        from services.seed_demo_tesoreria import seed_tesoreria_demo
        # Buscar el admin del muni recien creado
        from sqlalchemy import select as _sel
        admin_user = (await db.execute(
            _sel(User).where(User.municipio_id == municipio.id, User.rol == RolUsuario.ADMIN).limit(1)
        )).scalar_one_or_none()
        if admin_user:
            t_counts = await seed_tesoreria_demo(db, municipio.id, admin_user.id)
            print(f"[CREAR DEMO] Tesoreria seed: {t_counts}")
            await db.commit()
            log.hito("tesoreria", **_counts(t_counts))
        else:
            log.hito("tesoreria", estado="degradado",
                     motivo="no se encontro el admin del muni recien creado")
    except Exception as e:
        print(f"[CREAR DEMO] Seed de Tesoreria fallo (best-effort): {e}")
        await db.rollback()
        log.hito("tesoreria", estado="fallo",
                 motivo=f"{type(e).__name__}: {str(e)[:300]}")

    await log.guardar(municipio_id=municipio.id)
    await db.refresh(municipio)

    return MunicipioDemoResponse(
        id=municipio.id,
        nombre=municipio.nombre,
        codigo=municipio.codigo,
        redirect_path=f"/demo/listo?muni={municipio.codigo}",
        demo_token=municipio.demo_token,
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
    pin: Optional[str] = None,
    t: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Elimina un municipio demo (hard delete con cascade).
    Endpoint PÚBLICO — solo borra munis que tengan usuarios @demo.com.
    No permite borrar municipios "reales" (producción).
    Si la demo está protegida por PIN, exige `?pin=` y lo valida contra la
    password del admin demo (que ES el PIN — ver crear-demo).
    """
    from sqlalchemy import func as sqla_func
    query = select(Municipio).where(
        sqla_func.lower(Municipio.codigo) == sqla_func.lower(codigo)
    )
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Verificar que es un municipio demo: rechazar solo si hay usuarios "reales"
    # (cualquiera que NO matchee los patrones de demo). Un muni sin usuarios o
    # con solo users demo se considera borrable. El patrón vive con el cascade.
    from sqlalchemy import or_, not_
    from services.demo_borrado import MUNICIPIOS_INTOCABLES, PATRONES_EMAIL_DEMO
    non_demo_check = await db.execute(
        select(User).where(
            User.municipio_id == municipio.id,
            not_(or_(*[User.email.like(p) for p in PATRONES_EMAIL_DEMO])),
        )
    )
    if municipio.id in MUNICIPIOS_INTOCABLES or non_demo_check.scalars().first():
        raise HTTPException(
            status_code=403,
            detail="Solo se pueden eliminar municipios de demo",
        )

    # LA DE MUESTRA NO SE BORRA desde la UI publica: es la que se abre en las
    # llamadas comerciales y la que toca el visitante que llega de la landing.
    # Se apaga por base (demo_publica = 0), no con un boton que ve cualquiera.
    if municipio.demo_publica:
        raise HTTPException(
            status_code=403,
            detail="El municipio de muestra no se elimina desde acá",
        )

    # Borra el DUEÑO de la demo, que es el que tiene la llave. Hasta hoy este
    # endpoint era publico y sin credencial: un DELETE de una linea se llevaba
    # puesta cualquier demo, con hard delete y cascade (dueño, 2026-09-02).
    # Las demos viejas, que no tienen llave, quedan imborrables desde la UI: es
    # el default seguro — se limpian por script, no por un boton anonimo.
    if not _demo_acceso_ok(municipio, t):
        raise HTTPException(
            status_code=403,
            detail="Para eliminar esta demo hace falta el link de acceso de quien la generó",
        )

    # Demo protegida: ademas del link, el PIN. Se valida contra el hash del
    # admin demo porque el PIN es su password (no se guarda aparte).
    if municipio.demo_protegido:
        from core.security import verify_password
        admin_q = await db.execute(
            select(User).where(
                User.municipio_id == municipio.id,
                User.email.like("admin@%"),
                User.activo == True,  # noqa: E712
            )
        )
        admin_demo = admin_q.scalars().first()
        if not pin or not admin_demo or not verify_password(pin, admin_demo.password_hash):
            raise HTTPException(
                status_code=403,
                detail="Esta demo está protegida: hace falta el PIN para eliminarla",
            )

    # El cascade lo deriva `services/demo_borrado.py` del esquema real (antes
    # era una lista fija a la que le faltaban 32 tablas y tragaba errores).
    from services.demo_borrado import borrar_municipio
    try:
        borrado = await borrar_municipio(db, municipio.id)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "message": f"Municipio demo '{codigo}' eliminado correctamente",
        "filas_borradas": borrado,
    }


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


class EnviarBienvenidaResponse(BaseModel):
    email_destino: str
    enviado: bool


@router.post("/{municipio_id}/enviar-bienvenida", response_model=EnviarBienvenidaResponse)
async def enviar_bienvenida(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Regenera la contraseña del admin real (no demo) de un municipio y le envía
    el correo de bienvenida con sus credenciales de acceso (URL /<codigo>,
    usuario y contraseña). Solo super admin.

    Se regenera la contraseña porque el sistema guarda únicamente el hash: es la
    forma de garantizar que la clave del correo es válida.
    """
    # Solo super admin (sin municipio asignado)
    if current_user.municipio_id is not None:
        raise HTTPException(status_code=403, detail="Solo el super admin puede enviar credenciales")

    municipio = (await db.execute(
        select(Municipio).where(Municipio.id == municipio_id)
    )).scalar_one_or_none()
    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Admin real (no demo) y activo del municipio, el más reciente
    admin = (await db.execute(
        select(User).where(
            User.municipio_id == municipio_id,
            User.rol == RolUsuario.ADMIN,
            User.activo == True,
            ~User.email.like("%.demo.com"),
        ).order_by(User.id.desc()).limit(1)
    )).scalar_one_or_none()
    if not admin:
        raise HTTPException(
            status_code=400,
            detail="El municipio no tiene un administrador real (no demo) activo",
        )

    # Contraseña nueva, legible y segura (sin caracteres ambiguos 0/O/1/l/I)
    alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    password = "".join(secrets.choice(alfabeto) for _ in range(12))
    admin.password_hash = get_password_hash(password)
    await db.commit()

    url = f"https://app.munify.com.ar/{municipio.codigo}"
    html = EmailTemplates.bienvenida_municipio(
        nombre=admin.nombre or municipio.nombre,
        municipio=municipio.nombre,
        url=url,
        email_login=admin.email,
        password=password,
    )
    enviado = await email_service.send_email(
        to_email=admin.email,
        subject=f"Bienvenido a Munify - Acceso de {municipio.nombre}",
        body_html=html,
    )
    return EnviarBienvenidaResponse(email_destino=admin.email, enviado=enviado)


# =====================================================================
# Resumen operativo por municipio (pantalla Suscripciones del superadmin)
# =====================================================================

@router.get("/admin/resumen")
async def resumen_municipios_admin(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN])),
):
    """Resumen REAL por municipio para la vista comercial del superadmin.

    Reemplaza los datos demo hardcodeados que tenia la pantalla Suscripciones:
    devuelve solo lo que existe de verdad (no hay billing todavia): tipo
    productivo/demo, usuarios activos, volumen de reclamos, ultima actividad
    y modulos configurados. Todo en queries batch (sin N+1).
    """
    if current_user.municipio_id is not None:
        raise HTTPException(status_code=403, detail="Solo el super admin")

    from sqlalchemy import func as sa_func
    from models import Reclamo, MunicipioModulo

    munis = (await db.execute(select(Municipio))).scalars().all()

    # Usuarios activos por muni
    usuarios = dict((await db.execute(
        select(User.municipio_id, sa_func.count(User.id))
        .where(User.activo == True, User.municipio_id.isnot(None))  # noqa: E712
        .group_by(User.municipio_id)
    )).all())

    # Reclamos: total y ultima actividad por muni
    reclamos = {
        mid: (total, ultimo)
        for mid, total, ultimo in (await db.execute(
            select(
                Reclamo.municipio_id,
                sa_func.count(Reclamo.id),
                sa_func.max(Reclamo.created_at),
            ).group_by(Reclamo.municipio_id)
        )).all()
    }

    # Filas de modulos por muni (el front deriva el estado efectivo con su SSoT)
    modulos: dict = {}
    for mid, modulo, activo in (await db.execute(
        select(MunicipioModulo.municipio_id, MunicipioModulo.modulo, MunicipioModulo.activo)
    )).all():
        modulos.setdefault(mid, []).append({"modulo": modulo, "activo": bool(activo)})

    return [
        {
            "id": m.id,
            "nombre": m.nombre,
            "codigo": m.codigo,
            "activo": bool(m.activo),
            "es_demo": bool(m.es_demo) if m.es_demo is not None else True,
            "alta": m.created_at.isoformat() if m.created_at else None,
            "usuarios_activos": int(usuarios.get(m.id, 0)),
            "reclamos_total": int(reclamos.get(m.id, (0, None))[0]),
            "ultima_actividad": (
                reclamos[m.id][1].isoformat()
                if m.id in reclamos and reclamos[m.id][1] else None
            ),
            "modulos": modulos.get(m.id, []),
        }
        for m in munis
    ]
