import { useEffect, useState, useRef, useCallback } from 'react';
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
import { ABMPage, ABMTable } from '../components/ui/ABMPage';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import { DynamicIcon } from '../components/ui/DynamicIcon';
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

  // Filtros visuales estilo Reclamos
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [conteosTipos, setConteosTipos] = useState<Array<{ id: number; nombre: string; icono: string; color: string; cantidad: number }>>([]);
  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'vencimiento'>('reciente');

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

  // Infinite scroll state
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const LIMIT = 30;
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

  const loadData = async (reloadTramites = true) => {
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
      if (reloadTramites) {
        await loadTramites(filtroTipo, filtroEstado);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar trámites');
    } finally {
      setLoading(false);
    }
  };

  // Cargar trámites con filtros (resetea la lista)
  const loadTramites = async (tipo?: number | null, estado?: string) => {
    try {
      const params: Record<string, unknown> = {
        limit: LIMIT,
        skip: 0,
      };
      // Usar parámetros explícitos o valores actuales del state
      const tipoFiltro = tipo !== undefined ? tipo : filtroTipo;
      const estadoFiltro = estado !== undefined ? estado : filtroEstado;

      if (tipoFiltro) params.tipo_tramite_id = tipoFiltro;
      // El backend espera el estado en mayúsculas (enum EstadoSolicitud)
      if (estadoFiltro) params.estado = estadoFiltro.toUpperCase();

      const res = await tramitesApi.getGestionTodos(params);
      setTramites(res.data);
      setSkip(LIMIT);
      setHasMore(res.data.length >= LIMIT);
    } catch (error) {
      console.error('Error cargando trámites:', error);
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
      if (filtroEstado) params.estado = filtroEstado.toUpperCase();

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
  }, [loadingMore, hasMore, skip, filtroTipo, filtroEstado]);

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
      await recargarDespuesDeAccion();
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

  // Función para calcular fecha de vencimiento
  const calcularVencimiento = (t: Tramite) => {
    const tiempoEstimado = t.tramite?.tiempo_estimado_dias || 0;
    if (!tiempoEstimado) return null;
    const fechaCreacion = new Date(t.created_at);
    const fechaVencimiento = new Date(fechaCreacion);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);
    return fechaVencimiento;
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
  }).sort((a, b) => {
    if (ordenamiento === 'reciente') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      // Por vencimiento - los que vencen más pronto primero
      const vencA = calcularVencimiento(a);
      const vencB = calcularVencimiento(b);
      if (!vencA && !vencB) return 0;
      if (!vencA) return 1;
      if (!vencB) return -1;
      return vencA.getTime() - vencB.getTime();
    }
  });

  // Render de cards (children de ABMPage)
  const renderCards = () => {
    if (loading) {
      return Array.from({ length: 6 }).map((_, i) => (
        <ABMCardSkeleton key={`skeleton-${i}`} index={i} />
      ));
    }

    return filteredTramites.map((t) => {
      const config = estadoConfig[t.estado] || estadoConfig.iniciado;
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
      <div className="flex gap-1.5">
        {/* Botón Todos fijo - outlined */}
        <button
          onClick={() => setFiltroTipo(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all h-[34px] flex-shrink-0"
          style={{
            background: 'transparent',
            border: `1.5px solid ${filtroTipo === null ? theme.primary : theme.border}`,
          }}
        >
          <FileText className="h-4 w-4" style={{ color: filtroTipo === null ? theme.primary : theme.textSecondary }} />
          <span className="text-xs font-medium whitespace-nowrap" style={{ color: filtroTipo === null ? theme.primary : theme.textSecondary }}>
            Todos
          </span>
        </button>

        {/* Scroll de tipos */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
          {/* Skeleton mientras cargan los tipos */}
          {loading || tipos.length === 0 ? (
            <>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={`skeleton-tipo-${i}`}
                  className="h-[34px] w-[60px] rounded-lg animate-pulse flex-shrink-0"
                  style={{ background: `${theme.border}40` }}
                />
              ))}
            </>
          ) : (
            <>
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all h-[34px] flex-shrink-0"
                    style={{
                      background: isSelected ? tipoColor : theme.backgroundSecondary,
                      border: `1px solid ${isSelected ? tipoColor : theme.border}`,
                    }}
                  >
                    <DynamicIcon
                      name={tipo.icono || 'FileText'}
                      className="h-4 w-4"
                      style={{ color: isSelected ? '#ffffff' : tipoColor }}
                      fallback={<FileText className="h-4 w-4" style={{ color: isSelected ? '#ffffff' : tipoColor }} />}
                    />
                    <span className="text-xs font-medium whitespace-nowrap" style={{ color: isSelected ? '#ffffff' : theme.text }}>
                      {tipo.nombre.split(' ')[0]}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 rounded-full"
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
      <div className="flex gap-1.5">
        {/* Botón Todos fijo - outlined */}
        <button
          onClick={() => setFiltroEstado('')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all h-[32px] flex-shrink-0"
          style={{
            background: 'transparent',
            border: `1.5px solid ${filtroEstado === '' ? theme.primary : theme.border}`,
          }}
        >
          <Eye className="h-4 w-4" style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }} />
          <span className="text-xs font-medium whitespace-nowrap" style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }}>
            Todos
          </span>
          <span className="text-[10px] font-bold" style={{ color: filtroEstado === '' ? theme.primary : theme.textSecondary }}>
            {Object.values(conteosEstados).reduce((a, b) => a + b, 0)}
          </span>
        </button>

        {/* Scroll de estados */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
          {Object.keys(conteosEstados).length === 0 ? (
            // Skeleton mientras cargan los conteos
            <>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={`skeleton-estado-${i}`}
                  className="h-[32px] w-[55px] rounded-lg animate-pulse flex-shrink-0"
                  style={{ background: `${theme.border}40` }}
                />
              ))}
            </>
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
              return (
                <button
                  key={estado.key}
                  onClick={() => setFiltroEstado(filtroEstado === estado.key ? '' : estado.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all h-[32px] flex-shrink-0"
                  style={{
                    background: isActive ? estado.color : `${estado.color}15`,
                    border: `1px solid ${isActive ? estado.color : `${estado.color}40`}`,
                  }}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" style={{ color: isActive ? '#ffffff' : estado.color }} />
                  <span className="text-xs font-medium whitespace-nowrap" style={{ color: isActive ? '#ffffff' : estado.color }}>
                    {estado.label}
                  </span>
                  <span
                    className="text-[10px] font-bold"
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

  // Header actions (ordenamiento)
  const renderHeaderActions = () => (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setOrdenamiento('reciente')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
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
        onClick={() => setOrdenamiento('vencimiento')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
        style={{
          backgroundColor: ordenamiento === 'vencimiento' ? theme.primary : theme.backgroundSecondary,
          border: `1px solid ${ordenamiento === 'vencimiento' ? theme.primary : theme.border}`,
          color: ordenamiento === 'vencimiento' ? '#ffffff' : theme.textSecondary,
        }}
      >
        <Calendar className="h-3 w-3" />
        Por vencer
      </button>
    </div>
  );

  // Table view
  const renderTableView = () => (
    <ABMTable
      data={filteredTramites}
      columns={[
        {
          key: 'numero_tramite',
          header: 'ID',
          render: (t) => (
            <span className="font-mono text-xs font-medium" style={{ color: theme.primary }}>
              #{t.numero_tramite.slice(-4)}
            </span>
          ),
        },
        {
          key: 'tipo',
          header: 'Tipo',
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
          header: 'Trámite',
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
          render: (t) => (
            <span className="text-xs truncate max-w-[90px] block" style={{ color: theme.text }}>
              {t.nombre_solicitante} {t.apellido_solicitante}
            </span>
          ),
        },
        {
          key: 'asunto',
          header: 'Asunto',
          render: (t) => (
            <p className="text-xs truncate max-w-[100px]" style={{ color: theme.text }} title={t.asunto}>
              {t.asunto}
            </p>
          ),
        },
        {
          key: 'empleado',
          header: 'Empleado',
          render: (t) => renderEmpleado(t, theme.text),
        },
        {
          key: 'estado',
          header: 'Estado',
          render: (t) => {
            const config = estadoConfig[t.estado] || estadoConfig.iniciado;
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
          key: 'fechas',
          header: 'Fechas',
          render: (t) => {
            const creacion = new Date(t.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const venc = calcularVencimiento(t);
            const vencimiento = venc ? venc.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null;
            return (
              <div className="flex flex-col text-[10px] leading-tight">
                <span style={{ color: theme.textSecondary }}>{creacion}</span>
                {vencimiento && (
                  <span style={{ color: theme.primary }}>
                    {vencimiento}
                  </span>
                )}
              </div>
            );
          },
        },
        {
          key: 'por_vencer',
          header: 'Vence',
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
        headerActions={renderHeaderActions()}
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
    </>
  );
}
