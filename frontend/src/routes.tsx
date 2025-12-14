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

export const router = createBrowserRouter([
  // === RUTAS PÚBLICAS ===
  { path: '/bienvenido', element: <Landing /> },
  { path: '/publico', element: <DashboardPublico /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },

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

      // Reclamos (todo con Side Modal, sin páginas separadas)
      { path: 'reclamos', element: <ProtectedRoute roles={['admin', 'supervisor']}><Reclamos /></ProtectedRoute> },
      { path: 'mis-reclamos', element: <MisReclamos /> },
      { path: 'nuevo-reclamo', element: <ProtectedRoute roles={['vecino']}><NuevoReclamo /></ProtectedRoute> },

      // Mapa (público para usuarios autenticados)
      { path: 'mapa', element: <Mapa /> },

      // Tablero Cuadrilla
      {
        path: 'tablero',
        element: <ProtectedRoute roles={['admin', 'supervisor', 'cuadrilla']}><Tablero /></ProtectedRoute>
      },

      // Administración
      {
        path: 'empleados',
        element: <ProtectedRoute roles={['admin', 'supervisor']}><Empleados /></ProtectedRoute>
      },
      {
        path: 'usuarios',
        element: <ProtectedRoute roles={['admin']}><Usuarios /></ProtectedRoute>
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
    ],
  },

  // Catch-all: redirigir a landing si no está autenticado
  { path: '*', element: <Navigate to="/bienvenido" replace /> },
]);
