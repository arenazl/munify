-- Migración: Crear tabla municipio_dependencia_tramites
-- Esta tabla permite asignar trámites específicos a dependencias por municipio
-- Es más granular que municipio_dependencia_tipos_tramites (que asigna tipos completos)

CREATE TABLE IF NOT EXISTS municipio_dependencia_tramites (
    id SERIAL PRIMARY KEY,
    municipio_dependencia_id INTEGER NOT NULL REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
    tramite_id INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraint único para evitar duplicados
    CONSTRAINT uq_muni_dep_tramite UNIQUE (municipio_dependencia_id, tramite_id)
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS ix_muni_dep_tramites_muni_dep_id ON municipio_dependencia_tramites(municipio_dependencia_id);
CREATE INDEX IF NOT EXISTS ix_muni_dep_tramites_tramite_id ON municipio_dependencia_tramites(tramite_id);

-- Comentarios
COMMENT ON TABLE municipio_dependencia_tramites IS 'Asignación de trámites específicos a dependencias por municipio';
COMMENT ON COLUMN municipio_dependencia_tramites.municipio_dependencia_id IS 'FK a la dependencia habilitada del municipio';
COMMENT ON COLUMN municipio_dependencia_tramites.tramite_id IS 'FK al trámite específico del catálogo';
COMMENT ON COLUMN municipio_dependencia_tramites.activo IS 'Si la asignación está activa';
