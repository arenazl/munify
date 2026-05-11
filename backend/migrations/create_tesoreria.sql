-- ============================================================
-- Migración Tesorería + Feature flags por municipio
-- Crea: municipio_modulos, contactos, gastos, gastos_cuotas
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.
-- ============================================================

-- ---- Feature flags ----
CREATE TABLE IF NOT EXISTS municipio_modulos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_muni_modulo UNIQUE (municipio_id, modulo),
    INDEX idx_muni_modulo_muni (municipio_id),
    INDEX idx_muni_modulo_mod (modulo),
    CONSTRAINT fk_muni_modulo_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---- Contactos (agenda del intendente) ----
CREATE TABLE IF NOT EXISTS contactos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NULL,
    dni VARCHAR(20) NULL,
    telefono VARCHAR(30) NULL,
    email VARCHAR(150) NULL,
    direccion VARCHAR(255) NULL,
    latitud DOUBLE NULL,
    longitud DOUBLE NULL,
    alias_pago VARCHAR(60) NULL,
    tipo ENUM('concejal','empleado','profesional','proveedor','contratista','beneficiario','otro')
        NOT NULL DEFAULT 'beneficiario',
    subtipo VARCHAR(50) NULL,
    notas TEXT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_contacto_muni (municipio_id),
    INDEX idx_contacto_nombre (nombre),
    INDEX idx_contacto_dni (dni),
    INDEX idx_contacto_tipo (tipo),
    CONSTRAINT fk_contacto_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---- Gastos ----
CREATE TABLE IF NOT EXISTS gastos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    creador_id INT NOT NULL,

    destino_tipo ENUM('dependencia','contacto') NOT NULL,
    destino_dependencia_id INT NULL,
    destino_contacto_id INT NULL,

    concepto VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,

    monto_pesos DECIMAL(15,2) NOT NULL,
    cotizacion_usd DECIMAL(10,4) NULL,
    monto_usd DECIMAL(15,2) NULL,

    fecha DATE NOT NULL,

    tipo_financiacion ENUM('contado','cuotas','prestamo','recurrente') NOT NULL DEFAULT 'contado',
    forma_pago ENUM('efectivo','transferencia','cheque','tarjeta','mercadopago','otro')
        NOT NULL DEFAULT 'transferencia',

    cuotas_total INT NULL,
    frecuencia ENUM('semanal','quincenal','mensual','bimestral','trimestral','anual') NULL,
    fecha_fin_recurrencia DATE NULL,

    activo TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_gasto_muni (municipio_id),
    INDEX idx_gasto_destino_tipo (destino_tipo),
    INDEX idx_gasto_destino_dep (destino_dependencia_id),
    INDEX idx_gasto_destino_cont (destino_contacto_id),
    INDEX idx_gasto_concepto (concepto),
    INDEX idx_gasto_fecha (fecha),

    CONSTRAINT fk_gasto_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    CONSTRAINT fk_gasto_creador FOREIGN KEY (creador_id) REFERENCES usuarios(id),
    CONSTRAINT fk_gasto_dep FOREIGN KEY (destino_dependencia_id) REFERENCES municipio_dependencias(id) ON DELETE SET NULL,
    CONSTRAINT fk_gasto_contacto FOREIGN KEY (destino_contacto_id) REFERENCES contactos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---- Cuotas de gasto ----
CREATE TABLE IF NOT EXISTS gastos_cuotas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gasto_id INT NOT NULL,
    numero INT NOT NULL,
    monto DECIMAL(15,2) NOT NULL,

    fecha_vencimiento DATE NOT NULL,
    fecha_pago DATE NULL,

    estado ENUM('pendiente','pagada','vencida','cancelada')
        NOT NULL DEFAULT 'pendiente',

    forma_pago ENUM('efectivo','transferencia','cheque','tarjeta','mercadopago','otro') NULL,
    comprobante VARCHAR(255) NULL,
    notas TEXT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_cuota_gasto (gasto_id),
    INDEX idx_cuota_venc (fecha_vencimiento),
    INDEX idx_cuota_estado (estado),

    CONSTRAINT fk_cuota_gasto FOREIGN KEY (gasto_id) REFERENCES gastos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
