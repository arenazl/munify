-- Script para arreglar la tabla usuarios
-- Agregar la columna 'direccion' que falta

ALTER TABLE usuarios
ADD COLUMN direccion VARCHAR(255) NULL AFTER dni;
