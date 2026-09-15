import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRouteForUser } from '../config/navigation';

interface Props {
  children: React.ReactNode;
  roles?: string[];
  /** Sólo cuentas cross-tenant (admin SIN municipio): el panel del super admin. */
  superAdmin?: boolean;
}

export default function ProtectedRoute({ children, roles, superAdmin }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Sin sesión se va a la PUERTA, nunca a una grilla. Hasta el 2026-09-15 esto
  // mandaba a `/demos-listado`: al cerrar sesión, el cliente aterrizaba en la
  // auditoría de las 103 demos, con botones de borrado y SIN layout — o sea sin
  // menú del que salir. `/login` resuelve sola a quién mostrarle qué: marca
  // fija, municipio recordado, o el acceso /super.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.rol)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  // Un admin CON municipio es admin de su municipio, no de la instalación: la
  // auditoría de demos no es suya. A su tablero.
  if (superAdmin && user.municipio_id) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return <>{children}</>;
}
