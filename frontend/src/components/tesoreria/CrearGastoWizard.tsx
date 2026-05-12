import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, DollarSign, Building2, User as UserIcon, FileText, Loader2, Sparkles, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { ModernSelect } from '../ui/ModernSelect';
import { useTheme } from '../../contexts/ThemeContext';
import {
  contactosApi, dependenciasApi, gastosApi, cotizacionApi, tesoreriaCatalogoApi,
} from '../../lib/api';
import type {
  Contacto, ConceptosCatalogo, CotizacionUSD, TipoFinanciacion,
  FrecuenciaRecurrencia, FormaPago, DestinoGasto,
} from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface DepOption { id: number; nombre: string; color?: string }

const FORMAS_PAGO: { value: FormaPago; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'mercadopago', label: 'MercadoPago' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

const FRECUENCIAS: { value: FrecuenciaRecurrencia; label: string }[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];

/**
 * Wizard guiado para cargar un gasto nuevo.
 *
 * 5 pasos: Concepto → Destino → Monto → Financiación → Confirmar.
 * Pensado para que el intendente cargue rápido un gasto típico (sueldo,
 * aporte, etc.). Defaults bien pensados para que casi todo esté listo
 * antes de tocar nada.
 */
export function CrearGastoWizard({ open, onClose, onSuccess }: Props) {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Catalogos
  const [conceptos, setConceptos] = useState<ConceptosCatalogo | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [dependencias, setDependencias] = useState<DepOption[]>([]);
  const [cotizacion, setCotizacion] = useState<CotizacionUSD | null>(null);

  // Form state
  const [concepto, setConcepto] = useState('');
  const [destinoTipo, setDestinoTipo] = useState<DestinoGasto>('contacto');
  const [contactoId, setContactoId] = useState<number | null>(null);
  const [dependenciaId, setDependenciaId] = useState<number | null>(null);
  const [montoPesos, setMontoPesos] = useState<string>('');
  const [cotizacionUsd, setCotizacionUsd] = useState<string>('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipoFinanciacion, setTipoFinanciacion] = useState<TipoFinanciacion>('contado');
  const [formaPago, setFormaPago] = useState<FormaPago>('transferencia');
  const [cuotasTotal, setCuotasTotal] = useState<number>(12);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaRecurrencia>('mensual');
  const [fechaFinRec, setFechaFinRec] = useState<string>('');
  const [descripcion, setDescripcion] = useState('');

  const [conceptoSearch, setConceptoSearch] = useState('');
  const conceptoInputRef = useRef<HTMLInputElement>(null);

  // Edicion inline de la direccion del contacto seleccionado (paso 2)
  const [direccionEditable, setDireccionEditable] = useState('');

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setStep(0);
      setConcepto('');
      setConceptoSearch('');
      setDestinoTipo('contacto');
      setContactoId(null);
      setDependenciaId(null);
      setMontoPesos('');
      setFecha(new Date().toISOString().slice(0, 10));
      setTipoFinanciacion('contado');
      setFormaPago('transferencia');
      setDescripcion('');
    }
  }, [open]);

  // Cargar catálogos al abrir
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [cRes, ctRes, depRes, usdRes] = await Promise.all([
          tesoreriaCatalogoApi.conceptos(),
          contactosApi.list({ activo: true, limit: 500 }),
          dependenciasApi.getMunicipio({ activo: true }),
          cotizacionApi.usd().catch(() => null),
        ]);
        setConceptos(cRes.data);
        setContactos(ctRes.data);
        setDependencias(depRes.data || []);
        if (usdRes?.data?.valor_sugerido) {
          setCotizacion(usdRes.data);
          setCotizacionUsd(String(usdRes.data.valor_sugerido));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [open]);

  // Conceptos filtrados por busqueda
  const conceptosFiltrados = useMemo(() => {
    if (!conceptos) return [];
    const q = conceptoSearch.trim().toLowerCase();
    const out: { grupo: string; concepto: string }[] = [];
    for (const g of conceptos.grupos) {
      for (const c of g.conceptos) {
        if (!q || c.toLowerCase().includes(q)) out.push({ grupo: g.nombre, concepto: c });
      }
    }
    return out.slice(0, 20);
  }, [conceptos, conceptoSearch]);

  const montoUsdCalc = useMemo(() => {
    const m = parseFloat(montoPesos);
    const c = parseFloat(cotizacionUsd);
    if (!m || !c) return null;
    return (m / c).toFixed(2);
  }, [montoPesos, cotizacionUsd]);

  const guardar = async () => {
    if (!concepto.trim()) return toast.error('Falta el concepto');
    if (destinoTipo === 'contacto' && !contactoId) return toast.error('Elegí un contacto');
    if (destinoTipo === 'dependencia' && !dependenciaId) return toast.error('Elegí una secretaría');
    if (!montoPesos || parseFloat(montoPesos) <= 0) return toast.error('Ingresá el monto');

    setSaving(true);
    try {
      await gastosApi.create({
        destino_tipo: destinoTipo,
        destino_contacto_id: destinoTipo === 'contacto' ? contactoId : null,
        destino_dependencia_id: destinoTipo === 'dependencia' ? dependenciaId : null,
        concepto: concepto.trim(),
        descripcion: descripcion.trim() || null,
        monto_pesos: montoPesos,
        cotizacion_usd: cotizacionUsd || null,
        fecha,
        tipo_financiacion: tipoFinanciacion,
        forma_pago: formaPago,
        cuotas_total: tipoFinanciacion === 'cuotas' || tipoFinanciacion === 'prestamo' ? cuotasTotal : null,
        frecuencia: tipoFinanciacion === 'recurrente' ? frecuencia : null,
        fecha_fin_recurrencia: tipoFinanciacion === 'recurrente' && fechaFinRec ? fechaFinRec : null,
      });
      toast.success('Gasto cargado correctamente');
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error guardando gasto');
    } finally {
      setSaving(false);
    }
  };

  // ============ Step content ============

  const step1 = (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        Elegí o escribí el concepto del gasto (por qué se paga).
      </p>
      <input
        ref={conceptoInputRef}
        type="text"
        value={concepto || conceptoSearch}
        onChange={(e) => { setConcepto(''); setConceptoSearch(e.target.value); }}
        placeholder="Ej: Sueldo mensual, Aguinaldo, Préstamo agrario..."
        autoFocus
        className="w-full px-4 py-3 rounded-xl text-base"
        style={{ backgroundColor: theme.backgroundSecondary, border: `2px solid ${concepto ? theme.primary : theme.border}`, color: theme.text }}
      />
      {!concepto && conceptosFiltrados.length > 0 && (
        <div className="rounded-xl max-h-60 overflow-y-auto" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          {conceptosFiltrados.map((c, i) => (
            <button
              key={`${c.grupo}-${c.concepto}-${i}`}
              type="button"
              onClick={() => { setConcepto(c.concepto); setConceptoSearch(c.concepto); }}
              className="w-full text-left px-4 py-2 hover:bg-opacity-50 transition-colors flex justify-between items-center"
              style={{ color: theme.text }}
            >
              <span>{c.concepto}</span>
              <span className="text-[10px] uppercase opacity-60">{c.grupo}</span>
            </button>
          ))}
        </div>
      )}
      {concepto && (
        <p className="text-xs flex items-center gap-1" style={{ color: '#22c55e' }}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Concepto seleccionado: <b>{concepto}</b>
        </p>
      )}
    </div>
  );

  const step2 = (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: theme.textSecondary }}>¿A quién va este gasto?</p>

      {/* Tabs Contacto/Dependencia */}
      <div className="flex gap-2">
        {(['contacto', 'dependencia'] as DestinoGasto[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setDestinoTipo(t)}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
            style={{
              backgroundColor: destinoTipo === t ? theme.primary : theme.backgroundSecondary,
              color: destinoTipo === t ? '#fff' : theme.text,
              border: `2px solid ${destinoTipo === t ? theme.primary : theme.border}`,
            }}
          >
            {t === 'contacto' ? <UserIcon className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {t === 'contacto' ? 'A una persona' : 'A una secretaría'}
          </button>
        ))}
      </div>

      {destinoTipo === 'contacto' ? (
        <div>
          <input
            type="text"
            placeholder="Buscar por nombre..."
            onChange={(e) => {
              const q = e.target.value.toLowerCase();
              setContactos(prev => prev);  // no filter on backend, just visual
              // Filter via state — simple
            }}
            className="w-full px-3 py-2 rounded-xl text-sm mb-2"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <div className="rounded-xl max-h-60 overflow-y-auto space-y-1" style={{ border: `1px solid ${theme.border}` }}>
            {contactos.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContactoId(c.id)}
                className="w-full text-left px-3 py-2 transition-all flex items-center justify-between"
                style={{
                  backgroundColor: contactoId === c.id ? `${theme.primary}20` : 'transparent',
                  color: theme.text,
                }}
              >
                <span>
                  <span className="font-medium">{c.nombre} {c.apellido || ''}</span>
                  {c.alias_pago && <span className="text-[10px] ml-2 opacity-60">{c.alias_pago}</span>}
                </span>
                <span className="text-[10px] uppercase opacity-60">{c.tipo}</span>
              </button>
            ))}
            {contactos.length === 0 && (
              <p className="text-sm text-center p-4" style={{ color: theme.textSecondary }}>
                No hay contactos cargados. <a href="/gestion/tesoreria/contactos" className="underline" style={{ color: theme.primary }}>Agregar uno</a>
              </p>
            )}
          </div>

          {/* Info / edicion de direccion del contacto seleccionado */}
          {contactoId && (() => {
            const c = contactos.find(x => x.id === contactoId);
            if (!c) return null;
            return (
              <div
                className="mt-3 p-3 rounded-xl"
                style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
              >
                <p className="text-[10px] uppercase font-bold mb-1" style={{ color: theme.textSecondary }}>
                  Dirección del contacto
                </p>
                {c.direccion ? (
                  <p className="text-sm" style={{ color: theme.text }}>
                    📍 {c.direccion}
                  </p>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Ej: Av. San Martín 123"
                      value={direccionEditable}
                      onChange={(e) => setDireccionEditable(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!direccionEditable.trim()) return;
                        try {
                          await contactosApi.update(c.id, { direccion: direccionEditable.trim() });
                          // Refrescar el contacto en el state local
                          setContactos(prev => prev.map(x => x.id === c.id ? { ...x, direccion: direccionEditable.trim() } : x));
                          setDireccionEditable('');
                          toast.success('Dirección agregada al contacto');
                        } catch {
                          toast.error('Error guardando dirección');
                        }
                      }}
                      disabled={!direccionEditable.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      style={{ backgroundColor: theme.primary, color: '#fff' }}
                    >
                      Guardar
                    </button>
                  </div>
                )}
                {c.latitud && c.longitud && (
                  <p className="text-[10px] mt-1" style={{ color: '#10b981' }}>
                    Geolocalizado: {c.latitud.toFixed(4)}, {c.longitud.toFixed(4)}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dependencias.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDependenciaId(d.id)}
              className="px-3 py-3 rounded-xl text-left transition-all"
              style={{
                backgroundColor: dependenciaId === d.id ? `${d.color || theme.primary}20` : theme.backgroundSecondary,
                border: `2px solid ${dependenciaId === d.id ? (d.color || theme.primary) : 'transparent'}`,
                color: theme.text,
              }}
            >
              <span className="font-semibold text-sm">{d.nombre}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const step3 = (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: theme.textSecondary }}>Monto y fecha del gasto.</p>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>Monto en pesos</label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: theme.textSecondary }} />
          <input
            type="number"
            value={montoPesos}
            onChange={(e) => setMontoPesos(e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            className="w-full pl-10 pr-4 py-3 rounded-xl text-lg font-bold"
            style={{ backgroundColor: theme.backgroundSecondary, border: `2px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      </div>

      {cotizacion && (
        <div className="p-3 rounded-xl" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Cotización del día (Bluelytics — blue venta)
          </p>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="number"
              value={cotizacionUsd}
              onChange={(e) => setCotizacionUsd(e.target.value)}
              className="w-28 px-2 py-1 rounded-lg text-sm"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
            />
            {montoUsdCalc && (
              <span className="text-sm font-semibold" style={{ color: theme.text }}>
                = US$ {parseFloat(montoUsdCalc).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>Fecha</label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      </div>
    </div>
  );

  const step4 = (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: theme.textSecondary }}>¿Cómo se paga?</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['contado', 'cuotas', 'prestamo', 'recurrente'] as TipoFinanciacion[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTipoFinanciacion(t)}
            className="px-2 py-2 rounded-xl text-xs font-bold capitalize transition-all"
            style={{
              backgroundColor: tipoFinanciacion === t ? theme.primary : theme.backgroundSecondary,
              color: tipoFinanciacion === t ? '#fff' : theme.text,
              border: `2px solid ${tipoFinanciacion === t ? theme.primary : 'transparent'}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <ModernSelect
        label="Forma de pago"
        value={formaPago}
        onChange={(v) => setFormaPago(v as FormaPago)}
        options={FORMAS_PAGO.map(f => ({ value: f.value, label: f.label }))}
      />

      {(tipoFinanciacion === 'cuotas' || tipoFinanciacion === 'prestamo') && (
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>Cantidad de cuotas</label>
          <input
            type="number"
            value={cuotasTotal}
            onChange={(e) => setCuotasTotal(parseInt(e.target.value || '1', 10))}
            min="1"
            max="120"
            className="w-32 px-3 py-2 rounded-xl"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      )}

      {tipoFinanciacion === 'recurrente' && (
        <>
          <ModernSelect
            label="Frecuencia"
            value={frecuencia}
            onChange={(v) => setFrecuencia(v as FrecuenciaRecurrencia)}
            options={FRECUENCIAS.map(f => ({ value: f.value, label: f.label }))}
          />
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>Hasta fecha (opcional, default 12 ocurrencias)</label>
            <input
              type="date"
              value={fechaFinRec}
              onChange={(e) => setFechaFinRec(e.target.value)}
              className="w-full px-3 py-2 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>Descripción / notas (opcional)</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Detalle del gasto..."
          className="w-full px-3 py-2 rounded-xl text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>
    </div>
  );

  const contactoSel = contactos.find(c => c.id === contactoId);
  const depSel = dependencias.find(d => d.id === dependenciaId);

  const step5 = (
    <div className="space-y-3">
      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
        <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Concepto</p>
        <p className="text-base font-semibold" style={{ color: theme.text }}>{concepto}</p>

        <p className="text-[10px] uppercase font-bold mt-3" style={{ color: theme.textSecondary }}>Destino</p>
        <p className="text-base" style={{ color: theme.text }}>
          {destinoTipo === 'contacto'
            ? `${contactoSel?.nombre || ''} ${contactoSel?.apellido || ''}`.trim()
            : depSel?.nombre || ''}
        </p>

        <p className="text-[10px] uppercase font-bold mt-3" style={{ color: theme.textSecondary }}>Monto</p>
        <p className="text-2xl font-bold" style={{ color: theme.primary }}>
          ${parseFloat(montoPesos || '0').toLocaleString('es-AR', { maximumFractionDigits: 2 })}
          {montoUsdCalc && <span className="text-sm ml-2 opacity-70">(US$ {montoUsdCalc})</span>}
        </p>

        <p className="text-[10px] uppercase font-bold mt-3" style={{ color: theme.textSecondary }}>Financiación</p>
        <p className="text-base capitalize" style={{ color: theme.text }}>
          {tipoFinanciacion}
          {tipoFinanciacion === 'cuotas' && ` — ${cuotasTotal} cuotas`}
          {tipoFinanciacion === 'recurrente' && ` — ${frecuencia}`}
        </p>
      </div>

      <div className="p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: '#10b98115', border: '1px solid #10b98140' }}>
        <Sparkles className="h-5 w-5 flex-shrink-0" style={{ color: '#10b981' }} />
        <p className="text-sm" style={{ color: theme.text }}>
          Al confirmar se va a crear el gasto y se generarán las cuotas correspondientes automáticamente.
        </p>
      </div>
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: 'concepto', title: '¿Qué pagás?', description: 'Concepto del gasto',
      icon: <FileText className="h-4 w-4" />, content: step1, isValid: !!concepto.trim(),
    },
    {
      id: 'destino', title: '¿A quién?', description: 'Persona o secretaría',
      icon: <UserIcon className="h-4 w-4" />, content: step2,
      isValid: destinoTipo === 'contacto' ? !!contactoId : !!dependenciaId,
    },
    {
      id: 'monto', title: 'Monto', description: 'Cuánto y cuándo',
      icon: <DollarSign className="h-4 w-4" />, content: step3,
      isValid: !!montoPesos && parseFloat(montoPesos) > 0,
    },
    {
      id: 'finan', title: 'Pago', description: 'Forma y plazos',
      icon: <Calendar className="h-4 w-4" />, content: step4, isValid: true,
    },
    {
      id: 'confirmar', title: 'Confirmar', description: 'Revisar y guardar',
      icon: <CheckCircle2 className="h-4 w-4" />, content: step5, isValid: true,
    },
  ];

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="Nuevo Gasto"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onComplete={guardar}
      loading={saving}
      completeLabel="Cargar gasto"
    />
  );
}
