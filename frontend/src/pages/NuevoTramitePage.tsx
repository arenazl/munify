import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CrearSolicitudWizard } from '../components/tramites/CrearSolicitudWizard';
import { useMostradorContext, BannerActuandoComo } from '../components/mostrador/BannerActuandoComo';
import { tramitesApi } from '../lib/api';
import type { Tramite } from '../types';

export default function NuevoTramitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ctxMostrador = useMostradorContext();
  const [tramiteInicial, setTramiteInicial] = useState<Tramite | null>(null);

  // Soporte para ?tramite_id=N (deep-link desde Mostrador)
  useEffect(() => {
    const id = params.get('tramite_id');
    if (!id) return;
    const tid = parseInt(id, 10);
    if (!Number.isFinite(tid)) return;
    tramitesApi.getOne(tid)
      .then((r) => setTramiteInicial(r.data as Tramite))
      .catch(() => setTramiteInicial(null));
  }, [params]);

  const volverAlMostrador = () => navigate('/gestion/mostrador');
  const volverAMisTramites = () => navigate('/gestion/mis-tramites');

  // Si vino del mostrador, al cerrar / completar volvemos al Mostrador
  // (que sigue con el mismo vecino identificado por si quiere cargar más).
  // Si fue uso normal del vecino, va a Mis trámites como antes.
  const handleClose = ctxMostrador ? volverAlMostrador : volverAMisTramites;
  const handleSuccess = ctxMostrador ? volverAlMostrador : volverAMisTramites;

  return (
    <>
      {ctxMostrador && (
        <div className="px-3 sm:px-6 pt-3">
          <BannerActuandoComo ctx={ctxMostrador} onSalir={volverAlMostrador} />
        </div>
      )}
      <CrearSolicitudWizard
        open={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
        tramiteInicial={tramiteInicial}
      />
    </>
  );
}
