import { ReactNode } from 'react';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';

interface SectionHeaderProps {
  // Contenido principal
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;

  // Navegación
  backLink?: string; // URL para volver
  onBack?: () => void; // Alternativa: función de callback

  // Acciones a la derecha
  actions?: ReactNode;

  // Estilos
  compact?: boolean; // Versión más compacta para paneles internos
}

export function SectionHeader({
  title,
  description,
  icon: Icon,
  iconColor,
  backLink,
  onBack,
  actions,
  compact = false,
}: SectionHeaderProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backLink) {
      navigate(backLink);
    } else {
      navigate(-1); // Volver atrás en el historial
    }
  };

  const showBackButton = backLink || onBack;
  const resolvedIconColor = iconColor || theme.primary;

  return (
    <div
      className={`rounded-xl ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Lado izquierdo: Back + Icono + Título */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Botón volver */}
          {showBackButton && (
            <button
              onClick={handleBack}
              className="p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
              style={{
                backgroundColor: `${theme.primary}15`,
                color: theme.primary,
              }}
              title="Volver"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          {/* Icono */}
          {Icon && (
            <div
              className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} rounded-lg flex items-center justify-center flex-shrink-0`}
              style={{ backgroundColor: `${resolvedIconColor}20` }}
            >
              <Icon className={`${compact ? 'h-4 w-4' : 'h-5 w-5'}`} style={{ color: resolvedIconColor }} />
            </div>
          )}

          {/* Título y descripción */}
          <div className="min-w-0">
            <h2
              className={`${compact ? 'text-base' : 'text-lg'} font-bold truncate`}
              style={{ color: theme.text }}
            >
              {title}
            </h2>
            {description && (
              <p
                className="text-sm truncate"
                style={{ color: theme.textSecondary }}
              >
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Lado derecho: Acciones */}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// Componente auxiliar para crear un panel completo con header
interface SectionPanelProps {
  // Header props
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconColor?: string;
  backLink?: string;
  onBack?: () => void;
  actions?: ReactNode;

  // Panel content
  children: ReactNode;

  // Estilos
  noPadding?: boolean;
}

export function SectionPanel({
  title,
  description,
  icon,
  iconColor,
  backLink,
  onBack,
  actions,
  children,
  noPadding = false,
}: SectionPanelProps) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: theme.border }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Lado izquierdo */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Botón volver */}
            {(backLink || onBack) && (
              <Link
                to={backLink || '#'}
                onClick={(e) => {
                  if (onBack) {
                    e.preventDefault();
                    onBack();
                  }
                }}
                className="p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
                style={{
                  backgroundColor: `${theme.primary}15`,
                  color: theme.primary,
                }}
                title="Volver"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}

            {/* Icono */}
            {icon && (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${iconColor || theme.primary}20` }}
              >
                {(() => {
                  const Icon = icon;
                  return <Icon className="h-5 w-5" style={{ color: iconColor || theme.primary }} />;
                })()}
              </div>
            )}

            {/* Título */}
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: theme.text }}>
                {title}
              </h2>
              {description && (
                <p className="text-sm truncate" style={{ color: theme.textSecondary }}>
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Acciones */}
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={noPadding ? '' : 'p-5'}>
        {children}
      </div>
    </div>
  );
}

// Toggle switch reutilizable
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, label, description, disabled = false }: ToggleSwitchProps) {
  const { theme } = useTheme();

  return (
    <div className="flex items-center justify-between gap-3">
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <p className="text-sm font-medium" style={{ color: theme.text }}>
              {label}
            </p>
          )}
          {description && (
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              {description}
            </p>
          )}
        </div>
      )}
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className="relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
        style={{
          backgroundColor: checked ? theme.primary : theme.border,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div
          className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200"
          style={{
            transform: checked ? 'translateX(26px)' : 'translateX(4px)',
          }}
        />
      </button>
    </div>
  );
}
