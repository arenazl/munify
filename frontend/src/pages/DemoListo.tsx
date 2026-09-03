/**
 * `/demo/listo?muni=<codigo>&t=<llave>` — la puerta de entrada de una demo
 * recién creada. Es la URL que devuelve el alta (`redirect_path`) y a la que
 * salta la landing comercial, que vive en OTRO dominio y por eso manda la
 * llave `?t=` en la URL: el localStorage donde la app la guarda no se comparte.
 *
 * No resuelve nada propio: manda a `/demo/<codigo>/login` CON EL QUERY. De
 * ahí en más es `MunicipioAcceso` el que trabaja — cierra la sesión de otro
 * municipio si la hubiera (la que devolvía a San Pedro Norte al que acababa
 * de crear Alpa Corral), guarda el muni y rinde el login en el lugar, que
 * captura la llave de la URL y con ella pide los perfiles de la botonera.
 *
 * Antes esta ruta llamaba a la ficha, guardaba el muni y navegaba a `/login`
 * pelado: tiraba el `?t=`, y sin llave `demo-users` devuelve vacío — el que
 * acababa de generar su demo desde la landing llegaba a un login sin
 * botonera, en prod y en QA por igual (dueño, 2026-09-02).
 */
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

export default function DemoListo() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const codigo = params.get('muni');

  if (codigo) {
    const t = params.get('t');
    const query = t ? `?t=${encodeURIComponent(t)}` : '';
    return <Navigate to={`/demo/${encodeURIComponent(codigo)}/login${query}`} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-center">
      <div>
        <p className="text-white/80">No se recibió el código del municipio</p>
        <button
          onClick={() => navigate('/demos-listado')}
          className="mt-4 px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20"
        >
          Crear otra demo
        </button>
      </div>
    </div>
  );
}
