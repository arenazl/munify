-- Migración: Agregar columnas de ubicación a direcciones

-- Agregar columna direccion
ALTER TABLE direcciones ADD COLUMN IF NOT EXISTS direccion VARCHAR(300) NULL AFTER descripcion;

-- Agregar columna localidad
ALTER TABLE direcciones ADD COLUMN IF NOT EXISTS localidad VARCHAR(100) NULL AFTER direccion;

-- Agregar columna codigo_postal  
ALTER TABLE direcciones ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(20) NULL AFTER localidad;

-- Agregar columna latitud
ALTER TABLE direcciones ADD COLUMN IF NOT EXISTS latitud DOUBLE NULL AFTER codigo_postal;

-- Agregar columna longitud
ALTER TABLE direcciones ADD COLUMN IF NOT EXISTS longitud DOUBLE NULL AFTER latitud;

-- Verificar estructura
DESCRIBE direcciones;
