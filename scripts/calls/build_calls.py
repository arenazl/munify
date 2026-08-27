# -*- coding: utf-8 -*-
"""Genera la app de llamados (/calls) desde las planillas del directorio.

    python scripts/calls/build_calls.py

QUE HACE
--------
Lee TODO lo que hay en `docs/regiones/` (las planillas .xlsx, el .docx de
Uruguay y el .txt con los speeches), le pega los datos curados de
`scripts/calls/datos/` (los nombres de los intendentes y la investigacion
por municipio) y escribe `frontend/public/calls/index.html` con todo
embebido — un solo archivo, sin dependencias, servido como estatico.

POR QUE ASI
-----------
La app tiene que abrirse desde el celular en medio de una ronda de
llamadas, sin backend ni login. Por eso los datos viajan DENTRO del html.
El costo es que hay que regenerarlo cuando cambian: esto es ese boton.

DE DONDE SALE CADA COSA
-----------------------
  docs/regiones/*.xlsx            -> municipios, telefono, perfil (planillas del dueño)
  docs/regiones/*.docx            -> idem, para Uruguay
  docs/regiones/speech*.txt       -> el speech por pais + los tips
  scripts/calls/datos/funcionarios.json  -> quien es el intendente (CURADO)
  scripts/calls/datos/investigacion.json -> secretarias, digitalizacion, dato de color (CURADO)
  scripts/calls/plantilla.html    -> la app, con el hueco /*__DATOS__*/{}

Los dos JSON curados se editan a mano o los rellena una busqueda web (ver
`docs/calls/01-actualizar-directorio.md`). La clave para que empalmen es el
`id`, que se DERIVA del pais + la localidad: si en la planilla se corrige
el nombre de un municipio, su id cambia y hay que renombrar la clave en los
JSON (el script avisa cuales quedaron huerfanos).

REGLA DURA: aca no se inventa un dato. Un municipio sin intendente conocido
va sin nombre; la app simplemente no muestra ese bloque. Un nombre
equivocado dicho por telefono es peor que no tenerlo.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REGIONES = os.path.join(RAIZ, "docs", "regiones")
DATOS = os.path.join(os.path.dirname(__file__), "datos")
PLANTILLA = os.path.join(os.path.dirname(__file__), "plantilla.html")
SALIDA = os.path.join(RAIZ, "frontend", "public", "calls", "index.html")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
norm = lambda s: re.sub(r"\s+", " ", str(s if s is not None else "")).strip()  # noqa: E731


def slug(pais: str, localidad: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", (pais + "-" + localidad).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ---------------------------------------------------------------- planillas
def leer_planillas() -> list[dict]:
    """Cada .xlsx de docs/regiones. La cabecera se detecta por su primera
    celda: 'Provincia' (planilla argentina, sin columna de pais) o 'Pais'."""
    import openpyxl
    out = []
    for arch in sorted(os.listdir(REGIONES)):
        if not arch.endswith(".xlsx") or arch.startswith("~$"):
            continue
        lote = re.sub(r"^Directorio_Munify_|\.xlsx$", "", arch).replace("_", " ").strip()
        filas = list(openpyxl.load_workbook(os.path.join(REGIONES, arch)).worksheets[0]
                     .iter_rows(values_only=True))
        try:
            h = next(i for i, r in enumerate(filas) if r and norm(r[0]) in ("Provincia", "País", "Pais"))
        except StopIteration:
            print(f"  [!] {arch}: no encontre la fila de cabecera, la salteo")
            continue
        con_pais = norm(filas[h][0]) in ("País", "Pais")
        for r in filas[h + 1:]:
            if not r or not norm(r[0]):
                continue
            r = list(r) + [""] * 6
            if con_pais:
                out.append(dict(pais=norm(r[0]), region=norm(r[1]), localidad=norm(r[2]),
                                habitantes=norm(r[3]), perfil=norm(r[4]), telefono=norm(r[5]), lote=lote))
            else:
                out.append(dict(pais="Argentina", region=norm(r[0]), localidad=norm(r[1]),
                                habitantes=norm(r[2]), perfil=norm(r[3]), telefono=norm(r[4]), lote=lote))
    return out


def leer_docx() -> list[dict]:
    """Uruguay vino en Word. Se leen las filas de tabla con el parser XML
    (un regex sobre el XML se enreda con el anidado y devuelve basura)."""
    out = []
    for arch in sorted(os.listdir(REGIONES)):
        if not arch.endswith(".docx") or arch.startswith("~$"):
            continue
        raiz = ET.fromstring(zipfile.ZipFile(os.path.join(REGIONES, arch)).read("word/document.xml"))
        filas = []
        for tbl in raiz.iter(W + "tbl"):
            for tr in tbl.findall(W + "tr"):
                celdas = [norm("".join(t.text or "" for t in tc.iter(W + "t")))
                          for tc in tr.findall(W + "tc")]
                if any(celdas):
                    filas.append(celdas)
        lote = re.sub(r"^Directorio (Comercial )?Munify |\.docx$", "", arch).strip()
        for c in filas[1:]:                      # la primera es la cabecera
            c = list(c) + [""] * 6
            out.append(dict(pais=norm(c[0]) or "Uruguay", region=norm(c[1]), localidad=norm(c[2]),
                            habitantes=norm(c[3]), perfil=norm(c[4]), telefono=norm(c[5]), lote=lote))
    return out


def leer_speeches() -> tuple[dict, list]:
    """El .txt del dueño: un bloque numerado por pais + los tips del final."""
    arch = next((a for a in os.listdir(REGIONES) if a.endswith(".txt") and "speech" in a.lower()), None)
    if not arch:
        return {}, []
    txt = io.open(os.path.join(REGIONES, arch), encoding="utf-8").read()
    speeches = {}
    for bloque in re.split(r"\n(?=\d\.\s+El Approach)", txt):
        m = re.match(r"\d\.\s+El Approach para ([^\(\n]+)", bloque)
        if not m:
            continue
        nombre = m.group(1).strip()
        pais = next((p for p in ("Argentina", "Paraguay", "Perú", "Uruguay") if p.lower() in nombre.lower()), nombre)
        entre_comillas = re.findall(r'"(.+?)"', bloque, re.S)
        speeches[pais] = {
            "titulo": nombre,
            "pulso": norm((re.search(r"El pulso del [^:]+:\s*(.+?)\n", bloque) or ["", ""])[1]),
            "angulo": norm((re.search(r"El ángulo de venta:\s*(.+?)\n", bloque) or ["", ""])[1]),
            # el script es el parrafo entrecomillado MAS LARGO: adentro del
            # texto hay otras comillas ("moderno", "Intendencia Municipal")
            "script": norm(max(entre_comillas, key=len)) if entre_comillas else "",
        }
    tips = []
    cola = txt.split("consejos clave")[-1]
    for t, cuerpo in re.findall(r"\n([A-ZÁÉÍÓÚ][^:\n]{4,60}):\s*(.+?)(?=\n[A-ZÁÉÍÓÚ][^:\n]{4,60}:|\Z)", cola, re.S):
        tips.append({"titulo": t.strip(), "texto": norm(cuerpo)})
    return speeches, tips


def curado(nombre: str) -> dict:
    ruta = os.path.join(DATOS, nombre)
    if not os.path.exists(ruta):
        print(f"  [!] falta {nombre}, sigo sin el")
        return {}
    return json.load(io.open(ruta, encoding="utf-8"))


def main() -> int:
    print("Leyendo docs/regiones/ ...")
    contactos = leer_planillas() + leer_docx()
    if not contactos:
        print("ERROR: no salio ningun municipio de las planillas. Reviso docs/regiones/.")
        return 1

    vistos = Counter()
    for c in contactos:                       # el id: pais-localidad, con sufijo si repite
        base = slug(c["pais"], c["localidad"])
        vistos[base] += 1
        c["id"] = base if vistos[base] == 1 else f"{base}-{vistos[base]}"

    speeches, tips = leer_speeches()
    funcionarios = curado("funcionarios.json")
    investigacion = curado("investigacion.json")

    ids = {c["id"] for c in contactos}
    huerfanos = [k for k in list(funcionarios) + list(investigacion) if k not in ids]
    sin_tel = [c["localidad"] for c in contactos if not c["telefono"]]
    sin_func = [c["localidad"] for c in contactos if c["id"] not in funcionarios]

    datos = {"contactos": contactos, "speeches": speeches, "tips": tips,
             "funcionarios": funcionarios, "investigacion": investigacion}
    html = io.open(PLANTILLA, encoding="utf-8").read()
    if "/*__DATOS__*/{}" not in html:
        print("ERROR: la plantilla no tiene el hueco /*__DATOS__*/{}")
        return 1
    io.open(SALIDA, "w", encoding="utf-8").write(
        html.replace("/*__DATOS__*/{}", json.dumps(datos, ensure_ascii=False, separators=(",", ":"))))

    print(f"\nOK -> {os.path.relpath(SALIDA, RAIZ)}  ({round(os.path.getsize(SALIDA)/1024, 1)} KB)")
    print(f"  municipios     {len(contactos)}  {dict(Counter(c['pais'] for c in contactos))}")
    print(f"  con intendente {len(contactos) - len(sin_func)} de {len(contactos)}")
    print(f"  investigados   {len(investigacion)}")
    print(f"  speeches       {', '.join(speeches) or '(ninguno)'}   tips: {len(tips)}")
    if sin_tel:
        print(f"  [!] SIN TELEFONO ({len(sin_tel)}): {', '.join(sin_tel[:8])}")
    if sin_func:
        print(f"  [i] sin intendente ({len(sin_func)}): {', '.join(sin_func[:8])}{' ...' if len(sin_func) > 8 else ''}")
    if huerfanos:
        print(f"  [!] CLAVES HUERFANAS en los json curados ({len(huerfanos)}): {', '.join(huerfanos[:8])}")
        print("      (esas fichas no le pegan a ningun municipio: cambio el nombre en la planilla?)")
    print("\nProbalo abriendo el archivo, y despues: git add -A && git commit && git push origin qa")
    return 0


if __name__ == "__main__":
    sys.exit(main())
