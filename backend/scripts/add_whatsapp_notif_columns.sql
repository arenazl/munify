-- Agregar columnas de notificaciones al empleado
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS notificar_empleado_asignacion BOOLEAN DEFAULT TRUE;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS notificar_empleado_nuevo_comentario BOOLEAN DEFAULT TRUE;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS notificar_empleado_cambio_prioridad BOOLEAN DEFAULT TRUE;

-- Agregar columnas de notificaciones al supervisor
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS notificar_supervisor_reclamo_nuevo BOOLEAN DEFAULT TRUE;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS notificar_supervisor_reclamo_resuelto BOOLEAN DEFAULT TRUE;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS notificar_supervisor_reclamo_vencido BOOLEAN DEFAULT TRUE;


-- Agregar columna de teléfono a empleados
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
