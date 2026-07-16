import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, Wallet, DollarSign, CreditCard, Receipt,
  CheckCircle2, Clock, AlertTriangle, Ban, Building2,
  Home, Save, Loader2,
  Trash2, Pencil, X, User as UserIcon, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { PrimaryButton } from '../ui/PrimaryButton';
import { ModernSelect } from '../ui/ModernSelect';
import { DatePicker } from '../ui/DatePicker';
import { ConfirmModal } from '../ui/ConfirmModal';
import { MoneyInput } from '../ui/MoneyInput';
import { useTheme } from '../../contexts/ThemeContext';
import { gastosApi, contactosApi, dependenciasApi, cajasApi } from '../../lib/api';
import { formatFechaAR, parseFechaLocal } from '../../lib/tesoreria-helpers';
import type {
  Gasto, GastoCuota, EstadoGastoCuota, Contacto, Caja,
  DestinoGasto, TipoFinanciacion, FormaPago, FrecuenciaRecurrencia,
} from '../../types';

// ============================================================
// Estado agregado del gasto (computado desde cuotas)
// ============================================================
export type EstadoAgregado = 'al_dia' | 'en_mora' | 'pendiente' | 'completado';

export function calcEstadoAgregado(g: Gasto): EstadoAgregado {
  // El estado que eligió el operador en el wizard (concretado/al_dia/pendiente)
  // es la fuente de verdad: la grilla y el filtro muestran EXACTAMENTE eso, sin
  // recalcular desde las cuotas. Mapeo de label: concretado -> 'Completado'.
  const ep = (g as any).estado_pago;
  if (ep === 'pendiente')  return 'pendiente';
  if (ep === 'al_dia')     return 'al_dia';
  if (ep === 'concretado') return 'completado';

  // Fallback solo para gastos viejos sin estado_pago: derivar de cuotas.
  const cuotas = g.cuotas || [];
  if (cuotas.length === 0) return 'completado';
  if (cuotas.every(c => c.estado === 'pagada')) return 'completado';
  return cuotas.some(c => c.estado === 'pagada') ? 'al_dia' : 'pendiente';
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
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [allContactos, setAllContactos] = useState<Contacto[]>([]);
  const [allDependencias, setAllDependencias] = useState<DependenciaLite[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [generandoOP, setGenerandoOP] = useState(false);

  // ============ Edit mode ============
  // Toggle "Editar" arriba del Sheet. Cuando editMode=true, los campos
  // del header/resumen/destino se vuelven inputs. Footer cambia a
  // Guardar/Cancelar. Por ahora todo es editable; en el futuro va a
  // haber un control en settings para restringir.
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{
    concepto: string;
    descripcion: string;
    monto_pesos: string;
    fecha: string;
    forma_pago: FormaPago;
    tipo_financiacion: TipoFinanciacion;
    cuotas_total: number;
    frecuencia: FrecuenciaRecurrencia;
    fecha_fin_recurrencia: string;
    caja_id: number | null;
    destino_tipo: DestinoGasto;
    destino_contacto_id: number | null;
    destino_dependencia_id: number | null;
    nro_factura: string;
    factura_url: string;
  } | null>(null);
  const [editUploadingFactura, setEditUploadingFactura] = useState(false);
  const editFacturaInputRef = useRef<HTMLInputElement>(null);

  // ============ Handlers de factura adjunta en modo edicion ============
  const handleEditUploadFactura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editForm) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo supera 10MB');
      return;
    }
    setEditUploadingFactura(true);
    try {
      const res = await gastosApi.uploadFactura(file);
      setEditForm({ ...editForm, factura_url: res.data.url });
      toast.success('Factura adjuntada');
    } catch {
      toast.error('No se pudo subir el archivo');
    } finally {
      setEditUploadingFactura(false);
      if (editFacturaInputRef.current) editFacturaInputRef.current.value = '';
    }
  };

  const handleEditRemoveFactura = () => {
    if (!editForm) return;
    setEditForm({ ...editForm, factura_url: '' });
  };
  const [savingEdit, setSavingEdit] = useState(false);
  // Si el backend devuelve 409 (cuotas pagadas existentes), guardamos
  // el payload + cantidad para mostrar el ConfirmModal y reintentar
  // con force_regenerate=true si el user confirma.
  const [regenConfirm, setRegenConfirm] = useState<{
    payload: Record<string, unknown>;
    cuotasPagadas: number;
  } | null>(null);
  const [obsDirty, setObsDirty] = useState(false);
  const [savingObs, setSavingObs] = useState(false);
  const [pagandoCuotaId, setPagandoCuotaId] = useState<number | null>(null);
  const [togglingEstado, setTogglingEstado] = useState(false);

  // Toggle estado: ciclo concretado -> al_dia -> pendiente -> concretado.
  // El caso mas comun (al_dia -> concretado) se cubre asi en un click.
  const handleToggleEstado = async () => {
    if (!gasto) return;
    const actual = (gasto as any).estado_pago || 'concretado';
    const next = actual === 'concretado'
      ? 'al_dia'
      : actual === 'al_dia'
        ? 'pendiente'
        : 'concretado';
    const labels: Record<string, string> = {
      concretado: 'Concretado',
      al_dia: 'Al día',
      pendiente: 'Pendiente',
    };
    setTogglingEstado(true);
    try {
      await gastosApi.update(gasto.id, { estado_pago: next } as any);
      toast.success(`Marcado como ${labels[next]}`);
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

  // Cargar catalogos cuando se abre el sheet. Cajas son pocas; contactos
  // y dependencias se cargan completos para el modo edicion (combos del
  // destino). En modo solo-vista contactos no hace falta porque ya tenemos
  // el `contacto` puntual del gasto.
  useEffect(() => {
    if (!open) return;
    if (cajas.length === 0) {
      cajasApi.list({ activo: true })
        .then(res => setCajas(res.data || []))
        .catch(() => setCajas([]));
    }
    if (allContactos.length === 0) {
      contactosApi.list({ activo: true, limit: 5000 })
        .then(res => setAllContactos(res.data || []))
        .catch(() => setAllContactos([]));
    }
    if (allDependencias.length === 0) {
      dependenciasApi.getMunicipio({ activo: true })
        .then(res => setAllDependencias(res.data || []))
        .catch(() => setAllDependencias([]));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ============ Edit mode handlers ============
  const entrarEnEdicion = () => {
    if (!gasto) return;
    setEditForm({
      concepto: gasto.concepto || '',
      descripcion: gasto.descripcion || '',
      monto_pesos: gasto.monto_pesos || '',
      fecha: (gasto.fecha || '').slice(0, 10),
      forma_pago: gasto.forma_pago,
      tipo_financiacion: gasto.tipo_financiacion,
      cuotas_total: gasto.cuotas_total || 1,
      frecuencia: gasto.frecuencia || 'mensual',
      fecha_fin_recurrencia: (gasto.fecha_fin_recurrencia || '').slice(0, 10),
      caja_id: (gasto as any).caja_id ?? null,
      destino_tipo: gasto.destino_tipo,
      destino_contacto_id: gasto.destino_contacto_id ?? null,
      destino_dependencia_id: gasto.destino_dependencia_id ?? null,
      nro_factura: (gasto as Gasto & { nro_factura?: string }).nro_factura || '',
      factura_url: (gasto as Gasto & { factura_url?: string }).factura_url || '',
    });
    setEditMode(true);
  };

  const cancelarEdicion = () => {
    setEditMode(false);
    setEditForm(null);
  };

  const guardarEdicion = async () => {
    if (!gasto || !editForm) return;
    // Validaciones basicas
    if (!editForm.concepto.trim()) return toast.error('Falta el concepto');
    if (!editForm.monto_pesos || parseFloat(editForm.monto_pesos) <= 0) {
      return toast.error('Monto invalido');
    }
    if (!editForm.caja_id) return toast.error('Elegi una caja');
    if (editForm.destino_tipo === 'contacto' && !editForm.destino_contacto_id) {
      return toast.error('Elegi un contacto');
    }
    if (editForm.destino_tipo === 'dependencia' && !editForm.destino_dependencia_id) {
      return toast.error('Elegi una secretaria');
    }

    setSavingEdit(true);
    try {
      // Solo mandar los campos que realmente cambiaron. Si mandamos todos,
      // el backend ve `monto_pesos` siempre presente y dispara la regla
      // "requiere regenerar cuotas" -> falla con 409 aunque el monto sea
      // el mismo (comparacion str vs Decimal con formato distinto).
      const payload: Record<string, unknown> = {};
      const conceptoNuevo = editForm.concepto.trim();
      if (conceptoNuevo !== (gasto.concepto || '')) payload.concepto = conceptoNuevo;
      const descNueva = editForm.descripcion.trim() || null;
      if (descNueva !== (gasto.descripcion || null)) payload.descripcion = descNueva;

      // Numericos: comparar como float para no chocar con formato
      // ('45000' vs '45000.00').
      const montoActual = parseFloat(gasto.monto_pesos || '0');
      const montoNuevo = parseFloat(editForm.monto_pesos || '0');
      if (montoNuevo !== montoActual) payload.monto_pesos = editForm.monto_pesos;

      // Fechas: comparar las primeras 10 chars (YYYY-MM-DD).
      const fechaActual = (gasto.fecha || '').slice(0, 10);
      if (editForm.fecha !== fechaActual) payload.fecha = editForm.fecha;

      if (editForm.forma_pago !== gasto.forma_pago) payload.forma_pago = editForm.forma_pago;
      if (editForm.tipo_financiacion !== gasto.tipo_financiacion) payload.tipo_financiacion = editForm.tipo_financiacion;
      if (editForm.caja_id !== ((gasto as any).caja_id ?? null)) payload.caja_id = editForm.caja_id;

      // Destino: si cambia el tipo, mandamos el tipo + el id correspondiente.
      // Si solo cambia el id (dentro del mismo tipo), mandamos solo el id.
      if (editForm.destino_tipo !== gasto.destino_tipo) {
        payload.destino_tipo = editForm.destino_tipo;
        payload.destino_contacto_id = editForm.destino_tipo === 'contacto' ? editForm.destino_contacto_id : null;
        payload.destino_dependencia_id = editForm.destino_tipo === 'dependencia' ? editForm.destino_dependencia_id : null;
      } else if (editForm.destino_tipo === 'contacto' && editForm.destino_contacto_id !== (gasto.destino_contacto_id ?? null)) {
        payload.destino_contacto_id = editForm.destino_contacto_id;
      } else if (editForm.destino_tipo === 'dependencia' && editForm.destino_dependencia_id !== (gasto.destino_dependencia_id ?? null)) {
        payload.destino_dependencia_id = editForm.destino_dependencia_id;
      }

      // Campos condicionales segun tipo de financiacion.
      if (editForm.tipo_financiacion === 'cuotas' || editForm.tipo_financiacion === 'prestamo') {
        if (editForm.cuotas_total !== (gasto.cuotas_total || 1)) {
          payload.cuotas_total = editForm.cuotas_total;
        }
      }
      if (editForm.tipo_financiacion === 'recurrente') {
        if (editForm.frecuencia !== (gasto.frecuencia || 'mensual')) {
          payload.frecuencia = editForm.frecuencia;
        }
        const fechaFinActual = (gasto.fecha_fin_recurrencia || '').slice(0, 10);
        if (editForm.fecha_fin_recurrencia !== fechaFinActual) {
          payload.fecha_fin_recurrencia = editForm.fecha_fin_recurrencia || null;
        }
      }

      // Factura adjunta: nro + URL. Comparamos con el original del gasto;
      // si cambio (borraron, agregaron o reemplazaron) mandamos el nuevo
      // valor. null borra el campo en la DB.
      const nroFacturaActual = (gasto as Gasto & { nro_factura?: string }).nro_factura || '';
      const facturaUrlActual = (gasto as Gasto & { factura_url?: string }).factura_url || '';
      const nroNuevo = editForm.nro_factura.trim();
      if (nroNuevo !== nroFacturaActual) {
        payload.nro_factura = nroNuevo || null;
      }
      if (editForm.factura_url !== facturaUrlActual) {
        payload.factura_url = editForm.factura_url || null;
      }

      // Si no cambio nada, no llamamos al backend.
      if (Object.keys(payload).length === 0) {
        toast.info('No hay cambios para guardar');
        setEditMode(false);
        setEditForm(null);
        setSavingEdit(false);
        return;
      }

      await persistirEdicion(payload, false);
    } catch (e: any) {
      // Cualquier error que no sea 409 lo mostramos como toast.
      // El 409 lo maneja persistirEdicion (abre ConfirmModal).
      const detail = e?.response?.data?.detail;
      if (typeof detail === 'string') {
        toast.error(detail);
      } else {
        toast.error('Error guardando');
      }
    } finally {
      setSavingEdit(false);
    }
  };

  // Llamada real al backend. Si el backend devuelve 409 con cuotas
  // pagadas, abrimos un ConfirmModal y dejamos el payload pendiente
  // para reintentar con force_regenerate=true.
  const persistirEdicion = async (payload: Record<string, unknown>, forceRegenerate: boolean) => {
    if (!gasto) return;
    try {
      await gastosApi.update(gasto.id, payload, forceRegenerate);
      toast.success('Gasto actualizado');
      setEditMode(false);
      setEditForm(null);
      setRegenConfirm(null);
      onUpdated?.();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      // 409 estructurado del backend: cuotas pagadas que se van a borrar.
      if (status === 409 && detail && typeof detail === 'object' && detail.code === 'cuotas_pagadas_existentes') {
        setRegenConfirm({ payload, cuotasPagadas: detail.cuotas_pagadas || 0 });
        setSavingEdit(false);
        return;
      }
      throw e; // lo agarra el caller
    }
  };

  const confirmarRegenerar = async () => {
    if (!regenConfirm) return;
    setSavingEdit(true);
    try {
      await persistirEdicion(regenConfirm.payload, true);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error guardando');
    } finally {
      setSavingEdit(false);
    }
  };

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
  // Footer en modo edicion: Guardar + Cancelar reemplazan todo lo demas
  const sheetFooterEdit = (
    <div className="flex items-center justify-end gap-2 w-full">
      <button
        onClick={cancelarEdicion}
        disabled={savingEdit}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
      >
        <X className="h-3.5 w-3.5" /> Cancelar
      </button>
      <PrimaryButton
        onClick={guardarEdicion}
        disabled={savingEdit}
        icon={savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      >
        Guardar cambios
      </PrimaryButton>
    </div>
  );

  const handleGenerarOP = async () => {
    if (!gasto) return;
    setGenerandoOP(true);
    try {
      const res = await gastosApi.generarOP(gasto.id);
      const { op_id, numero, ya_existe } = res.data;
      // Bajar el PDF con auth (no se puede usar window.open(url) porque
      // el endpoint requiere el header Authorization).
      const pdfRes = await gastosApi.descargarOPPdf(op_id);
      const blob = new Blob([pdfRes.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Liberar el ObjectURL despues de un rato (la pestania ya lo tiene cargado)
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(
        ya_existe
          ? `Orden de Pago ${numero} (ya existia, se reabrio el PDF)`
          : `Orden de Pago ${numero} generada`,
      );
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No se pudo generar la OP';
      toast.error(msg);
    } finally {
      setGenerandoOP(false);
    }
  };

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
        <button
          onClick={handleGenerarOP}
          disabled={generandoOP}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: theme.primary + '15', color: theme.primary, border: `1px solid ${theme.primary}40` }}
          title="Generar Orden de Pago en PDF"
        >
          {generandoOP ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Generar OP
        </button>
        <button
          onClick={entrarEnEdicion}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        <PrimaryButton onClick={onClose}>Cerrar</PrimaryButton>
      </div>
    </div>
  );

  // Si la prop onEdit del padre todavia se usa, lo conservamos (compatibilidad).
  // Pero la edicion principal ahora es el modo embebido (editMode).
  void onEdit;

  return (
    <>
    <Sheet
      open={open}
      onClose={editMode ? cancelarEdicion : onClose}
      title={editMode ? 'Editar gasto' : 'Detalle del gasto'}
      description={gasto.concepto}
      stickyFooter={editMode ? sheetFooterEdit : sheetFooter}
    >
      {editMode && editForm ? (
        // ============================================================
        // MODO EDICION: form completo con todos los campos editables
        // ============================================================
        <div className="space-y-4">
          {/* Aviso si va a regenerar cuotas */}
          {(() => {
            const cambiaMonto = String(editForm.monto_pesos) !== String(gasto.monto_pesos);
            const cambiaFecha = editForm.fecha !== gasto.fecha?.slice(0, 10);
            const cambiaFinan = editForm.tipo_financiacion !== gasto.tipo_financiacion;
            const cambiaCuotas = editForm.cuotas_total !== (gasto.cuotas_total || 1);
            const regenera = cambiaMonto || cambiaFecha || cambiaFinan || cambiaCuotas;
            if (!regenera) return null;
            return (
              <div
                className="p-3 rounded-xl text-xs flex items-start gap-2"
                style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b40', color: theme.text }}
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                <span>
                  Cambiar monto, fecha, financiación o cantidad de cuotas <b>regenera el plan de cuotas</b>.
                  Si el gasto es a cuotas y hay alguna pagada, te vamos a pedir confirmación antes de borrarla.
                </span>
              </div>
            );
          })()}

          {/* Concepto */}
          <div>
            <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
              Concepto
            </label>
            <input
              type="text"
              value={editForm.concepto}
              onChange={(e) => setEditForm({ ...editForm, concepto: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          {/* Descripcion */}
          <div>
            <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
              Descripción
            </label>
            <textarea
              value={editForm.descripcion}
              onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          {/* Monto + Fecha */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                Monto en pesos
              </label>
              <MoneyInput
                value={editForm.monto_pesos}
                onChange={(v) => setEditForm({ ...editForm, monto_pesos: v })}
                className="w-full px-3 py-2 rounded-lg text-sm tabular-nums"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                Fecha
              </label>
              <DatePicker
                value={editForm.fecha}
                onChange={(v) => setEditForm({ ...editForm, fecha: v })}
              />
            </div>
          </div>

          {/* Destino: tabs contacto/dependencia + select */}
          <div>
            <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
              Destino
            </label>
            <div className="flex gap-2 mb-2">
              {(['contacto', 'dependencia'] as DestinoGasto[]).map(t => {
                const active = editForm.destino_tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, destino_tipo: t })}
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
            {editForm.destino_tipo === 'contacto' ? (
              <ModernSelect
                value={editForm.destino_contacto_id ? String(editForm.destino_contacto_id) : ''}
                onChange={(v) => setEditForm({ ...editForm, destino_contacto_id: v ? Number(v) : null })}
                options={allContactos.map(c => ({
                  value: String(c.id),
                  label: `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}`,
                }))}
                placeholder="Elegí un contacto"
                searchable
              />
            ) : (
              <ModernSelect
                value={editForm.destino_dependencia_id ? String(editForm.destino_dependencia_id) : ''}
                onChange={(v) => setEditForm({ ...editForm, destino_dependencia_id: v ? Number(v) : null })}
                options={allDependencias.map(d => ({
                  value: String(d.id),
                  label: d.nombre,
                  color: d.color || undefined,
                }))}
                placeholder="Elegí una secretaría"
                searchable
              />
            )}
          </div>

          {/* Caja + Forma de pago */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                Caja
              </label>
              <ModernSelect
                value={editForm.caja_id ? String(editForm.caja_id) : ''}
                onChange={(v) => setEditForm({ ...editForm, caja_id: v ? Number(v) : null })}
                options={cajas.map(c => ({
                  value: String(c.id),
                  label: c.nombre,
                  color: c.color || undefined,
                }))}
                placeholder="Elegí una caja"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                Forma de pago
              </label>
              <ModernSelect
                value={editForm.forma_pago}
                onChange={(v) => setEditForm({ ...editForm, forma_pago: v as FormaPago })}
                options={Object.entries(FORMA_PAGO_LABEL).map(([k, l]) => ({ value: k, label: l }))}
              />
            </div>
          </div>

          {/* Financiacion */}
          <div>
            <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
              Tipo de financiación
            </label>
            <ModernSelect
              value={editForm.tipo_financiacion}
              onChange={(v) => setEditForm({ ...editForm, tipo_financiacion: v as TipoFinanciacion })}
              options={Object.entries(TIPO_FIN_LABEL).map(([k, l]) => ({ value: k, label: l }))}
            />
          </div>

          {/* Campos condicionales segun tipo de financiacion */}
          {(editForm.tipo_financiacion === 'cuotas' || editForm.tipo_financiacion === 'prestamo') && (
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                Cantidad de cuotas
              </label>
              <input
                type="number"
                value={editForm.cuotas_total}
                onChange={(e) => setEditForm({ ...editForm, cuotas_total: parseInt(e.target.value || '1', 10) })}
                min="1"
                max="120"
                className="w-32 px-3 py-2 rounded-lg text-sm tabular-nums"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              />
            </div>
          )}
          {editForm.tipo_financiacion === 'recurrente' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                  Frecuencia
                </label>
                <ModernSelect
                  value={editForm.frecuencia}
                  onChange={(v) => setEditForm({ ...editForm, frecuencia: v as FrecuenciaRecurrencia })}
                  options={[
                    { value: 'semanal', label: 'Semanal' },
                    { value: 'quincenal', label: 'Quincenal' },
                    { value: 'mensual', label: 'Mensual' },
                    { value: 'bimestral', label: 'Bimestral' },
                    { value: 'trimestral', label: 'Trimestral' },
                    { value: 'anual', label: 'Anual' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                  Hasta fecha (opcional)
                </label>
                <DatePicker
                  value={editForm.fecha_fin_recurrencia}
                  onChange={(v) => setEditForm({ ...editForm, fecha_fin_recurrencia: v })}
                  allowClear
                />
              </div>
            </div>
          )}

          {/* ============ Factura adjunta (editable) ============ */}
          <div
            className="p-3 rounded-xl space-y-2"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <label className="block text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
              Factura del proveedor (opcional)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: theme.textSecondary }}>N° de factura</p>
                <input
                  type="text"
                  value={editForm.nro_factura}
                  onChange={(e) => setEditForm({ ...editForm, nro_factura: e.target.value })}
                  placeholder="Ej: A-0001-00012345"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: theme.textSecondary }}>Archivo PDF / imagen</p>
                <input
                  ref={editFacturaInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleEditUploadFactura}
                  className="hidden"
                />
                {editForm.factura_url ? (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
                    <a
                      href={editForm.factura_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate hover:underline"
                      style={{ color: theme.primary }}
                    >
                      Ver archivo adjunto
                    </a>
                    <button
                      type="button"
                      onClick={handleEditRemoveFactura}
                      className="p-1 rounded hover:bg-red-100 transition-colors"
                      title="Quitar archivo"
                    >
                      <X className="h-4 w-4" style={{ color: '#ef4444' }} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => editFacturaInputRef.current?.click()}
                    disabled={editUploadingFactura}
                    className="w-full px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-[1.005] active:scale-[0.995] disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: theme.card,
                      border: `1px dashed ${theme.border}`,
                      color: theme.text,
                    }}
                  >
                    {editUploadingFactura ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Subir archivo
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
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
            value={formatFechaAR(gasto.fecha)}
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
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Caja"
            value={(() => {
              const cajaId = (gasto as any).caja_id;
              if (!cajaId) return 'Sin asignar';
              const c = cajas.find(x => x.id === cajaId);
              return c ? c.nombre : `#${cajaId}`;
            })()}
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
      )}

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

    <ConfirmModal
      isOpen={!!regenConfirm}
      onClose={() => setRegenConfirm(null)}
      onConfirm={confirmarRegenerar}
      loading={savingEdit}
      title="¿Regenerar plan de pagos?"
      variant="warning"
      confirmText="Sí, regenerar"
      cancelText="Cancelar"
      message={
        regenConfirm ? (
          <div className="space-y-2">
            <p>
              Este gasto tiene <b>{regenConfirm.cuotasPagadas} cuota(s) pagada(s)</b>.
              Al cambiar monto, fecha o financiación, esas cuotas se van a
              borrar y se va a crear un plan nuevo desde cero.
            </p>
            <p className="text-sm opacity-75">
              Si solo querés corregir un dato menor (ej. concepto, caja, proveedor),
              cancelá y guardá sin tocar monto/fecha/financiación.
            </p>
          </div>
        ) : ''
      }
    />
  </>
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
  const venc = parseFechaLocal(cuota.fecha_vencimiento);
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
              · vence {formatFechaAR(cuota.fecha_vencimiento)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>
              ${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            {cuota.fecha_pago && (
              <span className="text-[10px]" style={{ color: theme.textSecondary }}>
                pagada el {formatFechaAR(cuota.fecha_pago)}
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
