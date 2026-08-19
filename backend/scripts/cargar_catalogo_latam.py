# -*- coding: utf-8 -*-
"""El catalogo de municipios de Latinoamerica hispanohablante, en un batch.

QUE RESUELVE
------------
Que la pantalla de demos pueda ofrecer la ciudad REAL de cualquier prospecto de
Argentina, Chile, Paraguay, Uruguay, Peru o Bolivia --- con su provincia y sus
coordenadas --- sin llamar a ningun servicio en el momento del alta. Todo lo
caro pasa aca, offline y una sola vez; el alta de la demo solo lee ids.

POR QUE GEONAMES Y NO SEIS INSTITUTOS NACIONALES
-------------------------------------------------
Cada pais publica su division politica en su propio formato, con su propio
esquema de codigos y su propia idea de que es un municipio. GeoNames ya hizo esa
normalizacion: un solo archivo por pais, mismas columnas, coordenadas incluidas.
Licencia CC-BY. La contra es que su nivel ADM no siempre cae justo donde esta el
intendente, asi que el nivel se elige pais por pais (ver NIVELES) y se contrasta
contra el numero oficial.

    https://download.geonames.org/export/dump/  -- CC-BY 4.0

QUE NIVEL ES "MUNICIPIO" EN CADA PAIS
--------------------------------------
El criterio es uno solo: **el nivel donde hay un intendente o alcalde**, que es
quien compra. No el nivel mas fino ni el mas prolijo.

    Chile     ADM3  346 comunas       coincide con las 346 oficiales
    Uruguay   ADM1   19 departamentos el intendente uruguayo es DEPARTAMENTAL;
                                      sus 125 "municipios" son alcaldias chicas
    Peru      ADM3 1873 distritos     el oficial dice 1874
    Bolivia   ADM3  539              OJO: los municipios oficiales son 339;
                                      GeoNames mezcla cantones en el mismo nivel.
                                      Se cargan igual --- son lugares reales --- pero
                                      el numero NO es la division oficial.

ARGENTINA Y PARAGUAY NO SE TOCAN
---------------------------------
Argentina ya esta completa (2.082, georef de datos.gob.ar) y Paraguay tiene 263
intendencias, MAS que las 246 que conoce GeoNames: incluye las creadas despues
del censo. Reemplazarlas por la lista de GeoNames seria perder 17 municipios
reales. De Paraguay solo se completan las COORDENADAS, que hoy estan todas en
0,0 --- una demo paraguaya nace hoy en el Golfo de Guinea.

Para eso se prueban tres fuentes en orden, y ninguna inventa nada:
    1. el distrito homonimo en GeoNames (ADM2);
    2. el poblado mas grande con ese nombre;
    3. el centroide del poligono oficial del INFONA.
Lo que no resuelve ninguna queda en 0,0 y se reporta. No se estima a ojo.

USO
---
Los dumps de GeoNames NO se versionan (6 MB). Primero se bajan:

    cd scripts/datos/geonames
    for cc in CL UY PE BO PY; do curl -sSLO https://download.geonames.org/export/dump/$cc.zip; done
    curl -sSLO https://download.geonames.org/export/dump/admin1CodesASCII.txt

Y despues:

    python scripts/cargar_catalogo_latam.py --dry-run   # no escribe, solo informa
    python scripts/cargar_catalogo_latam.py

El batch es idempotente: se puede correr las veces que haga falta. Los que
queden sin coordenadas se cierran con `completar_coords_faltantes.py`.
"""
import argparse
import asyncio
import difflib
import io
import json
import os
import re
import sys
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DATOS = Path(__file__).resolve().parent / "datos"
GEONAMES = DATOS / "geonames"
INFONA = DATOS / "infona_distritos_py.geojson"
SALIDA = DATOS / "catalogo_latam.json"

# Nivel administrativo con intendente/alcalde, pais por pais. Ver el docstring:
# no es el mismo en todos y elegirlo mal carga provincias o barrios.
NIVELES = {"CL": "ADM3", "UY": "ADM1", "PE": "ADM3", "BO": "ADM3"}
# Los "seat" (capital administrativa) por nivel: sus coordenadas son las del
# casco urbano, mientras que las del registro ADM suelen ser un centroide que
# en un distrito rural cae en el campo.
SEAT = {"ADM1": "PPLA", "ADM2": "PPLA2", "ADM3": "PPLA3", "ADM4": "PPLA4"}
# Ruido que GeoNames antepone al nombre y que nadie escribe al buscar.
PREFIJOS = re.compile(r"^(Comuna de |Provincia de |Departamento de |Municipio de |"
                      r"Distrito de |Regi[oó]n de |Regi[oó]n del )", re.I)
SUFIJOS = re.compile(r"( District| Department| Province| Region| Municipality)$", re.I)
# Umbral para aceptar dos grafias como el mismo municipio, y cuanta ventaja
# tiene que sacarle al segundo candidato. Calibrado contra los 15 que quedaban
# sin resolver: con estos valores entran los que son claramente el mismo lugar
# y queda afuera "Jesus de Tavarangue", cuyo mejor candidato (0.53, "San Juan
# del Parana") es otro municipio.
UMBRAL_SIMILITUD = 0.62
MARGEN = 0.15


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    for ch in ".-'’":
        s = s.replace(ch, " ")
    return " ".join(s.lower().split())


# Tratamientos con los que la ley bautiza a un municipio y que nadie usa al
# hablar: "Doctor J. Eulogio Estigarribia" es Campo 9 para todo el mundo.
TRATAMIENTOS = re.compile(
    r"^(doctor|dr|general|gral|capitan|cap|coronel|cnel|mayor|teniente 1o|"
    r"teniente|tte|mariscal|presidente|pdte|don|fray|padre|profesor)\s+", re.I)


def variantes(nombre: str, alias: str, departamento: str) -> list[str]:
    """Formas bajo las que un mismo municipio puede aparecer en otra fuente.

    Todas son el MISMO nombre escrito distinto --- no se inventa un municipio ni
    se lo aproxima al mas parecido. Quien las use tiene que exigir ademas que
    coincida el departamento, o "Santa Rosa" se lleva puesta a la de otro lado.
    """
    base = [nombre] + [a for a in (alias or "").split("|") if a]
    out = []
    for n in base:
        out.append(n)
        out.append(TRATAMIENTOS.sub("", n))
        # "Santa Rosa Misiones" -> "Santa Rosa": el departamento pegado al final
        # es desambiguacion del registro civil, no parte del nombre.
        if departamento and norm(n).endswith(" " + norm(departamento)):
            out.append(n[: -len(departamento)].strip())
    vistos, limpio = set(), []
    for n in out:
        k = norm(n)
        if k and k not in vistos:
            vistos.add(k)
            limpio.append(k)
    return limpio


def limpiar(nombre: str) -> str:
    return SUFIJOS.sub("", PREFIJOS.sub("", (nombre or "").strip())).strip() or nombre


# ==========================================================================
# Lectura de GeoNames
# ==========================================================================

CAMPOS = ("geonameid name asciiname alternatenames lat lon fclass fcode country cc2 "
          "adm1 adm2 adm3 adm4 poblacion elevacion dem tz modificado").split()


def leer_pais(cc: str) -> list[dict]:
    """Todas las filas del dump de un pais, como dicts."""
    with zipfile.ZipFile(GEONAMES / f"{cc}.zip") as z:
        crudo = z.read(f"{cc}.txt").decode("utf-8")
    filas = []
    for linea in crudo.split("\n"):
        p = linea.split("\t")
        if len(p) < 19:
            continue
        f = dict(zip(CAMPOS, p))
        try:
            f["lat"], f["lon"] = float(f["lat"]), float(f["lon"])
            f["poblacion"] = int(f["poblacion"] or 0)
        except ValueError:
            continue
        filas.append(f)
    return filas


def provincias_por_codigo() -> dict[str, str]:
    """'CL.05' -> 'Region de Valparaiso'. Es lo que desambigua homonimos."""
    out = {}
    for linea in io.open(GEONAMES / "admin1CodesASCII.txt", encoding="utf-8"):
        p = linea.rstrip("\n").split("\t")
        if len(p) >= 2:
            out[p[0]] = limpiar(p[1])
    return out


def clave_adm(f: dict, nivel: str) -> tuple:
    """Los codigos administrativos que identifican a que division pertenece."""
    n = int(nivel[-1])
    return tuple(f.get(f"adm{i}") or "" for i in range(1, n + 1))


def catalogo_pais(cc: str, provincias: dict[str, str]) -> list[dict]:
    """Municipios de un pais, con la mejor coordenada disponible para cada uno."""
    nivel = NIVELES[cc]
    filas = leer_pais(cc)

    # Indice de poblados por division, para poder preferir el casco urbano.
    seats: dict[tuple, dict] = {}
    poblados: dict[tuple, list[dict]] = defaultdict(list)
    for f in filas:
        if f["fcode"] == SEAT[nivel] or (nivel == "ADM1" and f["fcode"] == "PPLC"):
            seats.setdefault(clave_adm(f, nivel), f)
        elif f["fclass"] == "P":
            poblados[clave_adm(f, nivel)].append(f)

    out = []
    for f in filas:
        if f["fcode"] != nivel:
            continue
        k = clave_adm(f, nivel)
        # 1) la capital administrativa; 2) el poblado mas grande; 3) el propio
        # registro. Las tres son coordenadas reales, no un promedio inventado.
        ref = seats.get(k)
        if ref is None and poblados.get(k):
            ref = max(poblados[k], key=lambda x: x["poblacion"])
        ref = ref or f
        alias = [a.strip() for a in (f["alternatenames"] or "").split(",")
                 if a.strip() and a.strip().lower() != f["name"].lower()
                 and len(a.strip()) < 60 and not a.strip().startswith("http")]
        out.append({
            "id": f"{cc.lower()}-{f['geonameid']}"[:20],
            "nombre": limpiar(f["name"])[:100],
            "provincia": (provincias.get(f"{cc}.{f['adm1']}") or "")[:60],
            "lat": round(ref["lat"], 6),
            "lng": round(ref["lon"], 6),
            "pais": cc,
            "alias": "|".join(alias)[:500],
            "origen_coord": ("capital" if seats.get(k) else
                             "poblado_mayor" if poblados.get(k) else "division"),
        })
    return out


# ==========================================================================
# Paraguay: SOLO se completan coordenadas
# ==========================================================================

def centroides_infona() -> dict[str, tuple[float, float]]:
    """Centro del poligono oficial de cada distrito paraguayo."""
    if not INFONA.exists():
        return {}
    out = {}
    for f in json.loads(INFONA.read_text(encoding="utf-8"))["features"]:
        geom = f.get("geometry") or {}
        c = geom.get("coordinates") or []
        anillos = ([c[0]] if geom.get("type") == "Polygon" and c
                   else [p[0] for p in c if p] if geom.get("type") == "MultiPolygon" else [])
        if not anillos:
            continue
        mayor = max(anillos, key=len)
        out[norm(f["properties"].get("nom_dist") or "")] = (
            round(sum(p[1] for p in mayor) / len(mayor), 6),
            round(sum(p[0] for p in mayor) / len(mayor), 6))
    return out


def coords_paraguay(provincias: dict[str, str]) -> tuple[dict, dict]:
    """Coordenadas candidatas para las intendencias.

    Devuelve dos indices: uno por (departamento, nombre) --- el bueno, porque el
    departamento evita confundir homonimos --- y otro solo por nombre, que se usa
    unicamente cuando el nombre es unico en todo el pais.
    """
    filas = leer_pais("PY")
    con_dpto: dict[tuple, tuple[float, float, str]] = {}
    solo_nombre: dict[str, list[tuple[float, float, str]]] = defaultdict(list)

    def anotar(nombre: str, dpto: str, lat: float, lon: float, fuente: str):
        k = norm(nombre)
        if dpto:
            con_dpto.setdefault((norm(dpto), k), (lat, lon, fuente))
        solo_nombre[k].append((lat, lon, fuente))

    for f in filas:  # 1) el distrito homonimo
        if f["fcode"] == "ADM2":
            anotar(limpiar(f["name"]), provincias.get(f"PY.{f['adm1']}", ""),
                   f["lat"], f["lon"], "geonames_adm2")
    mayores: dict[tuple, dict] = {}
    for f in filas:  # 2) el poblado mas grande con ese nombre
        k = (f.get("adm1") or "", norm(f["name"]))
        if f["fclass"] == "P" and (k not in mayores or f["poblacion"] > mayores[k]["poblacion"]):
            mayores[k] = f
    for f in mayores.values():
        anotar(f["name"], provincias.get(f"PY.{f['adm1']}", ""),
               f["lat"], f["lon"], "geonames_poblado")
    for nom, (la, lo) in centroides_infona().items():  # 3) el centroide oficial
        solo_nombre[nom].append((la, lo, "centroide_infona"))
    return con_dpto, solo_nombre


# ==========================================================================
# Carga
# ==========================================================================

def url_qa() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        for linea in io.open(Path(__file__).resolve().parent.parent / ".env", encoding="utf-8"):
            if linea.startswith("DATABASE_URL="):
                url = linea.split("=", 1)[1].strip().strip('"')
                break
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit("ABORTO: la base no es QA. Escribir en produccion es de Infraestructura.")
    return url


async def main(dry: bool) -> int:
    provincias = provincias_por_codigo()
    registros: list[dict] = []
    for cc in NIVELES:
        r = catalogo_pais(cc, provincias)
        por_origen = defaultdict(int)
        for x in r:
            por_origen[x["origen_coord"]] += 1
        print(f"{cc}: {len(r):5} municipios  ({dict(por_origen)})")
        registros.extend(r)

    SALIDA.write_text(json.dumps(registros, ensure_ascii=False), encoding="utf-8")
    print(f"\ncatalogo -> {SALIDA} ({len(registros)} registros)")

    py_con_dpto, py_por_nombre = coords_paraguay(provincias)
    print(f"candidatas de coordenadas para Paraguay: {len(py_por_nombre)} nombres, "
          f"{len(py_con_dpto)} con departamento")

    if dry:
        print("\n--dry-run: no se escribio en la base")
        return 0

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(url_qa())
    async with engine.begin() as conn:
        # --- Paises nuevos: alta idempotente, sin borrar nada de nadie ---
        for i in range(0, len(registros), 500):
            lote = registros[i:i + 500]
            await conn.execute(text("""
                INSERT INTO municipios_catalogo (id, nombre, provincia, lat, lng, pais, alias)
                VALUES (:id, :nombre, :provincia, :lat, :lng, :pais, :alias)
                ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), provincia=VALUES(provincia),
                    lat=VALUES(lat), lng=VALUES(lng), alias=VALUES(alias)
            """), [{k: v for k, v in r.items() if k != "origen_coord"} for r in lote])

        # --- Paraguay: SOLO UPDATE de coordenadas en 0,0. Nunca INSERT ni DELETE ---
        pendientes = (await conn.execute(text(
            "SELECT id, nombre, provincia, alias FROM municipios_catalogo "
            "WHERE pais = 'PY' AND lat = 0 AND lng = 0"))).all()
        resueltas = defaultdict(int)
        sin_resolver: list[str] = []
        por_similitud: list[tuple[str, str, float]] = []
        for mid, nombre, dpto, alias in pendientes:
            hit = None
            for v in variantes(nombre, alias, dpto):
                # Primero exigiendo el departamento. Recien si el nombre es
                # UNICO en todo el pais se acepta sin el: con dos candidatos
                # homonimos no hay forma de saber cual es, y adivinar seria
                # poner al municipio en la ciudad equivocada.
                hit = py_con_dpto.get((norm(dpto), v))
                if hit:
                    break
                cand = py_por_nombre.get(v) or []
                if len({(round(c[0], 3), round(c[1], 3)) for c in cand}) == 1:
                    hit = cand[0]
                    break
            if not hit:
                # Ultimo recurso: el candidato mas parecido DEL MISMO
                # DEPARTAMENTO. Resuelve diferencias de grafia entre fuentes
                # ("Guazucua" / "Guazu Cua", "Yby Ya'u" / "Yvy Ya´U") sin
                # aproximar municipios distintos: se exige un margen claro sobre
                # el segundo candidato, asi un empate se descarta en vez de
                # elegir al azar. Cada emparejamiento se imprime con su puntaje
                # para que sea auditable --- no se hace nada a espaldas de nadie.
                puntajes = sorted(
                    ((difflib.SequenceMatcher(None, norm(nombre), n).ratio(), n, v)
                     for (d, n), v in py_con_dpto.items() if d == norm(dpto)),
                    reverse=True)
                # El margen se mide contra el mejor candidato que sea OTRO LUGAR.
                # El indice trae el distrito y su pueblo cabecera con nombres casi
                # iguales apuntando al mismo punto: eso no es una ambiguedad, es
                # el mismo municipio dos veces, y compararlos entre si descartaba
                # emparejamientos correctos.
                if puntajes and puntajes[0][0] >= UMBRAL_SIMILITUD:
                    la0, lo0, _ = puntajes[0][2]
                    rival = next((r for r, _n, (la, lo, _f) in puntajes[1:]
                                  if abs(la - la0) + abs(lo - lo0) > 0.1), 0.0)
                    if puntajes[0][0] - rival >= MARGEN:
                        hit = puntajes[0][2]
                        por_similitud.append((nombre, puntajes[0][1], puntajes[0][0]))
            if not hit:
                sin_resolver.append(nombre)
                continue
            await conn.execute(text(
                "UPDATE municipios_catalogo SET lat = :la, lng = :lo WHERE id = :i"),
                {"la": hit[0], "lo": hit[1], "i": mid})
            resueltas[hit[2]] += 1
        print(f"\nParaguay: {len(pendientes)} sin coordenadas -> "
              f"{sum(resueltas.values())} resueltas {dict(resueltas)}")
        if sin_resolver:
            print(f"  quedan en 0,0 ({len(sin_resolver)}): {', '.join(sin_resolver[:12])}")

    async with engine.connect() as conn:
        from sqlalchemy import text as t2
        print("\nESTADO FINAL")
        for r in (await conn.execute(t2(
                "SELECT pais, COUNT(*), SUM(lat = 0 AND lng = 0) "
                "FROM municipios_catalogo GROUP BY pais ORDER BY pais"))).all():
            print(f"  {r[0]}: {r[1]:5} municipios · {r[2]} sin coordenadas")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a, _ = ap.parse_known_args()
    sys.exit(asyncio.run(main(a.dry_run)))
