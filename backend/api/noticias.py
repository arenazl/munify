"""Avisos al vecino — modulo Comunicacion, Etapa 1.

El canal ya existia (la tabla y las tres pantallas que la muestran); lo que
faltaba era poder cargarlo y avisar. Ver
`docs/comunicacion/01-modulo-comunicacion.md`.
"""
from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import require_roles
from models.enums import RolUsuario
from models.noticia import Noticia
from models.user import User as UserModel
from models.user import User
from schemas.noticia import EnvioResponse, NoticiaCreate, NoticiaResponse, NoticiaUpdate
from services.push_service import crear_notificacion_db, send_push_to_users

router = APIRouter()

ART = ZoneInfo("America/Argentina/Buenos_Aires")

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


def _con_texto(n: Noticia) -> dict:
    """La fila + el texto del cronograma, que no es una columna."""
    d = {c.name: getattr(n, c.name) for c in n.__table__.columns}
    d["cronograma_texto"] = cronograma_texto(n)
    return d


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

    alcance = [Noticia.barrio_id.is_(None)]
    if barrio_vecino:
        alcance.append(Noticia.barrio_id == barrio_vecino)

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
    return [_con_texto(n) for n in result.scalars().all()]


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
    return [_con_texto(n) for n in result.scalars().all()]


@router.post("", response_model=NoticiaResponse)
async def create_noticia(
    data: NoticiaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Crea la novedad en el municipio DEL USUARIO (no en el que venga en el
    payload) y deja constancia de quien la publico."""
    noticia = Noticia(
        **data.model_dump(),
        municipio_id=current_user.municipio_id,
        creador_id=current_user.id,
    )
    db.add(noticia)
    await db.commit()
    await db.refresh(noticia)
    return _con_texto(noticia)


@router.patch("/{noticia_id}", response_model=NoticiaResponse)
async def update_noticia(
    noticia_id: int,
    data: NoticiaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    noticia = await _del_muni(db, noticia_id, current_user.municipio_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(noticia, field, value)
    await db.commit()
    await db.refresh(noticia)
    return _con_texto(noticia)


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
