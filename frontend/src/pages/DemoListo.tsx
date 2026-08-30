/**
 * `/demo/listo?muni=<codigo>` — la puerta de entrada de una demo recién creada.
 *
 * Antes esta ruta pintaba su propia pantalla de perfiles (`DemoReady`), una
 * segunda versión de algo que el login ya hacía mejor: los mismos usuarios,
 * peor presentados y sin la identidad del municipio. Dos pantallas para lo
 * mismo también significa arreglar cada cosa dos veces.
 *
 * Ahora sólo deja el municipio elegido y manda al login, que es la pantalla
 * que el dueño quiere que vea el prospecto. No pinta nada propio: un cartel
 * de "entrando" que dura lo que tarda una llamada a la ficha pública.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { municipiosApi } from '../lib/api';

export default function DemoListo() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const codigo = params.get('muni');
  const [fallo, setFallo] = useState(false);
  // Sin `?muni=` no hay nada que resolver: es un valor derivado de la URL, no
  // un estado que haya que setear desde el efecto.
  const error = !codigo
    ? 'No se recibió el código del municipio'
    : fallo ? 'No pudimos abrir la demo de ese municipio' : null;

  useEffect(() => {
    if (!codigo) return;
    (async () => {
      try {
        const { data } = await municipiosApi.getPublicByCodigo(codigo);
        // Es lo que el login espera encontrar para mostrarse con la identidad
        // del municipio; sin esto se va a /bienvenido a pedir que elijan uno.
        localStorage.setItem('municipio_codigo', data.codigo);
        localStorage.setItem('municipio_nombre', data.nombre);
        localStorage.setItem('municipio_id', String(data.id));
        if (data.color_primario) localStorage.setItem('municipio_color', data.color_primario);
        navigate('/login', { replace: true });
      } catch {
        setFallo(true);
      }
    })();
  }, [codigo, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-center">
      {error ? (
        <div>
          <p className="text-white/80">{error}</p>
          <button
            onClick={() => navigate('/demo')}
            className="mt-4 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20"
          >
            Crear otra demo
          </button>
        </div>
      ) : (
        <p className="text-white/50 text-sm">Entrando…</p>
      )}
    </div>
  );
}
