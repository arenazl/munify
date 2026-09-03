"""
purgar_demos — borra municipios demo por lista explícita, con el mismo cascade
que usa el endpoint público (`services/demo_borrado.py`).

Existe porque las demos viejas no tienen llave (`demo_token`) y desde 2026-09-02
el DELETE público exige la llave de quien la generó: quedaron imborrables desde
la UI a propósito. Se limpian por acá, con lista, en seco primero.

Uso (Infra, en prod; la app nunca escribe en prod):

  DATABASE_URL_PROD="$(gcloud secrets versions access latest --secret=DATABASE_URL --project=munify-api)" \
    python scripts/purgar_demos.py --env prod --codigos comodoro-rivadavia-2,esperanza,palo-santo

  ...revisar el reporte en seco, y recién ahí:

  DATABASE_URL_PROD="..." python scripts/purgar_demos.py --env prod --aplicar --codigos ...

Reglas, en orden:
  1. Sin `--aplicar` no escribe nada: lista qué borraría, tabla por tabla.
  2. SPN (id 80) y cualquier `demo_publica` (la de muestra) NO se borran nunca,
     estén o no en la lista.
  3. Un municipio con usuarios que no son de demo (emails fuera de
     @<codigo>.demo.com / @<codigo>.test.com / @demo.com) se SALTEA, salvo que
     además venga en `--con-usuarios-reales` (caso `moreno`, 2026-09-02).
  4. Un municipio por transacción: si una falla, las anteriores quedan hechas
     y las siguientes no se intentan.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(AQUI)
sys.path.insert(0, BACKEND)
sys.path.insert(0, AQUI)

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402
from services import demo_borrado  # noqa: E402


def _args() -> argparse.Namespace:
    p = parser_base(__doc__)
    p.add_argument("--codigos", required=True,
                   help="Códigos de municipio separados por coma (exactos, sin distinguir mayúsculas).")
    p.add_argument("--con-usuarios-reales", default="",
                   help="Subconjunto de --codigos que se borra AUNQUE tenga usuarios no-demo.")
    return p.parse_args()


def _lista(valor: str) -> list[str]:
    return [c.strip().lower() for c in valor.split(",") if c.strip()]


async def _municipios(db: AsyncSession, codigos: list[str]) -> dict[str, int | None]:
    marcadores = ",".join(f":c{i}" for i in range(len(codigos)))
    filas = (await db.execute(
        text(f"SELECT LOWER(codigo), id FROM municipios WHERE LOWER(codigo) IN ({marcadores})"),
        {f"c{i}": c for i, c in enumerate(codigos)})).fetchall()
    encontrados = {c: i for c, i in filas}
    return {c: encontrados.get(c) for c in codigos}


def _motivo_para_saltear(d: dict, con_reales: set[str]) -> str | None:
    if not d["existe"]:
        return "no existe"
    if d["intocable"]:
        return "INTOCABLE (cliente productivo)"
    if d["demo_publica"]:
        return "es la demo de muestra (demo_publica=1); se apaga por base, no se borra"
    if d["usuarios_reales"] and d["codigo"].lower() not in con_reales:
        return (f"tiene {d['usuarios_reales']} usuario(s) no-demo ({', '.join(d['dominios_reales'])}); "
                f"si igual va, pasalo en --con-usuarios-reales")
    return None


async def main() -> int:
    args = _args()
    entorno = resolver_db(args)
    codigos = _lista(args.codigos)
    con_reales = set(_lista(args.con_usuarios_reales))
    if sobran := con_reales - set(codigos):
        sys.exit(f"--con-usuarios-reales trae códigos que no están en --codigos: {sorted(sobran)}")

    engine = create_async_engine(entorno.url)
    hechos, salteados, fallidos = [], [], []
    try:
        async with AsyncSession(engine) as db:
            ids = await _municipios(db, codigos)
            for codigo in codigos:
                mid = ids[codigo]
                d = (await demo_borrado.describir_municipio(db, mid, codigo)
                     if mid else {"existe": False, "codigo": codigo})
                motivo = _motivo_para_saltear(d, con_reales)
                if motivo:
                    salteados.append((codigo, motivo))
                    print(f"\n-- {codigo}: SALTEADO — {motivo}")
                    continue

                print(f"\n== {codigo} (id {d['id']}) '{d['nombre']}' — creada {d['created_at']} — "
                      f"llave: {'sí' if d['con_llave'] else 'no'} — usuarios demo: {d['usuarios_demo']}, "
                      f"reales: {d['usuarios_reales']}")
                conteo = await demo_borrado.contar_plan(db, d["id"])
                total = sum(conteo.values())
                for tabla, n in sorted(conteo.items(), key=lambda kv: -kv[1]):
                    print(f"   {n:>6}  {tabla}")
                print(f"   {total:>6}  filas en total (+ 1 municipio)")

                if not args.aplicar:
                    continue
                try:
                    borrado = await demo_borrado.borrar_municipio(db, d["id"])
                    await db.commit()
                    hechos.append((codigo, sum(borrado.values())))
                    print(f"   BORRADO: {sum(borrado.values())} filas, municipios={borrado.get('municipios')}")
                except Exception as e:  # noqa: BLE001 — se informa y se corta
                    await db.rollback()
                    fallidos.append((codigo, repr(e)))
                    print(f"   FALLÓ (rollback de este municipio): {e!r}")
                    break
    finally:
        await engine.dispose()

    print("\n" + "=" * 60)
    modo = "APLICADO" if args.aplicar else "EN SECO (nada se borró)"
    print(f"{modo} sobre {entorno.base}")
    print(f"  borrados : {len(hechos)}  {[c for c, _ in hechos]}")
    print(f"  salteados: {len(salteados)}  {[c for c, _ in salteados]}")
    if fallidos:
        print(f"  FALLIDOS : {fallidos}")
        pendientes = [c for c in codigos if c not in {x for x, _ in hechos + salteados + fallidos}]
        if pendientes:
            print(f"  sin intentar por el corte: {pendientes}")
    return 1 if fallidos else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
