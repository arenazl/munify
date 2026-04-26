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
  Inbox,
  CreditCard,
  PauseCircle,
  Play,
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
  FileSearch,
  PlayCircle,
  LayoutList,
  LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, empleadosApi, categoriasTramiteApi, dependenciasApi, pagosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Sheet } from '../components/ui/Sheet';
import { CrearSolicitudWizard } from '../components/tramites/CrearSolicitudWizard';
import { ChecklistDocumentosVerificacion } from '../components/tramites/ChecklistDocumentosVerificacion';
import { DocumentReviewModal } from '../components/tramites/DocumentReviewModal';
import { ABMPage, ABMTable, FilterRowSkeleton } from '../components/ui/ABMPage';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import PageHint from '../components/ui/PageHint';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { InboxLayout } from '../components/inbox/InboxLayout';
import { InboxCard } from '../components/inbox/InboxCard';
import type { Solicitud, Tramite, CategoriaTramite, Empleado, EmpleadoDisponibilidad, TipoEmpleado } from '../types';
import {
  getEstadoInfo,
  normalizarEstado,
  TRANSICIONES,
  type EstadoCanonico,
} from '../lib/estadoConfig';
import React from 'react';

// Helpers locales que delegan en el source-of-truth `lib/estadoConfig.ts`.
// Los mantenemos con el mismo nombre que usaba el código viejo para no tener
// que tocar cada call site.
const getEstadoConfig = getEstadoInfo;
const normalizeEstado = normalizarEstado;
const estadoTransiciones = TRANSICIONES;

interface HistorialItem {
  id: number;
  tramite_id: number;
  usuario_id: number | null;
  estado_anterior: EstadoCanonico | null;
  estado_nuevo: EstadoCanonico | null;
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
  const { user, municipioActual } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tramites, setTramites] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Tramite[]>([]);
  const [tipos, setTipos] = useState<CategoriaTramite[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Vista guiada (Inbox) vs vista grilla clásica.
  // Default Inbox para supervisor de dependencia (lo guía por urgencia/nuevos/
  // en curso), grilla para admin/supervisor general que necesita filtrar.
  const [vistaInbox, setVistaInbox] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('tramites_vista_inbox') : null;
    if (saved !== null) return saved === '1';
    return true; // Por default, todos arrancan en vista guiada
  });

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
  const [selectedTramite, setSelectedTramite] = useState<Solicitud | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tracking del boton activo para que solo el clickeado muestre loading
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  // Modal de revisión de documentos (fullscreen viewer con aprobar/rechazar)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [checklistData, setChecklistData] = useState<import('../types').ChecklistDocumentos | null>(null);
  // Key para forzar remount del Checklist cuando el modal apruebe/rechace docs.
  const [checklistVersion, setChecklistVersion] = useState(0);

  // Formulario de actualización
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCanonico | ''>('');
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

  // Responsable (empleado especifico de la dependencia, opcional)
  const [responsableId, setResponsableId] = useState<number | null>(null);
  const [asignandoResponsable, setAsignandoResponsable] = useState(false);

  // Historial
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [estadoPago, setEstadoPago] = useState<{
    requiere_pago: boolean; costo: number; pagado: boolean;
    monto_pagado: string | null; fecha_pago: string | null;
    medio_pago: string | null; sesion_aprobada_id: string | null;
    intentos_total: number; intentos_fallidos: number;
    sesiones: Array<{ session_id: string; estado: string; monto: string; medio_pago: string | null; provider: string; external_id: string | null; created_at: string | null; completed_at: string | null }>;
  } | null>(null);

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

  // Autorefresh cada 10s — la lista se actualiza sola para reflejar pagos
  // confirmados, cambios de estado por otros operadores, etc. Si el modal
  // está abierto, también refrescamos la solicitud seleccionada.
  useEffect(() => {
    if (loading) return;
    const id = setInterval(async () => {
      // Si el usuario está escribiendo en la búsqueda evitamos sobreescribir.
      if (document.activeElement?.tagName === 'INPUT') return;
      await loadTramites(filtroTipo, filtroEstado, searchTerm, filtroTramite);
    }, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtroTipo, filtroEstado, searchTerm, filtroTramite, soloMiArea]);

  // Mantener actualizado el trámite del modal abierto cuando la lista cambia.
  useEffect(() => {
    if (!selectedTramite) return;
    const fresh = tramites.find(t => t.id === selectedTramite.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedTramite)) {
      setSelectedTramite(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramites]);

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
      // PRIORIDAD 1: las solicitudes (lo que el user quiere ver primero)
      const tramitesPromise = reloadTramites ? loadTramites(filtroTipo, filtroEstado) : Promise.resolve();

      // Paralelo: catálogos y conteos (no bloquean la tabla)
      const catalogosPromise = Promise.all([
        tramitesApi.getAll().catch(() => ({ data: [] })),
        categoriasTramiteApi.getAll().catch(() => ({ data: [] })),
        empleadosApi.getAll().catch(() => ({ data: [] })),
        tramitesApi.getResumen().catch(() => ({ data: null })),
      ]).then(([tramitesRes, categoriasRes, empleadosRes, resumenRes]) => {
        setServicios(tramitesRes.data || []);
        setTipos(categoriasRes.data);
        setEmpleados(empleadosRes.data);
        setResumen(resumenRes.data);
      });

      const conteosPromise = loadConteos();

      // Dejar que todas corran; marcar loading=false apenas terminen las tres
      await Promise.all([tramitesPromise, catalogosPromise, conteosPromise]);
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

      if (tipoFiltro) params.categoria_tramite_id = tipoFiltro;
      if (tramiteFiltro) params.tramite_id = tramiteFiltro;
      if (estadoFiltro) params.estado = estadoFiltro.toUpperCase();
      if (searchFiltro && searchFiltro.trim()) params.search = searchFiltro.trim();
      if (soloMiArea && user?.dependencia?.id) {
        params.municipio_dependencia_id = user.dependencia.id;
      }

      const res = await tramitesApi.getGestionSolicitudes(params as any);
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

      if (filtroTipo) params.categoria_tramite_id = filtroTipo;
      if (filtroTramite) params.tramite_id = filtroTramite;
      if (filtroEstado) params.estado = filtroEstado.toUpperCase();
      if (searchTerm && searchTerm.trim()) params.search = searchTerm.trim();

      const res = await tramitesApi.getGestionSolicitudes(params as any);

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
      const [categoriasRes, estadosRes] = await Promise.all([
        tramitesApi.getConteoCategorias().catch(() => ({ data: [] })),
        tramitesApi.getConteoEstados().catch(() => ({ data: {} })),
      ]);
      // El endpoint nuevo devuelve {id, nombre, icono, color, cantidad} por categoría
      // de trámite. Lo guardamos como "tipos" para mantener compat con el resto de
      // la pantalla (que todavía habla de "tipos" internamente).
      setConteosTipos(categoriasRes.data);
      setConteosEstados(estadosRes.data);
      setConteosLoaded(true);
    } catch (error) {
      console.error('Error cargando conteos:', error);
      setConteosLoaded(true);
    }
  };

  // Cargar dependencias del muni para el selector "Cambiar dependencia".
  // Antes cargaba empleados — los trámites se asignan a dependencias, no a
  // empleados. Mapeamos la respuesta a la forma de EmpleadoDisponibilidad
  // para no tener que reescribir el dropdown entero.
  const loadEmpleadosDisponibilidad = async () => {
    setLoadingEmpleados(true);
    try {
      const res = await dependenciasApi.getMunicipio({ activo: true, tipo_gestion: 'TRAMITE' });
      const deps = (res.data || []) as Array<{
        id: number;
        nombre: string;
        descripcion?: string;
      }>;
      setEmpleadosDisponibilidad(deps.map((d) => ({
        id: d.id,
        nombre: d.nombre,
        apellido: '',
        especialidad: d.descripcion || '',
        tipo: 'administrativo' as TipoEmpleado,
        capacidad_maxima: 0,
        carga_actual: 0,
        disponibilidad: 0,
        porcentaje_ocupacion: 0,
        horarios: [],
        horario_texto: d.descripcion || '',
      })));
    } catch (error) {
      console.error('Error cargando dependencias:', error);
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

  const openTramite = async (tramite: Solicitud) => {
    setSelectedTramite(tramite);
    setNuevoEstado('');
    setRespuesta(tramite.respuesta || '');
    setObservaciones(tramite.observaciones || '');
    setEmpleadoSeleccionado(tramite.municipio_dependencia_id || '');
    setResponsableId(tramite.empleado_id ?? null);
    setSugerenciaIA(null);
    setHistorial([]);
    setShowHistorial(false);
    setShowEmpleadosDropdown(false);
    setEstadoPago(null);
    setSheetOpen(true);
    setSearchParams({ id: String(tramite.id) });
    // Cargar empleados con disponibilidad al abrir
    loadEmpleadosDisponibilidad();
    // Cargar estado de pago (si el tramite tiene costo)
    const costoTramite = (tramite as any).tramite?.costo;
    if (costoTramite && costoTramite > 0) {
      try {
        const { pagosApi } = await import('../lib/api');
        const r = await pagosApi.estadoPagoSolicitud(tramite.id);
        setEstadoPago(r.data as any);
      } catch {
        // silent — se puede reintentar abriendo el trámite de nuevo
      }
    }
  };

  const handleAsignarResponsable = async () => {
    if (!selectedTramite) return;
    setAsignandoResponsable(true);
    try {
      await tramitesApi.asignarResponsable(selectedTramite.id, responsableId);
      const nombre = responsableId
        ? empleadosDisponibilidad.find(e => e.id === responsableId)
        : null;
      toast.success(
        responsableId
          ? `Responsable asignado: ${nombre?.nombre || ''} ${nombre?.apellido || ''}`.trim()
          : 'Responsable desasignado',
      );
      await recargarDespuesDeAccion();
    } catch (err) {
      console.error('Error asignando responsable', err);
      toast.error('No se pudo asignar el responsable');
    } finally {
      setAsignandoResponsable(false);
    }
  };

  const handleAutoAsignarResponsable = async () => {
    if (!selectedTramite) return;
    setAsignandoResponsable(true);
    try {
      const res = await tramitesApi.autoAsignarSolicitud(selectedTramite.id);
      toast.success(`Asignado a ${res.data.empleado_nombre}`, { description: res.data.razon });
      await recargarDespuesDeAccion();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'No se pudo auto-asignar');
    } finally {
      setAsignandoResponsable(false);
    }
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
      const res = await tramitesApi.getHistorialSolicitud(selectedTramite.id);
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
      // TODO: endpoint de sugerencia IA de empleado aún no está migrado al
      // modelo per-municipio. Por ahora deshabilitado — el admin asigna a mano.
      toast.info('Sugerencia IA temporalmente no disponible');
      setSugerenciaIA(null);
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
      await tramitesApi.asignarSolicitud(selectedTramite.id, {
        municipio_dependencia_id: Number(empleadoSeleccionado),
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

  /**
   * Extrae el detail del error del backend y muestra toast apropiado.
   * Si el backend bloqueó el cambio de estado porque faltan documentos
   * obligatorios verificados (400 "Faltan verificar documentos obligatorios: ..."),
   * muestra el mensaje completo para que el supervisor sepa qué tildar.
   */
  const showApiError = (err: any, fallback: string) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') {
      toast.error(detail, { duration: 6000 });
    } else {
      toast.error(fallback);
    }
  };

  const handleUpdateTramite = async () => {
    if (!selectedTramite || !nuevoEstado) {
      toast.error('Selecciona un nuevo estado');
      return;
    }

    setSaving(true);
    try {
      await tramitesApi.updateSolicitud(selectedTramite.id, {
        estado: nuevoEstado, // Enums nuevos vienen en minúsculas (recibido, en_curso, etc.)
        respuesta: respuesta || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success('Trámite actualizado');
      closeSheet();
      await recargarDespuesDeAccion();
    } catch (error) {
      console.error('Error actualizando trámite:', error);
      showApiError(error, 'Error al actualizar trámite');
    } finally {
      setSaving(false);
    }
  };

  // Funciones directas para cambio de estado (botones de acción)
  const handleDirectStateChange = async (nuevoEstadoDirecto: EstadoCanonico, mensajeExito: string) => {
    if (!selectedTramite) return;
    setSaving(true);
    setAccionEnCurso(nuevoEstadoDirecto);
    try {
      await tramitesApi.updateSolicitud(selectedTramite.id, {
        estado: nuevoEstadoDirecto,
        respuesta: respuesta || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success(mensajeExito);
      closeSheet();
      await recargarDespuesDeAccion();
    } catch (error) {
      console.error('Error actualizando trámite:', error);
      showApiError(error, 'Error al actualizar trámite');
    } finally {
      setSaving(false);
      setAccionEnCurso(null);
    }
  };

  const handleAceptar = () => handleDirectStateChange('en_curso', 'Trámite en curso');
  const handleFinalizar = () => handleDirectStateChange('finalizado', 'Trámite finalizado');
  const handleRechazar = () => handleDirectStateChange('rechazado', 'Trámite rechazado');
  const handlePosponer = () => handleDirectStateChange('pospuesto', 'Trámite pospuesto');

  // Renderizar footer con botones grandes dockeados (grid 2 col, hasta 2 filas)
  const renderTramiteFooter = () => {
    if (!selectedTramite) return null;

    const estadoActual = normalizeEstado(selectedTramite.estado);

    // Estados finales - solo info
    if (estadoActual === 'rechazado' || estadoActual === 'finalizado') {
      return (
        <div
          className="w-full px-4 py-3 rounded-xl font-semibold text-center"
          style={{
            backgroundColor: estadoActual === 'finalizado' ? '#05966920' : '#ef444420',
            color: estadoActual === 'finalizado' ? '#059669' : '#ef4444',
            border: `1px solid ${estadoActual === 'finalizado' ? '#05966950' : '#ef444450'}`
          }}
        >
          {estadoActual === 'finalizado' ? '✓ Trámite Finalizado' : '✗ Trámite Rechazado'}
        </div>
      );
    }

    // Pendiente_pago — el trabajo terminó pero el vecino aún no pagó.
    // El supervisor no puede cerrar hasta que el vecino confirme el pago.
    // Cast a string porque pendiente_pago aún no está en EstadoCanonico.
    if ((estadoActual as string) === 'pendiente_pago') {
      const tramiteCfg: any = (selectedTramite as any).tramite || {};
      return (
        <div
          className="w-full px-4 py-3 rounded-xl flex items-start gap-2"
          style={{ backgroundColor: '#f59e0b15', color: '#f59e0b', border: '1px solid #f59e0b50' }}
        >
          <span className="text-lg">💳</span>
          <div>
            <p className="font-semibold">Listo para entregar — falta pago</p>
            <p className="text-xs opacity-90 mt-0.5">
              El trabajo está terminado. El vecino debe pagar ${tramiteCfg.costo?.toLocaleString('es-AR') || ''} en la pasarela
              para que podamos cerrar el trámite y entregarlo.
            </p>
          </div>
        </div>
      );
    }

    // Acciones disponibles según estado — cada una con su color/handler.
    // Mostrado como grid 2 col; si hay 3 acciones, la tercera (Rechazar) abarca toda la fila.
    type Accion = { id: string; label: string; loadingLabel: string; handler: () => void; color: string; variant?: 'solid' | 'outline'; fullRow?: boolean };
    const acciones: Accion[] = [];

    if (estadoActual === 'recibido') {
      acciones.push(
        { id: 'en_curso', label: 'Poner en Curso', loadingLabel: 'Aceptando...', handler: handleAceptar, color: theme.primary, variant: 'solid' },
        { id: 'rechazado', label: 'Rechazar', loadingLabel: 'Rechazando...', handler: handleRechazar, color: '#ef4444', variant: 'outline' },
      );
    } else if (estadoActual === 'en_curso') {
      acciones.push(
        { id: 'finalizado', label: 'Finalizar', loadingLabel: 'Finalizando...', handler: handleFinalizar, color: '#10b981', variant: 'solid' },
        { id: 'pospuesto', label: 'Posponer', loadingLabel: 'Posponiendo...', handler: handlePosponer, color: '#f59e0b', variant: 'outline' },
        { id: 'rechazado', label: 'Rechazar', loadingLabel: 'Rechazando...', handler: handleRechazar, color: '#ef4444', variant: 'outline', fullRow: true },
      );
    } else if (estadoActual === 'pospuesto') {
      acciones.push(
        { id: 'en_curso', label: 'Reanudar', loadingLabel: 'Reanudando...', handler: handleAceptar, color: theme.primary, variant: 'solid' },
        { id: 'finalizado', label: 'Finalizar', loadingLabel: 'Finalizando...', handler: handleFinalizar, color: '#10b981', variant: 'solid' },
        { id: 'rechazado', label: 'Rechazar', loadingLabel: 'Rechazando...', handler: handleRechazar, color: '#ef4444', variant: 'outline', fullRow: true },
      );
    }

    if (acciones.length === 0) return null;

    return (
      <div className="grid grid-cols-2 gap-2">
        {acciones.map((a) => {
          const isThisLoading = saving && accionEnCurso === a.id;
          return (
          <button
            key={a.id}
            onClick={a.handler}
            disabled={saving}
            className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 ${a.fullRow ? 'col-span-2' : ''}`}
            style={
              a.variant === 'solid'
                ? {
                    backgroundColor: a.color,
                    color: '#ffffff',
                    boxShadow: `0 4px 14px ${a.color}40`,
                  }
                : {
                    backgroundColor: `${a.color}15`,
                    border: `1.5px solid ${a.color}60`,
                    color: a.color,
                  }
            }
          >
            {isThisLoading ? a.loadingLabel : a.label}
          </button>
          );
        })}
      </div>
    );
  };

  // Función para calcular fecha de vencimiento
  const calcularVencimiento = (t: Solicitud) => {
    const tiempoEstimado = t.tramite?.tiempo_estimado_dias || 0;
    if (!tiempoEstimado) return null;
    const fechaCreacion = new Date(t.created_at);
    const fechaVencimiento = new Date(fechaCreacion);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);
    return fechaVencimiento;
  };

  // Agrupar servicios por tipo para el dropdown del header
  const serviciosPorTipo = useMemo(() => {
    const grouped: Record<number, { tipo: CategoriaTramite; servicios: Tramite[] }> = {};
    servicios.forEach(s => {
      const tipoId = s.categoria_tramite_id;
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
      const tipoTramite = t.tramite?.categoria_tramite;
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
                {!t.municipio_dependencia_id && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                  >
                    Sin asignar
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {t.dependencia_asignada && (
                  <span style={{ color: t.dependencia_asignada.color || theme.primary }} className="font-medium">
                    {t.dependencia_asignada.nombre}
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
                    <span
                      className={`text-[10px] font-medium whitespace-nowrap truncate ${isLoadingThis ? 'animate-pulse' : ''}`}
                      style={{ color: isSelected ? '#ffffff' : theme.text, maxWidth: '140px' }}
                    >
                      {tipo.nombre}
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
              // 1-a-1 con EstadoSolicitud (backend/models/tramite.py).
              // El conteo de `recibido` absorbe el legacy `INICIADO`.
              { key: 'recibido', label: 'Recib.', icon: Inbox, color: '#3b82f6', count: (conteosEstados['recibido'] || 0) + (conteosEstados['iniciado'] || 0) + (conteosEstados['INICIADO'] || 0) },
              { key: 'pendiente_pago', label: 'Pago', icon: CreditCard, color: '#f59e0b', count: conteosEstados['pendiente_pago'] || 0 },
              { key: 'en_curso', label: 'Curso', icon: Play, color: '#0ea5e9', count: conteosEstados['en_curso'] || 0 },
              { key: 'finalizado', label: 'Final.', icon: CheckCircle2, color: '#10b981', count: conteosEstados['finalizado'] || 0 },
              { key: 'pospuesto', label: 'Posp.', icon: PauseCircle, color: '#6b7280', count: conteosEstados['pospuesto'] || 0 },
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
              #{(t.numero_tramite || '').slice(-4) || '—'}
            </span>
          ),
        },
        {
          key: 'tipo',
          header: 'Tipo',
          sortValue: (t) => t.tramite?.categoria_tramite?.nombre || '',
          render: (t) => {
            const tipoTramite = t.tramite?.categoria_tramite;
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
            const tipoColor = t.tramite?.categoria_tramite?.color || theme.primary;
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
          key: 'dependencia',
          header: 'Dependencia',
          sortValue: (t) => t.dependencia_asignada?.nombre || '',
          render: (t) => {
            if (!t.dependencia_asignada?.nombre) return null;
            return (
              <span
                className="text-xs truncate max-w-[80px] block"
                style={{ color: t.dependencia_asignada.color || theme.text }}
                title={t.dependencia_asignada.nombre}
              >
                {t.dependencia_asignada.nombre}
              </span>
            );
          },
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

  // ============================================================
  // INBOX (vista guiada) — secciones por urgencia/estado
  // ============================================================
  const inboxData = useMemo(() => {
    const ahora = Date.now();
    const tresDiasMs = 3 * 24 * 60 * 60 * 1000;

    const urgentes: Solicitud[] = [];
    const nuevos: Solicitud[] = [];
    const enCurso: Solicitud[] = [];
    const esperando: Solicitud[] = [];

    for (const t of tramites) {
      const estado = (t.estado || '').toLowerCase();
      // Excluir cerrados de la vista guiada
      if (estado === 'finalizado' || estado === 'rechazado') continue;

      // Vencimiento estimado = created_at + tiempo_estimado_dias del trámite
      const dias = t.tramite?.tiempo_estimado_dias || 15;
      const fechaVence = t.created_at
        ? new Date(t.created_at).getTime() + dias * 24 * 60 * 60 * 1000
        : null;
      const venceEn = fechaVence ? fechaVence - ahora : Infinity;
      const esUrgente = venceEn > 0 && venceEn <= tresDiasMs;

      if (esUrgente) {
        urgentes.push(t);
        continue;
      }
      if (estado === 'pendiente_pago' || estado === 'pospuesto') {
        esperando.push(t);
      } else if (estado === 'en_curso') {
        enCurso.push(t);
      } else {
        // recibido (y otros legacy)
        nuevos.push(t);
      }
    }
    return { urgentes, nuevos, enCurso, esperando };
  }, [tramites]);

  const renderInboxCard = (t: Solicitud, opts?: { urgente?: boolean }) => {
    const cat = t.tramite?.categoria_tramite;
    const color = cat?.color || theme.primary;
    const ahora = Date.now();
    const dias = t.tramite?.tiempo_estimado_dias || 15;
    const fechaVence = t.created_at
      ? new Date(t.created_at).getTime() + dias * 24 * 60 * 60 * 1000
      : null;
    const venceMs = fechaVence ? fechaVence - ahora : null;
    let tiempoLabel: string | undefined;
    if (venceMs != null) {
      const d = Math.ceil(venceMs / (1000 * 60 * 60 * 24));
      if (d < 0) tiempoLabel = `Venció hace ${Math.abs(d)}d`;
      else if (d === 0) tiempoLabel = 'Vence hoy';
      else if (d === 1) tiempoLabel = 'Vence mañana';
      else tiempoLabel = `Vence en ${d} días`;
    } else if (t.created_at) {
      const d = Math.floor((ahora - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
      tiempoLabel = d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`;
    }
    const badges: Array<{ label: string; color: string }> = [];
    const estado = (t.estado || '').toLowerCase();
    if (estado === 'pendiente_pago') badges.push({ label: 'Pago pendiente', color: '#f59e0b' });
    if (estado === 'pospuesto') badges.push({ label: 'Pospuesto', color: '#8b5cf6' });
    const solicitanteNombre = [t.nombre_solicitante, t.apellido_solicitante]
      .filter(Boolean).join(' ').trim() || undefined;
    return (
      <InboxCard
        numero={t.numero_tramite || `#${t.id}`}
        titulo={t.tramite?.nombre || 'Trámite'}
        subtitulo={t.asunto || undefined}
        solicitante={solicitanteNombre}
        tiempoLabel={tiempoLabel}
        color={color}
        icono={cat?.icono ? <DynamicIcon name={cat.icono} className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        badges={badges.length > 0 ? badges : undefined}
        ctaLabel={opts?.urgente ? 'Resolver ya' : 'Abrir'}
        onClick={() => openTramite(t)}
        urgente={opts?.urgente}
      />
    );
  };

  const inboxView = vistaInbox ? (
    <InboxLayout
      saludoNombre={user?.nombre || ''}
      contextoLabel={user?.dependencia?.nombre || municipioActual?.nombre || 'tu municipio'}
      totalPendiente={
        inboxData.urgentes.length + inboxData.nuevos.length + inboxData.enCurso.length + inboxData.esperando.length
      }
      metricasChips={[
        { color: '#ef4444', icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'urgentes', value: inboxData.urgentes.length },
        { color: '#3b82f6', icon: <Inbox className="w-3.5 h-3.5" />, label: 'nuevos', value: inboxData.nuevos.length },
        { color: '#f59e0b', icon: <PlayCircle className="w-3.5 h-3.5" />, label: 'en curso', value: inboxData.enCurso.length },
        { color: '#8b5cf6', icon: <PauseCircle className="w-3.5 h-3.5" />, label: 'esperando', value: inboxData.esperando.length },
      ]}
      secciones={[
        {
          id: 'urgente',
          titulo: 'Empecemos por lo urgente',
          subtitulo: 'Trámites que vencen en los próximos 3 días',
          icono: <AlertCircle className="w-5 h-5" />,
          color: '#ef4444',
          emptyMessage: '✨ Sin urgentes. Bandeja al día.',
          items: inboxData.urgentes.map((t) => renderInboxCard(t, { urgente: true })),
        },
        {
          id: 'nuevos',
          titulo: 'Nuevos para tomar',
          subtitulo: 'Trámites que llegaron y nadie empezó todavía',
          icono: <Inbox className="w-5 h-5" />,
          color: '#3b82f6',
          emptyMessage: '🎉 No hay trámites nuevos sin tomar.',
          items: inboxData.nuevos.map((t) => renderInboxCard(t)),
        },
        {
          id: 'en-curso',
          titulo: 'Estás trabajando en estos',
          subtitulo: 'Trámites que ya tomaste — seguir avanzando',
          icono: <PlayCircle className="w-5 h-5" />,
          color: '#f59e0b',
          emptyMessage: 'Nada en curso ahora mismo.',
          items: inboxData.enCurso.map((t) => renderInboxCard(t)),
          colapsable: inboxData.enCurso.length > 6,
        },
        {
          id: 'esperando',
          titulo: 'Esperando al vecino',
          subtitulo: 'Pago pendiente, pospuestos, falta documentación',
          icono: <PauseCircle className="w-5 h-5" />,
          color: '#8b5cf6',
          emptyMessage: 'Sin trámites esperando.',
          items: inboxData.esperando.map((t) => renderInboxCard(t)),
          colapsable: true,
        },
      ]}
    />
  ) : null;

  // Toggle de vista (botón en headerActions)
  const toggleVista = () => {
    const nuevo = !vistaInbox;
    setVistaInbox(nuevo);
    try { localStorage.setItem('tramites_vista_inbox', nuevo ? '1' : '0'); } catch { /* ignore */ }
  };

  return (
    <PullToRefresh onRefresh={async () => { await loadData(); }}>
      <PageHint pageId="tramites-list" />
      {/* Toggle vista guiada / clásica */}
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={toggleVista}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
          style={{
            backgroundColor: vistaInbox ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `1px solid ${vistaInbox ? theme.primary + '60' : theme.border}`,
            color: vistaInbox ? theme.primary : theme.textSecondary,
          }}
          title={vistaInbox ? 'Cambiar a vista clásica' : 'Cambiar a vista guiada'}
        >
          {vistaInbox ? <LayoutList className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
          {vistaInbox ? 'Vista guiada' : 'Vista clásica'}
        </button>
      </div>

      {vistaInbox ? (
        <>
          {inboxView}
          {/* Sheet del trámite sigue funcionando con selectedTramite */}
        </>
      ) : (
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
      )}

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
          <div className="space-y-3">
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
              const tipoDetalle = selectedTramite.tramite?.categoria_tramite;
              const colorDetalle = tipoDetalle?.color || theme.primary;
              return (
                <div
                  className="p-3 rounded-xl"
                  style={{
                    backgroundColor: `${colorDetalle}10`,
                    border: `1px solid ${colorDetalle}30`
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${colorDetalle}20` }}
                    >
                      <DynamicIcon
                        name={tipoDetalle?.icono || 'FileText'}
                        className="h-5 w-5"
                        style={{ color: colorDetalle }}
                        fallback={<FileText className="h-5 w-5" style={{ color: colorDetalle }} />}
                      />
                    </div>
                    <div className="leading-tight">
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
              <h3 className="text-xs font-medium mb-1 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                Asunto
              </h3>
              <p className="font-medium" style={{ color: theme.text }}>
                {selectedTramite.asunto}
              </p>
              {selectedTramite.descripcion && (
                <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                  {selectedTramite.descripcion}
                </p>
              )}
            </div>

            {/* Datos del solicitante */}
            <div
              className="px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <h3 className="text-sm font-medium mb-2" style={{ color: theme.text }}>
                Datos del Solicitante
              </h3>
              <div className="space-y-1.5">
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

            {/* Checklist de verificación de documentos requeridos */}
            <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium" style={{ color: theme.text }}>
                  Verificación de documentos
                </h3>
                {user?.rol !== 'vecino' && (checklistData?.total_obligatorios_subidos ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`,
                      color: '#fff',
                      boxShadow: `0 4px 10px ${theme.primary}40`,
                    }}
                  >
                    <FileSearch className="h-4 w-4" />
                    Revisar docs
                  </button>
                )}
              </div>
              <ChecklistDocumentosVerificacion
                key={`${selectedTramite.id}-v${checklistVersion}`}
                solicitudId={selectedTramite.id}
                readOnly={user?.rol === 'vecino'}
                onDataChange={setChecklistData}
              />
            </div>

            {/* Asignación de empleado - Solo si no está en proceso/finalizado/rechazado */}
            {(() => {
              const estadosBloqueados: EstadoCanonico[] = ['finalizado', 'rechazado'];
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
                  className="px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <div className="flex items-center justify-between mb-2">
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

                  {/* Dependencia actual */}
                  {selectedTramite.dependencia_asignada && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ backgroundColor: `${selectedTramite.dependencia_asignada.color || theme.primary}10`, border: `1px solid ${selectedTramite.dependencia_asignada.color || theme.primary}30` }}>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ backgroundColor: selectedTramite.dependencia_asignada.color || theme.primary, color: '#fff' }}
                      >
                        {selectedTramite.dependencia_asignada.nombre?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: theme.text }}>
                          {selectedTramite.dependencia_asignada.nombre}
                        </p>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>
                          {tramiteCerrado ? 'Dependencia responsable' : 'Actualmente asignado'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Separador entre dep actual y cambiar */}
                  {selectedTramite.dependencia_asignada && !tramiteCerrado && (
                    <div className="h-px mb-3" style={{ backgroundColor: theme.border }} />
                  )}
                  {!tramiteCerrado && (
                    <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
                      Cambiar dependencia
                    </p>
                  )}

                  {/* Controles de asignación - Solo si el trámite no está cerrado */}
                  {tramiteCerrado ? (
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: `${theme.border}30` }}
                    >
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        No se puede modificar la asignación de un trámite {
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

            {/* Responsable asignado (opcional) — empleado especifico segun carga/horarios */}
            {selectedTramite && !['finalizado', 'rechazado'].includes(normalizeEstado(selectedTramite.estado)) && (
              <div className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium" style={{ color: theme.text }}>
                    Responsable
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${theme.textSecondary}15`, color: theme.textSecondary }}>
                    Opcional
                  </span>
                </div>
                <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
                  Empleado específico a cargo. Si no se asigna, el trámite queda a cargo colectivo de la dependencia.
                </p>

                {/* Separador visual */}
                <div className="h-px mb-2" style={{ backgroundColor: theme.border }} />

                {/* Responsable actual */}
                {responsableId && (() => {
                  const resp = empleadosDisponibilidad.find(e => e.id === responsableId);
                  if (!resp) return null;
                  return (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ backgroundColor: theme.primary, color: '#fff' }}
                      >
                        {resp.nombre?.[0]}{resp.apellido?.[0]}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: theme.text }}>
                          {resp.nombre} {resp.apellido || ''}
                        </p>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>
                          {resp.especialidad || 'Responsable actual'}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Selector + botón */}
                <div className="flex gap-2 items-end">
                  {(() => {
                    const respOptions: SelectOption[] = [
                      { value: '', label: 'Sin responsable asignado', icon: <UserPlus className="w-4 h-4" /> },
                      ...empleadosDisponibilidad.map(emp => {
                        const libre = 100 - (emp.porcentaje_ocupacion || 0);
                        const desc = [emp.horario_texto, `${libre}% libre`].filter(Boolean).join(' · ');
                        return {
                          value: String(emp.id),
                          label: `${emp.nombre} ${emp.apellido || ''}`.trim(),
                          description: desc,
                        };
                      }),
                    ];
                    return (
                      <div className="flex-1 min-w-0">
                        <ModernSelect
                          value={responsableId !== null ? String(responsableId) : ''}
                          onChange={(value) => setResponsableId(value ? Number(value) : null)}
                          options={respOptions}
                          placeholder="Sin responsable asignado"
                          searchable={empleadosDisponibilidad.length > 5}
                          disabled={loadingEmpleados || asignandoResponsable}
                        />
                      </div>
                    );
                  })()}
                  <button
                    onClick={handleAsignarResponsable}
                    disabled={asignandoResponsable || responsableId === (selectedTramite.empleado_id ?? null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all hover:scale-105"
                    style={{
                      background: responsableId
                        ? `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`
                        : theme.card,
                      color: responsableId ? '#ffffff' : theme.textSecondary,
                      border: responsableId ? 'none' : `1px solid ${theme.border}`,
                    }}
                  >
                    {asignandoResponsable ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {responsableId ? 'Asignar' : 'Quitar'}
                  </button>
                </div>
              </div>
            )}

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

            {/* Estado de pago — solo si el tramite tiene costo */}
            {estadoPago?.requiere_pago && (() => {
              const medioLabels: Record<string, { label: string; emoji: string; color: string }> = {
                tarjeta: { label: 'Tarjeta', emoji: '💳', color: '#3b82f6' },
                qr: { label: 'QR', emoji: '📱', color: '#8b5cf6' },
                efectivo_cupon: { label: 'Rapipago (efectivo)', emoji: '🧾', color: '#ef4444' },
                transferencia: { label: 'Transferencia', emoji: '🏦', color: '#14b8a6' },
                debito_automatico: { label: 'Débito automático', emoji: '🔁', color: '#10b981' },
              };
              const estadoLabels: Record<string, { label: string; color: string }> = {
                pending: { label: 'Pendiente de inicio', color: '#6b7280' },
                in_checkout: { label: 'En checkout', color: '#3b82f6' },
                approved: { label: 'Aprobado', color: '#10b981' },
                rejected: { label: 'Rechazado', color: '#ef4444' },
                expired: { label: 'Expirado', color: '#f59e0b' },
                cancelled: { label: 'Cancelado', color: '#6b7280' },
              };
              const tramiteCfg: any = (selectedTramite as any).tramite || {};
              const tipoPagoConfig = tramiteCfg.tipo_pago;
              const momentoPagoConfig = tramiteCfg.momento_pago;
              const pagado = estadoPago.pagado;

              return (
                <div
                  className="px-3 py-2.5 rounded-xl space-y-2"
                  style={{
                    backgroundColor: pagado ? '#10b98110' : '#f59e0b10',
                    border: `1px solid ${pagado ? '#10b98140' : '#f59e0b40'}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{pagado ? '✅' : '💳'}</span>
                      <span className="text-sm font-semibold" style={{ color: theme.text }}>
                        Estado del pago
                      </span>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: pagado ? '#10b98125' : '#f59e0b25',
                        color: pagado ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {pagado ? 'PAGADO' : 'PENDIENTE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: theme.textSecondary }}>Monto</p>
                      <p className="font-bold" style={{ color: theme.text }}>
                        ${estadoPago.costo.toLocaleString('es-AR')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: theme.textSecondary }}>Método configurado</p>
                      <p className="font-medium" style={{ color: theme.text }}>
                        {tipoPagoConfig === 'boton_pago' ? '💳 Botón de Pago'
                          : tipoPagoConfig === 'rapipago' ? '🧾 Rapipago'
                          : tipoPagoConfig === 'adhesion_debito' ? '🔁 Adhesión Débito'
                          : tipoPagoConfig === 'qr' ? '📱 QR'
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: theme.textSecondary }}>Momento</p>
                      <p className="font-medium" style={{ color: theme.text }}>
                        {momentoPagoConfig === 'fin' ? 'Al retirar' : 'Al iniciar'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: theme.textSecondary }}>Intentos</p>
                      <p className="font-medium" style={{ color: theme.text }}>
                        {estadoPago.intentos_total} {estadoPago.intentos_fallidos > 0 && (
                          <span style={{ color: '#ef4444' }}>· {estadoPago.intentos_fallidos} fallidos</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {pagado && (
                    <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: '#10b98115', color: '#10b981', border: '1px solid #10b98130' }}>
                      <p className="font-semibold mb-1">✅ Pago confirmado</p>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        {estadoPago.fecha_pago && (
                          <p><span className="opacity-70">Fecha:</span> {new Date(estadoPago.fecha_pago).toLocaleString('es-AR')}</p>
                        )}
                        {estadoPago.medio_pago && (
                          <p><span className="opacity-70">Medio:</span> {medioLabels[estadoPago.medio_pago]?.label || estadoPago.medio_pago}</p>
                        )}
                        {estadoPago.sesion_aprobada_id && (
                          <p className="col-span-2"><span className="opacity-70">N° operación:</span> <span className="font-mono">{estadoPago.sesion_aprobada_id}</span></p>
                        )}
                      </div>
                    </div>
                  )}

                  {!pagado && estadoPago.intentos_total === 0 && (
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      El vecino todavía no inició el pago. No se puede finalizar el trámite hasta que pague.
                    </p>
                  )}

                  {/* Botón "Mandar cupón por WhatsApp" — siempre visible mientras
                      el pago esté pendiente, idempotente (reusa PagoSesion PENDING). */}
                  {!pagado && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedTramite) return;
                        try {
                          const r = await pagosApi.cuponTramiteWa(selectedTramite.id);
                          if (r.data.wa_me_url) {
                            window.open(r.data.wa_me_url, '_blank', 'noopener,noreferrer');
                          } else {
                            toast.error('El vecino no tiene teléfono cargado. Copiá el link y mandalo manualmente.');
                            try {
                              await navigator.clipboard.writeText(r.data.checkout_url);
                              toast.success('Link de pago copiado al portapapeles');
                            } catch { /* ignore */ }
                          }
                        } catch (e: unknown) {
                          const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                          toast.error(msg || 'No se pudo generar el cupón');
                        }
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95"
                      style={{ backgroundColor: '#25d366' }}
                    >
                      📱 Mandar cupón de pago por WhatsApp
                    </button>
                  )}

                  {!pagado && estadoPago.intentos_total > 0 && (
                    <div className="text-xs" style={{ color: theme.textSecondary }}>
                      <p className="font-medium mb-1" style={{ color: '#ef4444' }}>Intentos previos sin éxito:</p>
                      <div className="space-y-1">
                        {estadoPago.sesiones.slice(0, 3).map(s => {
                          const est = estadoLabels[s.estado] || { label: s.estado, color: theme.textSecondary };
                          return (
                            <div key={s.session_id} className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded" style={{ backgroundColor: theme.card }}>
                              <span style={{ color: est.color }}>● {est.label}</span>
                              {s.created_at && <span className="opacity-70">{new Date(s.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Historial */}
            <div
              className="px-3 py-2.5 rounded-xl"
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
                <div className="mt-3 space-y-2">
                  {historial.map(h => (
                    <div
                      key={h.id}
                      className="px-2.5 py-2 rounded-lg"
                      style={{ backgroundColor: theme.card }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: theme.text }}>
                            {h.accion}
                          </p>
                          {h.comentario && (
                            <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                              {h.comentario}
                            </p>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          {new Date(h.created_at).toLocaleString('es-AR')}
                        </span>
                      </div>
                      {h.estado_anterior && h.estado_nuevo && (
                        <div className="flex items-center gap-2 mt-1.5">
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

            {/* Respuesta/observaciones existentes */}
            {(selectedTramite.respuesta || selectedTramite.observaciones) && (
              <div
                className="px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                {selectedTramite.respuesta && (
                  <div className={selectedTramite.observaciones ? 'mb-2' : ''}>
                    <h4 className="text-xs font-medium mb-0.5" style={{ color: theme.textSecondary }}>
                      Respuesta
                    </h4>
                    <p className="text-sm" style={{ color: theme.text }}>
                      {selectedTramite.respuesta}
                    </p>
                  </div>
                )}
                {selectedTramite.observaciones && (
                  <div>
                    <h4 className="text-xs font-medium mb-0.5" style={{ color: theme.textSecondary }}>
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

      {/* Wizard para nueva solicitud (empleado en ventanilla) */}
      <CrearSolicitudWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setServicioInicial(null);
        }}
        onSuccess={() => loadData()}
        tramiteInicial={servicioInicial}
      />

      {/* Modal fullscreen para revisar documentos (aprobar/rechazar con motivo) */}
      {selectedTramite && checklistData && (
        <DocumentReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          solicitudId={selectedTramite.id}
          items={checklistData.items}
          onChange={async () => {
            // Remount del Checklist para que re-fetcheé y se vean los checks
            // actualizados al cerrar el modal (antes el Checklist mantenía su
            // state interno y el último aprobado quedaba "desync").
            setChecklistVersion(v => v + 1);
            try {
              const res = await tramitesApi.getChecklistDocumentos(selectedTramite.id);
              setChecklistData(res.data);
            } catch (e) {
              console.error(e);
            }
            loadData();
          }}
        />
      )}
    </PullToRefresh>
  );
}
