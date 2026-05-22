import { useEffect, useMemo, useState } from 'react';
import {
  FileCheck, Clock, CheckCircle2, XCircle, Ban, Plus, Edit2, MoreVertical,
  Calendar, Wallet, Building2, User as UserIcon, FileText, Sparkles, Receipt,
  Paperclip, Upload, ExternalLink, Loader2, PackageCheck,
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
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import type { KpiSpec } from '../components/ui/KpiCard';
import { ordenesPagoApi, contactosApi, dependenciasApi, cajasApi, retencionesApi } from '../lib/api';
import type { OrdenPago, EstadoOrdenPago, EtapaContable, Contacto, Caja, ContaduriaRetencion, RetencionAplicada } from '../types';
import { ETAPAS_LIST, getEtapaInfo } from '../lib/etapaContable';
import { CuentaCorrienteSheet } from '../components/contaduria/CuentaCorrienteSheet';
import { CrearOPWizard } from '../components/contaduria/CrearOPWizard';

// Steps del tour de Órdenes de Pago. Cada `target` apunta a un atributo
// `data-tour` que existe en el JSX (algunos via prop tourAnchors del ABMPage).
const TOUR_STEPS_OP = [
  {
    target: '[data-tour="op-kpis"]',
    content: 'Acá ves los KPIs en vivo de las OPs por estado: pendientes, autorizadas, pagadas y anuladas.',
    title: 'Resumen de Órdenes de Pago',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
  {
    target: '[data-tour="op-nueva"]',
    content: 'Apretás "Nueva OP" para crear una orden formal. Cargás beneficiario, monto, fecha, y opcionalmente adjuntás el PDF de la factura.',
    title: 'Crear una OP nueva',
    placement: 'bottom' as const,
  },
  {
    target: '[data-tour="op-tabla"]',
    content: 'En cada fila ves los botones de acción según el estado: Autorizar, Pagar o Anular. Al pagar, automáticamente se crea el gasto en Tesorería y se descuenta la caja.',
    title: 'Acciones por OP',
    placement: 'top' as const,
  },
];

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
  const [retencionesCat, setRetencionesCat] = useState<ContaduriaRetencion[]>([]);
  // ids del catalogo seleccionados para la OP en edicion/creacion
  const [retencionesSel, setRetencionesSel] = useState<Set<number>>(new Set());
  const [resumen, setResumen] = useState<Record<string, { cantidad: number; monto: string }>>({});

  // Filtros
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoOrdenPago | ''>('');
  const [etapaFiltro, setEtapaFiltro] = useState<EtapaContable | ''>('');

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
    nro_factura: '',
    factura_url: '',
    notas: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingFactura, setUploadingFactura] = useState(false);

  // Pagar modal
  const [pagarOP, setPagarOP] = useState<OrdenPago | null>(null);
  const [pagarCaja, setPagarCaja] = useState<number>(0);
  const [pagarFecha, setPagarFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [pagarFormaPago, setPagarFormaPago] = useState('transferencia');

  // Anular modal
  const [anularOP, setAnularOP] = useState<OrdenPago | null>(null);

  // Sheet cuenta corriente
  const [ctaCteId, setCtaCteId] = useState<number | null>(null);

  // Wizard "Nueva OP"
  const [wizardOpen, setWizardOpen] = useState(false);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 500 };
      if (estadoFiltro) params.estado = estadoFiltro;
      if (etapaFiltro) params.etapa = etapaFiltro;
      if (search.trim()) params.search = search.trim();

      const [opsRes, cRes, depRes, cjRes, resRes, retRes] = await Promise.all([
        ordenesPagoApi.list(params),
        contactosApi.list({ activo: true, limit: 5000 }),
        dependenciasApi.getMunicipio({ activo: true }),
        cajasApi.list({ activo: true, include_saldos: true }),
        ordenesPagoApi.resumen().catch(() => ({ data: { por_estado: {} } })),
        retencionesApi.list({ activo: true }).catch(() => ({ data: [] as ContaduriaRetencion[] })),
      ]);
      setItems(opsRes.data || []);
      setContactos(cRes.data || []);
      setDependencias(depRes.data || []);
      setCajas(cjRes.data || []);
      setResumen((resRes.data as any)?.por_estado || {});
      setRetencionesCat(retRes.data || []);
    } catch { toast.error('Error cargando órdenes de pago'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [estadoFiltro, etapaFiltro]);
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
  // Crear nuevo: wizard guiado (4 pasos).
  // Editar: Sheet directo (mas rapido cuando ya hay datos cargados).
  const openNew = () => setWizardOpen(true);

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
      nro_factura: op.nro_factura || '',
      factura_url: op.factura_url || '',
      notas: op.notas || '',
    });
    const ids = new Set<number>();
    (op.retenciones || []).forEach(r => { if (r.id != null) ids.add(r.id); });
    setRetencionesSel(ids);
    setSheetOpen(true);
  };

  // Calculo en vivo del neto basado en retenciones seleccionadas
  const retencionesAplicadas: RetencionAplicada[] = useMemo(() => {
    const bruto = parseFloat(form.monto_pesos || '0') || 0;
    return retencionesCat
      .filter(r => retencionesSel.has(r.id))
      .map(r => ({
        id: r.id,
        nombre: r.nombre,
        porcentaje: parseFloat(r.porcentaje),
        monto: Math.round((bruto * parseFloat(r.porcentaje) / 100) * 100) / 100,
      }));
  }, [retencionesCat, retencionesSel, form.monto_pesos]);

  const totalRetenido = retencionesAplicadas.reduce((s, r) => s + r.monto, 0);
  const netoPagar = Math.max(0, (parseFloat(form.monto_pesos || '0') || 0) - totalRetenido);

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
        retenciones: retencionesAplicadas,
        caja_id: form.caja_id || null,
        fecha_emision: form.fecha_emision,
        fecha_vencimiento: form.fecha_vencimiento || null,
        nro_factura: form.nro_factura.trim() || null,
        factura_url: form.factura_url || null,
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
      toast.success(`OP ${op.numero} autorizada · pasa a etapa compromiso`);
      fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error autorizando'); }
  };

  const handleCambiarEtapa = async (op: OrdenPago, etapa: EtapaContable) => {
    try {
      await ordenesPagoApi.cambiarEtapa(op.id, etapa);
      toast.success(`OP ${op.numero}: etapa actualizada a ${getEtapaInfo(etapa).label}`);
      fetchAll();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Error cambiando etapa'); }
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
        if (op.destino_tipo === 'contacto' && op.destino_contacto_id) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setCtaCteId(op.destino_contacto_id!); }}
              className="inline-flex items-center gap-1.5 text-xs hover:underline"
              title="Ver cuenta corriente del contacto"
            >
              <Icon className="h-3 w-3" style={{ color: theme.textSecondary }} />
              <span className="font-medium truncate max-w-[180px]" style={{ color: theme.primary }}>
                {nombre || '—'}
              </span>
            </button>
          );
        }
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
      render: (op) => {
        const hasRet = Array.isArray(op.retenciones) && op.retenciones.length > 0;
        return (
          <div className="text-right leading-tight">
            <span className="font-bold tabular-nums block" style={{ color: theme.text }}>
              {fmtMoney(op.monto_pesos)}
            </span>
            {hasRet && op.monto_neto && (
              <span
                className="text-[10px] tabular-nums"
                style={{ color: theme.primary }}
                title="Neto a pagar tras retenciones"
              >
                Neto {fmtMoney(op.monto_neto)}
              </span>
            )}
          </div>
        );
      },
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
    {
      key: 'etapa', header: 'Etapa contable',
      render: (op) => {
        const info = getEtapaInfo(op.etapa_contable);
        const Icon = info.icon;
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold whitespace-nowrap"
            style={{ backgroundColor: info.bg, color: info.color, border: `1px solid ${info.color}30` }}
            title={info.hint}
          >
            <Icon className="h-3 w-3" />
            {info.label}
          </span>
        );
      },
      sortValue: (op) => getEtapaInfo(op.etapa_contable).orden,
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
        tourAnchors={{ kpis: 'op-kpis', addButton: 'op-nueva' }}
        headerActions={<TourButton tourKey="contaduria-op" title="Ver tutorial de Órdenes de Pago" />}
        loading={loading}
        isEmpty={items.length === 0}
        emptyMessage="No hay órdenes de pago. Creá una con 'Nueva OP'."
        toolbar={{
          combos: [
            {
              key: 'etapa',
              placeholder: 'Etapa contable',
              value: etapaFiltro,
              onChange: (v) => setEtapaFiltro(v as EtapaContable | ''),
              options: ETAPAS_LIST.map(e => ({ value: e.key, label: e.label, color: e.color })),
              searchable: false,
              minWidth: 180,
            },
          ],
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
          <div data-tour="op-tabla">
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
                {op.estado === 'autorizada' && op.etapa_contable !== 'devengado' && (
                  <ABMTableAction
                    title="Marcar devengado (bien/servicio recibido)"
                    onClick={() => handleCambiarEtapa(op, 'devengado')}
                    icon={<PackageCheck className="h-4 w-4" />}
                  />
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
          </div>
        }
      >
        {/* Vista cards: por ahora reusamos la tabla. */}
        {items.map(op => {
          const meta = ESTADO_META[op.estado];
          const Icon = meta.Icon;
          const etapa = getEtapaInfo(op.etapa_contable);
          const EtapaIcon = etapa.icon;
          return (
            <div
              key={op.id}
              className="rounded-xl p-3 cursor-pointer hover:scale-[1.005] transition-all"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              onClick={() => openEdit(op)}
            >
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <span className="font-mono font-semibold text-xs" style={{ color: theme.primary }}>{op.numero}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ backgroundColor: etapa.bg, color: etapa.color, border: `1px solid ${etapa.color}30` }}
                    title={etapa.hint}
                  >
                    <EtapaIcon className="h-3 w-3" />
                    {etapa.label}
                  </span>
                  <span
                    className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ backgroundColor: meta.bg, color: meta.color }}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>
              </div>
              <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{op.concepto}</p>
              <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                {op.destino_tipo === 'contacto' ? op.contacto_nombre : op.dependencia_nombre}
              </p>
              <p className="text-lg font-bold tabular-nums mt-1" style={{ color: theme.text }}>
                {fmtMoney(op.monto_pesos)}
              </p>
              {Array.isArray(op.retenciones) && op.retenciones.length > 0 && op.monto_neto && (
                <p className="text-[10px] tabular-nums" style={{ color: theme.primary }}>
                  Neto a pagar: {fmtMoney(op.monto_neto)} ({op.retenciones.length} retencion{op.retenciones.length === 1 ? '' : 'es'})
                </p>
              )}
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
              <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Monto bruto *</label>
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

          {/* Retenciones aplicables */}
          {retencionesCat.length > 0 && (
            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <p className="text-[10px] uppercase font-bold mb-2 inline-flex items-center gap-1" style={{ color: theme.textSecondary }}>
                Retenciones aplicables al pago
              </p>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {retencionesCat.map(r => {
                  const checked = retencionesSel.has(r.id);
                  const bruto = parseFloat(form.monto_pesos || '0') || 0;
                  const monto = Math.round((bruto * parseFloat(r.porcentaje) / 100) * 100) / 100;
                  const color = r.color || theme.primary;
                  return (
                    <label
                      key={r.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                      style={{
                        backgroundColor: checked ? `${color}15` : theme.card,
                        border: `1px solid ${checked ? color : theme.border}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setRetencionesSel(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.id); else next.delete(r.id);
                            return next;
                          });
                        }}
                        style={{ accentColor: color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>
                          {r.nombre} <span style={{ color }}>({parseFloat(r.porcentaje)}%)</span>
                        </p>
                        {checked && monto > 0 && (
                          <p className="text-[10px] tabular-nums" style={{ color: theme.textSecondary }}>
                            -{fmtMoney(monto)}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              {totalRetenido > 0 && (
                <div
                  className="rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                  style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
                >
                  <div className="text-[11px]" style={{ color: theme.textSecondary }}>
                    Bruto {fmtMoney(parseFloat(form.monto_pesos || '0'))} − Retenido {fmtMoney(totalRetenido)}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Neto a pagar</p>
                    <p className="text-base font-bold tabular-nums" style={{ color: theme.primary }}>{fmtMoney(netoPagar)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Factura: nro + upload PDF */}
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <p className="text-[10px] uppercase font-bold mb-2 inline-flex items-center gap-1" style={{ color: theme.textSecondary }}>
              <Paperclip className="h-3 w-3" />
              Factura del proveedor (opcional)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: theme.textSecondary }}>Nº de factura</label>
                <input
                  type="text"
                  value={form.nro_factura}
                  onChange={(e) => setForm(f => ({ ...f, nro_factura: e.target.value }))}
                  placeholder="Ej: A-0001-00012345"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                  style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: theme.textSecondary }}>Archivo PDF / imagen</label>
                {form.factura_url ? (
                  <div className="flex items-center gap-1.5">
                    <a
                      href={form.factura_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold truncate"
                      style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      Ver factura
                    </a>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, factura_url: '' }))}
                      className="px-2 py-2 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444440' }}
                      title="Quitar factura"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:scale-[1.005]"
                    style={{ backgroundColor: theme.card, color: theme.text, border: `1px dashed ${theme.border}` }}
                  >
                    {uploadingFactura ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo...</>
                    ) : (
                      <><Upload className="h-3.5 w-3.5" /> Subir archivo</>
                    )}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      disabled={uploadingFactura}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error('Archivo demasiado grande (max 10MB)');
                          return;
                        }
                        setUploadingFactura(true);
                        try {
                          const res = await ordenesPagoApi.uploadFactura(file);
                          setForm(f => ({ ...f, factura_url: res.data.url }));
                          toast.success('Factura subida');
                        } catch (err: any) {
                          toast.error(err?.response?.data?.detail || 'Error subiendo factura');
                        } finally {
                          setUploadingFactura(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                )}
              </div>
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

      <CuentaCorrienteSheet contactoId={ctaCteId} onClose={() => setCtaCteId(null)} />

      <CrearOPWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => fetchAll()}
      />

      <MunifyTour tourKey="contaduria-op" steps={TOUR_STEPS_OP} />
    </>
  );
}
