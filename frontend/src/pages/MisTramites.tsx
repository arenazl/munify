import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Copy,
  FileCheck,
  HelpCircle,
  Tag,
  Calendar,
  Eye,
  ExternalLink,
  Search,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard, ABMTable, type ABMTableColumn } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { TramiteWizard } from '../components/TramiteWizard';
import type { Tramite, EstadoTramite, ServicioTramite, TipoTramite } from '../types';

const estadoConfig: Record<EstadoTramite, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  iniciado: { icon: Clock, color: '#6366f1', label: 'Iniciado', bg: '#eef2ff' },
  en_revision: { icon: FileCheck, color: '#3b82f6', label: 'En Revisión', bg: '#dbeafe' },
  requiere_documentacion: { icon: AlertCircle, color: '#f59e0b', label: 'Requiere Doc.', bg: '#fef3c7' },
  en_proceso: { icon: RefreshCw, color: '#8b5cf6', label: 'En Proceso', bg: '#ede9fe' },
  aprobado: { icon: CheckCircle2, color: '#10b981', label: 'Aprobado', bg: '#d1fae5' },
  rechazado: { icon: XCircle, color: '#ef4444', label: 'Rechazado', bg: '#fee2e2' },
  finalizado: { icon: CheckCircle2, color: '#059669', label: 'Finalizado', bg: '#d1fae5' },
};

export default function MisTramites() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Ordenamiento y filtros
  const [ordenarPor, setOrdenarPor] = useState<'fecha' | 'estado'>('fecha');
  const [filtroEstado, setFiltroEstado] = useState<EstadoTramite | 'todos'>('todos');

  // Sheet states
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTramite, setSelectedTramite] = useState<Tramite | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [tipos, setTipos] = useState<TipoTramite[]>([]);

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

  const goToNuevoTramite = async () => {
    try {
      const [serviciosRes, tiposRes] = await Promise.all([
        tramitesApi.getServicios(),
        tramitesApi.getTipos()
      ]);
      setServicios(serviciosRes.data);
      setTipos(tiposRes.data);
    } catch (error) {
      console.error('Error cargando servicios/tipos:', error);
    }
    setWizardOpen(true);
  };

  const handleWizardSuccess = () => {
    setWizardOpen(false);
    loadTramites();
  };

  const openViewSheet = (tramite: Tramite) => {
    setSelectedTramite(tramite);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedTramite(null);
  };

  // Orden de estados para ordenamiento
  const estadoOrden: Record<string, number> = {
    'requiere_documentacion': 1,
    'iniciado': 2,
    'en_revision': 3,
    'en_proceso': 4,
    'aprobado': 5,
    'finalizado': 6,
    'rechazado': 7,
  };

  const filteredTramites = tramites
    .filter(t => {
      const matchSearch = t.numero_tramite.toLowerCase().includes(search.toLowerCase()) ||
        t.asunto.toLowerCase().includes(search.toLowerCase()) ||
        t.servicio?.nombre.toLowerCase().includes(search.toLowerCase());
      const matchEstado = filtroEstado === 'todos' || t.estado === filtroEstado;
      return matchSearch && matchEstado;
    })
    .sort((a, b) => {
      if (ordenarPor === 'fecha') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else {
        // Ordenar por estado (pendientes primero)
        return (estadoOrden[a.estado] || 99) - (estadoOrden[b.estado] || 99);
      }
    });

  // Estados únicos para el filtro
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
                <TramiteDetailCard tramite={tramiteConsultado} theme={theme} />
              </div>
            )}
          </div>

          {/* Link a iniciar trámite */}
          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/gestion/crear-tramite')}
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

  // Empty state personalizado
  const renderEmptyState = () => (
    <div
      className="rounded-lg p-6 sm:p-12 text-center"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        <FileText className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: theme.textSecondary }} />
      </div>
      <p className="mb-4 text-sm sm:text-base" style={{ color: theme.textSecondary }}>No tienes trámites registrados</p>
      <button
        onClick={goToNuevoTramite}
        className="inline-flex items-center px-4 py-3 sm:py-2 rounded-lg transition-colors hover:opacity-90 active:scale-95 touch-manipulation"
        style={{ backgroundColor: theme.primary, color: '#ffffff' }}
      >
        <Plus className="h-4 w-4 mr-2" />
        Iniciar mi primer trámite
      </button>
    </div>
  );

  // Renderizar contenido del Sheet
  const renderViewContent = () => {
    if (!selectedTramite) return null;

    const config = estadoConfig[selectedTramite.estado] || {
      icon: HelpCircle,
      color: '#6b7280',
      label: selectedTramite.estado || 'Desconocido',
      bg: '#f3f4f6'
    };
    const IconEstado = config.icon;

    return (
      <div className="space-y-6">
        {/* Estado actual */}
        <div className="flex items-center justify-between">
          <span
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            <IconEstado className="h-4 w-4" />
            {config.label}
          </span>
          <span className="text-sm" style={{ color: theme.textSecondary }}>
            {new Date(selectedTramite.created_at).toLocaleString()}
          </span>
        </div>

        {/* Número de trámite */}
        <div
          className="flex items-center justify-between p-4 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Número de Trámite
            </label>
            <span className="font-mono font-semibold" style={{ color: theme.text }}>
              {selectedTramite.numero_tramite}
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(selectedTramite.numero_tramite);
              toast.success('Número copiado');
            }}
            className="p-2 rounded-lg hover:bg-black/5 transition-colors"
          >
            <Copy className="h-4 w-4" style={{ color: theme.textSecondary }} />
          </button>
        </div>

        {/* Información del trámite */}
        <div className="space-y-4">
          {selectedTramite.servicio && (
            <div>
              <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Tipo de Trámite</label>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${selectedTramite.servicio.color || theme.primary}20` }}
                >
                  <FileText className="h-4 w-4" style={{ color: selectedTramite.servicio.color || theme.primary }} />
                </div>
                <span style={{ color: theme.text }}>{selectedTramite.servicio.nombre}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Asunto</label>
            <p className="mt-1" style={{ color: theme.text }}>{selectedTramite.asunto}</p>
          </div>

          {selectedTramite.descripcion && (
            <div>
              <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Descripción</label>
              <p className="mt-1" style={{ color: theme.text }}>{selectedTramite.descripcion}</p>
            </div>
          )}
        </div>

        {/* Respuesta/Observaciones si hay */}
        {selectedTramite.respuesta && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#d1fae5' }}>
            <label className="block text-sm font-medium mb-1" style={{ color: '#065f46' }}>Respuesta</label>
            <p style={{ color: '#064e3b' }}>{selectedTramite.respuesta}</p>
          </div>
        )}

        {selectedTramite.observaciones && (
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: selectedTramite.estado === 'rechazado' ? '#fee2e2' : '#fef3c7' }}
          >
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: selectedTramite.estado === 'rechazado' ? '#991b1b' : '#92400e' }}
            >
              {selectedTramite.estado === 'rechazado' ? 'Motivo del Rechazo' : 'Observaciones'}
            </label>
            <p style={{ color: selectedTramite.estado === 'rechazado' ? '#7f1d1d' : '#78350f' }}>
              {selectedTramite.observaciones}
            </p>
          </div>
        )}

        {/* Fechas importantes */}
        <div className="pt-4 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
          <h4 className="font-medium flex items-center text-sm" style={{ color: theme.text }}>
            <Clock className="h-4 w-4 mr-2" />
            Fechas
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs" style={{ color: theme.textSecondary }}>Iniciado</label>
              <p style={{ color: theme.text }}>
                {new Date(selectedTramite.created_at).toLocaleDateString('es-AR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </p>
            </div>
            {selectedTramite.fecha_resolucion && (
              <div>
                <label className="block text-xs" style={{ color: theme.textSecondary }}>Resuelto</label>
                <p style={{ color: '#10b981' }}>
                  {new Date(selectedTramite.fecha_resolucion).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Barra de filtros secundarios (como MisReclamos)
  const renderSecondaryFilters = () => (
    <div className="flex items-center gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {/* Ordenamiento */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setOrdenarPor('fecha')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          style={{
            backgroundColor: ordenarPor === 'fecha' ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `1px solid ${ordenarPor === 'fecha' ? theme.primary : theme.border}`,
            color: ordenarPor === 'fecha' ? theme.primary : theme.textSecondary,
          }}
        >
          <ArrowUpDown className="h-3 w-3" />
          Más recientes
        </button>
        <button
          onClick={() => setOrdenarPor('estado')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          style={{
            backgroundColor: ordenarPor === 'estado' ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `1px solid ${ordenarPor === 'estado' ? theme.primary : theme.border}`,
            color: ordenarPor === 'estado' ? theme.primary : theme.textSecondary,
          }}
        >
          <Filter className="h-3 w-3" />
          Por estado
        </button>
      </div>

      {/* Separador */}
      <div className="h-5 w-px flex-shrink-0" style={{ backgroundColor: theme.border }} />

      {/* Filtros de estado - chips */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setFiltroEstado('todos')}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
          style={{
            backgroundColor: filtroEstado === 'todos' ? theme.primary : theme.backgroundSecondary,
            border: `1px solid ${filtroEstado === 'todos' ? theme.primary : theme.border}`,
            color: filtroEstado === 'todos' ? '#ffffff' : theme.textSecondary,
          }}
        >
          Todos
        </button>
        {estadosUnicos.map(estado => {
          const config = estadoConfig[estado];
          if (!config) return null;
          const isSelected = filtroEstado === estado;
          return (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: isSelected ? config.bg : theme.backgroundSecondary,
                border: `1px solid ${isSelected ? config.color : theme.border}`,
                color: isSelected ? config.color : theme.textSecondary,
              }}
            >
              {config.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Columnas para la vista de tabla
  const tableColumns: ABMTableColumn<Tramite>[] = [
    {
      key: 'numero_tramite',
      header: 'Número',
      render: (t) => (
        <span className="font-mono text-sm" style={{ color: theme.text }}>
          {t.numero_tramite}
        </span>
      ),
    },
    {
      key: 'asunto',
      header: 'Asunto',
      render: (t) => (
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: theme.text }}>{t.asunto}</p>
          {t.servicio && (
            <p className="text-xs truncate" style={{ color: theme.textSecondary }}>{t.servicio.nombre}</p>
          )}
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (t) => {
        const config = estadoConfig[t.estado] || { icon: HelpCircle, color: '#6b7280', label: t.estado, bg: '#f3f4f6' };
        const IconEstado = config.icon;
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            <IconEstado className="h-3 w-3" />
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Fecha',
      render: (t) => (
        <span className="text-sm" style={{ color: theme.textSecondary }}>
          {new Date(t.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: '',
      render: (t) => (
        <button
          onClick={(e) => { e.stopPropagation(); openViewSheet(t); }}
          className="p-2 rounded-lg transition-all hover:scale-110"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <ABMPage
        title="Mis Trámites"
        buttonLabel="Nuevo Trámite"
        onAdd={goToNuevoTramite}
        searchPlaceholder="Buscar en mis trámites..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={filteredTramites.length === 0 && !search && filtroEstado === 'todos'}
        emptyMessage=""
        defaultViewMode="cards"
        stickyHeader={true}
        secondaryFilters={renderSecondaryFilters()}
        tableView={
          <ABMTable
            data={filteredTramites}
            columns={tableColumns}
            keyExtractor={(t) => t.id}
            onRowClick={(t) => openViewSheet(t)}
          />
        }
      >
        {filteredTramites.length === 0 && !search && filtroEstado === 'todos' ? (
          renderEmptyState()
        ) : filteredTramites.length === 0 ? (
          <div className="col-span-full text-center py-12" style={{ color: theme.textSecondary }}>
            No se encontraron trámites
            {(search || filtroEstado !== 'todos') && (
              <button
                onClick={() => { setSearch(''); setFiltroEstado('todos'); }}
                className="block mx-auto mt-2 text-sm"
                style={{ color: theme.primary }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          filteredTramites.map((t) => {
            const config = estadoConfig[t.estado] || {
              icon: HelpCircle,
              color: '#6b7280',
              label: t.estado || 'Desconocido',
              bg: '#f3f4f6'
            };
            const IconEstado = config.icon;
            const servicioColor = t.servicio?.color || theme.primary;

            return (
              <ABMCard key={t.id} onClick={() => openViewSheet(t)}>
                <div className="flex gap-4">
                  {/* Icono del servicio como miniatura */}
                  <div
                    className="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${servicioColor}15` }}
                  >
                    <FileText
                      className="h-8 w-8"
                      style={{ color: servicioColor }}
                    />
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    {/* Línea 1: Título + Estado */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold line-clamp-1" style={{ color: theme.text }}>
                        {t.asunto}
                      </p>
                      <span
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0"
                        style={{ backgroundColor: config.bg, color: config.color }}
                      >
                        <IconEstado className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>

                    {/* Línea 2: Tipo de servicio + Fecha */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {t.servicio && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: `${servicioColor}15`, color: servicioColor }}
                        >
                          {t.servicio.nombre}
                        </span>
                      )}
                      <span className="text-xs flex items-center" style={{ color: theme.textSecondary }}>
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Línea 3: Descripción */}
                    {t.descripcion ? (
                      <p className="text-sm mt-2 line-clamp-2" style={{ color: theme.textSecondary }}>
                        {t.descripcion}
                      </p>
                    ) : (
                      <p className="text-sm mt-2 italic" style={{ color: theme.textSecondary }}>
                        Sin descripción adicional
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer con número de trámite y fechas */}
                <div
                  className="flex items-center justify-between mt-3 pt-3 text-xs"
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <span
                    className="font-mono px-2 py-0.5 rounded"
                    style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
                  >
                    {t.numero_tramite}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Última actualización */}
                    {t.updated_at && (
                      <span className="flex items-center gap-1" style={{ color: theme.textSecondary }}>
                        <Clock className="h-3 w-3" />
                        {new Date(t.updated_at).toLocaleDateString()}
                      </span>
                    )}
                    {/* Por vencer - basado en tiempo_estimado_dias desde created_at */}
                    {!['finalizado', 'rechazado', 'aprobado'].includes(t.estado) && (() => {
                      const tiempoEstimado = t.servicio?.tiempo_estimado_dias || t.tramite?.tiempo_estimado_dias || 0;
                      if (!tiempoEstimado) return null;

                      const fechaCreacion = new Date(t.created_at);
                      const fechaVencimiento = new Date(fechaCreacion);
                      fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);

                      const hoy = new Date();
                      hoy.setHours(0, 0, 0, 0);
                      fechaVencimiento.setHours(0, 0, 0, 0);

                      const diffMs = fechaVencimiento.getTime() - hoy.getTime();
                      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                      const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));

                      let texto = '';
                      let color = theme.textSecondary;

                      if (diffDias < 0) {
                        const diasVencidos = Math.abs(diffDias);
                        if (diasVencidos >= 7) {
                          texto = `Vencido (${Math.floor(diasVencidos / 7)}sem)`;
                        } else {
                          texto = `Vencido (${diasVencidos}d)`;
                        }
                        color = '#ef4444';
                      } else if (diffDias === 0) {
                        texto = 'Hoy';
                        color = '#f59e0b';
                      } else if (diffHoras <= 24) {
                        texto = `${diffHoras}h`;
                        color = '#f59e0b';
                      } else if (diffDias === 1) {
                        texto = 'Mañana';
                        color = '#eab308';
                      } else if (diffDias <= 7) {
                        texto = `${diffDias}d`;
                        color = diffDias <= 2 ? '#eab308' : theme.textSecondary;
                      } else {
                        texto = `${Math.floor(diffDias / 7)}sem`;
                      }

                      return (
                        <span className="font-medium" style={{ color }}>
                          {texto}
                        </span>
                      );
                    })()}
                    <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                  </div>
                </div>
              </ABMCard>
            );
          })
        )}
      </ABMPage>

      {/* Sheet para ver detalle */}
      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={`Trámite ${selectedTramite?.numero_tramite || ''}`}
        description={selectedTramite?.asunto}
        stickyFooter={
          selectedTramite && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(selectedTramite.numero_tramite);
                toast.success('Número de trámite copiado');
              }}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primary, color: '#ffffff' }}
            >
              <Copy className="h-4 w-4" />
              Copiar Número de Trámite
            </button>
          )
        }
      >
        {renderViewContent()}
      </Sheet>

      {/* Wizard para crear nuevo trámite */}
      <TramiteWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        servicios={servicios}
        tipos={tipos}
        onSuccess={handleWizardSuccess}
      />
    </>
  );
}

// Componente para mostrar detalle del trámite (usado en consulta pública)
function TramiteDetailCard({ tramite, theme }: { tramite: Tramite; theme: ReturnType<typeof useTheme>['theme'] }) {
  const config = estadoConfig[tramite.estado] || {
    icon: HelpCircle,
    color: '#6b7280',
    label: tramite.estado || 'Desconocido',
    bg: '#f3f4f6'
  };
  const IconEstado = config.icon;

  return (
    <div className="space-y-4">
      {/* Header con número y estado */}
      <div className="flex items-start justify-between">
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
        <div className="flex items-center gap-2">
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
      <p className="text-sm" style={{ color: theme.text }}>
        {tramite.asunto}
      </p>

      {/* Respuesta/Observaciones si hay */}
      {(tramite.respuesta || tramite.observaciones) && (
        <div
          className="p-3 rounded-lg text-sm"
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
      <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
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
