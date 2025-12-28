import {
  Home, ClipboardList, Map,
  Wrench, FileDown, Clock, Trophy, FileCheck, BarChart3, Plus, History
} from 'lucide-react';

export const getNavigation = (userRole: string) => {
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isEmpleado = userRole === 'empleado';
  const isVecino = userRole === 'vecino';

  return [
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

    // === SECCIÓN EMPLEADOS ===
    {
      name: 'Tablero',
      href: '/gestion/tablero',
      icon: Wrench,
      show: isEmpleado,
      description: 'Tablero de trabajo'
    },
    {
      name: 'Mis Trabajos',
      href: '/gestion/mis-trabajos',
      icon: ClipboardList,
      show: isEmpleado,
      description: 'Reclamos asignados a mí'
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isEmpleado,
      description: 'Ver ubicaciones'
    },
    {
      name: 'Mi Rendimiento',
      href: '/gestion/mi-rendimiento',
      icon: BarChart3,
      show: isEmpleado,
      description: 'Estadísticas de mi trabajo'
    },
    {
      name: 'Mi Historial',
      href: '/gestion/mi-historial',
      icon: History,
      show: isEmpleado,
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
      name: 'Nuevo Reclamo',
      href: '/gestion/crear-reclamo',
      icon: Plus,
      show: isVecino,
      description: 'Reportar un problema'
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
 */
export const getDefaultRoute = (role: string) => {
  switch (role) {
    case 'admin':
    case 'supervisor':
      return '/gestion';
    case 'empleado':
      return '/gestion/tablero';
    case 'vecino':
      return '/gestion/mi-panel';
    default:
      return '/gestion';
  }
};
