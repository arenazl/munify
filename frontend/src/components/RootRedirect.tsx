import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';

/**
 * Componente que maneja la redirección inteligente en la ruta raíz.
 *
 * Funciona con Netlify usando query params: tuapp.netlify.app/?municipio=merlo
 *
 * Lógica:
 * 1. Si hay usuario logueado → redirigir según su rol
 * 2. Si hay ?municipio=xxx en URL → guardar y ir a /app
 * 3. Si hay municipio guardado en localStorage → ir a /app
 * 4. Si no hay nada → ir a /bienvenido (landing de selección)
 */
export default function RootRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {

    // Si hay usuario logueado, ir a su ruta por defecto
    if (user) {
      navigate(getDefaultRoute(user.rol), { replace: true });
      return;
    }

    // Si hay ?municipio=xxx en la URL
    const municipioParam = searchParams.get('municipio');
    if (municipioParam) {
      // Redirigir a /app con el query param (la app lo procesará)
      navigate(`/app?municipio=${municipioParam}`, { replace: true });
      return;
    }

    // Si hay municipio guardado en localStorage (sesión anterior)
    const savedMunicipio = localStorage.getItem('municipio_codigo');
    if (savedMunicipio) {
      navigate('/app', { replace: true });
      return;
    }

    // Si no hay nada, ir a la landing de selección
    navigate('/bienvenido', { replace: true });
  }, [user, searchParams, navigate]);

  // Mostrar loading mientras decide
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );
}
