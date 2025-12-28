import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  FileCheck,
  Eye,
  User,
  Phone,
  Mail,
  MapPin,
  Send,
  Loader2,
  Store,
  Car,
  HardHat,
  TreeDeciduous,
  Users,
  Trash2,
  CreditCard,
  Hash,
  BadgePercent,
  Megaphone,
  Dog,
  CalendarDays,
  Map,
  AlertTriangle,
  Sparkles,
  UserPlus,
  History,
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutGrid,
  List,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, empleadosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Sheet } from '../components/ui/Sheet';
import { TramiteWizard } from '../components/TramiteWizard';
import type { Tramite, EstadoTramite, ServicioTramite, Empleado, TipoTramite } from '../types';
import React from 'react';

// Configuración de estados
const estadoConfig: Record<EstadoTramite, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  iniciado: { icon: Clock, color: '#6366f1', label: 'Iniciado', bg: '#6366f115' },
  en_revision: { icon: FileCheck, color: '#3b82f6', label: 'En Revisión', bg: '#3b82f615' },
  requiere_documentacion: { icon: AlertCircle, color: '#f59e0b', label: 'Requiere Doc.', bg: '#f59e0b15' },
  en_proceso: { icon: RefreshCw, color: '#8b5cf6', label: 'En Proceso', bg: '#8b5cf615' },
  aprobado: { icon: CheckCircle2, color: '#10b981', label: 'Aprobado', bg: '#10b98115' },
  rechazado: { icon: XCircle, color: '#ef4444', label: 'Rechazado', bg: '#ef444415' },
  finalizado: { icon: CheckCircle2, color: '#059669', label: 'Finalizado', bg: '#05966915' },
};

const estadoTransiciones: Record<EstadoTramite, EstadoTramite[]> = {
  iniciado: ['en_revision', 'requiere_documentacion', 'rechazado'],
  en_revision: ['en_proceso', 'requiere_documentacion', 'aprobado', 'rechazado'],
  requiere_documentacion: ['en_revision', 'rechazado'],
  en_proceso: ['aprobado', 'rechazado'],
  aprobado: ['finalizado'],
  rechazado: [],
  finalizado: [],
};

const servicioIcons: Record<string, React.ReactNode> = {
  'Store': <Store className="h-5 w-5" />,
  'FileCheck': <FileCheck className="h-5 w-5" />,
  'HardHat': <HardHat className="h-5 w-5" />,
  'Car': <Car className="h-5 w-5" />,
  'Map': <Map className="h-5 w-5" />,
  'Dog': <Dog className="h-5 w-5" />,
  'Megaphone': <Megaphone className="h-5 w-5" />,
  'TreeDeciduous': <TreeDeciduous className="h-5 w-5" />,
  'Users': <Users className="h-5 w-5" />,
  'Trash2': <Trash2 className="h-5 w-5" />,
  'CalendarDays': <CalendarDays className="h-5 w-5" />,
  'Hash': <Hash className="h-5 w-5" />,
  'BadgePercent': <BadgePercent className="h-5 w-5" />,
  'AlertTriangle': <AlertTriangle className="h-5 w-5" />,
  'CreditCard': <CreditCard className="h-5 w-5" />,
  'default': <FileText className="h-5 w-5" />,
};

interface HistorialItem {
  id: number;
  tramite_id: number;
  usuario_id: number | null;
  estado_anterior: EstadoTramite | null;
  estado_nuevo: EstadoTramite | null;
  accion: string;
  comentario: string | null;
  created_at: string;
}

interface SugerenciaEmpleado {
  sugerencia: {
    id: number;
    nombre: string;
    especialidad: string;
    carga_actual: number;
    capacidad_maxima: number;
  } | null;
  mensaje: string | null;
  empleados: Array<{
    id: number;
    nombre: string;
    especialidad: string;
    carga_actual: number;
    capacidad_maxima: number;
  }>;
}

type ViewMode = 'cards' | 'tabla';

export default function GestionTramites() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [tipos, setTipos] = useState<TipoTramite[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('tabla');

  // Filtros visuales estilo Reclamos
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [conteosTipos, setConteosTipos] = useState<Array<{ id: number; nombre: string; icono: string; color: string; cantidad: number }>>([]);
  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});

  // Autocompletado de búsqueda
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    tramites: Tramite[];
    empleados: Empleado[];
    solicitantes: { nombre: string; apellido: string; dni?: string }[];
  }>({ tramites: [], empleados: [], solicitantes: [] });
  const searchRef = React.useRef<HTMLDivElement>(null);

  // Sheet para ver/editar trámite
  const [selectedTramite, setSelectedTramite] = useState<Tramite | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulario de actualización
  const [nuevoEstado, setNuevoEstado] = useState<EstadoTramite | ''>('');
  const [respuesta, setRespuesta] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Asignación de empleado
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<number | ''>('');
  const [sugerenciaIA, setSugerenciaIA] = useState<SugerenciaEmpleado | null>(null);
  const [loadingSugerencia, setLoadingSugerencia] = useState(false);
  const [asignando, setAsignando] = useState(false);

  // Historial
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);

  // Resumen
  const [resumen, setResumen] = useState<{ total: number; hoy: number; por_estado: Record<string, number> } | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);

  // Click fuera para cerrar autocompletado
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Buscar en múltiples fuentes
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults({ tramites: [], empleados: [], solicitantes: [] });
      setShowSearchResults(false);
      return;
    }

    const term = searchTerm.toLowerCase();

    // Buscar trámites
    const tramitesMatch = tramites.filter(t =>
      t.numero_tramite.toLowerCase().includes(term) ||
      t.asunto.toLowerCase().includes(term)
    ).slice(0, 5);

    // Buscar empleados
    const empleadosMatch = empleados.filter(e =>
      `${e.nombre} ${e.apellido}`.toLowerCase().includes(term) ||
      e.especialidad?.toLowerCase().includes(term)
    ).slice(0, 5);

    // Buscar solicitantes (nombres únicos de los trámites)
    const solicitantesMap: Record<string, { nombre: string; apellido: string; dni?: string }> = {};
    tramites.forEach(t => {
      if (t.nombre_solicitante || t.apellido_solicitante) {
        const fullName = `${t.nombre_solicitante || ''} ${t.apellido_solicitante || ''}`.toLowerCase();
        const dni = t.dni_solicitante || '';
        if (fullName.includes(term) || dni.includes(term)) {
          const key = `${t.nombre_solicitante}-${t.apellido_solicitante}-${dni}`;
          if (!solicitantesMap[key]) {
            solicitantesMap[key] = {
              nombre: t.nombre_solicitante || '',
              apellido: t.apellido_solicitante || '',
              dni: t.dni_solicitante
            };
          }
        }
      }
    });
    const solicitantesMatch = Object.values(solicitantesMap).slice(0, 5);

    setSearchResults({
      tramites: tramitesMatch,
      empleados: empleadosMatch,
      solicitantes: solicitantesMatch
    });

    const hasResults = tramitesMatch.length > 0 || empleadosMatch.length > 0 || solicitantesMatch.length > 0;
    setShowSearchResults(hasResults);
  }, [searchTerm, tramites, empleados]);

  useEffect(() => {
    loadData();
  }, []);

  // Recargar trámites cuando cambien los filtros
  useEffect(() => {
    if (!loading) {
      loadTramites(filtroTipo, filtroEstado);
    }
  }, [filtroTipo, filtroEstado]);

  // Abrir trámite desde URL
  useEffect(() => {
    const tramiteId = searchParams.get('id');
    if (tramiteId && tramites.length > 0) {
      const tramite = tramites.find(t => t.id === Number(tramiteId));
      if (tramite) {
        openTramite(tramite);
      }
    }
  }, [searchParams, tramites]);

  const loadData = async () => {
    try {
      const [serviciosRes, tiposRes, empleadosRes, resumenRes] = await Promise.all([
        tramitesApi.getServicios(),
        tramitesApi.getTipos().catch(() => ({ data: [] })),
        empleadosApi.getAll().catch(() => ({ data: [] })),
        tramitesApi.getResumen().catch(() => ({ data: null })),
      ]);
      setServicios(serviciosRes.data);
      setTipos(tiposRes.data);
      setEmpleados(empleadosRes.data);
      setResumen(resumenRes.data);

      // Cargar conteos para filtros visuales
      loadConteos();
      // Cargar trámites con filtros actuales
      await loadTramites();
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  // Cargar trámites con filtros
  const loadTramites = async (tipo?: number | null, estado?: string) => {
    try {
      const params: Record<string, unknown> = {};
      // Usar parámetros explícitos o valores actuales del state
      const tipoFiltro = tipo !== undefined ? tipo : filtroTipo;
      const estadoFiltro = estado !== undefined ? estado : filtroEstado;

      if (tipoFiltro) params.tipo_tramite_id = tipoFiltro;
      // El backend espera el estado en mayúsculas (enum EstadoSolicitud)
      if (estadoFiltro) params.estado = estadoFiltro.toUpperCase();

      const res = await tramitesApi.getGestionTodos(params);
      setTramites(res.data);
    } catch (error) {
      console.error('Error cargando trámites:', error);
    }
  };

  const loadConteos = async () => {
    try {
      const [tiposRes, estadosRes] = await Promise.all([
        tramitesApi.getConteoTipos().catch(() => ({ data: [] })),
        tramitesApi.getConteoEstados().catch(() => ({ data: {} })),
      ]);
      setConteosTipos(tiposRes.data);
      setConteosEstados(estadosRes.data);
    } catch (error) {
      console.error('Error cargando conteos:', error);
    }
  };

  const openTramite = async (tramite: Tramite) => {
    setSelectedTramite(tramite);
    setNuevoEstado('');
    setRespuesta(tramite.respuesta || '');
    setObservaciones(tramite.observaciones || '');
    setEmpleadoSeleccionado(tramite.empleado_id || '');
    setSugerenciaIA(null);
    setHistorial([]);
    setShowHistorial(false);
    setSheetOpen(true);
    setSearchParams({ id: String(tramite.id) });
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedTramite(null);
    searchParams.delete('id');
    setSearchParams(searchParams);
  };

  const loadHistorial = async () => {
    if (!selectedTramite) return;
    setLoadingHistorial(true);
    try {
      const res = await tramitesApi.getHistorial(selectedTramite.id);
      setHistorial(res.data);
      setShowHistorial(true);
    } catch (error) {
      console.error('Error cargando historial:', error);
      toast.error('Error al cargar historial');
    } finally {
      setLoadingHistorial(false);
    }
  };

  const handleSugerirEmpleado = async () => {
    if (!selectedTramite) return;
    setLoadingSugerencia(true);
    try {
      const res = await tramitesApi.sugerirEmpleado(selectedTramite.id);
      setSugerenciaIA(res.data);
      if (res.data.sugerencia) {
        setEmpleadoSeleccionado(res.data.sugerencia.id);
        toast.success(`IA sugiere: ${res.data.sugerencia.nombre}`);
      }
    } catch (error) {
      console.error('Error obteniendo sugerencia:', error);
      toast.error('Error al obtener sugerencia de IA');
    } finally {
      setLoadingSugerencia(false);
    }
  };

  const handleAsignarEmpleado = async () => {
    if (!selectedTramite || !empleadoSeleccionado) {
      toast.error('Selecciona un empleado');
      return;
    }
    setAsignando(true);
    try {
      await tramitesApi.asignar(selectedTramite.id, {
        empleado_id: Number(empleadoSeleccionado),
        comentario: sugerenciaIA?.mensaje || undefined,
      });
      toast.success('Empleado asignado correctamente');
      closeSheet();
      loadData();
    } catch (error) {
      console.error('Error asignando empleado:', error);
      toast.error('Error al asignar empleado');
    } finally {
      setAsignando(false);
    }
  };

  const handleUpdateTramite = async () => {
    if (!selectedTramite || !nuevoEstado) {
      toast.error('Selecciona un nuevo estado');
      return;
    }

    setSaving(true);
    try {
      await tramitesApi.update(selectedTramite.id, {
        estado: nuevoEstado,
        respuesta: respuesta || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success('Trámite actualizado');
      closeSheet();
      loadData();
    } catch (error) {
      console.error('Error actualizando trámite:', error);
      toast.error('Error al actualizar trámite');
    } finally {
      setSaving(false);
    }
  };

  // Filtro local solo para búsqueda de texto (tipo y estado se filtran en backend)
  const filteredTramites = tramites.filter(t => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return t.numero_tramite.toLowerCase().includes(term) ||
      t.asunto.toLowerCase().includes(term) ||
      t.nombre_solicitante?.toLowerCase().includes(term) ||
      t.apellido_solicitante?.toLowerCase().includes(term) ||
      t.email_solicitante?.toLowerCase().includes(term) ||
      t.dni_solicitante?.toLowerCase().includes(term) ||
      t.empleado_asignado?.nombre?.toLowerCase().includes(term) ||
      t.empleado_asignado?.apellido?.toLowerCase().includes(term);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky wrapper */}
      <div
        className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1"
        style={{ backgroundColor: theme.background }}
      >
        {/* Header estilo ABMPage */}
        <div
          className="flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
        {/* Título con icono decorativo - igual que ABMPage */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <FileText className="h-4 w-4" style={{ color: theme.primary }} />
          </div>
          <h1 className="text-lg font-bold tracking-tight hidden sm:block" style={{ color: theme.text }}>
            Trámites
          </h1>
        </div>

        {/* Separador */}
        <div className="h-8 w-px hidden sm:block" style={{ backgroundColor: theme.border }} />

        {/* Buscador - ocupa espacio disponible */}
        <div className="relative flex-1" ref={searchRef}>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: theme.textSecondary }}
          />
          <input
            type="text"
            placeholder="Buscar trámites..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => searchTerm.length >= 2 && setShowSearchResults(true)}
            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />

          {/* Dropdown de resultados de búsqueda */}
          {showSearchResults && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              {searchResults.tramites.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium" style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}>
                    <FileText className="inline h-3 w-3 mr-1" /> Trámites
                  </div>
                  {searchResults.tramites.map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        openTramite(t);
                        setShowSearchResults(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-black/5 flex items-center gap-2"
                    >
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
                        {t.numero_tramite}
                      </span>
                      <span className="text-sm truncate" style={{ color: theme.text }}>{t.asunto}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.empleados.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium" style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}>
                    <User className="inline h-3 w-3 mr-1" /> Empleados
                  </div>
                  {searchResults.empleados.map(e => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSearchTerm(`${e.nombre} ${e.apellido}`);
                        setShowSearchResults(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-black/5 flex items-center gap-2"
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>
                        {e.nombre?.[0]}{e.apellido?.[0]}
                      </div>
                      <span className="text-sm" style={{ color: theme.text }}>{e.nombre} {e.apellido}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.solicitantes.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium" style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}>
                    <Users className="inline h-3 w-3 mr-1" /> Solicitantes
                  </div>
                  {searchResults.solicitantes.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSearchTerm(`${s.nombre} ${s.apellido}`);
                        setShowSearchResults(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-black/5"
                    >
                      <span className="text-sm" style={{ color: theme.text }}>{s.nombre} {s.apellido}</span>
                      {s.dni && <span className="text-xs ml-2" style={{ color: theme.textSecondary }}>DNI: {s.dni}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toggle vista Cards/Tabla */}
        <div
          className="flex rounded-lg p-1 flex-shrink-0"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <button
            onClick={() => setViewMode('cards')}
            className="p-2 rounded-md transition-all"
            style={{
              backgroundColor: viewMode === 'cards' ? theme.card : 'transparent',
              color: viewMode === 'cards' ? theme.primary : theme.textSecondary,
            }}
            title="Vista Cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('tabla')}
            className="p-2 rounded-md transition-all"
            style={{
              backgroundColor: viewMode === 'tabla' ? theme.card : 'transparent',
              color: viewMode === 'tabla' ? theme.primary : theme.textSecondary,
            }}
            title="Vista Tabla"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Botón Nuevo Trámite */}
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all flex-shrink-0"
          style={{ backgroundColor: theme.primary }}
        >
          <Plus className="h-4 w-4" />
          Nuevo Trámite
        </button>
        </div>

        {/* Filtros visuales estilo Reclamos */}
        <div
          className="rounded-xl p-3 mt-2"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
        <div className="flex flex-col gap-2">
          {/* Tipos de trámite */}
          <div className="flex gap-1.5 w-full">
            {/* Botón Todos */}
            <button
              onClick={() => setFiltroTipo(null)}
              className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all h-[68px] ${tipos.length > 0 ? 'flex-1 min-w-0' : 'w-[68px]'}`}
              style={{
                background: filtroTipo === null ? theme.primary : theme.backgroundSecondary,
                border: `1px solid ${filtroTipo === null ? theme.primary : theme.border}`,
              }}
            >
              <FileText className="h-5 w-5" style={{ color: filtroTipo === null ? '#ffffff' : theme.primary }} />
              <span className="text-[9px] font-semibold leading-tight text-center mt-1" style={{ color: filtroTipo === null ? '#ffffff' : theme.text }}>
                Tipos
              </span>
            </button>

            {/* Chips por tipo de trámite */}
            {tipos.filter(t => t.activo).map((tipo) => {
              const isSelected = filtroTipo === tipo.id;
              const tipoColor = tipo.color || theme.primary;
              const conteo = conteosTipos.find(c => c.id === tipo.id)?.cantidad || 0;
              return (
                <button
                  key={tipo.id}
                  onClick={() => setFiltroTipo(isSelected ? null : tipo.id)}
                  title={tipo.nombre}
                  className="flex flex-col items-center justify-center py-1.5 rounded-xl transition-all flex-1 min-w-0 h-[68px]"
                  style={{
                    background: isSelected ? tipoColor : theme.backgroundSecondary,
                    border: `1px solid ${isSelected ? tipoColor : theme.border}`,
                  }}
                >
                  <span className="text-[10px] font-bold leading-none" style={{ color: isSelected ? '#ffffff' : tipoColor }}>
                    {conteo}
                  </span>
                  <span className="[&>svg]:h-5 [&>svg]:w-5 my-1" style={{ color: isSelected ? '#ffffff' : tipoColor }}>
                    {servicioIcons[tipo.icono || ''] || servicioIcons.default}
                  </span>
                  <span className="text-[9px] font-medium leading-none text-center w-full truncate px-1" style={{ color: isSelected ? '#ffffff' : theme.text }}>
                    {tipo.nombre.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Estados */}
          <div className="flex gap-2 w-full">
            {Object.keys(conteosEstados).length === 0 ? (
              // Skeleton mientras cargan los conteos
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={`skeleton-estado-${i}`}
                    className="flex-1 h-[36px] rounded-lg animate-pulse"
                    style={{ background: `${theme.border}40` }}
                  />
                ))}
              </>
            ) : (
              [
                { key: '', label: 'Estados', icon: Eye, color: theme.primary, count: Object.values(conteosEstados).reduce((a, b) => a + b, 0) },
                { key: 'iniciado', label: 'Nuevo', icon: Clock, color: '#6366f1', count: conteosEstados['iniciado'] || 0 },
                { key: 'en_revision', label: 'Revisión', icon: FileCheck, color: '#3b82f6', count: conteosEstados['en_revision'] || 0 },
                { key: 'en_proceso', label: 'Proceso', icon: RefreshCw, color: '#f59e0b', count: conteosEstados['en_proceso'] || 0 },
                { key: 'aprobado', label: 'Aprobado', icon: CheckCircle2, color: '#10b981', count: conteosEstados['aprobado'] || 0 },
                { key: 'finalizado', label: 'Finalizado', icon: CheckCircle2, color: '#059669', count: conteosEstados['finalizado'] || 0 },
                { key: 'rechazado', label: 'Rechazado', icon: XCircle, color: '#ef4444', count: conteosEstados['rechazado'] || 0 },
              ].map((estado) => {
                const Icon = estado.icon;
                const isActive = filtroEstado === estado.key;
                return (
                  <button
                    key={estado.key}
                    onClick={() => setFiltroEstado(filtroEstado === estado.key ? '' : estado.key)}
                    className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg transition-all flex-1 min-w-0 h-[36px]"
                    style={{
                      background: isActive ? estado.color : `${estado.color}15`,
                      border: `1px solid ${isActive ? estado.color : `${estado.color}40`}`,
                    }}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" style={{ color: isActive ? '#ffffff' : estado.color }} />
                    <span className="text-[10px] font-medium leading-none truncate hidden sm:block" style={{ color: isActive ? '#ffffff' : estado.color }}>
                      {estado.label}
                    </span>
                    <span
                      className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${estado.color}30`,
                        color: isActive ? '#ffffff' : estado.color,
                      }}
                    >
                      {estado.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Vista Cards */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
          {filteredTramites.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
              <p style={{ color: theme.textSecondary }}>No hay trámites</p>
            </div>
          ) : (
            filteredTramites.map((t) => {
              const config = estadoConfig[t.estado] || estadoConfig.iniciado;
              const IconEstado = config.icon;
              // tipo_tramite ahora viene en t.tramite.tipo_tramite
              const tipoTramite = t.tramite?.tipo_tramite;
              const tipoColor = tipoTramite?.color || theme.primary;
              return (
                <div
                  key={t.id}
                  onClick={() => openTramite(t)}
                  className="group relative rounded-2xl cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <div className="relative z-10 p-5">
                    {/* Header con gradiente */}
                    <div
                      className="flex items-center justify-between -mx-5 -mt-5 mb-4 px-4 py-3 rounded-t-xl"
                      style={{
                        background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}80 100%)`,
                        borderBottom: `1px solid ${config.color}`
                      }}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                        >
                          <FileText className="h-4 w-4" style={{ color: '#ffffff' }} />
                        </div>
                        <span className="font-mono text-sm font-bold" style={{ color: '#ffffff' }}>
                          {t.numero_tramite}
                        </span>
                      </div>
                      <span
                        className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm flex-shrink-0 ml-2 flex items-center gap-1.5"
                        style={{
                          backgroundColor: theme.card,
                          color: config.color,
                        }}
                      >
                        <IconEstado className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>

                    {/* Badges de tipo y trámite */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {/* Tipo (nivel 1) */}
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{
                          backgroundColor: `${tipoColor}15`,
                          border: `1px solid ${tipoColor}40`,
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: tipoColor }}
                        >
                          <span style={{ color: '#ffffff' }} className="scale-75">
                            {servicioIcons[tipoTramite?.icono || ''] || servicioIcons.default}
                          </span>
                        </div>
                        <span className="text-xs font-semibold" style={{ color: tipoColor }}>
                          {tipoTramite?.nombre || 'Sin tipo'}
                        </span>
                      </div>
                      {/* Trámite (nivel 2) */}
                      {t.tramite?.nombre && (
                        <>
                          <span className="text-sm font-medium" style={{ color: theme.textSecondary }}>&gt;</span>
                          <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                            style={{
                              backgroundColor: `${theme.primary}15`,
                              border: `1px solid ${theme.primary}40`,
                            }}
                          >
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: theme.primary }}
                            >
                              <FileText className="h-3 w-3" style={{ color: '#ffffff' }} />
                            </div>
                            <span className="text-xs font-semibold" style={{ color: theme.primary }}>
                              {t.tramite.nombre}
                            </span>
                          </div>
                        </>
                      )}
                      <span className="text-xs" style={{ color: theme.textSecondary }}>#{t.id}</span>
                    </div>

                    {/* Asunto */}
                    <p className="font-medium line-clamp-2 text-sm mb-2" style={{ color: theme.text }}>
                      {t.asunto}
                    </p>

                    {/* Solicitante */}
                    <div className="flex items-center text-sm" style={{ color: theme.textSecondary }}>
                      <User className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                      <span className="line-clamp-1">
                        {t.nombre_solicitante} {t.apellido_solicitante}
                      </span>
                    </div>

                    {/* Footer */}
                    <div
                      className="flex items-center justify-between mt-4 pt-4 text-xs"
                      style={{ borderTop: `1px solid ${theme.border}`, color: theme.textSecondary }}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="flex items-center">
                          <CalendarDays className="h-3 w-3 mr-1" />
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                        {!t.empleado_id && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                          >
                            Sin asignar
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {t.empleado_asignado && (
                          <span style={{ color: theme.primary }} className="font-medium">
                            {t.empleado_asignado.nombre}
                          </span>
                        )}
                        <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Vista Tabla */}
      {viewMode === 'tabla' && (
        <div
          className="rounded-xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: theme.backgroundSecondary }}>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    NÚMERO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    TIPO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    TRÁMITE
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    SOLICITANTE
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    ASUNTO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    EMPLEADO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    ESTADO
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    FECHA
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: theme.textSecondary }}>
                    ACCIONES
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTramites.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
                      <p style={{ color: theme.textSecondary }}>No hay trámites</p>
                    </td>
                  </tr>
                ) : (
                  filteredTramites.map(tramite => {
                    const config = estadoConfig[tramite.estado] || estadoConfig.iniciado;
                    const IconEstado = config.icon;
                    const tipoTramiteTabla = tramite.tramite?.tipo_tramite;
                    const tipoColorTabla = tipoTramiteTabla?.color || theme.primary;
                    return (
                      <tr
                        key={tramite.id}
                        className="hover:bg-black/5 cursor-pointer transition-colors"
                        onClick={() => openTramite(tramite)}
                        style={{ borderTop: `1px solid ${theme.border}` }}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-medium" style={{ color: theme.primary }}>
                            {tramite.numero_tramite}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded flex items-center justify-center"
                              style={{ backgroundColor: `${tipoColorTabla}20` }}
                            >
                              <span style={{ color: tipoColorTabla }}>
                                {servicioIcons[tipoTramiteTabla?.icono || ''] || servicioIcons.default}
                              </span>
                            </div>
                            <span className="text-sm" style={{ color: theme.text }}>
                              {tipoTramiteTabla?.nombre || 'Sin tipo'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" style={{ color: theme.text }}>
                            {tramite.tramite?.nombre || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>
                              {tramite.nombre_solicitante} {tramite.apellido_solicitante}
                            </p>
                            {tramite.dni_solicitante && (
                              <p className="text-xs" style={{ color: theme.textSecondary }}>
                                DNI: {tramite.dni_solicitante}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-sm truncate" style={{ color: theme.text }}>
                            {tramite.asunto}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {tramite.empleado_asignado ? (
                            <span className="text-sm" style={{ color: theme.text }}>
                              {tramite.empleado_asignado.nombre} {tramite.empleado_asignado.apellido}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                              Sin asignar
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: config.bg, color: config.color }}
                          >
                            <IconEstado className="h-3 w-3" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" style={{ color: theme.textSecondary }}>
                            {new Date(tramite.created_at).toLocaleDateString('es-AR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            className="p-2 rounded-lg hover:bg-black/5 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTramite(tramite);
                            }}
                          >
                            <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sheet de detalle */}
      <Sheet open={sheetOpen} onClose={closeSheet} title="Detalle del Trámite">
        {selectedTramite && (
          <div className="space-y-6">
            {/* Número y estado */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-lg font-bold px-3 py-1 rounded"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.primary }}
                >
                  {selectedTramite.numero_tramite}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedTramite.numero_tramite);
                    toast.success('Número copiado');
                  }}
                  className="p-1.5 rounded hover:bg-black/5"
                >
                  <Copy className="h-4 w-4" style={{ color: theme.textSecondary }} />
                </button>
              </div>
              {(() => {
                const cfg = estadoConfig[selectedTramite.estado] || estadoConfig.iniciado;
                return (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                  >
                    {React.createElement(cfg.icon, { className: 'h-4 w-4' })}
                    {cfg.label}
                  </span>
                );
              })()}
            </div>

            {/* Tipo de trámite */}
            {(() => {
              const tipoDetalle = selectedTramite.tramite?.tipo_tramite;
              const colorDetalle = tipoDetalle?.color || theme.primary;
              return (
                <div
                  className="p-4 rounded-xl"
                  style={{
                    backgroundColor: `${colorDetalle}10`,
                    border: `1px solid ${colorDetalle}30`
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${colorDetalle}20` }}
                    >
                      <span style={{ color: colorDetalle }}>
                        {servicioIcons[tipoDetalle?.icono || ''] || servicioIcons.default}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.text }}>
                        {tipoDetalle?.nombre || selectedTramite.tramite?.nombre || 'Sin tipo'}
                      </p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        Tipo de trámite
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Asunto y descripción */}
            <div>
              <h3 className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Asunto
              </h3>
              <p className="font-medium" style={{ color: theme.text }}>
                {selectedTramite.asunto}
              </p>
              {selectedTramite.descripcion && (
                <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>
                  {selectedTramite.descripcion}
                </p>
              )}
            </div>

            {/* Datos del solicitante */}
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                Datos del Solicitante
              </h3>
              <div className="space-y-2">
                {(selectedTramite.nombre_solicitante || selectedTramite.apellido_solicitante) && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.nombre_solicitante} {selectedTramite.apellido_solicitante}
                    </span>
                  </div>
                )}
                {selectedTramite.dni_solicitante && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      DNI: {selectedTramite.dni_solicitante}
                    </span>
                  </div>
                )}
                {selectedTramite.email_solicitante && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <a
                      href={`mailto:${selectedTramite.email_solicitante}`}
                      className="text-sm hover:underline"
                      style={{ color: theme.primary }}
                    >
                      {selectedTramite.email_solicitante}
                    </a>
                  </div>
                )}
                {selectedTramite.telefono_solicitante && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <a
                      href={`tel:${selectedTramite.telefono_solicitante}`}
                      className="text-sm hover:underline"
                      style={{ color: theme.primary }}
                    >
                      {selectedTramite.telefono_solicitante}
                    </a>
                  </div>
                )}
                {selectedTramite.direccion_solicitante && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.direccion_solicitante}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Asignación de empleado - Solo si no está en proceso/finalizado/rechazado */}
            {(() => {
              const estadosBloqueados: EstadoTramite[] = ['en_proceso', 'aprobado', 'finalizado', 'rechazado'];
              const tramiteCerrado = estadosBloqueados.includes(selectedTramite.estado);

              return (
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium" style={{ color: theme.text }}>
                      Empleado Asignado
                    </h3>
                    {!tramiteCerrado && (
                      <button
                        onClick={handleSugerirEmpleado}
                        disabled={loadingSugerencia}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: `linear-gradient(135deg, #8b5cf6, #7c3aed)`,
                          color: '#ffffff',
                        }}
                      >
                        {loadingSugerencia ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Sugerir con IA
                      </button>
                    )}
                  </div>

                  {/* Empleado actual */}
                  {selectedTramite.empleado_asignado && (
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                      >
                        {selectedTramite.empleado_asignado.nombre?.[0]}{selectedTramite.empleado_asignado.apellido?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: theme.text }}>
                          {selectedTramite.empleado_asignado.nombre} {selectedTramite.empleado_asignado.apellido}
                        </p>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>
                          {tramiteCerrado ? 'Responsable del trámite' : 'Actualmente asignado'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Controles de asignación - Solo si el trámite no está cerrado */}
                  {tramiteCerrado ? (
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: `${theme.border}30` }}
                    >
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        No se puede modificar la asignación de un trámite {
                          selectedTramite.estado === 'en_proceso' ? 'en proceso' :
                          selectedTramite.estado === 'aprobado' ? 'aprobado' :
                          selectedTramite.estado === 'finalizado' ? 'finalizado' : 'rechazado'
                        }
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Sugerencia de IA */}
                      {sugerenciaIA && sugerenciaIA.sugerencia && (
                        <div
                          className="mb-3 p-3 rounded-lg"
                          style={{ backgroundColor: '#8b5cf620', border: '1px solid #8b5cf640' }}
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-4 w-4 mt-0.5" style={{ color: '#8b5cf6' }} />
                            <div>
                              <p className="text-sm font-medium" style={{ color: theme.text }}>
                                {sugerenciaIA.sugerencia.nombre}
                              </p>
                              <p className="text-xs" style={{ color: theme.textSecondary }}>
                                {sugerenciaIA.mensaje}
                              </p>
                              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                                Carga: {sugerenciaIA.sugerencia.carga_actual}/{sugerenciaIA.sugerencia.capacidad_maxima} trámites
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <select
                          value={empleadoSeleccionado}
                          onChange={(e) => setEmpleadoSeleccionado(e.target.value ? Number(e.target.value) : '')}
                          className="flex-1 px-3 py-2 rounded-lg text-sm"
                          style={{
                            backgroundColor: theme.card,
                            border: `1px solid ${theme.border}`,
                            color: theme.text,
                          }}
                        >
                          <option value="">Seleccionar empleado...</option>
                          {empleados.map(e => (
                            <option key={e.id} value={e.id}>
                              {e.nombre} {e.apellido} {e.especialidad ? `(${e.especialidad})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleAsignarEmpleado}
                          disabled={!empleadoSeleccionado || asignando}
                          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                          style={{
                            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                            color: '#ffffff',
                          }}
                        >
                          {asignando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                          Asignar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Fechas */}
            <div className="flex gap-4">
              <div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Creado</p>
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  {new Date(selectedTramite.created_at).toLocaleString('es-AR')}
                </p>
              </div>
              {selectedTramite.fecha_resolucion && (
                <div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Resuelto</p>
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {new Date(selectedTramite.fecha_resolucion).toLocaleString('es-AR')}
                  </p>
                </div>
              )}
            </div>

            {/* Historial */}
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <button
                onClick={() => showHistorial ? setShowHistorial(false) : loadHistorial()}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" style={{ color: theme.textSecondary }} />
                  <span className="text-sm font-medium" style={{ color: theme.text }}>
                    Historial de cambios
                  </span>
                </div>
                {loadingHistorial ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
                ) : showHistorial ? (
                  <ChevronUp className="h-4 w-4" style={{ color: theme.textSecondary }} />
                ) : (
                  <ChevronDown className="h-4 w-4" style={{ color: theme.textSecondary }} />
                )}
              </button>

              {showHistorial && historial.length > 0 && (
                <div className="mt-4 space-y-3">
                  {historial.map(h => (
                    <div
                      key={h.id}
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: theme.card }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: theme.text }}>
                            {h.accion}
                          </p>
                          {h.comentario && (
                            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                              {h.comentario}
                            </p>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          {new Date(h.created_at).toLocaleString('es-AR')}
                        </span>
                      </div>
                      {h.estado_anterior && h.estado_nuevo && (
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: estadoConfig[h.estado_anterior]?.bg,
                              color: estadoConfig[h.estado_anterior]?.color
                            }}
                          >
                            {estadoConfig[h.estado_anterior]?.label}
                          </span>
                          <span style={{ color: theme.textSecondary }}>→</span>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: estadoConfig[h.estado_nuevo]?.bg,
                              color: estadoConfig[h.estado_nuevo]?.color
                            }}
                          >
                            {estadoConfig[h.estado_nuevo]?.label}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showHistorial && historial.length === 0 && (
                <p className="text-sm mt-3 text-center" style={{ color: theme.textSecondary }}>
                  No hay historial
                </p>
              )}
            </div>

            {/* Actualizar estado */}
            {(estadoTransiciones[selectedTramite.estado]?.length || 0) > 0 && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Actualizar Estado
                </h3>

                <div className="space-y-4">
                  {/* Selector de nuevo estado */}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Nuevo estado
                    </label>
                    <select
                      value={nuevoEstado}
                      onChange={(e) => setNuevoEstado(e.target.value as EstadoTramite)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    >
                      <option value="">Seleccionar estado...</option>
                      {(estadoTransiciones[selectedTramite.estado] || []).map(estado => (
                        <option key={estado} value={estado}>
                          {estadoConfig[estado]?.label || estado}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Respuesta */}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Respuesta al solicitante
                    </label>
                    <textarea
                      value={respuesta}
                      onChange={(e) => setRespuesta(e.target.value)}
                      placeholder="Escribe una respuesta para el solicitante..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    />
                  </div>

                  {/* Observaciones internas */}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: theme.textSecondary }}>
                      Observaciones internas
                    </label>
                    <textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Notas internas (no visibles para el solicitante)..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    />
                  </div>

                  {/* Botón guardar */}
                  <button
                    onClick={handleUpdateTramite}
                    disabled={saving || !nuevoEstado}
                    className="w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                      color: '#ffffff',
                    }}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {saving ? 'Guardando...' : 'Actualizar Trámite'}
                  </button>
                </div>
              </div>
            )}

            {/* Respuesta/observaciones existentes */}
            {(selectedTramite.respuesta || selectedTramite.observaciones) && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                {selectedTramite.respuesta && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                      Respuesta
                    </h4>
                    <p className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.respuesta}
                    </p>
                  </div>
                )}
                {selectedTramite.observaciones && (
                  <div>
                    <h4 className="text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                      Observaciones
                    </h4>
                    <p className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.observaciones}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* Wizard para nuevo trámite */}
      <TramiteWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        servicios={servicios}
        tipos={tipos}
        onSuccess={loadData}
      />
    </div>
  );
}
