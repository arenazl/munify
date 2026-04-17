import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, QrCode, Receipt, Landmark, Repeat,
  ShieldCheck, Loader2, CheckCircle2, ArrowLeft, Lock, Info,
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
