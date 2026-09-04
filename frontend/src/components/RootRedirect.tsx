import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRouteForUser } from '../config/navigation';
import { rutaDeAccesoInstalada } from '../brands';

/**
 * Componente que maneja la redirección inteligente en la ruta raíz.
 *
 * Funciona con query params en cualquier host: app-qa.munify.com.ar/?municipio=merlo
 *
 * Lógica:
 * 1. Si hay usuario logueado → redirigir según su rol a /gestion
 * 2. Si hay ?municipio=xxx en URL → ir a /demo con el municipio
 * 3. Si hay municipio guardado en localStorage → ir a /demo
 * 4. Si no hay nada → ir a /demo (vitrina de demos)
 */
export default function RootRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    // Si hay usuario logueado, ir a su ruta por defecto en /gestion
    if (user) {
      navigate(getDefaultRouteForUser(user), { replace: true });
      return;
    }

    // Si hay ?municipio=xxx en la URL
    const municipioParam = searchParams.get('municipio');
    if (municipioParam) {
      navigate(`/demo?municipio=${municipioParam}`, { replace: true });
      return;
    }

    // APP INSTALADA que arranca en la raíz: va a la puerta de la marca, no al
    // generador de demos.
    //
    // Una PWA ya instalada tiene su `start_url` CONGELADO desde el día que se
    // agregó al inicio — iOS no lo vuelve a leer aunque el manifest cambie. Las
    // instaladas antes de que la marca publicara su manifest arrancan en "/", y
    // ahí caían en la grilla de demos de Munify: la app instalada de un tenant
    // mostrando el catálogo de otros municipios.
    //
    // Sólo aplica con la app instalada (standalone). En el navegador la raíz
    // sigue llevando al acceso de siempre, porque ahí la URL es la que manda.
    const puertaDeMarca = rutaDeAccesoInstalada();
    if (puertaDeMarca) {
      navigate(puertaDeMarca, { replace: true });
      return;
    }

    // Si no hay nada, a la puerta: /login decide entre la marca fija, el
    // municipio recordado o el acceso /super. La grilla de demos ya no es
    // pública (dueño, 2026-09-03).
    navigate('/login', { replace: true });
  }, [user, searchParams, navigate]);

  // Mostrar loading mientras decide
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );
}
