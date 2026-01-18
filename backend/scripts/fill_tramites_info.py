"""
Script para llenar información de trámites usando IA.
Recorre los trámites sin descripción/requisitos y los completa con info genérica de Argentina.

Uso:
    cd backend
    python scripts/fill_tramites_info.py

    # Solo ver qué haría (dry run):
    python scripts/fill_tramites_info.py --dry-run
"""
import asyncio
import sys
import os

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import async_session_factory, engine
from models.tramite import Tramite, TipoTramite
from services import chat_service
import json


async def get_tramite_info_from_ia(tipo_tramite: str, tramite: str) -> dict:
    """Consulta a la IA para obtener info del trámite"""

    prompt = f"""Sos un experto en trámites municipales de Argentina.

Necesito información sobre el trámite "{tramite}" dentro de la categoría "{tipo_tramite}".

Respondé SOLO con un JSON válido con esta estructura exacta:
{{
    "descripcion": "Descripción breve del trámite (1-2 oraciones)",
    "requisitos": "Lista de requisitos separados por | (ej: Ser mayor de 18 años | Residir en el municipio)",
    "documentos_requeridos": "Lista de documentos separados por | (ej: DNI original y copia | Comprobante de domicilio)"
}}

IMPORTANTE:
- Basate en la normativa general de Argentina
- Sé específico pero conciso
- Los requisitos y documentos van separados por " | "
- Solo el JSON, sin explicaciones

JSON:"""

    response = await chat_service.chat(prompt, max_tokens=500)

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


async def fill_tramites_info(dry_run: bool = False):
    """Recorre trámites sin info y los completa con IA"""

    print("\n" + "="*60)
    print("  LLENADO DE INFO DE TRÁMITES CON IA")
    print("="*60 + "\n")

    if dry_run:
        print("[DRY RUN] No se harán cambios en la DB\n")

    if not chat_service.is_available():
        print("[ERROR] Servicio de IA no disponible. Configurar GROQ_API_KEY.")
        return

    async with async_session_factory() as db:
        # Obtener trámites sin descripción o sin requisitos
        query = (
            select(Tramite)
            .join(TipoTramite)
            .where(
                Tramite.activo == True,
                (Tramite.descripcion == None) | (Tramite.descripcion == "") |
                (Tramite.requisitos == None) | (Tramite.requisitos == "") |
                (Tramite.documentos_requeridos == None) | (Tramite.documentos_requeridos == "")
            )
            .order_by(TipoTramite.nombre, Tramite.nombre)
        )

        result = await db.execute(query)
        tramites = result.scalars().all()

        if not tramites:
            print("No hay trámites sin información. Todo está completo.")
            return

        print(f"Encontrados {len(tramites)} trámites sin información completa:\n")

        updated = 0
        errors = 0

        for t in tramites:
            # Cargar el tipo de trámite
            tipo_query = select(TipoTramite).where(TipoTramite.id == t.tipo_tramite_id)
            tipo_result = await db.execute(tipo_query)
            tipo = tipo_result.scalar_one_or_none()

            tipo_nombre = tipo.nombre if tipo else "General"

            print(f"[{tipo_nombre}] {t.nombre}")
            print(f"  - Descripción actual: {t.descripcion or '(vacío)'}")
            print(f"  - Requisitos actual: {t.requisitos or '(vacío)'}")
            print(f"  - Documentos actual: {t.documentos_requeridos or '(vacío)'}")

            # Consultar a la IA
            print(f"  Consultando IA...")
            info = await get_tramite_info_from_ia(tipo_nombre, t.nombre)

            if info:
                print(f"  [OK] Info obtenida:")
                print(f"    - Descripción: {info.get('descripcion', '')[:60]}...")
                print(f"    - Requisitos: {info.get('requisitos', '')[:60]}...")
                print(f"    - Documentos: {info.get('documentos_requeridos', '')[:60]}...")

                if not dry_run:
                    # Actualizar solo campos vacíos
                    if not t.descripcion:
                        t.descripcion = info.get('descripcion', '')
                    if not t.requisitos:
                        t.requisitos = info.get('requisitos', '')
                    if not t.documentos_requeridos:
                        t.documentos_requeridos = info.get('documentos_requeridos', '')

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
        print(f"  Total procesados: {len(tramites)}")
        print("="*60 + "\n")


async def main():
    dry_run = "--dry-run" in sys.argv
    await fill_tramites_info(dry_run)


if __name__ == "__main__":
    asyncio.run(main())
