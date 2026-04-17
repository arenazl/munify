import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, QrCode, Receipt, Landmark, Repeat,
  ShieldCheck, Loader2, CheckCircle2, ArrowLeft, Lock, Info,
  Download, Calendar, Building, Banknote,
} from 'lucide-react';
import { pagosApi } from '../lib/api';

/**
 * Checkout externo GIRE Aura.
 *
 * Esta pagina es intencionalmente DISTINTA visualmente de Munify — el objetivo
 * es que el vecino (y cualquier persona viendo la demo) perciba que "salio"
 * de la app y esta en la plataforma de pagos y cobranzas de GIRE (Aura).
 *
 * En un entorno real este componente seria servido por GIRE en su propio
 * dominio (payment-hub-web.api.gire.com). En la demo lo servimos nosotros
 * con branding de GIRE para mostrar el flow visual completo.
 *
 * La arquitectura es provider-agnostic — cambiando GATEWAY_PAGO_PROVIDER en
 * el backend, la sesion se crea contra otro rail, y el checkout_url apunta
 * a su checkout hosted, no a esta pagina.
 */

interface SesionData {
  session_id: string;
  estado: string;
  concepto: string;
  monto: string | number;
  municipio_nombre: string;
  vecino_nombre: string;
  medios_soportados: string[];
  return_url?: string;
  provider: string;
}

type Medio = 'tarjeta' | 'qr' | 'efectivo_cupon' | 'transferencia' | 'debito_automatico';

const MEDIOS_CONFIG: Record<Medio, {
  label: string;
  descripcion: string;
  icon: React.FC<{ className?: string }>;
  color: string;
}> = {
  tarjeta: {
    label: 'Tarjeta de crédito / débito',
    descripcion: 'Visa, Mastercard, Cabal, Amex',
    icon: CreditCard,
    color: '#3b82f6',
  },
  qr: {
    label: 'QR interoperable',
    descripcion: 'Escaneá con cualquier billetera (MP, MODO, BNA)',
    icon: QrCode,
    color: '#8b5cf6',
  },
  efectivo_cupon: {
    label: 'Efectivo en puntos de cobro',
    descripcion: 'Rapipago, Pago Fácil, Provincia NET, ~10.000 sucursales',
    icon: Receipt,
    color: '#f59e0b',
  },
  transferencia: {
    label: 'Transferencia bancaria',
    descripcion: 'CBU / CVU / alias desde tu banco',
    icon: Landmark,
    color: '#14b8a6',
  },
  debito_automatico: {
    label: 'Débito automático',
    descripcion: 'Adherí tu CBU para débitos futuros',
    icon: Repeat,
    color: '#ec4899',
  },
};

// Paleta GIRE / Aura: turquesa como acento sobre fondo oscuro corporativo.
const GIRE_ACCENT = '#00bcd4';
const GIRE_ACCENT_DARK = '#0097a7';

export default function PayBridgeCheckout() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [sesion, setSesion] = useState<SesionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [medioSeleccionado, setMedioSeleccionado] = useState<Medio | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [comprobante, setComprobante] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Sesión inválida');
      setLoading(false);
      return;
    }
    cargar();
  }, [sessionId]);

  // Auto-seleccionar el medio si la sesion solo tiene uno (caso típico cuando
  // el tramite/tasa tiene tipo_pago especifico — ej "rapipago" → solo cupon).
  useEffect(() => {
    if (sesion && sesion.medios_soportados.length === 1 && !medioSeleccionado) {
      setMedioSeleccionado(sesion.medios_soportados[0] as Medio);
    }
  }, [sesion, medioSeleccionado]);

  // Si el medio unico es "efectivo_cupon" o "debito_automatico", se renderiza
  // un panel especializado en vez del flujo generico de seleccion + confirmar.
  const usaPanelEspecializado = (
    sesion?.medios_soportados.length === 1 &&
    (sesion.medios_soportados[0] === 'efectivo_cupon' ||
     sesion.medios_soportados[0] === 'debito_automatico')
  );

  const cargar = async () => {
    try {
      const res = await pagosApi.obtenerSesion(sessionId!);
      setSesion(res.data);
      if (res.data.estado === 'approved') {
        // Ya estaba pagada — mostrar exito directo
        setComprobante({
          concepto: res.data.concepto,
          monto: String(res.data.monto),
          medio_pago: '',
          fecha: '',
          numero_operacion: '',
          provider: res.data.provider,
        });
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'No encontramos esta sesión de pago');
    } finally {
      setLoading(false);
    }
  };

  const confirmar = async () => {
    if (!medioSeleccionado || !sessionId) return;
    setProcesando(true);
    try {
      const res = await pagosApi.confirmarPago(sessionId, medioSeleccionado);
      setComprobante(res.data.comprobante);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Error procesando el pago');
    } finally {
      setProcesando(false);
    }
  };

  const volver = () => {
    const url = sesion?.return_url || '/gestion/mis-tasas';
    navigate(url);
  };

  // ============================================================
  // Render
  // ============================================================

  // Fondo y branding FIJO que se ve distinto a Munify
  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1929 0%, #12344a 100%)',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  if (loading) {
    return (
      <div style={wrapperStyle} className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GIRE_ACCENT }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={wrapperStyle} className="flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md p-6 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-lg mb-3">Error</p>
          <p className="text-sm opacity-80 mb-4">{error}</p>
          <button
            onClick={() => navigate('/gestion/mis-tasas')}
            className="px-4 py-2 rounded-lg font-medium"
            style={{ backgroundColor: GIRE_ACCENT, color: '#0a1929' }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      {/* === HEADER GIRE Aura (marca externa) === */}
      <header
        className="px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: 'rgba(0,0,0,0.35)',
          borderBottom: `1px solid ${GIRE_ACCENT}33`,
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Logo Aura: círculo turquesa con inicial. Reemplazar por asset oficial cuando exista. */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-lg"
            style={{
              background: `linear-gradient(135deg, ${GIRE_ACCENT} 0%, ${GIRE_ACCENT_DARK} 100%)`,
              color: '#ffffff',
              boxShadow: `0 4px 12px ${GIRE_ACCENT}40`,
            }}
          >
            A
          </div>
          <div>
            <p className="font-bold text-sm leading-none tracking-wide">
              <span style={{ color: GIRE_ACCENT }}>GIRE</span>
              <span className="opacity-70 ml-1 font-normal">· Aura</span>
            </p>
            <p className="text-[10px] opacity-60 leading-none mt-1">Plataforma de Pagos y Cobranzas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs opacity-80">
          <Lock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Conexión segura</span>
          <span>SSL</span>
        </div>
      </header>

      {/* === Disclaimer "estás fuera de Munify" === */}
      <div
        className="px-4 py-2 text-xs flex items-center justify-center gap-2"
        style={{
          backgroundColor: `${GIRE_ACCENT}14`,
          borderBottom: `1px solid ${GIRE_ACCENT}33`,
          color: GIRE_ACCENT,
        }}
      >
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        Estás en el Botón de Pago de GIRE. Al finalizar volvés automáticamente a tu municipio.
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-20">
        {/* === Resumen del pago === */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)' }}
            >
              <Receipt className="h-6 w-6" style={{ color: '#00bcd4' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider opacity-60">Estás pagando</p>
              <p className="font-semibold truncate">{sesion?.concepto}</p>
              <p className="text-xs opacity-80 mt-0.5">
                Municipalidad de {sesion?.municipio_nombre} · {sesion?.vecino_nombre}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider opacity-60">Total</p>
              <p className="text-2xl font-bold" style={{ color: '#00bcd4' }}>
                {formatMonto(sesion?.monto || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* === Comprobante (post-pago) === */}
        {comprobante ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.5)',
            }}
          >
            <div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: '#10b981' }}
            >
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-1">Pago aprobado</h2>
            <p className="text-sm opacity-80 mb-4">
              El comprobante ya está en tu cuenta del municipio.
            </p>

            <div
              className="rounded-xl p-4 text-left text-xs space-y-1 mb-4"
              style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
            >
              <div className="flex justify-between"><span className="opacity-70">Concepto:</span><span className="font-medium">{comprobante.concepto}</span></div>
              <div className="flex justify-between"><span className="opacity-70">Monto:</span><span className="font-medium">{formatMonto(comprobante.monto)}</span></div>
              {comprobante.medio_pago && (
                <div className="flex justify-between"><span className="opacity-70">Medio:</span><span className="font-medium">{MEDIOS_CONFIG[comprobante.medio_pago as Medio]?.label || comprobante.medio_pago}</span></div>
              )}
              {comprobante.numero_operacion && (
                <div className="flex justify-between"><span className="opacity-70">N° operación:</span><span className="font-mono">{comprobante.numero_operacion}</span></div>
              )}
              {comprobante.fecha && (
                <div className="flex justify-between"><span className="opacity-70">Fecha:</span><span>{new Date(comprobante.fecha).toLocaleString('es-AR')}</span></div>
              )}
              <div className="flex justify-between pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="opacity-70">Procesado por:</span>
                <span className="font-semibold" style={{ color: '#00bcd4' }}>GIRE · Aura</span>
              </div>
            </div>

            <button
              onClick={volver}
              className="w-full py-3 rounded-xl font-semibold transition-all active:scale-95"
              style={{ backgroundColor: '#00bcd4', color: '#0a1929' }}
            >
              Volver al municipio
            </button>
          </div>
        ) : usaPanelEspecializado && sesion ? (
          sesion.medios_soportados[0] === 'efectivo_cupon' ? (
            <RapipagoCuponPanel
              sesion={sesion}
              procesando={procesando}
              onConfirmar={confirmar}
              onCancelar={volver}
              accent={GIRE_ACCENT}
            />
          ) : (
            <AdhesionDebitoPanel
              sesion={sesion}
              procesando={procesando}
              onConfirmar={confirmar}
              onCancelar={volver}
              accent={GIRE_ACCENT}
            />
          )
        ) : (
          <>
            {/* === Selector de medios === */}
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-2">
              Elegí cómo pagar
            </p>
            <div className="space-y-2 mb-6">
              {(sesion?.medios_soportados || []).map(medio => {
                const config = MEDIOS_CONFIG[medio as Medio];
                if (!config) return null;
                const Icon = config.icon;
                const seleccionado = medioSeleccionado === medio;
                return (
                  <button
                    key={medio}
                    type="button"
                    onClick={() => setMedioSeleccionado(medio as Medio)}
                    disabled={procesando}
                    className="w-full p-4 rounded-xl text-left flex items-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      backgroundColor: seleccionado ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255,255,255,0.06)',
                      border: `2px solid ${seleccionado ? '#00bcd4' : 'transparent'}`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${config.color}30`, color: config.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{config.label}</p>
                      <p className="text-xs opacity-70">{config.descripcion}</p>
                    </div>
                    {seleccionado && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#00bcd4' }}
                      >
                        <CheckCircle2 className="h-4 w-4" style={{ color: '#0a1929' }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* === Acciones === */}
            <div className="flex gap-2">
              <button
                onClick={volver}
                disabled={procesando}
                className="px-4 py-3 rounded-xl font-medium flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
              >
                <ArrowLeft className="h-4 w-4" />
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!medioSeleccionado || procesando}
                className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: '#00bcd4', color: '#0a1929' }}
              >
                {procesando ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Procesando pago...</>
                ) : (
                  <><ShieldCheck className="h-5 w-5" /> Confirmar pago</>
                )}
              </button>
            </div>
          </>
        )}

        {/* Footer GIRE Aura */}
        <div className="mt-8 text-center text-[11px] opacity-50 leading-relaxed">
          <p><span style={{ color: '#00bcd4' }}>GIRE</span> · Aura — Plataforma de Pagos y Cobranzas</p>
          <p>Demo · Procesador de pago externo simulado</p>
          <p className="mt-2">
            <Lock className="h-3 w-3 inline mr-1" />
            Los datos de tu tarjeta nunca viajan al municipio.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatMonto(v: string | number): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v)) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
  }).format(n);
}

// ============================================================
// Panel especializado: RAPIPAGO (cupon con codigo de barras)
// ============================================================

interface PanelProps {
  sesion: SesionData;
  procesando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  accent: string;
}

function RapipagoCuponPanel({ sesion, procesando, onConfirmar, onCancelar, accent }: PanelProps) {
  // Genera un "numero de cupon" determinista desde session_id para que no cambie en reloads.
  const cuponNumero = (() => {
    const hash = sesion.session_id.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
    const n = Math.abs(hash);
    return `${String(n).padStart(14, '0').slice(0, 14)}`;
  })();

  // Fecha de vencimiento = hoy + 15 dias
  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + 15);

  // Barcode "CODE 128" simulado con barras variables
  const barras = cuponNumero.split('').map((c, i) => {
    const w = 1 + (parseInt(c) % 4);
    const fill = (parseInt(c) + i) % 3 !== 0;
    return { w, fill };
  });

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        color: '#1a1a1a',
        boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Header Rapipago */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
      >
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          <span className="font-bold tracking-wider">RAPIPAGO</span>
        </div>
        <span className="text-[10px] opacity-80 uppercase tracking-wide">Cupón de pago</span>
      </div>

      {/* Datos */}
      <div className="p-5 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Concepto</p>
          <p className="font-semibold text-sm">{sesion.concepto}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Titular</p>
            <p className="text-sm">{sesion.vecino_nombre}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Municipio</p>
            <p className="text-sm">{sesion.municipio_nombre}</p>
          </div>
        </div>
        <div className="flex items-end justify-between pt-2" style={{ borderTop: '1px dashed #e5e7eb' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Vencimiento</p>
            <p className="font-semibold flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5" />
              {vencimiento.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Total a pagar</p>
            <p className="text-2xl font-black" style={{ color: '#ef4444' }}>
              {formatMonto(sesion.monto)}
            </p>
          </div>
        </div>

        {/* Código de barras simulado */}
        <div className="pt-3">
          <svg viewBox={`0 0 ${barras.reduce((a, b) => a + b.w + 1, 0)} 60`} className="w-full h-16">
            {(() => {
              let x = 0;
              return barras.map((b, i) => {
                const rect = (
                  <rect
                    key={i}
                    x={x}
                    y={0}
                    width={b.w}
                    height={60}
                    fill={b.fill ? '#000' : 'transparent'}
                  />
                );
                x += b.w + 1;
                return rect;
              });
            })()}
          </svg>
          <p className="text-center font-mono text-xs tracking-widest mt-2 text-gray-700">
            {cuponNumero.replace(/(\d{4})(?=\d)/g, '$1 ')}
          </p>
        </div>

        <div className="p-3 rounded-lg text-xs leading-snug" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
          <p className="font-semibold mb-1">Pagá en cualquier sucursal Rapipago</p>
          <p>Mostrá este cupón (o el código de barras desde tu celu) en cualquiera de las +4.700 sucursales. Acreditación en 24-48 hs.</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancelar}
            disabled={procesando}
            className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all active:scale-95"
            style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => window.print()}
            disabled={procesando}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
          >
            <Download className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={onConfirmar}
            disabled={procesando}
            className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
          >
            {procesando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
            ) : (
              'Simular pago en sucursal'
            )}
          </button>
        </div>
      </div>
      <div className="px-5 py-2 text-[10px] text-center text-gray-500" style={{ backgroundColor: '#f9fafb' }}>
        Cupón procesado por <span style={{ color: accent, fontWeight: 600 }}>GIRE · Rapipago</span>
      </div>
    </div>
  );
}

// ============================================================
// Panel especializado: ADHESION A DEBITO AUTOMATICO (form CBU)
// ============================================================

function AdhesionDebitoPanel({ sesion, procesando, onConfirmar, onCancelar, accent }: PanelProps) {
  const [cbu, setCbu] = useState('');
  const [banco, setBanco] = useState('');
  const [alias, setAlias] = useState('');
  const [acepto, setAcepto] = useState(false);

  // Auto-detectar banco simple por los primeros 3 digitos (simulado)
  const detectarBanco = (c: string) => {
    if (c.length < 3) return '';
    const prefijo = c.slice(0, 3);
    const bancos: Record<string, string> = {
      '007': 'Banco Galicia',
      '011': 'Banco Nación',
      '014': 'BBVA Argentina',
      '017': 'Banco BBVA',
      '027': 'Banco Supervielle',
      '034': 'Banco Patagonia',
      '044': 'Banco Hipotecario',
      '072': 'Banco Santander',
      '150': 'HSBC Argentina',
      '285': 'Banco Macro',
    };
    return bancos[prefijo] || 'Banco detectado';
  };

  const cbuValido = cbu.length === 22;

  return (
    <div
      className="rounded-2xl p-6 space-y-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}30`, color: accent }}
        >
          <Repeat className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold">Adhesión a débito automático</h3>
          <p className="text-xs opacity-70">Autorizá a GIRE a debitar {sesion.concepto}</p>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider opacity-70 mb-1.5">CBU (22 dígitos)</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={22}
          placeholder="0000000000000000000000"
          value={cbu}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 22);
            setCbu(v);
            setBanco(detectarBanco(v));
          }}
          className="w-full px-4 py-3 rounded-xl text-sm font-mono tracking-wider"
          style={{
            backgroundColor: 'rgba(0,0,0,0.3)',
            border: `1px solid ${cbuValido ? accent : 'rgba(255,255,255,0.15)'}`,
            color: '#ffffff',
          }}
        />
        {banco && (
          <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: accent }}>
            <Building className="h-3 w-3" />
            {banco}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider opacity-70 mb-1.5">
          Alias (opcional)
        </label>
        <input
          type="text"
          placeholder="ej: juan.perez.mp"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#ffffff',
          }}
        />
      </div>

      <div className="p-3 rounded-lg text-xs leading-snug" style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}30` }}>
        <p className="font-semibold mb-1.5">¿Qué estás autorizando?</p>
        <ul className="space-y-1 opacity-90 list-disc pl-4">
          <li>Débito automático mensual por {formatMonto(sesion.monto)} mientras la deuda esté vigente.</li>
          <li>Notificación por email 72 hs antes de cada débito.</li>
          <li>Cancelable en cualquier momento desde tu panel o tu banco.</li>
        </ul>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={acepto}
          onChange={(e) => setAcepto(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs leading-snug opacity-90">
          Acepto la adhesión al débito automático con mi CBU y los términos del servicio GIRE.
        </span>
      </label>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancelar}
          disabled={procesando}
          className="px-4 py-3 rounded-xl font-medium transition-all active:scale-95"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={!cbuValido || !acepto || procesando}
          className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: accent, color: '#0a1929' }}
        >
          {procesando ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Procesando adhesión...</>
          ) : (
            <><ShieldCheck className="h-5 w-5" /> Confirmar adhesión</>
          )}
        </button>
      </div>
    </div>
  );
}
