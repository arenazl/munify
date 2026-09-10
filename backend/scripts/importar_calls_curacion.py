# -*- coding: utf-8 -*-
"""Mueve la curacion de llamados del JSON a la base.

    python backend/scripts/importar_calls_curacion.py [ruta/a/todos.json] [--seco]

QUE CAMBIA RESPECTO DE ANTES
----------------------------
`importar_calls_fichas.py` subia la ficha y nada mas, y trataba al JSON como la
fuente de verdad: lo que el archivo no traia, se BORRABA de la tabla. Eso
funciona con una foto que se rehace entera y la hace una sola persona.

Desde el 2026-09-08 el JSON es un archivo DE PASO y la base es donde vive el
dato. El motivo es concreto: la pantalla empezo a ESCRIBIR --el vendedor toca un
boton, el sistema le busca el telefono-- y un archivo no aguanta dos que
escriben a la vez: el ultimo gana y el otro pierde sin enterarse. Por eso este
script NO BORRA NADA. Agrega lo que falta y deja constancia de lo que cambio.

QUE SUBE
--------
    calls_municipio      la ficha, + `codigo_indec` (el enganche con el catalogo)
    calls_hechos         un hecho por fila: el tag, su frase y de donde salio
    calls_fuentes        cada URL que cito alguien (sitio, proveedor, perfil)
    calls_ponderacion    la foto del calculo: scores, margen, fuerza
    calls_aportes        que sumo cada regla, una fila por aporte
    calls_capacidades    que sabe hacer su web, una capacidad por fila
    calls_telefonos      uno por fila, para poder anotar cual atendio

QUE VA EN TABLA Y QUE VA EN JSON
--------------------------------
Tabla cuando hace falta consultar A TRAVES de muchos municipios, o escribir un
item suelto. JSON cuando se lee entero y nadie va a preguntar por adentro. Y lo
DERIVADO no se guarda: la botonera de 4, el ranking y lo que quedo afuera se
recalculan desde los hechos y sus pesos, que es lo unico que se cura.

Por eso el desglose de puntos es tabla (`calls_aportes`): "que regla esta
inflando el reparto" es un GROUP BY, y si una regla suma +5 en 1.800 de 2.244
municipios, ese +5 no distingue nada y hay que bajarlo. Y por eso el angulo
queda en JSON: es prosa que se lee entera al abrir la ficha.

Los CRUDOS (`calls_relatos`, `calls_paginas`) no salen de este archivo: los
escribe el circuito de refresco cuando corre. Aca no hay nada que importar.

POR QUE NO SOBRESCRIBE
----------------------
Un hecho que cambio de texto entra como fila NUEVA, no pisa la anterior. Una
ponderacion distinta a la ultima entra como foto nueva. Asi se puede contestar
"por que en marzo este municipio entraba por vecino y hoy entra por plata", que
hoy no tiene respuesta. Si nada cambio, no escribe: correrlo dos veces seguidas
no duplica una sola fila.

EL ENGANCHE POR CODIGO INDEC
----------------------------
Se resuelve contra el padron del Estado que ya vive en este repo
(`docs/cartografia/fuentes-oficiales/padron_municipios.csv`), cruzando nombre +
provincia normalizados. El `codigo` de ese padron ES el `id` de
`municipios_catalogo`, asi que la misma columna sirve para las dos cosas.

El nombre solo NUNCA alcanza: `avellaneda` son tres municipios distintos y
`general alvear` cuatro. Por eso el cruce siempre lleva la provincia.

NUNCA CONTRA PRODUCCION: corta si la base destino es la productiva.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, insert, select                                  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine   # noqa: E402

from core.config import settings                                            # noqa: E402
from models.calls import CallsMunicipio                                     # noqa: E402
from models.calls_curacion import (CallsAporte, CallsCapacidad,             # noqa: E402
                                   CallsFuente, CallsHecho, CallsPonderacion,
                                   CallsTelefono)

BASES_PRODUCCION = {"munify_prod", "defaultdb"}
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JSON_POR_DEFECTO = r"D:\Code\munify-calls\scripts\entregas\2-curados-fable\todos.json"
PADRON = os.path.join(RAIZ, "docs", "cartografia", "fuentes-oficiales",
                      "padron_municipios.csv")


# --------------------------------------------------------------------------- #
# el cruce con el padron
# --------------------------------------------------------------------------- #
def pelado(s: str) -> str:
    """Sin tildes, sin puntuacion, en minuscula. `Colón` y `Colon` son el mismo."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def indice_padron() -> dict:
    """(provincia, municipio) -> codigo INDEC.

    Se indexa tambien sin los prefijos que el padron escribe y nosotros no
    (`comuna de`, `municipalidad de`), porque si no el cruce se pierde por una
    palabra que no dice nada.
    """
    ix = {}
    if not os.path.exists(PADRON):
        return ix
    with io.open(PADRON, encoding="utf-8-sig", newline="") as fh:
        for fila in csv.DictReader(fh):
            cod = (fila.get("codigo") or "").strip()
            prov, muni = pelado(fila.get("provincia")), pelado(fila.get("municipio"))
            if not (cod and prov and muni):
                continue
            ix.setdefault((prov, muni), cod)
            corto = re.sub(r"^(comuna|municipalidad|municipio|comision de fomento) de ",
                           "", muni)
            if corto != muni:
                ix.setdefault((prov, corto), cod)
    return ix


# --------------------------------------------------------------------------- #
# la ficha
# --------------------------------------------------------------------------- #
def jtxt(v):
    """A JSON, o NULL si no hay nada. Una lista vacia no es un dato."""
    return json.dumps(v, ensure_ascii=False) if v not in (None, "", [], {}) else None


def texto_capacidades(f: dict) -> str:
    """La linea legible de capacidades que muestra la ficha.

    `capacidades` viene a veces como string ya armado ("boletin oficial, pago
    online") y a veces como diccionario, segun de que lote salio la ficha. El
    detalle no se pierde: el dict entero va a `calls_capacidades`; esto es solo
    la linea que se lee en pantalla.
    """
    for v in (f.get("digital"), f.get("capacidades")):
        if isinstance(v, dict):
            return ", ".join(sorted(k.replace("_", " ") for k, x in v.items() if x))
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def campos_ficha(f: dict, codigo: str | None) -> dict:
    """De la ficha curada a las columnas de `calls_municipio`.

    Los nombres viejos de columna se mantienen (`economia`, `nota`, `senal`)
    porque son los que sirve `/api/public/calls/fichas` y los lee la pagina; lo
    que cambio es de que campo del JSON nuevo se llenan.
    """
    dec = f.get("decision") if isinstance(f.get("decision"), dict) else {}
    uni = dec.get("universo") if isinstance(dec.get("universo"), dict) else {}
    return {
        "codigo_indec": codigo,
        "municipio": f.get("municipio") or "",
        "provincia": f.get("provincia") or "",
        "pais": f.get("pais") or "Argentina",
        "tipo_gobierno": f.get("tipo_gobierno") or "",
        "telefonos": jtxt(f.get("telefonos")),
        "direccion": f.get("direccion") or "",
        "web": f.get("web") or "",
        "habitantes": str(f.get("habitantes") or ""),
        "intendente": f.get("intendente") or "",
        "partido": f.get("partido_politico") or "",
        "fuente": f.get("fuente") or "",
        # el perfil es la narrativa del lugar: de que vive, que lo distingue
        "economia": f.get("perfil") or "",
        # con que abrir la llamada, en una linea
        "nota": f.get("lo_distintivo") or "",
        "digital": texto_capacidades(f),
        # que sabe hacer su web hoy: es lo que decide si se compara o se explica
        "estructura": jtxt(f.get("capacidades_web")),
        "senal": (uni.get("fuerza") or ""),
        # LOS CHIPS chicos del encabezado --"Interino", "Web sin app"--, que son
        # {texto, tono} y los tienen 205 fichas. NO la botonera: eso son los cuatro
        # botones grandes, pesan 368 caracteres cada uno y viven en `decision`, que se
        # sirve solo al abrir una ficha. Meterlos aca ponia 10 MB en el listado.
        "etiquetas": jtxt(f.get("etiquetas")),
        "ranking": jtxt({"score": dec.get("score"), "motivos": dec.get("motivos")}
                        if dec else None),
        "calidad": jtxt({"web_estado": f.get("web_estado"),
                         "perfil_verificado": f.get("perfil_verificado"),
                         "intendente_dudoso": f.get("intendente_dudoso")}),
        "origen": jtxt(f.get("origen")),
        "ranking_score": int(dec.get("score") or 0),
        # el render completo, para que la pagina lo pida al abrir una ficha en vez de
        # traerse los 23 MB de todas
        "decision": jtxt(dec),
    }


# --------------------------------------------------------------------------- #
# los hechos, las fuentes y la foto de la ponderacion
# --------------------------------------------------------------------------- #
def hechos_de(f: dict) -> list:
    """Un hecho por fila. Sale de tres lugares y cada uno se marca con el suyo.

    Se guarda de donde salio porque no valen lo mismo: lo que publica el propio
    municipio en su sitio es verificable, lo que resumio un modelo es una pista.
    """
    dec = f.get("decision") if isinstance(f.get("decision"), dict) else {}
    ev = f.get("evidencia_tags") if isinstance(f.get("evidencia_tags"), dict) else {}
    out, vistos = [], set()

    # 1. los tags con su frase, y el peso que les puso el clasificador
    pesos = {}
    for banda in ("dolores", "raros"):
        for d in (dec.get(banda) or []):
            if isinstance(d, dict) and d.get("tag"):
                pesos[d["tag"]] = (int(d.get("peso") or 0), d.get("universo"))
    for tag in (f.get("tags") or []):
        texto = (ev.get(tag) or "").strip()
        if not texto:
            continue  # un tag sin frase no es un hecho: es una etiqueta suelta
        peso, universo = pesos.get(tag, (0, None))
        clave = (tag, "clasificador", texto)
        if clave in vistos:
            continue
        vistos.add(clave)
        out.append({"tag": tag, "texto": texto, "de_donde": "clasificador",
                    "peso": peso, "universo": universo, "fuente_url": f.get("web") or None,
                    "curado": True})

    # 2. lo que leyo el crawler en el sitio del propio municipio
    for h in (f.get("hechos_web") or []):
        if not isinstance(h, dict):
            continue
        texto = (h.get("que") or "").strip()
        tag = h.get("tag") or "sitio:menciona"
        if not texto:
            continue
        clave = (tag, "crawler", texto)
        if clave in vistos:
            continue
        vistos.add(clave)
        out.append({"tag": tag, "texto": texto, "de_donde": "crawler", "peso": 0,
                    "universo": None, "fuente_url": h.get("fuente"), "curado": True})

    return out


def fuentes_de(f: dict) -> list:
    """Cada URL que cito alguien, con que estaba buscando.

    De aca sale sola la alarma del directorio provincial: si un dominio aparece
    para muchos municipios de la misma provincia, no es la web de un municipio.
    Asi aparecio `mapadelestado.chaco.gob.ar`, con los 71 municipios del Chaco.
    """
    out, vistos = [], set()

    def sumar(url, de_donde, buscando):
        url = (url or "").strip()
        if not url or not url.startswith("http"):
            return
        dom = re.sub(r"^www\.", "", (url.split("/")[2] if "//" in url else url))[:200]
        if (dom, buscando) in vistos:
            return
        vistos.add((dom, buscando))
        out.append({"dominio": dom, "url": url[:2000], "de_donde": de_donde,
                    "buscando": buscando})

    sumar(f.get("web"), "crawler", "web")
    for p in (f.get("proveedores") or []):
        if isinstance(p, dict):
            sumar(p.get("url") or ("https://" + (p.get("dominio") or "")),
                  "crawler", "proveedor")
    for d in (f.get("perfil_fuentes") or []):
        if isinstance(d, str) and d:
            sumar(d if d.startswith("http") else "https://" + d, "gemini", "comercial")
    for h in (f.get("hechos_web") or []):
        if isinstance(h, dict):
            sumar(h.get("fuente"), "crawler", "hechos")
    return out


def foto_ponderacion(f: dict) -> dict | None:
    """La foto del calculo, tal como quedo esta corrida."""
    dec = f.get("decision") if isinstance(f.get("decision"), dict) else {}
    uni = dec.get("universo") if isinstance(dec.get("universo"), dict) else {}
    if not uni.get("universo"):
        return None
    sc = uni.get("score") if isinstance(uni.get("score"), dict) else {}
    ang = dec.get("angulo") if isinstance(dec.get("angulo"), dict) else {}
    return {
        "universo": uni.get("universo")[:20],
        "score_vecino": int(sc.get("vecino") or 0),
        "score_plata": int(sc.get("plata") or 0),
        "score_operacion": int(sc.get("operacion") or 0),
        "margen": int(uni.get("margen") or 0),
        "fuerza": (uni.get("fuerza") or "")[:20],
        "angulo": (ang.get("nombre") or "")[:160] or None,
        # solo la prosa que se lee entera al abrir la ficha. El desglose de
        # puntos NO va aca: es `calls_aportes`.
        "detalle": jtxt({"abrir_con": ang.get("abrir_con"),
                         "por_que": ang.get("por_que"),
                         "prioridad": ang.get("prioridad")}),
    }


APORTE = re.compile(r"^(.*?)\s*([+-]\s*\d+)$")


def aportes_de(f: dict) -> list:
    """El desglose, una fila por aporte: "caminos_rurales +9" -> concepto, 9.

    Si la frase no termina en un numero se guarda igual con 0 puntos, en vez de
    tirarla: perder un aporte porque no matcheo el formato es exactamente el
    error de descartar sin mirar que ya costo datos tres veces.
    """
    dec = f.get("decision") if isinstance(f.get("decision"), dict) else {}
    uni = dec.get("universo") if isinstance(dec.get("universo"), dict) else {}
    det = uni.get("detalle") if isinstance(uni.get("detalle"), dict) else {}
    out = []
    for universo, frases in det.items():
        for fr in (frases or []):
            if not isinstance(fr, str) or not fr.strip():
                continue
            m = APORTE.match(fr.strip())
            concepto = (m.group(1) if m else fr).strip()[:160]
            puntos = int(re.sub(r"\s+", "", m.group(2))) if m else 0
            out.append({"universo": str(universo)[:20], "concepto": concepto,
                        "puntos": puntos})
    return out


def capacidades_de(f: dict) -> list:
    """Que sabe hacer su web, una por fila, tal como vino: ni mas ni menos.

    El crawler de hoy solo anota lo que ENCONTRO --1.478 capacidades en 555
    municipios, y 1.689 fichas sin web leida--, asi que de aca salen casi puros
    True. No se completa con False lo que no vino: sin fila significa "no se
    sabe", y darlo por ausente es el error que le cobro "no tiene reclamos
    online" a 210 municipios que si los tenian.
    """
    out = []
    # lo que el crawler VIO en el sitio: solo anota positivos
    caps = f.get("capacidades_web")
    if isinstance(caps, dict):
        out += [{"capacidad": str(k)[:60], "tiene": bool(v), "de_donde": "crawler"}
                for k, v in caps.items()]
    # lo DECLARADO en el relevamiento (164 fichas, 1.312 items), que es OTRA
    # cosa y a veces se contradice con lo anterior: Carlos Tejedor declara que
    # no tiene pagos online y el crawler los vio en su web. Se guardan los dos
    # con su origen en vez de elegir uno -- cual creer es una decision
    # comercial, no del importador, y el conflicto en si es informacion: alguien
    # del municipio no sabe lo que su propia web hace.
    #
    # Este es el unico origen que anota los False, y son la mitad del dato.
    for campo in ("digital", "capacidades"):
        dec = f.get(campo)
        if isinstance(dec, dict):
            out += [{"capacidad": str(k)[:60], "tiene": bool(v), "de_donde": "declarado"}
                    for k, v in dec.items()]
            break
    return out


def telefonos_de(f: dict) -> list:
    """Uno por fila, en el orden en que la ficha los muestra."""
    out = []
    for i, t in enumerate(f.get("telefonos") or []):
        t = (t or "").strip()
        if t:
            out.append({"numero": t[:40], "orden": i, "de_donde": "padron"})
    return out


LOTE = 300  # municipios por transaccion


async def volcar(s, buf: dict, ahora) -> None:
    """Cierra el lote: cada tabla en UN viaje, no una fila por viaje.

    Escribir con el ORM fila por fila son unas 20 idas y vueltas por municipio
    contra una base que esta en la nube: 50.000 viajes de 100 ms son casi dos
    horas, y se midio --la primera version se colgo ocho minutos sin escribir
    una fila--. Con `insert()` y una lista de diccionarios va todo junto.

    El precio es que hay que armar los dicts a mano en vez de usar objetos, y
    que MySQL no devuelve los ids de un insert masivo: por eso los aportes se
    cuelgan releyendo las ponderaciones de ESTA corrida.
    """
    if buf["pond"]:
        await s.execute(insert(CallsPonderacion), [p for p, _ in buf["pond"]])
        claves = [p["muni_key"] for p, _ in buf["pond"]]
        # Se releen por MAX(id) y NO por `creado == ahora`. La primera version
        # filtraba por la marca de tiempo y perdio 9.363 de 11.517 aportes en
        # silencio: la columna es DATETIME, que no guarda microsegundos, asi
        # que la comparacion no encuentra la fila que se acaba de escribir. El
        # id mas alto de cada municipio es, por definicion, la foto recien
        # insertada.
        ids = dict((await s.execute(
            select(CallsPonderacion.muni_key, func.max(CallsPonderacion.id))
            .where(CallsPonderacion.muni_key.in_(claves))
            .group_by(CallsPonderacion.muni_key))).all())
        faltan = [k for k in claves if k not in ids]
        if faltan:
            # Sin esto el problema anterior habria vuelto a pasar sin ruido.
            raise RuntimeError(
                "no se pudo colgar los aportes de %d municipios (%s...)"
                % (len(faltan), ", ".join(faltan[:3])))
        aportes = [dict(a, ponderacion_id=ids[p["muni_key"]])
                   for p, aps in buf["pond"] for a in aps]
        if aportes:
            await s.execute(insert(CallsAporte), aportes)
    for modelo, k in ((CallsMunicipio, "muni"), (CallsHecho, "hechos"),
                      (CallsFuente, "fuentes"), (CallsCapacidad, "caps"),
                      (CallsTelefono, "tels")):
        if buf[k]:
            await s.execute(insert(modelo), buf[k])
    await s.commit()
    for k in buf:
        buf[k].clear()


# --------------------------------------------------------------------------- #
async def main(ruta: str, seco: bool) -> int:
    base = settings.DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    if base in BASES_PRODUCCION:
        print("ABORTADO: la base destino es PRODUCCION (%s). Este script es de QA." % base)
        return 1
    if not os.path.exists(ruta):
        print("No encuentro las fichas en: %s" % ruta)
        return 1

    fichas = json.load(io.open(ruta, encoding="utf-8"))
    ix = indice_padron()
    print("Base destino: %s%s" % (base, "   [SECO: no escribe]" if seco else ""))
    print("Fichas: %-6d  padron: %d entradas" % (len(fichas), len(ix)))

    engine = create_async_engine(settings.DATABASE_URL)
    n = Counter()
    try:
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as s:
            previas = {m.muni_key: m for m in
                       (await s.execute(select(CallsMunicipio))).scalars().all()}
            # lo que ya esta, para no volver a escribirlo
            hechos_ya = {(h.muni_key, h.tag, h.de_donde, (h.texto or "")[:400])
                         for h in (await s.execute(select(CallsHecho))).scalars().all()}
            fuentes_ya = {(x.muni_key, x.dominio, x.buscando)
                          for x in (await s.execute(select(CallsFuente))).scalars().all()}
            caps_ya = {(c.muni_key, c.capacidad, c.tiene, c.de_donde)
                       for c in (await s.execute(select(CallsCapacidad))).scalars().all()}
            tel_ya = {(t.muni_key, t.numero)
                      for t in (await s.execute(select(CallsTelefono))).scalars().all()}
            ult_pond = {}
            for p in (await s.execute(select(CallsPonderacion)
                                      .order_by(CallsPonderacion.creado.asc()))).scalars():
                ult_pond[p.muni_key] = p

            ahora = datetime.utcnow()
            buf = {"muni": [], "hechos": [], "fuentes": [], "caps": [], "tels": [],
                   "pond": []}
            hechas = 0
            for f in fichas:
                key = (f.get("id") or "").strip().lower()[:80]
                if not key:
                    continue
                cod = ix.get((pelado(f.get("provincia")), pelado(f.get("municipio"))))
                n["con_indec" if cod else "sin_indec"] += 1

                # --- la ficha. Las nuevas van en bloque; las que ya estaban se
                # editan con el ORM, que son pocas y hay que comparar campo a
                # campo para no marcar como cambiado lo que no cambio.
                d = campos_ficha(f, cod)
                fila = previas.get(key)
                if fila is None:
                    n["fichas_nuevas"] += 1
                    if not seco:
                        buf["muni"].append(dict(d, muni_key=key, importado_en=ahora))
                elif any(getattr(fila, k) != v for k, v in d.items()):
                    n["fichas_actualizadas"] += 1
                    if not seco:
                        for k, v in d.items():
                            setattr(fila, k, v)

                # --- los hechos (nada se pisa: lo distinto entra como fila nueva)
                for h in hechos_de(f):
                    clave = (key, h["tag"], h["de_donde"], h["texto"][:400])
                    if clave in hechos_ya:
                        continue
                    hechos_ya.add(clave)
                    n["hechos"] += 1
                    if not seco:
                        buf["hechos"].append(
                            {"codigo_indec": cod, "muni_key": key, "creado": ahora,
                             "tag": h["tag"][:80], "texto": h["texto"],
                             "fuente_url": h["fuente_url"], "de_donde": h["de_donde"],
                             "universo": h["universo"], "peso": h["peso"],
                             "curado": h["curado"]})

                # --- las fuentes
                for x in fuentes_de(f):
                    clave = (key, x["dominio"], x["buscando"])
                    if clave in fuentes_ya:
                        continue
                    fuentes_ya.add(clave)
                    n["fuentes"] += 1
                    if not seco:
                        buf["fuentes"].append(
                            {"codigo_indec": cod, "muni_key": key, "creado": ahora,
                             "provincia": (f.get("provincia") or "")[:80],
                             "dominio": x["dominio"], "url": x["url"],
                             "de_donde": x["de_donde"], "buscando": x["buscando"],
                             "responde": None})

                # --- que sabe hacer su web. Si una capacidad cambio de valor
                # entra como fila nueva: que un municipio HAYA PUESTO reclamos
                # online este mes es la mejor noticia comercial que hay, y
                # pisando el valor anterior no se entera nadie.
                for c in capacidades_de(f):
                    clave = (key, c["capacidad"], c["tiene"], c["de_donde"])
                    if clave in caps_ya:
                        continue
                    caps_ya.add(clave)
                    n["capacidades"] += 1
                    if not seco:
                        buf["caps"].append(
                            {"codigo_indec": cod, "muni_key": key, "creado": ahora,
                             "capacidad": c["capacidad"], "tiene": c["tiene"],
                             "de_donde": c["de_donde"]})

                # --- los telefonos, uno por fila
                for t in telefonos_de(f):
                    clave = (key, t["numero"])
                    if clave in tel_ya:
                        continue
                    tel_ya.add(clave)
                    n["telefonos"] += 1
                    if not seco:
                        buf["tels"].append(
                            {"codigo_indec": cod, "muni_key": key, "creado": ahora,
                             "numero": t["numero"], "orden": t["orden"],
                             "de_donde": t["de_donde"], "atiende": None})

                # --- la foto de la ponderacion, solo si cambio
                foto = foto_ponderacion(f)
                if foto:
                    ant = ult_pond.get(key)
                    igual = ant is not None and all(
                        getattr(ant, k) == v for k, v in foto.items() if k != "detalle")
                    if not igual:
                        n["ponderaciones"] += 1
                        aps = aportes_de(f)
                        n["aportes"] += len(aps)
                        if not seco:
                            buf["pond"].append((
                                dict(foto, codigo_indec=cod, muni_key=key, creado=ahora,
                                     version_reglas=ahora.strftime("%Y%m%d")),
                                [dict(a, muni_key=key, creado=ahora) for a in aps]))

                # --- se escribe de a lotes, no todo en una transaccion. Una
                # sola transaccion de 50.000 filas contra una base remota tarda
                # y, si se corta en el medio, no queda NADA: media hora perdida
                # por un timeout. De a 300 municipios lo que entro queda, y
                # volver a correrlo sigue sin duplicar una sola fila.
                hechas += 1
                if not seco and hechas % LOTE == 0:
                    await volcar(s, buf, ahora)
                    print("  %4d/%d municipios" % (hechas, len(fichas)), flush=True)

            if seco:
                print("\nSECO: no se escribio nada.")
            else:
                await volcar(s, buf, ahora)
                await s.commit()

        print()
        for k in ("fichas_nuevas", "fichas_actualizadas", "hechos", "fuentes",
                  "capacidades", "telefonos", "ponderaciones", "aportes",
                  "con_indec", "sin_indec"):
            print("  %-22s %6d" % (k, n[k]))
        total = n["con_indec"] + n["sin_indec"]
        if total:
            print("\n  enganche por codigo INDEC: %.1f%%" % (100.0 * n["con_indec"] / total))
    finally:
        await engine.dispose()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ruta", nargs="?", default=JSON_POR_DEFECTO)
    ap.add_argument("--seco", action="store_true",
                    help="cuenta lo que haria, sin escribir")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.ruta, a.seco)))
