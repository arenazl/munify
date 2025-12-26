"""
Script para sincronizar la base de datos con los modelos actuales.
Ejecutar una sola vez para agregar columnas/tablas faltantes.
"""
import asyncio
import sys
import os

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import engine, Base

# Importar todos los modelos para que se registren
import models  # noqa

async def sync_database():
    """Sincroniza la base de datos agregando tablas/columnas faltantes"""

    async with engine.begin() as conn:
        print("Sincronizando base de datos...")

        # 1. Crear todas las tablas que faltan (no modifica existentes)
        await conn.run_sync(Base.metadata.create_all)
        print("[OK] Tablas creadas/verificadas")

        # 2. Agregar columnas faltantes a tablas existentes
        # MySQL específico - agregar columna si no existe

        alterations = [
            # SLA Config - agregar municipio_id si no existe
            """
            ALTER TABLE sla_config
            ADD COLUMN IF NOT EXISTS municipio_id INT NOT NULL DEFAULT 1,
            ADD CONSTRAINT fk_sla_config_municipio
                FOREIGN KEY (municipio_id) REFERENCES municipios(id)
            """,

            # Gamificación - puntos_usuarios
            """
            CREATE TABLE IF NOT EXISTS puntos_usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                municipio_id INT NOT NULL,
                puntos_totales INT DEFAULT 0,
                puntos_mes_actual INT DEFAULT 0,
                reclamos_totales INT DEFAULT 0,
                reclamos_resueltos INT DEFAULT 0,
                reclamos_con_foto INT DEFAULT 0,
                reclamos_con_ubicacion INT DEFAULT 0,
                calificaciones_dadas INT DEFAULT 0,
                semanas_consecutivas INT DEFAULT 0,
                ultima_actividad DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES usuarios(id),
                FOREIGN KEY (municipio_id) REFERENCES municipios(id),
                UNIQUE KEY unique_user_municipio (user_id, municipio_id)
            )
            """,

            # Historial de puntos
            """
            CREATE TABLE IF NOT EXISTS historial_puntos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                municipio_id INT NOT NULL,
                tipo_accion VARCHAR(50) NOT NULL,
                puntos INT NOT NULL,
                descripcion TEXT,
                reclamo_id INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id),
                FOREIGN KEY (municipio_id) REFERENCES municipios(id),
                FOREIGN KEY (reclamo_id) REFERENCES reclamos(id)
            )
            """,

            # Badges de usuario
            """
            CREATE TABLE IF NOT EXISTS badges_usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                municipio_id INT NOT NULL,
                tipo_badge VARCHAR(50) NOT NULL,
                obtenido_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id),
                FOREIGN KEY (municipio_id) REFERENCES municipios(id),
                UNIQUE KEY unique_user_badge (user_id, municipio_id, tipo_badge)
            )
            """,

            # Leaderboard mensual
            """
            CREATE TABLE IF NOT EXISTS leaderboard_mensual (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL,
                anio INT NOT NULL,
                mes INT NOT NULL,
                user_id INT NOT NULL,
                posicion INT NOT NULL,
                puntos INT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id),
                FOREIGN KEY (municipio_id) REFERENCES municipios(id)
            )
            """,

            # Recompensas disponibles
            """
            CREATE TABLE IF NOT EXISTS recompensas_disponibles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL,
                nombre VARCHAR(200) NOT NULL,
                descripcion TEXT,
                icono VARCHAR(50),
                puntos_requeridos INT NOT NULL,
                stock INT,
                fecha_inicio DATETIME,
                fecha_fin DATETIME,
                activo BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (municipio_id) REFERENCES municipios(id)
            )
            """,

            # Recompensas canjeadas
            """
            CREATE TABLE IF NOT EXISTS recompensas_canjeadas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                recompensa_id INT NOT NULL,
                municipio_id INT NOT NULL,
                puntos_gastados INT NOT NULL,
                codigo_canje VARCHAR(50),
                estado VARCHAR(20) DEFAULT 'pendiente',
                canjeado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                entregado_en DATETIME,
                FOREIGN KEY (user_id) REFERENCES usuarios(id),
                FOREIGN KEY (recompensa_id) REFERENCES recompensas_disponibles(id),
                FOREIGN KEY (municipio_id) REFERENCES municipios(id)
            )
            """,

            # Fix empleado_id foreign key in reclamos (was pointing to cuadrillas)
            # Step 1: Drop the old incorrect constraint if exists
            """
            ALTER TABLE reclamos DROP FOREIGN KEY IF EXISTS reclamos_ibfk_5
            """,

            # Step 2: Clear invalid empleado_id values that don't exist in empleados table
            """
            UPDATE reclamos r
            SET r.empleado_id = NULL
            WHERE r.empleado_id IS NOT NULL
              AND r.empleado_id NOT IN (SELECT id FROM empleados)
            """,

            # Step 3: Add the correct foreign key constraint
            """
            ALTER TABLE reclamos
            ADD CONSTRAINT fk_reclamos_empleado
            FOREIGN KEY (empleado_id) REFERENCES empleados(id)
            """,

            # WhatsApp configs
            """
            CREATE TABLE IF NOT EXISTS whatsapp_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL UNIQUE,
                habilitado BOOLEAN DEFAULT FALSE,
                provider ENUM('meta', 'twilio') DEFAULT 'meta',
                meta_phone_number_id VARCHAR(100),
                meta_access_token VARCHAR(500),
                meta_business_account_id VARCHAR(100),
                meta_webhook_verify_token VARCHAR(100),
                twilio_account_sid VARCHAR(100),
                twilio_auth_token VARCHAR(100),
                twilio_phone_number VARCHAR(20),
                notificar_reclamo_recibido BOOLEAN DEFAULT TRUE,
                notificar_reclamo_asignado BOOLEAN DEFAULT TRUE,
                notificar_cambio_estado BOOLEAN DEFAULT TRUE,
                notificar_reclamo_resuelto BOOLEAN DEFAULT TRUE,
                notificar_comentarios BOOLEAN DEFAULT FALSE,
                template_reclamo_recibido VARCHAR(100),
                template_reclamo_asignado VARCHAR(100),
                template_cambio_estado VARCHAR(100),
                template_reclamo_resuelto VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                FOREIGN KEY (municipio_id) REFERENCES municipios(id)
            )
            """,

            # WhatsApp logs
            """
            CREATE TABLE IF NOT EXISTS whatsapp_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                config_id INT NOT NULL,
                telefono VARCHAR(20) NOT NULL,
                usuario_id INT,
                tipo_mensaje VARCHAR(50) NOT NULL,
                mensaje TEXT,
                template_usado VARCHAR(100),
                reclamo_id INT,
                enviado BOOLEAN DEFAULT FALSE,
                message_id VARCHAR(100),
                error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (config_id) REFERENCES whatsapp_configs(id),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
                FOREIGN KEY (reclamo_id) REFERENCES reclamos(id)
            )
            """,

            # Tramites - agregar empleado_id y prioridad si no existen
            """
            ALTER TABLE tramites
            ADD COLUMN IF NOT EXISTS empleado_id INT NULL,
            ADD COLUMN IF NOT EXISTS prioridad INT DEFAULT 3
            """,

            # FK para tramites.empleado_id
            """
            ALTER TABLE tramites
            ADD CONSTRAINT fk_tramites_empleado
            FOREIGN KEY (empleado_id) REFERENCES empleados(id)
            """
        ]

        for sql in alterations:
            try:
                await conn.execute(text(sql))
                print(f"[OK] Ejecutado: {sql[:50]}...")
            except Exception as e:
                # Ignorar errores de "ya existe"
                error_msg = str(e).lower()
                if "duplicate" in error_msg or "already exists" in error_msg or "1060" in error_msg:
                    print(f"[SKIP] Ya existe: {sql[:50]}...")
                else:
                    print(f"[WARN] Error (puede ser ignorable): {e}")

        print("\n[OK] Sincronizacion completada")

if __name__ == "__main__":
    asyncio.run(sync_database())
