/**
 * Validaciones de formularios consistentes para toda la aplicación
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface FieldValidation {
  validate: (value: string) => ValidationResult;
  required?: boolean;
}

// Validadores individuales
export const validators = {
  required: (value: string, fieldName = 'Este campo'): ValidationResult => {
    const trimmed = value?.trim() || '';
    if (!trimmed) {
      return { isValid: false, error: `${fieldName} es obligatorio` };
    }
    return { isValid: true };
  },

  minLength: (value: string, min: number, fieldName = 'Este campo'): ValidationResult => {
    if (value.length < min) {
      return { isValid: false, error: `${fieldName} debe tener al menos ${min} caracteres` };
    }
    return { isValid: true };
  },

  maxLength: (value: string, max: number, fieldName = 'Este campo'): ValidationResult => {
    if (value.length > max) {
      return { isValid: false, error: `${fieldName} no puede tener más de ${max} caracteres` };
    }
    return { isValid: true };
  },

  email: (value: string): ValidationResult => {
    if (!value) return { isValid: true }; // Si está vacío, required lo maneja
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return { isValid: false, error: 'Ingresá un email válido' };
    }
    return { isValid: true };
  },

  password: (value: string): ValidationResult => {
    if (!value) return { isValid: true };
    if (value.length < 6) {
      return { isValid: false, error: 'La contraseña debe tener al menos 6 caracteres' };
    }
    return { isValid: true };
  },

  nombre: (value: string): ValidationResult => {
    if (!value?.trim()) return { isValid: true };
    if (value.trim().length < 2) {
      return { isValid: false, error: 'El nombre debe tener al menos 2 caracteres' };
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(value.trim())) {
      return { isValid: false, error: 'El nombre solo puede contener letras' };
    }
    return { isValid: true };
  },

  telefono: (value: string): ValidationResult => {
    if (!value) return { isValid: true };
    const cleaned = value.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[\d]{8,15}$/.test(cleaned)) {
      return { isValid: false, error: 'Ingresá un número de teléfono válido' };
    }
    return { isValid: true };
  },

  direccion: (value: string): ValidationResult => {
    if (!value?.trim()) return { isValid: true };
    if (value.trim().length < 5) {
      return { isValid: false, error: 'La dirección debe tener al menos 5 caracteres' };
    }
    return { isValid: true };
  },
};

// Validar múltiples reglas para un campo
export function validateField(
  value: string,
  rules: Array<(val: string) => ValidationResult>
): ValidationResult {
  for (const rule of rules) {
    const result = rule(value);
    if (!result.isValid) {
      return result;
    }
  }
  return { isValid: true };
}

// Schemas de validación para formularios comunes
export const validationSchemas = {
  login: {
    email: (value: string) => validateField(value, [
      (v) => validators.required(v, 'El email'),
      validators.email,
    ]),
    password: (value: string) => validateField(value, [
      (v) => validators.required(v, 'La contraseña'),
    ]),
  },

  register: {
    nombre: (value: string) => validateField(value, [
      (v) => validators.required(v, 'El nombre'),
      validators.nombre,
    ]),
    email: (value: string) => validateField(value, [
      (v) => validators.required(v, 'El email'),
      validators.email,
    ]),
    password: (value: string) => validateField(value, [
      (v) => validators.required(v, 'La contraseña'),
      validators.password,
    ]),
  },

  reclamo: {
    titulo: (value: string) => validateField(value, [
      (v) => validators.required(v, 'El título'),
      (v) => validators.minLength(v, 5, 'El título'),
      (v) => validators.maxLength(v, 100, 'El título'),
    ]),
    descripcion: (value: string) => validateField(value, [
      (v) => validators.required(v, 'La descripción'),
      (v) => validators.minLength(v, 10, 'La descripción'),
      (v) => validators.maxLength(v, 2000, 'La descripción'),
    ]),
    direccion: (value: string) => validateField(value, [
      (v) => validators.required(v, 'La dirección'),
      validators.direccion,
    ]),
    categoria_id: (value: string) => validateField(value, [
      (v) => validators.required(v, 'La categoría'),
    ]),
  },
};

// Hook helper para estado de validación
export interface FieldState {
  value: string;
  error: string;
  touched: boolean;
}

export function getFieldError(
  field: FieldState,
  validator: (value: string) => ValidationResult
): string | undefined {
  if (!field.touched) return undefined;
  const result = validator(field.value);
  return result.error;
}
