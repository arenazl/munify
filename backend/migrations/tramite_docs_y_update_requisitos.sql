-- ============================================================
-- MIGRACIÓN: tramite_docs y reestructuración de requisitos
-- Fecha: 2026-02-04
-- ============================================================

-- 1. Crear tabla tramite_docs (documentos/requisitos visuales por trámite)
CREATE TABLE IF NOT EXISTS tramite_docs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tramite_id INT NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    imagen VARCHAR(500),
    orden INT DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_tramite_docs_tramite
        FOREIGN KEY (tramite_id) REFERENCES tramites(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_tramite_docs_tramite (tramite_id),
    INDEX idx_tramite_docs_orden (orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2. Mover contenido de requisitos → documentos_requeridos
UPDATE tramites SET documentos_requeridos = requisitos WHERE requisitos IS NOT NULL AND requisitos != '';


-- 3. Actualizar requisitos con la operatoria/procedimiento de cada trámite
-- Obras Particulares
UPDATE tramites SET requisitos = 'Presentar planos en ventanilla de Obras → Esperar revisión técnica (5-7 días) → Abonar derechos de construcción → Retirar permiso aprobado' WHERE id = 1;
UPDATE tramites SET requisitos = 'Solicitar turno online → Presentar documentación en Obras → Inspección del inmueble → Aprobación de planos → Retiro de permiso' WHERE id = 2;
UPDATE tramites SET requisitos = 'Presentar solicitud de regularización → Inspección municipal obligatoria → Presentar planos de relevamiento → Pago de multa y derechos → Aprobación' WHERE id = 3;
UPDATE tramites SET requisitos = 'Solicitar inspección final → Inspector verifica obra conforme a planos → Correcciones si corresponde → Emisión de certificado' WHERE id = 4;

-- Habilitaciones Comerciales
UPDATE tramites SET requisitos = 'Presentar formulario de habilitación → Inspección del local → Subsanar observaciones → Pago de tasas → Retiro de habilitación' WHERE id = 5;
UPDATE tramites SET requisitos = 'Presentar solicitud 30 días antes del vencimiento → Verificación de libre deuda → Pago de renovación → Emisión nueva habilitación' WHERE id = 6;
UPDATE tramites SET requisitos = 'Solicitar baja del rubro anterior → Presentar nuevo rubro → Inspección si corresponde → Actualización de habilitación' WHERE id = 7;
UPDATE tramites SET requisitos = 'Presentar solicitud de baja → Verificar libre deuda → Inspección de cierre → Emisión de constancia de baja' WHERE id = 8;

-- Tránsito
UPDATE tramites SET requisitos = 'Sacar turno online → Realizar curso de educación vial → Examen teórico → Examen práctico → Examen psicofísico → Pago y emisión' WHERE id = 9;
UPDATE tramites SET requisitos = 'Sacar turno online → Examen psicofísico → Pago de renovación → Emisión de nueva licencia' WHERE id = 10;
UPDATE tramites SET requisitos = 'Presentar solicitud → Verificar documentación vehicular → Pago mensual/anual → Entrega de permiso/oblea' WHERE id = 11;

-- Rentas y Tributos
UPDATE tramites SET requisitos = 'Presentar solicitud con monto adeudado → Análisis de plan según monto → Firma de convenio → Pago de primera cuota → Entrega de cupones' WHERE id = 12;
UPDATE tramites SET requisitos = 'Solicitar certificado → Verificación automática de deuda → Si no hay deuda, emisión inmediata → Si hay deuda, regularizar primero' WHERE id = 13;
UPDATE tramites SET requisitos = 'Presentar solicitud con documentación respaldatoria → Evaluación del caso → Resolución administrativa → Notificación al contribuyente' WHERE id = 14;

-- Espacios Verdes
UPDATE tramites SET requisitos = 'Presentar solicitud con ubicación del árbol → Inspección técnica → Programación de poda → Ejecución por cuadrilla municipal' WHERE id = 15;
UPDATE tramites SET requisitos = 'Presentar solicitud con justificación → Evaluación técnica del árbol → Aprobación o rechazo → Si aprueba, programación de extracción' WHERE id = 16;

-- Catastro e Inmuebles
UPDATE tramites SET requisitos = 'Presentar solicitud → Designar agrimensor → Trabajo de campo → Confección de plano → Aprobación municipal → Inscripción en Catastro' WHERE id = 17;
UPDATE tramites SET requisitos = 'Presentar proyecto de subdivisión → Evaluación técnica → Aprobación de planos → Inscripción de nuevas parcelas en Catastro' WHERE id = 18;
UPDATE tramites SET requisitos = 'Presentar solicitud con títulos de ambas parcelas → Evaluación catastral → Confección de plano unificado → Inscripción' WHERE id = 19;

-- Bromatología
UPDATE tramites SET requisitos = 'Inscribirse en curso de manipulación → Aprobar examen → Presentar foto y DNI → Emisión de carnet' WHERE id = 20;
UPDATE tramites SET requisitos = 'Obtener habilitación comercial primero → Presentar carnet de manipulador → Inspección bromatológica → Aprobación y habilitación' WHERE id = 21;

-- Certificaciones
UPDATE tramites SET requisitos = 'Presentar DNI y servicio a nombre del titular → Verificación de domicilio → Emisión de certificado' WHERE id = 22;
UPDATE tramites SET requisitos = 'Presentarse personalmente con DNI → Verificación de identidad → Emisión inmediata de certificado' WHERE id = 23;

-- Desarrollo Social
UPDATE tramites SET requisitos = 'Solicitar entrevista con trabajador social → Evaluación del caso → Informe social → Resolución y notificación' WHERE id = 24;
UPDATE tramites SET requisitos = 'Presentar solicitud → Entrevista socioeconómica → Evaluación del grupo familiar → Alta en sistema → Entrega de tarjeta' WHERE id = 25;
UPDATE tramites SET requisitos = 'Presentar solicitud mensual → Verificación de datos → Retiro en fecha asignada con DNI' WHERE id = 26;
UPDATE tramites SET requisitos = 'Solicitar turno → Entrevista con trabajador social → Relevamiento socioeconómico → Emisión de certificado' WHERE id = 27;
UPDATE tramites SET requisitos = 'Completar formulario de inscripción → Presentar documentación → Evaluación socioeconómica → Incorporación a lista de espera' WHERE id = 28;

-- Cementerio
UPDATE tramites SET requisitos = 'Consultar disponibilidad → Seleccionar ubicación → Pago de adquisición/alquiler → Firma de contrato → Entrega de documentación' WHERE id = 29;
UPDATE tramites SET requisitos = 'Presentar comprobante de nicho → Verificar estado de cuenta → Pago de renovación → Actualización de contrato' WHERE id = 30;
UPDATE tramites SET requisitos = 'Presentar solicitud con autorizaciones → Coordinar fecha de traslado → Pago de servicios → Ejecución del traslado' WHERE id = 31;
UPDATE tramites SET requisitos = 'Presentar orden judicial o autorización sanitaria → Verificación de documentación → Programación de exhumación → Acta de exhumación' WHERE id = 32;
UPDATE tramites SET requisitos = 'Presentar certificado de defunción → Seleccionar nicho/parcela → Pago de servicios → Coordinación de fecha y hora' WHERE id = 33;

-- Espacio Público
UPDATE tramites SET requisitos = 'Presentar solicitud con 15 días de anticipación → Descripción del evento → Evaluación municipal → Pago de canon si corresponde → Permiso' WHERE id = 34;
UPDATE tramites SET requisitos = 'Presentar proyecto de feria → Listado de feriantes → Inspección del predio → Aprobación → Pago de canon → Habilitación' WHERE id = 35;
UPDATE tramites SET requisitos = 'Presentar solicitud → Habilitación comercial y bromatológica → Inspección del vehículo → Asignación de zona → Permiso' WHERE id = 36;
UPDATE tramites SET requisitos = 'Presentar proyecto de cartel → Evaluación de impacto visual → Aprobación de Planeamiento → Pago de canon anual → Permiso de instalación' WHERE id = 37;
UPDATE tramites SET requisitos = 'Presentar solicitud con plano de ocupación → Inspección → Delimitación de espacio → Pago mensual → Permiso renovable' WHERE id = 38;


-- 4. Insertar algunos documentos de ejemplo para un trámite
INSERT INTO tramite_docs (tramite_id, nombre, descripcion, imagen, orden) VALUES
(1, 'DNI del titular', 'Documento Nacional de Identidad del propietario del terreno', 'dni.png', 1),
(1, 'Título de propiedad', 'Escritura o boleto de compraventa del inmueble', 'titulo.png', 2),
(1, 'Planos de obra', 'Planos firmados por profesional matriculado', 'planos.png', 3),
(1, 'Comprobante de pago', 'Recibo de pago de derechos de construcción', 'pago.png', 4);

-- Documentos para Habilitación Comercial
INSERT INTO tramite_docs (tramite_id, nombre, descripcion, imagen, orden) VALUES
(5, 'Contrato de alquiler o título', 'Documento que acredite la tenencia del local', 'contrato.png', 1),
(5, 'Constancia de CUIT', 'Constancia de inscripción en AFIP', 'cuit.png', 2),
(5, 'Plano del local', 'Croquis o plano con medidas del local', 'plano_local.png', 3),
(5, 'Libre deuda municipal', 'Certificado de libre deuda del inmueble', 'libre_deuda.png', 4);

-- Documentos para Licencia de Conducir
INSERT INTO tramite_docs (tramite_id, nombre, descripcion, imagen, orden) VALUES
(9, 'DNI', 'Documento Nacional de Identidad vigente', 'dni.png', 1),
(9, 'Certificado de antecedentes', 'Certificado de antecedentes penales', 'antecedentes.png', 2),
(9, 'Examen psicofísico', 'Certificado médico de aptitud psicofísica', 'psicofisico.png', 3),
(9, 'Foto 4x4', 'Fotografía color 4x4 fondo celeste', 'foto.png', 4),
(9, 'Certificado curso vial', 'Certificado de aprobación del curso de educación vial', 'curso.png', 5);

