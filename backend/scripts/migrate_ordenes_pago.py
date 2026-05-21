"""Migracion: crea tabla ordenes_pago.

Documenta la AUTORIZACION formal de un pago antes de ejecutarlo.
Workflow: pendiente -> autorizada -> pagada (o anulada).

Numero correlativo por muni + año, formato OP-2026-0001.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

SQL = """
CREATE TABLE IF NOT EXISTS ordenes_pago (
    id INT NOT NULL AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    numero VARCHAR(20) NOT NULL,

    destino_tipo VARCHAR(20) NOT NULL,
    destino_contacto_id INT NULL,
    destino_dependencia_id INT NULL,

    concepto VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    monto_pesos DECIMAL(15,2) NOT NULL,

    caja_id INT NULL,

    estado ENUM('pendiente','autorizada','pagada','anulada') NOT NULL DEFAULT 'pendiente',

    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NULL,
    fecha_autorizacion DATETIME(6) NULL,
    fecha_pago DATETIME(6) NULL,
    fecha_anulacion DATETIME(6) NULL,

    creador_id INT NOT NULL,
    autorizado_por_id INT NULL,
    anulado_por_id INT NULL,

    gasto_id INT NULL,
    motivo_anulacion TEXT NULL,
    notas TEXT NULL,

    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    UNIQUE KEY uq_op_muni_numero (municipio_id, numero),
    INDEX ix_op_muni (municipio_id),
    INDEX ix_op_estado (estado),
    INDEX ix_op_fecha_emision (fecha_emision),
    INDEX ix_op_contacto (destino_contacto_id),
    INDEX ix_op_dependencia (destino_dependencia_id),
    INDEX ix_op_caja (caja_id),
    INDEX ix_op_gasto (gasto_id),

    CONSTRAINT fk_op_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id),
    CONSTRAINT fk_op_contacto FOREIGN KEY (destino_contacto_id) REFERENCES contactos(id),
    CONSTRAINT fk_op_dependencia FOREIGN KEY (destino_dependencia_id) REFERENCES municipio_dependencias(id),
    CONSTRAINT fk_op_caja FOREIGN KEY (caja_id) REFERENCES tesoreria_cajas(id) ON DELETE SET NULL,
    CONSTRAINT fk_op_creador FOREIGN KEY (creador_id) REFERENCES usuarios(id),
    CONSTRAINT fk_op_autorizado FOREIGN KEY (autorizado_por_id) REFERENCES usuarios(id),
    CONSTRAINT fk_op_anulado FOREIGN KEY (anulado_por_id) REFERENCES usuarios(id),
    CONSTRAINT fk_op_gasto FOREIGN KEY (gasto_id) REFERENCES gastos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(SQL))
        print("[OK] tabla ordenes_pago creada (o ya existia)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
