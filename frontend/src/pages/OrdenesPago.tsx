import { useEffect, useMemo, useState } from 'react';
import {
  FileCheck, Clock, CheckCircle2, Ban, Edit2, Wallet, Building2, User as UserIcon,
  Sparkles, Paperclip, Upload, ExternalLink, Loader2, PackageCheck, Download, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMSheetFooter, ABMInput, ABMTextarea } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { MoneyInput } from '../components/ui/MoneyInput';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase, type HeroSegmento, type HeroAccion, type HeroKpi } from '../lib/semanticHero';
import { FilaLista, type FilaListaItem, type FilaTono } from '../components/ui/FilaLista';
import { PageHeader } from '../components/abmv2/PageHeader';
import { ListToolbar } from '../components/abmv2/ListToolbar';
import { FilterBar } from '../components/abmv2/FilterBar';
import { DataTable, ChipEstado, EntityCell } from '../components/abmv2/DataTable';
import type { ChipTone, ColumnSpec, RowAction, StatusTab, ViewKind } from '../components/abmv2/types';
import { formatFechaAR, parseFechaLocal } from '../lib/tesoreria-helpers';
import { ordenesPagoApi, contactosApi, dependenciasApi, cajasApi, retencionesApi } from '../lib/api';
import type { OrdenPago, EstadoOrdenPago, EtapaContable, Contacto, Caja, ContaduriaRetencion, RetencionAplicada } from '../types';
import { ETAPAS_LIST, getEtapaInfo } from '../lib/etapaContable';
import { CuentaCorrienteSheet } from '../components/contaduria/CuentaCorrienteSheet';
import { CrearOPWizard } from '../components/contaduria/CrearOPWizard';
import '../styles/ordenes-pago-v2.css';

// Steps del tour. Los anclajes cambiaron con la migración al estándar v2:
// los KPIs ya no son tarjetas sueltas (viven DENTRO del hero) y el botón
// "Nueva OP" lo pinta el ListToolbar, que no expone data-attributes propios
// — se lo referencia por su clase del kit dentro del bloque de controles.
const TOUR_STEPS_OP = [
  {
    target: '[data-tour="op-kpis"]',
    content: 'Acá ves los KPIs en vivo de las OPs por estado: pendientes, autorizadas, pagadas y anuladas.',
    title: 'Resumen de Órdenes de Pago',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
  {
    target: '[data-tour="op-controles"] .av2-btn-primario',
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

// Un solo lugar define label, tono de chip e icono de cada estado (Single
// Source of Truth). El TONO es un token del kit —no un hex—, así el chip se
// ve igual que en el resto del estándar y sigue al theme activo.
const ESTADO_META: Record<
  EstadoOrdenPago,
  { label: string; tab: string; tone: ChipTone; tono: FilaTono; Icon: typeof Clock }
> = {
  pendiente:  { label: 'Pendiente',  tab: 'Por autorizar', tone: 'amber', tono: 'advertencia', Icon: Clock },
  autorizada: { label: 'Autorizada', tab: 'Autorizadas',   tone: 'blue',  tono: 'info',        Icon: FileCheck },
  pagada:     { label: 'Pagada',     tab: 'Pagadas',       tone: 'green', tono: 'bueno',       Icon: CheckCircle2 },
  anulada:    { label: 'Anulada',    tab: 'Anuladas',      tone: 'gray',  tono: 'neutro',      Icon: Ban },
};

const ESTADOS: EstadoOrdenPago[] = ['pendiente', 'autorizada', 'pagada', 'anulada'];

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

const num = (v: string | number | null | undefined): number =>
  (typeof v === 'string' ? parseFloat(v) : v) || 0;

/** Mensaje de error de la API, con fallback. Evita repetir el `any` en cada catch. */
function errorMsg(e: unknown, fallback: string): string {
  const detalle = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detalle || fallback;
}

/** Medianoche de hoy, para comparar vencimientos sin que la hora ensucie. */
function hoyLocal(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ¿Esta OP ya venció? Sólo tiene sentido mientras sigue en circuito: una
 *  pagada o anulada no "vence". `parseFechaLocal` evita el corrimiento de un
 *  día que mete `new Date('YYYY-MM-DD')` al parsear como UTC. */
function esVencida(op: OrdenPago): boolean {
  if (!op.fecha_vencimiento) return false;
  if (op.estado !== 'pendiente' && op.estado !== 'autorizada') return false;
  const f = parseFechaLocal(op.fecha_vencimiento).getTime();
  return !isNaN(f) && f < hoyLocal();
}

function diasVencida(op: OrdenPago): number {
  const f = parseFechaLocal(op.fecha_vencimiento || '').getTime();
  if (isNaN(f)) return 0;
  return Math.max(0, Math.floor((hoyLocal() - f) / 86_400_000));
}

/** Lo que se paga de verdad: el neto cuando hubo retenciones, si no el bruto. */
const montoEfectivo = (op: OrdenPago): number =>
  op.monto_neto != null && Array.isArray(op.retenciones) && op.retenciones.length > 0
    ? num(op.monto_neto)
    : num(op.monto_pesos);

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
  const [activeView, setActiveView] = useState<ViewKind>('table');

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
  const [exportando, setExportando] = useState(false);

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

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 500 };
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
      setResumen(
        (resRes.data as { por_estado?: Record<string, { cantidad: number; monto: string }> })?.por_estado || {},
      );
      setRetencionesCat(retRes.data || []);
    } catch { toast.error('Error cargando órdenes de pago'); }
    finally { setLoading(false); }
  };

  // `fetchAll` se recrea en cada render y lee los filtros del closure; meterla
  // en las dependencias dispararía un fetch por render. Los disparadores
  // reales son los filtros, y van declarados.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [estadoFiltro, etapaFiltro]);

  // La búsqueda va con debounce: no se pega al backend en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ============ Datos derivados ============
  const porEstado = (e: EstadoOrdenPago) => resumen[e] || { cantidad: 0, monto: '0' };

  // Las vencidas se cuentan sobre las filas cargadas: el resumen del backend
  // no expone vencimientos, así que con un filtro puesto el número habla de
  // lo que se está viendo.
  const vencidas = useMemo(() => items.filter(esVencida), [items]);

  const totalOrdenes = ESTADOS.reduce((n, e) => n + porEstado(e).cantidad, 0);
  const totalFiltrado = items.reduce((s, op) => s + montoEfectivo(op), 0);

  // Un KPI por estado, en el orden del circuito. El sub del primero suma las
  // vencidas cuando las hay — es el único que reclama acción.
  const vencidasTxt = vencidas.length > 0
    ? ` · ${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'}`
    : '';
  const kpis: HeroKpi[] = ([
    ['pendiente',  'Por autorizar',     `OPs${vencidasTxt}`, 'advertencia'],
    ['autorizada', 'Listas para pagar', 'OPs autorizadas',   undefined],
    ['pagada',     'Pagadas',           'OPs cerradas',      'bueno'],
    ['anulada',    'Anuladas',          'OPs',               undefined],
  ] as const).map(([estado, etiqueta, sufijo, veredicto]) => ({
    etiqueta,
    valor: fmtMoney(porEstado(estado).monto),
    sub: `${porEstado(estado).cantidad} ${sufijo}`,
    veredicto,
  }));

  // La frase se ARMA con lo que hay: si no queda nada por firmar no se
  // inventa un "0 órdenes esperan tu firma", se dice lo que corresponde.
  const heroFrases: HeroFrase[] = useMemo(() => {
    const pend = resumen.pendiente || { cantidad: 0, monto: '0' };
    const aut = resumen.autorizada || { cantidad: 0, monto: '0' };
    const segmentos: HeroSegmento[] = [];

    if (pend.cantidad > 0) {
      segmentos.push(seg(
        `${pend.cantidad} ${pend.cantidad === 1 ? 'orden espera' : 'órdenes esperan'} tu firma por ${fmtMoney(pend.monto)}`,
        'advertencia',
      ));
      if (vencidas.length > 0) {
        const dias = Math.max(...vencidas.map(diasVencida));
        segmentos.push(seg(', y '));
        segmentos.push(seg(
          vencidas.length === 1
            ? `una venció hace ${dias} día${dias === 1 ? '' : 's'}`
            : `${vencidas.length} vencieron (la más vieja hace ${dias} día${dias === 1 ? '' : 's'})`,
          'malo',
        ));
      }
      segmentos.push(seg('. '));
    } else if (totalOrdenes > 0) {
      segmentos.push(seg('No queda ninguna orden esperando tu firma', 'bueno'));
      segmentos.push(seg('. '));
    }

    if (aut.cantidad > 0) {
      segmentos.push(seg(pend.cantidad > 0 ? 'Otras ' : 'Hay '));
      segmentos.push(seg(`${aut.cantidad} ya ${aut.cantidad === 1 ? 'está autorizada' : 'están autorizadas'}`));
      segmentos.push(seg(` y ${aut.cantidad === 1 ? 'lista' : 'listas'} para pagar por ${fmtMoney(aut.monto)}.`));
    }

    if (segmentos.length === 0) return [];

    // Los CTA del diseño: filtran la tabla de verdad (nada de links muertos).
    const acciones: HeroAccion[] = [
      ...(pend.cantidad > 0
        ? [{ label: 'Revisar y firmar', onClick: () => setEstadoFiltro('pendiente'), primaria: true }]
        : []),
      ...(aut.cantidad > 0
        ? [{ label: 'Generar pagos', onClick: () => setEstadoFiltro('autorizada') }]
        : []),
    ];

    return [{ segmentos, acciones }];
  }, [resumen, vencidas, totalOrdenes]);

  const tabsEstado: StatusTab[] = [
    { id: '', label: 'Todas', count: totalOrdenes },
    ...ESTADOS.map((e) => ({ id: e, label: ESTADO_META[e].tab, count: porEstado(e).cantidad })),
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
    const bruto = num(form.monto_pesos);
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
  const netoPagar = Math.max(0, num(form.monto_pesos) - totalRetenido);

  const save = async () => {
    if (!form.concepto.trim()) return toast.error('Falta el concepto');
    if (!form.monto_pesos || num(form.monto_pesos) <= 0) return toast.error('Monto inválido');
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
    } catch (e) {
      toast.error(errorMsg(e, 'Error guardando'));
    } finally { setSaving(false); }
  };

  const handleAutorizar = async (op: OrdenPago) => {
    try {
      await ordenesPagoApi.autorizar(op.id);
      toast.success(`OP ${op.numero} autorizada · pasa a etapa compromiso`);
      fetchAll();
    } catch (e) { toast.error(errorMsg(e, 'Error autorizando')); }
  };

  const handleCambiarEtapa = async (op: OrdenPago, etapa: EtapaContable) => {
    try {
      await ordenesPagoApi.cambiarEtapa(op.id, etapa);
      toast.success(`OP ${op.numero}: etapa actualizada a ${getEtapaInfo(etapa).label}`);
      fetchAll();
    } catch (e) { toast.error(errorMsg(e, 'Error cambiando etapa')); }
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
    } catch (e) { toast.error(errorMsg(e, 'Error pagando')); }
  };

  const confirmarAnular = async (motivo: string) => {
    if (!anularOP) return;
    try {
      await ordenesPagoApi.anular(anularOP.id, motivo);
      toast.success(`OP ${anularOP.numero} anulada`);
      setAnularOP(null);
      fetchAll();
    } catch (e) { toast.error(errorMsg(e, 'Error anulando')); }
  };

  /* Export del diseño. OJO: el único endpoint que existe es el de
     TRANSPARENCIA y no acepta estado/etapa/búsqueda — lo único alineable con
     la pantalla es si van sólo las pagadas. Se aclara en el toast para que
     nadie crea que bajó exactamente lo que tiene filtrado. */
  const exportarCsv = async () => {
    setExportando(true);
    try {
      const soloPagadas = estadoFiltro === 'pagada';
      const res = await ordenesPagoApi.exportTransparencia({ formato: 'csv', solo_pagadas: soloPagadas });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordenes_pago_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(soloPagadas ? 'Exportadas las órdenes pagadas' : 'Exportadas las órdenes no anuladas');
    } catch (e) {
      toast.error(errorMsg(e, 'Error exportando'));
    } finally { setExportando(false); }
  };

  // ============ Columnas ============
  const columnas: ColumnSpec<OrdenPago>[] = [
    {
      id: 'orden', header: 'ORDEN', width: 'minmax(110px, 0.9fr)', kind: 'text',
      cell: (op) => (
        <span className="op-celda2">
          <span className="av2-tabla-texto av2-tnum">{op.numero}</span>
          <span className="op-nota av2-tnum">{formatFechaAR(op.fecha_emision)}</span>
        </span>
      ),
    },
    {
      id: 'beneficiario', header: 'BENEFICIARIO', width: 'minmax(180px, 1.6fr)', kind: 'entity',
      cell: (op) => {
        const esContacto = op.destino_tipo === 'contacto';
        const nombre = (esContacto ? op.contacto_nombre : op.dependencia_nombre) || '—';
        const celda = (
          <EntityCell
            icon={esContacto ? UserIcon : Building2}
            title={nombre}
            subtitle={esContacto ? 'Proveedor' : 'Dependencia interna'}
          />
        );
        // La ficha de cuenta corriente del proveedor se abre desde el nombre
        // (estaba en la pantalla vieja y no se llega desde ningún otro lado).
        if (esContacto && op.destino_contacto_id) {
          return (
            <button
              type="button"
              className="op-link-cta"
              title="Ver cuenta corriente del contacto"
              onClick={(e) => { e.stopPropagation(); setCtaCteId(op.destino_contacto_id!); }}
            >
              {celda}
            </button>
          );
        }
        return celda;
      },
    },
    {
      id: 'concepto', header: 'CONCEPTO', width: 'minmax(180px, 1.8fr)', kind: 'text',
      cell: (op) => (
        <span className="op-celda2">
          <span className="av2-tabla-texto">{op.concepto}</span>
          {/* La caja era una columna propia en la pantalla vieja. */}
          <span className="op-nota">{op.caja_nombre || 'sin caja asignada'}</span>
        </span>
      ),
    },
    {
      id: 'monto', header: 'MONTO', width: 'minmax(120px, 1fr)', kind: 'money', align: 'right',
      cell: (op) => {
        const conRet = Array.isArray(op.retenciones) && op.retenciones.length > 0 && op.monto_neto != null;
        return (
          <span className="op-celda2 op-celda2--der">
            <span className="av2-money">{fmtMoney(op.monto_pesos)}</span>
            {conRet && (
              <span className="op-nota av2-tnum" title="Neto a pagar tras retenciones">
                neto {fmtMoney(op.monto_neto!)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'estado', header: 'ESTADO', width: 'minmax(130px, 1.1fr)', kind: 'chip',
      cell: (op) => {
        const meta = ESTADO_META[op.estado];
        const etapa = getEtapaInfo(op.etapa_contable);
        const vencida = esVencida(op);
        const dias = vencida ? diasVencida(op) : 0;
        return (
          <span className="op-celda2">
            <ChipEstado label={meta.label} tone={meta.tone} />
            {/* La etapa contable era columna propia; acá acompaña al estado. */}
            <span className="op-nota" title={etapa.hint}>{etapa.label}</span>
            {vencida && (
              <span className="op-nota op-nota--alerta">
                venció hace {dias} día{dias === 1 ? '' : 's'}
              </span>
            )}
          </span>
        );
      },
    },
    { id: 'acciones', header: '', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
  ];

  // Cada acción declara a qué filas aplica: el circuito de una OP habilita
  // cosas distintas según el estado (antes eran ifs sueltos dentro del
  // render de la fila).
  const accionesFila: RowAction<OrdenPago>[] = [
    {
      id: 'editar', label: 'Editar', icon: Edit2,
      visible: (op) => op.estado === 'pendiente',
      onClick: openEdit,
    },
    {
      id: 'autorizar', label: 'Autorizar', icon: FileCheck,
      visible: (op) => op.estado === 'pendiente',
      onClick: handleAutorizar,
    },
    {
      id: 'devengar', label: 'Marcar devengado (bien/servicio recibido)', icon: PackageCheck,
      visible: (op) => op.estado === 'autorizada' && op.etapa_contable !== 'devengado',
      onClick: (op) => handleCambiarEtapa(op, 'devengado'),
    },
    {
      id: 'pagar', label: 'Pagar', icon: Wallet,
      visible: (op) => op.estado === 'autorizada',
      onClick: openPagar,
    },
    {
      id: 'anular', label: 'Anular', icon: Ban, danger: true,
      visible: (op) => op.estado === 'pendiente' || op.estado === 'autorizada',
      onClick: (op) => setAnularOP(op),
    },
  ];

  const filasLista: FilaListaItem[] = items.map((op) => ({
    id: op.id,
    titulo: op.concepto,
    meta: [
      op.numero,
      op.destino_tipo === 'contacto' ? op.contacto_nombre : op.dependencia_nombre,
      fmtMoney(op.monto_pesos),
      op.caja_nombre,
    ],
    estado: { label: ESTADO_META[op.estado].label, tono: ESTADO_META[op.estado].tono },
    hace: formatFechaAR(op.fecha_emision),
    onClick: () => openEdit(op),
  }));

  const contextoFiltro = estadoFiltro
    ? `Filtrando por ${ESTADO_META[estadoFiltro].tab.toLowerCase()}`
    : 'Todas las órdenes del ejercicio';

  const ejercicio = new Date().getFullYear();

  // El guard de rol va DESPUÉS de todos los hooks: cortar antes rompía las
  // reglas de hooks (los useMemo quedaban detrás de un return condicional).
  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  // ============ Render ============
  return (
    <>

      <div className="av2-page" data-module="ordenes-pago">
        {/* 1. Cabecera de módulo + acceso al tutorial. */}
        <div className="op-encabezado">
          <PageHeader
            eyebrow={`Tesorería · Ejercicio ${ejercicio}`}
            title="Órdenes de pago"
            description="Circuito formal del gasto: cada orden se autoriza, se devenga y recién ahí se paga contra una caja."
          />
          <TourButton tourKey="contaduria-op" title="Ver tutorial de Órdenes de Pago" />
        </div>

        {/* 2. Hero semántico con los KPIs ADENTRO (nada de tarjetas sueltas). */}
        <div className="av2-hero-wrap" data-tour="op-kpis">
          <SemanticHero
            etiqueta={`ÓRDENES DE PAGO · EJERCICIO ${ejercicio}`}
            frases={heroFrases}
            kpis={kpis}
            className="av2-hero"
          />
        </div>

        {/* 3+4. Toolbar y filtros: una sola tarjeta partida por una línea. */}
        <div className="av2-controles" data-tour="op-controles">
          <ListToolbar
            searchPlaceholder="Número, beneficiario o concepto"
            search={search}
            onSearchChange={setSearch}
            views={['table', 'cards']}
            activeView={activeView}
            onViewChange={setActiveView}
            secondaryAction={{
              label: exportando ? 'Exportando…' : 'Exportar',
              icon: Download,
              onClick: exportarCsv,
              disabled: exportando,
              disabledReason: 'Ya se está generando el archivo',
            }}
            primaryAction={{ label: 'Nueva OP', onClick: openNew }}
          />

          <FilterBar
            selects={[
              {
                id: 'etapa',
                label: 'Etapa contable',
                value: etapaFiltro,
                options: ETAPAS_LIST.map(e => ({ value: e.key, label: e.label })),
                onChange: (v) => setEtapaFiltro(v as EtapaContable | ''),
              },
            ]}
            statusTabs={tabsEstado}
            activeStatus={estadoFiltro}
            onStatusChange={(id) => setEstadoFiltro(id as EstadoOrdenPago | '')}
            filterSummary={`${items.length} de ${totalOrdenes} órdenes`}
          />
        </div>

        {/* 5. Cuerpo: tabla del estándar o lista compacta. */}
        <div data-tour="op-tabla">
          {activeView === 'cards' ? (
            <FilaLista
              ariaLabel="Órdenes de pago"
              items={filasLista}
              vacio="No hay órdenes de pago. Creá una con 'Nueva OP'."
            />
          ) : (
            <DataTable<OrdenPago>
              kind="money"
              columns={columnas}
              rows={items}
              rowKey={(op) => op.id}
              rowActions={accionesFila}
              loading={loading}
              emptyMessage="No hay órdenes de pago. Creá una con 'Nueva OP'."
              footer={{
                showing: contextoFiltro,
                total: { label: 'TOTAL FILTRADO', value: fmtMoney(totalFiltrado) },
              }}
            />
          )}
        </div>
      </div>

      {/* Sheet crear/editar */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Editar OP ${editing.numero}` : 'Nueva Orden de Pago'}
        description={editing ? 'Modificá los datos antes de autorizarla' : 'La OP queda en estado pendiente'}
        customHeader={
          <div className="rs-head">
            <div className="rs-head-fila">
              <span className="rs-eyebrow">{editing ? `Orden ${editing.numero}` : 'Nueva orden de pago'}</span>
              <span className="rs-head-icos">
                <button type="button" className="rs-ico-btn" title="Cerrar" aria-label="Cerrar" onClick={() => setSheetOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
            <p className="rs-titulo">{editing ? editing.concepto : 'Cargá los datos de la orden'}</p>
            <p className="rs-meta">
              {editing ? 'Modificá los datos antes de autorizarla' : 'Queda pendiente hasta que la autorices'}
            </p>
          </div>
        }
        stickyFooter={<ABMSheetFooter onCancel={() => setSheetOpen(false)} onSave={save} saving={saving} />}
      >
        <div className="space-y-3">
          <div className="av2-field">
            <label className="av2-field-label">Beneficiario *</label>
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
                      color: active ? theme.primaryText : theme.text,
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

          <ABMInput
            label="Concepto"
            required
            value={form.concepto}
            onChange={(e) => setForm(f => ({ ...f, concepto: e.target.value }))}
            placeholder="Ej: Materiales obra plaza central"
          />

          <ABMTextarea
            label="Descripción / Detalle"
            value={form.descripcion}
            onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
            rows={2}
            placeholder="Factura nº, detalle del gasto..."
          />

          <div className="av2-form-grid">
            <div className="av2-field">
              <label className="av2-field-label">Monto bruto *</label>
              <MoneyInput
                value={form.monto_pesos}
                onChange={(v) => setForm(f => ({ ...f, monto_pesos: v }))}
                className="w-full px-3 py-2 rounded-lg text-sm tabular-nums"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              />
            </div>
            <div className="av2-field">
              <label className="av2-field-label">Caja (opcional)</label>
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
                  const monto = Math.round((num(form.monto_pesos) * parseFloat(r.porcentaje) / 100) * 100) / 100;
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
                    Bruto {fmtMoney(num(form.monto_pesos))} − Retenido {fmtMoney(totalRetenido)}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Neto a pagar</p>
                    <p className="text-base font-bold tabular-nums" style={{ color: theme.primary }}>{fmtMoney(netoPagar)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="av2-form-grid">
            <div className="av2-field">
              <label className="av2-field-label">Fecha emisión *</label>
              <DatePicker value={form.fecha_emision} onChange={(v) => setForm(f => ({ ...f, fecha_emision: v }))} />
            </div>
            <div className="av2-field">
              <label className="av2-field-label">Vencimiento (opcional)</label>
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
            <div className="av2-form-grid">
              <ABMInput
                label="Nº de factura"
                value={form.nro_factura}
                onChange={(e) => setForm(f => ({ ...f, nro_factura: e.target.value }))}
                placeholder="Ej: A-0001-00012345"
                className="font-mono"
              />
              <div className="av2-field">
                <label className="av2-field-label">Archivo PDF / imagen</label>
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
                    {/* Botón de peligro del kit: sin colores propios. */}
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, factura_url: '' }))}
                      className="av2-btn-peligro"
                      title="Quitar factura"
                      aria-label="Quitar factura"
                    >
                      <X className="h-3.5 w-3.5" />
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
                        } catch (err) {
                          toast.error(errorMsg(err, 'Error subiendo factura'));
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

          <ABMTextarea
            label="Notas internas"
            value={form.notas}
            onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
            rows={2}
          />
        </div>
      </Sheet>

      {/* Sheet Pagar */}
      <Sheet
        open={!!pagarOP}
        onClose={() => setPagarOP(null)}
        title="Ejecutar pago"
        description={pagarOP ? `OP ${pagarOP.numero} · ${fmtMoney(pagarOP.monto_pesos)}` : ''}
        customHeader={
          <div className="rs-head">
            <div className="rs-head-fila">
              <span className="rs-eyebrow">{pagarOP ? `Orden ${pagarOP.numero}` : 'Orden'}</span>
              <span className="rs-head-icos">
                <button type="button" className="rs-ico-btn" title="Cerrar" aria-label="Cerrar" onClick={() => setPagarOP(null)}>
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
            <p className="rs-titulo">Ejecutar pago</p>
            <p className="rs-meta">
              {pagarOP ? `${pagarOP.concepto} · ${fmtMoney(montoEfectivo(pagarOP))}` : ''}
            </p>
          </div>
        }
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

            <div className="av2-field">
              <label className="av2-field-label">Caja de origen *</label>
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

            <div className="av2-form-grid">
              <div className="av2-field">
                <label className="av2-field-label">Fecha de pago</label>
                <DatePicker value={pagarFecha} onChange={setPagarFecha} />
              </div>
              <div className="av2-field">
                <label className="av2-field-label">Forma de pago</label>
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
