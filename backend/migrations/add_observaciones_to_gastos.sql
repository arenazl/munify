-- ============================================================
-- Migración: agregar columna `observaciones` a la tabla `gastos`
-- Permite al intendente / supervisor anotar comentarios libres
-- sobre cada gasto desde el detalle (side modal de Tesorería).
-- Idempotente: el ADD COLUMN IF NOT EXISTS evita errores si ya existe.
-- ============================================================

ALTER TABLE gastos
    ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;
