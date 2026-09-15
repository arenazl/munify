import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRouteForUser } from '../config/navigation';

interface Props {
  children: React.ReactNode;
  roles?: string[];
  /** Sólo cuentas cross-tenant (admin sin municipio): el panel del super admin. */
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

  // Sin sesión se va a la PUERTA, nunca a una grilla (dueño, 2026-09-03: la
  // auditoría de demos dejó de ser pública). /login resuelve sola a quién
  // mostrarle qué: marca fija, municipio recordado, o el acceso /super.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.rol)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  if (superAdmin && user.municipio_id) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return <>{children}</>;
}
