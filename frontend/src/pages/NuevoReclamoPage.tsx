import { useNavigate } from 'react-router-dom';
import { CrearReclamoWizard } from '../components/reclamos/CrearReclamoWizard';
import { useMostradorContext, BannerActuandoComo } from '../components/mostrador/BannerActuandoComo';

export default function NuevoReclamoPage() {
  const navigate = useNavigate();
  const ctxMostrador = useMostradorContext();

  const volverAlMostrador = () => navigate('/gestion/mostrador');
  const volverAMisReclamos = () => navigate('/gestion/mis-reclamos');

  const handleClose = ctxMostrador ? volverAlMostrador : volverAMisReclamos;
  const handleSuccess = ctxMostrador ? volverAlMostrador : volverAMisReclamos;

  return (
    <>
      {ctxMostrador && (
        <div className="px-3 sm:px-6 pt-3">
          <BannerActuandoComo ctx={ctxMostrador} onSalir={volverAlMostrador} />
        </div>
      )}
      <CrearReclamoWizard
        open={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    </>
  );
}
