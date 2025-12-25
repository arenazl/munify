import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Landing from './pages/Landing';
import DashboardPublico from './pages/DashboardPublico';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import DashboardVecino from './pages/DashboardVecino';
import MisReclamos from './pages/MisReclamos';
import Reclamos from './pages/Reclamos';
import Mapa from './pages/Mapa';
import Tablero from './pages/Tablero';
import Empleados from './pages/Empleados';
import Usuarios from './pages/Usuarios';
import Categorias from './pages/Categorias';
import Zonas from './pages/Zonas';
import Configuracion from './pages/Configuracion';
import Exportar from './pages/Exportar';
import SLA from './pages/SLA';
import NuevoReclamo from './pages/NuevoReclamo';
import WhatsAppConfig from './pages/WhatsAppConfig';
import Gamificacion from './pages/Gamificacion';

// Demos de diseño
import DemosIndex from './pages/demos';
import DemoGlassmorphism from './pages/demos/DemoGlassmorphism';
import DemoNeubrutalism from './pages/demos/DemoNeubrutalism';
import DemoMinimal from './pages/demos/DemoMinimal';
import DemoBento from './pages/demos/DemoBento';
import DemoCyberpunk from './pages/demos/DemoCyberpunk';

// Mobile App para ciudadanos
import MobileLayout from './layouts/MobileLayout';
import {
  MobileHome,
  MobileMisReclamos,
  MobilePerfil,
  MobileLogin,
  MobileRegister,
  MobileNuevoReclamo,
} from './pages/mobile';

export const router = createBrowserRouter([
  // === DEMOS DE DISEÑO ===
  { path: '/demos', element: <DemosIndex /> },
  { path: '/demos/glassmorphism', element: <DemoGlassmorphism /> },
  { path: '/demos/neubrutalism', element: <DemoNeubrutalism /> },
  { path: '/demos/minimal', element: <DemoMinimal /> },
  { path: '/demos/bento', element: <DemoBento /> },
  { path: '/demos/cyberpunk', element: <DemoCyberpunk /> },

  // === APP MOBILE PARA CIUDADANOS ===
  {
    path: '/app',
    element: <MobileLayout />,
    children: [
      { index: true, element: <MobileHome /> },
      { path: 'mis-reclamos', element: <MobileMisReclamos /> },
      { path: 'perfil', element: <MobilePerfil /> },
    ],
  },
  { path: '/app/login', element: <MobileLogin /> },
  { path: '/app/register', element: <MobileRegister /> },
  { path: '/app/nuevo', element: <MobileNuevoReclamo /> },

  // === RUTAS PÚBLICAS ===
  { path: '/bienvenido', element: <Landing /> },
  { path: '/publico', element: <DashboardPublico /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/nuevo-reclamo', element: <NuevoReclamo /> },

  // === RUTAS PROTEGIDAS ===
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      // Dashboard (solo admin/supervisor)
      {
        index: true,
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Dashboard /></ProtectedRoute>
      },

      // Dashboard Vecino
      { path: 'mi-panel', element: <ProtectedRoute roles={['vecino']}><DashboardVecino /></ProtectedRoute> },

      // Nuevo Reclamo (dentro del Layout para usuarios logueados)
      { path: 'crear-reclamo', element: <NuevoReclamo /> },

      // Reclamos (todo con Side Modal, sin páginas separadas)
      { path: 'reclamos', element: <ProtectedRoute roles={['admin', 'supervisor']}><Reclamos /></ProtectedRoute> },
      { path: 'mis-reclamos', element: <MisReclamos /> },

      // Mapa (público para usuarios autenticados)
      { path: 'mapa', element: <Mapa /> },

      // Logros/Gamificación (para todos los usuarios autenticados)
      { path: 'logros', element: <Gamificacion /> },

      // Tablero Empleado
      {
        path: 'tablero',
        element: <ProtectedRoute roles={['admin', 'supervisor', 'empleado']}><Tablero /></ProtectedRoute>
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
        path: 'categorias',
        element: <ProtectedRoute roles={['admin']}><Categorias /></ProtectedRoute>
      },
      {
        path: 'zonas',
        element: <ProtectedRoute roles={['admin']}><Zonas /></ProtectedRoute>
      },
      {
        path: 'configuracion',
        element: <ProtectedRoute roles={['admin']}><Configuracion /></ProtectedRoute>
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
    ],
  },

  // Catch-all: redirigir a landing si no está autenticado
  { path: '*', element: <Navigate to="/bienvenido" replace /> },
]);
