"""API SalesBot (Bruno) <-> Munify.

Dos tipos de endpoints, dos auth distintas:

  - GENERALES (los consume SalesBot, backend a backend): auth por header
    `X-SalesBot-Key`. Listan/devuelven municipios con su WhatsApp de derivacion
    + stats reales. NO son tenant-scoped: cruzan todos los municipios.

  - ADMIN per-muni (los consume el panel del propio municipio): auth JWT.
    Cargar/guardar la config de derivacion (numero + habilitado) del muni.

El WhatsApp de derivacion sale de la tabla dedicada `salesbot_configs`, NO de
WhatsAppConfig (que es la integracion Meta). Asi un muni puede estar en SalesBot
sin tener Meta configurado.
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.config import settings
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    Municipio, Reclamo, User, Tramite, CategoriaReclamo,
    RolUsuario, EstadoReclamo, HistorialReclamo, MunicipioDependenciaCategoria,
)
from models.salesbot_config import SalesbotConfig
from models.municipio_dependencia import MunicipioDependencia
from models.municipio_dependencia_tramite import MunicipioDependenciaTramite
from models.turno import Turno
from models.configuracion import Configuracion

from services.turnos_agenda import calcular_slots, reservar_turno, _tramos_por_dia
from services.ia_service import clasificar_reclamo
from services.vecinos import resolver_o_crear_vecino
from core.ia_config import get_ia_config

router = APIRouter()

# Estados que cuentan como "resuelto": FINALIZADO es el actual, "resuelto" es
# legacy. La columna guarda el VALUE en minuscula (values_callable en el Enum).
ESTADOS_RESUELTO = ["finalizado", "resuelto"]


# ============================================================
# Auth backend-to-backend (SalesBot)
# ============================================================

def verify_salesbot_key(request: Request):
    # El codebase lee headers desde Request (evita Header() por incompat de
    # versiones FastAPI/Pydantic). Header: X-SalesBot-Key.
    key = request.headers.get("X-SalesBot-Key")
    if not settings.SALESBOT_API_KEY or key != settings.SALESBOT_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


# ============================================================
# Helpers
# ============================================================

async def _stats(db: AsyncSession, municipio_id: int, detalle: bool = False) -> dict:
    """Stats reales de un municipio (counts directos sobre la BD de Munify)."""
    total = (await db.execute(
        select(func.count(Reclamo.id)).where(Reclamo.municipio_id == municipio_id)
    )).scalar() or 0
    resueltos = (await db.execute(
        select(func.count(Reclamo.id)).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_(ESTADOS_RESUELTO),
        )
    )).scalar() or 0
    tramites = (await db.execute(
        select(func.count(Tramite.id)).where(
            Tramite.municipio_id == municipio_id,
            Tramite.activo == True,  # noqa: E712
        )
    )).scalar() or 0
    vecinos = (await db.execute(
        select(func.count(User.id)).where(
            User.municipio_id == municipio_id,
            User.rol == RolUsuario.VECINO,
        )
    )).scalar() or 0

    stats = {
        "reclamos_totales": int(total),
        "reclamos_resueltos": int(resueltos),
        "tramites_activos": int(tramites),
        "vecinos": int(vecinos),
    }
    if detalle:
        stats["tasa_resolucion_pct"] = round(resueltos / total * 100) if total else 0
        cats = (await db.execute(
            select(CategoriaReclamo.nombre)
            .where(CategoriaReclamo.municipio_id == municipio_id)
            .order_by(CategoriaReclamo.nombre)
            .limit(8)
        )).scalars().all()
        stats["categorias_reclamo"] = list(cats)
    return stats


async def _salesbot_map(db: AsyncSession, municipio_ids: List[int]) -> dict:
    """{municipio_id: SalesbotConfig} (1 query, evita N+1)."""
    if not municipio_ids:
        return {}
    rows = (await db.execute(
        select(SalesbotConfig).where(SalesbotConfig.municipio_id.in_(municipio_ids))
    )).scalars().all()
    return {r.municipio_id: r for r in rows}


# Claves que la pantalla Configuracion (tab General) guarda en `configuraciones`.
_MUNI_CONFIG_KEYS = (
    "direccion_municipio", "telefono_contacto",
    "latitud_municipio", "longitud_municipio", "nombre_municipio",
)


async def _config_muni(db: AsyncSession, municipio_id: int) -> dict:
    """Datos del municipio cargados en la pantalla Configuracion (tabla
    `configuraciones`, key-value). Es donde el admin del muni carga
    direccion/telefono/lat/long. Devuelve {clave: valor} (solo no vacios)."""
    rows = (await db.execute(
        select(Configuracion.clave, Configuracion.valor).where(
            Configuracion.municipio_id == municipio_id,
            Configuracion.clave.in_(_MUNI_CONFIG_KEYS),
        )
    )).all()
    return {clave: valor for clave, valor in rows if valor}


async def _stats_batch(db: AsyncSession, municipio_ids: List[int]) -> dict:
    """Stats de VARIOS municipios en pocas queries agregadas (evita el N+1 de
    llamar _stats por municipio). Mismos filtros que _stats: los numeros son
    identicos, solo cambia como se piden. Devuelve {muni_id: {stats}}."""
    base = {
        mid: {
            "reclamos_totales": 0,
            "reclamos_resueltos": 0,
            "tramites_activos": 0,
            "vecinos": 0,
        }
        for mid in municipio_ids
    }
    if not municipio_ids:
        return base

    # Reclamos: total y resueltos en una sola pasada (SUM condicional).
    for mid, total, resueltos in (await db.execute(
        select(
            Reclamo.municipio_id,
            func.count(Reclamo.id),
            func.coalesce(
                func.sum(case((Reclamo.estado.in_(ESTADOS_RESUELTO), 1), else_=0)), 0
            ),
        )
        .where(Reclamo.municipio_id.in_(municipio_ids))
        .group_by(Reclamo.municipio_id)
    )).all():
        if mid in base:
            base[mid]["reclamos_totales"] = int(total or 0)
            base[mid]["reclamos_resueltos"] = int(resueltos or 0)

    # Tramites activos por municipio.
    for mid, c in (await db.execute(
        select(Tramite.municipio_id, func.count(Tramite.id))
        .where(Tramite.municipio_id.in_(municipio_ids), Tramite.activo == True)  # noqa: E712
        .group_by(Tramite.municipio_id)
    )).all():
        if mid in base:
            base[mid]["tramites_activos"] = int(c or 0)

    # Vecinos por municipio.
    for mid, c in (await db.execute(
        select(User.municipio_id, func.count(User.id))
        .where(User.municipio_id.in_(municipio_ids), User.rol == RolUsuario.VECINO)
        .group_by(User.municipio_id)
    )).all():
        if mid in base:
            base[mid]["vecinos"] = int(c or 0)

    return base


# ============================================================
# Endpoints GENERALES (SalesBot, X-SalesBot-Key)
# ============================================================

@router.get("/municipios")
async def listar_municipios(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Lista TODOS los municipios activos con su derivacion de WhatsApp + stats."""
    verify_salesbot_key(request)
    munis = (await db.execute(
        select(Municipio).where(Municipio.activo == True).order_by(Municipio.nombre)  # noqa: E712
    )).scalars().all()
    ids = [m.id for m in munis]
    sb = await _salesbot_map(db, ids)
    stats_map = await _stats_batch(db, ids)  # 1 pasada agregada, no N+1 por muni

    out = []
    for m in munis:
        cfg = sb.get(m.id)
        out.append({
            "id": m.id,
            "nombre": m.nombre,
            "codigo": m.codigo,
            "logo_url": m.logo_url,
            "color_primario": m.color_primario,
            # telefono va tambien en la LISTA: el fast-path del postback del menu
            # interactivo (Flujo 2) lo usa como fallback cuando no hay whatsapp,
            # sin tener que pegarle a /detalle.
            "telefono": m.telefono,
            "whatsapp": cfg.whatsapp if cfg else None,
            "whatsapp_habilitado": cfg.habilitado if cfg else False,
            "stats": stats_map[m.id],
        })
    return out


@router.get("/municipios/{municipio_id}/detalle")
async def detalle_municipio(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Detalle de un municipio (cuando el prospecto ya eligio uno)."""
    verify_salesbot_key(request)
    m = (await db.execute(
        select(Municipio).where(
            Municipio.id == municipio_id,
            Municipio.activo == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    sb = await _salesbot_map(db, [m.id])
    cfg = sb.get(m.id)
    cm = await _config_muni(db, m.id)  # datos cargados en la pantalla Configuracion
    return {
        "id": m.id,
        "nombre": m.nombre,
        "codigo": m.codigo,
        "descripcion": m.descripcion,
        # direccion/telefono/lat/long: primero lo cargado en Configuracion,
        # fallback a las columnas de `municipios`.
        "direccion": cm.get("direccion_municipio"),
        "telefono": cm.get("telefono_contacto") or m.telefono,
        "email": m.email,
        "sitio_web": m.sitio_web,
        "latitud": cm.get("latitud_municipio") or (str(m.latitud) if m.latitud is not None else None),
        "longitud": cm.get("longitud_municipio") or (str(m.longitud) if m.longitud is not None else None),
        "logo_url": m.logo_url,
        "color_primario": m.color_primario,
        "whatsapp": cfg.whatsapp if cfg else None,
        "whatsapp_habilitado": cfg.habilitado if cfg else False,
        "stats": await _stats(db, m.id, detalle=True),
    }


@router.get("/municipios/{municipio_id}/tramites")
async def listar_tramites_muni(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Tramites activos que ofrece el municipio."""
    verify_salesbot_key(request)
    rows = (await db.execute(
        select(Tramite).where(
            Tramite.municipio_id == municipio_id,
            Tramite.activo == True,  # noqa: E712
        ).order_by(Tramite.nombre)
    )).scalars().all()
    return [
        {"id": t.id, "nombre": t.nombre, "descripcion": t.descripcion, "activo": bool(t.activo)}
        for t in rows
    ]


@router.get("/municipios/{municipio_id}/categorias")
async def listar_categorias_muni(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Categorias de reclamo del municipio."""
    verify_salesbot_key(request)
    rows = (await db.execute(
        select(CategoriaReclamo)
        .where(CategoriaReclamo.municipio_id == municipio_id)
        .order_by(CategoriaReclamo.nombre)
    )).scalars().all()
    return [{"id": c.id, "nombre": c.nombre, "descripcion": c.descripcion} for c in rows]


@router.get("/municipios/{municipio_id}/dependencias")
async def listar_dependencias_muni(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Areas/secretarias habilitadas en el municipio. Dependencia es un template
    global (sin municipio_id); las del muni viven en el pivot MunicipioDependencia
    con telefono/email efectivos (override local o el del template)."""
    verify_salesbot_key(request)
    rows = (await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(
            MunicipioDependencia.municipio_id == municipio_id,
            MunicipioDependencia.activo == True,  # noqa: E712
        )
    )).scalars().all()
    out = [
        {"id": md.dependencia_id, "nombre": md.nombre, "telefono": md.telefono_efectivo, "email": md.email_efectivo}
        for md in rows
    ]
    out.sort(key=lambda d: (d["nombre"] or ""))
    return out


# ============================================================
# Endpoints ADMIN per-muni (panel del municipio, JWT)
# ============================================================

class SalesbotConfigIn(BaseModel):
    whatsapp: Optional[str] = None
    habilitado: bool = False


class SalesbotConfigOut(BaseModel):
    municipio_id: int
    whatsapp: Optional[str] = None
    habilitado: bool = False


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


@router.get("/mi-config", response_model=SalesbotConfigOut)
async def get_mi_config(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Config de derivacion del municipio actual (para la pestaña SalesBot)."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    cfg = (await db.execute(
        select(SalesbotConfig).where(SalesbotConfig.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not cfg:
        return SalesbotConfigOut(municipio_id=muni_id, whatsapp=None, habilitado=False)
    return SalesbotConfigOut(municipio_id=muni_id, whatsapp=cfg.whatsapp, habilitado=cfg.habilitado)


@router.put("/mi-config", response_model=SalesbotConfigOut)
async def put_mi_config(
    payload: SalesbotConfigIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea o actualiza la config de derivacion del municipio actual."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    cfg = (await db.execute(
        select(SalesbotConfig).where(SalesbotConfig.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not cfg:
        cfg = SalesbotConfig(municipio_id=muni_id)
        db.add(cfg)
    cfg.whatsapp = (payload.whatsapp or "").strip() or None
    cfg.habilitado = bool(payload.habilitado)
    await db.commit()
    await db.refresh(cfg)
    return SalesbotConfigOut(municipio_id=muni_id, whatsapp=cfg.whatsapp, habilitado=cfg.habilitado)


# ============================================================
# Turnos (SalesBot, X-SalesBot-Key) — el vecino reserva por WhatsApp
# ============================================================
# Tenant-scoped: el municipio_id sale SIEMPRE del path validado, nunca del payload.
# Reserva via el servicio central (valida slot + lock anti-race). Cancelar exige
# match del telefono del solicitante (no basta el id enumerable).

class TurnoReservaBotIn(BaseModel):
    tramite_id: int
    fecha_hora: datetime
    nombre: str
    dni: Optional[str] = None
    telefono: Optional[str] = None
    notas: Optional[str] = None


async def _muni_activo(db: AsyncSession, municipio_id: int) -> Municipio:
    m = (await db.execute(
        select(Municipio).where(Municipio.id == municipio_id, Municipio.activo == True)  # noqa: E712
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Municipio no encontrado")
    return m


async def _tramite_y_dep(db: AsyncSession, tramite_id: int, municipio_id: int):
    """Devuelve (Tramite, municipio_dependencia_id) validando que ambos pertenezcan
    al municipio del path (evita cruzar tenants)."""
    tr = (await db.execute(
        select(Tramite).where(Tramite.id == tramite_id, Tramite.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not tr:
        raise HTTPException(404, "Tramite no encontrado en este municipio")
    mdt = (await db.execute(
        select(MunicipioDependenciaTramite)
        .join(MunicipioDependencia, MunicipioDependencia.id == MunicipioDependenciaTramite.municipio_dependencia_id)
        .where(
            MunicipioDependenciaTramite.tramite_id == tramite_id,
            MunicipioDependenciaTramite.activo == True,  # noqa: E712
            MunicipioDependencia.municipio_id == municipio_id,
        )
    )).scalars().first()
    if not mdt:
        raise HTTPException(400, "El tramite no tiene dependencia asignada en este municipio")
    return tr, mdt.municipio_dependencia_id


@router.get("/municipios/{municipio_id}/turnos/disponibles")
async def turnos_disponibles_bot(
    municipio_id: int,
    request: Request,
    tramite_id: Optional[int] = None,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """Slots disponibles para que el bot arme la lista. Primeros 20 libres."""
    verify_salesbot_key(request)
    await _muni_activo(db, municipio_id)

    duracion = 30
    dep_id = dependencia_id
    nombre_tr: Optional[str] = None
    if tramite_id:
        tr, dep_id = await _tramite_y_dep(db, tramite_id, municipio_id)
        duracion = tr.duracion_turno_min or 30
        nombre_tr = tr.nombre
    if not dep_id:
        raise HTTPException(400, "Pasá tramite_id o dependencia_id")

    dep = (await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(MunicipioDependencia.id == dep_id, MunicipioDependencia.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not dep:
        raise HTTPException(404, "Dependencia no encontrada en este municipio")

    desde = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    hasta = desde + timedelta(days=7)
    raw = await calcular_slots(db, dep_id, duracion, desde, hasta)
    libres = [s for s in raw if s["disponible"]][:20]
    return {
        "dependencia_id": dep_id,
        "dependencia_nombre": dep.dependencia.nombre if dep.dependencia else "Dependencia",
        "tramite": nombre_tr,
        "duracion_min": duracion,
        "slots": [
            {"fecha_hora": s["fecha_hora"], "cupo_restante": s["cupo_restante"]}
            for s in libres
        ],
    }


@router.post("/municipios/{municipio_id}/turnos/reservar")
async def reservar_turno_bot(
    municipio_id: int,
    payload: TurnoReservaBotIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    verify_salesbot_key(request)
    await _muni_activo(db, municipio_id)
    tr, dep_id = await _tramite_y_dep(db, payload.tramite_id, municipio_id)
    duracion = tr.duracion_turno_min or 30

    turno = await reservar_turno(
        db,
        dep_id=dep_id,
        municipio_id=municipio_id,  # del path validado, nunca del payload
        fecha_hora=payload.fecha_hora,
        duracion=duracion,
        motivo_tipo="tramite",
        solicitud_id=None,
        origen_id=None,
        nombre_solicitante=payload.nombre,
        dni_solicitante=payload.dni,
        telefono_solicitante=payload.telefono,
        notas=(payload.notas or f"Turno via SalesBot - {tr.nombre}"),
    )
    return {
        "turno_id": turno.id,
        "fecha_hora": turno.fecha_hora,
        "tramite": tr.nombre,
        "estado": turno.estado,
        "confirmacion": f"TRN-{turno.id:05d}",
    }


@router.delete("/municipios/{municipio_id}/turnos/{turno_id}")
async def cancelar_turno_bot(
    municipio_id: int,
    turno_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Cancela exigiendo el telefono del solicitante (?telefono=...): el id solo
    no alcanza, asi nadie cancela turnos ajenos iterando ids."""
    verify_salesbot_key(request)
    telefono = (request.query_params.get("telefono") or "").strip()
    if not telefono:
        raise HTTPException(400, "Falta ?telefono= para validar la cancelacion")
    turno = (await db.execute(
        select(Turno).where(Turno.id == turno_id, Turno.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not turno:
        raise HTTPException(404, "Turno no encontrado")
    if (turno.telefono_solicitante or "") != telefono:
        raise HTTPException(403, "El telefono no coincide con el del turno")
    turno.estado = "cancelado"
    await db.commit()
    return {"ok": True}


_DIAS_NOMBRE = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]


@router.get("/municipios/{municipio_id}/turnos/agenda")
async def agenda_municipio_bot(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Dependencias del municipio que atienden turnos + sus horarios configurados
    (o el fallback historico lun-vie 08:30-13:00 si no configuraron agenda).
    Le da al bot el panorama: municipio -> dependencias -> horarios, para ofrecer
    turnos. Tenant-scoped por el municipio_id del path."""
    verify_salesbot_key(request)
    await _muni_activo(db, municipio_id)
    deps = (await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(
            MunicipioDependencia.municipio_id == municipio_id,
            MunicipioDependencia.activo == True,  # noqa: E712
        )
    )).scalars().all()

    out = []
    for dep in deps:
        tramos = await _tramos_por_dia(db, dep.id)
        horarios = []
        for dia in sorted(tramos.keys()):
            for hi, hf, cupo in tramos[dia]:
                horarios.append({
                    "dia_semana": dia,
                    "dia": _DIAS_NOMBRE[dia] if 0 <= dia <= 6 else str(dia),
                    "hora_inicio": hi.strftime("%H:%M"),
                    "hora_fin": hf.strftime("%H:%M"),
                    "cupo_max": cupo,
                })
        out.append({
            "dependencia_id": dep.id,
            "nombre": dep.dependencia.nombre if dep.dependencia else None,
            "telefono": dep.telefono_efectivo,
            "horarios": horarios,
        })
    return {"municipio_id": municipio_id, "dependencias": out}


# ============================================================
# Crear reclamo (SalesBot) — el vecino reporta por WhatsApp, Munify clasifica con IA
# ============================================================

class ReclamoBotIn(BaseModel):
    descripcion: str
    nombre: str
    dni: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


@router.post("/municipios/{municipio_id}/reclamos")
async def crear_reclamo_bot(
    municipio_id: int,
    payload: ReclamoBotIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Crea un reclamo desde el texto libre del vecino (canal WhatsApp). Munify
    clasifica la categoria con IA (o keywords locales si la IA esta off en el
    muni) y genera el reclamo. Tenant-scoped: el municipio sale del path. El
    vecino se resuelve/crea como ghost (no necesita cuenta)."""
    verify_salesbot_key(request)
    await _muni_activo(db, municipio_id)

    desc = (payload.descripcion or "").strip()
    if len(desc) < 5:
        raise HTTPException(400, "La descripcion del reclamo es muy corta")

    cats = (await db.execute(
        select(CategoriaReclamo).where(
            CategoriaReclamo.municipio_id == municipio_id,
            CategoriaReclamo.activo == True,  # noqa: E712
        )
    )).scalars().all()
    if not cats:
        raise HTTPException(400, "El municipio no tiene categorias de reclamo configuradas")
    categorias = [{"id": c.id, "nombre": c.nombre, "descripcion": c.descripcion or ""} for c in cats]
    cat_ids = {c.id for c in cats}
    cat_nombre = {c.id: c.nombre for c in cats}

    # Clasificacion: IA si el muni la tiene habilitada, sino keywords local (gratis).
    cfg = await get_ia_config(db, municipio_id)
    resultado = await clasificar_reclamo(desc, categorias, usar_ia=cfg.habilitada, modelo=cfg.modelo)
    sugerencias = resultado.get("sugerencias") or []
    # La IA puede devolver un id que no es del muni, o [] si el texto no es un
    # reclamo claro -> validamos contra cat_ids y caemos a la primera categoria
    # (el vecino reporto algo, igual lo generamos).
    top = next((s for s in sugerencias if s.get("categoria_id") in cat_ids), None)
    if top:
        categoria_id = top["categoria_id"]
        metodo = resultado.get("metodo_principal") or "ia"
        confianza = top.get("confianza")
    else:
        categoria_id = sorted(cat_ids)[0]
        metodo = "fallback"
        confianza = 0

    # Vecino ghost. resolver_o_crear_vecino exige nombre + apellido.
    partes = (payload.nombre or "").strip().split(" ", 1)
    nombre_v = partes[0] or "Vecino"
    apellido_v = partes[1] if len(partes) > 1 else "(sin apellido)"
    vecino = await resolver_o_crear_vecino(
        db, municipio_id=municipio_id, dni=payload.dni, email=None,
        nombre=nombre_v, apellido=apellido_v,
        telefono=payload.telefono, direccion=payload.direccion,
    )

    # Auto-asignar dependencia segun la categoria (si el muni la mapeo).
    dep_id = (await db.execute(
        select(MunicipioDependenciaCategoria.municipio_dependencia_id).where(
            MunicipioDependenciaCategoria.categoria_id == categoria_id,
            MunicipioDependenciaCategoria.municipio_id == municipio_id,
        ).limit(1)
    )).scalar_one_or_none()

    reclamo = Reclamo(
        municipio_id=municipio_id,        # del path, nunca del payload
        creador_id=vecino.id,
        titulo=desc[:200],
        descripcion=desc,
        direccion=(payload.direccion or "Sin especificar")[:255],
        latitud=payload.latitud,
        longitud=payload.longitud,
        categoria_id=categoria_id,
        municipio_dependencia_id=dep_id,
        estado=EstadoReclamo.NUEVO,
        prioridad=3,
        canal="whatsapp",
    )
    db.add(reclamo)
    await db.flush()

    db.add(HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=vecino.id,
        estado_nuevo=EstadoReclamo.NUEVO,
        accion="creado",
        comentario="Reclamo creado via WhatsApp (SalesBot)",
    ))
    await db.commit()
    await db.refresh(reclamo)

    return {
        "reclamo_id": reclamo.id,
        "numero_seguimiento": f"REC-{reclamo.id:05d}",
        "estado": reclamo.estado.value if hasattr(reclamo.estado, "value") else str(reclamo.estado),
        "categoria": {
            "id": categoria_id,
            "nombre": cat_nombre.get(categoria_id),
            "confianza": confianza,
            "metodo": metodo,
        },
        "dependencia_id": dep_id,
    }
