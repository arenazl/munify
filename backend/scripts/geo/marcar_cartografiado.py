# -*- coding: utf-8 -*-
"""Marca que municipios del catalogo estan CARTOGRAFIADOS: la pantalla dibuja
sus barrios, o dibuja solamente el contorno del municipio.

Decision del dueño (2026-09-03, textual): *"O tenemos el cien por ciento del
municipio con poligonos o mostramos solamente el contorno del municipio... asi
de restrictivo. No sirve mostrar en un mapa que tenes veinte barrios, cuatro
bien dibujados y el resto no"*. Y el matiz: *"que vos veas casi todo
cartografiado: si le falta uno y son tres, no; si le faltan dos y son catorce,
si"*. De ahi salen las dos constantes de abajo, y de ahi sale que la decision
viva en UNA columna (`municipios_catalogo.cartografiado`) que el resto de la
app solo LEE: la pantalla no vuelve a contar poligonos.

La regla, sobre las filas `hoja = 1` del municipio (las que se muestran; ver
`_hojas.py`):

    n = filas hoja                  con_poligono = filas hoja con contorno
    cartografiado = 1  <=>  n >= MIN_BARRIOS  Y  con_poligono / n >= PCT_MINIMO

Un municipio con 4 barrios perfectos NO pasa (poco material para juzgar: es el
"si le falta uno y son tres, no"); uno con 47 barrios y 38 dibujados tampoco
(81 %, se ven 9 huecos). El motivo queda escrito en texto llano
(`motivo_cartografiado`) para que la pantalla pueda explicarlo sin recalcular.

    DATABASE_URL_QA="..." python scripts/geo/marcar_cartografiado.py --env qa
    ... --aplicar                       # escribe (sin el flag, todo en seco)
    ... --pais AR                       # default: todos los paises del catalogo
    ... --provincia "San Juan"
    ... --detalle                       # abre el resumen por provincia

Se puede correr todas las veces que haga falta: recalcula desde cero y solo
escribe las filas que cambian.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from collections import Counter, defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402

# La vara. Un solo lugar: si mañana el dueño la mueve, se toca aca y se vuelve
# a correr el script. Nadie mas la recalcula.
PCT_MINIMO = 0.85
MIN_BARRIOS = 5

TANDA = 500
LARGO_MOTIVO = 120

# Las dos columnas en `municipios_catalogo`. Idempotente, igual que
# `_hojas.asegurar_columnas`: se consulta information_schema y solo se altera
# lo que falta, asi lo pueden correr este script y la promocion a prod sin
# pisarse. La version formal esta en
# `alembic/versions/20260905_cartografiado.py`.
COLUMNAS = {
    "cartografiado": ("ALTER TABLE municipios_catalogo "
                      "ADD COLUMN cartografiado TINYINT(1) NOT NULL DEFAULT 0"),
    "motivo_cartografiado": ("ALTER TABLE municipios_catalogo "
                             "ADD COLUMN motivo_cartografiado VARCHAR(120) NULL "
                             "AFTER cartografiado"),
}


def _args() -> argparse.Namespace:
    p = parser_base("Marca `cartografiado` por municipio (85 % dibujado y 5+ barrios).")
    p.add_argument("--pais", default="", help="ISO-2 o lista separada por coma (default: todos)")
    p.add_argument("--provincia", default="", help="Solo esta provincia (nombre exacto del catalogo)")
    p.add_argument("--detalle", action="store_true", help="Agrega el resumen por provincia")
    return p.parse_args()


async def columnas_faltantes(conn) -> list[str]:
    existentes = {f[0] for f in (await conn.execute(text("""
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'municipios_catalogo'"""))).fetchall()}
    return [col for col in COLUMNAS if col not in existentes]


async def asegurar_columnas(conn) -> list[str]:
    """Agrega `cartografiado` / `motivo_cartografiado` si faltan."""
    faltan = await columnas_faltantes(conn)
    for col in faltan:
        await conn.execute(text(COLUMNAS[col]))
    return faltan


def decidir(n: int, con_poligono: int) -> tuple[int, str]:
    """La regla, en un solo lugar. Devuelve (cartografiado, motivo en llano)."""
    if n == 0:
        return 0, "sin barrios"
    if n < MIN_BARRIOS:
        return 0, f"{con_poligono}/{n} dibujados, menos de {MIN_BARRIOS} barrios"
    motivo = f"{con_poligono}/{n} dibujados ({100 * con_poligono / n:.0f} %)"
    return int(con_poligono >= PCT_MINIMO * n), motivo


async def _cargar(conn, paises: list[str], provincia: str, con_columnas: bool) -> list[dict]:
    """UNA consulta agregada para todos los municipios pedidos (nunca una por
    municipio: son ~2.000 en AR y contra Aiven cada round trip cuesta ~190 ms)."""
    params: dict = {}
    filtros = []
    if paises:
        filtros.append("c.pais IN (" + ",".join(f":p{i}" for i in range(len(paises))) + ")")
        params.update({f"p{i}": p for i, p in enumerate(paises)})
    if provincia:
        filtros.append("c.provincia = :prov")
        params["prov"] = provincia
    where = ("WHERE " + " AND ".join(filtros)) if filtros else ""
    # Sin las columnas (en seco, antes de la primera corrida) todo cuenta como 0 sin motivo.
    actuales = "c.cartografiado, c.motivo_cartografiado" if con_columnas else "0, NULL"
    filas = (await conn.execute(text(f"""
        SELECT c.id, c.nombre, c.pais, c.provincia,
               COALESCE(b.n, 0)   AS n,
               COALESCE(b.poli, 0) AS poli,
               {actuales}
        FROM municipios_catalogo c
        LEFT JOIN (
            SELECT municipio_catalogo_id,
                   COUNT(*)                    AS n,
                   SUM(poligono IS NOT NULL)   AS poli
            FROM catalogo_barrios WHERE hoja = 1
            GROUP BY municipio_catalogo_id
        ) b ON b.municipio_catalogo_id = c.id
        {where}
        ORDER BY c.pais, c.provincia, c.nombre"""), params)).fetchall()
    return [{"id": str(f[0]), "nombre": f[1], "pais": f[2], "provincia": f[3] or "(sin provincia)",
             "n": int(f[4]), "poli": int(f[5]),
             "actual": int(f[6] or 0), "motivo_actual": f[7]} for f in filas]


async def _escribir_tanda(conn, tanda: list[dict]) -> None:
    """UN solo UPDATE para toda la tanda: con executemany aiomysql manda un
    round trip por fila y 2.000 municipios se van a media hora."""
    params: dict = {}
    casos_flag, casos_motivo = [], []
    for k, c in enumerate(tanda):
        params[f"i{k}"], params[f"c{k}"], params[f"m{k}"] = c["id"], c["cartografiado"], c["motivo"]
        casos_flag.append(f"WHEN :i{k} THEN :c{k}")
        casos_motivo.append(f"WHEN :i{k} THEN :m{k}")
    await conn.execute(text(f"""
        UPDATE municipios_catalogo
        SET cartografiado = CASE id {' '.join(casos_flag)} END,
            motivo_cartografiado = CASE id {' '.join(casos_motivo)} END
        WHERE id IN ({','.join(f':i{k}' for k in range(len(tanda)))})"""), params)


async def main() -> None:
    args = _args()
    cfg = resolver_db(args)
    paises = [p.strip().upper() for p in args.pais.split(",") if p.strip()]
    engine = create_async_engine(cfg.url)
    inicio = time.time()
    try:
        async with engine.begin() as conn:
            if args.aplicar:
                faltan = await asegurar_columnas(conn)
                if faltan:
                    print(f"Columnas agregadas a municipios_catalogo: {', '.join(faltan)}")
            else:
                faltan = await columnas_faltantes(conn)
                if faltan:
                    print(f"Faltan las columnas {', '.join(faltan)} (se agregan con --aplicar)")
            munis = await _cargar(conn, paises, args.provincia, not faltan or args.aplicar)

        print(f"{len(munis):,} municipios "
              f"({', '.join(paises) if paises else 'todos los paises'}); vara: "
              f"{PCT_MINIMO:.0%} dibujado y {MIN_BARRIOS}+ barrios"
              f"{'  (EN SECO: no se escribe nada)' if not args.aplicar else ''}", flush=True)

        por_pais: dict[str, Counter] = defaultdict(Counter)
        por_prov: dict[tuple[str, str], Counter] = defaultdict(Counter)
        cambios: list[dict] = []
        for m in munis:
            flag, motivo = decidir(m["n"], m["poli"])
            motivo = motivo[:LARGO_MOTIVO]
            for s in (por_pais[m["pais"]], por_prov[(m["pais"], m["provincia"])]):
                s["munis"] += 1
                s["si" if flag else "no"] += 1
                if not flag:
                    s["no_sin_barrios" if m["n"] == 0 else
                      ("no_pocos" if m["n"] < MIN_BARRIOS else "no_pct")] += 1
            if flag != m["actual"] or (motivo or None) != (m["motivo_actual"] or None):
                cambios.append({"id": m["id"], "cartografiado": flag, "motivo": motivo})

        print(f"\n{'pais':4} {'munis':>6} {'dibuja barrios':>14} {'solo contorno':>13} | "
              f"sin barrios  pocos  bajo {PCT_MINIMO:.0%}")
        for pais in sorted(por_pais, key=lambda p: -por_pais[p]["munis"]):
            s = por_pais[pais]
            print(f"{pais:4} {s['munis']:6,} {s['si']:14,} {s['no']:13,} | "
                  f"{s['no_sin_barrios']:11,} {s['no_pocos']:6,} {s['no_pct']:5,}")

        if args.detalle:
            for pais in sorted(por_pais, key=lambda p: -por_pais[p]["munis"]):
                print(f"\n--- {pais} por provincia ---")
                provs = [(p, s) for (pa, p), s in por_prov.items() if pa == pais]
                for prov, s in sorted(provs, key=lambda kv: -kv[1]["si"]):
                    print(f"  {prov:32.32} {s['munis']:5,} munis  {s['si']:5,} dibujan  "
                          f"{s['no']:5,} solo contorno")

        print(f"\nMunicipios que cambian respecto de lo guardado: {len(cambios):,}")
        if not args.aplicar or not cambios:
            return
        escritos = 0
        for i in range(0, len(cambios), TANDA):
            async with engine.begin() as conn:
                await _escribir_tanda(conn, cambios[i:i + TANDA])
            escritos += len(cambios[i:i + TANDA])
            print(f"  escritos {escritos:,}/{len(cambios):,} ({time.time() - inicio:.0f}s)", flush=True)
        async with engine.connect() as conn:
            fila = (await conn.execute(text(
                "SELECT COUNT(*), SUM(cartografiado = 1) FROM municipios_catalogo"))).fetchone()
        print(f"Guardado: {int(fila[0]):,} municipios en el catalogo, "
              f"{int(fila[1] or 0):,} cartografiados, en {(time.time() - inicio) / 60:.1f} min")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
