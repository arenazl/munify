# -*- coding: utf-8 -*-
"""EL PASO QUE CIERRA: lo que se analizo pasa a la ficha.

Los tres pasos anteriores --traer la prosa, traducirla, compararla-- no escriben nada.
Este si, y por eso es el unico que puede hacer dano. Todo lo que sigue esta pensado para
que ese dano no sea posible.

SIEMPRE ADITIVO, NUNCA DESTRUCTIVO (dueno, 2026-09-10)
------------------------------------------------------
Nada se pisa y nada se borra. Un tag nuevo se suma a los que ya estaban; un telefono
nuevo entra ADELANTE --es el que hay que probar-- y el que habia baja, sin desaparecer.
Lo dudoso entra igual, marcado y ultimo.

    "Es mejor tener un telefono donde el vendedor tenga que curar un guion bajo o
     agregar un cero, que un telefono perdido."

En la pantalla cada telefono tiene su lapicito: un dato de mas cuesta un vistazo, uno
perdido cuesta la llamada y no se recupera, porque nadie vuelve a revisar un municipio
que ya figura sin telefono.

LO QUE NO TOCA
--------------
NO mueve el angulo de entrada ni el orden de la pantalla. El layout es binario --se
entra por el vecino o por la gestion interna-- y casi nunca se da vuelta; que lo cambie
un modelo sin que nadie lo vea es el peor error posible, porque es invisible: el vendedor
abre la ficha, arranca por donde le dice, sale mal, y no hay forma de saber que ayer
decia otra cosa. Un dato equivocado se ve y se corrige; un angulo equivocado no.

Si el analisis sugiere otro angulo, eso vuelve en la respuesta como PROPUESTA y lo
aplica una persona.

LO QUE ESCRIBE LO MANDA LA PANTALLA
-----------------------------------
El endpoint recibe los hechos que el front ya tiene a la vista, no los recalcula. Asi lo
que se guarda es exactamente lo que el dueno miro y aprobo, y no algo parecido que un
modelo devolvio de nuevo con otra temperatura.
"""
import json
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.calls import CallsUsuario, usuario_calls
from core.database import get_db
from core.rate_limit import limiter
from models.calls import CallsMunicipio
from models.calls_curacion import CallsHecho, CallsTelefono

router = APIRouter()


class HechoQueEntra(BaseModel):
    que: str = Field(min_length=3, max_length=1200)
    tag: str = Field(default="", max_length=80)
    universo: str = Field(default="", max_length=20)
    peso: int = Field(default=3, ge=0, le=5)
    cuando: str = Field(default="", max_length=20)
    veredicto: str = Field(default="", max_length=20)
    fuente_url: str = Field(default="", max_length=500)


class Contacto(BaseModel):
    telefono: str = Field(default="", max_length=60)
    mail: str = Field(default="", max_length=120)
    web: str = Field(default="", max_length=300)


class Pedido(BaseModel):
    muni_key: str = Field(min_length=2, max_length=80)
    relato_id: Optional[int] = None
    hechos: list[HechoQueEntra] = Field(default_factory=list, max_length=60)
    contacto: Contacto = Field(default_factory=Contacto)


def _solo_digitos(s: str) -> str:
    d = re.sub(r"\D", "", s or "")
    d = d[2:] if len(d) > 10 and d.startswith("54") else d
    return d[1:] if d.startswith("0") else d


def _lista(txt) -> list:
    try:
        v = json.loads(txt) if txt else []
    except ValueError:
        v = []
    return v if isinstance(v, list) else []


def _dict(txt) -> dict:
    try:
        v = json.loads(txt) if txt else {}
    except ValueError:
        v = {}
    return v if isinstance(v, dict) else {}


@router.post("/curar/aplicar")
@limiter.limit("60/hour")
async def aplicar(
    request: Request,
    data: Pedido,
    db: AsyncSession = Depends(get_db),
    quien: CallsUsuario = Depends(usuario_calls),
):
    """Guarda en la ficha lo que se vio en pantalla. Suma; no pisa ni borra."""
    m = (await db.execute(
        select(CallsMunicipio).where(CallsMunicipio.muni_key == data.muni_key)
    )).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail="No conozco esa ficha")

    ahora = datetime.utcnow()
    hecho = {"hechos": 0, "repetidos": 0, "telefonos": [], "mail": "", "web": "",
             "ya_estaba": []}

    # --- LOS HECHOS -------------------------------------------------------- #
    # Lo que ya esta guardado, para no cargar dos veces lo mismo. Se compara por el
    # TEXTO normalizado y no por el tag: dos hechos con el mismo tag pueden decir cosas
    # distintas, y uno nuevo que repite un tag no es un duplicado.
    viejos = (await db.execute(
        select(CallsHecho).where(CallsHecho.muni_key == data.muni_key)
    )).scalars().all()
    firmas = {re.sub(r"\W+", "", (h.texto or "").lower())[:90] for h in viejos}

    for h in data.hechos:
        firma = re.sub(r"\W+", "", h.que.lower())[:90]
        if firma in firmas:
            hecho["repetidos"] += 1
            continue
        firmas.add(firma)
        db.add(CallsHecho(
            muni_key=data.muni_key, codigo_indec=m.codigo_indec,
            tag=h.tag or "sin_tag", texto=h.que, fuente_url=h.fuente_url or None,
            de_donde="analisis", peso=h.peso, curado=0,
            relato_id=data.relato_id, creado=ahora))
        hecho["hechos"] += 1

    # --- EL CONTACTO ------------------------------------------------------- #
    # Aditivo: el telefono nuevo va ADELANTE y el que habia baja. Nada se reemplaza.
    tel_nuevo = (data.contacto.telefono or "").strip()
    if tel_nuevo and not re.search(r"no encontr", tel_nuevo, re.I):
        tels = _lista(m.telefonos)
        meta = _dict(m.telefonos_meta)
        if _solo_digitos(tel_nuevo) in {_solo_digitos(x) for x in tels}:
            # el mismo numero escrito distinto no es uno nuevo
            hecho["ya_estaba"].append(tel_nuevo)
        else:
            meta[tel_nuevo] = {"de": "análisis del municipio", "fuente": "analisis",
                               "estado": "por_validar", "cuando": ahora.isoformat()}
            m.telefonos = json.dumps([tel_nuevo] + tels, ensure_ascii=False)
            m.telefonos_meta = json.dumps(meta, ensure_ascii=False)
            db.add(CallsTelefono(muni_key=data.muni_key, codigo_indec=m.codigo_indec,
                                 numero=tel_nuevo[:40], orden=0, de_donde="analisis",
                                 creado=ahora))
            hecho["telefonos"].append(tel_nuevo)

    # La web y el mail son UNA columna cada uno, asi que no pueden acumular todavia. Por
    # eso solo se escriben si estan VACIOS: un dato que falta se completa, uno que existe
    # no se toca. Cuando pasen a ser lista se aplica el mismo criterio que los telefonos.
    web = (data.contacto.web or "").strip()
    if web and not re.search(r"no encontr", web, re.I):
        if not (m.web or "").strip():
            m.web = web[:300]
            hecho["web"] = web
        elif _limpia(web) != _limpia(m.web):
            hecho["ya_estaba"].append("web: %s (la ficha tiene %s)" % (web, m.web))

    mail = (data.contacto.mail or "").strip()
    if mail and "@" in mail and not re.search(r"no encontr", mail, re.I):
        # `mail` es columna nueva: si todavia no existe en la base, no se pierde el dato
        # --vuelve en la respuesta-- pero tampoco rompe.
        if hasattr(m, "mail") and not (getattr(m, "mail", "") or "").strip():
            m.mail = mail[:120]
        hecho["mail"] = mail

    if hecho["hechos"] or hecho["telefonos"] or hecho["web"]:
        m.curado_en, m.curado_por = ahora, quien.usuario
    await db.commit()

    return {"ok": True, "muni_key": data.muni_key, "guardado": hecho,
            "nota": "se sumo a la ficha; no se piso ni se borro nada, y el angulo de "
                    "entrada quedo como estaba"}


def _limpia(u: str) -> str:
    return re.sub(r"^https?://(www\.)?|/$", "", (u or "").strip().lower())
