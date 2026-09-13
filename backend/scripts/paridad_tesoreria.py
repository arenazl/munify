"""Prueba de paridad de API para la consolidación de Tesorería (muni 80, SPN).

Es el GATE del plan `docs/tesoreria/02-plan-consolidacion.md`: el refactor del modelo
interno NO debe cambiar NADA de lo que la API devuelve para San Pedro Norte.

    # 1. ANTES de tocar el modelo — capturar el patrón
    python scripts/paridad_tesoreria.py capturar --out ../_paridad/baseline

    # 2. DESPUÉS de aplicar la migración en qa — capturar otra vez
    python scripts/paridad_tesoreria.py capturar --out ../_paridad/post

    # 3. El gate: éxito = diferencia CERO
    python scripts/paridad_tesoreria.py comparar ../_paridad/baseline ../_paridad/post

Corre contra un backend LOCAL apuntado a la base de qa (`backend/.env`), así el token
se firma con la misma SECRET_KEY. Todas las llamadas son GET: no escribe nada.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.security import create_access_token  # noqa: E402

# Admin real de SPN en qa (Bartolo). Los demás usuarios del muni están inactivos.
USER_ID_SPN = 858
MUNICIPIO_SPN = 80

# Prefijos de path que forman el universo de Tesorería + lo que la consolidación toca.
PREFIJOS = (
    "/api/tesoreria",
    "/api/gastos",
    "/api/ordenes-pago",
    "/api/contactos",
    "/api/proyectos",
    "/api/contaduria",
    "/api/empleados",
    "/api/sueldos",
    "/api/reportes",
)


def _token() -> str:
    return create_access_token(data={"sub": str(USER_ID_SPN)}, expires_delta=timedelta(hours=6))


def _get(url: str, token: str, timeout: int = 90):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, {"_error": e.read().decode("utf-8", "replace")[:400]}
    except Exception as e:  # noqa: BLE001 - queremos registrar cualquier fallo, no romper la corrida
        return 0, {"_error": f"{type(e).__name__}: {e}"}


def _endpoints(base: str, token: str):
    """GETs de colección del universo de Tesorería, leídos del OpenAPI vivo.

    Se saltean los que piden un {id} en el path: el patrón se arma con las colecciones,
    que es lo que alimenta cada pantalla.
    """
    status, spec = _get(f"{base}/openapi.json", token)
    if status != 200:
        raise SystemExit(f"No pude leer el OpenAPI ({status}). ¿Está levantado el backend en {base}?")
    paths = []
    for path, ops in spec.get("paths", {}).items():
        if "get" not in ops:
            continue
        if not path.startswith(PREFIJOS):
            continue
        if "{" in path:
            continue
        paths.append(path)
    return sorted(paths)


# Campos que cada llamada rellena con la hora de ese momento: cambian siempre y
# no son una regresión. Se neutralizan ANTES de comparar, nunca al capturar, así
# el archivo guardado sigue siendo la respuesta textual de la API.
CAMPOS_VOLATILES = ("exportado_en", "generado_en", "generado_at", "timestamp", "fecha_generacion")


def _neutralizar(v):
    """Reemplaza el valor de los campos volátiles, a cualquier profundidad."""
    if isinstance(v, dict):
        return {k: ("<volatil>" if k in CAMPOS_VOLATILES else _neutralizar(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [_neutralizar(x) for x in v]
    return v


def _nombre_archivo(path: str) -> str:
    return path.strip("/").replace("/", "__") + ".json"


def capturar(base: str, out: str):
    token = _token()
    paths = _endpoints(base, token)
    os.makedirs(out, exist_ok=True)
    ok = err = 0
    for path in paths:
        status, body = _get(f"{base}{path}", token)
        destino = os.path.join(out, _nombre_archivo(path))
        with open(destino, "w", encoding="utf-8") as fh:
            json.dump({"path": path, "status": status, "body": body}, fh,
                      ensure_ascii=False, indent=1, sort_keys=True, default=str)
        marca = "ok " if status == 200 else "ERR"
        if status == 200:
            ok += 1
        else:
            err += 1
        print(f"  {marca} {status:>3}  {path}")
    print(f"\n{ok} capturados, {err} con error -> {out}")
    return err


def comparar(dir_a: str, dir_b: str):
    archivos = sorted(set(os.listdir(dir_a)) | set(os.listdir(dir_b)))
    difs = []
    for nombre in archivos:
        pa, pb = os.path.join(dir_a, nombre), os.path.join(dir_b, nombre)
        if not os.path.exists(pa):
            difs.append((nombre, "sólo en el segundo")); continue
        if not os.path.exists(pb):
            difs.append((nombre, "sólo en el primero")); continue
        a = json.load(open(pa, encoding="utf-8"))
        b = json.load(open(pb, encoding="utf-8"))
        if a.get("status") != b.get("status"):
            difs.append((nombre, f"status {a.get('status')} -> {b.get('status')}")); continue
        sa = json.dumps(_neutralizar(a.get("body")), sort_keys=True, ensure_ascii=False, default=str)
        sb = json.dumps(_neutralizar(b.get("body")), sort_keys=True, ensure_ascii=False, default=str)
        if sa != sb:
            difs.append((nombre, f"contenido distinto ({len(sa)} vs {len(sb)} caracteres)"))
    print(f"\n{len(archivos)} endpoints comparados")
    if not difs:
        print("DIFERENCIA CERO - el gate pasa.")
        return 0
    print(f"{len(difs)} con diferencia - el gate NO pasa:\n")
    for nombre, motivo in difs:
        print(f"  {nombre}: {motivo}")
    return 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("capturar", help="llamar los GET y guardar cada respuesta")
    c.add_argument("--base", default="http://127.0.0.1:8010")
    c.add_argument("--out", required=True)

    d = sub.add_parser("comparar", help="diferencia entre dos capturas; cero = el gate pasa")
    d.add_argument("baseline")
    d.add_argument("post")

    args = ap.parse_args()
    if args.cmd == "capturar":
        sys.exit(1 if capturar(args.base, args.out) else 0)
    sys.exit(comparar(args.baseline, args.post))


if __name__ == "__main__":
    main()
