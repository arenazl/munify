import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { municipiosApi } from '../lib/api';
import { saveMunicipio } from '../utils/municipioStorage';
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

          await saveMunicipio({
            id: String(data.id),
            codigo: data.codigo,
            nombre: data.nombre,
            color: data.color_primario || '#0088cc',
            logo_url: data.logo_url || undefined,
          });
          localStorage.setItem('municipio_actual_id', String(data.id));

          if (!cancelled) {
            if (quedaEnElLugar) setMunicipioListo(true);
            else navigate(`/${data.codigo}/login`, { replace: true });
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
  }, [codigo, navigate, quedaEnElLugar]);

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
