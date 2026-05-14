import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Loader2, Calendar,
  ChevronLeft, ChevronRight, Home, Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { ABMPage, ABMSheetFooter } from '../components/ui/ABMPage';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { agendaPagosApi, contactosApi, cajasApi } from '../lib/api';
import type { PagoProgramado, Contacto, Caja, FrecuenciaPago } from '../types';

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
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha); d.setHours(0, 0, 0, 0);
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
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'urgentes' | 'mes' | 'vencidos'>('todos');

  // Mes para el calendario (vista guiada)
  const today = new Date();
  const [calMes, setCalMes] = useState<number>(today.getMonth());
  const [calAnio, setCalAnio] = useState<number>(today.getFullYear());
  // Cantidad de meses visibles simultaneamente (1/2/3/4)
  const [mesesVisibles, setMesesVisibles] = useState<1 | 2 | 3 | 4>(() => {
    if (typeof window === 'undefined') return 1;
    const saved = parseInt(localStorage.getItem('agenda_meses_visibles') || '1', 10);
    return ([1, 2, 3, 4].includes(saved) ? saved : 1) as 1 | 2 | 3 | 4;
  });
  // Drag & drop: pago siendo arrastrado
  const [dragPagoId, setDragPagoId] = useState<number | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PagoProgramado | null>(null);
  const [form, setForm] = useState({
    contacto_id: 0, caja_id: 0, concepto: 'Sueldo mensual', descripcion: '',
    monto_pesos: '', forma_pago: 'transferencia', frecuencia: 'mensual' as FrecuenciaPago,
    dia_del_mes: 5, fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: '',
  });
  const [saving, setSaving] = useState(false);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, c, cj] = await Promise.all([
        agendaPagosApi.list({ activo: true }),
        contactosApi.list({ activo: true, limit: 500 }),
        cajasApi.list({ activo: true, include_saldos: true }),
      ]);
      setPagos(p.data || []);
      setContactos(c.data || []);
      setCajas(cj.data || []);
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

  // Pagos agrupados por fecha completa (yyyy-mm-dd) para multi-mes
  const pagosPorFecha = useMemo(() => {
    const map = new Map<string, PagoProgramado[]>();
    for (const p of filtered) {
      const key = p.proximo_pago.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [filtered]);

  // Mover un pago a otra fecha via drag&drop -> actualiza proximo_pago en el backend
  const handleDropEnDia = async (anio: number, mes: number, dia: number) => {
    if (dragPagoId == null) return;
    const pago = pagos.find(p => p.id === dragPagoId);
    setDragPagoId(null);
    if (!pago) return;
    const nueva = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (nueva === pago.proximo_pago.slice(0, 10)) return;
    try {
      await agendaPagosApi.update(pago.id, { proximo_pago: nueva, dia_del_mes: dia });
      toast.success('Pago movido');
      fetchAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error moviendo');
    }
  };

  const setMesesVisiblesPersist = (n: 1 | 2 | 3 | 4) => {
    setMesesVisibles(n);
    try { localStorage.setItem('agenda_meses_visibles', String(n)); } catch {}
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
      });
    } else {
      setEditing(null);
      setForm({
        contacto_id: 0, caja_id: 0, concepto: 'Sueldo mensual', descripcion: '',
        monto_pesos: '', forma_pago: 'transferencia', frecuencia: 'mensual',
        dia_del_mes: 5, fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: '',
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
      };
      if (editing) await agendaPagosApi.update(editing.id, payload);
      else await agendaPagosApi.create(payload);
      toast.success(editing ? 'Pago actualizado' : 'Pago programado creado');
      setSheetOpen(false); fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error guardando'); } finally { setSaving(false); }
  };

  const handleEjecutar = async (p: PagoProgramado) => {
    if (!confirm(`¿Ejecutar pago de ${fmtMoney(p.monto_pesos)} a ${p.contacto_nombre}? Se crea el gasto y descuenta la caja.`)) return;
    setExecutingId(p.id);
    try {
      const res = await agendaPagosApi.ejecutar(p.id);
      toast.success(`Gasto #${res.data.gasto_id} creado`);
      fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error ejecutando'); } finally { setExecutingId(null); }
  };

  const handleDelete = async (p: PagoProgramado) => {
    if (!confirm(`¿Eliminar el pago programado de ${p.contacto_nombre}?`)) return;
    try { await agendaPagosApi.delete(p.id); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error'); }
  };

  // ==================== Opciones combos ====================
  const contactoOptions = useMemo(() => ([
    { value: '', label: 'Todos los contactos' },
    ...contactos.map(c => ({ value: String(c.id), label: `${c.nombre} ${c.apellido || ''}`.trim() })),
  ]), [contactos]);

  const cajaOptions = useMemo(() => ([
    { value: '', label: 'Todas las cajas' },
    ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
  ]), [cajas]);

  const cajaFormOptions = useMemo(() => ([
    { value: '0', label: 'Sin caja específica' },
    ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
  ]), [cajas]);

  const frecuenciaOptions = useMemo(() => ([
    { value: '', label: 'Todas las frecuencias' },
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
  ];

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

  // ==================== Vista TABLA ====================
  const tableView = (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Próximo pago</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Contacto</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Concepto</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Monto</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Frec.</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Caja</th>
              <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase w-44 whitespace-nowrap" style={{ color: theme.textSecondary }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const dias = diasDesdeHoy(p.proximo_pago);
              const urgente = dias <= 3;
              return (
                <tr key={p.id} style={{ borderTop: i > 0 ? `1px solid ${theme.border}` : undefined }}>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium whitespace-nowrap" style={{ color: theme.text }}>
                        {new Date(p.proximo_pago).toLocaleDateString('es-AR')}
                      </span>
                      <span className="text-[10px] font-semibold"
                        style={{ color: urgente ? '#ef4444' : dias <= 7 ? '#f59e0b' : theme.textSecondary }}>
                        {dias < 0 ? `Vencido (${Math.abs(dias)}d)` : dias === 0 ? 'HOY' : `en ${dias}d`}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: theme.text }}>{p.contacto_nombre}</td>
                  <td className="px-3 py-2.5" style={{ color: theme.text }}>{p.concepto}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: theme.text }}>{fmtMoney(p.monto_pesos)}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                      style={{ backgroundColor: `${FRECUENCIA_COLORS[p.frecuencia]}20`, color: FRECUENCIA_COLORS[p.frecuencia] }}>
                      {FRECUENCIA_LABELS[p.frecuencia]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.caja_nombre ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
                        {p.caja_nombre}
                      </span>
                    ) : <span className="opacity-50 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => handleEjecutar(p)} disabled={executingId === p.id}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-white"
                        style={{ backgroundColor: '#10b981', opacity: executingId === p.id ? 0.5 : 1 }} title="Pagar ahora">
                        {executingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Pagar
                      </button>
                      <button onClick={() => openSheet(p)} className="p-1.5 rounded hover:scale-110" style={{ color: theme.primary }} title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:scale-110" style={{ color: '#ef4444' }} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ==================== Vista CALENDARIO (guiada) ====================
  const irMesAnterior = () => {
    if (calMes === 0) { setCalMes(11); setCalAnio(a => a - 1); }
    else setCalMes(m => m - 1);
  };
  const irMesSiguiente = () => {
    if (calMes === 11) { setCalMes(0); setCalAnio(a => a + 1); }
    else setCalMes(m => m + 1);
  };
  const primerDiaSemana = new Date(calAnio, calMes, 1).getDay();  // 0 = domingo
  // Calcular los meses a renderizar (calMes/calAnio + mesesVisibles-1 siguientes)
  const mesesAMostrar = useMemo(() => {
    const out: { anio: number; mes: number }[] = [];
    for (let i = 0; i < mesesVisibles; i++) {
      const total = calMes + i;
      out.push({ anio: calAnio + Math.floor(total / 12), mes: total % 12 });
    }
    return out;
  }, [calMes, calAnio, mesesVisibles]);

  // Componente que renderiza UN mes (reusable para multi-mes view)
  const renderMes = (anio: number, mes: number) => {
    const primer = new Date(anio, mes, 1).getDay();
    const diasN = new Date(anio, mes + 1, 0).getDate();
    const off = (primer + 6) % 7;
    return (
      <div key={`${anio}-${mes}`} className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <p className="text-sm font-bold mb-2 text-center" style={{ color: theme.text }}>
          {MESES_LARGO[mes]} <span style={{ color: theme.textSecondary }}>{anio}</span>
        </p>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold uppercase py-1" style={{ color: theme.textSecondary }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: off }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-lg" style={{ minHeight: 72 }} />
          ))}
          {Array.from({ length: diasN }).map((_, i) => {
            const dia = i + 1;
            const fechaKey = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const pagosHoy = pagosPorFecha.get(fechaKey) || [];
            const total = pagosHoy.reduce((s, p) => s + parseFloat(p.monto_pesos), 0);
            const now = new Date();
            const esHoy = (now.getDate() === dia && now.getMonth() === mes && now.getFullYear() === anio);
            const maxLineas = mesesVisibles === 1 ? 3 : mesesVisibles === 2 ? 2 : 1;
            return (
              <div
                key={dia}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.outline = `2px dashed ${theme.primary}`; }}
                onDragLeave={(e) => { e.currentTarget.style.outline = 'none'; }}
                onDrop={(e) => { e.currentTarget.style.outline = 'none'; handleDropEnDia(anio, mes, dia); }}
                className="rounded-lg p-1.5 flex flex-col gap-0.5 transition-all hover:shadow-md"
                style={{
                  backgroundColor: pagosHoy.length > 0 ? `${theme.primary}08` : theme.backgroundSecondary,
                  border: esHoy ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  minHeight: 72,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold" style={{ color: esHoy ? theme.primary : theme.text }}>{dia}</span>
                  {pagosHoy.length > 0 && (
                    <span className="text-[8px] font-bold px-1 rounded" style={{ backgroundColor: theme.primary, color: '#fff' }}>
                      {pagosHoy.length}
                    </span>
                  )}
                </div>
                {/* Mini items con info real (drag handle por item) */}
                <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                  {pagosHoy.slice(0, maxLineas).map(p => {
                    const nombre = (p.contacto_nombre || '').split(' ')[0];
                    return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => { setDragPagoId(p.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => setDragPagoId(null)}
                        onClick={(e) => { e.stopPropagation(); openSheet(p); }}
                        className="rounded px-1 py-0.5 cursor-move truncate"
                        style={{
                          backgroundColor: `${FRECUENCIA_COLORS[p.frecuencia]}25`,
                          borderLeft: `3px solid ${FRECUENCIA_COLORS[p.frecuencia]}`,
                          fontSize: 9,
                          color: theme.text,
                          opacity: dragPagoId === p.id ? 0.4 : 1,
                        }}
                        title={`${p.contacto_nombre} · ${p.concepto} · ${fmtMoney(p.monto_pesos)} · Arrastrá a otro día`}
                      >
                        <div className="font-semibold truncate">{nombre}</div>
                        <div className="tabular-nums truncate" style={{ color: theme.textSecondary, fontSize: 8 }}>
                          {fmtMoney(p.monto_pesos)}
                        </div>
                      </div>
                    );
                  })}
                  {pagosHoy.length > maxLineas && (
                    <div className="text-[8px] text-center font-semibold" style={{ color: theme.primary }}>
                      +{pagosHoy.length - maxLineas} más
                    </div>
                  )}
                </div>
                {/* Total del dia, solo si hay y hay espacio */}
                {pagosHoy.length > 0 && mesesVisibles <= 2 && (
                  <div className="text-[9px] tabular-nums truncate font-semibold border-t pt-0.5" style={{ color: theme.primary, borderColor: theme.border }}>
                    {fmtMoney(total)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Lista de pagos visibles en el rango de meses mostrados
  const pagosEnRango = useMemo(() => {
    return filtered.filter(p => {
      const d = new Date(p.proximo_pago);
      return mesesAMostrar.some(m => m.anio === d.getFullYear() && m.mes === d.getMonth());
    });
  }, [filtered, mesesAMostrar]);

  const guidedView = (
    <div className="space-y-3">
      {/* Header calendario con nav + toggle de meses visibles */}
      <div className="flex items-center gap-2 rounded-xl p-3 flex-wrap" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <button onClick={irMesAnterior} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-base font-bold inline-flex items-center gap-2 flex-1 justify-center" style={{ color: theme.text }}>
          <Calendar className="h-5 w-5" style={{ color: theme.primary }} />
          {mesesAMostrar[0] && (
            <>
              {MESES_LARGO[mesesAMostrar[0].mes]} {mesesAMostrar[0].anio}
              {mesesVisibles > 1 && mesesAMostrar[mesesVisibles - 1] && (
                <> – {MESES_LARGO[mesesAMostrar[mesesVisibles - 1].mes]} {mesesAMostrar[mesesVisibles - 1].anio}</>
              )}
            </>
          )}
        </h3>
        <button onClick={irMesSiguiente} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
          <ChevronRight className="h-4 w-4" />
        </button>
        {/* Toggle 1/2/3/4 meses */}
        <div className="inline-flex items-center rounded-lg p-0.5" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
          {([1, 2, 3, 4] as const).map(n => (
            <button key={n}
              onClick={() => setMesesVisiblesPersist(n)}
              className="px-2.5 py-1 rounded text-xs font-bold transition-all"
              style={{
                backgroundColor: mesesVisibles === n ? theme.primary : 'transparent',
                color: mesesVisibles === n ? '#fff' : theme.textSecondary,
              }}
              title={`Ver ${n} mes${n > 1 ? 'es' : ''}`}
            >
              {n}M
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-center" style={{ color: theme.textSecondary }}>
        💡 Arrastrá un pago a otro día para cambiarle la fecha. Click sobre un pago para editar.
      </p>

      {/* Grid de meses (1 a 4 lado a lado, wrap en mobile) */}
      <div
        className={`grid gap-3 ${
          mesesVisibles === 1 ? 'grid-cols-1' :
          mesesVisibles === 2 ? 'grid-cols-1 md:grid-cols-2' :
          mesesVisibles === 3 ? 'grid-cols-1 md:grid-cols-3' :
          'grid-cols-1 md:grid-cols-2'
        }`}
      >
        {mesesAMostrar.map(m => renderMes(m.anio, m.mes))}
      </div>

      {/* Lista detallada de pagos en el rango */}
      {pagosEnRango.length > 0 && (
        <div className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>
            Pagos del rango ({pagosEnRango.length})
          </p>
          <div className="space-y-1.5">
            {pagosEnRango.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ==================== Vista CARDS (children) ====================
  const cardsView = filtered.map(p => {
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
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Agenda de pagos" storageKey="agenda">
          Programá pagos <b>recurrentes</b> (sueldos, honorarios, alquileres). El sistema te
          recuerda cuándo toca pagar y con un click crea el gasto + descuenta la caja correspondiente.
        </TesoreriaHint>
      </div>

      <div className="px-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
          <Kpi label="Vencidos" value={`${stats.vencidos}`} sub="atrasados" color="#dc2626" icon={<AlertCircle className="h-4 w-4" />} />
          <Kpi label="Próx. 7 días" value={`${stats.pendientes7}`} sub={fmtMoney(stats.total7)} color="#ef4444" icon={<AlertCircle className="h-4 w-4" />} />
          <Kpi label="Próx. 30 días" value={fmtMoney(stats.total30)} sub={`${pagos.length} pagos activos`} color="#3b82f6" icon={<Calendar className="h-4 w-4" />} />
          <Kpi label="Total activos" value={`${pagos.length}`} sub="programados" color="#10b981" icon={<CalendarClock className="h-4 w-4" />} />
        </div>
      </div>

      <ABMPage
        title="Agenda de Pagos"
        icon={<CalendarClock className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        buttonLabel="Nuevo Pago Programado"
        onAdd={() => openSheet()}
        searchPlaceholder="Buscar por concepto o contacto..."
        searchValue={search}
        onSearchChange={setSearch}
        secondaryFilters={secondaryFilters}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyMessage="No hay pagos con esos filtros."
        defaultViewMode="table"
        viewStorageKey="agenda_view"
        tableView={tableView}
        guidedView={guidedView}
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
                <input type="number" value={form.monto_pesos} onChange={(e) => setForm(f => ({ ...f, monto_pesos: e.target.value }))}
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
          </div>
        }
        sheetFooter={<ABMSheetFooter onCancel={() => setSheetOpen(false)} onSave={save} saving={saving} />}
        onSheetClose={() => setSheetOpen(false)}
      >
        {cardsView}
      </ABMPage>
    </>
  );
}

function Kpi({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>{icon}</div>
        <span className="text-[11px] uppercase font-semibold" style={{ color: theme.textSecondary }}>{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums" style={{ color: theme.text }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: theme.textSecondary }}>{sub}</p>}
    </div>
  );
}
