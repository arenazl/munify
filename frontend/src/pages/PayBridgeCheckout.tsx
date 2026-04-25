import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, QrCode, Receipt, Landmark, Repeat,
  ShieldCheck, Loader2, CheckCircle2, ArrowLeft, Lock, Info,
  Download, Calendar, Building, Banknote,
} from 'lucide-react';
import { pagosApi } from '../lib/api';

/**
 * Checkout externo — sandbox visualmente similar a Mercado Pago.
 *
 * Esta pagina simula el checkout hosted de MP (azul, fondo claro, form de
 * tarjeta) para que la demo se sienta lo mas cercana posible al flujo real
 * sin tener credenciales productivas.
 *
 * Cuando se configure el provider MP real (con access token), el backend
 * generara un init_point apuntando al checkout de MP de verdad y este
 * componente queda como fallback solo cuando el provider real no esta
 * configurado.
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
    label: 'Tarjeta de crédito o débito',
    descripcion: 'Visa, Mastercard, Amex, Cabal',
    icon: CreditCard,
    color: '#009ee3',
  },
  qr: {
    label: 'Dinero en cuenta de Mercado Pago',
    descripcion: 'Pagá con saldo o tarjetas guardadas',
    icon: QrCode,
    color: '#00a650',
  },
  efectivo_cupon: {
    label: 'Pago Fácil, Rapipago y otros',
    descripcion: 'Pagá en efectivo en más de 10.000 sucursales',
    icon: Receipt,
    color: '#f59e0b',
  },
  transferencia: {
    label: 'Transferencia bancaria',
    descripcion: 'Pagá con CBU/CVU desde tu banco',
    icon: Landmark,
    color: '#14b8a6',
  },
  debito_automatico: {
    label: 'Débito automático',
    descripcion: 'Adherí tu CBU para pagos recurrentes',
    icon: Repeat,
    color: '#ec4899',
  },
};

// Paleta Mercado Pago
const MP_BLUE = '#009ee3';
const MP_BLUE_DARK = '#007eb5';
const MP_YELLOW = '#fff159';
const MP_TEXT = '#333333';
const MP_BG = '#ededed';

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

  useEffect(() => {
    if (sesion && sesion.medios_soportados.length === 1 && !medioSeleccionado) {
      setMedioSeleccionado(sesion.medios_soportados[0] as Medio);
    }
  }, [sesion, medioSeleccionado]);

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

  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: MP_BG,
    color: MP_TEXT,
    fontFamily: '"Proxima Nova", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  if (loading) {
    return (
      <div style={wrapperStyle} className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: MP_BLUE }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={wrapperStyle} className="flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md p-6 rounded-lg bg-white shadow-sm">
          <p className="text-lg mb-3 font-semibold">Error</p>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/gestion/mis-tasas')}
            className="px-4 py-2 rounded-md font-medium text-white transition-colors hover:bg-blue-600"
            style={{ backgroundColor: MP_BLUE }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      {/* === HEADER MP — barra azul con logo === */}
      <header
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: MP_BLUE, color: '#ffffff' }}
      >
        <div className="flex items-center gap-2.5">
          <MercadoPagoLogo />
        </div>
        <div className="flex items-center gap-2 text-xs opacity-90">
          <Lock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Conexión segura</span>
        </div>
      </header>

      {/* Banda informativa */}
      <div
        className="px-4 py-2 text-xs flex items-center justify-center gap-2"
        style={{ backgroundColor: MP_YELLOW, color: MP_TEXT }}
      >
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        Estás pagando con Mercado Pago. Al finalizar volvés automáticamente al municipio.
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-20">
        {/* === Resumen del pago === */}
        <div className="rounded-lg p-5 mb-4 bg-white shadow-sm">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: `${MP_BLUE}15`, color: MP_BLUE }}
            >
              <Receipt className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Estás pagando</p>
              <p className="font-semibold truncate text-gray-900">{sesion?.concepto}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Municipalidad de {sesion?.municipio_nombre} · {sesion?.vecino_nombre}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Total</p>
              <p className="text-2xl font-bold" style={{ color: MP_BLUE }}>
                {formatMonto(sesion?.monto || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* === Comprobante (post-pago) === */}
        {comprobante ? (
          <div className="rounded-lg p-6 text-center bg-white shadow-sm">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: '#00a650' }}
            >
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-1 text-gray-900">¡Listo, pagaste!</h2>
            <p className="text-sm text-gray-600 mb-4">
              Te enviamos el comprobante a tu cuenta del municipio.
            </p>

            <div className="rounded-lg p-4 text-left text-xs space-y-1 mb-4 bg-gray-50 border border-gray-200">
              <div className="flex justify-between"><span className="text-gray-500">Concepto:</span><span className="font-medium text-gray-900">{comprobante.concepto}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Monto:</span><span className="font-medium text-gray-900">{formatMonto(comprobante.monto)}</span></div>
              {comprobante.medio_pago && (
                <div className="flex justify-between"><span className="text-gray-500">Medio:</span><span className="font-medium text-gray-900">{MEDIOS_CONFIG[comprobante.medio_pago as Medio]?.label || comprobante.medio_pago}</span></div>
              )}
              {comprobante.numero_operacion && (
                <div className="flex justify-between"><span className="text-gray-500">N° operación:</span><span className="font-mono text-gray-900">{comprobante.numero_operacion}</span></div>
              )}
              {comprobante.fecha && (
                <div className="flex justify-between"><span className="text-gray-500">Fecha:</span><span className="text-gray-900">{new Date(comprobante.fecha).toLocaleString('es-AR')}</span></div>
              )}
              <div className="flex justify-between pt-1 border-t border-gray-200">
                <span className="text-gray-500">Procesado por:</span>
                <span className="font-semibold" style={{ color: MP_BLUE }}>Mercado Pago</span>
              </div>
            </div>

            <button
              onClick={volver}
              className="w-full py-3 rounded-md font-semibold text-white transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: MP_BLUE }}
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
            />
          ) : (
            <AdhesionDebitoPanel
              sesion={sesion}
              procesando={procesando}
              onConfirmar={confirmar}
              onCancelar={volver}
            />
          )
        ) : medioSeleccionado === 'tarjeta' ? (
          <TarjetaForm
            sesion={sesion!}
            procesando={procesando}
            onConfirmar={confirmar}
            onCancelar={() => setMedioSeleccionado(null)}
          />
        ) : (
          <>
            {/* === Selector de medios === */}
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              ¿Cómo querés pagar?
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
                    className="w-full p-4 rounded-lg text-left flex items-center gap-3 transition-all bg-white shadow-sm hover:shadow-md active:scale-[0.99]"
                    style={{
                      border: `2px solid ${seleccionado ? MP_BLUE : 'transparent'}`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${config.color}15`, color: config.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900">{config.label}</p>
                      <p className="text-xs text-gray-500">{config.descripcion}</p>
                    </div>
                    {seleccionado && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: MP_BLUE }}
                      >
                        <CheckCircle2 className="h-4 w-4 text-white" />
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
                className="px-4 py-3 rounded-md font-medium flex items-center gap-2 transition-all bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!medioSeleccionado || procesando}
                className="flex-1 py-3 rounded-md font-bold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: MP_BLUE }}
              >
                {procesando ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Procesando...</>
                ) : (
                  <><ShieldCheck className="h-5 w-5" /> Continuar</>
                )}
              </button>
            </div>
          </>
        )}

        {/* Footer MP */}
        <div className="mt-8 text-center text-[11px] text-gray-500 leading-relaxed">
          <p>Powered by <span style={{ color: MP_BLUE, fontWeight: 600 }}>Mercado Pago</span></p>
          <p>Sandbox · Sin cargo real (modo demo)</p>
          <p className="mt-2">
            <Lock className="h-3 w-3 inline mr-1" />
            Tus datos están protegidos.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Logo Mercado Pago (pseudo logo con tipografía custom)
// ============================================================
function MercadoPagoLogo() {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center bg-white"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <span className="text-2xl">😊</span>
      </div>
      <div className="text-white">
        <p className="font-bold text-base leading-none tracking-tight">Mercado Pago</p>
        <p className="text-[10px] opacity-90 leading-none mt-0.5">Pagá fácil y seguro</p>
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

interface PanelProps {
  sesion: SesionData;
  procesando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

// ============================================================
// Form Tarjeta — UI estilo MP Checkout Pro
// ============================================================
function TarjetaForm({ sesion, procesando, onConfirmar, onCancelar }: PanelProps) {
  const [numero, setNumero] = useState('');
  const [titular, setTitular] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [cvv, setCvv] = useState('');
  const [dni, setDni] = useState('');
  const [cuotas, setCuotas] = useState('1');

  // Detectar marca (MP-style)
  const marca = (() => {
    const n = numero.replace(/\s/g, '');
    if (n.startsWith('4')) return 'visa';
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    return null;
  })();

  const formatNumero = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

  const formatVencimiento = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    if (d.length <= 2) return d;
    return d.slice(0, 2) + '/' + d.slice(2);
  };

  const valido =
    numero.replace(/\s/g, '').length >= 15 &&
    titular.trim().length >= 3 &&
    /^\d{2}\/\d{2}$/.test(vencimiento) &&
    cvv.length >= 3 &&
    dni.length >= 7;

  return (
    <div className="rounded-lg p-5 bg-white shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard className="h-5 w-5" style={{ color: MP_BLUE }} />
        <h3 className="font-semibold text-gray-900">Datos de tu tarjeta</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <BrandBadge marca="visa" activa={marca === 'visa'} />
          <BrandBadge marca="mastercard" activa={marca === 'mastercard'} />
          <BrandBadge marca="amex" activa={marca === 'amex'} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">Número de tarjeta</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="1234 5678 9012 3456"
          value={numero}
          onChange={(e) => setNumero(formatNumero(e.target.value))}
          className="w-full px-3 py-2.5 rounded-md text-sm font-mono border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">Nombre del titular (como figura en la tarjeta)</label>
        <input
          type="text"
          placeholder="LUCAS ARENAZ"
          value={titular}
          onChange={(e) => setTitular(e.target.value.toUpperCase())}
          className="w-full px-3 py-2.5 rounded-md text-sm border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Vencimiento</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/AA"
            value={vencimiento}
            onChange={(e) => setVencimiento(formatVencimiento(e.target.value))}
            className="w-full px-3 py-2.5 rounded-md text-sm font-mono border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Código de seguridad</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123"
            maxLength={4}
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2.5 rounded-md text-sm font-mono border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">DNI del titular</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="30123456"
          maxLength={9}
          value={dni}
          onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
          className="w-full px-3 py-2.5 rounded-md text-sm font-mono border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">Cuotas</label>
        <select
          value={cuotas}
          onChange={(e) => setCuotas(e.target.value)}
          className="w-full px-3 py-2.5 rounded-md text-sm border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
        >
          <option value="1">1 cuota de {formatMonto(sesion.monto)} (sin interés)</option>
          <option value="3">3 cuotas de {formatMonto(parseFloat(String(sesion.monto)) / 3)}</option>
          <option value="6">6 cuotas de {formatMonto(parseFloat(String(sesion.monto)) / 6)}</option>
          <option value="12">12 cuotas de {formatMonto(parseFloat(String(sesion.monto)) / 12)}</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancelar}
          disabled={procesando}
          className="px-4 py-3 rounded-md font-medium border border-gray-300 text-gray-700 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        >
          Volver
        </button>
        <button
          onClick={onConfirmar}
          disabled={!valido || procesando}
          className="flex-1 py-3 rounded-md font-bold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: MP_BLUE }}
        >
          {procesando ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Procesando pago...</>
          ) : (
            <>Pagar {formatMonto(sesion.monto)}</>
          )}
        </button>
      </div>

      <p className="text-[10px] text-center text-gray-400 pt-1">
        🔒 Tus datos viajan encriptados. Sandbox de demo — no se cobra plata real.
      </p>
    </div>
  );
}

function BrandBadge({ marca, activa }: { marca: 'visa' | 'mastercard' | 'amex'; activa: boolean }) {
  const labels = { visa: 'VISA', mastercard: 'Mastercard', amex: 'Amex' };
  const colors = { visa: '#1a1f71', mastercard: '#eb001b', amex: '#006fcf' };
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: activa ? colors[marca] : '#e5e7eb',
        color: activa ? '#fff' : '#9ca3af',
        transition: 'all 0.2s ease',
      }}
    >
      {labels[marca]}
    </span>
  );
}

// ============================================================
// Panel Rapipago (cupón con código de barras)
// ============================================================
function RapipagoCuponPanel({ sesion, procesando, onConfirmar, onCancelar }: PanelProps) {
  const cuponNumero = (() => {
    const hash = sesion.session_id.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
    const n = Math.abs(hash);
    return `${String(n).padStart(14, '0').slice(0, 14)}`;
  })();

  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + 15);

  const barras = cuponNumero.split('').map((c, i) => {
    const w = 1 + (parseInt(c) % 4);
    const fill = (parseInt(c) + i) % 3 !== 0;
    return { w, fill };
  });

  return (
    <div className="rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: '#ef4444', color: '#ffffff' }}>
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          <span className="font-bold tracking-wider">Pago Fácil / Rapipago</span>
        </div>
        <span className="text-[10px] opacity-80 uppercase tracking-wide">Cupón</span>
      </div>

      <div className="p-5 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Concepto</p>
          <p className="font-semibold text-sm text-gray-900">{sesion.concepto}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Titular</p>
            <p className="text-sm text-gray-900">{sesion.vecino_nombre}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Municipio</p>
            <p className="text-sm text-gray-900">{sesion.municipio_nombre}</p>
          </div>
        </div>
        <div className="flex items-end justify-between pt-2 border-t border-dashed border-gray-200">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Vencimiento</p>
            <p className="font-semibold flex items-center gap-1.5 text-sm text-gray-900">
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

        <div className="pt-3">
          <svg viewBox={`0 0 ${barras.reduce((a, b) => a + b.w + 1, 0)} 60`} className="w-full h-16">
            {(() => {
              let x = 0;
              return barras.map((b, i) => {
                const rect = (
                  <rect key={i} x={x} y={0} width={b.w} height={60} fill={b.fill ? '#000' : 'transparent'} />
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

        <div className="p-3 rounded-md text-xs leading-snug" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
          <p className="font-semibold mb-1">Pagá en cualquier sucursal</p>
          <p>Mostrá este cupón en cualquier sucursal de Pago Fácil, Rapipago, Provincia NET y otros. Acreditación 24-48 hs.</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onCancelar} disabled={procesando} className="px-4 py-2.5 rounded-md font-medium text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all">
            Cancelar
          </button>
          <button onClick={() => window.print()} disabled={procesando} className="flex-1 px-4 py-2.5 rounded-md font-medium text-sm flex items-center justify-center gap-2 bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all">
            <Download className="h-4 w-4" />
            Imprimir
          </button>
          <button onClick={onConfirmar} disabled={procesando} className="flex-1 px-4 py-2.5 rounded-md font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50" style={{ backgroundColor: '#ef4444' }}>
            {procesando ? (<><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>) : 'Simular pago en sucursal'}
          </button>
        </div>
      </div>
      <div className="px-5 py-2 text-[10px] text-center text-gray-500 bg-gray-50">
        Procesado por <span style={{ color: MP_BLUE, fontWeight: 600 }}>Mercado Pago</span>
      </div>
    </div>
  );
}

// ============================================================
// Panel Adhesión Débito Automático
// ============================================================
function AdhesionDebitoPanel({ sesion, procesando, onConfirmar, onCancelar }: PanelProps) {
  const [cbu, setCbu] = useState('');
  const [banco, setBanco] = useState('');
  const [alias, setAlias] = useState('');
  const [acepto, setAcepto] = useState(false);

  const detectarBanco = (c: string) => {
    if (c.length < 3) return '';
    const prefijo = c.slice(0, 3);
    const bancos: Record<string, string> = {
      '007': 'Banco Galicia', '011': 'Banco Nación', '014': 'BBVA Argentina',
      '017': 'Banco BBVA', '027': 'Banco Supervielle', '034': 'Banco Patagonia',
      '044': 'Banco Hipotecario', '072': 'Banco Santander', '150': 'HSBC Argentina',
      '285': 'Banco Macro',
    };
    return bancos[prefijo] || 'Banco detectado';
  };

  const cbuValido = cbu.length === 22;

  return (
    <div className="rounded-lg p-6 space-y-4 bg-white shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${MP_BLUE}15`, color: MP_BLUE }}>
          <Repeat className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Adhesión a débito automático</h3>
          <p className="text-xs text-gray-500">Autorizá a Mercado Pago a debitar {sesion.concepto}</p>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1.5">CBU (22 dígitos)</label>
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
          className="w-full px-4 py-3 rounded-md text-sm font-mono tracking-wider border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {banco && (
          <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: MP_BLUE }}>
            <Building className="h-3 w-3" />
            {banco}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1.5">Alias (opcional)</label>
        <input
          type="text"
          placeholder="ej: juan.perez.mp"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className="w-full px-4 py-3 rounded-md text-sm border border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="p-3 rounded-md text-xs leading-snug" style={{ backgroundColor: `${MP_BLUE}10`, border: `1px solid ${MP_BLUE}30`, color: MP_TEXT }}>
        <p className="font-semibold mb-1.5">¿Qué estás autorizando?</p>
        <ul className="space-y-1 list-disc pl-4">
          <li>Débito automático mensual por {formatMonto(sesion.monto)} mientras la deuda esté vigente.</li>
          <li>Notificación por email 72 hs antes de cada débito.</li>
          <li>Cancelable en cualquier momento desde tu panel o tu banco.</li>
        </ul>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5" />
        <span className="text-xs leading-snug text-gray-700">
          Acepto la adhesión al débito automático con mi CBU y los términos del servicio.
        </span>
      </label>

      <div className="flex gap-2 pt-2">
        <button onClick={onCancelar} disabled={procesando} className="px-4 py-3 rounded-md font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95 transition-all">
          Cancelar
        </button>
        <button onClick={onConfirmar} disabled={!cbuValido || !acepto || procesando} className="flex-1 py-3 rounded-md font-bold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50" style={{ backgroundColor: MP_BLUE }}>
          {procesando ? (<><Loader2 className="h-5 w-5 animate-spin" /> Procesando adhesión...</>) : (<><ShieldCheck className="h-5 w-5" /> Confirmar adhesión</>)}
        </button>
      </div>
    </div>
  );
}
