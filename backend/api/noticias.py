"""Avisos al vecino — modulo Comunicacion, Etapa 1.

El canal ya existia (la tabla y las tres pantallas que la muestran); lo que
faltaba era poder cargarlo y avisar. Ver
`docs/comunicacion/01-modulo-comunicacion.md`.
"""
import os
from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from core.security import require_roles
from models.enums import RolUsuario
from models.noticia import Noticia, noticia_barrios
from models.user import User as UserModel
from models.user import User
from schemas.noticia import EnvioResponse, NoticiaCreate, NoticiaResponse, NoticiaUpdate
from services.push_service import crear_notificacion_db, send_push_to_users

router = APIRouter()

ART = ZoneInfo("America/Argentina/Buenos_Aires")

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

# Lo mismo que acepta el reclamo. 10MB es de sobra para una foto de celular
# ya comprimida, y corta el caso de alguien subiendo un PDF escaneado.
FORMATOS = {"image/jpeg", "image/png", "image/jpg", "image/webp"}
EXTENSIONES = {".jpg", ".jpeg", ".png", ".webp"}
TAMANIO_MAXIMO = 10 * 1024 * 1024

# Cuantas novedades ve el vecino de una. El feed es una tira corta, no un
# archivo historico: lo viejo se consulta entrando a la novedad.
TOPE_FEED = 10

# En plural, que es como se lee el cronograma: "todos los sabados", no "todos
# los sabado". De lunes a viernes el plural no cambia; sabado y domingo si.
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"]


def cronograma_texto(n: Noticia) -> Optional[str]:
    """Como se lee la recurrencia, en castellano. None si no se repite.

    Lo arma el backend a proposito: si cada pantalla del vecino tradujera
    "1,4" por su cuenta, en dos meses tendriamos tres textos distintos para
    el mismo cronograma.
    """
    if not n.recurrencia:
        return None
    if n.recurrencia == "semanal" and n.dias_semana:
        try:
            nombres = [DIAS[int(d)] for d in n.dias_semana.split(",") if d.strip().isdigit()]
        except (ValueError, IndexError):
            nombres = []
        if len(nombres) == 1:
            return f"Todos los {nombres[0]}"
        if len(nombres) > 1:
            return f"Todos los {', '.join(nombres[:-1])} y {nombres[-1]}"
        return "Todas las semanas"
    if n.recurrencia == "quincenal":
        return "Cada quince días"
    if n.recurrencia == "mensual":
        return "Una vez por mes"
    return None


def _con_texto(n: Noticia, barrios: Optional[List[int]] = None) -> dict:
    """La fila + el texto del cronograma y los barrios, que no son columnas."""
    d = {c.name: getattr(n, c.name) for c in n.__table__.columns}
    d["cronograma_texto"] = cronograma_texto(n)
    d["barrio_ids"] = barrios or []
    return d


async def _barrios_de(db: AsyncSession, ids: List[int]) -> dict[int, List[int]]:
    """A que barrios va cada publicacion, en UNA query para todas.

    Una query por noticia seria N+1 en la pantalla de gestion, que lista
    todas las del municipio."""
    if not ids:
        return {}
    r = await db.execute(
        select(noticia_barrios.c.noticia_id, noticia_barrios.c.barrio_id)
        .where(noticia_barrios.c.noticia_id.in_(ids))
    )
    salida: dict[int, List[int]] = {}
    for nid, bid in r.all():
        salida.setdefault(nid, []).append(bid)
    return salida


async def _fijar_barrios(db: AsyncSession, noticia_id: int, ids: List[int]) -> None:
    """Deja la publicacion apuntando EXACTAMENTE a esos barrios.

    Se borra y se reescribe en vez de calcular el diff: son dos o tres filas
    y el diff es codigo que se rompe callado."""
    await db.execute(noticia_barrios.delete().where(noticia_barrios.c.noticia_id == noticia_id))
    if ids:
        await db.execute(
            noticia_barrios.insert(),
            [{"noticia_id": noticia_id, "barrio_id": b} for b in dict.fromkeys(ids)],
        )


def _hoy():
    """Hoy en hora argentina. Nunca `date.today()` del server (corre en UTC:
    de noche adelanta un dia y un aviso vigente hasta hoy se apagaria antes)."""
    return datetime.now(ART).date()


async def _del_muni(db: AsyncSession, noticia_id: int, municipio_id: int) -> Noticia:
    """La noticia, SIEMPRE acotada al municipio del usuario.

    Antes se buscaba solo por id: un admin podia editar o borrar la novedad de
    otro municipio con solo mandar el id. Multi-tenant es regla dura del repo.
    """
    r = await db.execute(
        select(Noticia).where(Noticia.id == noticia_id, Noticia.municipio_id == municipio_id)
    )
    noticia = r.scalar_one_or_none()
    if not noticia:
        raise HTTPException(status_code=404, detail="Noticia no encontrada")
    return noticia


@router.get("/publico", response_model=List[NoticiaResponse])
async def get_noticias_publico(
    municipio_id: int,
    vecino_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """Lo que ve el vecino: lo activo, VIGENTE hoy, de SU barrio, fijado arriba.

    Vigencia: las fechas nulas no acotan (una noticia comun no vence). Con
    `fecha_hasta` cumplida el aviso desaparece solo, sin que nadie lo baje a
    mano — es la diferencia entre un aviso y un cartel viejo pegado.

    Segmentacion (Etapa 3): un aviso sin barrio es para todo el municipio y lo
    ve cualquiera. Un aviso CON barrio lo ven solo los vecinos de ese barrio;
    el vecino que no declaro barrio ve unicamente los generales. Mostrarle
    avisos de un barrio que no es el suyo es peor que no mostrarle nada: deja
    de creerle al canal.
    """
    hoy = _hoy()

    barrio_vecino = None
    if vecino_id:
        barrio_vecino = (await db.execute(
            select(UserModel.barrio_id).where(UserModel.id == vecino_id)
        )).scalar_one_or_none()

    # "General" = la publicacion no tiene NINGUN barrio en la puente.
    dirigidas = select(noticia_barrios.c.noticia_id)
    es_general = ~Noticia.id.in_(dirigidas)
    alcance = [es_general]
    if barrio_vecino:
        alcance.append(Noticia.id.in_(
            select(noticia_barrios.c.noticia_id)
            .where(noticia_barrios.c.barrio_id == barrio_vecino)
        ))

    result = await db.execute(
        select(Noticia)
        .where(
            Noticia.municipio_id == municipio_id,
            Noticia.activo == True,  # noqa: E712
            or_(Noticia.fecha_desde.is_(None), Noticia.fecha_desde <= hoy),
            or_(Noticia.fecha_hasta.is_(None), Noticia.fecha_hasta >= hoy),
            or_(*alcance),
        )
        .order_by(Noticia.fijado.desc(), Noticia.created_at.desc())
        .limit(TOPE_FEED)
    )
    filas = result.scalars().all()
    por_noticia = await _barrios_de(db, [n.id for n in filas])
    return [_con_texto(n, por_noticia.get(n.id)) for n in filas]


@router.get("", response_model=List[NoticiaResponse])
async def get_noticias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Todas las del municipio, vigentes o no: es la pantalla de gestion."""
    result = await db.execute(
        select(Noticia)
        .where(Noticia.municipio_id == current_user.municipio_id)
        .order_by(Noticia.fijado.desc(), Noticia.created_at.desc())
    )
    filas = result.scalars().all()
    por_noticia = await _barrios_de(db, [n.id for n in filas])
    return [_con_texto(n, por_noticia.get(n.id)) for n in filas]


@router.post("/imagen")
async def subir_imagen(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Sube la foto de la publicacion y devuelve su URL.

    Existe porque el campo Imagen pedia una URL, y el que carga esto es un
    empleado municipal que tiene la foto en el celular, no una URL. Con ese
    campo, en la practica se publicaba todo sin imagen.

    Reusa Cloudinary, que ya se usa para las fotos de reclamo. No guarda fila:
    la URL viaja en el formulario y se guarda con la noticia. Si el operador
    cierra el panel sin publicar, queda una imagen huerfana en Cloudinary —
    barato y preferible a exigir que la noticia exista antes de la foto.
    """
    if file.content_type not in FORMATOS:
        raise HTTPException(status_code=400, detail="Tiene que ser una imagen jpg, png o webp")
    if os.path.splitext(file.filename or "")[1].lower() not in EXTENSIONES:
        raise HTTPException(status_code=400, detail="Extension de archivo no permitida")

    contenido = await file.read()
    if len(contenido) > TAMANIO_MAXIMO:
        raise HTTPException(
            status_code=400,
            detail=f"La imagen es muy grande. Maximo {TAMANIO_MAXIMO // 1024 // 1024}MB",
        )
    await file.seek(0)

    # Carpeta POR MUNICIPIO: la cuenta de Cloudinary es compartida entre
    # tenants y sin esto todas las fotos caen en la misma bolsa.
    municipio_id = get_effective_municipio_id(request, current_user)
    try:
        subida = cloudinary.uploader.upload(
            file.file,
            folder=f"publicaciones/{municipio_id}",
            resource_type="image",
            allowed_formats=["jpg", "png", "jpeg", "webp"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo subir la imagen: {e}")

    return {"url": subida["secure_url"]}


@router.post("", response_model=NoticiaResponse)
async def create_noticia(
    data: NoticiaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Crea la novedad en el municipio DEL USUARIO (no en el que venga en el
    payload) y deja constancia de quien la publico."""
    campos = data.model_dump()
    barrios = campos.pop("barrio_ids", []) or []
    noticia = Noticia(
        **campos,
        municipio_id=current_user.municipio_id,
        creador_id=current_user.id,
    )
    db.add(noticia)
    await db.flush()
    await _fijar_barrios(db, noticia.id, barrios)
    await db.commit()
    await db.refresh(noticia)
    return _con_texto(noticia, barrios)


@router.patch("/{noticia_id}", response_model=NoticiaResponse)
async def update_noticia(
    noticia_id: int,
    data: NoticiaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    noticia = await _del_muni(db, noticia_id, current_user.municipio_id)
    campos = data.model_dump(exclude_unset=True)
    # None = el que edita no mando el campo y no se toca. Lista vacia SI es un
    # cambio: significa "pasala a todo el municipio".
    barrios = campos.pop("barrio_ids", None)
    for field, value in campos.items():
        setattr(noticia, field, value)
    if barrios is not None:
        await _fijar_barrios(db, noticia.id, barrios)
    await db.commit()
    await db.refresh(noticia)
    actuales = (await _barrios_de(db, [noticia.id])).get(noticia.id, [])
    return _con_texto(noticia, actuales)


@router.delete("/{noticia_id}")
async def delete_noticia(
    noticia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"])),
):
    noticia = await _del_muni(db, noticia_id, current_user.municipio_id)
    await db.delete(noticia)
    await db.commit()
    return {"message": "Noticia eliminada"}


@router.post("/{noticia_id}/enviar", response_model=EnvioResponse)
async def enviar_noticia(
    noticia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Avisa la novedad a los vecinos del municipio: push al celular y
    notificacion en la campana.

    IDEMPOTENTE: si ya se aviso, no se vuelve a mandar — devuelve
    `ya_enviado` con cuantos lo recibieron. Sin esto, dos clicks del operador
    son dos notificaciones para todo el municipio, y eso no se puede deshacer.
    """
    noticia = await _del_muni(db, noticia_id, current_user.municipio_id)

    if noticia.enviado_at is not None:
        return EnvioResponse(enviados=noticia.enviados_count or 0, ya_enviado=True)

    r = await db.execute(
        select(User.id).where(
            User.municipio_id == current_user.municipio_id,
            User.rol == RolUsuario.VECINO,
            User.activo == True,  # noqa: E712
        )
    )
    vecinos = [fila[0] for fila in r.all()]

    # La campana primero: queda aunque el navegador no tenga push (iOS sin la
    # PWA instalada, permisos denegados). El push es el aviso; la campana, la
    # constancia.
    for uid in vecinos:
        await crear_notificacion_db(
            db,
            usuario_id=uid,
            titulo=noticia.titulo,
            mensaje=noticia.descripcion,
            tipo="warning" if noticia.tipo == "alerta" else "info",
            accion_url="/home",
        )

    enviados = await send_push_to_users(
        db,
        user_ids=vecinos,
        title=noticia.titulo,
        body=noticia.descripcion,
        url="/home",
    )

    noticia.enviado_at = datetime.now(ART)
    noticia.enviados_count = enviados
    await db.commit()
    return EnvioResponse(enviados=enviados)
