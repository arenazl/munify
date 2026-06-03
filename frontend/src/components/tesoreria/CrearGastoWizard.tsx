import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, DollarSign, Building2, User as UserIcon, FileText, Loader2, Sparkles, Calendar, Briefcase, X, Wallet, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { ModernSelect } from '../ui/ModernSelect';
import { PrimaryButton } from '../ui/PrimaryButton';
import { DireccionAutocomplete } from '../ui/DireccionAutocomplete';
import { MoneyInput } from '../ui/MoneyInput';
import { useTheme } from '../../contexts/ThemeContext';
import {
  contactosApi, dependenciasApi, gastosApi, cotizacionApi, tesoreriaCatalogoApi, proyectosApi, cajasApi,
} from '../../lib/api';
import type {
  Contacto, ConceptosCatalogo, CotizacionUSD, TipoFinanciacion,
  FrecuenciaRecurrencia, FormaPago, DestinoGasto, Proyecto, GastoProyectoAssignment,
  TipoContacto, Caja,
} from '../../types';

import { TIPO_CONTACTO_LABELS, TIPO_CONTACTO_COLORS } from '../../lib/contactoIcons';

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
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Catalogos
  const [conceptos, setConceptos] = useState<ConceptosCatalogo | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [dependencias, setDependencias] = useState<DepOption[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cotizacion, setCotizacion] = useState<CotizacionUSD | null>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);

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
  const [estadoPago, setEstadoPago] = useState<'concretado' | 'al_dia' | 'pendiente'>('concretado');
  const [cuotasTotal, setCuotasTotal] = useState<number>(12);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaRecurrencia>('mensual');
  const [fechaFinRec, setFechaFinRec] = useState<string>('');
  const [descripcion, setDescripcion] = useState('');
  const [cajaId, setCajaId] = useState<number | null>(null);
  const [nroFactura, setNroFactura] = useState('');
  const [facturaUrl, setFacturaUrl] = useState('');
  const [uploadingFactura, setUploadingFactura] = useState(false);

  // En el step final, si esto esta tildado, al guardar el gasto se
  // genera ademas la Orden de Pago (documento PDF para Tribunal de Cuentas)
  // y se abre en una pestania nueva.
  const [generarOPDespues, setGenerarOPDespues] = useState(false);

  // Imputaciones a proyectos (opcional). Persisten cuando se usa
  // "Guardar y agregar otro" para no recargar el mismo proyecto.
  const [proyectoAsignaciones, setProyectoAsignaciones] = useState<GastoProyectoAssignment[]>([]);

  // Filtros del step "destino: contacto"
  const [contactoSearch, setContactoSearch] = useState('');
  const [contactoTipoFiltro, setContactoTipoFiltro] = useState<TipoContacto | ''>('');

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
      setProyectoAsignaciones([]);
      setContactoSearch('');
      setContactoTipoFiltro('');
      setCajaId(null);
      setNroFactura('');
      setFacturaUrl('');
      setGenerarOPDespues(false);
    }
  }, [open]);

  // Cargar catálogos estáticos al abrir (todo menos contactos)
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [cRes, depRes, projRes, usdRes, cajasRes] = await Promise.all([
          tesoreriaCatalogoApi.conceptos(),
          dependenciasApi.getMunicipio({ activo: true }),
          proyectosApi.list({ activo: true, include_resumen: false, limit: 5000 }).catch(() => ({ data: [] as Proyecto[] })),
          cotizacionApi.usd().catch(() => null),
          cajasApi.list({ activo: true, include_saldos: true }).catch(() => ({ data: [] as Caja[] })),
        ]);
        setConceptos(cRes.data);
        setDependencias(depRes.data || []);
        setProyectos(projRes.data || []);
        setCajas(cajasRes.data || []);
        if (usdRes?.data?.valor_sugerido) {
          setCotizacion(usdRes.data);
          setCotizacionUsd(String(usdRes.data.valor_sugerido));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [open]);

  // Contactos: fetch server-side con filtro `tipo` + `search` (debounce 300ms).
  // Antes traíamos un slice de 500 ordenado alfabético; en munis con más
  // contactos el proveedor recién creado quedaba afuera del corte y no aparecía
  // en el paso 2. Ahora la query viaja al backend con índices, escala sin tope.
  useEffect(() => {
    if (!open) return;
    const params: Record<string, unknown> = { activo: true, limit: 200 };
    if (contactoTipoFiltro) params.tipo = contactoTipoFiltro;
    const q = contactoSearch.trim();
    if (q) params.search = q;
    const t = setTimeout(() => {
      contactosApi.list(params)
        .then(r => setContactos(r.data || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [open, contactoTipoFiltro, contactoSearch]);

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

  const totalImputado = useMemo(
    () => proyectoAsignaciones.reduce((acc, a) => acc + (Number(a.monto_asignado) || 0), 0),
    [proyectoAsignaciones]
  );

  const guardar = async (continueAdding = false) => {
    if (!concepto.trim()) return toast.error('Falta el concepto');
    if (destinoTipo === 'contacto' && !contactoId) return toast.error('Elegí un contacto');
    if (destinoTipo === 'dependencia' && !dependenciaId) return toast.error('Elegí una secretaría');
    if (!montoPesos || parseFloat(montoPesos) <= 0) return toast.error('Ingresá el monto');
    if (!cajaId) return toast.error('Elegí de qué caja sale el pago');

    const monto = parseFloat(montoPesos);
    if (totalImputado > monto + 0.001) {
      return toast.error(`La imputación a proyectos ($${totalImputado.toLocaleString('es-AR')}) supera el monto del gasto ($${monto.toLocaleString('es-AR')})`);
    }

    setSaving(true);
    try {
      const createRes = await gastosApi.create({
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
        estado_pago: estadoPago,
        cuotas_total: tipoFinanciacion === 'cuotas' || tipoFinanciacion === 'prestamo' ? cuotasTotal : null,
        frecuencia: tipoFinanciacion === 'recurrente' ? frecuencia : null,
        fecha_fin_recurrencia: tipoFinanciacion === 'recurrente' && fechaFinRec ? fechaFinRec : null,
        caja_id: cajaId,
        nro_factura: nroFactura.trim() || null,
        factura_url: facturaUrl || null,
        proyectos: proyectoAsignaciones.length > 0 ? proyectoAsignaciones : [],
      });
      toast.success(continueAdding ? 'Gasto cargado · cargá el siguiente' : 'Gasto cargado correctamente');
      onSuccess?.();

      // Si el usuario tildo "generar OP", disparar la generacion y abrir
      // el PDF en una pestania nueva. Esto es opcional — el gasto ya esta
      // guardado independientemente del exito de la OP.
      const gastoCreado = (createRes?.data as { id?: number } | undefined);
      if (generarOPDespues && gastoCreado?.id) {
        try {
          const opRes = await gastosApi.generarOP(gastoCreado.id);
          const opId = opRes.data.op_id;
          const pdfRes = await gastosApi.descargarOPPdf(opId);
          const blob = new Blob([pdfRes.data as BlobPart], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          toast.success(`Orden de Pago ${opRes.data.numero} generada`);
        } catch (opErr: unknown) {
          const msg = (opErr as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'No se pudo generar la OP';
          toast.error(`Gasto guardado, pero la OP falló: ${msg}`);
        }
      }

      if (continueAdding) {
        // Reset todo MENOS proyectos imputados y fecha. Vuelve al step 0.
        setStep(0);
        setConcepto('');
        setConceptoSearch('');
        setDestinoTipo('contacto');
        setContactoId(null);
        setDependenciaId(null);
        setMontoPesos('');
        setTipoFinanciacion('contado');
        setFormaPago('transferencia');
        setEstadoPago('concretado');
        setDescripcion('');
        // proyectoAsignaciones y fecha se preservan
      }
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
          {/* Pills de tipo de contacto: una fila, scroll horizontal si se desbordan */}
          <div
            className="flex gap-1.5 overflow-x-auto pb-2 mb-2"
            style={{ scrollbarWidth: 'thin' }}
          >
            <button
              type="button"
              onClick={() => setContactoTipoFiltro('')}
              className="flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
              style={{
                backgroundColor: contactoTipoFiltro === '' ? theme.primary : 'transparent',
                color: contactoTipoFiltro === '' ? '#fff' : theme.textSecondary,
                border: `1px solid ${contactoTipoFiltro === '' ? theme.primary : theme.border}`,
              }}
            >
              Todos
            </button>
            {(Object.keys(TIPO_CONTACTO_LABELS) as TipoContacto[]).map(t => {
              const active = contactoTipoFiltro === t;
              const color = TIPO_CONTACTO_COLORS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContactoTipoFiltro(t)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: active ? color : `${color}15`,
                    color: active ? '#fff' : color,
                    border: `1px solid ${color}40`,
                  }}
                >
                  {TIPO_CONTACTO_LABELS[t]}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            placeholder="Buscar por nombre, DNI, alias..."
            value={contactoSearch}
            onChange={(e) => setContactoSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm mb-2"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <div className="rounded-xl max-h-60 overflow-y-auto space-y-1" style={{ border: `1px solid ${theme.border}` }}>
            {(() => {
              const q = contactoSearch.trim().toLowerCase();
              const filtrados = contactos.filter(c => {
                if (contactoTipoFiltro && c.tipo !== contactoTipoFiltro) return false;
                if (!q) return true;
                return (
                  c.nombre.toLowerCase().includes(q) ||
                  (c.apellido?.toLowerCase().includes(q) ?? false) ||
                  (c.dni?.toLowerCase().includes(q) ?? false) ||
                  (c.alias_pago?.toLowerCase().includes(q) ?? false)
                );
              });
              if (filtrados.length === 0) {
                if (contactos.length === 0) {
                  return (
                    <p className="text-sm text-center p-4" style={{ color: theme.textSecondary }}>
                      No hay contactos cargados. <a href="/gestion/tesoreria/contactos" className="underline" style={{ color: theme.primary }}>Agregar uno</a>
                    </p>
                  );
                }
                return (
                  <p className="text-sm text-center p-4" style={{ color: theme.textSecondary }}>
                    Ningún contacto coincide con el filtro.
                  </p>
                );
              }
              return filtrados.map(c => (
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
                  <span
                    className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${TIPO_CONTACTO_COLORS[c.tipo]}20`, color: TIPO_CONTACTO_COLORS[c.tipo] }}
                  >
                    {c.tipo}
                  </span>
                </button>
              ));
            })()}
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
                  <div className="space-y-2">
                    <DireccionAutocomplete
                      value={direccionEditable}
                      onChange={(dir, lat, lon) => {
                        setDireccionEditable(dir);
                        if (lat != null && lon != null) {
                          // Si autocompletaron, guardamos coords pendientes
                          (window as any).__tesoreriaPendingLatLon = { lat, lon, contactoId: c.id };
                        }
                      }}
                      placeholder="Ej: Av. San Martín 123 o Mitre y Belgrano"
                      showCurrentLocationButton={false}
                      inputClassName="py-1.5"
                    />
                    {(() => {
                      // Guardado de la direccion. Si `redirigirAMapa` es true,
                      // al guardar cerramos el wizard y llevamos al user al
                      // /mapa con el contacto en modo Ubicar (query param
                      // ?ubicar=ID que el TesoreriaMapa lee al montar).
                      const guardarDireccion = async (redirigirAMapa: boolean): Promise<boolean> => {
                        if (!direccionEditable.trim()) return false;
                        const pending = (window as any).__tesoreriaPendingLatLon;
                        const hasCoords = pending && pending.contactoId === c.id;
                        try {
                          const update: Record<string, unknown> = { direccion: direccionEditable.trim() };
                          if (hasCoords) {
                            update.latitud = pending.lat;
                            update.longitud = pending.lon;
                          }
                          await contactosApi.update(c.id, update);
                          setContactos(prev => prev.map(x => x.id === c.id ? {
                            ...x,
                            direccion: direccionEditable.trim(),
                            ...(hasCoords ? { latitud: pending.lat, longitud: pending.lon } : {}),
                          } : x));
                          setDireccionEditable('');
                          (window as any).__tesoreriaPendingLatLon = null;
                          if (!redirigirAMapa) {
                            toast.success(hasCoords ? 'Dirección + ubicación guardadas' : 'Dirección agregada');
                          }
                          return true;
                        } catch {
                          toast.error('Error guardando dirección');
                          return false;
                        }
                      };
                      return (
                        <div className="space-y-2">
                          <PrimaryButton
                            type="button"
                            fullWidth
                            size="sm"
                            disabled={!direccionEditable.trim()}
                            onClick={() => guardarDireccion(false)}
                          >
                            Guardar en el contacto
                          </PrimaryButton>
                          <button
                            type="button"
                            disabled={!direccionEditable.trim()}
                            onClick={async () => {
                              const ok = await guardarDireccion(true);
                              if (ok) {
                                onClose();
                                navigate(`/gestion/tesoreria/mapa?ubicar=${c.id}`);
                              }
                            }}
                            className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                            style={{
                              backgroundColor: `${theme.primary}15`,
                              color: theme.primary,
                              border: `1px solid ${theme.primary}40`,
                            }}
                            title="Guarda la dirección y te lleva al mapa para marcar el punto"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Guardar y ubicar en el mapa
                          </button>
                        </div>
                      );
                    })()}
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
          <MoneyInput
            value={montoPesos}
            onChange={setMontoPesos}
            placeholder="0"
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

      {/* Factura del proveedor (opcional) */}
      <div
        className="rounded-xl p-3"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
      >
        <p className="text-[10px] uppercase font-bold mb-2" style={{ color: theme.textSecondary }}>
          Factura del proveedor (opcional)
        </p>
        <div className="grid grid-cols-2 gap-2">
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
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold truncate"
                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                >
                  Ver factura
                </a>
                <button
                  type="button"
                  onClick={() => setFacturaUrl('')}
                  className="px-2 py-2 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444440' }}
                  title="Quitar"
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
                  <>Subir archivo</>
                )}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploadingFactura}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
                    setUploadingFactura(true);
                    try {
                      const res = await gastosApi.uploadFactura(file);
                      setFacturaUrl(res.data.url);
                      toast.success('Factura subida');
                    } catch (err: any) {
                      toast.error(err?.response?.data?.detail || 'Error subiendo');
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

      {/* Estado del pago: concretado | al_dia | pendiente */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.text }}>Estado</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'concretado', label: 'Concretado', color: '#10b981' },
            { value: 'al_dia',     label: 'Al día',     color: '#3b82f6' },
            { value: 'pendiente',  label: 'Pendiente',  color: '#f59e0b' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setEstadoPago(opt.value)}
              className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                backgroundColor: estadoPago === opt.value ? opt.color : theme.backgroundSecondary,
                color: estadoPago === opt.value ? '#fff' : theme.text,
                border: `2px solid ${estadoPago === opt.value ? opt.color : 'transparent'}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: theme.textSecondary }}>
          {estadoPago === 'concretado'
            ? 'El pago ya se hizo. Descuenta caja.'
            : estadoPago === 'al_dia'
              ? 'Pago de hoy registrado. No descuenta caja todavía — después lo cambiás a "Concretado" cuando se confirme.'
              : 'Pago futuro o por hacer. No descuenta caja todavía.'}
        </p>
      </div>

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

  // ============ Step 5: Proyectos (opcional) ============
  const monto = parseFloat(montoPesos || '0');
  const remanente = Math.max(0, monto - totalImputado);
  const proyectoOptions = useMemo(
    () => proyectos
      // No filtramos por estado: un proyecto "finalizado" o "pausado" puede
      // recibir un gasto historico imputado. El backend ya filtra por
      // activo=true (soft delete). Mostramos el estado al lado del nombre
      // cuando no es activo, asi el user lo ve y decide.
      .filter(p => !proyectoAsignaciones.some(a => a.proyecto_id === p.id))
      .map(p => ({
        value: String(p.id),
        label: p.estado === 'activo' ? p.nombre : `${p.nombre} · ${p.estado}`,
      })),
    [proyectos, proyectoAsignaciones]
  );

  const agregarImputacion = (proyectoId: string) => {
    const id = parseInt(proyectoId, 10);
    if (!id) return;
    // Si solo queda un proyecto en la lista y no hay imputaciones, autocompletar
    // con el monto total. Si ya hay imputaciones, usar el remanente.
    const sugerencia = proyectoAsignaciones.length === 0 ? monto : remanente;
    setProyectoAsignaciones(prev => [...prev, { proyecto_id: id, monto_asignado: sugerencia }]);
  };

  const updateImputacion = (proyectoId: number, monto_asignado: number) => {
    setProyectoAsignaciones(prev =>
      prev.map(a => a.proyecto_id === proyectoId ? { ...a, monto_asignado } : a)
    );
  };

  const removeImputacion = (proyectoId: number) => {
    setProyectoAsignaciones(prev => prev.filter(a => a.proyecto_id !== proyectoId));
  };

  const stepProyectos = (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        Opcional: imputá una parte (o todo) del gasto a uno o varios proyectos.
        Sirve para llevar el control de cuánto se llevó cada obra.
      </p>

      {proyectos.length === 0 ? (
        <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
          No hay proyectos creados. Creá uno desde "Tesorería → Proyectos" para imputar este gasto.
        </div>
      ) : (
        <>
          {proyectoAsignaciones.length > 0 && (
            <div className="space-y-2">
              {proyectoAsignaciones.map(a => {
                const p = proyectos.find(pr => pr.id === a.proyecto_id);
                return (
                  <div key={a.proyecto_id} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
                    <Briefcase className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: theme.text }}>
                      {p?.nombre || `Proyecto #${a.proyecto_id}`}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: theme.textSecondary }}>$</span>
                      <input
                        type="number"
                        value={a.monto_asignado || ''}
                        onChange={(e) => updateImputacion(a.proyecto_id, parseFloat(e.target.value) || 0)}
                        className="w-28 px-2 py-1 rounded text-sm tabular-nums text-right"
                        style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}
                      />
                    </div>
                    <button
                      onClick={() => removeImputacion(a.proyecto_id)}
                      className="p-1 rounded hover:opacity-70"
                      title="Quitar imputación"
                      style={{ color: '#ef4444' }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {proyectoOptions.length > 0 && (
            <ModernSelect
              value=""
              onChange={agregarImputacion}
              options={proyectoOptions}
              placeholder="+ Agregar proyecto"
              searchable
            />
          )}

          {/* Barra de progreso de la imputación */}
          {monto > 0 && (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: theme.textSecondary }}>Asignado a proyectos</span>
                <span className="tabular-nums font-semibold" style={{ color: theme.text }}>
                  ${totalImputado.toLocaleString('es-AR', { maximumFractionDigits: 0 })} / ${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, (totalImputado / monto) * 100)}%`,
                    backgroundColor: totalImputado > monto ? '#ef4444' : totalImputado === monto ? '#10b981' : theme.primary,
                  }}
                />
              </div>
              {remanente > 0 && totalImputado > 0 && (
                <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                  Quedan ${remanente.toLocaleString('es-AR', { maximumFractionDigits: 0 })} sin imputar (se cargan como gasto sin proyecto).
                </p>
              )}
              {totalImputado > monto && (
                <p className="text-[11px] font-semibold" style={{ color: '#ef4444' }}>
                  La imputación supera el monto del gasto.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

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

        <p className="text-[10px] uppercase font-bold mt-3" style={{ color: theme.textSecondary }}>Caja</p>
        <p className="text-base" style={{ color: theme.text }}>
          {cajas.find(c => c.id === cajaId)?.nombre || '—'}
        </p>
      </div>

      {/* Toggle "Generar Orden de Pago" — si esta tildado, al guardar el
          gasto se crea ademas la OP (documento PDF para Tribunal de Cuentas)
          y se abre en una pestania nueva. Opcional: gastos chicos no la
          necesitan. */}
      <button
        type="button"
        onClick={() => setGenerarOPDespues(v => !v)}
        className="w-full p-3 rounded-xl flex items-start gap-3 transition-all text-left hover:scale-[1.005] active:scale-[0.995]"
        style={{
          backgroundColor: generarOPDespues ? `${theme.primary}15` : theme.backgroundSecondary,
          border: `2px solid ${generarOPDespues ? theme.primary : theme.border}`,
        }}
      >
        <div
          className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mt-0.5"
          style={{
            backgroundColor: generarOPDespues ? theme.primary : 'transparent',
            border: `2px solid ${generarOPDespues ? theme.primary : theme.border}`,
          }}
        >
          {generarOPDespues && <CheckCircle2 className="h-3 w-3" style={{ color: '#fff' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: theme.text }}>
            Generar Orden de Pago al guardar
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: theme.textSecondary }}>
            Crea el documento PDF para el Tribunal de Cuentas y lo abre en otra pestaña para imprimir.
          </p>
        </div>
      </button>

      <div className="p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: '#10b98115', border: '1px solid #10b98140' }}>
        <Sparkles className="h-5 w-5 flex-shrink-0" style={{ color: '#10b981' }} />
        <p className="text-sm" style={{ color: theme.text }}>
          Al confirmar se va a crear el gasto y se generarán las cuotas correspondientes automáticamente.
        </p>
      </div>
    </div>
  );

  // Paso "Caja": de que fondo sale el pago. Obligatorio — sin caja no se
  // puede arquear despues. Muestra el saldo actual para que el user vea
  // de un vistazo de donde le conviene sacar la plata.
  const stepCaja = (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: theme.textSecondary }}>
        ¿De qué caja sale el pago? Esto es lo que después permite hacer el arqueo.
      </p>
      {cajas.length === 0 ? (
        <div
          className="p-3 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        >
          No hay cajas cargadas en el municipio. Pedile al admin que cree al menos una desde "Configuración → Tesorería".
        </div>
      ) : (
        <div className="space-y-2">
          {cajas.map(c => {
            const saldo = parseFloat(c.saldo_actual || '0');
            const isSelected = cajaId === c.id;
            const color = c.color || theme.primary;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCajaId(c.id)}
                className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.005]"
                style={{
                  backgroundColor: isSelected ? `${color}15` : theme.backgroundSecondary,
                  border: `2px solid ${isSelected ? color : 'transparent'}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}25`, color }}
                  >
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: theme.text }}>
                        {c.nombre}
                      </span>
                      {c.codigo && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}25`, color }}>
                          {c.codigo}
                        </span>
                      )}
                    </div>
                    {c.descripcion && (
                      <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                        {c.descripcion}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Saldo</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>
                      ${saldo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
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
      id: 'caja', title: 'Caja', description: 'De qué fondo sale',
      icon: <Wallet className="h-4 w-4" />, content: stepCaja, isValid: !!cajaId,
    },
    {
      id: 'proyectos', title: 'Proyectos', description: 'Imputar a obras (opcional)',
      icon: <Briefcase className="h-4 w-4" />, content: stepProyectos,
      isValid: totalImputado <= (parseFloat(montoPesos || '0') || 0) + 0.001,
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
      onComplete={() => guardar(false)}
      onCompleteSecondary={proyectoAsignaciones.length > 0 ? () => guardar(true) : undefined}
      completeSecondaryLabel="Guardar y agregar otro"
      loading={saving}
      completeLabel="Cargar gasto"
    />
  );
}
