import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, BarChart3, Bell, BellRing, Building2, Calendar, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, FileCheck, Home, LogOut, Map, MapPin, Menu, Moon, Plus, Radio, ScanLine, Settings, Sparkles, Sun, Trophy, User, Wallet, Wrench, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
// alpha()/lighten() entienden cualquier formato de color; pegar dígitos al
// final de un color solo funciona si SIEMPRE es un hex de seis, y no lo es.
import { alpha, lighten } from '../lib/colorUtils';
import { BentoMenu, type BentoItem } from './ui/BentoMenu';
import { getNavigation, isMobileDevice } from '../config/navigation';
import { BrandMark } from '../brands/BrandMark';
import { BRAND, logoDelMunicipio } from '../brands';
import { useVecinoBadges } from '../hooks/useVecinoBadges';
import { useNavBadges } from './shell/useNavBadges';
import { PageTransition } from './ui/PageTransition';
import { ChatWidget } from './ChatWidget';
import { NotificacionesDropdown } from './NotificacionesDropdown';
import PresentacionLive from './PresentacionLive';
import { Sheet } from './ui/Sheet';
import { usersApi, municipiosApi, navegacionApi, modulosApi, iaConfigApi, API_URL as apiUrl_ } from '../lib/api';
import MunicipioSwitcher from './admin/MunicipioSwitcher';
import { SidebarV2 } from './shell/SidebarV2';
import { TopbarV2 } from './shell/TopbarV2';
import { MigasProvider } from '../contexts/MigasProvider';
import NotificationSettings from './NotificationSettings';
import { NotificationActivationSheet } from './NotificationActivationSheet';
import { subscribeToPush } from '../lib/pushNotifications';
import { toast } from 'sonner';

// Definir tabs del footer móvil según rol. Gestor/vecino: 5 tabs con centro de
// acción (crear/menú). Empleado: 3-4 tabs sin centro. El render distingue cada
// tipo por 'isCreateMenu'/'end' in tab (no por índice fijo).
const getMobileTabs = (userRole: string, modulosActivos: string[] = []) => {
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;

  if (isAdminOrSupervisor) {
    // Admin/Supervisor: 4 tabs + boton "+" central que abre menu con todo.
    return [
      { path: '/gestion', icon: Home, label: 'Inicio', end: true },
      { path: '/gestion/reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
      { isCreateMenu: true as const, label: 'Más', icon: Plus },
      { path: '/gestion/tramites', icon: FileCheck, label: 'Trámites', end: false },
      { path: '/gestion/tesoreria', icon: Wallet, label: 'Tesorería', end: false },
    ];
  }

  // Empleado de campo: footer operativo propio. Antes heredaba el del vecino
  // (Inicio->mi-panel rebota, Reclamos->mis-reclamos del vecino, etc). Ahora:
  // Trabajos · Órdenes (si el muni tiene el módulo) · Mapa · Logros.
  if (userRole === 'empleado') {
    const tabs: Array<{ path: string; icon: any; label: string; end: boolean }> = [
      { path: '/gestion/mis-trabajos', icon: Wrench, label: 'Trabajos', end: false },
    ];
    if (modulosActivos.includes('ordenes_trabajo')) {
      tabs.push({ path: '/gestion/ordenes-trabajo', icon: ClipboardList, label: 'Órdenes', end: false });
    }
    tabs.push(
      { path: '/gestion/mapa', icon: Map, label: 'Mapa', end: false },
      { path: '/gestion/logros', icon: Trophy, label: 'Logros', end: false },
    );
    return tabs;
  }

  // Vecino: "+" en el centro abre menú con Reclamo/Trámite (los dos core features).
  // Inicio · Reclamos · + · Trámites · Tasas — los 3 pilares del ciudadano.
  return [
    { path: '/gestion/mi-panel', icon: Home, label: 'Inicio', end: true },
    { path: '/gestion/mis-reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
    { path: null, icon: null, label: 'Crear', isCreateMenu: true },
    { path: '/gestion/mis-tramites', icon: FileCheck, label: 'Trámites', end: false },
    { path: '/gestion/mis-tasas', icon: BarChart3, label: 'Tasas', end: false },
  ];
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  // Recorrido guiado (autocontenido) accesible desde el menú "Más" del admin.
  // El "En Vivo" (DashboardLive) necesita los datos del dashboard, así que ese
  // navega a /gestion?live=1 y se abre allí; acá sólo montamos PresentacionLive.
  const [presentacionOpen, setPresentacionOpen] = useState(false);
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
  const [emailValidationOpen, setEmailValidationOpen] = useState(false);
  const [emailValidationCode, setEmailValidationCode] = useState('');
  // Items del sidebar ocultos por el superadmin para el muni actual
  const [hrefsOcultos, setHrefsOcultos] = useState<string[]>([]);
  // Modulos activos del municipio (feature flags)
  const [modulosActivos, setModulosActivos] = useState<string[]>([]);
  const [modulosDesactivados, setModulosDesactivados] = useState<string[]>([]);
  const [iaHabilitada, setIaHabilitada] = useState<boolean>(false);
  const [pendingEmail, setPendingEmail] = useState('');
  // Estado para el toggle de push notifications en la top bar
  const [pushSubscribed, setPushSubscribed] = useState(() => localStorage.getItem('pushActivated') === 'true');
  const [pushSubscribing, setPushSubscribing] = useState(false);
  const [showPushActivatedPopup, setShowPushActivatedPopup] = useState(false);
  const { user, logout, municipioActual, refreshUser } = useAuth();
  const {
    theme,
    currentMode,
    alternarModo,
    sidebarBgImage,
    sidebarBgOpacity,
    contentBgImage,
    contentBgOpacity,
  } = useTheme();
  const location = useLocation();

  // Mini-muestras del selector: los colores REALES que produce cada opción,
  // derivados con los otros dos ejes en su valor actual (antes se pintaba una
  // paleta declarada a mano que no siempre era lo que se terminaba viendo).

  // Badges de items pendientes (reclamos/tramites/tasas) — solo aplica a vecinos.

  // La barra inferior publica su ALTO REAL en --pl-tabbar-h, para que lo que
  // se apoya abajo (bottom sheets, toasts) no la tape. Se mide en vez de
  // hardcodear: el alto cambia con el area segura del telefono y con el
  // tamano de fuente del sistema, y un numero fijo queda corto justo en los
  // aparatos donde mas molesta.
  const navInferiorRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = navInferiorRef.current;
    const root = document.documentElement;
    if (!nav) {
      root.style.setProperty('--pl-tabbar-h', '0px');
      return;
    }
    const medir = () => {
      root.style.setProperty('--pl-tabbar-h', `${Math.round(nav.getBoundingClientRect().height)}px`);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nav);
    return () => {
      ro.disconnect();
      root.style.setProperty('--pl-tabbar-h', '0px');
    };
  });

  const badges = useVecinoBadges();
  // Contadores de gestion (admin/supervisor). Cachea una vez por sesion.
  const navBadges = useNavBadges();

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

  // Cargar items del sidebar ocultos (config del superadmin por muni)
  useEffect(() => {
    if (!user) {
      setHrefsOcultos([]);
      return;
    }
    navegacionApi.misHrefsOcultos()
      .then((r) => setHrefsOcultos(r.data || []))
      .catch(() => setHrefsOcultos([]));
  }, [user?.id, user?.municipio_id]);

  // Cargar modulos activos del municipio (feature flags)
  useEffect(() => {
    if (!user) {
      setModulosActivos([]);
      return;
    }
    modulosApi.list()
      .then((r) => {
        const rows = (r.data || []) as Array<{ modulo: string; activo: boolean }>;
        setModulosActivos(rows.filter(m => m.activo).map(m => m.modulo));
        setModulosDesactivados(rows.filter(m => !m.activo).map(m => m.modulo));
      })
      .catch(() => { setModulosActivos([]); setModulosDesactivados([]); });
    // Gate central de IA del muni actual (oculta los items de IA del sidebar).
    iaConfigApi.getActual()
      .then((r) => setIaHabilitada(!!r.data.habilitada))
      .catch(() => setIaHabilitada(false));
  }, [user?.id, user?.municipio_id]);

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

  // Handler para subir imagen de fondo del sidebar

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

  const navigation = getNavigation({
    userRole: user.rol,
    hasDependencia: !!user.dependencia,
    hasEmpleado: !!user.empleado_id,
    // Superadmin = admin sin municipio_id (gestiona todos los municipios)
    isSuperAdmin: user.rol === 'admin' && !user.municipio_id,
    // Si el muni actual tiene `abm_en_sidebar=false`, los 3 items de ABMs
    // (Categorías Reclamo, Categorías Trámite, Tipos de Trámite) se ocultan
    // del sidebar. Quedan accesibles sólo desde /gestion/configuracion.
    abmEnSidebar: municipioActual?.abm_en_sidebar ?? true,
    hrefsOcultos,
    modulosActivos,
    modulosDesactivados,
    iaHabilitada,
  });
  const mobileTabs = getMobileTabs(user.rol, modulosActivos);

  // ---- Shell v2 (solo desktop) -------------------------------------------
  // Acciones globales de la topbar: tema + notificaciones + ajustes. El
  // dropdown del tema sigue viviendo en este Layout (portal siempre montado,
  // compartido con el trigger del header mobile); acá va solo el trigger.
  const accionesTopbar = (
    <>
      <button
        type="button"
        className="tv2-iconbtn"
        title={currentMode === 'claro' ? 'Pasar al tema oscuro' : 'Pasar al tema claro'}
        aria-label={currentMode === 'claro' ? 'Pasar al tema oscuro' : 'Pasar al tema claro'}
        onClick={alternarModo}
      >
        {currentMode === 'claro'
          ? <Moon className="tv2-iconbtn-svg" />
          : <Sun className="tv2-iconbtn-svg" />}
      </button>
      <NotificacionesDropdown />
      <Link to="/gestion/configuracion" className="tv2-iconbtn" title="Configuración">
        <Settings className="tv2-iconbtn-svg" />
      </Link>
    </>
  );

  // Menú de la persona en la topbar (decisión del dueño: el switcher de
  // usuario del sidebar viejo desaparece en desktop — la persona vive acá).
  // Mismas opciones que el dropdown viejo: perfil, notificaciones, salir.
  const menuUsuarioTopbar = (
    <>
      <div className="tv2-menu-cab">
        <p className="tv2-menu-nombre">{user.nombre} {user.apellido}</p>
        <p className="tv2-menu-email">{user.email}</p>
      </div>
      <button type="button" className="tv2-menu-item" onClick={handleOpenProfile}>
        <User className="tv2-menu-icono" />
        Mi Perfil
      </button>
      <button
        type="button"
        className="tv2-menu-item"
        onClick={handleTopBarPushSubscribe}
        disabled={pushSubscribed || pushSubscribing}
      >
        <BellRing className="tv2-menu-icono" />
        {pushSubscribing
          ? 'Activando notificaciones…'
          : pushSubscribed
            ? 'Notificaciones activas'
            : 'Activar notificaciones'}
      </button>
      <div className="tv2-menu-sep" />
      <button
        type="button"
        className="tv2-menu-item tv2-menu-item--peligro"
        onClick={() => logout()}
      >
        <LogOut className="tv2-menu-icono" />
        Cerrar sesión
      </button>
    </>
  );

  // Anchos dinámicos con medidas relativas para mejor responsividad.
  // Desktop = shell v2. El ancho sale de los MISMOS tokens que usa el sidebar
  // (--pl-sidebar-w / --pl-sidebar-w-collapsed): antes estaba duplicado como
  // '16rem'/'4.5rem' y cualquier cambio del token dejaba el padding del
  // contenido desfasado del ancho real de la barra.
  // Mobile mantiene el drawer compacto de siempre (12rem).
  const sidebarWidth = isMobile
    ? '12rem'
    : (sidebarCollapsed ? 'var(--pl-sidebar-w-collapsed)' : 'var(--pl-sidebar-w)');

  // En móvil el sidebar siempre se muestra expandido (no colapsado)
  const isCollapsed = isMobile ? false : sidebarCollapsed;

  return (
    // Miga de pan (Ámbito / Página) publicada para toda la app: la dibuja la
    // TopbarV2 y la lee el PageHeader de los ABMs para no repetir el eyebrow.
    // `visible` = hay topbar dibujándola (en mobile no hay: el header mobile
    // muestra el municipio, no la pantalla).
    <MigasProvider items={navigation} visible={!isMobile}>
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.contentBackground, overflowX: 'clip' }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Shell v2 DESKTOP: sidebar nuevo (256/72, tokens --pl-sidebar-w*).
          Colapso controlado acá: persiste en localStorage y de él sale el
          padding-left del contenido (var --sidebar-width). */}
      {!isMobile && (
        <SidebarV2
          items={navigation}
          colapsado={sidebarCollapsed}
          onToggleColapsado={() => setSidebarCollapsed((v) => !v)}
        />
      )}

      {/* Sidebar VIEJO — solo MOBILE (drawer + header + bottom bar quedan
          como están; en desktop lo reemplaza el shell v2). */}
      {/* Transition SOLO transform para evitar jank en el primer click (antes
         usaba transition-all + -translate-x-full clase => el primer paint no
         tenia transform base y aparecia un frame mal posicionado). */}
      {isMobile && (
      <div
        className={`fixed left-0 top-0 bottom-0 z-50 shadow-xl flex flex-col sidebar-container backdrop-blur-sm ${isCollapsed ? 'sidebar-collapsed' : ''}`}
        style={{
          backgroundColor: `${theme.sidebar}e6`,
          width: sidebarWidth,
          transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: isMobile ? 'transform' : 'auto',
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
        <div
          className="relative z-10 pl-7 pr-3 py-4 border-b"
          style={{ borderColor: `${theme.sidebarTextSecondary}20` }}
        >
          <button
            onClick={() => navigate('/gestion')}
            className="flex items-center gap-2 w-full transition-all hover:opacity-80 active:scale-95"
            style={{
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
          >
            {/* Logo SIEMPRE a 40 (regla del dueño: "el logo va de este tamaño,
                el logo que sea" — la referencia es el bloque de Munify). */}
            <BrandMark size={40} variant="sidebar" className="flex-shrink-0" />
            <div
              style={{
                width: isCollapsed ? 0 : 'auto',
                opacity: isCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
              }}
            >
              {/* Bloque de marca del sidebar: distribución y tamaños ORIGINALES
                  (la escala grande del lockup es SOLO del hero del login).
                  Único agregado: el bicolor tenant-driven del nombre. */}
              <span
                className={`block font-bold leading-tight ${BRAND.name.length > 12 ? 'text-sm' : 'text-lg'}`}
                style={{ color: theme.sidebarText, fontFamily: BRAND.nameFont }}
              >
                {(() => {
                  // Bicolor: multi-palabra corta por espacio; una palabra usa
                  // nameAccentIndex (Munify: "Muni"+"fy"). Sin índice → plano.
                  const words = BRAND.name.split(' ');
                  let head = BRAND.name;
                  let tail = '';
                  if (words.length > 1) {
                    head = words[0];
                    tail = ' ' + words.slice(1).join(' ');
                  } else if (BRAND.nameAccentIndex) {
                    head = BRAND.name.slice(0, BRAND.nameAccentIndex);
                    tail = BRAND.name.slice(BRAND.nameAccentIndex);
                  }
                  return (
                    <>
                      {head}
                      {/* El tramo acentuado sigue el ACENTO ACTIVO del tema
                          (mismo criterio que el shell v2), no el color fijo de
                          marca: si el usuario cambia el acento en Apariencia,
                          el nombre acompaña en vez de quedarse verde. */}
                      {tail && <span className="sv2-nombre-acento">{tail}</span>}
                    </>
                  );
                })()}
              </span>
              {/* Super Admin (sin municipio_id) no muestra municipio */}
              {municipioActual && user?.municipio_id && (
                <p
                  className="text-[10px] leading-tight mt-0.5 line-clamp-2"
                  style={{ color: theme.sidebarTextSecondary }}
                >
                  {municipioActual.nombre}
                </p>
              )}
              {/* Super Admin (sin municipio_id): no mostrar nada */}
            </div>
          </button>
        </div>

        {/* Muni Switcher — solo super admin */}
        {user?.rol === 'admin' && !user?.municipio_id && !isCollapsed && (
          <div className="relative z-10 px-3 py-2 border-b" style={{ borderColor: `${theme.sidebarTextSecondary}20` }}>
            <MunicipioSwitcher />
          </div>
        )}

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
              {(user.nombre?.[0] || '?')}{user.apellido?.[0] || ''}
            </div>
            <div
              style={{
                width: isCollapsed ? 0 : 'auto',
                opacity: isCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s',
              }}
            >
              <p className="text-xs font-semibold leading-tight text-center" style={{ color: theme.sidebarText }}>
                {user.nombre} {user.apellido}
              </p>
              {/* Rol dinámico: el bloque nunca pasa de 2 renglones. Si el
                  nombre es largo y wrapea (>18 chars en el sidebar angosto),
                  el rol se oculta — nombre en 2 líneas + rol = 3 renglones feos. */}
              {`${user.nombre} ${user.apellido}`.length <= 18 && (
                <p className="text-xs capitalize mt-0.5 whitespace-nowrap text-center" style={{ color: theme.sidebarTextSecondary }}>
                  {user.dependencia ? 'Dependencia' : user.rol}
                </p>
              )}
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
                            const apiUrl = apiUrl_;
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
        <nav className="relative z-10 flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {navigation.map((item, idx) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            // Header de categoría: se muestra cuando cambia respecto al anterior
            // y el sidebar no está colapsado.
            const itemCategoria = (item as { categoria?: string }).categoria;
            const prevCategoria = idx > 0
              ? (navigation[idx - 1] as { categoria?: string }).categoria
              : undefined;
            const showCategoryHeader = !isCollapsed && itemCategoria && itemCategoria !== prevCategoria;
            // Badge count si el item lo pide (ej: Mis Reclamos -> badges.reclamos)
            const badgeCount = (item as { badgeKey?: 'reclamos' | 'tramites' | 'tasas' }).badgeKey
              ? badges[(item as { badgeKey: 'reclamos' | 'tramites' | 'tasas' }).badgeKey]
              : 0;
            return (
              <React.Fragment key={item.href}>
                {showCategoryHeader && (
                  <div
                    className="pl-4 pr-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider select-none"
                    style={{ color: theme.sidebarTextSecondary, opacity: 0.55 }}
                  >
                    {itemCategoria}
                  </div>
                )}
              <Link
                to={item.href}
                className="flex items-center py-2.5 rounded-lg text-xs font-medium active:scale-[0.98] group relative overflow-hidden"
                style={{
                  backgroundColor: isActive ? theme.primary : 'transparent',
                  color: isActive ? '#ffffff' : theme.sidebarTextSecondary,
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  paddingLeft: isCollapsed ? '0' : '16px',
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
                {/* Badge con contador de items pendientes (reclamos/tramites/tasas) */}
                {badgeCount > 0 && (
                  <span
                    className={`${isCollapsed ? 'absolute top-1 right-1' : 'ml-2 flex-shrink-0'} min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center`}
                    style={{
                      backgroundColor: `${theme.primary}25`,
                      color: theme.primary,
                      border: `1px solid ${theme.primary}40`,
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
                {badgeCount === 0 && isActive && !isCollapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
                )}
              </Link>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Botón colapsar/expandir - al final del sidebar, solo en desktop */}
        <div className="hidden lg:flex relative z-10 px-2 py-3 border-t justify-center" style={{ borderColor: `${theme.sidebarTextSecondary}20` }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-md hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
            style={{
              color: theme.sidebarText,
              backgroundColor: `${theme.primary}20`,
            }}
            title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
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
      )}

      {/* Header sticky solo mobile */}
      {isMobile && (
        <header
          className="fixed top-0 left-0 right-0 z-40 px-4 pb-3 flex items-center justify-between backdrop-blur-sm lg:hidden"
          style={{
            backgroundColor: `${theme.card}f0`,
            borderBottom: `1px solid ${theme.border}`,
            // La PWA se dibuja DEBAJO de la barra de estado (viewport-fit=cover
            // + status-bar-style translúcida), así que el header tiene que
            // bajar lo que mida el notch / Dynamic Island. Nunca un número
            // fijo: cambia por modelo, y en Android/desktop el inset vale 0
            // — de ahí el mínimo de 12px.
            paddingTop: 'max(env(safe-area-inset-top), 12px)',
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

          {/* Centro: Logo + Nombre del municipio. Quién manda lo decide
              `logoDelMunicipio` (único punto): en marca mono-tenant devuelve
              null y va el SVG de marca limpio, sin recuadro; en Munify
              multi-tenant, el logo del muni en su badge, como siempre. */}
          <div className="flex-1 flex items-center justify-center gap-2 mx-2">
            {(() => {
              const logoMuni = logoDelMunicipio(municipioActual?.logo_url);
              if (!logoMuni) return <BrandMark size={26} className="flex-shrink-0" />;
              return (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${theme.primary}20` }}
                >
                  <img src={logoMuni} alt={municipioActual?.nombre} className="w-5 h-5 object-contain" />
                </div>
              );
            })()}
            <h1 className="text-sm font-semibold truncate" style={{ color: theme.text }}>
              {municipioActual?.nombre?.replace('Municipalidad de ', '') || 'Municipio'}
            </h1>
          </div>

          {/* Derecha: luna/sol + Notificaciones */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Theme selector */}
            <button
              onClick={alternarModo}
              className="p-2 rounded-lg transition-colors"
              style={{ color: theme.textSecondary }}
              title={currentMode === 'claro' ? 'Pasar al tema oscuro' : 'Pasar al tema claro'}
              aria-label={currentMode === 'claro' ? 'Pasar al tema oscuro' : 'Pasar al tema claro'}
            >
              {currentMode === 'claro'
                ? <Moon className="h-5 w-5" strokeWidth={2.5} />
                : <Sun className="h-5 w-5" strokeWidth={2.5} />}
            </button>
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
            // Header sticky mobile + la safe area del teléfono: el header baja
            // lo que mida el notch, así que el contenido tiene que acompañar o
            // el primer bloque queda tapado.
            paddingTop: isMobile ? 'calc(64px + env(safe-area-inset-top, 0px))' : undefined,
            paddingBottom: isMobile ? '80px' : undefined, // Espacio para el bottom tab bar en mobile
            zIndex: 1,
          }}
        >
          {/* Topbar v2 — SOLO DESKTOP: contexto | breadcrumb || acciones |
              persona. Sticky en flujo (mismo mecanismo que la barra vieja). */}
          {!isMobile && (
            <TopbarV2 acciones={accionesTopbar} menuUsuario={menuUsuarioTopbar} />
          )}

          {/* Dropdown del tema — portal SIEMPRE montado (los triggers viven
              en la topbar v2 en desktop y en el header sticky en mobile). */}
          {/* El selector de temas salió de la topbar (pedido del dueño,
              2026-08-03): ahí queda SOLO la luna/sol, que alterna entre el
              tema claro y el oscuro que el usuario eligió en Configuración →
              Apariencia. Elegir CUÁL claro y CUÁL oscuro se hace allá, que es
              donde se ven las seis muestras; la topbar es para el gesto de
              todos los días, no para configurar. */}

          {/* Banner de Dependencia — solo MOBILE: en desktop el contexto de
              la dependencia vive en la pill de la topbar v2 (el breadcrumb y
              el contexto van en la topbar, no en la página). */}
          {isMobile && user.dependencia && (() => {
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

          {/* El banner de "Activá las notificaciones" se reemplazo por
              NotificationActivationSheet (bottom-sheet 35vh con copy escalado).
              El nuevo sheet se monta una sola vez al final del Layout. */}

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
              {(() => {
                // Menú en MOSAICO (BentoMenu del kit): la jerarquía la hace el
                // TAMAÑO del bloque, no el color. Antes eran ocho tarjetas
                // idénticas donde encontrar una era leerlas todas — y el botón
                // decía "+" pero el menú no creaba nada. Ahora lo que crea va
                // en el bloque grande y lo que sólo navega, en tiras al pie.
                const items: BentoItem[] = [];

                if (user?.rol === 'admin' || user?.rol === 'supervisor') {
                  items.push(
                    {
                      id: 'reclamo',
                      titulo: 'Cargar un reclamo',
                      detalle: 'A nombre de un vecino',
                      icono: Plus,
                      forma: 'banner',
                      // El dato es CONTEXTUAL a quien mira: a alguien de
                      // gestion lo que le importa junto a "cargar" es cuanto
                      // hay en riesgo de vencer. Solo se muestra si el
                      // contador existe de verdad.
                      ...(navBadges.sla
                        ? { dato: navBadges.sla, datoSub: 'en riesgo de vencer' }
                        : navBadges.reclamos
                          ? { dato: navBadges.reclamos, datoSub: 'reclamos en total' }
                          : {}),
                      onClick: () => navigate('/gestion/crear-reclamo'),
                    },
                    {
                      id: 'tramite',
                      titulo: 'Trámite',
                      detalle: 'Iniciar una gestión',
                      icono: FileCheck,
                      forma: 'chica',
                      onClick: () => navigate('/gestion/crear-tramite'),
                    },
                    {
                      id: 'mostrador',
                      titulo: 'Mostrador',
                      detalle: 'Atender en ventanilla',
                      icono: ScanLine,
                      forma: 'chica',
                      onClick: () => navigate('/gestion/mostrador'),
                    },
                    { id: 'mapa', titulo: 'Mapa', detalle: 'Dónde se concentran', icono: Map, forma: 'ancha', onClick: () => navigate('/gestion/mapa') },
                    { id: 'agenda', titulo: 'Agenda', detalle: 'Turnos del día', icono: Calendar, forma: 'ancha', onClick: () => navigate('/gestion/agenda-turnos') },
                    // "Conocé" y "Pulso" no decían qué hacen: se nombran por lo
                    // que son.
                    { id: 'presentacion', titulo: 'Presentación', detalle: 'Recorrido guiado', icono: Sparkles, forma: 'ancha', onClick: () => setPresentacionOpen(true) },
                    { id: 'vivo', titulo: 'Pantalla en vivo', detalle: 'Para mostrar en una TV', icono: Radio, forma: 'ancha', onClick: () => navigate('/gestion?live=1') },
                    { id: 'config', titulo: 'Configuración', icono: Settings, forma: 'ancha', onClick: () => navigate('/gestion/configuracion') },
                  );
                } else {
                  // El vecino sí tiene sus contadores reales a mano.
                  items.push(
                    {
                      id: 'reclamo',
                      titulo: 'Hacer un reclamo',
                      detalle: 'Contanos qué pasa en tu barrio',
                      icono: AlertCircle,
                      forma: 'banner',
                      // Al vecino no le sirve el total del municipio: le
                      // sirve cuantos SUYOS estan en curso.
                      ...(badges.reclamos > 0
                        ? { dato: badges.reclamos, datoSub: 'tuyos en curso' }
                        : {}),
                      onClick: () => navigate('/gestion/crear-reclamo'),
                    },
                    {
                      id: 'tramite',
                      titulo: 'Trámite',
                      detalle: 'Iniciar una gestión',
                      icono: FileCheck,
                      forma: 'chica',
                      onClick: () => navigate('/gestion/crear-tramite'),
                    },
                    {
                      id: 'mis-reclamos',
                      titulo: 'Mis reclamos',
                      icono: ClipboardList,
                      forma: 'chica',
                      ...(badges.reclamos > 0 ? { dato: badges.reclamos, datoSub: 'en curso' } : {}),
                      onClick: () => navigate('/gestion/mis-reclamos'),
                    },
                  );
                }

                return (
                  <BentoMenu
                    items={items.map((it) => ({
                      ...it,
                      onClick: () => { setCreateMenuOpen(false); it.onClick(); },
                    }))}
                    ariaLabel="Acciones"
                  />
                );
              })()}
            </div>
          )}

          <nav
            ref={navInferiorRef}
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
                      {/* El gradiente terminaba en #ec4899 (rosa fucsia) FIJO en el
                          código: en la marca verde el botón salía rosado y no se
                          parecía a nada del tema. Ahora los dos extremos salen del
                          acento activo, así que cada marca lo hereda en su color.
                          Las transparencias van por alpha(): pegar dígitos al final
                          del color sólo funciona si SIEMPRE es un hex de seis. */}
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 relative"
                        style={{
                          background: `linear-gradient(135deg, ${lighten(theme.primary, 12)} 0%, ${theme.primary} 100%)`,
                          boxShadow: createMenuOpen
                            ? `0 6px 25px ${alpha(theme.primary, 0.38)}`
                            : `0 4px 20px ${alpha(theme.primary, 0.31)}`,
                          transform: createMenuOpen ? 'rotate(45deg) scale(1.1)' : 'rotate(0deg) scale(1)',
                        }}
                      >
                        {/* Blanco o negro según la luminancia del acento, no fijo. */}
                        <Plus
                          className="h-7 w-7"
                          strokeWidth={2.5}
                          style={{ color: 'var(--pl-on-accent)' }}
                        />
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

                // Tabs normales — con badge rojo si hay items pendientes del vecino
                let tabBadge = 0;
                if (tab.path === '/gestion/mis-reclamos') tabBadge = badges.reclamos;
                else if (tab.path === '/gestion/mis-tramites') tabBadge = badges.tramites;
                else if (tab.path === '/gestion/mis-tasas') tabBadge = badges.tasas;

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
                          className="p-2 rounded-xl transition-colors relative"
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
                          {tabBadge > 0 && (
                            <span
                              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                              style={{
                                backgroundColor: '#ef4444',
                                color: '#ffffff',
                                boxShadow: '0 2px 4px rgba(239,68,68,0.5)',
                              }}
                            >
                              {tabBadge > 9 ? '9+' : tabBadge}
                            </span>
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

      {/* Chat Widget con IA — OCULTO temporalmente por pedido del user.
          Cuando se quiera volver, descomentar la linea de abajo. */}
      {/* {!isMobile && <ChatWidget />} */}

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
              {(user.nombre?.[0] || '?')}{user.apellido?.[0] || ''}
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
                {(user.nombre?.[0] || '?')}{user.apellido?.[0] || ''}
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
                        const apiUrl = apiUrl_;
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

      {/* Bottom-sheet de activacion de notificaciones — auto-trigger al login
          + listener para post-creacion de reclamos/tramites. */}
      <NotificationActivationSheet />

      {/* Recorrido guiado abierto desde el menú "Más" del admin en mobile. */}
      <PresentacionLive open={presentacionOpen} onClose={() => setPresentacionOpen(false)} />
    </div>
    </MigasProvider>
  );
}
