import { useEffect, useState } from 'react';
import { ClipboardList, FileText } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { reclamosApi, tramitesApi } from '../lib/api';
import Reclamos from './Reclamos';
import MisTramitesEmpleado from './MisTramitesEmpleado';

/**
 * Página "Mis Trabajos" para empleados
 * Muestra tabs para Reclamos y Trámites asignados
 * Solo muestra las tabs si hay al menos un elemento de ese tipo
 */
export default function MisTrabajos() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'reclamos' | 'tramites'>('reclamos');
  const [countReclamos, setCountReclamos] = useState<number>(0);
  const [countTramites, setCountTramites] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Cargar conteos al montar
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        // Cargar reclamos del empleado
        const reclamosRes = await reclamosApi.getAll({ limit: 1 });
        setCountReclamos(reclamosRes.data?.length > 0 ? reclamosRes.data.length : 0);

        // Si hay paginación, el total real viene en headers o metadata
        if (reclamosRes.headers?.['x-total-count']) {
          setCountReclamos(parseInt(reclamosRes.headers['x-total-count']));
        } else if (reclamosRes.data?.length > 0) {
          // Cargar todos para contar
          const allReclamos = await reclamosApi.getAll();
          setCountReclamos(allReclamos.data?.length || 0);
        }

        // Cargar trámites del empleado
        const tramitesRes = await tramitesApi.getGestionSolicitudes({ limit: 100 });
        setCountTramites(tramitesRes.data?.length || 0);

        // Si solo hay trámites, mostrar esa tab por defecto
        if (reclamosRes.data?.length === 0 && tramitesRes.data?.length > 0) {
          setActiveTab('tramites');
        }
      } catch (error) {
        console.error('Error cargando conteos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, []);

  // Si solo hay un tipo, no mostrar tabs
  const showTabs = countReclamos > 0 && countTramites > 0;
  const showOnlyReclamos = countReclamos > 0 && countTramites === 0;
  const showOnlyTramites = countTramites > 0 && countReclamos === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  // Si no hay ningún trabajo
  if (countReclamos === 0 && countTramites === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ClipboardList className="h-16 w-16 mb-4" style={{ color: theme.textSecondary }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: theme.text }}>
          No tenés trabajos asignados
        </h2>
        <p style={{ color: theme.textSecondary }}>
          Cuando te asignen reclamos o trámites aparecerán acá
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs - solo si hay ambos tipos */}
      {showTabs && (
        <div
          className="flex gap-2 p-1 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <button
            onClick={() => setActiveTab('reclamos')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg font-medium text-base transition-all ${
              activeTab === 'reclamos' ? 'shadow-md' : ''
            }`}
            style={{
              backgroundColor: activeTab === 'reclamos' ? theme.card : 'transparent',
              color: activeTab === 'reclamos' ? theme.primary : theme.textSecondary,
            }}
          >
            <ClipboardList className="h-5 w-5" />
            Reclamos
            <span
              className="px-2.5 py-0.5 rounded-full text-sm"
              style={{
                backgroundColor: activeTab === 'reclamos' ? `${theme.primary}20` : theme.border,
                color: activeTab === 'reclamos' ? theme.primary : theme.textSecondary
              }}
            >
              {countReclamos}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('tramites')}
            className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg font-medium text-base transition-all ${
              activeTab === 'tramites' ? 'shadow-md' : ''
            }`}
            style={{
              backgroundColor: activeTab === 'tramites' ? theme.card : 'transparent',
              color: activeTab === 'tramites' ? theme.primary : theme.textSecondary,
            }}
          >
            <FileText className="h-5 w-5" />
            Trámites
            <span
              className="px-2.5 py-0.5 rounded-full text-sm"
              style={{
                backgroundColor: activeTab === 'tramites' ? `${theme.primary}20` : theme.border,
                color: activeTab === 'tramites' ? theme.primary : theme.textSecondary
              }}
            >
              {countTramites}
            </span>
          </button>
        </div>
      )}

      {/* Contenido */}
      {(activeTab === 'reclamos' || showOnlyReclamos) && (countReclamos > 0 || showOnlyReclamos) && (
        <Reclamos soloMisTrabajos />
      )}

      {(activeTab === 'tramites' || showOnlyTramites) && (countTramites > 0 || showOnlyTramites) && (
        <MisTramitesEmpleado />
      )}
    </div>
  );
}
