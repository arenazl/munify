-- Migración: Agregar municipio_dependencia_id a usuarios
-- Para asociar usuarios con dependencias específicas (usuarios de área)

-- Agregar columna municipio_dependencia_id
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS municipio_dependencia_id INTEGER REFERENCES municipio_dependencias(id);

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS ix_usuarios_municipio_dependencia_id
ON usuarios(municipio_dependencia_id);

-- Comentario
COMMENT ON COLUMN usuarios.municipio_dependencia_id IS 'Dependencia asignada al usuario (para usuarios de tipo área/dependencia)';
