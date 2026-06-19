import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { municipiosApi } from '../lib/api';
import { saveMunicipio } from '../utils/municipioStorage';
import { MunifyLogo } from '../components/ui/MunifyLogo';

/**
 * Acceso directo por código de municipio: `app.munify.com.ar/<codigo>`.
 *
 * Pensado para clientes PRODUCTIVOS (es_demo=False): el municipio entrega esta
 * URL a su gente y cae directo en la pantalla de login (email + contraseña),
 * sin pasar por la grilla de demos.
 *
 * Flujo:
 *   1. Lee `:codigo` de la URL.
 *   2. Trae el detalle público del municipio.
 *   3. Lo persiste (localStorage + IndexedDB) para que `/login` lo levante.
 *   4. Redirige a `/login`.
 *   Si el código no existe -> vuelve a `/demo`.
 */
export default function MunicipioAcceso() {
  const { codigo } = useParams<{ codigo: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!codigo) {
        navigate('/demo', { replace: true });
        return;
      }
      try {
        const { data } = await municipiosApi.getPublicByCodigo(codigo);
        if (cancelled) return;

        await saveMunicipio({
          id: String(data.id),
          codigo: data.codigo,
          nombre: data.nombre,
          color: data.color_primario || '#0088cc',
          logo_url: data.logo_url || undefined,
        });
        localStorage.setItem('municipio_actual_id', String(data.id));

        if (!cancelled) navigate('/login', { replace: true });
      } catch {
        if (cancelled) return;
        setError(true);
        setTimeout(() => navigate('/demo', { replace: true }), 1800);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [codigo, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-5 px-6">
      <MunifyLogo size={48} variant="content" />
      {error ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-6 w-6 text-amber-400" />
          <p className="text-slate-300 text-sm">
            No encontramos el municipio <span className="font-semibold text-white">"{codigo}"</span>.
          </p>
          <p className="text-slate-500 text-xs">Te llevamos al inicio…</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm">Ingresando…</span>
        </div>
      )}
    </div>
  );
}
