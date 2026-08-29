import { useEffect, useState } from 'react';
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
  Building2,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import NotificationSettings from '../../components/NotificationSettings';
import { ModernSelect, type SelectOption } from '../../components/ui/ModernSelect';
import { municipiosApi, usersApi } from '../../lib/api';

export default function MobilePerfil() {
  const { theme, currentMode, setPreset } = useTheme();
  // El modo lo declara el tema de fondo activo (antes se adivinaba con una
  // lista de ids, y el toggle apuntaba a presets que ya no existían).
  const isDarkMode = currentMode === 'oscuro';
  const toggleDarkMode = () => {
    setPreset(isDarkMode ? 'niebla' : 'carbon');
  };
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  // El barrio del vecino: con esto el municipio le manda solo lo que le toca
  // (la recoleccion de SU barrio, no la de los otros doce).
  const [barrios, setBarrios] = useState<Array<{ id: number; nombre: string }>>([]);
  const [barrioId, setBarrioId] = useState<string>(user?.barrio_id ? String(user.barrio_id) : '');
  const [guardandoBarrio, setGuardandoBarrio] = useState(false);

  useEffect(() => {
    if (!user?.municipio_id) return;
    municipiosApi.getBarrios(user.municipio_id)
      .then((r) => setBarrios((r.data as Array<{ id: number; nombre: string }>) || []))
      .catch(() => setBarrios([]));
  }, [user?.municipio_id]);

  const guardarBarrio = async (valor: string) => {
    const anterior = barrioId;
    setBarrioId(valor);
    setGuardandoBarrio(true);
    try {
      await usersApi.updateMyProfile({ barrio_id: valor ? Number(valor) : null });
      toast.success(valor ? 'Listo: vas a recibir los avisos de tu barrio' : 'Vas a recibir los avisos generales');
    } catch {
      // Se vuelve atras: dejar el selector mostrando un barrio que no se
      // guardo haria creer al vecino que esta recibiendo avisos que no le
      // van a llegar.
      setBarrioId(anterior);
      toast.error('No se pudo guardar el barrio');
    } finally {
      setGuardandoBarrio(false);
    }
  };

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

  const opcionesBarrio: SelectOption[] = [
    { value: '', label: 'Todo el municipio' },
    ...barrios.map((b) => ({ value: String(b.id), label: b.nombre })),
  ];

  const menuItems = [
    {
      icon: Bell,
      label: 'Notificaciones',
      subtitle: 'Configurar alertas',
      action: () => setShowNotificationSettings(true),
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
              color: 'var(--pl-on-accent)',
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

      {barrios.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}15` }}
            >
              <MapPin className="h-5 w-5" style={{ color: theme.primary }} />
            </div>
            <div className="flex-1">
              <p className="text-xs" style={{ color: theme.textSecondary }}>Tu barrio</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Para recibir los avisos que son de tu zona
              </p>
            </div>
          </div>
          <ModernSelect
            options={opcionesBarrio}
            value={barrioId}
            onChange={guardarBarrio}
            placeholder="Elegí tu barrio"
            disabled={guardandoBarrio}
          />
        </div>
      )}

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

      <NotificationSettings
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
      />
    </div>
  );
}
