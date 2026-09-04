"""municipios.provincia + trigger de blindaje de demos

Revision ID: 20260904_blindaje
Revises: 20260902_calls
Create Date: 2026-09-04

Dos cosas pedidas por el dueño el 2026-09-03:

1. `municipios.provincia` (texto del catálogo): la auditoría de demos filtra
   por país y provincia. Se rellena para las demos existentes desde la última
   bitácora de la semilla (`demo_seed_logs.provincia`), que la conoce en 19
   de las 22 demos de QA.

2. Trigger `municipios_blindaje` BEFORE DELETE: SPN (id 80) y las demos
   `asuncion` (Paraguay Limpio) y `merlo` (muestra + banco E2E) no se borran
   desde NINGÚN proceso — ni la app, ni un script, ni un cliente SQL. Es la
   última barrera detrás de `services/demo_borrado.CODIGOS_INTOCABLES`.
   FOREIGN_KEY_CHECKS=0 (que usa el borrado en cascada) NO apaga triggers.

OJO: `alembic_version` está vacía en QA y en prod (2026-09-04). En QA esto
se aplicó con `scripts/aplicar_20260904_blindaje.py`, que importa los SQL de
este archivo; Infra puede correr el mismo script contra prod.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260904_blindaje"
down_revision: Union[str, None] = "20260902_calls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SQL_BACKFILL_PROVINCIA = """
UPDATE municipios m
JOIN (
    SELECT municipio_id, MAX(id) AS id
    FROM demo_seed_logs
    WHERE provincia IS NOT NULL AND provincia <> ''
    GROUP BY municipio_id
) u ON u.municipio_id = m.id
JOIN demo_seed_logs l ON l.id = u.id
SET m.provincia = l.provincia
WHERE m.provincia IS NULL
"""

SQL_DROP_TRIGGER = "DROP TRIGGER IF EXISTS municipios_blindaje"

SQL_CREATE_TRIGGER = """
CREATE TRIGGER municipios_blindaje BEFORE DELETE ON municipios
FOR EACH ROW
BEGIN
    IF OLD.id = 80 OR LOWER(OLD.codigo) IN ('asuncion', 'merlo') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Municipio blindado: no se borra (SPN, asuncion, merlo)';
    END IF;
END
"""


def upgrade() -> None:
    op.add_column("municipios", sa.Column("provincia", sa.String(150), nullable=True))
    op.execute(SQL_BACKFILL_PROVINCIA)
    op.execute(SQL_DROP_TRIGGER)
    op.execute(SQL_CREATE_TRIGGER)


def downgrade() -> None:
    op.execute(SQL_DROP_TRIGGER)
    op.drop_column("municipios", "provincia")
