# -*- coding: utf-8 -*-
"""Auditoria READ-ONLY de uso de tramites/turnos en prod. Solo SELECTs."""
import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from core.database import engine


async def q(conn, sql, **params):
    return (await conn.execute(text(sql), params or {})).fetchall()


async def scalar(conn, sql, **params):
    return (await conn.execute(text(sql), params or {})).scalar()


def prows(rows, cols):
    if not rows:
        print("    (vacio)")
        return
    for r in rows:
        m = r._mapping
        print("    " + " | ".join(f"{c}={m[c]}" for c in cols))


async def main():
    async with engine.connect() as conn:
        print("=" * 72)
        print("1. SOLICITUDES")
        print("=" * 72)
        total = await scalar(conn, "SELECT COUNT(*) FROM solicitudes")
        print(f"  total: {total}")

        print("  por estado:")
        prows(await q(conn, "SELECT estado, COUNT(*) c FROM solicitudes GROUP BY estado ORDER BY c DESC"), ["estado", "c"])

        print("  por canal:")
        prows(await q(conn, "SELECT COALESCE(canal,'(null)') canal, COUNT(*) c FROM solicitudes GROUP BY canal ORDER BY c DESC"), ["canal", "c"])

        print("  top 10 municipios (con nombre y es_demo):")
        prows(await q(conn, """
            SELECT s.municipio_id mid, m.nombre, m.es_demo, COUNT(*) c
            FROM solicitudes s LEFT JOIN municipios m ON m.id = s.municipio_id
            GROUP BY s.municipio_id, m.nombre, m.es_demo ORDER BY c DESC LIMIT 10
        """), ["mid", "nombre", "es_demo", "c"])

        con_docs = await scalar(conn, """
            SELECT COUNT(DISTINCT s.id) FROM solicitudes s
            JOIN documentos_solicitudes d ON d.solicitud_id = s.id
        """)
        total_docs = await scalar(conn, "SELECT COUNT(*) FROM documentos_solicitudes")
        print(f"  solicitudes con >=1 documento adjunto: {con_docs} (docs totales: {total_docs})")

        finalizadas = await scalar(conn, "SELECT COUNT(*) FROM solicitudes WHERE estado IN ('finalizado','APROBADO')")
        print(f"  finalizadas (finalizado+APROBADO): {finalizadas}")

        print("  tiempo de resolucion (dias, solo con fecha_resolucion):")
        prows(await q(conn, """
            SELECT COUNT(*) n,
                   ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, fecha_resolucion))/24, 1) prom_dias,
                   ROUND(MIN(TIMESTAMPDIFF(HOUR, created_at, fecha_resolucion))/24, 1) min_dias,
                   ROUND(MAX(TIMESTAMPDIFF(HOUR, created_at, fecha_resolucion))/24, 1) max_dias
            FROM solicitudes WHERE fecha_resolucion IS NOT NULL
        """), ["n", "prom_dias", "min_dias", "max_dias"])

        print("  distribucion por mes (created_at):")
        prows(await q(conn, """
            SELECT DATE_FORMAT(created_at, '%Y-%m') mes, COUNT(*) c
            FROM solicitudes GROUP BY mes ORDER BY mes
        """), ["mes", "c"])

        print()
        print("=" * 72)
        print("2. TRAMITES (catalogo)")
        print("=" * 72)
        print("  por municipio (todos):")
        prows(await q(conn, """
            SELECT t.municipio_id mid, m.nombre, m.es_demo, COUNT(*) c,
                   SUM(t.requiere_turno=1) turno,
                   SUM(t.requiere_kyc=1) kyc,
                   SUM(t.costo > 0) con_costo,
                   SUM(t.url_externa IS NOT NULL AND t.url_externa <> '') url_ext,
                   SUM(t.activo=1) activos
            FROM tramites t LEFT JOIN municipios m ON m.id = t.municipio_id
            GROUP BY t.municipio_id, m.nombre, m.es_demo ORDER BY c DESC
        """), ["mid", "nombre", "es_demo", "c", "turno", "kyc", "con_costo", "url_ext", "activos"])

        tot = (await q(conn, """
            SELECT COUNT(*) c, SUM(requiere_turno=1) turno, SUM(requiere_kyc=1) kyc,
                   SUM(costo > 0) con_costo,
                   SUM(url_externa IS NOT NULL AND url_externa <> '') url_ext
            FROM tramites
        """))[0]._mapping
        print(f"  TOTAL: {tot['c']} | requiere_turno={tot['turno']} | requiere_kyc={tot['kyc']} | costo>0={tot['con_costo']} | url_externa={tot['url_ext']}")

        print()
        print("=" * 72)
        print("3. TURNOS")
        print("=" * 72)
        total_t = await scalar(conn, "SELECT COUNT(*) FROM turnos")
        print(f"  total: {total_t}")

        print("  por estado:")
        prows(await q(conn, "SELECT estado, COUNT(*) c FROM turnos GROUP BY estado ORDER BY c DESC"), ["estado", "c"])

        print("  por motivo_tipo:")
        prows(await q(conn, "SELECT COALESCE(motivo_tipo,'(null)') mt, COUNT(*) c FROM turnos GROUP BY motivo_tipo ORDER BY c DESC"), ["mt", "c"])

        print("  solicitud_id NULL vs NOT NULL:")
        prows(await q(conn, """
            SELECT IF(solicitud_id IS NULL, 'NULL', 'NOT NULL') k, COUNT(*) c
            FROM turnos GROUP BY k
        """), ["k", "c"])

        print("  por municipio:")
        prows(await q(conn, """
            SELECT t.municipio_id mid, m.nombre, m.es_demo, COUNT(*) c
            FROM turnos t LEFT JOIN municipios m ON m.id = t.municipio_id
            GROUP BY t.municipio_id, m.nombre, m.es_demo ORDER BY c DESC
        """), ["mid", "nombre", "es_demo", "c"])

        print("  por mes (fecha_hora):")
        prows(await q(conn, """
            SELECT DATE_FORMAT(fecha_hora, '%Y-%m') mes, COUNT(*) c
            FROM turnos GROUP BY mes ORDER BY mes
        """), ["mes", "c"])

        print()
        print("=" * 72)
        print("4. AGENDA (configs + excepciones) vs fallback")
        print("=" * 72)
        n_cfg = await scalar(conn, "SELECT COUNT(*) FROM agenda_configs")
        n_exc = await scalar(conn, "SELECT COUNT(*) FROM agenda_excepciones")
        print(f"  filas agenda_configs: {n_cfg} | filas agenda_excepciones: {n_exc}")

        print("  dependencias con agenda configurada, por muni:")
        prows(await q(conn, """
            SELECT ac.municipio_id mid, m.nombre, m.es_demo,
                   COUNT(DISTINCT ac.municipio_dependencia_id) deps_con_agenda,
                   COUNT(*) filas
            FROM agenda_configs ac LEFT JOIN municipios m ON m.id = ac.municipio_id
            GROUP BY ac.municipio_id, m.nombre, m.es_demo ORDER BY filas DESC
        """), ["mid", "nombre", "es_demo", "deps_con_agenda", "filas"])

        print("  total dependencias activas por muni (para medir fallback) — top 10 por turnos/solicitudes relevantes:")
        prows(await q(conn, """
            SELECT md.municipio_id mid, m.nombre, m.es_demo,
                   COUNT(*) deps,
                   SUM(EXISTS(SELECT 1 FROM agenda_configs ac WHERE ac.municipio_dependencia_id = md.id)) deps_con_agenda
            FROM municipio_dependencias md LEFT JOIN municipios m ON m.id = md.municipio_id
            GROUP BY md.municipio_id, m.nombre, m.es_demo
            ORDER BY deps DESC LIMIT 15
        """), ["mid", "nombre", "es_demo", "deps", "deps_con_agenda"])

        print("  excepciones por muni:")
        prows(await q(conn, """
            SELECT ae.municipio_id mid, m.nombre, COUNT(*) c
            FROM agenda_excepciones ae LEFT JOIN municipios m ON m.id = ae.municipio_id
            GROUP BY ae.municipio_id, m.nombre ORDER BY c DESC
        """), ["mid", "nombre", "c"])

        print()
        print("=" * 72)
        print("5. MUNICIPIO_DEPENDENCIA_TRAMITES (mapeo tramite->dependencia)")
        print("=" * 72)
        n_map = await scalar(conn, "SELECT COUNT(*) FROM municipio_dependencia_tramites")
        print(f"  filas totales: {n_map}")
        print("  por muni (via dependencia):")
        prows(await q(conn, """
            SELECT md.municipio_id mid, m.nombre, m.es_demo, COUNT(*) mapeos,
                   COUNT(DISTINCT mdt.tramite_id) tramites_mapeados,
                   COUNT(DISTINCT mdt.municipio_dependencia_id) deps
            FROM municipio_dependencia_tramites mdt
            JOIN municipio_dependencias md ON md.id = mdt.municipio_dependencia_id
            LEFT JOIN municipios m ON m.id = md.municipio_id
            GROUP BY md.municipio_id, m.nombre, m.es_demo ORDER BY mapeos DESC
        """), ["mid", "nombre", "es_demo", "mapeos", "tramites_mapeados", "deps"])

        print("  tramites SIN mapeo a dependencia, por muni:")
        prows(await q(conn, """
            SELECT t.municipio_id mid, m.nombre, COUNT(*) sin_mapeo
            FROM tramites t LEFT JOIN municipios m ON m.id = t.municipio_id
            WHERE t.activo = 1
              AND NOT EXISTS (SELECT 1 FROM municipio_dependencia_tramites mdt WHERE mdt.tramite_id = t.id)
            GROUP BY t.municipio_id, m.nombre ORDER BY sin_mapeo DESC
        """), ["mid", "nombre", "sin_mapeo"])

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
