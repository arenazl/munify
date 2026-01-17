import { Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface SettingsHeaderProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor?: string;
  backTo?: string;
  // Botón guardar
  showSave?: boolean;
  onSave?: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  // Badge de estado
  statusBadge?: React.ReactNode;
}

export default function SettingsHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  backTo = '/gestion/ajustes',
  showSave = false,
  onSave,
  saving = false,
  saveDisabled = false,
  saveLabel = 'Guardar',
  statusBadge,
}: SettingsHeaderProps) {
  const { theme } = useTheme();
  const color = iconColor || theme.primary;

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Izquierda: Volver + Icono + Título */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Botón volver */}
          <Link
            to={backTo}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 flex-shrink-0"
            style={{
              backgroundColor: `${theme.primary}15`,
              color: theme.primary,
            }}
            title="Volver a Ajustes"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {/* Icono de la sección */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}20` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>

          {/* Título y subtítulo */}
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: theme.text }}>
              {title}
            </h1>
            <p className="text-sm truncate" style={{ color: theme.textSecondary }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* Derecha: Badge de estado + Botón guardar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Badge de estado opcional */}
          {statusBadge}

          {/* Botón guardar */}
          {showSave && onSave && (
            <button
              onClick={onSave}
              disabled={saving || saveDisabled}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 hover:shadow-lg"
              style={{
                background: saveDisabled
                  ? theme.backgroundSecondary
                  : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                color: saveDisabled ? theme.textSecondary : '#ffffff',
              }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{saveLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
