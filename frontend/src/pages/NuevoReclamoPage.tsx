import { useNavigate } from 'react-router-dom';
import { CrearReclamoWizard } from '../components/reclamos/CrearReclamoWizard';

/**
 * Página que renderiza el `CrearReclamoWizard` como pantalla completa.
 *
 * El wizard es un modal (usa `WizardModal`) — esta página lo abre en modo
 * "siempre abierto". Al cerrar o al crear exitosamente, redirige a
 * `/app/mis-reclamos` (si el vecino está logueado) o al home.
 *
 * Reemplaza al `NuevoReclamo.tsx` viejo (2000 líneas, 6 pasos con layout
 * custom) que seguía ruteando con el patrón viejo. Ahora usa el mismo
 * WizardModal que el wizard de trámites, con el mismo look & feel.
 */
export default function NuevoReclamoPage() {
  const navigate = useNavigate();

  const handleClose = () => {
    // Volvemos al listado dentro del Layout (con topbar).
    navigate('/gestion/mis-reclamos');
  };

  const handleSuccess = () => {
    navigate('/gestion/mis-reclamos');
  };

  return (
    <CrearReclamoWizard
      open={true}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}
