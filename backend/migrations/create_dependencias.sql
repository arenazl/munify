-- ============================================================
-- MIGRACIÓN: Sistema de Dependencias (desacoplado del municipio)
-- Fecha: 2026-01-25
-- ============================================================

-- 1. Crear tabla de dependencias (catálogo global)
CREATE TABLE IF NOT EXISTS dependencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL UNIQUE,
    codigo VARCHAR(50) UNIQUE,
    descripcion TEXT,
    direccion VARCHAR(300),
    localidad VARCHAR(100),
    ciudad VARCHAR(100),
    codigo_postal VARCHAR(20),
    telefono VARCHAR(50),
    email VARCHAR(200),
    horario_atencion VARCHAR(200),
    tipo_gestion ENUM('RECLAMO', 'TRAMITE', 'AMBOS') NOT NULL DEFAULT 'AMBOS',
    dependencia_padre_id INT,
    latitud FLOAT,
    longitud FLOAT,
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dependencia_padre_id) REFERENCES dependencias(id) ON DELETE SET NULL,
    INDEX idx_dependencias_codigo (codigo),
    INDEX idx_dependencias_tipo_gestion (tipo_gestion),
    INDEX idx_dependencias_padre (dependencia_padre_id)
);

-- 2. Crear tabla pivot municipio-dependencia
CREATE TABLE IF NOT EXISTS municipio_dependencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    dependencia_id INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    -- Personalizaciones locales
    direccion_local VARCHAR(300),
    localidad_local VARCHAR(100),
    telefono_local VARCHAR(50),
    email_local VARCHAR(200),
    horario_atencion_local VARCHAR(200),
    latitud_local FLOAT,
    longitud_local FLOAT,
    config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    FOREIGN KEY (dependencia_id) REFERENCES dependencias(id) ON DELETE CASCADE,
    UNIQUE KEY uq_municipio_dependencia (municipio_id, dependencia_id),
    INDEX idx_muni_dep_municipio (municipio_id),
    INDEX idx_muni_dep_dependencia (dependencia_id)
);

-- 3. Crear tabla de asignación dependencia-categoría por municipio
CREATE TABLE IF NOT EXISTS municipio_dependencia_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    dependencia_id INT NOT NULL,
    categoria_id INT NOT NULL,
    municipio_dependencia_id INT,
    tiempo_resolucion_estimado INT,
    prioridad_default INT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    FOREIGN KEY (dependencia_id) REFERENCES dependencias(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
    FOREIGN KEY (municipio_dependencia_id) REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
    UNIQUE KEY uq_muni_dep_categoria (municipio_id, dependencia_id, categoria_id),
    INDEX idx_mdc_municipio (municipio_id),
    INDEX idx_mdc_dependencia (dependencia_id),
    INDEX idx_mdc_categoria (categoria_id),
    INDEX idx_mdc_muni_dep (municipio_dependencia_id)
);

-- 4. Crear tabla de asignación dependencia-tipo_tramite por municipio
CREATE TABLE IF NOT EXISTS municipio_dependencia_tipos_tramites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    dependencia_id INT NOT NULL,
    tipo_tramite_id INT NOT NULL,
    municipio_dependencia_id INT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    FOREIGN KEY (dependencia_id) REFERENCES dependencias(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
    FOREIGN KEY (municipio_dependencia_id) REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
    UNIQUE KEY uq_muni_dep_tipo_tramite (municipio_id, dependencia_id, tipo_tramite_id),
    INDEX idx_mdtt_municipio (municipio_id),
    INDEX idx_mdtt_dependencia (dependencia_id),
    INDEX idx_mdtt_tipo_tramite (tipo_tramite_id),
    INDEX idx_mdtt_muni_dep (municipio_dependencia_id)
);

-- 5. Agregar columna municipio_dependencia_id a reclamos (nueva referencia)
ALTER TABLE reclamos
ADD COLUMN IF NOT EXISTS municipio_dependencia_id INT,
ADD CONSTRAINT fk_reclamos_muni_dep
    FOREIGN KEY (municipio_dependencia_id)
    REFERENCES municipio_dependencias(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reclamos_muni_dep ON reclamos(municipio_dependencia_id);

-- 6. Agregar columna municipio_dependencia_id a solicitudes (nueva referencia)
ALTER TABLE solicitudes
ADD COLUMN IF NOT EXISTS municipio_dependencia_id INT,
ADD CONSTRAINT fk_solicitudes_muni_dep
    FOREIGN KEY (municipio_dependencia_id)
    REFERENCES municipio_dependencias(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_muni_dep ON solicitudes(municipio_dependencia_id);

-- ============================================================
-- SEED: Dependencias por defecto
-- ============================================================

INSERT IGNORE INTO dependencias (nombre, codigo, descripcion, horario_atencion, tipo_gestion, orden) VALUES
('Dirección de Atención al Vecino', 'ATENCION_VECINO', 'Área encargada de recibir, registrar y derivar los reclamos realizados por los vecinos, actuando como punto central de contacto entre la ciudadanía y las distintas áreas municipales.', 'Lunes a Viernes de 8:00 a 16:00', 'RECLAMO', 1),
('Secretaría de Obras Públicas', 'OBRAS_PUBLICAS', 'Responsable del mantenimiento y mejora de la infraestructura urbana, atendiendo reclamos relacionados con calles, veredas, obras municipales y el estado general del espacio público.', 'Lunes a Viernes de 7:00 a 15:00', 'AMBOS', 2),
('Secretaría de Servicios Públicos y Ambiente', 'SERVICIOS_PUBLICOS', 'Área encargada de la prestación y control de los servicios urbanos esenciales, incluyendo limpieza, recolección de residuos, mantenimiento de espacios verdes y salubridad ambiental.', 'Lunes a Viernes de 7:00 a 14:00', 'RECLAMO', 3),
('Dirección de Tránsito y Seguridad Vial', 'TRANSITO_VIAL', 'Dependencia responsable de la organización y control del tránsito, atendiendo reclamos vinculados a semáforos, señalización vial y situaciones que afecten la seguridad en la circulación.', 'Lunes a Viernes de 8:00 a 14:00', 'RECLAMO', 4),
('Secretaría de Seguridad', 'SEGURIDAD', 'Área dedicada a la prevención y coordinación de acciones de seguridad urbana, atendiendo reclamos que no constituyen emergencias y que requieren intervención municipal preventiva.', 'Lunes a Viernes de 8:00 a 18:00', 'RECLAMO', 5),
('Dirección de Zoonosis y Salud Animal', 'ZOONOSIS', 'Dependencia encargada del control sanitario animal y la atención de reclamos relacionados con animales sueltos, heridos o situaciones que afecten la convivencia y la salud pública.', 'Lunes a Viernes de 8:00 a 14:00', 'RECLAMO', 6),
('Dirección de Catastro', 'CATASTRO', 'Área encargada del registro y administración de los inmuebles del partido, gestionando trámites de subdivisión, unificación, mensuras y regularización dominial.', 'Lunes a Viernes de 8:00 a 14:00', 'TRAMITE', 7),
('Dirección de Rentas', 'RENTAS', 'Responsable de la administración tributaria municipal, gestionando el cobro de tasas, contribuciones y demás tributos municipales.', 'Lunes a Viernes de 8:00 a 14:00', 'TRAMITE', 8),
('Dirección de Habilitaciones Comerciales', 'HABILITACIONES', 'Área encargada de otorgar y controlar las habilitaciones para el funcionamiento de comercios, industrias y actividades económicas en el distrito.', 'Lunes a Viernes de 8:00 a 14:00', 'TRAMITE', 9),
('Dirección de Obras Particulares', 'OBRAS_PARTICULARES', 'Dependencia que gestiona los permisos de construcción, ampliación y refacción de inmuebles privados, controlando el cumplimiento de las normas de edificación.', 'Lunes a Viernes de 8:00 a 14:00', 'TRAMITE', 10),
('Dirección de Bromatología', 'BROMATOLOGIA', 'Área responsable del control sanitario de alimentos y establecimientos gastronómicos, velando por la salud pública y la seguridad alimentaria.', 'Lunes a Viernes de 8:00 a 14:00', 'AMBOS', 11),
('Secretaría de Desarrollo Social', 'DESARROLLO_SOCIAL', 'Área dedicada a la asistencia y promoción social, gestionando programas de ayuda a sectores vulnerables y trámites de asistencia social.', 'Lunes a Viernes de 8:00 a 14:00', 'TRAMITE', 12);

-- ============================================================
-- NOTAS DE MIGRACIÓN
-- ============================================================
--
-- 1. Las tablas antiguas (direcciones, direccion_categorias, direccion_tipos_tramites)
--    se mantienen para compatibilidad. Marcar como DEPRECATED.
--
-- 2. Para migrar datos existentes de direcciones a dependencias:
--    - Crear dependencias en el catálogo global basadas en las direcciones existentes
--    - Crear registros en municipio_dependencias para cada municipio
--    - Copiar asignaciones de categorías y tipos de trámite
--    - Actualizar reclamos.municipio_dependencia_id basado en direccion_id
--
-- 3. Una vez migrados los datos, se pueden eliminar las columnas:
--    - reclamos.direccion_id
--    - solicitudes.direccion_id
