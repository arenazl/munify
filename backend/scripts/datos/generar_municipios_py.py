# -*- coding: utf-8 -*-
"""Genera `municipios_py.json`: las 263 intendencias de Paraguay para el
autocomplete del alta de demos.

FUENTES (todas reales, ninguna inventada)
-----------------------------------------
1. Listado de intendencias por departamento provisto por el dueño (255).
2. Los 8 que faltaban para 263, cotejados contra el "Anexo:Municipios de
   Paraguay" de Wikipedia. Dos de ellos son distritos CREADOS despues del
   censo 2012 (Laurel 2020, Itacua 2021, Nueva Asuncion 2021), que por eso no
   figuran en el registro del INE.
3. Registro oficial del INE Paraguay (`Distritos_Paraguay_Codigos_DGEEC.xlsx`,
   CNPV 2012) para los codigos de departamento y distrito.

ALIAS
-----
Un municipio se conoce por mas de un nombre: el oficial fijado por ley y el
tradicional que usa la gente ("Campo 9" por Doctor J. Eulogio Estigarribia).
El buscador matchea por AMBOS, porque quien crea la demo escribe el nombre que
conoce, no el del boletin oficial.

NO se incluye el par "Zanja Pyta / General Francisco Caballero Alvarez" que
figuraba en la tabla de reconciliacion: Zanja Pyta es un municipio PROPIO de
Amambay, y tomarlo como alias fusionaria dos municipios distintos.
"""
import json
import re
import unicodedata
from pathlib import Path

AQUI = Path(__file__).parent

# Los 8 que faltaban en el listado para llegar a 263.
FALTANTES = {
    "Concepción": ["Itacuá"],
    "San Pedro": ["San José del Rosario", "San Vicente Pancholo",
                  "Villa del Rosario", "Yrybucuá"],
    "Canindeyú": ["Laurel"],
    "Presidente Hayes": ["José Falcón", "Nueva Asunción"],
}

# nombre oficial -> como tambien lo escribe o lo dice la gente
ALIAS = {
    "25 de Diciembre": ["Veinticinco de Diciembre"],
    "Curuguaty": ["Villa Curuguaty"],
    "Doctor J. Eulogio Estigarribia": ["Campo 9", "Campo Nueve"],
    "Doctor Juan Manuel Frutos": ["Pastoreo"],
    "Mariscal José Félix Estigarribia": ["Mariscal Estigarribia"],
    "Teniente 1º Manuel Irala Fernández": ["Irala Fernández"],
    "Capitán Carmelo Peralta": ["Carmelo Peralta"],
    "Yby Pytã": ["Yby Pytane", "Yby Pyta"],
    "Karapaí": ["Carapaí"],
    "Cerro Corá": ["Chirigüelo"],
    "San Vicente Pancholo": ["San Vicente"],
    "Salto del Guairá": ["Saltos del Guairá"],
    "San Pedro del Ycuamandyyú": ["San Pedro de Ycuamandiyú"],
    "General Resquín": ["General Isidoro Resquín", "General Francisco Isidoro Resquín"],
    "General Francisco Caballero Álvarez": ["Francisco Caballero Álvarez"],
    "Tebicuarymí": ["Tebicuary-Mí"],
    "General Bernardino Caballero": ["Caballero"],
    "San Roque González de Santa Cruz": ["Roque González de Santacruz"],
    "Bella Vista Norte": ["Bella Vista"],
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace("'", "").replace("-", " ").split())


def parsear_listado(md: Path) -> dict:
    dep, datos = None, {}
    for ln in md.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln.startswith("##"):
            dep = re.sub(r"^##\s*\d+\.\s*(Departamento (de |del )?)?", "", ln).strip()
            if dep == "Distrito Capital":
                dep = "Asunción"
            datos[dep] = []
        elif ln.startswith("- ") and dep:
            datos[dep].append(ln[2:].strip())
    return datos


def main():
    datos = parsear_listado(AQUI / "intendencias_paraguay.md")
    for dep, nombres in FALTANTES.items():
        datos.setdefault(dep, []).extend(nombres)

    codigos = {}
    ine = AQUI / "distritos_py_ine.json"
    if ine.exists():
        for d in json.loads(ine.read_text(encoding="utf-8")):
            codigos[norm(d["distrito"])] = {"cod": d["cod"], "cod_dep": d["cod_dep"]}

    salida = []
    for dep, nombres in datos.items():
        for n in sorted(nombres):
            c = codigos.get(norm(n), {})
            salida.append({
                "nombre": n,
                "departamento": dep,
                "alias": ALIAS.get(n, []),
                "cod_ine": c.get("cod"),
                "cod_departamento": c.get("cod_dep"),
            })

    salida.sort(key=lambda x: (x["departamento"], x["nombre"]))
    (AQUI / "municipios_py.json").write_text(
        json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    con_cod = sum(1 for x in salida if x["cod_ine"])
    print(f"municipios: {len(salida)}")
    print(f"departamentos: {len(datos)}")
    print(f"con codigo INE: {con_cod}  ·  sin codigo (creados post-2012 o renombrados): {len(salida)-con_cod}")
    print(f"con alias: {sum(1 for x in salida if x['alias'])}")
    if len(salida) != 263:
        print(f"  ATENCION: se esperaban 263 y salieron {len(salida)}")


if __name__ == "__main__":
    main()
