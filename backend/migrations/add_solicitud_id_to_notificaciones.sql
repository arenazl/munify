-- Migración: Agregar solicitud_id a tabla notificaciones
-- Fecha: 2025-02-02

-- Agregar columna solicitud_id
ALTER TABLE notificaciones
ADD COLUMN IF NOT EXISTS solicitud_id INT NULL;

-- Agregar FK (solo si no existe)
-- ALTER TABLE notificaciones
-- ADD CONSTRAINT fk_notificaciones_solicitud
-- FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id);

-- Agregar índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_notificaciones_solicitud_id ON notificaciones(solicitud_id);
