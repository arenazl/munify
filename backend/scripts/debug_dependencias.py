"""
Script de debug para ver la estructura de dependencias, categorías y asignaciones.
Ejecutar: python -m scripts.debug_dependencias
"""
import asyncio
import sys
import json
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from core.config import settings

MUNICIPIO_ID = 7  # Chacabuco


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = {}

        # 1. DEPENDENCIAS MAESTRAS (catálogo)
        print("=" * 60)
        print("1. DEPENDENCIAS MAESTRAS (catálogo)")
        print("=" * 60)
        query = text("""
            SELECT id, nombre, codigo, tipo_gestion, activo
            FROM dependencias
            ORDER BY orden, id
        """)
        rows = await db.execute(query)
        dependencias = [dict(row._mapping) for row in rows.fetchall()]
        result['dependencias_maestras'] = dependencias
        for d in dependencias:
            print(f"  [{d['id']}] {d['nombre']} ({d['codigo']}) - tipo: {d['tipo_gestion']}, activo: {d['activo']}")

        # 2. CATEGORÍAS MAESTRAS
        print("\n" + "=" * 60)
        print("2. CATEGORÍAS MAESTRAS (reclamos)")
        print("=" * 60)
        query = text("""
            SELECT id, nombre, icono, color, activo
            FROM categorias
            ORDER BY orden, id
        """)
        rows = await db.execute(query)
        categorias = [dict(row._mapping) for row in rows.fetchall()]
        result['categorias_maestras'] = categorias
        for c in categorias:
            print(f"  [{c['id']}] {c['nombre']} - activo: {c['activo']}")

        # 3. TIPOS DE TRÁMITE MAESTROS
        print("\n" + "=" * 60)
        print("3. TIPOS DE TRÁMITE MAESTROS")
        print("=" * 60)
        query = text("""
            SELECT id, nombre, icono, color, activo
            FROM tipos_tramites
            ORDER BY orden, id
        """)
        rows = await db.execute(query)
        tipos = [dict(row._mapping) for row in rows.fetchall()]
        result['tipos_tramite_maestros'] = tipos
        for t in tipos:
            print(f"  [{t['id']}] {t['nombre']} - activo: {t['activo']}")

        # 4. DEPENDENCIAS HABILITADAS PARA CHACABUCO
        print("\n" + "=" * 60)
        print(f"4. DEPENDENCIAS HABILITADAS PARA MUNICIPIO {MUNICIPIO_ID}")
        print("=" * 60)
        query = text("""
            SELECT md.id as md_id, md.municipio_id, md.dependencia_id, md.activo,
                   d.nombre, d.codigo, d.tipo_gestion
            FROM municipio_dependencias md
            JOIN dependencias d ON md.dependencia_id = d.id
            WHERE md.municipio_id = :muni_id
            ORDER BY md.orden, md.id
        """)
        rows = await db.execute(query, {"muni_id": MUNICIPIO_ID})
        deps_habilitadas = [dict(row._mapping) for row in rows.fetchall()]
        result['dependencias_habilitadas'] = deps_habilitadas
        for d in deps_habilitadas:
            print(f"  [md_id={d['md_id']}] {d['nombre']} ({d['codigo']}) - tipo: {d['tipo_gestion']}, activo: {d['activo']}")

        # 5. ASIGNACIONES DE CATEGORÍAS A DEPENDENCIAS (RECLAMOS)
        print("\n" + "=" * 60)
        print(f"5. CATEGORÍAS ASIGNADAS A DEPENDENCIAS (municipio {MUNICIPIO_ID})")
        print("=" * 60)
        query = text("""
            SELECT mdc.id, mdc.municipio_dependencia_id, mdc.categoria_id, mdc.activo,
                   c.nombre as categoria_nombre,
                   d.nombre as dependencia_nombre, d.codigo as dep_codigo
            FROM municipio_dependencia_categorias mdc
            JOIN categorias c ON mdc.categoria_id = c.id
            JOIN dependencias d ON mdc.dependencia_id = d.id
            WHERE mdc.municipio_id = :muni_id
            ORDER BY d.nombre, c.nombre
        """)
        rows = await db.execute(query, {"muni_id": MUNICIPIO_ID})
        cat_asignadas = [dict(row._mapping) for row in rows.fetchall()]
        result['categorias_asignadas'] = cat_asignadas

        if not cat_asignadas:
            print("  *** NO HAY CATEGORÍAS ASIGNADAS ***")
        else:
            # Agrupar por dependencia
            by_dep = {}
            for a in cat_asignadas:
                dep_name = a['dependencia_nombre']
                if dep_name not in by_dep:
                    by_dep[dep_name] = []
                by_dep[dep_name].append(a['categoria_nombre'])

            for dep_name, cats in by_dep.items():
                print(f"\n  {dep_name}:")
                for cat in cats:
                    print(f"    - {cat}")

        # 6. ASIGNACIONES DE TIPOS TRÁMITE A DEPENDENCIAS
        print("\n" + "=" * 60)
        print(f"6. TIPOS TRÁMITE ASIGNADOS A DEPENDENCIAS (municipio {MUNICIPIO_ID})")
        print("=" * 60)
        query = text("""
            SELECT mdtt.id, mdtt.municipio_dependencia_id, mdtt.tipo_tramite_id, mdtt.activo,
                   tt.nombre as tipo_nombre,
                   d.nombre as dependencia_nombre, d.codigo as dep_codigo
            FROM municipio_dependencia_tipos_tramites mdtt
            JOIN tipos_tramites tt ON mdtt.tipo_tramite_id = tt.id
            JOIN dependencias d ON mdtt.dependencia_id = d.id
            WHERE mdtt.municipio_id = :muni_id
            ORDER BY d.nombre, tt.nombre
        """)
        rows = await db.execute(query, {"muni_id": MUNICIPIO_ID})
        tipos_asignados = [dict(row._mapping) for row in rows.fetchall()]
        result['tipos_tramite_asignados'] = tipos_asignados

        if not tipos_asignados:
            print("  *** NO HAY TIPOS DE TRÁMITE ASIGNADOS ***")
        else:
            by_dep = {}
            for a in tipos_asignados:
                dep_name = a['dependencia_nombre']
                if dep_name not in by_dep:
                    by_dep[dep_name] = []
                by_dep[dep_name].append(a['tipo_nombre'])

            for dep_name, tipos in by_dep.items():
                print(f"\n  {dep_name}:")
                for t in tipos:
                    print(f"    - {t}")

        # 7. RESUMEN
        print("\n" + "=" * 60)
        print("RESUMEN")
        print("=" * 60)
        print(f"  Dependencias en catálogo: {len(dependencias)}")
        print(f"  Categorías en catálogo: {len(categorias)}")
        print(f"  Tipos trámite en catálogo: {len(tipos)}")
        print(f"  Dependencias habilitadas (muni {MUNICIPIO_ID}): {len(deps_habilitadas)}")
        print(f"  Categorías asignadas (muni {MUNICIPIO_ID}): {len(cat_asignadas)}")
        print(f"  Tipos trámite asignados (muni {MUNICIPIO_ID}): {len(tipos_asignados)}")

        # Guardar JSON
        with open('debug_dependencias_output.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False, default=str)
        print(f"\n  Datos guardados en: debug_dependencias_output.json")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
