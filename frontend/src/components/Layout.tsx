import { useState, useEffect } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, Palette, Settings, ChevronLeft, ChevronRight, User, ChevronDown, Bell, Home, ClipboardList, Wrench, Map, Trophy, BarChart3, History, FileCheck, AlertCircle, BellRing, Check, Image } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, ThemeVariant } from '../contexts/ThemeContext';
import { getNavigation, isMobileDevice } from '../config/navigation';
import { PageTransition } from './ui/PageTransition';
import { ChatWidget } from './ChatWidget';
import { NotificacionesDropdown } from './NotificacionesDropdown';
import { Sheet } from './ui/Sheet';
import { usersApi, municipiosApi } from '../lib/api';
import NotificationSettings from './NotificationSettings';
import { subscribeToPush } from '../lib/pushNotifications';
import { toast } from 'sonner';

// Definir tabs del footer móvil según rol (siempre 5, el del medio es el principal)
const getMobileTabs = (userRole: string) => {
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isEmpleado = userRole === 'empleado';

  if (isAdminOrSupervisor) {
    // Admin/Supervisor: Reclamos es la acción principal (centro), Trámites al lado
    return [
      { path: '/gestion', icon: Home, label: 'Inicio', end: true },
      { path: '/gestion/mapa', icon: Map, label: 'Mapa', end: false },
      { path: '/gestion/reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
      { path: '/gestion/tramites', icon: FileCheck, label: 'Trámites', end: false },
      { path: '/gestion/tablero', icon: Wrench, label: 'Tablero', end: false },
    ];
  }

  if (isEmpleado) {
    // Empleado: Trabajos es la acción principal (centro)
    return [
      { path: '/gestion/tablero', icon: Wrench, label: 'Tablero', end: true },
      { path: '/gestion/mapa', icon: Map, label: 'Mapa', end: false },
      { path: '/gestion/mis-trabajos', icon: ClipboardList, label: 'Trabajos', end: false },
      { path: '/gestion/mi-rendimiento', icon: BarChart3, label: 'Stats', end: false },
      { path: '/gestion/mi-historial', icon: History, label: 'Historial', end: false },
    ];
  }

  // Vecino: Logros en el centro (elevado), y ambos botones de crear (Reclamo y Trámite)
  return [
    { path: '/gestion/crear-reclamo', icon: AlertCircle, label: 'Nuevo', end: false },
    { path: '/gestion/mis-reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
    { path: '/gestion/logros', icon: Trophy, label: 'Logros', end: false },
    { path: '/gestion/crear-tramite', icon: FileCheck, label: 'Trámite', end: false },
    { path: '/gestion/mi-panel', icon: Home, label: 'Inicio', end: true },
  ];
};

// Nombres de variantes en español
const variantLabels: Record<ThemeVariant, string> = {
  clasico: 'Clásico',
  vintage: 'Vintage',
  vibrante: 'Vibrante',
};

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
  const [savingTheme, setSavingTheme] = useState(false);
  // Estado para el toggle de push notifications en la top bar
  const [pushSubscribed, setPushSubscribed] = useState(() => localStorage.getItem('pushActivated') === 'true');
  const [pushSubscribing, setPushSubscribing] = useState(false);
  const [showPushActivatedPopup, setShowPushActivatedPopup] = useState(false);
  const { user, logout, municipioActual, refreshUser } = useAuth();
  const {
    theme,
    currentPresetId,
    currentVariant,
    setPreset,
    presets,
    sidebarBgImage,
    sidebarBgOpacity,
    contentBgImage,
    setContentBgImage,
    contentBgOpacity,
    setContentBgOpacity,
  } = useTheme();
  const location = useLocation();

  // Guardar estado del sidebar en localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Handler para activar push desde la top bar
  const handleTopBarPushSubscribe = async () => {
    setPushSubscribing(true);
    try {
      const subscription = await subscribeToPush();
      if (subscription) {
        setPushSubscribed(true);
        localStorage.setItem('pushActivated', 'true');
        setShowPushActivatedPopup(true);
        // Ocultar popup después de 3 segundos
        setTimeout(() => setShowPushActivatedPopup(false), 3000);
      } else {
        // Aunque falle la suscripción, ocultar el banner después del click
        setPushSubscribed(true);
        localStorage.setItem('pushActivated', 'true');
      }
    } catch (error) {
      console.error('Error activando push:', error);
      // Ocultar banner aunque falle
      setPushSubscribed(true);
      localStorage.setItem('pushActivated', 'true');
    } finally {
      setPushSubscribing(false);
    }
  };

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

  // Handler para guardar el tema actual en el municipio
  const handleSaveTheme = async () => {
    if (!municipioActual || (user?.rol !== 'admin' && user?.rol !== 'supervisor')) return;

    setSavingTheme(true);
    try {
      const temaConfig = {
        presetId: currentPresetId,
        variant: currentVariant,
        sidebarBgImage,
        sidebarBgOpacity,
        contentBgImage,
        contentBgOpacity,
      };

      await municipiosApi.updateTema(municipioActual.id, temaConfig);
      toast.success('Tema guardado exitosamente');
      setThemeMenuOpen(false);

      // Refrescar el usuario para que tenga el municipio actualizado
      await refreshUser();
    } catch (error) {
      console.error('Error guardando tema:', error);
      toast.error('Error al guardar el tema');
    } finally {
      setSavingTheme(false);
    }
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

  if (!user) return null;

  const navigation = getNavigation(user.rol);
  const isMobile = isMobileDevice();
  const mobileTabs = getMobileTabs(user.rol);

  // Anchos dinámicos con medidas relativas para mejor responsividad
  // En móvil un ancho más compacto (12.5rem), en desktop respeta el estado colapsado
  const sidebarWidth = isMobile ? '12.5rem' : (sidebarCollapsed ? '5rem' : '11rem');

  // En móvil el sidebar siempre se muestra expandido (no colapsado)
  const isCollapsed = isMobile ? false : sidebarCollapsed;

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.contentBackground, overflowX: 'clip' }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - empieza debajo del topbar */}
      <div
        className={`fixed left-0 bottom-0 z-30 shadow-xl transform lg:translate-x-0 flex flex-col overflow-hidden sidebar-container backdrop-blur-sm ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'sidebar-collapsed' : ''}`}
        style={{
          backgroundColor: `${theme.sidebar}e6`, // ~90% opacity
          width: sidebarWidth,
          top: '64px', // h-16 = 4rem = 64px
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease-out, background-color 0.3s ease',
        }}
      >
        {/* Imagen de fondo del sidebar */}
        {sidebarBgImage && (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
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
            className="absolute inset-0 pointer-events-none"
            style={{
              background: theme.sidebar,
            }}
          />
        )}
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
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  paddingLeft: isCollapsed ? '0' : '12px',
                  paddingRight: isCollapsed ? '0' : '12px',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onClick={() => setSidebarOpen(false)}
                title={isCollapsed ? item.name : undefined}
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
                    marginRight: isCollapsed ? 0 : '12px',
                    transition: 'margin 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
                <span
                  className="whitespace-nowrap"
                  style={{
                    width: isCollapsed ? 0 : 'auto',
                    opacity: isCollapsed ? 0 : 1,
                    overflow: 'hidden',
                    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {item.name}
                </span>
                {isActive && !isCollapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Botón colapsar/expandir - al final del sidebar, solo en desktop */}
        <div className="hidden lg:flex relative z-10 px-2 py-3 border-t justify-center" style={{ borderColor: `${theme.sidebarTextSecondary}20` }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-md hover:scale-110 active:scale-95 transition-all w-full flex items-center justify-center gap-2"
            style={{
              color: theme.sidebarText,
              backgroundColor: `${theme.primary}20`,
            }}
            title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span
                  className="text-sm"
                  style={{
                    opacity: isCollapsed ? 0 : 1,
                    width: isCollapsed ? 0 : 'auto',
                    overflow: 'hidden',
                    transition: 'opacity 0.3s, width 0.3s',
                  }}
                >
                  Colapsar
                </span>
              </>
            )}
          </button>
        </div>

        {/* Botón cerrar en mobile */}
        <div className="lg:hidden relative z-10 px-2 py-3 border-t" style={{ borderColor: `${theme.sidebarTextSecondary}20` }}>
          <button
            className="p-2 rounded-md transition-all duration-200 hover:scale-105 active:scale-95 w-full flex items-center justify-center gap-2"
            onClick={() => setSidebarOpen(false)}
            style={{ color: theme.sidebarText, backgroundColor: `${theme.primary}20` }}
          >
            <X className="h-5 w-5" />
            <span className="text-sm">Cerrar</span>
          </button>
        </div>
      </div>

      {/* Main content - con padding-top para el header fijo */}
      <div className="lg:transition-[padding] lg:duration-300 main-content-area relative pt-16">
        {/* Imagen de fondo del contenido */}
        {contentBgImage && (
          <>
            <div
              className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
              style={{
                backgroundImage: `url(${contentBgImage})`,
                opacity: contentBgOpacity,
                transition: 'opacity 0.3s ease',
                zIndex: 0,
              }}
            />
            {/* Overlay para mejorar legibilidad */}
            <div
              className="fixed inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(180deg, ${theme.contentBackground}ee 0%, ${theme.contentBackground}cc 50%, ${theme.contentBackground}ee 100%)`,
                zIndex: 0,
              }}
            />
          </>
        )}
        {/* Top bar - sticky, se extiende de punta a punta */}
        <header
          className="fixed top-0 left-0 right-0 z-40 shadow-sm transition-colors duration-300 overflow-visible"
          style={{
            background: municipioActual?.imagen_portada
              ? theme.card
              : `linear-gradient(135deg, ${theme.primary}dd 0%, ${theme.primaryHover}cc 50%, ${theme.sidebar} 100%)`,
          }}
        >
          {/* Imagen de fondo con blur suave */}
          {municipioActual?.imagen_portada && (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={municipioActual.imagen_portada}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  filter: `blur(${municipioActual?.tema_config?.cabeceraBlur ?? 4}px)`,
                  opacity: municipioActual?.tema_config?.portadaOpacity ?? 0.9,
                  transform: 'scale(1.1)',
                }}
              />
              {/* Overlay con filtro de cabecera - usa el color sidebar del tema */}
              {(municipioActual?.tema_config?.cabeceraOpacity ?? 0.5) > 0 && (
                <div
                  className="absolute inset-0"
                  style={{
                    background: theme.sidebar,
                    opacity: (municipioActual?.tema_config?.cabeceraOpacity ?? 0.5) * 0.6,
                  }}
                />
              )}
            </div>
          )}
          <div className="relative flex items-center justify-between h-16 px-3 sm:px-4 overflow-visible">
            {/* Izquierda: Hamburguesa (mobile) + Perfil usuario con dropdown */}
            <div className="flex items-center gap-3">
              {/* Hamburguesa - solo mobile */}
              <button
                className="lg:hidden p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
                onClick={() => setSidebarOpen(true)}
                style={{ color: theme.text }}
              >
                <Menu className="h-5 w-5" />
              </button>
              {/* Perfil de usuario con dropdown */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {user.nombre[0]}{user.apellido[0]}
                  </div>
                  <div className="hidden sm:flex items-center gap-1">
                    <div>
                      <p className="text-sm font-semibold leading-none text-left" style={{ color: theme.text }}>
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
                      className="absolute left-0 mt-2 w-56 rounded-xl shadow-2xl z-50 theme-dropdown-enter overflow-hidden"
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

                        {/* Opción de Notificaciones */}
                        <div className="px-4 py-2.5">
                          <div className="flex items-center gap-2 mb-2">
                            <BellRing className="h-4 w-4" style={{ color: pushSubscribed ? '#22c55e' : theme.primary }} />
                            <span className="text-sm" style={{ color: theme.text }}>Notificaciones</span>
                            {pushSubscribed && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                Activas
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setUserMenuOpen(false);
                                handleTopBarPushSubscribe();
                              }}
                              disabled={pushSubscribed || pushSubscribing}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                              style={{
                                backgroundColor: pushSubscribed ? theme.backgroundSecondary : theme.primary,
                                color: pushSubscribed ? theme.textSecondary : '#ffffff',
                                opacity: pushSubscribed ? 0.5 : 1
                              }}
                            >
                              {pushSubscribing ? 'Activando...' : pushSubscribed ? 'Activado' : 'Activar'}
                            </button>
                            <button
                              onClick={async () => {
                                setUserMenuOpen(false);
                                try {
                                  const token = localStorage.getItem('token');
                                  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
                                  const res = await fetch(`${apiUrl}/push/test`, {
                                    method: 'POST',
                                    headers: {
                                      'Authorization': `Bearer ${token}`,
                                      'Content-Type': 'application/json'
                                    }
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    toast.success(data.message || 'Notificación de prueba enviada!');
                                  } else {
                                    const error = await res.json();
                                    toast.error(error.message || 'Error al enviar notificación');
                                  }
                                } catch (err) {
                                  console.error('Error enviando notificación de prueba:', err);
                                  toast.error('Error al enviar notificación de prueba');
                                }
                              }}
                              disabled={!pushSubscribed}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                              style={{
                                backgroundColor: pushSubscribed ? theme.backgroundSecondary : theme.border,
                                color: pushSubscribed ? theme.text : theme.textSecondary,
                                border: `1px solid ${theme.border}`,
                                opacity: pushSubscribed ? 1 : 0.5
                              }}
                            >
                              Probar
                            </button>
                          </div>
                        </div>

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
            </div>

            {/* Centro: Logo Munify + texto con degradé (solo desktop) */}
            <div className="flex-1 hidden sm:flex justify-center">
              <div className="flex items-center gap-3">
                <img
                  src={new URL('../assets/munify_logo.png', import.meta.url).href}
                  alt="Munify"
                  className="h-10 w-10 object-contain"
                />
                <span
                  className="text-2xl font-extrabold"
                  style={{ color: theme.primary }}
                >
                  Munify
                </span>
              </div>
            </div>
            {/* Espacio flexible en mobile */}
            <div className="flex-1 sm:hidden" />

            <div className="flex items-center space-x-2 sm:space-x-3 overflow-visible">
              {/* Theme selector - Visible en mobile y desktop */}
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
                      className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto mt-2 sm:w-80 rounded-xl shadow-2xl z-50 theme-dropdown-enter"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        maxHeight: 'calc(100vh - 100px)',
                        overflowY: 'auto',
                        top: 'auto',
                      }}
                    >
                      {/* Header */}
                      <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
                        <h3 className="font-semibold" style={{ color: theme.text }}>Personalizar tema</h3>
                        <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                          Elige una paleta de colores
                        </p>
                      </div>

                      {/* Paletas de colores - Grid de 2 columnas */}
                      <div className="p-3">
                        <div className="grid grid-cols-2 gap-2">
                          {presets.map((preset) => {
                            const isSelected = currentPresetId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => setPreset(preset.id, currentVariant)}
                                className="relative p-2 rounded-lg transition-all duration-200 hover:scale-[1.02] group"
                                style={{
                                  backgroundColor: isSelected ? `${theme.primary}15` : theme.backgroundSecondary,
                                  border: `2px solid ${isSelected ? theme.primary : 'transparent'}`,
                                }}
                              >
                                {/* Paleta de colores */}
                                <div className="flex h-6 rounded-md overflow-hidden mb-1.5">
                                  {preset.palette.map((color, i) => (
                                    <div
                                      key={i}
                                      className="flex-1"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                {/* Nombre */}
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: isSelected ? theme.primary : theme.text }}
                                >
                                  {preset.name}
                                </span>
                                {/* Check indicator */}
                                {isSelected && (
                                  <div
                                    className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: theme.primary }}
                                  >
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selector de variante */}
                      <div className="px-3 py-2 border-t" style={{ borderColor: theme.border }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                          Estilo
                        </span>
                        <div className="flex gap-2 mt-2">
                          {(['clasico', 'vintage', 'vibrante'] as ThemeVariant[]).map((variant) => {
                            const isSelected = currentVariant === variant;
                            return (
                              <button
                                key={variant}
                                onClick={() => setPreset(currentPresetId, variant)}
                                className="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200"
                                style={{
                                  backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary,
                                  color: isSelected ? '#ffffff' : theme.text,
                                }}
                              >
                                {variantLabels[variant]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Fondo de página */}
                      <div className="px-3 py-2 border-t" style={{ borderColor: theme.border }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                            Fondo de página
                          </span>
                          {(user?.rol === 'admin' || user?.rol === 'supervisor') && (
                            <Link
                              to="/gestion/configuracion"
                              onClick={() => setThemeMenuOpen(false)}
                              className="text-xs underline hover:no-underline flex items-center gap-1"
                              style={{ color: theme.primary }}
                            >
                              <Image className="w-3 h-3" />
                              Cambiar
                            </Link>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => setContentBgImage(null)}
                            className="w-12 h-12 rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              boxShadow: !contentBgImage ? `0 0 0 2px ${theme.primary}` : 'none',
                              border: `1px solid ${theme.border}`,
                            }}
                            title="Sin imagen"
                          >
                            <X className="w-4 h-4" style={{ color: theme.textSecondary }} />
                          </button>
                          {municipioActual?.imagen_portada && (
                            <button
                              onClick={() => setContentBgImage(municipioActual.imagen_portada!)}
                              className="w-12 h-12 rounded-lg transition-all duration-200 hover:scale-105 overflow-hidden"
                              style={{
                                boxShadow: contentBgImage ? `0 0 0 2px ${theme.primary}` : 'none',
                                border: `1px solid ${theme.border}`,
                              }}
                              title="Imagen del municipio"
                            >
                              <img
                                src={municipioActual.imagen_portada}
                                alt="Portada"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                        </div>

                        {/* Slider de opacidad */}
                        {contentBgImage && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs" style={{ color: theme.textSecondary }}>Opacidad</span>
                              <span className="text-xs font-mono" style={{ color: theme.text }}>{Math.round(contentBgOpacity * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0.01"
                              max="0.6"
                              step="0.01"
                              value={contentBgOpacity}
                              onChange={(e) => setContentBgOpacity(parseFloat(e.target.value))}
                              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                              style={{
                                background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${((contentBgOpacity - 0.01) / 0.59) * 100}%, ${theme.backgroundSecondary} ${((contentBgOpacity - 0.01) / 0.59) * 100}%, ${theme.backgroundSecondary} 100%)`,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Botón para guardar tema - solo visible para admin/supervisor */}
                      {(user?.rol === 'admin' || user?.rol === 'supervisor') && (
                        <div className="p-3 border-t" style={{ borderColor: theme.border }}>
                          <button
                            onClick={handleSaveTheme}
                            disabled={savingTheme}
                            className="w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            style={{
                              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                              color: '#ffffff',
                              boxShadow: `0 4px 12px ${theme.primary}40`,
                            }}
                          >
                            {savingTheme ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                Guardando...
                              </>
                            ) : (
                              <>
                                <Palette className="h-4 w-4" />
                                Guardar para el municipio
                              </>
                            )}
                          </button>
                          <p className="text-xs text-center mt-2" style={{ color: theme.textSecondary }}>
                            Aplica este tema para todos los usuarios
                          </p>
                        </div>
                      )}
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
        <main
          className="p-3 sm:p-6 relative"
          style={{
            color: theme.text,
            paddingBottom: isMobile ? '80px' : undefined, // Espacio para el bottom tab bar
            zIndex: 1,
          }}
        >
          {/* Barra secundaria: Municipalidad de X (solo mobile, en desktop está en el header) */}
          <div
            className="mb-4 px-4 py-2.5 rounded-xl flex sm:hidden items-center justify-center gap-2"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            <img
              src={new URL('../assets/munify_logo.png', import.meta.url).href}
              alt="Munify"
              className="h-5 w-5 object-contain"
            />
            <span className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Municipalidad de
            </span>
            <span className="text-sm font-semibold" style={{ color: theme.text }}>
              {municipioActual?.nombre || 'Sin municipio'}
            </span>
          </div>

          {/* Banner de activar notificaciones - visible para todos si no están activas */}
          {!pushSubscribed && (
            <div
              className="mb-4 p-4 rounded-xl flex items-center justify-between gap-4"
              style={{
                backgroundColor: `${theme.primary}15`,
                border: `1px solid ${theme.primary}30`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-full"
                  style={{ backgroundColor: theme.primary }}
                >
                  <BellRing className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm" style={{ color: theme.text }}>
                    Activá las notificaciones
                  </p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    Recibí alertas de novedades en tus reclamos
                  </p>
                </div>
              </div>
              <button
                onClick={handleTopBarPushSubscribe}
                disabled={pushSubscribing}
                className="px-4 py-2 rounded-lg font-medium text-sm transition-all hover:opacity-90 active:scale-95 whitespace-nowrap"
                style={{
                  backgroundColor: theme.primary,
                  color: '#ffffff',
                  opacity: pushSubscribing ? 0.7 : 1,
                }}
              >
                {pushSubscribing ? 'Activando...' : 'Activar'}
              </button>
            </div>
          )}

          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Bottom Tab Bar - Solo en móvil */}
      {isMobile && (
        <>
          <nav
            className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-safe"
            style={{
              backgroundColor: theme.card,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <div className="flex items-center justify-around py-2">
              {mobileTabs.map((tab, index) => {
                // El tab del centro (index 2) es el principal elevado
                const isMainTab = index === 2;

                return (
                  <NavLink
                    key={tab.path}
                    to={tab.path!}
                    end={'end' in tab ? tab.end : false}
                    className="flex flex-col items-center min-w-0 flex-1"
                  >
                    {({ isActive }) => (
                      <>
                        {isMainTab ? (
                          // Botones principales elevados (Reclamos y Trámites)
                          <div
                            className="w-10 h-10 -mt-3 rounded-full flex items-center justify-center shadow-lg"
                            style={{
                              backgroundColor: theme.primary,
                              boxShadow: `0 4px 14px ${theme.primary}50`,
                            }}
                          >
                            <tab.icon className="h-5 w-5 text-white" />
                          </div>
                        ) : (
                          // Botones normales - solo cambian color al seleccionar
                          <div
                            className="p-2 rounded-xl transition-colors"
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
                          className={`text-[10px] font-medium ${isMainTab ? 'mt-1' : 'mt-0.5'}`}
                          style={{
                            color: isMainTab || isActive ? theme.primary : theme.textSecondary
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
          </nav>
        </>
      )}

      {/* Custom CSS for animations and gradients */}
      <style>{`
        /* CSS variable para el ancho del sidebar (usado por StickyPageHeader) */
        :root {
          --sidebar-width: 0px;
        }

        @media (min-width: 1024px) {
          :root {
            --sidebar-width: ${sidebarWidth};
          }
        }

        /* Main content responsive padding for sidebar */
        .main-content-area {
          padding-left: 0;
          transition: padding-left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @media (min-width: 1024px) {
          .main-content-area {
            padding-left: ${sidebarWidth};
          }
        }

        /* Sidebar toggle button - aparece on hover cuando está colapsado */
        .sidebar-toggle-btn {
          transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out, background-color 0.2s ease-in-out !important;
        }

        /* Cuando el sidebar está colapsado, el botón aparece on hover */
        .sidebar-collapsed .sidebar-toggle-btn {
          opacity: 0 !important;
        }

        .sidebar-collapsed:hover .sidebar-toggle-btn {
          opacity: 1 !important;
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

        /* Safe area padding for iOS */
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom, 8px);
        }

        /* Custom range slider styling */
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>

      {/* Chat Widget con IA - Oculto en móvil porque interfiere con el footer */}
      {!isMobile && <ChatWidget />}

      {/* Modal de configuración de notificaciones push */}
      <NotificationSettings
        isOpen={notificationSettingsOpen}
        onClose={() => setNotificationSettingsOpen(false)}
      />

      {/* Popup de notificaciones activadas */}
      {showPushActivatedPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div
            className="px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-auto animate-scale-in"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <Bell className="h-5 w-5" style={{ color: theme.primary }} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: theme.text }}>Notificaciones activadas</p>
              <p className="text-sm" style={{ color: theme.textSecondary }}>Recibirás alertas de tus reclamos</p>
            </div>
          </div>
        </div>
      )}

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
