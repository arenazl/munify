-- Migration: Convert estado values to uppercase in reclamos table
-- This is needed because the Python enum was changed to use uppercase values

-- First, let's see what values we have (for debugging)
-- SELECT DISTINCT estado FROM reclamos;

-- Update all lowercase estado values to uppercase
UPDATE reclamos SET estado = 'NUEVO' WHERE estado = 'nuevo';
UPDATE reclamos SET estado = 'RECIBIDO' WHERE estado = 'recibido';
UPDATE reclamos SET estado = 'ASIGNADO' WHERE estado = 'asignado';
UPDATE reclamos SET estado = 'EN_PROCESO' WHERE estado = 'en_proceso';
UPDATE reclamos SET estado = 'PENDIENTE_CONFIRMACION' WHERE estado = 'pendiente_confirmacion';
UPDATE reclamos SET estado = 'RESUELTO' WHERE estado = 'resuelto';
UPDATE reclamos SET estado = 'RECHAZADO' WHERE estado = 'rechazado';

-- Also update historial_reclamos if it has estado columns
UPDATE historial_reclamos SET estado_anterior = 'NUEVO' WHERE estado_anterior = 'nuevo';
UPDATE historial_reclamos SET estado_anterior = 'RECIBIDO' WHERE estado_anterior = 'recibido';
UPDATE historial_reclamos SET estado_anterior = 'ASIGNADO' WHERE estado_anterior = 'asignado';
UPDATE historial_reclamos SET estado_anterior = 'EN_PROCESO' WHERE estado_anterior = 'en_proceso';
UPDATE historial_reclamos SET estado_anterior = 'PENDIENTE_CONFIRMACION' WHERE estado_anterior = 'pendiente_confirmacion';
UPDATE historial_reclamos SET estado_anterior = 'RESUELTO' WHERE estado_anterior = 'resuelto';
UPDATE historial_reclamos SET estado_anterior = 'RECHAZADO' WHERE estado_anterior = 'rechazado';

UPDATE historial_reclamos SET estado_nuevo = 'NUEVO' WHERE estado_nuevo = 'nuevo';
UPDATE historial_reclamos SET estado_nuevo = 'RECIBIDO' WHERE estado_nuevo = 'recibido';
UPDATE historial_reclamos SET estado_nuevo = 'ASIGNADO' WHERE estado_nuevo = 'asignado';
UPDATE historial_reclamos SET estado_nuevo = 'EN_PROCESO' WHERE estado_nuevo = 'en_proceso';
UPDATE historial_reclamos SET estado_nuevo = 'PENDIENTE_CONFIRMACION' WHERE estado_nuevo = 'pendiente_confirmacion';
UPDATE historial_reclamos SET estado_nuevo = 'RESUELTO' WHERE estado_nuevo = 'resuelto';
UPDATE historial_reclamos SET estado_nuevo = 'RECHAZADO' WHERE estado_nuevo = 'rechazado';

-- Verify the changes
SELECT 'reclamos' as tabla, estado, COUNT(*) as count FROM reclamos GROUP BY estado;
