"""
Borrado en cascada de un municipio demo, guiado por el ESQUEMA real.

Hasta el 2026-09-02 el DELETE /municipios/demo/{codigo} tenía una lista fija
de ~55 tablas y un `except: pass` por sentencia. Contra la base real le
faltaban 32 tablas con `municipio_id` (noticias, puntos_interes, reservas,
direcciones, whatsapp_configs, demo_seed_logs...) y varias hijas sin
`municipio_id` (documentos, historial_ordenes_trabajo, noticia_zonas,
pago_webhook_eventos...). Como el borrado corre con FOREIGN_KEY_CHECKS=0, cada
tabla olvidada quedaba como filas huérfanas apuntando a un municipio que ya no
existe — y el `except: pass` escondía las sentencias que fallaban (por
ejemplo `inventario_orden_compra_lineas`, que no tiene `municipio_id`).

Acá el plan se deriva de `information_schema` una vez por proceso:

  nivel 1  toda tabla con columna `municipio_id`      -> DELETE ... WHERE municipio_id = :mid
  nivel 2  tabla sin `municipio_id` con FK a una de nivel 1 -> DELETE via JOIN
  nivel 3  ídem con FK a una de nivel 2               -> DELETE via doble JOIN

Se ejecuta de la más profunda a la más superficial, `usuarios` y `municipios`
al final. Lo usan el endpoint público (con sus propias reglas de acceso) y
`scripts/purgar_demos.py` (la limpieza que Infra corre en prod).

Lo que NO decide este módulo: si el municipio es borrable. Eso es
`describir_municipio()` + la regla de quien llama.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

PROFUNDIDAD_MAX = 3

# Municipios que NUNCA se borran por acá, tengan los usuarios que tengan.
# 80 = San Pedro Norte, el único cliente productivo.
MUNICIPIOS_INTOCABLES = {80}

# Tablas con `municipio_id` que SOBREVIVEN al borrado de la demo, a propósito.
# `demo_seed_logs` es la bitácora de lo que hizo la semilla: existe para
# comparar demos viejas con nuevas, y perdía justo las que se borran (lo
# detectó Infra en el smoke del 2026-09-03: 10 demos creadas y borradas en
# prod, 0 bitácoras). El modelo ya lo decía ("sin FK: el log tiene que
# sobrevivir al borrado"), pero el plan se deriva de information_schema por
# COLUMNA, no por FK, y la tabla entraba igual. El `municipio_id` queda como
# referencia histórica de un municipio que ya no existe.
TABLAS_QUE_SOBREVIVEN = {"demo_seed_logs"}

# Un usuario es "de demo" por el dominio de su email. Antes el patrón exigía
# `@<codigo>.demo.com`, y una demo cuyo código cambió después de sembrarla
# (prod: `moreno`, usuarios @moreno-2.demo.com) quedaba clasificada como
# tenant real e imborrable. Ningún tenant productivo usa `.demo.com` (SPN
# tiene 7 usuarios así, y está protegido por id, no por el patrón).
PATRONES_EMAIL_DEMO = ("%.demo.com", "%@demo.com", "%.test.com")


@dataclass
class Sentencia:
    """Una sentencia del plan: la tabla que limpia y cómo llega al municipio."""
    tabla: str
    # Cadena de JOINs desde la tabla hasta una tabla con municipio_id.
    # [] = la tabla misma tiene municipio_id.
    camino: list[tuple[str, str, str]] = field(default_factory=list)  # (col_fk, tabla_padre, col_padre)

    @property
    def profundidad(self) -> int:
        return len(self.camino)

    def _from_where(self) -> tuple[str, str]:
        alias = "t0"
        partes = [f"`{self.tabla}` {alias}"]
        actual = alias
        for i, (col_fk, padre, col_padre) in enumerate(self.camino, start=1):
            siguiente = f"t{i}"
            partes.append(f"JOIN `{padre}` {siguiente} ON {actual}.`{col_fk}` = {siguiente}.`{col_padre}`")
            actual = siguiente
        return " ".join(partes), f"{actual}.`municipio_id` = :mid"

    def sql_delete(self) -> str:
        from_, where = self._from_where()
        return f"DELETE t0 FROM {from_} WHERE {where}"

    def condicion_in(self) -> str:
        """La misma pertenencia como `t0.col IN (SELECT ...)`, para poder unir
        varios caminos a la misma tabla con OR y contar cada fila una sola vez."""
        if not self.camino:
            return "t0.`municipio_id` = :mid"
        interna = None
        for col_fk, padre, col_padre in reversed(self.camino):
            filtro = interna or "`municipio_id` = :mid"
            interna = f"`{col_fk}` IN (SELECT `{col_padre}` FROM `{padre}` WHERE {filtro})"
        return "t0." + interna

    def descripcion(self) -> str:
        if not self.camino:
            return self.tabla
        return self.tabla + " <- " + " <- ".join(f"{p}.{c}" for c, p, _ in self.camino)


_PLAN_CACHE: dict[str, list[Sentencia]] = {}


async def plan_borrado(db: AsyncSession) -> list[Sentencia]:
    """Plan ordenado (hijas primero) para el esquema de la conexión. Cacheado por base."""
    esquema = (await db.execute(text("SELECT DATABASE()"))).scalar()
    if esquema in _PLAN_CACHE:
        return _PLAN_CACHE[esquema]

    con_muni = {
        r[0] for r in (await db.execute(text(
            "SELECT TABLE_NAME FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = :s AND COLUMN_NAME = 'municipio_id'"), {"s": esquema})).fetchall()
    }
    con_muni.discard("municipios")
    con_muni -= TABLAS_QUE_SOBREVIVEN
    fks = (await db.execute(text(
        "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME "
        "FROM information_schema.KEY_COLUMN_USAGE "
        "WHERE TABLE_SCHEMA = :s AND REFERENCED_TABLE_NAME IS NOT NULL"), {"s": esquema})).fetchall()

    sentencias: list[Sentencia] = [Sentencia(tabla=t) for t in sorted(con_muni)]
    # Cada tabla hija puede llegar al municipio por más de una FK (documentos:
    # reclamo_id y usuario_id). Se emite una sentencia por camino: la primera
    # borra lo suyo, las demás encuentran cero filas. Eso es lo correcto — una
    # fila que sólo se relaciona por la segunda FK también es del municipio.
    nivel_anterior: dict[str, list[tuple[str, str, str]]] = {t: [] for t in con_muni}
    cubiertas = set(con_muni)
    for _ in range(PROFUNDIDAD_MAX - 1):
        nivel_actual: dict[str, list[tuple[str, str, str]]] = {}
        for tabla, col, ref, ref_col in fks:
            if tabla in cubiertas or tabla == "municipios" or ref not in nivel_anterior:
                continue
            camino = [(col, ref, ref_col)] + nivel_anterior[ref]
            sentencias.append(Sentencia(tabla=tabla, camino=camino))
            # Para el nivel siguiente alcanza con un camino (cualquiera) hasta el municipio.
            nivel_actual.setdefault(tabla, camino)
        if not nivel_actual:
            break
        cubiertas |= set(nivel_actual)
        nivel_anterior = nivel_actual

    # Las más profundas primero; `usuarios` al final del nivel 1 porque muchas
    # hijas llegan al municipio a través de él.
    sentencias.sort(key=lambda s: (-s.profundidad, s.tabla == "usuarios", s.tabla))
    _PLAN_CACHE[esquema] = sentencias
    return sentencias


async def contar_plan(db: AsyncSession, municipio_id: int) -> dict[str, int]:
    """Cuántas filas borraría por tabla, sin tocar nada (para el dry-run).
    Una tabla alcanzable por varios caminos se cuenta una sola vez (OR)."""
    por_tabla: dict[str, list[Sentencia]] = {}
    for s in await plan_borrado(db):
        por_tabla.setdefault(s.tabla, []).append(s)
    conteo: dict[str, int] = {}
    for tabla, sentencias in por_tabla.items():
        where = " OR ".join(f"({s.condicion_in()})" for s in sentencias)
        n = (await db.execute(text(f"SELECT COUNT(*) FROM `{tabla}` t0 WHERE {where}"),
                              {"mid": municipio_id})).scalar() or 0
        if n:
            conteo[tabla] = int(n)
    return conteo


async def borrar_municipio(db: AsyncSession, municipio_id: int) -> dict[str, int]:
    """
    Hard delete del municipio y TODO lo que cuelga de él. Devuelve filas
    borradas por tabla. No hace commit: lo hace quien llama (y así puede
    hacer rollback si algo falla). FOREIGN_KEY_CHECKS se restaura siempre,
    porque la conexión vuelve al pool.
    """
    if municipio_id in MUNICIPIOS_INTOCABLES:
        raise ValueError(f"El municipio {municipio_id} es intocable")
    borrado: dict[str, int] = {}
    await db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    try:
        for s in await plan_borrado(db):
            r = await db.execute(text(s.sql_delete()), {"mid": municipio_id})
            if r.rowcount:
                borrado[s.tabla] = borrado.get(s.tabla, 0) + r.rowcount
        r = await db.execute(text("DELETE FROM municipios WHERE id = :mid"), {"mid": municipio_id})
        borrado["municipios"] = r.rowcount
    finally:
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    log.info("municipio %s borrado: %s", municipio_id, borrado)
    return borrado


async def describir_municipio(db: AsyncSession, municipio_id: int, codigo: str) -> dict:
    """
    Lo que hace falta saber antes de borrar: si es la demo de muestra, si
    tiene llave, cuántos usuarios son demo y cuántos no (con sus dominios,
    para que quien decide vea QUÉ hay). No decide nada.
    """
    fila = (await db.execute(text(
        "SELECT id, codigo, nombre, activo, demo_publica, demo_token IS NOT NULL AND demo_token <> '' AS con_llave, "
        "demo_protegido, created_at FROM municipios WHERE id = :mid"), {"mid": municipio_id})).mappings().first()
    if not fila:
        return {"existe": False, "id": municipio_id, "codigo": codigo}
    patrones = list(PATRONES_EMAIL_DEMO)
    cond_demo = " OR ".join(f"email LIKE :p{i}" for i in range(len(patrones)))
    params = {"mid": municipio_id, **{f"p{i}": p for i, p in enumerate(patrones)}}
    usuarios = (await db.execute(text(
        f"SELECT SUM(CASE WHEN {cond_demo} THEN 1 ELSE 0 END) AS demo, "
        f"SUM(CASE WHEN {cond_demo} THEN 0 ELSE 1 END) AS reales FROM usuarios WHERE municipio_id = :mid"),
        params)).mappings().first()
    dominios_reales = [r[0] for r in (await db.execute(text(
        f"SELECT DISTINCT SUBSTRING_INDEX(email, '@', -1) FROM usuarios "
        f"WHERE municipio_id = :mid AND NOT ({cond_demo}) LIMIT 10"), params)).fetchall()]
    return {
        "existe": True,
        "id": fila["id"],
        "codigo": fila["codigo"],
        "nombre": fila["nombre"],
        "activo": bool(fila["activo"]),
        "demo_publica": bool(fila["demo_publica"]),
        "con_llave": bool(fila["con_llave"]),
        "demo_protegido": bool(fila["demo_protegido"]),
        "created_at": fila["created_at"],
        "usuarios_demo": int(usuarios["demo"] or 0),
        "usuarios_reales": int(usuarios["reales"] or 0),
        "dominios_reales": dominios_reales,
        "intocable": fila["id"] in MUNICIPIOS_INTOCABLES,
    }
