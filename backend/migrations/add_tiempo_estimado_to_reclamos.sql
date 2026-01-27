-- Migración: Agregar campos de tiempo estimado de resolución a reclamos
-- Fecha: 2026-01-27

-- Agregar estado 'recibido' al enum (si no existe)
-- Nota: En PostgreSQL los enums son inmutables, hay que agregar el valor
DO $$
BEGIN
    -- Verificar si el valor 'recibido' ya existe en el enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'recibido'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'estadoreclamo')
    ) THEN
        ALTER TYPE estadoreclamo ADD VALUE 'recibido' AFTER 'nuevo';
    END IF;
END $$;

-- Agregar campos de tiempo estimado
ALTER TABLE reclamos
ADD COLUMN IF NOT EXISTS tiempo_estimado_dias INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tiempo_estimado_horas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fecha_estimada_resolucion TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fecha_recibido TIMESTAMP WITH TIME ZONE;

-- Comentarios
COMMENT ON COLUMN reclamos.tiempo_estimado_dias IS 'Días estimados para resolver el reclamo';
COMMENT ON COLUMN reclamos.tiempo_estimado_horas IS 'Horas adicionales estimadas para resolver';
COMMENT ON COLUMN reclamos.fecha_estimada_resolucion IS 'Fecha/hora calculada de resolución esperada';
COMMENT ON COLUMN reclamos.fecha_recibido IS 'Fecha/hora en que la dependencia aceptó el reclamo';
