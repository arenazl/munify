-- Migración: Agregar municipio_dependencia_id a solicitudes
-- Permite asignar trámites a dependencias

-- Agregar columna
ALTER TABLE solicitudes
ADD COLUMN municipio_dependencia_id INT NULL;

-- Agregar índice para performance
CREATE INDEX ix_solicitudes_municipio_dependencia_id
ON solicitudes(municipio_dependencia_id);

-- Agregar foreign key
ALTER TABLE solicitudes
ADD CONSTRAINT fk_solicitudes_municipio_dependencia
FOREIGN KEY (municipio_dependencia_id)
REFERENCES municipio_dependencias(id);
