import { useEffect, useMemo, useState } from 'react';
import {
  FileCheck, Clock, CheckCircle2, XCircle, Ban, Plus, Edit2, MoreVertical,
  Calendar, Wallet, Building2, User as UserIcon, FileText, Sparkles, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage, ABMSheetFooter, ABMTable, ABMTableAction, type ABMTableColumn } from '../components/ui/ABMPage';
import { StatusPill } from '../components/ui/StatusPill';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { MoneyInput } from '../components/ui/MoneyInput';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import type { KpiSpec } from '../components/ui/KpiCard';
import { ordenesPagoApi, contactosApi, dependenciasApi, cajasApi } from '../lib/api';
import type { OrdenPago, EstadoOrdenPago, Contacto, Caja } from '../types';

// ============================================================
// Constantes
// ============================================================

const ESTADO_META: Record<EstadoOrdenPago, { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#f59e0b20', Icon: Clock },
  autorizada: { label: 'Autorizada', color: '#3b82f6', bg: '#3b82f620', Icon: FileCheck },
  pagada:     { label: 'Pagada',     color: '#10b981', bg: '#10b98120', Icon: CheckCircle2 },
  anulada:    { label: 'Anulada',    color: '#6b7280', bg: '#6b728020', Icon: Ban },
};

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

interface DependenciaOption {
  id: number;
  nombre: string;
  color?: string | null;
}

// ============================================================
// Pagina
// ============================================================

export default function OrdenesPago() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [items, setItems] = useState<OrdenPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [dependencias, setDependencias] = useState<DependenciaOption[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [resumen, setResumen] = useState<Record<string, { cantidad: number; monto: string }>>({});

  // Filtros
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoOrdenPago | ''>('');

  // Sheet crear/editar
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OrdenPago | null>(null);
  const [form, setForm] = useState({
    destino_tipo: 'contacto' as 'contacto' | 'dependencia',
    destino_contacto_id: 0,
    destino_dependencia_id: 0,
    concepto: '',
    descripcion: '',
    monto_pesos: '',
    caja_id: 0,
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '',
    notas: '',
  });
  const [saving, setSaving] = useState(false);

  // Pagar modal
  const [pagarOP, setPagarOP] = useState<OrdenPago | null>(null);
  const [pagarCaja, setPagarCaja] = useState<number>(0);
  const [pagarFecha, setPagarFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [pagarFormaPago, setPagarFormaPago] = useState('transferencia');

  // Anular modal
  const [anularOP, setAnularOP] = useState<OrdenPago | null>(null);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 500 };
      if (estadoFiltro) params.estado = estadoFiltro;
      if (search.trim()) params.search = search.trim();

      const [opsRes, cRes, depRes, cjRes, resRes] = await Promise.all([
        ordenesPagoApi.list(params),
        contactosApi.list({ activo: true, limit: 5000 }),
        dependenciasApi.getMunicipio({ activo: true }),
        cajasApi.list({ activo: true, include_saldos: true }),
        ordenesPagoApi.resumen().catch(() => ({ data: { por_estado: {} } })),
      ]);
      setItems(opsRes.data || []);
      setContactos(cRes.data || []);
      setDependencias(depRes.data || []);
      setCajas(cjRes.data || []);
      setResumen((resRes.data as any)?.por_estado || {});
    } catch { toast.error('Error cargando órdenes de pago'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [estadoFiltro]);
  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 350);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [search]);

  // ============ KPIs ============
  const kpisSpec: KpiSpec[] = [
    {
      label: 'Pendientes', value: fmtMoney(resumen.pendiente?.monto || '0'),
      icon: Clock, color: '#f59e0b',
      footnote: `${resumen.pendiente?.cantidad || 0} OPs por autorizar`,
      highlighted: true,
    },
    {
      label: 'Autorizadas', value: fmtMoney(resumen.autorizada?.monto || '0'),
      icon: FileCheck, color: '#3b82f6',
      footnote: `${resumen.autorizada?.cantidad || 0} listas para pagar`,
    },
    {
      label: 'Pagadas', value: fmtMoney(resumen.pagada?.monto || '0'),
      icon: CheckCircle2, color: '#10b981',
      footnote: `${resumen.pagada?.cantidad || 0} cerradas`,
    },
    {
      label: 'Anuladas', value: fmtMoney(resumen.anulada?.monto || '0'),
      icon: Ban, color: '#6b7280',
      footnote: `${resumen.anulada?.cantidad || 0} canceladas`,
    },
  ];

  // ============ Handlers ============
  const openNew = () => {
    setEditing(null);
    setForm({
      destino_tipo: 'contacto', destino_contacto_id: 0, destino_dependencia_id: 0,
      concepto: '', descripcion: '', monto_pesos: '',
      caja_id: cajas[0]?.id || 0,
      fecha_emision: new Date().toISOString().slice(0, 10),
      fecha_vencimiento: '', notas: '',
    });
    setSheetOpen(true);
  };

  const openEdit = (op: OrdenPago) => {
    if (op.estado !== 'pendiente') {
      toast.info('Solo se pueden editar OPs en estado pendiente');
      return;
    }
    setEditing(op);
    setForm({
      destino_tipo: op.destino_tipo,
      destino_contacto_id: op.destino_contacto_id || 0,
      destino_dependencia_id: op.destino_dependencia_id || 0,
      concepto: op.concepto,
      descripcion: op.descripcion || '',
      monto_pesos: op.monto_pesos,
      caja_id: op.caja_id || 0,
      fecha_emision: op.fecha_emision.slice(0, 10),
      fecha_vencimiento: (op.fecha_vencimiento || '').slice(0, 10),
      notas: op.notas || '',
    });
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.concepto.trim()) return toast.error('Falta el concepto');
    if (!form.monto_pesos || parseFloat(form.monto_pesos) <= 0) return toast.error('Monto inválido');
    if (form.destino_tipo === 'contacto' && !form.destino_contacto_id) return toast.error('Elegí un contacto');
    if (form.destino_tipo === 'dependencia' && !form.destino_dependencia_id) return toast.error('Elegí una secretaría');

    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        destino_tipo: form.destino_tipo,
        destino_contacto_id: form.destino_tipo === 'contacto' ? form.destino_contacto_id : null,
        destino_dependencia_id: form.destino_tipo === 'dependencia' ? form.destino_dependencia_id : null,
        concepto: form.concepto.trim(),
        descripcion: form.descripcion.trim() || null,
        monto_pesos: form.monto_pesos,
        caja_id: form.caja_id || null,
        fecha_emision: form.fecha_emision,
        fecha_vencimiento: form.fecha_vencimiento || null,
        notas: form.notas.trim() || null,
      };
      if (editing) await ordenesPagoApi.update(editing.id, data);
      else await ordenesPagoApi.create(data);
      toast.success(editing ? 'OP actualizada' : 'OP creada');
      setSheetOpen(false);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally { setSaving(false); }
  };

  const handleAutorizar = async (op: OrdenPago) => {
    try {
      await ordenesPagoApi.autorizar(op.id);
      toast.success(`OP ${op.numero} autorizada`);
      fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error autorizando'); }
  };

  const openPagar = (op: OrdenPago) => {
    setPagarOP(op);
    setPagarCaja(op.caja_id || cajas[0]?.id || 0);
    setPagarFecha(new Date().toISOString().slice(0, 10));
    setPagarFormaPago('transferencia');
  };

  const confirmarPagar = async () => {
    if (!pagarOP) return;
    if (!pagarCaja) return toast.error('Elegí una caja');
    try {
      await ordenesPagoApi.pagar(pagarOP.id, {
        caja_id: pagarCaja, fecha_pago: pagarFecha, forma_pago: pagarFormaPago,
      });
      toast.success(`OP ${pagarOP.numero} pagada · Gasto creado en Tesorería`);
      setPagarOP(null);
      fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error pagando'); }
  };

  const confirmarAnular = async (motivo: string) => {
    if (!anularOP) return;
    try {
      await ordenesPagoApi.anular(anularOP.id, motivo);
      toast.success(`OP ${anularOP.numero} anulada`);
      setAnularOP(null);
      fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error anulando'); }
  };

  // ============ Columnas tabla ============
  const columns: ABMTableColumn<OrdenPago>[] = [
    {
      key: 'numero', header: 'Número',
      render: (op) => <span className="font-mono font-semibold text-xs">{op.numero}</span>,
      sortValue: (op) => op.numero,
    },
    {
      key: 'fecha_emision', header: 'Emisión',
      render: (op) => <span className="text-xs">{new Date(op.fecha_emision).toLocaleDateString('es-AR')}</span>,
      sortValue: (op) => op.fecha_emision,
    },
    {
      key: 'destino', header: 'Beneficiario',
      render: (op) => {
        const Icon = op.destino_tipo === 'contacto' ? UserIcon : Building2;
        const nombre = op.destino_tipo === 'contacto' ? op.contacto_nombre : op.dependencia_nombre;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Icon className="h-3 w-3" style={{ color: theme.textSecondary }} />
            <span className="font-medium truncate max-w-[180px]" style={{ color: theme.text }}>
              {nombre || '—'}
            </span>
          </span>
        );
      },
      sortValue: (op) => op.contacto_nombre || op.dependencia_nombre || '',
    },
    {
      key: 'concepto', header: 'Concepto',
      render: (op) => <span className="text-xs truncate max-w-[220px] inline-block align-middle">{op.concepto}</span>,
      sortValue: (op) => op.concepto,
    },
    {
      key: 'monto', header: 'Monto',
      render: (op) => (
        <span className="font-bold tabular-nums" style={{ color: theme.text }}>
          {fmtMoney(op.monto_pesos)}
        </span>
      ),
      sortValue: (op) => parseFloat(op.monto_pesos),
    },
    {
      key: 'caja', header: 'Caja',
      render: (op) => <span className="text-[11px]" style={{ color: theme.textSecondary }}>{op.caja_nombre || '—'}</span>,
      sortValue: (op) => op.caja_nombre || '',
    },
    {
      key: 'estado', header: 'Estado',
      render: (op) => {
        const meta = ESTADO_META[op.estado];
        return <StatusPill label={meta.label} color={meta.color} size="xs" />;
      },
      sortValue: (op) => op.estado,
    },
  ];

  // ============ Render ============
  return (
    <>
      <ABMPage
        title="Órdenes de Pago"
        icon={<FileCheck className="h-5 w-5" />}
        buttonLabel="Nueva OP"
        onAdd={openNew}
        searchPlaceholder="Buscar por número, concepto o descripción..."
        searchValue={search}
        onSearchChange={setSearch}
        kpis={kpisSpec}
        loading={loading}
        isEmpty={items.length === 0}
        emptyMessage="No hay órdenes de pago. Creá una con 'Nueva OP'."
        toolbar={{
          statusPills: {
            value: estadoFiltro,
            onChange: (v) => setEstadoFiltro(v as EstadoOrdenPago | ''),
            items: (['pendiente', 'autorizada', 'pagada', 'anulada'] as EstadoOrdenPago[]).map(e => ({
              key: e,
              label: ESTADO_META[e].label,
              color: ESTADO_META[e].color,
              count: resumen[e]?.cantidad,
            })),
          },
        }}
        tableView={
          <ABMTable<OrdenPago>
            data={items}
            keyExtractor={(op) => op.id}
            columns={columns}
            defaultSortKey="fecha_emision"
            defaultSortDirection="desc"
            actions={(op) => (
              <>
                {op.estado === 'pendiente' && (
                  <>
                    <ABMTableAction
                      title="Editar"
                      onClick={() => openEdit(op)}
                      icon={<Edit2 className="h-4 w-4" />}
                    />
                    <ABMTableAction
                      title="Autorizar"
                      onClick={() => handleAutorizar(op)}
                      variant="primary"
                      icon={<FileCheck className="h-4 w-4" />}
                    />
                  </>
                )}
                {op.estado === 'autorizada' && (
                  <ABMTableAction
                    title="Pagar"
                    onClick={() => openPagar(op)}
                    variant="primary"
                    icon={<Wallet className="h-4 w-4" />}
                  />
                )}
                {(op.estado === 'pendiente' || op.estado === 'autorizada') && (
                  <ABMTableAction
                    title="Anular"
                    onClick={() => setAnularOP(op)}
                    variant="danger"
                    icon={<Ban className="h-4 w-4" />}
                  />
                )}
              </>
            )}
          />
        }
      >
        {/* Vista cards: por ahora reusamos la tabla. */}
        {items.map(op => {
          const meta = ESTADO_META[op.estado];
          const Icon = meta.Icon;
          return (
            <div
              key={op.id}
              className="rounded-xl p-3 cursor-pointer hover:scale-[1.005] transition-all"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              onClick={() => openEdit(op)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-semibold text-xs" style={{ color: theme.primary }}>{op.numero}</span>
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                  style={{ backgroundColor: meta.bg, color: meta.color }}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
              </div>
              <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{op.concepto}</p>
              <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                {op.destino_tipo === 'contacto' ? op.contacto_nombre : op.dependencia_nombre}
              </p>
              <p className="text-lg font-bold tabular-nums mt-1" style={{ color: theme.text }}>
                {fmtMoney(op.monto_pesos)}
              </p>
              <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                {new Date(op.fecha_emision).toLocaleDateString('es-AR')} · {op.caja_nombre || 'sin caja'}
              </p>
            </div>
          );
        })}
      </ABMPage>

      {/* Sheet crear/editar */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Editar OP ${editing.numero}` : 'Nueva Orden de Pago'}
        description={editing ? 'Modificá los datos antes de autorizarla' : 'La OP queda en estado pendiente'}
        stickyFooter={<ABMSheetFooter onCancel={() => setSheetOpen(false)} onSave={save} saving={saving} />}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Beneficiario *</label>
            <div className="flex gap-2 mb-2">
              {(['contacto', 'dependencia'] as const).map(t => {
                const active = form.destino_tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, destino_tipo: t }))}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5"
                    style={{
                      backgroundColor: active ? theme.primary : theme.backgroundSecondary,
                      color: active ? '#fff' : theme.text,
                      border: `1px solid ${active ? theme.primary : theme.border}`,
                    }}
                  >
                    {t === 'contacto' ? <UserIcon className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                    {t === 'contacto' ? 'A una persona' : 'A una secretaría'}
                  </button>
                );
              })}
            </div>
            {form.destino_tipo === 'contacto' ? (
              <ModernSelect
                value={form.destino_contacto_id ? String(form.destino_contacto_id) : ''}
                onChange={(v) => setForm(f => ({ ...f, destino_contacto_id: v ? Number(v) : 0 }))}
                options={contactos.map(c => ({ value: String(c.id), label: `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}` }))}
                placeholder="Elegí un contacto"
                searchable
              />
            ) : (
              <ModernSelect
                value={form.destino_dependencia_id ? String(form.destino_dependencia_id) : ''}
                onChange={(v) => setForm(f => ({ ...f, destino_dependencia_id: v ? Number(v) : 0 }))}
                options={dependencias.map(d => ({ value: String(d.id), label: d.nombre, color: d.color || undefined }))}
                placeholder="Elegí una secretaría"
                searchable
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Concepto *</label>
            <input
              type="text"
              value={form.concepto}
              onChange={(e) => setForm(f => ({ ...f, concepto: e.target.value }))}
              placeholder="Ej: Materiales obra plaza central"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción / Detalle</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              placeholder="Factura nº, detalle del gasto..."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Monto *</label>
              <MoneyInput
                value={form.monto_pesos}
                onChange={(v) => setForm(f => ({ ...f, monto_pesos: v }))}
                className="w-full px-3 py-2 rounded-lg text-sm tabular-nums"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Caja (opcional)</label>
              <ModernSelect
                value={form.caja_id ? String(form.caja_id) : ''}
                onChange={(v) => setForm(f => ({ ...f, caja_id: v ? Number(v) : 0 }))}
                options={[
                  { value: '', label: 'Elegir al pagar' },
                  ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
                ]}
                placeholder="Elegir al pagar"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Fecha emisión *</label>
              <DatePicker value={form.fecha_emision} onChange={(v) => setForm(f => ({ ...f, fecha_emision: v }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Vencimiento (opcional)</label>
              <DatePicker value={form.fecha_vencimiento} onChange={(v) => setForm(f => ({ ...f, fecha_vencimiento: v }))} allowClear />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Notas internas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>
        </div>
      </Sheet>

      {/* Sheet Pagar */}
      <Sheet
        open={!!pagarOP}
        onClose={() => setPagarOP(null)}
        title="Ejecutar pago"
        description={pagarOP ? `OP ${pagarOP.numero} · ${fmtMoney(pagarOP.monto_pesos)}` : ''}
        stickyFooter={
          <ABMSheetFooter
            onCancel={() => setPagarOP(null)}
            onSave={confirmarPagar}
            saving={false}
            saveLabel={`Pagar · ${fmtMoney(pagarOP?.monto_pesos || 0)}`}
          />
        }
      >
        {pagarOP && (
          <div className="space-y-3">
            <div
              className="p-3 rounded-xl flex items-start gap-2"
              style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
            >
              <Sparkles className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
              <p className="text-xs" style={{ color: theme.text }}>
                Al confirmar se crea un <b>Gasto</b> en Tesorería por el monto total y se descuenta la caja seleccionada.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Caja de origen *</label>
              <ModernSelect
                value={pagarCaja ? String(pagarCaja) : ''}
                onChange={(v) => setPagarCaja(v ? Number(v) : 0)}
                options={cajas.map(c => ({
                  value: String(c.id),
                  label: `${c.nombre} (saldo: ${fmtMoney(c.saldo_actual || '0')})`,
                  color: c.color || undefined,
                }))}
                placeholder="Elegí la caja"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Fecha de pago</label>
                <DatePicker value={pagarFecha} onChange={setPagarFecha} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Forma de pago</label>
                <ModernSelect
                  value={pagarFormaPago}
                  onChange={setPagarFormaPago}
                  options={[
                    { value: 'transferencia', label: 'Transferencia' },
                    { value: 'efectivo', label: 'Efectivo' },
                    { value: 'cheque', label: 'Cheque' },
                    { value: 'tarjeta', label: 'Tarjeta' },
                    { value: 'mercadopago', label: 'MercadoPago' },
                    { value: 'otro', label: 'Otro' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {/* Confirm anular con motivo */}
      <ConfirmModal
        isOpen={!!anularOP}
        onClose={() => setAnularOP(null)}
        onConfirm={(motivo) => confirmarAnular(motivo || '')}
        title="¿Anular la orden de pago?"
        variant="danger"
        confirmText="Anular"
        cancelText="Cancelar"
        message={
          anularOP ? (
            <div>
              <p>Vas a anular la OP <b>{anularOP.numero}</b> por {fmtMoney(anularOP.monto_pesos)}.</p>
              <p className="text-xs mt-1 opacity-75">El motivo va a quedar registrado en el historial.</p>
            </div>
          ) : ''
        }
        promptLabel="Motivo de la anulación"
        promptPlaceholder="Ej: Error en el monto, beneficiario incorrecto..."
      />
    </>
  );
}
