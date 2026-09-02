import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { municipiosApi } from '../lib/api';
import { saveMunicipio, clearMunicipio } from '../utils/municipioStorage';
import { BrandMark } from '../brands/BrandMark';
import Login from './Login';

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
 *   3. Lo persiste (localStorage + IndexedDB) para que el login lo levante.
 *   4. `/merlo` redirige a `/merlo/login`; en `/merlo/login` el login se
 *      renderiza EN EL LUGAR — el municipio nunca se cae de la URL.
 *   Si el código no existe -> vuelve a `/demo`.
 *
 * El código llega por la URL o, cuando la marca tiene ruta propia y el path no
 * lo nombra (`/py/asuncion`), por prop desde el router.
 */
export default function MunicipioAcceso(
  { codigo: codigoFijo, enLogin = false }: { codigo?: string; enLogin?: boolean } = {},
) {
  const { codigo: codigoDeLaUrl } = useParams<{ codigo: string }>();
  const codigo = codigoFijo || codigoDeLaUrl;
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  /**
   * Ruta de entrada de una MARCA (`/py/asuncion`): el login se muestra acá
   * mismo, sin cambiar la URL.
   *
   * No es un detalle de prolijidad. En iOS, "Agregar a inicio" toma como
   * start_url LA URL QUE ESTÁ ABIERTA (Safari ignora el manifest servido por
   * blob:), y la PWA instalada corre con un storage propio, separado del
   * navegador — no hereda la marca recordada. Si acá navegáramos a `/login`,
   * la app instalada arrancaría en una ruta que no nombra la marca, abriría
   * como Munify multi-tenant y caería en el generador de demos. Manteniendo
   * la URL, la marca viaja en el propio start_url.
   */
  const esRutaDeMarca = Boolean(codigoFijo);
  // En la ruta de marca Y en `/<codigo>/login` el login se muestra acá mismo,
  // con la URL intacta; sólo el acceso pelado `/<codigo>` navega (a su /login).
  const quedaEnElLugar = esRutaDeMarca || enLogin;
  const [municipioListo, setMunicipioListo] = useState(false);
  // ¿Entró por la puerta de demos (/demo/<codigo>)? Las demos viven bajo ese
  // prefijo hasta ser facturables (dueño, 2026-09-02); la ruta ademas despega
  // la marca pegada de la pestaña (RUTAS_DE_MUNIFY en brands/index.ts).
  const { pathname } = useLocation();
  const enDemo = pathname.startsWith('/demo/');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!codigo) {
        navigate('/demo', { replace: true });
        return;
      }
      // Retry con backoff: con el backend frío (cold start de Cloud Run) el
      // primer request puede fallar o dar 5xx transitorio. Eso NO significa
      // "el municipio no existe" — solo el 404 es definitivo. Sin esto, el
      // primer visitante veía el cartel de "no encontramos el municipio".
      for (let intento = 0; intento < 4; intento++) {
        try {
          const { data } = await municipiosApi.getPublicByCodigo(codigo);
          if (cancelled) return;

          // SESIÓN AJENA FUERA (dueño, 2026-09-02): si este navegador tiene
          // la sesión de OTRO municipio (Bartolo en San Pedro abriendo la
          // demo recién creada de Sampacho), esa sesión pisaba la puerta —
          // el redirect por "usuario logueado" lo devolvía a SU tenant. La
          // puerta de un municipio distinto cierra la sesión anterior. Se
          // limpia a mano (no con logout() del contexto: su identidad cambia
          // por render y rompería las deps del efecto) y se ESPERA el
          // clearMunicipio, que es async y sin await pisaba el save de abajo.
          // El user en memoria del AuthContext se corrige al próximo login.
          let sesion: { municipio_id?: number } | null = null;
          try { sesion = JSON.parse(localStorage.getItem('user') || 'null'); } catch { sesion = null; }
          if (sesion?.municipio_id && String(sesion.municipio_id) !== String(data.id)) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            await clearMunicipio();
          }

          await saveMunicipio({
            id: String(data.id),
            codigo: data.codigo,
            nombre: data.nombre,
            color: data.color_primario || '#0088cc',
            logo_url: data.logo_url || undefined,
          });
          localStorage.setItem('municipio_actual_id', String(data.id));

          if (!cancelled) {
            // Las demos entran por /demo/<codigo> y los facturables por
            // /<codigo>: la puerta equivocada redirige a la correcta. El
            // QUERY viaja SIEMPRE en el salto: ahí va la llave `?t=` del
            // acceso por link — este navigate la tiraba y el dueño de una
            // demo recién creada quedaba afuera de la suya.
            const base = data.es_demo && !esRutaDeMarca ? '/demo' : '';
            const prefijoOk = esRutaDeMarca || (data.es_demo ? enDemo : !enDemo);
            if (quedaEnElLugar && prefijoOk) setMunicipioListo(true);
            else navigate(`${base}/${data.codigo}/login${window.location.search}`, { replace: true });
          }
          return;
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 404) break; // no existe de verdad — no reintentar
          if (intento < 3) {
            await new Promise((r) => setTimeout(r, 900 * (intento + 1)));
            if (cancelled) return;
          }
        }
      }
      if (cancelled) return;
      setError(true);
      setTimeout(() => navigate('/demo', { replace: true }), 1800);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [codigo, navigate, quedaEnElLugar, enDemo, esRutaDeMarca]);

  // Municipio cargado y ruta de marca: el login se rinde ACÁ, con la URL
  // intacta (ver la nota de arriba sobre el start_url de la PWA en iOS).
  if (municipioListo) return <Login />;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-5 px-6">
      <BrandMark size={48} variant="content" />
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
