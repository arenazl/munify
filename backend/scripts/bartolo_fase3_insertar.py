"""
FASE 3 — Insertar Bartolo curado en tablas reales.

Lee `bartolo_raw` (con sugerencias de IA aplicadas) y crea:
  - tesoreria_proyectos (los detectados)
  - contactos (todos los unicos, con tipo de la IA)
  - gastos (todos, con fechas inferidas dia 10 del mes)
  - Imputaciones a proyecto si corresponde (gasto_proyectos)

Reglas:
  - Si sugerencia_concepto es null/vacio -> 'Otros gastos'
  - Si sugerencia_tipo_contacto es null o 'otro' -> 'otro'
  - Fecha: dia 10 del mes detectado. Si mes es null -> primero del año.
  - Bug fix: Jesus Ybanovich agosto 2025 -> monto 666667 (era 6.2MM mal parseado).
  - Dudosos: si concepto está en (Compras varias, Otros gastos, Contrataciones
    varias, Pagos varios) → tag 'observaciones = [BARTOLO-DUDOSO] {raw_concept}'.
  - Notas generales: '[BARTOLO] desde {archivo}/{hoja}'.

Idempotencia: borra antes los gastos/contactos/proyectos de SPN con
observaciones LIKE '[BARTOLO]%' y reinserta.
"""
import asyncio
import sys
import unicodedata
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy import text  # noqa: E402
from core.config import settings  # noqa: E402


MUNI_ID = 80  # san-pedro-norte
CREADOR_ID = 621  # admin@san-pedro-norte.demo.com
DUDOSOS = {'Compras varias', 'Otros gastos', 'Contrataciones varias', 'Pagos varios'}

# Map secretarias sugeridas (IA) -> nombre de dependencia en DB
SECRETARIA_MAP = {
    'Personal': 'General',  # no hay "Personal" como dep formal, mapea a General
    'Concejo Deliberante': 'Concejo Deliberante',
    'Turismo y Cultura': 'Secretaría de Turismo y Cultura',
    'Profesionales y Publicidad': 'General',  # no es dep formal
    'Obras Públicas': 'Secretaría de Obras Públicas',
    'Obras Publicas': 'Secretaría de Obras Públicas',
    'Desarrollo Social': 'Secretaría de Salud',  # SPN no tiene desarrollo social, usar Salud como aproximación
    'Tesorería': 'Direccion de Tesoreria',
    'Tesoreria': 'Direccion de Tesoreria',
}

# Tipo empleado: subcategorias dentro de "empleado"
def empleado_tipo_id_from_category(categoria: str) -> int | None:
    if not categoria:
        return None
    c = categoria.lower()
    # Mapeo simple
    return {
        'empleado_planta': 1,
        'empleado_turismo': 2,
        'gerontologico': 3,
    }.get(c)


def normalize_concept(s: str) -> str:
    if not s:
        return ''
    # Quitar tildes (DB tiene sin tildes)
    n = unicodedata.normalize('NFD', s)
    return ''.join(c for c in n if unicodedata.category(c) != 'Mn')


def split_nombre_apellido(nombre_completo: str) -> tuple[str, str | None]:
    """Heurística simple: si tiene 1 palabra -> nombre solo.
    Si tiene 2+: primera palabra = nombre, resto = apellido."""
    if not nombre_completo:
        return ('', None)
    parts = nombre_completo.strip().split()
    if len(parts) == 1:
        return (parts[0], None)
    return (parts[0], ' '.join(parts[1:]))


async def main():
    print("[1/9] arrancando...", flush=True)
    engine = create_async_engine(settings.DATABASE_URL)
    print("[2/9] engine creado", flush=True)

    # ============================================================
    # 0. Borrar [BARTOLO] existentes para reinsertar idempotente
    # ============================================================
    print("[3/9] limpieza idempotente...", flush=True)
    async with engine.begin() as conn:
        # cuotas vinculadas a gastos [BARTOLO]
        await conn.execute(text("""
            DELETE FROM gastos_cuotas WHERE gasto_id IN
              (SELECT id FROM gastos WHERE municipio_id = :mid AND observaciones LIKE '[BARTOLO]%')
        """), {'mid': MUNI_ID})
        try:
            await conn.execute(text("""
                DELETE FROM gasto_proyectos WHERE gasto_id IN
                  (SELECT id FROM gastos WHERE municipio_id = :mid AND observaciones LIKE '[BARTOLO]%')
            """), {'mid': MUNI_ID})
        except Exception as e:
            print(f"[skip] gasto_proyectos: {e}")
        r = await conn.execute(text("DELETE FROM gastos WHERE municipio_id = :mid AND observaciones LIKE '[BARTOLO]%'"), {'mid': MUNI_ID})
        print(f"  borrados gastos [BARTOLO]: {r.rowcount}")
        r = await conn.execute(text("DELETE FROM contactos WHERE municipio_id = :mid AND notas LIKE '[BARTOLO]%'"), {'mid': MUNI_ID})
        print(f"  borrados contactos [BARTOLO]: {r.rowcount}")
        r = await conn.execute(text("DELETE FROM proyectos WHERE municipio_id = :mid AND descripcion LIKE '[BARTOLO]%'"), {'mid': MUNI_ID})
        print(f"  borrados proyectos [BARTOLO]: {r.rowcount}")

    # ============================================================
    # 1. Map de catalogos del muni
    # ============================================================
    async with engine.begin() as conn:
        # Dependencias (md_id por nombre normalizado)
        rows = (await conn.execute(text("""
            SELECT md.id, d.nombre FROM municipio_dependencias md
            JOIN dependencias d ON d.id = md.dependencia_id
            WHERE md.municipio_id = :mid AND md.activo = 1
        """), {'mid': MUNI_ID})).fetchall()
        dep_by_name = {normalize_concept(r[1]).lower(): r[0] for r in rows}
        # md_id de "General" como fallback
        dep_general = dep_by_name.get('general') or dep_by_name.get('direccion de tesoreria')

        # Conceptos por nombre normalizado
        rows = (await conn.execute(text("""
            SELECT id, nombre FROM tesoreria_conceptos WHERE municipio_id = :mid AND activo = 1
        """), {'mid': MUNI_ID})).fetchall()
        concepto_by_name = {normalize_concept(r[1]).lower(): r[0] for r in rows}

        # Cajas por modo (mapeo lazy)
        rows = (await conn.execute(text("""
            SELECT id, nombre, codigo FROM tesoreria_cajas WHERE municipio_id = :mid AND activo = 1
        """), {'mid': MUNI_ID})).fetchall()
        # Por default usamos "Tesoro propio" para todo (caja unica). Despues
        # el user puede cambiar al curar.
        caja_default = rows[0][0] if rows else None
        print(f"  caja default: {caja_default}")

    # ============================================================
    # 2. Cargar staging (con bug fix de Ybanovich)
    # ============================================================
    async with engine.begin() as conn:
        # Fix Ybanovich agosto 2025: $6.211.966.667 -> $666.667
        await conn.execute(text("""
            UPDATE bartolo_raw SET monto = 666667,
              notas = CONCAT(COALESCE(notas, ''), '[FIX] monto original $6.211.966.667 corregido')
            WHERE empresa_normalizada LIKE '%ybanovich%' AND monto > 1000000000
        """))

        # Cargar todos los registros
        rows = (await conn.execute(text("""
            SELECT id, monto, mes, anio, empresa_raw, empresa_normalizada, empresa_parentesis,
                   modo_normalizado, sugerencia_tipo_contacto, sugerencia_concepto,
                   sugerencia_secretaria, sugerencia_proyecto, sheet_categoria_inferida,
                   fuente_archivo, fuente_hoja, tipo_pivote
            FROM bartolo_raw ORDER BY anio, mes, id
        """))).fetchall()

    print(f"\n[INFO] {len(rows)} registros a procesar")

    # ============================================================
    # 3. Crear proyectos unicos
    # ============================================================
    proyectos_unicos = set()
    for r in rows:
        if r[11]:  # sugerencia_proyecto
            proyectos_unicos.add(r[11].strip())

    proyecto_id_by_name = {}
    async with engine.begin() as conn:
        for pname in sorted(proyectos_unicos):
            res = await conn.execute(text("""
                INSERT INTO proyectos
                  (municipio_id, nombre, descripcion, estado, activo, created_at, updated_at)
                VALUES
                  (:mid, :nom, :desc, 'activo', 1, NOW(), NOW())
            """), {'mid': MUNI_ID, 'nom': pname[:150], 'desc': '[BARTOLO] importado de Excel'})
            proyecto_id_by_name[pname] = res.lastrowid
    print(f"[OK] {len(proyecto_id_by_name)} proyectos creados")

    # ============================================================
    # 4. Crear contactos unicos
    # ============================================================
    # Agrupar por empresa_normalizada para deducir tipo y secretaria (mayoria)
    from collections import defaultdict, Counter
    contactos_por_norm: dict[str, dict] = {}
    for r in rows:
        norm = r[5]
        if not norm:
            continue
        if norm not in contactos_por_norm:
            contactos_por_norm[norm] = {
                'nombre_raw': r[4],
                'tipo_counter': Counter(),
                'secretaria_counter': Counter(),
                'categoria_counter': Counter(),
            }
        contactos_por_norm[norm]['tipo_counter'][r[8] or 'otro'] += 1
        contactos_por_norm[norm]['secretaria_counter'][r[10] or ''] += 1
        contactos_por_norm[norm]['categoria_counter'][r[12] or ''] += 1

    contacto_id_by_norm = {}
    # Bulk: marcamos con un tag unico el batch + despues consultamos los ids
    BARTOLO_TAG_UNIQ = '[BARTOLO]'
    print(f"  preparando {len(contactos_por_norm)} contactos...", flush=True)
    bulk_payload = []
    ordered_norms = []  # mismo orden que bulk_payload
    for norm, data in contactos_por_norm.items():
        tipo = data['tipo_counter'].most_common(1)[0][0]
        if tipo not in ('empleado', 'concejal', 'profesional', 'proveedor', 'contratista', 'beneficiario', 'otro'):
            tipo = 'otro'
        categoria = data['categoria_counter'].most_common(1)[0][0]
        tipo_empleado_id = empleado_tipo_id_from_category(categoria)
        nombre, apellido = split_nombre_apellido(data['nombre_raw'])
        bulk_payload.append({
            'mid': MUNI_ID,
            'nom': nombre[:100],
            'ape': apellido[:100] if apellido else None,
            'tipo': tipo,
            'te_id': tipo_empleado_id,
            'notas': f'{BARTOLO_TAG_UNIQ} norm={norm[:200]} | categoria={categoria}',
        })
        ordered_norms.append(norm)

    print(f"  ejecutando bulk INSERT en lotes de 100...", flush=True)
    BATCH_CONTACTOS = 100
    for i in range(0, len(bulk_payload), BATCH_CONTACTOS):
        chunk = bulk_payload[i:i + BATCH_CONTACTOS]
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO contactos
                  (municipio_id, nombre, apellido, tipo, tipo_empleado_id, activo, notas, created_at, updated_at)
                VALUES
                  (:mid, :nom, :ape, :tipo, :te_id, 1, :notas, NOW(), NOW())
            """), chunk)
        print(f"    lote {i//BATCH_CONTACTOS + 1}/{(len(bulk_payload)+BATCH_CONTACTOS-1)//BATCH_CONTACTOS}: {i+len(chunk)}/{len(bulk_payload)}", flush=True)
    print(f"  bulk insertado, recuperando ids...", flush=True)

    # Recuperar ids matcheando por el norm en notas
    async with engine.begin() as conn:
        contact_rows = (await conn.execute(text("""
            SELECT id, notas FROM contactos
            WHERE municipio_id = :mid AND notas LIKE :pat
        """), {'mid': MUNI_ID, 'pat': f'{BARTOLO_TAG_UNIQ} norm=%'})).fetchall()
        import re as _re
        for cr in contact_rows:
            m = _re.search(r'norm=([^|]+)\s*\|', cr[1] or '')
            if m:
                norm_in_db = m.group(1).strip()
                contacto_id_by_norm[norm_in_db] = cr[0]

    print(f"[OK] {len(contacto_id_by_norm)} contactos creados", flush=True)

    # ============================================================
    # 5. Insertar gastos
    # ============================================================
    gastos_insertados = 0
    gastos_dudosos = 0
    bloque_size = 100
    pending = []

    def fecha_de(anio: int, mes: int | None) -> str:
        if mes and 1 <= mes <= 12:
            return f"{anio}-{mes:02d}-10"
        # Fallback: 1 de enero
        return f"{anio}-01-01"

    async with engine.begin() as conn:
        for r in rows:
            (rid, monto, mes, anio, empresa_raw, norm, paren, modo,
             tipo_c, concepto, secretaria, proyecto, categoria, archivo, hoja, tipo_pivote) = r

            concepto_str = concepto or 'Otros gastos'
            es_dudoso = concepto_str in DUDOSOS

            # Concepto FK
            concepto_id = concepto_by_name.get(normalize_concept(concepto_str).lower())
            if not concepto_id:
                # Fallback "Otros gastos"
                concepto_id = concepto_by_name.get('otros gastos')

            # Dependencia FK (md_id)
            md_id = None
            if secretaria:
                md_id = dep_by_name.get(normalize_concept(SECRETARIA_MAP.get(secretaria, secretaria)).lower())
            md_id = md_id or dep_general

            # Contacto FK
            contacto_id = contacto_id_by_norm.get(norm)

            # Notas
            obs_parts = [f'[BARTOLO] {archivo}/{hoja}']
            if es_dudoso:
                obs_parts.append(f'[BARTOLO-DUDOSO] orig_concept={concepto_str}')
                gastos_dudosos += 1
            if paren:
                obs_parts.append(f'paren={paren[:150]}')
            if modo:
                obs_parts.append(f'modo={modo}')
            obs_str = ' | '.join(obs_parts)[:1000]

            descripcion = paren[:300] if paren else (empresa_raw[:300] if empresa_raw else None)

            pending.append({
                'mid': MUNI_ID,
                'creador_id': CREADOR_ID,
                'destino_tipo': 'contacto' if contacto_id else 'dependencia',
                'destino_contacto_id': contacto_id,
                'destino_dependencia_id': md_id if not contacto_id else None,
                'concepto': concepto_str[:150],
                'descripcion': descripcion,
                'monto_pesos': float(monto),
                'fecha': fecha_de(anio, mes),
                'tipo_financiacion': 'contado',
                'forma_pago': 'transferencia' if 'transf' in (modo or '') else (
                    'cheque' if 'cheq' in (modo or '') or 'echeq' in (modo or '') else
                    'efectivo' if 'efec' in (modo or '') else 'transferencia'
                ),
                'estado_pago': 'concretado',
                'observaciones': obs_str,
                'activo': 1,
            })

            if len(pending) >= bloque_size:
                await conn.execute(text("""
                    INSERT INTO gastos
                      (municipio_id, creador_id, destino_tipo, destino_contacto_id, destino_dependencia_id,
                       concepto, descripcion, monto_pesos, fecha,
                       tipo_financiacion, forma_pago, estado_pago, observaciones, activo,
                       created_at, updated_at)
                    VALUES
                      (:mid, :creador_id, :destino_tipo, :destino_contacto_id, :destino_dependencia_id,
                       :concepto, :descripcion, :monto_pesos, :fecha,
                       :tipo_financiacion, :forma_pago, :estado_pago, :observaciones, :activo,
                       NOW(), NOW())
                """), pending)
                gastos_insertados += len(pending)
                pending = []
                print(f"  insertados {gastos_insertados}...")

        if pending:
            await conn.execute(text("""
                INSERT INTO gastos
                  (municipio_id, creador_id, destino_tipo, destino_contacto_id, destino_dependencia_id,
                   concepto, descripcion, monto_pesos, fecha,
                   tipo_financiacion, forma_pago, estado_pago, observaciones, activo,
                   created_at, updated_at)
                VALUES
                  (:mid, :creador_id, :destino_tipo, :destino_contacto_id, :destino_dependencia_id,
                   :concepto, :descripcion, :monto_pesos, :fecha,
                   :tipo_financiacion, :forma_pago, :estado_pago, :observaciones, :activo,
                   NOW(), NOW())
            """), pending)
            gastos_insertados += len(pending)

    print(f"\n[OK] {gastos_insertados} gastos insertados ({gastos_dudosos} marcados [BARTOLO-DUDOSO])")

    # ============================================================
    # 6. Stats finales
    # ============================================================
    async with engine.begin() as conn:
        total = (await conn.execute(text("SELECT COUNT(*), SUM(monto_pesos) FROM gastos WHERE municipio_id = :mid"), {'mid': MUNI_ID})).fetchone()
        dud = (await conn.execute(text("SELECT COUNT(*), SUM(monto_pesos) FROM gastos WHERE municipio_id = :mid AND observaciones LIKE '%BARTOLO-DUDOSO%'"), {'mid': MUNI_ID})).fetchone()
        cont = (await conn.execute(text("SELECT COUNT(*) FROM contactos WHERE municipio_id = :mid"), {'mid': MUNI_ID})).fetchone()
        proy = (await conn.execute(text("SELECT COUNT(*) FROM proyectos WHERE municipio_id = :mid"), {'mid': MUNI_ID})).fetchone()
        print(f"\n=== ESTADO FINAL muni {MUNI_ID} (San Pedro Norte) ===")
        print(f"  Gastos:    {total[0]} (total ${float(total[1] or 0):,.0f})")
        print(f"  Dudosos:   {dud[0]} (total ${float(dud[1] or 0):,.0f})")
        print(f"  Contactos: {cont[0]}")
        print(f"  Proyectos: {proy[0]}")

    await engine.dispose()
    print("\n[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
