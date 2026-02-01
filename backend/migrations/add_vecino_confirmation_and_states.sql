-- Migración: Agregar confirmación del vecino y nuevos estados
-- Fecha: 2025-01-26

-- 1. Agregar nuevos estados al ENUM de estado
-- MySQL requiere modificar el ENUM completo
ALTER TABLE reclamos
MODIFY COLUMN estado ENUM(
    'nuevo',
    'recibido',
    'asignado',
    'en_proceso',
    'pendiente_confirmacion',
    'resuelto',
    'finalizado',
    'pospuesto',
    'rechazado'
) NOT NULL DEFAULT 'nuevo';

-- 2. Agregar campos de confirmación del vecino
ALTER TABLE reclamos
ADD COLUMN confirmado_vecino BOOLEAN DEFAULT NULL COMMENT 'NULL=sin respuesta, TRUE=solucionado, FALSE=sigue problema',
ADD COLUMN fecha_confirmacion_vecino DATETIME DEFAULT NULL,
ADD COLUMN comentario_confirmacion_vecino TEXT DEFAULT NULL;

-- 3. Índice para consultas de feedback pendiente
CREATE INDEX idx_reclamos_confirmado_vecino ON reclamos(confirmado_vecino);

-- Verificar cambios
DESCRIBE reclamos;
