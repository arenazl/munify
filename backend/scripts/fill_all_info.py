"""
Script para llenar información de TODAS las entidades usando IA:
- TipoTramite (categorías de trámites)
- Tramite (trámites específicos)
- Categoria (categorías de reclamos)

Uso:
    cd backend
    python scripts/fill_all_info.py

    # Solo ver qué haría (dry run):
    python scripts/fill_all_info.py --dry-run

    # Solo una entidad:
    python scripts/fill_all_info.py --only=tramites
    python scripts/fill_all_info.py --only=tipos
    python scripts/fill_all_info.py --only=categorias
"""
import asyncio
import sys
import os

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import AsyncSessionLocal, engine
from models.tramite import Tramite, TipoTramite
from models.categoria import Categoria
from services import chat_service
import json


# ==================== PROMPTS ====================

async def get_tipo_tramite_info(nombre: str) -> dict:
    """Info para TipoTramite (categoría de trámites)"""
    prompt = f"""Sos un experto en trámites municipales de Argentina.

Necesito información sobre la CATEGORÍA de trámites: "{nombre}"

Respondé SOLO con un JSON válido:
{{
    "descripcion": "Descripción breve de qué trámites abarca esta categoría (1-2 oraciones)"
}}

Ejemplos de categorías: Obras Privadas, Comercio, Tránsito, Rentas, Salud, Medio Ambiente.

Solo el JSON:"""

    return await _call_ia(prompt)


async def get_tramite_info(tipo: str, nombre: str) -> dict:
    """Info para Tramite específico"""
    prompt = f"""Sos un experto en trámites municipales de Argentina.

Necesito información sobre el trámite "{nombre}" de la categoría "{tipo}".

Respondé SOLO con un JSON válido:
{{
    "descripcion": "Descripción breve del trámite (1-2 oraciones)",
    "requisitos": [
        "Requisito 1",
        "Requisito 2",
        "Requisito 3"
    ],
    "documentos_requeridos": [
        "Documento 1",
        "Documento 2",
        "Documento 3"
    ],
    "tiempo_estimado_dias": 15
}}

IMPORTANTE:
- Basate en normativa argentina
- Los requisitos y documentos son ARRAYS de strings
- Máximo 5-6 items por array
- tiempo_estimado_dias es un número entero (días hábiles típicos)
- Sé específico pero conciso

Solo el JSON:"""

    return await _call_ia(prompt)


async def get_categoria_info(nombre: str) -> dict:
    """Info para Categoria de reclamos"""
    prompt = f"""Sos un experto en gestión municipal de Argentina.

Necesito información sobre la categoría de reclamos: "{nombre}"

Respondé SOLO con un JSON válido:
{{
    "descripcion": "Descripción breve de qué problemas abarca (1-2 oraciones)",
    "ejemplos_reclamos": [
        "Ejemplo de reclamo 1",
        "Ejemplo de reclamo 2",
        "Ejemplo de reclamo 3"
    ],
    "tip_ayuda": "Tip corto para el vecino (máx 100 caracteres)"
}}

IMPORTANTE:
- Los ejemplos son un ARRAY de strings
- Máximo 4-5 ejemplos concretos y comunes
- El tip debe ser práctico

Solo el JSON:"""

    return await _call_ia(prompt)


async def _call_ia(prompt: str) -> dict:
    """Llama a la IA y parsea el JSON"""
    response = await chat_service.chat(prompt, max_tokens=400)

    if response:
        try:
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            return json.loads(clean.strip())
        except json.JSONDecodeError:
            pass
    return None


# ==================== PROCESAMIENTO ====================

async def fill_tipos_tramite(db: AsyncSession, dry_run: bool) -> tuple[int, int]:
    """Llena info de TipoTramite"""
    print("\n" + "-"*50)
    print("  TIPOS DE TRÁMITE (categorías)")
    print("-"*50)

    query = select(TipoTramite).where(
        TipoTramite.activo == True,
        (TipoTramite.descripcion == None) | (TipoTramite.descripcion == "")
    ).order_by(TipoTramite.nombre)

    result = await db.execute(query)
    items = result.scalars().all()

    if not items:
        print("  Todos los tipos tienen descripción.")
        return 0, 0

    print(f"  {len(items)} tipos sin descripción\n")
    updated, errors = 0, 0

    for item in items:
        print(f"  [{item.id}] {item.nombre}: ", end="", flush=True)
        info = await get_tipo_tramite_info(item.nombre)

        if info and info.get('descripcion'):
            if not dry_run:
                item.descripcion = info['descripcion']
                await db.commit()
            print(f"OK - {info['descripcion'][:50]}...")
            updated += 1
        else:
            print("ERROR")
            errors += 1

        await asyncio.sleep(1)

    return updated, errors


async def fill_tramites(db: AsyncSession, dry_run: bool) -> tuple[int, int]:
    """Llena info de Tramite"""
    print("\n" + "-"*50)
    print("  TRÁMITES ESPECÍFICOS")
    print("-"*50)

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
    items = result.scalars().all()

    if not items:
        print("  Todos los trámites tienen info completa.")
        return 0, 0

    print(f"  {len(items)} trámites sin info completa\n")
    updated, errors = 0, 0

    for item in items:
        # Cargar tipo
        tipo_q = select(TipoTramite).where(TipoTramite.id == item.tipo_tramite_id)
        tipo_r = await db.execute(tipo_q)
        tipo = tipo_r.scalar_one_or_none()
        tipo_nombre = tipo.nombre if tipo else "General"

        print(f"  [{tipo_nombre}] {item.nombre}: ", end="", flush=True)
        info = await get_tramite_info(tipo_nombre, item.nombre)

        if info:
            if not dry_run:
                if not item.descripcion and info.get('descripcion'):
                    item.descripcion = info['descripcion']
                if not item.requisitos and info.get('requisitos'):
                    # Convertir array a string con separador |
                    req = info['requisitos']
                    item.requisitos = " | ".join(req) if isinstance(req, list) else req
                if not item.documentos_requeridos and info.get('documentos_requeridos'):
                    # Convertir array a string con separador |
                    docs = info['documentos_requeridos']
                    item.documentos_requeridos = " | ".join(docs) if isinstance(docs, list) else docs
                if info.get('tiempo_estimado_dias') and (not item.tiempo_estimado_dias or item.tiempo_estimado_dias == 15):
                    # Solo actualizar si tiene el default (15) o está vacío
                    item.tiempo_estimado_dias = info['tiempo_estimado_dias']
                await db.commit()
            print("OK")
            updated += 1
        else:
            print("ERROR")
            errors += 1

        await asyncio.sleep(1)

    return updated, errors


async def fill_categorias(db: AsyncSession, dry_run: bool) -> tuple[int, int]:
    """Llena info de Categoria de reclamos"""
    print("\n" + "-"*50)
    print("  CATEGORÍAS DE RECLAMOS")
    print("-"*50)

    query = select(Categoria).where(
        Categoria.activo == True,
        (Categoria.descripcion == None) | (Categoria.descripcion == "") |
        (Categoria.ejemplos_reclamos == None) | (Categoria.ejemplos_reclamos == "")
    ).order_by(Categoria.municipio_id, Categoria.nombre)

    result = await db.execute(query)
    items = result.scalars().all()

    if not items:
        print("  Todas las categorías tienen info completa.")
        return 0, 0

    print(f"  {len(items)} categorías sin info completa\n")
    updated, errors = 0, 0

    for item in items:
        print(f"  [Muni:{item.municipio_id}] {item.nombre}: ", end="", flush=True)
        info = await get_categoria_info(item.nombre)

        if info:
            if not dry_run:
                if not item.descripcion and info.get('descripcion'):
                    item.descripcion = info['descripcion']
                if not item.ejemplos_reclamos and info.get('ejemplos_reclamos'):
                    # Convertir array a string con separador |
                    ej = info['ejemplos_reclamos']
                    item.ejemplos_reclamos = " | ".join(ej) if isinstance(ej, list) else ej
                if not item.tip_ayuda and info.get('tip_ayuda'):
                    item.tip_ayuda = info['tip_ayuda']
                await db.commit()
            print("OK")
            updated += 1
        else:
            print("ERROR")
            errors += 1

        await asyncio.sleep(1)

    return updated, errors


# ==================== MAIN ====================

async def main():
    dry_run = "--dry-run" in sys.argv
    only = None
    for arg in sys.argv:
        if arg.startswith("--only="):
            only = arg.split("=")[1]

    print("\n" + "="*60)
    print("  LLENADO AUTOMÁTICO DE INFO CON IA")
    print("="*60)

    if dry_run:
        print("\n[DRY RUN] No se harán cambios en la DB")

    if only:
        print(f"[FILTRO] Solo procesando: {only}")

    if not chat_service.is_available():
        print("\n[ERROR] Servicio de IA no disponible. Configurar GROQ_API_KEY.")
        return

    total_updated = 0
    total_errors = 0

    async with AsyncSessionLocal() as db:
        if not only or only == "tipos":
            u, e = await fill_tipos_tramite(db, dry_run)
            total_updated += u
            total_errors += e

        if not only or only == "tramites":
            u, e = await fill_tramites(db, dry_run)
            total_updated += u
            total_errors += e

        if not only or only == "categorias":
            u, e = await fill_categorias(db, dry_run)
            total_updated += u
            total_errors += e

    print("\n" + "="*60)
    print(f"  RESUMEN FINAL")
    print("="*60)
    print(f"  Actualizados: {total_updated}")
    print(f"  Errores: {total_errors}")
    if dry_run:
        print(f"  (DRY RUN - nada fue guardado)")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
