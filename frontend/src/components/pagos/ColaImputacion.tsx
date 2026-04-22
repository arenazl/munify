import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, FileText, Receipt, Building2,
  ClipboardCheck, Layers, Search, RotateCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { pagosContaduriaApi } from '../../lib/api';
import { DateRangePicker, DateRange, currentMonthRange } from '../ui/DateRangePicker';
import { ModernSelect } from '../ui/ModernSelect';
import { Modal } from '../ui/Modal';

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------
export interface CutItem {
  session_id: string;
  codigo_cut_qr: string | null;
  fecha_pago: string | null;
  concepto: string;
  origen: 'tramite' | 'tasa' | 'otro';
  monto: string;
  medio_pago: string | null;
  provider: string;
  external_id: string | null;
  imputacion_estado: string | null;
  imputado_at: string | null;
  imputado_por_nombre: string | null;
  imputacion_referencia_externa: string | null;
  imputacion_observacion: string | null;
  vecino_nombre: string | null;
  dependencia_nombre: string | null;
}

interface ColaResponse {
  items: CutItem[];
  total: number;
  page: number;
  page_size: number;
  conteo_por_estado: Record<string, number>;
}

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------
const IMP_ESTADOS: Array<{ value: string; label: string; color: string }> = [
  { value: 'pendiente', label: 'Pendientes', color: '#f59e0b' },
  { value: 'imputado', label: 'Imputados', color: '#22c55e' },
  { value: 'rechazado_imputacion', label: 'Rechazados', color: '#ef4444' },
];

const ORIGEN_OPCIONES = [
  { value: 'all', label: 'Todos' },
  { value: 'tramite', label: 'Trámites' },
  { value: 'tasa', label: 'Tasas' },
];

const impColors: Record<string, string> = {
  pendiente: '#f59e0b',
  imputado: '#22c55e',
  rechazado_imputacion: '#ef4444',
  no_aplica: '#6b7280',
};

const impLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  imputado: 'Imputado',
  rechazado_imputacion: 'Rechazado',
  no_aplica: 'No aplica',
};

function formatMoney(raw: string | number): string {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) return '$0';
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------
export default function ColaImputacion() {
  const { theme } = useTheme();

  // Filtros
  const [range, setRange] = useState<DateRange>(currentMonthRange());
  const [estadoFiltro, setEstadoFiltro] = useState<string>('pendiente');
  const [origen, setOrigen] = useState<'all' | 'tramite' | 'tasa'>('all');
  const [search, setSearch] = useState('');

  // Datos
  const [data, setData] = useState<ColaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // Modales
  const [imputarItem, setImputarItem] = useState<CutItem | null>(null);
  const [rechazarItem, setRechazarItem] = useState<CutItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const buildParams = useMemo(() => {
    return () => {
      const p: Record<string, unknown> = {};
      if (range.desde) p.fecha_desde = range.desde;
      if (range.hasta) p.fecha_hasta = range.hasta;
      p.imputacion_estado = [estadoFiltro];
      if (origen !== 'all') p.origen = origen;
      if (search.trim()) p.search = search.trim();
      p.page_size = 200;
      return p;
    };
  }, [range, estadoFiltro, origen, search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pagosContaduriaApi.imputacion.cola(buildParams());
      setData(res.data as ColaResponse);
      setSeleccionados(new Set());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSel = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelAll = () => {
    if (!data) return;
    if (seleccionados.size === data.items.length) setSeleccionados(new Set());
    else setSeleccionados(new Set(data.items.map((i) => i.session_id)));
  };

  const items = data?.items || [];
  const conteo = data?.conteo_por_estado || {};

  return (
    <div className="space-y-4">
      {/* Header cards por estado */}
      <div className="grid grid-cols-3 gap-3">
        {IMP_ESTADOS.map((e) => {
          const cant = conteo[e.value] || 0;
          const active = estadoFiltro === e.value;
          return (
            <button
              key={e.value}
              onClick={() => setEstadoFiltro(e.value)}
              className="rounded-xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              style={{
                backgroundColor: theme.card,
                border: `2px solid ${active ? e.color : theme.border}`,
                boxShadow: active ? `0 4px 12px ${e.color}30` : 'none',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                  {e.label}
                </span>
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${e.color}20` }}
                >
                  {e.value === 'pendiente' && <Clock className="w-4 h-4" style={{ color: e.color }} />}
                  {e.value === 'imputado' && <CheckCircle2 className="w-4 h-4" style={{ color: e.color }} />}
                  {e.value === 'rechazado_imputacion' && <XCircle className="w-4 h-4" style={{ color: e.color }} />}
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums" style={{ color: theme.text }}>{cant}</p>
              <p className="text-[11px]" style={{ color: theme.textSecondary }}>pagos</p>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div
        className="rounded-xl p-3 flex flex-wrap items-center gap-2"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <DateRangePicker value={range} onChange={setRange} />
        <div className="min-w-[140px]">
          <ModernSelect
            value={origen}
            onChange={(v) => setOrigen((v || 'all') as 'all' | 'tramite' | 'tasa')}
            options={ORIGEN_OPCIONES.map((o) => ({ value: o.value, label: o.label }))}
            placeholder="Origen"
          />
        </div>
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar por CUT, concepto, N° asiento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Acciones bulk */}
      {estadoFiltro === 'pendiente' && seleccionados.size > 0 && (
        <div
          className="rounded-xl p-3 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2"
          style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}40` }}
        >
          <span className="text-sm font-medium" style={{ color: theme.primary }}>
            {seleccionados.size} pago{seleccionados.size === 1 ? '' : 's'} seleccionado{seleccionados.size === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSeleccionados(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: theme.textSecondary, backgroundColor: 'transparent' }}
            >
              Deseleccionar
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primary }}
            >
              <Layers className="w-3.5 h-3.5" />
              Imputar en lote
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
                {estadoFiltro === 'pendiente' && (
                  <th className="px-3 py-2.5 text-left w-8">
                    <input
                      type="checkbox"
                      checked={seleccionados.size > 0 && seleccionados.size === items.length}
                      onChange={toggleSelAll}
                      className="cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">CUT</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Concepto</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Monto</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Vecino</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Medio</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Estado</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-12" style={{ color: theme.textSecondary }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12" style={{ color: theme.textSecondary }}>
                    No hay pagos en este estado
                  </td>
                </tr>
              )}
              {items.map((it) => {
                const sel = seleccionados.has(it.session_id);
                const color = impColors[it.imputacion_estado || 'pendiente'] || '#6b7280';
                const label = impLabels[it.imputacion_estado || 'pendiente'] || it.imputacion_estado || '—';
                return (
                  <tr
                    key={it.session_id}
                    className="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ borderTop: `1px solid ${theme.border}` }}
                  >
                    {estadoFiltro === 'pendiente' && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleSel(it.session_id)}
                          className="cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: theme.textSecondary }}>
                      {formatDate(it.fecha_pago)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold"
                        style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                        title="Código Único de Trámite"
                      >
                        {it.codigo_cut_qr || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {it.origen === 'tramite' ? (
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: theme.primary }} />
                        ) : (
                          <Receipt className="w-3.5 h-3.5 flex-shrink-0" style={{ color: theme.primary }} />
                        )}
                        <span className="truncate max-w-[240px]" title={it.concepto}>{it.concepto}</span>
                      </div>
                      {it.dependencia_nombre && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" style={{ color: theme.textSecondary }} />
                          <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                            {it.dependencia_nombre}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatMoney(it.monto)}
                    </td>
                    <td className="px-3 py-2 text-xs truncate max-w-[160px]" title={it.vecino_nombre || ''}>
                      {it.vecino_nombre || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs capitalize" style={{ color: theme.textSecondary }}>
                      {it.medio_pago || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {label}
                      </span>
                      {it.imputacion_estado === 'imputado' && it.imputacion_referencia_externa && (
                        <div className="text-[10px] mt-0.5 font-mono" style={{ color: theme.textSecondary }}>
                          #{it.imputacion_referencia_externa}
                        </div>
                      )}
                      {it.imputacion_estado === 'rechazado_imputacion' && it.imputacion_observacion && (
                        <div
                          className="text-[10px] mt-0.5 truncate max-w-[180px]"
                          style={{ color: theme.textSecondary }}
                          title={it.imputacion_observacion}
                        >
                          {it.imputacion_observacion}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {(it.imputacion_estado === 'pendiente' || it.imputacion_estado === 'rechazado_imputacion') && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setImputarItem(it)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white transition-all hover:scale-105 active:scale-95"
                            style={{ backgroundColor: '#22c55e' }}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Imputar
                          </button>
                          {it.imputacion_estado === 'pendiente' && (
                            <button
                              onClick={() => setRechazarItem(it)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all hover:scale-105 active:scale-95"
                              style={{
                                backgroundColor: `${theme.border}40`,
                                color: theme.textSecondary,
                                border: `1px solid ${theme.border}`,
                              }}
                            >
                              <XCircle className="w-3 h-3" />
                              Rechazar
                            </button>
                          )}
                        </div>
                      )}
                      {it.imputacion_estado === 'imputado' && it.imputado_por_nombre && (
                        <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                          por {it.imputado_por_nombre}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modales */}
      <ModalImputar
        item={imputarItem}
        onClose={() => setImputarItem(null)}
        onSuccess={fetchData}
      />
      <ModalRechazar
        item={rechazarItem}
        onClose={() => setRechazarItem(null)}
        onSuccess={fetchData}
      />
      <ModalBulkImputar
        open={bulkOpen}
        items={items.filter((i) => seleccionados.has(i.session_id))}
        onClose={() => setBulkOpen(false)}
        onSuccess={() => {
          setBulkOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Modal: imputar un pago individual
// ------------------------------------------------------------
function ModalImputar({
  item,
  onClose,
  onSuccess,
}: {
  item: CutItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { theme } = useTheme();
  const [ref, setRef] = useState('');
  const [obs, setObs] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setRef('');
      setObs('');
    }
  }, [item]);

  if (!item) return null;

  const handleSubmit = async () => {
    if (!ref.trim()) {
      toast.error('La referencia externa es obligatoria');
      return;
    }
    setSubmitting(true);
    try {
      await pagosContaduriaApi.imputacion.marcar(item.session_id, ref.trim(), obs.trim() || undefined);
      toast.success('Pago imputado');
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error al imputar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Imputar pago en sistema contable"
      description="Ingresá el N° de asiento del sistema tributario (RAFAM u otro) para cerrar el circuito contable"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: theme.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !ref.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: '#22c55e' }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Imputando…' : 'Confirmar imputación'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div
          className="rounded-lg p-3 text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="font-semibold">{item.concepto}</span>
            <span className="font-bold tabular-nums">{formatMoney(item.monto)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
            <span className="font-mono">{item.codigo_cut_qr}</span>
            <span>•</span>
            <span>{item.vecino_nombre || '—'}</span>
            <span>•</span>
            <span>{item.medio_pago || '—'}</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.text }}>
            N° de asiento / comprobante externo <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Ej: RAFAM-2026-04-A1234"
            autoFocus
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all font-mono"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.text }}>
            Observación (opcional)
          </label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Comentario interno sobre la imputación"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all resize-none"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Modal: rechazar imputación
// ------------------------------------------------------------
function ModalRechazar({
  item,
  onClose,
  onSuccess,
}: {
  item: CutItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { theme } = useTheme();
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) setMotivo('');
  }, [item]);

  if (!item) return null;

  const handleSubmit = async () => {
    if (motivo.trim().length < 3) {
      toast.error('El motivo es obligatorio (mín. 3 caracteres)');
      return;
    }
    setSubmitting(true);
    try {
      await pagosContaduriaApi.imputacion.rechazar(item.session_id, motivo.trim());
      toast.success('Imputación rechazada — queda visible para retry');
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error al rechazar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Rechazar imputación"
      description="Marcar que este pago no pudo cargarse en el sistema contable (quedará visible para reintentar)"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: theme.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || motivo.trim().length < 3}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: '#ef4444' }}
          >
            <XCircle className="w-4 h-4" />
            {submitting ? 'Rechazando…' : 'Confirmar rechazo'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div
          className="rounded-lg p-3 text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold truncate">{item.concepto}</span>
            <span className="font-bold tabular-nums">{formatMoney(item.monto)}</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.text }}>
            Motivo <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder="Ej: El asiento ya existía en RAFAM con otro nº de comprobante"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all resize-none"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
          <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
            {motivo.length}/500 caracteres
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Modal: bulk-marcar (importación masiva)
// ------------------------------------------------------------
function ModalBulkImputar({
  open,
  items,
  onClose,
  onSuccess,
}: {
  open: boolean;
  items: CutItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { theme } = useTheme();
  const [refsTxt, setRefsTxt] = useState('');
  const [obsComun, setObsComun] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRefsTxt('');
      setObsComun('');
    }
  }, [open]);

  const refsParsed = useMemo(() => {
    const lineas = refsTxt.split('\n').map((l) => l.trim()).filter(Boolean);
    return lineas;
  }, [refsTxt]);

  const matchCount = Math.min(items.length, refsParsed.length);
  const todosTienenRef = matchCount === items.length;

  const handleSubmit = async () => {
    if (!todosTienenRef) {
      toast.error(`Faltan referencias: tenés ${items.length} pagos y solo ${refsParsed.length} líneas`);
      return;
    }
    const payload = items.map((it, idx) => ({
      session_id: it.session_id,
      referencia_externa: refsParsed[idx],
    }));
    setSubmitting(true);
    try {
      const res = await pagosContaduriaApi.imputacion.bulkMarcar(payload, obsComun.trim() || undefined);
      const { imputados = 0, errores = [] } = (res.data as { imputados?: number; errores?: unknown[] }) || {};
      if (errores.length === 0) {
        toast.success(`${imputados} pagos imputados`);
      } else {
        toast.warning(`${imputados} imputados — ${errores.length} con error`);
      }
      onSuccess();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error al imputar en lote');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Imputar en lote"
      description="Pegá las referencias de asiento de RAFAM una por línea, en el mismo orden que aparecen los pagos"
      size="3xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: theme.textSecondary }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !todosTienenRef}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: theme.primary }}
          >
            <ClipboardCheck className="w-4 h-4" />
            {submitting ? 'Imputando…' : `Imputar ${items.length} pagos`}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Lista de pagos */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
            {items.length} pagos a imputar
          </p>
          <div
            className="rounded-lg overflow-auto max-h-[50vh] divide-y"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            {items.map((it, idx) => (
              <div key={it.session_id} className="px-3 py-2 text-xs flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center font-mono text-[10px]"
                  style={{ backgroundColor: theme.card, color: theme.textSecondary }}
                >
                  {idx + 1}
                </span>
                <span className="font-mono flex-shrink-0" style={{ color: theme.primary }}>
                  {it.codigo_cut_qr}
                </span>
                <span className="truncate flex-1">{it.concepto}</span>
                <span className="font-semibold tabular-nums flex-shrink-0">{formatMoney(it.monto)}</span>
                <span
                  className="font-mono text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: refsParsed[idx] ? '#22c55e20' : '#f59e0b20',
                    color: refsParsed[idx] ? '#22c55e' : '#f59e0b',
                  }}
                >
                  {refsParsed[idx] || 'Falta'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Textarea con refs */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
            Pegá {items.length} referencias
          </p>
          <textarea
            value={refsTxt}
            onChange={(e) => setRefsTxt(e.target.value)}
            rows={12}
            placeholder={`RAFAM-2026-04-A0001\nRAFAM-2026-04-A0002\nRAFAM-2026-04-A0003\n...`}
            className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none transition-all resize-none"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
          <div className="flex items-center justify-between mt-1 text-[11px]" style={{ color: theme.textSecondary }}>
            <span>{refsParsed.length}/{items.length} referencias pegadas</span>
            <span style={{ color: todosTienenRef ? '#22c55e' : '#f59e0b' }}>
              {todosTienenRef ? 'Listo' : `Faltan ${items.length - refsParsed.length}`}
            </span>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.text }}>
              Observación común (opcional)
            </label>
            <input
              type="text"
              value={obsComun}
              onChange={(e) => setObsComun(e.target.value)}
              maxLength={500}
              placeholder="Aplica a todos los pagos del lote"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
