-- Migración: Agregar municipio_dependencia_id a usuarios (MySQL)
-- Para asociar usuarios con dependencias específicas (usuarios de área)

-- Verificar si la columna existe, si no, crearla
-- En MySQL no hay IF NOT EXISTS para ALTER TABLE, ejecutar directamente

ALTER TABLE usuarios
ADD COLUMN municipio_dependencia_id INT NULL,
ADD CONSTRAINT fk_usuarios_municipio_dependencia
FOREIGN KEY (municipio_dependencia_id) REFERENCES municipio_dependencias(id);

-- Crear índice para búsquedas rápidas
CREATE INDEX ix_usuarios_municipio_dependencia_id ON usuarios(municipio_dependencia_id);
