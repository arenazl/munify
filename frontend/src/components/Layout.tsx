import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, Palette, Building2, Settings, ChevronLeft, ChevronRight, User, ChevronDown, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, themes, ThemeName, accentColors } from '../contexts/ThemeContext';
import { getNavigation } from '../config/navigation';
import { PageTransition } from './ui/PageTransition';
import { ChatWidget } from './ChatWidget';
import { NotificacionesDropdown } from './NotificacionesDropdown';
import { MunicipioSelector } from './MunicipioSelector';
import { Sheet } from './ui/Sheet';
import { usersApi } from '../lib/api';
import NotificationSettings from './NotificationSettings';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [profileData, setProfileData] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    dni: '',
    direccion: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const { user, logout, municipioActual, refreshUser } = useAuth();
  const { theme, themeName, setTheme, customPrimary, setCustomPrimary, customSidebar, setCustomSidebar, sidebarBgImage, setSidebarBgImage, sidebarBgOpacity, setSidebarBgOpacity } = useTheme();
  const location = useLocation();

  // Guardar estado del sidebar en localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Cargar datos del usuario cuando se abre el sheet de perfil
  useEffect(() => {
    if (profileSheetOpen && user) {
      setProfileData({
        nombre: user.nombre || '',
        apellido: user.apellido || '',
        telefono: user.telefono || '',
        dni: user.dni || '',
        direccion: user.direccion || '',
      });
    }
  }, [profileSheetOpen, user]);

  const handleOpenProfile = () => {
    setUserMenuOpen(false);
    setProfileSheetOpen(true);
  };

  const handleOpenNotificationSettings = () => {
    setUserMenuOpen(false);
    setNotificationSettingsOpen(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await usersApi.updateMyProfile(profileData);
      // Refrescar datos del usuario en el context
      await refreshUser();
      setProfileSheetOpen(false);
    } catch (error) {
      console.error('Error al guardar perfil:', error);
    } finally {
      setSavingProfile(false);
    }
  };

  // Obtener nombre del municipio actual (del context o localStorage)
  const nombreMunicipio = municipioActual
    ? municipioActual.nombre
    : localStorage.getItem('municipio_nombre') || 'Municipalidad';

  if (!user) return null;

  const navigation = getNavigation(user.rol);

  // Anchos dinámicos con valores fijos para transiciones suaves
  const sidebarWidthPx = sidebarCollapsed ? 80 : 256; // 80px = w-20, 256px = w-64

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.contentBackground }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 shadow-xl transform lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: theme.sidebar,
          width: sidebarWidthPx,
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease-out, background-color 0.3s ease',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Imagen de fondo del sidebar */}
        {sidebarBgImage && (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${sidebarBgImage})`,
              opacity: sidebarBgOpacity,
              transition: 'opacity 0.3s ease',
            }}
          />
        )}
        {/* Overlay para mejorar legibilidad */}
        {sidebarBgImage && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${theme.sidebar}dd 0%, ${theme.sidebar}99 50%, ${theme.sidebar}dd 100%)`,
            }}
          />
        )}
        {/* Header del sidebar */}
        <div className="relative z-10 flex items-center justify-between h-16 border-b" style={{ borderColor: `${theme.sidebarTextSecondary}30`, paddingLeft: sidebarCollapsed ? '8px' : '12px', paddingRight: sidebarCollapsed ? '8px' : '12px', transition: 'padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <div
            className="flex items-center gap-3 flex-1 min-w-0"
            style={{
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              transition: 'justify-content 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Building2 className="h-10 w-10 flex-shrink-0" style={{ color: theme.sidebarText }} />
            <div
              className="flex flex-col leading-tight min-w-0 flex-1"
              style={{
                width: sidebarCollapsed ? 0 : '100%',
                opacity: sidebarCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <span className="text-[10px] font-light tracking-wide whitespace-nowrap" style={{ color: theme.sidebarTextSecondary }}>Municipalidad</span>
              <span className="text-base font-bold truncate" style={{ color: theme.sidebarText }}>{nombreMunicipio}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Botón colapsar - solo en desktop */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
              style={{ color: theme.sidebarTextSecondary }}
              title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
            {/* Botón cerrar - solo en mobile */}
            <button
              className="lg:hidden p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
              onClick={() => setSidebarOpen(false)}
              style={{ color: theme.sidebarText }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navegación */}
        <nav className="relative z-10 flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className="flex items-center py-2.5 rounded-lg text-sm font-medium active:scale-[0.98] group relative overflow-hidden"
                style={{
                  backgroundColor: isActive ? theme.primary : 'transparent',
                  color: isActive ? '#ffffff' : theme.sidebarTextSecondary,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  paddingLeft: sidebarCollapsed ? '8px' : '12px',
                  paddingRight: sidebarCollapsed ? '8px' : '12px',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onClick={() => setSidebarOpen(false)}
                title={sidebarCollapsed ? item.name : undefined}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = `${theme.primary}20`;
                    e.currentTarget.style.color = theme.sidebarText;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = theme.sidebarTextSecondary;
                  }
                }}
              >
                {/* Barra lateral animada */}
                <div
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200 ${isActive ? 'h-6 opacity-100' : 'h-0 opacity-0 group-hover:h-4 group-hover:opacity-100'}`}
                  style={{ backgroundColor: isActive ? '#ffffff' : theme.primary }}
                />
                <Icon
                  className="h-5 w-5 flex-shrink-0"
                  style={{
                    marginRight: sidebarCollapsed ? 0 : '12px',
                    transition: 'margin 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
                <span
                  className="whitespace-nowrap"
                  style={{
                    width: sidebarCollapsed ? 0 : 'auto',
                    opacity: sidebarCollapsed ? 0 : 1,
                    overflow: 'hidden',
                    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {item.name}
                </span>
                {isActive && !sidebarCollapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

      </div>

      {/* Main content */}
      <div className="lg:transition-[padding] lg:duration-300 main-content-area">
        {/* Top bar */}
        <header
          className="sticky top-0 z-40 shadow-sm backdrop-blur-md transition-colors duration-300 overflow-visible"
          style={{ backgroundColor: `${theme.card}ee` }}
        >
          <div className="flex items-center justify-between h-16 px-4 overflow-visible">
            <button
              className="lg:hidden p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
              onClick={() => setSidebarOpen(true)}
              style={{ color: theme.text }}
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Selector de Municipio - visible en el centro */}
            <div className="flex-1 flex justify-center lg:justify-start overflow-visible">
              <MunicipioSelector />
            </div>

            <div className="flex items-center space-x-3">
              {/* User info con dropdown */}
              <div className="relative">
                {/* Botón mobile - solo avatar */}
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="sm:hidden p-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {user.nombre[0]}{user.apellido[0]}
                  </div>
                </button>
                {/* Botón desktop - avatar + nombre */}
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="hidden sm:flex items-center gap-3 pr-3 border-r cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ borderColor: theme.border }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {user.nombre[0]}{user.apellido[0]}
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <div>
                      <p className="text-sm font-medium leading-none text-left" style={{ color: theme.text }}>
                        {user.nombre} {user.apellido}
                      </p>
                      <p className="text-xs capitalize mt-0.5" style={{ color: theme.textSecondary }}>
                        {user.rol}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
                      style={{ color: theme.textSecondary }}
                    />
                  </div>
                </button>

                {/* Dropdown menu del usuario */}
                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div
                      className="absolute right-0 mt-2 w-56 rounded-xl shadow-2xl z-50 theme-dropdown-enter overflow-hidden"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      {/* Header del menú */}
                      <div className="px-4 py-3 border-b" style={{ borderColor: theme.border, backgroundColor: theme.backgroundSecondary }}>
                        <p className="text-sm font-medium" style={{ color: theme.text }}>
                          {user.nombre} {user.apellido}
                        </p>
                        <p className="text-xs truncate" style={{ color: theme.textSecondary }}>
                          {user.email}
                        </p>
                      </div>

                      {/* Opciones */}
                      <div className="py-1">
                        <button
                          onClick={handleOpenProfile}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 hover:translate-x-1"
                          style={{ color: theme.text }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.backgroundSecondary;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <User className="h-4 w-4" style={{ color: theme.primary }} />
                          Mi Perfil
                        </button>

                        <button
                          onClick={handleOpenNotificationSettings}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 hover:translate-x-1"
                          style={{ color: theme.text }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.backgroundSecondary;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <Bell className="h-4 w-4" style={{ color: theme.primary }} />
                          Notificaciones Push
                        </button>

                        <div className="my-1 border-t" style={{ borderColor: theme.border }} />

                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            logout();
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 hover:translate-x-1"
                          style={{ color: '#ef4444' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <LogOut className="h-4 w-4" />
                          Cerrar sesión
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Theme selector */}
              <div className="relative">
                <button
                  className="p-2 rounded-full transition-all duration-200 hover:scale-110 hover:rotate-12 active:scale-95"
                  onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                  style={{ color: theme.textSecondary }}
                >
                  <Palette className="h-5 w-5" />
                </button>

                {themeMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setThemeMenuOpen(false)}
                    />
                    <div
                      className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto mt-2 sm:w-64 rounded-xl shadow-2xl z-50 theme-dropdown-enter"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        maxHeight: 'calc(100vh - 100px)',
                        overflowY: 'auto',
                        top: 'auto',
                      }}
                    >
                      {/* Sección: Temas base */}
                      <div className="px-3 py-2 border-b" style={{ borderColor: theme.border }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Tema base
                        </span>
                      </div>
                      <div className="py-1">
                        {(Object.keys(themes) as ThemeName[]).map((key, index) => (
                          <button
                            key={key}
                            onClick={() => {
                              setTheme(key);
                            }}
                            className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-all duration-200 hover:translate-x-1"
                            style={{
                              color: themeName === key ? theme.primary : theme.text,
                              backgroundColor: themeName === key ? theme.backgroundSecondary : 'transparent',
                              animationDelay: `${index * 50}ms`,
                            }}
                          >
                            <div
                              className="w-5 h-5 rounded-full border-2 transition-transform duration-200 hover:scale-110"
                              style={{
                                backgroundColor: themes[key].background,
                                borderColor: themes[key].primary
                              }}
                            />
                            {themes[key].label}
                            {themeName === key && (
                              <div className="ml-auto">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Sección: Color de acento */}
                      <div className="px-3 py-2 border-t border-b" style={{ borderColor: theme.border }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Color de acento
                        </span>
                      </div>
                      <div className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {accentColors.map((color) => {
                            const isSelected = customPrimary === color.value || (!customPrimary && theme.primary === color.value);
                            return (
                              <button
                                key={color.value}
                                onClick={() => {
                                  setCustomPrimary(color.value);
                                }}
                                className="w-7 h-7 rounded-full transition-all duration-200 hover:scale-110 flex items-center justify-center"
                                style={{
                                  backgroundColor: color.value,
                                  boxShadow: isSelected ? `0 0 0 2px ${theme.card}, 0 0 0 4px ${color.value}` : 'none',
                                }}
                                title={color.name}
                              >
                                {isSelected && (
                                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {customPrimary && (
                          <button
                            onClick={() => setCustomPrimary(null)}
                            className="mt-2 w-full text-xs py-1.5 rounded-md transition-colors"
                            style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}
                          >
                            Restablecer al tema
                          </button>
                        )}
                      </div>

                      {/* Sección: Color del sidebar */}
                      <div className="px-3 py-2 border-t border-b" style={{ borderColor: theme.border }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Color del sidebar
                        </span>
                      </div>
                      <div className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {[
                            { name: 'Negro', value: '#000000' },
                            { name: 'Gris oscuro', value: '#1e293b' },
                            { name: 'Azul noche', value: '#0f1a2e' },
                            { name: 'Azul atardecer', value: '#1a2a4a' },
                            { name: 'Marrón oscuro', value: '#1a1512' },
                            { name: 'Violeta oscuro', value: '#1e1b4b' },
                          ].map((color) => {
                            const isSelected = customSidebar === color.value;
                            return (
                              <button
                                key={color.value}
                                onClick={() => {
                                  setCustomSidebar(color.value);
                                }}
                                className="w-7 h-7 rounded-full transition-all duration-200 hover:scale-110 flex items-center justify-center"
                                style={{
                                  backgroundColor: color.value,
                                  boxShadow: isSelected ? `0 0 0 2px ${theme.card}, 0 0 0 4px ${color.value}` : 'none',
                                  border: `1px solid ${theme.border}`,
                                }}
                                title={color.name}
                              >
                                {isSelected && (
                                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {customSidebar && (
                          <button
                            onClick={() => setCustomSidebar(null)}
                            className="mt-2 w-full text-xs py-1.5 rounded-md transition-colors"
                            style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}
                          >
                            Restablecer al tema
                          </button>
                        )}
                      </div>

                      {/* Sección: Imagen de fondo del sidebar */}
                      <div className="px-3 py-2 border-t border-b" style={{ borderColor: theme.border }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Fondo del sidebar
                        </span>
                      </div>
                      <div className="p-3 space-y-3">
                        {/* Opciones de imagen */}
                        <div className="flex flex-wrap gap-2">
                          {[
                            { name: 'Sin imagen', value: null, preview: null },
                            { name: 'Alumbrado', value: '/light.png', preview: '/light.png' },
                          ].map((img) => {
                            const isSelected = sidebarBgImage === img.value;
                            return (
                              <button
                                key={img.name}
                                onClick={() => setSidebarBgImage(img.value)}
                                className="w-12 h-12 rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center overflow-hidden"
                                style={{
                                  backgroundColor: img.preview ? 'transparent' : theme.backgroundSecondary,
                                  boxShadow: isSelected ? `0 0 0 2px ${theme.primary}` : 'none',
                                  border: `1px solid ${theme.border}`,
                                }}
                                title={img.name}
                              >
                                {img.preview ? (
                                  <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                                ) : (
                                  <X className="w-4 h-4" style={{ color: theme.textSecondary }} />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Slider de opacidad - solo visible si hay imagen */}
                        {sidebarBgImage && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs" style={{ color: theme.textSecondary }}>Opacidad</span>
                              <span className="text-xs font-mono" style={{ color: theme.text }}>{Math.round(sidebarBgOpacity * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0.1"
                              max="0.8"
                              step="0.05"
                              value={sidebarBgOpacity}
                              onChange={(e) => setSidebarBgOpacity(parseFloat(e.target.value))}
                              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                              style={{
                                background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${((sidebarBgOpacity - 0.1) / 0.7) * 100}%, ${theme.backgroundSecondary} ${((sidebarBgOpacity - 0.1) / 0.7) * 100}%, ${theme.backgroundSecondary} 100%)`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <NotificacionesDropdown />

              {/* Ajustes - para todos los usuarios */}
              <Link
                to="/gestion/ajustes"
                className="p-2 rounded-full transition-all duration-200 hover:scale-110 hover:rotate-45 active:scale-95"
                style={{ color: theme.textSecondary }}
                title="Ajustes"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page content with transition - padding reducido en móvil */}
        <main className="p-3 sm:p-6" style={{ color: theme.text }}>
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Custom CSS for animations and gradients */}
      <style>{`
        /* Main content responsive padding for sidebar */
        .main-content-area {
          padding-left: 0;
          transition: padding-left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @media (min-width: 1024px) {
          .main-content-area {
            padding-left: ${sidebarWidthPx}px;
          }
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }

        /* Animación suave para dropdown de temas */
        @keyframes theme-dropdown-enter {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .theme-dropdown-enter {
          animation: theme-dropdown-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: top right;
        }

        /* Scrollbar sutil para el dropdown */
        .theme-dropdown-enter::-webkit-scrollbar {
          width: 6px;
        }
        .theme-dropdown-enter::-webkit-scrollbar-track {
          background: transparent;
        }
        .theme-dropdown-enter::-webkit-scrollbar-thumb {
          background: rgba(128, 128, 128, 0.3);
          border-radius: 3px;
        }
        .theme-dropdown-enter::-webkit-scrollbar-thumb:hover {
          background: rgba(128, 128, 128, 0.5);
        }

        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
        }

        .animate-slide-in-right {
          animation: slide-in-right 0.4s ease-out;
        }

        .group-hover\\:animate-wiggle:hover {
          animation: wiggle 0.5s ease-in-out;
        }

        /* Gradient utilities for Kanban */
        .gradient-blue-purple {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
        }

        .gradient-orange-red {
          background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
        }

        .gradient-green-cyan {
          background: linear-gradient(135deg, #22c55e 0%, #06b6d4 100%);
        }

        .gradient-title {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #22c55e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gradient-border-blue {
          border-image: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%) 1;
        }

        .gradient-border-orange {
          border-image: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%) 1;
        }

        .gradient-border-green {
          border-image: linear-gradient(135deg, #22c55e 0%, #06b6d4 100%) 1;
        }

        .card-gradient-blue {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border-left: 4px solid transparent;
          border-image: linear-gradient(180deg, #3b82f6 0%, #8b5cf6 100%) 1;
        }

        .card-gradient-orange {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%);
          border-left: 4px solid transparent;
          border-image: linear-gradient(180deg, #f59e0b 0%, #ef4444 100%) 1;
        }

        .card-gradient-green {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%);
          border-left: 4px solid transparent;
          border-image: linear-gradient(180deg, #22c55e 0%, #06b6d4 100%) 1;
        }

        .hover-lift {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .hover-lift:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }

        .gradient-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      {/* Chat Widget con IA */}
      <ChatWidget />

      {/* Modal de configuración de notificaciones push */}
      <NotificationSettings
        isOpen={notificationSettingsOpen}
        onClose={() => setNotificationSettingsOpen(false)}
      />

      {/* Sheet de edición de perfil */}
      <Sheet
        open={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        title="Mi Perfil"
        description="Edita tus datos personales"
        stickyFooter={
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setProfileSheetOpen(false)}
              className="px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden group"
              style={{ backgroundColor: theme.primary, color: '#ffffff' }}
            >
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <span className="relative">{savingProfile ? 'Guardando...' : 'Guardar'}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Avatar y Email (solo lectura) */}
          <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: theme.border }}>
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: theme.primary }}
            >
              {user.nombre[0]}{user.apellido[0]}
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: theme.text }}>
                {user.nombre} {user.apellido}
              </p>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                {user.email}
              </p>
              <span
                className="inline-block px-2 py-0.5 mt-1 text-xs font-medium rounded-full capitalize"
                style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
              >
                {user.rol}
              </span>
            </div>
          </div>

          {/* Campos editables */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={profileData.nombre}
                onChange={(e) => setProfileData({ ...profileData, nombre: e.target.value })}
                className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-300"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Apellido <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={profileData.apellido}
                onChange={(e) => setProfileData({ ...profileData, apellido: e.target.value })}
                className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-300"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={profileData.telefono}
              onChange={(e) => setProfileData({ ...profileData, telefono: e.target.value })}
              placeholder="Ej: +54 9 11 1234-5678"
              className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              DNI
            </label>
            <input
              type="text"
              value={profileData.dni}
              onChange={(e) => setProfileData({ ...profileData, dni: e.target.value })}
              placeholder="Ej: 12345678"
              className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Dirección
            </label>
            <input
              type="text"
              value={profileData.direccion}
              onChange={(e) => setProfileData({ ...profileData, direccion: e.target.value })}
              placeholder="Ej: Av. San Martín 1234"
              className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
