import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, AlertTriangle, Receipt,
  ClipboardList, ScanLine, Camera, ShieldCheck,
  Loader2, RefreshCcw, ChevronRight, ExternalLink, Search,
  UserCheck, Sparkles, X, Edit3, IdCard, Smartphone, QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { operadorApi, capturaMovilApi, type CapturaMovilEstado } from '../lib/api';
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
type TabId = 'dni' | 'biometria' | 'celular';

/**
 * Mostrador — consola de operador de ventanilla (rediseño v3).
 *
 * Layout:
 *   - Header con título + 3 cards de métricas grandes.
 *   - 2 tabs animados: "Por DNI" / "Por biometría". Slide al cambiar.
 *   - Búsqueda secundaria por nombre/apellido (inline, expandible) para
 *     casos donde no se sabe el DNI exacto.
 *   - "Cargar a mano" como ultima opcion cuando no se encuentra vecino.
 */
export default function Mostrador() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [paso, setPaso] = useState<Paso>('identificar');
  const [vecino, setVecino] = useState<KycDatos | null>(null);
  const [kycSessionId, setKycSessionId] = useState<string | null>(null);
  const [metricas, setMetricas] = useState<MostradorMetricas | null>(null);

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
    <div className="space-y-4">
      {/* === Header === */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
        >
          <ScanLine className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight truncate" style={{ color: theme.text }}>
            Mostrador
          </h1>
          <p className="text-xs leading-tight truncate" style={{ color: theme.textSecondary }}>
            Ventanilla asistida · {operadorLabel}
          </p>
        </div>
      </div>

      {/* === Métricas (cards grandes) === */}
      {metricas && (
        <div className="grid grid-cols-3 gap-3">
          <MetricaCard color="#3b82f6" icon={<FileText className="w-4 h-4" />} label="Trámites hoy" value={metricas.tramites_hoy} />
          <MetricaCard color="#22c55e" icon={<CheckCircle2 className="w-4 h-4" />} label="Pagados" value={metricas.pagados_hoy} />
          <MetricaCard color="#8b5cf6" icon={<Receipt className="w-4 h-4" />} label="Recaudado" value={metricas.monto_hoy} formatMoney />
        </div>
      )}

      <PageHint pageId="mostrador" />

      {/* === Cuerpo === */}
      {paso === 'identificar' && municipioId && (
        <PasoIdentificar
          municipioId={municipioId}
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
          onBiometriaOk={(d, sid) =>
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
// MetricaCard — versión card grande (volvió)
// ============================================================
function MetricaCard({ color, icon, label, value, formatMoney }: {
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
      className="rounded-xl p-3 transition-all hover:scale-[1.02]"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
          {label}
        </span>
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: theme.text }}>{display}</p>
    </div>
  );
}

// ============================================================
// PasoIdentificar — Tabs animados (DNI / Biometría) + búsqueda libre
// ============================================================
function PasoIdentificar({ municipioId, onClienteRegistrado, onBiometriaOk, onCargarManual }: {
  municipioId: number;
  onClienteRegistrado: (v: VecinoEncontrado) => void;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onCargarManual: () => void;
}) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<TabId>('dni');
  const [busquedaLibreAbierta, setBusquedaLibreAbierta] = useState(false);

  const tabs: Array<{ id: TabId; label: string; sublabel: string; icon: React.ReactNode; color: string }> = [
    { id: 'dni',        label: 'Por DNI',     sublabel: 'Cliente registrado', icon: <IdCard className="w-4 h-4" />, color: theme.primary },
    { id: 'biometria',  label: 'Por biometría', sublabel: 'RENAPER · webcam', icon: <Camera className="w-4 h-4" />, color: '#8b5cf6' },
    { id: 'celular',    label: 'Por celular',  sublabel: 'RENAPER · QR al celu', icon: <Smartphone className="w-4 h-4" />, color: '#22c55e' },
  ];

  return (
    <div className="space-y-3">
      {/* === Tabs animados === */}
      <div
        className="relative rounded-2xl p-1 flex"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
      >
        {/* Indicador deslizante de pestaña activa */}
        <div
          className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-out"
          style={{
            left: `calc(${(tabs.findIndex(t => t.id === tab) * 100) / tabs.length}% + 4px)`,
            width: `calc(${100 / tabs.length}% - 8px)`,
            backgroundColor: theme.card,
            boxShadow: `0 4px 12px ${tabs.find(t => t.id === tab)?.color}20`,
            border: `1px solid ${tabs.find(t => t.id === tab)?.color}40`,
          }}
        />
        {tabs.map((t) => {
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative z-10 flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                color: activo ? t.color : theme.textSecondary,
              }}
            >
              <span className="transition-transform duration-300" style={{ transform: activo ? 'scale(1.1)' : 'scale(1)' }}>
                {t.icon}
              </span>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-bold leading-tight">{t.label}</p>
                <p className="text-[10px] font-normal leading-tight opacity-70">{t.sublabel}</p>
              </div>
              <span className="sm:hidden">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* === Contenido del tab con animación === */}
      <div className="relative overflow-hidden">
        <div
          key={tab}
          className="animate-tab-slide"
        >
          {tab === 'dni' && <TabDni onUsar={onClienteRegistrado} />}
          {tab === 'biometria' && (
            <TabBiometria
              municipioId={municipioId}
              onAprobado={onBiometriaOk}
              onCargarManual={onCargarManual}
            />
          )}
          {tab === 'celular' && (
            <TabCapturaMovil
              onAprobado={onBiometriaOk}
              onCargarManual={onCargarManual}
            />
          )}
        </div>

        <style>{`
          @keyframes tabSlide {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-tab-slide { animation: tabSlide 0.25s ease-out; }
        `}</style>
      </div>

      {/* === Búsqueda libre + cargar a mano (link sutil) === */}
      <div className="text-center pt-2">
        <button
          onClick={() => setBusquedaLibreAbierta((v) => !v)}
          className="text-xs underline-offset-2 hover:underline"
          style={{ color: theme.textSecondary }}
        >
          ¿No tenés el DNI exacto? Buscá por nombre / apellido
        </button>
      </div>

      {busquedaLibreAbierta && (
        <BusquedaLibre
          onUsar={onClienteRegistrado}
          onCargarManual={onCargarManual}
        />
      )}
    </div>
  );
}

// ============================================================
// TabDni — input DNI grande con autofocus + Enter + resultados
// ============================================================
function TabDni({ onUsar }: { onUsar: (v: VecinoEncontrado) => void }) {
  const { theme } = useTheme();
  const [dni, setDni] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<VecinoEncontrado[] | null>(null);
  const [sinResultados, setSinResultados] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
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
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="text-center mb-4">
        <p className="text-sm font-semibold" style={{ color: theme.text }}>
          Identificar por DNI
        </p>
        <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
          Tipeá el DNI y apretá <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>Enter</kbd>
        </p>
      </div>

      <div
        className="flex items-center gap-2 p-2 rounded-2xl"
        style={{
          backgroundColor: theme.backgroundSecondary,
          border: `2px solid ${theme.primary}40`,
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
          className="flex-1 bg-transparent outline-none text-lg font-mono tracking-wide py-1.5"
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
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 flex-shrink-0"
          style={{ backgroundColor: theme.primary }}
        >
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {/* Resultados */}
      {resultados && resultados.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
            {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {resultados.map((v) => (
              <ResultadoVecino key={v.user_id} vecino={v} onUsar={onUsar} />
            ))}
          </div>
        </div>
      )}

      {sinResultados && (
        <div
          className="mt-4 flex items-start gap-3 p-3 rounded-xl"
          style={{ backgroundColor: '#f59e0b10', border: '1px solid #f59e0b40' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} />
          <div className="flex-1 text-xs">
            <p className="font-semibold" style={{ color: theme.text }}>
              No encontramos vecino con DNI {dni}
            </p>
            <p style={{ color: theme.textSecondary }}>
              Probá con biometría (cliente nuevo) o cargá los datos a mano.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ResultadoVecino — fila compacta clickeable
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
      style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
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
        <div className="flex items-center gap-3 text-[11px] mt-0.5 flex-wrap" style={{ color: theme.textSecondary }}>
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
// TabBiometria — auto-inicia popup Didit + polling
// ============================================================
function TabBiometria({ municipioId, onAprobado, onCargarManual }: {
  municipioId: number;
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
        } catch { /* retry silencioso */ }
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

  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-3" style={{ backgroundColor: `${theme.primary}15` }}>
        {status === 'waiting' || status === 'starting' ? (
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.primary }} />
        ) : status === 'approved' ? (
          <CheckCircle2 className="w-8 h-8" style={{ color: '#22c55e' }} />
        ) : status === 'declined' || status === 'error' ? (
          <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
        ) : (
          <Camera className="w-8 h-8" style={{ color: theme.primary }} />
        )}
      </div>

      {status === 'idle' && (
        <div className="space-y-3">
          <h3 className="text-base font-bold" style={{ color: theme.text }}>Validar identidad del vecino</h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Activá la webcam y el escaneo de DNI. RENAPER valida automáticamente.
          </p>
          <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: theme.textSecondary }}>
            <span className="inline-flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> webcam</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><ScanLine className="w-3.5 h-3.5" /> scan DNI</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> RENAPER</span>
          </div>
          <button
            onClick={iniciar}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
            style={{ backgroundColor: theme.primary }}
          >
            <Camera className="w-4 h-4" />
            Iniciar biometría
          </button>
        </div>
      )}

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
              Escaneo del DNI + selfie en la ventana abierta. ~1 minuto.
            </p>
            <p className="text-[11px] font-mono mt-2" style={{ color: theme.textSecondary }}>Sesión: {sessionId}</p>
          </div>
          <button
            onClick={reAbrirPopup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: theme.primary, backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}40` }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Re-abrir ventana
          </button>
        </div>
      )}

      {status === 'declined' && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold" style={{ color: '#ef4444' }}>Verificación rechazada</h3>
          <p className="text-xs" style={{ color: theme.textSecondary }}>{error}</p>
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
          <h3 className="text-base font-semibold" style={{ color: '#ef4444' }}>No se pudo iniciar la biometría</h3>
          <p className="text-xs" style={{ color: theme.textSecondary }}>{error}</p>
          <button onClick={onCargarManual} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: theme.text, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
            Seguir con carga manual
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BusquedaLibre — buscar por nombre/apellido/DNI parcial (q)
// ============================================================
function BusquedaLibre({ onUsar, onCargarManual }: {
  onUsar: (v: VecinoEncontrado) => void;
  onCargarManual: () => void;
}) {
  const { theme } = useTheme();
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<VecinoEncontrado[] | null>(null);
  const [sinResultados, setSinResultados] = useState(false);

  const buscar = async () => {
    const term = q.trim();
    if (term.length < 2) {
      toast.error('Mínimo 2 caracteres');
      return;
    }
    setBuscando(true);
    setSinResultados(false);
    setResultados(null);
    try {
      const r = await operadorApi.buscarVecino(undefined, term);
      if (r.data.length === 0) setSinResultados(true);
      else setResultados(r.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error buscando vecino');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: theme.text }}>
          Buscar por nombre, apellido o DNI parcial
        </p>
        <p className="text-[11px]" style={{ color: theme.textSecondary }}>
          Útil cuando el vecino no se acuerda el DNI completo.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
          placeholder="Ej: Pérez · Juan · 30217"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        />
        <button
          onClick={buscar}
          disabled={buscando || q.trim().length < 2}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: theme.primary }}
        >
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {resultados && resultados.length > 0 && (
        <div className="space-y-2">
          {resultados.map((v) => (
            <ResultadoVecino key={v.user_id} vecino={v} onUsar={onUsar} />
          ))}
        </div>
      )}

      {sinResultados && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ backgroundColor: '#f59e0b10', border: '1px solid #f59e0b40' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} />
          <div className="flex-1 text-xs">
            <p className="font-semibold" style={{ color: theme.text }}>Sin coincidencias</p>
            <p style={{ color: theme.textSecondary }}>Probá otra palabra o cargalo a mano si es nuevo.</p>
            <button
              onClick={onCargarManual}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
              style={{ backgroundColor: theme.primary }}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Cargar a mano
            </button>
          </div>
        </div>
      )}

      {/* Atajo de carga manual sin buscar */}
      {!resultados && !sinResultados && (
        <div className="text-center pt-1">
          <button
            onClick={onCargarManual}
            className="text-xs underline-offset-2 hover:underline"
            style={{ color: theme.textSecondary }}
          >
            Es vecino nuevo · cargar a mano
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Hub — banner del vecino + 3 BigCards (igual que la versión anterior)
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
// TabCapturaMovil — handoff PC ↔ celular: QR + Didit en el celu
// ============================================================
function TabCapturaMovil({ onAprobado, onCargarManual }: {
  onAprobado: (datos: KycDatos, sessionId: string) => void;
  onCargarManual: () => void;
}) {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<
    'idle' | 'creating' | 'awaiting' | 'in_progress' | 'completed' | 'rejected' | 'cancelled' | 'expired' | 'error'
  >('idle');
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [diditUrl, setDiditUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(600);
  // Cuando la sesión se completa, guardo el payload acá. Un effect separado
  // lo observa y dispara onAprobado tras 900ms — así el cleanup del polling
  // (que se corre cuando phase pasa a 'completed') no cancela el timer.
  const [resultadoAprobado, setResultadoAprobado] = useState<{
    datos: KycDatos;
    sessionId: string;
  } | null>(null);

  // Polling de estado
  useEffect(() => {
    if (!handoffToken) return;
    if (phase !== 'awaiting' && phase !== 'in_progress') return;

    let cancelado = false;
    const tick = async () => {
      try {
        const r = await capturaMovilApi.estado(handoffToken);
        if (cancelado) return;
        const e: CapturaMovilEstado = r.data;

        // Actualizo el countdown
        const exp = new Date(e.expires_at).getTime();
        setSecondsLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)));

        if (e.estado === 'en_curso' && phase === 'awaiting') {
          setPhase('in_progress');
        } else if (e.estado === 'completada' && e.payload && e.payload.dni) {
          setResultadoAprobado({
            datos: {
              dni: e.payload.dni,
              nombre: e.payload.nombre,
              apellido: e.payload.apellido,
            },
            sessionId: e.didit_session_id || handoffToken,
          });
          setPhase('completed');
        } else if (e.estado === 'rechazada') {
          setPhase('rejected');
          setError(e.motivo_rechazo || 'Verificación rechazada');
        } else if (e.estado === 'cancelada') {
          setPhase('cancelled');
        } else if (e.estado === 'expirada') {
          setPhase('expired');
        }
      } catch {
        // retry silencioso
      }
    };
    // primer tick inmediato + cada 3s
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [handoffToken, phase]);

  // Effect dedicado al hand-off: cuando hay resultado aprobado, espero 900ms
  // y disparo onAprobado. Independiente del polling, así no se cancela.
  useEffect(() => {
    if (!resultadoAprobado) return;
    const t = setTimeout(() => {
      onAprobado(resultadoAprobado.datos, resultadoAprobado.sessionId);
    }, 900);
    return () => clearTimeout(t);
  }, [resultadoAprobado, onAprobado]);

  // Cleanup: si se desmonta mientras hay sesión abierta, la cancelo en el server
  useEffect(() => {
    return () => {
      if (handoffToken && (phase === 'awaiting' || phase === 'in_progress')) {
        capturaMovilApi.cancelar(handoffToken).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generar = async () => {
    setPhase('creating');
    setError(null);
    try {
      const r = await capturaMovilApi.iniciar({});
      setHandoffToken(r.data.handoff_token);
      setQrValue(r.data.qr_value);
      setDiditUrl(r.data.didit_url);
      const exp = new Date(r.data.expires_at).getTime();
      setSecondsLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)));
      setPhase('awaiting');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPhase('error');
      setError(msg || 'No se pudo generar el QR');
    }
  };

  const cancelar = async () => {
    if (!handoffToken) {
      setPhase('idle');
      return;
    }
    try {
      await capturaMovilApi.cancelar(handoffToken);
    } catch { /* swallow */ }
    setPhase('cancelled');
  };

  const reset = () => {
    setHandoffToken(null);
    setQrValue(null);
    setDiditUrl(null);
    setError(null);
    setResultadoAprobado(null);
    setPhase('idle');
  };

  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {phase === 'idle' && (
        <div className="text-center space-y-4">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto"
            style={{ backgroundColor: '#22c55e15' }}
          >
            <Smartphone className="w-8 h-8" style={{ color: '#22c55e' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: theme.text }}>
              Validar identidad con tu celular
            </h3>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              Generamos un QR. Lo escaneás con tu celular y validás al vecino con la cámara
              del celu (DNI + selfie + RENAPER). Cuando termina, la PC se completa sola.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: theme.textSecondary }}>
            <span className="inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> QR</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> celular</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> RENAPER</span>
          </div>
          <button
            onClick={generar}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
            style={{ backgroundColor: '#22c55e' }}
          >
            <QrCode className="w-4 h-4" />
            Generar QR
          </button>
        </div>
      )}

      {phase === 'creating' && (
        <div className="text-center py-6 space-y-3">
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: '#22c55e' }} />
          <p className="text-sm" style={{ color: theme.textSecondary }}>Generando sesión…</p>
        </div>
      )}

      {(phase === 'awaiting' || phase === 'in_progress') && qrValue && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-base font-bold" style={{ color: theme.text }}>
              {phase === 'in_progress' ? 'Capturando en el celular…' : 'Escaneá con tu celular'}
            </h3>
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              {phase === 'in_progress'
                ? 'No cierres esta ventana. La PC se completa sola al terminar.'
                : 'Abrí la cámara del celu y apuntá al QR. Te lleva al flujo de captura.'}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div
              className="p-4 rounded-2xl bg-white"
              style={{ border: `2px solid ${phase === 'in_progress' ? '#22c55e' : theme.border}` }}
            >
              <QRCodeSVG
                value={qrValue}
                size={220}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: theme.textSecondary }}>
              {phase === 'in_progress' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#22c55e' }} />
                  <span>El vecino está siendo verificado</span>
                </>
              ) : (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Esperando…</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono tabular-nums">
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            </div>
          </div>

          {diditUrl && (
            <div
              className="rounded-xl p-3 text-xs"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
            >
              <p className="font-semibold mb-1" style={{ color: theme.text }}>¿No tenés el celu a mano?</p>
              <a
                href={diditUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:underline"
                style={{ color: theme.primary }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir en esta misma PC
              </a>
            </div>
          )}

          <div className="flex items-center justify-center">
            <button
              onClick={cancelar}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {phase === 'completed' && (
        <div className="text-center py-6 space-y-3 animate-in fade-in zoom-in-95 duration-300">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto"
            style={{ backgroundColor: '#22c55e20' }}
          >
            <CheckCircle2 className="w-9 h-9" style={{ color: '#22c55e' }} />
          </div>
          <h3 className="text-base font-bold" style={{ color: '#22c55e' }}>Identidad verificada</h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            RENAPER confirmó. Cargando datos del vecino…
          </p>
        </div>
      )}

      {phase === 'rejected' && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto"
            style={{ backgroundColor: '#ef444420' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: '#ef4444' }} />
          </div>
          <h3 className="text-base font-bold" style={{ color: '#ef4444' }}>Verificación rechazada</h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>{error}</p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => { reset(); generar(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ backgroundColor: '#22c55e' }}
            >
              <RefreshCcw className="w-3.5 h-3.5" /> Reintentar
            </button>
            <button
              onClick={onCargarManual}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              Cargar a mano
            </button>
          </div>
        </div>
      )}

      {(phase === 'cancelled' || phase === 'expired') && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto"
            style={{ backgroundColor: '#f59e0b20' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: '#d97706' }} />
          </div>
          <h3 className="text-base font-bold" style={{ color: theme.text }}>
            {phase === 'cancelled' ? 'Sesión cancelada' : 'Sesión expirada'}
          </h3>
          <button
            onClick={() => { reset(); generar(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: '#22c55e' }}
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Generar nuevo QR
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto"
            style={{ backgroundColor: '#ef444420' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: '#ef4444' }} />
          </div>
          <h3 className="text-base font-bold" style={{ color: '#ef4444' }}>No se pudo iniciar</h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>{error}</p>
          <button
            onClick={onCargarManual}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: theme.text, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            Seguir con carga manual
          </button>
        </div>
      )}
    </div>
  );
}


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
