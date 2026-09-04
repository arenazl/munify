# -*- coding: utf-8 -*-
"""Que filas de `catalogo_barrios` se MUESTRAN (hoja) y cuales quedan de respaldo.

El catalogo guarda TODO lo que OSM y el padron llaman con nombre adentro del
municipio: localidades, barrios oficiales (admin 9/10), loteos, parajes y las
grafias repetidas de cada uno. Mostrarlo plano superpone tres capas (Lanus:
6 localidades dibujadas + 43 barrios dibujados + puntos adentro de ambos).
Esta regla elige UNA lista coherente por municipio y la marca en la columna
`hoja` (1 = se muestra / 0 = respaldo, con el porque en `motivo_hoja`). No se
borra nada: el respaldo sigue ahi para revisar o para otra regla mañana.

La regla (variante "E6", 2026-09-03; nacio como "E" simulando A/B/D/E sobre
los 6 paises, y se cerro con la auditoria de Argentina entera: E dejaba
2.012 pares padre/hijo dibujados a la vez en 185 municipios —Gran Salta con
sus 72 barrios adentro, Rosario 45 oficiales + 122 sub-barrios— y E6 los
lleva a cero):

  1. DUPLICADOS DE GRAFIA. Dos filas del mismo municipio a menos de 1 km con
     el mismo nombre normalizado ("Benavidez" / "Barrio Benavidez" / "B°
     Benavidez"; el sufijo del padron "(Est. Bolivar)" no cuenta), o una
     que es prefijo de la otra con particula "de" ("Remedios de Escalada" /
     "... de San Martin"), o casi iguales (Fischer / Fisher). Difieren en un
     numeral o un cardinal => son lugares DISTINTOS ("Bancario 2" y "3",
     "Ramos Mejia" y "Ramos Mejia Sur"). Pierde la que no tiene contorno;
     entre dos contornos, la de menos vertices. Dos contornos de distinto
     nivel (localidad vs barrio) NUNCA se deduplican: eso lo decide (2).
  2. CONTENEDORES: NUNCA padre e hijo dibujados a la vez. Del contorno mas
     grande al mas chico: si tiene contornos adentro (cada uno con >= 50% de
     su area dentro), o sale el, o salen ellos. Sale el contenedor cuando lo
     de adentro es MAYORIA —cubre >= 50% de su area ("Lanus Este" con 12
     barrios), o es >= 50% de los contornos vivos del municipio (los
     poligonos de localidad vienen inflados con campo: el pueblo de Bolivar
     tiene 43 barrios que cubren el 44%)— o cuando se llama division
     administrativa ("Gran Salta", "Seccional 10a", "Comisaria 2da"). Si lo
     de adentro es poco (un loteo dentro de "Villa Constitucion", una
     "116 Viviendas" dentro de su barrio) queda el y los de adentro salen
     "absorbido": una localidad del conurbano no desaparece por un barrio
     del 1% (Burzaco, Caseros, Villa Elisa).
  3. PUNTOS. Una fila sin contorno cuyo centro cae adentro de una hoja
     dibujada sale ("absorbido"): ya esta representada. Los puntos sobreviven
     solo donde nadie dibujo nada (parajes rurales, pueblos chicos).

Lo que la regla NO hace, a proposito: no elige un NIVEL por conteo
(#localidades vs #barrios, descartado por arbitrario; la mayoria de (2) es
por contenedor, no por nivel), no baja contornos por puntos sueltos (un
punto nunca destrona un dibujo) y no inventa contornos.

Uso: `marcar_hojas(barrios)` sobre la lista de dicts de un municipio
(nombre, tipo, lat, lon, poligono JSON, fuente). Deja `hoja` y `motivo_hoja`
en cada dict y devuelve un resumen. Solo shapely: corre offline, en los
scripts, nunca en el backend.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from math import cos, radians

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

# Nivel "localidad" (L): lo que OSM tagea como poblacion y todo lo del padron.
# El resto (admin9/admin10/suburb/neighbourhood/quarter) es "barrio" (B).
TIPOS_LOCALIDAD = frozenset({"town", "city", "village", "hamlet", "localidad"})
FUENTE_PADRON = "georef"
# Tokens que, si son la UNICA diferencia entre dos nombres, marcan lugares
# distintos y no dos grafias del mismo.
CALIFICADORES = frozenset({
    "norte", "sur", "este", "oeste", "centro", "bis", "nuevo", "nueva", "viejo", "vieja",
    "alto", "alta", "bajo", "baja", "chico", "chica", "grande", "i", "ii", "iii", "iv", "v", "vi",
})
# Entre dos grafias sin contorno gana la mas oficial (mismo orden que en
# catalogo_barrios_pbf.PRIORIDAD): "Villa Fisher" (admin9) antes que "Villa
# Fischer" (quarter).
PRIORIDAD_TIPO = {"admin10": 0, "admin9": 1, "suburb": 2, "quarter": 3, "neighbourhood": 4,
                  "residential": 4.5, "localidad": 5, "city": 6, "town": 7, "village": 8, "hamlet": 9}
RADIO_DUP_KM = 1.0
PARECIDO_MIN = 0.88
LARGO_MIN_PARECIDO = 6
# Un contorno mas chico "esta adentro" de otro si al menos esta fraccion de su
# area cae dentro; el grande deja de ser hoja si los de adentro cubren esta
# fraccion del suyo, o si son esta fraccion de los contornos vivos del municipio.
FRACCION_ADENTRO = 0.5
FRACCION_CUBIERTO = 0.5
FRACCION_MAYORIA = 0.5
LARGO_MOTIVO = 120
# Sufijo del padron INDEC/BAHRA: "San Carlos de Bolivar (Est. Bolivar)" es la
# misma localidad que "San Carlos de Bolivar" (tambien "Ap." apeadero y "Emb."
# embarcadero). Otros parentesis quedan: "Parque La Gruta (Este)" y "(Oeste)"
# son dos barrios.
_SUFIJO_PADRON = re.compile(r"\((?:est|estacion|estación|ap|apeadero|emb|embarcadero)\.?\s[^)]*\)", re.I)
# "Barrio X", "B° X", "Bo. X", "Barrio Barrio X" (asi vino de OSM) -> "X".
_PREFIJO_BARRIO = re.compile(r"^(?:(?:barrio|bo|b)\s+)+")
# Un contorno cuyo nombre empieza asi es una division administrativa o un
# aglomerado, no un barrio: si tiene barrios adentro, sale el.
DIVISIONES = frozenset({"gran", "comisaria", "seccional", "seccion", "circunscripcion", "distrito", "jurisdiccion"})


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = "".join(c if c.isalnum() or c == " " else " " for c in s)
    return " ".join(s.split())


def _comparable(s: str) -> str:
    return _PREFIJO_BARRIO.sub("", _norm(_SUFIJO_PADRON.sub(" ", s or "")))


def es_division(nombre: str) -> bool:
    toks = _norm(nombre).split()
    return bool(toks) and toks[0] in DIVISIONES


def parecidos(a: str, b: str) -> bool:
    """Dos grafias del mismo lugar (True) o dos lugares distintos (False)."""
    a, b = _comparable(a), _comparable(b)
    if not a or not b:
        return False
    if a == b:
        return True
    ca, cb = Counter(a.split()), Counter(b.split())
    dif = list((ca - cb).elements()) + list((cb - ca).elements())
    if dif and all(t in CALIFICADORES or t.isdigit() for t in dif):
        return False
    if a.startswith(b + " de") or b.startswith(a + " de"):
        return True
    if min(len(a), len(b)) >= LARGO_MIN_PARECIDO and SequenceMatcher(None, a, b).ratio() >= PARECIDO_MIN:
        return True
    return False


def poligono_de(texto) -> Polygon | None:
    """Polygon (lon, lat) desde el JSON guardado, o None si no se puede."""
    if not texto:
        return None
    try:
        anillo = json.loads(texto) if isinstance(texto, str) else texto
        while anillo and isinstance(anillo[0], list) and anillo[0] and isinstance(anillo[0][0], list):
            anillo = anillo[0]
        if len(anillo) < 4:
            return None
        a, b = anillo[0][0], anillo[0][1]
        # Se guarda [lon, lat]; si alguien guardo [lat, lon], en America el |lon| es mayor.
        pts = [(p[0], p[1]) if abs(a) > abs(b) else (p[1], p[0]) for p in anillo]
        poli = Polygon(pts)
        if not poli.is_valid:
            poli = poli.buffer(0)
        return None if poli.is_empty else poli
    except (ValueError, TypeError, IndexError):
        return None


def _dist_km(a, b) -> float:
    k = cos(radians((a[1] + b[1]) / 2))
    return (((a[0] - b[0]) * 111.32 * k) ** 2 + ((a[1] - b[1]) * 110.57) ** 2) ** 0.5


def _nivel(b: dict) -> str:
    return "L" if (b.get("tipo") or "") in TIPOS_LOCALIDAD or b.get("fuente") == FUENTE_PADRON else "B"


def _preparar(barrios: list[dict]) -> list[dict]:
    out = []
    for b in barrios:
        poli = poligono_de(b.get("poligono"))
        lat, lon = b.get("lat"), b.get("lon")
        if lat is not None and lon is not None:
            pt = (float(lon), float(lat))
        elif poli is not None:
            c = poli.representative_point()
            pt = (c.x, c.y)
        else:
            pt = None
        out.append({"b": b, "nivel": _nivel(b), "P": poli, "prep": prep(poli) if poli is not None else None,
                    "area": poli.area if poli is not None else 0.0, "pt": pt,
                    "estado": "hoja", "motivo": None})
    return out


def _adentro(chico: dict, grande: dict) -> bool:
    return (chico["area"] < grande["area"] and grande["prep"].intersects(chico["P"])
            and grande["P"].intersection(chico["P"]).area >= FRACCION_ADENTRO * chico["area"])


def _fuera(r: dict, motivo: str) -> None:
    r["estado"], r["motivo"] = "fuera", motivo[:LARGO_MOTIVO]


def marcar_hojas(barrios: list[dict]) -> dict:
    """Marca `hoja` (bool) y `motivo_hoja` (str | None) en cada dict. Devuelve conteos."""
    filas = _preparar(barrios)
    for r in filas:
        if r["pt"] is None:
            _fuera(r, "sin_coord")

    # (1) duplicados de grafia
    vivos = [r for r in filas if r["estado"] == "hoja"]
    for i, a in enumerate(vivos):
        if a["estado"] == "fuera":
            continue
        for bb in vivos[i + 1:]:
            if bb["estado"] == "fuera":
                continue
            if a["P"] is not None and bb["P"] is not None and a["nivel"] != bb["nivel"]:
                continue
            if _dist_km(a["pt"], bb["pt"]) > RADIO_DUP_KM or not parecidos(a["b"]["nombre"], bb["b"]["nombre"]):
                continue
            if (a["P"] is None) != (bb["P"] is None):
                pierde = a if a["P"] is None else bb
            elif a["P"] is not None:
                pierde = a if len(a["P"].exterior.coords) < len(bb["P"].exterior.coords) else bb
            else:
                pa = PRIORIDAD_TIPO.get(a["b"].get("tipo"), 99)
                pb = PRIORIDAD_TIPO.get(bb["b"].get("tipo"), 99)
                pierde = a if pa > pb else bb
            gana = bb if pierde is a else a
            _fuera(pierde, "dup:" + gana["b"]["nombre"])
            if pierde is a:
                break

    # (2) contenedores, del mas grande al mas chico: nunca padre e hijo dibujados a la vez.
    # Sale el contenedor si lo de adentro es mayoria (por area o por cantidad) o si es
    # una division administrativa; si no, salen los de adentro (absorbidos).
    vivos = [r for r in filas if r["estado"] == "hoja"]
    polis = sorted((r for r in vivos if r["P"] is not None), key=lambda r: -r["area"])
    for p in polis:
        if p["estado"] == "fuera":
            continue
        vivos_poli = [q for q in polis if q["estado"] == "hoja"]
        hijos = [q for q in vivos_poli if q is not p and _adentro(q, p)]
        if not hijos:
            continue
        cubierto = unary_union([q["P"] for q in hijos]).intersection(p["P"]).area / p["area"]
        mayoria = len(hijos) >= FRACCION_MAYORIA * (len(vivos_poli) - 1)
        if cubierto >= FRACCION_CUBIERTO or mayoria or es_division(p["b"]["nombre"]):
            _fuera(p, f"contenedor:{len(hijos)} ({cubierto:.0%})")
        else:
            for q in hijos:
                _fuera(q, "absorbido:" + p["b"]["nombre"])

    # (3) puntos adentro de una hoja dibujada
    hojas_poli = [r for r in polis if r["estado"] == "hoja"]
    for q in vivos:
        if q["P"] is not None or q["estado"] != "hoja":
            continue
        punto = Point(q["pt"])
        for p in hojas_poli:
            if p["prep"].contains(punto):
                _fuera(q, "absorbido:" + p["b"]["nombre"])
                break

    resumen = Counter()
    for r in filas:
        r["b"]["hoja"] = r["estado"] == "hoja"
        r["b"]["motivo_hoja"] = r["motivo"]
        if r["estado"] == "hoja":
            resumen["hojas"] += 1
            resumen["hojas_poli"] += int(r["P"] is not None)
            if r["P"] is not None and any(p is not r and _adentro(r, p) for p in hojas_poli):
                resumen["anidados"] += 1
        else:
            resumen["fuera_" + r["motivo"].split(":")[0]] += 1
    return dict(resumen)


# --------------------------------------------------------------------------
# Las dos columnas en `catalogo_barrios`. Idempotente: se consultan antes de
# alterar, asi lo pueden llamar el script del PBF, `marcar_hojas.py` y la
# promocion a prod sin pisarse.
# --------------------------------------------------------------------------
COLUMNAS = {
    "hoja": "ALTER TABLE catalogo_barrios ADD COLUMN hoja TINYINT(1) NOT NULL DEFAULT 1 AFTER osm_id",
    "motivo_hoja": "ALTER TABLE catalogo_barrios ADD COLUMN motivo_hoja VARCHAR(120) NULL AFTER hoja",
}


async def columnas_faltantes(conn) -> list[str]:
    from sqlalchemy import text

    existentes = {f[0] for f in (await conn.execute(text("""
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalogo_barrios'"""))).fetchall()}
    return [col for col in COLUMNAS if col not in existentes]


async def asegurar_columnas(conn) -> list[str]:
    """Agrega `hoja` / `motivo_hoja` si faltan. Devuelve las que agrego."""
    from sqlalchemy import text

    faltan = await columnas_faltantes(conn)
    for col in faltan:
        await conn.execute(text(COLUMNAS[col]))
    return faltan
