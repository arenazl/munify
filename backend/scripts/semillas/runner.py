"""Runner del kit de semillas integrales (QA Paraguay Limpio).

Descubre todos los modulos m_*.py de esta carpeta, los corre en orden por
prefijo numerico (m_10_..., m_20_...) y muestra un resumen final por modulo.

Uso:
    python runner.py                          # corre todo el kit en orden
    python runner.py --solo cajas             # solo modulos cuyo nombre contenga 'cajas'
    python runner.py --base-url https://otra-qa.example.com/api

Cada modulo expone sembrar(api, hoy) -> opcionalmente dict {"creados": N, "existentes": M}.
"""
from __future__ import annotations

import argparse
import importlib.util
import re
import sys
import time
import traceback
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA))  # para que los modulos hagan `from _api import ...`

from _api import ApiQA, hoy  # noqa: E402


def orden_modulo(path: Path) -> tuple[int, str]:
    """Orden de ejecucion: prefijo numerico del archivo (m_10_x -> 10); sin prefijo al final."""
    m = re.match(r"m_(\d+)", path.stem)
    return (int(m.group(1)) if m else 999999, path.stem)


def descubrir(solo: str | None) -> list[Path]:
    archivos = sorted(CARPETA.glob("m_*.py"), key=orden_modulo)
    if solo:
        needle = solo.strip().lower()
        archivos = [a for a in archivos if needle in a.stem.lower()]
    return archivos


def cargar(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def formato_ret(ret) -> str:
    if isinstance(ret, dict):
        return " ".join(f"{k}={v}" for k, v in ret.items())
    return "" if ret is None else str(ret)


def main() -> int:
    parser = argparse.ArgumentParser(description="Runner del kit de semillas integrales (QA)")
    parser.add_argument(
        "--solo",
        metavar="NOMBRE",
        help="correr solo los modulos cuyo nombre de archivo contenga NOMBRE (ej: cajas)",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        metavar="URL",
        help="base de la API (default: la QA de Paraguay Limpio definida en _api.py)",
    )
    args = parser.parse_args()

    archivos = descubrir(args.solo)
    if not archivos:
        todos = sorted(CARPETA.glob("m_*.py"), key=orden_modulo)
        print(f"[runner] ningun modulo matchea --solo '{args.solo}'.")
        print("[runner] disponibles: " + (", ".join(a.stem for a in todos) or "(ninguno)"))
        return 2

    print(f"[runner] {len(archivos)} modulo(s) a correr: " + ", ".join(a.stem for a in archivos))

    api = ApiQA(base_url=args.base_url) if args.base_url else ApiQA()
    api.login()
    fecha = hoy()

    resultados: list[tuple[str, str, str, float]] = []
    for archivo in archivos:
        print(f"\n== {archivo.stem} ==")
        t0 = time.monotonic()
        try:
            modulo = cargar(archivo)
            if not hasattr(modulo, "sembrar"):
                raise AttributeError(f"{archivo.name} no define sembrar(api, hoy)")
            ret = modulo.sembrar(api, fecha)
            resultados.append((archivo.stem, "OK", formato_ret(ret), time.monotonic() - t0))
        except Exception:
            traceback.print_exc()
            resultados.append((archivo.stem, "ERROR", "", time.monotonic() - t0))

    ancho = max(len(nombre) for nombre, *_ in resultados)
    print("\n== RESUMEN ==")
    for nombre, estado, detalle, dur in resultados:
        linea = f"{nombre.ljust(ancho)}  {estado:5}  {dur:6.1f}s"
        if detalle:
            linea += f"  {detalle}"
        print(linea)

    errores = sum(1 for _, estado, _, _ in resultados if estado == "ERROR")
    oks = len(resultados) - errores
    print(f"\n[runner] fin: {oks} OK, {errores} ERROR")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
