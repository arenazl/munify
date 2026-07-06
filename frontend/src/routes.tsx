import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RootRedirect from './components/RootRedirect';
import ReclamoLegacyRedirect from './components/ReclamoLegacyRedirect';

// Pages
import Landing from './pages/Landing';
import HomePublic from './pages/HomePublic';
import Login from './pages/Login';
import SuperAdminLogin from './pages/SuperAdminLogin';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import DashboardVecino from './pages/DashboardVecino';
import MisReclamos from './pages/MisReclamos';
import MisTurnos from './pages/MisTurnos';
import AgendaTurnos from './pages/AgendaTurnos';
import ConfiguracionAgenda from './pages/ConfiguracionAgenda';
import TarjetasCredito from './pages/TarjetasCredito';
import Reclamos from './pages/Reclamos';
import Mapa from './pages/Mapa';
import Tablero from './pages/Tablero';
import Empleados from './pages/Empleados';
import Usuarios from './pages/Usuarios';
import CategoriasReclamoConfig from './pages/CategoriasReclamoConfig';
import CategoriasTramiteConfig from './pages/CategoriasTramiteConfig';
import TramitesConfig from './pages/TramitesConfig';
import ProveedoresPago from './pages/ProveedoresPago';
import Zonas from './pages/Zonas';
import Configuracion from './pages/Configuracion';
import Exportar from './pages/Exportar';
import SLA from './pages/SLA';
import NuevoReclamoPage from './pages/NuevoReclamoPage';
import NuevoTramitePage from './pages/NuevoTramitePage';
import RegisterDiditCallback from './pages/RegisterDiditCallback';
import WhatsAppConfig from './pages/WhatsAppConfig';
import Gamificacion from './pages/Gamificacion';
import ReclamoDetalle from './pages/ReclamoDetalle';
import MisTramites from './pages/MisTramites';
import MisTasas from './pages/MisTasas';
import GestionTasas from './pages/GestionTasas';
import GestionPagos from './pages/GestionPagos';
import Mostrador from './pages/Mostrador';
import SidebarConfig from './pages/SidebarConfig';
import ModulosMunicipio from './pages/admin/ModulosMunicipio';
import ConfiguracionIA from './pages/ConfiguracionIA';
import PayBridgeCheckout from './pages/PayBridgeCheckout';
import GestionTramites from './pages/GestionTramites';
import CalificarReclamo from './pages/CalificarReclamo';
// Ajustes fue absorbido por Configuracion (unificacion 2026-05-14). Si alguien
// llega via /gestion/ajustes lo redirigimos.
import ImportarPadron from './pages/ImportarPadron';
import MiRendimiento from './pages/MiRendimiento';
import MiHistorial from './pages/MiHistorial';
import ConfigDashboard from './pages/ConfigDashboard';
import Onboarding from './pages/Onboarding';
import MunicipioHome from './pages/MunicipioHome';
import CapturaMovil from './pages/CapturaMovil';
import CapturaMovilFake from './pages/CapturaMovilFake';
import GestionCuadrillas from './pages/GestionCuadrillas';
import OrdenesTrabajo from './pages/OrdenesTrabajo';
import Inventario from './pages/Inventario';
import InventarioCategoriasConfig from './pages/InventarioCategoriasConfig';
import OTTiposTrabajoConfig from './pages/OTTiposTrabajoConfig';
import POITiposConfig from './pages/POITiposConfig';
import CatalogoTramites from './pages/CatalogoTramites';
import GestionAusencias from './pages/GestionAusencias';
import Planificacion from './pages/Planificacion';
import PanelBI from './pages/PanelBI';
import AuditLogs from './pages/admin/AuditLogs';
import ConsolaGlobal from './pages/admin/ConsolaGlobal';
import Suscripciones from './pages/admin/Suscripciones';
import Demo from './pages/Demo';
import DemoReady from './pages/DemoReady';
import PresentacionMunify from './pages/PresentacionMunify';
import MunicipioAcceso from './pages/MunicipioAcceso';
import DependenciasConfig from './pages/DependenciasConfig';
import AsignacionDependencias from './pages/AsignacionDependencias';
import Municipios from './pages/Municipios';
import MiArea from './pages/MiArea';

// Tesoreria
import Tesoreria from './pages/Tesoreria';
import TesoreriaContactos from './pages/TesoreriaContactos';
import TesoreriaMapa from './pages/TesoreriaMapa';
import TesoreriaProyecciones from './pages/TesoreriaProyecciones';
import TesoreriaProyectos from './pages/TesoreriaProyectos';
import TesoreriaAgenda from './pages/TesoreriaAgenda';
import TesoreriaCuracionBartolo from './pages/TesoreriaCuracionBartolo';
import ConfiguracionTesoreria from './pages/ConfiguracionTesoreria';
import OrdenesPago from './pages/OrdenesPago';
import TesoreriaCajas from './pages/TesoreriaCajas';
import TesoreriaConciliacion from './pages/TesoreriaConciliacion';
import SueldosEmpleados from './pages/SueldosEmpleados';
import ReportesContaduria from './pages/ReportesContaduria';
import ReportesTesoreria from './pages/ReportesTesoreria';
import ReportesSueldos from './pages/ReportesSueldos';

// Demos de diseño
import DemosIndex from './pages/demos';
import DemoGlassmorphism from './pages/demos/DemoGlassmorphism';
import DemoNeubrutalism from './pages/demos/DemoNeubrutalism';
import DemoMinimal from './pages/demos/DemoMinimal';
import DemoBento from './pages/demos/DemoBento';
import DemoCyberpunk from './pages/demos/DemoCyberpunk';

// Estudio de reels de promoción (marketing)
import ReelsStudio from './pages/ReelsStudio';
import ReelsVideos from './pages/ReelsVideos';
import VoiceStudio from './pages/VoiceStudio';

// Mobile App para ciudadanos (rutas legacy, redirigen a /home o usan componentes específicos)
import MobileLayout from './layouts/MobileLayout';
import {
  MobileMisReclamos,
  MobilePerfil,
  MobileLogros,
  MobileConsulta,
  MobileEstadisticas,
} from './pages/mobile';

export const router = createBrowserRouter([
  // === DEMOS DE DISEÑO ===
  { path: '/demos', element: <DemosIndex /> },
  { path: '/demos/glassmorphism', element: <DemoGlassmorphism /> },
  { path: '/demos/neubrutalism', element: <DemoNeubrutalism /> },
  { path: '/demos/minimal', element: <DemoMinimal /> },
  { path: '/demos/bento', element: <DemoBento /> },
  { path: '/demos/cyberpunk', element: <DemoCyberpunk /> },

  // === REELS DE PROMOCIÓN (marketing) ===
  { path: '/reels', element: <ReelsStudio /> },
  { path: '/reels/videos', element: <ReelsVideos /> },  // galería de finales (voz+música+b-roll)
  { path: '/voz', element: <VoiceStudio /> },

  // === APP MOBILE PARA CIUDADANOS ===
  // /app ahora redirige a /home (página responsiva unificada)
  { path: '/app', element: <Navigate to="/home" replace /> },
  // Sub-rutas de /app que aún se usan
  {
    path: '/app',
    element: <MobileLayout />,
    children: [
      { path: 'mis-reclamos', element: <MobileMisReclamos /> },
      { path: 'logros', element: <MobileLogros /> },
      { path: 'perfil', element: <MobilePerfil /> },
      { path: 'consulta', element: <MobileConsulta /> },
      { path: 'estadisticas', element: <MobileEstadisticas /> },
    ],
  },
  // Rutas mobile fuera del layout (pantalla completa)
  { path: '/app/nuevo', element: <NuevoReclamoPage /> },
  { path: '/app/nuevo-tramite', element: <NuevoTramitePage /> },
  // Catálogo público de trámites: requisitos + modo de atención, sin login
  { path: '/app/tramites', element: <CatalogoTramites /> },
  { path: '/app/tramites', element: <Navigate to="/app/mis-tramites" replace /> },
  { path: '/app/tramites/nuevo', element: <Navigate to="/app/nuevo-tramite" replace /> },
  { path: '/app/mis-tramites', element: <MisTramites /> },
  { path: '/app/login', element: <Navigate to="/login" replace /> },
  { path: '/app/register', element: <Navigate to="/register" replace /> },

  // === RUTAS PÚBLICAS ===
  { path: '/demo', element: <Demo /> },
  { path: '/demo/listo', element: <DemoReady /> },
  // Presentación comercial en modo kiosko (para proyectar frente a un cliente)
  { path: '/presentacion', element: <PresentacionMunify /> },
  { path: '/bienvenido', element: <Landing /> },
  { path: '/home', element: <HomePublic /> },
  { path: '/m/:codigo', element: <MunicipioHome /> },  // URL corta para PWA: /m/chacabuco
  // Handoff de captura móvil (DNI + selfie con Didit en el celu del operador)
  { path: '/m/captura/:token', element: <CapturaMovil /> },
  // Pantalla DEMO (VENTANILLA_SKIP_DIDIT=true) — flujo idéntico, datos random
  { path: '/m/captura/:token/fake', element: <CapturaMovilFake /> },
  { path: '/publico', element: <Navigate to="/home" replace /> },  // Legacy: redirige a /home
  { path: '/login', element: <Login /> },
  // Login limpio del super admin (cross-tenant). No se expone desde el landing.
  { path: '/super', element: <SuperAdminLogin /> },
  { path: '/register', element: <Register /> },
  { path: '/register/didit-callback', element: <RegisterDiditCallback /> },
  // Checkout externo PayBridge (fuera del Layout de Munify — visualmente es
  // otra plataforma. En produccion real apuntaria al checkout del provider).
  { path: '/pago/checkout/:sessionId', element: <PayBridgeCheckout /> },
  { path: '/nuevo-reclamo', element: <NuevoReclamoPage /> },
  { path: '/tramites', element: <Navigate to="/home" replace /> },
  { path: '/calificar/:id', element: <CalificarReclamo /> },  // Link directo desde WhatsApp
  { path: '/onboarding', element: <Onboarding /> },  // Wizard post-registro

  // === RUTA RAÍZ - Redirección inteligente ===
  { path: '/', element: <RootRedirect /> },

  // === RUTAS PROTEGIDAS (Panel de Gestión) ===
  {
    path: '/gestion',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      // Dashboard (solo admin/supervisor)
      {
        index: true,
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Dashboard /></ProtectedRoute>
      },

      // Dashboard Vecino
      { path: 'mi-panel', element: <ProtectedRoute roles={['vecino']}><DashboardVecino /></ProtectedRoute> },

      // Dashboard Dependencia (para usuarios de dependencia)
      { path: 'mi-area', element: <ProtectedRoute roles={['supervisor']}><MiArea /></ProtectedRoute> },
      // Reclamos del área (dependencia)
      { path: 'reclamos-area', element: <ProtectedRoute roles={['supervisor']}><Reclamos soloMiArea /></ProtectedRoute> },
      // Trámites del área (dependencia)
      { path: 'tramites-area', element: <ProtectedRoute roles={['supervisor']}><GestionTramites soloMiArea /></ProtectedRoute> },
      // Estadísticas del área (dependencia)
      { path: 'estadisticas-area', element: <ProtectedRoute roles={['supervisor']}><MiRendimiento /></ProtectedRoute> },

      // Nuevo Reclamo (dentro del Layout para usuarios logueados)
      { path: 'crear-reclamo', element: <NuevoReclamoPage /> },

      // Nuevo Trámite (dentro del Layout para usuarios logueados)
      { path: 'crear-tramite', element: <NuevoTramitePage /> },

      // Reclamos (todo con Side Modal, sin páginas separadas)
      { path: 'reclamos', element: <ProtectedRoute roles={['admin', 'supervisor']}><Reclamos /></ProtectedRoute> },
      { path: 'reclamos/:id', element: <ReclamoDetalle /> },
      { path: 'mis-reclamos', element: <MisReclamos /> },
      { path: 'mis-turnos', element: <MisTurnos /> },
      { path: 'agenda-turnos', element: <ProtectedRoute roles={['admin', 'supervisor']}><AgendaTurnos /></ProtectedRoute> },
      { path: 'configuracion-agenda', element: <ProtectedRoute roles={['admin', 'supervisor']}><ConfiguracionAgenda /></ProtectedRoute> },
      { path: 'tarjetas', element: <ProtectedRoute roles={['admin', 'supervisor']}><TarjetasCredito /></ProtectedRoute> },
      // Órdenes de trabajo (unidad formal del trabajo de campo, N:M con reclamos)
      { path: 'ordenes-trabajo', element: <ProtectedRoute roles={['admin', 'supervisor', 'empleado']}><OrdenesTrabajo /></ProtectedRoute> },
      // Inventario (activos + consumibles; se cruza con las OT)
      { path: 'inventario', element: <ProtectedRoute roles={['admin', 'supervisor']}><Inventario /></ProtectedRoute> },
      // Mis Trabajos (para empleados - usa la misma pantalla de Reclamos filtrada)
      { path: 'mis-trabajos', element: <ProtectedRoute roles={['supervisor', 'empleado']}><Reclamos soloMisTrabajos /></ProtectedRoute> },
      // Mi Rendimiento (estadísticas del empleado)
      { path: 'mi-rendimiento', element: <ProtectedRoute roles={['supervisor', 'empleado']}><MiRendimiento /></ProtectedRoute> },
      // Mi Historial (auditoría de trabajos del empleado)
      { path: 'mi-historial', element: <ProtectedRoute roles={['supervisor', 'empleado']}><MiHistorial /></ProtectedRoute> },

      // Mapa (público para usuarios autenticados)
      { path: 'mapa', element: <Mapa /> },

      // Tesorería (solo admin del municipio)
      { path: 'tesoreria', element: <ProtectedRoute roles={['admin', 'supervisor']}><Tesoreria /></ProtectedRoute> },
      { path: 'tesoreria/contactos', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaContactos /></ProtectedRoute> },
      { path: 'tesoreria/proyectos', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaProyectos /></ProtectedRoute> },
      { path: 'tesoreria/agenda', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaAgenda /></ProtectedRoute> },
      { path: 'contaduria/ordenes-pago', element: <ProtectedRoute roles={['admin', 'supervisor']}><OrdenesPago /></ProtectedRoute> },
      { path: 'tesoreria/cajas', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaCajas /></ProtectedRoute> },
      { path: 'tesoreria/conciliacion', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaConciliacion /></ProtectedRoute> },
      { path: 'sueldos/empleados', element: <ProtectedRoute roles={['admin', 'supervisor']}><SueldosEmpleados /></ProtectedRoute> },
      { path: 'contaduria/reportes', element: <ProtectedRoute roles={['admin', 'supervisor']}><ReportesContaduria /></ProtectedRoute> },
      { path: 'tesoreria/reportes', element: <ProtectedRoute roles={['admin', 'supervisor']}><ReportesTesoreria /></ProtectedRoute> },
      { path: 'sueldos/reportes', element: <ProtectedRoute roles={['admin', 'supervisor']}><ReportesSueldos /></ProtectedRoute> },
      { path: 'tesoreria/curacion-bartolo', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaCuracionBartolo /></ProtectedRoute> },
      { path: 'configuracion/tesoreria', element: <ProtectedRoute roles={['admin', 'supervisor']}><ConfiguracionTesoreria /></ProtectedRoute> },
      { path: 'tesoreria/mapa', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaMapa /></ProtectedRoute> },
      { path: 'tesoreria/proyecciones', element: <ProtectedRoute roles={['admin', 'supervisor']}><TesoreriaProyecciones /></ProtectedRoute> },

      // Logros/Gamificación (para todos los usuarios autenticados)
      { path: 'logros', element: <Gamificacion /> },

      // Tablero Empleado
      {
        path: 'tablero',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Tablero /></ProtectedRoute>
      },

      // Administración
      {
        path: 'empleados',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Empleados /></ProtectedRoute>
      },
      {
        path: 'usuarios',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Usuarios /></ProtectedRoute>
      },
      {
        // Legacy: la pantalla vieja de categorías (Categorias.tsx) quedó sin
        // links. Redirige al ABM per-municipio de categorías de reclamo.
        path: 'categorias',
        element: <Navigate to="/gestion/categorias-reclamo" replace />
      },
      {
        path: 'zonas',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Zonas /></ProtectedRoute>
      },
      {
        path: 'dependencias',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><DependenciasConfig /></ProtectedRoute>
      },
      {
        path: 'asignacion-dependencias',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><AsignacionDependencias /></ProtectedRoute>
      },
      // ABM de categorías per-municipio (reclamo y trámite)
      {
        path: 'categorias-reclamo',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><CategoriasReclamoConfig /></ProtectedRoute>
      },
      {
        path: 'categorias-tramite',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><CategoriasTramiteConfig /></ProtectedRoute>
      },
      {
        path: 'categorias-inventario',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><InventarioCategoriasConfig /></ProtectedRoute>
      },
      {
        path: 'tipos-trabajo',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><OTTiposTrabajoConfig /></ProtectedRoute>
      },
      {
        path: 'poi-tipos',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><POITiposConfig /></ProtectedRoute>
      },
      // ABM de trámites per-municipio
      {
        path: 'tramites-config',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><TramitesConfig /></ProtectedRoute>
      },
      {
        path: 'proveedores-pago',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><ProveedoresPago /></ProtectedRoute>
      },
      {
        path: 'configuracion',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Configuracion /></ProtectedRoute>
      },
      {
        path: 'municipios',
        element: <ProtectedRoute roles={['admin']}><Municipios /></ProtectedRoute>
      },
      {
        path: 'admin/audit-logs',
        element: <ProtectedRoute roles={['admin']}><AuditLogs /></ProtectedRoute>
      },
      {
        path: 'admin/suscripciones',
        element: <ProtectedRoute roles={['admin']}><Suscripciones /></ProtectedRoute>
      },
      {
        path: 'admin/modulos',
        element: <ProtectedRoute roles={['admin']}><ModulosMunicipio /></ProtectedRoute>
      },
      {
        path: 'consola',
        element: <ProtectedRoute roles={['admin']}><ConsolaGlobal /></ProtectedRoute>
      },
      {
        path: 'exportar',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Exportar /></ProtectedRoute>
      },
      {
        path: 'sla',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><SLA /></ProtectedRoute>
      },
      {
        path: 'whatsapp',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><WhatsAppConfig /></ProtectedRoute>
      },
      // Trámites
      {
        path: 'tramites',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><GestionTramites /></ProtectedRoute>
      },
      {
        path: 'mis-tramites',
        element: <MisTramites />
      },
      // Mis Tasas — 3er pilar (ABL, patentes, multas, etc)
      {
        path: 'mis-tasas',
        element: <MisTasas />
      },
      // Listado admin de partidas del padrón
      {
        path: 'tasas',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><GestionTasas /></ProtectedRoute>
      },
      // Cobros — vista contaduría (histórico transaccional). Antes 'pagos'.
      {
        path: 'cobros',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><GestionPagos /></ProtectedRoute>
      },
      // Alias legacy para no romper bookmarks viejos / WhatsApp
      {
        path: 'pagos',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><GestionPagos /></ProtectedRoute>
      },
      // Mostrador — consola del operador de ventanilla (Fase 6 bundle pagos)
      {
        path: 'mostrador',
        element: <ProtectedRoute roles={['admin', 'supervisor', 'operador_ventanilla']}><Mostrador /></ProtectedRoute>
      },
      // Config del sidebar por muni (solo superadmin)
      {
        path: 'sidebar-config',
        element: <ProtectedRoute roles={['admin']}><SidebarConfig /></ProtectedRoute>
      },
      // Config de IA por muni (solo superadmin)
      {
        path: 'configuracion-ia',
        element: <ProtectedRoute roles={['admin']}><ConfiguracionIA /></ProtectedRoute>
      },
      // Ajustes -> Configuración (compat: ambas rutas viejas redirigen).
      {
        path: 'ajustes',
        element: <Navigate to="/gestion/configuracion" replace />
      },
      {
        path: 'ajustes/importar-padron',
        element: <Navigate to="/gestion/configuracion/importar-padron" replace />
      },
      {
        path: 'configuracion/importar-padron',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><ImportarPadron /></ProtectedRoute>
      },
      // Configuración del Dashboard (qué ven vecinos y empleados)
      {
        path: 'config-dashboard',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><ConfigDashboard /></ProtectedRoute>
      },
      // Gestion de Empleados (nuevos ABMs)
      {
        path: 'cuadrillas',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><GestionCuadrillas /></ProtectedRoute>
      },
      {
        path: 'ausencias',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><GestionAusencias /></ProtectedRoute>
      },
      // Planificación Semanal (calendario visual)
      {
        path: 'planificacion',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Planificacion /></ProtectedRoute>
      },
      // Panel DW - Consultas y análisis con IA
      {
        path: 'panel-bi',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><PanelBI /></ProtectedRoute>
      },
    ],
  },

  // Acceso directo por código de municipio: /<codigo> -> login del muni.
  // Va al final: las rutas estáticas de arriba tienen prioridad de match.
  { path: '/:codigo', element: <MunicipioAcceso /> },

  // Links historicos: /reclamos/:id -> /gestion/reclamos/:id (sanea push/WhatsApp viejos)
  { path: '/reclamos/:id', element: <ReclamoLegacyRedirect /> },

  // Catch-all: redirigir a demo si no está autenticado
  { path: '*', element: <Navigate to="/demo" replace /> },
]);
