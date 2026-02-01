import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { chatApi } from '../lib/api';
import {
  AlertTriangle, Users, Folder, MapPin, FileText,
  Layers, User, Database, Star, TrendingUp, TrendingDown,
  Loader2, Save, Trash2, Table2, Download, ChevronDown, ChevronUp, RefreshCw,
  Plus, X, History, ChevronLeft, ChevronRight,
  LayoutGrid, List, Clock, Trophy, FolderKanban, Gauge, BarChart2,
  MessageSquare, Sparkles
} from 'lucide-react';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { AutocompleteInput } from '../components/ui/AutocompleteInput';
import QueryTemplates from '../components/QueryTemplates';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, LineChart as ReLineChart, Line, Legend
} from 'recharts';

// Interfaces
interface KPIsData {
  reclamos: {
    total: number;
    pendientes: number;
    nuevos: number;
    asignados: number;
    en_curso: number;
    resueltos: number;
    hoy: number;
    esta_semana: number;
    este_mes: number;
  };
  tramites: {
    total: number;
    iniciados: number;
    en_revision: number;
    en_curso: number;
    aprobados: number;
    esta_semana: number;
  };
  empleados: {
    total: number;
    activos: number;
  };
  tendencias: {
    reclamos_cambio_semanal: number;
    reclamos_semana_pasada: number;
  };
}

// KPI Pill configurable
interface KPIPill {
  id: string;
  label: string;
  value: number | string;
  color: string;
  trend?: number;
}

interface EntityCampo {
  name: string;
  type: string;
  fk: string | null;
}

interface Entity {
  nombre: string;
  tabla: string;
  icono: string;
  descripcion: string;
  campos: EntityCampo[];
}


interface ConsultaGuardada {
  id: number;
  nombre: string;
  descripcion: string | null;
  pregunta_original: string;
  icono: string;
  color: string;
  veces_ejecutada: number;
  es_publica: boolean;
}

// Mapeo de iconos
const getIcon = (iconName: string) => {
  const icons: Record<string, React.ReactNode> = {
    'alert-triangle': <AlertTriangle className="h-4 w-4" />,
    'users': <Users className="h-4 w-4" />,
    'folder': <Folder className="h-4 w-4" />,
    'map-pin': <MapPin className="h-4 w-4" />,
    'file-text': <FileText className="h-4 w-4" />,
    'clipboard-list': <FileText className="h-4 w-4" />,
    'layers': <Layers className="h-4 w-4" />,
    'user': <User className="h-4 w-4" />,
    'database': <Database className="h-4 w-4" />,
    'star': <Star className="h-4 w-4" />,
    'history': <History className="h-4 w-4" />,
  };
  return icons[iconName] || <Database className="h-4 w-4" />;
};

// Colores para gráficos
const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

// Tipos de visualización
type ChartType = 'table' | 'bar' | 'pie' | 'line';

// Colores disponibles para KPIs
const KPI_COLORS = [
  { name: 'Naranja', value: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { name: 'Azul', value: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  { name: 'Verde', value: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  { name: 'Violeta', value: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  { name: 'Rosa', value: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  { name: 'Rojo', value: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  { name: 'Celeste', value: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  { name: 'Gris', value: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' },
];

// KPIs disponibles predefinidos (se mapean desde los datos del backend)
const AVAILABLE_KPIS = [
  { id: 'reclamos_pendientes', label: 'Pendientes', path: 'reclamos.pendientes', defaultColor: '#f59e0b' },
  { id: 'reclamos_hoy', label: 'Hoy', path: 'reclamos.hoy', defaultColor: '#3b82f6' },
  { id: 'reclamos_semana', label: 'Esta semana', path: 'reclamos.esta_semana', defaultColor: '#8b5cf6', hasTrend: true },
  { id: 'reclamos_resueltos', label: 'Resueltos', path: 'reclamos.resueltos', defaultColor: '#10b981' },
  { id: 'reclamos_en_curso', label: 'En proceso', path: 'reclamos.en_curso', defaultColor: '#06b6d4' },
  { id: 'reclamos_total', label: 'Total reclamos', path: 'reclamos.total', defaultColor: '#64748b' },
  { id: 'tramites_activos', label: 'Trámites activos', path: 'tramites.en_curso', defaultColor: '#ec4899' },
  { id: 'tramites_aprobados', label: 'Trámites aprobados', path: 'tramites.aprobados', defaultColor: '#10b981' },
  { id: 'empleados_activos', label: 'Empleados activos', path: 'empleados.activos', defaultColor: '#64748b' },
];

// Helper para obtener valor anidado
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
};

export default function PanelBI() {
  const { theme } = useTheme();
  const { user } = useAuth();

  // Estados
  const [kpis, setKpis] = useState<KPIsData | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [consultasGuardadas, setConsultasGuardadas] = useState<ConsultaGuardada[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingConsultas, setLoadingConsultas] = useState(true);

  // Estados del chat/consulta
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any[] | null>(null);
  const [sqlQuery, setSqlQuery] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [mostrarGrilla, setMostrarGrilla] = useState(true);

  // Paginación de datos
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const ROWS_OPTIONS = [20, 50, 100];

  // Schema para autocompletado - cargado del backend
  const [dbSchema, setDbSchema] = useState<Record<string, Array<{ name: string; type: string; fk: string | null }>>>({});

  // Estado para guardar consulta
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNombre, setSaveNombre] = useState('');
  const [savingConsulta, setSavingConsulta] = useState(false);

  // Estado para entidad expandida
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

  // Estados para colapsar/expandir paneles laterales
  const [consultasCollapsed, setConsultasCollapsed] = useState(false);
  const [entidadesCollapsed, setEntidadesCollapsed] = useState(false);

  // Estado para filtrar entidades
  const [entityFilter, setEntityFilter] = useState('');

  // Estado para formato seleccionado (no se muestra en el input)
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  // Modo de consulta: 'text' (lenguaje natural) o 'templates' (consultas rápidas)
  const [queryMode, setQueryMode] = useState<'text' | 'templates'>('text');

  // KPIs configurables - guardar en localStorage
  const [activeKpis, setActiveKpis] = useState<string[]>(() => {
    const saved = localStorage.getItem('panelbi_kpis');
    return saved ? JSON.parse(saved) : ['reclamos_pendientes', 'reclamos_hoy', 'reclamos_semana', 'reclamos_resueltos'];
  });
  const [showKpiSelector, setShowKpiSelector] = useState(false);

  const responseRef = useRef<HTMLDivElement>(null);

  // Guardar KPIs activos en localStorage
  useEffect(() => {
    localStorage.setItem('panelbi_kpis', JSON.stringify(activeKpis));
  }, [activeKpis]);

  // Agregar/quitar KPI
  const toggleKpi = (kpiId: string) => {
    setActiveKpis(prev =>
      prev.includes(kpiId)
        ? prev.filter(id => id !== kpiId)
        : [...prev, kpiId]
    );
  };

  // Cargar datos iniciales
  useEffect(() => {
    loadKPIs();
    loadConsultasGuardadas();
    loadEntities();
    loadSchema();
  }, []);

  // Villero JS: hacer tabs interactivos después de renderizar
  useEffect(() => {
    if (!response || !responseRef.current) return;

    // Buscar contenedor de tabs (flex con tabs adentro)
    const container = responseRef.current;
    const tabsContainer = container.querySelector('div > div[style*="flex-wrap"]');
    if (!tabsContainer) return;

    const tabs = tabsContainer.querySelectorAll('div[style*="border-radius:8px 8px 0 0"]');
    const detailPanel = tabsContainer.nextElementSibling as HTMLElement;

    if (tabs.length < 2 || !detailPanel) return;

    // Agregar cursor pointer y click handler a cada tab
    tabs.forEach((tab) => {
      const tabEl = tab as HTMLElement;
      tabEl.style.cursor = 'pointer';
      tabEl.style.transition = 'all 0.2s';

      tabEl.onclick = () => {
        // Reset todos los tabs
        tabs.forEach(t => {
          const el = t as HTMLElement;
          el.style.background = '#f8f5f0';
          el.style.color = '#5c4d3d';
          el.style.fontWeight = '400';
        });

        // Activar tab clickeado
        tabEl.style.background = '#b08d57';
        tabEl.style.color = 'white';
        tabEl.style.fontWeight = '600';

        // Actualizar panel de detalle con el texto del tab
        const tabText = tabEl.textContent?.replace(/[^\w\s()]/g, '').trim() || '';
        const titleEl = detailPanel.querySelector('div[style*="font-weight:600"]');
        if (titleEl) {
          titleEl.textContent = `📊 Detalle: ${tabText.split('(')[0].trim()}`;
        }
      };
    });
  }, [response]);

  const loadSchema = async () => {
    try {
      const data = await chatApi.getSchema();
      console.log('[SCHEMA] Loaded:', data);
      console.log('[SCHEMA] Tables keys:', Object.keys(data.tables || {}));
      console.log('[SCHEMA] Sample table:', data.tables?.reclamos);
      setDbSchema(data.tables || {});
    } catch (error) {
      console.error('Error loading schema:', error);
    }
  };

  const loadEntities = async () => {
    setLoadingEntities(true);
    try {
      const data = await chatApi.getEntities();
      setEntities(data.entities);
    } catch (error) {
      console.error('Error loading entities:', error);
    } finally {
      setLoadingEntities(false);
    }
  };

  const loadKPIs = async () => {
    setLoadingKpis(true);
    try {
      const data = await chatApi.getKPIs();
      setKpis(data);
    } catch (error) {
      console.error('Error loading KPIs:', error);
    } finally {
      setLoadingKpis(false);
    }
  };

  const loadConsultasGuardadas = async () => {
    setLoadingConsultas(true);
    try {
      const data = await chatApi.getConsultasGuardadas();
      setConsultasGuardadas(data);
    } catch (error) {
      console.error('Error loading consultas:', error);
    } finally {
      setLoadingConsultas(false);
    }
  };

  // Ejecutar consulta
  const ejecutarConsulta = async (formatOverride?: string) => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setResponse(null);
    setRawData(null);
    setSqlQuery(null);

    // Usar formato override o el seleccionado
    const format = formatOverride || selectedFormat;
    const query = input.trim();
    const queryToSend = format ? `${query} [formato: ${format}]` : query;

    try {
      const result = await chatApi.consulta(queryToSend);
      setResponse(result.response);
      setRawData(result.datos_crudos);
      setSqlQuery(result.sql_ejecutado);
      setMostrarGrilla(result.mostrar_grilla !== false); // Por defecto true
      setCurrentPage(1); // Reset paginación

      // Scroll al resultado
      setTimeout(() => {
        responseRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Error:', error);
      setResponse('<p style="color:#ef4444">Error ejecutando consulta. Intentá de nuevo.</p>');
    } finally {
      setLoading(false);
      // Reset formato después de ejecutar
      setSelectedFormat(null);
    }
  };

  // Ejecutar consulta desde template
  const ejecutarDesdeTemplate = (query: string, formato?: string) => {
    setInput(query);
    if (formato) {
      ejecutarConsulta(formato);
    } else {
      ejecutarConsulta();
    }
  };

  // Ejecutar consulta guardada
  const ejecutarConsultaGuardada = async (consulta: ConsultaGuardada) => {
    setInput(consulta.pregunta_original);
    setLoading(true);
    setResponse(null);

    try {
      const result = await chatApi.ejecutarConsultaGuardada(consulta.id);
      setResponse(result.response);
      setRawData(result.datos_crudos);
      setSqlQuery(result.sql_ejecutado);
      setCurrentPage(1); // Reset paginación

      // Recargar consultas para actualizar contador
      loadConsultasGuardadas();
    } catch (error) {
      console.error('Error:', error);
      setResponse('<p style="color:#ef4444">Error ejecutando consulta guardada.</p>');
    } finally {
      setLoading(false);
    }
  };

  // Guardar consulta actual
  const guardarConsulta = async () => {
    if (!saveNombre.trim() || !input.trim()) return;

    setSavingConsulta(true);
    try {
      await chatApi.crearConsultaGuardada({
        nombre: saveNombre,
        pregunta_original: input,
        sql_query: sqlQuery || undefined,
      });
      setShowSaveModal(false);
      setSaveNombre('');
      loadConsultasGuardadas();
    } catch (error) {
      console.error('Error guardando:', error);
    } finally {
      setSavingConsulta(false);
    }
  };

  // Eliminar consulta guardada
  const eliminarConsultaGuardada = async (id: number) => {
    if (!confirm('¿Eliminar esta consulta?')) return;

    try {
      await chatApi.eliminarConsultaGuardada(id);
      loadConsultasGuardadas();
    } catch (error) {
      console.error('Error eliminando:', error);
    }
  };

  // Click en entidad para autocompletar
  const handleEntityClick = (entity: Entity) => {
    const sugerencias: Record<string, string> = {
      'reclamos': '¿Cuántos reclamos pendientes hay por zona?',
      'solicitudes': '¿Cuántas solicitudes de trámites hay por estado?',
      'empleados': '¿Cuál es el ranking de empleados por reclamos resueltos?',
      'categorias': '¿Cuáles son las categorías con más reclamos?',
      'zonas': '¿Cómo se distribuyen los reclamos por zona?',
      'tipos_tramite': '¿Cuáles son los tipos de trámite más usados?',
      'tramites': '¿Cuáles son los trámites más solicitados?',
      'usuarios': '¿Cuántos usuarios hay por rol?',
    };
    setInput(sugerencias[entity.tabla] || `Dame información sobre ${entity.nombre.toLowerCase()}`);
  };

  // Exportar CSV
  const exportarCSV = () => {
    if (!rawData || rawData.length === 0) return;

    const csv = [
      Object.keys(rawData[0]).join(','),
      ...rawData.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consulta_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // Procesar HTML del backend para adaptar colores
  const processHtml = (html: string): string => {
    return html
      .replace(/background:#f8f9fa/g, `background:${theme.card}`)
      .replace(/background: #f8f9fa/g, `background:${theme.card}`)
      .replace(/background:#2563eb/g, `background:${theme.primary}`)
      .replace(/background: #2563eb/g, `background:${theme.primary}`)
      .replace(/background:#dbeafe/g, `background:${theme.primary}20`)
      .replace(/border:1px solid #e2e8f0/g, `border:1px solid ${theme.border}`)
      .replace(/color:#2563eb/g, `color:${theme.primary}`)
      .replace(/<div style="padding:12px 14px">/g, `<div style="padding:12px 14px;color:${theme.text}">`)
      .replace(/<p style="margin:8px 0">/g, `<p style="margin:8px 0;color:${theme.text}">`);
  };

  // Render del filterPanel para StickyPageHeader
  const renderFilterPanel = () => (
    <div className="flex flex-wrap items-center gap-2">
      {/* Pills de KPIs activos */}
      {loadingKpis ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando...
        </div>
      ) : kpis ? (
        <>
          {activeKpis.map(kpiId => {
            const kpiConfig = AVAILABLE_KPIS.find(k => k.id === kpiId);
            if (!kpiConfig) return null;
            const value = getNestedValue(kpis, kpiConfig.path);
            const colorInfo = KPI_COLORS.find(c => c.value === kpiConfig.defaultColor) || KPI_COLORS[0];
            const trend = kpiConfig.hasTrend ? kpis.tendencias.reclamos_cambio_semanal : undefined;

            return (
              <div
                key={kpiId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105 cursor-default"
                style={{
                  backgroundColor: colorInfo.bg,
                  color: colorInfo.value,
                  border: `1px solid ${colorInfo.value}30`
                }}
              >
                <span className="font-bold">{value}</span>
                <span className="opacity-80">{kpiConfig.label}</span>
                {trend !== undefined && trend !== 0 && (
                  <span className="flex items-center text-xs opacity-70">
                    {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(trend)}%
                  </span>
                )}
                <button
                  onClick={() => toggleKpi(kpiId)}
                  className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </>
      ) : null}

      {/* Botón agregar KPI */}
      <div className="relative">
        <button
          onClick={() => setShowKpiSelector(!showKpiSelector)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all hover:scale-105"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.textSecondary,
            border: `1px dashed ${theme.border}`
          }}
        >
          <Plus className="h-3 w-3" />
          KPI
        </button>

        {/* Dropdown selector de KPIs */}
        {showKpiSelector && (
          <div
            className="absolute top-full left-0 mt-2 p-2 rounded-xl shadow-xl z-50 min-w-[200px]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="text-xs font-semibold mb-2 px-2" style={{ color: theme.textSecondary }}>
              Agregar métrica
            </div>
            {AVAILABLE_KPIS.filter(k => !activeKpis.includes(k.id)).map(kpi => {
              const colorInfo = KPI_COLORS.find(c => c.value === kpi.defaultColor) || KPI_COLORS[0];
              return (
                <button
                  key={kpi.id}
                  onClick={() => {
                    toggleKpi(kpi.id);
                    setShowKpiSelector(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors hover:bg-black/5"
                  style={{ color: theme.text }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colorInfo.value }}
                  />
                  {kpi.label}
                </button>
              );
            })}
            {AVAILABLE_KPIS.filter(k => !activeKpis.includes(k.id)).length === 0 && (
              <p className="text-xs px-2 py-1" style={{ color: theme.textSecondary }}>
                Todos los KPIs están activos
              </p>
            )}
          </div>
        )}
      </div>

      {/* Botón refresh */}
      <button
        onClick={loadKPIs}
        className="p-1.5 rounded-full transition-all hover:scale-105"
        style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
        title="Actualizar métricas"
      >
        <RefreshCw className={`h-3 w-3 ${loadingKpis ? 'animate-spin' : ''}`} />
      </button>

      {/* Separador */}
      <div className="h-6 w-px mx-1" style={{ backgroundColor: theme.border }} />

      {/* Toggle modo consulta */}
      <div
        className="flex items-center rounded-lg p-0.5"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        <button
          onClick={() => setQueryMode('text')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${queryMode === 'text' ? 'font-semibold' : ''}`}
          style={{
            backgroundColor: queryMode === 'text' ? theme.card : 'transparent',
            color: queryMode === 'text' ? theme.primary : theme.textSecondary,
            boxShadow: queryMode === 'text' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
          }}
          title="Escribir consulta"
        >
          <MessageSquare className="h-3 w-3" />
          Texto
        </button>
        <button
          onClick={() => setQueryMode('templates')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-all ${queryMode === 'templates' ? 'font-semibold' : ''}`}
          style={{
            backgroundColor: queryMode === 'templates' ? theme.card : 'transparent',
            color: queryMode === 'templates' ? theme.primary : theme.textSecondary,
            boxShadow: queryMode === 'templates' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
          }}
          title="Usar templates"
        >
          <Sparkles className="h-3 w-3" />
          Templates
        </button>
      </div>

      {/* Separador */}
      <div className="h-6 w-px mx-1" style={{ backgroundColor: theme.border }} />

      {/* Botones de formato */}
      {[
        { key: 'cards', icon: <LayoutGrid className="h-3 w-3" />, label: 'Cards' },
        { key: 'table', icon: <Table2 className="h-3 w-3" />, label: 'Tabla' },
        { key: 'list', icon: <List className="h-3 w-3" />, label: 'Lista' },
        { key: 'timeline', icon: <Clock className="h-3 w-3" />, label: 'Timeline' },
        { key: 'ranking', icon: <Trophy className="h-3 w-3" />, label: 'Ranking' },
        { key: 'tabs', icon: <FolderKanban className="h-3 w-3" />, label: 'Tabs' },
        { key: 'dashboard', icon: <Gauge className="h-3 w-3" />, label: 'Dashboard' },
      ].map(fmt => (
        <button
          key={fmt.key}
          onClick={() => ejecutarConsulta(fmt.key)}
          disabled={!input.trim() || loading}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:scale-105 disabled:opacity-50"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.textSecondary,
            border: `1px solid ${theme.border}`
          }}
          title={fmt.label}
        >
          {fmt.icon}
          <span className="hidden sm:inline">{fmt.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader
        icon={<BarChart2 className="h-5 w-5" />}
        title="Panel BI"
        filterPanel={renderFilterPanel()}
      >
        {/* Input con autocompletado inline */}
        <AutocompleteInput
          value={input}
          onChange={setInput}
          schema={dbSchema}
          placeholder="Escribí tu consulta... (ej: cuantos reclamos.estado = 'pendiente')"
          onSubmit={() => ejecutarConsulta()}
          disabled={loading}
        />

        {/* Botón guardar consulta */}
        {response && input.trim() && (
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors flex-shrink-0"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            title="Guardar consulta"
          >
            <Save className="h-4 w-4" />
          </button>
        )}

        {/* Botón consultar */}
        <button
          onClick={() => ejecutarConsulta()}
          disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
            color: '#ffffff',
            boxShadow: `0 4px 14px ${theme.primary}40`,
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}
        </button>
      </StickyPageHeader>

      {/* Main Content - Grid de 3 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda - Consultas Guardadas */}
        <div className="lg:col-span-3">
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {/* Header clickeable para colapsar */}
            <button
              onClick={() => setConsultasCollapsed(!consultasCollapsed)}
              className="w-full p-4 flex items-center justify-between transition-colors hover:bg-black/5"
            >
              <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: theme.text }}>
                <Star className="h-4 w-4" style={{ color: theme.primary }} />
                Mis Consultas
                {consultasGuardadas.length > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                  >
                    {consultasGuardadas.length}
                  </span>
                )}
              </h3>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${consultasCollapsed ? '' : 'rotate-180'}`}
                style={{ color: theme.textSecondary }}
              />
            </button>

            {/* Contenido colapsable */}
            {!consultasCollapsed && (
              <div className="px-4 pb-4">
                {loadingConsultas ? (
                  <div className="text-center py-4" style={{ color: theme.textSecondary }}>
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                ) : consultasGuardadas.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: theme.textSecondary }}>
                    No hay consultas guardadas.
                    <br />
                    Ejecutá una consulta y guardala para acceso rápido.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {consultasGuardadas.map((c) => (
                      <div
                        key={c.id}
                        className="p-2 rounded-lg text-xs cursor-pointer transition-all hover:scale-[1.02] flex items-center justify-between group"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <div
                          className="flex-1"
                          onClick={() => ejecutarConsultaGuardada(c)}
                        >
                          <div className="font-medium flex items-center gap-2" style={{ color: theme.text }}>
                            {getIcon(c.icono)}
                            {c.nombre}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                            {c.veces_ejecutada}x ejecutada
                          </div>
                        </div>
                        <button
                          onClick={() => eliminarConsultaGuardada(c.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-all"
                          style={{ color: '#ef4444' }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Columna Central - Resultados */}
        <div className="lg:col-span-6">
          {loading ? (
            <div
              className="rounded-xl p-8 text-center"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" style={{ color: theme.primary }} />
              <p style={{ color: theme.textSecondary }}>Analizando consulta...</p>
            </div>
          ) : response ? (
            <div ref={responseRef}>
              {/* Respuesta formateada */}
              <div
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <div
                  className="prose max-w-none"
                  style={{ color: theme.text }}
                  dangerouslySetInnerHTML={{ __html: processHtml(response) }}
                />
              </div>

              {/* Panel de datos crudos - solo si mostrarGrilla es true */}
              {mostrarGrilla && rawData && rawData.length > 0 && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <button
                    onClick={() => setShowRawData(!showRawData)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-black/5"
                    style={{ color: theme.text }}
                  >
                    <span className="flex items-center gap-2">
                      <Table2 className="h-4 w-4" />
                      Ver datos ({rawData.length} registros)
                    </span>
                    {showRawData ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showRawData && (
                    <div className="px-4 pb-4">
                      {/* SQL ejecutado */}
                      {sqlQuery && (
                        <div
                          className="mb-3 p-2 rounded text-xs font-mono overflow-x-auto"
                          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                        >
                          <span style={{ color: theme.primary }}>SQL:</span> {sqlQuery.slice(0, 200)}
                          {sqlQuery.length > 200 ? '...' : ''}
                        </div>
                      )}

                      {/* Controles de paginación superior */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            Mostrando {Math.min((currentPage - 1) * rowsPerPage + 1, rawData.length)}-{Math.min(currentPage * rowsPerPage, rawData.length)} de {rawData.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: theme.textSecondary }}>Filas:</span>
                          <select
                            value={rowsPerPage}
                            onChange={(e) => {
                              setRowsPerPage(Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            className="px-2 py-1 rounded text-xs"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              color: theme.text,
                              border: `1px solid ${theme.border}`
                            }}
                          >
                            {ROWS_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Tabla de datos */}
                      <div className="overflow-auto max-h-96 rounded" style={{ border: `1px solid ${theme.border}` }}>
                        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                          <thead className="sticky top-0">
                            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
                              {Object.keys(rawData[0]).map((col) => (
                                <th
                                  key={col}
                                  className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                                  style={{ borderBottom: `1px solid ${theme.border}`, color: theme.text }}
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rawData
                              .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                              .map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                {Object.values(row).map((val: any, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className="px-3 py-2 whitespace-nowrap"
                                    style={{ color: theme.text }}
                                  >
                                    {val === null ? (
                                      <span style={{ color: theme.textSecondary }}>null</span>
                                    ) : (
                                      String(val)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Controles de paginación inferior */}
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded disabled:opacity-30 transition-colors hover:bg-black/5"
                            style={{ color: theme.text }}
                            title="Primera página"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            <ChevronLeft className="h-4 w-4 -ml-3" />
                          </button>
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded disabled:opacity-30 transition-colors hover:bg-black/5"
                            style={{ color: theme.text }}
                            title="Anterior"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="px-3 text-sm" style={{ color: theme.text }}>
                            Página {currentPage} de {Math.ceil(rawData.length / rowsPerPage)}
                          </span>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(rawData.length / rowsPerPage), p + 1))}
                            disabled={currentPage >= Math.ceil(rawData.length / rowsPerPage)}
                            className="p-1.5 rounded disabled:opacity-30 transition-colors hover:bg-black/5"
                            style={{ color: theme.text }}
                            title="Siguiente"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setCurrentPage(Math.ceil(rawData.length / rowsPerPage))}
                            disabled={currentPage >= Math.ceil(rawData.length / rowsPerPage)}
                            className="p-1.5 rounded disabled:opacity-30 transition-colors hover:bg-black/5"
                            style={{ color: theme.text }}
                            title="Última página"
                          >
                            <ChevronRight className="h-4 w-4" />
                            <ChevronRight className="h-4 w-4 -ml-3" />
                          </button>
                        </div>

                        {/* Botón exportar */}
                        <button
                          onClick={exportarCSV}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg"
                          style={{ backgroundColor: theme.primary, color: theme.primaryText }}
                        >
                          <Download className="h-3 w-3" />
                          Exportar CSV
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl p-8 text-center"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <Database className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
              <p className="font-medium" style={{ color: theme.text }}>Panel de Consultas BI</p>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                Escribí una pregunta en lenguaje natural y la IA generará la consulta SQL.
              </p>
              <p className="text-xs mt-3" style={{ color: theme.textSecondary }}>
                Probá: "¿Cuáles son los reclamos más atrasados?" o "Ranking de empleados"
              </p>
            </div>
          )}
        </div>

        {/* Columna Derecha - Templates o Entidades según el modo */}
        <div className="lg:col-span-3">
          {queryMode === 'templates' ? (
            /* Modo Templates */
            <QueryTemplates
              onExecute={ejecutarDesdeTemplate}
              loading={loading}
            />
          ) : (
            /* Modo Texto - Panel de Entidades */
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              {/* Header clickeable para colapsar */}
              <button
                onClick={() => setEntidadesCollapsed(!entidadesCollapsed)}
                className="w-full p-4 flex items-center justify-between transition-colors hover:bg-black/5"
              >
                <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: theme.text }}>
                  <Database className="h-4 w-4" style={{ color: theme.primary }} />
                  Entidades
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                  >
                    {entities.length}
                  </span>
                </h3>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${entidadesCollapsed ? '' : 'rotate-180'}`}
                  style={{ color: theme.textSecondary }}
                />
              </button>

            {/* Contenido colapsable */}
            {!entidadesCollapsed && (
              <div className="px-4 pb-4">
                {/* Input de búsqueda/filtro */}
                <div className="mb-3">
                  <input
                    type="text"
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value)}
                    placeholder="Buscar entidad o campo..."
                    className="w-full px-3 py-1.5 rounded-lg text-xs"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>

                {loadingEntities ? (
                  <div className="text-center py-4" style={{ color: theme.textSecondary }}>
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {entities
                    .filter(entity => {
                      if (!entityFilter.trim()) return true;
                      const filter = entityFilter.toLowerCase();
                      // Buscar en nombre, tabla o campos
                      return (
                        entity.nombre.toLowerCase().includes(filter) ||
                        entity.tabla.toLowerCase().includes(filter) ||
                        entity.campos.some(c => c.name.toLowerCase().includes(filter))
                      );
                    })
                    .map((entity) => {
                    const isExpanded = expandedEntity === entity.tabla;
                    // Filtrar campos si hay filtro activo
                    const filteredCampos = entityFilter.trim()
                      ? entity.campos.filter(c =>
                          c.name.toLowerCase().includes(entityFilter.toLowerCase()) ||
                          entity.nombre.toLowerCase().includes(entityFilter.toLowerCase()) ||
                          entity.tabla.toLowerCase().includes(entityFilter.toLowerCase())
                        )
                      : entity.campos;

                    return (
                      <div
                        key={entity.tabla}
                        className="rounded-lg transition-all"
                        style={{
                          backgroundColor: theme.backgroundSecondary,
                          border: `1px solid ${isExpanded ? theme.primary : theme.border}`,
                        }}
                      >
                        {/* Header clickeable */}
                        <button
                          onClick={() => setExpandedEntity(isExpanded ? null : entity.tabla)}
                          className="w-full p-2 text-left transition-all hover:bg-black/5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: theme.primary }}>{getIcon(entity.icono)}</span>
                              <span className="font-medium text-xs" style={{ color: theme.text }}>
                                {entity.nombre}
                              </span>
                            </div>
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              style={{ color: theme.textSecondary }}
                            />
                          </div>
                          {/* Preview de campos cuando está colapsado */}
                          {!isExpanded && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(entityFilter.trim() ? filteredCampos : entity.campos).slice(0, 3).map((campo) => (
                                <span
                                  key={campo.name}
                                  className="px-1 py-0.5 rounded text-[10px]"
                                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                                >
                                  {campo.name}
                                </span>
                              ))}
                              {(entityFilter.trim() ? filteredCampos : entity.campos).length > 3 && (
                                <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                                  +{(entityFilter.trim() ? filteredCampos : entity.campos).length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </button>

                        {/* Campos expandidos */}
                        {isExpanded && (
                          <div className="px-2 pb-2 border-t" style={{ borderColor: theme.border }}>
                            <div className="flex flex-wrap gap-1 pt-1.5">
                              {(entityFilter.trim() ? filteredCampos : entity.campos).map((campo) => (
                                <button
                                  key={campo.name}
                                  onClick={() => {
                                    setInput(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + `${entity.tabla}.${campo.name} `);
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] transition-all hover:scale-105 cursor-pointer"
                                  style={{
                                    backgroundColor: campo.fk ? `${theme.primary}25` : `${theme.primary}10`,
                                    color: theme.primary,
                                    border: campo.fk ? `1px solid ${theme.primary}50` : 'none'
                                  }}
                                  title={`${campo.type}${campo.fk ? ` → ${campo.fk}` : ''}`}
                                >
                                  {campo.name}
                                  {campo.fk && <span className="ml-0.5 opacity-60">→</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {entities.filter(entity => {
                    if (!entityFilter.trim()) return true;
                    const filter = entityFilter.toLowerCase();
                    return (
                      entity.nombre.toLowerCase().includes(filter) ||
                      entity.tabla.toLowerCase().includes(filter) ||
                      entity.campos.some(c => c.name.toLowerCase().includes(filter))
                    );
                  }).length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: theme.textSecondary }}>
                      No se encontraron entidades con "{entityFilter}"
                    </p>
                  )}
                </div>
                )}
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Guardar Consulta */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className="rounded-xl p-6 w-full max-w-md"
            style={{ backgroundColor: theme.card }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
              Guardar Consulta
            </h3>
            <input
              type="text"
              value={saveNombre}
              onChange={(e) => setSaveNombre(e.target.value)}
              placeholder="Nombre de la consulta"
              className="w-full px-4 py-2 rounded-lg mb-4"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
            <p className="text-xs mb-4" style={{ color: theme.textSecondary }}>
              Consulta: "{input.slice(0, 50)}..."
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarConsulta}
                disabled={!saveNombre.trim() || savingConsulta}
                className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: theme.primary, color: theme.primaryText }}
              >
                {savingConsulta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
