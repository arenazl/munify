# -*- coding: utf-8 -*-
"""El contorno REAL de cada municipio, para no tener que aproximarlo con un circulo.

PARA QUE SIRVE UN CONTORNO
---------------------------
Para sortear los puntos de la demo DENTRO del municipio y no en el de al lado.
Hoy, cuando no hay limite oficial, `geo_demo` usa un circulo alrededor del
centro: funciona, pero es una aproximacion --- se come pedazos del vecino y deja
afuera pedazos propios. Con el contorno real, cada reclamo de la demo cae donde
tiene que caer.

Ojo con la confusion facil: esto NO son los distritos internos de una ciudad.
Son dos cosas distintas y solo una hace falta siempre:

    contorno del municipio  ->  lo necesita TODO municipio (sortear adentro)
    distritos internos      ->  solo capitales y ciudades grandes

Caacupe es un solo distrito. San Pedro Norte tambien. La division interna es la
excepcion, no la regla.

POR QUE BATCH Y NO EN VIVO
---------------------------
No existe un endpoint "dame el poligono de Caacupe": se baja el PAIS entero
(entre 3 y 164 MB segun el pais) y se recorta. Eso es batch por definicion.

La unica fuente con consulta puntual por ciudad es Overpass, y es la que
devolvio 504 y 429 en veinte minutos cuando se armaron los distritos de
Asuncion. En vivo, delante de un intendente, eso es la demo rota.

Y el argumento que cierra: igual hay que precalentar las direcciones de cada
ciudad (~40 s, ver `generar_puntos_demo.py`). Si ya hay un batch por ciudad, el
contorno viaja en el mismo viaje y hacerlo en vivo no ahorra un solo paso.

LA FUENTE
---------
geoBoundaries (CC-BY 4.0), que publica los limites administrativos del mundo
tomandolos de los institutos oficiales de cada pais --- DGEEC en Paraguay, IGN en
Argentina y Peru, la Biblioteca del Congreso en Chile, GeoBolivia en Bolivia.

    https://www.geoboundaries.org/api/current/gbOpen/<ISO3>/<NIVEL>/

EL NIVEL NO ES EL MISMO EN TODOS LADOS, Y NO SIEMPRE HAY
---------------------------------------------------------
`ADM2` es distrito en Paraguay pero departamento en Argentina, donde un
departamento contiene VARIOS municipios: usarlo ahi seria peor que el circulo,
porque pondria los reclamos en el pueblo de al lado. Por eso el script no
adivina: recibe el nivel, cruza contra el catalogo y REPORTA la tasa de match.
Si la tasa es mala, se ve en el reporte y no se carga nada.

Lo que no matchea queda sin contorno y sigue usando el circulo. Nunca se le
asigna a un municipio el contorno de otro por parecido.

USO
---
    python scripts/batch/contornos_municipios.py --pais PY --iso3 PRY --nivel ADM2 --dry-run
    python scripts/batch/contornos_municipios.py --pais PY --iso3 PRY --nivel ADM2
    python scripts/batch/contornos_municipios.py --pais CL --iso3 CHL --nivel ADM3
"""
import argparse
import asyncio
import json
import sys
import urllib.request
import difflib

from _comun import CONTORNOS, anillos, motor, norm, simplificar  # noqa: E402

API = "https://www.geoboundaries.org/api/current/gbOpen/{iso3}/{nivel}/"

# Cuando el pais publica SUS municipios con geometria, gana su fuente sobre
# geoBoundaries: es la division vigente y no la del ultimo censo que alguien
# consolido. En Argentina ademas cierra perfecto --- el catalogo salio de
# georef, cuyo id ES el codigo INDEC, y el IGN publica ese mismo codigo en
# `in1`: 2.081/2.082 emparejan por id, cero por nombre (medido 2026-09-02).
#
# Por que el WFS del IGN y no el geojson de georef: georef publica una
# version SIMPLIFICADA para dibujar en un mapa chico (2 MB el pais; mediana
# 11 vertices por municipio, 76% con menos de 20). Con eso, la consulta a
# OSM que recorta barrios y calles por poligono se comia media ciudad o
# traia la del vecino. El WFS trae el limite completo (mediana ~290
# vertices, 64 MB) y aca se muestrea a `--puntos`.
#
# geoBoundaries no sirve para Argentina: su ADM2 son departamentos, que
# contienen VARIOS municipios (probado: 383/2082 y el script aborto solo).
FUENTES = {
    "AR": {
        "url": ("https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=2.0.0"
                "&request=GetFeature&typeName=ign:municipio&outputFormat=application/json"),
        "archivo": "AR_municipios_ign.geojson",
        "id": "in1",
        "nombre": "nam",
        "fuente": "IGN Argentina, capa `municipio` (WFS) --- 2.114 municipios, limite completo",
    },
}
UA = "Munify/1.0 (contornos municipales para demos; https://munify.com.ar)"
# Los nombres del catalogo y los del shapefile se escriben distinto. Estas son
# las mismas variantes que ya se usan para las coordenadas: se prueban formas
# del MISMO nombre, no municipios parecidos.
RUIDO = ("municipio de ", "distrito de ", "comuna de ", "partido de ",
         "departamento de ", "provincia de ", "ciudad de ", "villa de ")


def bajar_url(url: str, destino_nombre: str, descripcion: str) -> list[dict]:
    """Un GeoJSON de una fuente nacional. Se cachea igual que el de geoBoundaries."""
    CONTORNOS.mkdir(parents=True, exist_ok=True)
    destino = CONTORNOS / destino_nombre
    if destino.exists():
        print(f"  usando el archivo ya bajado ({destino.stat().st_size / 1048576:.1f} MB)")
    else:
        print(f"  fuente: {descripcion}")
        print(f"  bajando {url.rsplit('/', 1)[-1]} ...")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=900) as r:
            destino.write_bytes(r.read())
        print(f"  {destino.stat().st_size / 1048576:.1f} MB guardados")
    return json.loads(destino.read_text(encoding="utf-8"))["features"]


def bajar(iso3: str, nivel: str) -> list[dict]:
    """El GeoJSON del pais entero. Se cachea: son decenas de MB."""
    CONTORNOS.mkdir(parents=True, exist_ok=True)
    destino = CONTORNOS / f"{iso3}_{nivel}.geojson"
    if destino.exists():
        print(f"  usando el archivo ya bajado ({destino.stat().st_size / 1048576:.0f} MB)")
        return json.loads(destino.read_text(encoding="utf-8"))["features"]

    req = urllib.request.Request(API.format(iso3=iso3, nivel=nivel),
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        meta = json.loads(r.read().decode())
    meta = meta[0] if isinstance(meta, list) else meta
    url = meta.get("gjDownloadURL")
    if not url:
        sys.exit(f"geoBoundaries no tiene {nivel} para {iso3}")
    print(f"  fuente: {meta.get('boundarySource', '?')[:60]}")
    print(f"  licencia: {meta.get('boundaryLicense', '?')}")
    print(f"  bajando {url.rsplit('/', 1)[-1]} ...")

    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=900) as r:
        crudo = r.read()
    destino.write_bytes(crudo)
    print(f"  {len(crudo) / 1048576:.0f} MB guardados en {destino.name}")
    return json.loads(crudo.decode("utf-8"))["features"]


def claves(nombre: str) -> list[str]:
    """Formas del mismo nombre bajo las que puede venir en la otra fuente."""
    n = norm(nombre)
    out = {n}
    for r in RUIDO:
        if n.startswith(r):
            out.add(n[len(r):])
    return [x for x in out if x]


async def main(a: argparse.Namespace) -> int:
    propia = FUENTES.get(a.pais) if not a.forzar_geoboundaries else None
    if propia:
        print(f"{a.pais}: fuente nacional propia")
        features = bajar_url(propia["url"], propia.get("archivo") or f"{a.pais}_municipios.geojson",
                             propia["fuente"])
        campo_id, campo_nombre = propia["id"], propia["nombre"]
    else:
        if not a.iso3:
            sys.exit(f"Sin fuente propia para {a.pais}: hace falta --iso3 y --nivel.")
        print(f"{a.iso3} {a.nivel} (pais {a.pais} del catalogo)")
        features = bajar(a.iso3, a.nivel)
        campo_id, campo_nombre = None, "shapeName"
    print(f"  {len(features)} areas en el archivo")

    # EL MATCH ES GEOMETRICO, NO POR NOMBRE.
    #
    # Cada municipio del catalogo ya tiene su centro (lat/lng real, cargado por
    # `cargar_catalogo_latam.py`). El contorno que le corresponde es, sin
    # ambiguedad posible, el que CONTIENE ese punto. Cruzar por nombre en cambio
    # falla de las dos maneras: no encuentra "Azote'y" porque el archivo lo
    # escribe distinto, y encuentra mal "Bella Vista" porque hay dos en el pais.
    #
    # El nombre queda solo como dato para el reporte, para poder auditar que lo
    # que se emparejo tiene sentido.
    areas = []
    por_id: dict[str, dict] = {}
    for f in features:
        props = f.get("properties") or {}
        for anillo in anillos(f.get("geometry") or {}):
            if len(anillo) < 3:
                continue
            xs = [p[0] for p in anillo]
            ys = [p[1] for p in anillo]
            area = {
                "nombre": props.get(campo_nombre) or "?",
                "anillo": anillo,
                "bbox": (min(xs), min(ys), max(xs), max(ys)),
            }
            areas.append(area)
            # Si las dos fuentes comparten el identificador oficial, no hay nada
            # que emparejar: es el mismo municipio y punto.
            if campo_id and props.get(campo_id):
                anterior = por_id.get(str(props[campo_id]))
                if anterior is None or len(anillo) > len(anterior["anillo"]):
                    por_id[str(props[campo_id])] = area
    # Sin el pre-filtro por rectangulo esto son millones de comparaciones: se
    # descarta de una casi todo antes de entrar al ray casting.
    print(f"  {len(areas)} anillos indexados")

    engine = motor()
    from sqlalchemy import text
    async with engine.connect() as conn:
        muni = (await conn.execute(text(
            "SELECT id, nombre, provincia, alias, lat, lng FROM municipios_catalogo "
            "WHERE pais = :p ORDER BY nombre"), {"p": a.pais})).all()
    print(f"  {len(muni)} municipios del catalogo\n")

    aciertos, sin_centro, sin_area, distinto_nombre = [], [], [], []
    sospechosos: list[str] = []
    por_identificador = 0
    # Cuantos municipios termino usando cada area ORIGINAL. Se cuenta con la
    # identidad del area de la fuente, no con la del anillo simplificado ---
    # simplificar devuelve una lista nueva cada vez, asi que contar sobre eso
    # daba 1.00 siempre y la guarda no servia para nada.
    usos: dict[int, int] = {}
    from _comun import dentro
    for mid, nombre, _prov, _alias, lat, lng in muni:
        if not lat or not lng or (float(lat) == 0 and float(lng) == 0):
            sin_centro.append(nombre)
            continue
        # 1) por identificador oficial, cuando las dos fuentes usan el mismo
        directo = por_id.get(str(mid))
        if directo:
            aciertos.append((mid, nombre, simplificar(directo["anillo"], a.puntos)))
            usos[id(directo)] = usos.get(id(directo), 0) + 1
            por_identificador += 1
            continue
        # 2) si no, por geometria: el area que contiene al centro del municipio
        punto = (float(lng), float(lat))
        contiene = [ar for ar in areas
                    if ar["bbox"][0] <= punto[0] <= ar["bbox"][2]
                    and ar["bbox"][1] <= punto[1] <= ar["bbox"][3]
                    and dentro(punto, ar["anillo"])]
        if not contiene:
            sin_area.append(nombre)
            continue
        # Si el punto cae en mas de un anillo (islas, enclaves), gana el mas
        # chico: es el que describe con mas precision donde esta el municipio.
        elegido = min(contiene, key=lambda ar: (ar["bbox"][2] - ar["bbox"][0])
                      * (ar["bbox"][3] - ar["bbox"][1]))
        # El nombre no decide nada, pero SI sirve de control: si el area que
        # contiene al municipio se llama parecido, todo bien --- es la misma
        # localidad escrita distinto. Si se llama completamente distinto, la
        # sospecha es que el CENTRO del catalogo esta mal y cayo en el municipio
        # vecino. Esos se listan aparte para mirarlos de verdad.
        parecido = difflib.SequenceMatcher(None, norm(nombre), norm(elegido["nombre"])).ratio()
        if norm(elegido["nombre"]) not in claves(nombre):
            if parecido < 0.55:
                # NO se carga. Casi siempre es un municipio creado despues del
                # censo del que sale el archivo: su territorio todavia figura
                # dentro del distrito padre, asi que el contorno que le tocaria
                # es mucho mas grande que el municipio real. Y a veces es peor
                # --- "Yby Pyta -> Jesus" son departamentos distintos --- lo que
                # delata un centro mal cargado. En los dos casos el circulo
                # aproximado miente menos que el contorno del vecino.
                sospechosos.append(f"{nombre} -> {elegido['nombre']} ({parecido:.2f})")
                continue
            distinto_nombre.append(f"{nombre} -> {elegido['nombre']} ({parecido:.2f})")
        aciertos.append((mid, nombre, simplificar(elegido["anillo"], a.puntos)))
        usos[id(elegido)] = usos.get(id(elegido), 0) + 1

    # GUARDA DE NIVEL: si muchos municipios caen en el MISMO contorno, el nivel
    # pedido no es el municipal --- pasa en Argentina, donde ADM2 son
    # departamentos y cada uno contiene varios municipios. Cargar eso seria peor
    # que no cargar nada: los reclamos de la demo irian a parar al pueblo de al
    # lado con apariencia de dato oficial.
    compartidos = sorted(usos.values(), reverse=True)
    promedio = (sum(compartidos) / len(compartidos)) if compartidos else 0

    total = len(muni) or 1
    print(f"RESULTADO   {len(aciertos)}/{len(muni)} con contorno ({100 * len(aciertos) // total}%)")
    print(f"  municipios por contorno : {promedio:.2f} promedio, {compartidos[0] if compartidos else 0} el peor")
    print(f"  por identificador oficial: {por_identificador}")
    print(f"  sin centro cargado      : {len(sin_centro)}")
    print(f"  el centro no cae en nada: {len(sin_area)}")
    print(f"  nombre distinto al area : {len(distinto_nombre)}  (normal: grafias distintas)")
    print(f"  SOSPECHOSOS             : {len(sospechosos)}  (nombre sin parecido: revisar)")
    for x in sospechosos:
        print(f"    ! {x}")
    for etiqueta, lista in (("sin centro", sin_centro), ("sin area", sin_area),
                            ("otro nombre", distinto_nombre)):
        if lista:
            print(f"    {etiqueta}: {'; '.join(lista[:6])}{' ...' if len(lista) > 6 else ''}")

    # Las dos guardas se evaluan TAMBIEN en dry-run: sirven justamente para
    # decidir si un nivel administrativo es usable, y esa respuesta hay que
    # tenerla antes de escribir, no despues.
    # Los return tempranos tambien sueltan la conexion: sin el dispose, aiomysql
    # se queja al salir ("Event loop is closed") en cada dry-run.
    if len(aciertos) < total * a.minimo:
        print(f"\nABORTADO: menos del {a.minimo:.0%} matcheo. El nivel {a.nivel} "
              f"probablemente no es el municipal en {a.iso3}. No se carga nada.")
        await engine.dispose()
        return 1
    if promedio > a.max_por_contorno:
        print(f"\nABORTADO: {promedio:.2f} municipios comparten cada contorno (hasta "
              f"{compartidos[0]}). El nivel pedido agrupa VARIOS municipios en una "
              f"sola area,\nasi que a algunos les tocaria el limite del vecino. Con "
              f"eso los reclamos de la demo caerian en otra ciudad, con apariencia\n"
              f"de dato oficial: el circulo aproximado miente menos. No se escribe nada.")
        await engine.dispose()
        return 1

    if a.dry_run:
        print("\n--dry-run: no se escribio nada")
        await engine.dispose()
        return 0

    async with engine.begin() as conn:
        for i in range(0, len(aciertos), 200):
            await conn.execute(text(
                "UPDATE municipios_catalogo SET poligono = :poly WHERE id = :id"),
                [{"id": mid, "poly": json.dumps(anillo)} for mid, _n, anillo in aciertos[i:i + 200]])
    async with engine.connect() as conn:
        con, sin = (await conn.execute(text(
            "SELECT SUM(poligono IS NOT NULL), SUM(poligono IS NULL) "
            "FROM municipios_catalogo WHERE pais = :p"), {"p": a.pais})).first()
    await engine.dispose()
    print(f"\n{a.pais}: {con} municipios con contorno · {sin} siguen con el circulo aproximado")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pais", required=True, help="Codigo de 2 letras del catalogo (PY, AR...)")
    ap.add_argument("--iso3", help="Codigo de 3 letras de geoBoundaries (PRY, CHL...). "
                                   "No hace falta si el pais tiene fuente propia en FUENTES.")
    ap.add_argument("--forzar-geoboundaries", action="store_true",
                    help="Ignora la fuente nacional y usa geoBoundaries igual")
    ap.add_argument("--nivel", default="ADM2", help="ADM1/ADM2/ADM3: cual es el municipal")
    ap.add_argument("--puntos", type=int, default=300, help="Vertices por contorno")
    ap.add_argument("--minimo", type=float, default=0.5,
                    help="Tasa de match minima para animarse a cargar")
    ap.add_argument("--max-por-contorno", type=float, default=1.35,
                    help="Si mas municipios comparten contorno, el nivel no es el municipal")
    ap.add_argument("--dry-run", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
