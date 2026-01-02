import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Home, Plus, ClipboardList, User, LogOut, Trophy, Building2, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { NotificacionesDropdown } from '../components/NotificacionesDropdown';
import { API_URL } from '../lib/api';

export default function MobileLayout() {
  const { theme } = useTheme();
  const { user, logout, municipioActual } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingMunicipio, setLoadingMunicipio] = useState(false);

  // Cargar municipio desde query param si viene ?municipio=xxx
  useEffect(() => {
    const municipioParam = searchParams.get('municipio');
    const savedMunicipio = localStorage.getItem('municipio_codigo');

    // Si hay param y es diferente al guardado, cargar datos del municipio
    if (municipioParam && municipioParam !== savedMunicipio) {
      loadMunicipioFromParam(municipioParam);
    }
  }, [searchParams]);

  const loadMunicipioFromParam = async (codigo: string) => {
    setLoadingMunicipio(true);
    try {
      const response = await fetch(`${API_URL}/municipios/public`);
      if (response.ok) {
        const municipios = await response.json();
        const found = municipios.find((m: { codigo: string }) =>
          m.codigo.toLowerCase() === codigo.toLowerCase()
        );
        if (found) {
          localStorage.setItem('municipio_codigo', found.codigo);
          localStorage.setItem('municipio_id', found.id.toString());
          localStorage.setItem('municipio_nombre', found.nombre);
          localStorage.setItem('municipio_color', found.color_primario);
          if (found.logo_url) {
            localStorage.setItem('municipio_logo_url', found.logo_url);
          }
          // Limpiar query param de la URL
          searchParams.delete('municipio');
          setSearchParams(searchParams, { replace: true });
          // Forzar recarga para aplicar el tema
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Error cargando municipio:', error);
    } finally {
      setLoadingMunicipio(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/bienvenido');
  };

  // Si está cargando el municipio, mostrar loader
  if (loadingMunicipio) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  // Verificar que hay municipio seleccionado
  const hasMunicipio = localStorage.getItem('municipio_codigo');
  if (!hasMunicipio && !searchParams.get('municipio')) {
    // Redirigir a landing para seleccionar municipio
    navigate('/bienvenido', { replace: true });
    return null;
  }

  // Nombre del municipio
  const nombreMunicipio = municipioActual?.nombre?.replace('Municipalidad de ', '')
    || localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '')
    || 'Mi Municipio';

  // Logo y color del municipio
  const logoUrl = municipioActual?.logo_url || null;
  const colorPrimario = municipioActual?.color_primario || theme.primary;

  const tabs = [
    { path: '/app', icon: Home, label: 'Inicio', end: true },
    { path: '/app/mis-reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
    { path: '/app/nuevo', icon: Plus, label: 'Nuevo', end: false, isMain: true },
    { path: '/app/logros', icon: Trophy, label: 'Logros', end: false },
    { path: '/app/perfil', icon: User, label: 'Perfil', end: false },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Header mejorado con logo del municipio */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: theme.card,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${colorPrimario}20` }}
          >
            <Building2 className="h-5 w-5" style={{ color: colorPrimario }} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight" style={{ color: theme.text }}>
              {nombreMunicipio}
            </h1>
            {user && (
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Hola, {user.nombre}
              </p>
            )}
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-1">
            <NotificacionesDropdown />
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
              style={{ color: theme.textSecondary }}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main style={{ paddingTop: '64px', paddingBottom: '80px', minHeight: '100vh' }}>
        <Outlet />
      </main>

      {/* Bottom Tab Bar - 5 tabs con botón central destacado */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
        style={{
          backgroundColor: theme.card,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center justify-around py-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className="flex flex-col items-center py-1 px-2 min-w-0"
            >
              {({ isActive }) => (
                <>
                  {tab.isMain ? (
                    // Botón central destacado para "Nuevo"
                    <div
                      className="w-10 h-10 -mt-3 rounded-full flex items-center justify-center shadow-lg"
                      style={{
                        backgroundColor: theme.primary,
                        boxShadow: `0 4px 12px ${theme.primary}50`,
                      }}
                    >
                      <tab.icon className="h-5 w-5 text-white" />
                    </div>
                  ) : (
                    <div
                      className="p-2 rounded-xl transition-all"
                      style={{
                        backgroundColor: isActive ? `${theme.primary}15` : 'transparent',
                      }}
                    >
                      <tab.icon
                        className="h-5 w-5"
                        style={{ color: isActive ? theme.primary : theme.textSecondary }}
                      />
                    </div>
                  )}
                  <span
                    className="text-[10px] mt-0.5 font-medium"
                    style={{
                      color: tab.isMain
                        ? theme.primary
                        : isActive
                          ? theme.primary
                          : theme.textSecondary
                    }}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Safe area padding for iOS */}
      <style>{`
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom, 8px);
        }
      `}</style>
    </div>
  );
}
