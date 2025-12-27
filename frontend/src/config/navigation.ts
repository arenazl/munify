import {
  Home, ClipboardList, Map,
  Wrench, FileDown, Clock, Trophy, FileCheck
} from 'lucide-react';

export const getNavigation = (userRole: string) => {
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isEmpleado = userRole === 'empleado';
  const isVecino = userRole === 'vecino';

  return [
    // === SECCIÓN PRINCIPAL (Panel de Gestión) ===
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
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isAdminOrSupervisor || isEmpleado,
      description: 'Ver reclamos en el mapa'
    },
    {
      name: 'Tablero',
      href: '/gestion/tablero',
      icon: Wrench,
      show: isEmpleado || isAdminOrSupervisor,
      description: 'Tablero de trabajo'
    },
    {
      name: 'Mis Trabajos',
      href: '/gestion/mis-trabajos',
      icon: ClipboardList,
      show: isEmpleado,
      description: 'Reclamos asignados a mí'
    },

    // === SECCIÓN ADMINISTRACIÓN ===
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
      name: 'Trámites',
      href: '/gestion/tramites',
      icon: FileCheck,
      show: isAdminOrSupervisor,
      description: 'Gestionar trámites'
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
      name: 'Logros',
      href: '/gestion/logros',
      icon: Trophy,
      show: isVecino,
      description: 'Tus logros y puntos'
    },
  ].filter(item => item.show);
};

export const getDefaultRoute = (role: string) => {
  switch (role) {
    case 'admin':
    case 'supervisor':
      return '/gestion';
    case 'empleado':
      return '/gestion/tablero';
    case 'vecino':
      // Vecinos van a la app mobile-first
      return '/app';
    default:
      return '/app';
  }
};
