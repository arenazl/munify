/**
 * AgendaTurnos — pantalla "Agenda" del universo Trámites, alineada al lenguaje
 * v2 del kit (design/handoff-v2/references/agenda-turnos.dc.html).
 *
 * Composición del estándar `SemanticAbmPage`, armada con las piezas sueltas
 * (igual que Reclamos.tsx) porque la vista SEMANA es un componente propio
 * (CalendarView) que el orquestador no conoce:
 *
 *   PageHeader ─ SemanticHero (frase + stat strip + acciones)
 *              ─ av2-controles: ListToolbar + fila de día + FilterBar
 *              ─ cuerpo: DataTable (día) | CalendarView (semana)
 *
 * DECISIONES / DEUDAS DEL KIT (anotadas para el dueño del kit, NO parcheadas
 * acá porque components/abmv2/* y styles/*.css son compartidos):
 *
 *  1. `FilterBar` no tiene control de DÍA (su `PeriodControl` es mes/año) ni
 *     un slot `extras?: ReactNode`. La agenda navega por día, así que el
 *     ModernSelect de oficina + el DatePicker + "Hoy" viven en una fila propia
 *     con la MISMA clase del kit (`av2-filterbar`), justo arriba de la
 *     `FilterBar` real (que se queda con las píldoras de estado y el resumen).
 *     Cuando el kit exponga un slot o un control de día, esta fila se borra y
 *     todo vuelve a `<FilterBar>`.
 *  2. `RowAction` se aplica a TODAS las filas por igual y acá las acciones son
 *     condicionales (marcar presente/ausente sólo tiene sentido en un turno
 *     reservado). Por eso la columna de acciones es una columna común con
 *     `cell` propio y clases del kit (`av2-tabla-accion`), y `rowActions` va
 *     vacío. Si el kit soporta `RowAction.visible?: (row) => boolean`, esto se
 *     reemplaza por `rowActions`.
 *  3. `CalendarView.getColor` concatena alfa al color (`${color}25`), así que
 *     necesita HEX: por eso ESTADO_COLOR sigue en hex (no son colores nuevos,
 *     son los que ya tenía la pantalla). Con un `getAlpha`/color-mix del lado
 *     del componente, pasarían a tokens --pl-*.
 *  4. Falta en el kit una clase de "chip secundario de 32px" para la fila de
 *     filtros: el botón "Hoy" usa `av2-period-hasta` (32px, borde punteado),
 *     que es lo más cercano que existe.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, X, FileText, Clock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { turnosApi, dependenciasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/abmv2/PageHeader';
import { ListToolbar } from '../components/abmv2/ListToolbar';
import { FilterBar } from '../components/abmv2/FilterBar';
import { DataTable, EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import type { ChipTone, ColumnSpec, StatusTab, TableGroup, ViewKind } from '../components/abmv2/types';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroAccion, type HeroFrase, type HeroKpi, type Veredicto } from '../lib/semanticHero';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { CalendarView } from '../components/ui/CalendarView';
import { parseFechaLocal } from '../lib/tesoreria-helpers';

interface DepItem {
  id: number;
  nombre?: string;
}

interface TurnoAgenda {
  id: number;
  fecha_hora: string;
  estado: string;
  duracion_min: number;
  dependencia_nombre: string | null;
  nombre_solicitante: string | null;
  dni_solicitante: string | null;
  tramite_nombre: string | null;
  codigo: string | null;
  usuario_id: number | null;
  tramite_id: number | null;
  solicitud_id: number | null;
  notas: string | null;
}

interface StatsTurnero {
  total: number;
  por_estado: Record<string, number>;
  ausentismo_pct: number;
}

/* ============================================================
 * Estados del turnero — fuente única de esta pantalla.
 * (Los turnos no tienen todavía un módulo en lib/enums/; si otra pantalla
 *  necesita estos labels/tonos, el paso siguiente es `lib/enums/turno.ts`.)
 * ============================================================ */

/** HEX a propósito: los consume CalendarView, que concatena alfa (ver nota 3). */
const ESTADO_COLOR: Record<string, string> = {
  reservado: '#3b82f6',
  cumplido: '#10b981',
  cancelado: '#ef4444',
  ausente: '#f59e0b',
};

const ESTADO_LABEL: Record<string, string> = {
  reservado: 'Por atender',
  cumplido: 'Cumplido',
  ausente: 'Ausente',
  cancelado: 'Cancelado',
};

/** Tono del chip del kit. Resiliente: estado desconocido → gris. */
const ESTADO_TONO: Record<string, ChipTone> = {
  reservado: 'blue',
  cumplido: 'green',
  ausente: 'red',
  cancelado: 'gray',
};

const etiquetaEstado = (estado: string): string => ESTADO_LABEL[estado] || estado;
const tonoEstado = (estado: string): ChipTone => ESTADO_TONO[estado] || 'gray';

/** Umbrales de ausentismo del turnero (el 25% ya era el corte de la pantalla). */
const AUSENTISMO_ALERTA = 25;
const AUSENTISMO_AVISO = 15;

const veredictoAusentismo = (pct: number): Veredicto =>
  pct >= AUSENTISMO_ALERTA ? 'malo' : pct >= AUSENTISMO_AVISO ? 'advertencia' : 'bueno';

/** Vista persistida. Tolera los valores viejos de la ABMPage (cards/table/guided). */
const VIEW_KEY = 'agenda_turnos_view';

function vistaGuardada(): ViewKind {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'week' || v === 'guided' ? 'week' : 'day';
  } catch {
    return 'day';
  }
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function hoyISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** Iniciales del avatar de la fila ("Liz Benítez" → "LB"). */
function iniciales(nombre: string | null): string | undefined {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return undefined;
  return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
}

/** Hora de la franja de un turno ("08:15" → 8). */
const franjaDe = (iso: string): number => new Date(iso).getHours();

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

export default function AgendaTurnos() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [depId, setDepId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [turnos, setTurnos] = useState<TurnoAgenda[]>([]);
  const [stats, setStats] = useState<StatsTurnero | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [vista, setVista] = useState<ViewKind>(vistaGuardada);
  const [turnosRango, setTurnosRango] = useState<TurnoAgenda[]>([]);
  const [loadingRango, setLoadingRango] = useState(false);

  // Reportes del turnero (últimos 30 días de la dependencia elegida)
  useEffect(() => {
    if (!depId) return;
    turnosApi.stats({ dependencia_id: Number(depId), dias: 30 })
      .then(res => setStats(res.data as StatsTurnero))
      .catch(() => setStats(null));
  }, [depId]);

  // Check-in → abrir expediente: el operador atiende el turno y levanta el
  // trámite pre-cargado actuando por el vecino (mismo contexto del Mostrador)
  const abrirExpediente = (t: TurnoAgenda) => {
    if (!t.usuario_id || !t.tramite_id) return;
    const [nombre, ...resto] = (t.nombre_solicitante || '').split(' ');
    sessionStorage.setItem('mostrador_ctx', JSON.stringify({
      user_id: t.usuario_id,
      dni: t.dni_solicitante,
      nombre: nombre || null,
      apellido: resto.join(' ') || null,
      email: null,
      telefono: null,
      kyc_session_id: null,
      operador_id: user?.id ?? 0,
      operador_nombre: `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim(),
    }));
    navigate(`/gestion/crear-tramite?tramite_id=${t.tramite_id}&actuando_como=${t.usuario_id}`);
  };

  /** Turno atendible sin expediente: se puede abrir pre-cargado desde el turno. */
  const puedeAbrirExpediente = (t: TurnoAgenda): boolean =>
    (t.estado === 'reservado' || t.estado === 'cumplido')
    && !t.solicitud_id && !!t.tramite_id && !!t.usuario_id;

  useEffect(() => {
    dependenciasApi
      .getMunicipio({ activo: true })
      .then((res) => {
        const list = (res.data as DepItem[]) || [];
        setDeps(list);
        const desdeUrl = searchParams.get('dependencia_id');
        if (desdeUrl && list.some((d) => String(d.id) === desdeUrl)) {
          setDepId(desdeUrl);
        } else if (list.length && !depId) {
          setDepId(String(list[0].id));
        }
      })
      .catch(() => toast.error('No se pudieron cargar las dependencias'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (depId) fetchTurnos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depId, fecha]);

  const fetchTurnos = async () => {
    try {
      setLoading(true);
      const res = await turnosApi.agenda({ dependencia_id: Number(depId), fecha });
      setTurnos((res.data as TurnoAgenda[]) || []);
    } catch {
      toast.error('No se pudo cargar la agenda');
    } finally {
      setLoading(false);
    }
  };

  // Vista semana (calendario): se carga sólo cuando el operador la abre (evita
  // bajar ~3 meses de turnos si nunca sale de la agenda del día).
  useEffect(() => {
    if (!depId || vista !== 'week') return;
    fetchTurnosRango();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depId, vista]);

  const fetchTurnosRango = async () => {
    try {
      setLoadingRango(true);
      const hoy = new Date();
      const desdeD = new Date(hoy); desdeD.setDate(desdeD.getDate() - 45);
      const hastaD = new Date(hoy); hastaD.setDate(hastaD.getDate() + 45);
      const fmt = (d: Date) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
      const res = await turnosApi.agenda({ dependencia_id: Number(depId), desde: fmt(desdeD), hasta: fmt(hastaD) });
      setTurnosRango((res.data as TurnoAgenda[]) || []);
    } catch {
      toast.error('No se pudo cargar el calendario de turnos');
    } finally {
      setLoadingRango(false);
    }
  };

  const marcar = async (id: number, estado: string) => {
    try {
      await turnosApi.marcarEstado(id, estado);
      toast.success(estado === 'cumplido' ? 'Marcado presente' : 'Marcado ausente');
      await fetchTurnos();
    } catch {
      toast.error('No se pudo actualizar el turno');
    }
  };

  const cambiarVista = (v: ViewKind) => {
    setVista(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage bloqueado: la vista no se recuerda */ }
  };

  const depOptions: SelectOption[] = useMemo(
    () => deps.map((d) => ({ value: String(d.id), label: d.nombre || `Dependencia ${d.id}` })),
    [deps],
  );

  /* --- Datos derivados del día --- */

  const ordenados = useMemo(
    () => [...turnos].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)),
    [turnos],
  );

  const buscados = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return ordenados;
    // Check-in: busca por nombre, DNI o código TRN ("TRN-00012" o "12")
    const soloDigitos = s.replace(/\D/g, '');
    return ordenados.filter((t) =>
      (t.nombre_solicitante || '').toLowerCase().includes(s)
      || (soloDigitos && (t.dni_solicitante || '').replace(/\D/g, '').includes(soloDigitos))
      || (soloDigitos && String(t.id) === String(Number(soloDigitos)))
      || (t.codigo || '').toLowerCase().includes(s)
    );
  }, [ordenados, search]);

  const filtrados = useMemo(
    () => (filtroEstado ? buscados.filter((t) => t.estado === filtroEstado) : buscados),
    [buscados, filtroEstado],
  );

  /** Conteos del día — sobre TODOS los turnos, no sobre lo filtrado. */
  const conteos = useMemo(() => {
    const por: Record<string, number> = {};
    for (const t of ordenados) por[t.estado] = (por[t.estado] || 0) + 1;
    return {
      total: ordenados.length,
      reservados: por['reservado'] || 0,
      cumplidos: por['cumplido'] || 0,
      ausentes: por['ausente'] || 0,
      cancelados: por['cancelado'] || 0,
    };
  }, [ordenados]);

  const proximo = useMemo(
    () => ordenados.find((t) => t.estado === 'reservado') || null,
    [ordenados],
  );

  /** Franja con más turnos del día ("el pico"). Null si no hay turnos. */
  const franjaPico = useMemo(() => {
    if (!ordenados.length) return null;
    const porFranja: Record<number, number> = {};
    for (const t of ordenados) {
      const h = franjaDe(t.fecha_hora);
      porFranja[h] = (porFranja[h] || 0) + 1;
    }
    let mejor = -1;
    let cant = 0;
    for (const [h, n] of Object.entries(porFranja)) {
      if (n > cant) { cant = n; mejor = Number(h); }
    }
    return mejor >= 0 && cant > 1 ? { hora: mejor, cantidad: cant } : null;
  }, [ordenados]);

  const esHoy = fecha === hoyISO();
  const fechaLarga = useMemo(() => {
    const d = parseFechaLocal(fecha);
    if (isNaN(d.getTime())) return fecha;
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  }, [fecha]);

  /* --- Grupos por franja horaria para el DataTable (kind='schedule') --- */
  const grupos = useMemo<TableGroup<TurnoAgenda>[]>(() => {
    const out: TableGroup<TurnoAgenda>[] = [];
    let actual: TableGroup<TurnoAgenda> | null = null;
    for (const t of filtrados) {
      const h = franjaDe(t.fecha_hora);
      const key = `h-${h}`;
      if (!actual || actual.key !== key) {
        actual = {
          key,
          badge: { top: dosDigitos(h), bottom: 'HS' },
          label: '',
          rows: [],
        };
        out.push(actual);
      }
      actual.rows.push(t);
    }
    for (const g of out) {
      const n = g.rows.length;
      const h = Number(g.key.slice(2));
      const base = `${dosDigitos(h)}:00 – ${dosDigitos((h + 1) % 24)}:00 · ${n} turno${n === 1 ? '' : 's'}`;
      g.label = franjaPico && franjaPico.hora === h ? `${base} · pico del día` : base;
    }
    return out;
  }, [filtrados, franjaPico]);

  /* --- Columnas de la tabla (espejo del .dc: HORA · VECINO · TRÁMITE ·
         ESTADO · ACCIONES). Sin columna BOX: la app no tiene ese dato. --- */
  // Sin useMemo A PROPÓSITO: las celdas de acción cierran sobre `marcar` /
  // `abrirExpediente`, que a su vez leen `depId`/`fecha` del render actual.
  // Memoizarlas congelaría esos valores (el refresh post-marcado recargaría
  // la agenda de la oficina/fecha iniciales).
  const columnas: ColumnSpec<TurnoAgenda>[] = [
    {
      id: 'hora',
      header: 'HORA',
      width: 'minmax(74px, 88px)',
      // Misma estructura que EntityCell pero sin tile y con `tnum` en la hora
      // (las horas de una agenda tienen que alinearse en columna).
      cell: (t) => (
        <span className="av2-entidad">
          <span className="av2-entidad-cuerpo">
            <span className="av2-entidad-titulo av2-tnum">{hhmm(t.fecha_hora)}</span>
            <span className="av2-entidad-sub">
              <span className="av2-entidad-subtexto av2-tnum">{t.duracion_min} min</span>
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'vecino',
      header: 'VECINO',
      width: 'minmax(170px, 1.6fr)',
      kind: 'entity',
      cell: (t) => (
        <EntityCell
          initials={iniciales(t.nombre_solicitante)}
          title={t.nombre_solicitante || 'Vecino'}
          subtitle={t.dni_solicitante ? `DNI ${t.dni_solicitante}` : undefined}
        />
      ),
    },
    {
      id: 'tramite',
      header: 'TRÁMITE',
      width: 'minmax(160px, 1.4fr)',
      kind: 'entity',
      cell: (t) => (
        <EntityCell
          title={t.tramite_nombre || 'Sin trámite asociado'}
          subtitle={t.codigo || undefined}
        />
      ),
    },
    {
      id: 'estado',
      header: 'ESTADO',
      width: 'minmax(96px, 118px)',
      kind: 'chip',
      cell: (t) => <ChipEstado label={etiquetaEstado(t.estado)} tone={tonoEstado(t.estado)} />,
    },
    {
      // Acciones CONDICIONALES por fila (ver nota 2 del header): columna común
      // con `cell` propio sobre las clases de acción del kit.
      id: 'acciones',
      header: 'ACCIONES',
      width: 'minmax(96px, 104px)',
      align: 'right',
      cell: (t) => (
        <span className="av2-tabla-acciones">
          {t.estado === 'reservado' && (
            <>
              <button
                type="button"
                className="av2-tabla-accion"
                title="Marcar presente"
                aria-label="Marcar presente"
                onClick={() => marcar(t.id, 'cumplido')}
              >
                <Check size={16} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="av2-tabla-accion av2-tabla-accion--peligro"
                title="Marcar ausente"
                aria-label="Marcar ausente"
                onClick={() => marcar(t.id, 'ausente')}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </>
          )}
          {puedeAbrirExpediente(t) && (
            <button
              type="button"
              className="av2-tabla-accion"
              title="Levantar el expediente del trámite actuando por este vecino"
              aria-label="Abrir expediente"
              onClick={() => abrirExpediente(t)}
            >
              <FileText size={16} strokeWidth={1.8} />
            </button>
          )}
        </span>
      ),
    },
  ];

  /* --- Píldoras de estado de la FilterBar (count 0 ⇒ apagada).
         Los conteos van sobre lo BUSCADO: si hay texto en el buscador, las
         píldoras cuentan lo que el operador está viendo, no todo el día. --- */
  const tabsEstado: StatusTab[] = useMemo(() => {
    const por: Record<string, number> = {};
    for (const t of buscados) por[t.estado] = (por[t.estado] || 0) + 1;
    return [
      { id: '', label: 'Todos', count: buscados.length },
      { id: 'reservado', label: 'Por atender', count: por['reservado'] || 0 },
      { id: 'cumplido', label: 'Cumplidos', count: por['cumplido'] || 0 },
      { id: 'ausente', label: 'Ausentes', count: por['ausente'] || 0 },
      { id: 'cancelado', label: 'Cancelados', count: por['cancelado'] || 0 },
    ];
  }, [buscados]);

  /* --- Hero: la frase interpreta, el strip cuenta --- */
  const heroFrases = useMemo<HeroFrase[]>(() => {
    const frases: HeroFrase[] = [];

    if (conteos.total === 0 && !loading) {
      frases.push({
        segmentos: [
          seg(esHoy ? 'Hoy no hay ' : 'Ese día no hay '),
          seg('turnos reservados'),
          seg(' en esta oficina. Podés revisar otro día o los horarios de atención.'),
        ],
      });
    } else if (conteos.total > 0) {
      const acciones: HeroAccion[] = [];
      if (conteos.reservados > 0) {
        acciones.push({
          label: `Ver los ${conteos.reservados} por atender`,
          onClick: () => setFiltroEstado('reservado'),
          primaria: true,
        });
      }
      if (conteos.ausentes > 0) {
        acciones.push({ label: 'Ver los ausentes', onClick: () => setFiltroEstado('ausente') });
      }
      frases.push({
        segmentos: [
          seg(esHoy ? 'Hoy tenés ' : 'Ese día hay '),
          seg(`${conteos.total} turno${conteos.total === 1 ? '' : 's'}`),
          seg(': '),
          seg(`${conteos.cumplidos} cumplido${conteos.cumplidos === 1 ? '' : 's'}`, 'bueno'),
          seg(', '),
          seg(`${conteos.reservados} por atender`),
          seg(' y '),
          seg(`${conteos.ausentes} ausente${conteos.ausentes === 1 ? '' : 's'}`, conteos.ausentes > 0 ? 'malo' : 'bueno'),
          seg('.'),
          ...(franjaPico
            ? [
                seg(' El pico es de '),
                seg(`${dosDigitos(franjaPico.hora)} a ${dosDigitos((franjaPico.hora + 1) % 24)}`, 'advertencia'),
                seg(`, con ${franjaPico.cantidad} turnos.`),
              ]
            : []),
        ],
        acciones: acciones.length ? acciones : undefined,
      });
    }

    if (stats && stats.total > 0) {
      frases.push({
        segmentos: [
          seg('En los últimos 30 días entraron '),
          seg(`${stats.total.toLocaleString('es-AR')} turnos`),
          seg(' y el ausentismo fue del '),
          seg(`${stats.ausentismo_pct}%`, veredictoAusentismo(stats.ausentismo_pct)),
          seg(' sobre los atendibles.'),
        ],
      });
    }

    return frases;
  }, [conteos, esHoy, franjaPico, stats, loading]);

  const heroKpis = useMemo<HeroKpi[]>(() => {
    if (conteos.total === 0 && !stats) return [];
    const pct = (n: number) => (conteos.total > 0 ? Math.round((n / conteos.total) * 100) : 0);
    const kpis: HeroKpi[] = [
      {
        etiqueta: esHoy ? 'TURNOS DE HOY' : 'TURNOS DEL DÍA',
        valor: conteos.total.toLocaleString('es-AR'),
        sub: fechaLarga,
      },
      {
        etiqueta: 'CUMPLIDOS',
        valor: conteos.cumplidos.toLocaleString('es-AR'),
        sub: `${pct(conteos.cumplidos)}% de los turnos`,
        veredicto: 'bueno',
      },
      {
        etiqueta: 'POR ATENDER',
        valor: conteos.reservados.toLocaleString('es-AR'),
        sub: proximo ? `próximo ${hhmm(proximo.fecha_hora)}` : 'sin pendientes',
      },
      {
        etiqueta: 'AUSENTES',
        valor: conteos.ausentes.toLocaleString('es-AR'),
        sub: 'sin aviso previo',
        ...(conteos.ausentes > 0 ? { veredicto: 'malo' as const } : {}),
      },
    ];
    if (stats) {
      kpis.push({
        etiqueta: 'AUSENTISMO',
        valor: `${stats.ausentismo_pct}%`,
        sub: 'últimos 30 días',
        veredicto: veredictoAusentismo(stats.ausentismo_pct),
      });
    }
    return kpis;
  }, [conteos, esHoy, fechaLarga, proximo, stats]);

  /* --- Vista semana: panorama de varias semanas (planificación de carga),
         complementa la agenda del día (operación, check-in). --- */
  const vistaSemana = (
    <CalendarView<TurnoAgenda>
      items={turnosRango}
      getId={(t) => t.id}
      getDate={(t) => t.fecha_hora}
      getLabel={(t) => `${hhmm(t.fecha_hora)} ${(t.nombre_solicitante || 'Turno').split(' ')[0]}`}
      getColor={(t) => ESTADO_COLOR[t.estado] || theme.primary}
      getTooltip={(t) => `${hhmm(t.fecha_hora)} · ${t.nombre_solicitante || 'Vecino'}${t.tramite_nombre ? ` · ${t.tramite_nombre}` : ''} · ${etiquetaEstado(t.estado)}`}
      onItemClick={(t) => {
        setFecha(t.fecha_hora.slice(0, 10));
        cambiarVista('day');
      }}
      helperText={loadingRango
        ? 'Cargando turnos...'
        : 'Turnos de los últimos y próximos 45 días. Click en un turno para abrir ese día en la agenda.'}
    />
  );

  const horariosHref = depId ? `/gestion/configuracion-agenda?dependencia_id=${depId}` : undefined;
  const mensajeVacio = search.trim()
    ? `No hay turnos que coincidan con "${search.trim()}" en ese día.`
    : filtroEstado
      ? 'No hay turnos en ese estado para el día elegido.'
      : 'No hay turnos reservados para ese día en esta oficina.';

  return (
    <div className="av2-page" data-module="agenda">
      {/* 1. Cabecera de módulo: eyebrow + H1 + bajada, arriba de todo. */}
      <PageHeader
        eyebrow="Agenda"
        title="Quién viene hoy y en qué estado está cada turno"
        description="Turnos que los vecinos reservaron en la oficina elegida. La tabla los agrupa por franja horaria; desde acá marcás presente o ausente y levantás el expediente del trámite."
      />

      {/* 2. ModuleHero = SemanticHero con la stat strip ADENTRO (cero KPIs sueltos). */}
      <div className="av2-hero-wrap">
        <SemanticHero
          etiqueta={`AGENDA · ${fechaLarga.toUpperCase()}`}
          frases={heroFrases}
          kpis={heroKpis}
          className="av2-hero"
        />
      </div>

      {/* 3+4. Controles: toolbar + fila de día + filtros, una sola tarjeta. */}
      <div className="av2-controles">
        <ListToolbar
          searchPlaceholder="Buscar por nombre, DNI o código de turno…"
          search={search}
          onSearchChange={setSearch}
          views={['day', 'week']}
          activeView={vista}
          onViewChange={cambiarVista}
          secondaryAction={{
            label: 'Horarios de la oficina',
            icon: Clock,
            ...(horariosHref
              ? { to: horariosHref }
              : { disabled: true, disabledReason: 'Elegí primero una oficina' }),
          }}
        />

        {/* Fila de día: oficina + fecha + "Hoy". Vive acá y no en la FilterBar
            porque el kit todavía no tiene control de día (nota 1 del header). */}
        <div className="av2-filterbar">
          <div className="av2-select-grupo">
            <span className="av2-select-etiqueta">Oficina</span>
            <ModernSelect
              value={depId}
              onChange={setDepId}
              options={depOptions}
              placeholder="Oficina"
              searchable={depOptions.length > 8}
              className="av2-select-modern"
            />
          </div>

          <div className="av2-period" role="group" aria-label="Día de la agenda">
            <DatePicker value={fecha} onChange={setFecha} className="min-w-[152px]" />
            <button
              type="button"
              className="av2-period-hasta"
              onClick={() => setFecha(hoyISO())}
              title="Volver al día de hoy"
            >
              Hoy
            </button>
          </div>
        </div>

        <FilterBar
          selects={[]}
          statusTabs={vista === 'day' ? tabsEstado : []}
          activeStatus={filtroEstado}
          onStatusChange={setFiltroEstado}
          filterSummary={
            vista === 'day' && conteos.total > 0
              ? `${filtrados.length} de ${conteos.total} turnos del día`
              : undefined
          }
        />
      </div>

      {/* 5. Cuerpo: agenda del día (tabla) o panorama de semanas (calendario). */}
      {vista === 'week' ? (
        <div className="mt-3">{vistaSemana}</div>
      ) : (
        <DataTable<TurnoAgenda>
          kind="schedule"
          columns={columnas}
          groupBy="hour"
          groups={grupos}
          rows={[]}
          rowKey={(t) => t.id}
          rowActions={[]}
          loading={loading}
          emptyMessage={mensajeVacio}
          tableMinWidth={820}
          footer={{
            showing: `Mostrando ${filtrados.length.toLocaleString('es-AR')} de ${conteos.total.toLocaleString('es-AR')}`,
            ...(horariosHref
              ? { action: { label: 'Horarios de esta oficina', to: horariosHref } }
              : {}),
          }}
        />
      )}
    </div>
  );
}
