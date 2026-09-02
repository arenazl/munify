import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Home, Plus, ClipboardList, User, LogOut, FileCheck, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
// alpha() entiende cualquier formato de color; pegar digitos al final de
// un color solo funciona si SIEMPRE es un hex de seis, y no lo es.
import { alpha } from '../lib/colorUtils';
import { useAuth } from '../contexts/AuthContext';
import { NotificacionesDropdown } from '../components/NotificacionesDropdown';
import { BrandMark } from '../brands/BrandMark';
import { logoDelMunicipio } from '../brands';
import { FabActionSheet } from '../components/mobile/FabActionSheet';
import { API_URL } from '../lib/api';

export default function MobileLayout() {
  const { theme } = useTheme();
  const { user, logout, municipioActual } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingMunicipio, setLoadingMunicipio] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

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

  // Logo y color del municipio. El logo pasa por `logoDelMunicipio`: en una
  // marca mono-tenant manda la marca y devuelve null (el header cae en
  // BrandMark) — si no, la demo Munify sobre el municipio de Paraguay Limpio
  // mostraría el logo de la otra marca.
  const logoUrl = logoDelMunicipio(municipioActual?.logo_url);
  const colorPrimario = municipioActual?.color_primario || theme.primary;

  const tabs = [
    { path: '/app', icon: Home, label: 'Inicio', end: true },
    { path: '/app/mis-reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
    { path: '/app/nuevo', icon: Plus, label: 'Crear', end: false, isMain: true },
    { path: '/app/mis-tramites', icon: FileCheck, label: 'Trámites', end: false },
    { path: '/app/perfil', icon: User, label: 'Perfil', end: false },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Header sticky con glassmorphism */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-4 pb-3 flex items-center justify-between"
        style={{
          backgroundColor: `${alpha(theme.card, 0.91)}`,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${alpha(theme.border, 0.25)}`,
          // Ver la nota del header del shell: la PWA dibuja bajo la barra de
          // estado, así que el título baja lo que mida el notch de cada modelo.
          paddingTop: 'max(env(safe-area-inset-top), 12px)',
        }}
      >
        {/* Espacio izquierdo (para balance visual) */}
        <div className="w-10"></div>

        {/* Centro: Logo + Nombre del municipio. Sin logo del muni (marca
            mono-tenant o municipio que no cargó el suyo) va la marca activa,
            SUELTA: el badge con fill es para la imagen del municipio, no para
            un logo de marca. */}
        <div className="flex-1 flex items-center justify-center gap-2">
          {logoUrl ? (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${alpha(colorPrimario, 0.15)}, ${alpha(colorPrimario, 0.06)})`,
                border: `1px solid ${alpha(colorPrimario, 0.19)}`,
              }}
            >
              <img src={logoUrl} alt={nombreMunicipio} className="w-5 h-5 object-contain" />
            </div>
          ) : (
            <BrandMark size={26} className="flex-shrink-0" />
          )}
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
      {/* El header crece con la safe area del teléfono, así que el contenido
          arranca más abajo en la misma medida: con los 64px fijos de antes, el
          primer bloque quedaba debajo del header en los modelos con notch. */}
      <main style={{ paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))', paddingBottom: '100px', minHeight: '100vh' }}>
        <Outlet />
      </main>

      {/* Bottom Tab Bar - Diseño moderno con isla flotante */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-2">
        <div
          className="mx-auto max-w-md rounded-2xl px-1 py-1.5 flex items-center justify-around"
          style={{
            backgroundColor: `${alpha(theme.card, 0.96)}`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: `0 -4px 32px rgba(0,0,0,0.12), 0 0 0 1px ${alpha(theme.border, 0.19)}`,
          }}
        >
          {tabs.map((tab) => {
            // Para el botón central (Crear) — abre action sheet con opciones Reclamo/Trámite
            if (tab.isMain) {
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => setFabOpen(true)}
                  className="relative -mt-5 flex flex-col items-center"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  {/* Glow effect behind */}
                  <div
                    className="absolute w-16 h-16 rounded-2xl blur-xl opacity-40"
                    style={{ backgroundColor: theme.primary }}
                  />
                  {/* Botón flotante con gradiente.
                      Antes las transparencias se armaban pegando dígitos al
                      final del color (`${alpha(theme.primary, 0.8)}`, `${alpha(theme.primary, 0.31)}`).
                      Eso da por hecho que el acento SIEMPRE es un hex de seis
                      dígitos: si un preset lo define de otra forma, el string
                      queda inválido y el navegador pinta cualquier cosa —de ahí
                      el rojizo raro—. `alpha()` entiende cualquier formato. */}
                  <div
                    className="relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90 hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}, ${alpha(theme.primary, 0.8)})`,
                      boxShadow: `0 4px 20px ${alpha(theme.primary, 0.31)}`,
                      transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease',
                    }}
                  >
                    {/* Blanco o negro según la luminancia del acento, no fijo:
                        sobre un acento claro el blanco no se lee. */}
                    <Plus
                      className="h-7 w-7"
                      strokeWidth={2.5}
                      style={{ color: 'var(--pl-on-accent)' }}
                    />
                  </div>
                  <span
                    className="text-[10px] mt-1 font-semibold"
                    style={{ color: theme.primary }}
                  >
                    {tab.label}
                  </span>
                </button>
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
                        backgroundColor: isActive ? `${alpha(theme.primary, 0.08)}` : 'transparent',
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

      <FabActionSheet open={fabOpen} onClose={() => setFabOpen(false)} />
    </div>
  );
}
