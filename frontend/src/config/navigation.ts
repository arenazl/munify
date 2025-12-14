import {
  Home, ClipboardList, Map, Users,
  Wrench, FileText, FolderTree, MapPin, FileDown, Clock, PlusCircle
} from 'lucide-react';

export const getNavigation = (userRole: string) => {
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isCuadrilla = userRole === 'cuadrilla';
  const isVecino = userRole === 'vecino';

  return [
    // === SECCIÓN PRINCIPAL ===
    {
      name: 'Dashboard',
      href: '/',
      icon: Home,
      show: isAdminOrSupervisor,
      description: 'Resumen y métricas'
    },
    {
      name: 'Inicio',
      href: '/mi-panel',
      icon: Home,
      show: isVecino,
      description: 'Mi panel personal'
    },
    {
      name: 'Mis Reclamos',
      href: '/mis-reclamos',
      icon: FileText,
      show: isVecino,
      description: 'Ver mis reclamos'
    },
    {
      name: 'Nuevo Reclamo',
      href: '/nuevo-reclamo',
      icon: PlusCircle,
      show: isVecino,
      description: 'Crear un nuevo reclamo'
    },
    {
      name: 'Reclamos',
      href: '/reclamos',
      icon: ClipboardList,
      show: isAdminOrSupervisor,
      description: 'Gestionar todos los reclamos'
    },
    {
      name: 'Mapa',
      href: '/mapa',
      icon: Map,
      show: true,
      description: 'Ver reclamos en el mapa'
    },
    {
      name: 'Tablero',
      href: '/tablero',
      icon: Wrench,
      show: isCuadrilla || isAdminOrSupervisor,
      description: 'Tablero de trabajo'
    },

    // === SECCIÓN ADMINISTRACIÓN ===
    {
      name: 'Empleados',
      href: '/empleados',
      icon: Users,
      show: isAdminOrSupervisor,
      description: 'Gestionar empleados'
    },
    {
      name: 'Usuarios',
      href: '/usuarios',
      icon: Users,
      show: isAdmin,
      description: 'Gestionar usuarios'
    },
    {
      name: 'Categorías',
      href: '/categorias',
      icon: FolderTree,
      show: isAdmin,
      description: 'Gestionar categorías'
    },
    {
      name: 'Zonas',
      href: '/zonas',
      icon: MapPin,
      show: isAdmin,
      description: 'Gestionar zonas/barrios'
    },
    {
      name: 'SLA',
      href: '/sla',
      icon: Clock,
      show: isAdminOrSupervisor,
      description: 'Gestión de SLA'
    },
    {
      name: 'Exportar',
      href: '/exportar',
      icon: FileDown,
      show: isAdminOrSupervisor,
      description: 'Exportar informes CSV'
    },
  ].filter(item => item.show);
};

export const getDefaultRoute = (role: string) => {
  switch (role) {
    case 'admin':
    case 'supervisor':
      return '/';
    case 'cuadrilla':
      return '/tablero';
    case 'vecino':
      return '/mi-panel';
    default:
      return '/mis-reclamos';
  }
};
