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
from services.calls_parser import parsear
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
    # Reintentar tiene sentido cuando el limite es por MINUTO --la ventana se repone sola--
    # y no tiene ninguno cuando es el del DIA: ahi cada reintento es una espera de 35
    # segundos con cero chance. Medido el 2026-09-13: diecinueve seguidos.
    while (not r.ok) and reintentos > 0 and "por minuto (429)" in str(r.detalle or ""):
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
def _prompt_traducir(nombre: str, provincia: str, prosa: str, vocabulario: list,
                     con_ids: bool = False) -> str:
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
        # EL ID DE ORIGEN. Sin esto lo unico que se puede afirmar es "no fallo ninguna
        # tanda", que es mucho mas debil que "los 17 bloques estan representados". Con el
        # id, el control deja de ser una impresion y pasa a ser una resta de conjuntos.
        *(( '- "source_id": el codigo [Hn] del bloque del que sacaste el hecho, copiado',
            '  exacto. Es OBLIGATORIO y no se inventa: si un bloque dice tres cosas, salen',
            '  tres hechos con el MISMO source_id. Un hecho sin source_id no lo puedo usar.',
            "") if con_ids else ()),
        "Devolve SOLO este JSON:",
        ('{"hechos":[{"source_id":"H1","que":"","cuando":"","de_quien":"municipio",'
         if con_ids else '{"hechos":[{"que":"","cuando":"","de_quien":"municipio",') +
        '"como_lo_llamarias":"",'
        '"tag":"","tag_nuevo":false,"universo":"","peso":3,"sirve_para":"","seguro":true}],'
        '"contacto":{"telefono":"","mail":"","web":""},'
        + ('"descartados":[{"source_id":"H1","que":"","por_que_no_va":""}]}'
           if con_ids else '"descartados":[{"que":"","por_que_no_va":""}]}'),
        "",
        "----- LOS BLOQUES -----" if con_ids else "----- EL TEXTO -----",
        prosa,
    )


# EL COSTO DE UNA TANDA, Y POR QUE ESTOS NUMEROS
# ----------------------------------------------
# Groq cobra la entrada mas el espacio de salida que se RESERVA, no el que se usa. Y el
# limite son 8.000 tokens por MINUTO, contando las dos cosas.
#
# Con los numeros viejos --3.800 de entrada y 3.000 reservados-- una tanda costaba 6.800
# de los 8.000 del minuto. La espera entre tandas era de 35 segundos, que reponen
# 8.000 x 35/60 = 4.667. Faltaban 2.100 SIEMPRE, asi que la segunda tanda pegaba 429,
# reintentaba, volvia a pegar: medido el 2026-09-13, diecinueve rechazos seguidos con la
# cuota del dia intacta (7.923 de 8.000 disponibles). Parecia falta de cupo y era
# aritmetica.
#
# Con estos numeros una tanda cuesta 4.400 y la ventana se repone en 33 segundos.
SALIDA_HECHOS = 1800      # lo que se reserva de salida por tanda
ENTRADA_HECHOS = 2600     # el techo de entrada, para que entrada+salida < 8.000
BLOQUES_POR_TANDA = 5     # ademas del peso: un techo duro por si los bloques son cortos

# La espera entre tandas NO es un numero elegido a dedo: es lo que tarda la ventana de
# Groq en reponer lo que consumio la tanda anterior, mas un 15% de colchon.
ESPERA_TANDA = int(60.0 * (ENTRADA_HECHOS + SALIDA_HECHOS) / 8000 * 1.15) + 1


async def _hechos_de(crudo: str, nombre: str, provincia: str, vocab: list) -> dict:
    """Traduce los hechos del crudo EN TANDAS, y comprueba que no se perdio ninguno.

    POR QUE EN TANDAS, Y COMO SE MIDIO
    -----------------------------------
    Hasta hoy esto era UNA llamada con la prosa entera. Andaba mientras el crudo medía
    7.000 caracteres; con el prompt que pide tambien los contactos pasa a 17.000 y la
    respuesta ya no entra.

    Medido el 2026-09-13 sobre el crudo de Sachayoj (17.712 caracteres):

        bloques en el crudo         17
        hechos que devolvia          7
        finish_reason          length      <- Groq corto por falta de espacio

    Se perdian 10 de 17 EN SILENCIO: la respuesta era un JSON valido y mas corto, asi que
    no fallaba nada -- simplemente faltaba medio municipio. Es el peor tipo de error que
    puede tener este circuito, porque el que lo mira no tiene como enterarse.

    Y NO ALCANZA CON AGRANDAR EL TECHO. El pedido ya pesa ~5.460 tokens de entrada y Groq
    deja pasar 8.000 por minuto contando entrada Y salida: 5.460 + 2.000 = 7.460 con el
    techo viejo. Subirlo a 4.000 da 9.460 y devuelve 413 --que no es 429: no entra en la
    cola, se rechaza--. El crudo crecio: hay que partir el trabajo, no estirar el envase.

    EL CONTROL: POR ID, NO POR TANDA
    ---------------------------------
    "Ninguna tanda fallo" es mucho mas debil que "los 17 bloques estan representados".
    Cada bloque viaja con un id estable (H1..Hn) y cada hecho tiene que devolverlo, asi
    que la comprobacion es una resta de conjuntos:

        perdidos   = los que entraron  -  los que volvieron   -> se rescatan
        inventados = los que volvieron -  los que entraron    -> se marcan

    Un bloque puede producir VARIOS hechos con el mismo id --el prompt pide partir cada
    parrafo en cosas sueltas-- asi que la relacion es uno a muchos: 17 bloques pueden dar
    32 hechos y estar perfecto. Lo que no puede pasar es que un bloque no aparezca.

    Y UN BLOQUE QUE NO VUELVE NO SE PIERDE: entra con su texto literal, sin tag y marcado
    `sin_clasificar`. Es el mismo criterio que los contactos: un hecho sin clasificar
    sigue siendo un hecho, y un fallo del traductor no puede borrar algo que la busqueda
    ya encontro.

    SI EL CRUDO NO TIENE ROTULOS --los informes viejos son prosa suelta-- se manda entero
    como antes. Un formato distinto no puede dejar al municipio sin hechos.
    """
    bloques = [p for p in parsear(crudo or "") if p.get("tipo") == "hecho"]
    if not bloques:
        r = await _groq_json(_prompt_traducir(nombre, provincia, crudo or "", vocab),
                             "calls_traducir")
        h = [x for x in (r.get("hechos") or []) if isinstance(x, dict)]
        return {"hechos": h, "descartados": r.get("descartados") or [],
                "como": {"bloques": 0, "cubiertos": 0, "hechos": len(h), "tandas": 1,
                         "rescatados": 0, "inventados": 0, "tandas_falladas": 0,
                         "por_donde": "prosa entera (el crudo no trae rotulos)"}}

    # los ids: H1..Hn, en el orden del informe. `raw` queda a mano para el rescate.
    for i, p in enumerate(bloques, 1):
        p["hid"] = "H%d" % i
    por_id = {p["hid"]: p for p in bloques}

    base = _prompt_traducir(nombre, provincia, "", vocab, con_ids=True)
    fijo = len(base) // 4
    tope = max(1, ENTRADA_HECHOS - fijo)
    grupos, actual, costo = [], [], 0
    for p in bloques:
        c = len(" ".join((p.get("raw") or "").split())) // 4 + 30
        if actual and (costo + c > tope or len(actual) >= BLOQUES_POR_TANDA):
            grupos.append(actual)
            actual, costo = [], 0
        actual.append(p)
        costo += c
    if actual:
        grupos.append(actual)

    # DOS MOTIVOS DISTINTOS PARA RESCATAR UN BLOQUE, y hay que poder separarlos.
    #
    # Que el modelo IGNORE un bloque es un problema de calidad del prompt. Que no conteste
    # --429, corte de red-- es un problema de cupo. Los dos terminan en el mismo rescate,
    # pero uno se arregla escribiendo mejor y el otro esperando o pagando; contarlos juntos
    # esconde cual de los dos esta pasando.
    #
    # Medido el 2026-09-13: corriendo cuatro veces seguidas el mismo informe se agoto el
    # cupo de Groq, y las corridas 2, 3 y 4 dieron "0 de 17 cubiertos". Leido sin separar,
    # eso parecia un prompt catastrofico; era el cupo. El circuito devolvio los 17 hechos
    # igual, que es justamente lo que el rescate tiene que garantizar.
    salida, descartados, fallados = [], [], 0
    sin_respuesta = set()

    async def _una_tanda(g, partidas=0):
        """Manda un grupo de bloques. Si no entra, lo PARTE AL MEDIO y reintenta.

        ELEGIR UN NUMERO FIJO DE BLOQUES POR TANDA ES ADIVINAR, y se adivina mal: cuanto
        entra depende del largo de cada bloque, de cuantos hechos sueltos saque el modelo
        de cada uno, y del vocabulario, que crece solo a medida que se cura.

        Medido el 2026-09-13: con 8 bloques la respuesta se pasaba del espacio reservado y
        Groq devolvia 400 "Failed to validate JSON" -- no un truncado que se pueda
        rescatar, un rechazo. Bajar el numero a mano arreglaba ESE informe y rompia el
        siguiente.

        Partiendo al medio, el sistema encuentra solo el tamano que entra y se adapta a un
        informe del doble sin tocarle una linea. El corte cae siempre entre dos bloques.
        """
        sep = "\n\n"
        trozo = sep.join("[" + p["hid"] + "] " + " ".join((p.get("raw") or "").split())
                         for p in g)
        try:
            return await _groq_json(
                _prompt_traducir(nombre, provincia, trozo, vocab, con_ids=True),
                "calls_traducir", max_tokens=SALIDA_HECHOS)
        except HTTPException:
            if len(g) > 1 and partidas < 3:
                mitad = len(g) // 2
                out = {"hechos": [], "descartados": []}
                for parte in (g[:mitad], g[mitad:]):
                    await asyncio.sleep(ESPERA_TANDA)
                    r = await _una_tanda(parte, partidas + 1)
                    if r is None:
                        continue
                    out["hechos"] += [x for x in (r.get("hechos") or []) if isinstance(x, dict)]
                    out["descartados"] += [x for x in (r.get("descartados") or [])
                                           if isinstance(x, dict)]
                return out
            return None

    for k, g in enumerate(grupos):
        if k:
            # los pasos comparten la ventana de 8.000 por minuto: sin esta espera, la
            # tanda siguiente se come lo que dejo la anterior y devuelve 413 o 429
            await asyncio.sleep(ESPERA_TANDA)
        r = await _una_tanda(g)
        if r is None:
            # ni partiendola entro: sus bloques quedan sin cubrir y el rescate los mete
            # igual, con el texto literal. No se pierde ninguno.
            fallados += 1
            sin_respuesta.update(p["hid"] for p in g)
            continue
        salida += [h for h in (r.get("hechos") or []) if isinstance(h, dict)]
        descartados += [d for d in (r.get("descartados") or []) if isinstance(d, dict)]

    # --- EL VALIDADOR ------------------------------------------------------- #
    def _id(x):
        return str((x or {}).get("source_id") or "").strip().upper()

    vueltos = {_id(x) for x in salida} | {_id(x) for x in descartados}
    inventados = sorted(i for i in vueltos if i and i not in por_id)
    for x in salida + descartados:
        if _id(x) and _id(x) not in por_id:
            x["source_id_invalido"] = True
    perdidos = [h for h in por_id if h not in vueltos]
    # los que el modelo vio y salteo, contra los que nunca llegaron a sus ojos
    ignorados = [h for h in perdidos if h not in sin_respuesta]

    # los bloques que no volvieron entran igual, con su texto literal
    for hid in sorted(perdidos, key=lambda s: int(s[1:])):
        p = por_id[hid]
        texto = " ".join((p.get("raw") or "").split())
        # se le saca el rotulo de adelante: el hecho es lo que dice, no "HECHO:"
        texto = re.sub(r"^(?:HECHO|DATO)\s*:\s*", "", texto, flags=re.I)
        salida.append({
            "source_id": hid, "que": texto[:1200], "cuando": "",
            "de_quien": "municipio", "como_lo_llamarias": "", "tag": "",
            "tag_nuevo": False, "universo": "", "peso": 2,
            "sirve_para": "", "seguro": True, "sin_clasificar": True,
            "por_que": ("el traductor no respondio por este bloque"
                        if hid in sin_respuesta else "el traductor salteo este bloque"),
        })

    con_tag = sum(1 for x in salida if (x.get("tag") or "").strip())
    return {
        "hechos": salida, "descartados": descartados,
        "como": {
            "bloques": len(bloques),
            "cubiertos": len(bloques) - len(perdidos),
            "hechos": len(salida),
            "tandas": len(grupos),
            "tandas_falladas": fallados,
            "rescatados": len(perdidos),
            "ignorados_por_el_modelo": len(ignorados),
            "sin_respuesta": len(perdidos) - len(ignorados),
            "inventados": len(inventados),
            "sin_tag": len(salida) - con_tag,
            "por_donde": "tandas con id",
        },
    }


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
# PASO 3 - DE QUIEN ES CADA CONTACTO
# --------------------------------------------------------------------------- #
# ESTE ES EL PASO QUE HACIA QUE LA FICHA TIRARA DATOS.
#
# Hasta hoy el paso 1 devolvia `contacto: {telefono, mail, web}` --UN telefono, UN mail,
# UNA web-- y eso era todo lo que podia llegar a la ficha. Medido sobre Sachayoj el
# 2026-09-13, la misma investigacion habia encontrado DOS telefonos del municipio, tres
# paginas de Facebook de gestiones distintas y el WhatsApp del diario por donde los
# vecinos mandan reclamos. Nueve datos entraban y uno salia.
#
# Mejorar la busqueda no cambiaba nada mientras el contrato fuera ese: se estaba
# llenando un balde agujereado.
#
# COMO FUNCIONA
# -------------
# 1. El PARSER parte el crudo. Es deterministico, sin modelo: el crudo no es HTML ajeno,
#    es la salida que pedimos nosotros con nuestros propios rotulos. Medido sobre 23
#    crudos (3.192 lineas): el 97% de las lineas se reconoce por rotulo o por seccion.
# 2. GROQ recibe SOLO la lista de contactos ya partida --nunca el texto entero-- y dice
#    de quien es cada uno. No puede inventar lo que no esta en su lista, y cada respuesta
#    se puede comparar contra el bloque literal del que salio.
#
# SI GROQ SE CAE, LOS DATOS NO SE PIERDEN. El fallback devuelve las mismas piezas con
# `de_quien: desconocido`: un contacto sin clasificar sigue siendo un contacto, y un
# telefono es mejor que cero telefonos (dueno, 2026-09-13). Lo que no se puede es que un
# fallo del clasificador haga desaparecer un numero que la busqueda ya encontro.


def _prompt_contactos(nombre: str, provincia: str, lista: str) -> str:
    """El prompt curado por el dueno, probado el 2026-09-13 sobre Sachayoj: 14 de 14.

    NO LLEVA PROHIBICIONES A PROPOSITO (dueno, 2026-09-13): "que traiga todo y nosotros
    filtramos; el 'no traigas' puede hacer que nos perdamos algo que no supo clasificar".
    Por eso los de terceros no se descartan, se MARCAN: el WhatsApp del diario local por
    donde entran los reclamos dice como se comunica hoy el vecino, y eso es material de
    venta. El filtro es nuestro y va despues, no del modelo y adentro.
    """
    return _lineas(
        "Abajo hay una lista de telefonos, mails, canales digitales y ausencias que",
        "aparecieron en una investigacion sobre %s, %s, Argentina. Ya vienen partidos." % (nombre, provincia),
        "",
        "Tu trabajo es decir DE QUIEN es cada uno. Devolves los mismos, con los mismos id,",
        "sin sacar ninguno.",
        "",
        "Esto es para que un vendedor sepa por donde llegar al municipio, y para entender",
        "que canales usa hoy para hablar con sus vecinos.",
        "",
        "DE CADA UNO QUIERO",
        "",
        "  id              el mismo que vino",
        "  dato_original   el numero, la direccion o la URL tal cual vino",
        "  tipo            telefono / mail / web / facebook / instagram / whatsapp /",
        "                  youtube / portal / formulario / app / ausencia / otro",
        "  de              a quien parece pertenecer, dicho en palabras",
        "  area            el area o dependencia, si el texto lo dice",
        "  gestion         la gestion o el intendente al que pertenece, si el texto lo dice",
        "  relacion        municipio     es de la entidad en si",
        "                  area          es de un area o dependencia suya",
        "                  funcionario   es de una persona de la gestion",
        "                  tercero       es de otro: un diario, una escuela, un club, una",
        "                                empresa, la provincia",
        "                  desconocido   no se puede determinar con lo que dice el texto",
        "  vigencia        actual / probablemente actual / antiguo / desconocida",
        "  que_se_sabe     en una frase: que dice el texto sobre este dato --para que se",
        "                  usa, desde cuando, quien lo publico--. Solo lo que el texto dice",
        "  duda            lo que no puedas determinar",
        "",
        "SOBRE LOS DE TERCEROS",
        "",
        "El telefono de una escuela o el WhatsApp de un diario local no son un error:",
        "aparecieron relacionados con la vida del municipio y por eso se conservan.",
        "Marcalos con relacion: tercero y deci en que_se_sabe por que aparecieron. Si",
        "sirven o no, lo decidimos nosotros despues.",
        "",
        "SOBRE LAS AUSENCIAS",
        "",
        "Una ausencia es algo que se busco y no se encontro. Va con tipo: ausencia, y en",
        "que_se_sabe va exactamente que se busco y que no aparecio.",
        "",
        "Que no se haya encontrado un portal de tramites puede ser una senal comercial,",
        "pero no demuestra que los tramites sean presenciales ni que el portal no exista.",
        "Conserva que se busco y que no se encontro, sin sacar conclusiones.",
        "",
        "Si dudas entre dos valores de relacion o de vigencia, elegi desconocido o",
        "desconocida y explica en duda. No fuerces una certeza que no tenes.",
        "",
        "Devolve SOLO este JSON:",
        '{"contactos":[{"id":0,"dato_original":"","tipo":"","de":"","area":"","gestion":"",'
        '"relacion":"","vigencia":"","que_se_sabe":"","duda":""}]}',
        "",
        "----- LA LISTA -----",
        lista,
    )


def _texto_de(p: dict) -> str:
    """El bloque literal CON sus campos hijos.

    Mandar solo el `raw` recortado hacia que el modelo marcara `relacion: desconocido` en
    la mitad de los contactos. No era el recorte --los bloques median 13 a 95 caracteres--
    sino que el parser los partia mal y el `DE:` quedaba en la pieza de al lado. Se
    arreglo el parser, y el bloque se manda con sus campos para que nunca dependa de eso.
    """
    base = " ".join((p.get("raw") or "").split())[:500]
    extra = " ".join("%s=%s" % (k, v) for k, v in (p.get("campos") or {}).items())
    return (base + (" | " + extra if extra else ""))[:700]


# El cupo de Groq son 8.000 tokens por minuto contando entrada Y salida. Mandar los 14
# contactos de Sachayoj juntos devolvio 413 "Requested 10466" -- y 413 NO es 429: no
# entra en la cola, se rechaza y se pierde el intento. Por eso se estima ANTES de mandar
# en vez de esperar el rechazo.
SALIDA_CONTACTOS = 3000      # lo que se reserva de salida por tanda
ENTRADA_CONTACTOS = 2200     # el techo de entrada, para que entrada+salida < 8.000


def _tandas(piezas: list, prompt_base: str) -> list:
    """Agrupa contactos en tandas que ENTREN en la ventana.

    ~4 caracteres por token de entrada. Se agrupan BLOQUES COMPLETOS: el corte cae
    siempre entre dos piezas, nunca adentro de una.
    """
    fijo = len(prompt_base) // 4
    tope = max(1, ENTRADA_CONTACTOS - fijo)
    grupos, actual, costo = [], [], 0
    for p in piezas:
        c = len(_texto_de(p)) // 4 + 40
        if actual and (costo + c > tope or len(actual) >= 10):
            grupos.append(actual)
            actual, costo = [], 0
        actual.append(p)
        costo += c
    if actual:
        grupos.append(actual)
    return grupos


RE_TEL = re.compile(r"(?:\+?54\s*)?(?:\(?0?\d{2,5}\)?[\s.-]*)?\d{6,8}")
RE_MAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
RE_URL = re.compile(r"(?:https?://|www\.)[^\s,;)\]]+", re.I)
# Un dominio suelto --`facebook.com/x`, `diariochaco.com/...`-- no lleva http:// ni www. y
# hay que reconocerlo igual: Groq devolvio dos de esos etiquetados como `telefono`, y sin
# esto se guardaban como numeros para marcar.
RE_WEB = re.compile(
    r"(?:https?://|www\.)|[a-z0-9][\w-]*\.(?:com|ar|org|net|gob|gov|edu|info|io|app|tv"
    r"|me|be|ly|es|uy|cl|br)(?:\.[a-z]{2})?(?:/|)", re.I)


def _dato_crudo(p: dict) -> str:
    """El dato tal cual, sacado de la pieza SIN modelo. Es el piso del fallback."""
    campos = p.get("campos") or {}
    valor = (p.get("valor") or "").strip()
    raw = p.get("raw") or ""
    tipo = p.get("tipo")
    if tipo == "mail":
        m = RE_MAIL.search(raw)
        return m.group(0) if m else valor
    if tipo == "telefono":
        m = RE_TEL.search(valor) or RE_TEL.search(raw)
        return m.group(0).strip() if m else valor
    # un canal lleva la URL en un campo hijo (DATO, URL) mas seguido que en el rotulo
    for k in ("dato", "url", "link"):
        if campos.get(k):
            return campos[k].strip()
    m = RE_URL.search(raw)
    return m.group(0) if m else valor


TIPOS_CANAL = {"web", "facebook", "instagram", "whatsapp", "youtube", "twitter", "x",
               "linkedin", "tiktok", "portal", "formulario", "app", "telegram", "otro"}

# Lo que un modelo escribe cuando no encontro nada. No es un dato: es una ausencia con
# forma de dato, y si entra a la ficha se guarda un telefono que dice "No disponible".
RE_NADA = re.compile(
    r"^(?:-+|n/?a|s/?d|null|none|no\s+(?:se\s+)?(?:encontr|hay|dispon|figura|public)"
    r"|sin\s+(?:dato|inform|telefono|mail)|no\s+disponible|desconocid)", re.I)


DOMINIO_ES = (("facebook.", "facebook"), ("fb.", "facebook"), ("instagram.", "instagram"),
              ("wa.me", "whatsapp"), ("whatsapp.", "whatsapp"), ("youtube.", "youtube"),
              ("youtu.be", "youtube"), ("twitter.", "twitter"), ("x.com", "twitter"),
              ("tiktok.", "tiktok"), ("linkedin.", "linkedin"), ("t.me", "telegram"))


def _tipo_por_url(dato: str) -> str:
    """De que red es una direccion, mirando el dominio. Cuando la etiqueta fallo, el
    dominio sigue estando: `facebook.com/loquesea` es Facebook aunque nadie lo diga."""
    d = dato.lower()
    for aguja, tipo in DOMINIO_ES:
        if aguja in d:
            return tipo
    return "web"


def _repartir(clasificados: list) -> dict:
    """De la lista plana de Groq a las tres listas que entiende `aplicar`.

    ACA SE DECIDE POR LA FORMA DEL DATO, NO POR LA ETIQUETA DEL MODELO. Medido sobre
    Sachayoj el 2026-09-13, Groq devolvio como `mail` tres cosas distintas: un mail de
    verdad, el texto "no encontre ---" y el handle de Instagram `@gustavoaguerogestion`.
    Los tres tienen etiqueta mail; uno solo es un mail. El handle pasaba el filtro de
    `aplicar` --tiene arroba-- y habria quedado guardado como direccion de correo.

    La etiqueta del modelo se respeta cuando la forma la acompana; cuando no, manda la
    forma. Y nada se tira en silencio: lo que no encaja en ninguna lista sale en
    `sobrantes`, para que la cuenta de entrada y salida cierre siempre.
    """
    tel, mails, canales, ausencias, sobrantes = [], [], [], [], []
    for c in clasificados:
        dato = (c.get("dato_original") or "").strip()
        tipo = (c.get("tipo") or "").strip().lower()
        comun = {"de": c.get("de") or "", "de_quien": c.get("relacion") or "desconocido",
                 "area": c.get("area") or "", "vigencia": c.get("vigencia") or "",
                 "que_se_sabe": c.get("que_se_sabe") or "", "duda": c.get("duda") or ""}

        if not dato:
            sobrantes.append({"id": c.get("id"), "tipo": tipo, "por_que": "vino vacio"})
            continue
        # una ausencia es informacion --dice que se busco y no aparecio-- pero NO es un
        # contacto: va a su lista y nunca a la ficha
        if tipo == "ausencia" or RE_NADA.match(dato):
            ausencias.append({"que_falta": dato, "que_se_sabe": comun["que_se_sabe"]})
            continue

        if RE_MAIL.search(dato):
            mails.append(dict(comun, direccion=RE_MAIL.search(dato).group(0)))
        elif dato.startswith("@"):
            # un arroba adelante es un usuario de red social, no una casilla de correo
            canales.append(dict(comun, tipo=tipo if tipo in TIPOS_CANAL else "otro",
                                dato=dato, gestion=c.get("gestion") or "",
                                duda=(comun["duda"] + " | llego etiquetado como '%s'; "
                                      "es un usuario de red, no un mail" % tipo).strip(" |")))
        elif RE_WEB.search(dato):
            # UNA DIRECCION DE INTERNET NO ES UN TELEFONO, diga lo que diga la etiqueta.
            # Medido sobre El Espinillo el 2026-09-13: Groq devolvio
            # `facebook.com/MunicipalidaddeElEspinillo` y un link de YouTube etiquetados
            # los dos como `telefono`, y con la etiqueta mandando quedaban guardados como
            # numeros para marcar. Es el mismo error que el handle de Instagram en los
            # mails, del otro lado: la etiqueta se cree cuando la forma la acompana.
            mal = tipo == "telefono"
            canales.append(dict(comun,
                tipo=tipo if (tipo in TIPOS_CANAL and not mal) else _tipo_por_url(dato),
                dato=dato, gestion=c.get("gestion") or "",
                duda=((comun["duda"] + (" | llego etiquetado como telefono; es una "
                                        "direccion de internet" if mal else "")).strip(" |"))))
        elif len(re.sub(r"\D", "", dato)) >= 6:
            tel.append(dict(comun, numero=dato))
        else:
            canales.append(dict(comun, tipo=tipo if tipo in TIPOS_CANAL else "otro",
                                dato=dato, gestion=c.get("gestion") or ""))
    return {"telefonos": tel, "mails": mails, "canales": canales,
            "ausencias": ausencias, "sobrantes": sobrantes}


async def _contactos_de(crudo: str, nombre: str, provincia: str) -> dict:
    """Parte el crudo y dice de quien es cada contacto. Nunca devuelve menos de lo que hay."""
    piezas = [p for p in parsear(crudo or "")
              if p.get("tipo") in ("telefono", "mail", "canal", "ausencia")]
    if not piezas:
        return {"telefonos": [], "mails": [], "canales": [], "ausencias": [],
                "piezas": 0, "clasificados": 0, "rescatados": 0, "tandas_falladas": 0,
                "por_donde": "no habia contactos"}

    # EL PISO: lo que el parser saco solo, sin modelo. Si Groq contesta se reemplaza por
    # su version clasificada; si no contesta, esto es lo que se guarda igual.
    piso = []
    for p in piezas:
        dato = _dato_crudo(p)
        if dato:
            piso.append({"id": p.get("source_order"), "dato_original": dato,
                         "tipo": p.get("tipo"), "relacion": "desconocido",
                         "vigencia": "desconocida",
                         "que_se_sabe": " ".join((p.get("raw") or "").split())[:300],
                         "duda": "no se pudo clasificar de quien es"})

    base = _prompt_contactos(nombre, provincia, "")
    salidos, fallados = [], 0
    for grupo in _tandas(piezas, base):
        lista = "\n".join("[%s] (%s) %s" % (p.get("source_order"), p.get("tipo"), _texto_de(p))
                          for p in grupo)
        try:
            r = await _groq_json(_prompt_contactos(nombre, provincia, lista),
                                 "calls_contactos", max_tokens=SALIDA_CONTACTOS)
            salidos += [c for c in (r.get("contactos") or []) if isinstance(c, dict)]
        except HTTPException:
            # una tanda que falla no tumba las otras ni la curacion entera
            fallados += len(grupo)

    # los que Groq no devolvio --porque se cayo la tanda o porque se olvido un id-- entran
    # igual con lo que saco el parser. NADA SE PIERDE POR UN FALLO DEL CLASIFICADOR.
    vistos = {c.get("id") for c in salidos}
    rescatados = [c for c in piso if c["id"] not in vistos]
    out = _repartir(salidos + rescatados)
    out.update({"piezas": len(piezas), "clasificados": len(salidos),
                "sin_repartir": len(out.get("sobrantes") or []),
                "rescatados": len(rescatados), "tandas_falladas": fallados,
                "por_donde": "groq" if salidos else "parser"})
    return out


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
    traducido = await _hechos_de(relato.texto or "", nombre, prov, vocab)
    # NO SE FILTRA ACA (dueno, 2026-09-13). Antes esta linea se quedaba solo con los
    # `de_quien == "municipio"`, y habia DOBLE filtrado: el prompt ya manda los ajenos a
    # `descartados`, asi que un hecho que el modelo dejo en `hechos` marcado "provincia"
    # no iba ni a una lista ni a la otra -- desaparecia, y nadie podia verlo.
    #
    # Un programa que baja de Provincia o un problema de la comuna vecina puede no ir a la
    # ficha principal, pero es contexto para la llamada y se decide DESPUES, mirandolo.
    # `de_quien` viaja intacto y la pantalla separa; nada se pierde en esta capa.
    nuevos = list(traducido.get("hechos") or [])
    ajenos = sum(1 for h in nuevos if (h.get("de_quien") or "municipio") != "municipio")

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

    # --- paso 3: de quien es cada contacto ---
    # Va DESPUES y no en paralelo: los tres pasos comparten la misma ventana de 8.000
    # tokens por minuto, asi que lanzarlos juntos hace que uno de los tres se rechace.
    # Tarda mas y trae todo, en vez de tardar menos y perder una parte.
    contactos = await _contactos_de(relato.texto or "", nombre, prov)

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
        # el contrato VIEJO: un telefono, un mail, una web. Se conserva para que ningun
        # cliente que todavia lo lea se rompa, pero ya no es por donde pasa el dato.
        "contacto": traducido.get("contacto") or {},
        # y el nuevo: TODOS los que se encontraron, cada uno con su dueno
        "telefonos": contactos["telefonos"],
        "mails": contactos["mails"],
        "canales": contactos["canales"],
        "ausencias": contactos["ausencias"],
        "hechos_como": dict(traducido.get("como") or {}, de_otros=ajenos),
        "contactos_como": {k: contactos[k] for k in
                           ("piezas", "clasificados", "rescatados", "tandas_falladas",
                            "por_donde")},
        "cuenta": cuenta,
        "ya_sabiamos": len(viejos),
        "nota": "propuesta de Groq. NO se escribio nada en la ficha.",
    }
