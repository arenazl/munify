import { useState, forwardRef, InputHTMLAttributes } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import type { ValidationResult } from '../../lib/validations';

interface ValidatedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
  success?: boolean;
  hint?: string;
  validate?: (value: string) => ValidationResult;
  onChange?: (value: string) => void;
  showPasswordToggle?: boolean;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  (
    {
      label,
      icon,
      error: externalError,
      success,
      hint,
      validate,
      onChange,
      showPasswordToggle,
      type = 'text',
      className = '',
      required,
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();
    const [touched, setTouched] = useState(false);
    const [internalError, setInternalError] = useState<string | undefined>();
    const [showPassword, setShowPassword] = useState(false);

    const error = externalError || (touched ? internalError : undefined);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (validate) {
        const result = validate(value);
        setInternalError(result.error);
      }

      onChange?.(value);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setTouched(true);

      if (validate) {
        const result = validate(e.target.value);
        setInternalError(result.error);
      }

      props.onBlur?.(e);
    };

    const getBorderColor = () => {
      if (error) return '#ef4444';
      if (success && touched) return '#22c55e';
      return theme.border;
    };

    const getRingColor = () => {
      if (error) return 'rgba(239, 68, 68, 0.2)';
      if (success && touched) return 'rgba(34, 197, 94, 0.2)';
      return `${theme.primary}30`;
    };

    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium mb-1.5" style={{ color: theme.text }}>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && (
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: error ? '#ef4444' : theme.textSecondary }}
            >
              {icon}
            </div>
          )}

          <input
            ref={ref}
            type={inputType}
            className="w-full py-3 rounded-xl focus:ring-2 focus:outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${getBorderColor()}`,
              paddingLeft: icon ? '3rem' : '1rem',
              paddingRight: (isPassword && showPasswordToggle) || error || (success && touched) ? '3rem' : '1rem',
              boxShadow: touched && (error || success) ? `0 0 0 3px ${getRingColor()}` : undefined,
            }}
            onChange={handleChange}
            onBlur={handleBlur}
            {...props}
          />

          {/* Password toggle */}
          {isPassword && showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none"
              style={{ color: theme.textSecondary }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          )}

          {/* Status icon */}
          {!isPassword && error && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
          )}

          {!isPassword && success && touched && !error && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </p>
        )}

        {/* Hint */}
        {hint && !error && (
          <p className="mt-1.5 text-xs" style={{ color: theme.textSecondary }}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);

ValidatedInput.displayName = 'ValidatedInput';
