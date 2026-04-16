import { useNavigate } from 'react-router-dom';
import { CrearSolicitudWizard } from '../components/tramites/CrearSolicitudWizard';

export default function NuevoTramitePage() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/gestion/mis-tramites');
  };

  const handleSuccess = () => {
    navigate('/gestion/mis-tramites');
  };

  return (
    <CrearSolicitudWizard
      open={true}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}
