-- Migration: Fix EstadoReclamo ENUM to use lowercase values
-- The Python enum uses lowercase values, but MySQL ENUM type may be defined with uppercase

-- Alter the ENUM type in reclamos table to use lowercase values
ALTER TABLE reclamos
MODIFY COLUMN estado ENUM('nuevo', 'recibido', 'asignado', 'en_proceso', 'pendiente_confirmacion', 'resuelto', 'rechazado') NOT NULL DEFAULT 'nuevo';

-- Alter the ENUM type in historial_reclamos table
ALTER TABLE historial_reclamos
MODIFY COLUMN estado_anterior ENUM('nuevo', 'recibido', 'asignado', 'en_proceso', 'pendiente_confirmacion', 'resuelto', 'rechazado') NULL;

ALTER TABLE historial_reclamos
MODIFY COLUMN estado_nuevo ENUM('nuevo', 'recibido', 'asignado', 'en_proceso', 'pendiente_confirmacion', 'resuelto', 'rechazado') NULL;

-- Verify the changes
DESCRIBE reclamos;
SELECT DISTINCT estado FROM reclamos;
