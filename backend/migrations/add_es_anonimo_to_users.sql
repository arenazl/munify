-- Agregar columna es_anonimo a la tabla usuarios
ALTER TABLE usuarios ADD COLUMN es_anonimo BOOLEAN DEFAULT FALSE;

-- Actualizar usuarios existentes para que no sean anónimos
UPDATE usuarios SET es_anonimo = FALSE WHERE es_anonimo IS NULL;
