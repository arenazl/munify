import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { saveMunicipio } from '../utils/municipioStorage';

/**
 * Componente wrapper que captura el codigo de municipio del path
 * y redirige a /home con el municipio cargado en IndexedDB + localStorage
 */
export default function MunicipioHome() {
  const { codigo } = useParams<{ codigo: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const loadMunicipioData = async () => {
      if (!codigo) {
        navigate('/bienvenido');
        return;
      }

      try {
        const API_URL = import.meta.env.VITE_API_URL;
        const res = await fetch(`${API_URL}/municipios/public`);

        if (res.ok) {
          const municipios = await res.json();
          const found = municipios.find((m: { codigo: string }) =>
            m.codigo.toLowerCase() === codigo.toLowerCase()
          );

          if (found) {
            // Guardar en IndexedDB + localStorage
            await saveMunicipio({
              id: found.id.toString(),
              codigo: found.codigo,
              nombre: found.nombre,
              color: found.color_primario,
              logo_url: found.logo_url,
            });

            // Redirigir a /home
            navigate('/home', { replace: true });
            return;
          }
        }
      } catch (error) {
        console.error('Error cargando municipio:', error);
      }

      // Si no se encontro el municipio, ir a bienvenido
      navigate('/bienvenido');
    };

    loadMunicipioData();
  }, [codigo, navigate]);

  // Mostrar loading mientras carga
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/70">Cargando municipio...</p>
      </div>
    </div>
  );
}
