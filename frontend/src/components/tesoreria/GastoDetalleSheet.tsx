import { useEffect, useMemo, useState } from 'react';
import {
  Calendar, Wallet, DollarSign, CreditCard, Receipt,
  CheckCircle2, Clock, AlertTriangle, Ban, Building2,
  Home, Save, Loader2,
  Trash2, Pencil, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { useTheme } from '../../contexts/ThemeContext';
import { gastosApi, contactosApi, dependenciasApi } from '../../lib/api';
import type {
  Gasto, GastoCuota, EstadoGastoCuota, Contacto,
} from '../../types';

// ============================================================
// Estado agregado del gasto (computado desde cuotas)
// ============================================================
export type EstadoAgregado = 'al_dia' | 'en_mora' | 'pendiente' | 'completado';

export function calcEstadoAgregado(g: Gasto): EstadoAgregado {
  // El tag manual estado_pago (concretado/pendiente) tiene prioridad sobre
  // el calculo de cuotas. Si el gasto esta marcado como 'pendiente', el
  // estado agregado siempre es 'pendiente' (no muestra en_mora ni al_dia).
  const ep = (g as any).estado_pago;
  if (ep === 'pendiente') return 'pendiente';

  const cuotas = g.cuotas || [];
  if (cuotas.length === 0) return 'completado';

  const todasPagadas = cuotas.every(c => c.estado === 'pagada');
  if (todasPagadas) return 'completado';

  // 'en_mora' eliminado del estado visible. Las cuotas vencidas se
  // muestran como 'pendiente' (el detalle del estado por cuota sigue
  // disponible en el side panel).
  const algunaPagada = cuotas.some(c => c.estado === 'pagada');
  return algunaPagada ? 'al_dia' : 'pendiente';
}

export const ESTADO_AGREGADO_META: Record<EstadoAgregado, { label: string; color: string; bg: string }> = {
  al_dia:     { label: 'Al día',     color: '#10b981', bg: '#10b98120' },
  en_mora:    { label: 'En mora',    color: '#ef4444', bg: '#ef444420' },
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#f59e0b20' },
  completado: { label: 'Completado', color: '#3b82f6', bg: '#3b82f620' },
};

const CUOTA_META: Record<EstadoGastoCuota, { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', bg: '#f59e0b20', Icon: Clock },
  pagada:    { label: 'Pagada',    color: '#10b981', bg: '#10b98120', Icon: CheckCircle2 },
  vencida:   { label: 'Vencida',   color: '#ef4444', bg: '#ef444420', Icon: AlertTriangle },
  cancelada: { label: 'Cancelada', color: '#6b7280', bg: '#6b728020', Icon: Ban },
};

const TIPO_FIN_LABEL: Record<string, string> = {
  contado: 'Contado',
  cuotas: 'Cuotas',
  prestamo: 'Préstamo',
  recurrente: 'Recurrente',
};

const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  tarjeta: 'Tarjeta',
  mercadopago: 'MercadoPago',
  otro: 'Otro',
};

interface DependenciaLite {
  id: number;
  nombre: string;
  color?: string | null;
  icono?: string | null;
}

interface GastoDetalleSheetProps {
  open: boolean;
  onClose: () => void;
  gasto: Gasto | null;
  onUpdated?: () => void;
  onDeleted?: () => void;
  onEdit?: (g: Gasto) => void;
}

export function GastoDetalleSheet({
  open, onClose, gasto, onUpdated, onDeleted, onEdit,
}: GastoDetalleSheetProps) {
  const { theme } = useTheme();

  // ============ State ============
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [dependencia, setDependencia] = useState<DependenciaLite | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [obsDirty, setObsDirty] = useState(false);
  const [savingObs, setSavingObs] = useState(false);
  const [pagandoCuotaId, setPagandoCuotaId] = useState<number | null>(null);
  const [togglingEstado, setTogglingEstado] = useState(false);

  // Toggle estado concretado <-> pendiente
  const handleToggleEstado = async () => {
    const actual = (gasto as any).estado_pago || 'concretado';
    const next = actual === 'concretado' ? 'pendiente' : 'concretado';
    setTogglingEstado(true);
    try {
      await gastosApi.update(gasto.id, { estado_pago: next } as any);
      toast.success(next === 'concretado' ? 'Marcado como concretado' : 'Marcado como pendiente');
      onUpdated?.();
    } catch {
      toast.error('Error actualizando estado');
    } finally {
      setTogglingEstado(false);
    }
  };
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ============ Sync con gasto ============
  useEffect(() => {
    if (!gasto) return;
    setObservaciones(gasto.observaciones || '');
    setObsDirty(false);
    setContacto(null);
    setDependencia(null);

    // Cargar destino
    if (gasto.destino_tipo === 'contacto' && gasto.destino_contacto_id) {
      contactosApi.get(gasto.destino_contacto_id)
        .then(res => setContacto(res.data))
        .catch(() => setContacto(null));
    } else if (gasto.destino_tipo === 'dependencia' && gasto.destino_dependencia_id) {
      dependenciasApi.getOneMunicipio(gasto.destino_dependencia_id)
        .then(res => setDependencia(res.data))
        .catch(() => setDependencia(null));
    }
  }, [gasto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============ Derived ============
  const estadoAgregado = useMemo<EstadoAgregado>(
    () => (gasto ? calcEstadoAgregado(gasto) : 'pendiente'),
    [gasto],
  );

  const resumenCuotas = useMemo(() => {
    const cuotas = gasto?.cuotas || [];
    const total = cuotas.length;
    const pagadas = cuotas.filter(c => c.estado === 'pagada').length;
    const vencidas = cuotas.filter(c => c.estado === 'vencida').length;
    const pendientes = cuotas.filter(c => c.estado === 'pendiente').length;
    const totalPagado = cuotas
      .filter(c => c.estado === 'pagada')
      .reduce((acc, c) => acc + parseFloat(c.monto), 0);
    return { total, pagadas, vencidas, pendientes, totalPagado };
  }, [gasto]);

  if (!gasto) return null;

  const meta = ESTADO_AGREGADO_META[estadoAgregado];
  const monto = parseFloat(gasto.monto_pesos);
  const montoUsd = gasto.monto_usd ? parseFloat(gasto.monto_usd) : null;

  // ============ Handlers ============
  const handleSaveObs = async () => {
    if (!gasto) return;
    setSavingObs(true);
    try {
      await gastosApi.update(gasto.id, { observaciones });
      toast.success('Observaciones guardadas');
      setObsDirty(false);
      onUpdated?.();
    } catch {
      toast.error('Error guardando observaciones');
    } finally {
      setSavingObs(false);
    }
  };

  const handlePagarCuota = async (cuota: GastoCuota) => {
    setPagandoCuotaId(cuota.id);
    try {
      await gastosApi.pagarCuota(cuota.id, {});
      toast.success(`Cuota #${cuota.numero} marcada como pagada`);
      onUpdated?.();
    } catch {
      toast.error('Error registrando el pago');
    } finally {
      setPagandoCuotaId(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await gastosApi.delete(gasto.id);
      toast.success('Gasto eliminado');
      onDeleted?.();
      onClose();
    } catch {
      toast.error('Error eliminando');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // ============ Render ============
  const sheetFooter = (
    <div className="flex items-center justify-between gap-2 w-full flex-wrap">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444440' }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
        {(() => {
          const ep = (gasto as any).estado_pago || 'concretado';
          const isPend = ep === 'pendiente';
          const color = isPend ? '#f59e0b' : '#10b981';
          return (
            <button
              onClick={handleToggleEstado}
              disabled={togglingEstado}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}40` }}
              title={isPend ? 'Marcar como concretado' : 'Marcar como pendiente'}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              {isPend ? 'Pendiente · marcar pago' : 'Concretado · marcar pendiente'}
            </button>
          );
        })()}
      </div>
      <div className="flex items-center gap-2">
        {onEdit && (
          <button
            onClick={() => onEdit(gasto)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
        <PrimaryButton onClick={onClose}>Cerrar</PrimaryButton>
      </div>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Detalle del gasto"
      description={gasto.concepto}
      stickyFooter={sheetFooter}
    >
      <div className="space-y-3">

        {/* ============ Header: concepto + monto + badge estado ============ */}
        <div
          className="rounded-xl p-4"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}10 0%, ${theme.card} 60%)`,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
                Concepto
              </p>
              <p className="text-base font-bold truncate" style={{ color: theme.text }}>
                {gasto.concepto}
              </p>
            </div>
            <span
              className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.color}40` }}
            >
              {meta.label}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-bold tabular-nums" style={{ color: theme.text }}>
              ${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
            {montoUsd && (
              <p className="text-sm font-medium tabular-nums" style={{ color: theme.textSecondary }}>
                USD ${montoUsd.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </p>
            )}
          </div>
          {gasto.descripcion && (
            <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
              {gasto.descripcion}
            </p>
          )}
        </div>

        {/* ============ Destino ============ */}
        <SectionTitle>Destino</SectionTitle>
        {gasto.destino_tipo === 'contacto' ? (
          <div
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Home className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                {contacto
                  ? `${contacto.nombre}${contacto.apellido ? ' ' + contacto.apellido : ''}`
                  : 'Contacto'}
              </p>
              <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                {contacto?.tipo
                  ? contacto.tipo.charAt(0).toUpperCase() + contacto.tipo.slice(1)
                  : 'Contacto del intendente'}
                {contacto?.dni ? ` · DNI ${contacto.dni}` : ''}
              </p>
              {contacto?.direccion && (
                <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                  {contacto.direccion}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: `${dependencia?.color || theme.primary}20`,
                color: dependencia?.color || theme.primary,
              }}
            >
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                {dependencia?.nombre || 'Secretaría / Dependencia'}
              </p>
              <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                Dependencia del municipio
              </p>
            </div>
          </div>
        )}

        {/* ============ Resumen ============ */}
        <SectionTitle>Resumen</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <InfoTile
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Fecha"
            value={new Date(gasto.fecha).toLocaleDateString('es-AR')}
          />
          <InfoTile
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Forma de pago"
            value={FORMA_PAGO_LABEL[gasto.forma_pago] || gasto.forma_pago}
          />
          <InfoTile
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Financiación"
            value={TIPO_FIN_LABEL[gasto.tipo_financiacion] || gasto.tipo_financiacion}
          />
          <InfoTile
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Cotización USD"
            value={gasto.cotizacion_usd
              ? `$${parseFloat(gasto.cotizacion_usd).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
              : '—'}
          />
        </div>

        {resumenCuotas.total > 0 && (
          <div
            className="rounded-xl p-3 grid grid-cols-3 gap-2 text-center"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <ResumenChip color="#10b981" value={resumenCuotas.pagadas} label="Pagadas" />
            <ResumenChip color="#f59e0b" value={resumenCuotas.pendientes} label="Pendientes" />
            <ResumenChip color="#ef4444" value={resumenCuotas.vencidas} label="Vencidas" />
          </div>
        )}

        {/* ============ Cuotas ============ */}
        {(gasto.cuotas?.length ?? 0) > 0 && (
          <>
            <SectionTitle>Cuotas ({gasto.cuotas?.length})</SectionTitle>
            <div className="space-y-1.5">
              {gasto.cuotas?.map(c => (
                <CuotaRow
                  key={c.id}
                  cuota={c}
                  isLoading={pagandoCuotaId === c.id}
                  onPagar={() => handlePagarCuota(c)}
                />
              ))}
            </div>
          </>
        )}

        {/* ============ Observaciones ============ */}
        <SectionTitle>Observaciones</SectionTitle>
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <textarea
            value={observaciones}
            onChange={(e) => { setObservaciones(e.target.value); setObsDirty(true); }}
            placeholder="Anotá comentarios internos sobre este gasto (no se muestra al beneficiario)..."
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 transition-all"
            style={{
              backgroundColor: theme.background,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          />
          {obsDirty && (
            <div className="flex justify-end mt-2 gap-2">
              <button
                onClick={() => {
                  setObservaciones(gasto.observaciones || '');
                  setObsDirty(false);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <PrimaryButton
                onClick={handleSaveObs}
                disabled={savingObs}
                size="sm"
                icon={savingObs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              >
                Guardar
              </PrimaryButton>
            </div>
          )}
        </div>

      </div>

      {/* ============ Confirmación eliminar ============ */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-xl p-5 max-w-sm w-full"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: theme.text }}>
                  ¿Eliminar este gasto?
                </h3>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                  Esta acción dará de baja el gasto y todas sus cuotas asociadas.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
              >
                {deleting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ============================================================
// Subcomponentes
// ============================================================
function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="h-px flex-1" style={{ backgroundColor: theme.border }} />
      <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: theme.textSecondary }}>
        {children}
      </span>
      <div className="h-px flex-1" style={{ backgroundColor: theme.border }} />
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span style={{ color: theme.textSecondary }}>{icon}</span>
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
          {label}
        </p>
      </div>
      <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
        {value}
      </p>
    </div>
  );
}

function ResumenChip({ color, value, label }: { color: string; value: number; label: string }) {
  const { theme } = useTheme();
  return (
    <div>
      <p className="text-lg font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[10px]" style={{ color: theme.textSecondary }}>{label}</p>
    </div>
  );
}

function CuotaRow({
  cuota, isLoading, onPagar,
}: {
  cuota: GastoCuota;
  isLoading: boolean;
  onPagar: () => void;
}) {
  const { theme } = useTheme();
  const meta = CUOTA_META[cuota.estado] || CUOTA_META.pendiente;
  const Icon = meta.Icon;
  const monto = parseFloat(cuota.monto);

  // Detectar vencidas implicitas
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(cuota.fecha_vencimiento);
  const esVencidaImplicita = cuota.estado === 'pendiente' && venc < hoy;
  const realMeta = esVencidaImplicita ? CUOTA_META.vencida : meta;
  const RealIcon = realMeta.Icon;

  return (
    <div
      className="rounded-lg p-2.5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-2.5">
        {/* Numero + estado */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm tabular-nums"
          style={{ backgroundColor: realMeta.bg, color: realMeta.color, border: `1px solid ${realMeta.color}40` }}
          title={realMeta.label}
        >
          {cuota.numero}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <RealIcon className="h-3 w-3 flex-shrink-0" style={{ color: realMeta.color }} />
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: realMeta.color }}>
              {realMeta.label}
            </span>
            <span className="text-[10px]" style={{ color: theme.textSecondary }}>
              · vence {new Date(cuota.fecha_vencimiento).toLocaleDateString('es-AR')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>
              ${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            {cuota.fecha_pago && (
              <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                pagada el {new Date(cuota.fecha_pago).toLocaleDateString('es-AR')}
              </span>
            )}
            {cuota.comprobante && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                title="Comprobante"
              >
                <Receipt className="h-2.5 w-2.5" /> {cuota.comprobante}
              </span>
            )}
          </div>
        </div>

        {/* Accion: marcar pagada */}
        {(cuota.estado === 'pendiente' || cuota.estado === 'vencida') && (
          <button
            onClick={onPagar}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
            style={{ backgroundColor: '#10b98115', color: '#10b981', border: '1px solid #10b98140' }}
            title="Marcar como pagada"
          >
            {isLoading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <CheckCircle2 className="h-3 w-3" />}
            Pagar
          </button>
        )}
      </div>
    </div>
  );
}
