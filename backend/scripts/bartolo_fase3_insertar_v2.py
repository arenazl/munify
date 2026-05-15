"""
FASE 3 v2 — Insertar Bartolo curado con pymysql sincrono.

Mejor que el v1 (asyncio) porque aiomysql se cuelga con bulks grandes.
PyMySQL con executemany maneja bien INSERTs masivos.

Resultado esperado:
  - 1098 contactos en ~5-10s (1 query con executemany)
  - 30 proyectos en ~3s
  - 7127 gastos en ~20-30s (batches de 500)
"""
import sys
import os
import re
import unicodedata
from pathlib import Path
from collections import defaultdict, Counter

sys.path.insert(0, str(Path(__file__).parent.parent))

import pymysql  # noqa: E402
from urllib.parse import urlparse
from core.config import settings  # noqa: E402


MUNI_ID = 80
CREADOR_ID = 621
DUDOSOS = {'Compras varias', 'Otros gastos', 'Contrataciones varias', 'Pagos varios'}

SECRETARIA_MAP = {
    'Personal': 'General',
    'Concejo Deliberante': 'Concejo Deliberante',
    'Turismo y Cultura': 'Secretaría de Turismo y Cultura',
    'Profesionales y Publicidad': 'General',
    'Obras Públicas': 'Secretaría de Obras Públicas',
    'Obras Publicas': 'Secretaría de Obras Públicas',
    'Desarrollo Social': 'Secretaría de Salud',
    'Tesorería': 'Direccion de Tesoreria',
    'Tesoreria': 'Direccion de Tesoreria',
}


def normalize_concept(s: str) -> str:
    if not s:
        return ''
    n = unicodedata.normalize('NFD', s)
    return ''.join(c for c in n if unicodedata.category(c) != 'Mn').lower()


def split_nombre_apellido(s: str):
    if not s:
        return ('', None)
    parts = s.strip().split()
    if len(parts) == 1:
        return (parts[0], None)
    return (parts[0], ' '.join(parts[1:]))


def empleado_tipo_id_from_category(cat: str):
    return {'empleado_planta': 1, 'empleado_turismo': 2, 'gerontologico': 3}.get((cat or '').lower())


def fecha_de(anio, mes):
    if mes and 1 <= mes <= 12:
        return f"{anio}-{mes:02d}-10"
    return f"{anio}-01-01"


def main():
    print("[1/8] arrancando...", flush=True)
    # Parse DATABASE_URL: mysql+aiomysql://user:pass@host:port/db
    url = settings.DATABASE_URL
    # Quitar el driver async
    url_sync = url.replace('mysql+aiomysql://', 'mysql://').replace('mysql+pymysql://', 'mysql://')
    parsed = urlparse(url_sync)

    print("[2/8] conectando a MySQL (pymysql sincrono)...", flush=True)
    conn = pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=parsed.path.lstrip('/'),
        charset='utf8mb4',
        connect_timeout=30,
        # SSL para Aiven
        ssl={'ca': None} if 'aivencloud' in (parsed.hostname or '') else None,
    )
    print("[3/8] conectado, limpieza idempotente...", flush=True)
    cur = conn.cursor()

    # Limpieza
    cur.execute("DELETE FROM gastos_cuotas WHERE gasto_id IN (SELECT id FROM gastos WHERE municipio_id=%s AND observaciones LIKE '[BARTOLO]%%')", (MUNI_ID,))
    cur.execute("DELETE FROM gastos WHERE municipio_id=%s AND observaciones LIKE '[BARTOLO]%%'", (MUNI_ID,))
    print(f"  gastos borrados: {cur.rowcount}", flush=True)
    cur.execute("DELETE FROM contactos WHERE municipio_id=%s AND notas LIKE '[BARTOLO]%%'", (MUNI_ID,))
    print(f"  contactos borrados: {cur.rowcount}", flush=True)
    cur.execute("DELETE FROM proyectos WHERE municipio_id=%s AND descripcion LIKE '[BARTOLO]%%'", (MUNI_ID,))
    print(f"  proyectos borrados: {cur.rowcount}", flush=True)
    conn.commit()

    # Catalogos
    print("[4/8] cargando catalogos...", flush=True)
    cur.execute("""
        SELECT md.id, d.nombre FROM municipio_dependencias md
        JOIN dependencias d ON d.id = md.dependencia_id
        WHERE md.municipio_id=%s AND md.activo=1
    """, (MUNI_ID,))
    dep_by_name = {normalize_concept(n): mid for mid, n in cur.fetchall()}
    dep_general = dep_by_name.get('general') or dep_by_name.get('direccion de tesoreria')

    cur.execute("SELECT id, nombre FROM tesoreria_conceptos WHERE municipio_id=%s AND activo=1", (MUNI_ID,))
    concepto_by_name = {normalize_concept(n): cid for cid, n in cur.fetchall()}

    # Fix Ybanovich bug
    cur.execute("""
        UPDATE bartolo_raw SET monto=666667,
          notas=CONCAT(COALESCE(notas, ''), '[FIX] monto bug corregido')
        WHERE empresa_normalizada LIKE '%%ybanovich%%' AND monto>1000000000
    """)
    conn.commit()

    # Cargar staging
    print("[5/8] cargando staging...", flush=True)
    cur.execute("""
        SELECT id, monto, mes, anio, empresa_raw, empresa_normalizada, empresa_parentesis,
               modo_normalizado, sugerencia_tipo_contacto, sugerencia_concepto,
               sugerencia_secretaria, sugerencia_proyecto, sheet_categoria_inferida,
               fuente_archivo, fuente_hoja, tipo_pivote
        FROM bartolo_raw ORDER BY anio, mes, id
    """)
    rows = cur.fetchall()
    print(f"  {len(rows)} registros leidos", flush=True)

    # ============ PROYECTOS ============
    print("[6/8] insertando proyectos...", flush=True)
    proyectos_unicos = sorted({r[11].strip() for r in rows if r[11]})
    proyecto_id_by_name = {}
    if proyectos_unicos:
        proy_payload = [(MUNI_ID, p[:150], '[BARTOLO] importado de Excel', 'activo', 1) for p in proyectos_unicos]
        cur.executemany("""
            INSERT INTO proyectos (municipio_id, nombre, descripcion, estado, activo, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
        """, proy_payload)
        # Recuperar ids
        cur.execute("SELECT id, nombre FROM proyectos WHERE municipio_id=%s AND descripcion LIKE '[BARTOLO]%%'", (MUNI_ID,))
        proyecto_id_by_name = {n: pid for pid, n in cur.fetchall()}
    conn.commit()
    print(f"  {len(proyecto_id_by_name)} proyectos creados", flush=True)

    # ============ CONTACTOS ============
    print("[7/8] insertando contactos...", flush=True)
    contactos_por_norm = {}
    for r in rows:
        norm = r[5]
        if not norm:
            continue
        if norm not in contactos_por_norm:
            contactos_por_norm[norm] = {
                'nombre_raw': r[4], 'tipo_counter': Counter(),
                'categoria_counter': Counter(),
            }
        contactos_por_norm[norm]['tipo_counter'][r[8] or 'otro'] += 1
        contactos_por_norm[norm]['categoria_counter'][r[12] or ''] += 1

    cont_payload = []
    for norm, data in contactos_por_norm.items():
        tipo = data['tipo_counter'].most_common(1)[0][0]
        if tipo not in ('empleado', 'concejal', 'profesional', 'proveedor', 'contratista', 'beneficiario', 'otro'):
            tipo = 'otro'
        categoria = data['categoria_counter'].most_common(1)[0][0]
        te_id = empleado_tipo_id_from_category(categoria)
        nom, ape = split_nombre_apellido(data['nombre_raw'])
        cont_payload.append((
            MUNI_ID, nom[:100], ape[:100] if ape else None, tipo, te_id, 1,
            f'[BARTOLO] norm={norm[:200]} | categoria={categoria}',
        ))

    BATCH_C = 100
    for i in range(0, len(cont_payload), BATCH_C):
        chunk = cont_payload[i:i + BATCH_C]
        cur.executemany("""
            INSERT INTO contactos (municipio_id, nombre, apellido, tipo, tipo_empleado_id, activo, notas, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
        """, chunk)
        conn.commit()
        print(f"  contactos {min(i+BATCH_C, len(cont_payload))}/{len(cont_payload)}", flush=True)
    print(f"  recuperando ids...", flush=True)

    cur.execute("SELECT id, notas FROM contactos WHERE municipio_id=%s AND notas LIKE '[BARTOLO] norm=%%'", (MUNI_ID,))
    contacto_id_by_norm = {}
    for cid, notas in cur.fetchall():
        m = re.search(r'norm=([^|]+)\s*\|', notas or '')
        if m:
            contacto_id_by_norm[m.group(1).strip()] = cid
    print(f"  {len(contacto_id_by_norm)} ids mapeados", flush=True)

    # ============ GASTOS ============
    print("[8/8] insertando gastos...", flush=True)
    gastos_payload = []
    dudosos_count = 0
    for r in rows:
        (rid, monto, mes, anio, empresa_raw, norm, paren, modo,
         tipo_c, concepto, secretaria, proyecto, categoria, archivo, hoja, tipo_pivote) = r

        concepto_str = concepto or 'Otros gastos'
        es_dudoso = concepto_str in DUDOSOS
        if es_dudoso:
            dudosos_count += 1

        md_id = None
        if secretaria:
            md_id = dep_by_name.get(normalize_concept(SECRETARIA_MAP.get(secretaria, secretaria)))
        md_id = md_id or dep_general

        contacto_id = contacto_id_by_norm.get(norm)

        obs_parts = [f'[BARTOLO] {archivo}/{hoja}']
        if es_dudoso:
            obs_parts.append(f'[BARTOLO-DUDOSO] orig_concept={concepto_str}')
        if paren:
            obs_parts.append(f'paren={paren[:150]}')
        if modo:
            obs_parts.append(f'modo={modo}')
        obs_str = ' | '.join(obs_parts)[:1000]

        descripcion = (paren[:300] if paren else (empresa_raw[:300] if empresa_raw else None))

        forma_pago = 'transferencia'
        if modo:
            if 'cheq' in modo or 'echeq' in modo:
                forma_pago = 'cheque'
            elif 'efec' in modo:
                forma_pago = 'efectivo'

        gastos_payload.append((
            MUNI_ID, CREADOR_ID,
            'contacto' if contacto_id else 'dependencia',
            contacto_id, md_id if not contacto_id else None,
            concepto_str[:150], descripcion, float(monto),
            fecha_de(anio, mes),
            'contado', forma_pago, 'concretado', obs_str, 1,
        ))

    BATCH = 500
    for i in range(0, len(gastos_payload), BATCH):
        chunk = gastos_payload[i:i + BATCH]
        cur.executemany("""
            INSERT INTO gastos
              (municipio_id, creador_id, destino_tipo, destino_contacto_id, destino_dependencia_id,
               concepto, descripcion, monto_pesos, fecha,
               tipo_financiacion, forma_pago, estado_pago, observaciones, activo,
               created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
        """, chunk)
        conn.commit()
        print(f"  insertados {min(i+BATCH, len(gastos_payload))}/{len(gastos_payload)}", flush=True)

    print(f"\n=== ESTADO FINAL ===", flush=True)
    cur.execute("SELECT COUNT(*), SUM(monto_pesos) FROM gastos WHERE municipio_id=%s", (MUNI_ID,))
    r = cur.fetchone()
    print(f"  Gastos: {r[0]} (${float(r[1] or 0):,.0f})", flush=True)
    cur.execute("SELECT COUNT(*), SUM(monto_pesos) FROM gastos WHERE municipio_id=%s AND observaciones LIKE '%%BARTOLO-DUDOSO%%'", (MUNI_ID,))
    r = cur.fetchone()
    print(f"  Dudosos: {r[0]} (${float(r[1] or 0):,.0f})", flush=True)
    cur.execute("SELECT COUNT(*) FROM contactos WHERE municipio_id=%s", (MUNI_ID,))
    print(f"  Contactos: {cur.fetchone()[0]}", flush=True)
    cur.execute("SELECT COUNT(*) FROM proyectos WHERE municipio_id=%s", (MUNI_ID,))
    print(f"  Proyectos: {cur.fetchone()[0]}", flush=True)

    cur.close()
    conn.close()
    print("[DONE]", flush=True)


if __name__ == "__main__":
    main()
