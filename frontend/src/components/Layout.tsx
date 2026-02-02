import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Palette, Settings, ChevronLeft, ChevronRight, User, ChevronDown, Bell, Home, ClipboardList, Wrench, Map, Trophy, BarChart3, History, FileCheck, AlertCircle, BellRing, Check, Image, Upload, Loader2, Plus, Building2, MapPin, HelpCircle } from 'lucide-react';
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

  // Vecino: "+" en el centro para crear, con menú desplegable
  return [
    { path: '/gestion/mi-panel', icon: Home, label: 'Inicio', end: true },
    { path: '/gestion/mis-reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
    { path: null, icon: null, label: 'Crear', isCreateMenu: true }, // Botón especial
    { path: '/gestion/logros', icon: Trophy, label: 'Logros', end: false },
    { path: '/gestion/mapa', icon: Map, label: 'Mapa', end: false },
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
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  // Estado reactivo para detectar mobile (se actualiza con resize)
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const navigate = useNavigate();
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [profileData, setProfileData] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    dni: '',
    direccion: '',
    nuevoEmail: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [uploadingSidebarBg, setUploadingSidebarBg] = useState(false);
  const [emailValidationOpen, setEmailValidationOpen] = useState(false);
  const [emailValidationCode, setEmailValidationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const sidebarBgInputRef = useRef<HTMLInputElement>(null);
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
    setSidebarBgImage,
    sidebarBgOpacity,
    setSidebarBgOpacity,
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

  // Detectar cambios de tamaño de ventana y cerrar sidebar al pasar a mobile
  useEffect(() => {
    const handleResize = () => {
      const nowMobile = isMobileDevice();
      if (nowMobile !== isMobile) {
        setIsMobile(nowMobile);
        // Cerrar sidebar cuando se pasa a mobile
        if (nowMobile) {
          setSidebarOpen(false);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

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
        nuevoEmail: '',
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

  // Handler para subir imagen de fondo del sidebar
  const handleSidebarBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !municipioActual) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2MB');
      return;
    }

    setUploadingSidebarBg(true);
    try {
      const formData = new FormData();
      formData.append('imagen', file);

      const response = await municipiosApi.updateSidebarBg(municipioActual.id, formData);

      if (response.data?.sidebar_bg_url) {
        setSidebarBgImage(response.data.sidebar_bg_url);
        toast.success('Imagen de fondo actualizada');
      }
    } catch (error) {
      console.error('Error subiendo imagen:', error);
      toast.error('Error al subir la imagen');
    } finally {
      setUploadingSidebarBg(false);
      // Reset input
      if (sidebarBgInputRef.current) {
        sidebarBgInputRef.current.value = '';
      }
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      // Detectar si hay cambio de email
      const hayNuevoEmail = profileData.nuevoEmail && profileData.nuevoEmail !== user?.email;

      if (hayNuevoEmail) {
        // Solicitar código de verificación
        const response = await usersApi.requestEmailChange(profileData.nuevoEmail);
        if (response.success) {
          setPendingEmail(profileData.nuevoEmail);
          setProfileSheetOpen(false);
          setEmailValidationOpen(true);
          toast.success('Código enviado a tu nuevo email');
        }
      } else {
        // Actualizar solo los otros campos (sin email)
        const { nuevoEmail, ...dataToUpdate } = profileData;
        await usersApi.updateMyProfile(dataToUpdate);
        await refreshUser();
        setProfileSheetOpen(false);
        toast.success('Perfil actualizado');
      }
    } catch (error: any) {
      console.error('Error al guardar perfil:', error);
      toast.error(error.response?.data?.message || 'Error al guardar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleValidateEmail = async () => {
    if (!emailValidationCode || !pendingEmail) return;

    try {
      const response = await usersApi.validateEmailChange(pendingEmail, emailValidationCode);
      if (response.success) {
        toast.success('Email actualizado exitosamente. Volvé a iniciar sesión con tu nuevo email.');
        setEmailValidationOpen(false);
        setEmailValidationCode('');
        setPendingEmail('');

        // Logout para forzar re-login con el nuevo email
        setTimeout(() => {
          logout();
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error al validar email:', error);
      toast.error(error.response?.data?.message || 'Código incorrecto');
    }
  };

  if (!user) return null;

  const navigation = getNavigation({ userRole: user.rol, hasDependencia: !!user.dependencia });
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

      {/* Sidebar - full height desde arriba */}
      {/* NOTA: En desktop NO usamos transform para evitar crear containing block que rompe position:fixed */}
      {/* En mobile usamos -translate-x-full solo cuando está cerrado */}
      {/* z-50 para estar por encima del backdrop móvil (z-40) */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-50 shadow-xl flex flex-col sidebar-container backdrop-blur-sm transition-all duration-300 ${isCollapsed ? 'sidebar-collapsed' : ''} ${isMobile && !sidebarOpen ? '-translate-x-full' : ''}`}
        style={{
          backgroundColor: `${theme.sidebar}e6`, // ~90% opacity
          width: sidebarWidth,
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
        {/* Overlay para mejorar legibilidad - gradiente con color del tema */}
        {sidebarBgImage && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(180deg, ${theme.sidebar}dd 0%, ${theme.sidebar}bb 50%, ${theme.sidebar}dd 100%)`,
            }}
          />
        )}

        {/* Header del Sidebar: Logo + Municipio */}
        <div className="relative z-10 px-3 py-4 border-b" style={{ borderColor: `${theme.sidebarTextSecondary}20` }}>
          <div
            className="flex items-center gap-2"
            style={{
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
          >
            <img
              src={new URL('../assets/munify_logo.png', import.meta.url).href}
              alt="Munify"
              className="h-8 w-8 object-contain flex-shrink-0"
            />
            <div
              style={{
                width: isCollapsed ? 0 : 'auto',
                opacity: isCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
              }}
            >
              <span
                className="text-lg font-bold whitespace-nowrap"
                style={{ color: theme.sidebarText }}
              >
                Munify
              </span>
              {/* Super Admin (sin municipio_id) no muestra municipio */}
              {municipioActual && user?.municipio_id && (
                <p
                  className="text-[10px] whitespace-nowrap -mt-0.5"
                  style={{ color: theme.sidebarTextSecondary }}
                >
                  {municipioActual.nombre}
                </p>
              )}
              {/* Super Admin (sin municipio_id): no mostrar nada */}
            </div>
          </div>
        </div>

        {/* Usuario en el Sidebar */}
        <div className="relative z-10 px-3 py-3 border-b" style={{ borderColor: `${theme.sidebarTextSecondary}20` }}>
          <button
            onClick={() => {
              if (isMobile) {
                // En mobile: cerrar sidebar y mostrar modal
                setSidebarOpen(false);
                setTimeout(() => setUserMenuOpen(true), 150);
              } else {
                setUserMenuOpen(!userMenuOpen);
              }
            }}
            className="w-full flex items-center gap-2 p-2 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: `${theme.primary}15`,
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
          >
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
              style={{ backgroundColor: theme.primary }}
            >
              {user.nombre[0]}{user.apellido[0]}
            </div>
            <div
              style={{
                width: isCollapsed ? 0 : 'auto',
                opacity: isCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
              }}
            >
              <p className="text-sm font-semibold leading-none text-left whitespace-nowrap" style={{ color: theme.sidebarText }}>
                {user.nombre} {user.apellido}
              </p>
              <p className="text-xs capitalize mt-0.5 whitespace-nowrap" style={{ color: theme.sidebarTextSecondary }}>
                {user.dependencia ? 'Dependencia' : user.rol}
              </p>
            </div>
            {!isCollapsed && (
              <ChevronDown
                className={`h-4 w-4 ml-auto transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
                style={{ color: theme.sidebarTextSecondary }}
              />
            )}
          </button>

          {/* Dropdown menu del usuario - SOLO DESKTOP */}
          {userMenuOpen && !isMobile && (
            <>
              <div
                className="fixed inset-0 z-[60]"
                onClick={() => setUserMenuOpen(false)}
              />
              <div
                className="absolute left-full top-0 ml-2 w-56 rounded-xl shadow-2xl z-[70] theme-dropdown-enter overflow-hidden"
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

      {/* Header sticky solo mobile */}
      {isMobile && (
        <header
          className="fixed top-0 left-0 right-0 z-40 px-4 py-3 flex items-center justify-between backdrop-blur-sm lg:hidden"
          style={{
            backgroundColor: `${theme.card}f0`,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          {/* Hamburguesa */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: theme.textSecondary }}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Centro: Logo + Nombre del municipio */}
          <div className="flex-1 flex items-center justify-center gap-2 mx-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              {municipioActual?.logo_url ? (
                <img
                  src={municipioActual.logo_url}
                  alt={municipioActual.nombre}
                  className="w-5 h-5 object-contain"
                />
              ) : (
                <Building2 className="h-4 w-4" style={{ color: theme.primary }} />
              )}
            </div>
            <h1 className="text-sm font-semibold truncate" style={{ color: theme.text }}>
              {municipioActual?.nombre?.replace('Municipalidad de ', '') || 'Municipio'}
            </h1>
          </div>

          {/* Notificaciones */}
          <div className="flex-shrink-0">
            <NotificacionesDropdown />
          </div>
        </header>
      )}

      {/* Main content - sin padding-top porque no hay header fijo */}
      <div className="lg:transition-[padding] lg:duration-300 main-content-area relative">
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

        {/* Page content with transition - padding reducido en móvil */}
        <main
          className="px-3 sm:px-6 pb-3 sm:pb-6 relative"
          style={{
            color: theme.text,
            paddingTop: isMobile ? '64px' : undefined, // Espacio para el header sticky mobile
            paddingBottom: isMobile ? '80px' : undefined, // Espacio para el bottom tab bar
            zIndex: 1,
          }}
        >
          {/* Barra superior ultra-compacta - iconos a la derecha - SOLO DESKTOP */}
          <div className="hidden lg:flex items-center justify-end mt-4 mb-2">

            {/* Iconos de acciones */}
            <div className="flex items-center">
              {/* Theme selector */}
              <div className="relative">
                <button
                  className="p-1.5 rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
                  onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                  style={{ color: theme.textSecondary }}
                  title="Tema"
                >
                  <Palette className="h-4 w-4" strokeWidth={3} />
                </button>

                {themeMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[60]"
                      onClick={() => setThemeMenuOpen(false)}
                    />
                    <div
                      className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl z-[70] theme-dropdown-enter"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        maxHeight: 'calc(100vh - 100px)',
                        overflowY: 'auto',
                      }}
                    >
                      <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
                        <h3 className="font-semibold" style={{ color: theme.text }}>Personalizar tema</h3>
                      </div>
                      <div className="p-3">
                        <div className="grid grid-cols-2 gap-2">
                          {presets.map((preset) => {
                            const isSelected = currentPresetId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                onClick={() => setPreset(preset.id, currentVariant)}
                                className="relative p-2 rounded-lg transition-all duration-200 hover:scale-[1.02]"
                                style={{
                                  backgroundColor: isSelected ? `${theme.primary}15` : theme.backgroundSecondary,
                                  border: `2px solid ${isSelected ? theme.primary : 'transparent'}`,
                                }}
                              >
                                <div className="flex h-6 rounded-md overflow-hidden mb-1.5">
                                  {preset.palette.map((color, i) => (
                                    <div key={i} className="flex-1" style={{ backgroundColor: color }} />
                                  ))}
                                </div>
                                <span className="text-xs font-medium" style={{ color: isSelected ? theme.primary : theme.text }}>
                                  {preset.name}
                                </span>
                                {isSelected && (
                                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.primary }}>
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="px-3 py-2 border-t" style={{ borderColor: theme.border }}>
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Estilo</span>
                        <div className="flex gap-2 mt-2">
                          {(['clasico', 'vintage', 'vibrante'] as ThemeVariant[]).map((variant) => {
                            const isSelected = currentVariant === variant;
                            return (
                              <button
                                key={variant}
                                onClick={() => setPreset(currentPresetId, variant)}
                                className="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all"
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
                      {/* Fondo del sidebar */}
                      <div className="px-3 py-2 border-t" style={{ borderColor: theme.border }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                            <Image className="h-3 w-3 inline mr-1" />
                            Fondo sidebar
                          </span>
                          {sidebarBgImage && (
                            <button
                              onClick={() => setSidebarBgImage(null)}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                            >
                              Quitar
                            </button>
                          )}
                        </div>

                        {/* Preview de imagen actual */}
                        {sidebarBgImage ? (
                          <div
                            className="w-full h-20 rounded-lg mb-2 bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${sidebarBgImage})`,
                              border: `1px solid ${theme.border}`,
                            }}
                          />
                        ) : (
                          <div
                            className="w-full h-20 rounded-lg mb-2 flex items-center justify-center"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              border: `1px dashed ${theme.border}`,
                            }}
                          >
                            <span className="text-xs" style={{ color: theme.textSecondary }}>Sin imagen</span>
                          </div>
                        )}

                        {/* Hidden file input */}
                        <input
                          type="file"
                          ref={sidebarBgInputRef}
                          onChange={handleSidebarBgUpload}
                          className="hidden"
                          accept="image/*"
                        />

                        {/* Upload button */}
                        <button
                          onClick={() => sidebarBgInputRef.current?.click()}
                          disabled={uploadingSidebarBg}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg mb-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            border: `1px solid ${theme.border}`,
                            color: theme.text,
                          }}
                        >
                          {uploadingSidebarBg ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs">Subiendo...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              <span className="text-xs">Subir imagen</span>
                            </>
                          )}
                        </button>

                        {/* Slider de opacidad */}
                        {sidebarBgImage && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]" style={{ color: theme.textSecondary }}>Opacidad</span>
                            <input
                              type="range"
                              min="0.1"
                              max="0.5"
                              step="0.05"
                              value={sidebarBgOpacity}
                              onChange={(e) => setSidebarBgOpacity(parseFloat(e.target.value))}
                              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                              style={{ backgroundColor: theme.border }}
                            />
                            <span className="text-[10px] w-8" style={{ color: theme.textSecondary }}>
                              {Math.round(sidebarBgOpacity * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Fondo del contenido - usa imagen_portada del municipio */}
                      {(() => {
                        // Usar la misma lógica de fallback que Dashboard
                        const defaultBgImage = 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070';
                        const availableBgImage = municipioActual?.imagen_portada || municipioActual?.logo_url || defaultBgImage;

                        return (
                      <div className="px-3 py-2 border-t" style={{ borderColor: theme.border }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                            <Image className="h-3 w-3 inline mr-1" />
                            Fondo content
                          </span>
                          {contentBgImage && (
                            <button
                              onClick={() => setContentBgImage(null)}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                            >
                              Quitar
                            </button>
                          )}
                        </div>

                        {/* Preview de imagen - siempre muestra preview */}
                        <div
                          className="w-full h-16 rounded-lg mb-2 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${contentBgImage || availableBgImage})`,
                            border: `1px solid ${theme.border}`,
                            opacity: contentBgImage ? 1 : 0.5,
                          }}
                        />

                        {/* Toggle para activar/desactivar */}
                        <button
                          onClick={() => setContentBgImage(contentBgImage ? null : availableBgImage)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg mb-2 transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{
                            backgroundColor: contentBgImage ? theme.primary : theme.backgroundSecondary,
                            border: `1px solid ${contentBgImage ? theme.primary : theme.border}`,
                            color: contentBgImage ? '#ffffff' : theme.text,
                          }}
                        >
                          <Image className="h-4 w-4" />
                          <span className="text-xs">{contentBgImage ? 'Fondo activo' : 'Usar imagen municipio'}</span>
                        </button>

                        {/* Slider de opacidad */}
                        {contentBgImage && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]" style={{ color: theme.textSecondary }}>Opacidad</span>
                            <input
                              type="range"
                              min="0.1"
                              max="0.5"
                              step="0.05"
                              value={contentBgOpacity}
                              onChange={(e) => setContentBgOpacity(parseFloat(e.target.value))}
                              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                              style={{ backgroundColor: theme.border }}
                            />
                            <span className="text-[10px] w-8" style={{ color: theme.textSecondary }}>
                              {Math.round(contentBgOpacity * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                        );
                      })()}
                      {(user?.rol === 'admin' || user?.rol === 'supervisor') && (
                        <div className="p-3 border-t" style={{ borderColor: theme.border }}>
                          <button
                            onClick={handleSaveTheme}
                            disabled={savingTheme}
                            className="w-full py-2 px-4 rounded-lg font-medium text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                            style={{ backgroundColor: theme.primary, color: '#ffffff' }}
                          >
                            {savingTheme ? 'Guardando...' : 'Guardar para el municipio'}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Notificaciones */}
              <NotificacionesDropdown />

              {/* Ajustes */}
              <Link
                to="/gestion/configuracion"
                className="p-1.5 rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
                style={{ color: theme.textSecondary }}
                title="Configuración"
              >
                <Settings className="h-4 w-4" strokeWidth={3} />
              </Link>
            </div>
          </div>

          {/* Banner de Dependencia - visible solo para usuarios de dependencia */}
          {user.dependencia && (() => {
            // Usar imagen_portada, logo_url, o una imagen por defecto
            const defaultBannerImage = 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070';
            const bannerImage = municipioActual?.imagen_portada || municipioActual?.logo_url || defaultBannerImage;
            const hasBannerImage = true; // Siempre tenemos imagen (al menos la default)

            return (
            <div
              className="mb-4 p-4 sm:p-5 rounded-2xl overflow-hidden relative"
              style={{
                backgroundColor: theme.card,
                minHeight: hasBannerImage ? '120px' : undefined,
              }}
            >
              {/* Imagen de fondo del municipio */}
              {hasBannerImage && (
                <>
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${bannerImage})`,
                    }}
                  />
                  {/* Overlay oscuro para legibilidad */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 50%, ${municipioActual?.color_primario || theme.primary}80 100%)`,
                    }}
                  />
                </>
              )}

              <div className="relative z-10 flex items-center gap-4">
                {/* Logo del municipio */}
                {municipioActual?.logo_url ? (
                  <img
                    src={municipioActual.logo_url}
                    alt={municipioActual.nombre}
                    className="h-14 w-14 sm:h-16 sm:w-16 object-contain rounded-xl p-1"
                    style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
                  />
                ) : (
                  <div
                    className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: municipioActual?.color_primario || user.dependencia.color || theme.primary }}
                  >
                    <Building2 className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                  </div>
                )}

                {/* Nombre de la dependencia */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs uppercase tracking-wider font-medium mb-0.5"
                    style={{
                      color: hasBannerImage ? 'rgba(255,255,255,0.8)' : theme.textSecondary,
                    }}
                  >
                    {municipioActual?.nombre || 'Municipalidad'}
                  </p>
                  <h1
                    className="text-lg sm:text-xl font-bold leading-tight truncate"
                    style={{
                      color: hasBannerImage
                        ? '#ffffff'
                        : (municipioActual?.color_primario || user.dependencia.color || theme.primary),
                    }}
                  >
                    {user.dependencia.nombre}
                  </h1>
                  {user.dependencia.direccion && (
                    <p
                      className="text-xs mt-1 flex items-center gap-1"
                      style={{
                        color: hasBannerImage ? 'rgba(255,255,255,0.7)' : theme.textSecondary,
                      }}
                    >
                      <MapPin className="h-3 w-3" />
                      {user.dependencia.direccion}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
          })()}

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
          {/* Backdrop del menú crear */}
          {createMenuOpen && (
            <div
              className="fixed inset-0 z-[55] bg-black/40"
              onClick={() => setCreateMenuOpen(false)}
              style={{ animation: 'fadeIn 0.2s ease-out' }}
            />
          )}

          {/* Menú crear animado - Estilo horizontal con iconos */}
          {createMenuOpen && (
            <div
              className="fixed bottom-24 left-4 right-4 z-[56] px-4 py-4 rounded-3xl"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: '0 -4px 30px rgba(0,0,0,0.3)',
                animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              <div className="flex items-center justify-around gap-2">
                {/* Reclamo */}
                <button
                  onClick={() => {
                    setCreateMenuOpen(false);
                    navigate('/gestion/crear-reclamo');
                  }}
                  className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all active:scale-95"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1.5px solid ${theme.border}`,
                    minWidth: '80px'
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: '#ef444415' }}
                  >
                    <AlertCircle className="h-6 w-6" style={{ color: '#ef4444' }} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#ef4444' }}>
                    Reclamo
                  </span>
                </button>

                {/* Trámite */}
                <button
                  onClick={() => {
                    setCreateMenuOpen(false);
                    navigate('/gestion/crear-tramite');
                  }}
                  className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all active:scale-95"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1.5px solid ${theme.border}`,
                    minWidth: '80px'
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: '#3b82f615' }}
                  >
                    <FileCheck className="h-6 w-6" style={{ color: '#3b82f6' }} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#3b82f6' }}>
                    Trámite
                  </span>
                </button>

                {/* Mapa */}
                <button
                  onClick={() => {
                    setCreateMenuOpen(false);
                    navigate('/gestion/mapa');
                  }}
                  className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all active:scale-95"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1.5px solid ${theme.border}`,
                    minWidth: '80px'
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: '#10b98115' }}
                  >
                    <Map className="h-6 w-6" style={{ color: '#10b981' }} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#10b981' }}>
                    Mapa
                  </span>
                </button>

                {/* Ayuda */}
                <button
                  onClick={() => {
                    setCreateMenuOpen(false);
                    // Podría abrir un modal de ayuda
                  }}
                  className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all active:scale-95"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1.5px solid ${theme.border}`,
                    minWidth: '80px'
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: '#8b5cf615' }}
                  >
                    <HelpCircle className="h-6 w-6" style={{ color: '#8b5cf6' }} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#8b5cf6' }}>
                    Ayuda
                  </span>
                </button>
              </div>
            </div>
          )}

          <nav
            className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-safe overflow-visible"
            style={{
              backgroundColor: theme.card,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <div className="flex items-center justify-around py-2 overflow-visible">
              {mobileTabs.map((tab, index) => {
                // El tab del centro (index 2) es el botón de crear
                const isCreateButton = 'isCreateMenu' in tab && tab.isCreateMenu;

                // Botón especial de crear - sobresale del footer
                if (isCreateButton) {
                  return (
                    <button
                      key="create-menu"
                      onClick={() => setCreateMenuOpen(!createMenuOpen)}
                      className="flex flex-col items-center min-w-0 flex-1 relative -mt-5"
                    >
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 relative"
                        style={{
                          background: `linear-gradient(135deg, ${theme.primary} 0%, #ec4899 100%)`,
                          boxShadow: createMenuOpen
                            ? `0 6px 25px ${theme.primary}60`
                            : `0 4px 20px ${theme.primary}50`,
                          transform: createMenuOpen ? 'rotate(45deg) scale(1.1)' : 'rotate(0deg) scale(1)',
                        }}
                      >
                        <Plus className="h-7 w-7 text-white" strokeWidth={2.5} />
                      </div>
                      <span
                        className="text-[10px] font-semibold mt-1"
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
                    to={tab.path!}
                    end={'end' in tab ? tab.end : false}
                    className="flex flex-col items-center min-w-0 flex-1"
                    onClick={() => setCreateMenuOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className="p-2 rounded-xl transition-colors"
                          style={{
                            backgroundColor: isActive ? `${theme.primary}15` : 'transparent',
                          }}
                        >
                          {tab.icon && (
                            <tab.icon
                              className="h-5 w-5"
                              style={{ color: isActive ? theme.primary : theme.textSecondary }}
                            />
                          )}
                        </div>
                        <span
                          className="text-[10px] font-medium mt-0.5"
                          style={{ color: isActive ? theme.primary : theme.textSecondary }}
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

        /* Sticky header ya no necesita posicionamiento especial */
        /* Ahora usa position: sticky con márgenes negativos */

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

        /* Munify brand text with gradient */
        .munify-brand-text {
          background: linear-gradient(135deg, var(--munify-primary) 0%, var(--munify-hover) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: var(--munify-primary); /* Fallback */
          transition: none; /* Prevent transition glitches */
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

          {/* Cambiar Email */}
          <div className="pt-4 border-t" style={{ borderColor: theme.border }}>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Cambiar Email
            </label>
            <div className="space-y-2">
              <div
                className="px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
              >
                Email actual: <span className="font-medium" style={{ color: theme.text }}>{user.email}</span>
              </div>
              <input
                type="email"
                value={profileData.nuevoEmail}
                onChange={(e) => setProfileData({ ...profileData, nuevoEmail: e.target.value })}
                placeholder="Nuevo email"
                className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-300"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
              {profileData.nuevoEmail && profileData.nuevoEmail !== user.email && (
                <div
                  className="text-xs px-3 py-2 rounded-lg flex items-center gap-2"
                  style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>Se enviará un código de verificación al nuevo email</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Sheet>

      {/* Sheet de validación de email */}
      <Sheet
        open={emailValidationOpen}
        onClose={() => {
          setEmailValidationOpen(false);
          setEmailValidationCode('');
          setPendingEmail('');
        }}
        title="Validar nuevo email"
        description="Ingresa el código que enviamos a tu nuevo email"
        stickyFooter={
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => {
                setEmailValidationOpen(false);
                setEmailValidationCode('');
                setPendingEmail('');
              }}
              className="px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            >
              Cancelar
            </button>
            <button
              onClick={handleValidateEmail}
              disabled={!emailValidationCode || emailValidationCode.length < 6}
              className="px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              style={{ backgroundColor: theme.primary, color: '#ffffff' }}
            >
              Validar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Info del nuevo email */}
          <div
            className="px-4 py-3 rounded-xl"
            style={{ backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: theme.text }}>
              Nuevo email:
            </p>
            <p className="text-sm font-semibold" style={{ color: theme.primary }}>
              {pendingEmail}
            </p>
          </div>

          {/* Campo de código */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Código de validación
            </label>
            <input
              type="text"
              value={emailValidationCode}
              onChange={(e) => setEmailValidationCode(e.target.value.trim())}
              placeholder="Ingresa el código de 6 dígitos"
              maxLength={6}
              className="w-full rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest focus:ring-2 focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `2px solid ${theme.border}`,
              }}
              autoFocus
            />
          </div>

          {/* Instrucciones */}
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
          >
            Revisa tu casilla de correo (incluida la carpeta de spam). El código expira en 15 minutos.
          </div>
        </div>
      </Sheet>

      {/* Modal de usuario para MOBILE - Bottom Sheet elegante */}
      {userMenuOpen && isMobile && (
        <div className="fixed inset-0 z-[100]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setUserMenuOpen(false)}
          />

          {/* Bottom Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden animate-slide-up"
            style={{
              backgroundColor: theme.card,
              maxHeight: '85vh',
            }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="w-12 h-1.5 rounded-full"
                style={{ backgroundColor: theme.border }}
              />
            </div>

            {/* Header con avatar grande */}
            <div className="px-6 pb-5 pt-2 text-center border-b" style={{ borderColor: theme.border }}>
              <div
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-lg"
                style={{
                  backgroundColor: theme.primary,
                  boxShadow: `0 8px 32px ${theme.primary}40`,
                }}
              >
                {user.nombre[0]}{user.apellido[0]}
              </div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>
                {user.nombre} {user.apellido}
              </h2>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                {user.email}
              </p>
              <span
                className="inline-block px-3 py-1 mt-2 text-xs font-semibold rounded-full capitalize"
                style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
              >
                {user.dependencia ? user.dependencia.nombre : user.rol}
              </span>
            </div>

            {/* Opciones */}
            <div className="p-4 space-y-2">
              {/* Mi Perfil */}
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  handleOpenProfile();
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${theme.primary}20` }}
                >
                  <User className="h-6 w-6" style={{ color: theme.primary }} />
                </div>
                <div className="text-left">
                  <p className="font-semibold" style={{ color: theme.text }}>Mi Perfil</p>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Editar datos personales</p>
                </div>
                <ChevronDown className="h-5 w-5 -rotate-90 ml-auto" style={{ color: theme.textSecondary }} />
              </button>

              {/* Notificaciones */}
              <div
                className="w-full p-4 rounded-2xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: pushSubscribed ? 'rgba(34, 197, 94, 0.15)' : `${theme.primary}20` }}
                  >
                    <BellRing className="h-6 w-6" style={{ color: pushSubscribed ? '#22c55e' : theme.primary }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold" style={{ color: theme.text }}>Notificaciones</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      {pushSubscribed ? 'Activadas en este dispositivo' : 'Recibir alertas push'}
                    </p>
                  </div>
                  {pushSubscribed && (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                      Activas
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3 pl-16">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleTopBarPushSubscribe();
                    }}
                    disabled={pushSubscribed || pushSubscribing}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                    style={{
                      backgroundColor: pushSubscribed ? theme.border : theme.primary,
                      color: pushSubscribed ? theme.textSecondary : '#ffffff',
                      opacity: pushSubscribed ? 0.6 : 1
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
                          toast.success(data.message || 'Notificación enviada!');
                        } else {
                          toast.error('Error al enviar notificación');
                        }
                      } catch {
                        toast.error('Error al enviar notificación');
                      }
                    }}
                    disabled={!pushSubscribed}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                    style={{
                      backgroundColor: theme.border,
                      color: pushSubscribed ? theme.text : theme.textSecondary,
                      opacity: pushSubscribed ? 1 : 0.5
                    }}
                  >
                    Probar
                  </button>
                </div>
              </div>

              {/* Cerrar sesión */}
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98] mt-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
                >
                  <LogOut className="h-6 w-6 text-red-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-red-500">Cerrar sesión</p>
                  <p className="text-xs text-red-400">Salir de tu cuenta</p>
                </div>
              </button>
            </div>

            {/* Safe area bottom */}
            <div className="h-6" />
          </div>
        </div>
      )}
    </div>
  );
}
