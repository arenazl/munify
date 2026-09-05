"""Login y pipeline compartido del directorio de llamados (`/calls`).

DOS COSAS QUE ESTA API ARREGLA
1. La pagina estaba ABIERTA en internet y su endpoint de IA tambien: cualquiera
   podia gastar la cuota de Groq de la app. Ahora hay que estar logueado.
2. Lo que se anotaba vivia en el `localStorage` de cada navegador. Con dos
   personas llamando a los mismos 154 municipios, ninguna veia lo de la otra.
   Ahora el pipeline es uno solo y cada linea del historial dice quien la hizo.

No se cuelga del `users` de la app a proposito: aquel es multi-tenant y
municipal, y esto son dos personas del equipo comercial. Un JWT propio con
scope `calls`, firmado con la misma SECRET_KEY.
"""
import json
from datetime import date, datetime, timedelta
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.rate_limit import limiter
from core.security import create_access_token, verify_password
from models.calls import CallsEvento, CallsMunicipio, CallsRegistro, CallsUsuario

router = APIRouter()

# 30 dias: el vendedor no tiene por que volver a loguearse en medio de una
# jornada de llamados, y el riesgo es acotado (dos personas, sin datos de
# terceros mas alla del directorio comercial).
DIAS_TOKEN = 30
SCOPE = "calls"

bearer = HTTPBearer(auto_error=False)


class LoginIn(BaseModel):
    usuario: str = Field(min_length=1, max_length=40)
    clave: str = Field(min_length=1, max_length=128)


class LoginOut(BaseModel):
    token: str
    nombre: str
    usuario: str


class RegistroIn(BaseModel):
    """Lo que manda la pagina al guardar una ficha. Todo opcional: la pagina
    guarda lo que cambio, no la ficha entera."""

    estado: Optional[str] = Field(default=None, max_length=30)
    notas: Optional[str] = None
    quien: Optional[str] = Field(default=None, max_length=120)
    proximo: Optional[str] = None  # 'YYYY-MM-DD' o '' para limpiar
    # Lo que el vendedor corrigio a mano: {"telefono curado": "el que anda"}.
    # Vive en SU registro y no en la ficha, porque la ficha es de la curaduria.
    telefonos_corregidos: Optional[Dict[str, str]] = None
    # Eventos que la pagina quiere dejar asentados (llamada, nota, estado...).
    eventos: list[dict] = Field(default_factory=list, max_length=10)


async def usuario_calls(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> CallsUsuario:
    """El guardia de todo lo de /calls, incluido el endpoint de IA."""
    if not cred:
        raise HTTPException(status_code=401, detail="Hay que iniciar sesion")
    try:
        payload = jwt.decode(cred.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Sesion vencida o invalida")
    if payload.get("scope") != SCOPE:
        raise HTTPException(status_code=401, detail="Ese token no sirve para llamados")

    fila = (await db.execute(
        select(CallsUsuario).where(CallsUsuario.usuario == (payload.get("sub") or ""))
    )).scalar_one_or_none()
    if not fila or not fila.activo:
        raise HTTPException(status_code=401, detail="Usuario dado de baja")
    return fila


@router.post("/login", response_model=LoginOut)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginIn, db: AsyncSession = Depends(get_db)):
    fila = (await db.execute(
        select(CallsUsuario).where(CallsUsuario.usuario == data.usuario.strip().lower())
    )).scalar_one_or_none()
    # Mismo mensaje para usuario inexistente y clave mala: no se le regala a un
    # atacante la informacion de que usuarios existen.
    if not fila or not fila.activo or not verify_password(data.clave, fila.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o clave incorrectos")

    fila.ultimo_acceso = datetime.utcnow()
    await db.commit()

    token = create_access_token(
        {"sub": fila.usuario, "scope": SCOPE, "nombre": fila.nombre},
        expires_delta=timedelta(days=DIAS_TOKEN),
    )
    return LoginOut(token=token, nombre=fila.nombre, usuario=fila.usuario)


@router.get("/yo")
async def yo(u: CallsUsuario = Depends(usuario_calls)):
    """Sirve para que la pagina sepa si el token todavia vale, sin pedir todo."""
    return {"usuario": u.usuario, "nombre": u.nombre}


def _a_dict(r: CallsRegistro) -> dict:
    return {
        "estado": r.estado or "",
        "notas": r.notas or "",
        "quien": r.quien or "",
        "proximo": r.proximo.isoformat() if r.proximo else "",
        "telFix": json.loads(r.telefonos_corregidos) if r.telefonos_corregidos else {},
        "por": r.actualizado_por or "",
        "en": r.actualizado_en.isoformat() if r.actualizado_en else "",
    }


@router.get("/pipeline")
async def pipeline(db: AsyncSession = Depends(get_db), _: CallsUsuario = Depends(usuario_calls)):
    """Todo el pipeline de una: la pagina lo tiene entero en memoria igual que
    cuando vivia en el localStorage, asi no hay que rehacerle la logica."""
    registros = (await db.execute(select(CallsRegistro))).scalars().all()
    eventos = (await db.execute(
        select(CallsEvento).order_by(CallsEvento.creado.asc())
    )).scalars().all()

    db_out: Dict[str, dict] = {r.muni_key: _a_dict(r) for r in registros}
    for e in eventos:
        db_out.setdefault(e.muni_key, {"estado": "", "notas": "", "quien": "", "proximo": ""})
        db_out[e.muni_key].setdefault("hist", []).append({
            "t": e.creado.isoformat(),
            "tipo": e.tipo,
            "txt": e.texto,
            "autor": e.autor,
        })
    return {"db": db_out}


@router.post("/registro/{muni_key}")
async def guardar_registro(
    muni_key: str,
    data: RegistroIn,
    db: AsyncSession = Depends(get_db),
    u: CallsUsuario = Depends(usuario_calls),
):
    """Guarda la ficha y asienta los eventos. El autor sale del token, nunca
    del cuerpo: nadie anota en nombre de otro."""
    muni_key = muni_key.strip().lower()[:80]
    if not muni_key:
        raise HTTPException(status_code=400, detail="Falta el municipio")

    fila = (await db.execute(
        select(CallsRegistro).where(CallsRegistro.muni_key == muni_key)
    )).scalar_one_or_none()
    if not fila:
        fila = CallsRegistro(muni_key=muni_key)
        db.add(fila)

    if data.estado is not None:
        fila.estado = data.estado
    if data.notas is not None:
        fila.notas = data.notas
    if data.quien is not None:
        fila.quien = data.quien
    if data.proximo is not None:
        try:
            fila.proximo = date.fromisoformat(data.proximo) if data.proximo else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Fecha invalida")
    if data.telefonos_corregidos is not None:
        # Se acumulan: el que corrige un numero no borra la correccion del otro.
        actual = json.loads(fila.telefonos_corregidos) if fila.telefonos_corregidos else {}
        actual.update({str(k)[:40]: str(v)[:40] for k, v in data.telefonos_corregidos.items()})
        fila.telefonos_corregidos = json.dumps({k: v for k, v in actual.items() if v}, ensure_ascii=False)

    fila.actualizado_por = u.nombre
    fila.actualizado_en = datetime.utcnow()

    for ev in data.eventos[:10]:
        texto = str(ev.get("txt") or "").strip()
        if not texto:
            continue
        db.add(CallsEvento(
            muni_key=muni_key,
            tipo=str(ev.get("tipo") or "nota")[:20],
            texto=texto[:2000],
            autor=u.nombre,
        ))

    await db.commit()
    await db.refresh(fila)
    return {"ok": True, "registro": _a_dict(fila)}


class ImportarIn(BaseModel):
    """Lo que cada uno tenia en el localStorage de su navegador, para no perder
    el trabajo hecho antes de que esto fuera compartido."""

    db: Dict[str, dict]


@router.post("/importar")
async def importar(
    data: ImportarIn,
    db: AsyncSession = Depends(get_db),
    u: CallsUsuario = Depends(usuario_calls),
):
    """Sube el pipeline viejo del navegador. NO pisa lo que ya esta en el
    servidor: si un municipio ya tiene ficha compartida, se saltea — el trabajo
    de a dos le gana al archivo local de uno."""
    existentes = {
        r.muni_key for r in (await db.execute(select(CallsRegistro.muni_key))).scalars().all()
    }
    creados = 0
    for muni_key, r in list(data.db.items())[:500]:
        muni_key = str(muni_key).strip().lower()[:80]
        if not muni_key or muni_key in existentes:
            continue
        fila = CallsRegistro(
            muni_key=muni_key,
            estado=str(r.get("estado") or "")[:30],
            notas=r.get("notas") or None,
            quien=str(r.get("quien") or "")[:120] or None,
            actualizado_por=u.nombre,
        )
        try:
            fila.proximo = date.fromisoformat(r["proximo"]) if r.get("proximo") else None
        except (ValueError, TypeError):
            fila.proximo = None
        db.add(fila)
        for ev in (r.get("hist") or [])[:100]:
            texto = str(ev.get("txt") or "").strip()
            if texto:
                db.add(CallsEvento(
                    muni_key=muni_key,
                    tipo=str(ev.get("tipo") or "nota")[:20],
                    texto=texto[:2000],
                    autor=u.nombre,
                ))
        creados += 1
    await db.commit()
    return {"ok": True, "importados": creados, "salteados": len(data.db) - creados}


# --------------------------------------------------------------------------- #
# LAS FICHAS, desde la base (2026-09-05)
#
# Antes viajaban embebidas en el html. Ahora la pagina las pide aca y recibe la
# ficha curada CON el trabajo del equipo aplicado encima: el estado, la nota, el
# proximo llamado, y los telefonos que alguien corrigio a mano. Es lo que hace
# que tres vendedores vean lo mismo.
# --------------------------------------------------------------------------- #
def _json(txt, x=None):
    try:
        return json.loads(txt) if txt else x
    except Exception:  # noqa: BLE001
        return x


def _ficha(m: CallsMunicipio, reg: Optional[dict]) -> dict:
    """La ficha como la espera la pagina. Las correcciones del equipo se aplican
    ENCIMA de los telefonos curados, sin perder cual era el original."""
    tel = _json(m.telefonos, []) or []
    fix = (reg or {}).get("telFix") or {}
    tel_final = [fix.get(t, t) for t in tel]
    return {
        "id": m.muni_key,
        "municipio": m.municipio,
        "provincia": m.provincia,
        "pais": m.pais,
        "tipo_gobierno": m.tipo_gobierno or "",
        "telefonos": tel_final,
        "telefonos_curados": tel,
        "direccion": m.direccion or "",
        "direccion_fuente": m.direccion_fuente or "",
        "web": m.web or "",
        "habitantes": m.habitantes or "",
        "intendente": m.intendente or "",
        "cargo": m.cargo or "",
        "partido": m.partido or "",
        "confianza": m.confianza or "",
        "fuente": m.fuente or "",
        "nota": m.nota or "",
        "senal": m.senal or "",
        "llamar_desde": m.llamar_desde or "",
        "revalidar_el": m.revalidar_el or "",
        "economia": m.economia or "",
        "digital": m.digital or "",
        "estructura": m.estructura or "",
        "color": m.color or "",
        "etiquetas": _json(m.etiquetas, []) or [],
        "ranking": _json(m.ranking, {}) or {},
        "calidad": _json(m.calidad, {}) or {},
        "origen": _json(m.origen, []) or [],
        "verificado_el": m.verificado_el or "",
    }


@router.get("/fichas")
async def fichas(db: AsyncSession = Depends(get_db), _: CallsUsuario = Depends(usuario_calls)):
    """Las fichas curadas + el pipeline del equipo, en una sola llamada.

    La pagina arranca con esto y ya sabe todo: a quien llamar, en que orden, que
    paso con cada uno y quien lo atendio. Son ~180 fichas: entra comodo en una
    respuesta y evita que la pagina tenga que cruzar dos listas."""
    munis = (await db.execute(
        select(CallsMunicipio).order_by(CallsMunicipio.ranking_score.desc(),
                                        CallsMunicipio.municipio.asc())
    )).scalars().all()
    registros = (await db.execute(select(CallsRegistro))).scalars().all()
    eventos = (await db.execute(
        select(CallsEvento).order_by(CallsEvento.creado.asc())
    )).scalars().all()

    db_out: Dict[str, dict] = {r.muni_key: _a_dict(r) for r in registros}
    for e in eventos:
        db_out.setdefault(e.muni_key, {"estado": "", "notas": "", "quien": "",
                                       "proximo": "", "telFix": {}})
        db_out[e.muni_key].setdefault("hist", []).append({
            "t": e.creado.isoformat(), "tipo": e.tipo, "txt": e.texto, "autor": e.autor,
        })

    return {
        "fichas": [_ficha(m, db_out.get(m.muni_key)) for m in munis],
        "db": db_out,
        "importado_en": max([m.importado_en for m in munis if m.importado_en],
                            default=datetime.utcnow()).isoformat(),
    }


@router.get("/ranking")
async def ranking(db: AsyncSession = Depends(get_db), _: CallsUsuario = Depends(usuario_calls)):
    """Como viene cada vendedor. Sale de los eventos, que son los que llevan
    autor: llamadas hechas, municipios tocados, y cierres con detalle (los que
    ademas dejaron nota o con quien hablaron, que es lo que sirve al que sigue).

    Se cuenta por AUTOR y no por usuario logueado a proposito: el historial
    guarda el nombre con el que se anoto, y esa es la unidad que el dueno quiere
    ver en la pantalla de competencia."""
    filas = (await db.execute(
        select(CallsEvento.autor, CallsEvento.tipo,
               func.count(CallsEvento.id), func.count(func.distinct(CallsEvento.muni_key)),
               func.max(CallsEvento.creado))
        .group_by(CallsEvento.autor, CallsEvento.tipo)
    )).all()

    por_autor: Dict[str, dict] = {}
    for autor, tipo, n, munis, ultimo in filas:
        a = por_autor.setdefault(autor or "sin autor", {
            "autor": autor or "sin autor", "llamadas": 0, "cierres": 0,
            "municipios": 0, "ultimo": None,
        })
        if tipo == "llamada":
            a["llamadas"] += n
        if tipo == "estado":
            a["cierres"] += n
        a["municipios"] = max(a["municipios"], munis)
        iso = ultimo.isoformat() if ultimo else None
        if iso and (a["ultimo"] is None or iso > a["ultimo"]):
            a["ultimo"] = iso

    # Los cierres CON DETALLE salen del registro, que es donde vive la nota.
    con_detalle = (await db.execute(
        select(CallsRegistro.actualizado_por, func.count(CallsRegistro.id))
        .where(CallsRegistro.estado != "")
        .where((CallsRegistro.notas.isnot(None)) | (CallsRegistro.quien.isnot(None)))
        .group_by(CallsRegistro.actualizado_por)
    )).all()
    for autor, n in con_detalle:
        if autor in por_autor:
            por_autor[autor]["con_detalle"] = n

    tabla = sorted(por_autor.values(), key=lambda x: (-x["llamadas"], -x["municipios"]))
    for i, a in enumerate(tabla, 1):
        a["puesto"] = i
        a.setdefault("con_detalle", 0)
    return {"ranking": tabla}
