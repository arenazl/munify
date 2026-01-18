"""
Script para llenar información de categorías de reclamos usando IA.
Recorre las categorías sin descripción/ejemplos y los completa.

Uso:
    cd backend
    python scripts/fill_categorias_info.py

    # Solo ver qué haría (dry run):
    python scripts/fill_categorias_info.py --dry-run
"""
import asyncio
import sys
import os

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import async_session_factory, engine
from models.categoria import Categoria
from services import chat_service
import json


async def get_categoria_info_from_ia(categoria: str) -> dict:
    """Consulta a la IA para obtener info de la categoría de reclamos"""

    prompt = f"""Sos un experto en gestión municipal de Argentina.

Necesito información sobre la categoría de reclamos municipales: "{categoria}"

Respondé SOLO con un JSON válido con esta estructura exacta:
{{
    "descripcion": "Descripción breve de qué tipo de problemas abarca esta categoría (1-2 oraciones)",
    "ejemplos_reclamos": "Ejemplos concretos de reclamos separados por | (ej: Bache en la calle | Pozo en la vereda | Hundimiento del asfalto)",
    "tip_ayuda": "Un tip corto para el vecino al reportar este tipo de problema (máx 100 caracteres)"
}}

IMPORTANTE:
- Basate en problemas típicos de municipios argentinos
- Los ejemplos van separados por " | "
- El tip debe ser práctico y breve
- Solo el JSON, sin explicaciones

JSON:"""

    response = await chat_service.chat(prompt, max_tokens=400)

    if response:
        try:
            # Limpiar respuesta
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()

            return json.loads(clean)
        except json.JSONDecodeError as e:
            print(f"  [ERROR] No se pudo parsear JSON: {e}")
            print(f"  Respuesta: {response[:200]}...")

    return None


async def fill_categorias_info(dry_run: bool = False):
    """Recorre categorías sin info y las completa con IA"""

    print("\n" + "="*60)
    print("  LLENADO DE INFO DE CATEGORÍAS CON IA")
    print("="*60 + "\n")

    if dry_run:
        print("[DRY RUN] No se harán cambios en la DB\n")

    if not chat_service.is_available():
        print("[ERROR] Servicio de IA no disponible. Configurar GROQ_API_KEY.")
        return

    async with async_session_factory() as db:
        # Obtener categorías sin descripción o sin ejemplos
        query = (
            select(Categoria)
            .where(
                Categoria.activo == True,
                (Categoria.descripcion == None) | (Categoria.descripcion == "") |
                (Categoria.ejemplos_reclamos == None) | (Categoria.ejemplos_reclamos == "")
            )
            .order_by(Categoria.municipio_id, Categoria.nombre)
        )

        result = await db.execute(query)
        categorias = result.scalars().all()

        if not categorias:
            print("No hay categorías sin información. Todo está completo.")
            return

        print(f"Encontradas {len(categorias)} categorías sin información completa:\n")

        updated = 0
        errors = 0

        for c in categorias:
            print(f"[Muni:{c.municipio_id}] {c.nombre}")
            print(f"  - Descripción actual: {c.descripcion or '(vacío)'}")
            print(f"  - Ejemplos actual: {c.ejemplos_reclamos or '(vacío)'}")
            print(f"  - Tip actual: {c.tip_ayuda or '(vacío)'}")

            # Consultar a la IA
            print(f"  Consultando IA...")
            info = await get_categoria_info_from_ia(c.nombre)

            if info:
                print(f"  [OK] Info obtenida:")
                print(f"    - Descripción: {info.get('descripcion', '')[:60]}...")
                print(f"    - Ejemplos: {info.get('ejemplos_reclamos', '')[:60]}...")
                print(f"    - Tip: {info.get('tip_ayuda', '')[:60]}...")

                if not dry_run:
                    # Actualizar solo campos vacíos
                    if not c.descripcion:
                        c.descripcion = info.get('descripcion', '')
                    if not c.ejemplos_reclamos:
                        c.ejemplos_reclamos = info.get('ejemplos_reclamos', '')
                    if not c.tip_ayuda:
                        c.tip_ayuda = info.get('tip_ayuda', '')

                    await db.commit()
                    print(f"  [GUARDADO]")
                else:
                    print(f"  [DRY RUN] No se guardó")

                updated += 1
            else:
                print(f"  [ERROR] No se pudo obtener info")
                errors += 1

            print()

            # Pequeña pausa para no saturar la API
            await asyncio.sleep(1)

        print("\n" + "="*60)
        print(f"  RESUMEN")
        print("="*60)
        print(f"  Actualizados: {updated}")
        print(f"  Errores: {errors}")
        print(f"  Total procesados: {len(categorias)}")
        print("="*60 + "\n")


async def main():
    dry_run = "--dry-run" in sys.argv
    await fill_categorias_info(dry_run)


if __name__ == "__main__":
    asyncio.run(main())
