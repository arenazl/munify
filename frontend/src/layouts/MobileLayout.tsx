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
          // Guardar coordenadas para filtrar direcciones
          if (found.latitud) localStorage.setItem('municipio_lat', String(found.latitud));
          if (found.longitud) localStorage.setItem('municipio_lon', String(found.longitud));
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
    { path: '/app/nuevo', icon: Plus, label: 'Crear', end: false, isMain: true },
    { path: '/app/logros', icon: Trophy, label: 'Logros', end: false },
    { path: '/app/perfil', icon: User, label: 'Perfil', end: false },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Header sticky con glassmorphism */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: `${theme.card}e8`,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${theme.border}40`,
        }}
      >
        {/* Espacio izquierdo (para balance visual) */}
        <div className="w-10"></div>

        {/* Centro: Logo + Nombre del municipio */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${colorPrimario}25, ${colorPrimario}10)`,
              border: `1px solid ${colorPrimario}30`,
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={nombreMunicipio}
                className="w-5 h-5 object-contain"
              />
            ) : (
              <Building2 className="h-4 w-4" style={{ color: colorPrimario }} />
            )}
          </div>
          <h1 className="text-sm font-semibold truncate" style={{ color: theme.text }}>
            {nombreMunicipio}
          </h1>
        </div>

        {/* Derecha: Notificaciones + Logout */}
        {user && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <NotificacionesDropdown />
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl transition-all active:scale-95 hover:bg-red-500/10"
              style={{ color: theme.textSecondary }}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main style={{ paddingTop: '64px', paddingBottom: '100px', minHeight: '100vh' }}>
        <Outlet />
      </main>

      {/* Bottom Tab Bar - Diseño moderno con isla flotante */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-2">
        <div
          className="mx-auto max-w-md rounded-2xl px-1 py-1.5 flex items-center justify-around"
          style={{
            backgroundColor: `${theme.card}f5`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: `0 -4px 32px rgba(0,0,0,0.12), 0 0 0 1px ${theme.border}30`,
          }}
        >
          {tabs.map((tab) => {
            // Para el botón central (Crear)
            if (tab.isMain) {
              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className="relative -mt-5 flex flex-col items-center"
                >
                  {/* Glow effect behind */}
                  <div
                    className="absolute w-16 h-16 rounded-2xl blur-xl opacity-40"
                    style={{ backgroundColor: theme.primary }}
                  />
                  {/* Botón flotante con gradiente */}
                  <div
                    className="relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90 hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}cc)`,
                      boxShadow: `0 4px 20px ${theme.primary}50`,
                    }}
                  >
                    <Plus className="h-7 w-7 text-white" strokeWidth={2.5} />
                  </div>
                  <span
                    className="text-[10px] mt-1 font-semibold"
                    style={{ color: theme.primary }}
                  >
                    {tab.label}
                  </span>
                </NavLink>
              );
            }

            // Tabs normales
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                className="flex flex-col items-center py-1 px-2 min-w-0"
              >
                {({ isActive }) => (
                  <>
                    <div
                      className="p-2 rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: isActive ? `${theme.primary}15` : 'transparent',
                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                      }}
                    >
                      <tab.icon
                        className="h-5 w-5 transition-all"
                        style={{
                          color: isActive ? theme.primary : theme.textSecondary,
                          strokeWidth: isActive ? 2.5 : 2,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] mt-0.5 font-medium transition-colors"
                      style={{
                        color: isActive ? theme.primary : theme.textSecondary
                      }}
                    >
                      {tab.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Safe area for iOS */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </div>
  );
}
