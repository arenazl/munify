-- ============================================================
-- MIGRACIÓN: Recrear tablas de trámites con campos para IA
-- Fecha: 2026-01-25
-- ============================================================

-- IMPORTANTE: Esta migración ELIMINA todos los datos existentes
-- Solo ejecutar en desarrollo o con backup previo

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Eliminar tablas dependientes
DROP TABLE IF EXISTS municipio_dependencia_tipos_tramites;
DROP TABLE IF EXISTS direccion_tipos_tramites;
DROP TABLE IF EXISTS municipio_tramites;
DROP TABLE IF EXISTS municipio_tipos_tramites;

-- 2. Limpiar referencias en solicitudes
UPDATE solicitudes SET tramite_id = NULL WHERE tramite_id IS NOT NULL;

-- 3. Eliminar tablas principales
DROP TABLE IF EXISTS tramites;
DROP TABLE IF EXISTS tipos_tramites;

-- 4. Recrear tabla tipos_tramites con nuevos campos
CREATE TABLE tipos_tramites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL UNIQUE,
    descripcion TEXT,
    codigo VARCHAR(50) UNIQUE,
    icono VARCHAR(50),
    color VARCHAR(20),

    -- Flags para clasificación IA
    es_certificado BOOLEAN DEFAULT FALSE,
    es_habilitacion BOOLEAN DEFAULT FALSE,
    es_pago BOOLEAN DEFAULT FALSE,
    palabras_clave TEXT,

    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_tipos_tramites_codigo (codigo),
    INDEX idx_tipos_tramites_activo (activo)
);

-- 5. Recrear tabla tramites con nuevos campos
CREATE TABLE tramites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo_tramite_id INT NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    icono VARCHAR(50),

    -- Flags para clasificación IA
    es_certificado BOOLEAN DEFAULT FALSE,
    es_habilitacion BOOLEAN DEFAULT FALSE,
    es_pago BOOLEAN DEFAULT FALSE,
    palabras_clave TEXT,

    -- Requisitos y documentación
    requisitos TEXT,
    documentos_requeridos TEXT,

    -- Info del trámite
    tiempo_estimado_dias INT DEFAULT 15,
    costo FLOAT,
    url_externa VARCHAR(500),

    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
    INDEX idx_tramites_tipo (tipo_tramite_id),
    INDEX idx_tramites_activo (activo)
);

-- 6. Recrear tabla municipio_tipos_tramites
CREATE TABLE municipio_tipos_tramites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    tipo_tramite_id INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
    UNIQUE KEY uq_municipio_tipo_tramite (municipio_id, tipo_tramite_id),
    INDEX idx_mtt_municipio (municipio_id),
    INDEX idx_mtt_tipo (tipo_tramite_id)
);

-- 7. Recrear tabla municipio_tramites
CREATE TABLE municipio_tramites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    tramite_id INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,

    -- Personalizaciones por municipio (NULL = usar valor genérico)
    tiempo_estimado_dias INT,
    costo FLOAT,
    requisitos TEXT,
    documentos_requeridos TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    FOREIGN KEY (tramite_id) REFERENCES tramites(id) ON DELETE CASCADE,
    UNIQUE KEY uq_municipio_tramite (municipio_id, tramite_id),
    INDEX idx_mt_municipio (municipio_id),
    INDEX idx_mt_tramite (tramite_id)
);

-- 8. Recrear tabla municipio_dependencia_tipos_tramites
CREATE TABLE municipio_dependencia_tipos_tramites (
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
    INDEX idx_mdtt_tipo_tramite (tipo_tramite_id)
);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED: Tipos de Trámite por defecto
-- ============================================================

INSERT INTO tipos_tramites (nombre, codigo, descripcion, icono, color, es_certificado, es_habilitacion, es_pago, palabras_clave, orden) VALUES
('Obras Privadas', 'OBRAS_PRIVADAS', 'Permisos y habilitaciones para construcciones, ampliaciones y regularizaciones de obra', 'HardHat', '#EF4444', FALSE, TRUE, FALSE, 'obra,construccion,plano,permiso,ampliacion,regularizacion,edificar,construir', 1),
('Comercio e Industria', 'COMERCIO_INDUSTRIA', 'Habilitaciones comerciales, industriales y renovaciones', 'Store', '#3B82F6', FALSE, TRUE, FALSE, 'comercio,habilitacion,comercial,negocio,local,rubro,industria,fabrica', 2),
('Tránsito y Transporte', 'TRANSITO_TRANSPORTE', 'Licencias de conducir y permisos de estacionamiento', 'Car', '#10B981', TRUE, FALSE, FALSE, 'licencia,conducir,carnet,estacionamiento,transito,vehiculo,auto,moto', 3),
('Rentas y Tasas', 'RENTAS_TASAS', 'Pagos, planes de facilidades y certificados de deuda', 'Receipt', '#F59E0B', TRUE, FALSE, TRUE, 'pago,tasa,impuesto,deuda,libre,plan,exencion,rentas,tributo', 4),
('Medio Ambiente', 'MEDIO_AMBIENTE', 'Permisos ambientales, poda y extracción de árboles', 'Leaf', '#22C55E', FALSE, FALSE, FALSE, 'arbol,poda,ambiente,verde,extraccion,ambiental,ecologia', 5),
('Catastro e Inmuebles', 'CATASTRO', 'Trámites inmobiliarios, mensuras y subdivisiones', 'MapPin', '#8B5CF6', TRUE, FALSE, FALSE, 'catastro,mensura,subdivision,terreno,inmueble,parcela,propiedad,lote', 6),
('Salud y Bromatología', 'SALUD_BROMATOLOGIA', 'Carnets de salud, libretas sanitarias y habilitaciones alimentarias', 'Heart', '#EC4899', TRUE, TRUE, FALSE, 'carnet,salud,libreta,sanitaria,bromatologia,alimento,manipulador,higiene', 7),
('Desarrollo Social', 'DESARROLLO_SOCIAL', 'Asistencia social, subsidios y programas de ayuda', 'Users', '#6366F1', TRUE, FALSE, FALSE, 'social,subsidio,ayuda,asistencia,programa,beneficio,necesidad', 8),
('Cementerio', 'CEMENTERIO', 'Trámites de cementerio, nichos y servicios fúnebres', 'Home', '#78716C', TRUE, FALSE, TRUE, 'cementerio,nicho,sepultura,difunto,funebre,panteon,boveda', 9),
('Documentación Personal', 'DOCUMENTACION', 'Certificados, constancias y documentación personal', 'FileText', '#0EA5E9', TRUE, FALSE, FALSE, 'certificado,constancia,domicilio,supervivencia,documento,residencia', 10),
('Espacio Público', 'ESPACIO_PUBLICO', 'Permisos de uso de espacio público, eventos y cartelería', 'Flag', '#14B8A6', FALSE, TRUE, FALSE, 'evento,espacio,publico,carteleria,feria,venta,ambulante,ocupacion', 11);

-- ============================================================
-- SEED: Trámites específicos por tipo
-- ============================================================

-- Obras Privadas
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'OBRAS_PRIVADAS'), 'Permiso de Obra Nueva', 'Solicitud de permiso para construcción nueva en terreno propio', 'Building2', FALSE, TRUE, FALSE, 'obra nueva,construir,edificar,permiso construccion', 'Planos aprobados, Título de propiedad, DNI, Pago de derechos', 30, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'OBRAS_PRIVADAS'), 'Ampliación de Obra', 'Permiso para ampliar construcción existente', 'Maximize', FALSE, TRUE, FALSE, 'ampliar,ampliacion,agrandar,anexo', 'Planos actuales, Planos de ampliación, DNI, Final de obra anterior', 20, 2),
((SELECT id FROM tipos_tramites WHERE codigo = 'OBRAS_PRIVADAS'), 'Regularización de Obra', 'Regularizar construcción sin permiso previo', 'CheckCircle', FALSE, TRUE, FALSE, 'regularizar,sin permiso,clandestina,ilegal', 'Planos relevamiento, Fotos, DNI, Título de propiedad', 45, 3),
((SELECT id FROM tipos_tramites WHERE codigo = 'OBRAS_PRIVADAS'), 'Final de Obra', 'Certificado de finalización de obra', 'Award', TRUE, FALSE, FALSE, 'final,terminacion,certificado obra', 'Planos conforme a obra, Inspección aprobada', 15, 4);

-- Comercio e Industria
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'COMERCIO_INDUSTRIA'), 'Habilitación Comercial', 'Habilitación de nuevo comercio o actividad comercial', 'Store', FALSE, TRUE, FALSE, 'habilitar comercio,abrir local,nuevo negocio', 'Contrato de alquiler o título, CUIT, Plano del local, Libre deuda municipal', 15, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'COMERCIO_INDUSTRIA'), 'Renovación de Habilitación', 'Renovar habilitación comercial vencida', 'RefreshCw', FALSE, TRUE, FALSE, 'renovar,vencida,actualizar habilitacion', 'Habilitación anterior, CUIT, Libre deuda municipal', 10, 2),
((SELECT id FROM tipos_tramites WHERE codigo = 'COMERCIO_INDUSTRIA'), 'Cambio de Rubro', 'Modificar actividad comercial habilitada', 'ArrowRightLeft', FALSE, TRUE, FALSE, 'cambiar rubro,nueva actividad,modificar', 'Habilitación actual, Descripción nuevo rubro, CUIT', 15, 3),
((SELECT id FROM tipos_tramites WHERE codigo = 'COMERCIO_INDUSTRIA'), 'Baja de Comercio', 'Dar de baja habilitación comercial', 'XCircle', FALSE, FALSE, FALSE, 'cerrar,baja,clausura,fin actividad', 'Habilitación vigente, Libre deuda, DNI titular', 5, 4);

-- Tránsito y Transporte
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'TRANSITO_TRANSPORTE'), 'Licencia de Conducir - Primera vez', 'Obtención de licencia de conducir nueva', 'CreditCard', TRUE, FALSE, FALSE, 'licencia nueva,sacar carnet,primera vez,registro', 'DNI, Certificado de antecedentes, Examen psicofísico, Foto 4x4, Curso vial aprobado', 5, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'TRANSITO_TRANSPORTE'), 'Renovación de Licencia', 'Renovar licencia de conducir vencida', 'RefreshCw', TRUE, FALSE, FALSE, 'renovar licencia,vencida,carnet vencido', 'DNI, Licencia anterior, Examen psicofísico', 3, 2),
((SELECT id FROM tipos_tramites WHERE codigo = 'TRANSITO_TRANSPORTE'), 'Permiso de Estacionamiento', 'Permiso para estacionamiento medido', 'ParkingCircle', TRUE, FALSE, TRUE, 'estacionar,cochera,medido', 'DNI, Cédula verde, Comprobante de domicilio', 3, 3);

-- Rentas y Tasas
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'RENTAS_TASAS'), 'Plan de Pago', 'Plan de facilidades para deuda municipal', 'Calendar', FALSE, FALSE, TRUE, 'plan pago,cuotas,facilidades,deber', 'DNI, Comprobante de deuda, Datos del inmueble/comercio', 2, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'RENTAS_TASAS'), 'Libre Deuda Municipal', 'Certificado de libre deuda municipal', 'CheckCircle2', TRUE, FALSE, FALSE, 'libre deuda,certificado,no debe', 'DNI, Datos del inmueble o comercio', 1, 2),
((SELECT id FROM tipos_tramites WHERE codigo = 'RENTAS_TASAS'), 'Exención de Tasas', 'Solicitud de exención por discapacidad, jubilación u otros', 'BadgePercent', FALSE, FALSE, FALSE, 'exencion,descuento,jubilado,discapacidad,no pagar', 'DNI, Certificado de discapacidad o recibo jubilación, Comprobantes', 15, 3);

-- Medio Ambiente
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'MEDIO_AMBIENTE'), 'Permiso de Poda', 'Solicitud de poda de árbol en vereda pública', 'Scissors', FALSE, FALSE, FALSE, 'podar,arbol,vereda,rama', 'DNI, Ubicación del árbol, Fotos', 10, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'MEDIO_AMBIENTE'), 'Extracción de Árbol', 'Solicitud de extracción de árbol', 'TreeDeciduous', FALSE, FALSE, FALSE, 'sacar arbol,extraer,cortar arbol,raiz', 'DNI, Justificación, Fotos, Ubicación exacta', 20, 2);

-- Catastro e Inmuebles
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'CATASTRO'), 'Plano de Mensura', 'Solicitud de plano de mensura oficial', 'Ruler', TRUE, FALSE, FALSE, 'mensura,medir,agrimensura,plano oficial', 'Título de propiedad, DNI, Plano anterior si existe', 30, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'CATASTRO'), 'Subdivisión de Terreno', 'División de parcela en lotes', 'Grid3X3', FALSE, FALSE, FALSE, 'subdividir,dividir,lotes,parcela', 'Título, Planos, Proyecto de subdivisión aprobado', 45, 2),
((SELECT id FROM tipos_tramites WHERE codigo = 'CATASTRO'), 'Unificación de Parcelas', 'Unificar dos o más parcelas en una', 'Combine', FALSE, FALSE, FALSE, 'unificar,juntar,union parcelas', 'Títulos de ambas parcelas, Planos, DNI', 30, 3);

-- Salud y Bromatología
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'SALUD_BROMATOLOGIA'), 'Carnet de Manipulador de Alimentos', 'Libreta sanitaria para manipulación de alimentos', 'Utensils', TRUE, FALSE, FALSE, 'carnet,libreta,manipulador,comida,alimentos', 'DNI, Curso de manipulación aprobado, Foto 4x4', 5, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'SALUD_BROMATOLOGIA'), 'Habilitación de Comercio Gastronómico', 'Habilitación para restaurantes, bares y afines', 'ChefHat', FALSE, TRUE, FALSE, 'restaurante,bar,comida,gastronomico', 'Habilitación comercial, Carnet manipulador, Planos cocina', 20, 2);

-- Documentación Personal
INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden) VALUES
((SELECT id FROM tipos_tramites WHERE codigo = 'DOCUMENTACION'), 'Certificado de Domicilio', 'Constancia de residencia en el municipio', 'Home', TRUE, FALSE, FALSE, 'domicilio,residencia,vivo,certificado', 'DNI, Servicio a nombre del titular', 3, 1),
((SELECT id FROM tipos_tramites WHERE codigo = 'DOCUMENTACION'), 'Certificado de Supervivencia', 'Constancia de que la persona está viva', 'HeartPulse', TRUE, FALSE, FALSE, 'supervivencia,fe de vida,vivo', 'DNI, Presencia del titular', 1, 2);

-- ============================================================
-- FIN DE MIGRACIÓN
-- ============================================================
