# -*- coding: utf-8 -*-
"""LA GOOGLEADA DE VERDAD: serper.dev, para encontrar el contacto de un municipio.

Serper NO es otro modelo: es un intermediario que devuelve los resultados de Google
crudos. Esa es la diferencia con Gemini, que busca con su propio indice. El hallazgo que
lo origino fue del dueno (2026-09-09): municipios que ChatGPT no encontraba, el aparecian
en Google en la PRIMERA devolucion.

    serper.dev   1 credito      de 2.500 gratis
    Gemini       3,5 centavos   por request, encuentre o no

Por eso este va primero y Gemini queda para lo que no resuelve.

LO QUE COSTO APRENDER (todo medido el 2026-09-10, con municipios de respuesta conocida)
---------------------------------------------------------------------------------------
1. LA CONSULTA. El orden de las palabras cambia el resultado:

       "numero de telefono municipalidad de X Y Argentina"    trae el numero
       "telefono Municipalidad de X Y"                        no lo trae

   La segunda se parece a una busqueda de ENTIDAD y Google la resuelve con el panel de
   Maps o su resumen de IA, que NO bajan a los snippets que entrega serper. La primera es
   una PREGUNTA FACTUAL: ahi Google elige resultados cuyo fragmento tiene el numero, que
   es lo unico que podemos leer. El "Argentina" del final no es decorativo -- sin el,
   la misma consulta deja de traerlo.

2. `/places` NO SIRVE para municipios chicos. Cero de cuatro: Google Maps no los tiene
   fichados. Se gastaba un credito por nada.

3. `autocorrect` apagado: los pueblos se llaman Intiyaco o Cazadores Correntinos y
   Google los "corrige" a otra cosa.

4. SIN COMILLAS: achican el recall justo donde no sobra. Un municipio chico aparece como
   "Municipalidad de X", "Municipalidad X" o "Comuna X".

5. Y no se le agrega "gob.ar": le funciona a los que tienen sitio propio y deja afuera a
   los que no, que son la mayoria de los chicos -- justo los que hay que encontrar.

NADA SE DESCARTA, TODO SE MARCA (dueno, 2026-09-10)
---------------------------------------------------
Un numero con caracteristica de otra provincia puede ser el bueno igual, y en la pantalla
cada telefono tiene su lapicito. "Es mejor tener un telefono donde el vendedor tenga que
curar un guion bajo, que un telefono perdido". Lo unico que se tira es lo que se puede
demostrar que no es un telefono: un CUIT.

Y si la expresion no saca nada, hay una segunda pasada floja y lo que salga va marcado
"sin formato". Una expresion que no matchea no prueba que no haya telefono: prueba que no
matcheo. Ya paso -- "(03774) 43-6421" llegaba en la respuesta y el patron lo descartaba,
y se reporto que Google no lo tenia.
"""
import json
import re
import urllib.error
import urllib.request

from core.config import settings

URL = "https://google.serper.dev/%s"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# De donde salio el numero importa tanto como el numero: un dominio del Estado vale mas
# que un directorio comercial que copia listados viejos, y eso se ve en la URL.
FUENTES = (
    (("argentina.gob.ar", ".gob.ar", ".gov.ar"), "oficial", 3),
    (("facebook.com", "instagram.com"), "redes del municipio", 2),
    ((".org.ar", "wikipedia.org"), "referencia", 1),
)

# Prefijos de CUIT. Se mira el PREFIJO y no el largo: la expresion corta antes del digito
# verificador, asi que un CUIT de 11 llega con 10 y pasaria un filtro por longitud.
CUIT = ("20", "23", "24", "27", "30", "33", "34")

RX = re.compile(r"(?:\+?54[\s-]?)?(?:\(?0?\d{2,4}\)?[\s.-]?)\d{2,4}[\s.-]?\d{4}")
RX_FLOJA = re.compile(r"\d[\d\s.()/-]{6,}\d")


def hay_key() -> bool:
    return bool(settings.SERPER_API_KEY)


def _pedir(ruta: str, **kw):
    if not settings.SERPER_API_KEY:
        return None
    req = urllib.request.Request(
        URL % ruta, data=json.dumps(kw).encode(),
        headers={"X-API-KEY": settings.SERPER_API_KEY,
                 "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.load(r)
    except (urllib.error.URLError, ValueError, OSError):
        return None


def _de_donde(url: str) -> tuple:
    u = (url or "").lower()
    for dominios, nombre, peso in FUENTES:
        if any(d in u for d in dominios):
            return nombre, peso
    return "directorio", 0


def _pedazos(d: dict) -> list:
    """Cada parte de la respuesta con su URL.

    Serper devuelve mucho mas que `organic` cuando lo tiene, y mirar solo los organicos
    es tirar la mitad del request que ya se pago.
    """
    out = []
    a = d.get("answerBox") or {}
    if a:
        out.append(("%s %s %s" % (a.get("answer") or "", a.get("snippet") or "",
                                  a.get("title") or ""),
                    a.get("link") or "", "respuesta de Google"))
    k = d.get("knowledgeGraph") or {}
    if k:
        out.append(("%s %s %s" % (k.get("title") or "", k.get("description") or "",
                                  json.dumps(k.get("attributes") or {}, ensure_ascii=False)),
                    k.get("website") or "", "ficha de Google"))
    for r in (d.get("organic") or []):
        out.append(("%s %s" % (r.get("title") or "", r.get("snippet") or ""),
                    r.get("link") or "", r.get("title") or ""))
    for p in (d.get("peopleAlsoAsk") or []):
        out.append(("%s %s" % (p.get("question") or "", p.get("snippet") or ""),
                    p.get("link") or "", p.get("question") or ""))
    return out


def extraer(d: dict) -> list:
    """Los telefonos que hay adentro de una respuesta YA TRAIDA.

    Aparte de la busqueda a proposito: traer cuesta un credito y extraer no cuesta nada.
    Asi, mejorar un filtro no obliga a volver a buscar: se recorre lo guardado.
    """
    if not d:
        return []
    out, vistos = [], set()
    for texto, url, titulo in _pedazos(d):
        fuente, peso = _de_donde(url)
        for m in RX.findall(texto or ""):
            num = m.strip()
            solo = re.sub(r"\D", "", num)
            if len(solo) >= 10 and solo[:2] in CUIT:
                continue
            if num in vistos:
                continue
            vistos.add(num)
            largo = len(solo[1:] if solo.startswith("0") else solo)
            forma = "ok" if 9 <= largo <= 11 else "raro"
            out.append({"numero": num, "de_quien": (titulo or "")[:120], "url": url,
                        "fuente": fuente, "forma": forma,
                        "peso": peso if forma == "ok" else peso - 1})
    if not out:
        # la expresion no saco nada: antes de decir que no hay, se manda lo crudo
        for texto, url, titulo in _pedazos(d):
            fuente, peso = _de_donde(url)
            for m in RX_FLOJA.findall(texto or ""):
                num = m.strip()
                solo = re.sub(r"\D", "", num)
                if not (7 <= len(solo) <= 14) or num in vistos:
                    continue
                if len(solo) >= 10 and solo[:2] in CUIT:
                    continue
                vistos.add(num)
                out.append({"numero": num, "de_quien": (titulo or "")[:120], "url": url,
                            "fuente": fuente, "forma": "sin formato", "peso": peso - 2})
    out.sort(key=lambda x: -x["peso"])
    return out[:10]


def buscar_contacto(municipio: str, provincia: str) -> tuple:
    """Devuelve (telefonos, web, crudo). Un credito.

    El crudo vuelve SIEMPRE, encuentre o no: es lo que permite reprocesar gratis cuando
    se mejora un filtro, y lo que evita reportar "no hay" sobre un dato que estaba.
    """
    q = "numero de telefono municipalidad de %s %s Argentina" % (municipio or "", provincia or "")
    d = _pedir("search", q=q, gl="ar", hl="es", num=20, autocorrect=False)
    if not d:
        return [], "", None
    web = ""
    for r in (d.get("organic") or []):
        u = (r.get("link") or "")
        if ".gob.ar" in u or ".gov.ar" in u:
            web = u
            break
    return extraer(d), web, {"consulta": q, "respuesta": d}
