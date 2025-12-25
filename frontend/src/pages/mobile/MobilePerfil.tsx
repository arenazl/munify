import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  LogOut,
  ChevronRight,
  Bell,
  HelpCircle,
  Moon,
  Sun,
  Building2
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export default function MobilePerfil() {
  const { theme, themeName, setTheme } = useTheme();
  const isDarkMode = themeName === 'dark';
  const toggleDarkMode = () => setTheme(isDarkMode ? 'light' : 'dark');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/app');
  };

  if (!user) {
    return (
      <div className="p-4 space-y-6">
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div
            className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <User className="h-10 w-10" style={{ color: theme.textSecondary }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
            No has iniciado sesión
          </h2>
          <p className="text-sm mb-6" style={{ color: theme.textSecondary }}>
            Iniciá sesión para ver tu perfil y hacer seguimiento de tus reclamos
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/app/login')}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => navigate('/app/register')}
              className="w-full py-3 px-4 rounded-xl font-semibold"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              Crear Cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      icon: Bell,
      label: 'Notificaciones',
      subtitle: 'Configurar alertas',
      action: () => {},
    },
    {
      icon: isDarkMode ? Sun : Moon,
      label: 'Tema',
      subtitle: isDarkMode ? 'Modo oscuro' : 'Modo claro',
      action: toggleDarkMode,
      toggle: true,
    },
    {
      icon: HelpCircle,
      label: 'Ayuda',
      subtitle: 'Preguntas frecuentes',
      action: () => {},
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <div
        className="rounded-2xl p-6"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}aa)`,
              color: '#fff',
            }}
          >
            {user.nombre.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              {user.nombre} {user.apellido}
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Vecino
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4" style={{ color: theme.textSecondary }} />
            <span className="text-sm" style={{ color: theme.text }}>{user.email}</span>
          </div>
          {user.telefono && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4" style={{ color: theme.textSecondary }} />
              <span className="text-sm" style={{ color: theme.text }}>{user.telefono}</span>
            </div>
          )}
        </div>
      </div>

      <div
        className="rounded-2xl p-4 flex items-center gap-3"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${theme.primary}15` }}
        >
          <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
        </div>
        <div className="flex-1">
          <p className="text-xs" style={{ color: theme.textSecondary }}>Tu municipio</p>
          <p className="font-medium" style={{ color: theme.text }}>
            {localStorage.getItem('municipio_nombre') || 'No seleccionado'}
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('municipio_codigo');
            localStorage.removeItem('municipio_id');
            localStorage.removeItem('municipio_nombre');
            localStorage.removeItem('municipio_color');
            navigate('/bienvenido');
          }}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
        >
          Cambiar
        </button>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        {menuItems.map((item, index) => (
          <button
            key={item.label}
            onClick={item.action}
            className="w-full flex items-center gap-3 p-4 transition-colors active:opacity-80"
            style={{
              borderBottom: index !== menuItems.length - 1 ? `1px solid ${theme.border}` : 'none',
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <item.icon className="h-5 w-5" style={{ color: theme.textSecondary }} />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium" style={{ color: theme.text }}>{item.label}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>{item.subtitle}</p>
            </div>
            {item.toggle ? (
              <div
                className="w-12 h-7 rounded-full p-1 transition-all"
                style={{
                  backgroundColor: isDarkMode ? theme.primary : theme.backgroundSecondary,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white transition-transform"
                  style={{
                    transform: isDarkMode ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </div>
            ) : (
              <ChevronRight className="h-5 w-5" style={{ color: theme.textSecondary }} />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl transition-colors active:opacity-80"
        style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
      >
        <LogOut className="h-5 w-5" />
        <span className="font-medium">Cerrar Sesión</span>
      </button>

      <p className="text-center text-xs" style={{ color: theme.textSecondary }}>
        Versión 1.0.0
      </p>
    </div>
  );
}
