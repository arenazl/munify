import {
  Home, ClipboardList, Map, Users,
  Wrench, FileText, FolderTree, MapPin, FileDown, Clock, PlusCircle, Trophy, MessageCircle, FileCheck, Settings
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
      name: 'Empleados',
      href: '/gestion/empleados',
      icon: Users,
      show: isAdminOrSupervisor,
      description: 'Gestionar empleados'
    },
    {
      name: 'Usuarios',
      href: '/gestion/usuarios',
      icon: Users,
      show: isAdminOrSupervisor,
      description: 'Gestionar usuarios'
    },
    {
      name: 'Categorías',
      href: '/gestion/categorias',
      icon: FolderTree,
      show: isAdmin,
      description: 'Gestionar categorías'
    },
    {
      name: 'Zonas',
      href: '/gestion/zonas',
      icon: MapPin,
      show: isAdmin,
      description: 'Gestionar zonas/barrios'
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
      name: 'WhatsApp',
      href: '/gestion/whatsapp',
      icon: MessageCircle,
      show: isAdminOrSupervisor,
      description: 'Configurar WhatsApp Business'
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
    // === AJUSTES (para todos los usuarios autenticados) ===
    {
      name: 'Ajustes',
      href: '/gestion/ajustes',
      icon: Settings,
      show: true,
      description: 'Preferencias y configuracion'
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
