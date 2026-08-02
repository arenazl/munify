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
  Eye,
  User,
  Send,
  Loader2,
  CalendarDays,
  Sparkles,
  UserPlus,
  History,
  ChevronDown,
  ChevronUp,
  Copy,
  ArrowUpDown,
  Calendar,
  PlayCircle,
  LayoutList,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi, empleadosApi, categoriasTramiteApi, dependenciasApi, pagosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Sheet } from '../components/ui/Sheet';
import { CrearSolicitudWizard } from '../components/tramites/CrearSolicitudWizard';
import { ChecklistDocumentosVerificacion } from '../components/tramites/ChecklistDocumentosVerificacion';
import { DocumentReviewModal } from '../components/tramites/DocumentReviewModal';
// Suite del estándar SemanticAbmPage (rediseño v2). Composición manual de las
// piezas (PageHeader/ListToolbar/FilterBar/DataTable), igual que Reclamos.tsx:
// el orquestador todavía no soporta las vistas alternativas (cards/guiada) de
// esta pantalla. El contrato de props ES el del estándar, incluido el ORDEN
// v2.2: cabecera → hero → (toolbar + filtros como una sola tarjeta) → tabla.
import { PageHeader } from '../components/abmv2/PageHeader';
import { ListToolbar } from '../components/abmv2/ListToolbar';
import { FilterBar } from '../components/abmv2/FilterBar';
import { DataTable, EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import { toneDeEstado as toneChipDeEstado } from '../components/abmv2/estadoTonos';
import type { ColumnSpec, RowAction, StatusTab, TableGroup, ViewKind } from '../components/abmv2/types';
import { FilaLista, type FilaListaItem } from '../components/ui/FilaLista';
import { useEsAngosto } from '../hooks/useEsAngosto';
import { haceCuanto, tonoDeEstado } from '../lib/filaLista-helpers';
import { DashboardIAPanel, DashboardIAData } from '../components/ui/DashboardIAPanel';
import { useIaTramites } from '../hooks/useIaHabilitada';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor, veredictoTasa } from '../lib/veredictos';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { InboxLayout } from '../components/inbox/InboxLayout';
import { InboxCard } from '../components/inbox/InboxCard';
import { prioridadIcon, prioridadLabel, prioridadSeverityColor, prioridadRankOf, prioridadOTFromNumero } from '../lib/enums/prioridad';
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

// Fecha de vencimiento estimada de un trámite = created_at + tiempo_estimado_dias
// del trámite (fallback 15 días). Compartida entre el cálculo de "zona urgente"
// del inbox, el orden de "Empecemos por lo urgente" y el render de cada card —
// antes vivía duplicada en 2 lugares distintos del inbox (mismo patrón que
// `getFechaVenceReclamoMs` en Reclamos.tsx).
const getFechaVenceTramiteMs = (t: Solicitud): number | null => {
  const dias = t.tramite?.tiempo_estimado_dias || 15;
  return t.created_at
    ? new Date(t.created_at).getTime() + dias * 24 * 60 * 60 * 1000
    : null;
};

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


/**
 * Una solicitud de tramite, dicha como una fila de listado.
 *
 * Mismo criterio que en reclamos: que es, de quien y hace cuanto. El nombre
 * del tramite aparecia DOS VECES en la tarjeta vieja (en un chip y otra vez
 * en el titulo); aca va una sola.
 */
function aFilaTramite(t: Solicitud, onClick: () => void): FilaListaItem {
  const vecino =
    `${t.nombre_solicitante || ''} ${t.apellido_solicitante || ''}`.trim() || null;
  const area = t.tramite?.categoria_tramite?.nombre || t.tramite?.nombre || null;
  return {
    id: t.id,
    titulo: t.tramite?.nombre || t.asunto || 'Tramite',
    meta: [vecino, area, `#${t.id}`],
    estado: { label: getEstadoConfig(t.estado).label, tono: tonoDeEstado(t.estado) },
    hace: haceCuanto(t.created_at),
    onClick,
  };
}

/** Fecha de vencimiento estimada de una solicitud (created_at + los días
 *  estimados del trámite). Sin días estimados no hay vencimiento que mostrar.
 *  Módulo-scope: no depende de nada del componente y la usan las columnas. */
function calcularVencimiento(t: Solicitud): Date | null {
  const tiempoEstimado = t.tramite?.tiempo_estimado_dias || 0;
  if (!tiempoEstimado) return null;
  const fechaVencimiento = new Date(t.created_at);
  fechaVencimiento.setDate(fechaVencimiento.getDate() + tiempoEstimado);
  return fechaVencimiento;
}

/** Fecha corta d/m/aa — mismo formato que la tabla de Reclamos. */
const fechaCorta = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
};

// Columnas del DataTable del estándar SemanticAbmPage (kind='plain'), espejo
// de las de Reclamos.tsx con los datos de trámites:
// # · TRÁMITE · SOLICITANTE · ESTADO · CREADO · VENCE (+ ACCIONES).
// Los colores de categoría/dependencia vienen de DATOS (runtime) — permitidos
// por la regla polimórfica; el resto sale de las clases av2-* con tokens.
const columnasTabla: ColumnSpec<Solicitud>[] = [
  {
    id: 'id',
    header: '#',
    width: '58px',
    kind: 'text',
    cell: (t) => <span className="av2-tabla-texto av2-tnum">#{t.id}</span>,
  },
  {
    id: 'tramite',
    header: 'TRÁMITE',
    width: 'minmax(220px, 2fr)',
    kind: 'entity',
    cell: (t) => {
      const tipo = t.tramite?.categoria_tramite;
      // Sin color en datos, EntityCell cae al tile neutro por tokens.
      const tipoColor = tipo?.color || undefined;
      return (
        <EntityCell
          icon={
            <DynamicIcon
              name={t.tramite?.icono || tipo?.icono || 'FileText'}
              className="h-4 w-4"
              fallback={<FileText className="h-4 w-4" />}
            />
          }
          tileColor={tipoColor}
          title={t.tramite?.nombre || t.asunto || 'Trámite'}
          subtitle={tipo?.nombre}
          dotColor={tipoColor}
        />
      );
    },
  },
  {
    id: 'solicitante',
    header: 'SOLICITANTE',
    width: 'minmax(150px, 1.25fr)',
    kind: 'entity',
    cell: (t) => {
      // Tolera el shape legacy anidado ({ dependencia: { nombre } }) además del plano.
      const dep = t.dependencia_asignada as
        | { nombre?: string; color?: string; dependencia?: { nombre?: string; color?: string } }
        | undefined;
      const depNombre = dep?.dependencia?.nombre || dep?.nombre;
      const depColor = dep?.color || dep?.dependencia?.color;
      const nombre =
        `${t.nombre_solicitante || ''} ${t.apellido_solicitante || ''}`.trim() || '—';
      return (
        <EntityCell icon={User} tileColor={depColor} title={nombre} subtitle={depNombre} dotColor={depColor} />
      );
    },
  },
  {
    id: 'estado',
    header: 'ESTADO',
    width: 'minmax(88px, 110px)',
    kind: 'chip',
    // Label por el SSoT de estados (lib/estadoConfig) y tono por el SSoT de
    // chips del estándar, sobre la key CANÓNICA — así los estados legacy de
    // trámites (iniciado, en_revision…) pintan igual que en el resto de la app.
    cell: (t) => (
      <ChipEstado
        label={getEstadoConfig(t.estado).label}
        tone={toneChipDeEstado(normalizeEstado(t.estado))}
      />
    ),
  },
  {
    id: 'creado',
    header: 'CREADO',
    width: 'minmax(66px, 80px)',
    kind: 'date',
    cell: (t) => <span className="av2-tabla-fecha av2-tnum">{fechaCorta(t.created_at)}</span>,
  },
  {
    id: 'vence',
    header: 'VENCE',
    width: 'minmax(70px, 96px)',
    kind: 'chip',
    cell: (t) => {
      const venc = calcularVencimiento(t);
      if (!venc) return <span className="av2-tabla-texto">—</span>;
      const diffDias = Math.ceil((venc.getTime() - Date.now()) / 86400000);
      const vencido = diffDias < 0;
      const porVencer = !vencido && diffDias <= 3;
      const diasAbs = Math.abs(diffDias);
      let texto: string;
      if (diffDias === 0) texto = 'Hoy';
      else if (diasAbs < 30) texto = vencido ? `-${diasAbs} días` : `${diasAbs} días`;
      else {
        const meses = Math.floor(diasAbs / 30);
        texto = `${vencido ? '-' : ''}${meses} ${meses > 1 ? 'meses' : 'mes'}`;
      }
      return <ChipEstado label={texto} tone={vencido ? 'red' : porVencer ? 'amber' : 'green'} />;
    },
  },
  { id: 'acciones', header: 'ACCIONES', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
];

export default function GestionTramites({ soloMiArea = false }: GestionTramitesProps) {
  const { theme } = useTheme();
  // Pantalla de telefono: las tarjetas se dibujan como filas (misma pieza que
  // Reclamos). Es un cambio de ARBOL, no de estilo.
  const esAngosto = useEsAngosto();
  const { user, municipioActual } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tramites, setTramites] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Tramite[]>([]);
  const [tipos, setTipos] = useState<CategoriaTramite[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Vista del listado (segmented del ListToolbar estándar): tabla / tarjetas /
  // guiada (Inbox). Persiste en localStorage con la MISMA key que usaba ABMPage
  // ('tramites_view') para respetar la elección previa de cada usuario.
  const [activeView, setActiveView] = useState<ViewKind>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('tramites_view') : null;
    return saved === 'cards' || saved === 'guided' || saved === 'table' ? saved : 'table';
  });
  // La vista guiada trae TODO de un saque (el algoritmo de densidad del Inbox
  // necesita el universo) y no pagina: varios lugares preguntan por eso.
  const vistaInbox = activeView === 'guided';
  const cambiarVista = (v: ViewKind) => {
    setActiveView(v);
    if (typeof window !== 'undefined') localStorage.setItem('tramites_view', v);
    // El limit del fetch cambia según la vista (guiada=500, resto=30): se
    // recarga pasando la vista NUEVA explícita — leerla del state daría el
    // valor viejo (el re-render todavía no ocurrió).
    loadTramites(filtroTipo, filtroEstado, searchTerm, filtroTramite, v === 'guided');
  };

  // Filtros visuales estilo Reclamos
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  // Dependencia: filtro client-side sobre filteredTramites (no se envia al backend).
  const [filtroDependencia, setFiltroDependencia] = useState<number | null>(null);
  const [dependenciasOpts, setDependenciasOpts] = useState<Array<{ id: number; nombre: string; color?: string }>>([]);
  const [filtroTramite, setFiltroTramite] = useState<number | null>(null); // Filtro por servicio específico
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'por_vencer'>('reciente');
  const [conteosTipos, setConteosTipos] = useState<Array<{ id: number; nombre: string; icono: string; color: string; cantidad: number }>>([]);
  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});
  // Ventana visible del listado: se agranda de a PAGE_SIZE con "Cargar más"
  // del pie de la tabla (mismo patrón que Reclamos).
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);


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

  const [dashboardIA, setDashboardIA] = useState<DashboardIAData | null>(null);
  const [dashboardIALoading, setDashboardIALoading] = useState(false);
  const [iaCollapsed, setIaCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dashboard_ia_collapsed') !== '0'; } catch { return true; }
  });
  // IA del muni: si está apagada, no montamos el panel ni reservamos su columna
  // (la grilla ocupa el 100% del ancho). La IA funcional —auto-asignación,
  // clasificación— es independiente de este flag y sigue operando.
  const iaOn = useIaTramites();

  useEffect(() => {
    if (soloMiArea) return;
    let cancelled = false;
    setDashboardIALoading(true);
    tramitesApi.getDashboardIA(false)
      .then((res) => { if (!cancelled) setDashboardIA(res.data as DashboardIAData); })
      .catch((e) => console.error('[Tramites] Error cargando Dashboard IA:', e))
      .finally(() => { if (!cancelled) setDashboardIALoading(false); });
    return () => { cancelled = true; };
  }, [soloMiArea]);
  const LIMIT = 30;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
    // Pre-cargar dependencias del muni para que el combo "Dependencias" del
    // toolbar tenga opciones desde el primer render (sin esperar a que el
    // user abra el sheet de un tramite).
    loadEmpleadosDisponibilidad();
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
  const loadTramites = async (
    tipo?: number | null,
    estado?: string,
    search?: string,
    tramiteId?: number | null,
    vistaGuiada?: boolean,
  ) => {
    try {
      // En vista guiada (inbox) traemos todos los pendientes de un saque
      // para que el algoritmo de densidad agrupe bien. En vista clásica
      // mantenemos paginación tradicional. `vistaGuiada` explícito para el
      // cambio de vista (el state todavía tiene el valor viejo en ese click).
      const guiada = vistaGuiada !== undefined ? vistaGuiada : vistaInbox;
      const limitEfectivo = guiada ? 500 : LIMIT;
      const params: Record<string, unknown> = {
        limit: limitEfectivo,
        skip: 0,
      };
      // Usar parámetros explícitos o valores actuales del state
      const tipoFiltro = tipo !== undefined ? tipo : filtroTipo;
      const estadoFiltro = estado !== undefined ? estado : filtroEstado;
      const searchFiltro = search !== undefined ? search : searchTerm;
      const tramiteFiltro = tramiteId !== undefined ? tramiteId : filtroTramite;

      if (tipoFiltro) params.categoria_tramite_id = tipoFiltro;
      if (tramiteFiltro) params.tramite_id = tramiteFiltro;
      if (estadoFiltro) params.estado = estadoFiltro.toLowerCase();
      if (searchFiltro && searchFiltro.trim()) params.search = searchFiltro.trim();
      if (soloMiArea && user?.dependencia?.id) {
        params.municipio_dependencia_id = user.dependencia.id;
      }

      const res = await tramitesApi.getGestionSolicitudes(params as any);
      setTramites(res.data);
      setSkip(limitEfectivo);
      setHasMore(!guiada && res.data.length >= LIMIT);
    } catch (error) {
      console.error('[GestionTramites] Error cargando trámites:', error);
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
      if (filtroEstado) params.estado = filtroEstado.toLowerCase();
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
    } catch (error) {
      console.error('Error cargando conteos:', error);
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
        color?: string;
      }>;
      // Guardamos las opciones para el combo de filtro de la barra de filtros.
      setDependenciasOpts(deps.map(d => ({ id: d.id, nombre: d.nombre, color: d.color })));
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
  // Header propio del Sheet — mismo lenguaje que el detalle de Reclamos
  // (diseño "Reclamo Detalle" del canvas): eyebrow + copiar + navegación
  // entre los trámites de la lista visible, título display y fila de meta.
  const renderTramiteHeader = () => {
    if (!selectedTramite) return undefined;
    const idx = filteredTramites.findIndex((t) => t.id === selectedTramite.id);
    const total = filteredTramites.length;
    const irA = (i: number) => {
      const destino = filteredTramites[i];
      if (destino) openTramite(destino);
    };
    const cfg = getEstadoConfig(selectedTramite.estado);
    const tipo =
      selectedTramite.tramite?.categoria_tramite?.nombre ||
      selectedTramite.tramite?.nombre ||
      'Sin tipo';
    const t = haceCuanto(selectedTramite.created_at);
    const antiguedad = !t || t === 'recién' ? t : `hace ${t}`;
    return (
      <div className="rs-head">
        <div className="rs-head-fila">
          <span className="rs-eyebrow">Trámite {selectedTramite.numero_tramite}</span>
          <button
            type="button"
            className="rs-nav-btn"
            title="Copiar número"
            aria-label="Copiar número"
            onClick={() => {
              navigator.clipboard.writeText(selectedTramite.numero_tramite);
              toast.success('Número copiado');
            }}
          >
            <Copy className="h-3 w-3" />
          </button>
          {idx >= 0 && total > 1 && (
            <span className="rs-nav">
              <button
                type="button"
                className="rs-nav-btn"
                aria-label="Anterior"
                disabled={idx <= 0}
                onClick={() => irA(idx - 1)}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="rs-nav-pos">{idx + 1} de {total} en la lista</span>
              <button
                type="button"
                className="rs-nav-btn"
                aria-label="Siguiente"
                disabled={idx >= total - 1}
                onClick={() => irA(idx + 1)}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </span>
          )}
          <span className="rs-head-icos">
            <button type="button" className="rs-ico-btn" title="Cerrar" aria-label="Cerrar" onClick={closeSheet}>
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>

        <h2 className="rs-titulo">{selectedTramite.asunto}</h2>

        <div className="rs-meta">
          <span className="rs-estado" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            <span className="rs-estado-dot" style={{ backgroundColor: cfg.color }} />
            {cfg.label}
          </span>
          <span className="rs-meta-sep">·</span>
          <span style={{ fontWeight: 600, color: 'var(--pl-text)' }}>{tipo}</span>
          {antiguedad && (
            <>
              <span className="rs-meta-sep">·</span>
              <span>{antiguedad}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderTramiteFooter = () => {
    if (!selectedTramite) return null;

    const estadoActual = normalizeEstado(selectedTramite.estado);

    // Estados finales - banda informativa plana (mismo lenguaje que Reclamos)
    if (estadoActual === 'rechazado' || estadoActual === 'finalizado') {
      const esFinal = estadoActual === 'finalizado';
      const c = esFinal ? '#059669' : '#ef4444';
      const IconoFinal = esFinal ? CheckCircle2 : XCircle;
      return (
        <div className="av2-sheet-final" style={{ backgroundColor: `${c}14`, color: c }}>
          <IconoFinal className="h-4 w-4" />
          {esFinal ? 'Trámite finalizado' : 'Trámite rechazado'}
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
          <CreditCard className="h-5 w-5 flex-shrink-0" />
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
            className={`${
              a.variant === 'solid'
                ? 'rs-cta'
                : a.id === 'rechazado'
                  ? 'rs-btn rs-btn--peligro'
                  : 'rs-btn'
            } w-full justify-center ${a.fullRow ? 'col-span-2' : ''}`}
          >
            {a.variant === 'solid' && <Check className="h-4 w-4" />}
            {isThisLoading ? a.loadingLabel : a.label}
          </button>
          );
        })}
      </div>
    );
  };

  // Agrupar servicios por tipo (alimenta el combo "Trámite" de la barra de filtros)
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

  // Aplicar filtro de dependencia (client-side) + ordenamiento del header
  const filteredTramites = tramites
    .filter(t => filtroDependencia === null || t.dependencia_asignada?.id === filtroDependencia)
    .sort((a, b) => {
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

  // Ventana visible: las primeras `page * PAGE_SIZE` filas de lo filtrado. El
  // pie de la tabla la agranda ("Cargar más") y, cuando se agotó lo cargado,
  // pide la página siguiente al server — mismo comportamiento que Reclamos.
  const visibleTramites = useMemo(
    () => filteredTramites.slice(0, page * PAGE_SIZE),
    [filteredTramites, page, PAGE_SIZE],
  );
  const hayMasLocal = visibleTramites.length < filteredTramites.length;

  // La ventana vuelve al principio cuando cambia lo que se está mirando
  // (filtros o búsqueda), NO cuando la lista crece: si dependiera del largo,
  // cada "Cargar más" del server la colapsaría de nuevo a la primera página.
  useEffect(() => {
    setPage(1);
  }, [filtroTipo, filtroEstado, filtroTramite, filtroDependencia, searchTerm]);

  // Grupos por día para el DataTable del estándar (la página agrupa y formatea;
  // el DataTable solo pinta). Criterio espejo de Reclamos: 'reciente' → agrupa
  // por día de creación; 'por_vencer' → por día de vencimiento estimado, con
  // los que no tienen tiempo estimado al final. Las filas ya vienen ordenadas
  // por `filteredTramites` con el mismo criterio.
  const gruposTabla = useMemo<TableGroup<Solicitud>[]>(() => {
    const grupos: TableGroup<Solicitud>[] = [];
    let actual: TableGroup<Solicitud> | null = null;
    for (const t of visibleTramites) {
      const fecha = ordenamiento === 'por_vencer' ? calcularVencimiento(t) : new Date(t.created_at);
      const d = fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
      const key = d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : 'sin-fecha';
      if (!actual || actual.key !== key) {
        actual = {
          key,
          badge: d
            ? {
                top: String(d.getDate()),
                bottom: d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase(),
              }
            : undefined,
          label: '',
          rows: [],
        };
        grupos.push(actual);
      }
      actual.rows.push(t);
    }
    for (const g of grupos) {
      const n = g.rows.length;
      const base = `${n} trámite${n === 1 ? '' : 's'}`;
      g.label = g.key === 'sin-fecha' ? `Sin vencimiento estimado · ${base}` : base;
    }
    return grupos;
  }, [visibleTramites, ordenamiento]);

  // Render de las tarjetas de la vista 'cards' (escritorio). El estado de carga
  // y la lista de teléfono los resuelve el cuerpo de la página, no esta función.
  const renderCards = () => {
    return visibleTramites.map((t) => {
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

  // ============================================================
  // INBOX (vista guiada) — secciones por urgencia/estado
  // ============================================================
  const inboxData = useMemo(() => {
    const ahora = Date.now();
    const dia = 24 * 60 * 60 * 1000;

    const urgentes: Solicitud[] = [];
    const fosiles: Solicitud[] = [];   // vencidos hace > 30 días — para limpiar
    const nuevos: Solicitud[] = [];
    const enCurso: Solicitud[] = [];
    const esperando: Solicitud[] = [];

    for (const t of tramites) {
      const estado = (t.estado || '').toLowerCase();
      // Excluir cerrados de la vista guiada
      if (estado === 'finalizado' || estado === 'rechazado') continue;

      // Vencimiento estimado = created_at + tiempo_estimado_dias del trámite
      const fechaVence = getFechaVenceTramiteMs(t);
      const diffMs = fechaVence ? fechaVence - ahora : null;

      // Capa 1: fósil — venció hace más de 30 días. Se manda a "Para limpiar"
      // y NO entra en urgente (probablemente nadie lo va a tomar igual).
      if (diffMs != null && diffMs < -30 * dia) {
        fosiles.push(t);
        continue;
      }

      // Capa 2: el ESTADO manda sobre la urgencia. Si el tramite ya esta
      // en curso o esperando algo, vive en su seccion correspondiente
      // aunque sea urgente — la urgencia ya esta atendida.
      if (estado === 'pendiente_pago' || estado === 'pospuesto') {
        esperando.push(t);
        continue;
      }
      if (estado === 'en_curso') {
        enCurso.push(t);
        continue;
      }

      // Capa 3: urgente real — solo entre los que aun no fueron tomados.
      // Prioridad manual = 1 OR vence entre -7 y +3 dias.
      const enZonaUrgente = diffMs != null && diffMs >= -7 * dia && diffMs <= 3 * dia;
      const esUrgente = t.prioridad === 1 || enZonaUrgente;
      if (esUrgente) {
        urgentes.push(t);
        continue;
      }

      // Resto: nuevos sin tomar
      nuevos.push(t);
    }

    // Orden de "Empecemos por lo urgente": mismo criterio que Reclamos —
    // prioridad desc (urgente > alta > media > baja, mapeando la escala legacy
    // 1-5 de Trámites al enum canónico) y, a igual prioridad, por fecha de
    // vencimiento asc.
    urgentes.sort((a, b) => {
      const porPrioridad = prioridadRankOf(prioridadOTFromNumero(b.prioridad))
        - prioridadRankOf(prioridadOTFromNumero(a.prioridad));
      if (porPrioridad !== 0) return porPrioridad;
      const vA = getFechaVenceTramiteMs(a) ?? Infinity;
      const vB = getFechaVenceTramiteMs(b) ?? Infinity;
      return vA - vB;
    });

    return { urgentes, fosiles, nuevos, enCurso, esperando };
  }, [tramites]);

  const renderInboxCard = (
    t: Solicitud,
    opts?: { urgente?: boolean; density?: 'large' | 'compact' | 'row'; sectionColor?: string; mostrarPrioridad?: boolean },
  ) => {
    const cat = t.tramite?.categoria_tramite;
    const color = cat?.color || theme.primary;
    const ahora = Date.now();
    const fechaVence = getFechaVenceTramiteMs(t);
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
    // Antigüedad de la solicitud (independiente del vencimiento)
    let creadoLabel: string | undefined;
    if (t.created_at) {
      const d = Math.floor((ahora - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (d <= 0) creadoLabel = 'Hoy';
      else if (d === 1) creadoLabel = 'Ayer';
      else creadoLabel = `Hace ${d}d`;
    }
    const badges: Array<{ label: string; color: string }> = [];
    const estado = (t.estado || '').toLowerCase();
    if (estado === 'pendiente_pago') badges.push({ label: 'Pago pendiente', color: '#f59e0b' });
    if (estado === 'pospuesto') badges.push({ label: 'Pospuesto', color: '#8b5cf6' });
    const solicitanteNombre = [t.nombre_solicitante, t.apellido_solicitante]
      .filter(Boolean).join(' ').trim() || undefined;
    // Badge de prioridad (icono outline + color semáforo) — solo en la sección
    // "Empecemos por lo urgente". Mismo SSoT que Reclamos (lib/enums/prioridad),
    // mapeando la escala legacy 1-5 de Trámites al enum canónico.
    const prioridadBadge = opts?.mostrarPrioridad
      ? (() => {
          const p = prioridadOTFromNumero(t.prioridad);
          const PrioIcon = prioridadIcon(p);
          return {
            icon: <PrioIcon className="w-3 h-3" />,
            color: prioridadSeverityColor(p),
            label: prioridadLabel(p),
          };
        })()
      : undefined;
    return (
      <InboxCard
        numero={t.numero_tramite || `#${t.id}`}
        titulo={t.tramite?.nombre || 'Trámite'}
        subtitulo={t.asunto || undefined}
        solicitante={solicitanteNombre}
        tiempoLabel={tiempoLabel}
        creadoLabel={creadoLabel}
        color={color}
        sectionColor={opts?.sectionColor}
        icono={cat?.icono ? <DynamicIcon name={cat.icono} className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        badges={badges.length > 0 ? badges : undefined}
        prioridadBadge={prioridadBadge}
        ctaLabel={opts?.urgente ? 'Resolver ya' : 'Abrir'}
        onClick={() => openTramite(t)}
        urgente={opts?.urgente}
        density={opts?.density}
      />
    );
  };

  // El InboxLayout se arma siempre; el cuerpo de la página decide cuándo
  // montarlo (vista 'guided' del segmented del ListToolbar).
  const inboxView = (
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
        ...(inboxData.fosiles.length > 0 ? [
          { color: '#71717a', icon: <Calendar className="w-3.5 h-3.5" />, label: 'para limpiar', value: inboxData.fosiles.length },
        ] : []),
      ]}
      secciones={[
        {
          id: 'urgente',
          titulo: 'Empecemos por lo urgente',
          subtitulo: 'Marcados con prioridad alta o vencen en los próximos 3 días',
          icono: <AlertCircle className="w-5 h-5" />,
          color: '#ef4444',
          emptyMessage: '✨ Sin urgentes. Bandeja al día.',
          count: inboxData.urgentes.length,
          // Siempre cards grandes, sin importar la cantidad — mismo tratamiento
          // que Reclamos.tsx. Ya vienen ordenados por prioridad en inboxData.
          forceDensity: 'large',
          items: (density) => inboxData.urgentes.map((t) => renderInboxCard(t, { urgente: true, density, sectionColor: '#ef4444', mostrarPrioridad: true })),
        },
        {
          id: 'nuevos',
          titulo: 'Nuevos para tomar',
          subtitulo: 'Trámites que llegaron y nadie empezó todavía',
          icono: <Inbox className="w-5 h-5" />,
          color: '#3b82f6',
          emptyMessage: '🎉 No hay trámites nuevos sin tomar.',
          count: inboxData.nuevos.length,
          items: (density) => inboxData.nuevos.map((t) => renderInboxCard(t, { density, sectionColor: '#3b82f6' })),
        },
        {
          id: 'en-curso',
          titulo: 'Estás trabajando en estos',
          subtitulo: 'Trámites que ya tomaste — seguir avanzando',
          icono: <PlayCircle className="w-5 h-5" />,
          color: '#f59e0b',
          emptyMessage: 'Nada en curso ahora mismo.',
          count: inboxData.enCurso.length,
          items: (density) => inboxData.enCurso.map((t) => renderInboxCard(t, { density, sectionColor: '#f59e0b' })),
          colapsable: inboxData.enCurso.length > 6,
        },
        {
          id: 'esperando',
          titulo: 'Esperando al vecino',
          subtitulo: 'Pago pendiente, pospuestos, falta documentación',
          icono: <PauseCircle className="w-5 h-5" />,
          color: '#8b5cf6',
          emptyMessage: 'Sin trámites esperando.',
          count: inboxData.esperando.length,
          items: (density) => inboxData.esperando.map((t) => renderInboxCard(t, { density, sectionColor: '#8b5cf6' })),
          colapsable: true,
        },
        {
          id: 'fosiles',
          titulo: 'Para limpiar — vencidos hace mucho',
          subtitulo: 'Trámites que vencieron hace más de 30 días. Considerá rechazarlos o archivarlos.',
          icono: <Calendar className="w-5 h-5" />,
          color: '#71717a',
          emptyMessage: 'No hay trámites viejos sin atender.',
          count: inboxData.fosiles.length,
          items: (density) => inboxData.fosiles.map((t) => renderInboxCard(t, { density, sectionColor: '#71717a' })),
          colapsable: true,
        },
      ]}
    />
  );

  // KPIs del módulo: viven ADENTRO del hero (strip del SemanticHero, como
  // Reclamos). Los KpiCards sueltos murieron — regla del dueño: cero KPIs
  // sueltos, todas las pantallas con las mismas piezas del kit.
  const heroKpis: HeroKpi[] = useMemo(() => {
    if (!resumen) return [];
    const porEstado = resumen.por_estado || {};
    const total = resumen.total || 0;
    const recibidos = (porEstado['recibido'] || 0) + (porEstado['iniciado'] || 0);
    const enCurso = porEstado['en_curso'] || 0;
    const finalizados = porEstado['finalizado'] || 0;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return [
      { etiqueta: 'TOTAL', valor: total.toLocaleString('es-AR'), sub: `${resumen.hoy || 0} hoy` },
      { etiqueta: 'RECIBIDOS', valor: recibidos.toLocaleString('es-AR'), sub: `${pct(recibidos)}% del total` },
      { etiqueta: 'EN CURSO', valor: enCurso.toLocaleString('es-AR'), sub: `${pct(enCurso)}% del total` },
      { etiqueta: 'FINALIZADOS', valor: finalizados.toLocaleString('es-AR'), sub: `${pct(finalizados)}% del total` },
    ];
  }, [resumen]);

  // Hero semántico (reemplaza el hint estático): frases con datos REALES de
  // `resumen`. Si el resumen todavía no cargó, no se genera ninguna frase y
  // el componente no renderiza. Veredictos SOLO vía lib/veredictos.ts.
  const heroFrases: HeroFrase[] = useMemo(() => {
    if (!resumen) return [];
    const u = resolverUmbrales();
    const porEstado = resumen.por_estado || {};
    const recibidos = porEstado['recibido'] || 0;
    const enCurso = porEstado['en_curso'] || 0;
    const finalizados = porEstado['finalizado'] || 0;
    const frases: HeroFrase[] = [];

    frases.push({
      segmentos: [
        seg('Hoy entraron '),
        seg(`${resumen.hoy.toLocaleString('es-AR')} solicitudes`),
        seg('; hay '),
        seg(
          `${recibidos.toLocaleString('es-AR')} recibidas sin atender`,
          veredictoMasEsPeor(recibidos, u.sinAsignar),
        ),
        seg(' y '),
        seg(`${enCurso.toLocaleString('es-AR')} en curso`, 'bueno'),
        seg('.'),
      ],
      acciones: [
        { label: 'Mostrador', to: '/gestion/mostrador', primaria: true },
        { label: 'Agenda', to: '/gestion/agenda-turnos' },
      ],
    });

    if (resumen.total > 0) {
      const pctFinalizados = (finalizados / resumen.total) * 100;
      frases.push({
        segmentos: [
          seg('Se finalizaron '),
          seg(
            `${finalizados.toLocaleString('es-AR')} de ${resumen.total.toLocaleString('es-AR')} solicitudes (${pctFinalizados.toFixed(0)}%)`,
            veredictoTasa(pctFinalizados, u.tasaResolucion),
          ),
          seg('.'),
        ],
      });
    }

    return frases;
  }, [resumen]);

  // --- Specs del shell estándar (piloto SemanticAbmPage) ---
  // Cabecera de módulo (v2.2): eyebrow = el módulo, H1 = lo que el usuario
  // viene a resolver, bajada = de dónde salen las filas y cómo se agrupan.
  // Un copy por modo de la pantalla (general / dependencia): las dos listan lo
  // mismo pero NO son el mismo trabajo.
  const cabecera = soloMiArea
    ? {
        eyebrow: 'Trámites del área',
        title: 'Lo que le derivaron a tu dependencia y qué falta despachar',
        description:
          'Sólo las solicitudes derivadas a tu dependencia, con su categoría, su solicitante y su estado. La tabla las agrupa por día de ingreso.',
      }
    : {
        eyebrow: 'Trámites',
        title: 'Todo lo que el vecino vino a gestionar y qué falta despachar',
        description:
          'Solicitudes que entran por la app, el mostrador y la web, con su categoría, su dependencia y su estado. La tabla las agrupa por día de ingreso.',
      };

  const mensajeVacio = searchTerm.trim()
    ? `No se encontraron trámites para "${searchTerm.trim()}"`
    : 'No hay trámites que coincidan con los filtros aplicados';

  // Opciones de los selects de la FilterBar. El `color` extra viaja al
  // ModernSelect interno (lo soporta en runtime, mismos datos que antes).
  const opcionesCategoria = [
    { value: '', label: 'Todas' },
    ...tipos
      .filter((t) => t.activo)
      .map((tipo) => ({
        value: String(tipo.id),
        label: `${tipo.nombre} (${conteosTipos.find((c) => c.id === tipo.id)?.cantidad || 0})`,
        color: tipo.color || theme.primary,
      })),
  ];
  // Trámite (el servicio puntual): antes vivía en un dropdown propio colgado
  // del encabezado de la columna TRÁMITE de la tabla vieja. Los encabezados de
  // la tabla del estándar son texto, así que el filtro se mudó acá — mismo
  // filtro, misma llamada al backend, ahora con el control del kit.
  const opcionesTramite = [
    { value: '', label: 'Todos' },
    ...serviciosPorTipo.flatMap(({ tipo, servicios: delTipo }) =>
      delTipo.map((s) => ({
        value: String(s.id),
        label: s.nombre,
        color: tipo.color || theme.primary,
      })),
    ),
  ];
  const opcionesDependencia = [
    { value: '', label: 'Todas' },
    ...dependenciasOpts.map((d) => ({ value: String(d.id), label: d.nombre, color: d.color })),
  ];
  const mostrarSelectDependencia =
    (user?.rol === 'admin' || user?.rol === 'supervisor') && !soloMiArea;

  // Segmented/tabs de estados con conteos reales (mismas agrupaciones que las
  // status pills viejas + tab "Todos"). count 0 ⇒ la tab se apaga sola.
  const totalConteos = Object.values(conteosEstados).reduce((a, b) => a + b, 0);
  const tabsEstado: StatusTab[] = [
    { id: '', label: 'Todos', count: totalConteos },
    {
      id: 'recibido',
      label: 'Recibidos',
      count:
        (conteosEstados['recibido'] || 0) +
        (conteosEstados['iniciado'] || 0) +
        (conteosEstados['INICIADO'] || 0),
    },
    { id: 'pendiente_pago', label: 'Pago', count: conteosEstados['pendiente_pago'] || 0 },
    { id: 'en_curso', label: 'En curso', count: conteosEstados['en_curso'] || 0 },
    { id: 'finalizado', label: 'Finalizados', count: conteosEstados['finalizado'] || 0 },
    { id: 'pospuesto', label: 'Pospuestos', count: conteosEstados['pospuesto'] || 0 },
    { id: 'rechazado', label: 'Rechazados', count: conteosEstados['rechazado'] || 0 },
  ];

  const accionesFila: RowAction<Solicitud>[] = [
    { id: 'ver', label: 'Ver', icon: Eye, onClick: (t) => openTramite(t) },
  ];

  // "Cargar más" del pie: primero agranda la ventana sobre lo ya cargado y,
  // cuando se agotó, pide la página siguiente al server (infinite scroll).
  const cargarMas = () => {
    if (hayMasLocal) {
      setPage((p) => p + 1);
      return;
    }
    if (hasMore && !loadingMore) loadMoreTramites();
  };

  // Panel IA (se preserva del layout anterior: columna sticky a la derecha).
  const panelIA =
    iaOn && !soloMiArea ? (
      <DashboardIAPanel
        data={dashboardIA}
        loading={dashboardIALoading}
        title="Trámites · IA"
        onCollapsedChange={setIaCollapsed}
        onTipClick={(tip) => {
          const firstId = tip.items?.[0];
          if (firstId) {
            const target = tramites.find((t) => t.id === firstId);
            if (target) openTramite(target);
          }
        }}
      />
    ) : null;

  return (
    <PullToRefresh onRefresh={async () => { await loadData(); }}>
      <div className="av2-page" data-module="tramites">
        {/* 1. Cabecera de módulo: eyebrow + H1 + bajada. Va ARRIBA DE TODO
            (v2.2): antes el título del módulo vivía dentro de la toolbar y
            terminaba abajo del hero, pegado al buscador. */}
        <PageHeader
          eyebrow={cabecera.eyebrow}
          title={cabecera.title}
          description={cabecera.description}
        />

        {/* 2. ModuleHero = SemanticHero con la stat strip ADENTRO (estándar:
            los números viven en el hero, sin tarjetas de KPI sueltas). */}
        <div className="av2-hero-wrap">
          <SemanticHero
            etiqueta="TRÁMITES · HOY"
            frases={heroFrases}
            kpis={heroKpis}
            className="av2-hero"
          />
        </div>

        {/* 3+4. Toolbar y filtros: UNA sola tarjeta partida por una línea. */}
        <div className="av2-controles">
          {/* Toolbar: buscador + vistas + orden + único CTA primario (sin H1) */}
          <ListToolbar
            searchPlaceholder="Buscar por número, asunto o solicitante…"
            search={searchTerm}
            onSearchChange={setSearchTerm}
            views={['table', 'cards', 'guided']}
            activeView={activeView}
            onViewChange={cambiarVista}
            secondaryAction={{
              label: ordenamiento === 'reciente' ? 'Más recientes' : 'Por vencer',
              icon: ordenamiento === 'reciente' ? ArrowUpDown : Calendar,
              onClick: () =>
                setOrdenamiento(ordenamiento === 'reciente' ? 'por_vencer' : 'reciente'),
            }}
            primaryAction={{ label: 'Nuevo trámite', onClick: () => setWizardOpen(true) }}
          />

          {/* Filtros: selects + tabs de estado con conteos reales.
              Sin PeriodControl: este listado no filtra por período (trae todo
              paginado del server); agregarlo cambiaría la lógica de datos. */}
          <FilterBar
            selects={[
              {
                id: 'categoria',
                label: 'Categoría',
                value: filtroTipo === null ? '' : String(filtroTipo),
                options: opcionesCategoria,
                onChange: (v) => setFiltroTipo(v ? parseInt(v, 10) : null),
              },
              {
                id: 'tramite',
                label: 'Trámite',
                value: filtroTramite === null ? '' : String(filtroTramite),
                options: opcionesTramite,
                onChange: (v) => setFiltroTramite(v ? parseInt(v, 10) : null),
              },
              ...(mostrarSelectDependencia
                ? [{
                    id: 'dependencia',
                    label: 'Dependencia',
                    value: filtroDependencia === null ? '' : String(filtroDependencia),
                    options: opcionesDependencia,
                    onChange: (v: string) => setFiltroDependencia(v ? parseInt(v, 10) : null),
                  }]
                : []),
            ]}
            /* En vista tabla las tabs viven ARRIBA de la tarjeta de la tabla
               (diseño canvas); en tarjetas/guiada siguen acá como segmented. */
            statusTabs={activeView === 'table' ? [] : tabsEstado}
            activeStatus={filtroEstado}
            onStatusChange={(id) => setFiltroEstado(id)}
          />
        </div>

        {/* 5. Cuerpo por vista (tabla estándar / tarjetas / guiada) + panel IA */}
        <div className={panelIA ? 'lg:flex lg:gap-4' : undefined}>
          <div className={panelIA ? 'flex-1 min-w-0' : undefined}>
            {loading ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${panelIA ? '' : 'lg:grid-cols-3'} gap-3 sm:gap-5 mt-3`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <ABMCardSkeleton key={`skeleton-${i}`} index={i} />
                ))}
              </div>
            ) : activeView === 'guided' ? (
              <div className="mt-3">{inboxView}</div>
            ) : esAngosto ? (
              /* En un telefono no hay tabla ni grilla que sirvan: la tabla
                 obliga a scrollear de costado y la tarjeta grande deja menos
                 de dos items por pantalla. La vista elegida (tabla/tarjetas)
                 es una preferencia de ESCRITORIO; en angosto siempre manda la
                 lista, que muestra lo necesario para decidir si abrir. */
              visibleTramites.length === 0 ? (
                <section className="av2-tabla">
                  <div className="av2-tabla-vacia">{mensajeVacio}</div>
                </section>
              ) : (
                <FilaLista
                  ariaLabel="Trámites"
                  items={visibleTramites.map((t) => aFilaTramite(t, () => openTramite(t)))}
                />
              )
            ) : activeView === 'cards' ? (
              visibleTramites.length === 0 ? (
                <section className="av2-tabla">
                  <div className="av2-tabla-vacia">{mensajeVacio}</div>
                </section>
              ) : (
                <div className={`grid grid-cols-1 md:grid-cols-2 ${panelIA ? '' : 'lg:grid-cols-3'} gap-3 sm:gap-5 mt-3`}>
                  {renderCards()}
                </div>
              )
            ) : (
              <DataTable<Solicitud>
                kind="plain"
                columns={columnasTabla}
                groupBy="date"
                groups={gruposTabla}
                rows={[]}
                rowKey={(t) => t.id}
                rowActions={accionesFila}
                onRowClick={(t) => openTramite(t)}
                statusTabs={tabsEstado}
                activeStatus={filtroEstado}
                onStatusChange={(id) => setFiltroEstado(id)}
                emptyMessage={mensajeVacio}
                footer={{
                  showing: `Mostrando ${visibleTramites.length.toLocaleString('es-AR')} de ${filteredTramites.length.toLocaleString('es-AR')}`,
                  action: hayMasLocal || hasMore
                    ? {
                        label: loadingMore ? 'Cargando…' : 'Cargar más',
                        onClick: cargarMas,
                        disabled: loadingMore,
                        disabledReason: 'Ya se está cargando la página siguiente',
                      }
                    : undefined,
                }}
              />
            )}
          </div>
          {panelIA && (
            <aside
              className={`hidden lg:block flex-shrink-0 self-start lg:sticky lg:top-[168px] mt-3 ${iaCollapsed ? 'w-11' : 'w-[280px]'}`}
            >
              {panelIA}
            </aside>
          )}
        </div>
      </div>

      {/* Sentinel para infinite scroll + spinner de carga.
          Solo en vista clásica — en vista Inbox la lista no se pagina. */}
      {!vistaInbox && (
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
      )}

      {/* Sheet de detalle */}
      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={`Trámite ${selectedTramite?.numero_tramite || ''}`}
        description={selectedTramite?.asunto}
        customHeader={renderTramiteHeader()}
        stickyFooter={renderTramiteFooter()}
      >
        {selectedTramite && (
          <div className="space-y-3">
            {/* Qué pide el vecino — el asunto vive en el título del header. */}
            {selectedTramite.descripcion && (
              <div className="rs-seccion">
                <span className="rs-seccion-titulo">Qué pide el vecino</span>
                <p className="rs-parrafo">"{selectedTramite.descripcion}"</p>
              </div>
            )}

            {/* QUIÉN LO PIDE / DÓNDE — dos columnas, datos reales. */}
            <div className="rs-grid2">
              <span className="min-w-0">
                <span className="rs-mini-eyebrow">Quién lo pide</span>
                <span className="rs-persona">
                  <span className="rs-avatar">
                    {`${selectedTramite.nombre_solicitante?.[0] ?? ''}${selectedTramite.apellido_solicitante?.[0] ?? ''}`.toUpperCase() || '?'}
                  </span>
                  <span className="rs-persona-datos">
                    <span className="rs-persona-nombre">
                      {selectedTramite.nombre_solicitante} {selectedTramite.apellido_solicitante}
                    </span>
                    {selectedTramite.dni_solicitante && (
                      <span className="rs-dato-sub">DNI {selectedTramite.dni_solicitante}</span>
                    )}
                  </span>
                </span>
                {selectedTramite.telefono_solicitante && (
                  <a className="rs-mini-link" href={`tel:${selectedTramite.telefono_solicitante}`}>
                    {selectedTramite.telefono_solicitante}
                  </a>
                )}
              </span>
              <span className="min-w-0">
                <span className="rs-mini-eyebrow">Dónde</span>
                <span className="rs-dato">
                  {selectedTramite.direccion_solicitante || 'Sin dirección cargada'}
                </span>
                {selectedTramite.email_solicitante && (
                  <a className="rs-mini-link" href={`mailto:${selectedTramite.email_solicitante}`}>
                    {selectedTramite.email_solicitante}
                  </a>
                )}
              </span>
            </div>

            {/* Documentos — checklist real, con la acción como link de sección. */}
            <div className="rs-seccion">
              <div className="rs-seccion-cab">
                <span className="rs-seccion-titulo">Documentos</span>
                {user?.rol !== 'vecino' && (checklistData?.total_obligatorios_subidos ?? 0) > 0 && (
                  <button type="button" className="rs-seccion-link" onClick={() => setReviewOpen(true)}>
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
