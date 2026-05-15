"""
FASE 2 — Curacion con IA via Claude Code headless.

Agrupa los registros de bartolo_raw por empresa_normalizada (1 persona = 1
clasificacion). Procesa en lotes de 50 personas. Para cada lote, invoca
`claude -p` con un prompt que devuelve JSON con:
  - tipo_contacto: enum [empleado, concejal, profesional, proveedor,
    contratista, beneficiario, otro]
  - secretaria: nombre de secretaria inferida (puede ser null)
  - concepto: uno de los 32 conceptos oficiales (string EXACTO)
  - proyecto: nombre de obra/proyecto inferido (puede ser null)
  - notas: razonamiento si ambiguo (puede ser null)

Aplica la clasificacion a TODOS los registros de esa empresa en la
columna sugerencia_*. Es idempotente: re-ejecuta y completa solo los
que faltan.

Uso:
  python scripts/bartolo_fase2_curacion_ia.py [--limit N] [--reset]
"""
import argparse
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy import text  # noqa: E402
from core.config import settings  # noqa: E402


CONCEPTOS = [
    "Pago de sueldos y jornales",
    "Pago de aguinaldo / SAC",
    "Pago de honorarios profesionales",
    "Pago de viáticos y movilidad",
    "Pago de servicios públicos (luz, agua, gas)",
    "Pago de Internet y telefonía",
    "Pago de alquileres",
    "Pago de seguros",
    "Pago de impuestos y tasas",
    "Pago de gastos bancarios",
    "Pago de préstamos / devoluciones",
    "Pagos varios",
    "Compra de combustible",
    "Compra de materiales de obra",
    "Compra de materiales de oficina",
    "Compra de insumos de limpieza",
    "Compra de herramientas y equipamiento",
    "Compras varias",
    "Reparación de vehículos",
    "Reparación de edificios e instalaciones",
    "Reparación de equipos (aire, computadoras, etc.)",
    "Reparaciones varias",
    "Contratación de fletes y transporte",
    "Contratación de eventos y actividades culturales",
    "Contratación de servicios profesionales",
    "Contrataciones varias",
    "Aporte a salud / prestaciones médicas",
    "Aporte a subsidios y ayudas sociales",
    "Aportes varios",
    "Obra pública / construcción",
    "Obras varias",
    "Otros gastos",
]

BATCH_SIZE = 50  # personas por llamada


def build_prompt(personas):
    """personas: list de dicts con {nombre, categoria, parentesis_samples,
    pagos_count, monto_total, pagos_sample}
    """
    conceptos_str = "\n".join(f"  - {c}" for c in CONCEPTOS)
    personas_json = json.dumps(personas, ensure_ascii=False, indent=2)
    return f"""Clasificá personas/proveedores de gastos historicos de un municipio rural argentino (San Pedro Norte).

Para cada uno devolvé EXACTAMENTE este JSON (un objeto por persona, en el mismo orden):

```json
[
  {{
    "nombre": "(el nombre que te pase)",
    "tipo_contacto": "empleado|concejal|profesional|proveedor|contratista|beneficiario|otro",
    "secretaria": "Personal | Concejo Deliberante | Turismo y Cultura | Desarrollo Social | Obras Públicas | Tesorería | Profesionales y Publicidad | null",
    "concepto": "(uno EXACTO de la lista)",
    "proyecto": "(nombre obra si hay, sino null)",
    "notas": "(1 línea si ambiguo, sino null)"
  }}
]
```

CONCEPTOS OFICIALES (usar string exacto, incluyendo tildes):
{conceptos_str}

REGLAS:
- categoria='empleado_planta' → tipo_contacto='empleado', concepto='Pago de sueldos y jornales', secretaria='Personal'.
- categoria='concejal' → tipo_contacto='concejal', concepto='Pago de sueldos y jornales', secretaria='Concejo Deliberante'.
- categoria='profesional' → tipo_contacto='profesional', concepto='Pago de honorarios profesionales', secretaria='Profesionales y Publicidad'.
- categoria='empleado_turismo' → tipo_contacto='empleado', secretaria='Turismo y Cultura', concepto='Pago de sueldos y jornales'.
- categoria='ayuda_social' → tipo_contacto='beneficiario', secretaria='Desarrollo Social', concepto='Aporte a subsidios y ayudas sociales'.
- categoria='proveedor' → inferir del nombre + parentesis:
    * combustible/nafta/YPF → 'Compra de combustible'.
    * materiales construccion/cemento/ladrillos/hierro → 'Compra de materiales de obra'.
    * seguros → 'Pago de seguros'.
    * flete/transporte → 'Contratación de fletes y transporte'.
    * evento/festival/jineteada → 'Contratación de eventos y actividades culturales'.
    * obra/balneario/vivienda → 'Obra pública / construcción' + proyecto del parentesis.
    * Si no es claro → 'Compras varias' o 'Otros gastos'.
- Si parentesis menciona obra (ej "vivienda semilla", "obra balneario") → proyecto = ese texto capitalizado.

DEVOLVÉ SOLO EL JSON, sin texto antes ni después, sin markdown.

Personas a clasificar:
{personas_json}
"""


def call_claude(prompt: str) -> str:
    """Invoca claude -p con el prompt y devuelve stdout."""
    # Windows: claude se instala como .cmd → usar shell=True.
    # CLAUDECODE=unset para permitir corrida nested (este script puede ser
    # invocado desde dentro de otra sesion Claude Code).
    import os
    env = os.environ.copy()
    env.pop('CLAUDECODE', None)
    env.pop('CLAUDE_CODE_ENTRYPOINT', None)
    result = subprocess.run(
        'claude -p --output-format text',
        input=prompt,
        capture_output=True,
        text=True,
        encoding='utf-8',
        timeout=600,
        shell=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude -p fallo (rc={result.returncode}): {result.stderr[:500]}")
    return result.stdout.strip()


def parse_response(raw: str) -> list[dict]:
    """Extrae el array JSON de la respuesta del LLM."""
    # Buscar el primer [ y el ultimo ]
    s = raw.strip()
    # Sacar fences si los hay
    s = re.sub(r'^```(?:json)?\s*', '', s, flags=re.IGNORECASE)
    s = re.sub(r'\s*```$', '', s)
    # Si la respuesta tiene texto antes del JSON, buscar el primer [
    start = s.find('[')
    end = s.rfind(']')
    if start < 0 or end < 0:
        raise ValueError(f"No se encontro array JSON en respuesta: {s[:200]}")
    payload = s[start:end + 1]
    return json.loads(payload)


async def main(limit: int | None, reset: bool):
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        if reset:
            await conn.execute(text("""
                UPDATE bartolo_raw
                SET sugerencia_tipo_contacto = NULL,
                    sugerencia_concepto = NULL,
                    sugerencia_secretaria = NULL,
                    sugerencia_proyecto = NULL
            """))
            print("[OK] reset de sugerencias")

        # Agrupar por empresa_normalizada — solo las que no tienen sugerencia todavia
        rows = (await conn.execute(text("""
            SELECT
                empresa_normalizada,
                MAX(empresa_raw) AS nombre,
                MAX(sheet_categoria_inferida) AS categoria,
                COUNT(*) AS pagos_count,
                SUM(monto) AS monto_total,
                GROUP_CONCAT(DISTINCT empresa_parentesis SEPARATOR ' | ') AS parentesis
            FROM bartolo_raw
            WHERE sugerencia_tipo_contacto IS NULL
            GROUP BY empresa_normalizada
            ORDER BY pagos_count DESC
        """))).fetchall()

    if not rows:
        print("[OK] no hay personas pendientes (todo curado)")
        await engine.dispose()
        return

    print(f"[INFO] {len(rows)} personas pendientes de curar")
    if limit:
        rows = rows[:limit]
        print(f"[INFO] limitado a {len(rows)} para esta corrida")

    total_lotes = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE
    procesadas = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        lote_num = (i // BATCH_SIZE) + 1
        print(f"\n--- Lote {lote_num}/{total_lotes} ({len(chunk)} personas) ---")

        # Preparar payload mínimo para el LLM
        personas = []
        for r in chunk:
            personas.append({
                'nombre': r[1] or r[0] or '?',
                'categoria': r[2] or 'proveedor',
                'pagos_count': int(r[3]),
                'monto_total': float(r[4] or 0),
                'parentesis_samples': r[5] or None,
            })

        prompt = build_prompt(personas)
        import time
        t0 = time.time()
        print(f"  -> llamando claude -p (prompt {len(prompt)} chars)... ", end='', flush=True)
        try:
            raw = call_claude(prompt)
            dt = time.time() - t0
            print(f"{dt:.1f}s")
        except Exception as e:
            print(f"FAILED")
            print(f"  [!] error: {e}")
            continue

        try:
            parsed = parse_response(raw)
        except Exception as e:
            print(f"  [!] no se pudo parsear: {e}")
            print(f"  --- RAW (primeros 500 chars) ---")
            print(raw[:500])
            continue

        if len(parsed) != len(chunk):
            print(f"  [!] WARNING: respondió {len(parsed)} items, esperaba {len(chunk)}")

        # Aplicar a staging
        async with engine.begin() as conn:
            for orig, sug in zip(chunk, parsed):
                empresa_norm = orig[0]
                # Validar concepto
                concepto = sug.get('concepto') or 'Otros gastos'
                if concepto not in CONCEPTOS:
                    concepto = 'Otros gastos'
                tipo = sug.get('tipo_contacto') or 'otro'
                if tipo not in ('empleado', 'concejal', 'profesional', 'proveedor', 'contratista', 'beneficiario', 'otro'):
                    tipo = 'otro'
                await conn.execute(text("""
                    UPDATE bartolo_raw SET
                        sugerencia_tipo_contacto = :tipo,
                        sugerencia_concepto = :concepto,
                        sugerencia_secretaria = :secretaria,
                        sugerencia_proyecto = :proyecto
                    WHERE empresa_normalizada = :emp
                """), {
                    'tipo': tipo,
                    'concepto': concepto,
                    'secretaria': sug.get('secretaria') or None,
                    'proyecto': sug.get('proyecto') or None,
                    'emp': empresa_norm,
                })
            procesadas += len(chunk)
        print(f"  [OK] procesadas {procesadas}/{len(rows)} personas")

    # Stats finales
    async with engine.begin() as conn:
        stats = (await conn.execute(text("""
            SELECT sugerencia_concepto, COUNT(*), SUM(monto)
            FROM bartolo_raw
            WHERE sugerencia_concepto IS NOT NULL
            GROUP BY sugerencia_concepto
            ORDER BY COUNT(*) DESC
        """))).fetchall()
        print("\n[STATS curacion]")
        for s in stats:
            print(f"  {s[0]}: {s[1]} regs, ${s[2]:,.0f}")
        tot = (await conn.execute(text("""
            SELECT
              SUM(CASE WHEN sugerencia_concepto IS NOT NULL THEN 1 ELSE 0 END) AS curados,
              COUNT(*) AS total
            FROM bartolo_raw
        """))).fetchone()
        print(f"\n[TOTAL] {tot[0]}/{tot[1]} registros curados ({tot[0]*100//tot[1]}%)")

    await engine.dispose()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument('--limit', type=int, default=None, help='limitar cantidad de personas a procesar (default: todas)')
    p.add_argument('--reset', action='store_true', help='resetear sugerencias y empezar de cero')
    args = p.parse_args()
    asyncio.run(main(args.limit, args.reset))
