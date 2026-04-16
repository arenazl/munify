import { useNavigate } from 'react-router-dom';
import { CrearSolicitudWizard } from '../components/tramites/CrearSolicitudWizard';

export default function NuevoTramitePage() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/app/mis-tramites');
  };

  const handleSuccess = () => {
    navigate('/app/mis-tramites');
  };

  return (
    <CrearSolicitudWizard
      open={true}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  );
}
