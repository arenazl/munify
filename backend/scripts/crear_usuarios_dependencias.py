"""
Script para crear usuarios para cada dependencia que tenga reclamos o trámites asignados.
Cada usuario podrá ver solo los reclamos/trámites de su dependencia.

Ejecutar: python -m scripts.crear_usuarios_dependencias
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from core.config import settings
from core.security import get_password_hash

MUNICIPIO_ID = 7  # Chacabuco
DEFAULT_PASSWORD = "demo1234"  # Contraseña por defecto para usuarios de prueba


def slugify(text: str) -> str:
    """Convierte texto a slug para email"""
    import unicodedata
    import re
    # Normalizar y quitar acentos
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('ASCII')
    # Convertir a minúsculas y reemplazar espacios
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '_', text)
    return text


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("CREANDO USUARIOS PARA DEPENDENCIAS")
        print("=" * 60)

        # Primero verificar si la columna existe, si no, crearla (MySQL)
        try:
            # Verificar si la columna existe
            result = await db.execute(text("""
                SELECT COUNT(*) as cnt FROM information_schema.columns
                WHERE table_schema = DATABASE()
                AND table_name = 'usuarios'
                AND column_name = 'municipio_dependencia_id'
            """))
            column_exists = result.scalar() > 0

            if not column_exists:
                await db.execute(text("""
                    ALTER TABLE usuarios
                    ADD COLUMN municipio_dependencia_id INT NULL
                """))
                await db.execute(text("""
                    ALTER TABLE usuarios
                    ADD CONSTRAINT fk_usuarios_municipio_dependencia
                    FOREIGN KEY (municipio_dependencia_id) REFERENCES municipio_dependencias(id)
                """))
                await db.execute(text("""
                    CREATE INDEX ix_usuarios_municipio_dependencia_id ON usuarios(municipio_dependencia_id)
                """))
                await db.commit()
                print("[OK] Columna municipio_dependencia_id creada")
            else:
                print("[OK] Columna municipio_dependencia_id ya existe")
        except Exception as e:
            print(f"[WARN] Error en migración: {e}")
            await db.rollback()

        # Obtener dependencias con reclamos asignados
        result = await db.execute(text("""
            SELECT DISTINCT
                md.id as municipio_dependencia_id,
                d.nombre as dependencia_nombre,
                d.icono,
                d.color,
                COUNT(DISTINCT r.id) as total_reclamos
            FROM municipio_dependencias md
            JOIN dependencias d ON d.id = md.dependencia_id
            LEFT JOIN reclamos r ON r.municipio_dependencia_id = md.id
            WHERE md.municipio_id = :municipio_id
            AND md.activo = true
            GROUP BY md.id, d.nombre, d.icono, d.color
            HAVING COUNT(DISTINCT r.id) > 0 OR d.nombre IS NOT NULL
            ORDER BY d.nombre
        """), {"municipio_id": MUNICIPIO_ID})

        dependencias = result.fetchall()
        print(f"\n[INFO] Dependencias encontradas: {len(dependencias)}")

        # Hash de la contraseña por defecto
        password_hash = get_password_hash(DEFAULT_PASSWORD)

        usuarios_creados = 0
        usuarios_existentes = 0

        for dep in dependencias:
            md_id = dep.municipio_dependencia_id
            nombre_dep = dep.dependencia_nombre
            total_reclamos = dep.total_reclamos or 0

            # Generar email basado en nombre de dependencia
            email_slug = slugify(nombre_dep)
            email = f"{email_slug}@chacabuco.demo.com"

            # Verificar si ya existe el usuario
            result = await db.execute(text("""
                SELECT id FROM usuarios WHERE email = :email
            """), {"email": email})

            if result.scalar_one_or_none():
                print(f"   [EXISTS] {nombre_dep} -> {email}")
                usuarios_existentes += 1

                # Actualizar municipio_dependencia_id si no está asignado
                await db.execute(text("""
                    UPDATE usuarios
                    SET municipio_dependencia_id = :md_id
                    WHERE email = :email AND municipio_dependencia_id IS NULL
                """), {"email": email, "md_id": md_id})
                continue

            # Crear nuevo usuario para esta dependencia
            await db.execute(text("""
                INSERT INTO usuarios (
                    municipio_id,
                    municipio_dependencia_id,
                    email,
                    password_hash,
                    nombre,
                    apellido,
                    rol,
                    activo,
                    created_at
                ) VALUES (
                    :municipio_id,
                    :md_id,
                    :email,
                    :password_hash,
                    :nombre,
                    'Área',
                    'empleado',
                    true,
                    NOW()
                )
            """), {
                "municipio_id": MUNICIPIO_ID,
                "md_id": md_id,
                "email": email,
                "password_hash": password_hash,
                "nombre": nombre_dep
            })

            print(f"   [NEW] {nombre_dep} -> {email} ({total_reclamos} reclamos)")
            usuarios_creados += 1

        await db.commit()

        print(f"\n" + "=" * 60)
        print("RESUMEN")
        print("=" * 60)
        print(f"  Usuarios creados: {usuarios_creados}")
        print(f"  Usuarios existentes: {usuarios_existentes}")
        print(f"  Contraseña por defecto: {DEFAULT_PASSWORD}")

        # Listar todos los usuarios de dependencia
        print(f"\n" + "=" * 60)
        print("USUARIOS DE DEPENDENCIAS")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT
                u.email,
                u.nombre,
                d.nombre as dependencia,
                COUNT(r.id) as reclamos_asignados
            FROM usuarios u
            JOIN municipio_dependencias md ON md.id = u.municipio_dependencia_id
            JOIN dependencias d ON d.id = md.dependencia_id
            LEFT JOIN reclamos r ON r.municipio_dependencia_id = md.id
            WHERE u.municipio_id = :municipio_id
            GROUP BY u.email, u.nombre, d.nombre
            ORDER BY d.nombre
        """), {"municipio_id": MUNICIPIO_ID})

        for row in result.fetchall():
            print(f"  {row.email}")
            print(f"    -> {row.dependencia} ({row.reclamos_asignados} reclamos)")

    await engine.dispose()
    print(f"\n[DONE] Proceso completado")


if __name__ == "__main__":
    asyncio.run(main())
