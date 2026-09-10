# -*- coding: utf-8 -*-
"""LA CURACION DE UNA FICHA, desde la pantalla y en el momento.

El vendedor abre la ficha del municipio que va a llamar, ve que no tiene telefono, toca
un boton y el sistema se lo busca. Eso es esto.

POR QUE ESTA ACA Y NO EN UN SCRIPT
----------------------------------
Hasta hoy vivia en `munify-calls/scripts/servir_local.py`: un servidor de Python que
corre en la maquina del dueno. Funcionaba, pero solo ahi. En `calls.munify.com.ar` los
botones ni siquiera se dibujaban, porque el endpoint no existia.

Y esto tiene que andar en la calle: el vendedor no cura desde una terminal.

DOS ENDPOINTS Y NO UNO, A PROPOSITO
-----------------------------------
El del telefono es una consulta chiquita que busca un numero. El comercial es una
investigacion sobre el municipio. Mezclarlos hace que conseguir un telefono cueste lo que
cuesta una investigacion (dueno, 2026-09-08).

LO QUE CUESTA
-------------
Gemini con `google_search` sale **3,5 centavos por request**, y se cobra por REQUEST, no
por modelo: medido el 2026-09-09, `gemini-2.5-flash` y `gemini-flash-lite-latest` cuestan
lo mismo (0,0354 contra 0,0350) y el barato encuentra menos --no dio con el telefono de
Brea Pozo que el bueno si encontro--. Por eso va el bueno.

Por eso tambien: **login obligatorio y rate limit**. Es un boton que gasta plata; sin
guardia, cualquiera con la URL vacia la cuenta.

QUE SE GUARDA, Y POR QUE TANTO
------------------------------
El numero, **de quien es** y **de donde salio**. Guardar solo el numero fue un error real:
el 2026-09-09 la pantalla mostro "Comisaria de Acheral", al guardar quedo unicamente el
numero, y la ficha del municipio de Acheral termino con el telefono de la comisaria sin
que nadie pudiera darse cuenta. El dato para descartarlo existia y se tiraba.
"""
import json
import re
import urllib.error
import urllib.request
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.calls import CallsUsuario, usuario_calls
from core.config import settings
from core.database import get_db
from core.rate_limit import limiter
from models.calls import CallsMunicipio
from models.calls_curacion import CallsFuente, CallsRelato, CallsTelefono

router = APIRouter()

# Se fija explicito y no se toma de `settings.GEMINI_MODEL`: ese default es
# `gemini-1.5-flash`, que NO soporta busqueda en internet. Sin busqueda este endpoint no
# sirve para nada, asi que no puede depender de una variable que otra app podria cambiar.
MODELO = "gemini-2.5-flash"
URL_GEMINI = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "%s:generateContent?key=%s")
COSTO_POR_BUSQUEDA = 0.035


class Pedido(BaseModel):
    muni_key: str = Field(min_length=2, max_length=80)
    # EL NUMERO QUE NO ANDA. Es el motivo real por el que alguien toca este boton: llamo,
    # le dijeron que no existe, y necesita otro. Mandarlo sirve para dos cosas --pedirle
    # al modelo uno DISTINTO y dejar anotado que ese esta muerto-- y hasta hoy se perdia.
    malo: Optional[str] = Field(default=None, max_length=40)


# --------------------------------------------------------------------------- #
def _gemini(prompt, timeout=90):
    """Una llamada a Gemini CON busqueda en internet.

    `tools: [{google_search: {}}]` es todo lo que hace falta. El modelo decide solo que
    consultas manda; despues devuelve en `groundingMetadata.webSearchQueries` que busco
    realmente, que sirve para entender por que no encontro algo.
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Sin GEMINI_API_KEY en el servidor: la curacion necesita la key con "
                   "facturacion, que es la unica que busca en internet")
    cuerpo = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
    }).encode()
    req = urllib.request.Request(
        URL_GEMINI % (MODELO, settings.GEMINI_API_KEY), data=cuerpo,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        cuerpo_err = e.read().decode("utf-8", "replace")[:300]
        # 400 API_KEY_INVALID con una key que existe casi siempre es la key sin
        # `restrictions.apiTargets`, o un secreto con `\r\n` pegado (42 bytes en vez de
        # 39). Las dos dan el mismo mensaje y mandan a buscar el error al lado equivocado.
        raise HTTPException(status_code=502,
                            detail="Gemini respondio %s: %s" % (e.code, cuerpo_err))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo llamar a Gemini: %s" % e)
    try:
        texto = d["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Gemini contesto vacio")
    return texto, d


def _json_de(texto: str) -> dict:
    """El JSON que devolvio el modelo. Se busca la llave, no se asume que venga limpio.

    `google_search` y `responseMimeType: application/json` son incompatibles en Gemini
    --no se puede pedir JSON estricto y buscar al mismo tiempo--, asi que el modelo
    contesta en prosa con el JSON adentro y hay que recortarlo.
    """
    m = re.search(r"\{.*\}", texto, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except ValueError:
        return {}


def _meta_de(f: CallsMunicipio) -> dict:
    """La marca de cada telefono: de quien es, de donde salio, si ya se probo."""
    try:
        m = json.loads(f.telefonos_meta) if f.telefonos_meta else {}
    except ValueError:
        m = {}
    return m if isinstance(m, dict) else {}


def _lista(txt) -> list:
    try:
        v = json.loads(txt) if txt else []
    except ValueError:
        v = []
    return v if isinstance(v, list) else []


async def _ficha(db: AsyncSession, muni_key: str) -> CallsMunicipio:
    f = (await db.execute(
        select(CallsMunicipio).where(CallsMunicipio.muni_key == muni_key)
    )).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="No conozco ese municipio")
    return f


def _como_se_llama(f: CallsMunicipio) -> str:
    """El ente no siempre es una municipalidad.

    Hay comunas, comisiones de fomento y juntas de gobierno. Buscar "Municipalidad de X"
    cuando es una comuna no encuentra nada, y ademas arranca mal la llamada.
    """
    t = (f.tipo_gobierno or "municipio").lower()
    if "comuna" in t:
        return "Comuna de %s" % f.municipio
    if "comision" in t:
        return "Comision Municipal de %s" % f.municipio
    if "junta" in t:
        return "Junta de Gobierno de %s" % f.municipio
    return "Municipalidad de %s" % f.municipio


# --------------------------------------------------------------------------- #
@router.post("/curar/telefono")
@limiter.limit("40/hour")
async def curar_telefono(
    request: Request,
    data: Pedido,
    db: AsyncSession = Depends(get_db),
    quien: CallsUsuario = Depends(usuario_calls),
):
    """Busca el telefono de un municipio y lo guarda con su procedencia.

    Devuelve lo que encontro para que la ficha se actualice sin recargar la pagina.
    """
    f = await _ficha(db, data.muni_key)
    malo = (data.malo or "").strip()
    ahora = datetime.utcnow()
    filas = (await db.execute(
        select(CallsTelefono).where(CallsTelefono.muni_key == data.muni_key)
    )).scalars().all()
    ya = [x.numero for x in filas]
    # El array plano de la ficha puede tener numeros que nunca se normalizaron a la tabla
    # --los que vinieron del padron--. Si no se cuentan, el modelo devuelve uno que YA
    # teniamos y termina duplicado en la pantalla.
    for n in _lista(f.telefonos):
        if n not in ya:
            ya.append(n)
    otros = [n for n in ya if n != malo]
    meta = _meta_de(f)

    # EL QUE NO ANDA SE ANOTA ANTES DE BUSCAR: si la busqueda falla o el modelo se cae, el
    # dato de que ese numero esta muerto igual queda. Cuesta una llamada de un vendedor
    # que hace cinco por dia; perderlo porque fallo OTRA cosa seria absurdo.
    if malo:
        habia = False
        for fila in filas:
            if fila.numero == malo:
                fila.atiende, habia = False, True
        if not habia:
            # venia del array plano de la ficha y nunca tuvo fila propia
            db.add(CallsTelefono(muni_key=data.muni_key, codigo_indec=f.codigo_indec,
                                 numero=malo[:40], orden=99, de_donde="ficha",
                                 atiende=False, creado=ahora))
        meta[malo] = dict(meta.get(malo) or {}, estado="no_anda",
                          cuando=ahora.isoformat(), quien=quien.usuario)

    prompt = (
        "Necesito el telefono de la %s, %s, Argentina.\n\n"
        "Proba varias busquedas distintas antes de rendirte: el nombre con 'telefono', "
        "con 'contacto', en el padron de gobiernos locales de la provincia, en la "
        "agencia tributaria provincial, en guias de tramites, en el portal de la "
        "provincia, en su pagina de Facebook y en noticias locales.\n\n"
        "Preferi la linea de conmutador o mesa de entradas: tiene que atender una "
        "persona. Si encontras un celular o un WhatsApp institucional, traelo igual y "
        "decilo.\n\n"
        "%s%s"
        "Devolve SOLO un JSON:\n"
        '{\"telefonos\":[{\"numero\":\"con codigo de area, como se marca\",'
        '\"de_quien\":\"a que oficina o entidad pertenece la linea\",'
        '\"url\":\"la pagina donde lo viste\"}]}\n'
        "Si no encontras ninguno del municipio, devolve {\"telefonos\":[]} y NO des el "
        "de otra entidad. No inventes."
        % (_como_se_llama(f), f.provincia,
           ("El %s NO FUNCIONA: llamamos y no atiende, o no existe. Ese no me lo "
            "devuelvas; si sabes cual lo reemplazo, decimelo.\n\n" % malo)
           if malo else "",
           ("Estos ya los tenemos, no los repitas: %s\n\n" % ", ".join(otros)) if otros else ""))

    texto, crudo = _gemini(prompt)
    encontrados = (_json_de(texto).get("telefonos") or [])[:6]

    # El crudo se guarda SIEMPRE, encuentre o no. Cuando algo sale mal, comparar el crudo
    # contra lo que la pantalla mostro es lo unico que permite ver donde se rompio.
    db.add(CallsRelato(muni_key=data.muni_key, codigo_indec=f.codigo_indec,
                       motor="gemini", modelo=MODELO, variante="telefono",
                       texto=texto, costo_usd=COSTO_POR_BUSQUEDA, busquedas=1,
                       creado=ahora))

    nuevos = []
    vistos = set(ya)
    for i, t in enumerate(encontrados):
        num = str(t.get("numero") or "").strip()[:40]
        if not num or num in vistos:
            continue
        vistos.add(num)
        de_quien = str(t.get("de_quien") or "").strip()
        u = str(t.get("url") or "").strip()
        nuevos.append({"numero": num, "de_quien": de_quien, "url": u})
        db.add(CallsTelefono(muni_key=data.muni_key, codigo_indec=f.codigo_indec,
                             numero=num, orden=i, de_donde="gemini", creado=ahora))
        # LA MARCA: lo trajo un modelo y NO LO LLAMO NADIE todavia. En la pantalla tiene
        # que verse distinto de uno que ya atendio, o el vendedor no sabe cual esta
        # probando. De quien es la linea va junto: es lo unico que permite darse cuenta
        # de que el numero no era del municipio antes de marcarlo.
        meta[num] = {"de": de_quien, "url": u, "fuente": "gemini",
                     "estado": "por_validar", "cuando": ahora.isoformat()}
        if u.startswith("http"):
            db.add(CallsFuente(
                muni_key=data.muni_key, codigo_indec=f.codigo_indec,
                provincia=f.provincia, dominio=urlparse(u).netloc.replace("www.", "")[:200],
                # de quien es va junto con la URL: es lo unico que permite descartar
                # despues un numero que no era del municipio
                url=("%s | %s" % (t.get("de_quien") or "", u))[:2000],
                de_donde="gemini", buscando="telefono", creado=ahora))

    # EL ORDEN DE LA FICHA, que es lo que la pantalla dibuja. Lo nuevo ADELANTE --es lo
    # que hay que probar-- y el que no anda al fondo del todo. No se borra: saber que un
    # numero esta muerto vale tanto como el que atiende, y sin dejarlo a la vista alguien
    # lo vuelve a cargar a mano dentro de un mes.
    if nuevos or malo:
        viejos = _lista(f.telefonos)
        quedan = [x for x in viejos if x != malo]
        al_fondo = [malo] if (malo and malo in viejos) else []
        f.telefonos = json.dumps([x["numero"] for x in nuevos] + quedan + al_fondo,
                                 ensure_ascii=False)
        f.telefonos_meta = json.dumps(meta, ensure_ascii=False)
        f.curado_en, f.curado_por = ahora, quien.usuario
    await db.commit()

    return {"ok": True, "muni_key": data.muni_key, "encontrados": nuevos,
            "ya_tenia": ya, "malo": malo,
            # la ficha YA ORDENADA, para que la pantalla se redibuje sin recargar
            "telefonos": _lista(f.telefonos), "telefonos_meta": meta,
            "costo_usd": COSTO_POR_BUSQUEDA,
            "busco": ((crudo.get("candidates") or [{}])[0]
                      .get("groundingMetadata", {}).get("webSearchQueries") or [])[:4],
            "nota": "" if nuevos else texto[:400]}


@router.post("/curar/comercial")
@limiter.limit("30/hour")
async def curar_comercial(
    request: Request,
    data: Pedido,
    db: AsyncSession = Depends(get_db),
    quien: CallsUsuario = Depends(usuario_calls),
):
    """Renueva lo que sabemos del municipio: que hace, que le pasa, con quien trabaja.

    No pide un JSON cocinado: pide PROSA. Pedirle al modelo que busque y encasille al
    mismo tiempo hace que encasille mal --y ademas `google_search` y el modo JSON
    estricto son incompatibles en Gemini--. La prosa se guarda entera y se segmenta
    despues, que ademas permite reprocesarla gratis cuando cambie el criterio.
    """
    f = await _ficha(db, data.muni_key)
    prompt = (
        "Contame que esta pasando en la %s, %s, Argentina, en los ultimos meses.\n\n"
        "Me interesa lo que le sirve a alguien que le va a vender un sistema de gestion "
        "municipal:\n"
        "- que obras o servicios esta encarando, con cifras y fechas si las hay\n"
        "- que problemas tiene: reclamos, conflictos, cosas que no funcionan\n"
        "- si compro o contrato algun sistema, plataforma o software, y a quien\n"
        "- que publica sobre su dinero: presupuesto, licitaciones, compras, boletin\n"
        "- quien conduce y de que viene: profesion, trayectoria, de que habla\n"
        "- de que vive el municipio: produccion, industria, turismo\n\n"
        "Escribi en prosa, en parrafos, citando la fuente de cada cosa. Contame lo que "
        "ENCONTRASTE, no lo que suponés. Si de algo no hay informacion, decilo."
        % (_como_se_llama(f), f.provincia))

    texto, _crudo = _gemini(prompt, timeout=120)
    ahora = datetime.utcnow()
    db.add(CallsRelato(muni_key=data.muni_key, codigo_indec=f.codigo_indec,
                       motor="gemini", modelo=MODELO, variante="comercial",
                       texto=texto, costo_usd=COSTO_POR_BUSQUEDA, busquedas=1,
                       creado=ahora))
    f.curado_en, f.curado_por = ahora, quien.usuario
    await db.commit()
    return {"ok": True, "muni_key": data.muni_key, "texto": texto,
            "costo_usd": COSTO_POR_BUSQUEDA,
            "nota": "guardado como relato crudo; la segmentacion en hechos y tags corre "
                    "aparte"}
