/**
 * Wizard para crear una nueva Orden de Pago en 4 pasos.
 *
 *  1. Beneficiario + concepto    (a contacto / dependencia, concepto, descripcion)
 *  2. Monto + retenciones        (bruto, caja, checkboxes, neto en vivo)
 *  3. Fechas + factura           (emision, vencimiento, nro factura, PDF upload)
 *  4. Resumen + notas            (preview de todo, notas, Guardar)
 *
 * Sigue el patron de CrearGastoWizard. Para EDITAR una OP se usa el Sheet
 * tradicional de OrdenesPago.tsx (esto solo es para "Nueva").
 */
import { useEffect, useMemo, useState } from 'react';
import {
  User as UserIcon, Building2, DollarSign, Calendar, Receipt, CheckCircle2,
  Paperclip, Upload, ExternalLink, Loader2, Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { ModernSelect } from '../ui/ModernSelect';
import { MoneyInput } from '../ui/MoneyInput';
import { DatePicker } from '../ui/DatePicker';
import { useTheme } from '../../contexts/ThemeContext';
import {
  contactosApi, dependenciasApi, cajasApi, retencionesApi, ordenesPagoApi,
} from '../../lib/api';
import type {
  Contacto, Caja, ContaduriaRetencion, RetencionAplicada,
} from '../../types';

interface DepOption { id: number; nombre: string; color?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export function CrearOPWizard({ open, onClose, onSuccess }: Props) {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Catalogos
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [dependencias, setDependencias] = useState<DepOption[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [retencionesCat, setRetencionesCat] = useState<ContaduriaRetencion[]>([]);

  // Form state
  const [destinoTipo, setDestinoTipo] = useState<'contacto' | 'dependencia'>('contacto');
  const [contactoId, setContactoId] = useState<number>(0);
  const [dependenciaId, setDependenciaId] = useState<number>(0);
  const [concepto, setConcepto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoPesos, setMontoPesos] = useState('');
  const [cajaId, setCajaId] = useState<number>(0);
  const [retencionesSel, setRetencionesSel] = useState<Set<number>>(new Set());
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [nroFactura, setNroFactura] = useState('');
  const [facturaUrl, setFacturaUrl] = useState('');
  const [uploadingFactura, setUploadingFactura] = useState(false);
  const [notas, setNotas] = useState('');

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDestinoTipo('contacto');
    setContactoId(0);
    setDependenciaId(0);
    setConcepto('');
    setDescripcion('');
    setMontoPesos('');
    setRetencionesSel(new Set());
    setFechaEmision(new Date().toISOString().slice(0, 10));
    setFechaVencimiento('');
    setNroFactura('');
    setFacturaUrl('');
    setNotas('');
  }, [open]);

  // Cargar catalogos al abrir
  useEffect(() => {
    if (!open) return;
    Promise.all([
      contactosApi.list({ activo: true, limit: 5000 }),
      dependenciasApi.getMunicipio({ activo: true }),
      cajasApi.list({ activo: true, include_saldos: true }),
      retencionesApi.list({ activo: true }).catch(() => ({ data: [] as ContaduriaRetencion[] })),
    ]).then(([c, d, cj, r]) => {
      setContactos(c.data || []);
      setDependencias(d.data || []);
      setCajas(cj.data || []);
      setRetencionesCat(r.data || []);
      if ((cj.data || []).length > 0) setCajaId(cj.data[0].id);
    }).catch(() => toast.error('Error cargando catálogos'));
  }, [open]);

  // Calculo neto en vivo
  const retencionesAplicadas: RetencionAplicada[] = useMemo(() => {
    const bruto = parseFloat(montoPesos || '0') || 0;
    return retencionesCat
      .filter(r => retencionesSel.has(r.id))
      .map(r => ({
        id: r.id,
        nombre: r.nombre,
        porcentaje: parseFloat(r.porcentaje),
        monto: Math.round((bruto * parseFloat(r.porcentaje) / 100) * 100) / 100,
      }));
  }, [retencionesCat, retencionesSel, montoPesos]);
  const totalRetenido = retencionesAplicadas.reduce((s, r) => s + r.monto, 0);
  const netoPagar = Math.max(0, (parseFloat(montoPesos || '0') || 0) - totalRetenido);

  // Beneficiario nombre (para el resumen)
  const beneficiarioNombre = useMemo(() => {
    if (destinoTipo === 'contacto') {
      const c = contactos.find(x => x.id === contactoId);
      return c ? `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}` : '';
    }
    return dependencias.find(d => d.id === dependenciaId)?.nombre || '';
  }, [destinoTipo, contactoId, dependenciaId, contactos, dependencias]);

  // Validaciones por step
  const step1Valid = !!concepto.trim() && (
    (destinoTipo === 'contacto' && contactoId > 0) ||
    (destinoTipo === 'dependencia' && dependenciaId > 0)
  );
  const step2Valid = !!montoPesos && parseFloat(montoPesos) > 0;
  const step3Valid = !!fechaEmision;

  const handleGuardar = async () => {
    if (!step1Valid || !step2Valid || !step3Valid) {
      return toast.error('Faltan datos obligatorios');
    }
    setSaving(true);
    try {
      await ordenesPagoApi.create({
        destino_tipo: destinoTipo,
        destino_contacto_id: destinoTipo === 'contacto' ? contactoId : null,
        destino_dependencia_id: destinoTipo === 'dependencia' ? dependenciaId : null,
        concepto: concepto.trim(),
        descripcion: descripcion.trim() || null,
        monto_pesos: montoPesos,
        retenciones: retencionesAplicadas,
        caja_id: cajaId || null,
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVencimiento || null,
        nro_factura: nroFactura.trim() || null,
        factura_url: facturaUrl || null,
        notas: notas.trim() || null,
      });
      toast.success('Orden de pago creada');
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  // ============ Step contents ============
  const step1Content = (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-2" style={{ color: theme.textSecondary }}>
          ¿A quién se le paga? *
        </label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(['contacto', 'dependencia'] as const).map(t => {
            const active = destinoTipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setDestinoTipo(t)}
                className="px-4 py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95"
                style={{
                  backgroundColor: active ? theme.primary : theme.card,
                  color: active ? '#fff' : theme.text,
                  border: `1.5px solid ${active ? theme.primary : theme.border}`,
                }}
              >
                {t === 'contacto' ? <UserIcon className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                {t === 'contacto' ? 'A una persona' : 'A una secretaría'}
              </button>
            );
          })}
        </div>
        {destinoTipo === 'contacto' ? (
          <ModernSelect
            value={contactoId ? String(contactoId) : ''}
            onChange={(v) => setContactoId(v ? Number(v) : 0)}
            options={contactos.map(c => ({
              value: String(c.id),
              label: `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}`,
            }))}
            placeholder="Elegí un contacto"
            searchable
          />
        ) : (
          <ModernSelect
            value={dependenciaId ? String(dependenciaId) : ''}
            onChange={(v) => setDependenciaId(v ? Number(v) : 0)}
            options={dependencias.map(d => ({ value: String(d.id), label: d.nombre, color: d.color }))}
            placeholder="Elegí una secretaría"
            searchable
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Concepto *</label>
        <input
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Ej: Materiales obra plaza central"
          className="w-full px-3 py-2.5 rounded-lg text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Descripción / Detalle</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Detalle del gasto, observaciones..."
          className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>
    </div>
  );

  const step2Content = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Monto bruto *</label>
          <MoneyInput
            value={montoPesos}
            onChange={setMontoPesos}
            className="w-full px-3 py-2.5 rounded-lg text-base tabular-nums font-bold"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Caja (opcional)</label>
          <ModernSelect
            value={cajaId ? String(cajaId) : ''}
            onChange={(v) => setCajaId(v ? Number(v) : 0)}
            options={[
              { value: '', label: 'Elegir al pagar' },
              ...cajas.map(c => ({ value: String(c.id), label: c.nombre, color: c.color || undefined })),
            ]}
            placeholder="Elegir al pagar"
          />
        </div>
      </div>

      {retencionesCat.length > 0 && (
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
        >
          <p className="text-[10px] uppercase font-bold mb-2 inline-flex items-center gap-1" style={{ color: theme.textSecondary }}>
            <Percent className="h-3 w-3" />
            Retenciones aplicables al pago
          </p>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {retencionesCat.map(r => {
              const checked = retencionesSel.has(r.id);
              const bruto = parseFloat(montoPesos || '0') || 0;
              const monto = Math.round((bruto * parseFloat(r.porcentaje) / 100) * 100) / 100;
              const color = r.color || theme.primary;
              return (
                <label
                  key={r.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all"
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
              className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
              style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
            >
              <div className="text-[11px]" style={{ color: theme.textSecondary }}>
                Bruto {fmtMoney(parseFloat(montoPesos || '0'))} − Retenido {fmtMoney(totalRetenido)}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Neto a pagar</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: theme.primary }}>{fmtMoney(netoPagar)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const step3Content = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Fecha emisión *</label>
          <DatePicker value={fechaEmision} onChange={setFechaEmision} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Vencimiento (opcional)</label>
          <DatePicker value={fechaVencimiento} onChange={setFechaVencimiento} allowClear />
        </div>
      </div>

      <div
        className="rounded-xl p-3"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
      >
        <p className="text-[10px] uppercase font-bold mb-2 inline-flex items-center gap-1" style={{ color: theme.textSecondary }}>
          <Paperclip className="h-3 w-3" />
          Factura del proveedor (opcional)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-semibold mb-1" style={{ color: theme.textSecondary }}>Nº de factura</label>
            <input
              type="text"
              value={nroFactura}
              onChange={(e) => setNroFactura(e.target.value)}
              placeholder="Ej: A-0001-00012345"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono"
              style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold mb-1" style={{ color: theme.textSecondary }}>Archivo PDF / imagen</label>
            {facturaUrl ? (
              <div className="flex items-center gap-1.5">
                <a
                  href={facturaUrl}
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
                  onClick={() => setFacturaUrl('')}
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
                      setFacturaUrl(res.data.url);
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
    </div>
  );

  const step4Content = (
    <div className="space-y-3">
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div
          className="px-4 py-2.5"
          style={{ backgroundColor: `${theme.primary}10`, borderBottom: `1px solid ${theme.border}` }}
        >
          <p className="text-[10px] uppercase font-bold" style={{ color: theme.primary }}>Resumen de la OP</p>
        </div>
        <div className="divide-y" style={{ borderColor: theme.border }}>
          <ResumenRow
            icon={destinoTipo === 'contacto' ? <UserIcon className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            label="Beneficiario"
            value={beneficiarioNombre || '—'}
          />
          <ResumenRow icon={<Receipt className="h-4 w-4" />} label="Concepto" value={concepto || '—'} />
          <ResumenRow
            icon={<DollarSign className="h-4 w-4" />}
            label="Monto bruto"
            value={fmtMoney(montoPesos || 0)}
          />
          {retencionesAplicadas.length > 0 && (
            <>
              {retencionesAplicadas.map(r => (
                <ResumenRow
                  key={r.id}
                  icon={<Percent className="h-4 w-4" style={{ color: '#ef4444' }} />}
                  label={`${r.nombre} (${r.porcentaje}%)`}
                  value={`− ${fmtMoney(r.monto)}`}
                  valueColor="#ef4444"
                />
              ))}
              <ResumenRow
                icon={<CheckCircle2 className="h-4 w-4" style={{ color: theme.primary }} />}
                label="Neto a pagar"
                value={fmtMoney(netoPagar)}
                valueColor={theme.primary}
                bold
              />
            </>
          )}
          <ResumenRow
            icon={<Calendar className="h-4 w-4" />}
            label="Fecha emisión"
            value={fechaEmision ? new Date(fechaEmision).toLocaleDateString('es-AR') : '—'}
          />
          {fechaVencimiento && (
            <ResumenRow
              icon={<Calendar className="h-4 w-4" />}
              label="Vencimiento"
              value={new Date(fechaVencimiento).toLocaleDateString('es-AR')}
            />
          )}
          {nroFactura && (
            <ResumenRow icon={<Paperclip className="h-4 w-4" />} label="Nº factura" value={nroFactura} />
          )}
          {cajaId > 0 && (
            <ResumenRow
              icon={<DollarSign className="h-4 w-4" />}
              label="Caja"
              value={cajas.find(c => c.id === cajaId)?.nombre || ''}
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Notas internas (opcional)</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Observaciones para el equipo del muni..."
          className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
      </div>
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: 'beneficiario',
      title: 'Beneficiario',
      description: 'A quién pagar y por qué concepto',
      icon: <UserIcon className="h-4 w-4" />,
      content: step1Content,
      isValid: step1Valid,
    },
    {
      id: 'monto',
      title: 'Monto y retenciones',
      description: 'Bruto, caja y descuentos impositivos',
      icon: <DollarSign className="h-4 w-4" />,
      content: step2Content,
      isValid: step2Valid,
    },
    {
      id: 'fechas',
      title: 'Fechas y factura',
      description: 'Vencimiento y comprobante del proveedor',
      icon: <Calendar className="h-4 w-4" />,
      content: step3Content,
      isValid: step3Valid,
    },
    {
      id: 'resumen',
      title: 'Confirmar',
      description: 'Revisar antes de guardar',
      icon: <CheckCircle2 className="h-4 w-4" />,
      content: step4Content,
      isValid: true,
    },
  ];

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="Nueva Orden de Pago"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onComplete={handleGuardar}
      loading={saving}
      completeLabel="Guardar OP"
    />
  );
}

function ResumenRow({
  icon, label, value, valueColor, bold,
}: { icon: React.ReactNode; label: string; value: string; valueColor?: string; bold?: boolean }) {
  const { theme } = useTheme();
  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <span style={{ color: theme.textSecondary }}>{icon}</span>
      <span className="text-xs flex-1" style={{ color: theme.textSecondary }}>{label}</span>
      <span
        className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'}`}
        style={{ color: valueColor || theme.text }}
      >
        {value}
      </span>
    </div>
  );
}
