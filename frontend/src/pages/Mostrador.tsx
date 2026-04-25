import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, AlertTriangle, Receipt,
  ClipboardList, ScanLine, Camera, ShieldCheck,
  Loader2, RefreshCcw, ChevronRight, ExternalLink, Search,
  UserCheck, Sparkles, X, Edit3,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { operadorApi } from '../lib/api';
import PageHint from '../components/ui/PageHint';

interface MostradorMetricas {
  tramites_hoy: number;
  pagados_hoy: number;
  monto_hoy: string;
  operador_nombre: string;
}

interface KycDatos {
  user_id?: number;
  dni: string | null;
  nombre: string | null;
  apellido: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

interface VecinoEncontrado {
  user_id: number;
  dni: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  nivel_verificacion: number;
  kyc_modo: string | null;
  verificado_at: string | null;
}

type Paso = 'identificar' | 'hub';

/**
 * Mostrador — consola de operador de ventanilla (rediseño v2).
 *
 * Layout search-first: el operador entra y lo único que ve es un input grande
 * de DNI con autofocus + chips de acciones secundarias (biometría, carga
 * manual). Métricas como barra horizontal compacta arriba, sin steps bar.
 *
 * Lógica idéntica a la versión anterior — sólo cambia el layout.
 */
export default function Mostrador() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [paso, setPaso] = useState<Paso>('identificar');
  const [vecino, setVecino] = useState<KycDatos | null>(null);
  const [kycSessionId, setKycSessionId] = useState<string | null>(null);
  const [metricas, setMetricas] = useState<MostradorMetricas | null>(null);
  const [biometriaAbierta, setBiometriaAbierta] = useState(false);

  const municipioId = user?.municipio_id ?? null;

  useEffect(() => {
    operadorApi.home().then((r) => setMetricas(r.data)).catch(() => setMetricas(null));
  }, []);

  const persistirContexto = useCallback((v: KycDatos, sessionId: string | null) => {
    if (!v.user_id) return;
    const ctx = {
      user_id: v.user_id,
      dni: v.dni,
      nombre: v.nombre,
      apellido: v.apellido,
      email: v.email,
      telefono: v.telefono,
      kyc_session_id: sessionId,
      operador_id: user?.id,
      operador_nombre: `${user?.nombre || ''} ${user?.apellido || ''}`.trim() || user?.email,
    };
    sessionStorage.setItem('mostrador_ctx', JSON.stringify(ctx));
  }, [user]);

  const handleVecinoListo = (datos: KycDatos, sessionId: string | null) => {
    setVecino(datos);
    setKycSessionId(sessionId);
    setPaso('hub');
  };

  const irA = (path: string) => {
    if (!vecino?.user_id) {
      toast.error('Falta identificar al vecino');
      return;
    }
    persistirContexto(vecino, kycSessionId);
    const params = new URLSearchParams();
    params.set('actuando_como', String(vecino.user_id));
    navigate(`${path}?${params.toString()}`);
  };

  const reset = () => {
    sessionStorage.removeItem('mostrador_ctx');
    setVecino(null);
    setKycSessionId(null);
    setPaso('identificar');
  };

  const operadorLabel = useMemo(
    () => metricas?.operador_nombre || `${user?.nombre || ''} ${user?.apellido || ''}`.trim() || user?.email || '',
    [metricas, user],
  );

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 80px)' }}>
      {/* === Topbar compacto: título + métricas inline === */}
      <div
        className="flex items-center justify-between gap-4 px-1 py-3 mb-2"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
          >
            <ScanLine className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight truncate" style={{ color: theme.text }}>
              Mostrador
            </h1>
            <p className="text-[11px] leading-tight truncate" style={{ color: theme.textSecondary }}>
              Ventanilla asistida · {operadorLabel}
            </p>
          </div>
        </div>

        {metricas && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <MetricaChip color="#3b82f6" icon={<FileText className="w-3.5 h-3.5" />} label="hoy" value={metricas.tramites_hoy} />
            <MetricaChip color="#22c55e" icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="pagados" value={metricas.pagados_hoy} />
            <MetricaChip color="#8b5cf6" icon={<Receipt className="w-3.5 h-3.5" />} label="recaudado" value={metricas.monto_hoy} formatMoney />
          </div>
        )}
      </div>

      <PageHint pageId="mostrador" />

      {/* === Cuerpo === */}
      {paso === 'identificar' && municipioId && (
        biometriaAbierta ? (
          <BiometriaPanel
            municipioId={municipioId}
            onCerrar={() => setBiometriaAbierta(false)}
            onAprobado={(d, sid) =>
              handleVecinoListo({
                user_id: undefined,
                dni: d.dni,
                nombre: d.nombre,
                apellido: d.apellido,
              }, sid)
            }
            onCargarManual={() =>
              handleVecinoListo({ user_id: undefined, dni: null, nombre: null, apellido: null }, null)
            }
          />
        ) : (
          <BuscadorVecino
            onAbrirBiometria={() => setBiometriaAbierta(true)}
            onClienteRegistrado={(v) =>
              handleVecinoListo({
                user_id: v.user_id,
                dni: v.dni,
                nombre: v.nombre,
                apellido: v.apellido,
                email: v.email,
                telefono: v.telefono,
                direccion: v.direccion,
              }, null)
            }
            onCargarManual={() =>
              handleVecinoListo({ user_id: undefined, dni: null, nombre: null, apellido: null }, null)
            }
          />
        )
      )}

      {paso === 'hub' && vecino && (
        <Hub
          vecino={vecino}
          kycSessionId={kycSessionId}
          onIrReclamo={() => irA('/gestion/crear-reclamo')}
          onIrTramite={() => irA('/gestion/crear-tramite')}
          onIrTasas={() => irA('/gestion/mis-tasas')}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ============================================================
// MetricaChip — versión inline compacta para el topbar
// ============================================================
function MetricaChip({ color, icon, label, value, formatMoney }: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number | string;
  formatMoney?: boolean;
}) {
  const { theme } = useTheme();
  const display = formatMoney
    ? `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
    : String(value);
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      title={label}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>{display}</span>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>{label}</span>
    </div>
  );
}

// ============================================================
// BuscadorVecino — pantalla principal de identificación
// "Search-first": input DNI dominante en el centro
// ============================================================
function BuscadorVecino({ onAbrirBiometria, onClienteRegistrado, onCargarManual }: {
  onAbrirBiometria: () => void;
  onClienteRegistrado: (v: VecinoEncontrado) => void;
  onCargarManual: () => void;
}) {
  const { theme } = useTheme();
  const [dni, setDni] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<VecinoEncontrado[] | null>(null);
  const [sinResultados, setSinResultados] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus al montar y al hacer ESC para resetear
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const buscar = async () => {
    if (!dni.trim()) return;
    setBuscando(true);
    setSinResultados(false);
    setResultados(null);
    try {
      const r = await operadorApi.buscarVecino(dni.trim());
      if (r.data.length === 0) setSinResultados(true);
      else setResultados(r.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error buscando vecino');
    } finally {
      setBuscando(false);
    }
  };

  const limpiar = () => {
    setDni('');
    setResultados(null);
    setSinResultados(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') buscar();
    if (e.key === 'Escape') limpiar();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">
      {/* Hero centrado */}
      <div className="text-center max-w-xl w-full">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
        >
          <Search className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: theme.text }}>
          Identificar al vecino
        </h2>
        <p className="text-sm" style={{ color: theme.textSecondary }}>
          Tipeá el DNI y apretá <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>Enter</kbd> para buscar
        </p>

        {/* Input gigante */}
        <div
          className="mt-5 flex items-center gap-2 p-2 rounded-2xl shadow-lg"
          style={{
            backgroundColor: theme.card,
            border: `2px solid ${theme.primary}40`,
            boxShadow: `0 8px 32px ${theme.primary}15`,
          }}
        >
          <Search className="w-5 h-5 ml-2 flex-shrink-0" style={{ color: theme.textSecondary }} />
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 9))}
            onKeyDown={handleKeyDown}
            placeholder="DNI del vecino"
            className="flex-1 bg-transparent outline-none text-xl font-mono tracking-wide py-2"
            style={{ color: theme.text }}
          />
          {dni && !buscando && (
            <button
              onClick={limpiar}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5"
              style={{ color: theme.textSecondary }}
              title="Limpiar (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={buscar}
            disabled={buscando || !dni.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 flex-shrink-0"
            style={{ backgroundColor: theme.primary }}
          >
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        {/* Acciones secundarias */}
        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={onAbrirBiometria}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-[1.03] active:scale-95"
            style={{
              backgroundColor: `${theme.primary}10`,
              color: theme.primary,
              border: `1px solid ${theme.primary}40`,
            }}
          >
            <Camera className="w-3.5 h-3.5" />
            Validar con biometría
            <span className="text-[9px] opacity-70 ml-1">(RENAPER · Cliente nuevo)</span>
          </button>
          <button
            onClick={onCargarManual}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-[1.03] active:scale-95"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Cargar a mano
          </button>
        </div>
      </div>

      {/* Resultados de búsqueda */}
      {resultados && resultados.length > 0 && (
        <div className="w-full max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: theme.textSecondary }}>
            {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {resultados.map((v) => (
              <ResultadoVecino key={v.user_id} vecino={v} onUsar={onClienteRegistrado} />
            ))}
          </div>
        </div>
      )}

      {sinResultados && (
        <div className="w-full max-w-xl">
          <div
            className="flex items-start gap-3 p-4 rounded-xl"
            style={{ backgroundColor: '#f59e0b10', border: '1px solid #f59e0b40' }}
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: theme.text }}>
                No encontramos vecino con DNI {dni}
              </p>
              <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                Probablemente sea cliente nuevo. Validalo con biometría o cargá los datos a mano.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={onAbrirBiometria}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
                  style={{ backgroundColor: theme.primary }}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Iniciar biometría
                </button>
                <button
                  onClick={onCargarManual}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
                >
                  Cargar a mano
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ResultadoVecino — card más compacta en una sola fila
// ============================================================
function ResultadoVecino({ vecino: v, onUsar }: {
  vecino: VecinoEncontrado;
  onUsar: (v: VecinoEncontrado) => void;
}) {
  const { theme } = useTheme();
  const verificado = v.nivel_verificacion >= 2;
  const isAssisted = v.kyc_modo === 'assisted';
  return (
    <button
      onClick={() => onUsar(v)}
      className="w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all hover:scale-[1.005] active:scale-[0.99] hover:shadow-md"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
      >
        {(v.nombre?.[0] || '?')}{(v.apellido?.[0] || '')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold truncate" style={{ color: theme.text }}>
            {v.nombre} {v.apellido}
          </p>
          {verificado && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                backgroundColor: isAssisted ? '#8b5cf620' : '#22c55e20',
                color: isAssisted ? '#8b5cf6' : '#22c55e',
              }}
            >
              <ShieldCheck className="w-3 h-3" />
              {isAssisted ? 'Asistido' : 'Verificado'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] mt-0.5" style={{ color: theme.textSecondary }}>
          <span className="font-mono">DNI {v.dni}</span>
          {v.telefono && <span>📱 {v.telefono}</span>}
          {v.email && <span className="truncate">✉️ {v.email}</span>}
        </div>
      </div>
      <div
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: theme.primary }}
      >
        Usar
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}

// ============================================================
// BiometriaPanel — el flujo Didit (popup) en una card centrada
// ============================================================
function BiometriaPanel({ municipioId, onCerrar, onAprobado, onCargarManual }: {
  municipioId: number;
  onCerrar: () => void;
  onAprobado: (datos: KycDatos, sessionId: string) => void;
  onCargarManual: () => void;
}) {
  const { theme } = useTheme();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [didurl, setDidurl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detenerPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      detenerPolling();
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
  }, [detenerPolling]);

  const iniciar = async () => {
    setStatus('starting');
    setError(null);
    try {
      const r = await operadorApi.kycIniciar(municipioId);
      setSessionId(r.data.session_id);
      setDidurl(r.data.url);
      const w = 480, h = 720;
      const x = window.screenX + (window.outerWidth - w) / 2;
      const y = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(r.data.url, 'didit-kyc', `width=${w},height=${h},left=${x},top=${y}`);
      setStatus('waiting');
      pollingRef.current = setInterval(async () => {
        try {
          const e = await operadorApi.kycEstado(r.data.session_id);
          if (e.data.aprobado && e.data.datos) {
            detenerPolling();
            setStatus('approved');
            if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
            onAprobado(e.data.datos as KycDatos, r.data.session_id);
          } else if (e.data.status === 'Declined') {
            detenerPolling();
            setStatus('declined');
            setError(e.data.motivo_rechazo || 'Verificación rechazada');
            if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
          }
        } catch { /* retry */ }
      }, 2500);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setStatus('error');
      setError(msg || 'No se pudo iniciar la biometría');
    }
  };

  const reAbrirPopup = () => {
    if (!didurl) return;
    const w = 480, h = 720;
    const x = window.screenX + (window.outerWidth - w) / 2;
    const y = window.screenY + (window.outerHeight - h) / 2;
    popupRef.current = window.open(didurl, 'didit-kyc', `width=${w},height=${h},left=${x},top=${y}`);
  };

  // Auto-iniciar al montar el panel — el operador ya hizo click "biometría" arriba.
  useEffect(() => {
    if (status === 'idle') iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div
        className="rounded-2xl p-6 max-w-md w-full text-center space-y-4"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, boxShadow: `0 8px 32px ${theme.primary}10` }}
      >
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
            <Camera className="w-3 h-3" /> Validación biométrica
          </div>
          <button onClick={onCerrar} className="text-xs underline" style={{ color: theme.textSecondary }}>
            Cancelar
          </button>
        </div>

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto" style={{ backgroundColor: `${theme.primary}15` }}>
          {status === 'waiting' || status === 'starting' ? (
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.primary }} />
          ) : status === 'approved' ? (
            <CheckCircle2 className="w-8 h-8" style={{ color: '#22c55e' }} />
          ) : status === 'declined' || status === 'error' ? (
            <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
          ) : (
            <ScanLine className="w-8 h-8" style={{ color: theme.primary }} />
          )}
        </div>

        {status === 'starting' && (
          <div>
            <h3 className="text-base font-semibold" style={{ color: theme.text }}>Abriendo Didit…</h3>
            <p className="text-xs" style={{ color: theme.textSecondary }}>Creando sesión de verificación</p>
          </div>
        )}

        {status === 'waiting' && (
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold" style={{ color: theme.text }}>Esperando al vecino…</h3>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Escaneo del DNI + selfie en la ventana abierta. Tarda ~1 minuto.
              </p>
              <p className="text-[11px] font-mono mt-2" style={{ color: theme.textSecondary }}>
                Sesión: {sessionId}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={reAbrirPopup}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ color: theme.primary, backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}40` }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Re-abrir ventana
              </button>
            </div>
          </div>
        )}

        {status === 'declined' && (
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold" style={{ color: '#ef4444' }}>Verificación rechazada</h3>
              <p className="text-xs" style={{ color: theme.textSecondary }}>{error}</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={iniciar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: theme.primary }}>
                <RefreshCcw className="w-3.5 h-3.5" /> Reintentar
              </button>
              <button onClick={onCargarManual} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
                Cargar a mano
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold" style={{ color: '#ef4444' }}>No se pudo iniciar la biometría</h3>
              <p className="text-xs" style={{ color: theme.textSecondary }}>{error}</p>
            </div>
            <button onClick={onCargarManual} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: theme.text, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
              Seguir con carga manual
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Hub — 3 cards grandes con el vecino confirmado arriba
// ============================================================
function Hub({ vecino, kycSessionId, onIrReclamo, onIrTramite, onIrTasas, onReset }: {
  vecino: KycDatos;
  kycSessionId: string | null;
  onIrReclamo: () => void;
  onIrTramite: () => void;
  onIrTasas: () => void;
  onReset: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div className="space-y-4">
      {/* Banner del vecino */}
      <div
        className="rounded-2xl p-4 flex items-center justify-between gap-3"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}10 0%, ${theme.card} 100%)`,
          border: `1px solid ${theme.primary}30`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}25`, color: theme.primary }}
          >
            {(vecino.nombre?.[0] || '?')}{(vecino.apellido?.[0] || '')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold truncate" style={{ color: theme.text }}>
              {vecino.nombre || '—'} {vecino.apellido || ''}
            </p>
            <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: theme.textSecondary }}>
              <span className="font-mono">DNI {vecino.dni || '—'}</span>
              {vecino.telefono && <><span>·</span><span>📱 {vecino.telefono}</span></>}
              {kycSessionId && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
                  <ShieldCheck className="w-3 h-3" /> RENAPER
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-all hover:scale-105 active:scale-95"
          style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
        >
          <X className="w-3 h-3" />
          Cambiar
        </button>
      </div>

      {/* 3 cards grandes */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: theme.textSecondary }}>
          ¿Qué gestión vamos a iniciar?
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigCard
            color="#3b82f6"
            icon={<ClipboardList className="w-7 h-7" />}
            title="Reclamo"
            desc="Reportar problema urbano (bache, alumbrado, residuos)"
            actionLabel="Cargar reclamo"
            onAction={onIrReclamo}
          />
          <BigCard
            color="#22c55e"
            icon={<FileText className="w-7 h-7" />}
            title="Trámite"
            desc="Iniciar trámite. Podés mandar requisitos por WhatsApp o imprimir el PDF."
            actionLabel="Iniciar trámite"
            onAction={onIrTramite}
            highlight
          />
          <BigCard
            color="#8b5cf6"
            icon={<Receipt className="w-7 h-7" />}
            title="Tasas"
            desc="Pagar tasas pendientes (ABL, patente, multas, etc.)"
            actionLabel="Ver deudas"
            onAction={onIrTasas}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BigCard
// ============================================================
function BigCard({ color, icon, title, desc, actionLabel, onAction, highlight }: {
  color: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
  highlight?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onAction}
      className="text-left rounded-2xl p-4 flex flex-col transition-all hover:scale-[1.02] active:scale-[0.99] hover:shadow-lg"
      style={{
        backgroundColor: theme.card,
        border: `1.5px solid ${highlight ? color : color + '40'}`,
        boxShadow: highlight ? `0 8px 24px ${color}25` : 'none',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
        <h3 className="text-base font-bold" style={{ color: theme.text }}>{title}</h3>
        {highlight && <Sparkles className="w-4 h-4 ml-auto" style={{ color }} />}
      </div>
      <p className="text-xs flex-1 mb-3 leading-relaxed" style={{ color: theme.textSecondary }}>
        {desc}
      </p>
      <div
        className="inline-flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ backgroundColor: color }}
      >
        <span>{actionLabel}</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  );
}
