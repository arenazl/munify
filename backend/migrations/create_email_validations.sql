-- Migración: Tabla de validación de cambio de email
-- Fecha: 2026-02-02

CREATE TABLE IF NOT EXISTS email_validations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    nuevo_email VARCHAR(255) NOT NULL,
    codigo VARCHAR(10) NOT NULL,
    validado BOOLEAN DEFAULT FALSE,
    usado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    validated_at TIMESTAMP NULL,

    INDEX idx_usuario_id (usuario_id),
    INDEX idx_nuevo_email (nuevo_email),
    INDEX idx_codigo (codigo),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
