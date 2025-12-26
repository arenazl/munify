import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
  Search,
  RefreshCw,
  Copy,
  FileCheck,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { Tramite, EstadoTramite } from '../types';

const estadoConfig: Record<EstadoTramite, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  iniciado: { icon: Clock, color: '#6366f1', label: 'Iniciado', bg: '#6366f115' },
  en_revision: { icon: FileCheck, color: '#3b82f6', label: 'En Revisión', bg: '#3b82f615' },
  requiere_documentacion: { icon: AlertCircle, color: '#f59e0b', label: 'Requiere Doc.', bg: '#f59e0b15' },
  en_proceso: { icon: RefreshCw, color: '#8b5cf6', label: 'En Proceso', bg: '#8b5cf615' },
  aprobado: { icon: CheckCircle2, color: '#10b981', label: 'Aprobado', bg: '#10b98115' },
  rechazado: { icon: XCircle, color: '#ef4444', label: 'Rechazado', bg: '#ef444415' },
  finalizado: { icon: CheckCircle2, color: '#059669', label: 'Finalizado', bg: '#05966915' },
};

export default function MisTramites() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoTramite | 'todos'>('todos');

  // Consulta por número de trámite (para usuarios no logueados)
  const [consultaNumero, setConsultaNumero] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [tramiteConsultado, setTramiteConsultado] = useState<Tramite | null>(null);

  useEffect(() => {
    if (user) {
      loadTramites();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadTramites = async () => {
    try {
      const res = await tramitesApi.getAll();
      setTramites(res.data);
    } catch (error) {
      console.error('Error cargando trámites:', error);
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  const handleConsultar = async () => {
    if (!consultaNumero.trim()) {
      toast.error('Ingresa un número de trámite');
      return;
    }

    setConsultando(true);
    try {
      const res = await tramitesApi.consultar(consultaNumero.trim());
      setTramiteConsultado(res.data);
    } catch (error) {
      console.error('Error consultando trámite:', error);
      toast.error('Trámite no encontrado');
      setTramiteConsultado(null);
    } finally {
      setConsultando(false);
    }
  };

  const filteredTramites = tramites.filter(t => {
    const matchSearch = t.numero_tramite.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.asunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.servicio?.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filtroEstado === 'todos' || t.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const estadosUnicos = [...new Set(tramites.map(t => t.estado))];

  // Vista para usuarios no logueados - consulta por número
  if (!user) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: theme.background }}>
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${theme.primary}15` }}
            >
              <FileText className="h-8 w-8" style={{ color: theme.primary }} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>
              Consultar Trámite
            </h1>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              Ingresa el número de trámite para ver su estado
            </p>
          </div>

          {/* Formulario de consulta */}
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>
                  Número de trámite
                </label>
                <input
                  type="text"
                  placeholder="Ej: TRM-2025-00001"
                  value={consultaNumero}
                  onChange={(e) => setConsultaNumero(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleConsultar()}
                  className="w-full px-4 py-3 rounded-xl text-sm font-mono"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                />
              </div>

              <button
                onClick={handleConsultar}
                disabled={consultando}
                className="w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                  color: '#ffffff',
                }}
              >
                {consultando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    Consultar
                  </>
                )}
              </button>
            </div>

            {/* Resultado de consulta */}
            {tramiteConsultado && (
              <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${theme.border}` }}>
                <TramiteCard tramite={tramiteConsultado} theme={theme} />
              </div>
            )}
          </div>

          {/* Link a iniciar trámite */}
          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/app/tramites')}
              className="text-sm font-medium"
              style={{ color: theme.primary }}
            >
              ¿Necesitás iniciar un trámite nuevo?
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" style={{ backgroundColor: theme.background, minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: theme.text }}>
            Mis Trámites
          </h1>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            {tramites.length} trámite{tramites.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        <button
          onClick={() => navigate('/app/tramites')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
            color: '#ffffff',
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </button>
      </div>

      {/* Buscador y filtros */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: theme.textSecondary }}
          />
          <input
            type="text"
            placeholder="Buscar por número o asunto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>
      </div>

      {/* Filtros de estado */}
      {estadosUnicos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          <button
            onClick={() => setFiltroEstado('todos')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
            style={{
              backgroundColor: filtroEstado === 'todos' ? theme.primary : theme.card,
              color: filtroEstado === 'todos' ? '#ffffff' : theme.textSecondary,
              border: `1px solid ${filtroEstado === 'todos' ? theme.primary : theme.border}`,
            }}
          >
            Todos
          </button>
          {estadosUnicos.map(estado => {
            const config = estadoConfig[estado];
            return (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: filtroEstado === estado ? config.color : theme.card,
                  color: filtroEstado === estado ? '#ffffff' : config.color,
                  border: `1px solid ${filtroEstado === estado ? config.color : theme.border}`,
                }}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Lista de trámites */}
      {filteredTramites.length === 0 ? (
        <div className="text-center py-12">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${theme.primary}15` }}
          >
            <FileText className="h-8 w-8" style={{ color: theme.primary }} />
          </div>
          <p className="font-medium" style={{ color: theme.text }}>
            {searchTerm || filtroEstado !== 'todos' ? 'No hay resultados' : 'No tenés trámites'}
          </p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            {searchTerm || filtroEstado !== 'todos'
              ? 'Probá con otros filtros'
              : 'Iniciá tu primer trámite ahora'}
          </p>
          {!searchTerm && filtroEstado === 'todos' && (
            <button
              onClick={() => navigate('/app/tramites')}
              className="mt-4 px-6 py-2 rounded-xl font-medium text-sm"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                color: '#ffffff',
              }}
            >
              Iniciar Trámite
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTramites.map(tramite => (
            <TramiteCard key={tramite.id} tramite={tramite} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}

// Componente TramiteCard reutilizable
function TramiteCard({ tramite, theme }: { tramite: Tramite; theme: ReturnType<typeof useTheme>['theme'] }) {
  const config = estadoConfig[tramite.estado];
  const IconEstado = config.icon;

  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {/* Header con número y estado */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono font-medium px-2 py-1 rounded"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
          >
            {tramite.numero_tramite}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(tramite.numero_tramite);
              toast.success('Número copiado');
            }}
            className="p-1 rounded hover:bg-black/5"
          >
            <Copy className="h-3 w-3" style={{ color: theme.textSecondary }} />
          </button>
        </div>
        <span
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
          style={{ backgroundColor: config.bg, color: config.color }}
        >
          <IconEstado className="h-3 w-3" />
          {config.label}
        </span>
      </div>

      {/* Servicio */}
      {tramite.servicio && (
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ backgroundColor: `${tramite.servicio.color || theme.primary}20` }}
          >
            <FileText className="h-3 w-3" style={{ color: tramite.servicio.color || theme.primary }} />
          </div>
          <span className="text-sm font-medium" style={{ color: theme.text }}>
            {tramite.servicio.nombre}
          </span>
        </div>
      )}

      {/* Asunto */}
      <p className="text-sm line-clamp-2 mb-3" style={{ color: theme.textSecondary }}>
        {tramite.asunto}
      </p>

      {/* Respuesta/Observaciones si hay */}
      {(tramite.respuesta || tramite.observaciones) && (
        <div
          className="p-3 rounded-lg mb-3 text-sm"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <p className="font-medium mb-1" style={{ color: theme.text }}>
            {tramite.estado === 'rechazado' ? 'Motivo:' : 'Respuesta:'}
          </p>
          <p style={{ color: theme.textSecondary }}>
            {tramite.respuesta || tramite.observaciones}
          </p>
        </div>
      )}

      {/* Footer con fecha */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          <Clock className="h-3 w-3 inline mr-1" />
          {new Date(tramite.created_at).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })}
        </span>
        {tramite.fecha_resolucion && (
          <span className="text-xs" style={{ color: config.color }}>
            <CheckCircle2 className="h-3 w-3 inline mr-1" />
            Resuelto {new Date(tramite.fecha_resolucion).toLocaleDateString('es-AR')}
          </span>
        )}
      </div>
    </div>
  );
}
