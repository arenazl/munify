import { Navigate, useParams } from 'react-router-dom';

// Redirige links historicos /reclamos/:id (emitidos por push/WhatsApp viejos) al
// detalle real bajo /gestion. Sin esto caian en el catch-all -> /demo (pagina comercial).
export default function ReclamoLegacyRedirect() {
  const { id } = useParams();
  return <Navigate to={`/gestion/reclamos/${id}`} replace />;
}
