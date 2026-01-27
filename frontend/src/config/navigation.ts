import {
  Home, ClipboardList, Map,
  Wrench, FileDown, Clock, Trophy, FileCheck, BarChart3, Plus, History, CalendarDays, LayoutDashboard, Settings, Building2
} from 'lucide-react';

interface NavigationOptions {
  userRole: string;
  hasDependencia?: boolean;
}

export const getNavigation = (userRoleOrOptions: string | NavigationOptions) => {
  // Soportar ambas firmas: getNavigation('admin') o getNavigation({ userRole: 'admin', hasDependencia: true })
  const userRole = typeof userRoleOrOptions === 'string' ? userRoleOrOptions : userRoleOrOptions.userRole;
  const hasDependencia = typeof userRoleOrOptions === 'object' ? userRoleOrOptions.hasDependencia : false;

  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isEmpleado = userRole === 'empleado';
  const isVecino = userRole === 'vecino';
  const isDependencia = hasDependencia && isEmpleado; // Un usuario de dependencia tiene rol empleado pero con dependencia asignada

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
    {
      name: 'Ajustes',
      href: '/gestion/ajustes',
      icon: Settings,
      show: isAdminOrSupervisor,
      description: 'Configuración del sistema'
    },

    // === SECCIÓN EMPLEADOS (solo si no es usuario de dependencia) ===
    {
      name: 'Tablero',
      href: '/gestion/tablero',
      icon: Wrench,
      show: isEmpleado && !isDependencia,
      description: 'Tablero de trabajo'
    },
    {
      name: 'Mis Trabajos',
      href: '/gestion/mis-trabajos',
      icon: ClipboardList,
      show: isEmpleado && !isDependencia,
      description: 'Reclamos asignados a mí'
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isEmpleado && !isDependencia,
      description: 'Ver ubicaciones'
    },
    {
      name: 'Mi Rendimiento',
      href: '/gestion/mi-rendimiento',
      icon: BarChart3,
      show: isEmpleado && !isDependencia,
      description: 'Estadísticas de mi trabajo'
    },
    {
      name: 'Mi Historial',
      href: '/gestion/mi-historial',
      icon: History,
      show: isEmpleado && !isDependencia,
      description: 'Historial de mis trabajos'
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
      description: 'Ver tus reclamos'
    },
    {
      name: 'Mis Trámites',
      href: '/gestion/mis-tramites',
      icon: FileCheck,
      show: isVecino,
      description: 'Ver tus trámites'
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

  // También detectar por ancho de pantalla (menos de 768px se considera mobile)
  const isSmallScreen = window.innerWidth < 768;

  return mobileRegex.test(userAgent) || isSmallScreen;
};

/**
 * Obtiene la ruta por defecto según el rol del usuario
 * Ahora todos usan /gestion con el Layout unificado que tiene footer móvil
 * @param role - Rol del usuario
 * @param hasDependencia - Si el usuario es de dependencia
 */
export const getDefaultRoute = (role: string, hasDependencia?: boolean) => {
  // Usuarios de dependencia van a su dashboard de área
  if (hasDependencia && role === 'empleado') {
    return '/gestion/mi-area';
  }

  switch (role) {
    case 'admin':
    case 'supervisor':
      return '/gestion';
    case 'empleado':
      return '/gestion/mis-trabajos';
    case 'vecino':
      return '/gestion/mi-panel';
    default:
      return '/gestion';
  }
};
