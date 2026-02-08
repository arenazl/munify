import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
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
  Hash,
  CalendarDays,
  Sparkles,
  UserPlus,
  History,
  ChevronDown,
  ChevronUp,
  Copy,
  ArrowUpDown,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, empleadosApi } from '../lib/api';
import { renderEmpleado, renderFechasConVencimiento, renderVencimientoCalculado } from '../lib/tableHelpers';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Sheet } from '../components/ui/Sheet';
import { TramiteWizard } from '../components/TramiteWizard';
import { ABMPage, ABMTable, FilterRowSkeleton } from '../components/ui/ABMPage';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import type { Tramite, EstadoTramite, ServicioTramite, Empleado, TipoTramite, EmpleadoDisponibilidad } from '../types';
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

// Helper para normalizar el estado (API devuelve MAYÚSCULAS, frontend usa minúsculas)
const normalizeEstado = (estado: string | undefined | null): EstadoTramite => {
  return (estado?.toLowerCase() || 'iniciado') as EstadoTramite;
};

// Obtener config del estado con normalización automática
const getEstadoConfig = (estado: string | undefined | null) => {
  return estadoConfig[normalizeEstado(estado)] || estadoConfig.iniciado;
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

interface GestionTramitesProps {
  soloMiArea?: boolean;
}

export default function GestionTramites({ soloMiArea = false }: GestionTramitesProps) {
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

  // Filtros visuales estilo Reclamos
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [filtroTramite, setFiltroTramite] = useState<number | null>(null); // Filtro por servicio específico
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filterLoading, setFilterLoading] = useState<string | null>(null); // Track which filter is loading
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'por_vencer'>('reciente');
  const [conteosTipos, setConteosTipos] = useState<Array<{ id: number; nombre: string; icono: string; color: string; cantidad: number }>>([]);
  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});
  const [conteosLoaded, setConteosLoaded] = useState(false);

  // Click dropdown para tramites (header)
  const [hoveredTramiteHeader, setHoveredTramiteHeader] = useState(false);
  const [dropdownFading, setDropdownFading] = useState(false);
  const [loadingTramiteFilter, setLoadingTramiteFilter] = useState<number | null>(null); // ID del servicio que está cargando
  const tramiteDropdownRef = useRef<HTMLDivElement | null>(null);
  const tramiteDropdownMenuRef = useRef<HTMLDivElement | null>(null);


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
  const [empleadosDisponibilidad, setEmpleadosDisponibilidad] = useState<EmpleadoDisponibilidad[]>([]);
  const [loadingEmpleados, setLoadingEmpleados] = useState(false);
  const [showEmpleadosDropdown, setShowEmpleadosDropdown] = useState(false);
  const empleadosDropdownRef = useRef<HTMLDivElement>(null);
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
  const [servicioInicial, setServicioInicial] = useState<any>(null);

  // Infinite scroll state
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const LIMIT = 30;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Recargar trámites cuando cambien los filtros o búsqueda
  useEffect(() => {
    if (!loading) {
      loadTramites(filtroTipo, filtroEstado, searchTerm, filtroTramite);
    }
  }, [filtroTipo, filtroEstado, filtroTramite]);

  // Debounce para búsqueda en servidor
  useEffect(() => {
    if (loading) return;
    const timeoutId = setTimeout(() => {
      loadTramites(filtroTipo, filtroEstado, searchTerm, filtroTramite);
    }, 300); // 300ms debounce
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Abrir trámite desde URL o wizard para crear nuevo
  useEffect(() => {
    const tramiteId = searchParams.get('id');
    const tramiteNombre = searchParams.get('tramite');

    if (tramiteId && tramites.length > 0) {
      const tramite = tramites.find(t => t.id === Number(tramiteId));
      if (tramite) {
        openTramite(tramite);
      }
    } else if (tramiteNombre && servicios.length > 0) {
      // Abrir wizard con trámite pre-seleccionado (desde chat)
      const nombreLower = decodeURIComponent(tramiteNombre).toLowerCase();
      const servicioEncontrado = servicios.find(s => s.nombre.toLowerCase() === nombreLower);
      if (servicioEncontrado) {
        setServicioInicial(servicioEncontrado);
        setWizardOpen(true);
        setSearchParams({});
      }
    }
  }, [searchParams, tramites, servicios, setSearchParams]);

  const loadData = async (reloadTramites = true) => {
    try {
      const [serviciosRes, tiposRes, empleadosRes, resumenRes] = await Promise.all([
        tramitesApi.getTramitesMunicipio().catch(() => ({ data: [] })), // Trámites habilitados del municipio
        tramitesApi.getTipos().catch(() => ({ data: [] })),
        empleadosApi.getAll().catch(() => ({ data: [] })),
        tramitesApi.getResumen().catch(() => ({ data: null })),
      ]);
      setServicios(serviciosRes.data);
      setTipos(tiposRes.data);
      setEmpleados(empleadosRes.data);
      setResumen(resumenRes.data);

      // Cargar conteos para filtros visuales y trámites en paralelo
      const conteosPromise = loadConteos();
      const tramitesPromise = reloadTramites ? loadTramites(filtroTipo, filtroEstado) : Promise.resolve();
      await Promise.all([conteosPromise, tramitesPromise]);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  // Cargar trámites con filtros (resetea la lista)
  const loadTramites = async (tipo?: number | null, estado?: string, search?: string, tramiteId?: number | null) => {
    try {
      const params: Record<string, unknown> = {
        limit: LIMIT,
        skip: 0,
      };
      // Usar parámetros explícitos o valores actuales del state
      const tipoFiltro = tipo !== undefined ? tipo : filtroTipo;
      const estadoFiltro = estado !== undefined ? estado : filtroEstado;
      const searchFiltro = search !== undefined ? search : searchTerm;
      const tramiteFiltro = tramiteId !== undefined ? tramiteId : filtroTramite;

      if (tipoFiltro) params.tipo_tramite_id = tipoFiltro;
      if (tramiteFiltro) params.tramite_id = tramiteFiltro;
      // El backend espera el estado en mayúsculas (enum EstadoSolicitud)
      if (estadoFiltro) params.estado = estadoFiltro.toUpperCase();
      // Búsqueda en servidor
      if (searchFiltro && searchFiltro.trim()) params.search = searchFiltro.trim();
      // Filtrar por dependencia del usuario si es modo "soloMiArea"
      if (soloMiArea && user?.dependencia?.id) {
        params.municipio_dependencia_id = user.dependencia.id;
      }

      const res = await tramitesApi.getGestionTodos(params);
      setTramites(res.data);
      setSkip(LIMIT);
      setHasMore(res.data.length >= LIMIT);
    } catch (error) {
      console.error('[GestionTramites] Error cargando trámites:', error);
    } finally {
      setFilterLoading(null); // Clear filter loading state
    }
  };

  // Cargar más trámites (infinite scroll)
  const loadMoreTramites = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const params: Record<string, unknown> = {
        limit: LIMIT,
        skip: skip,
      };

      if (filtroTipo) params.tipo_tramite_id = filtroTipo;
      if (filtroTramite) params.tramite_id = filtroTramite;
      if (filtroEstado) params.estado = filtroEstado.toUpperCase();
      if (searchTerm && searchTerm.trim()) params.search = searchTerm.trim();

      const res = await tramitesApi.getGestionTodos(params);

      if (res.data.length > 0) {
        setTramites(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newItems = res.data.filter((t: Tramite) => !existingIds.has(t.id));
          return [...prev, ...newItems];
        });
        setSkip(prev => prev + LIMIT);
        setHasMore(res.data.length >= LIMIT);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error cargando más trámites:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, skip, filtroTipo, filtroTramite, filtroEstado, searchTerm]);

  // IntersectionObserver para infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMoreTramites();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadingMore, loading, loadMoreTramites]);

  // Cerrar dropdown de trámites al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideHeader = tramiteDropdownRef.current?.contains(target);
      const clickedInsideMenu = tramiteDropdownMenuRef.current?.contains(target);

      if (!clickedInsideHeader && !clickedInsideMenu) {
        setHoveredTramiteHeader(false);
      }
    };

    if (hoveredTramiteHeader) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [hoveredTramiteHeader]);

  const loadConteos = async () => {
    try {
      const [tiposRes, estadosRes] = await Promise.all([
        tramitesApi.getConteoTipos().catch(() => ({ data: [] })),
        tramitesApi.getConteoEstados().catch(() => ({ data: {} })),
      ]);
      setConteosTipos(tiposRes.data);
      setConteosEstados(estadosRes.data);
      setConteosLoaded(true);
    } catch (error) {
      console.error('Error cargando conteos:', error);
      setConteosLoaded(true); // Marcar como cargado aunque haya error
    }
  };

  // Cargar empleados administrativos con disponibilidad
  const loadEmpleadosDisponibilidad = async () => {
    setLoadingEmpleados(true);
    try {
      const res = await empleadosApi.getDisponibilidad('administrativo');
      setEmpleadosDisponibilidad(res.data);
    } catch (error) {
      console.error('Error cargando disponibilidad:', error);
    } finally {
      setLoadingEmpleados(false);
    }
  };

  // Cerrar dropdown de empleados al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (empleadosDropdownRef.current && !empleadosDropdownRef.current.contains(event.target as Node)) {
        setShowEmpleadosDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openTramite = async (tramite: Tramite) => {
    setSelectedTramite(tramite);
    setNuevoEstado('');
    setRespuesta(tramite.respuesta || '');
    setObservaciones(tramite.observaciones || '');
    setEmpleadoSeleccionado(tramite.empleado_id || '');
    setSugerenciaIA(null);
    setHistorial([]);
    setShowHistorial(false);
    setShowEmpleadosDropdown(false);
    setSheetOpen(true);
    setSearchParams({ id: String(tramite.id) });
    // Cargar empleados con disponibilidad al abrir
    loadEmpleadosDisponibilidad();
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

  // Función para recargar todo después de una acción
  const recargarDespuesDeAccion = async () => {
    // Recargar trámites con los filtros actuales del DOM (no del closure)
    const tipoActual = filtroTipo;
    const estadoActual = filtroEstado;

    await Promise.all([
      loadTramites(tipoActual, estadoActual),
      loadConteos(),
    ]);
  };

  const handleAsignarEmpleado = async () => {
    if (!selectedTramite || !empleadoSeleccionado) {
      toast.error('Selecciona una dependencia');
      return;
    }
    setAsignando(true);
    try {
      await tramitesApi.asignar(selectedTramite.id, {
        empleado_id: Number(empleadoSeleccionado),
        comentario: sugerenciaIA?.mensaje || undefined,
      });
      toast.success('Dependencia asignada correctamente');
      closeSheet();
      await recargarDespuesDeAccion();
    } catch (error) {
      console.error('Error asignando empleado:', error);
      toast.error('Error al asignar dependencia');
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
        estado: nuevoEstado.toUpperCase(), // Enviar en mayúsculas al backend
        respuesta: respuesta || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success('Trámite actualizado');
      closeSheet();
      await recargarDespuesDeAccion();
    } catch (error) {
      console.error('Error actualizando trámite:', error);
      toast.error('Error al actualizar trámite');
    } finally {
      setSaving(false);
    }
  };

  // Funciones directas para cambio de estado (botones de acción)
  const handleDirectStateChange = async (nuevoEstadoDirecto: EstadoTramite, mensajeExito: string) => {
    if (!selectedTramite) return;
    setSaving(true);
    try {
      await tramitesApi.update(selectedTramite.id, {
        estado: nuevoEstadoDirecto.toUpperCase(),
        respuesta: respuesta || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success(mensajeExito);
      closeSheet();
      await recargarDespuesDeAccion();
    } catch (error) {
      console.error('Error actualizando trámite:', error);
      toast.error('Error al actualizar trámite');
    } finally {
      setSaving(false);
    }
  };

  const handleAceptar = () => handleDirectStateChange('en_revision', 'Trámite aceptado - En revisión');
  const handleProcesar = () => handleDirectStateChange('en_proceso', 'Trámite en proceso');
  const handleAprobar = () => handleDirectStateChange('aprobado', 'Trámite aprobado');
  const handleFinalizar = () => handleDirectStateChange('finalizado', 'Trámite finalizado');
  const handleRechazar = () => handleDirectStateChange('rechazado', 'Trámite rechazado');

  // Renderizar footer con botones de acción
  const renderTramiteFooter = () => {
    if (!selectedTramite) return null;

    const estadoActual = normalizeEstado(selectedTramite.estado);

    // Estados finales - solo info
    if (estadoActual === 'rechazado' || estadoActual === 'finalizado') {
      return (
        <div
          className="flex-1 px-4 py-2.5 rounded-xl font-medium text-center"
          style={{
            backgroundColor: estadoActual === 'finalizado' ? '#05966920' : '#ef444420',
            color: estadoActual === 'finalizado' ? '#059669' : '#ef4444',
            border: `1px solid ${estadoActual === 'finalizado' ? '#05966950' : '#ef444450'}`
          }}
        >
          {estadoActual === 'finalizado' ? '✓ Finalizado' : '✗ Rechazado'}
        </div>
      );
    }

    // Determinar acción principal según estado
    let mainAction: { label: string; loadingLabel: string; handler: () => void; color: string } | null = null;

    switch (estadoActual) {
      case 'iniciado':
        mainAction = { label: 'Aceptar', loadingLabel: 'Aceptando...', handler: handleAceptar, color: '#16a34a' };
        break;
      case 'en_revision':
      case 'requiere_documentacion':
        mainAction = { label: 'Procesar', loadingLabel: 'Procesando...', handler: handleProcesar, color: theme.primary };
        break;
      case 'en_proceso':
        mainAction = { label: 'Aprobar', loadingLabel: 'Aprobando...', handler: handleAprobar, color: '#10b981' };
        break;
      case 'aprobado':
        mainAction = { label: 'Finalizado', loadingLabel: 'Finalizando...', handler: handleFinalizar, color: '#059669' };
        break;
    }

    if (!mainAction) return null;

    return (
      <div className="flex gap-2">
        <button
          onClick={mainAction.handler}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
          style={{
            backgroundColor: mainAction.color,
            color: '#ffffff',
            boxShadow: `0 4px 14px ${mainAction.color}40`
          }}
        >
          {saving ? mainAction.loadingLabel : mainAction.label}
        </button>
        {estadoActual !== 'aprobado' && (
          <button
            onClick={handleRechazar}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: '#ef444415',
              border: '1px solid #ef444450',
              color: '#ef4444'
            }}
          >
            Rechazar
          </button>
        )}
      </div>
    );
  };

  // Función para calcular fecha de vencimiento
  const calcularVencimiento = (t: Tramite) => {
    const tiempoEstimado = t.tramite?.tiempo_estimado_dias || 0;
    if (!tiempoEstimado) return null;
    const fechaCreacion = new Date(t.created_at);
    const fechaVencimiento = new Date(fechaCreacion);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);
    return fechaVencimiento;
  };

  // Agrupar servicios por tipo para el dropdown del header
  const serviciosPorTipo = useMemo(() => {
    const grouped: Record<number, { tipo: TipoTramite; servicios: ServicioTramite[] }> = {};
    servicios.forEach(s => {
      const tipoId = s.tipo_tramite_id;
      if (!tipoId) return;
      if (!grouped[tipoId]) {
        const tipo = tipos.find(t => t.id === tipoId);
        if (tipo) {
          grouped[tipoId] = { tipo, servicios: [] };
        }
      }
      if (grouped[tipoId]) {
        grouped[tipoId].servicios.push(s);
      }
    });
    return Object.values(grouped).sort((a, b) => a.tipo.nombre.localeCompare(b.tipo.nombre));
  }, [servicios, tipos]);

  // Aplicar ordenamiento según botones del header
  const filteredTramites = [...tramites].sort((a, b) => {
    if (ordenamiento === 'por_vencer') {
      // Ordenar por fecha de vencimiento (más próxima primero)
      const tiempoA = a.tramite?.tiempo_estimado_dias || 0;
      const tiempoB = b.tramite?.tiempo_estimado_dias || 0;
      const vencA = tiempoA ? new Date(a.created_at).getTime() + tiempoA * 86400000 : Infinity;
      const vencB = tiempoB ? new Date(b.created_at).getTime() + tiempoB * 86400000 : Infinity;
      return vencA - vencB;
    }
    // Por defecto: más recientes primero
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Render de cards (children de ABMPage)
  const renderCards = () => {
    if (loading) {
      return Array.from({ length: 6 }).map((_, i) => (
        <ABMCardSkeleton key={`skeleton-${i}`} index={i} />
      ));
    }

    return filteredTramites.map((t) => {
      const config = getEstadoConfig(t.estado);
      const IconEstado = config.icon;
      const tipoTramite = t.tramite?.tipo_tramite;
      const tipoColor = tipoTramite?.color || theme.primary;
      return (
        <div
          key={t.id}
          onClick={() => openTramite(t)}
          className="group relative rounded-2xl cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 abm-card-hover"
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
                  <DynamicIcon
                    name={tipoTramite?.icono || 'FileText'}
                    className="h-3 w-3"
                    style={{ color: '#ffffff' }}
                    fallback={<FileText className="h-3 w-3" style={{ color: '#ffffff' }} />}
                  />
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
    });
  };

  // Secondary filters (tipos + estados)
  const renderSecondaryFilters = () => (
    <div className="flex flex-col gap-1.5">
      {/* Tipos de trámite - botón Todos fijo + scroll horizontal */}
      <div className="flex gap-1">
        {/* Botón Todos fijo - outlined */}
        <button
          onClick={() => {
            setFilterLoading('tipo-all');
            setFiltroTipo(null);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
          style={{
            background: 'transparent',
            border: `1.5px solid ${filtroTipo === null ? theme.primary : theme.border}`,
          }}
        >
          <FileText className={`h-3 w-3 ${filterLoading === 'tipo-all' ? 'animate-pulse' : ''}`} style={{ color: filtroTipo === null ? theme.primary : theme.textSecondary }} />
          <span className={`text-[10px] font-medium whitespace-nowrap ${filterLoading === 'tipo-all' ? 'animate-pulse' : ''}`} style={{ color: filtroTipo === null ? theme.primary : theme.textSecondary }}>
            Todos
          </span>
        </button>

        {/* Scroll de tipos */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
          {/* Skeleton mientras cargan los tipos */}
          {loading || tipos.length === 0 ? (
            <FilterRowSkeleton count={6} height={28} widths={[60, 80, 70, 90, 65, 85]} />
          ) : (
            <>
              {/* Chips por tipo de trámite */}
              {tipos.filter(t => t.activo).map((tipo) => {
                const isSelected = filtroTipo === tipo.id;
                const tipoColor = tipo.color || theme.primary;
                const conteo = conteosTipos.find(c => c.id === tipo.id)?.cantidad || 0;
                const isLoadingThis = filterLoading === `tipo-${tipo.id}`;
                return (
                  <button
                    key={tipo.id}
                    onClick={() => {
                      setFilterLoading(`tipo-${tipo.id}`);
                      setFiltroTipo(isSelected ? null : tipo.id);
                    }}
                    title={tipo.nombre}
                    className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
                    style={{
                      background: isSelected ? tipoColor : theme.backgroundSecondary,
                      border: `1px solid ${isSelected ? tipoColor : theme.border}`,
                    }}
                  >
                    <DynamicIcon
                      name={tipo.icono || 'FileText'}
                      className={`h-3 w-3 ${isLoadingThis ? 'animate-pulse' : ''}`}
                      style={{ color: isSelected ? '#ffffff' : tipoColor }}
                      fallback={<FileText className={`h-3 w-3 ${isLoadingThis ? 'animate-pulse' : ''}`} style={{ color: isSelected ? '#ffffff' : tipoColor }} />}
                    />
                    <span className={`text-[10px] font-medium whitespace-nowrap ${isLoadingThis ? 'animate-pulse' : ''}`} style={{ color: isSelected ? '#ffffff' : theme.text }}>
                      {tipo.nombre.split(' ')[0]}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1 rounded-full ${isLoadingThis ? 'animate-pulse' : ''}`}
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : `${tipoColor}30`,
                        color: isSelected ? '#ffffff' : tipoColor,
                      }}
                    >
                      {conteo}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Estados - botón Todos fijo + scroll horizontal */}
      <div className="flex gap-1">
        {/* Botón Todos fijo - outlined */}
        <button
          onClick={() => {
            setFilterLoading('estado-all');
            setFiltroEstado('');
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
          style={{
            background: 'transparent',
            border: `1.5px solid ${filtroEstado === '' ? theme.primary : theme.border}`,
          }}
        >
          <Eye className={`h-3 w-3 ${filterLoading === 'estado-all' ? 'animate-pulse' : ''}`} style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }} />
          <span className={`text-[10px] font-medium whitespace-nowrap ${filterLoading === 'estado-all' ? 'animate-pulse' : ''}`} style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }}>
            Todos
          </span>
          <span className={`text-[9px] font-bold ${filterLoading === 'estado-all' ? 'animate-pulse' : ''}`} style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }}>
            {Object.values(conteosEstados).reduce((a, b) => a + b, 0)}
          </span>
        </button>

        {/* Scroll de estados */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
          {loading && !conteosLoaded ? (
            <FilterRowSkeleton count={6} height={28} widths={[55, 65, 60, 70, 55, 65]} />
          ) : (
            [
              { key: 'iniciado', label: 'Nuevo', icon: Clock, color: '#6366f1', count: conteosEstados['iniciado'] || 0 },
              { key: 'en_revision', label: 'Revisión', icon: FileCheck, color: '#3b82f6', count: conteosEstados['en_revision'] || 0 },
              { key: 'en_proceso', label: 'Proceso', icon: RefreshCw, color: '#f59e0b', count: conteosEstados['en_proceso'] || 0 },
              { key: 'aprobado', label: 'Aprobado', icon: CheckCircle2, color: '#10b981', count: conteosEstados['aprobado'] || 0 },
              { key: 'finalizado', label: 'Final.', icon: CheckCircle2, color: '#059669', count: conteosEstados['finalizado'] || 0 },
              { key: 'rechazado', label: 'Rech.', icon: XCircle, color: '#ef4444', count: conteosEstados['rechazado'] || 0 },
            ].map((estado) => {
              const Icon = estado.icon;
              const isActive = filtroEstado === estado.key;
              const isLoadingThis = filterLoading === `estado-${estado.key}`;
              return (
                <button
                  key={estado.key}
                  onClick={() => {
                    setFilterLoading(`estado-${estado.key}`);
                    setFiltroEstado(filtroEstado === estado.key ? '' : estado.key);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md transition-all h-[28px] flex-shrink-0"
                  style={{
                    background: isActive ? estado.color : `${estado.color}15`,
                    border: `1px solid ${isActive ? estado.color : `${estado.color}40`}`,
                  }}
                >
                  <Icon className={`h-3 w-3 flex-shrink-0 ${isLoadingThis ? 'animate-pulse' : ''}`} style={{ color: isActive ? '#ffffff' : estado.color }} />
                  <span className={`text-[10px] font-medium whitespace-nowrap ${isLoadingThis ? 'animate-pulse' : ''}`} style={{ color: isActive ? '#ffffff' : estado.color }}>
                    {estado.label}
                  </span>
                  <span
                    className={`text-[9px] font-bold ${isLoadingThis ? 'animate-pulse' : ''}`}
                    style={{ color: isActive ? '#ffffff' : estado.color }}
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
  );


  // Table view
  const renderTableView = () => (
    <ABMTable
      key={`table-${ordenamiento}`}
      data={filteredTramites}
      columns={[
        {
          key: 'numero_tramite',
          header: 'ID',
          sortValue: (t) => t.numero_tramite,
          render: (t) => (
            <span className="font-mono text-xs font-medium" style={{ color: theme.primary }}>
              #{t.numero_tramite.slice(-4)}
            </span>
          ),
        },
        {
          key: 'tipo',
          header: 'Tipo',
          sortValue: (t) => t.tramite?.tipo_tramite?.nombre || '',
          render: (t) => {
            const tipoTramite = t.tramite?.tipo_tramite;
            const tipoColor = tipoTramite?.color || theme.primary;
            return (
              <div className="flex items-center gap-1">
                <DynamicIcon
                  name={tipoTramite?.icono || 'FileText'}
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: tipoColor }}
                  fallback={<FileText className="h-3.5 w-3.5" style={{ color: tipoColor }} />}
                />
                <span className="text-xs truncate max-w-[60px]" style={{ color: theme.text }}>
                  {tipoTramite?.nombre || 'Sin tipo'}
                </span>
              </div>
            );
          },
        },
        {
          key: 'tramite',
          sortable: false, // Deshabilitar sorting para esta columna (tiene dropdown custom)
          header: (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <div
                className="flex items-center gap-1 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setHoveredTramiteHeader(!hoveredTramiteHeader);
                }}
                ref={tramiteDropdownRef}
              >
                <span>Trámite</span>
                {serviciosPorTipo.length === 0 ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronDown className={`h-3 w-3 transition-transform ${hoveredTramiteHeader ? 'rotate-180' : ''}`} />
                )}
                {filtroTramite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiltroTramite(null);
                    }}
                    className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
                    title="Quitar filtro"
                  >
                    <XCircle className="h-3 w-3" style={{ color: theme.primary }} />
                  </button>
                )}
              </div>

              {/* Dropdown con todos los servicios agrupados por tipo */}
              {hoveredTramiteHeader && serviciosPorTipo.length > 0 && (
                <div
                  ref={tramiteDropdownMenuRef}
                  className={`fixed z-[9999] min-w-[280px] max-w-[350px] rounded-2xl shadow-xl transition-opacity duration-500 ${dropdownFading ? 'opacity-0' : 'opacity-100'}`}
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                    top: 'auto',
                    marginTop: '4px',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-2 border-b flex items-center justify-between rounded-t-2xl" style={{ borderColor: theme.border, backgroundColor: theme.card }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                      Filtrar por trámite
                    </p>
                    {filtroTramite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiltroTramite(null);
                          setHoveredTramiteHeader(false);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] hover:bg-red-500/20 transition-colors"
                        style={{ color: '#ef4444' }}
                      >
                        <XCircle className="h-3 w-3" />
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto rounded-b-2xl" style={{ backgroundColor: theme.card }}>
                    {serviciosPorTipo.map(({ tipo, servicios: serviciosDelTipo }) => (
                      <div key={tipo.id}>
                        <div
                          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide sticky top-0 z-10 shadow-sm"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            color: tipo.color || theme.textSecondary,
                            borderBottom: `1px solid ${theme.border}`,
                          }}
                        >
                          {tipo.nombre}
                        </div>
                        {serviciosDelTipo.map((servicio) => {
                          const isSelected = filtroTramite === servicio.id;
                          const isLoading = loadingTramiteFilter === servicio.id;
                          return (
                            <button
                              key={servicio.id}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (dropdownFading || loadingTramiteFilter !== null) return;

                                const newValue = isSelected ? null : servicio.id;
                                console.log('[GestionTramites] Seleccionado servicio:', servicio.id, servicio.nombre, 'newValue:', newValue);

                                // Mostrar spinner en el elemento seleccionado
                                setLoadingTramiteFilter(servicio.id);
                                setFiltroTramite(newValue);

                                // Esperar a que carguen los datos
                                await loadTramites(filtroTipo, filtroEstado, searchTerm, newValue);

                                // Datos cargados - hacer fadeout y cerrar
                                setLoadingTramiteFilter(null);
                                setDropdownFading(true);
                                setTimeout(() => {
                                  setHoveredTramiteHeader(false);
                                  setDropdownFading(false);
                                }, 400);
                              }}
                              disabled={dropdownFading || (loadingTramiteFilter !== null && loadingTramiteFilter !== servicio.id)}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 transition-all hover:brightness-95"
                              style={{
                                backgroundColor: isSelected ? `${theme.primary}15` : theme.card,
                                borderBottom: `1px solid ${theme.border}`,
                                opacity: (loadingTramiteFilter !== null && loadingTramiteFilter !== servicio.id) ? 0.5 : 1,
                              }}
                            >
                              {isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" style={{ color: theme.primary }} />
                              ) : (
                                <DynamicIcon
                                  name={servicio.icono || 'FileText'}
                                  className="h-3.5 w-3.5 flex-shrink-0"
                                  style={{ color: isSelected ? theme.primary : tipo.color || theme.text }}
                                  fallback={<FileText className="h-3.5 w-3.5" style={{ color: isSelected ? theme.primary : tipo.color || theme.text }} />}
                                />
                              )}
                              <span
                                className="text-xs truncate"
                                style={{ color: isSelected ? theme.primary : theme.text }}
                              >
                                {servicio.nombre}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
          sortValue: (t) => t.tramite?.nombre || '',
          render: (t) => {
            const tipoColor = t.tramite?.tipo_tramite?.color || theme.primary;
            return (
              <div className="flex items-center gap-1">
                <DynamicIcon
                  name={t.tramite?.icono || 'FileText'}
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: tipoColor }}
                  fallback={<FileText className="h-3.5 w-3.5" style={{ color: tipoColor }} />}
                />
                <span className="text-xs truncate max-w-[80px]" style={{ color: theme.text }}>
                  {t.tramite?.nombre || '—'}
                </span>
              </div>
            );
          },
        },
        {
          key: 'solicitante',
          header: 'Solicitante',
          sortValue: (t) => `${t.nombre_solicitante || ''} ${t.apellido_solicitante || ''}`.trim(),
          render: (t) => (
            <span className="text-xs truncate max-w-[90px] block" style={{ color: theme.text }}>
              {t.nombre_solicitante} {t.apellido_solicitante}
            </span>
          ),
        },
        {
          key: 'asunto',
          header: 'Asunto',
          sortValue: (t) => t.asunto,
          render: (t) => (
            <p className="text-xs truncate max-w-[100px]" style={{ color: theme.text }} title={t.asunto}>
              {t.asunto}
            </p>
          ),
        },
        {
          key: 'empleado',
          header: 'Dependencia',
          sortValue: (t) => t.empleado_asignado ? `${t.empleado_asignado.nombre || ''} ${t.empleado_asignado.apellido || ''}`.trim() : '',
          render: (t) => renderEmpleado(t, theme.text),
        },
        {
          key: 'estado',
          header: 'Estado',
          sortValue: (t) => getEstadoConfig(t.estado).label,
          render: (t) => {
            const config = getEstadoConfig(t.estado);
            const IconEstado = config.icon;
            return (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
                style={{ backgroundColor: config.bg, color: config.color }}
              >
                <IconEstado className="h-2.5 w-2.5" />
                {config.label}
              </span>
            );
          },
        },
        {
          key: 'creacion',
          header: 'Creación',
          sortValue: (t) => new Date(t.created_at).getTime(),
          render: (t) => {
            const creacion = new Date(t.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
            return (
              <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                {creacion}
              </span>
            );
          },
        },
        {
          key: 'modificacion',
          header: 'Modif.',
          sortValue: (t) => new Date(t.updated_at || t.created_at).getTime(),
          render: (t) => {
            const modificacion = new Date(t.updated_at || t.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
            return (
              <span className="text-[10px]" style={{ color: theme.text }}>
                {modificacion}
              </span>
            );
          },
        },
        {
          key: 'por_vencer',
          header: 'Vence',
          sortValue: (t) => {
            const venc = calcularVencimiento(t);
            return venc ? venc.getTime() : Infinity; // Sin vencimiento va al final
          },
          render: (t) => {
            const venc = calcularVencimiento(t);
            if (!venc) return <span className="text-[10px]" style={{ color: theme.textSecondary }}>—</span>;
            const hoy = new Date();
            const dias = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
            const vencido = dias < 0;
            const porVencer = !vencido && dias <= 3;
            const color = vencido ? '#ef4444' : porVencer ? '#f59e0b' : '#10b981';
            const bg = vencido ? '#ef444420' : porVencer ? '#f59e0b20' : '#10b98120';
            // Formato legible
            const diasAbs = Math.abs(dias);
            let texto: string;
            if (dias === 0) {
              texto = 'Hoy';
            } else if (diasAbs < 30) {
              texto = vencido ? `-${diasAbs} días` : `${diasAbs} días`;
            } else {
              const meses = Math.floor(diasAbs / 30);
              texto = vencido ? `-${meses} ${meses > 1 ? 'meses' : 'mes'}` : `${meses} ${meses > 1 ? 'meses' : 'mes'}`;
            }
            return (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ color, backgroundColor: bg }}
              >
                {texto}
              </span>
            );
          },
        },
      ]}
      keyExtractor={(t) => t.id}
      onRowClick={(t) => openTramite(t)}
      defaultSortKey={ordenamiento === 'por_vencer' ? 'por_vencer' : 'creacion'}
      defaultSortDirection={ordenamiento === 'por_vencer' ? 'asc' : 'desc'}
    />
  );

  return (
    <>
      <ABMPage
        title="Trámites"
        buttonLabel="Nuevo Trámite"
        onAdd={() => setWizardOpen(true)}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar trámites..."
        loading={false}
        isEmpty={!loading && filteredTramites.length === 0}
        emptyMessage="No hay trámites"
        defaultViewMode="table"
        stickyHeader={true}
        headerActions={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOrdenamiento('reciente')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: ordenamiento === 'reciente' ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${ordenamiento === 'reciente' ? theme.primary : theme.border}`,
                color: ordenamiento === 'reciente' ? theme.primary : theme.textSecondary,
              }}
            >
              <ArrowUpDown className="h-3 w-3" />
              Más recientes
            </button>
            <button
              onClick={() => setOrdenamiento('por_vencer')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: ordenamiento === 'por_vencer' ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${ordenamiento === 'por_vencer' ? theme.primary : theme.border}`,
                color: ordenamiento === 'por_vencer' ? theme.primary : theme.textSecondary,
              }}
            >
              <Calendar className="h-3 w-3" />
              Por vencer
            </button>
          </div>
        }
        secondaryFilters={renderSecondaryFilters()}
        tableView={renderTableView()}
        sheetOpen={false}
        sheetTitle=""
        onSheetClose={() => {}}
      >
        {renderCards()}
      </ABMPage>

      {/* Sentinel para infinite scroll + spinner de carga */}
      <div ref={loadMoreRef} className="py-4">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
            <span className="text-sm" style={{ color: theme.textSecondary }}>
              Cargando más trámites...
            </span>
          </div>
        )}
        {!hasMore && tramites.length > 0 && !loadingMore && (
          <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
            No hay más trámites para mostrar
          </p>
        )}
      </div>

      {/* Sheet de detalle */}
      <Sheet open={sheetOpen} onClose={closeSheet} title="Detalle del Trámite" stickyFooter={renderTramiteFooter()}>
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
                const cfg = getEstadoConfig(selectedTramite.estado);
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
                      <DynamicIcon
                        name={tipoDetalle?.icono || 'FileText'}
                        className="h-5 w-5"
                        style={{ color: colorDetalle }}
                        fallback={<FileText className="h-5 w-5" style={{ color: colorDetalle }} />}
                      />
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
              const estadoActual = normalizeEstado(selectedTramite.estado);
              const tramiteCerrado = estadosBloqueados.includes(estadoActual);

              // Helper para obtener color de disponibilidad
              const getDisponibilidadColor = (porcentaje: number) => {
                if (porcentaje >= 80) return '#ef4444'; // Rojo - muy ocupado
                if (porcentaje >= 50) return '#f59e0b'; // Naranja - ocupado
                return '#10b981'; // Verde - disponible
              };

              const empleadoSeleccionadoData = empleadosDisponibilidad.find(e => e.id === empleadoSeleccionado);

              return (
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium" style={{ color: theme.text }}>
                      Dependencia Asignada
                    </h3>
                    {!tramiteCerrado && (
                      <button
                        onClick={handleSugerirEmpleado}
                        disabled={loadingSugerencia}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                        style={{
                          background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                          color: '#ffffff',
                        }}
                      >
                        {loadingSugerencia ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Buscar con IA
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
                          estadoActual === 'en_proceso' ? 'en proceso' :
                          estadoActual === 'aprobado' ? 'aprobado' :
                          estadoActual === 'finalizado' ? 'finalizado' : 'rechazado'
                        }
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Sugerencia de IA */}
                      {sugerenciaIA && sugerenciaIA.sugerencia && (
                        <div
                          className="mb-3 p-3 rounded-lg"
                          style={{ backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }}
                        >
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-4 w-4 mt-0.5" style={{ color: theme.primary }} />
                            <div className="flex-1">
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

                      {/* Selector de empleados con disponibilidad */}
                      <div className="flex gap-2">
                        <div className="flex-1 relative" ref={empleadosDropdownRef}>
                          {/* Input/Botón del selector */}
                          <button
                            type="button"
                            onClick={() => setShowEmpleadosDropdown(!showEmpleadosDropdown)}
                            className="w-full px-3 py-2 rounded-lg text-sm text-left flex items-center justify-between transition-all"
                            style={{
                              backgroundColor: theme.card,
                              border: `1px solid ${showEmpleadosDropdown ? theme.primary : theme.border}`,
                              color: empleadoSeleccionado ? theme.text : theme.textSecondary,
                            }}
                          >
                            <span className="truncate">
                              {empleadoSeleccionadoData
                                ? `${empleadoSeleccionadoData.nombre} ${empleadoSeleccionadoData.apellido || ''}`
                                : 'Seleccionar dependencia...'}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${showEmpleadosDropdown ? 'rotate-180' : ''}`}
                              style={{ color: theme.textSecondary }}
                            />
                          </button>

                          {/* Dropdown con lista de empleados */}
                          {showEmpleadosDropdown && (
                            <div
                              className="absolute z-50 mt-1 w-full rounded-lg shadow-xl overflow-hidden"
                              style={{
                                backgroundColor: theme.card,
                                border: `1px solid ${theme.border}`,
                                maxHeight: '280px',
                              }}
                            >
                              {loadingEmpleados ? (
                                <div className="p-4 flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
                                </div>
                              ) : empleadosDisponibilidad.length === 0 ? (
                                <div className="p-4 text-center">
                                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                                    No hay dependencias disponibles
                                  </p>
                                </div>
                              ) : (
                                <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
                                  {empleadosDisponibilidad.map((emp) => {
                                    const isSelected = empleadoSeleccionado === emp.id;
                                    const disponColor = getDisponibilidadColor(emp.porcentaje_ocupacion);

                                    return (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        onClick={() => {
                                          setEmpleadoSeleccionado(emp.id);
                                          setShowEmpleadosDropdown(false);
                                        }}
                                        className="w-full p-3 text-left transition-all hover:brightness-95"
                                        style={{
                                          backgroundColor: isSelected ? `${theme.primary}15` : 'transparent',
                                          borderBottom: `1px solid ${theme.border}`,
                                        }}
                                      >
                                        <div className="flex items-start gap-3">
                                          {/* Avatar */}
                                          <div
                                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                                            style={{
                                              backgroundColor: isSelected ? `${theme.primary}30` : `${theme.primary}15`,
                                              color: theme.primary,
                                            }}
                                          >
                                            {emp.nombre?.[0]}{emp.apellido?.[0] || ''}
                                          </div>

                                          {/* Info */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <p
                                                className="text-sm font-medium truncate"
                                                style={{ color: theme.text }}
                                              >
                                                {emp.nombre} {emp.apellido || ''}
                                              </p>
                                              {/* Indicador de disponibilidad */}
                                              <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: disponColor }}
                                                title={`${emp.disponibilidad} disponible(s)`}
                                              />
                                            </div>

                                            {/* Carga y horario */}
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span
                                                className="text-xs"
                                                style={{ color: disponColor }}
                                              >
                                                {emp.carga_actual}/{emp.capacidad_maxima} asignados
                                              </span>
                                              <span className="text-xs" style={{ color: theme.textSecondary }}>•</span>
                                              <span
                                                className="text-xs truncate"
                                                style={{ color: theme.textSecondary }}
                                              >
                                                {emp.horario_texto}
                                              </span>
                                            </div>

                                            {/* Barra de ocupación */}
                                            <div
                                              className="mt-1.5 h-1 rounded-full overflow-hidden"
                                              style={{ backgroundColor: `${theme.border}50` }}
                                            >
                                              <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                  width: `${Math.min(100, emp.porcentaje_ocupacion)}%`,
                                                  backgroundColor: disponColor,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Botón asignar */}
                        <button
                          onClick={handleAsignarEmpleado}
                          disabled={!empleadoSeleccionado || asignando}
                          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all hover:scale-105"
                          style={{
                            background: empleadoSeleccionado
                              ? `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`
                              : theme.backgroundSecondary,
                            color: empleadoSeleccionado ? '#ffffff' : theme.textSecondary,
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
                              backgroundColor: getEstadoConfig(h.estado_anterior).bg,
                              color: getEstadoConfig(h.estado_anterior).color
                            }}
                          >
                            {getEstadoConfig(h.estado_anterior).label}
                          </span>
                          <span style={{ color: theme.textSecondary }}>→</span>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: getEstadoConfig(h.estado_nuevo).bg,
                              color: getEstadoConfig(h.estado_nuevo).color
                            }}
                          >
                            {getEstadoConfig(h.estado_nuevo).label}
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
            {(estadoTransiciones[normalizeEstado(selectedTramite.estado)]?.length || 0) > 0 && (
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
                      {(estadoTransiciones[normalizeEstado(selectedTramite.estado)] || []).map(estado => (
                        <option key={estado} value={estado}>
                          {getEstadoConfig(estado).label}
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
        onClose={() => {
          setWizardOpen(false);
          setServicioInicial(null);
        }}
        servicios={servicios}
        tipos={tipos}
        onSuccess={loadData}
        servicioInicial={servicioInicial}
      />
    </>
  );
}
