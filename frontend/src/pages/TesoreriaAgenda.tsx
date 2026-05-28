import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Loader2, Calendar,
  Home, Briefcase, Wallet, Sparkles, Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ABMPage, ABMSheetFooter, ABMTable, ABMTableAction, renderGroupDayLabel, renderGroupSubtotal } from '../components/ui/ABMPage';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';

const TOUR_STEPS_LIQ = [
  {
    target: '[data-tour="liq-kpis"]',
    content: 'Resumen rápido: cuántas liquidaciones tenés activas, próximos vencimientos y masa salarial total.',
    title: 'Resumen de Liquidaciones',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
  {
    target: '[data-tour="liq-nueva"]',
    content: 'Creás una liquidación recurrente para un empleado: monto base, frecuencia (mensual/quincenal), día de pago y caja. En cada card después aparece el botón "Pagar" verde para ejecutar el pago con monto editable y premios aplicables (presentismo, trabajo extra).',
    title: 'Nueva liquidación + ejecución',
    placement: 'bottom' as const,
  },
];
import type { KpiSpec } from '../components/ui/KpiCard';
import { StatusPill } from '../components/ui/StatusPill';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { Sheet } from '../components/ui/Sheet';
import { conceptoIcon } from '../lib/conceptoIcons';
import { contactoIconByTipo, TIPO_CONTACTO_COLORS } from '../lib/contactoIcons';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { MoneyInput } from '../components/ui/MoneyInput';
import { CalendarView } from '../components/ui/CalendarView';
import { agendaPagosApi, contactosApi, cajasApi, premiosApi } from '../lib/api';
import type { PagoProgramado, Contacto, Caja, FrecuenciaPago, Premio, PagoEjecutadoHistorial } from '../types';

const FRECUENCIA_LABELS: Record<FrecuenciaPago, string> = {
  semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
  bimestral: 'Bimestral', trimestral: 'Trimestral', anual: 'Anual',
};

const FRECUENCIA_COLORS: Record<FrecuenciaPago, string> = {
  semanal: '#ef4444', quincenal: '#f59e0b', mensual: '#3b82f6',
  bimestral: '#8b5cf6', trimestral: '#06b6d4', anual: '#10b981',
};

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function diasDesdeHoy(fecha: string): number {
  // Parsear la fecha como LOCAL (YYYY-MM-DD), no UTC. Si usamos new Date(string)
  // y el string viene como "2026-06-01", JS lo interpreta como UTC midnight y
  // en zonas tipo AR (-03) el dia local termina siendo 31/05, sesgando el calculo.
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const m = (fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m
    ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
    : new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function TesoreriaAgenda() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [pagos, setPagos] = useState<PagoProgramado[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<number | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [contactoFiltro, setContactoFiltro] = useState<string>('');
  const [cajaFiltro, setCajaFiltro] = useState<string>('');
  const [frecuenciaFiltro, setFrecuenciaFiltro] = useState<FrecuenciaPago | ''>('');
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'urgentes' | 'mes' | 'vencidos' | 'realizados'>('todos');
  const [historial, setHistorial] = useState<PagoEjecutadoHistorial[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PagoProgramado | null>(null);

  // Sheet "Ejecutar pago" — reemplaza al confirm() nativo.
  // Permite al user ajustar el monto del mes (varia por persona/mes) y
  // marcar premios del catalogo que se aplican (presentismo, etc.).
  const [premios, setPremios] = useState<Premio[]>([]);
  const [ejecutarPago, setEjecutarPago] = useState<PagoProgramado | null>(null);
  const [ejecutarMonto, setEjecutarMonto] = useState<string>('');
  const [ejecutarFecha, setEjecutarFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  // Map<premio_id, monto override> — null o '' = usa el monto del catalogo.
  // Si el premio no esta en el map, no esta seleccionado.
  const [ejecutarPremiosSel, setEjecutarPremiosSel] = useState<Map<number, string>>(new Map());
  const [ejecutarNotas, setEjecutarNotas] = useState<string>('');
  // Paginación client-side (50 items por página)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [form, setForm] = useState({
    contacto_id: 0, caja_id: 0, concepto: 'Sueldo mensual', descripcion: '',
    monto_pesos: '', forma_pago: 'transferencia', frecuencia: 'mensual' as FrecuenciaPago,
    dia_del_mes: 5, fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: '',
    premios_default: [] as number[],
  });
  const [saving, setSaving] = useState(false);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, c, cj, pr] = await Promise.all([
        agendaPagosApi.list({ activo: true }),
        contactosApi.list({ activo: true, limit: 5000 }),
        cajasApi.list({ activo: true, include_saldos: true }),
        premiosApi.list({ activo: true }).catch(() => ({ data: [] as Premio[] })),
      ]);
      setPagos(p.data || []);
      setContactos(c.data || []);
      setCajas(cj.data || []);
      setPremios(pr.data || []);
    } catch { toast.error('Error cargando agenda'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  // Filtros aplicados
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pagos.filter(p => {
      if (contactoFiltro && String(p.contacto_id) !== contactoFiltro) return false;
      if (cajaFiltro && String(p.caja_id || '') !== cajaFiltro) return false;
      if (frecuenciaFiltro && p.frecuencia !== frecuenciaFiltro) return false;
      if (s) {
        const hay = (p.concepto || '').toLowerCase().includes(s)
          || (p.contacto_nombre || '').toLowerCase().includes(s);
        if (!hay) return false;
      }
      const dias = diasDesdeHoy(p.proximo_pago);
      if (estadoFiltro === 'vencidos' && dias >= 0) return false;
      if (estadoFiltro === 'urgentes' && (dias < 0 || dias > 7)) return false;
      if (estadoFiltro === 'mes' && (dias < 0 || dias > 30)) return false;
      return true;
    }).sort((a, b) => a.proximo_pago.localeCompare(b.proximo_pago));
  }, [pagos, search, contactoFiltro, cajaFiltro, frecuenciaFiltro, estadoFiltro]);

  const paginatedFiltered = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) return filtered.slice(0, pageSize);
    return filtered.slice((page - 1) * pageSize, page * pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [filtered.length]);

  const stats = useMemo(() => {
    let pendientes7 = 0, total7 = 0, total30 = 0, vencidos = 0;
    for (const p of pagos) {
      const d = diasDesdeHoy(p.proximo_pago);
      if (d < 0) vencidos++;
      if (d >= 0 && d <= 7) { pendientes7++; total7 += parseFloat(p.monto_pesos); }
      if (d >= 0 && d <= 30) total30 += parseFloat(p.monto_pesos);
    }
    return { pendientes7, total7, total30, vencidos };
  }, [pagos]);

  // Mover un pago a otra fecha via drag&drop -> actualiza proximo_pago en el backend
  const handleMoverPago = async (pago: PagoProgramado, nuevaFechaISO: string) => {
    const dia = parseInt(nuevaFechaISO.slice(8, 10), 10);
    try {
      await agendaPagosApi.update(pago.id, { proximo_pago: nuevaFechaISO, dia_del_mes: dia });
      toast.success('Pago movido');
      fetchAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error moviendo');
    }
  };

  const openSheet = (p: PagoProgramado | null = null) => {
    if (p) {
      setEditing(p);
      setForm({
        contacto_id: p.contacto_id,
        caja_id: p.caja_id || 0,
        concepto: p.concepto, descripcion: p.descripcion || '',
        monto_pesos: String(p.monto_pesos), forma_pago: p.forma_pago,
        frecuencia: p.frecuencia, dia_del_mes: p.dia_del_mes,
        fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin || '',
        premios_default: (p.premios_default as number[] | null) || [],
      });
    } else {
      setEditing(null);
      setForm({
        contacto_id: 0, caja_id: 0, concepto: 'Sueldo mensual', descripcion: '',
        monto_pesos: '', forma_pago: 'transferencia', frecuencia: 'mensual',
        dia_del_mes: 5, fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: '',
        premios_default: [],
      });
    }
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.contacto_id) return toast.error('Elegí un contacto');
    if (!form.concepto.trim()) return toast.error('Falta concepto');
    if (!form.monto_pesos || parseFloat(form.monto_pesos) <= 0) return toast.error('Monto invalido');
    setSaving(true);
    try {
      const payload = {
        contacto_id: form.contacto_id,
        caja_id: form.caja_id || null,
        concepto: form.concepto.trim(), descripcion: form.descripcion.trim() || null,
        monto_pesos: parseFloat(form.monto_pesos), forma_pago: form.forma_pago,
        frecuencia: form.frecuencia, dia_del_mes: form.dia_del_mes,
        fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin || null,
        // Premios se manejan como liquidaciones aparte; no van junto al sueldo.
        premios_default: [],
      };
      if (editing) await agendaPagosApi.update(editing.id, payload);
      else await agendaPagosApi.create(payload);
      toast.success(editing ? 'Pago actualizado' : 'Pago programado creado');
      setSheetOpen(false); fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error guardando'); } finally { setSaving(false); }
  };

  // Abre el Sheet para ejecutar. NO ejecuta directo — el user puede
  // ajustar monto del mes y aplicar premios antes de confirmar.
  const handleEjecutar = (p: PagoProgramado) => {
    setEjecutarPago(p);
    setEjecutarMonto(p.monto_pesos);
    setEjecutarFecha(new Date().toISOString().slice(0, 10));
    // Premios se manejan como liquidaciones aparte (presentismo semanal,
    // incentivo mitad de mes). Ya no vienen pre-tildados acá.
    setEjecutarPremiosSel(new Map());
    setEjecutarNotas('');
  };

  const cerrarEjecutar = () => {
    setEjecutarPago(null);
    setEjecutarMonto('');
    setEjecutarPremiosSel(new Map());
    setEjecutarNotas('');
  };

  // Total dinamico del Sheet de ejecutar = monto base + premios marcados
  // (con override si se edito el monto del premio).
  const ejecutarTotal = useMemo(() => {
    const base = parseFloat(ejecutarMonto || '0') || 0;
    let extras = 0;
    premios.forEach(p => {
      if (ejecutarPremiosSel.has(p.id)) {
        const override = ejecutarPremiosSel.get(p.id) || '';
        const monto = override !== '' ? parseFloat(override) : parseFloat(p.monto || '0');
        extras += monto || 0;
      }
    });
    return base + extras;
  }, [ejecutarMonto, ejecutarPremiosSel, premios]);

  const confirmarEjecutar = async () => {
    if (!ejecutarPago) return;
    const baseNum = parseFloat(ejecutarMonto || '0');
    if (!baseNum || baseNum <= 0) {
      toast.error('Monto inválido');
      return;
    }
    setExecutingId(ejecutarPago.id);
    try {
      // Armar premios_aplicados con override de monto cuando corresponda.
      const premiosAplicados = Array.from(ejecutarPremiosSel.entries()).map(([premio_id, override]) => {
        const item: { premio_id: number; monto?: string } = { premio_id };
        if (override && override !== '') item.monto = override;
        return item;
      });
      const res = await agendaPagosApi.ejecutar(ejecutarPago.id, {
        fecha_pago: ejecutarFecha,
        monto_base: ejecutarMonto,
        premios_aplicados: premiosAplicados,
        notas: ejecutarNotas.trim() || undefined,
      });
      toast.success(`Pago de ${fmtMoney(res.data.monto_total)} ejecutado`);
      cerrarEjecutar();
      fetchAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error ejecutando');
    } finally {
      setExecutingId(null);
    }
  };

  const handleDelete = async (p: PagoProgramado) => {
    if (!confirm(`¿Eliminar el pago programado de ${p.contacto_nombre}?`)) return;
    try { await agendaPagosApi.delete(p.id); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // ==================== Opciones combos ====================
  const contactoOptions = useMemo(() => ([
    { value: '', label: 'Contactos' },
    ...contactos.map(c => ({ value: String(c.id), label: `${c.nombre} ${c.apellido || ''}`.trim() })),
  ]), [contactos]);

  const cajaOptions = useMemo(() => ([
    { value: '', label: 'Cajas' },
    ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
  ]), [cajas]);

  const cajaFormOptions = useMemo(() => ([
    { value: '0', label: 'Sin caja específica' },
    ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
  ]), [cajas]);

  const frecuenciaOptions = useMemo(() => ([
    { value: '', label: 'Frecuencias' },
    ...(Object.keys(FRECUENCIA_LABELS) as FrecuenciaPago[]).map(f => ({
      value: f, label: FRECUENCIA_LABELS[f], color: FRECUENCIA_COLORS[f],
    })),
  ]), []);

  const FRECUENCIA_OPTS_FORM = (Object.keys(FRECUENCIA_LABELS) as FrecuenciaPago[]).map(f => ({
    value: f, label: FRECUENCIA_LABELS[f],
  }));

  // ==================== Filtros header ====================
  const ESTADO_CHIPS: { value: typeof estadoFiltro; label: string; color: string }[] = [
    { value: 'todos', label: `Todos (${pagos.length})`, color: theme.primary },
    { value: 'vencidos', label: `Vencidos (${stats.vencidos})`, color: '#ef4444' },
    { value: 'urgentes', label: `Próx. 7d (${stats.pendientes7})`, color: '#f59e0b' },
    { value: 'mes', label: 'Próx. 30d', color: '#3b82f6' },
    { value: 'realizados', label: `Realizados${historial.length > 0 ? ` (${historial.length})` : ''}`, color: '#10b981' },
  ];

  // Fetch historial cuando se elige "Realizados" (lazy, no en cada render)
  useEffect(() => {
    if (estadoFiltro !== 'realizados') return;
    setLoadingHistorial(true);
    agendaPagosApi.historial({ limit: 500 })
      .then(r => setHistorial(r.data || []))
      .catch(() => toast.error('Error cargando historial'))
      .finally(() => setLoadingHistorial(false));
  }, [estadoFiltro]);

  const secondaryFilters = (
    <div className="flex flex-wrap items-center gap-2 agenda-filters-row">
      <style>{`
        .agenda-filters-row .ts-fitem button,
        .agenda-filters-row .ts-fitem > div > button {
          height: 40px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          font-size: 0.875rem !important;
          border-radius: 0.75rem !important;
        }
      `}</style>
      <div className="min-w-[200px] flex-shrink-0 ts-fitem">
        <ModernSelect value={contactoFiltro} onChange={setContactoFiltro}
          options={contactoOptions} placeholder="Todos los contactos" searchable />
      </div>
      <div className="min-w-[170px] flex-shrink-0 ts-fitem">
        <ModernSelect value={cajaFiltro} onChange={setCajaFiltro}
          options={cajaOptions} placeholder="Todas las cajas" searchable />
      </div>
      <div className="min-w-[180px] flex-shrink-0 ts-fitem">
        <ModernSelect value={frecuenciaFiltro} onChange={(v) => setFrecuenciaFiltro(v as FrecuenciaPago | '')}
          options={frecuenciaOptions} placeholder="Todas las frecuencias" searchable />
      </div>
      <div className="inline-flex items-center gap-1.5 ml-auto flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {ESTADO_CHIPS.map(c => (
          <button key={c.value} onClick={() => setEstadoFiltro(c.value)}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"
            style={{
              backgroundColor: estadoFiltro === c.value ? c.color : `${c.color}15`,
              color: estadoFiltro === c.value ? '#fff' : c.color,
              border: `1px solid ${c.color}40`,
            }}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );

  // Map contacto_id -> tipo (para ícono uniforme por tipo de contacto)
  const contactosMap = useMemo(() => {
    const m = new Map<number, Contacto>();
    contactos.forEach(c => m.set(c.id, c));
    return m;
  }, [contactos]);

  // ==================== Vista TABLA (ABMTable canónica) ====================
  const tableView = (
    <ABMTable<PagoProgramado>
      data={paginatedFiltered}
      keyExtractor={(p) => p.id}
      onRowClick={(p) => openSheet(p)}
      groupBy={{
        sortKey: 'proximo_pago',
        getKey: (p) => p.proximo_pago.slice(0, 10),
        renderLabel: (key, items) => renderGroupDayLabel({
          isoDate: key,
          count: items.length,
          itemLabel: { singular: 'pago', plural: 'pagos' },
          themeCard: theme.card,
          themeBorder: theme.border,
          themeText: theme.text,
          themeTextSecondary: theme.textSecondary,
          themePrimary: theme.primary,
        }),
        renderSubtotal: (_key, items) => renderGroupSubtotal({
          amount: items.reduce((s, p) => s + parseFloat(p.monto_pesos || '0'), 0),
          themeText: theme.text,
          themeTextSecondary: theme.textSecondary,
        }),
      }}
      columns={[
        {
          key: 'proximo_pago',
          header: 'Próximo pago',
          sortValue: (p) => p.proximo_pago,
          render: (p) => {
            const dias = diasDesdeHoy(p.proximo_pago);
            const urgente = dias <= 3;
            return (
              <div className="flex flex-col">
                <span className="font-medium whitespace-nowrap" style={{ color: theme.text }}>
                  {new Date(p.proximo_pago).toLocaleDateString('es-AR')}
                </span>
                <span className="text-[10px] font-semibold"
                  style={{ color: urgente ? '#ef4444' : dias <= 7 ? '#f59e0b' : theme.textSecondary }}>
                  {dias < 0 ? `Vencido (${Math.abs(dias)}d)` : dias === 0 ? 'HOY' : `en ${dias}d`}
                </span>
              </div>
            );
          },
        },
        {
          key: 'contacto_nombre',
          header: 'Contacto',
          sortValue: (p) => p.contacto_nombre || '',
          render: (p) => {
            const c = contactosMap.get(p.contacto_id);
            const tipo = c?.tipo || 'otro';
            const Icon = contactoIconByTipo(tipo);
            const color = TIPO_CONTACTO_COLORS[tipo] || theme.primary;
            return (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
                  <Icon className="h-3 w-3" style={{ color }} />
                </span>
                <span className="font-medium truncate max-w-[200px]" style={{ color: theme.text }}>{p.contacto_nombre || 'Contacto'}</span>
              </span>
            );
          },
        },
        {
          key: 'concepto',
          header: 'Concepto',
          sortValue: (p) => p.concepto,
          render: (p) => {
            const Icon = conceptoIcon(p.concepto);
            const color = FRECUENCIA_COLORS[p.frecuencia];
            return (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
                  <Icon className="h-3 w-3" style={{ color }} />
                </span>
                <span className="font-medium" style={{ color: theme.text }}>{p.concepto}</span>
              </span>
            );
          },
        },
        {
          key: 'monto_pesos',
          header: 'Monto',
          sortValue: (p) => parseFloat(p.monto_pesos),
          render: (p) => <span className="font-bold tabular-nums">{fmtMoney(p.monto_pesos)}</span>,
        },
        {
          key: 'frecuencia',
          header: 'Frec.',
          sortValue: (p) => p.frecuencia,
          render: (p) => <StatusPill label={FRECUENCIA_LABELS[p.frecuencia]} color={FRECUENCIA_COLORS[p.frecuencia]} size="xs" />,
        },
        {
          key: 'caja_nombre',
          header: 'Caja',
          sortValue: (p) => p.caja_nombre || '',
          render: (p) => p.caja_nombre
            ? <StatusPill label={p.caja_nombre} color={theme.primary} size="xs" showDot={false} />
            : <span className="opacity-50 text-xs">—</span>,
        },
      ]}
      actions={(p) => (
        <>
          <PrimaryButton
            variant="success"
            size="sm"
            disabled={executingId === p.id}
            onClick={(e) => { e.stopPropagation(); handleEjecutar(p); }}
            title="Pagar ahora"
            icon={executingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          >
            Pagar
          </PrimaryButton>
          <ABMTableAction title="Editar" onClick={() => openSheet(p)} variant="primary" icon={<Edit2 className="h-4 w-4" />} />
          <ABMTableAction title="Eliminar" onClick={() => handleDelete(p)} variant="danger" icon={<Trash2 className="h-4 w-4" />} />
        </>
      )}
    />
  );

  // ==================== Vista CALENDARIO (guiada) — usa CalendarView reutilizable ====================
  const guidedView = (
    <CalendarView<PagoProgramado>
      items={filtered}
      getId={(p) => p.id}
      getDate={(p) => p.proximo_pago}
      getLabel={(p) => (p.contacto_nombre || '').split(' ')[0]}
      getAmount={(p) => parseFloat(p.monto_pesos)}
      getColor={(p) => FRECUENCIA_COLORS[p.frecuencia]}
      getTooltip={(p) => `${p.contacto_nombre} · ${p.concepto} · ${fmtMoney(p.monto_pesos)}`}
      onItemClick={(p) => openSheet(p)}
      onItemDrop={(p, newIso) => handleMoverPago(p, newIso)}
      mesesStorageKey="agenda_meses_visibles"
      helperText="💡 Arrastrá un pago a otro día para cambiarle la fecha. Click sobre un pago para editar."
      formatMoney={(n) => fmtMoney(n)}
      renderDetailRow={(p) => (
        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${FRECUENCIA_COLORS[p.frecuencia]}20` }}>
            <span className="text-xs font-bold" style={{ color: FRECUENCIA_COLORS[p.frecuencia] }}>{new Date(p.proximo_pago).getDate()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{p.contacto_nombre}</p>
            <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
              {p.concepto} · {new Date(p.proximo_pago).toLocaleDateString('es-AR')}
            </p>
          </div>
          <span className="font-bold tabular-nums whitespace-nowrap" style={{ color: theme.text }}>{fmtMoney(p.monto_pesos)}</span>
          <button onClick={() => handleEjecutar(p)} className="px-2 py-1 rounded-md text-[11px] font-semibold text-white" style={{ backgroundColor: '#10b981' }}>
            Pagar
          </button>
          <button onClick={() => openSheet(p)} className="p-1.5 rounded" style={{ color: theme.primary }}><Edit2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    />
  );


  // ==================== Vista CARDS (children) ====================
  // ==================== Vista HISTORIAL (pagos ya realizados) ====================
  // Solo activa cuando estadoFiltro === 'realizados'. Lista los Gastos
  // generados por la ejecucion de pagos programados, ordenados por fecha desc.
  const historialView = (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: theme.backgroundSecondary, borderBottom: `1px solid ${theme.border}` }}
      >
        <span className="text-sm font-bold inline-flex items-center gap-2" style={{ color: theme.text }}>
          <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
          Pagos realizados (últimos 90 días)
        </span>
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {historial.length} {historial.length === 1 ? 'pago' : 'pagos'} · {fmtMoney(historial.reduce((s, h) => s + parseFloat(h.monto_pesos || '0'), 0))}
        </span>
      </div>
      {loadingHistorial ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : historial.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: theme.textSecondary }}>
          Todavía no hay pagos ejecutados desde una liquidación.
        </div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          {historial.map((h, i) => {
            const fecha = new Date(h.fecha);
            const fechaFmt = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
            return (
              <div
                key={h.id}
                className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderTop: i > 0 ? `1px solid ${theme.border}` : undefined }}
              >
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md whitespace-nowrap flex-shrink-0"
                  style={{ backgroundColor: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}
                >
                  {fechaFmt}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                    {h.contacto_nombre || '—'}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                    {h.concepto}
                    {h.caja_nombre && ` · ${h.caja_nombre}`}
                    {h.pp_frecuencia && ` · ${h.pp_frecuencia}`}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-sm flex-shrink-0" style={{ color: theme.text }}>
                  {fmtMoney(h.monto_pesos)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const cardsView = paginatedFiltered.map(p => {
    const dias = diasDesdeHoy(p.proximo_pago);
    const urgente = dias <= 3;
    return (
      <div key={p.id} className="rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate" style={{ color: theme.text }}>{p.contacto_nombre}</p>
            <p className="text-xs truncate" style={{ color: theme.textSecondary }}>{p.concepto}</p>
          </div>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: `${FRECUENCIA_COLORS[p.frecuencia]}20`, color: FRECUENCIA_COLORS[p.frecuencia] }}>
            {FRECUENCIA_LABELS[p.frecuencia]}
          </span>
        </div>
        <p className="text-xl font-bold tabular-nums mb-2" style={{ color: theme.text }}>{fmtMoney(p.monto_pesos)}</p>
        <div className="flex items-center justify-between text-xs mb-3" style={{ color: theme.textSecondary }}>
          <span>{new Date(p.proximo_pago).toLocaleDateString('es-AR')}</span>
          <span className="font-semibold" style={{ color: urgente ? '#ef4444' : dias <= 7 ? '#f59e0b' : theme.textSecondary }}>
            {dias < 0 ? `Vencido (${Math.abs(dias)}d)` : dias === 0 ? 'HOY' : `en ${dias}d`}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleEjecutar(p)} disabled={executingId === p.id}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white inline-flex items-center justify-center gap-1"
            style={{ backgroundColor: '#10b981', opacity: executingId === p.id ? 0.5 : 1 }}>
            {executingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Pagar
          </button>
          <button onClick={() => openSheet(p)} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: theme.primary }}><Edit2 className="h-4 w-4" /></button>
          <button onClick={() => handleDelete(p)} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: '#ef4444' }}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    );
  });

  return (
    <>
      <TesoreriaHint titulo="Liquidaciones de sueldo" storageKey="agenda">
        Programá pagos <b>recurrentes</b> (sueldos, honorarios, alquileres). El sistema te
        recuerda cuándo toca pagar y con un click crea el gasto + descuenta la caja correspondiente.
      </TesoreriaHint>

      <ABMPage
        title="Liquidaciones"
        icon={<CalendarClock className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        buttonLabel="Nuevo Pago Programado"
        onAdd={() => openSheet()}
        tourAnchors={{ kpis: 'liq-kpis', addButton: 'liq-nueva' }}
        headerActions={<TourButton tourKey="sueldos-liquidaciones" title="Ver tutorial de Liquidaciones" />}
        searchPlaceholder="Buscar por concepto o contacto..."
        searchValue={search}
        onSearchChange={setSearch}
        kpis={[
          { label: 'Vencidos', value: String(stats.vencidos), footnote: 'atrasados', color: '#dc2626', icon: AlertCircle },
          { label: 'Próx. 7 días', value: String(stats.pendientes7), footnote: fmtMoney(stats.total7), color: '#ef4444', icon: AlertCircle },
          { label: 'Próx. 30 días', value: fmtMoney(stats.total30), footnote: `${pagos.length} pagos activos`, color: '#3b82f6', icon: Calendar },
          { label: 'Total activos', value: String(pagos.length), footnote: 'programados', color: '#10b981', icon: CalendarClock },
        ] as KpiSpec[]}
        secondaryFilters={secondaryFilters}
        pagination={{
          page,
          pageSize,
          totalItems: filtered.length,
          onPageChange: setPage,
          onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
        }}
        loading={loading || (estadoFiltro === 'realizados' && loadingHistorial)}
        isEmpty={estadoFiltro === 'realizados' ? historial.length === 0 : filtered.length === 0}
        emptyMessage={estadoFiltro === 'realizados'
          ? 'Todavía no hay pagos ejecutados desde una liquidación.'
          : 'No hay pagos con esos filtros.'}
        defaultViewMode="table"
        viewStorageKey="agenda_view"
        tableView={estadoFiltro === 'realizados' ? historialView : tableView}
        guidedView={estadoFiltro === 'realizados' ? historialView : guidedView}
        sheetOpen={sheetOpen}
        sheetTitle={editing ? `Editar pago · ${editing.contacto_nombre}` : 'Nuevo pago programado'}
        sheetContent={
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Contacto *</label>
              <ModernSelect value={form.contacto_id ? String(form.contacto_id) : ''}
                onChange={(v) => setForm(f => ({ ...f, contacto_id: parseInt(v, 10) }))}
                options={contactoOptions.filter(o => o.value !== '')} placeholder="Elegir contacto..." searchable />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Concepto *</label>
              <input value={form.concepto} onChange={(e) => setForm(f => ({ ...f, concepto: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Monto *</label>
                <MoneyInput value={form.monto_pesos} onChange={(v) => setForm(f => ({ ...f, monto_pesos: v }))}
                  className="w-full px-3 py-2 rounded-lg text-sm tabular-nums"
                  style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Caja</label>
                <ModernSelect value={String(form.caja_id)}
                  onChange={(v) => setForm(f => ({ ...f, caja_id: parseInt(v, 10) }))}
                  options={cajaFormOptions} placeholder="Sin caja" searchable />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Frecuencia</label>
                <ModernSelect value={form.frecuencia}
                  onChange={(v) => setForm(f => ({ ...f, frecuencia: v as FrecuenciaPago }))}
                  options={FRECUENCIA_OPTS_FORM} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Día del mes</label>
                <input type="number" min={1} max={28} value={form.dia_del_mes}
                  onChange={(e) => setForm(f => ({ ...f, dia_del_mes: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Fecha inicio</label>
                <DatePicker value={form.fecha_inicio} onChange={(v) => setForm(f => ({ ...f, fecha_inicio: v }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Fecha fin (opcional)</label>
                <DatePicker value={form.fecha_fin} onChange={(v) => setForm(f => ({ ...f, fecha_fin: v }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción</label>
              <textarea value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }} />
            </div>

            {/* Premios se manejan como pagos programados independientes
                (presentismo semanal, incentivo mitad de mes). Ya no se suman
                acá a la liquidacion mensual del sueldo. */}
          </div>
        }
        sheetFooter={<ABMSheetFooter onCancel={() => setSheetOpen(false)} onSave={save} saving={saving} />}
        onSheetClose={() => setSheetOpen(false)}
      >
        {estadoFiltro === 'realizados' ? <div className="col-span-full">{historialView}</div> : cardsView}
      </ABMPage>

      {/* Sheet "Ejecutar pago" — reemplaza al confirm() nativo. */}
      <Sheet
        open={!!ejecutarPago}
        onClose={cerrarEjecutar}
        title="Ejecutar pago programado"
        description={ejecutarPago?.contacto_nombre || ''}
        stickyFooter={
          <ABMSheetFooter
            onCancel={cerrarEjecutar}
            onSave={confirmarEjecutar}
            saving={executingId === ejecutarPago?.id}
            saveLabel={`Confirmar pago · ${fmtMoney(ejecutarTotal)}`}
          />
        }
      >
        {ejecutarPago && (
          <div className="space-y-4">
            {/* Resumen del programado */}
            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <p className="text-xs uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                Recordatorio del programado
              </p>
              <p className="text-sm font-semibold" style={{ color: theme.text }}>
                {ejecutarPago.concepto} · {ejecutarPago.contacto_nombre}
              </p>
              <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                Vencimiento: {ejecutarPago.proximo_pago} ·
                Caja: {ejecutarPago.caja_nombre || '—'} ·
                Base: {fmtMoney(ejecutarPago.monto_pesos)}
              </p>
            </div>

            {/* Monto base editable */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
                Monto base del mes
              </label>
              <MoneyInput
                value={ejecutarMonto}
                onChange={setEjecutarMonto}
                className="w-full px-3 py-2 rounded-xl text-lg font-bold tabular-nums"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              />
              <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                Si el monto de este mes es distinto al programado, ajustalo acá.
              </p>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
                Fecha del pago
              </label>
              <DatePicker value={ejecutarFecha} onChange={setEjecutarFecha} />
            </div>

            {/* Premios se manejan como liquidaciones aparte (presentismo
                semanal, incentivo mitad de mes). Ya no se eligen acá al
                pagar el sueldo. */}

            {/* Notas */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
                Notas (opcional)
              </label>
              <textarea
                value={ejecutarNotas}
                onChange={(e) => setEjecutarNotas(e.target.value)}
                rows={2}
                placeholder="Detalle adicional del pago..."
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>

            {/* Total final */}
            <div
              className="rounded-xl p-3 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${theme.primary}15, ${theme.primary}05)`, border: `1px solid ${theme.primary}40` }}
            >
              <div>
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
                  Total a pagar
                </p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: theme.primary }}>
                  {fmtMoney(ejecutarTotal)}
                </p>
              </div>
              <Wallet className="h-8 w-8" style={{ color: theme.primary }} />
            </div>
          </div>
        )}
      </Sheet>

      <MunifyTour tourKey="sueldos-liquidaciones" steps={TOUR_STEPS_LIQ} />
    </>
  );
}

