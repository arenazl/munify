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
from datetime import date, datetime, timedelta
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.rate_limit import limiter
from core.security import create_access_token, verify_password
from models.calls import CallsEvento, CallsRegistro, CallsUsuario

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
