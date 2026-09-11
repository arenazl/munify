# -*- coding: utf-8 -*-
"""DE LA PROSA AL PERFIL: primero traducir, despues comparar.

Gemini trae prosa --con libertad, que es lo unico que hace que traiga algo bueno-- y
esto la convierte en hechos que la aplicacion puede usar. Corre con Groq, que es gratis,
asi que se puede repetir todas las veces que haga falta mientras se cura el criterio.

POR QUE SON DOS LLAMADOS, Y POR QUE ESTE CORTE
----------------------------------------------
No es por espacio: `gpt-oss-120b` tiene 128k de ventana y un relato entero con el
vocabulario y la ficha ocupan unos 3.000 tokens, el 2,5%.

El corte es (dueno, 2026-09-10): **uno traduce a nuestro formato, el otro compara.**

1. TRADUCIR: la prosa entra y sale en el contrato de la aplicacion --tag, universo,
   peso, fecha--. Es el unico que ve texto libre.
2. COMPARAR: recibe DOS LISTAS EN EL MISMO FORMATO, la nueva y la que ya teniamos, y
   dice que cambio. No lee prosa, no sabe de municipios, no sabe de venta: compara dos
   conjuntos de hechos homogeneos. Por eso es agnostico y sirve para cualquier fuente
   --Gemini hoy, el crawler o ChatGPT manana-- sin tocarle una linea.

Juntarlos obligaba al comparador a entender prosa y a inventar tags mientras juzga:
peras contra manzanas. Separados, cada uno hace una sola cosa y la hace mejor.

Y hay un beneficio de costo: lo traducido queda guardado. Si cambia el criterio de
comparacion se vuelve a correr solo el paso 2, gratis.

EL NOMBRE LIBRE SE CONSERVA
---------------------------
El paso 1 tagea, pero ademas devuelve `como_lo_llamarias`: con que palabras habria
nombrado el modelo ese hecho si no existiera nuestra lista. Se guarda al lado del tag
elegido. El 2026-09-08 se midio que un vocabulario puesto adelante pierde la mitad de
los temas; teniendo las dos cosas se puede ver, hecho por hecho, cuando la lista esta
forzando algo -- en vez de sospecharlo.

QUE NO HACE ESTO
----------------
NO ESCRIBE EN LA FICHA. Ni un campo. Devuelve lo que Groq propone y ahi termina: la
ponderacion es un criterio comercial del dueno y se cura mirandola, no aplicandola a
2.244 municipios de una. El paso de aplicar se agrega cuando el criterio este validado.

Y NADA SE BORRA NUNCA. Cuando exista el aplicar, el dato viejo pasa a historico con su
fecha; el veredicto `contradice` no toca nada y queda para que lo mire una persona.
"""
import asyncio
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.calls import CallsUsuario, usuario_calls
from core.config import settings
from core.database import get_db
from core.rate_limit import limiter
from models.calls import CallsMunicipio
from models.calls_curacion import CallsConfig, CallsHecho, CallsRelato
from services.groq_common import llamar_groq

router = APIRouter()

# Los tres ejes con los que se pondera un municipio. Salen de `calls_ponderacion`, no se
# inventan aca.
UNIVERSOS = ("vecino", "plata", "operacion")

# Los cuatro veredictos al comparar. `contradice` es el unico que NO se resuelve solo:
# va a una bandeja humana.
VEREDICTOS = ("confirma", "actualiza", "contradice", "agrega")


class Pedido(BaseModel):
    muni_key: str = Field(min_length=2, max_length=80)
    # Cual relato traducir. Sin esto va el ultimo comercial, que es lo normal; se pasa
    # explicito para reprocesar uno viejo y comparar criterios.
    relato_id: Optional[int] = None


# --------------------------------------------------------------------------- #
# EL CUPO DE GROQ NO ES POR LLAMADAS, ES POR TOKENS Y POR MINUTO. Medido el 2026-09-10
# contra los headers de la API en el plan gratuito de `gpt-oss-120b`:
#
#   x-ratelimit-limit-requests   1000    por DIA
#   x-ratelimit-limit-tokens     8000    por MINUTO
#
# De llamadas sobra --mil por dia para diez o quince curaciones--. Lo que frena es el
# cupo por minuto, y ahi entra TODO: el prompt, la prosa y el `max_tokens` de salida,
# que Groq reserva entero aunque la respuesta use la mitad.
#
# Con un relato largo la cuenta daba 9.134 contra 8.000: UNA SOLA llamada no entraba, y
# parecia que se habia agotado una cuota que estaba intacta (999 de 1000 requests). Los
# 4.000 de salida que habia puesto "por las dudas" eran casi la mitad del problema.
MAX_SALIDA = 2000

# Cuando aun asi se toca el techo, esperar y reintentar: el cupo se repone por minuto,
# asi que el reintento no es terquedad, es esperar a que se abra la ventana.
ESPERA_429 = 35


async def _groq_json(prompt: str, feature: str, max_tokens: int = MAX_SALIDA,
                     reintentos: int = 2) -> dict:
    """Una llamada a Groq que tiene que devolver JSON.

    `json_object=True` obliga al modelo a devolver un objeto valido. Aun asi se parsea
    defensivo: si algun dia devuelve texto con el JSON adentro, es mejor rescatarlo que
    perder la corrida entera.
    """
    r = await llamar_groq(prompt, feature=feature, max_tokens=max_tokens,
                          temperature=0.1, json_object=True, timeout=90.0)
    while (not r.ok) and reintentos > 0 and "429" in str(r.detalle or ""):
        await asyncio.sleep(ESPERA_429)
        reintentos -= 1
        r = await llamar_groq(prompt, feature=feature, max_tokens=max_tokens,
                              temperature=0.1, json_object=True, timeout=90.0)
    if not r.ok:
        raise HTTPException(status_code=502, detail=r.detalle or "Groq no respondio")
    txt = (r.texto or "").strip()
    try:
        return json.loads(txt)
    except ValueError:
        m = re.search(r"\{.*\}", txt, re.S)
        if not m:
            raise HTTPException(status_code=502, detail="Groq no devolvio JSON: " + txt[:200])
        try:
            return json.loads(m.group(0))
        except ValueError:
            raise HTTPException(status_code=502, detail="Groq devolvio JSON roto: " + txt[:200])


async def _vocabulario(db: AsyncSession) -> list:
    """Los tags que la aplicacion USA HOY, leidos de la base.

    No se hardcodean: el vocabulario crece a medida que se cura, y una lista escrita a
    mano en el codigo queda vieja el primer dia.
    """
    filas = (await db.execute(select(CallsHecho.tag).distinct())).scalars().all()
    return sorted(t for t in filas if t)


def _lineas(*partes) -> str:
    return "\n".join(partes)


# --------------------------------------------------------------------------- #
# PASO 1 - TRADUCIR. El unico que ve prosa. Sale en el contrato de la aplicacion.
# --------------------------------------------------------------------------- #
def _prompt_traducir(nombre: str, provincia: str, prosa: str, vocabulario: list) -> str:
    return _lineas(
        "Abajo hay un texto sobre %s, %s, Argentina, que escribio otro modelo despues de" % (nombre, provincia),
        "buscar en internet. Convertilo en datos estructurados.",
        "",
        # NO PONER UN NUMERO ACA. Antes decia "preferi DIEZ hechos chicos a tres largos"
        # y el modelo lo leyo como la cuota: sacaba nueve o diez sin importar cuanto
        # material tuviera. Medido el 2026-09-10 sobre 20 corridas: con una prosa de
        # 3.993 caracteres sacaba 8,6 hechos y con una de 12.893 sacaba 9,8 -- se tiraba
        # el 70% de lo que habia encontrado la busqueda, y encima hacia que dos prompts
        # muy distintos midieran igual. El techo de salida ni se rozaba: no era falta de
        # espacio, era el numero escrito en la frase.
        "PRIMERO partilo en HECHOS SUELTOS. Un hecho es una cosa sola que pasa o que es",
        "cierta: si un parrafo dice tres cosas, son tres hechos.",
        "",
        "SACALOS TODOS. No resumas, no elijas los mejores, no te guardes ninguno: si el",
        "texto menciona veinte cosas, quiero veinte hechos. Lo que sobra lo filtro yo",
        "despues; lo que no me traigas no lo puedo recuperar. Eso si: no agregues nada",
        "que el texto no diga.",
        "",
        "Esto le sirve a un vendedor que va a llamar por telefono al intendente para",
        "ofrecerle un sistema de gestion municipal: reclamos del vecino, tramites, gastos",
        "y cajas, empleados, patrimonio, comunicacion.",
        "",
        "LOS TRES EJES con los que medimos un municipio:",
        "- vecino: la relacion con el vecino (reclamos, tramites, comunicacion, atencion)",
        "- plata: presupuesto, compras, licitaciones, tasas, transparencia, boletin",
        "- operacion: cuadrillas, obras, caminos, residuos, alumbrado, agua, recursos",
        "",
        "EL VOCABULARIO que ya usa la aplicacion:",
        ", ".join(vocabulario[:400]),
        "",
        "De cada hecho quiero:",
        '- "que": el hecho en una frase corta, con sus numeros y nombres propios',
        '- "cuando": mes y ano si el texto lo dice (formato 2026-03), o "" si no lo dice',
        '- "de_quien": "municipio" si es de este municipio; "provincia" si en realidad es',
        '  de la provincia o de otro lugar y solo esta mencionado de paso; "pais" si es nacional',
        '- "como_lo_llamarias": con TUS palabras, dos o tres, de que trata. Esto es ANTES',
        "  de mirar nuestra lista: quiero saber como lo nombrarias vos.",
        '- "tag": recien ahora, el de nuestro vocabulario que mejor le va',
        '- "tag_nuevo": true si ninguno encajaba y tuviste que proponer uno. Proponelo con',
        "  la misma forma familia:concepto. Es preferible un tag nuevo honesto a meter el",
        "  hecho a la fuerza en uno que no es.",
        '- "universo": vecino, plata u operacion',
        '- "peso": del 1 al 5, cuanto mueve la aguja para VENDER. 5 = por aca entro la',
        "  llamada; 1 = color de fondo.",
        '- "sirve_para": para que le sirve al vendedor, en una frase que se pueda decir por',
        '  telefono. "" si no le sirve para nada.',
        '- "seguro": true si el texto lo afirma; false si lo dice con dudas o como rumor',
        "",
        "Aparte:",
        '- "contacto": telefono, mail y web del MUNICIPIO si el texto los trae ("" si no)',
        '- "descartados": los hechos con de_quien distinto de "municipio", cada uno con',
        '  "que" y "por_que_no_va". No los tires: los quiero ver.',
        "",
        "Devolve SOLO este JSON:",
        '{"hechos":[{"que":"","cuando":"","de_quien":"municipio","como_lo_llamarias":"",'
        '"tag":"","tag_nuevo":false,"universo":"","peso":3,"sirve_para":"","seguro":true}],'
        '"contacto":{"telefono":"","mail":"","web":""},'
        '"descartados":[{"que":"","por_que_no_va":""}]}',
        "",
        "----- EL TEXTO -----",
        prosa,
    )


# --------------------------------------------------------------------------- #
# PASO 2 - COMPARAR. Agnostico: dos listas del mismo formato y nada mas.
# --------------------------------------------------------------------------- #
def _prompt_comparar(nuevos: list, viejos: list) -> str:
    """A proposito NO menciona municipios, ni venta, ni Gemini.

    Recibe dos conjuntos de hechos con el mismo contrato y dice que cambio. Asi el mismo
    comparador sirve para cualquier fuente sin tocarle una linea, y no puede hacer trampa
    apoyandose en el dominio en vez de en los datos.
    """
    return _lineas(
        "Tenes dos conjuntos de hechos sobre la MISMA entidad, los dos con el mismo",
        "formato: uno es lo que ya teniamos guardado y el otro es lo que se acaba de",
        "averiguar. Deci que hay que hacer con cada hecho nuevo.",
        "",
        "Por cada hecho de la lista NUEVA, uno de estos cuatro veredictos:",
        '  "confirma"   = ya lo sabiamos y dice lo mismo. No cambia nada, solo da mas certeza.',
        '  "actualiza"  = habla de lo mismo que un hecho viejo pero es MAS NUEVO o mas preciso.',
        '  "contradice" = es incompatible con un hecho viejo. Los dos no pueden ser ciertos.',
        '  "agrega"     = no hay nada parecido en lo viejo. Es informacion que no teniamos.',
        "",
        "Reglas:",
        "- Compara por lo que DICE el hecho, no por el tag: dos hechos con el mismo tag",
        "  pueden hablar de cosas distintas, y dos con tags distintos pueden ser el mismo.",
        '- "actualiza" y "contradice" tienen que decir CUAL es el hecho viejo afectado,',
        '  copiandolo en "reemplaza_a". Si no podes senalar uno, no es ninguno de los dos.',
        "- Ante la duda entre actualiza y contradice, elegi contradice: lo va a mirar una",
        "  persona, y equivocarse hacia ese lado no rompe nada.",
        "- Si la lista vieja esta vacia, todo es \"agrega\".",
        "",
        "Devolve SOLO este JSON:",
        '{"veredictos":[{"que":"","veredicto":"","reemplaza_a":"","porque":""}]}',
        "",
        "----- LO QUE YA TENIAMOS -----",
        json.dumps(viejos, ensure_ascii=False) if viejos else "[]",
        "",
        "----- LO NUEVO -----",
        json.dumps(nuevos, ensure_ascii=False),
    )


# --------------------------------------------------------------------------- #
@router.get("/curar/prompts")
async def prompts(
    muni_key: str = "",
    db: AsyncSession = Depends(get_db),
    _quien: CallsUsuario = Depends(usuario_calls),
):
    """LOS PROMPTS, a la vista y tal como se mandan.

    Un prompt que no se puede leer no se puede discutir: se termina opinando de memoria
    sobre lo que uno cree que dice (dueno, 2026-09-10). Se devuelven ya armados con el
    municipio que se esta mirando, que es como van a viajar de verdad.

    Ademas de los dos comerciales va el de traduccion de Groq: el que convierte la prosa
    en hechos es tan responsable del resultado como el que sale a buscar.
    """
    from api.calls_curar import _prompt_comercial, prompt_activo

    nombre, prov = "el municipio", "la provincia"
    if muni_key:
        m = (await db.execute(
            select(CallsMunicipio).where(CallsMunicipio.muni_key == muni_key)
        )).scalar_one_or_none()
        if m is not None:
            nombre = "Municipalidad de %s" % (m.municipio or muni_key)
            prov = m.provincia or prov

    vocab = await _vocabulario(db)
    activo = await prompt_activo(db)
    return {"prompts": [
        # EL QUE SE USA. Uno solo, editable. Va primero porque es el que importa.
        {"id": "activo", "nombre": "El prompt", "editable": True, "activo": True,
         "que_es": ("Este es el que corre en cada analisis. Escribi {{MUNICIPIO}}, "
                    "{{PROVINCIA}} y {{PAIS}} donde vayan esos datos." if activo else
                    "Todavia esta vacio: hasta que escribas uno se usa la plantilla B."),
         "texto": activo},
        # LAS PLANTILLAS. No se usan para traer: estan para partir de ellas y para no
        # perder de donde venimos (dueno, 2026-09-10).
        # LAS PLANTILLAS VAN CON LOS TOKENS, no resueltas con el municipio que se esta
        # mirando. Se arman pasando los tokens como si fueran el nombre. Mostrarlas ya
        # resueltas hacia que "usar de base" copiara "Santo Tomas, Neuquen" adentro del
        # prompt, y ese prompt despues preguntaba por Santo Tomas en TODAS las fichas
        # (dueno, 2026-09-10, mirando la pantalla). El error no se ve: el texto vuelve
        # bien escrito, sobre el municipio equivocado.
        {"id": "v1", "nombre": "Plantilla A (el original)", "plantilla": True,
         "que_es": "El pedido comercial como estaba. No dice nada sobre fechas.",
         "texto": _prompt_comercial("{{MUNICIPIO}}", "{{PROVINCIA}}", "v1")},
        {"id": "v2", "nombre": "Plantilla B (con fechas)", "plantilla": True,
         "que_es": "Agrega: prioriza el ultimo ano y pide datar cada hecho.",
         "texto": _prompt_comercial("{{MUNICIPIO}}", "{{PROVINCIA}}", "v2")},
        {"id": "traducir", "nombre": "Groq 1 - traducir",
         "que_es": "Convierte la prosa en hechos con tag, universo y peso. No se edita desde aca.",
         "texto": _prompt_traducir(nombre, prov, "[aca va la prosa que trajo Gemini]", vocab)},
        {"id": "comparar", "nombre": "Groq 2 - comparar",
         "que_es": "Recibe dos listas de hechos del mismo formato y dice que cambio.",
         "texto": _prompt_comparar([{"que": "[los hechos nuevos]"}], [{"que": "[los que ya teniamos]"}])},
    ]}


class PromptC(BaseModel):
    texto: str = Field(default="", max_length=8000)


@router.put("/curar/prompts/c")
async def guardar_prompt(
    data: PromptC,
    db: AsyncSession = Depends(get_db),
    quien: CallsUsuario = Depends(usuario_calls),
):
    """Guarda EL prompt comercial. Uno solo para toda la aplicacion.

    Se edita desde la cocina de cualquier municipio por comodidad, pero lo que se guarda
    no es de ese municipio: es el prompt con el que se va a preguntar en todos.
    """
    from api.calls_curar import CLAVE_PROMPT

    fila = (await db.execute(
        select(CallsConfig).where(CallsConfig.clave == CLAVE_PROMPT)
    )).scalar_one_or_none()
    if fila is None:
        fila = CallsConfig(clave=CLAVE_PROMPT)
        db.add(fila)
    fila.valor, fila.quien = data.texto, quien.usuario
    await db.commit()
    return {"ok": True, "largo": len(data.texto or "")}


# --------------------------------------------------------------------------- #
@router.get("/curar/relatos/{muni_key}")
async def relatos(
    muni_key: str,
    db: AsyncSession = Depends(get_db),
    _quien: CallsUsuario = Depends(usuario_calls),
):
    """Todo lo que se trajo de este municipio, de lo mas nuevo a lo mas viejo.

    Releer NO CUESTA NADA: la prosa ya se pago cuando se trajo. Sin esto, mirar lo que
    dijo el modelo la semana pasada obligaria a pedirlo de nuevo y pagarlo otra vez.

    Ademas es lo que permite comparar corridas: dos relatos del mismo municipio con
    prompts distintos, uno al lado del otro.
    """
    filas = (await db.execute(
        select(CallsRelato).where(CallsRelato.muni_key == muni_key)
        .order_by(CallsRelato.id.desc()).limit(20)
    )).scalars().all()
    return {"muni_key": muni_key, "relatos": [
        {"id": r.id, "variante": r.variante, "modelo": r.modelo,
         "cuando": r.creado.isoformat() if r.creado else "",
         "costo_usd": float(r.costo_usd or 0), "texto": r.texto or "",
         # con que se pidio: es lo que permite entender por que salio asi
         "prompt": r.prompt or ""}
        for r in filas]}


# --------------------------------------------------------------------------- #
@router.post("/curar/procesar")
@limiter.limit("60/hour")
async def procesar(
    request: Request,
    data: Pedido,
    db: AsyncSession = Depends(get_db),
    _quien: CallsUsuario = Depends(usuario_calls),
):
    """La prosa cruda convertida en hechos con veredicto. NO escribe en la ficha.

    Devuelve los dos pasos por separado porque lo que se esta curando es el criterio, y
    para eso hay que poder ver en cual de los dos se rompio.
    """
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Sin GROQ_API_KEY en el servidor")

    m = (await db.execute(
        select(CallsMunicipio).where(CallsMunicipio.muni_key == data.muni_key)
    )).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail="No conozco esa ficha")

    q = select(CallsRelato).where(CallsRelato.muni_key == data.muni_key)
    q = q.where(CallsRelato.id == data.relato_id) if data.relato_id else \
        q.where(CallsRelato.variante.like("comercial%"))
    relato = (await db.execute(q.order_by(CallsRelato.id.desc()).limit(1))).scalar_one_or_none()
    if relato is None:
        raise HTTPException(status_code=404,
                            detail="Todavia no se trajo nada de este municipio: primero tocá analizar")

    nombre, prov = m.municipio or data.muni_key, m.provincia or ""

    # --- paso 1: traducir la prosa a nuestro contrato ---
    vocab = await _vocabulario(db)
    traducido = await _groq_json(
        _prompt_traducir(nombre, prov, relato.texto or "", vocab), "calls_traducir")
    nuevos = [h for h in (traducido.get("hechos") or [])
              if (h.get("de_quien") or "municipio") == "municipio"]

    # --- paso 2: comparar dos listas del MISMO formato ---
    # Lo viejo se lleva al mismo contrato antes de comparar: es justamente lo que evita
    # comparar peras con manzanas.
    viejos = [{"que": (h.texto or "")[:300], "tag": h.tag, "cuando": "",
               "universo": h.universo or "", "peso": h.peso or 0}
              for h in (await db.execute(
                  select(CallsHecho).where(CallsHecho.muni_key == data.muni_key).limit(80)
              )).scalars().all()]

    veredictos = []
    if nuevos:
        comp = await _groq_json(_prompt_comparar(nuevos, viejos), "calls_comparar")
        veredictos = comp.get("veredictos") or []

    # se pegan los veredictos sobre los hechos, que es como se miran
    por_que = {v.get("que"): v for v in veredictos}
    for h in nuevos:
        v = por_que.get(h.get("que")) or {}
        h["veredicto"] = v.get("veredicto") or ("agrega" if not viejos else "")
        h["reemplaza_a"] = v.get("reemplaza_a") or ""
        h["porque"] = v.get("porque") or ""

    cuenta = {v: 0 for v in VEREDICTOS}
    for h in nuevos:
        if h.get("veredicto") in cuenta:
            cuenta[h["veredicto"]] += 1

    return {
        "ok": True, "muni_key": data.muni_key, "municipio": nombre,
        "relato_id": relato.id,
        "relato_creado": relato.creado.isoformat() if relato.creado else "",
        "hechos": nuevos,
        "descartados": traducido.get("descartados") or [],
        "contacto": traducido.get("contacto") or {},
        "cuenta": cuenta,
        "ya_sabiamos": len(viejos),
        "nota": "propuesta de Groq. NO se escribio nada en la ficha.",
    }
