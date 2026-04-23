import {
  Home, ClipboardList, Map,
  Wrench, FileDown, Clock, Trophy, FileCheck, BarChart3, Plus, History, CalendarDays, LayoutDashboard, Settings, Building2,
  FolderTree, FileText, Activity, Zap, Receipt, Wallet, ScanLine
} from 'lucide-react';

interface NavigationOptions {
  userRole: string;
  hasDependencia?: boolean;
  /** Si el usuario admin no tiene municipio_id es superadmin (cross-municipio). */
  isSuperAdmin?: boolean;
  /**
   * Flag de UI del municipio actual. Si es false, los 3 ABMs de
   * "Categorías Reclamo", "Categorías Trámite" y "Tipos de Trámite" se
   * ocultan del sidebar (quedan sólo accesibles desde /gestion/ajustes).
   * Default true para no romper munis existentes.
   */
  abmEnSidebar?: boolean;
}

export const getNavigation = (userRoleOrOptions: string | NavigationOptions) => {
  // Soportar ambas firmas: getNavigation('admin') o getNavigation({ userRole: 'admin', hasDependencia: true })
  const userRole = typeof userRoleOrOptions === 'string' ? userRoleOrOptions : userRoleOrOptions.userRole;
  const hasDependencia = typeof userRoleOrOptions === 'object' ? userRoleOrOptions.hasDependencia : false;
  const isSuperAdmin = typeof userRoleOrOptions === 'object' ? !!userRoleOrOptions.isSuperAdmin : false;
  const abmEnSidebar = typeof userRoleOrOptions === 'object'
    ? (userRoleOrOptions.abmEnSidebar ?? true)
    : true;

  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isVecino = userRole === 'vecino';
  const isDependencia = hasDependencia && isSupervisor; // Un usuario de dependencia tiene rol supervisor con dependencia asignada

  return [
    // === SECCIÓN DEPENDENCIA (usuarios de dependencia) ===
    {
      name: 'Mi Área',
      href: '/gestion/mi-area',
      icon: Building2,
      show: isDependencia,
      description: 'Dashboard de mi dependencia'
    },
    {
      name: 'Reclamos',
      href: '/gestion/reclamos-area',
      icon: ClipboardList,
      show: isDependencia,
      description: 'Reclamos de mi área'
    },
    {
      name: 'Trámites',
      href: '/gestion/tramites-area',
      icon: FileCheck,
      show: isDependencia,
      description: 'Trámites de mi área'
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isDependencia,
      description: 'Ver ubicaciones'
    },
    {
      name: 'Estadísticas',
      href: '/gestion/estadisticas-area',
      icon: BarChart3,
      show: isDependencia,
      description: 'Rendimiento del área'
    },

    // === SECCIÓN GESTORES (Admin/Supervisor) ===
    {
      name: 'Dashboard',
      href: '/gestion',
      icon: Home,
      show: isAdminOrSupervisor,
      description: 'Resumen y métricas'
    },
    {
      name: 'Reclamos',
      href: '/gestion/reclamos',
      icon: ClipboardList,
      show: isAdminOrSupervisor,
      description: 'Gestionar todos los reclamos'
    },
    {
      name: 'Trámites',
      href: '/gestion/tramites',
      icon: FileCheck,
      show: isAdminOrSupervisor,
      description: 'Gestionar trámites'
    },
    {
      name: 'Tasas',
      href: '/gestion/tasas',
      icon: Receipt,
      show: isAdminOrSupervisor,
      description: 'Partidas del padrón y deudas'
    },
    {
      name: 'Pagos',
      href: '/gestion/pagos',
      icon: Wallet,
      show: isAdminOrSupervisor,
      description: 'Histórico transaccional para contaduría'
    },
    {
      name: 'Mostrador',
      href: '/gestion/mostrador',
      icon: ScanLine,
      show: isAdminOrSupervisor,
      description: 'Ventanilla asistida — biometría + trámite presencial'
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isAdminOrSupervisor,
      description: 'Ver reclamos en el mapa'
    },
    {
      name: 'Tablero',
      href: '/gestion/tablero',
      icon: Wrench,
      show: isAdminOrSupervisor,
      description: 'Tablero Kanban'
    },
    {
      name: 'Planificación',
      href: '/gestion/planificacion',
      icon: CalendarDays,
      show: isAdminOrSupervisor,
      description: 'Calendario semanal del personal'
    },
    {
      name: 'SLA',
      href: '/gestion/sla',
      icon: Clock,
      show: isAdminOrSupervisor,
      description: 'Gestión de SLA'
    },
    {
      name: 'Exportar',
      href: '/gestion/exportar',
      icon: FileDown,
      show: isAdminOrSupervisor,
      description: 'Exportar informes CSV'
    },
    {
      name: 'Panel BI',
      href: '/gestion/panel-bi',
      icon: LayoutDashboard,
      show: isAdminOrSupervisor,
      description: 'Consultas y análisis con IA'
    },
    // === ABMs per-municipio (refactor trámites/categorías) ===
    // Se muestran sólo si el muni tiene `abm_en_sidebar=true`. Los munis
    // creados por el flow de demo arrancan en false → estos 3 quedan
    // accesibles únicamente desde /gestion/ajustes.
    {
      name: 'Categorías Reclamo',
      href: '/gestion/categorias-reclamo',
      icon: FolderTree,
      show: isAdminOrSupervisor && abmEnSidebar && !isSuperAdmin,
      description: 'Categorías de reclamos del municipio'
    },
    {
      name: 'Categorías Trámite',
      href: '/gestion/categorias-tramite',
      icon: FolderTree,
      show: isAdminOrSupervisor && abmEnSidebar && !isSuperAdmin,
      description: 'Categorías de trámites del municipio'
    },
    {
      name: 'Tipos de Trámite',
      href: '/gestion/tramites-config',
      icon: FileText,
      show: isAdminOrSupervisor && abmEnSidebar && !isSuperAdmin,
      description: 'Trámites específicos del municipio (ej: Licencia de Conducir)'
    },
    // === Solo SUPERADMIN (admin sin municipio asignado) ===
    {
      name: 'Municipios',
      href: '/gestion/municipios',
      icon: Building2,
      show: isSuperAdmin,
      description: 'Alta y gestión de municipios (cross-tenant)'
    },
    {
      name: 'Auditoría',
      href: '/gestion/admin/audit-logs',
      icon: Activity,
      show: isSuperAdmin,
      description: 'Consola de auditoría cross-municipio (resumen + logs)'
    },
    {
      name: 'Ajustes',
      href: '/gestion/ajustes',
      icon: Settings,
      show: isAdminOrSupervisor,
      description: 'Configuración del sistema'
    },

    // === SECCIÓN VECINOS ===
    {
      name: 'Mi Panel',
      href: '/gestion/mi-panel',
      icon: Home,
      show: isVecino,
      description: 'Tu panel personal'
    },
    {
      name: 'Mis Reclamos',
      href: '/gestion/mis-reclamos',
      icon: ClipboardList,
      show: isVecino,
      description: 'Ver tus reclamos',
      badgeKey: 'reclamos',
    },
    {
      name: 'Mis Trámites',
      href: '/gestion/mis-tramites',
      icon: FileCheck,
      show: isVecino,
      description: 'Ver tus trámites',
      badgeKey: 'tramites',
    },
    {
      name: 'Mis Tasas',
      href: '/gestion/mis-tasas',
      icon: BarChart3,
      show: isVecino,
      description: 'Tasas y boletas pendientes (ABL, patente, multas)',
      badgeKey: 'tasas',
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isVecino,
      description: 'Ver mapa de reclamos'
    },
    {
      name: 'Logros',
      href: '/gestion/logros',
      icon: Trophy,
      show: isVecino,
      description: 'Tus logros y puntos'
    },
  ].filter(item => item.show);
};

/**
 * Detecta si el usuario está en un dispositivo móvil
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Detectar por user agent
  const userAgent = navigator.userAgent || navigator.vendor;
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

  // También detectar por ancho de pantalla (menos de 1024px se considera mobile/tablet)
  const isSmallScreen = window.innerWidth < 1024;

  return mobileRegex.test(userAgent) || isSmallScreen;
};

/**
 * Obtiene la ruta por defecto según el rol del usuario
 * Ahora todos usan /gestion con el Layout unificado que tiene footer móvil
 * @param role - Rol del usuario
 * @param hasDependencia - Si el usuario es de dependencia
 */
/** Helper conveniente: deriva todo del objeto user. */
export const getDefaultRouteForUser = (user: { rol: string; dependencia?: unknown; municipio_id?: number | null; is_super_admin?: boolean }) => {
  const isSuperAdmin = !!user.is_super_admin || (user.rol === 'admin' && !user.municipio_id);
  return getDefaultRoute(user.rol, !!user.dependencia, isSuperAdmin);
};

export const getDefaultRoute = (role: string, hasDependencia?: boolean, isSuperAdmin?: boolean) => {
  // Super admin → consola global (cross-tenant), no dashboard de un muni específico
  if (isSuperAdmin) {
    return '/gestion/consola';
  }

  // Usuarios de dependencia van a su dashboard de área
  if (hasDependencia && role === 'supervisor') {
    return '/gestion/mi-area';
  }

  switch (role) {
    case 'admin':
    case 'supervisor':
      return '/gestion';
    case 'vecino':
      return '/gestion/mi-panel';
    default:
      return '/gestion';
  }
};
