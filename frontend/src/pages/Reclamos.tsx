import { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, CheckCircle, XCircle, Clock, Eye, User, FileCheck, AlertTriangle, AlertCircle, Building2, Camera, Sparkles, Loader2, Wrench, ExternalLink, ArrowUpDown, PauseCircle, PlayCircle, Inbox, ThumbsDown, Star, RotateCcw, ChevronLeft, ChevronRight, X, Check, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, empleadosApi, categoriasApi, dashboardApi, dependenciasApi, ordenesTrabajoApi, empleadosGestionApi, modulosApi, calificacionesApi, poiApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMTextarea, ABMInfoPanel, ABMCollapsible } from '../components/ui/ABMPage';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroAccion, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../lib/veredictos';
import { Sheet } from '../components/ui/Sheet';
// Suite del estándar SemanticAbmPage (rediseño v2). Composición manual de las
// piezas (PageHeader/ListToolbar/FilterBar/DataTable) porque el orquestador
// todavía no soporta las vistas alternativas (cards/guiada) de esta página —
// ver dudas del piloto. El contrato de props ES el del estándar, incluido el
// ORDEN v2.2: cabecera → hero → (toolbar + filtros como una sola tarjeta).
import { PageHeader } from '../components/abmv2/PageHeader';
import { ListToolbar } from '../components/abmv2/ListToolbar';
import { FilterBar } from '../components/abmv2/FilterBar';
import { DataTable, EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import type { ColumnSpec, RolesSemanticos, RowAction, StatusTab, TableGroup, ViewKind } from '../components/abmv2/types';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DashboardIAPanel, DashboardIAData } from '../components/ui/DashboardIAPanel';
import { useIaReclamos } from '../hooks/useIaHabilitada';
import { ConfirmModal, type ConfirmVariant } from '../components/ui/ConfirmModal';
import { CrearReclamoWizard } from '../components/reclamos/CrearReclamoWizard';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { ABMCardSkeleton } from '../components/ui/Skeleton';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import { ReclamoCard, estadoColors, DynamicIcon } from '../components/ui/ReclamoCard';
import { FilaLista, type FilaListaItem } from '../components/ui/FilaLista';
import { useEsAngosto } from '../hooks/useEsAngosto';
import { haceCuanto, tonoDeEstado } from '../lib/filaLista-helpers';
// estadoLabels (flat) viene del SSoT canónico (lib/enums/reclamo). estadoColors se sigue
// tomando del adaptador {bg,text} de ReclamoCard: el Sheet del monolito accede a `.bg`
// (el SSoT expone color plano vía estadoColor(); no reescribimos la lógica del monolito acá).
import { estadoLabels } from '../lib/enums/reclamo';
import { CANAL_OPTIONS, canalColors, canalLabel } from '../lib/enums/canal';
import { otEstadoLabel, otEstadoColor } from '../lib/enums/ordenTrabajo';
import { prioridadColor, prioridadLabel, prioridadIcon, PRIORIDAD_OPTIONS, prioridadRankOf, prioridadSeverityColor } from '../lib/enums/prioridad';
import { InboxLayout } from '../components/inbox/InboxLayout';
import { InboxCard } from '../components/inbox/InboxCard';
import type { SugerenciaAsignacion } from '../components/reclamos/CandidatosAsignacion';
import type { Reclamo, Empleado, Categoria, OrdenTrabajo, PoiConsolidarResponse } from '../types';

// Fecha de vencimiento estimada de un reclamo = created_at + tiempo_estimado_dias
// (o el SLA de la categoría, fallback 30 días). Compartida entre el cálculo de
// "zona urgente" del inbox, el orden de "Empecemos por lo urgente" y el render
// de cada card — antes vivía duplicada en 2 lugares distintos del inbox.
const getFechaVenceReclamoMs = (r: Reclamo): number | null => {
  const dias = r.tiempo_estimado_dias
    ?? (r.categoria as unknown as { tiempo_resolucion_estimado?: number })?.tiempo_resolucion_estimado
    ?? 30;
  return r.created_at
    ? new Date(r.created_at).getTime() + dias * 24 * 60 * 60 * 1000
    : null;
};

// --- Vencimiento y asignación, para los KPIs y las acciones del hero ---
// Un reclamo cerrado (finalizado/resuelto/rechazado) ya no vence ni necesita
// dependencia: TODAS las métricas de abajo miran sólo los ABIERTOS, igual que
// las secciones de la vista guiada.
const CERRADOS = new Set(['finalizado', 'resuelto', 'rechazado']);
const estaAbierto = (r: Reclamo) => !CERRADOS.has((r.estado || '').toLowerCase());

/** Vence DENTRO del día de hoy (misma fecha estimada que usa la frase del hero). */
const venceHoy = (r: Reclamo): boolean => {
  if (!estaAbierto(r)) return false;
  const ms = getFechaVenceReclamoMs(r);
  if (ms == null) return false;
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = inicioHoy.getTime() + 24 * 60 * 60 * 1000;
  return ms >= inicioHoy.getTime() && ms < finHoy;
};

/** Ya venció (antes del comienzo de hoy). */
const yaVencio = (r: Reclamo): boolean => {
  if (!estaAbierto(r)) return false;
  const ms = getFechaVenceReclamoMs(r);
  if (ms == null) return false;
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  return ms < inicioHoy.getTime();
};

/** Sin dependencia asignada = nadie se hizo cargo todavía. Es el dato de
 *  responsable que la LISTA tiene (la cuadrilla/empleado vive en la OT y no
 *  viaja en la fila del listado). */
const sinDependencia = (r: Reclamo): boolean =>
  estaAbierto(r) && !(r.dependencia_asignada as { id?: number } | undefined)?.id;

/** Agrupaciones de estado del hero — LAS MISMAS que suman los KPIs desde los
 *  conteos del backend, para que el detalle del subtexto hable del mismo
 *  conjunto que el número que tiene arriba. */
/** Estados aceptados por el deep-link `?filtrar_estado=` (= ids de `tabsEstado`). */
const ESTADOS_DEEP_LINK = ['recibido', 'en_curso', 'finalizado', 'pospuesto', 'rechazado'];

const ESTADOS_RECIBIDO = new Set(['recibido', 'nuevo', 'asignado']);
const ESTADOS_EN_CURSO = new Set(['en_curso', 'en_proceso', 'pendiente_confirmacion']);

/**
 * Focos del hero: grupos de trabajo a los que sus acciones acotan la lista.
 * Cada uno tiene su predicado (el mismo que cuenta el KPI) y su etiqueta para
 * el resumen de la barra de filtros. Agregar un foco = agregar una entrada.
 */
type FocoHero = 'vencen-hoy' | 'vencidos' | 'sin-dependencia' | null;
const FOCOS: Record<Exclude<FocoHero, null>, { test: (r: Reclamo) => boolean; resumen: string }> = {
  'vencen-hoy': { test: venceHoy, resumen: 'vencen hoy' },
  vencidos: { test: yaVencio, resumen: 'ya vencidos' },
  'sin-dependencia': { test: sinDependencia, resumen: 'sin dependencia' },
};

// Calificación que dejó el vecino tras el cierre del reclamo (T5-F1).
// El dato ya vive en BD; ninguna pantalla del muni lo mostraba.
interface CalificacionVecinoData {
  id: number;
  puntuacion: number;
  comentario?: string | null;
  created_at?: string;
}

// Panel de "la voz del vecino": estrellas + comentario. Solo tokens de tema
// (sin hex nuevo): estrella llena = primary, vacía = border.
function CalificacionVecinoPanel({ calificacion }: { calificacion: CalificacionVecinoData }) {
  const { theme } = useTheme();
  return (
    <ABMInfoPanel
      title="Calificación del vecino"
      icon={<Star className="h-4 w-4" />}
      variant="success"
    >
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const activa = n <= calificacion.puntuacion;
          return (
            <Star
              key={n}
              className="h-5 w-5"
              style={{
                color: activa ? theme.primary : theme.border,
                fill: activa ? theme.primary : 'none',
              }}
            />
          );
        })}
        <span className="text-sm font-semibold ml-1.5" style={{ color: theme.text }}>
          {calificacion.puntuacion}/5
        </span>
      </div>
      {calificacion.comentario?.trim() ? (
        <p className="text-sm leading-relaxed" style={{ color: theme.text }}>
          &ldquo;{calificacion.comentario}&rdquo;
        </p>
      ) : (
        <p className="text-sm italic" style={{ color: theme.textSecondary }}>
          El vecino no dejó comentario.
        </p>
      )}
    </ABMInfoPanel>
  );
}

const DEFAULT_CATEGORY_COLOR = '#64748b'; // Color por defecto - los colores reales vienen de la DB


// Resuelve el icono lucide de una categoría a partir de su campo `icono` (nombre
// del icono en la DB, mismo criterio que DynamicIcon de ReclamoCard) para poder
// pasarlo a EntityCell del estándar, que espera un componente LucideIcon.
// Fallback: AlertTriangle (igual que las cards del inbox).
const iconoDeCategoria = (icono?: string | null): LucideIcon => {
  if (icono) {
    const Icono = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[icono];
    if (Icono) return Icono;
  }
  return AlertTriangle;
};

// Columnas del DataTable del estándar SemanticAbmPage (kind='plain').
// Espejo de design/handoff-v2/references/reclamos-lista.dc.html:
// # · RECLAMO · VECINO/DEPENDENCIA · UBICACIÓN · ESTADO · CREADO · VENCE (+ ACCIONES).
// Los colores de categoría/dependencia vienen de DATOS (runtime) — permitidos
// por la regla polimórfica; el resto sale de las clases av2-* con tokens.
const columnasTabla: ColumnSpec<Reclamo>[] = [
  {
    id: 'id',
    header: '#',
    width: '58px',
    kind: 'text',
    cell: (r) => <span className="av2-tabla-texto av2-tnum">#{r.id}</span>,
  },
  {
    id: 'reclamo',
    header: 'RECLAMO',
    width: 'minmax(220px, 2fr)',
    kind: 'entity',
    cell: (r) => {
      const catColor = r.categoria?.color || DEFAULT_CATEGORY_COLOR;
      return (
        <EntityCell
          icon={iconoDeCategoria(r.categoria?.icono)}
          tileColor={catColor}
          title={r.titulo || r.categoria?.nombre || 'Reclamo'}
          subtitle={r.categoria?.nombre}
          dotColor={catColor}
        />
      );
    },
  },
  {
    id: 'vecino',
    header: 'VECINO / DEPENDENCIA',
    width: 'minmax(150px, 1.25fr)',
    kind: 'entity',
    cell: (r) => {
      // Tolera el shape legacy anidado ({ dependencia: { nombre } }) además del tipado plano.
      const dep = r.dependencia_asignada as
        | { nombre?: string; color?: string; dependencia?: { nombre?: string; color?: string } }
        | undefined;
      const depNombre = dep?.dependencia?.nombre || dep?.nombre;
      const depColor = dep?.color || dep?.dependencia?.color;
      const nombre = r.creador
        ? `${r.creador.nombre} ${r.creador.apellido}`.trim()
        : r.es_anonimo ? 'Anónimo' : '—';
      return (
        <EntityCell icon={User} tileColor={depColor} title={nombre} subtitle={depNombre} dotColor={depColor} />
      );
    },
  },
  { id: 'direccion', header: 'UBICACIÓN', width: 'minmax(130px, 1fr)', kind: 'text' },
  { id: 'estado', header: 'ESTADO', width: 'minmax(88px, 110px)', kind: 'chip' },
  {
    id: 'creado',
    header: 'CREADO',
    width: 'minmax(66px, 80px)',
    kind: 'date',
    cell: (r) => {
      const d = new Date(r.created_at);
      return (
        <span className="av2-tabla-fecha av2-tnum">
          {`${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`}
        </span>
      );
    },
  },
  {
    id: 'vence',
    header: 'VENCE',
    width: 'minmax(70px, 96px)',
    kind: 'chip',
    cell: (r) => {
      if (!r.fecha_programada) return <span className="av2-tabla-texto">—</span>;
      const diffDias = Math.ceil((new Date(r.fecha_programada).getTime() - Date.now()) / 86400000);
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

type SheetMode = 'closed' | 'view';

interface ReclamosProps {
  soloMisTrabajos?: boolean;
  soloMiArea?: boolean;
}

/**
 * Arma las secciones de la vista guiada (Inbox) de una lista de reclamos.
 * Fuera del componente porque no depende de nada suyo: recibe la lista y
 * devuelve los grupos. Se llama dos veces (lista visible y base sin foco).
 * Mismo patrón que GestionTramites.tsx.
 */
function armarInbox(lista: Reclamo[]) {
  const ahora = Date.now();
  const dia = 24 * 60 * 60 * 1000;

  const conFeedback: Reclamo[] = []; // vecino dijo "sigue el problema"
  const urgentes: Reclamo[] = [];
  const fosiles: Reclamo[] = [];   // vencidos hace > 30 días — para limpiar
  const nuevos: Reclamo[] = [];
  const enCurso: Reclamo[] = [];
  const esperando: Reclamo[] = [];

  for (const r of lista) {
    const estado = (r.estado || '').toLowerCase();

    // Capa 0: feedback negativo del vecino. MAXIMA PRIORIDAD: aparecen
    // aunque el reclamo este "finalizado", porque el vecino dice que el
    // problema sigue y la dependencia tiene que retomarlo.
    if (r.confirmado_vecino === false) {
      conFeedback.push(r);
      continue;
    }

    // Excluir cerrados de la vista guiada (los con feedback ya quedaron
    // arriba; estos son cierres limpios sin disputa).
    if (estado === 'finalizado' || estado === 'rechazado' || estado === 'resuelto') continue;

    // Vencimiento estimado = created_at + tiempo_estimado_dias del reclamo
    // (si no tiene, usar el SLA de la categoría; fallback 30 días).
    const fechaVence = getFechaVenceReclamoMs(r);
    const diffMs = fechaVence ? fechaVence - ahora : null;

    // Capa 1: fósil — venció hace más de 30 días, sin importar el estado.
    if (diffMs != null && diffMs < -30 * dia) {
      fosiles.push(r);
      continue;
    }

    // Capa 2: el ESTADO manda sobre la urgencia. Si el reclamo ya esta
    // en curso o pospuesto, vive en su seccion correspondiente aunque
    // sea urgente — la urgencia ya esta atendida (alguien lo esta
    // trabajando o lo postergo concientemente).
    if (estado === 'pospuesto') {
      esperando.push(r);
      continue;
    }
    if (estado === 'en_curso') {
      enCurso.push(r);
      continue;
    }

    // Capa 3: urgente real — solo entre los que aun no fueron tomados
    // (recibido / nuevo / asignado / legacy). Prioridad de la OT alta/urgente
    // (F6: la prioridad canónica vive en la OT, no en el campo legacy) OR
    // vence entre -7 y +3 dias.
    const enZonaUrgente = diffMs != null && diffMs >= -7 * dia && diffMs <= 3 * dia;
    const esUrgente = r.prioridad_ot === 'alta' || r.prioridad_ot === 'urgente' || enZonaUrgente;
    if (esUrgente) {
      urgentes.push(r);
      continue;
    }

    // Resto: nuevos sin tomar
    nuevos.push(r);
  }

  // Orden de "Empecemos por lo urgente": prioridad_ot desc (urgente > alta >
  // media > baja) y, a igual prioridad, por fecha de vencimiento asc (mismo
  // criterio que ya se usaba arriba para detectar la zona urgente).
  urgentes.sort((a, b) => {
    const porPrioridad = prioridadRankOf(b.prioridad_ot) - prioridadRankOf(a.prioridad_ot);
    if (porPrioridad !== 0) return porPrioridad;
    const vA = getFechaVenceReclamoMs(a) ?? Infinity;
    const vB = getFechaVenceReclamoMs(b) ?? Infinity;
    return vA - vB;
  });

  return { conFeedback, urgentes, fosiles, nuevos, enCurso, esperando };
}


/**
 * Un reclamo, dicho como una fila de listado.
 *
 * Se muestra SOLO lo que hace falta para decidir si abrirlo: que es, de quien
 * y hace cuanto. El numero pasa a la meta en letra chica —sigue estando para
 * quien lo busca— y deja de ser lo mas grande de la tarjeta, que era el caso.
 */
function aFilaReclamo(r: Reclamo, onClick: () => void): FilaListaItem {
  const vecino = r.creador ? `${r.creador.nombre} ${r.creador.apellido}`.trim() : null;
  const area = r.dependencia_asignada?.nombre || r.categoria?.nombre || null;
  return {
    id: r.id,
    titulo: r.titulo,
    meta: [vecino, area, `#${r.id}`],
    estado: { label: estadoLabels[r.estado] || r.estado, tono: tonoDeEstado(r.estado) },
    hace: haceCuanto(r.created_at),
    onClick,
  };
}

/**
 * ROLES SEMÁNTICOS de Reclamos — la declaración que consume el renderer de
 * fichas del control cuando el contenedor es angosto.
 *
 * No dibuja nada: dice qué papel cumple cada campo del reclamo. El control se
 * encarga del layout. Agregar una entidad nueva al sistema es escribir un mapa
 * como este; no se escribe UI de celular.
 */
const ROLES_RECLAMO: RolesSemanticos<Reclamo> = {
  identity: (r) => `#${r.id}`,
  taxonomy: (r) =>
    r.categoria ? { label: r.categoria.nombre, color: r.categoria.color || undefined } : null,
  headline: (r) => r.titulo,
  // Quién lo pidió y qué área lo tiene: las dos cosas que ubican al registro.
  actor: (r) => {
    const vecino = r.creador ? `${r.creador.nombre} ${r.creador.apellido}`.trim() : null;
    const area = r.dependencia_asignada?.nombre || null;
    return [vecino, area].filter(Boolean).join(' · ') || null;
  },
  context: (r) => r.direccion || r.zona?.nombre || null,
  state: (r) => ({ label: estadoLabels[r.estado] || r.estado, tono: tonoDeEstado(r.estado) }),
  elapsed: (r) => haceCuanto(r.created_at),
};

export default function Reclamos({ soloMisTrabajos = false, soloMiArea = false }: ReclamosProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dependenciasDisponibles, setDependenciasDisponibles] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);
  const [filtroDependencia, setFiltroDependencia] = useState<number | null>(null);
  const [filtroCanal, setFiltroCanal] = useState<string | null>(null);
  const [ordenamiento, setOrdenamiento] = useState<'reciente' | 'programado'>('reciente'); // Ordenar por fecha de creación o programada
  // Foco del hero: acota la lista al grupo que la frase acaba de nombrar
  // ("los que vencen hoy", "los que no tienen dependencia"). Es un filtro
  // CLIENTE sobre lo ya cargado — no toca los params del fetch. Se prende y
  // se apaga desde las acciones del hero y se anuncia en el resumen de la
  // barra de filtros para que nunca quede un filtro invisible aplicado.
  const [foco, setFoco] = useState<FocoHero>(null);

  // Dashboard IA operativo: urgentes + recomendaciones (LLM) + secciones (SQL).
  const [dashboardIA, setDashboardIA] = useState<DashboardIAData | null>(null);
  const [dashboardIALoading, setDashboardIALoading] = useState(false);
  const [iaCollapsed, setIaCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dashboard_ia_collapsed') !== '0'; } catch { return true; }
  });
  // IA del muni: si está apagada, no montamos el panel ni reservamos su columna
  // (la grilla ocupa el 100% del ancho). La IA funcional —auto-asignación,
  // clasificación— es independiente de este flag y sigue operando.
  const iaOn = useIaReclamos();
  // Pantalla de telefono: la vista de tarjetas se dibuja como filas (ver el
  // render de `cards`). Es un cambio de ARBOL, no de estilo, asi que no
  // alcanza con una media query de CSS.
  const esAngosto = useEsAngosto();

  // Vista del listado (segmented del ListToolbar estándar): tabla / tarjetas /
  // guiada (Inbox). Persiste en localStorage con la MISMA key que usaba ABMPage
  // ('reclamos_view') para respetar la elección previa de cada usuario.
  const [activeView, setActiveView] = useState<ViewKind>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('reclamos_view') : null;
    return saved === 'cards' || saved === 'guided' || saved === 'table' ? saved : 'table';
  });
  const cambiarVista = (v: ViewKind) => {
    setActiveView(v);
    if (typeof window !== 'undefined') localStorage.setItem('reclamos_view', v);
  };

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const ITEMS_PER_PAGE = 50;
  const [conteosCategorias, setConteosCategorias] = useState<Record<number, number>>({});

  const [conteosEstados, setConteosEstados] = useState<Record<string, number>>({});
  const [conteosDependencias, setConteosDependencias] = useState<Record<number, number>>({});
  const observerTarget = useRef<HTMLDivElement>(null);
  // Estado para animación staggered - iniciar como completado para evitar parpadeo
  const [visibleCards] = useState<Set<number>>(new Set());
  const [animationDone] = useState(true);

  // Wizard states
  const [wizardOpen, setWizardOpen] = useState(false);


  // Sheet states (solo para ver detalle)
  const [sheetMode, setSheetMode] = useState<SheetMode>('closed');
  const [selectedReclamo, setSelectedReclamo] = useState<Reclamo | null>(null);
  // Calificación del vecino para el reclamo abierto en el Sheet (T5-F1)
  const [calificacion, setCalificacion] = useState<CalificacionVecinoData | null>(null);

  // Estado para el ConfirmModal reutilizable (reemplaza window.confirm/prompt)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: ConfirmVariant;
    promptLabel?: string;
    promptPlaceholder?: string;
    loading?: boolean;
    onConfirm: (value?: string) => void;
  } | null>(null);
  const closeConfirmModal = () => setConfirmModal(prev => prev ? { ...prev, isOpen: false } : null);

  // Action states for view
  const [dependenciaSeleccionada, setDependenciaSeleccionada] = useState<string>('');
  const [empleadoSeleccionadoId, setEmpleadoSeleccionadoId] = useState<string>('');
  const [asignandoEmpleado, setAsignandoEmpleado] = useState(false);
  // Asignación polimórfica (cuadrilla o empleado) + vínculo guiado a Orden de Trabajo
  const [cuadrillasDisponibles, setCuadrillasDisponibles] = useState<{ id: number; nombre: string; apellido?: string | null }[]>([]);
  const [moduloOTActivo, setModuloOTActivo] = useState(false);
  // Módulo Puntos de Interés (opt-in) — habilita el banner de "consolidar en OT
  // de zona" cuando el reclamo abierto cae en la zona de un POI (F6 · Etapa B).
  const [moduloPOIActivo, setModuloPOIActivo] = useState(false);
  const [consolidandoPOI, setConsolidandoPOI] = useState(false);
  const [otsVigentesDependencia, setOtsVigentesDependencia] = useState<OrdenTrabajo[]>([]);
  // OTs que YA tienen vinculado el reclamo abierto (la VUELTA: reclamo → OT).
  const [otsDelReclamo, setOtsDelReclamo] = useState<OrdenTrabajo[]>([]);
  const [otSeleccionadaId, setOtSeleccionadaId] = useState<string>('');
  const [vinculandoOT, setVinculandoOT] = useState(false);
  const [comentarioAsignacion, setComentarioAsignacion] = useState('');
  const [descripcionInicio, setDescripcionInicio] = useState('');
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [duracion, setDuracion] = useState('1');  // en horas (string para el select)
  // Tiempo estimado de resolución (para aceptar reclamos)
  const [tiempoEstimadoDias, setTiempoEstimadoDias] = useState(1);
  const [tiempoEstimadoHoras, setTiempoEstimadoHoras] = useState(0);
  const [loadingDisponibilidad, setLoadingDisponibilidad] = useState(false);
  const [disponibilidad, setDisponibilidad] = useState<{
    fecha: string;
    bloques_ocupados: { inicio: string; fin: string; titulo: string }[];
    proximo_disponible: string;
    hora_fin_jornada: string;
    dia_lleno: boolean;
  } | null>(null);

  // Sugerencias de asignación automática (backend F4: score real con carga+ausencia)
  const [sugerencias, setSugerencias] = useState<SugerenciaAsignacion[]>([]);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  // Preview de disponibilidad del candidato elegido en el widget (F4). Estado
  // propio para NO pisar `disponibilidad` (que usa el flujo de aceptar reclamo).


  // Opciones de duración
  const duracionOptions = [
    { value: '0.5', label: '30 min' },
    { value: '1', label: '1 hora' },
    { value: '1.5', label: '1:30 hs' },
    { value: '2', label: '2 horas' },
    { value: '2.5', label: '2:30 hs' },
    { value: '3', label: '3 horas' },
    { value: '3.5', label: '3:30 hs' },
    { value: '4', label: '4 horas' },
    { value: '5', label: '5 horas' },
    { value: '6', label: '6 horas' },
    { value: '8', label: '8 horas' },
  ];

  // Calcular hora fin basado en hora inicio y duración
  const calcularHoraFin = (inicio: string, duracionHoras: string): string => {
    const [h, m] = inicio.split(':').map(Number);
    const duracionNum = parseFloat(duracionHoras);
    const totalMinutos = h * 60 + m + duracionNum * 60;
    const horaFin = Math.floor(totalMinutos / 60);
    const minFin = totalMinutos % 60;
    return `${String(horaFin).padStart(2, '0')}:${String(minFin).padStart(2, '0')}`;
  };

  const horaFin = calcularHoraFin(horaInicio, duracion);
  const [resolucion, setResolucion] = useState('');
  // Foto de cierre (evidencia del trabajo terminado) — opcional al finalizar
  const [fotoCierre, setFotoCierre] = useState<File | null>(null);
  const [tipoFinalizacion, setTipoFinalizacion] = useState<'finalizado' | 'pospuesto'>('finalizado');
  const [motivoNoFinalizado, setMotivoNoFinalizado] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [descripcionRechazo, setDescripcionRechazo] = useState('');




  // Estado para conteos de reclamos similares (por reclamo_id)
  // Solo lectura: el fetch de conteos similares quedó apagado (bloque
  // comentado que se borró en la limpieza 2026-08-02); el default {} hace
  // que las cards muestren 0 sin romper.
  const [similaresCounts] = useState<Record<number, number>>({});

  // Cargar datos del municipio y conteos UNA SOLA VEZ al montar
  useEffect(() => {
    // PRIORIDAD 1: los reclamos (lo que el user quiere ver primero)
    fetchReclamos(true);

    // Cargar conteos UNA SOLA VEZ (GROUP BY optimizado) - solo para admin/supervisor
    if (!soloMisTrabajos) {
      Promise.all([
        dashboardApi.getConteoEstados(),
        dashboardApi.getConteoCategorias(),
        dashboardApi.getConteoDependencias(),
      ]).then(([estadosRes, categoriasRes, dependenciasRes]) => {
        const estadosMap: Record<string, number> = {};
        estadosRes.data.forEach((item: { estado: string; cantidad: number }) => {
          estadosMap[item.estado] = item.cantidad;
        });
        setConteosEstados(estadosMap);

        const categoriasMap: Record<number, number> = {};
        categoriasRes.data.forEach((item: { categoria_id: number; cantidad: number }) => {
          categoriasMap[item.categoria_id] = item.cantidad;
        });
        setConteosCategorias(categoriasMap);

        const dependenciasMap: Record<number, number> = {};
        dependenciasRes.data.forEach((item: { dependencia_id: number; cantidad: number }) => {
          dependenciasMap[item.dependencia_id] = item.cantidad;
        });
        setConteosDependencias(dependenciasMap);
      }).catch(error => {
        console.error('Error cargando conteos:', error);
      });
    }

    // Cargar categorías UNA SOLA VEZ. Las zonas dejaron de pedirse: solo las
    // consumía el wizard viejo — era una llamada API por visita a la página.
    categoriasApi.getAll(true).then((categoriasRes) => {
      setCategorias(categoriasRes.data);
    }).catch(error => {
      console.error('Error cargando categorías:', error.response?.status, error.response?.data || error.message);
    });

    // Cargar empleados por separado (solo admin/supervisor tienen acceso)
    // No intentar si es modo empleado (soloMisTrabajos) para evitar error 403 en consola
    if (!soloMisTrabajos) {
      empleadosApi.getAll(true).then((empleadosRes) => {
        setEmpleados(empleadosRes.data || []);
      }).catch(() => {
        // Silenciar error - usuarios sin permisos no necesitan ver empleados
        setEmpleados([]);
      });

      // Cargar dependencias del municipio para asignación
      dependenciasApi.getMunicipio({ activo: true, tipo_gestion: 'reclamos' }).then((dependenciasRes) => {
        setDependenciasDisponibles(dependenciasRes.data || []);
      }).catch(() => {
        setDependenciasDisponibles([]);
      });

      // Cuadrillas del municipio — determina si la asignación es polimórfica
      // (cuadrilla, para munis grandes) o solo empleado individual (munis chicos).
      empleadosGestionApi.getCuadrillasAll({ activo: true }).then((res) => {
        setCuadrillasDisponibles(res.data || []);
      }).catch(() => setCuadrillasDisponibles([]));

      // Módulos opt-in por municipio (igual que en el sidebar): Órdenes de
      // Trabajo y Puntos de Interés. Ambos se leen de la misma consulta.
      modulosApi.list().then((res) => {
        const rows = (res.data || []) as Array<{ modulo: string; activo: boolean }>;
        setModuloOTActivo(rows.some(m => m.modulo === 'ordenes_trabajo' && m.activo));
        setModuloPOIActivo(rows.some(m => m.modulo === 'poi' && m.activo));
      }).catch(() => { setModuloOTActivo(false); setModuloPOIActivo(false); });
    }
    // fetchReclamos queda fuera a propósito: no está memoizada (cambia de
    // identidad en cada render) y este efecto es de montaje/cambio de bandeja;
    // incluirla dispararía un loop de refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloMisTrabajos]);

  // Dashboard IA — carga al montar (solo admin/supervisor).
  useEffect(() => {
    if (soloMisTrabajos) return;
    let cancelled = false;
    setDashboardIALoading(true);
    reclamosApi.getDashboardIA(false)
      .then((res) => { if (!cancelled) setDashboardIA(res.data as DashboardIAData); })
      .catch((e) => console.error('[Reclamos] Error cargando Dashboard IA:', e))
      .finally(() => { if (!cancelled) setDashboardIALoading(false); });
    return () => { cancelled = true; };
  }, [soloMisTrabajos]);

  // Para empleados: calcular conteos desde los reclamos cargados
  useEffect(() => {
    if (soloMisTrabajos && reclamos.length > 0) {
      // Calcular conteos de estados
      const estadosMap: Record<string, number> = {};
      reclamos.forEach(r => {
        estadosMap[r.estado] = (estadosMap[r.estado] || 0) + 1;
      });
      setConteosEstados(estadosMap);

      // Calcular conteos de categorías
      const categoriasMap: Record<number, number> = {};
      reclamos.forEach(r => {
        if (r.categoria?.id) {
          categoriasMap[r.categoria.id] = (categoriasMap[r.categoria.id] || 0) + 1;
        }
      });
      setConteosCategorias(categoriasMap);
    }
  }, [soloMisTrabajos, reclamos]);

  // Búsqueda: se activa al presionar espacio, Enter, o después de 1.5s de inactividad
  useEffect(() => {
    // Si termina en espacio o tiene al menos 3 caracteres, buscar inmediatamente
    if (search.endsWith(' ') && search.trim().length >= 2) {
      setDebouncedSearch(search.trim());
      return;
    }
    // Si está vacío, limpiar la búsqueda inmediatamente
    if (search === '') {
      setDebouncedSearch('');
      return;
    }
    // Si no, esperar 1.5 segundos de inactividad
    const timer = setTimeout(() => {
      if (search.trim().length >= 2) {
        setDebouncedSearch(search.trim());
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [search]);

  // Cargar reclamos cuando cambia el filtro de estado, categoría, dependencia o búsqueda (con debounce)
  // NO en el primer mount — ese caso ya lo hace el useEffect de inicialización
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchReclamos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroCategoria, filtroDependencia, filtroCanal, debouncedSearch]);

  // Polling inteligente: detecta cambios en CUALQUIER reclamo visible (sin mostrar loading)
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        if (reclamos.length === 0) return;

        // Pedir los mismos reclamos que tenemos en pantalla para comparar
        const params: Record<string, string | number> = { skip: 0, limit: reclamos.length };
        if (filtroEstado) params.estado = filtroEstado;
        if (filtroCategoria) params.categoria_id = filtroCategoria;
        if (soloMiArea && user?.dependencia?.id) params.municipio_dependencia_id = user.dependencia.id;
        if (filtroDependencia) params.municipio_dependencia_id = filtroDependencia;
        if (filtroCanal) params.canal = filtroCanal;
        if (soloMisTrabajos && user?.empleado_id) params.solo_mis_tareas = 1;
        if (debouncedSearch?.trim()) params.search = debouncedSearch.trim();

        const res = await reclamosApi.getAll(params);
        const serverReclamos = res.data;

        if (serverReclamos.length === 0) return;

        // Crear mapa de reclamos locales para comparación rápida
        const localMap = new Map(reclamos.map(r => [r.id, r]));

        // Detectar cambios: nuevo reclamo, estado diferente, o updated_at más reciente
        let hasChanges = false;

        // Verificar si hay un nuevo reclamo que no teníamos
        if (serverReclamos[0]?.id !== reclamos[0]?.id) {
          hasChanges = true;
        }

        // Verificar cambios en reclamos existentes (estado o updated_at)
        if (!hasChanges) {
          for (const serverReclamo of serverReclamos) {
            const localReclamo = localMap.get(serverReclamo.id);
            if (localReclamo) {
              // Comparar estado
              if (serverReclamo.estado !== localReclamo.estado) {
                hasChanges = true;
                break;
              }
              // Comparar updated_at
              const serverUpdated = new Date(serverReclamo.updated_at || serverReclamo.created_at).getTime();
              const localUpdated = new Date(localReclamo.updated_at || localReclamo.created_at).getTime();
              if (serverUpdated > localUpdated) {
                hasChanges = true;
                break;
              }
            }
          }
        }

        if (hasChanges) {
          // Hacer fetch completo silencioso (sin loading spinner)
          const fullParams: Record<string, string | number> = { skip: 0, limit: ITEMS_PER_PAGE };
          if (filtroEstado) fullParams.estado = filtroEstado;
          if (filtroCategoria) fullParams.categoria_id = filtroCategoria;
          if (debouncedSearch?.trim()) fullParams.search = debouncedSearch.trim();
          if (soloMiArea && user?.dependencia?.id) fullParams.municipio_dependencia_id = user.dependencia.id;
          if (filtroDependencia) fullParams.municipio_dependencia_id = filtroDependencia;
          if (filtroCanal) fullParams.canal = filtroCanal;
          if (soloMisTrabajos && user?.empleado_id) fullParams.solo_mis_tareas = 1;

          const fullRes = await reclamosApi.getAll(fullParams);
          setReclamos(fullRes.data);
          setPage(1);
          setHasMore(fullRes.data.length === ITEMS_PER_PAGE);
        }
      } catch (error) {
        // Silencioso - no mostrar error al usuario durante polling
        console.error('Polling check error:', error);
      }
    };

    const pollingInterval = setInterval(checkForUpdates, 10000);
    return () => clearInterval(pollingInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroCategoria, filtroDependencia, filtroCanal, debouncedSearch, soloMiArea, user?.dependencia?.id]);

  // Mantener actualizado el reclamo del modal abierto cuando la lista cambia
  // (después del polling). Si el reclamo seleccionado se modificó en backend,
  // refrescamos la card del modal sin cerrarlo.
  useEffect(() => {
    if (!selectedReclamo) return;
    const fresh = reclamos.find(r => r.id === selectedReclamo.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedReclamo)) {
      setSelectedReclamo(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reclamos]);

  // Recargar conteos de categorías y estados cuando cambia el filtro de dependencia
  useEffect(() => {
    if (!soloMisTrabajos) {
      // Recargar conteos con el filtro de dependencia
      Promise.all([
        dashboardApi.getConteoEstados(filtroDependencia || undefined),
        dashboardApi.getConteoCategorias({ dependencia_id: filtroDependencia || undefined }),
      ]).then(([estadosRes, categoriasRes]) => {
        const estadosMap: Record<string, number> = {};
        estadosRes.data.forEach((item: { estado: string; cantidad: number }) => {
          estadosMap[item.estado] = item.cantidad;
        });
        setConteosEstados(estadosMap);

        const categoriasMap: Record<number, number> = {};
        categoriasRes.data.forEach((item: { categoria_id: number; cantidad: number }) => {
          categoriasMap[item.categoria_id] = item.cantidad;
        });
        setConteosCategorias(categoriasMap);
      }).catch(error => {
        console.error('Error recargando conteos:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDependencia]);

  // Cargar más cuando cambia la página
  useEffect(() => {
    if (page > 1) {
      fetchReclamos(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Intersection Observer para scroll infinito - usar refs para evitar recrear el observer
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  const loadingRef = useRef(loading);

  // Mantener refs actualizados
  useEffect(() => {
    hasMoreRef.current = hasMore;
    loadingMoreRef.current = loadingMore;
    loadingRef.current = loading;
  }, [hasMore, loadingMore, loading]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading]);

  // Detectar parámetro ?crear=ID o ?categoria=NOMBRE para abrir wizard desde chat
  useEffect(() => {
    if (categorias.length === 0) return;

    const crearCategoriaId = searchParams.get('crear');
    const categoriaNombre = searchParams.get('categoria');

    let categoriaEncontrada: Categoria | undefined;

    if (crearCategoriaId) {
      categoriaEncontrada = categorias.find(c => c.id === parseInt(crearCategoriaId));
    } else if (categoriaNombre) {
      // Buscar por nombre (case insensitive)
      const nombreLower = decodeURIComponent(categoriaNombre).toLowerCase();
      categoriaEncontrada = categorias.find(c => c.nombre.toLowerCase() === nombreLower);
    }

    if (categoriaEncontrada) {
      // El wizard nuevo (CrearReclamoWizard) no acepta preset de categoría —
      // se elige adentro. El deep-link conserva lo esencial: abrir el alta.
      setWizardOpen(true);
      setSearchParams({}); // Limpiar URL
    }
  }, [searchParams, categorias, setSearchParams]);

  /**
   * Deep-link ?filtrar_categoria=NOMBRE → deja la lista FILTRADA por esa
   * categoría.
   *
   * Ojo con el vecino de arriba: `?categoria=NOMBRE` abre el wizard para
   * CREAR uno de esa categoría (lo usa el chat). Son cosas opuestas y el
   * nombre se presta a confusión, así que este va con verbo: `filtrar_`.
   */
  useEffect(() => {
    if (categorias.length === 0) return;
    const nombre = searchParams.get('filtrar_categoria');
    if (!nombre) return;
    const buscada = decodeURIComponent(nombre).toLowerCase();
    const cat = categorias.find((c) => c.nombre.toLowerCase() === buscada);
    if (cat) setFiltroCategoria(cat.id);
    setSearchParams({}, { replace: true });
  }, [searchParams, categorias, setSearchParams]);

  /**
   * Deep-link ?filtrar_estado=ESTADO → deja la lista FILTRADA por ese estado.
   * Mismo criterio que `filtrar_categoria` (verbo adelante). Los valores son
   * los ids de `tabsEstado` ('recibido' | 'en_curso' | 'finalizado' |
   * 'pospuesto' | 'rechazado'); cualquier otro se ignora.
   *
   * Lo usa el Tablero para que "Ver la cola completa" (sin tomar) y "Ver los N
   * finalizados" (cerrados) caigan en la lista ya acotada a lo que el usuario
   * venía mirando, en vez de tirarlo al listado entero.
   */
  useEffect(() => {
    const estado = searchParams.get('filtrar_estado');
    if (!estado) return;
    if (ESTADOS_DEEP_LINK.includes(estado)) setFiltroEstado(estado);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Deep-link ?abrir=N → abre el Sheet del reclamo (la vuelta desde una OT: los
  // chips de reclamo en OrdenesTrabajo navegan acá con ?abrir={id}).
  useEffect(() => {
    const abrirId = searchParams.get('abrir');
    if (!abrirId) return;
    const id = parseInt(abrirId, 10);
    const enLista = reclamos.find(r => r.id === id);
    if (enLista) {
      openViewSheet(enLista);
      setSearchParams({}, { replace: true });
    } else if (reclamos.length > 0) {
      // No está en la página actual: lo traemos puntualmente.
      reclamosApi.getOne(id)
        .then(res => openViewSheet(res.data))
        .catch(() => toast.error('No se pudo abrir el reclamo'));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, reclamos]);








  const fetchReclamos = async (resetPage = false) => {
    try {
      const currentPage = resetPage ? 1 : page;
      const skip = (currentPage - 1) * ITEMS_PER_PAGE;

      if (resetPage) {
        setLoadingMore(false);
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Construir params para la API con paginación
      const params: Record<string, string | number> = {
        skip,
        limit: ITEMS_PER_PAGE,
      };
      if (filtroEstado) {
        params.estado = filtroEstado;
      }
      // "Todos" = TODOS los estados, sin filtrado magico. Si el supervisor
      // quiere ocultar finalizados, usa los chips de estado especificos.
      if (filtroCategoria) {
        params.categoria_id = filtroCategoria;
      }
      if (debouncedSearch && debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      // Filtrar por dependencia del usuario si es modo "soloMiArea"
      if (soloMiArea && user?.dependencia?.id) {
        params.municipio_dependencia_id = user.dependencia.id;
      }
      // Filtrar por dependencia seleccionada en filtros (supervisor)
      if (filtroDependencia) {
        params.municipio_dependencia_id = filtroDependencia;
      }
      // Filtrar por canal de ingreso (omnicanalidad)
      if (filtroCanal) {
        params.canal = filtroCanal;
      }
      // Vista de campo: solo MIS tareas asignadas (empleado vinculado al user)
      if (soloMisTrabajos && user?.empleado_id) {
        params.solo_mis_tareas = 1;
      }

      const reclamosRes = await reclamosApi.getAll(params);
      const newReclamos = reclamosRes.data;

      if (resetPage) {
        setReclamos(newReclamos);
        if (page !== 1) {
          setPage(1);
        }
      } else {
        setReclamos(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const uniqueNew = newReclamos.filter((r: Reclamo) => !existingIds.has(r.id));
          return [...prev, ...uniqueNew];
        });
      }

      setHasMore(newReclamos.length === ITEMS_PER_PAGE);
    } catch (error) {
      toast.error('Error al cargar reclamos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // El wizard nuevo (CrearReclamoWizard) maneja su propio estado interno:
  // al monolito solo le queda abrirlo y cerrarlo.
  const openWizard = () => setWizardOpen(true);
  const closeWizard = () => setWizardOpen(false);

  const openViewSheet = async (reclamo: Reclamo) => {
    setSelectedReclamo(reclamo);
    setDependenciaSeleccionada(''); // TODO: Migrar a dependencia_asignada
    setComentarioAsignacion('');
    setDescripcionInicio('');
    setResolucion('');
    setMotivoRechazo('');
    setDescripcionRechazo('');
    setSugerencias([]);
    setSheetMode('view');

    // El historial ya no se precarga acá: el Sheet no lo muestra (vive en la
    // página de detalle /gestion/reclamos/:id) — era una llamada API tirada
    // a la basura en CADA apertura del sheet.

    // Si el reclamo está cerrado, traer la calificación que dejó el vecino (T5-F1).
    // 404 = todavía no calificó → dejamos null y no mostramos el panel.
    const estadoCierre = (reclamo.estado || '').toLowerCase();
    setCalificacion(null);
    if (estadoCierre === 'finalizado' || estadoCierre === 'resuelto') {
      try {
        const res = await calificacionesApi.getReclamo(reclamo.id);
        setCalificacion(res.data);
      } catch {
        setCalificacion(null);
      }
    }

    // Candidatos sugeridos (F4): cargar para admin/supervisor en cualquier estado
    // asignable que el endpoint acepta (nuevo/recibido/en_curso/asignado). El
    // widget de asignación vive en recibido/en_curso, no solo en 'nuevo'.
    const esGestor = user?.rol === 'admin' || user?.rol === 'supervisor';
    const estadosSugerencia = ['nuevo', 'recibido', 'en_curso', 'asignado'];
    if (esGestor && estadosSugerencia.includes(reclamo.estado)) {
      setLoadingSugerencias(true);
      try {
        const res = await reclamosApi.getSugerenciaAsignacion(reclamo.id);
        setSugerencias(res.data.sugerencias || []);
      } catch (error) {
        console.error('Error cargando sugerencias:', error);
      } finally {
        setLoadingSugerencias(false);
      }
    }
  };

  const closeSheet = () => {
    setSheetMode('closed');
    setSelectedReclamo(null);
    setCalificacion(null);
    // Reset asignación states
    setDependenciaSeleccionada('');
    setEmpleadoSeleccionadoId('');
    setFechaProgramada('');
    setHoraInicio('09:00');
    setDuracion('1');
    setDisponibilidad(null);
    setSugerencias([]);
    setComentarioAsignacion('');
    setFotoCierre(null);
  };

  // Recibir reclamo que ya está asignado a mi dependencia
  const handleRecibir = async () => {
    if (!selectedReclamo || !selectedReclamo.dependencia_asignada) return;

    // Validar que se haya ingresado tiempo estimado
    if (tiempoEstimadoDias === 0 && tiempoEstimadoHoras === 0) {
      toast.error('Ingresá un tiempo estimado de resolución');
      return;
    }

    // Validar descripción obligatoria
    if (!descripcionInicio.trim()) {
      toast.error('Ingresá una descripción del trabajo');
      return;
    }

    // Actualización optimista
    const reclamoActualizado = {
      ...selectedReclamo,
      estado: 'recibido' as const,
      tiempo_estimado_dias: tiempoEstimadoDias,
      tiempo_estimado_horas: tiempoEstimadoHoras,
    };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo recibido correctamente');

    setSaving(true);
    try {
      await reclamosApi.asignar(selectedReclamo.id, {
        dependencia_id: selectedReclamo.dependencia_asignada.id,
        tiempo_estimado_dias: tiempoEstimadoDias,
        tiempo_estimado_horas: tiempoEstimadoHoras,
        comentario: descripcionInicio.trim(),
      });
      fetchReclamos();
      // Limpiar campos
      setDescripcionInicio('');
      setTiempoEstimadoDias(1);
      setTiempoEstimadoHoras(0);
    } catch (error) {
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al recibir reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // OTs vigentes (pendiente/asignada/en_curso) de la dependencia del reclamo
  // abierto — datasource del combo "Orden de trabajo" del bloque de asignación.
  useEffect(() => {
    setOtSeleccionadaId('');
    if (!moduloOTActivo || !selectedReclamo?.dependencia_asignada?.id) {
      setOtsVigentesDependencia([]);
      return;
    }
    ordenesTrabajoApi.list({ dependencia_id: selectedReclamo.dependencia_asignada.id, vigentes: true })
      .then(res => setOtsVigentesDependencia(res.data || []))
      .catch(() => setOtsVigentesDependencia([]));
  }, [selectedReclamo?.id, selectedReclamo?.dependencia_asignada?.id, moduloOTActivo]);

  // Órdenes de trabajo YA vinculadas al reclamo abierto (la vuelta reclamo → OT).
  // Endpoint dedicado (porReclamo) — solo si el módulo está activo.
  useEffect(() => {
    if (!moduloOTActivo || !selectedReclamo?.id) {
      setOtsDelReclamo([]);
      return;
    }
    ordenesTrabajoApi.porReclamo(selectedReclamo.id)
      .then(res => setOtsDelReclamo(res.data || []))
      .catch(() => setOtsDelReclamo([]));
  }, [selectedReclamo?.id, moduloOTActivo]);

  // Cambiar la prioridad del reclamo (F6·A5). La prioridad canónica vive en la
  // OT, así que el editor escribe en la OT del reclamo y refresca el badge.
  const handleCambiarPrioridadOT = async (otId: number, prioridad: string) => {
    if (!selectedReclamo) return;
    const reclamoId = selectedReclamo.id;
    try {
      await ordenesTrabajoApi.update(otId, { prioridad });
      const [otRes, recRes] = await Promise.all([
        ordenesTrabajoApi.porReclamo(reclamoId),
        reclamosApi.getOne(reclamoId),
      ]);
      setOtsDelReclamo(otRes.data || []);
      setSelectedReclamo(recRes.data);
      fetchReclamos(true);
      toast.success('Prioridad actualizada');
    } catch {
      toast.error('No se pudo actualizar la prioridad');
    }
  };

  const handleAsignarEmpleadoManual = async (empleadoId: string) => {
    if (!selectedReclamo) return;
    setEmpleadoSeleccionadoId(empleadoId);
    if (!empleadoId) return;

    // Si asigno empleado, fecha + hora_inicio son obligatorios (sincroniza con planificacion)
    const hoy = new Date().toISOString().split('T')[0];
    const fechaParaAsignar = fechaProgramada || hoy;
    const horaParaAsignar = horaInicio || '09:00';

    setAsignandoEmpleado(true);
    try {
      await reclamosApi.asignarEmpleado(selectedReclamo.id, Number(empleadoId), {
        fecha_programada: fechaParaAsignar,
        hora_inicio: horaParaAsignar,
        hora_fin: horaFin || undefined,
      });
      const emp = empleados.find(e => e.id === Number(empleadoId));
      toast.success(`Asignado a ${emp?.nombre || ''} ${emp?.apellido || ''}`.trim());
      fetchReclamos();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'No se pudo asignar');
    } finally {
      setAsignandoEmpleado(false);
    }
  };

  // --- Vínculo guiado con Órdenes de Trabajo (opt-in, módulo 'ordenes_trabajo') ---
  // Responsable polimórfico: "cuadrilla:<id>" o "empleado:<id>". Una cuadrilla
  // no existe como campo directo del reclamo (Reclamo solo tiene empleado_id
  // liviano) — por eso asignar una cuadrilla SIEMPRE canaliza por una OT.
  const handleAsignarResponsable = (valor: string) => {
    setEmpleadoSeleccionadoId(valor);
    setOtSeleccionadaId('');
  };


  const handleVincularOT = async (otValor: string) => {
    if (!selectedReclamo || !empleadoSeleccionadoId) return;
    setOtSeleccionadaId(otValor);
    const [tipo, idStr] = empleadoSeleccionadoId.split(':');
    const responsable = tipo === 'cuadrilla' ? { cuadrilla_id: Number(idStr) } : { empleado_id: Number(idStr) };

    // Empleado + "asignación simple" (sin OT): circuito liviano de siempre.
    if (!otValor && tipo === 'empleado') {
      await handleAsignarEmpleadoManual(idStr);
      return;
    }
    if (!otValor) return; // cuadrilla sin OT no es una opción válida (ver arriba)

    setVinculandoOT(true);
    try {
      if (otValor === '__nueva__') {
        const res = await ordenesTrabajoApi.create({
          titulo: selectedReclamo.titulo,
          descripcion: `Generada desde el reclamo #${selectedReclamo.id}`,
          reclamo_ids: [selectedReclamo.id],
          fecha_programada: fechaProgramada || undefined,
          hora_inicio: horaInicio || undefined,
          ...responsable,
        });
        toast.success(`Orden de trabajo ${res.data?.numero || ''} creada y vinculada`);
      } else {
        const ot = otsVigentesDependencia.find(o => String(o.id) === otValor);
        const reclamoIds = Array.from(new Set([...(ot?.reclamos.map(r => r.id) || []), selectedReclamo.id]));
        await ordenesTrabajoApi.update(Number(otValor), { reclamo_ids: reclamoIds, ...responsable });
        toast.success(`Reclamo vinculado a la orden ${ot?.numero || otValor}`);
      }
      fetchReclamos();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'No se pudo vincular la orden de trabajo');
    } finally {
      setVinculandoOT(false);
    }
  };

  const handleReasignar = () => {
    if (!selectedReclamo) return;
    const reclamoId = selectedReclamo.id;
    const pierdeResolucion = selectedReclamo.estado === 'finalizado' || selectedReclamo.estado === 'resuelto';
    const message = pierdeResolucion
      ? 'El reclamo vuelve a estado "Recibido" y queda disponible para que otro empleado lo tome. Ojo: se borrará la resolución cargada (el vecino deja de verla). Contanos el motivo (queda en historial).'
      : 'El reclamo vuelve a estado "Recibido" y queda disponible para que otro empleado lo tome. Contanos el motivo (queda en historial).';
    setConfirmModal({
      isOpen: true,
      title: 'Reasignar reclamo',
      message,
      confirmText: 'Reasignar',
      variant: 'warning',
      promptLabel: 'Motivo de la reasignación',
      promptPlaceholder: 'Ej: el empleado no pudo completar el trabajo',
      onConfirm: async (motivo) => {
        if (!motivo) return;
        setConfirmModal(prev => prev ? { ...prev, loading: true } : null);
        try {
          await reclamosApi.reasignar(reclamoId, motivo);
          toast.success('Reclamo devuelto a Recibido. Ya puede tomarlo otro empleado.');
          setEmpleadoSeleccionadoId('');
          setFechaProgramada('');
          setHoraInicio('09:00');
          fetchReclamos();
          closeConfirmModal();
        } catch (err) {
          const e = err as { response?: { data?: { detail?: string } } };
          toast.error(e.response?.data?.detail || 'No se pudo reasignar');
          setConfirmModal(prev => prev ? { ...prev, loading: false } : null);
        }
      },
    });
  };

  // Reabrir un reclamo finalizado tras feedback negativo del vecino
  const handleReabrirPorFeedback = () => {
    if (!selectedReclamo) return;
    const reclamoId = selectedReclamo.id;
    setConfirmModal({
      isOpen: true,
      title: '¿Reabrir el reclamo?',
      message: 'El reclamo volverá a estado "En Curso" para retrabajar la solución. El vecino será notificado.',
      confirmText: 'Reabrir caso',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => prev ? { ...prev, loading: true } : null);
        try {
          await reclamosApi.cambiarEstado(
            reclamoId,
            'en_curso',
            'Reabierto por supervisor tras feedback negativo del vecino.',
          );
          toast.success('Reclamo reabierto — vuelve a En Curso');
          fetchReclamos();
          closeSheet();
          closeConfirmModal();
        } catch (err) {
          const e = err as { response?: { data?: { detail?: string } } };
          toast.error(e.response?.data?.detail || 'No se pudo reabrir el reclamo');
          setConfirmModal(prev => prev ? { ...prev, loading: false } : null);
        }
      },
    });
  };

  // Descartar feedback negativo: el supervisor considera que el trabajo estuvo bien
  const handleDescartarFeedback = () => {
    if (!selectedReclamo) return;
    const reclamoId = selectedReclamo.id;
    setConfirmModal({
      isOpen: true,
      title: '¿Descartar el comentario del vecino?',
      message: 'El reclamo queda finalizado y el feedback se marca como revisado. Esta acción queda registrada en el historial.',
      confirmText: 'Descartar comentario',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => prev ? { ...prev, loading: true } : null);
        try {
          await reclamosApi.descartarFeedbackVecino(reclamoId);
          toast.success('Feedback descartado. El reclamo queda finalizado.');
          // resetPage=true para que sea un fetch fresco desde la pagina 1.
          // Sin esto, fetchReclamos() solo apendea y el reclamo recien
          // descartado queda igual en el estado local, asi que la vista
          // sigue mostrandolo hasta que el usuario hace F5 manual.
          fetchReclamos(true);
          closeConfirmModal();
          closeSheet();
        } catch (err) {
          const e = err as { response?: { data?: { detail?: string } } };
          toast.error(e.response?.data?.detail || 'No se pudo descartar');
          setConfirmModal(prev => prev ? { ...prev, loading: false } : null);
        }
      },
    });
  };

  const handleAsignar = async () => {
    if (!selectedReclamo || !dependenciaSeleccionada) return;

    // Validar descripción obligatoria
    if (!descripcionInicio.trim()) {
      toast.error('Ingresá una descripción del trabajo');
      return;
    }

    // Encontrar la dependencia seleccionada para la actualización optimista
    const dependenciaData = dependenciasDisponibles.find(d => d.id === Number(dependenciaSeleccionada));

    // Actualización optimista
    const reclamoActualizado = {
      ...selectedReclamo,
      estado: 'asignado' as const,
      municipio_dependencia_id: Number(dependenciaSeleccionada),
      dependencia_asignada: dependenciaData ? {
        id: dependenciaData.id,
        dependencia_id: dependenciaData.dependencia_id,
        nombre: dependenciaData.dependencia?.nombre || dependenciaData.nombre,
        color: dependenciaData.dependencia?.color,
        icono: dependenciaData.dependencia?.icono
      } : selectedReclamo.dependencia_asignada,
      fecha_programada: fechaProgramada || selectedReclamo.fecha_programada
    };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo asignado correctamente');

    setSaving(true);
    try {
      await reclamosApi.asignar(selectedReclamo.id, {
        dependencia_id: Number(dependenciaSeleccionada),
        fecha_programada: fechaProgramada || undefined,
        hora_inicio: horaInicio || undefined,
        hora_fin: horaFin || undefined,
        comentario: descripcionInicio.trim()
      });
      fetchReclamos();
      setDescripcionInicio('');
    } catch (error) {
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al asignar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Cargar disponibilidad cuando cambia empleado o fecha
  const fetchDisponibilidad = async (empleadoId: string, fecha: string, buscarSiguiente: boolean = false) => {
    if (!empleadoId || !fecha) {
      setDisponibilidad(null);
      return;
    }
    setLoadingDisponibilidad(true);
    try {
      const response = await reclamosApi.getDisponibilidadEmpleado(Number(empleadoId), fecha, buscarSiguiente);
      setDisponibilidad(response.data);
      // Auto-setear hora de inicio al próximo disponible
      const proximoDisponible = response.data.proximo_disponible.slice(0, 5); // HH:MM
      setHoraInicio(proximoDisponible);
      // Si la fecha cambió (porque buscó el siguiente día disponible), actualizar
      if (response.data.fecha !== fecha) {
        setFechaProgramada(response.data.fecha);
      }
    } catch (error) {
      console.error('Error al obtener disponibilidad:', error);
      setDisponibilidad(null);
      setHoraInicio('09:00');
    } finally {
      setLoadingDisponibilidad(false);
    }
  };

  const handleIniciar = async () => {
    if (!selectedReclamo) return;

    // Validar que se haya ingresado descripción
    if (!descripcionInicio.trim()) {
      toast.error('Ingresá una descripción del trabajo a realizar');
      return;
    }

    setSaving(true);
    try {
      // PATCH cambiarEstado: permite rol empleado y valida la transición recibido->en_curso
      // (el POST /iniciar era admin/supervisor-only -> 403 para el empleado).
      await reclamosApi.cambiarEstado(selectedReclamo.id, 'en_curso', descripcionInicio.trim());
      // Confirmado por el backend: recién ahora actualizamos UI, cerramos y avisamos.
      const reclamoActualizado = { ...selectedReclamo, estado: 'en_curso' as const };
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
      fetchReclamos();
      closeSheet();
      toast.success('Reclamo en proceso');
    } catch (error) {
      toast.error('Error al poner en proceso');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizar = async () => {
    if (!selectedReclamo || !resolucion) return;

    // Toast de advertencia para supervisores/admins
    if (user?.rol === 'supervisor' || user?.rol === 'admin') {
      toast.warning('Atención: Estás finalizando este reclamo directamente como supervisor.', {
        duration: 4000,
      });
    }

    setSaving(true);
    const evidencia = fotoCierre;
    // Un empleado no finaliza directo: el backend deja el reclamo en
    // pendiente_confirmacion (queda a la espera del supervisor).
    const esEmpleado = user?.rol === 'empleado';
    try {
      await reclamosApi.resolver(selectedReclamo.id, { resolucion });
      // Confirmado por el backend: recién ahora actualizamos UI, cerramos y avisamos.
      const nuevoEstado = esEmpleado ? 'pendiente_confirmacion' : 'finalizado';
      const reclamoActualizado = { ...selectedReclamo, estado: nuevoEstado as typeof selectedReclamo.estado, resolucion };
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
      // Evidencia de cierre: foto del trabajo terminado (etapa 'resolucion')
      if (evidencia) {
        try {
          await reclamosApi.upload(selectedReclamo.id, evidencia, 'resolucion');
          toast.success('Foto de cierre adjuntada');
        } catch {
          toast.error('El trabajo se registró pero la foto de cierre no se pudo subir');
        }
      }
      setFotoCierre(null);
      fetchReclamos();
      closeSheet();
      toast.success(esEmpleado ? 'Enviado al supervisor para confirmar' : 'Reclamo finalizado');
    } catch (error) {
      toast.error('Error al finalizar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRechazar = async () => {
    if (!selectedReclamo || !motivoRechazo) return;

    setSaving(true);
    try {
      await reclamosApi.rechazar(selectedReclamo.id, {
        motivo: motivoRechazo,
        descripcion: descripcionRechazo || undefined
      });
      // Confirmado por el backend: recién ahora actualizamos UI, cerramos y avisamos.
      const reclamoActualizado = { ...selectedReclamo, estado: 'rechazado' as const };
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
      fetchReclamos();
      closeSheet();
      toast.success('Reclamo rechazado');
    } catch (error) {
      toast.error('Error al rechazar reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePosponer = async () => {
    if (!selectedReclamo || !motivoNoFinalizado) return;

    // Actualización optimista
    const reclamoActualizado = { ...selectedReclamo, estado: 'pospuesto' as const };
    setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? reclamoActualizado : r));
    closeSheet();
    toast.success('Reclamo pospuesto');

    setSaving(true);
    try {
      const comentario = `Trabajo pospuesto: ${motivoNoFinalizado}${resolucion ? `. ${resolucion}` : ''}`;
      await reclamosApi.cambiarEstado(selectedReclamo.id, 'pospuesto', comentario);
      fetchReclamos(true);
      // Reset estados
      setTipoFinalizacion('finalizado');
      setMotivoNoFinalizado('');
      setResolucion('');
    } catch (error) {
      // Revertir cambio optimista si falla
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? selectedReclamo : r));
      toast.error('Error al posponer el reclamo');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  // Filtro local - siempre filtra cuando hay búsqueda.
  // `reclamosBuscados` es la BASE de la pantalla (búsqueda + orden). El foco
  // del hero se aplica DESPUÉS (ver `filteredReclamos`), para que los KPIs y
  // la frase del hero —que miran esta base— no se muevan cuando el usuario
  // aplica el foco que el propio hero le ofreció.
  const reclamosBuscados = useMemo(() => reclamos.filter(r => {
    // Si no hay búsqueda, mostrar todos
    if (!search || !search.trim()) return true;

    // Filtro local en todas las columnas visibles
    const s = search.trim().toLowerCase();
    return (
      // ID
      String(r.id).includes(s) ||
      // Título y descripción
      r.titulo?.toLowerCase().includes(s) ||
      r.descripcion?.toLowerCase().includes(s) ||
      // Estado (buscar por nombre visible)
      r.estado?.toLowerCase().includes(s) ||
      estadoLabels[r.estado]?.toLowerCase().includes(s) ||
      // Ubicación
      r.direccion?.toLowerCase().includes(s) ||
      r.referencia?.toLowerCase().includes(s) ||
      // Categoría
      r.categoria?.nombre?.toLowerCase().includes(s) ||
      // Zona
      r.zona?.nombre?.toLowerCase().includes(s) ||
      r.zona?.codigo?.toLowerCase().includes(s) ||
      // Creador (nombre, apellido, email, teléfono)
      r.creador?.nombre?.toLowerCase().includes(s) ||
      r.creador?.apellido?.toLowerCase().includes(s) ||
      `${r.creador?.nombre || ''} ${r.creador?.apellido || ''}`.toLowerCase().includes(s) ||
      r.creador?.email?.toLowerCase().includes(s) ||
      r.creador?.telefono?.includes(s) ||
      // Dependencia asignada
      r.dependencia_asignada?.nombre?.toLowerCase().includes(s) ||
      // Resolución y rechazo
      r.resolucion?.toLowerCase().includes(s) ||
      r.descripcion_rechazo?.toLowerCase().includes(s) ||
      r.motivo_rechazo?.toLowerCase().includes(s) ||
      // Fechas (formato dd/mm/yyyy)
      (r.created_at && new Date(r.created_at).toLocaleDateString('es-AR').includes(s)) ||
      (r.fecha_programada && new Date(r.fecha_programada).toLocaleDateString('es-AR').includes(s))
    );
  }).sort((a, b) => {
    if (ordenamiento === 'programado') {
      // Ordenar por fecha programada (más próxima primero), los sin fecha al final
      const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Infinity;
      const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Infinity;
      return fechaA - fechaB;
    } else {
      // Ordenar por última actualización (más reciente primero) - incluye comentarios
      const fechaA = new Date(a.updated_at || a.created_at).getTime();
      const fechaB = new Date(b.updated_at || b.created_at).getTime();
      return fechaB - fechaA;
    }
  }), [reclamos, search, ordenamiento]);

  // Lista que consume TODA la pantalla (tabla, tarjetas, vista guiada, pie):
  // la base + el foco del hero si está activo.
  const filteredReclamos = useMemo(
    () => (foco ? reclamosBuscados.filter(FOCOS[foco].test) : reclamosBuscados),
    [reclamosBuscados, foco],
  );

  // Métricas de vencimiento y de asignación para el hero. Se calculan sobre la
  // BASE (sin foco) y sólo sobre lo que el cliente tiene cargado: por eso los
  // subtextos con detalle recién se muestran cuando ya no queda nada por
  // paginar (`!hasMore`), para no dar por global un número de una página.
  const metricasHero = useMemo(() => {
    let vencenHoy = 0, vencidos = 0, sinDep = 0, recibidosSinDep = 0, enCursoConDep = 0;
    for (const r of reclamosBuscados) {
      if (venceHoy(r)) vencenHoy++;
      if (yaVencio(r)) vencidos++;
      if (!estaAbierto(r)) continue;
      const estado = (r.estado || '').toLowerCase();
      const huerfano = sinDependencia(r);
      if (huerfano) sinDep++;
      if (ESTADOS_RECIBIDO.has(estado) && huerfano) recibidosSinDep++;
      if (ESTADOS_EN_CURSO.has(estado) && !huerfano) enCursoConDep++;
    }
    return { vencenHoy, vencidos, sinDep, recibidosSinDep, enCursoConDep, universoCompleto: !hasMore };
  }, [reclamosBuscados, hasMore]);


  // Consolidar este reclamo en LA orden de trabajo de zona de su POI (F6 · Etapa
  // B). El endpoint es idempotente: crea la OT consolidada del POI si no existe,
  // o reusa la vigente, y vincula el reclamo. Refrescamos para que el reclamo
  // muestre su nueva prioridad/OT.
  const handleConsolidarPOI = async () => {
    if (!selectedReclamo?.poi || consolidandoPOI) return;
    setConsolidandoPOI(true);
    try {
      const res = await poiApi.consolidar(selectedReclamo.poi.id, [selectedReclamo.id]);
      const ot = res.data as PoiConsolidarResponse;
      toast.success(
        ot.creada
          ? `Orden de trabajo ${ot.numero} creada para la zona de ${selectedReclamo.poi.nombre}`
          : `Reclamo sumado a la orden ${ot.numero} de la zona de ${selectedReclamo.poi.nombre}`,
        { description: `${ot.reclamos_count} reclamo${ot.reclamos_count === 1 ? '' : 's'} en la zona` }
      );
      await fetchReclamos(true);
    } catch {
      toast.error('No se pudo consolidar el reclamo en la orden de zona');
    } finally {
      setConsolidandoPOI(false);
    }
  };

  // Renderizar contenido del Sheet de ver
  const renderViewContent = () => {
    if (!selectedReclamo) return null;
    // Banner POI (F6 · Etapa B): visible solo si el módulo Puntos de Interés está
    // activo, el reclamo cae en la zona de un POI y el usuario puede consolidar
    // (admin/supervisor — lo mismo que exige el endpoint). Copy para funcionario.
    const poiZona = selectedReclamo.poi;
    const puedeConsolidar = user?.rol === 'admin' || user?.rol === 'supervisor';
    const showPoiBanner = moduloPOIActivo && !!poiZona && puedeConsolidar;

    return (
      <div className="space-y-2">
        {/* Banner POI: el reclamo cae en la zona de un Punto de Interés → ofrecer
            consolidarlo en LA orden de trabajo de esa zona. Mismo estilo que los
            demás banners de ayuda (deriva de theme.primary, sin hex inline). */}
        {showPoiBanner && poiZona && (
          <div className="rs-banner">
            <span className="rs-banner-icono">
              <span className="rs-latido" />
              <MapPin className="h-4 w-4" />
            </span>
            <span className="rs-banner-cuerpo">
              <span className="rs-banner-texto">
                <strong>
                  Está en la zona de {poiZona.nombre}
                  {poiZona.tipo_nombre ? ` · ${poiZona.tipo_nombre}` : ''}.
                </strong>{' '}
                Podés agrupar este reclamo con los demás de la zona en una sola orden: se atienden juntos y no se pierde ninguno.
              </span>
              <button
                type="button"
                className="rs-banner-accion"
                onClick={handleConsolidarPOI}
                disabled={consolidandoPOI}
              >
                {consolidandoPOI ? 'Consolidando…' : 'Consolidar en OT de zona'}
                {consolidandoPOI
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <MoveRight className="h-3.5 w-3.5" />}
              </button>
            </span>
          </div>
        )}

        {/* Qué dice el vecino — la descripción manda; las fotos, abajo. */}
        <div className="rs-seccion">
          <span className="rs-seccion-titulo">Qué dice el vecino</span>
          <p className="rs-parrafo">"{selectedReclamo.descripcion}"</p>
          {(selectedReclamo.imagenes?.length ?? 0) > 0 && (
            <div className="rs-fotos">
              {selectedReclamo.imagenes!.slice(0, 2).map((img, i) => (
                <a key={i} href={img} target="_blank" rel="noreferrer" className="rs-foto" title="Ver foto">
                  <img src={img} alt={`Foto ${i + 1} del reclamo`} loading="lazy" />
                </a>
              ))}
              {selectedReclamo.imagenes!.length > 2 && (
                <a
                  href={selectedReclamo.imagenes![2]}
                  target="_blank"
                  rel="noreferrer"
                  className="rs-foto rs-foto--mas"
                  title="Ver más fotos"
                >
                  +{selectedReclamo.imagenes!.length - 2}
                </a>
              )}
            </div>
          )}
        </div>

        {/* DÓNDE / QUIÉN LO REPORTÓ — dos columnas, datos reales. */}
        <div className="rs-grid2">
          <span className="min-w-0">
            <span className="rs-mini-eyebrow">Dónde</span>
            <span className="rs-dato">{selectedReclamo.direccion}</span>
            {(selectedReclamo.zona || selectedReclamo.referencia) && (
              <span className="rs-dato-sub">
                {[selectedReclamo.zona?.nombre, selectedReclamo.referencia ? `Ref: ${selectedReclamo.referencia}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <button
              type="button"
              className="rs-mini-link"
              onClick={() => { closeSheet(); navigate('/gestion/mapa'); }}
            >
              Ver en el mapa
            </button>
          </span>
          <span className="min-w-0">
            <span className="rs-mini-eyebrow">Quién lo reportó</span>
            <span className="rs-persona">
              <span className="rs-avatar">
                {`${selectedReclamo.creador.nombre?.[0] ?? ''}${selectedReclamo.creador.apellido?.[0] ?? ''}`.toUpperCase() || '?'}
              </span>
              <span className="rs-persona-datos">
                <span className="rs-persona-nombre">
                  {selectedReclamo.creador.nombre} {selectedReclamo.creador.apellido}
                </span>
                <span className="rs-dato-sub">
                  {selectedReclamo.creador.telefono || selectedReclamo.creador.email}
                </span>
              </span>
            </span>
          </span>
        </div>

        {/* Por dónde pasó — entrada por canal → responsable actual. */}
        <div className="rs-seccion">
          <div className="rs-seccion-cab">
            <span className="rs-seccion-titulo">Por dónde pasó</span>
          </div>
          <div className="mt-3">
            <div className="rs-tl">
              <span className="rs-tl-col">
                <span className="rs-tl-dot" />
                <span className="rs-tl-linea" />
              </span>
              <span className="rs-tl-txt">
                Ingresó por {(canalLabel(selectedReclamo.canal) || selectedReclamo.canal || 'web').toLowerCase()}
                <span className="rs-tl-sub">
                  {new Date(selectedReclamo.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  {' · '}
                  {new Date(selectedReclamo.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
            </div>
            <div className="rs-tl">
              <span className="rs-tl-col">
                <span className={`rs-tl-dot${selectedReclamo.dependencia_asignada ? ' rs-tl-dot--actual' : ''}`}>
                  {selectedReclamo.dependencia_asignada && <span className="rs-latido" />}
                </span>
              </span>
              <span className={`rs-tl-txt${selectedReclamo.dependencia_asignada ? ' rs-tl-txt--actual' : ''}`}>
                {selectedReclamo.dependencia_asignada?.nombre || 'Sin dependencia asignada todavía'}
                <span className="rs-tl-sub">
                  {selectedReclamo.dependencia_asignada
                    ? (selectedReclamo.estado === 'recibido' && selectedReclamo.fecha_estimada_resolucion
                        ? `Responsable actual · resolución estimada ${new Date(selectedReclamo.fecha_estimada_resolucion).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`
                        : 'Responsable actual')
                    : 'Se asigna desde el selector de acá abajo'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Asignar responsable — polimórfico (cuadrilla o empleado) + vínculo guiado
            a Orden de Trabajo. Una cuadrilla no tiene campo directo en Reclamo, así
            que asignar una cuadrilla siempre canaliza por una OT; un empleado puede
            seguir el circuito liviano de siempre (sin OT) o sumarse a una OT. */}
        {selectedReclamo.dependencia_asignada?.nombre &&
          (user?.rol === 'admin' || user?.rol === 'supervisor') &&
          ['recibido', 'en_curso', 'pospuesto'].includes(selectedReclamo.estado) && (() => {
            const empleadosDependencia = empleados.filter(e =>
              e.tipo === 'operario' && (
                e.categoria_principal_id === selectedReclamo.categoria.id ||
                e.categorias?.some(c => c.id === selectedReclamo.categoria.id)
              )
            );
            const hayCuadrillas = cuadrillasDisponibles.length > 0;
            const hayCandidatos = empleadosDependencia.length > 0 || hayCuadrillas;
            const responsableOptions = [
              ...cuadrillasDisponibles.map(c => ({
                value: `cuadrilla:${c.id}`,
                label: `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''} · cuadrilla`,
              })),
              ...empleadosDependencia.map(emp => ({
                value: `empleado:${emp.id}`,
                label: `${emp.nombre} ${emp.apellido || ''}${emp.especialidad ? ` · ${emp.especialidad}` : ''}`.trim(),
              })),
            ];
            const tipoResp = empleadoSeleccionadoId.split(':')[0];
            const haySugerencias = sugerencias.length > 0;
            const hayAlgo = hayCandidatos || haySugerencias || loadingSugerencias;
            const otOptions = [
              ...(tipoResp === 'empleado' ? [{ value: '', label: 'Asignación simple (sin orden de trabajo)' }] : []),
              ...otsVigentesDependencia.map(ot => ({
                value: String(ot.id),
                label: `${ot.numero} · ${ot.titulo} (${ot.reclamos.length} reclamo${ot.reclamos.length === 1 ? '' : 's'})`,
              })),
              { value: '__nueva__', label: '+ Nueva orden de trabajo' },
            ];
            // Diseño "Reclamo Detalle": los DOS mejores candidatos van como
            // tarjetas-radio; el resto de los sugeridos (con su puntaje) y la
            // lista completa viven en el combo "O elegir otro".
            const tarjetas = sugerencias.slice(0, 2);
            const idsSugeridos = new Set(sugerencias.map((s) => `empleado:${s.empleado_id}`));
            const opcionesAsignar = [
              ...sugerencias.slice(2).map((s) => ({
                value: `empleado:${s.empleado_id}`,
                label: s.empleado_nombre,
                description: `${s.score} pts · ${s.detalles?.ausente ? 'Ausente hoy' : 'Disponible'}${s.razon_principal ? ` · ${s.razon_principal}` : ''}`,
              })),
              ...responsableOptions.filter((o) => !idsSugeridos.has(o.value)),
            ];
            return (
              <div
                key={`resp-${selectedReclamo.id}-${hayAlgo ? 'o' : 'c'}`}
                className="rs-seccion rs-seccion--ultima"
              >
                <div className="rs-seccion-cab">
                  <span className="rs-seccion-titulo">Quién lo va a hacer</span>
                  <span className="rs-seccion-hint">
                    {hayAlgo
                      ? 'falta esto para pasarlo a en curso'
                      : 'sin candidatos cargados — podés avanzar igual'}
                  </span>
                </div>
                {/* Los DOS mejores candidatos como tarjetas-radio, calcadas del
                    diseño; elegir acá dispara el MISMO flujo polimórfico que el
                    combo (handleAsignarResponsable). */}
                {tarjetas.map((s, i) => {
                  const valor = `empleado:${s.empleado_id}`;
                  const activo = empleadoSeleccionadoId === valor;
                  const carga = s.detalles?.carga_trabajo ?? 0;
                  const estadoDerecha = s.detalles?.ausente
                    ? { texto: 'Ausente hoy', ok: false }
                    : i === 0 || carga === 0
                      ? { texto: 'Disponible hoy', ok: true }
                      : { texto: `${carga} trabajo${carga === 1 ? '' : 's'} abiertos`, ok: false };
                  return (
                    <label key={s.empleado_id} className={`rs-cand${activo ? ' rs-cand--activo' : ''}`}>
                      <input
                        type="radio"
                        name={`rs-asignado-${selectedReclamo.id}`}
                        className="rs-cand-radio"
                        checked={activo}
                        disabled={asignandoEmpleado}
                        onChange={() => handleAsignarResponsable(valor)}
                      />
                      <span className="rs-cand-cuerpo">
                        <span className="rs-cand-fila">
                          <span className="rs-cand-nombre">{s.empleado_nombre}</span>
                          <span className={`rs-cand-estado${estadoDerecha.ok ? ' rs-cand-estado--ok' : ''}`}>
                            {estadoDerecha.texto}
                          </span>
                        </span>
                        {s.razon_principal && <span className="rs-cand-razon">{s.razon_principal}</span>}
                      </span>
                    </label>
                  );
                })}
                {loadingSugerencias && (
                  <span className="rs-dato-sub">Buscando candidatos sugeridos…</span>
                )}

                {/* "O elegir otro": el resto de sugeridos (con puntaje) + la
                    lista completa de cuadrillas y empleados, en UN combo. */}
                {(opcionesAsignar.length > 0 || hayCandidatos) && (
                  <div className="rs-asignar">
                    <div className="rs-asignar-combo">
                      <ModernSelect
                        variant="v2"
                        value={tarjetas.some((s) => `empleado:${s.empleado_id}` === empleadoSeleccionadoId) ? '' : empleadoSeleccionadoId}
                        onChange={handleAsignarResponsable}
                        options={opcionesAsignar}
                        placeholder={hayCuadrillas ? 'O elegir otro · cuadrilla o empleado…' : 'O elegir otro empleado…'}
                        disabled={asignandoEmpleado}
                        searchable
                      />
                    </div>
                  </div>
                )}
                {!hayAlgo && (
                  <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
                    Esta dependencia no tiene cuadrillas ni empleados cargados para la categoría del reclamo. La asignación es opcional — podés avanzar sin ella.
                  </p>
                )}
                {moduloOTActivo && !!empleadoSeleccionadoId && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>
                      Orden de trabajo
                    </p>
                    <ModernSelect
                      value={otSeleccionadaId}
                      onChange={handleVincularOT}
                      options={otOptions}
                      placeholder="Elegí una orden vigente o generá una nueva…"
                      disabled={vinculandoOT}
                      searchable
                    />
                    <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                      {tipoResp === 'cuadrilla'
                        ? 'Las cuadrillas siempre trabajan con una orden de trabajo formal.'
                        : 'Opcional: si el municipio no usa órdenes de trabajo, dejá "Asignación simple".'}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

        {/* Órdenes de trabajo YA vinculadas (la vuelta reclamo → OT). Solo si el
            módulo está activo y el reclamo tiene alguna OT. Read-only + link. */}
        {moduloOTActivo && otsDelReclamo.length > 0 && (
          <ABMInfoPanel
            title={otsDelReclamo.length === 1 ? 'Orden de trabajo' : 'Órdenes de trabajo'}
            icon={<Wrench className="h-4 w-4" />}
            variant="default"
          >
            <div className="space-y-2">
              {otsDelReclamo.map((ot) => {
                const responsable = ot.cuadrilla_nombre || ot.empleado_nombre || 'Sin responsable';
                return (
                  <button
                    key={ot.id}
                    type="button"
                    onClick={() => navigate(`/gestion/ordenes-trabajo?abrir=${ot.id}`)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors hover:opacity-80"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
                  >
                    <span className="font-mono text-sm font-semibold" style={{ color: theme.text }}>
                      {ot.numero}
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${otEstadoColor(ot.estado)}20`, color: otEstadoColor(ot.estado) }}
                    >
                      {otEstadoLabel(ot.estado)}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: theme.textSecondary }}>
                      {responsable}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  </button>
                );
              })}
            </div>
          </ABMInfoPanel>
        )}

        {/* Editor de prioridad (F6·A5). La prioridad canónica vive en la OT, así
            que el cambio escribe en la OT del reclamo. Editable solo por gestor y
            cuando el reclamo tiene UNA sola OT viva (implícita 1:1); con varias OTs
            (consolidación de zona) el destino sería ambiguo → queda solo el badge
            del header. Sin OT viva no hay dónde escribir → idem. */}
        {(user?.rol === 'admin' || user?.rol === 'supervisor') && (() => {
          const otsEditables = otsDelReclamo.filter(
            (ot) => ot.estado !== 'completada' && ot.estado !== 'cancelada',
          );
          if (otsEditables.length !== 1) return null;
          const ot = otsEditables[0];
          const PrioIcon = prioridadIcon(ot.prioridad);
          const prioridadOptions = PRIORIDAD_OPTIONS.map((o) => ({
            ...o,
            color: prioridadColor(o.value),
          }));
          return (
            <ABMInfoPanel
              title="Prioridad del trabajo"
              icon={<PrioIcon className="h-4 w-4" />}
              variant="default"
            >
              <ModernSelect
                value={ot.prioridad || 'media'}
                onChange={(v) => handleCambiarPrioridadOT(ot.id, v)}
                options={prioridadOptions}
              />
              <p className="text-[11px] mt-2" style={{ color: theme.textSecondary }}>
                Urgente es un escalón manual del supervisor.
              </p>
            </ABMInfoPanel>
          );
        })()}

        {/* Tiempo estimado de resolución - Solo para aceptar reclamos nuevos */}
        {selectedReclamo.estado === 'nuevo' && selectedReclamo.dependencia_asignada && !dependenciaSeleccionada && (
          <ABMInfoPanel
            title="Tiempo estimado de resolución"
            icon={<Clock className="h-4 w-4" />}
            variant="default"
          >
            <div className="space-y-3">
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Indicá en cuánto tiempo estimás resolver este reclamo
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Días
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={tiempoEstimadoDias}
                    onChange={(e) => setTiempoEstimadoDias(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Horas
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={tiempoEstimadoHoras}
                    onChange={(e) => setTiempoEstimadoHoras(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                    className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              </div>
              {(tiempoEstimadoDias > 0 || tiempoEstimadoHoras > 0) && (
                <div
                  className="rounded-xl p-3 flex items-center gap-2"
                  style={{ backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }}
                >
                  <Clock className="h-4 w-4" style={{ color: theme.primary }} />
                  <span className="text-sm" style={{ color: theme.text }}>
                    Resolución estimada: {' '}
                    <strong>
                      {new Date(Date.now() + (tiempoEstimadoDias * 24 + tiempoEstimadoHoras) * 60 * 60 * 1000).toLocaleString('es-AR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </strong>
                  </span>
                </div>
              )}

              {/* Comentario obligatorio */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                  Comentario <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={comentarioAsignacion}
                  onChange={(e) => setComentarioAsignacion(e.target.value)}
                  placeholder="Indicá cómo se va a resolver este reclamo..."
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all resize-none"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                />
              </div>
            </div>
          </ABMInfoPanel>
        )}

        {/* Resolución */}
        {selectedReclamo.resolucion && (
          <ABMInfoPanel
            title="Resolución"
            icon={<FileCheck className="h-4 w-4" />}
            variant="success"
          >
            <p className="text-sm mb-2">{selectedReclamo.resolucion}</p>
            {selectedReclamo.fecha_resolucion && (
              <p className="text-xs opacity-80">
                {new Date(selectedReclamo.fecha_resolucion).toLocaleString()}
              </p>
            )}
          </ABMInfoPanel>
        )}

        {/* Calificación del vecino (T5-F1) — solo si el vecino ya calificó el cierre */}
        {calificacion && <CalificacionVecinoPanel calificacion={calificacion} />}

        {/* Motivo de rechazo — sección plana con el título en rojo, mismo
            lenguaje que el resto del sheet (nada de panel verde). */}
        {selectedReclamo.motivo_rechazo && (
          <div className="rs-seccion">
            <span className="rs-seccion-titulo rs-seccion-titulo--malo">Motivo de rechazo</span>
            <p className="rs-parrafo rs-parrafo--destacado">{selectedReclamo.motivo_rechazo}</p>
            {selectedReclamo.descripcion_rechazo && (
              <p className="rs-parrafo">{selectedReclamo.descripcion_rechazo}</p>
            )}
          </div>
        )}

        {/* Acciones según estado */}
        {selectedReclamo.estado === 'nuevo' && (
          <ABMCollapsible
            title={selectedReclamo.dependencia_asignada ? "Reasignar a otra dependencia" : "Asignar Dependencia"}
            icon={<Building2 className="h-4 w-4" />}
            defaultOpen={!selectedReclamo.dependencia_asignada}
          >
            <div className="space-y-3">
              {/* Info: Los reclamos se asignan a dependencias basándose en la categoría */}
              {selectedReclamo?.dependencia_asignada && !dependenciaSeleccionada && (
                <div
                  className="rounded-xl p-3 flex items-center gap-2"
                  style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.border}` }}
                >
                  <span className="text-sm" style={{ color: theme.textSecondary }}>
                    Selecciona una dependencia diferente si deseas reasignar
                  </span>
                </div>
              )}

              {/* Selector de dependencia */}
              {dependenciasDisponibles.length > 0 ? (
                <ModernSelect
                  value={dependenciaSeleccionada}
                  onChange={(value) => setDependenciaSeleccionada(value || '')}
                  placeholder={selectedReclamo.dependencia_asignada ? "Seleccionar otra dependencia..." : "Seleccionar dependencia..."}
                  searchable={dependenciasDisponibles.length > 5}
                  options={dependenciasDisponibles.map(dep => ({
                    value: String(dep.id),
                    label: dep.dependencia?.nombre || dep.nombre || `Dependencia #${dep.id}`,
                    description: dep.dependencia?.descripcion || 'Área municipal',
                    icon: <Building2 className="h-4 w-4" />,
                    color: dep.dependencia?.color || '#6366f1',
                  }))}
                />
              ) : (
                <div className="text-sm py-2 px-3 rounded-lg" style={{ backgroundColor: theme.card, color: theme.textSecondary }}>
                  No hay dependencias disponibles
                </div>
              )}

              {/* Botón para cancelar reasignación */}
              {dependenciaSeleccionada && selectedReclamo.dependencia_asignada && (
                <button
                  onClick={() => setDependenciaSeleccionada('')}
                  className="text-sm px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                >
                  Cancelar reasignación
                </button>
              )}

              {/* Tiempo estimado y programación - Solo se muestra cuando hay dependencia seleccionada */}
              {dependenciaSeleccionada && (
                <div className="space-y-3">
                  {/* Tiempo estimado de resolución */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium" style={{ color: theme.text }}>
                      <Clock className="h-4 w-4 inline mr-1" />
                      Tiempo estimado de resolución
                    </p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>
                      Indicá en cuánto tiempo estimás resolver este reclamo
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                          Días
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="365"
                          value={tiempoEstimadoDias}
                          onChange={(e) => setTiempoEstimadoDias(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            color: theme.text,
                            border: `1px solid ${theme.border}`,
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                          Horas
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={tiempoEstimadoHoras}
                          onChange={(e) => setTiempoEstimadoHoras(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                          className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            color: theme.text,
                            border: `1px solid ${theme.border}`,
                          }}
                        />
                      </div>
                    </div>
                    {(tiempoEstimadoDias > 0 || tiempoEstimadoHoras > 0) && (
                      <div
                        className="rounded-xl p-3 flex items-center gap-2"
                        style={{ backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }}
                      >
                        <Clock className="h-4 w-4" style={{ color: theme.primary }} />
                        <span className="text-sm" style={{ color: theme.text }}>
                          Resolución estimada: {' '}
                          <strong>
                            {new Date(Date.now() + (tiempoEstimadoDias * 24 + tiempoEstimadoHoras) * 60 * 60 * 1000).toLocaleString('es-AR', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Loading de disponibilidad */}
                  {loadingDisponibilidad && (
                    <div className="flex items-center justify-center py-3">
                      <div className="h-5 w-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.primary, borderTopColor: 'transparent' }} />
                      <span className="ml-2 text-sm" style={{ color: theme.textSecondary }}>Buscando disponibilidad...</span>
                    </div>
                  )}

                  {/* Mostrar fecha y horarios cuando hay disponibilidad */}
                  {!loadingDisponibilidad && disponibilidad && (
                    <>
                      {/* Fecha programada - renglón completo */}
                      <div>
                        <DatePicker
                          label="Fecha programada"
                          value={fechaProgramada}
                          minDate={new Date().toISOString().split('T')[0]}
                          onChange={(iso) => {
                            setFechaProgramada(iso);
                            if (dependenciaSeleccionada && iso) {
                              fetchDisponibilidad(dependenciaSeleccionada, iso, true);
                            }
                          }}
                          placeholder="Seleccionar fecha"
                        />
                      </div>

                      {/* Hora inicio y Duración - divididos */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                            Hora inicio
                          </label>
                          <input
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                            className="w-full rounded-xl px-4 py-3 focus:ring-2 focus:outline-none transition-all"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              color: theme.text,
                              border: `1px solid ${theme.border}`,
                            }}
                          />
                        </div>
                        <ModernSelect
                          label="Duración"
                          value={duracion}
                          onChange={setDuracion}
                          options={duracionOptions.map(opt => ({
                            value: opt.value,
                            label: opt.label,
                            icon: <Clock className="h-4 w-4" />,
                          }))}
                        />
                      </div>

                      {/* Info de horario */}
                      {horaFin <= disponibilidad.hora_fin_jornada.slice(0, 5) ? (
                        <p className="text-xs" style={{ color: theme.textSecondary }}>
                          Horario: {horaInicio} - {horaFin}
                          <span className="ml-2" style={{ color: theme.primary }}>
                            (Jornada: 09:00 - {disponibilidad.hora_fin_jornada.slice(0, 5)})
                          </span>
                        </p>
                      ) : (
                        <div
                          className="rounded-lg p-3 text-sm flex items-center gap-2"
                          style={{ backgroundColor: '#ef444420', border: '1px solid #ef4444' }}
                        >
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: '#ef4444' }} />
                          <span style={{ color: '#ef4444' }}>
                            El horario {horaInicio} - {horaFin} excede la jornada laboral (hasta {disponibilidad.hora_fin_jornada.slice(0, 5)})
                          </span>
                        </div>
                      )}

                      {/* Mostrar horarios ocupados si los hay */}
                      {disponibilidad.bloques_ocupados.length > 0 && (
                        <div
                          className="rounded-lg p-3 text-sm"
                          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
                        >
                          <p className="font-medium mb-2" style={{ color: theme.text }}>
                            <Clock className="h-4 w-4 inline mr-1" />
                            Horarios ocupados ese día:
                          </p>
                          {disponibilidad.bloques_ocupados.map((bloque, idx) => (
                            <div key={idx} className="text-xs pl-5 py-0.5" style={{ color: theme.textSecondary }}>
                              • {bloque.inicio.slice(0, 5)} - {bloque.fin.slice(0, 5)}: {bloque.titulo}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <ABMTextarea
                value={comentarioAsignacion}
                onChange={(e) => setComentarioAsignacion(e.target.value)}
                placeholder="Comentario (opcional)"
                rows={2}
              />
            </div>
          </ABMCollapsible>
        )}

        {selectedReclamo.estado === 'en_curso' && (
          <ABMCollapsible
            title="Finalizar Trabajo"
            icon={<CheckCircle className="h-4 w-4" />}
            defaultOpen={true}
            variant={tipoFinalizacion === 'finalizado' ? 'success' : 'warning'}
          >
            <div className="space-y-4">
              {/* Selector de tipo de finalización */}
              <div className="flex gap-2">
                <button
                  onClick={() => setTipoFinalizacion('finalizado')}
                  className="flex-1 p-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: tipoFinalizacion === 'finalizado' ? '#22c55e20' : theme.backgroundSecondary,
                    border: `2px solid ${tipoFinalizacion === 'finalizado' ? '#22c55e' : 'transparent'}`,
                    color: tipoFinalizacion === 'finalizado' ? '#22c55e' : theme.textSecondary,
                  }}
                >
                  <CheckCircle className="h-5 w-5 mx-auto mb-1" />
                  Finalizado
                </button>
                <button
                  onClick={() => setTipoFinalizacion('pospuesto')}
                  className="flex-1 p-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: tipoFinalizacion === 'pospuesto' ? '#f59e0b20' : theme.backgroundSecondary,
                    border: `2px solid ${tipoFinalizacion === 'pospuesto' ? '#f59e0b' : 'transparent'}`,
                    color: tipoFinalizacion === 'pospuesto' ? '#f59e0b' : theme.textSecondary,
                  }}
                >
                  <XCircle className="h-5 w-5 mx-auto mb-1" />
                  Posponer
                </button>
              </div>

              {/* Campos según tipo */}
              {tipoFinalizacion === 'finalizado' ? (
                <ABMTextarea
                  label=""
                  value={resolucion}
                  onChange={(e) => setResolucion(e.target.value)}
                  placeholder="Describe cómo se resolvió el problema"
                  rows={3}
                  required
                />
              ) : (
                <>
                  <select
                    value={motivoNoFinalizado}
                    onChange={(e) => setMotivoNoFinalizado(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-200"
                    style={{
                      backgroundColor: theme.card,
                      color: theme.text,
                      border: `1px solid ${theme.border}`
                    }}
                  >
                    <option value="">Seleccionar motivo...</option>
                    <option value="falta_materiales">Falta de materiales</option>
                    <option value="falta_herramientas">Falta de herramientas</option>
                    <option value="acceso_imposible">No se pudo acceder al lugar</option>
                    <option value="clima">Condiciones climáticas</option>
                    <option value="requiere_mas_personal">Requiere más personal</option>
                    <option value="requiere_otra_area">Requiere intervención de otra área</option>
                    <option value="vecino_ausente">Vecino ausente</option>
                    <option value="otro">Otro motivo</option>
                  </select>
                  <ABMTextarea
                    label=""
                    value={resolucion}
                    onChange={(e) => setResolucion(e.target.value)}
                    placeholder="Describe por qué se pospone el trabajo..."
                    rows={2}
                  />
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    El reclamo quedará en estado "Pospuesto" y podrá retomarse más adelante.
                  </p>
                </>
              )}
            </div>
          </ABMCollapsible>
        )}

        {motivoRechazo && ['nuevo', 'recibido', 'asignado', 'en_curso', 'en_proceso', 'pospuesto'].includes(selectedReclamo.estado) && (
          <ABMInfoPanel
            title="Rechazar Reclamo"
            icon={<XCircle className="h-4 w-4" />}
            variant="danger"
          >
            <div className="space-y-3">
              <select
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 focus:ring-2 focus:outline-none transition-all duration-200"
                style={{
                  backgroundColor: theme.card,
                  color: theme.text,
                  border: `1px solid ${theme.border}`
                }}
              >
                <option value="no_competencia">No es competencia municipal</option>
                <option value="duplicado">Reclamo duplicado</option>
                <option value="info_insuficiente">Información insuficiente</option>
                <option value="fuera_jurisdiccion">Fuera de jurisdicción</option>
                <option value="otro">Otro motivo</option>
              </select>
              <ABMTextarea
                label=""
                value={descripcionRechazo}
                onChange={(e) => setDescripcionRechazo(e.target.value)}
                placeholder="Descripción del rechazo (opcional)"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setMotivoRechazo('')}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: theme.card,
                    color: theme.text,
                    border: `1px solid ${theme.border}`
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRechazar}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
                >
                  {saving ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </div>
          </ABMInfoPanel>
        )}

      </div>
    );
  };

  // Header propio del Sheet — implementación del diseño "Reclamo Detalle"
  // (canvas Claude Design): eyebrow + navegación entre los reclamos de la
  // lista visible + acciones, título display y la fila de meta
  // (estado · categoría · prioridad · canal · antigüedad).
  const renderSheetHeader = () => {
    if (!selectedReclamo) return undefined;
    const idx = filteredReclamos.findIndex((r) => r.id === selectedReclamo.id);
    const total = filteredReclamos.length;
    const irA = (i: number) => {
      const destino = filteredReclamos[i];
      if (destino) openViewSheet(destino);
    };
    const estadoColor = estadoColors[selectedReclamo.estado]?.bg || theme.primary;
    const prio = selectedReclamo.prioridad_ot || 'media';
    const disconforme = selectedReclamo.confirmado_vecino === false;
    return (
      <div className="rs-head">
        <div className="rs-head-fila">
          <span className="rs-eyebrow">Reclamo #{selectedReclamo.id}</span>
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
            <button
              type="button"
              className="rs-ico-btn"
              title={disconforme
                ? 'El vecino marcó que el problema persiste — ver historial'
                : 'Ver historial completo'}
              onClick={() => { closeSheet(); navigate(`/gestion/reclamos/${selectedReclamo.id}`); }}
            >
              <Clock className="h-4 w-4" />
              {disconforme && <span className="rs-ico-alerta" />}
            </button>
            <button type="button" className="rs-ico-btn" title="Cerrar" aria-label="Cerrar" onClick={closeSheet}>
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>

        <h2 className="rs-titulo">
          {selectedReclamo.titulo || selectedReclamo.categoria?.nombre || 'Reclamo'}
        </h2>

        <div className="rs-meta">
          <span className="rs-estado" style={{ backgroundColor: `${estadoColor}1c`, color: estadoColor }}>
            <span className="rs-estado-dot" style={{ backgroundColor: estadoColor }} />
            {estadoLabels[selectedReclamo.estado] || selectedReclamo.estado}
          </span>
          <span className="rs-meta-sep">·</span>
          <button
            type="button"
            className="rs-meta-cat"
            title="Filtrar la lista por esta categoría"
            onClick={() => { setFiltroCategoria(selectedReclamo.categoria.id); closeSheet(); }}
          >
            {selectedReclamo.categoria.nombre}
          </button>
          <span className="rs-meta-sep">·</span>
          <span>Prioridad {prioridadLabel(prio).toLowerCase()}</span>
          {selectedReclamo.canal && (
            <>
              <span className="rs-meta-sep">·</span>
              <span>Entró por {(canalLabel(selectedReclamo.canal) || selectedReclamo.canal).toLowerCase()}</span>
            </>
          )}
          <span className="rs-meta-sep">·</span>
          <span>
            {(() => {
              const t = haceCuanto(selectedReclamo.created_at);
              return !t || t === 'recién' ? t : `hace ${t}`;
            })()}
          </span>
        </div>
      </div>
    );
  };

  // Renderizar footer de acciones para el Sheet
  const renderSheetFooter = () => {
    if (!selectedReclamo) return null;

    const canAsignar = selectedReclamo.estado === 'nuevo';
    const canProcesar = selectedReclamo.estado === 'recibido' || selectedReclamo.estado === 'asignado';
    const canFinalizar = selectedReclamo.estado === 'en_curso';
    // Puede recibir si ya tiene dependencia asignada y no quiere reasignar
    const canRecibir = canAsignar && selectedReclamo.dependencia_asignada && !dependenciaSeleccionada;

    // Estados finales no necesitan descripción
    const esEstadoFinal = selectedReclamo.estado === 'finalizado' || selectedReclamo.estado === 'rechazado' || selectedReclamo.estado === 'resuelto';

    return (
      <div className="space-y-2">
        {/* Campo de descripción obligatorio - siempre visible excepto estados finales */}
        {!esEstadoFinal && (
          <textarea
            value={descripcionInicio}
            onChange={(e) => setDescripcionInicio(e.target.value)}
            placeholder="Qué se va a hacer — queda en el historial y lo ve el vecino"
            rows={2}
            className={`rs-pie-nota${descripcionInicio.trim() ? '' : ' rs-pie-nota--pendiente'}`}
          />
        )}

        <div className="flex gap-2">
        {/* Botón Recibir - para estado nuevo con dependencia ya asignada */}
        {canRecibir && (
          <>
            <button
              onClick={handleRecibir}
              disabled={saving || !descripcionInicio.trim()}
              className="rs-cta flex-1 justify-center"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Recibiendo...' : 'Recibir'}
            </button>
            {user?.rol !== 'empleado' && (
              <button
                onClick={() => setMotivoRechazo('otro')}
                className="rs-btn rs-btn--peligro"
              >
                Rechazar
              </button>
            )}
          </>
        )}

        {/* Botón Asignar/Reasignar - para estado nuevo sin dependencia o queriendo reasignar */}
        {canAsignar && !canRecibir && (
          <>
            <button
              onClick={handleAsignar}
              disabled={saving || !dependenciaSeleccionada || !descripcionInicio.trim() || !!(disponibilidad && horaFin > disponibilidad.hora_fin_jornada.slice(0, 5))}
              className="rs-cta flex-1 justify-center"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Asignando...' : selectedReclamo.dependencia_asignada ? 'Reasignar' : 'Asignar'}
            </button>
            {user?.rol !== 'empleado' && (
              <button
                onClick={() => setMotivoRechazo('otro')}
                className="rs-btn rs-btn--peligro"
              >
                Rechazar
              </button>
            )}
          </>
        )}

        {/* Botón En Curso - para estado recibido o asignado */}
        {canProcesar && (
          <>
            <button
              onClick={handleIniciar}
              disabled={saving || !descripcionInicio.trim()}
              className="rs-cta flex-1 justify-center"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Procesando...' : 'Pasar a en curso'}
            </button>
            {user?.rol !== 'empleado' && (
              <button
                onClick={() => setMotivoRechazo('otro')}
                className="rs-btn rs-btn--peligro"
              >
                Rechazar
              </button>
            )}
          </>
        )}

        {/* Botón Finalizado/Posponer - para estado en_proceso */}
        {canFinalizar && tipoFinalizacion === 'finalizado' && (
          <>
            {/* Foto de cierre: evidencia del trabajo terminado (opcional) */}
            <label
              className="rs-btn cursor-pointer"
              title={fotoCierre ? `Foto de cierre: ${fotoCierre.name}` : 'Adjuntar foto del trabajo terminado (opcional)'}
            >
              <Camera className="h-4 w-4" />
              {fotoCierre ? 'Foto lista' : 'Foto'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setFotoCierre(e.target.files?.[0] || null)}
              />
            </label>
            <button
              onClick={handleFinalizar}
              disabled={saving || !resolucion}
              className="rs-cta flex-1 justify-center"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Finalizando...' : 'Finalizar'}
            </button>
            {user?.rol !== 'empleado' && (
              <button
                onClick={() => setMotivoRechazo('otro')}
                className="rs-btn rs-btn--peligro"
              >
                Rechazar
              </button>
            )}
          </>
        )}
        {canFinalizar && tipoFinalizacion === 'pospuesto' && (
          <>
            <button
              onClick={handlePosponer}
              disabled={saving || !motivoNoFinalizado}
              className="rs-cta flex-1 justify-center"
            >
              {saving ? 'Posponiendo...' : 'Posponer'}
            </button>
            {user?.rol !== 'empleado' && (
              <button
                onClick={() => setMotivoRechazo('otro')}
                className="rs-btn rs-btn--peligro"
              >
                Rechazar
              </button>
            )}
          </>
        )}

        {/* Estados finales — banda informativa, no disfrazada de botón. El
            color viene del estado (valor runtime), la piel es del kit. */}
        {(['resuelto', 'finalizado', 'rechazado'].includes(selectedReclamo.estado)) && (() => {
          const esRechazo = selectedReclamo.estado === 'rechazado';
          const c = esRechazo ? estadoColors.rechazado.bg : estadoColors.finalizado.bg;
          const IconoFinal = esRechazo ? XCircle : CheckCircle;
          return (
            <>
              <div className="av2-sheet-final" style={{ backgroundColor: `${c}14`, color: c }}>
                <IconoFinal className="h-4 w-4" />
                {esRechazo ? 'Rechazado' : 'Finalizado'}
              </div>
              {(user?.rol === 'admin' || user?.rol === 'supervisor') && (
                <button
                  type="button"
                  onClick={handleReasignar}
                  className="rs-btn"
                  title="Devuelve el reclamo a Recibido y libera al empleado para que otro lo pueda tomar"
                >
                  <Sparkles className="h-4 w-4" />
                  Reasignar
                </button>
              )}
            </>
          );
        })()}

        {/* Estado pospuesto - puede retomar */}
        {selectedReclamo.estado === 'pospuesto' && (
          <div className="flex gap-2">
            <button
              onClick={() => reclamosApi.cambiarEstado(selectedReclamo.id, 'en_curso', 'Retomando trabajo pospuesto').then(() => { fetchReclamos(true); closeSheet(); toast.success('Reclamo retomado'); })}
              className="rs-cta flex-1 justify-center"
            >
              Retomar
            </button>
            <div
              className="av2-sheet-final av2-sheet-final--chip"
              style={{ backgroundColor: `${estadoColors.pospuesto.bg}14`, color: estadoColors.pospuesto.bg }}
            >
              Pospuesto
            </div>
          </div>
        )}
        </div>

        {/* Feedback negativo del vecino — bloque visible con 2 acciones */}
        {(user?.rol === 'admin' || user?.rol === 'supervisor') &&
         selectedReclamo.confirmado_vecino === false && (
          <div className="av2-sheet-alerta">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--pl-red)' }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm" style={{ color: 'var(--pl-red-700)' }}>
                  El vecino indica que el problema persiste
                </p>
                {selectedReclamo.comentario_confirmacion_vecino && (
                  <p className="text-sm mt-1 italic" style={{ color: 'var(--pl-red-700)' }}>
                    «{selectedReclamo.comentario_confirmacion_vecino}»
                  </p>
                )}
                {selectedReclamo.fecha_confirmacion_vecino && (
                  <p className="text-xs mt-1 opacity-80" style={{ color: 'var(--pl-red-700)' }}>
                    {new Date(selectedReclamo.fecha_confirmacion_vecino).toLocaleString('es-AR', {
                      day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleReabrirPorFeedback}
                className="av2-btn-peligro av2-btn-peligro--solido justify-center"
                title="Devuelve el reclamo a En Curso para retrabajar"
              >
                <RotateCcw className="h-4 w-4" />
                Reabrir caso
              </button>
              <button
                onClick={handleDescartarFeedback}
                className="av2-btn-peligro justify-center"
                title="Marca el feedback como revisado y deja el caso finalizado"
              >
                <CheckCircle className="h-4 w-4" />
                Descartar comentario
              </button>
            </div>
          </div>
        )}

        {/* Botón Reasignar — en curso/pospuesto va acá (ancho completo);
            en estados finales va INLINE junto a la banda, arriba. */}
        {(user?.rol === 'admin' || user?.rol === 'supervisor') &&
         ['en_curso', 'pospuesto'].includes(selectedReclamo.estado) && (
          <button
            onClick={handleReasignar}
            className="rs-btn w-full justify-center"
            title="Devuelve el reclamo a Recibido y libera al empleado para que otro lo pueda tomar"
          >
            <Sparkles className="h-4 w-4" />
            Reasignar a otro empleado
          </button>
        )}
      </div>
    );
  };

  // ============================================================
  // INBOX (vista guiada) — secciones por urgencia/estado
  // `inboxData` mira la lista QUE SE VE (con el foco del hero aplicado);
  // `inboxBase` mira la base sin foco y es la que alimenta la frase del hero,
  // para que el hero siga contando el universo del módulo aunque el usuario
  // haya acotado la lista con una de sus propias acciones. Sin foco, ambas
  // son el mismo objeto (no se recalcula nada).
  // ============================================================
  const inboxData = useMemo(() => armarInbox(filteredReclamos), [filteredReclamos]);
  const inboxBase = useMemo(
    () => (foco ? armarInbox(reclamosBuscados) : inboxData),
    [foco, reclamosBuscados, inboxData],
  );


  // Hero semántico (rediseño v2): frases dinámicas armadas SOLO con datos ya
  // cargados en la pantalla (inboxData). Sin datos → sin frases → no renderiza.
  // Acciones del hero: OPERAN SOBRE ESTA PANTALLA (acotan la lista al grupo
  // que la frase acaba de nombrar), no mandan a otra pantalla. El conteo real
  // va en el label y un grupo vacío NO se ofrece — nunca "ver los 0 que…".
  // Con el foco puesto, la primera acción es sacarlo, así el filtro siempre
  // tiene su salida a la vista. No hay tercera acción de exportar: esta
  // pantalla no tiene exportación (un botón muerto sería peor que nada).
  const accionesHero = useMemo<HeroAccion[]>(() => {
    const { vencenHoy, vencidos, sinDep } = metricasHero;
    // Candidatas en orden de urgencia. Cada una lleva SU conteo real en el
    // label y se cae sola si el grupo está vacío.
    const candidatas: { foco: Exclude<FocoHero, null>; n: number; label: string }[] = [
      { foco: 'vencen-hoy', n: vencenHoy, label: `Ver los ${vencenHoy} que vencen hoy` },
      { foco: 'vencidos', n: vencidos, label: `Ver los ${vencidos} ya vencidos` },
      { foco: 'sin-dependencia', n: sinDep, label: `Ver los ${sinDep} sin dependencia` },
    ];
    const disponibles = candidatas
      .filter((c) => c.n > 0 && c.foco !== foco)
      .map<HeroAccion>((c) => ({ label: c.label, onClick: () => setFoco(c.foco) }));

    if (foco) {
      // Con el foco puesto, sacarlo es la acción primaria: el filtro siempre
      // tiene su salida a la vista, arriba de todo.
      return [
        { label: 'Quitar el foco y ver todos', onClick: () => setFoco(null), primaria: true },
        ...disponibles.slice(0, 2),
      ];
    }
    return disponibles.slice(0, 3).map((a, i) => (i === 0 ? { ...a, primaria: true } : a));
  }, [metricasHero, foco]);

  const heroFrases = useMemo<HeroFrase[]>(() => {
    // La guarda mira la BASE, no la lista con foco: si el foco deja 0
    // resultados el hero tiene que seguir en pantalla, porque ahí está la
    // única salida ("Quitar el foco y ver todos").
    if (loading || reclamosBuscados.length === 0) return [];
    const u = resolverUmbrales();
    const { urgentes, conFeedback, enCurso, nuevos, fosiles } = inboxBase;
    return [
      {
        segmentos: [
          seg('Hay '),
          seg(`${urgentes.length} por vencer`, veredictoMasEsPeor(urgentes.length, u.vencidos)),
          seg(' y '),
          seg(
            `${conFeedback.length} disputado${conFeedback.length === 1 ? '' : 's'}`,
            veredictoMasEsPeor(conFeedback.length, u.vencidos),
          ),
          seg(' por vecinos; '),
          seg(`${enCurso.length} en curso`, 'bueno'),
          seg('.'),
        ],
        acciones: accionesHero,
      },
      {
        segmentos: [
          seg('Tenés '),
          seg(
            `${nuevos.length} recién llegado${nuevos.length === 1 ? '' : 's'}`,
            veredictoMasEsPeor(nuevos.length, u.sinAsignar),
          ),
          seg(' sin tomar y '),
          seg(
            `${fosiles.length} fósil${fosiles.length === 1 ? '' : 'es'} de más de 30 días`,
            veredictoMasEsPeor(fosiles.length, u.vencidos),
          ),
          seg(' para depurar.'),
        ],
        acciones: accionesHero,
      },
    ];
  }, [loading, reclamosBuscados.length, inboxBase, accionesHero]);

  const renderInboxCard = (
    r: Reclamo,
    opts?: { urgente?: boolean; density?: 'large' | 'compact' | 'row'; sectionColor?: string; mostrarPrioridad?: boolean },
  ) => {
    const cat = r.categoria;
    const color = cat?.color || DEFAULT_CATEGORY_COLOR;
    const ahora = Date.now();
    const dia = 24 * 60 * 60 * 1000;
    const fechaVence = getFechaVenceReclamoMs(r);
    const venceMs = fechaVence ? fechaVence - ahora : null;
    let tiempoLabel: string | undefined;
    if (venceMs != null) {
      const d = Math.ceil(venceMs / dia);
      if (d < 0) tiempoLabel = `Venció hace ${Math.abs(d)}d`;
      else if (d === 0) tiempoLabel = 'Vence hoy';
      else if (d === 1) tiempoLabel = 'Vence mañana';
      else tiempoLabel = `Vence en ${d} días`;
    } else if (r.created_at) {
      const d = Math.floor((ahora - new Date(r.created_at).getTime()) / dia);
      tiempoLabel = d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`;
    }
    // Antigüedad de creación (independiente del vencimiento)
    let creadoLabel: string | undefined;
    if (r.created_at) {
      const d = Math.floor((ahora - new Date(r.created_at).getTime()) / dia);
      if (d <= 0) creadoLabel = 'Hoy';
      else if (d === 1) creadoLabel = 'Ayer';
      else creadoLabel = `Hace ${d}d`;
    }
    const badges: Array<{ label: string; color: string }> = [];
    const estado = (r.estado || '').toLowerCase();
    // D2 (F1): cierre disputado por el vecino — pill textual además del icono.
    if (r.confirmado_vecino === false) badges.push({ label: 'Disputado', color: '#ef4444' });
    if (estado === 'pospuesto') badges.push({ label: 'Pospuesto', color: '#8b5cf6' });
    const solicitanteNombre = r.es_anonimo
      ? 'Anónimo'
      : ([r.creador?.nombre, r.creador?.apellido].filter(Boolean).join(' ').trim() || undefined);
    // Badge de prioridad (icono outline + color semáforo) — solo en la sección
    // "Empecemos por lo urgente", que es la que pidió mostrar la prioridad.
    const prioridadBadge = opts?.mostrarPrioridad
      ? (() => {
          const p = r.prioridad_ot || 'media';
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
        numero={`#${r.id}`}
        titulo={cat?.nombre || r.titulo || 'Reclamo'}
        subtitulo={r.titulo || r.descripcion || undefined}
        solicitante={solicitanteNombre}
        tiempoLabel={tiempoLabel}
        creadoLabel={creadoLabel}
        color={color}
        sectionColor={opts?.sectionColor}
        icono={cat?.icono ? <DynamicIcon name={cat.icono} className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        badges={badges.length > 0 ? badges : undefined}
        prioridadBadge={prioridadBadge}
        ctaLabel={opts?.urgente ? 'Resolver ya' : 'Abrir'}
        onClick={() => openViewSheet(r)}
        urgente={opts?.urgente}
        density={opts?.density}
      />
    );
  };

  // Vista guiada (Inbox): se muestra cuando activeView === 'guided' en el
  // segmented del ListToolbar estándar. El JSX se arma siempre (es barato:
  // solo se monta cuando la rama guiada lo renderiza).
  const inboxView = (
    <InboxLayout
      saludoNombre={user?.nombre || ''}
      contextoLabel={user?.dependencia?.nombre || 'tu municipio'}
      totalPendiente={
        inboxData.conFeedback.length + inboxData.urgentes.length + inboxData.nuevos.length + inboxData.enCurso.length + inboxData.esperando.length
      }
      metricasChips={[
        ...(inboxData.conFeedback.length > 0 ? [
          { color: '#ef4444', icon: <ThumbsDown className="w-3.5 h-3.5" />, label: 'sigue el problema', value: inboxData.conFeedback.length },
        ] : []),
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
          // Reclamos cerrados que el vecino disputo. Maxima prioridad:
          // arriba de todo. Estan tecnicamente en estado finalizado pero
          // requieren que la dependencia los retome.
          id: 'feedback-negativo',
          titulo: 'El vecino dice que sigue el problema',
          subtitulo: 'Reclamos cerrados con feedback negativo — revisar y reabrir',
          icono: <ThumbsDown className="w-5 h-5" />,
          color: '#ef4444',
          emptyMessage: 'Sin disputas del vecino — buen trabajo.',
          count: inboxData.conFeedback.length,
          items: (density) => inboxData.conFeedback.map((r) => renderInboxCard(r, { urgente: true, density, sectionColor: '#ef4444' })),
        },
        {
          id: 'urgente',
          titulo: 'Empecemos por lo urgente',
          subtitulo: 'Marcados con prioridad alta o vencen en los próximos 3 días',
          icono: <AlertCircle className="w-5 h-5" />,
          color: '#ef4444',
          emptyMessage: '✨ Sin urgentes. Bandeja al día.',
          count: inboxData.urgentes.length,
          // Siempre cards grandes, sin importar la cantidad (30 urgentes = 30
          // cards grandes) — ya vienen ordenados por prioridad_ot en inboxData.
          forceDensity: 'large',
          items: (density) => inboxData.urgentes.map((r) => renderInboxCard(r, { urgente: true, density, sectionColor: '#ef4444', mostrarPrioridad: true })),
        },
        {
          id: 'nuevos',
          titulo: 'Nuevos para tomar',
          subtitulo: 'Reclamos que llegaron y nadie empezó todavía',
          icono: <Inbox className="w-5 h-5" />,
          color: '#3b82f6',
          emptyMessage: '🎉 No hay reclamos nuevos sin tomar.',
          count: inboxData.nuevos.length,
          items: (density) => inboxData.nuevos.map((r) => renderInboxCard(r, { density, sectionColor: '#3b82f6' })),
        },
        {
          id: 'en-curso',
          titulo: 'Estás trabajando en estos',
          subtitulo: 'Reclamos que ya tomaste — seguir avanzando',
          icono: <PlayCircle className="w-5 h-5" />,
          color: '#f59e0b',
          emptyMessage: 'Nada en curso ahora mismo.',
          count: inboxData.enCurso.length,
          items: (density) => inboxData.enCurso.map((r) => renderInboxCard(r, { density, sectionColor: '#f59e0b' })),
          colapsable: inboxData.enCurso.length > 6,
        },
        {
          id: 'esperando',
          titulo: 'Pospuestos',
          subtitulo: 'Reclamos diferidos — esperando algo para retomarlos',
          icono: <PauseCircle className="w-5 h-5" />,
          color: '#8b5cf6',
          emptyMessage: 'Sin reclamos pospuestos.',
          count: inboxData.esperando.length,
          items: (density) => inboxData.esperando.map((r) => renderInboxCard(r, { density, sectionColor: '#8b5cf6' })),
          colapsable: true,
        },
        {
          id: 'fosiles',
          titulo: 'Para limpiar — vencidos hace mucho',
          subtitulo: 'Reclamos que vencieron hace más de 30 días. Considerá rechazarlos o archivarlos.',
          icono: <Calendar className="w-5 h-5" />,
          color: '#71717a',
          emptyMessage: 'No hay reclamos viejos sin atender.',
          count: inboxData.fosiles.length,
          items: (density) => inboxData.fosiles.map((r) => renderInboxCard(r, { density, sectionColor: '#71717a' })),
          colapsable: true,
        },
      ]}
    />
  );

  // Total global según los conteos del backend (misma aritmética que tenían
  // los KPIs viejos). Alimenta el chip del ListToolbar, el tab "Todos" y el
  // pie de la tabla.
  const totalConteos = useMemo(
    () => Object.values(conteosEstados).reduce((a, b) => a + (b || 0), 0),
    [conteosEstados],
  );

  // Stat strip DEL HERO (estándar SemanticAbmPage: los números viven en el
  // hero, nada de tarjetas de KPI sueltas arriba). Mismos números que los
  // KpiCards viejos; solo la celda que exige acción se colorea (disputados).
  const heroKpis = useMemo<HeroKpi[]>(() => {
    const c = conteosEstados;
    const recibidos = (c['recibido'] || 0) + (c['nuevo'] || 0) + (c['asignado'] || 0);
    const enCurso = (c['en_curso'] || 0) + (c['en_proceso'] || 0) + (c['pendiente_confirmacion'] || 0);
    const finalizados = (c['finalizado'] || 0) + (c['resuelto'] || 0);
    const pct = (n: number) => (totalConteos > 0 ? Math.round((n / totalConteos) * 100) : 0);
    // D2 (F1): cierres disputados por el vecino ("sigue el problema"). Viene del
    // conteo del backend (pseudo-estado 'disputados') para contar el TOTAL real,
    // no solo la pagina cargada en el cliente.
    const disputados = c['disputados'] || 0;
    // Detalle de los subtextos: sólo cuando el cliente ya cargó TODO el
    // universo, porque `metricasHero` mira lo cargado y el % viene de los
    // conteos globales del backend — mezclarlos con media página mentiría.
    const { vencenHoy, vencidos, recibidosSinDep, enCursoConDep, universoCompleto } = metricasHero;
    const conDetalle = (porcentaje: number, detalle: string) =>
      universoCompleto ? `${porcentaje}% · ${detalle}` : `${porcentaje}% del total`;
    return [
      {
        etiqueta: 'TOTAL',
        valor: totalConteos.toLocaleString('es-AR'),
        sub: `${reclamos.length} en pantalla`,
      },
      ...(disputados > 0
        ? [{
            etiqueta: 'DISPUTADOS',
            valor: disputados.toLocaleString('es-AR'),
            sub: 'el vecino dice que sigue',
            veredicto: 'malo' as const,
          }]
        : []),
      {
        etiqueta: 'RECIBIDOS',
        valor: recibidos.toLocaleString('es-AR'),
        sub: conDetalle(
          pct(recibidos),
          recibidosSinDep > 0 ? `${recibidosSinDep} sin dependencia` : 'todos con dependencia',
        ),
      },
      {
        etiqueta: 'EN CURSO',
        valor: enCurso.toLocaleString('es-AR'),
        sub: conDetalle(pct(enCurso), `${enCursoConDep} con dependencia`),
      },
      {
        etiqueta: 'FINALIZADOS',
        valor: finalizados.toLocaleString('es-AR'),
        // Sin promedio de estrellas: la calificación del vecino se pide por
        // reclamo al abrir el detalle (calificacionesApi.getReclamo), el
        // listado no la trae — no hay con qué calcular el promedio acá.
        sub: `${pct(finalizados)}% del total`,
      },
      {
        etiqueta: 'VENCEN HOY',
        valor: vencenHoy.toLocaleString('es-AR'),
        sub: vencidos > 0
          ? `y ${vencidos} ya vencido${vencidos === 1 ? '' : 's'}`
          : 'sin vencidos arrastrados',
        // El número en ámbar sólo cuando efectivamente hay algo venciendo hoy.
        ...(vencenHoy > 0 ? { veredicto: 'advertencia' as const } : {}),
      },
    ];
  }, [conteosEstados, totalConteos, reclamos.length, metricasHero]);

  // Grupos por fecha para el DataTable del estándar (la página agrupa y
  // formatea; el DataTable solo pinta). El criterio replica la tabla vieja:
  // 'reciente' → orden y agrupado por fecha de creación (desc);
  // 'programado' → por fecha programada (asc), los sin fecha al final.
  const gruposTabla = useMemo<TableGroup<Reclamo>[]>(() => {
    const filas = [...filteredReclamos].sort((a, b) => {
      if (ordenamiento === 'programado') {
        const va = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Infinity;
        const vb = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Infinity;
        return va - vb;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const grupos: TableGroup<Reclamo>[] = [];
    let actual: TableGroup<Reclamo> | null = null;
    for (const r of filas) {
      const iso = ordenamiento === 'programado' ? r.fecha_programada : r.created_at;
      const d = iso ? new Date(iso) : null;
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
      actual.rows.push(r);
    }
    for (const g of grupos) {
      const n = g.rows.length;
      const base = `${n} reclamo${n === 1 ? '' : 's'}`;
      g.label = g.key === 'sin-fecha' ? `Sin fecha programada · ${base}` : base;
    }
    return grupos;
  }, [filteredReclamos, ordenamiento]);

  // --- Specs del shell estándar (piloto SemanticAbmPage) ---
  const puedeCrear = !soloMisTrabajos && !soloMiArea;
  // Cabecera de módulo (estándar v2.2): eyebrow = el módulo, H1 = lo que el
  // usuario viene a resolver, bajada = de dónde salen las filas y cómo se
  // agrupan. Un copy por modo de la pantalla (general / dependencia / mis
  // trabajos): los tres listan lo mismo pero NO son el mismo trabajo.
  const cabecera = soloMiArea
    ? {
        eyebrow: 'Reclamos del área',
        title: 'Lo que le derivaron a tu dependencia y qué falta resolver',
        description:
          'Sólo los reclamos derivados a tu dependencia, con su categoría, su responsable y su estado. La tabla los agrupa por día de ingreso.',
      }
    : soloMisTrabajos
      ? {
          eyebrow: 'Mis trabajos',
          title: 'Los reclamos que tenés asignados y cómo vienen de plazo',
          description:
            'Sólo los reclamos asignados a vos. Abrí cualquiera para ver el detalle, cargar el avance y cerrarlo.',
        }
      : {
          eyebrow: 'Reclamos',
          title: 'Todo lo que el vecino pidió y qué falta resolver',
          description:
            'Reclamos que entran por la app, WhatsApp, la web y la ventanilla, con su categoría, su dependencia y su estado. La tabla los agrupa por día de ingreso.',
        };
  const mensajeVacio = debouncedSearch
    ? `No se encontraron reclamos para "${debouncedSearch}"`
    : 'No se encontraron reclamos';

  // Opciones de los selects de la FilterBar. Los `color` extra viajan al
  // ModernSelect interno (los soporta en runtime, mismos datos que antes).
  const opcionesCategoria = [
    { value: '', label: 'Todas' },
    ...categorias
      .filter(c => (conteosCategorias[c.id] || 0) > 0 || filtroCategoria === c.id)
      .map(cat => ({
        value: String(cat.id),
        label: `${cat.nombre} (${conteosCategorias[cat.id] || 0})`,
        color: cat.color || DEFAULT_CATEGORY_COLOR,
      })),
  ];
  const opcionesDependencia = [
    { value: '', label: 'Todas' },
    ...dependenciasDisponibles
      .filter(dep => (conteosDependencias[dep.id] || 0) > 0 || filtroDependencia === dep.id)
      .map(dep => ({
        value: String(dep.id),
        label: `${dep.nombre} (${conteosDependencias[dep.id] || 0})`,
        color: dep.color || DEFAULT_CATEGORY_COLOR,
      })),
  ];
  const opcionesCanal = [
    { value: '', label: 'Todos' },
    ...CANAL_OPTIONS.map(c => ({ value: c.value, label: c.label, color: canalColors[c.value] })),
  ];
  const mostrarSelectDependencia = (user?.rol === 'admin' || user?.rol === 'supervisor') && !soloMiArea;

  // Segmented de estados con conteos reales (mismas agrupaciones que las
  // status pills viejas + tab "Todos"). count 0 ⇒ la FilterBar lo apaga.
  const tabsEstado: StatusTab[] = [
    { id: '', label: 'Todos', count: totalConteos },
    { id: 'recibido', label: 'Recibidos', count: (conteosEstados['recibido'] || 0) + (conteosEstados['nuevo'] || 0) + (conteosEstados['asignado'] || 0) },
    { id: 'en_curso', label: 'En curso', count: (conteosEstados['en_curso'] || 0) + (conteosEstados['en_proceso'] || 0) + (conteosEstados['pendiente_confirmacion'] || 0) },
    { id: 'finalizado', label: 'Finalizados', count: (conteosEstados['finalizado'] || 0) + (conteosEstados['resuelto'] || 0) },
    { id: 'pospuesto', label: 'Pospuestos', count: conteosEstados['pospuesto'] || 0 },
    { id: 'rechazado', label: 'Rechazados', count: conteosEstados['rechazado'] || 0 },
  ];

  const accionesFila: RowAction<Reclamo>[] = [
    { id: 'ver', label: 'Ver', icon: Eye, onClick: (r) => openViewSheet(r) },
  ];

  // Panel IA (se preserva del layout anterior: columna sticky a la derecha).
  const panelIA = iaOn && !soloMisTrabajos ? (
    <DashboardIAPanel
      data={dashboardIA}
      loading={dashboardIALoading}
      title="Reclamos · IA"
      onCollapsedChange={setIaCollapsed}
      onTipClick={(tip) => {
        const firstId = tip.items?.[0];
        if (firstId) {
          const target = reclamos.find(r => r.id === firstId);
          if (target) openViewSheet(target);
        }
      }}
    />
  ) : null;

  return (
    <PullToRefresh onRefresh={async () => { await fetchReclamos(true); }}>
      <div className="av2-page" data-module="reclamos">
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
          <SemanticHero etiqueta="RECLAMOS · AHORA" frases={heroFrases} kpis={heroKpis} className="av2-hero" />
        </div>

        {/* 3+4. Toolbar y filtros: UNA sola tarjeta partida por una línea. */}
        <div className="av2-controles">
          {/* Toolbar: buscador + vistas + orden + único CTA primario (sin H1) */}
          <ListToolbar
            searchPlaceholder="Buscar por código, dirección o vecino…"
            search={search}
            onSearchChange={setSearch}
            views={['table', 'cards', 'guided']}
            activeView={activeView}
            onViewChange={cambiarVista}
            secondaryAction={{
              label: ordenamiento === 'reciente' ? 'Más recientes' : 'Por vencer',
              icon: ordenamiento === 'reciente' ? ArrowUpDown : Calendar,
              onClick: () => setOrdenamiento(ordenamiento === 'reciente' ? 'programado' : 'reciente'),
            }}
            primaryAction={puedeCrear
              ? { label: 'Nuevo reclamo', onClick: openWizard }
              : {
                  label: 'Nuevo reclamo',
                  disabled: true,
                  disabledReason: 'La carga de reclamos se hace desde la pantalla general de Reclamos',
                }}
          />

          {/* Filtros: selects + segmented de estados con conteos reales.
              Sin PeriodControl: este listado no filtra por período (trae todo
              paginado del server); agregarlo cambiaría la lógica de datos. */}
          <FilterBar
            selects={[
              {
                id: 'categoria',
                label: 'Categoría',
                value: filtroCategoria === null ? '' : String(filtroCategoria),
                options: opcionesCategoria,
                onChange: (v) => setFiltroCategoria(v ? parseInt(v, 10) : null),
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
              {
                id: 'canal',
                label: 'Canal',
                value: filtroCanal === null ? '' : filtroCanal,
                options: opcionesCanal,
                onChange: (v) => setFiltroCanal(v || null),
              },
            ]}
            /* En vista tabla las tabs viven ARRIBA de la tarjeta de la tabla
               (diseño canvas); en tarjetas/guiada siguen acá como segmented. */
            statusTabs={activeView === 'table' ? [] : tabsEstado}
            activeStatus={filtroEstado}
            onStatusChange={(id) => setFiltroEstado(id)}
            /* Un foco puesto desde el hero NUNCA queda invisible: se anuncia
               acá, y se saca desde la acción del propio hero (arriba de todo). */
            filterSummary={
              foco
                ? `Foco: ${FOCOS[foco].resumen} · ${filteredReclamos.length} de ${reclamosBuscados.length}`
                : undefined
            }
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
            ) : activeView === 'cards' && !esAngosto ? (
              /* La grilla de tarjetas es una preferencia de ESCRITORIO: en
                 angosto deja menos de dos ítems por pantalla. Ahí cae al
                 control, que se proyecta solo a fichas (ver abajo).
                 La lista a mano que había acá se fue: el renderer mobile ya no
                 es un parche de esta página, es el otro dibujo del control
                 —mismos datos, mismos filtros, mismas acciones— declarado con
                 ROLES_RECLAMO. Ver docs/design-sync/abm-mobile/GUIA.md. */
              filteredReclamos.length === 0 ? (
                <section className="av2-tabla">
                  <div className="av2-tabla-vacia">{mensajeVacio}</div>
                </section>
              ) : (
                (
                  <div className={`grid grid-cols-1 md:grid-cols-2 ${panelIA ? '' : 'lg:grid-cols-3'} gap-3 sm:gap-5 mt-3`}>
                    {filteredReclamos.map((r, index) => (
                      <ReclamoCard
                        key={r.id}
                        reclamo={r}
                        onClick={() => openViewSheet(r)}
                        showCreador={true}
                        similaresCount={similaresCounts[r.id] || 0}
                        isVisible={animationDone || visibleCards.has(r.id)}
                        animationDelay={index * 50}
                      />
                    ))}
                  </div>
                )
              )
            ) : (
              <DataTable<Reclamo>
                kind="plain"
                columns={columnasTabla}
                roles={ROLES_RECLAMO}
                groupBy="date"
                groups={gruposTabla}
                rows={[]}
                rowKey={(r) => r.id}
                rowActions={accionesFila}
                onRowClick={(r) => openViewSheet(r)}
                statusTabs={tabsEstado}
                activeStatus={filtroEstado}
                onStatusChange={(id) => setFiltroEstado(id)}
                footer={{
                  showing: `Mostrando ${filteredReclamos.length.toLocaleString('es-AR')} de ${totalConteos.toLocaleString('es-AR')}`,
                  action: hasMore
                    ? {
                        label: loadingMore ? 'Cargando…' : 'Cargar más',
                        onClick: () => setPage((p) => p + 1),
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
          Solo en vistas tabla/tarjetas — en la guiada la lista no se pagina igual. */}
      {activeView !== 'guided' && (
        <div ref={observerTarget} className="py-4">
          {loadingMore && (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
              <span className="text-sm" style={{ color: theme.textSecondary }}>
                Cargando más reclamos...
              </span>
            </div>
          )}
          {!hasMore && reclamos.length > 0 && !loadingMore && (
            <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
              No hay más reclamos para mostrar
            </p>
          )}
        </div>
      )}

      {/* Sheet separado para ver detalle */}
      <Sheet
        open={sheetMode === 'view'}
        onClose={closeSheet}
        title={`Reclamo #${selectedReclamo?.id || ''}`}
        description={selectedReclamo?.titulo}
        customHeader={renderSheetHeader()}
        stickyFooter={renderSheetFooter()}
      >
        {renderViewContent()}
      </Sheet>

      {/* Wizard de creación de reclamo — usa el mismo componente que el wizard
          de trámite (look & feel unificado). El código viejo del wizard interno
          (~1500 líneas: wizardSteps, handleCreate, wizardAIPanel, states
          asociados) quedó sin usar y se puede limpiar en otro pase. */}
      <CrearReclamoWizard
        open={wizardOpen}
        onClose={closeWizard}
        onSuccess={() => {
          closeWizard();
          fetchReclamos();
        }}
      />

      {/* Confirm modal reutilizable (reemplaza window.confirm/prompt) */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={closeConfirmModal}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          variant={confirmModal.variant}
          promptLabel={confirmModal.promptLabel}
          promptPlaceholder={confirmModal.promptPlaceholder}
          loading={confirmModal.loading}
        />
      )}

    </PullToRefresh>
  );
}
