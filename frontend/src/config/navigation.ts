import {
  Home, ClipboardList, Map,
  Wrench, Clock, Trophy, FileCheck, BarChart3, CalendarDays, LayoutDashboard, Settings, Building2,
  FolderTree, FileText, Activity, Receipt, Wallet, ScanLine, Layers, Sparkles,
  CalendarClock, Users, MapPin, TrendingUp, PiggyBank, Banknote, Hammer, Boxes,
} from 'lucide-react';

interface NavigationOptions {
  userRole: string;
  hasDependencia?: boolean;
  /** Usuario vinculado a un Empleado de campo (user.empleado_id). Habilita la vista "Trabajos". */
  hasEmpleado?: boolean;
  /** Si el usuario admin no tiene municipio_id es superadmin (cross-municipio). */
  isSuperAdmin?: boolean;
  /**
   * Flag de UI del municipio actual. Si es false, los 3 ABMs de
   * "Categorías Reclamo", "Categorías Trámite" y "Tipos de Trámite" se
   * ocultan del sidebar (quedan sólo accesibles desde /gestion/configuracion).
   * Default true para no romper munis existentes.
   */
  abmEnSidebar?: boolean;
  /**
   * Hrefs ocultos por el superadmin del municipio actual. Los items
   * con href en este set no se muestran (aun si el rol los permitiría).
   * Viene de GET /api/navigation/hrefs-ocultos al loguearse.
   */
  hrefsOcultos?: string[];
  /**
   * Modulos activos del municipio (feature flags). Items que dependen
   * de un modulo (ej: 'tesoreria') solo se muestran si su clave esta
   * aca. Default: set vacio → todos los items "modulares" se ocultan.
   */
  modulosActivos?: string[];
  /**
   * Modulos explicitamente desactivados para este municipio. Items que
   * referencian alguno de estos NO se muestran. Es OPT-OUT: si un modulo
   * no esta en este set, se asume activo (no rompe sesiones viejas).
   */
  modulosDesactivados?: string[];
  /**
   * IA habilitada para el municipio actual (gate central). Si es false, los
   * items de IA del sidebar (Análisis/Panel BI) se ocultan. Default false.
   */
  iaHabilitada?: boolean;
}

export const getNavigation = (userRoleOrOptions: string | NavigationOptions) => {
  // Soportar ambas firmas: getNavigation('admin') o getNavigation({ userRole: 'admin', hasDependencia: true })
  const userRole = typeof userRoleOrOptions === 'string' ? userRoleOrOptions : userRoleOrOptions.userRole;
  const hasDependencia = typeof userRoleOrOptions === 'object' ? userRoleOrOptions.hasDependencia : false;
  const hasEmpleado = typeof userRoleOrOptions === 'object' ? !!userRoleOrOptions.hasEmpleado : false;
  const isSuperAdmin = typeof userRoleOrOptions === 'object' ? !!userRoleOrOptions.isSuperAdmin : false;
  const abmEnSidebar = typeof userRoleOrOptions === 'object'
    ? (userRoleOrOptions.abmEnSidebar ?? true)
    : true;
  const hrefsOcultos = (() => {
    if (typeof userRoleOrOptions !== 'object') return new Set<string>();
    const raw = userRoleOrOptions.hrefsOcultos;
    if (!Array.isArray(raw)) return new Set<string>();
    return new Set<string>(raw.filter((h): h is string => typeof h === 'string'));
  })();
  const modulosActivos = (() => {
    if (typeof userRoleOrOptions !== 'object') return new Set<string>();
    const raw = userRoleOrOptions.modulosActivos;
    if (!Array.isArray(raw)) return new Set<string>();
    return new Set<string>(raw);
  })();
  const modulosDesactivados = (() => {
    if (typeof userRoleOrOptions !== 'object') return new Set<string>();
    const raw = userRoleOrOptions.modulosDesactivados;
    if (!Array.isArray(raw)) return new Set<string>();
    return new Set<string>(raw);
  })();
  // Helper: un modulo esta habilitado si NO esta en la lista de
  // desactivados. Opt-out, default activo (compat con munis viejos).
  const moduloOn = (modulo: string) => !modulosDesactivados.has(modulo);
  // Gate central de IA: los items de IA solo se muestran si el muni la tiene
  // habilitada (default false → opt-in, no se expone por accidente).
  const iaHabilitada = typeof userRoleOrOptions === 'object' ? !!userRoleOrOptions.iaHabilitada : false;

  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isOperadorVentanilla = userRole === 'operador_ventanilla';
  const isVecino = userRole === 'vecino';
  const isDependencia = hasDependencia && isSupervisor; // Un usuario de dependencia tiene rol supervisor con dependencia asignada
  // "Gestor" general del municipio = admin o supervisor SIN dependencia.
  // Los supervisores de dependencia tienen su propia sección "Mi Área" y no
  // deben ver el menú general (si no, Reclamos/Trámites/Mapa aparecen duplicados).
  const isAdminOrSupervisor = (isAdmin || isSupervisor) && !isDependencia;
  // Funcionario del muni = cualquier rol que atiende ventanilla. Cubre admin,
  // supervisor general, jefes de dependencia/secretarías y operadores de
  // ventanilla. El Mostrador es la única sección que se muestra a todos por
  // igual: cualquier funcionario con un vecino adelante puede iniciar el flow.
  const esFuncionarioMuni = isAdmin || isSupervisor || isOperadorVentanilla;

  return [
    // === SECCIÓN DEPENDENCIA (usuarios de dependencia) ===
    {
      name: 'Panel',
      href: '/gestion/mi-area',
      icon: Building2,
      show: isDependencia,
      categoria: 'Mi Área',
      description: 'Dashboard de mi dependencia'
    },
    {
      name: 'Reclamos',
      href: '/gestion/reclamos-area',
      icon: ClipboardList,
      show: isDependencia,
      categoria: 'Mi Área',
      description: 'Reclamos de mi área'
    },
    {
      name: 'Trámites',
      href: '/gestion/tramites-area',
      icon: FileCheck,
      show: isDependencia,
      categoria: 'Mi Área',
      description: 'Trámites de mi área'
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isDependencia,
      categoria: 'Mi Área',
      description: 'Ver ubicaciones'
    },
    {
      name: 'Estadísticas',
      href: '/gestion/estadisticas-area',
      icon: BarChart3,
      show: isDependencia,
      categoria: 'Mi Área',
      description: 'Rendimiento del área'
    },

    // === SECCIÓN GESTORES (Admin/Supervisor) ===
    {
      name: 'Dashboard',
      href: '/gestion',
      icon: Home,
      show: isAdminOrSupervisor && moduloOn('dashboard'),
      categoria: 'Principal',
      description: 'Resumen y métricas'
    },
    {
      name: 'Reclamos',
      href: '/gestion/reclamos',
      icon: ClipboardList,
      show: isAdminOrSupervisor && moduloOn('reclamos'),
      categoria: 'Principal',
      description: 'Gestionar todos los reclamos'
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isAdminOrSupervisor && moduloOn('mapa'),
      categoria: 'Principal',
      description: 'Ver reclamos en el mapa'
    },
    // === SECCIÓN TRÁMITES (la unidad trámite → turno → agenda, consolidación 2026-07) ===
    {
      name: 'Trámites',
      href: '/gestion/tramites',
      icon: FileCheck,
      show: isAdminOrSupervisor && moduloOn('tramites'),
      categoria: 'Trámites',
      description: 'Gestionar trámites'
    },
    {
      name: 'Agenda',
      href: '/gestion/agenda-turnos',
      icon: CalendarClock,
      show: isAdminOrSupervisor && moduloOn('tramites'),
      categoria: 'Trámites',
      description: 'Agenda diaria de turnos presenciales'
    },
    {
      name: 'Horarios',
      href: '/gestion/configuracion-agenda',
      icon: CalendarDays,
      show: isAdminOrSupervisor && moduloOn('tramites'),
      categoria: 'Trámites',
      description: 'Horarios, cupos y feriados de la agenda de turnos'
    },
    // === SECCIÓN CAMPO (empleados/operarios con tareas asignadas) ===
    {
      name: 'Trabajos',
      href: '/gestion/mis-trabajos',
      icon: Wrench,
      show: userRole === 'empleado' || ((isSupervisor || isAdmin) && hasEmpleado),
      categoria: 'Campo',
      description: 'Mis tareas asignadas en campo'
    },
    {
      name: 'Órdenes',
      href: '/gestion/ordenes-trabajo',
      icon: Hammer,
      // Opt-in por municipio (como tesorería): sin fila en municipio_modulos = oculto
      show: (isAdminOrSupervisor || userRole === 'empleado') && modulosActivos.has('ordenes_trabajo'),
      categoria: 'Campo',
      description: 'Órdenes de trabajo de cuadrillas'
    },
    {
      name: 'Inventario',
      href: '/gestion/inventario',
      icon: Boxes,
      // Opt-in por municipio: activos (vehículos, herramientas) + consumibles (materiales)
      show: isAdminOrSupervisor && modulosActivos.has('inventario'),
      categoria: 'Campo',
      description: 'Vehículos, herramientas y materiales'
    },
    {
      name: 'Mostrador',
      href: '/gestion/mostrador',
      icon: ScanLine,
      show: esFuncionarioMuni && moduloOn('mostrador'),
      categoria: 'Atención al vecino',
      description: 'Ventanilla asistida — biometría + trámite presencial'
    },
    {
      name: 'Tasas',
      href: '/gestion/tasas',
      icon: Receipt,
      show: isAdminOrSupervisor && moduloOn('tasas'),
      categoria: 'Atención al vecino',
      description: 'Partidas del padrón y deudas'
    },
    {
      name: 'Cobros',
      href: '/gestion/cobros',
      icon: Wallet,
      show: isAdminOrSupervisor && moduloOn('pagos'),
      categoria: 'Atención al vecino',
      description: 'Histórico transaccional para contaduría'
    },
    {
      name: 'Gastos',
      href: '/gestion/tesoreria',
      icon: Receipt,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Gastos cargados del municipio'
    },
    {
      name: 'Cajas',
      href: '/gestion/tesoreria/cajas',
      icon: PiggyBank,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Saldo de cada caja con ingresos y egresos'
    },
    {
      name: 'Conciliación',
      href: '/gestion/tesoreria/conciliacion',
      icon: Banknote,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Importar extracto bancario y matchear contra movimientos de caja'
    },
    {
      name: 'Proyección',
      href: '/gestion/tesoreria/proyecciones',
      icon: TrendingUp,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Resumen y proyecciones financieras'
    },
    {
      name: 'Ubicación',
      href: '/gestion/tesoreria/mapa',
      icon: MapPin,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Mapa de contactos y gastos'
    },
    {
      name: 'Contactos',
      href: '/gestion/tesoreria/contactos',
      icon: Users,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Personas y proveedores'
    },
    {
      name: 'Reportes',
      href: '/gestion/tesoreria/reportes',
      icon: BarChart3,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Egresos por caja, top conceptos, evolución'
    },
    {
      // Tarjetas de crédito con las que se pagan gastos — vive con Tesorería,
      // no en Configuración general (movido en la reorg de módulos 2026-07).
      name: 'Tarjetas',
      href: '/gestion/tarjetas',
      icon: Banknote,
      show: isAdminOrSupervisor && modulosActivos.has('tesoreria'),
      categoria: 'Tesorería',
      description: 'Tarjetas de crédito para pagos'
    },
    // === SUELDOS (flag propio desde la reorg 2026-07; antes cluster 'tesoreria') ===
    {
      name: 'Liquidaciones',
      href: '/gestion/tesoreria/agenda',
      icon: CalendarClock,
      show: isAdminOrSupervisor && modulosActivos.has('sueldos'),
      categoria: 'Sueldos',
      description: 'Pago de sueldos y recurrentes con premios'
    },
    {
      name: 'Empleados',
      href: '/gestion/sueldos/empleados',
      icon: Users,
      show: isAdminOrSupervisor && modulosActivos.has('sueldos'),
      categoria: 'Sueldos',
      description: 'Personal del muni con sueldo asignado'
    },
    {
      name: 'Reportes',
      href: '/gestion/sueldos/reportes',
      icon: BarChart3,
      show: isAdminOrSupervisor && modulosActivos.has('sueldos'),
      categoria: 'Sueldos',
      description: 'Masa salarial, top sueldos, próximos pagos'
    },
    // === CONTADURÍA (flag propio desde la reorg 2026-07; apagado por default) ===
    {
      name: 'Órdenes',
      href: '/gestion/contaduria/ordenes-pago',
      icon: FileCheck,
      show: isAdminOrSupervisor && modulosActivos.has('contaduria'),
      categoria: 'Contaduría',
      description: 'Autorización formal de pagos'
    },
    {
      name: 'Reportes',
      href: '/gestion/contaduria/reportes',
      icon: BarChart3,
      show: isAdminOrSupervisor && modulosActivos.has('contaduria'),
      categoria: 'Contaduría',
      description: 'OPs vencidas, próximas, top beneficiarios'
    },
    {
      name: 'Tablero',
      href: '/gestion/tablero',
      icon: Wrench,
      show: isAdminOrSupervisor && moduloOn('tablero'),
      categoria: 'Operación',
      description: 'Tablero Kanban'
    },
    {
      name: 'Planificación',
      href: '/gestion/planificacion',
      icon: CalendarDays,
      show: isAdminOrSupervisor && moduloOn('planificacion'),
      categoria: 'Operación',
      description: 'Calendario semanal del personal'
    },
    {
      name: 'SLA',
      href: '/gestion/sla',
      icon: Clock,
      show: isAdminOrSupervisor && moduloOn('sla'),
      categoria: 'Operación',
      description: 'Gestión de SLA'
    },
    {
      name: 'Análisis',
      href: '/gestion/panel-bi',
      icon: LayoutDashboard,
      show: isAdminOrSupervisor && moduloOn('panel-bi') && iaHabilitada,
      categoria: 'Operación',
      description: 'Consultas y análisis con IA'
    },
    // === ABMs per-municipio (solo si el modulo correspondiente esta activo) ===
    {
      name: 'Reclamos',
      href: '/gestion/categorias-reclamo',
      icon: FolderTree,
      show: isAdminOrSupervisor && abmEnSidebar && !isSuperAdmin && moduloOn('reclamos'),
      categoria: 'Configuración',
      description: 'Categorías de reclamos del municipio'
    },
    {
      name: 'Trámites',
      href: '/gestion/categorias-tramite',
      icon: FolderTree,
      show: isAdminOrSupervisor && abmEnSidebar && !isSuperAdmin && moduloOn('tramites'),
      categoria: 'Configuración',
      description: 'Categorías de trámites del municipio'
    },
    {
      name: 'Tipos',
      href: '/gestion/tramites-config',
      icon: FileText,
      show: isAdminOrSupervisor && abmEnSidebar && !isSuperAdmin && moduloOn('tramites'),
      categoria: 'Configuración',
      description: 'Trámites específicos del municipio'
    },
    {
      // Si el muni solo tiene Tesoreria activa, "Configuracion" entra
      // directo a la config de Tesoreria (no a la config general que esta vacia).
      name: 'Configuración',
      href: (
        modulosActivos.has('tesoreria') &&
        !moduloOn('reclamos') && !moduloOn('tramites') && !moduloOn('tasas') && !moduloOn('pagos')
      )
        ? '/gestion/configuracion/tesoreria'
        : '/gestion/configuracion',
      icon: Settings,
      show: isAdminOrSupervisor,
      categoria: 'Configuración',
      description: 'Configuración del sistema'
    },
    // === Solo SUPERADMIN ===
    {
      name: 'Municipios',
      href: '/gestion/municipios',
      icon: Building2,
      show: isSuperAdmin,
      categoria: 'Super Admin',
      description: 'Alta y gestión de municipios (cross-tenant)'
    },
    {
      name: 'Suscripciones',
      href: '/gestion/admin/suscripciones',
      icon: Building2,
      show: isSuperAdmin,
      categoria: 'Super Admin',
      description: 'Municipios suscriptos, plan, estado y próxima facturación'
    },
    {
      name: 'Módulos',
      href: '/gestion/admin/modulos',
      icon: Layers,
      show: isSuperAdmin,
      categoria: 'Super Admin',
      description: 'Activar/desactivar módulos por municipio (feature flags)'
    },
    {
      name: 'Auditoría',
      href: '/gestion/admin/audit-logs',
      icon: Activity,
      show: isSuperAdmin,
      categoria: 'Super Admin',
      description: 'Consola de auditoría cross-municipio'
    },
    {
      name: 'IA',
      href: '/gestion/admin/configuracion-ia',
      icon: Sparkles,
      show: isSuperAdmin,
      categoria: 'Super Admin',
      description: 'Prender/apagar IA por municipio y por módulo (Tesorería, Reclamos, Trámites)'
    },
    {
      name: 'Sidebar',
      href: '/gestion/sidebar-config',
      icon: Layers,
      show: isSuperAdmin,
      categoria: 'Super Admin',
      description: 'Configurar qué items del menú ve cada municipio'
    },

    // === SECCIÓN VECINOS ===
    {
      name: 'Panel',
      href: '/gestion/mi-panel',
      icon: Home,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Tu panel personal'
    },
    {
      name: 'Reclamos',
      href: '/gestion/mis-reclamos',
      icon: ClipboardList,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Ver tus reclamos',
      badgeKey: 'reclamos',
    },
    {
      name: 'Trámites',
      href: '/gestion/mis-tramites',
      icon: FileCheck,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Ver tus trámites',
      badgeKey: 'tramites',
    },
    {
      name: 'Turnos',
      href: '/gestion/mis-turnos',
      icon: CalendarClock,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Reservá y gestioná tus turnos presenciales',
      badgeKey: 'turnos',
    },
    {
      name: 'Tasas',
      href: '/gestion/mis-tasas',
      icon: BarChart3,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Tasas y boletas pendientes (ABL, patente, multas)',
      badgeKey: 'tasas',
    },
    {
      name: 'Mapa',
      href: '/gestion/mapa',
      icon: Map,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Ver mapa de reclamos'
    },
    {
      name: 'Logros',
      href: '/gestion/logros',
      icon: Trophy,
      show: isVecino,
      categoria: 'Mi cuenta',
      description: 'Tus logros y puntos'
    },
  ].filter(item => item.show && !hrefsOcultos.has(item.href));
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
    case 'empleado':
      // Operario de campo: directo a sus tareas asignadas
      return '/gestion/mis-trabajos';
    case 'vecino':
      return '/gestion/mi-panel';
    default:
      return '/gestion';
  }
};
