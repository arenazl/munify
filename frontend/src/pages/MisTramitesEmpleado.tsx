import { useEffect, useState } from 'react';
import {
  FileText,
  User,
  CheckCircle,
  Clock,
  Play,
  XCircle,
  Search,
  Calendar,
  Sparkles,
  UserPlus,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { ABMInfoPanel } from '../components/ui/ABMPage';
import type { Solicitud } from '../types';

// Estado de trámites
const estadoColors: Record<string, { bg: string; text: string }> = {
  iniciado: { bg: '#6366f1', text: '#ffffff' },
  en_revision: { bg: '#3b82f6', text: '#ffffff' },
  requiere_documentacion: { bg: '#f59e0b', text: '#ffffff' },
  en_proceso: { bg: '#8b5cf6', text: '#ffffff' },
  aprobado: { bg: '#10b981', text: '#ffffff' },
  rechazado: { bg: '#ef4444', text: '#ffffff' },
  finalizado: { bg: '#22c55e', text: '#ffffff' },
};

const estadoLabels: Record<string, string> = {
  iniciado: 'Iniciado',
  en_revision: 'En Revisión',
  requiere_documentacion: 'Requiere Doc.',
  en_proceso: 'En Proceso',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

const getEstadoIcon = (estado: string): React.ReactNode => {
  switch (estado) {
    case 'iniciado': return <Sparkles className="h-3 w-3" />;
    case 'en_revision': return <UserPlus className="h-3 w-3" />;
    case 'en_proceso': return <Play className="h-3 w-3" />;
    case 'aprobado': return <CheckCircle className="h-3 w-3" />;
    case 'rechazado': return <XCircle className="h-3 w-3" />;
    case 'finalizado': return <CheckCircle className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
};

export default function MisTramitesEmpleado() {
  const { theme } = useTheme();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSolicitud, setSelectedSolicitud] = useState<Solicitud | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'prioridad'>('reciente');

  // Cargar solicitudes
  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const res = await tramitesApi.getGestionSolicitudes({ limit: 100 });
      setSolicitudes(res.data || []);
    } catch (error) {
      console.error('Error cargando trámites:', error);
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar y ordenar
  const filteredSolicitudes = solicitudes
    .filter(s => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        s.numero_tramite?.toLowerCase().includes(searchLower) ||
        s.tramite?.nombre?.toLowerCase().includes(searchLower) ||
        s.nombre_solicitante?.toLowerCase().includes(searchLower) ||
        s.apellido_solicitante?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      if (ordenamiento === 'prioridad') {
        return (b.prioridad || 0) - (a.prioridad || 0);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const openSheet = (solicitud: Solicitud) => {
    setSelectedSolicitud(solicitud);
    setSheetOpen(true);
  };

  const handleUpdateEstado = async (nuevoEstado: string) => {
    if (!selectedSolicitud) return;
    try {
      await tramitesApi.updateSolicitud(selectedSolicitud.id, { estado: nuevoEstado });
      toast.success('Estado actualizado');
      fetchSolicitudes();
      setSheetOpen(false);
    } catch (error) {
      toast.error('Error al actualizar estado');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con búsqueda y ordenamiento */}
      <div
        className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar trámites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>

        {/* Ordenamiento */}
        <div className="flex gap-2">
          <button
            onClick={() => setOrdenamiento('reciente')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: ordenamiento === 'reciente' ? theme.card : theme.backgroundSecondary,
              border: `1px solid ${ordenamiento === 'reciente' ? theme.primary : theme.border}`,
              color: ordenamiento === 'reciente' ? theme.primary : theme.textSecondary,
            }}
          >
            <ArrowUpDown className="h-3 w-3" />
            Más recientes
          </button>
          <button
            onClick={() => setOrdenamiento('prioridad')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: ordenamiento === 'prioridad' ? theme.primary : theme.backgroundSecondary,
              border: `1px solid ${ordenamiento === 'prioridad' ? theme.primary : theme.border}`,
              color: ordenamiento === 'prioridad' ? '#ffffff' : theme.textSecondary,
            }}
          >
            <Calendar className="h-3 w-3" />
            Por prioridad
          </button>
        </div>
      </div>

      {/* Lista de trámites */}
      {filteredSolicitudes.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ backgroundColor: theme.card, color: theme.textSecondary }}
        >
          <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: theme.textSecondary }} />
          <p>No hay trámites que mostrar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSolicitudes.map((s) => {
            const estado = estadoColors[s.estado] || estadoColors.iniciado;
            return (
              <div
                key={s.id}
                onClick={() => openSheet(s)}
                className="p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${estado.bg}20` }}
                    >
                      <FileText className="h-4 w-4" style={{ color: estado.bg }} />
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: theme.text }}>
                        {s.numero_tramite}
                      </p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        {s.tramite?.tipo_tramite?.nombre}
                      </p>
                    </div>
                  </div>
                  <span
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: estado.bg, color: estado.text }}
                  >
                    {getEstadoIcon(s.estado)}
                    {estadoLabels[s.estado]}
                  </span>
                </div>

                {/* Trámite específico */}
                <p className="text-sm font-medium mb-2" style={{ color: theme.text }}>
                  {s.tramite?.nombre}
                </p>

                {/* Solicitante */}
                <div className="flex items-center gap-2 text-xs" style={{ color: theme.textSecondary }}>
                  <User className="h-3 w-3" />
                  {s.nombre_solicitante} {s.apellido_solicitante}
                </div>

                {/* Fecha */}
                <div className="flex items-center gap-2 text-xs mt-1" style={{ color: theme.textSecondary }}>
                  <Clock className="h-3 w-3" />
                  {new Date(s.created_at).toLocaleDateString('es-AR')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sheet de detalle */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selectedSolicitud?.numero_tramite || 'Detalle'}
        description={selectedSolicitud?.tramite?.nombre}
      >
        {selectedSolicitud && (
          <div className="space-y-4">
            {/* Info del trámite */}
            <ABMInfoPanel title="Información del Trámite">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Número:</span>
                  <span style={{ color: theme.text }}>{selectedSolicitud.numero_tramite}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Tipo:</span>
                  <span style={{ color: theme.text }}>{selectedSolicitud.tramite?.tipo_tramite?.nombre || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Trámite:</span>
                  <span style={{ color: theme.text }}>{selectedSolicitud.tramite?.nombre || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Estado:</span>
                  <span style={{ color: theme.text }}>{estadoLabels[selectedSolicitud.estado]}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Prioridad:</span>
                  <span style={{ color: theme.text }}>{selectedSolicitud.prioridad?.toString() || '0'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Fecha:</span>
                  <span style={{ color: theme.text }}>{new Date(selectedSolicitud.created_at).toLocaleDateString('es-AR')}</span>
                </div>
              </div>
            </ABMInfoPanel>

            {/* Solicitante */}
            <ABMInfoPanel title="Solicitante">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Nombre:</span>
                  <span style={{ color: theme.text }}>{`${selectedSolicitud.nombre_solicitante || ''} ${selectedSolicitud.apellido_solicitante || ''}`.trim() || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Email:</span>
                  <span style={{ color: theme.text }}>{selectedSolicitud.email_solicitante || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Teléfono:</span>
                  <span style={{ color: theme.text }}>{selectedSolicitud.telefono_solicitante || '-'}</span>
                </div>
              </div>
            </ABMInfoPanel>

            {/* Acciones de estado */}
            <div className="space-y-2">
              <p className="text-sm font-medium" style={{ color: theme.text }}>
                Cambiar estado:
              </p>
              <div className="flex flex-wrap gap-2">
                {['en_proceso', 'aprobado', 'rechazado', 'finalizado'].map((estado) => (
                  <button
                    key={estado}
                    onClick={() => handleUpdateEstado(estado)}
                    disabled={selectedSolicitud.estado === estado}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    style={{
                      backgroundColor: estadoColors[estado]?.bg || theme.backgroundSecondary,
                      color: estadoColors[estado]?.text || theme.text,
                    }}
                  >
                    {getEstadoIcon(estado)}
                    {estadoLabels[estado]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
