"""
Script para auditar inconsistencias de datos entre municipios.
Revisa usuarios, reclamos y otros datos que pueden estar en municipios incorrectos.
"""
import asyncio
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func, text
from core.config import settings
from models.municipio import Municipio
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.empleado import Empleado
from models.reclamo import Reclamo


async def main():
    print("=" * 70)
    print("  AUDITORIA DE DATOS POR MUNICIPIO")
    print("=" * 70)

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Listar todos los municipios
        print("\n[1] MUNICIPIOS REGISTRADOS")
        print("-" * 50)
        result = await session.execute(select(Municipio))
        municipios = result.scalars().all()

        for m in municipios:
            print(f"  ID {m.id}: {m.nombre}")

        print(f"\nTotal: {len(municipios)} municipios")

        # 2. Estadísticas por municipio
        print("\n\n[2] ESTADISTICAS POR MUNICIPIO")
        print("-" * 70)
        print(f"{'Municipio':<25} {'Usuarios':<10} {'Reclamos':<10} {'Empleados':<10} {'Zonas':<8} {'Categorias':<10}")
        print("-" * 70)

        for m in municipios:
            # Contar usuarios
            result = await session.execute(
                select(func.count(User.id)).where(User.municipio_id == m.id)
            )
            usuarios = result.scalar()

            # Contar reclamos
            result = await session.execute(
                select(func.count(Reclamo.id)).where(Reclamo.municipio_id == m.id)
            )
            reclamos = result.scalar()

            # Contar empleados
            result = await session.execute(
                select(func.count(Empleado.id)).where(Empleado.municipio_id == m.id)
            )
            empleados = result.scalar()

            # Contar zonas
            result = await session.execute(
                select(func.count(Zona.id)).where(Zona.municipio_id == m.id)
            )
            zonas = result.scalar()

            # Contar categorias
            result = await session.execute(
                select(func.count(Categoria.id)).where(Categoria.municipio_id == m.id)
            )
            categorias = result.scalar()

            print(f"{m.nombre:<25} {usuarios:<10} {reclamos:<10} {empleados:<10} {zonas:<8} {categorias:<10}")

        print("-" * 70)

        # 3. Buscar reclamos con direcciones de otros municipios
        print("\n\n[3] RECLAMOS CON POSIBLES DIRECCIONES INCORRECTAS")
        print("-" * 70)

        # Palabras clave de municipios
        municipio_keywords = {}
        for m in municipios:
            # Extraer nombre clave del municipio
            nombre = m.nombre.lower().replace("municipalidad de ", "").replace("municipio de ", "")
            municipio_keywords[m.id] = nombre

        problemas_encontrados = []

        for m in municipios:
            # Obtener reclamos de este municipio
            result = await session.execute(
                select(Reclamo).where(Reclamo.municipio_id == m.id)
            )
            reclamos = result.scalars().all()

            nombre_municipio = municipio_keywords[m.id]

            for r in reclamos:
                direccion_lower = (r.direccion or "").lower()

                # Buscar menciones de OTROS municipios en la dirección
                for otro_id, otro_nombre in municipio_keywords.items():
                    if otro_id != m.id and len(otro_nombre) > 3:  # Evitar falsos positivos con nombres cortos
                        if otro_nombre in direccion_lower:
                            problemas_encontrados.append({
                                'reclamo_id': r.id,
                                'municipio_actual': m.nombre,
                                'municipio_id': m.id,
                                'direccion': r.direccion,
                                'municipio_detectado': otro_nombre,
                                'titulo': r.titulo
                            })

        if problemas_encontrados:
            print(f"Se encontraron {len(problemas_encontrados)} reclamos con posibles problemas:\n")
            for p in problemas_encontrados[:20]:  # Mostrar solo los primeros 20
                print(f"  Reclamo #{p['reclamo_id']}: {p['titulo'][:40]}...")
                print(f"    Municipio: {p['municipio_actual']} (ID: {p['municipio_id']})")
                print(f"    Direccion: {p['direccion']}")
                print(f"    Detectado: Menciona '{p['municipio_detectado']}' en la dirección")
                print()

            if len(problemas_encontrados) > 20:
                print(f"  ... y {len(problemas_encontrados) - 20} más")
        else:
            print("  No se encontraron problemas obvios de direcciones incorrectas.")

        # 4. Usuarios con email que sugiere otro municipio
        print("\n\n[4] USUARIOS CON POSIBLES MUNICIPIOS INCORRECTOS")
        print("-" * 70)

        usuarios_problema = []
        for m in municipios:
            result = await session.execute(
                select(User).where(User.municipio_id == m.id)
            )
            users = result.scalars().all()

            nombre_municipio = municipio_keywords[m.id]

            for u in users:
                email_lower = (u.email or "").lower()
                nombre_lower = (u.nombre or "").lower()
                apellido_lower = (u.apellido or "").lower()

                # Buscar si el email/nombre menciona otro municipio
                for otro_id, otro_nombre in municipio_keywords.items():
                    if otro_id != m.id and len(otro_nombre) > 3:
                        if otro_nombre in email_lower:
                            usuarios_problema.append({
                                'user_id': u.id,
                                'nombre': f"{u.nombre} {u.apellido}",
                                'email': u.email,
                                'municipio_actual': m.nombre,
                                'municipio_detectado': otro_nombre
                            })

        if usuarios_problema:
            print(f"Se encontraron {len(usuarios_problema)} usuarios con posibles problemas:\n")
            for p in usuarios_problema[:10]:
                print(f"  Usuario #{p['user_id']}: {p['nombre']}")
                print(f"    Email: {p['email']}")
                print(f"    Municipio actual: {p['municipio_actual']}")
                print(f"    Detectado: '{p['municipio_detectado']}' en email")
                print()
        else:
            print("  No se encontraron problemas obvios de usuarios en municipios incorrectos.")

        # 5. Reclamos huérfanos (sin creador válido)
        print("\n\n[5] VERIFICANDO INTEGRIDAD DE REFERENCIAS")
        print("-" * 70)

        # Reclamos sin creador
        result = await session.execute(text("""
            SELECT r.id, r.titulo, r.municipio_id
            FROM reclamos r
            LEFT JOIN usuarios u ON r.creador_id = u.id
            WHERE u.id IS NULL
        """))
        huerfanos = result.fetchall()

        if huerfanos:
            print(f"  Reclamos sin creador válido: {len(huerfanos)}")
            for h in huerfanos[:5]:
                print(f"    - Reclamo #{h[0]}: {h[1][:40]}...")
        else:
            print("  Todos los reclamos tienen creador válido.")

        # Reclamos con categoría de otro municipio
        result = await session.execute(text("""
            SELECT r.id, r.titulo, r.municipio_id, c.municipio_id as cat_municipio
            FROM reclamos r
            JOIN categorias c ON r.categoria_id = c.id
            WHERE r.municipio_id != c.municipio_id
        """))
        cat_incorrecta = result.fetchall()

        if cat_incorrecta:
            print(f"\n  Reclamos con categoría de otro municipio: {len(cat_incorrecta)}")
            for c in cat_incorrecta[:5]:
                print(f"    - Reclamo #{c[0]} (mun:{c[2]}) usa categoría de mun:{c[3]}")
        else:
            print("  Todas las categorías coinciden con su municipio.")

        # 6. Resumen
        print("\n\n" + "=" * 70)
        print("  RESUMEN DE AUDITORIA")
        print("=" * 70)
        print(f"  Municipios: {len(municipios)}")
        print(f"  Reclamos con direccion sospechosa: {len(problemas_encontrados)}")
        print(f"  Usuarios con email sospechoso: {len(usuarios_problema)}")
        print(f"  Reclamos huerfanos: {len(huerfanos)}")
        print(f"  Reclamos con categoria incorrecta: {len(cat_incorrecta)}")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
