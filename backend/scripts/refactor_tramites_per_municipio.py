"""
Migración estructural: refactor radical de Trámites y Categorías.

Cambios:
- Elimina catálogo global de categorías y trámites.
- Elimina TipoTramite (nivel intermedio).
- Crea categorias_reclamo y categorias_tramite per-municipio.
- Crea tramites per-municipio con categoria_tramite_id.
- Crea tramite_documentos_requeridos (sub-tabla del trámite).
- Agrega campos de verificación a documentos_solicitudes.
- Wipe de trámites/solicitudes/historial (Chacabuco).
- Preserva reclamos re-mapeando categoria_id a la nueva tabla per-municipio.
- Seedea las 20 categorías default para cada municipio existente.

Ejecutar:
    cd backend && python -m scripts.refactor_tramites_per_municipio
"""
import asyncio
import sys
from pathlib import Path

# Permitir ejecución como script suelto
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings
from services.categorias_seed import (
    CATEGORIAS_RECLAMO_DEFAULT,
    CATEGORIAS_TRAMITE_DEFAULT,
)


async def run() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        # ------------------------------------------------------------------
        # 0. Desactivar checks de FK temporalmente (MySQL)
        # ------------------------------------------------------------------
        await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

        print("[1/9] Wipe de datos de trámites/solicitudes...")
        for sql in [
            "DELETE FROM documentos_solicitudes",
            "DELETE FROM historial_solicitudes",
            "DELETE FROM solicitudes",
        ]:
            try:
                await conn.execute(text(sql))
            except Exception as e:
                print(f"  ! warning: {sql} -> {e}")

        # ------------------------------------------------------------------
        # 1. Crear tablas nuevas (categorias_reclamo / categorias_tramite)
        # ------------------------------------------------------------------
        print("[2/9] Creando tablas categorias_reclamo y categorias_tramite...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS categorias_reclamo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                descripcion TEXT,
                icono VARCHAR(50),
                color VARCHAR(20),
                tiempo_resolucion_estimado INT DEFAULT 48,
                prioridad_default INT DEFAULT 3,
                activo TINYINT(1) DEFAULT 1,
                orden INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_cat_reclamo_muni_nombre (municipio_id, nombre),
                INDEX idx_cat_reclamo_muni (municipio_id),
                CONSTRAINT fk_cat_reclamo_muni FOREIGN KEY (municipio_id)
                    REFERENCES municipios(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS categorias_tramite (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                descripcion TEXT,
                icono VARCHAR(50),
                color VARCHAR(20),
                activo TINYINT(1) DEFAULT 1,
                orden INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_cat_tramite_muni_nombre (municipio_id, nombre),
                INDEX idx_cat_tramite_muni (municipio_id),
                CONSTRAINT fk_cat_tramite_muni FOREIGN KEY (municipio_id)
                    REFERENCES municipios(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

        # ------------------------------------------------------------------
        # 2. Re-mapear reclamos: copiar categorías viejas -> categorias_reclamo
        # ------------------------------------------------------------------
        print("[3/9] Re-mapeando reclamos.categoria_id a categorias_reclamo...")
        # Solo si la tabla vieja existe
        check_categorias = await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = 'categorias'"
        ))
        tiene_categorias_viejas = check_categorias.scalar() > 0

        if tiene_categorias_viejas:
            # Para cada (municipio_id, categoria) usada por algún reclamo,
            # crear una fila en categorias_reclamo (idempotente con INSERT IGNORE)
            await conn.execute(text("""
                INSERT IGNORE INTO categorias_reclamo
                    (municipio_id, nombre, descripcion, icono, color,
                     tiempo_resolucion_estimado, prioridad_default, activo, orden)
                SELECT DISTINCT
                    r.municipio_id,
                    c.nombre,
                    c.descripcion,
                    c.icono,
                    c.color,
                    COALESCE(c.tiempo_resolucion_estimado, 48),
                    COALESCE(c.prioridad_default, 3),
                    1,
                    COALESCE(c.orden, 0)
                FROM reclamos r
                INNER JOIN categorias c ON c.id = r.categoria_id
                WHERE r.municipio_id IS NOT NULL
            """))

            # Actualizar el FK de reclamos al nuevo id
            await conn.execute(text("""
                UPDATE reclamos r
                INNER JOIN categorias c_old ON c_old.id = r.categoria_id
                INNER JOIN categorias_reclamo c_new
                    ON c_new.municipio_id = r.municipio_id
                    AND c_new.nombre = c_old.nombre
                SET r.categoria_id = c_new.id
            """))

            # Actualizar municipio_dependencia_categorias también
            await conn.execute(text("""
                UPDATE municipio_dependencia_categorias mdc
                INNER JOIN categorias c_old ON c_old.id = mdc.categoria_id
                INNER JOIN categorias_reclamo c_new
                    ON c_new.municipio_id = mdc.municipio_id
                    AND c_new.nombre = c_old.nombre
                SET mdc.categoria_id = c_new.id
            """))

        # ------------------------------------------------------------------
        # 3. Drop tablas viejas relacionadas con catálogo global
        # ------------------------------------------------------------------
        print("[4/9] Dropping tablas viejas (catálogo global + intermedias)...")
        for tabla in [
            "municipio_dependencia_tipos_tramites",
            "municipio_dependencia_tramites",  # se recreará con FK nueva
            "municipio_tramites",
            "municipio_tipos_tramites",
            "municipio_categorias",
            "direccion_tipo_tramites",  # subsistema direcciones legacy
            "tramite_docs",  # checklist visual viejo
            "tramites",
            "tipos_tramites",
            "categorias",
        ]:
            try:
                await conn.execute(text(f"DROP TABLE IF EXISTS {tabla}"))
                print(f"  OK dropped {tabla}")
            except Exception as e:
                print(f"  ! warning dropping {tabla}: {e}")

        # ------------------------------------------------------------------
        # 4. Recrear `tramites` con nueva estructura
        # ------------------------------------------------------------------
        print("[5/9] Creando nueva tabla tramites...")
        await conn.execute(text("DROP TABLE IF EXISTS tramite_documentos_requeridos"))
        await conn.execute(text("DROP TABLE IF EXISTS municipio_dependencia_tramites"))
        await conn.execute(text("DROP TABLE IF EXISTS tramites"))
        await conn.execute(text("""
            CREATE TABLE tramites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL,
                categoria_tramite_id INT NOT NULL,
                nombre VARCHAR(200) NOT NULL,
                descripcion TEXT,
                icono VARCHAR(50),
                requiere_validacion_dni TINYINT(1) DEFAULT 0,
                requiere_validacion_facial TINYINT(1) DEFAULT 0,
                tiempo_estimado_dias INT DEFAULT 15,
                costo FLOAT,
                url_externa VARCHAR(500),
                activo TINYINT(1) DEFAULT 1,
                orden INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_tramites_muni (municipio_id),
                INDEX idx_tramites_cat (categoria_tramite_id),
                CONSTRAINT fk_tramites_muni FOREIGN KEY (municipio_id)
                    REFERENCES municipios(id) ON DELETE CASCADE,
                CONSTRAINT fk_tramites_cat FOREIGN KEY (categoria_tramite_id)
                    REFERENCES categorias_tramite(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

        # ------------------------------------------------------------------
        # 5. Crear tabla tramite_documentos_requeridos
        # ------------------------------------------------------------------
        print("[6/9] Creando tabla tramite_documentos_requeridos...")
        await conn.execute(text("""
            CREATE TABLE tramite_documentos_requeridos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tramite_id INT NOT NULL,
                nombre VARCHAR(200) NOT NULL,
                descripcion TEXT,
                obligatorio TINYINT(1) DEFAULT 1 NOT NULL,
                orden INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_doc_req_tramite (tramite_id),
                CONSTRAINT fk_doc_req_tramite FOREIGN KEY (tramite_id)
                    REFERENCES tramites(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

        # ------------------------------------------------------------------
        # 6. Recrear municipio_dependencia_tramites con FK al nuevo tramites
        # ------------------------------------------------------------------
        print("[7/9] Re-creando municipio_dependencia_tramites...")
        await conn.execute(text("""
            CREATE TABLE municipio_dependencia_tramites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_dependencia_id INT NOT NULL,
                tramite_id INT NOT NULL,
                activo TINYINT(1) DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_muni_dep_tramite (municipio_dependencia_id, tramite_id),
                INDEX idx_muni_dep_tramite_md (municipio_dependencia_id),
                INDEX idx_muni_dep_tramite_t (tramite_id),
                CONSTRAINT fk_mdt_md FOREIGN KEY (municipio_dependencia_id)
                    REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
                CONSTRAINT fk_mdt_t FOREIGN KEY (tramite_id)
                    REFERENCES tramites(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

        # ------------------------------------------------------------------
        # 7. Agregar campos de verificación a documentos_solicitudes
        # ------------------------------------------------------------------
        print("[8/9] Agregando campos de verificación a documentos_solicitudes...")
        for ddl in [
            "ALTER TABLE documentos_solicitudes "
            "ADD COLUMN verificado TINYINT(1) NOT NULL DEFAULT 0",
            "ALTER TABLE documentos_solicitudes "
            "ADD COLUMN verificado_por_id INT NULL",
            "ALTER TABLE documentos_solicitudes "
            "ADD COLUMN fecha_verificacion DATETIME NULL",
            "ALTER TABLE documentos_solicitudes "
            "ADD COLUMN tramite_documento_requerido_id INT NULL",
            "ALTER TABLE documentos_solicitudes "
            "ADD CONSTRAINT fk_docsol_verif_user "
            "FOREIGN KEY (verificado_por_id) REFERENCES usuarios(id)",
            "ALTER TABLE documentos_solicitudes "
            "ADD CONSTRAINT fk_docsol_doc_req "
            "FOREIGN KEY (tramite_documento_requerido_id) "
            "REFERENCES tramite_documentos_requeridos(id) ON DELETE SET NULL",
            "CREATE INDEX idx_docsol_doc_req "
            "ON documentos_solicitudes(tramite_documento_requerido_id)",
        ]:
            try:
                await conn.execute(text(ddl))
            except Exception as e:
                msg = str(e).lower()
                if "duplicate" in msg or "exists" in msg:
                    print(f"  ~ skip (ya existe): {ddl[:60]}...")
                else:
                    print(f"  ! error: {e}")

        # ------------------------------------------------------------------
        # 8. Seed inicial: 20 categorías por cada municipio existente
        # ------------------------------------------------------------------
        print("[9/9] Sembrando categorías default por municipio existente...")
        result = await conn.execute(text("SELECT id, nombre FROM municipios"))
        municipios = result.fetchall()

        for muni_id, muni_nombre in municipios:
            print(f"  -> municipio #{muni_id} ({muni_nombre})")
            for c in CATEGORIAS_RECLAMO_DEFAULT:
                await conn.execute(
                    text("""
                        INSERT IGNORE INTO categorias_reclamo
                            (municipio_id, nombre, icono, color, orden, activo)
                        VALUES (:muni_id, :nombre, :icono, :color, :orden, 1)
                    """),
                    {"muni_id": muni_id, **c},
                )
            for c in CATEGORIAS_TRAMITE_DEFAULT:
                await conn.execute(
                    text("""
                        INSERT IGNORE INTO categorias_tramite
                            (municipio_id, nombre, icono, color, orden, activo)
                        VALUES (:muni_id, :nombre, :icono, :color, :orden, 1)
                    """),
                    {"muni_id": muni_id, **c},
                )

        # Re-crear FK de reclamos.categoria_id apuntando a categorias_reclamo
        try:
            # Drop FK vieja si existe (puede tener cualquier nombre)
            fks = await conn.execute(text("""
                SELECT CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'reclamos'
                  AND COLUMN_NAME = 'categoria_id'
                  AND REFERENCED_TABLE_NAME IS NOT NULL
            """))
            for (fk_name,) in fks.fetchall():
                await conn.execute(text(f"ALTER TABLE reclamos DROP FOREIGN KEY {fk_name}"))
                print(f"  OK dropped FK {fk_name} en reclamos")

            await conn.execute(text("""
                ALTER TABLE reclamos
                ADD CONSTRAINT fk_reclamos_cat_reclamo
                FOREIGN KEY (categoria_id) REFERENCES categorias_reclamo(id)
            """))
            print("  OK FK reclamos.categoria_id -> categorias_reclamo creada")
        except Exception as e:
            print(f"  ! warning creando FK reclamos: {e}")

        # Re-crear FK de municipio_dependencia_categorias
        try:
            fks = await conn.execute(text("""
                SELECT CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'municipio_dependencia_categorias'
                  AND COLUMN_NAME = 'categoria_id'
                  AND REFERENCED_TABLE_NAME IS NOT NULL
            """))
            for (fk_name,) in fks.fetchall():
                await conn.execute(text(
                    f"ALTER TABLE municipio_dependencia_categorias DROP FOREIGN KEY {fk_name}"
                ))
            await conn.execute(text("""
                ALTER TABLE municipio_dependencia_categorias
                ADD CONSTRAINT fk_mdc_cat_reclamo
                FOREIGN KEY (categoria_id) REFERENCES categorias_reclamo(id)
            """))
            print("  OK FK municipio_dependencia_categorias.categoria_id -> categorias_reclamo")
        except Exception as e:
            print(f"  ! warning creando FK MDC: {e}")

        await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

    await engine.dispose()
    print("\n[OK] Migracion completada.")


if __name__ == "__main__":
    asyncio.run(run())
