"""
Script para crear las asignaciones de dependencias para Chacabuco (municipio_id=7)
Ejecutar: python -m scripts.seed_chacabuco_dependencias
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete, text
from core.config import settings
from models import (
    Dependencia, MunicipioDependencia,
    Categoria, MunicipioDependenciaCategoria,
    TipoTramite, MunicipioDependenciaTipoTramite,
    Tramite, MunicipioDependenciaTramite
)

MUNICIPIO_ID = 7  # Chacabuco

# Mapeo consciente: Categoría -> Código de Dependencia
# Incluye nombres reales de la BD + variantes del catálogo default
CATEGORIAS_A_DEPENDENCIAS = {
    # Nombres reales en la BD
    "Baches y Calzadas": "OBRAS_PUBLICAS",
    "Iluminación Pública": "SERVICIOS_PUBLICOS",
    "Recolección de Residuos": "SERVICIOS_PUBLICOS",
    "Espacios Verdes": "SERVICIOS_PUBLICOS",
    "Agua y Cloacas": "SERVICIOS_PUBLICOS",
    "Semáforos y Señalización Vial": "TRANSITO_VIAL",
    "Zoonosis y Animales": "ZOONOSIS",
    "Veredas y Baldíos": "OBRAS_PUBLICAS",
    "Ruidos Molestos": "SERVICIOS_PUBLICOS",
    "Limpieza Urbana": "SERVICIOS_PUBLICOS",
    "Seguridad Urbana": "SEGURIDAD",
    "Obras Públicas": "OBRAS_PUBLICAS",
    "Salud Ambiental": "SERVICIOS_PUBLICOS",
    "Transporte y Paradas": "TRANSITO_VIAL",
    "Otros Reclamos": "ATENCION_VECINO",
    # Variantes del catálogo default (por si existen)
    "Baches y Calles": "OBRAS_PUBLICAS",
    "Alumbrado Publico": "SERVICIOS_PUBLICOS",
    "Senalizacion": "TRANSITO_VIAL",
    "Desagues y Cloacas": "SERVICIOS_PUBLICOS",
    "Veredas": "OBRAS_PUBLICAS",
    "Agua y Canerias": "SERVICIOS_PUBLICOS",
    "Plagas y Fumigacion": "SERVICIOS_PUBLICOS",
    "Animales Sueltos": "ZOONOSIS",
    "Otros": "ATENCION_VECINO",
}

# Mapeo consciente: Tipo Trámite -> Código de Dependencia
TIPOS_A_DEPENDENCIAS = {
    "Obras Privadas": "OBRAS_PARTICULARES",
    "Comercio e Industria": "HABILITACIONES",
    "Tránsito y Transporte": "TRANSITO_VIAL",
    "Rentas y Tasas": "RENTAS",
    "Medio Ambiente": "SERVICIOS_PUBLICOS",
    "Catastro e Inmuebles": "CATASTRO",
    "Salud y Bromatología": "BROMATOLOGIA",
    "Desarrollo Social": "DESARROLLO_SOCIAL",
    "Cementerio": "ATENCION_VECINO",
    "Documentación Personal": "ATENCION_VECINO",
    "Espacio Público": "HABILITACIONES",
}


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print(f"=== SEED CHACABUCO (municipio_id={MUNICIPIO_ID}) ===\n")

        # =================================================================
        # PASO 0: Limpiar todo para Chacabuco
        # =================================================================
        print("PASO 0: Limpiando datos existentes...")

        # Obtener IDs de municipio_dependencias de Chacabuco
        result = await db.execute(
            select(MunicipioDependencia.id).where(MunicipioDependencia.municipio_id == MUNICIPIO_ID)
        )
        md_ids = [row[0] for row in result.fetchall()]

        if md_ids:
            # Eliminar trámites específicos
            await db.execute(
                delete(MunicipioDependenciaTramite).where(
                    MunicipioDependenciaTramite.municipio_dependencia_id.in_(md_ids)
                )
            )
            # Eliminar tipos de trámite
            await db.execute(
                delete(MunicipioDependenciaTipoTramite).where(
                    MunicipioDependenciaTipoTramite.municipio_dependencia_id.in_(md_ids)
                )
            )
            # Eliminar categorías
            await db.execute(
                delete(MunicipioDependenciaCategoria).where(
                    MunicipioDependenciaCategoria.municipio_dependencia_id.in_(md_ids)
                )
            )
            # Eliminar dependencias habilitadas
            await db.execute(
                delete(MunicipioDependencia).where(MunicipioDependencia.municipio_id == MUNICIPIO_ID)
            )

        await db.commit()
        print("   Datos anteriores eliminados.\n")

        # =================================================================
        # PASO 1: Habilitar todas las dependencias
        # =================================================================
        print("PASO 1: Habilitando dependencias...")

        result = await db.execute(
            select(Dependencia).where(Dependencia.activo == True).order_by(Dependencia.orden)
        )
        dependencias = result.scalars().all()

        dep_map = {}  # codigo -> {'md_id': municipio_dependencia_id, 'dep_id': dependencia_id}
        for dep in dependencias:
            md = MunicipioDependencia(
                municipio_id=MUNICIPIO_ID,
                dependencia_id=dep.id,
                activo=True,
                orden=dep.orden
            )
            db.add(md)
            await db.flush()
            dep_map[dep.codigo] = {'md_id': md.id, 'dep_id': dep.id}
            print(f"   + {dep.nombre} (id={md.id})")

        await db.commit()
        print(f"   Total: {len(dependencias)} dependencias habilitadas.\n")

        # =================================================================
        # PASO 2: Asignar categorías a dependencias
        # =================================================================
        print("PASO 2: Asignando categorías de reclamos...")

        result = await db.execute(select(Categoria).where(Categoria.activo == True))
        categorias = result.scalars().all()

        asignadas_cat = 0
        for cat in categorias:
            dep_codigo = CATEGORIAS_A_DEPENDENCIAS.get(cat.nombre)
            if not dep_codigo:
                # Buscar por coincidencia parcial
                for nombre, codigo in CATEGORIAS_A_DEPENDENCIAS.items():
                    if nombre.lower() in cat.nombre.lower() or cat.nombre.lower() in nombre.lower():
                        dep_codigo = codigo
                        break

            if dep_codigo and dep_codigo in dep_map:
                info = dep_map[dep_codigo]
                mdc = MunicipioDependenciaCategoria(
                    municipio_id=MUNICIPIO_ID,
                    dependencia_id=info['dep_id'],
                    municipio_dependencia_id=info['md_id'],
                    categoria_id=cat.id,
                    activo=True
                )
                db.add(mdc)
                asignadas_cat += 1
                print(f"   {cat.nombre} -> {dep_codigo}")
            else:
                # Fallback: Atención al Vecino
                if "ATENCION_VECINO" in dep_map:
                    info = dep_map["ATENCION_VECINO"]
                    mdc = MunicipioDependenciaCategoria(
                        municipio_id=MUNICIPIO_ID,
                        dependencia_id=info['dep_id'],
                        municipio_dependencia_id=info['md_id'],
                        categoria_id=cat.id,
                        activo=True
                    )
                    db.add(mdc)
                    asignadas_cat += 1
                    print(f"   {cat.nombre} -> ATENCION_VECINO (fallback)")

        await db.commit()
        print(f"   Total: {asignadas_cat} categorías asignadas.\n")

        # =================================================================
        # PASO 3: Asignar tipos de trámite a dependencias
        # =================================================================
        print("PASO 3: Asignando tipos de trámite...")

        result = await db.execute(select(TipoTramite).where(TipoTramite.activo == True))
        tipos = result.scalars().all()

        tipo_to_dep = {}  # tipo_tramite_id -> municipio_dependencia_id
        asignados_tipo = 0
        for tipo in tipos:
            dep_codigo = TIPOS_A_DEPENDENCIAS.get(tipo.nombre)
            if not dep_codigo:
                # Buscar por coincidencia parcial
                for nombre, codigo in TIPOS_A_DEPENDENCIAS.items():
                    if nombre.lower() in tipo.nombre.lower() or tipo.nombre.lower() in nombre.lower():
                        dep_codigo = codigo
                        break

            if dep_codigo and dep_codigo in dep_map:
                info = dep_map[dep_codigo]
                mdtt = MunicipioDependenciaTipoTramite(
                    municipio_id=MUNICIPIO_ID,
                    dependencia_id=info['dep_id'],
                    municipio_dependencia_id=info['md_id'],
                    tipo_tramite_id=tipo.id,
                    activo=True
                )
                db.add(mdtt)
                tipo_to_dep[tipo.id] = info['md_id']
                asignados_tipo += 1
                print(f"   {tipo.nombre} -> {dep_codigo}")
            else:
                # Fallback: Atención al Vecino
                if "ATENCION_VECINO" in dep_map:
                    info = dep_map["ATENCION_VECINO"]
                    mdtt = MunicipioDependenciaTipoTramite(
                        municipio_id=MUNICIPIO_ID,
                        dependencia_id=info['dep_id'],
                        municipio_dependencia_id=info['md_id'],
                        tipo_tramite_id=tipo.id,
                        activo=True
                    )
                    db.add(mdtt)
                    tipo_to_dep[tipo.id] = info['md_id']
                    asignados_tipo += 1
                    print(f"   {tipo.nombre} -> ATENCION_VECINO (fallback)")

        await db.commit()
        print(f"   Total: {asignados_tipo} tipos de trámite asignados.\n")

        # =================================================================
        # PASO 4: Asignar trámites específicos
        # =================================================================
        print("PASO 4: Asignando trámites específicos...")

        result = await db.execute(select(Tramite).where(Tramite.activo == True))
        tramites = result.scalars().all()

        asignados_tramite = 0
        for tramite in tramites:
            md_id = tipo_to_dep.get(tramite.tipo_tramite_id)
            if md_id:
                mdt = MunicipioDependenciaTramite(
                    municipio_dependencia_id=md_id,
                    tramite_id=tramite.id,
                    activo=True
                )
                db.add(mdt)
                asignados_tramite += 1

        await db.commit()
        print(f"   Total: {asignados_tramite} trámites específicos asignados.\n")

        # =================================================================
        # RESUMEN
        # =================================================================
        print("=" * 50)
        print("RESUMEN PARA CHACABUCO:")
        print(f"  - Dependencias habilitadas: {len(dependencias)}")
        print(f"  - Categorías asignadas: {asignadas_cat}")
        print(f"  - Tipos de trámite asignados: {asignados_tipo}")
        print(f"  - Trámites específicos asignados: {asignados_tramite}")
        print("=" * 50)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
