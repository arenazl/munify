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
from models.calls_curacion import (CallsCanal, CallsHecho, CallsMail,
                                   CallsTelefono)

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
    """EL CONTRATO VIEJO: un telefono, un mail, una web.

    Se conserva para que nada de lo que ya funciona se rompa, pero era el cuello de todo
    el circuito. Medido sobre Sachayoj el 2026-09-13: la investigacion encontro DOS
    telefonos del municipio --uno con su fuente y el otro marcado como antiguo--, tres
    paginas de Facebook de gestiones distintas, y el WhatsApp de un diario por donde los
    vecinos mandan reclamos. De todo eso, a la ficha llegaba UN telefono.

    Mientras esto fuera todo lo que se podia guardar, mejorar la busqueda no cambiaba nada
    en la pantalla: se llenaba un balde agujereado.
    """

    telefono: str = Field(default="", max_length=60)
    mail: str = Field(default="", max_length=120)
    web: str = Field(default="", max_length=300)


class TelefonoQueEntra(BaseModel):
    numero: str = Field(max_length=60)
    de: str = Field(default="", max_length=160)
    de_quien: str = Field(default="", max_length=20)   # municipio|area|funcionario|tercero
    area: str = Field(default="", max_length=120)
    vigencia: str = Field(default="", max_length=24)
    que_se_sabe: str = Field(default="")
    duda: str = Field(default="")


class MailQueEntra(BaseModel):
    direccion: str = Field(max_length=200)
    de: str = Field(default="", max_length=160)
    de_quien: str = Field(default="", max_length=20)
    area: str = Field(default="", max_length=120)
    vigencia: str = Field(default="", max_length=24)
    que_se_sabe: str = Field(default="")
    duda: str = Field(default="")


class CanalQueEntra(BaseModel):
    tipo: str = Field(max_length=20)
    dato: str = Field(max_length=400)
    de: str = Field(default="", max_length=160)
    de_quien: str = Field(default="", max_length=20)
    area: str = Field(default="", max_length=120)
    gestion: str = Field(default="", max_length=120)
    vigencia: str = Field(default="", max_length=24)
    que_se_sabe: str = Field(default="")
    duda: str = Field(default="")


class Pedido(BaseModel):
    muni_key: str = Field(min_length=2, max_length=80)
    relato_id: Optional[int] = None
    hechos: list[HechoQueEntra] = Field(default_factory=list, max_length=60)
    # el contrato viejo sigue entrando: un cliente que todavia manda `contacto` no se rompe
    contacto: Contacto = Field(default_factory=Contacto)
    # y el nuevo, que es el que deja de tirar: TODOS los que se encontraron, con su dueño
    telefonos: list[TelefonoQueEntra] = Field(default_factory=list, max_length=40)
    mails: list[MailQueEntra] = Field(default_factory=list, max_length=40)
    canales: list[CanalQueEntra] = Field(default_factory=list, max_length=60)


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

    # --- TODOS LOS CONTACTOS, NO UNO ---------------------------------------- #
    # Lo de arriba es el contrato viejo: un telefono, un mail, una web. Lo de abajo es el
    # que deja de tirar. Se escriben en tablas propias --N por municipio-- con el dueño
    # que el analisis pudo determinar, y nada se descarta por ser de un tercero: el
    # WhatsApp del diario local por donde entran los reclamos dice como se comunica hoy el
    # vecino, y eso es material de venta, no ruido.
    hecho.setdefault("canales", [])
    hecho.setdefault("mails_nuevos", [])

    # los telefonos que ya estan, para no cargar dos veces el mismo escrito distinto
    ya_tel = {_solo_digitos(t) for t in _lista(m.telefonos)}
    ya_tel |= {_solo_digitos(x.numero) for x in (await db.execute(
        select(CallsTelefono).where(CallsTelefono.muni_key == data.muni_key)
    )).scalars().all()}

    for t in data.telefonos:
        num = (t.numero or "").strip()
        d = _solo_digitos(num)
        if not d or re.search(r"no encontr", num, re.I):
            continue
        if d in ya_tel:
            hecho["ya_estaba"].append(num)
            continue
        ya_tel.add(d)
        db.add(CallsTelefono(
            muni_key=data.muni_key, codigo_indec=m.codigo_indec, numero=num[:40],
            orden=0, de_donde="analisis", creado=ahora))
        # solo los del municipio suben a la ficha; los de terceros quedan en el catalogo
        # con su dueño anotado, disponibles pero sin ensuciar el telefono que se marca
        if (t.de_quien or "") in ("municipio", "area", "funcionario", ""):
            tels = _lista(m.telefonos)
            meta = _dict(m.telefonos_meta)
            meta[num] = {"de": t.de or "análisis del municipio", "fuente": "analisis",
                         "estado": "por_validar", "area": t.area or "",
                         "vigencia": t.vigencia or "", "cuando": ahora.isoformat()}
            m.telefonos = json.dumps([num] + tels, ensure_ascii=False)
            m.telefonos_meta = json.dumps(meta, ensure_ascii=False)
            hecho["telefonos"].append(num)

    ya_mail = {(x.clave or "") for x in (await db.execute(
        select(CallsMail).where(CallsMail.muni_key == data.muni_key)
    )).scalars().all()}
    for x in data.mails:
        dire = (x.direccion or "").strip()
        if "@" not in dire or re.search(r"no encontr", dire, re.I):
            continue
        clave = dire.lower()
        if clave in ya_mail:
            hecho["ya_estaba"].append(dire)
            continue
        ya_mail.add(clave)
        db.add(CallsMail(
            muni_key=data.muni_key, codigo_indec=m.codigo_indec, direccion=dire[:200],
            clave=clave[:200], de_quien=(x.de_quien or "desconocido")[:20], de=(x.de or "")[:160],
            area=(x.area or "")[:120], vigencia=(x.vigencia or "")[:24],
            que_se_sabe=x.que_se_sabe or None, duda=x.duda or None,
            de_donde="analisis", relato_id=data.relato_id, creado=ahora))
        hecho["mails_nuevos"].append(dire)
        if (x.de_quien or "") in ("municipio", "area") and hasattr(m, "mail")                 and not (getattr(m, "mail", "") or "").strip():
            m.mail = dire[:120]

    ya_canal = {(x.clave or "") for x in (await db.execute(
        select(CallsCanal).where(CallsCanal.muni_key == data.muni_key)
    )).scalars().all()}
    for x in data.canales:
        dato = (x.dato or "").strip()
        if not dato or re.search(r"no encontr", dato, re.I):
            continue
        clave = _limpia(dato)[:200]
        if clave in ya_canal:
            hecho["ya_estaba"].append(dato[:60])
            continue
        ya_canal.add(clave)
        db.add(CallsCanal(
            muni_key=data.muni_key, codigo_indec=m.codigo_indec, tipo=(x.tipo or "otro")[:20],
            dato=dato[:400], clave=clave, de_quien=(x.de_quien or "desconocido")[:20],
            de=(x.de or "")[:160], area=(x.area or "")[:120], gestion=(x.gestion or "")[:120],
            vigencia=(x.vigencia or "")[:24], que_se_sabe=x.que_se_sabe or None,
            duda=x.duda or None, de_donde="analisis", relato_id=data.relato_id, creado=ahora))
        hecho["canales"].append("%s: %s" % (x.tipo, dato[:60]))
        # la web propia sigue subiendo a la ficha, que es de donde la lee la pantalla
        if x.tipo == "web" and (x.de_quien or "") in ("municipio", "area")                 and not (m.web or "").strip():
            m.web = dato[:300]
            hecho["web"] = dato

    if (hecho["hechos"] or hecho["telefonos"] or hecho["web"]
            or hecho["canales"] or hecho["mails_nuevos"]):
        m.curado_en, m.curado_por = ahora, quien.usuario
    await db.commit()

    # LA FICHA ACTUALIZADA VUELVE EN LA RESPUESTA.
    #
    # Sin esto, guardar no se veia. La pantalla no lee la base: arranca de un
    # `datos.json` de 22 MB horneado en el build, y el objeto que tiene en memoria es esa
    # foto. Se guardaban los telefonos, se guardaban los canales, y el vendedor seguia
    # mirando la ficha de antes hasta que alguien volviera a compilar.
    #
    # Devolviendola aca, el front pisa lo que tiene con lo que quedo en la base y repinta
    # en el acto. Es el mismo criterio que ya usaba `curar/telefono`, que si lo hacia.
    canales = (await db.execute(
        select(CallsCanal).where(CallsCanal.muni_key == data.muni_key)
    )).scalars().all()
    mails = (await db.execute(
        select(CallsMail).where(CallsMail.muni_key == data.muni_key)
    )).scalars().all()
    orden = {"municipio": 0, "area": 1, "funcionario": 2, "desconocido": 3, "tercero": 4}

    return {"ok": True, "muni_key": data.muni_key, "guardado": hecho,
            "ficha": {
                "telefonos": _lista(m.telefonos),
                "telefonos_meta": _dict(m.telefonos_meta),
                "web": m.web or "",
                "mail": getattr(m, "mail", "") or "",
                "canales": sorted([{
                    "tipo": c.tipo or "otro", "dato": c.dato or "", "de": c.de or "",
                    "de_quien": c.de_quien or "desconocido", "area": c.area or "",
                    "gestion": c.gestion or "", "vigencia": c.vigencia or "",
                    "que_se_sabe": c.que_se_sabe or "", "duda": c.duda or "",
                } for c in canales], key=lambda x: (orden.get(x["de_quien"], 3), x["tipo"])),
                "mails": sorted([{
                    "direccion": x.direccion or "", "de": x.de or "",
                    "de_quien": x.de_quien or "desconocido", "area": x.area or "",
                    "vigencia": x.vigencia or "", "que_se_sabe": x.que_se_sabe or "",
                    "duda": x.duda or "",
                } for x in mails], key=lambda x: orden.get(x["de_quien"], 3)),
            },
            "nota": "se sumo a la ficha; no se piso ni se borro nada, y el angulo de "
                    "entrada quedo como estaba"}


def _limpia(u: str) -> str:
    return re.sub(r"^https?://(www\.)?|/$", "", (u or "").strip().lower())
