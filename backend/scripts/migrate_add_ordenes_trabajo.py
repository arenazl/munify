"""Migración: tablas `ordenes_trabajo` + `orden_trabajo_reclamos` (Bloque B.1).

100% ADITIVA: tablas nuevas, cero cambios sobre tablas existentes.
No toca nada de tesorería (SPN productivo intacto).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402


DDL_OT = """
CREATE TABLE IF NOT EXISTS ordenes_trabajo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    numero VARCHAR(20) NOT NULL,
    estado ENUM('pendiente','asignada','en_curso','completada','cancelada')
        NOT NULL DEFAULT 'pendiente',
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NULL,
    cuadrilla_id INT NULL,
    empleado_id INT NULL,
    fecha_programada DATE NULL,
    hora_inicio TIME NULL,
    hora_fin TIME NULL,
    materiales JSON NULL,
    horas_estimadas FLOAT NULL,
    horas_reales FLOAT NULL,
    notas_cierre TEXT NULL,
    motivo_cancelacion TEXT NULL,
    fecha_inicio_real DATETIME NULL,
    fecha_completada DATETIME NULL,
    creador_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ot_municipio_numero (municipio_id, numero),
    KEY ix_ot_municipio (municipio_id),
    KEY ix_ot_estado (estado),
    KEY ix_ot_cuadrilla (cuadrilla_id),
    KEY ix_ot_empleado (empleado_id),
    CONSTRAINT fk_ot_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id),
    CONSTRAINT fk_ot_cuadrilla FOREIGN KEY (cuadrilla_id) REFERENCES cuadrillas(id) ON DELETE SET NULL,
    CONSTRAINT fk_ot_empleado FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE SET NULL,
    CONSTRAINT fk_ot_creador FOREIGN KEY (creador_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_PIVOT = """
CREATE TABLE IF NOT EXISTS orden_trabajo_reclamos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_trabajo_id INT NOT NULL,
    reclamo_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ot_reclamo (orden_trabajo_id, reclamo_id),
    KEY ix_otr_ot (orden_trabajo_id),
    KEY ix_otr_reclamo (reclamo_id),
    CONSTRAINT fk_otr_ot FOREIGN KEY (orden_trabajo_id) REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    CONSTRAINT fk_otr_reclamo FOREIGN KEY (reclamo_id) REFERENCES reclamos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text(DDL_OT))
        print("OK: tabla ordenes_trabajo")
        await conn.execute(text(DDL_PIVOT))
        print("OK: tabla orden_trabajo_reclamos")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
