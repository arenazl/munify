"""Migración: catálogo ÚNICO para clasificar OTs — se va `ot_tipos_trabajo`.

La OT se clasificaba con un catálogo propio (`ot_tipos_trabajo`, 10 valores) que
duplicaba 6 categorías de reclamo (Bacheo/Bacheo y calles, Alumbrado/Alumbrado
público, ...) y, peor, obligaba a reclasificar a mano una OT nacida de un
reclamo que YA venía clasificado. A partir de acá la OT clasifica con las
categorías de reclamo del municipio. Las que no se le ofrecen al vecino
(Preventivo, Mantenimiento, Obra) viven en el mismo catálogo con `interna=1`.

Pasos (en orden, todos idempotentes):
  a) categorias_reclamo += columna `interna` (BOOLEAN NOT NULL DEFAULT 0)
  b) ordenes_trabajo   += columna `categoria_id` (INT NULL) + índice + FK
  c) OTs CON reclamos vinculados: heredan la categoría del reclamo más antiguo
     (menor id) que tenga una — mismo criterio que `_categoria_inicial_ot` en
     api/ordenes_trabajo.py, así el histórico y el runtime derivan igual.
  d) OTs SIN reclamos pero con `tipo_trabajo_id`: se mapea el NOMBRE del tipo a
     una categoría del MISMO municipio con nombre equivalente (comparación laxa:
     minúsculas, sin acentos, por tokens — "Bacheo" matchea "Bacheo y calles").
     Sin equivalente, se CREA la categoría con `interna=1`.
  e) Corolario de (d): "Preventivo"/"Mantenimiento"/"Obra" quedan creadas como
     internas SOLO en los municipios donde hubo algo que mapear a ellas. No se
     siembran porque sí en todos lados.
  f) ordenes_trabajo -= FK + índice + columna `tipo_trabajo_id`
  g) DROP TABLE ot_tipos_trabajo

MULTI-TENANT: (c) sólo hereda de reclamos del MISMO municipio que la OT, y (d)
sólo matchea/crea categorías dentro del municipio de la OT. Ningún paso cruza
tenants.

ORDEN DE DEPLOY: esta migración tiene que correr ANTES (o junto) al deploy del
backend nuevo. El modelo ya declara `categorias_reclamo.interna`, así que un
backend nuevo contra una DB vieja rompe TODA query de categorías.

Uso:
  python scripts/migrate_ot_categoria_unificada.py            # dry-run
  python scripts/migrate_ot_categoria_unificada.py --aplicar  # aplica
"""
import asyncio
import sys
import os
import unicodedata

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text, bindparam  # noqa: E402
from core.database import engine  # noqa: E402


# Palabras que no aportan a la comparación de nombres ("Bacheo y calles").
_STOPWORDS = {"y", "e", "de", "del", "la", "el", "los", "las", "en", "para", "a"}


def _normalizar(nombre: str) -> frozenset:
    """Nombre -> conjunto de tokens comparables (minúsculas, sin acentos, sin
    stopwords ni puntuación). "Bacheo y calles" -> {bacheo, calles}."""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFKD", nombre or "")
        if not unicodedata.combining(c)
    ).lower()
    limpio = "".join(c if c.isalnum() else " " for c in sin_acentos)
    return frozenset(t for t in limpio.split() if t and t not in _STOPWORDS)


def _equivalentes(tipo: str, categoria: str) -> bool:
    """Match laxo tipo de trabajo <-> categoría. Exacto por tokens, o que los
    tokens de uno sean subconjunto de los del otro ("bacheo" ⊂ "bacheo calles").
    Por tokens y no por substring, para no matchear "obra" con "sombra"."""
    a, b = _normalizar(tipo), _normalizar(categoria)
    if not a or not b:
        return False
    return a == b or a <= b or b <= a


# Sinónimos del template viejo de `ot_tipos_trabajo` que apuntan a categorías
# del seed con otro nombre: "Poda" es "Arbolado y espacios verdes", "Limpieza"
# es "Higiene urbana". Sin esto la migración crearía una categoría duplicada
# justo del tipo que veníamos a unificar. Se aplican como SEGUNDA pasada: el
# match léxico manda, esto sólo rescata lo que quedó sin destino.
_SINONIMOS = {
    "poda": {"arbolado", "poda", "arboles"},
    "limpieza": {"higiene", "limpieza"},
    "recoleccion": {"recoleccion", "residuos", "basura"},
    "senalizacion": {"senalizacion", "transito"},
    "alumbrado": {"alumbrado", "luminarias"},
    "bacheo": {"bacheo", "pavimento", "asfalto"},
}


def _sinonimo(tipo: str, categoria: str) -> bool:
    """True si algún token sinónimo del tipo aparece en la categoría."""
    tokens_tipo = _normalizar(tipo)
    alias = set()
    for t in tokens_tipo:
        alias |= _SINONIMOS.get(t, set())
    return bool(alias & _normalizar(categoria))


def _buscar_destino(tipo_nombre: str, categorias: list):
    """categorias = [(id, nombre)]. Devuelve el id destino o None.
    Dos pasadas deterministas: match léxico primero, sinónimos después."""
    for cid, nombre in categorias:
        if _equivalentes(tipo_nombre, nombre):
            return cid
    for cid, nombre in categorias:
        if _sinonimo(tipo_nombre, nombre):
            return cid
    return None


async def _col_existe(conn, tabla: str, col: str) -> bool:
    return bool((await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})).scalar())


async def _tabla_existe(conn, tabla: str) -> bool:
    return bool((await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"
    ), {"t": tabla})).scalar())


async def _fks_de_columna(conn, tabla: str, col: str) -> list:
    """Nombres de las FOREIGN KEY que cuelgan de una columna (el nombre puede ser
    el nuestro `fk_ot_tipo_trabajo` o uno autogenerado por create_all)."""
    rows = (await conn.execute(text(
        "SELECT constraint_name FROM information_schema.key_column_usage "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c "
        "AND referenced_table_name IS NOT NULL"
    ), {"t": tabla, "c": col})).scalars().all()
    return list(rows)


async def _indices_de_columna(conn, tabla: str, col: str) -> list:
    rows = (await conn.execute(text(
        "SELECT DISTINCT index_name FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c "
        "AND index_name <> 'PRIMARY'"
    ), {"t": tabla, "c": col})).scalars().all()
    return list(rows)


async def migrate(aplicar: bool):
    resumen = []

    def paso(txt: str):
        print(txt)
        resumen.append(txt)

    async with engine.begin() as conn:
        print(f"=== Unificación catálogo OT -> categorías · modo: "
              f"{'APLICAR' if aplicar else 'DRY-RUN'} ===\n")

        # ---------------- a) categorias_reclamo.interna ----------------
        if await _col_existe(conn, "categorias_reclamo", "interna"):
            paso("a) SKIP  categorias_reclamo.interna ya existe")
        elif aplicar:
            await conn.execute(text(
                "ALTER TABLE categorias_reclamo "
                "ADD COLUMN interna BOOLEAN NOT NULL DEFAULT 0 AFTER orden"
            ))
            paso("a) OK    categorias_reclamo.interna creada (default 0)")
        else:
            paso("a) [dry] agregaría categorias_reclamo.interna")

        # ---------------- b) ordenes_trabajo.categoria_id ---------------
        tiene_categoria_id = await _col_existe(conn, "ordenes_trabajo", "categoria_id")
        if tiene_categoria_id:
            paso("b) SKIP  ordenes_trabajo.categoria_id ya existe")
        elif aplicar:
            await conn.execute(text(
                "ALTER TABLE ordenes_trabajo ADD COLUMN categoria_id INT NULL, "
                "ADD KEY ix_ot_categoria (categoria_id), "
                "ADD CONSTRAINT fk_ot_categoria FOREIGN KEY (categoria_id) "
                "REFERENCES categorias_reclamo(id) ON DELETE SET NULL"
            ))
            tiene_categoria_id = True
            paso("b) OK    ordenes_trabajo.categoria_id + índice + FK creados")
        else:
            paso("b) [dry] agregaría ordenes_trabajo.categoria_id + FK")

        if not aplicar and not tiene_categoria_id:
            # Sin la columna no se puede simular el relleno: se corta acá el dry-run.
            print("\n[dry] Falta categoria_id: los pasos c-g se muestran recién "
                  "cuando exista la columna. Corré con --aplicar.")
            await engine.dispose()
            return

        # ---------------- c) heredar del reclamo vinculado --------------
        # El reclamo más antiguo (menor id) CON categoría y del MISMO municipio.
        SQL_HEREDAR = """
        UPDATE ordenes_trabajo ot
           SET ot.categoria_id = (
                 SELECT r.categoria_id
                   FROM orden_trabajo_reclamos otr
                   JOIN reclamos r ON r.id = otr.reclamo_id
                  WHERE otr.orden_trabajo_id = ot.id
                    AND r.categoria_id IS NOT NULL
                    AND r.municipio_id = ot.municipio_id
                  ORDER BY r.id ASC
                  LIMIT 1)
         WHERE ot.categoria_id IS NULL
           AND EXISTS (
                 SELECT 1
                   FROM orden_trabajo_reclamos otr
                   JOIN reclamos r ON r.id = otr.reclamo_id
                  WHERE otr.orden_trabajo_id = ot.id
                    AND r.categoria_id IS NOT NULL
                    AND r.municipio_id = ot.municipio_id)
        """
        candidatas_c = (await conn.execute(text(
            "SELECT COUNT(*) FROM ordenes_trabajo ot WHERE ot.categoria_id IS NULL "
            "AND EXISTS (SELECT 1 FROM orden_trabajo_reclamos otr "
            "            JOIN reclamos r ON r.id = otr.reclamo_id "
            "           WHERE otr.orden_trabajo_id = ot.id "
            "             AND r.categoria_id IS NOT NULL "
            "             AND r.municipio_id = ot.municipio_id)"
        ))).scalar()
        if aplicar:
            res = await conn.execute(text(SQL_HEREDAR))
            paso(f"c) OK    {res.rowcount} OT(s) heredaron la categoría de su reclamo")
        else:
            paso(f"c) [dry] {candidatas_c} OT(s) heredarían la categoría de su reclamo")

        # ---------------- d) mapear el tipo de trabajo viejo -------------
        hay_tipo_col = await _col_existe(conn, "ordenes_trabajo", "tipo_trabajo_id")
        hay_tipo_tabla = await _tabla_existe(conn, "ot_tipos_trabajo")

        if not (hay_tipo_col and hay_tipo_tabla):
            paso("d) SKIP  no hay tipo_trabajo_id/ot_tipos_trabajo que mapear")
        else:
            pendientes = (await conn.execute(text(
                "SELECT ot.id, ot.municipio_id, t.nombre, t.icono, t.color "
                "  FROM ordenes_trabajo ot "
                "  JOIN ot_tipos_trabajo t ON t.id = ot.tipo_trabajo_id "
                " WHERE ot.categoria_id IS NULL AND ot.tipo_trabajo_id IS NOT NULL "
                " ORDER BY ot.municipio_id, ot.id"
            ))).all()

            if not pendientes:
                paso("d) SKIP  0 OT(s) sin reclamo con tipo de trabajo por mapear")
            else:
                # Catálogo actual por municipio (solo de los munis involucrados).
                munis = sorted({p[1] for p in pendientes})
                cats_por_muni = {m: [] for m in munis}
                filas = (await conn.execute(
                    text("SELECT id, municipio_id, nombre FROM categorias_reclamo "
                         " WHERE municipio_id IN :munis")
                    .bindparams(bindparam("munis", expanding=True)),
                    {"munis": munis},
                )).all()
                for cid, mid, nombre in filas:
                    cats_por_muni.setdefault(mid, []).append((cid, nombre))

                mapeadas = creadas = sin_match = 0
                nuevas_por_muni = {}  # (muni, nombre_norm) -> id ya creada en esta corrida

                for ot_id, muni_id, tipo_nombre, tipo_icono, tipo_color in pendientes:
                    destino = _buscar_destino(tipo_nombre, cats_por_muni.get(muni_id, []))

                    if destino is None:
                        clave = (muni_id, _normalizar(tipo_nombre))
                        destino = nuevas_por_muni.get(clave)

                    if destino is None:
                        # Sin equivalente -> se crea como categoría INTERNA (no se
                        # le ofrece al vecino: nadie decidió publicarla).
                        if not aplicar:
                            paso(f"   [dry] crearía categoría interna "
                                 f"'{tipo_nombre}' en muni {muni_id}")
                            creadas += 1
                            nuevas_por_muni[(muni_id, _normalizar(tipo_nombre))] = -1
                            continue
                        await conn.execute(text(
                            "INSERT INTO categorias_reclamo "
                            "(municipio_id, nombre, icono, color, "
                            " tiempo_resolucion_estimado, prioridad_default, "
                            " activo, orden, interna) "
                            "VALUES (:m, :n, :i, :c, 48, 3, 1, 0, 1)"
                        ), {"m": muni_id, "n": tipo_nombre,
                            "i": tipo_icono, "c": tipo_color})
                        destino = (await conn.execute(
                            text("SELECT LAST_INSERT_ID()"))).scalar()
                        nuevas_por_muni[(muni_id, _normalizar(tipo_nombre))] = destino
                        cats_por_muni.setdefault(muni_id, []).append((destino, tipo_nombre))
                        creadas += 1

                    if destino and destino > 0:
                        if aplicar:
                            await conn.execute(text(
                                "UPDATE ordenes_trabajo SET categoria_id = :c WHERE id = :o"
                            ), {"c": destino, "o": ot_id})
                        mapeadas += 1
                    else:
                        sin_match += 1

                verbo = "OK   " if aplicar else "[dry]"
                paso(f"d) {verbo} {mapeadas} OT(s) mapeadas por nombre de tipo; "
                     f"{creadas} categoría(s) interna(s) creada(s)"
                     + (f"; {sin_match} sin destino (dry-run)" if sin_match else ""))

        # ---------------- f) borrar tipo_trabajo_id ---------------------
        if not await _col_existe(conn, "ordenes_trabajo", "tipo_trabajo_id"):
            paso("f) SKIP  ordenes_trabajo.tipo_trabajo_id ya no existe")
        elif aplicar:
            for fk in await _fks_de_columna(conn, "ordenes_trabajo", "tipo_trabajo_id"):
                await conn.execute(text(
                    f"ALTER TABLE ordenes_trabajo DROP FOREIGN KEY `{fk}`"))
            for idx in await _indices_de_columna(conn, "ordenes_trabajo", "tipo_trabajo_id"):
                await conn.execute(text(
                    f"ALTER TABLE ordenes_trabajo DROP INDEX `{idx}`"))
            await conn.execute(text(
                "ALTER TABLE ordenes_trabajo DROP COLUMN tipo_trabajo_id"))
            paso("f) OK    FK + índice + columna tipo_trabajo_id eliminados")
        else:
            huerfanas = (await conn.execute(text(
                "SELECT COUNT(*) FROM ordenes_trabajo "
                " WHERE categoria_id IS NULL AND tipo_trabajo_id IS NOT NULL"
            ))).scalar()
            paso(f"f) [dry] borraría tipo_trabajo_id "
                 f"({huerfanas} OT(s) quedarían sin clasificar)")

        # ---------------- g) DROP TABLE ot_tipos_trabajo ----------------
        if not await _tabla_existe(conn, "ot_tipos_trabajo"):
            paso("g) SKIP  ot_tipos_trabajo ya no existe")
        elif aplicar:
            await conn.execute(text("DROP TABLE ot_tipos_trabajo"))
            paso("g) OK    tabla ot_tipos_trabajo eliminada")
        else:
            filas_t = (await conn.execute(text(
                "SELECT COUNT(*) FROM ot_tipos_trabajo"))).scalar()
            paso(f"g) [dry] borraría la tabla ot_tipos_trabajo ({filas_t} fila(s))")

        # ---------------- resumen final ---------------------------------
        total_ot = (await conn.execute(text(
            "SELECT COUNT(*) FROM ordenes_trabajo"))).scalar()
        clasificadas = (await conn.execute(text(
            "SELECT COUNT(*) FROM ordenes_trabajo WHERE categoria_id IS NOT NULL"
        ))).scalar() if await _col_existe(conn, "ordenes_trabajo", "categoria_id") else 0
        internas = (await conn.execute(text(
            "SELECT COUNT(*) FROM categorias_reclamo WHERE interna = 1"
        ))).scalar() if await _col_existe(conn, "categorias_reclamo", "interna") else 0

        print("\n--- RESUMEN ---")
        for linea in resumen:
            print("  " + linea)
        print(f"  OTs: {clasificadas}/{total_ot} clasificadas con categoría")
        print(f"  Categorías internas en la base: {internas}")
        if not aplicar:
            print("\nDRY-RUN: no se tocó nada. Corré con --aplicar para aplicar.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate(aplicar="--aplicar" in sys.argv))
