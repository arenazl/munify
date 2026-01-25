import { useAuth } from '../contexts/AuthContext';

/**
 * Hook para detectar si el usuario actual es superadmin.
 *
 * Superadmin: usuario con rol 'admin' pero SIN municipio_id asignado.
 * - Gestiona los catálogos maestros (dependencias, tipos de trámite, trámites)
 * - No tiene municipio asociado
 *
 * Supervisor: usuario con rol 'admin' o 'supervisor' CON municipio_id.
 * - Gestiona los recursos habilitados para su municipio
 * - Tiene municipio asociado
 */
export function useSuperAdmin() {
  const { user } = useAuth();

  // Superadmin = admin sin municipio_id
  const isSuperAdmin = user?.rol === 'admin' && !user?.municipio_id;

  // Supervisor = admin o supervisor con municipio_id
  const isSupervisor = (user?.rol === 'admin' || user?.rol === 'supervisor') && !!user?.municipio_id;

  return {
    isSuperAdmin,
    isSupervisor,
    user,
    municipioId: user?.municipio_id ?? null,
  };
}
