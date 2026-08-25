/**
 * Pagos programados — estándar `SemanticAbmPage` con `kind='money'`
 * (components/abmv2/README.md, fila "Liquidaciones").
 * Referencia visual: canvas "Pagos programados".
 *
 * Idea de fondo del diseño: UN DÍA = UNA TRANSFERENCIA. La tabla agrupa por
 * día de vencimiento con subtotal, cada fila se puede MARCAR, y lo marcado
 * alimenta el KPI SELECCIONADO, el total del pie y el CTA de pago masivo.
 *
 * La lógica de datos (fetch, filtros, ejecutar / omitir / mover un pago) es la
 * de siempre. Hero con el strip de KPIs ADENTRO, ListToolbar + FilterBar +
 * DataTable. Las 3 vistas (tabla / tarjetas / calendario) siguen vivas vía
 * `viewSlots`, y Adelantados/Realizados reusan el MISMO DataTable con otras
 * columnas en vez de la lista maquetada a mano que había antes.
 * Cero hex inline: todo sale de los tokens --pl-*; donde hace falta un color
 * CONCRETO (CalendarView concatena el alpha sobre el string) se lee el token
 * del CSS computado, mismo patrón que pages/Mapa.tsx.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Edit2, Loader2, SkipForward, Trash2, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { PagoMasivoModal } from '../components/tesoreria/PagoMasivoModal';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { MoneyInput } from '../components/ui/MoneyInput';
import { CalendarView } from '../components/ui/CalendarView';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { ChipEstado, DataTable, DotCell, EntityCell } from '../components/abmv2/DataTable';
import type {
  ChipTone, ColumnSpec, RowAction, SelectSpec, StatusTab, TableGroup, ViewKind,
} from '../components/abmv2/types';
import { seg, type HeroFrase, type HeroKpi, type Veredicto } from '../lib/semanticHero';
import { conceptoIcon } from '../lib/conceptoIcons';
import {
  contactoIconByTipo, TIPO_CONTACTO_COLORS, TIPO_CONTACTO_LABELS_SINGULAR,
} from '../lib/contactoIcons';
import { agendaPagosApi, contactosApi, cajasApi, conceptosLiquidacionApi } from '../lib/api';
import { clasificarPagos, diasDesdeHoy } from '../lib/tesoreria-helpers';
import type {
  Caja, Contacto, ConceptoLiquidacion, FrecuenciaPago, PagoEjecutadoHistorial, PagoProgramado,
} from '../types';
import '../styles/liquidaciones.css';

/* ---------- Constantes de dominio ---------- */

const FRECUENCIA_LABELS: Record<FrecuenciaPago, string> = {
  semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
  bimestral: 'Bimestral', trimestral: 'Trimestral', anual: 'Anual',
};

/** Frecuencia → tono del chip del kit (paleta StatusPill del estándar).
 *  Reemplaza al mapa de hex que tenía la pantalla. */
const FRECUENCIA_TONO: Record<FrecuenciaPago, ChipTone> = {
  semanal: 'red', quincenal: 'amber', mensual: 'blue',
  bimestral: 'gray', trimestral: 'gray', anual: 'green',
};

/** Token de color por frecuencia, para las piezas que necesitan un color
 *  concreto (tile de la celda de concepto, calendario, tarjetas). */
const FRECUENCIA_TOKEN: Record<FrecuenciaPago, string> = {
  semanal: '--pl-red', quincenal: '--pl-amber-strong', mensual: '--pl-blue',
  bimestral: '--pl-data-2', trimestral: '--pl-data-3', anual: '--pl-green',
};

// "quincenal" volvió a lo cargable (decisión del dueño 2026-08-24): ahora es
// quincena de CALENDARIO — dos vencimientos por mes, el día A y el A+14, con
// A acotado a 1..14 para que el segundo día (<= 28) exista en TODOS los meses.
// La exclusión anterior era por el cálculo viejo ("+14 días corridos"), que
// se corría del calendario.
const FRECUENCIAS_SELECCIONABLES: FrecuenciaPago[] =
  Object.keys(FRECUENCIA_LABELS) as FrecuenciaPago[];

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  .map((label, i) => ({ value: String(i), label }));

/** Input de texto/número del sheet: tokens, nunca hex (patrón ConfiguracionAgenda). */
const ESTILO_INPUT: CSSProperties = {
  width: '100%', minWidth: 0, height: 32, padding: '0 10px',
  background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)',
  borderRadius: 'var(--pl-radius-md)', color: 'var(--pl-text)',
  fontFamily: 'inherit', fontSize: 'var(--pl-fs-body-sm)',
};

type EstadoFiltro = 'todos' | 'vencidos' | 'urgentes' | 'mas_adelante' | 'adelantados' | 'realizados';

const VISTA_KEY = 'agenda_view';
const TOUR_KEY = 'sueldos-liquidaciones';
/** Los pagos ejecutados quedan como gastos: ahí están sus comprobantes. */
const RUTA_COMPROBANTES = '/gestion/tesoreria';

const TOUR_STEPS_LIQ = [
  {
    target: '.av2-hero',
    content: 'Cuánto está vencido, cuánto vence esta semana, cuánto tenés comprometido y cuánto llevás marcado para pagar.',
    title: 'Resumen de pagos programados',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
  {
    target: '.av2-btn-primario',
    content: 'Marcá los pagos de un mismo día y cerralos todos juntos: una transferencia por día. El botón te dice cuántos llevás marcados.',
    title: 'Pago masivo',
    placement: 'bottom' as const,
  },
];

/* ---------- Helpers de fecha / moneda ---------- */

/** Parsea un YYYY-MM-DD como fecha LOCAL (NO UTC). Evita el clásico bug:
 *  new Date("2026-06-01") es UTC midnight -> en AR (-03) se ve como 31/05. */
function parseLocalDate(fecha: string | null | undefined): Date {
  const m = (fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m
    ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
    : new Date(fecha || '');
}

function fmtFecha(fecha: string | null | undefined): string {
  return fecha ? parseLocalDate(fecha).toLocaleDateString('es-AR') : '';
}

// `diasDesdeHoy` y la partición de la agenda (vencidos / esta semana /
// quincena) viven en lib/tesoreria-helpers: las comparte con el tablero
// financiero del Dashboard. Que cada pantalla las contara con su propio `for`
// es cómo se llega a dos números distintos para la misma pregunta.

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$ ${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Título del grupo: "1 de agosto". */
const tituloDia = (iso: string) => {
  const d = parseLocalDate(iso);
  return `${d.getDate()} de ${d.toLocaleDateString('es-AR', { month: 'long' })}`;
};

/** "venció hace 2 días" / "vence hoy" / "en 3 días". */
const estadoDia = (dias: number) =>
  dias < 0 ? `venció hace ${plural(Math.abs(dias), 'día', 'días')}`
    : dias === 0 ? 'vence hoy' : `en ${plural(dias, 'día', 'días')}`;

/** Versión corta para la celda VENCE. */
const estadoCorto = (dias: number) =>
  dias < 0 ? `venció hace ${Math.abs(dias)} d` : dias === 0 ? 'vence hoy' : `en ${dias} d`;

/** Mensaje de error del backend (axios) con fallback. Evita el `catch (e: any)`
 *  que tenía cada handler — `any` está vetado por el ESLint del repo. */
function msgError(e: unknown, fallback: string): string {
  const detalle = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detalle === 'string' && detalle ? detalle : fallback;
}

/** Agrupa por día y arma el TableGroup del kit (insignia día/mes + dos
 *  renglones + subtotal ya formateado). La página agrupa, el DataTable sólo
 *  pinta.
 *  El título del grupo es SIEMPRE la fecha escrita entera; `detalle` aporta el
 *  renglón chico y —cuando corresponde— el veredicto que tiñe la insignia. */
function agruparPorDia<T>(
  items: T[],
  getFecha: (item: T) => string,
  getMonto: (item: T) => number,
  detalle: (rows: T[], dias: number, iso: string) => { label: string; veredicto?: Veredicto },
  desc: boolean,
): TableGroup<T>[] {
  const porDia = new Map<string, T[]>();
  for (const it of items) {
    const k = (getFecha(it) || '').slice(0, 10);
    const arr = porDia.get(k);
    if (arr) arr.push(it); else porDia.set(k, [it]);
  }
  return Array.from(porDia.entries())
    .sort((a, b) => (desc ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
    .map(([k, rows]) => {
      const d = parseLocalDate(k);
      const { label, veredicto } = detalle(rows, diasDesdeHoy(k), k);
      return {
        key: k,
        badge: {
          top: String(d.getDate()),
          bottom: d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase(),
        },
        title: tituloDia(k),
        label,
        veredicto,
        subtotal: fmtMoney(rows.reduce((s, r) => s + getMonto(r), 0)),
        rows,
      };
    });
}

/* ---------- Pantalla ---------- */

export default function PagosProgramados() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [pagos, setPagos] = useState<PagoProgramado[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [conceptosLiq, setConceptosLiq] = useState<ConceptoLiquidacion[]>([]);
  const [historial, setHistorial] = useState<PagoEjecutadoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<number | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [contactoFiltro, setContactoFiltro] = useState('');
  const [cajaFiltro, setCajaFiltro] = useState('');
  const [frecuenciaFiltro, setFrecuenciaFiltro] = useState<FrecuenciaPago | ''>('');
  const [conceptoFiltro, setConceptoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('todos');
  const [vista, setVista] = useState<ViewKind>(() => {
    const g = typeof window !== 'undefined' ? localStorage.getItem(VISTA_KEY) : null;
    return g === 'cards' || g === 'guided' ? g : 'table';
  });

  /** Pagos marcados para cerrar juntos (un día = una transferencia). */
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  /** Resumen del último cierre, para el banner verde. */
  const [cierre, setCierre] = useState<{ cantidad: number; monto: number; caja: string } | null>(null);

  const [masivoOpen, setMasivoOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PagoProgramado | null>(null);
  const [saving, setSaving] = useState(false);

  // Sheet "Ejecutar pago": el user puede ajustar el monto del mes (varía por
  // persona/mes) antes de confirmar. Reemplaza al confirm() nativo.
  const [ejecutarPago, setEjecutarPago] = useState<PagoProgramado | null>(null);
  const [ejecutarMonto, setEjecutarMonto] = useState('');
  const [ejecutarFecha, setEjecutarFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ejecutarNotas, setEjecutarNotas] = useState('');

  const [omitingId, setOmitingId] = useState<number | null>(null);
  const [omitirPago, setOmitirPago] = useState<PagoProgramado | null>(null);
  const [borrarPago, setBorrarPago] = useState<PagoProgramado | null>(null);
  const [borrando, setBorrando] = useState(false);

  const [form, setForm] = useState({
    contacto_id: 0, caja_id: 0, concepto: 'Sueldo mensual', descripcion: '',
    monto_pesos: '', forma_pago: 'transferencia', frecuencia: 'mensual' as FrecuenciaPago,
    dia_del_mes: 5, dia_semana: null as number | null,
    fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: '',
    premios_default: [] as number[],
  });

  // Gate de rol: el guard de render vive DESPUÉS de todos los hooks (regla de
  // hooks); acá sólo gateamos los fetches. Antes el early-return estaba ARRIBA
  // de los hooks, que es justo lo que rules-of-hooks prohíbe.
  const esGestor = !user || user.rol === 'admin' || user.rol === 'supervisor';

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, c, cj, cl, h] = await Promise.all([
        agendaPagosApi.list({ activo: true }),
        contactosApi.list({ activo: true, limit: 5000 }),
        cajasApi.list({ activo: true, include_saldos: true }),
        conceptosLiquidacionApi.list({ activo: true }).catch(() => ({ data: [] as ConceptoLiquidacion[] })),
        // El historial alimenta las pestañas Adelantados/Realizados. Se trae en
        // la carga inicial (antes era lazy) porque el segmented del estándar
        // APAGA las pestañas con count 0: en lazy quedaban muertas y no había
        // forma de entrar a verlas.
        agendaPagosApi.historial({ limit: 500 }).catch(() => ({ data: [] as PagoEjecutadoHistorial[] })),
      ]);
      setPagos(p.data || []);
      setContactos(c.data || []);
      setCajas(cj.data || []);
      setConceptosLiq(cl.data || []);
      setHistorial(h.data || []);
    } catch { toast.error('Error cargando agenda'); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!esGestor) return;
    fetchAll();
  }, [esGestor]);

  useEffect(() => { localStorage.setItem(VISTA_KEY, vista); }, [vista]);

  /* ---------- Colores concretos desde los tokens ----------
     CalendarView concatena el alpha sobre el string del color ("#RRGGBB"+"25"),
     así que ahí `var(--pl-*)` no sirve. Se leen del CSS computado, igual que
     en Mapa.tsx: siguen al theme y a la marca, cero hex fijos. */
  const colorFrecuencia = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      (Object.keys(FRECUENCIA_TOKEN) as FrecuenciaPago[])
        .map((f) => [f, cs.getPropertyValue(FRECUENCIA_TOKEN[f]).trim() || theme.primary]),
    ) as Record<FrecuenciaPago, string>;
  }, [theme.primary]);

  /* ---------- Mapas auxiliares ---------- */
  const contactosMap = useMemo(() => {
    const m = new Map<number, Contacto>();
    contactos.forEach(c => m.set(c.id, c));
    return m;
  }, [contactos]);

  const cajasMap = useMemo(() => {
    const m = new Map<number, Caja>();
    cajas.forEach(c => m.set(c.id, c));
    return m;
  }, [cajas]);

  /* ---------- Filtros ---------- */
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pagos.filter(p => {
      if (contactoFiltro && String(p.contacto_id) !== contactoFiltro) return false;
      if (cajaFiltro && String(p.caja_id || '') !== cajaFiltro) return false;
      if (frecuenciaFiltro && p.frecuencia !== frecuenciaFiltro) return false;
      if (conceptoFiltro && p.concepto !== conceptoFiltro) return false;
      if (s) {
        const hay = (p.concepto || '').toLowerCase().includes(s)
          || (p.contacto_nombre || '').toLowerCase().includes(s);
        if (!hay) return false;
      }
      const dias = diasDesdeHoy(p.proximo_pago);
      if (estadoFiltro === 'vencidos' && dias >= 0) return false;
      if (estadoFiltro === 'urgentes' && (dias < 0 || dias > 7)) return false;
      if (estadoFiltro === 'mas_adelante' && dias <= 7) return false;
      return true;
    }).sort((a, b) => a.proximo_pago.localeCompare(b.proximo_pago));
  }, [pagos, search, contactoFiltro, cajaFiltro, frecuenciaFiltro, conceptoFiltro, estadoFiltro]);

  /** La agenda partida en franjas. Mismo helper que usa el tablero financiero
   *  del Dashboard: un solo lugar donde se decide qué es "vencido". */
  const cola = useMemo(() => clasificarPagos(pagos), [pagos]);

  const stats = useMemo(() => ({
    pendientes7: cola.estaSemana.length,
    monto7: cola.montoSemana,
    masAdelante: cola.masAdelante,
    vencidos: cola.vencidos.length,
    montoVencido: cola.montoVencido,
    comprometido: cola.comprometido,
  }), [cola]);

  /** Los vencidos: alimentan el veredicto y la acción "marcarlos". */
  const vencidos = cola.vencidos;

  /** Concepto dominante entre los vencidos + el día que más concentra. Sólo se
   *  afirma si de verdad domina (>= 50%); si no, el veredicto no lo menciona
   *  (nada de "casi todos X" inventado). */
  const focoVencidos = useMemo(() => {
    if (vencidos.length === 0) return null;
    const porConcepto = new Map<string, number>();
    const porDia = new Map<string, number>();
    for (const p of vencidos) {
      porConcepto.set(p.concepto, (porConcepto.get(p.concepto) || 0) + 1);
      const k = (p.proximo_pago || '').slice(0, 10);
      porDia.set(k, (porDia.get(k) || 0) + 1);
    }
    const [concepto, n] = Array.from(porConcepto.entries()).sort((a, b) => b[1] - a[1])[0];
    if (n / vencidos.length < 0.5) return null;
    const [diaTop] = Array.from(porDia.entries()).sort((a, b) => b[1] - a[1])[0];
    return { concepto, dia: tituloDia(diaTop) };
  }, [vencidos]);

  /* ---------- Selección múltiple ---------- */
  const seleccionados = useMemo(
    () => filtered.filter(p => seleccion.has(p.id)), [filtered, seleccion]);
  const totalSeleccionado = useMemo(
    () => seleccionados.reduce((s, p) => s + parseFloat(p.monto_pesos || '0'), 0), [seleccionados]);

  const toggleSeleccion = (id: number) => setSeleccion(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const marcarVencidos = () => setSeleccion(new Set(vencidos.map(p => p.id)));

  /** Caja del módulo: sólo se muestra si TODOS los pagos salen de la misma. El
   *  modelo real admite una caja por pago, así que afirmar un único fondo
   *  cuando hay varios sería falso (ver reporte). */
  const cajaUnica = useMemo(() => {
    const ids = new Set(pagos.map(p => p.caja_id ?? 0));
    if (ids.size !== 1) return null;
    const id = Array.from(ids)[0];
    return id ? cajasMap.get(id)?.nombre || null : null;
  }, [pagos, cajasMap]);

  // El historial trae TODOS los gastos de liquidaciones (incluye fecha futura),
  // partido por la fecha de impacto vs hoy:
  //  - adelantados = ya tildados pero la fecha todavía no llegó.
  //  - realizados  = ya impactaron (fecha <= hoy).
  const adelantados = useMemo(() => historial.filter(h => diasDesdeHoy(h.fecha) > 0), [historial]);
  const realizados = useMemo(() => historial.filter(h => diasDesdeHoy(h.fecha) <= 0), [historial]);

  const esVistaHistorial = estadoFiltro === 'adelantados' || estadoFiltro === 'realizados';
  const itemsHistorial = estadoFiltro === 'adelantados' ? adelantados : realizados;
  const totalHistorial = useMemo(
    () => itemsHistorial.reduce((s, h) => s + parseFloat(h.monto_pesos || '0'), 0), [itemsHistorial]);

  /* ---------- Acciones ---------- */
  const openSheet = (p: PagoProgramado | null = null) => {
    setEditing(p);
    setForm(p
      ? {
          contacto_id: p.contacto_id, caja_id: p.caja_id || 0,
          concepto: p.concepto, descripcion: p.descripcion || '',
          monto_pesos: String(p.monto_pesos), forma_pago: p.forma_pago,
          frecuencia: p.frecuencia, dia_del_mes: p.dia_del_mes, dia_semana: p.dia_semana ?? null,
          fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin || '',
          premios_default: (p.premios_default as number[] | null) || [],
        }
      : {
          contacto_id: 0, caja_id: 0, concepto: '', descripcion: '',
          monto_pesos: '', forma_pago: 'transferencia', frecuencia: 'mensual',
          dia_del_mes: 1, dia_semana: null,
          fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: '',
          premios_default: [],
        });
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.contacto_id) return toast.error('Elegí un contacto');
    if (!form.concepto.trim()) return toast.error('Falta concepto');
    if (!form.monto_pesos || parseFloat(form.monto_pesos) <= 0) return toast.error('Monto inválido');
    setSaving(true);
    try {
      const payload = {
        contacto_id: form.contacto_id,
        caja_id: form.caja_id || null,
        concepto: form.concepto.trim(), descripcion: form.descripcion.trim() || null,
        monto_pesos: parseFloat(form.monto_pesos), forma_pago: form.forma_pago,
        frecuencia: form.frecuencia, dia_del_mes: form.dia_del_mes,
        dia_semana: form.frecuencia === 'semanal' ? (form.dia_semana ?? 4) : null,
        fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin || null,
        // Los premios se manejan como liquidaciones aparte; no van con el sueldo.
        premios_default: [],
      };
      if (editing) await agendaPagosApi.update(editing.id, payload);
      else await agendaPagosApi.create(payload);
      toast.success(editing ? 'Pago actualizado' : 'Pago programado creado');
      setSheetOpen(false); fetchAll();
    } catch (e) { toast.error(msgError(e, 'Error guardando')); } finally { setSaving(false); }
  };

  /** Drag&drop del calendario: mueve el pago a otra fecha. */
  const handleMoverPago = async (pago: PagoProgramado, nuevaFechaISO: string) => {
    try {
      await agendaPagosApi.update(pago.id, {
        proximo_pago: nuevaFechaISO,
        dia_del_mes: parseInt(nuevaFechaISO.slice(8, 10), 10),
      });
      toast.success('Pago movido');
      fetchAll();
    } catch (e) { toast.error(msgError(e, 'Error moviendo')); }
  };

  const confirmarOmitir = async () => {
    const p = omitirPago;
    if (!p) return;
    setOmitingId(p.id);
    try {
      const res = await agendaPagosApi.omitir(p.id);
      const next = res.data.proximo_pago ? fmtFecha(res.data.proximo_pago) : 'fin de la liquidación';
      toast.success(`Pago omitido. Próximo: ${next}`);
      setOmitirPago(null);
      fetchAll();
    } catch (e) { toast.error(msgError(e, 'Error omitiendo')); }
    finally { setOmitingId(null); }
  };

  const handleEjecutar = (p: PagoProgramado) => {
    setEjecutarPago(p);
    setEjecutarMonto(p.monto_pesos);
    // Fecha de impacto = la programada (proximo_pago), no la del clic: un pago
    // del día 4 confirmado el 1 figura en historial como del día 4.
    setEjecutarFecha((p.proximo_pago || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    setEjecutarNotas('');
  };

  const cerrarEjecutar = () => {
    setEjecutarPago(null); setEjecutarMonto(''); setEjecutarNotas('');
  };

  const ejecutarTotal = parseFloat(ejecutarMonto || '0') || 0;

  const confirmarEjecutar = async () => {
    if (!ejecutarPago) return;
    if (!ejecutarTotal || ejecutarTotal <= 0) { toast.error('Monto inválido'); return; }
    const pagado = ejecutarPago;
    setExecutingId(pagado.id);
    try {
      const res = await agendaPagosApi.ejecutar(pagado.id, {
        fecha_pago: ejecutarFecha,
        monto_base: ejecutarMonto,
        // Los premios se cargan como liquidaciones independientes (presentismo
        // semanal, incentivo de mitad de mes), no como extras del sueldo.
        premios_aplicados: [],
        notas: ejecutarNotas.trim() || undefined,
      });
      toast.success(`Pago de ${fmtMoney(res.data.monto_total)} ejecutado`);
      setCierre({
        cantidad: 1,
        monto: parseFloat(res.data.monto_total) || 0,
        caja: pagado.caja_nombre || 'la caja asignada',
      });
      setSeleccion(prev => { const n = new Set(prev); n.delete(pagado.id); return n; });
      cerrarEjecutar();
      fetchAll();
    } catch (e) { toast.error(msgError(e, 'Error ejecutando')); }
    finally { setExecutingId(null); }
  };

  const confirmarBorrar = async () => {
    if (!borrarPago) return;
    setBorrando(true);
    try {
      await agendaPagosApi.delete(borrarPago.id);
      toast.success('Eliminado');
      setBorrarPago(null);
      fetchAll();
    } catch { toast.error('Error'); } finally { setBorrando(false); }
  };

  /** Cierre del pago masivo: refresca y arma el banner con el resumen REAL que
   *  devuelve el backend (nada estimado). */
  const onMasivoDone = (resumen?: { cantidad: number; monto: number }) => {
    if (resumen && resumen.cantidad > 0) {
      setCierre({
        cantidad: resumen.cantidad,
        monto: resumen.monto,
        caja: cajaUnica || 'las cajas asignadas',
      });
    }
    setSeleccion(new Set());
    fetchAll();
  };

  /* ---------- Opciones de combos ---------- */
  const contactoOptions = useMemo(
    () => contactos.map(c => ({ value: String(c.id), label: `${c.nombre} ${c.apellido || ''}`.trim() })),
    [contactos]);

  const cajaOptions = useMemo(
    () => cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
    [cajas]);

  const frecuenciaOptions = useMemo(
    () => FRECUENCIAS_SELECCIONABLES.map(f => ({ value: f, label: FRECUENCIA_LABELS[f] })), []);

  // Conceptos derivados de los pagos cargados (matchea siempre lo filtrable).
  const conceptoOptions = useMemo(
    () => Array.from(new Set(pagos.map(p => p.concepto).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map(c => ({ value: c, label: c })),
    [pagos]);

  /* ---------- FilterBar: Concepto · Contacto · Frecuencia · Caja ---------- */
  const selects: SelectSpec[] = [
    { id: 'concepto', label: 'Concepto', value: conceptoFiltro, onChange: setConceptoFiltro,
      options: [{ value: '', label: 'Todos' }, ...conceptoOptions] },
    { id: 'contacto', label: 'Contacto', value: contactoFiltro, onChange: setContactoFiltro,
      options: [{ value: '', label: 'Todos' }, ...contactoOptions] },
    { id: 'frecuencia', label: 'Frecuencia', value: frecuenciaFiltro,
      onChange: (v) => setFrecuenciaFiltro(v as FrecuenciaPago | ''),
      options: [{ value: '', label: 'Todas' }, ...frecuenciaOptions] },
    { id: 'caja', label: 'Caja', value: cajaFiltro, onChange: setCajaFiltro,
      options: [{ value: '', label: 'Todas' }, ...cajaOptions] },
  ];

  const statusTabs: StatusTab[] = [
    { id: 'todos', label: 'Todos', count: pagos.length },
    { id: 'vencidos', label: 'Vencidos', count: stats.vencidos },
    { id: 'urgentes', label: 'Esta semana', count: stats.pendientes7 },
    { id: 'mas_adelante', label: 'Más adelante', count: stats.masAdelante },
    // Las dos de abajo NO están en el canvas, pero son la única vía a los pagos
    // ya tildados (adelantados) y ya impactados (realizados): se conservan.
    { id: 'adelantados', label: 'Adelantados', count: adelantados.length },
    { id: 'realizados', label: 'Realizados', count: realizados.length },
  ];

  /* ---------- Hero semántico ---------- */
  const frases: HeroFrase[] = [(() => {
    if (pagos.length === 0) {
      return { segmentos: [
        seg('Todavía no hay pagos programados. Cargá el primero y el sistema te avisa cuándo toca pagar.'),
      ] };
    }
    const segmentos = stats.vencidos > 0
      ? [
          seg(`${plural(stats.vencidos, 'pago vencido', 'pagos vencidos')} por ${fmtMoney(stats.montoVencido)}`, 'malo'),
          seg(focoVencidos
            ? `, casi todos ${focoVencidos.concepto.toLowerCase()} del ${focoVencidos.dia}. Marcalos y pagás todo junto en una transferencia.`
            : '. Marcalos y pagás todo junto en una transferencia.'),
        ]
      : [
          seg('No hay pagos vencidos', 'bueno'),
          seg(stats.pendientes7 > 0
            ? `, pero ${plural(stats.pendientes7, 'vence', 'vencen')} esta semana por ${fmtMoney(stats.monto7)}. Marcalos y cerralos juntos.`
            : ' ni vencimientos en los próximos 7 días.'),
        ];
    return {
      segmentos,
      acciones: [
        ...(stats.vencidos > 0
          ? [{ label: `Marcar los ${stats.vencidos} vencidos`, onClick: marcarVencidos, primaria: true }]
          : []),
        { label: 'Ver proyección de caja', to: '/gestion/tesoreria/proyecciones' },
      ],
    };
  })()];

  const heroKpis: HeroKpi[] = [
    {
      etiqueta: 'VENCIDOS',
      valor: fmtMoney(stats.montoVencido),
      sub: plural(stats.vencidos, 'pago atrasado', 'pagos atrasados'),
      veredicto: stats.vencidos > 0 ? 'malo' : undefined,
    },
    {
      etiqueta: 'ESTA SEMANA',
      valor: fmtMoney(stats.monto7),
      sub: `${stats.pendientes7} por vencer`,
      veredicto: stats.pendientes7 > 0 ? 'advertencia' : undefined,
    },
    {
      etiqueta: 'COMPROMETIDO',
      valor: fmtMoney(stats.comprometido),
      sub: plural(pagos.length, 'pago activo', 'pagos activos'),
    },
    {
      etiqueta: 'SELECCIONADO',
      valor: fmtMoney(totalSeleccionado),
      sub: seleccion.size > 0 ? `${seleccion.size} marcados` : 'nada marcado',
      veredicto: seleccion.size > 0 ? 'bueno' : undefined,
    },
  ];

  /* ---------- Celdas compartidas por las dos tablas ---------- */
  const celdaFecha = (iso: string, sub: ReactNode) => (
    <span className="flex flex-col">
      <span className="av2-tabla-fecha av2-tnum">{fmtFecha(iso)}</span>
      {sub}
    </span>
  );

  const celdaContacto = (nombre: string | null | undefined, contactoId: number | null | undefined) => {
    const tipo = (contactoId ? contactosMap.get(contactoId)?.tipo : null) || 'otro';
    return (
      <EntityCell
        icon={contactoIconByTipo(tipo)}
        tileColor={TIPO_CONTACTO_COLORS[tipo]}
        title={nombre || '—'}
        subtitle={TIPO_CONTACTO_LABELS_SINGULAR[tipo]}
        dotColor={TIPO_CONTACTO_COLORS[tipo]}
      />
    );
  };

  const celdaMonto = (v: string) => <span className="av2-money av2-tabla-monto">{fmtMoney(v)}</span>;

  const COL_CONTACTO = { header: 'CONTACTO', width: 'minmax(180px, 1.7fr)', kind: 'entity' } as const;
  const COL_CONCEPTO = { header: 'CONCEPTO', width: 'minmax(160px, 1.4fr)', kind: 'entity' } as const;
  const COL_MONTO = { header: 'MONTO', width: 'minmax(100px, 126px)', kind: 'money', align: 'right' } as const;
  const COL_FECHA = { width: 'minmax(100px, 0.9fr)', kind: 'date' } as const;

  /** Checkbox de fila: para en seco el click para no abrir el sheet de edición. */
  const celdaCheck = (p: PagoProgramado) => {
    const on = seleccion.has(p.id);
    return (
      <button
        type="button" role="checkbox" aria-checked={on}
        aria-label={`Marcar el pago de ${p.contacto_nombre || 'contacto'} para pagar en grupo`}
        className={on ? 'liq-check liq-check--on' : 'liq-check'}
        onClick={(e) => { e.stopPropagation(); toggleSeleccion(p.id); }}
      >
        <Check size={12} strokeWidth={3} aria-hidden />
      </button>
    );
  };

  /** Las 4 acciones SIEMPRE visibles. El DataTable del kit sólo muestra 2 vía
   *  `rowActions` y manda el resto a un menú "…", así que van en celda propia
   *  y `rowActions` queda vacío. */
  const celdaAcciones = (p: PagoProgramado) => (
    <span className="liq-acciones" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="liq-pagar" disabled={executingId === p.id}
        title="Pagar ahora" onClick={() => handleEjecutar(p)}>
        {executingId === p.id
          ? <Loader2 size={12} className="animate-spin" aria-hidden />
          : <CheckCircle2 size={12} strokeWidth={2.4} aria-hidden />}
        Pagar
      </button>
      <button type="button" className="av2-tabla-accion" disabled={omitingId === p.id}
        title="Omitir el período (no descuenta caja)" aria-label="Omitir el período"
        onClick={() => setOmitirPago(p)}>
        <SkipForward size={15} strokeWidth={1.8} />
      </button>
      <button type="button" className="av2-tabla-accion" title="Editar" aria-label="Editar"
        onClick={() => openSheet(p)}>
        <Edit2 size={15} strokeWidth={1.8} />
      </button>
      <button type="button" className="av2-tabla-accion av2-tabla-accion--peligro"
        title="Eliminar" aria-label="Eliminar" onClick={() => setBorrarPago(p)}>
        <Trash2 size={15} strokeWidth={1.8} />
      </button>
    </span>
  );

  const columns: ColumnSpec<PagoProgramado>[] = [
    { id: 'sel', header: '', width: '34px', kind: 'text', cell: celdaCheck },
    {
      ...COL_FECHA, id: 'proximo_pago', header: 'VENCE',
      cell: (p) => {
        const dias = diasDesdeHoy(p.proximo_pago);
        return celdaFecha(p.proximo_pago, (
          <span className={dias < 0 ? 'av2-money--bad' : dias <= 7 ? 'liq-warn' : 'av2-tabla-texto'}>
            {estadoCorto(dias)}
          </span>
        ));
      },
    },
    { ...COL_CONTACTO, id: 'contacto_nombre', cell: (p) => celdaContacto(p.contacto_nombre, p.contacto_id) },
    {
      ...COL_CONCEPTO, id: 'concepto',
      cell: (p) => (
        <EntityCell
          icon={conceptoIcon(p.concepto)}
          tileColor={colorFrecuencia[p.frecuencia]}
          title={p.concepto}
          subtitle={FRECUENCIA_LABELS[p.frecuencia]}
          dotColor={colorFrecuencia[p.frecuencia]}
        />
      ),
    },
    { ...COL_MONTO, id: 'monto_pesos', cell: (p) => celdaMonto(p.monto_pesos) },
    {
      id: 'acciones', header: 'ACCIONES', width: 'minmax(150px, 162px)',
      kind: 'text', align: 'right', cell: celdaAcciones,
    },
  ];

  const grupos = useMemo(
    () => agruparPorDia<PagoProgramado>(
      filtered, (p) => p.proximo_pago, (p) => parseFloat(p.monto_pesos || '0'),
      // "1 de agosto" arriba y "5 pagos · venció hace 1 día" abajo — un día =
      // una transferencia. El día que ya venció va en rojo (insignia incluida);
      // el que vence hoy, en ámbar. Los de más adelante quedan neutros: no hay
      // nada que avisar todavía.
      (rows, dias) => ({
        label: `${plural(rows.length, 'pago', 'pagos')} · ${estadoDia(dias)}`,
        veredicto: dias < 0 ? 'malo' : dias === 0 ? 'advertencia' : undefined,
      }),
      false,
    ),
    [filtered]);

  /* ---------- Tabla de historial (Adelantados / Realizados) ----------
     Mismo DataTable del kit con otras columnas: antes era una lista maquetada
     a mano con su propio encabezado, agrupado y subtotales. */
  const columnasHistorial: ColumnSpec<PagoEjecutadoHistorial>[] = [
    {
      ...COL_FECHA, id: 'fecha', header: 'FECHA',
      cell: (h) => {
        const dias = diasDesdeHoy(h.fecha);
        return celdaFecha(h.fecha, dias > 0
          ? <span className="av2-tabla-texto">impacta en {dias} d</span>
          : null);
      },
    },
    { ...COL_CONTACTO, id: 'contacto_nombre', cell: (h) => celdaContacto(h.contacto_nombre, h.contacto_id) },
    { ...COL_CONCEPTO, id: 'concepto', cell: (h) => <EntityCell icon={conceptoIcon(h.concepto)} title={h.concepto} /> },
    {
      id: 'caja_nombre', header: 'CAJA', width: 'minmax(96px, 1fr)', kind: 'dot',
      cell: (h) => (h.caja_nombre
        ? <DotCell label={h.caja_nombre} dotColor={h.caja_color || undefined} />
        : <span className="av2-tabla-texto">—</span>),
    },
    { ...COL_MONTO, id: 'monto_pesos', cell: (h) => celdaMonto(h.monto_pesos) },
  ];

  const tablaHistorial = (
    <DataTable<PagoEjecutadoHistorial>
      kind="money"
      columns={columnasHistorial}
      groupBy="date"
      showGroupSubtotal
      rows={[]}
      groups={agruparPorDia<PagoEjecutadoHistorial>(
        itemsHistorial, (h) => h.fecha, (h) => parseFloat(h.monto_pesos || '0'),
        // Historial: plata que ya salió. No hay veredicto que dar — la insignia
        // queda neutra con el mes en el acento.
        (rows) => ({ label: plural(rows.length, 'pago', 'pagos') }),
        // realizados: más reciente arriba; adelantados: más próximo arriba.
        estadoFiltro === 'realizados',
      )}
      rowKey={(h) => h.id}
      rowActions={[]}
      loading={loading}
      emptyMessage={estadoFiltro === 'adelantados'
        ? 'No hay pagos adelantados (tildados antes de su fecha de impacto).'
        : 'Todavía no hay pagos ejecutados desde un pago programado.'}
      footer={{
        showing: `Mostrando ${itemsHistorial.length} de ${itemsHistorial.length}`,
        total: {
          label: estadoFiltro === 'adelantados' ? 'TOTAL ADELANTADO' : 'TOTAL REALIZADO',
          value: fmtMoney(totalHistorial),
        },
      }}
    />
  );

  /** Botonera de un pago en las vistas que no son la tabla. `completo` suma
   *  Omitir y Eliminar (tarjetas); sin él quedan sólo Pagar y Editar. */
  const botonesFila = (p: PagoProgramado, completo: boolean) => (
    <>
      <button type="button" className="av2-btn-primario" disabled={executingId === p.id}
        onClick={() => handleEjecutar(p)}>
        {executingId === p.id
          ? <Loader2 size={15} className="animate-spin" aria-hidden />
          : <CheckCircle2 size={15} strokeWidth={2.4} aria-hidden />}
        Pagar
      </button>
      {completo && (
        <button type="button" className="av2-btn-secundario" disabled={omitingId === p.id}
          title="Avanza al siguiente período sin descontar caja" onClick={() => setOmitirPago(p)}>
          <SkipForward size={14} aria-hidden /> Omitir
        </button>
      )}
      <button type="button" className={completo ? 'av2-tabla-accion ml-auto' : 'av2-tabla-accion'}
        title="Editar" aria-label={`Editar el pago de ${p.contacto_nombre || 'contacto'}`}
        onClick={() => openSheet(p)}>
        <Edit2 size={16} strokeWidth={1.8} />
      </button>
      {completo && (
        <button type="button" className="av2-tabla-accion av2-tabla-accion--peligro"
          title="Eliminar" aria-label={`Eliminar el pago de ${p.contacto_nombre || 'contacto'}`}
          onClick={() => setBorrarPago(p)}>
          <Trash2 size={16} strokeWidth={1.8} />
        </button>
      )}
    </>
  );

  /* ---------- Vista tarjetas ---------- */
  const cardsView = (
    <div className="liq-cards">
      {filtered.map(p => {
        const dias = diasDesdeHoy(p.proximo_pago);
        return (
          <div key={p.id} className="av2-panel">
            <div className="av2-panel-head">
              {celdaCheck(p)}
              <EntityCell
                icon={conceptoIcon(p.concepto)}
                tileColor={colorFrecuencia[p.frecuencia]}
                title={p.contacto_nombre || 'Contacto'}
                subtitle={p.concepto}
              />
              <span className="ml-auto">
                <ChipEstado label={FRECUENCIA_LABELS[p.frecuencia]} tone={FRECUENCIA_TONO[p.frecuencia]} />
              </span>
            </div>
            <span className="av2-money av2-tabla-monto">{fmtMoney(p.monto_pesos)}</span>
            <span className="av2-panel-caption">
              {fmtFecha(p.proximo_pago)} ·{' '}
              <span className={dias < 0 ? 'av2-money--bad' : dias <= 7 ? 'liq-warn' : undefined}>
                {estadoCorto(dias)}
              </span>
              {p.caja_nombre ? ` · ${p.caja_nombre}` : ''}
            </span>
            <div className="flex items-center gap-2 mt-3">{botonesFila(p, true)}</div>
          </div>
        );
      })}
    </div>
  );

  /* ---------- Vista calendario ---------- */
  const guidedView = (
    <CalendarView<PagoProgramado>
      items={filtered}
      getId={(p) => p.id}
      getDate={(p) => p.proximo_pago}
      getLabel={(p) => (p.contacto_nombre || '').split(' ')[0]}
      getAmount={(p) => parseFloat(p.monto_pesos)}
      getColor={(p) => colorFrecuencia[p.frecuencia]}
      getTooltip={(p) => `${p.contacto_nombre} · ${p.concepto} · ${fmtMoney(p.monto_pesos)}`}
      onItemClick={(p) => openSheet(p)}
      onItemDrop={(p, newIso) => handleMoverPago(p, newIso)}
      mesesStorageKey="agenda_meses_visibles"
      helperText="Arrastrá un pago a otro día para cambiarle la fecha. Click sobre un pago para editarlo."
      formatMoney={(n) => fmtMoney(n)}
      renderDetailRow={(p) => (
        <div className="flex items-center gap-3 py-2">
          <EntityCell
            icon={conceptoIcon(p.concepto)}
            tileColor={colorFrecuencia[p.frecuencia]}
            title={p.contacto_nombre || 'Contacto'}
            subtitle={`${p.concepto} · ${fmtFecha(p.proximo_pago)}`}
          />
          <span className="av2-money av2-tabla-monto ml-auto">{fmtMoney(p.monto_pesos)}</span>
          {botonesFila(p, false)}
        </div>
      )}
    />
  );

  /* ---------- Piezas de los sheets ---------- */
  const headSheet = (eyebrow: string, titulo: string, bajada: ReactNode, onClose: () => void) => (
    <div className="rs-head">
      <div className="rs-head-fila">
        <span className="rs-eyebrow">{eyebrow}</span>
        <span className="rs-head-icos">
          <button type="button" className="rs-ico-btn" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <h2 className="rs-titulo">{titulo}</h2>
      <p className="rs-parrafo">{bajada}</p>
    </div>
  );

  const pieSheet = (onCancel: () => void, onConfirm: () => void, busy: boolean, label: ReactNode) => (
    <div className="flex items-center gap-2">
      <button type="button" className="rs-btn" onClick={onCancel}>Cancelar</button>
      <button type="button" className="rs-cta flex-1 justify-center" onClick={onConfirm} disabled={busy}>
        {label}
      </button>
    </div>
  );

  /* ---------- Guard de rol (después de TODOS los hooks) ---------- */
  if (!esGestor) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p>
      </div>
    );
  }

  const mesActual = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <>

      {/* El estándar v2 no tiene slot de acciones en la cabecera de módulo, así
          que el disparador del tutorial va acá arriba, dockeado a la derecha. */}
      <div className="flex justify-end mb-1">
        <TourButton tourKey={TOUR_KEY} title="Ver tutorial de Pagos programados" />
      </div>

      {/* Banner de cierre: aparece sólo después de pagar. */}
      {cierre && (
        <div className="liq-cerrados" role="status">
          <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden />
          <span>
            Pagaste {plural(cierre.cantidad, 'pago', 'pagos')} por {fmtMoney(cierre.monto)} recién.
            Ya {cierre.cantidad === 1 ? 'salió' : 'salieron'} de {cierre.caja}.
          </span>
          <Link className="liq-cerrados-link" to={RUTA_COMPROBANTES}>Ver comprobantes</Link>
          <button type="button" className="liq-cerrados-x" title="Cerrar aviso"
            aria-label="Cerrar aviso" onClick={() => setCierre(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <SemanticAbmPage<PagoProgramado>
        moduleKey="pagos-programados"
        eyebrow="Tesorería"
        title="Pagos programados"
        description="Los pagos que se repiten (sueldos, honorarios, alquileres) con su próximo vencimiento. La tabla los agrupa por día: marcá los de un mismo día y cerralos en una sola transferencia."
        hero={{
          etiqueta: `PAGOS PROGRAMADOS · ${mesActual.toUpperCase()}${cajaUnica ? ` · ${cajaUnica.toUpperCase()}` : ''}`,
          frases,
          kpis: heroKpis,
        }}
        accentColor={stats.vencidos > 0 ? 'var(--pl-red)' : undefined}
        searchPlaceholder="Contacto o concepto"
        views={['table', 'cards', 'guided']}
        // El canvas invierte la jerarquía de un ABM común: el primario verde es
        // el pago masivo (el trabajo real de la pantalla) y el alta baja a
        // secundario.
        secondaryAction={{ label: 'Nuevo pago', onClick: () => openSheet() }}
        primaryAction={pagos.length > 0 && !esVistaHistorial
          ? {
              label: seleccion.size > 0 ? `Pagar ${seleccion.size} juntos` : 'Pago masivo',
              icon: Wallet,
              onClick: () => setMasivoOpen(true),
            }
          : undefined}
        selects={selects}
        statusTabs={statusTabs}
        activeStatus={estadoFiltro}
        onStatusChange={(id) => setEstadoFiltro(id as EstadoFiltro)}
        filterSummary={esVistaHistorial
          ? `${plural(itemsHistorial.length, 'pago', 'pagos')} · ${fmtMoney(totalHistorial)}`
          : `${filtered.length} de ${plural(pagos.length, 'pago', 'pagos')}`}
        kind="money"
        columns={columns}
        groupBy="date"
        showGroupSubtotal
        rows={[]}
        groups={grupos}
        rowActions={[] as RowAction<PagoProgramado>[]}
        loading={loading}
        emptyMessage="No hay pagos con esos filtros. Probá limpiar la búsqueda o cambiar de pestaña."
        footer={{
          showing: loading
            ? 'Cargando…'
            : seleccion.size > 0
              ? `${seleccion.size} seleccionados de ${filtered.length}`
              : 'Marcá los pagos que querés cerrar juntos',
          total: { label: 'TOTAL A PAGAR', value: fmtMoney(totalSeleccionado) },
        }}
        // Adelantados/Realizados son otro dataset: se sirve la MISMA tabla del
        // kit con sus columnas, sea cual sea la vista elegida.
        viewSlots={esVistaHistorial
          ? { table: tablaHistorial, cards: tablaHistorial, guided: tablaHistorial }
          : { cards: cardsView, guided: guidedView }}
        search={search}
        onSearchChange={setSearch}
        activeView={vista}
        onViewChange={setVista}
        rowKey={(p) => p.id}
        onRowClick={openSheet}
      />

      {/* Alta / edición del pago programado */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Editar pago · ${editing.contacto_nombre}` : 'Nuevo pago'}
        description="Pago recurrente"
        customHeader={headSheet(
          `Pagos programados · ${editing ? 'Edición' : 'Alta'}`,
          editing ? editing.contacto_nombre || 'Editar pago' : 'Nuevo pago',
          'Un pago programado se repite solo. Definís a quién, cuánto y cada cuánto; el sistema calcula el próximo vencimiento y te avisa cuándo toca.',
          () => setSheetOpen(false),
        )}
        stickyFooter={pieSheet(
          () => setSheetOpen(false), save, saving,
          saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear pago programado',
        )}
      >
        <div className="av2-form-grid">
          <div className="av2-field av2-field--full">
            <span className="av2-field-label">Contacto<span className="av2-field-req" aria-hidden>*</span></span>
            <ModernSelect variant="v2" value={form.contacto_id ? String(form.contacto_id) : ''}
              onChange={(v) => setForm(f => ({ ...f, contacto_id: parseInt(v, 10) }))}
              options={contactoOptions} placeholder="Elegir contacto…" searchable />
          </div>

          <div className="av2-field av2-field--full">
            <span className="av2-field-label">Concepto<span className="av2-field-req" aria-hidden>*</span></span>
            {conceptosLiq.length > 0 ? (
              <ModernSelect
                variant="v2"
                value={form.concepto}
                onChange={(v) => {
                  const def = conceptosLiq.find(c => c.nombre === v);
                  setForm(f => ({
                    ...f,
                    concepto: v,
                    // Al CAMBIAR el combo (acción del user) se recarga la
                    // recomendación frec/día del concepto nuevo. La carga
                    // inicial la hace openSheet con los valores GUARDADOS (no
                    // dispara este onChange), así que abrir a editar conserva
                    // lo elegido; recién al tocar el combo se recalcula.
                    ...(def?.frecuencia_default ? {
                      frecuencia: def.frecuencia_default as FrecuenciaPago,
                      dia_del_mes: def.dia_del_mes_default ?? f.dia_del_mes,
                      dia_semana: def.dia_semana_default ?? f.dia_semana,
                    } : {}),
                  }));
                }}
                options={conceptosLiq.map(c => ({ value: c.nombre, label: c.nombre, color: c.color || undefined }))}
                placeholder="Elegí un concepto…"
                searchable
              />
            ) : (
              <>
                <input value={form.concepto} aria-label="Concepto del pago" style={ESTILO_INPUT}
                  onChange={(e) => setForm(f => ({ ...f, concepto: e.target.value }))} />
                <p className="av2-field-ayuda">
                  Cargá conceptos en Configuración → Tesorería → Conceptos de liquidación.
                </p>
              </>
            )}
          </div>

          <div className="av2-field">
            <span className="av2-field-label">Monto<span className="av2-field-req" aria-hidden>*</span></span>
            <MoneyInput value={form.monto_pesos} onChange={(v) => setForm(f => ({ ...f, monto_pesos: v }))}
              style={{ ...ESTILO_INPUT, fontVariantNumeric: 'tabular-nums' }} />
          </div>

          <div className="av2-field">
            <span className="av2-field-label">Caja</span>
            <ModernSelect variant="v2" value={String(form.caja_id)}
              onChange={(v) => setForm(f => ({ ...f, caja_id: parseInt(v, 10) }))}
              options={[{ value: '0', label: 'Sin caja específica' }, ...cajaOptions]}
              placeholder="Sin caja" searchable />
          </div>

          <div className="av2-field">
            <span className="av2-field-label">Frecuencia</span>
            <ModernSelect variant="v2" value={form.frecuencia}
              onChange={(v) => setForm(f => ({ ...f, frecuencia: v as FrecuenciaPago }))}
              options={frecuenciaOptions} />
          </div>

          <div className="av2-field">
            {form.frecuencia === 'semanal' ? (
              <>
                <span className="av2-field-label">Día de la semana</span>
                <ModernSelect variant="v2" value={String(form.dia_semana ?? 4)}
                  onChange={(v) => setForm(f => ({ ...f, dia_semana: parseInt(v, 10) }))}
                  options={DIAS_SEMANA} />
              </>
            ) : form.frecuencia === 'quincenal' ? (
              <>
                <span className="av2-field-label">Primer día del mes (1-14)</span>
                {/* Quincena de calendario: vence el día A y el A+14. Con A
                    acotado a 1..14 el segundo día existe en todos los meses. */}
                <input type="number" min={1} max={14}
                  value={Math.min(form.dia_del_mes, 14)}
                  aria-label="Primer día de la quincena" style={ESTILO_INPUT}
                  onChange={(e) => setForm(f => ({ ...f, dia_del_mes: Math.min(parseInt(e.target.value, 10) || 1, 14) }))} />
                <span className="av2-field-ayuda">
                  Se paga el {Math.min(form.dia_del_mes, 14)} y el {Math.min(form.dia_del_mes, 14) + 14} de cada mes
                </span>
              </>
            ) : (
              <>
                <span className="av2-field-label">Día del mes</span>
                <input type="number" min={1} max={28} value={form.dia_del_mes}
                  aria-label="Día del mes en que vence" style={ESTILO_INPUT}
                  onChange={(e) => setForm(f => ({ ...f, dia_del_mes: parseInt(e.target.value, 10) || 1 }))} />
              </>
            )}
          </div>

          {/* Fecha inicio / fin ocultas a propósito: la programación arranca en
              el alta (fecha_inicio = hoy) y vive hasta que se la borra
              (fecha_fin = null). El próximo cobro sale de frecuencia + día.
              Siguen en el form state y en la BD, pero no se piden. */}
          <div className="av2-field av2-field--full">
            <span className="av2-field-label">Descripción</span>
            <textarea className="av2-sheet-nota" rows={2} value={form.descripcion}
              aria-label="Descripción del pago"
              onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
        </div>
      </Sheet>

      {/* Ejecutar el pago programado — reemplaza al confirm() nativo */}
      <Sheet
        open={!!ejecutarPago}
        onClose={cerrarEjecutar}
        title="Ejecutar pago programado"
        description={ejecutarPago?.contacto_nombre || ''}
        customHeader={ejecutarPago
          ? headSheet(
              `Pago programado · ${FRECUENCIA_LABELS[ejecutarPago.frecuencia]}`,
              ejecutarPago.contacto_nombre || 'Ejecutar pago',
              `${ejecutarPago.concepto} · vence el ${fmtFecha(ejecutarPago.proximo_pago)} · caja ${ejecutarPago.caja_nombre || 'sin asignar'} · base ${fmtMoney(ejecutarPago.monto_pesos)}`,
              cerrarEjecutar,
            )
          : undefined}
        stickyFooter={pieSheet(
          cerrarEjecutar, confirmarEjecutar, executingId === ejecutarPago?.id,
          <>
            {executingId === ejecutarPago?.id
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            Confirmar pago · {fmtMoney(ejecutarTotal)}
          </>,
        )}
      >
        {ejecutarPago && (
          <div className="av2-form-grid">
            <div className="av2-field av2-field--full">
              <span className="av2-field-label">Monto base del mes</span>
              <MoneyInput value={ejecutarMonto} onChange={setEjecutarMonto}
                style={{ ...ESTILO_INPUT, height: 40, fontSize: 'var(--pl-fs-hero-line)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
              <p className="av2-field-ayuda">Si el monto de este mes es distinto al programado, ajustalo acá.</p>
            </div>

            <div className="av2-field av2-field--full">
              <span className="av2-field-label">Fecha del pago</span>
              <DatePicker value={ejecutarFecha} onChange={setEjecutarFecha} />
              <p className="av2-field-ayuda">Es la fecha con la que impacta en la caja, no la del clic.</p>
            </div>

            <div className="av2-field av2-field--full">
              <span className="av2-field-label">Notas (opcional)</span>
              <textarea className="av2-sheet-nota" rows={2} value={ejecutarNotas}
                placeholder="Detalle adicional del pago…" aria-label="Notas del pago"
                onChange={(e) => setEjecutarNotas(e.target.value)} />
            </div>

            <div className="av2-field av2-field--full">
              <div className="av2-panel-head">
                <Wallet size={18} aria-hidden />
                <span className="av2-panel-titulo">Total a pagar</span>
                <span className="av2-money av2-tabla-monto ml-auto">{fmtMoney(ejecutarTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmModal
        isOpen={!!omitirPago}
        onClose={() => setOmitirPago(null)}
        onConfirm={confirmarOmitir}
        variant="warning"
        title="Omitir este período"
        message={omitirPago
          ? `¿Omitir el pago de "${omitirPago.contacto_nombre}" del ${fmtFecha(omitirPago.proximo_pago)}? Se avanza al siguiente período sin generar gasto ni descontar la caja.`
          : ''}
        confirmText="Omitir período"
        cancelText="Cancelar"
        loading={omitingId === omitirPago?.id}
        icon={<SkipForward className="h-5 w-5" />}
      />

      {/* Antes era un confirm() nativo (control vetado por CLAUDE.md §4). */}
      <ConfirmModal
        isOpen={!!borrarPago}
        onClose={() => setBorrarPago(null)}
        onConfirm={confirmarBorrar}
        variant="danger"
        title="Eliminar el pago programado"
        message={borrarPago
          ? `Se elimina el pago programado de "${borrarPago.contacto_nombre}" (${borrarPago.concepto} · ${fmtMoney(borrarPago.monto_pesos)}). Los pagos ya ejecutados quedan como están.`
          : ''}
        confirmText="Eliminar"
        cancelText="Cancelar"
        loading={borrando}
      />

      <PagoMasivoModal
        open={masivoOpen}
        onClose={() => setMasivoOpen(false)}
        pagos={filtered}
        preseleccion={seleccionados.map(p => p.id)}
        onDone={onMasivoDone}
      />

      <MunifyTour tourKey={TOUR_KEY} steps={TOUR_STEPS_LIQ} />
    </>
  );
}
