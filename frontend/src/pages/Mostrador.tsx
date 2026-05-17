import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, AlertTriangle, Receipt,
  ClipboardList, ScanLine, ShieldCheck,
  Loader2, RefreshCcw, ChevronRight, ExternalLink, Search,
  Sparkles, X, Edit3, IdCard, Smartphone, QrCode,
  Mail, MapPin, Banknote, Clock,
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
type ModoId = 'dni' | 'celular';

/**
 * Mostrador — consola de operador de ventanilla (v4, basado en handoff de Claude Design).
 *
 * Flujo:
 *   1. Elegir modo (DNI / Celular) — 2 cards grandes con kbd hint.
 *   2a. DNI → input compacto + resultados enriquecidos (badges, deuda).
 *   2b. Celular → tarjeta de validación biométrica con QR + steps en vivo.
 *   3. Identificado → franja del vecino + 3 GestionCards + actividad reciente.
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
      {/* === Header + Métricas — sticky arriba === */}
      <div
        className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 space-y-3 backdrop-blur-md"
        style={{ backgroundColor: `${theme.background}cc` }}
      >
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

        {metricas && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MetricaCard color="#3b82f6" icon={<FileText className="w-4 h-4" />} label="Trámites hoy" value={metricas.tramites_hoy} />
            <MetricaCard color="#22c55e" icon={<CheckCircle2 className="w-4 h-4" />} label="Pagados" value={metricas.pagados_hoy} />
            <MetricaCard color="#8b5cf6" icon={<Receipt className="w-4 h-4" />} label="Recaudado" value={metricas.monto_hoy} formatMoney />
          </div>
        )}
      </div>

      <PageHint pageId="mostrador" />

      {/* === Cuerpo === */}
      {paso === 'identificar' && municipioId && (
        <PasoIdentificar
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
              user_id: d.user_id,
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
// MetricaCard
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
      className="rounded-xl p-2.5 sm:p-3 transition-all hover:scale-[1.02] min-w-0"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-start justify-between gap-1.5 min-w-0">
        <span
          className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold leading-tight min-w-0 flex-1"
          style={{ color: theme.textSecondary }}
        >
          {label}
        </span>
        <span
          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </span>
      </div>
      <p className="text-base sm:text-xl font-bold tabular-nums mt-1 truncate" style={{ color: theme.text }}>{display}</p>
    </div>
  );
}

// ============================================================
// PasoIdentificar — ModePicker (2 cards grandes) + contenido del modo
// ============================================================
function PasoIdentificar({ onClienteRegistrado, onBiometriaOk, onCargarManual }: {
  onClienteRegistrado: (v: VecinoEncontrado) => void;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onCargarManual: () => void;
}) {
  const { theme } = useTheme();
  const [modo, setModo] = useState<ModoId>('dni');
  const [busquedaLibreAbierta, setBusquedaLibreAbierta] = useState(false);

  return (
    <div className="space-y-3">
      <ModePicker modo={modo} setModo={setModo} />

      <div className="relative overflow-hidden">
        <div key={modo} className="animate-tab-slide">
          {modo === 'dni' && <PanelDni onUsar={onClienteRegistrado} />}
          {modo === 'celular' && (
            <PanelCelular onAprobado={onBiometriaOk} onCargarManual={onCargarManual} />
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

      {/* Footer con búsqueda libre y carga manual */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
      >
        <div className="flex items-center gap-3">
          <span>¿No tenés el dato exacto?</span>
          <button
            onClick={() => setBusquedaLibreAbierta((v) => !v)}
            className="font-semibold hover:underline"
            style={{ color: theme.primary }}
          >
            Buscar por nombre / apellido
          </button>
          <span style={{ color: theme.border }}>·</span>
          <button
            onClick={onCargarManual}
            className="font-semibold hover:underline"
            style={{ color: theme.primary }}
          >
            Cargar vecino nuevo
          </button>
        </div>
        <span className="opacity-70">Última sincronización RENAPER: hace 2 min</span>
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
// ModePicker — 2 cards grandes DNI / Celular
// ============================================================
function ModePicker({ modo, setModo }: { modo: ModoId; setModo: (m: ModoId) => void }) {
  const { theme } = useTheme();
  const modos: Array<{ id: ModoId; label: string; sub: string; icon: React.ReactNode; kbd: string; color: string }> = [
    {
      id: 'dni',
      label: 'Por DNI',
      sub: 'Cliente ya registrado en el padrón municipal',
      icon: <IdCard className="w-5 h-5" />,
      kbd: '⌘1',
      color: theme.primary,
    },
    {
      id: 'celular',
      label: 'Por celular',
      sub: 'Generamos un QR · RENAPER + selfie del lado del vecino',
      icon: <Smartphone className="w-5 h-5" />,
      kbd: '⌘2',
      color: '#22c55e',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {modos.map((m) => {
        const activo = modo === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setModo(m.id)}
            aria-pressed={activo}
            className="text-left rounded-2xl p-4 flex items-start gap-3 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              backgroundColor: activo ? `${m.color}10` : theme.card,
              border: `1.5px solid ${activo ? m.color : theme.border}`,
              boxShadow: activo ? `0 4px 16px ${m.color}25` : 'none',
            }}
          >
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: activo ? m.color : `${m.color}18`,
                color: activo ? '#fff' : m.color,
              }}
            >
              {m.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold leading-tight" style={{ color: theme.text }}>
                {m.label}
              </div>
              <div className="text-[11px] mt-0.5 leading-snug" style={{ color: theme.textSecondary }}>
                {m.sub}
              </div>
            </div>
            <kbd
              className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold flex-shrink-0"
              style={{
                backgroundColor: activo ? `${m.color}20` : theme.backgroundSecondary,
                color: activo ? m.color : theme.textSecondary,
                border: `1px solid ${activo ? `${m.color}30` : theme.border}`,
              }}
            >
              {m.kbd}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// PanelDni — input compacto + resultados enriquecidos
// ============================================================
function PanelDni({ onUsar }: { onUsar: (v: VecinoEncontrado) => void }) {
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
    if (e.key === 'Enter') {
      if (resultados && resultados.length > 0) onUsar(resultados[0]);
      else buscar();
    }
    if (e.key === 'Escape') limpiar();
  };

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-0"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={dni}
            onChange={(e) => { setDni(e.target.value.replace(/\D/g, '').slice(0, 9)); setSinResultados(false); }}
            onKeyDown={handleKeyDown}
            placeholder="DNI del vecino (sin puntos)"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono"
            style={{ color: theme.text }}
            maxLength={9}
          />
          {dni && !buscando && (
            <button
              onClick={limpiar}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/5 flex-shrink-0"
              style={{ color: theme.textSecondary }}
              title="Limpiar (ESC)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={buscar}
          disabled={buscando || !dni.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: theme.primary }}
        >
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]" style={{ color: theme.textSecondary }}>
        <span className="inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" style={{ color: theme.primary }} />
          Si no está en el padrón, validá con RENAPER (modo Celular).
        </span>
      </div>

      {resultados && resultados.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
            </p>
            <p className="text-[11px]" style={{ color: theme.textSecondary }}>
              <kbd className="px-1 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>↵</kbd> usa el primero
            </p>
          </div>
          <div className="space-y-2">
            {resultados.map((v, i) => (
              <ResultadoVecino key={v.user_id} vecino={v} selected={i === 0} onUsar={onUsar} />
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
// ResultadoVecino — fila enriquecida (avatar + badges + signal deuda)
// ============================================================
function ResultadoVecino({ vecino: v, selected, onUsar }: {
  vecino: VecinoEncontrado;
  selected?: boolean;
  onUsar: (v: VecinoEncontrado) => void;
}) {
  const { theme } = useTheme();
  const verificado = v.nivel_verificacion >= 2;
  const isAssisted = v.kyc_modo === 'assisted';
  return (
    <button
      onClick={() => onUsar(v)}
      className="w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all hover:shadow-md"
      style={{
        backgroundColor: theme.backgroundSecondary,
        border: `1.5px solid ${selected ? `${theme.primary}60` : theme.border}`,
        boxShadow: selected ? `0 4px 16px ${theme.primary}15` : 'none',
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
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
          <span className="inline-flex items-center gap-1"><IdCard className="w-3 h-3" /> <span className="font-mono">{v.dni}</span></span>
          {v.telefono && <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> {v.telefono}</span>}
          {v.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {v.email}</span>}
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
// BusquedaLibre
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
          {resultados.map((v, i) => (
            <ResultadoVecino key={v.user_id} vecino={v} selected={i === 0} onUsar={onUsar} />
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
    </div>
  );
}

// ============================================================
// Hub — VecinoStrip + 3 GestionCards + RecentActivity
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

  // Atajos de teclado: R / T / D / Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onIrReclamo(); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); onIrTramite(); }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); onIrTasas(); }
      if (e.key === 'Escape') { e.preventDefault(); onReset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onIrReclamo, onIrTramite, onIrTasas, onReset]);

  return (
    <div className="space-y-4">
      <VecinoStrip vecino={vecino} kycSessionId={kycSessionId} onReset={onReset} />

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
          ¿Qué gestión vamos a iniciar?
        </span>
        <span className="hidden sm:flex items-center gap-2 text-[11px]" style={{ color: theme.textSecondary }}>
          <Kbd>R</Kbd> reclamo
          <Kbd>T</Kbd> trámite
          <Kbd>D</Kbd> tasas
          <Kbd>Esc</Kbd> cancelar
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GestionCard
          color="#3b82f6"
          icon={<AlertTriangle className="w-5 h-5" />}
          kbd="R"
          title="Reclamo"
          subtitle="Reportar problema urbano (bache, alumbrado, residuos, ramas)"
          contextBadge={{ tone: 'amber', text: '2 abiertos en la zona' }}
          ctaLabel="Cargar reclamo"
          onStart={onIrReclamo}
        />
        <GestionCard
          color="#22c55e"
          icon={<FileText className="w-5 h-5" />}
          kbd="T"
          title="Trámite"
          subtitle="Iniciar trámite. Mandá requisitos por WhatsApp o imprimí el PDF."
          contextBadge={{ tone: 'violet', text: 'AI ayuda a clasificar' }}
          highlighted
          ctaLabel="Iniciar trámite"
          onStart={onIrTramite}
        />
        <GestionCard
          color="#8b5cf6"
          icon={<Banknote className="w-5 h-5" />}
          kbd="D"
          title="Tasas"
          subtitle="Pagar tasas pendientes (ABL, patente, cementerio, multas)"
          contextBadge={{ tone: 'gray', text: 'Sin deuda registrada' }}
          ctaLabel="Ver deudas"
          onStart={onIrTasas}
        />
      </div>

      <RecentActivity vecino={vecino} />
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <kbd
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{
        backgroundColor: theme.backgroundSecondary,
        border: `1px solid ${theme.border}`,
        color: theme.textSecondary,
      }}
    >
      {children}
    </kbd>
  );
}

// ============================================================
// VecinoStrip — franja con avatar, datos y stats laterales
// ============================================================
function VecinoStrip({ vecino, kycSessionId, onReset }: {
  vecino: KycDatos;
  kycSessionId: string | null;
  onReset: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div
      className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
      style={{
        background: `linear-gradient(135deg, ${theme.primary}10 0%, ${theme.card} 100%)`,
        border: `1px solid ${theme.primary}30`,
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{ backgroundColor: `${theme.primary}25`, color: theme.primary }}
        >
          {(vecino.nombre?.[0] || '?')}{(vecino.apellido?.[0] || '')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-bold truncate" style={{ color: theme.text }}>
              {vecino.nombre || '—'} {vecino.apellido || ''}
            </p>
            {kycSessionId && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}
              >
                <ShieldCheck className="w-3 h-3" /> Verificado RENAPER
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] mt-0.5 flex-wrap" style={{ color: theme.textSecondary }}>
            <span className="inline-flex items-center gap-1"><IdCard className="w-3 h-3" /> DNI <span className="font-mono">{vecino.dni || '—'}</span></span>
            {vecino.telefono && <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> {vecino.telefono}</span>}
            {vecino.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {vecino.email}</span>}
            {vecino.direccion && <span className="inline-flex items-center gap-1 truncate"><MapPin className="w-3 h-3" /> {vecino.direccion}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-all hover:scale-105 active:scale-95"
        style={{ color: theme.textSecondary, backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <RefreshCcw className="w-3 h-3" />
        Cambiar
      </button>
    </div>
  );
}

// ============================================================
// GestionCard — card con context badge, kbd y CTA
// ============================================================
function GestionCard({ color, icon, kbd, title, subtitle, contextBadge, highlighted, ctaLabel, onStart }: {
  color: string;
  icon: React.ReactNode;
  kbd: string;
  title: string;
  subtitle: string;
  contextBadge?: { tone: 'amber' | 'violet' | 'red' | 'gray'; text: string };
  highlighted?: boolean;
  ctaLabel: string;
  onStart: () => void;
}) {
  const { theme } = useTheme();
  const toneColors: Record<string, { bg: string; fg: string }> = {
    amber: { bg: '#f59e0b18', fg: '#d97706' },
    violet: { bg: '#8b5cf618', fg: '#7c3aed' },
    red: { bg: '#ef444418', fg: '#dc2626' },
    gray: { bg: `${theme.textSecondary}15`, fg: theme.textSecondary },
  };
  const tone = contextBadge ? toneColors[contextBadge.tone] : null;

  return (
    <button
      onClick={onStart}
      className="text-left rounded-2xl p-4 flex flex-col transition-all hover:scale-[1.02] active:scale-[0.99] hover:shadow-lg"
      style={{
        backgroundColor: theme.card,
        border: `1.5px solid ${highlighted ? color : color + '40'}`,
        boxShadow: highlighted ? `0 8px 24px ${color}25` : 'none',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
        {highlighted && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${color}20`, color }}
          >
            <Sparkles className="w-3 h-3" /> Sugerido
          </span>
        )}
        <kbd
          className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
          style={{
            backgroundColor: theme.backgroundSecondary,
            border: `1px solid ${theme.border}`,
            color: theme.textSecondary,
          }}
        >
          {kbd}
        </kbd>
      </div>
      <h3 className="text-base font-bold mb-1" style={{ color: theme.text }}>{title}</h3>
      <p className="text-xs flex-1 mb-3 leading-relaxed" style={{ color: theme.textSecondary }}>
        {subtitle}
      </p>
      <div className="flex items-center justify-between gap-2 mt-auto">
        {tone && contextBadge && (
          <span
            className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: tone.bg, color: tone.fg }}
          >
            {contextBadge.text}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold ml-auto"
          style={{ color }}
        >
          {ctaLabel}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

// ============================================================
// RecentActivity — historial del vecino (mock por ahora, ver TODO)
// ============================================================
function RecentActivity({ vecino }: { vecino: KycDatos }) {
  const { theme } = useTheme();
  // TODO: conectar a un endpoint /api/operador/historial/{user_id}.
  // Por ahora muestra placeholder vacío en producción (sin datos mock).
  // El layout queda en el componente para cuando llegue el endpoint.
  const nombre = vecino.nombre || 'el vecino';
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: theme.text }}>
          <Clock className="w-3.5 h-3.5" />
          Actividad reciente de {nombre}
        </div>
        <button
          className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
          style={{ color: theme.primary }}
          onClick={() => { /* TODO: navegar a historial completo */ }}
        >
          Ver historial completo <ExternalLink className="w-3 h-3" />
        </button>
      </div>
      <div
        className="rounded-xl p-6 text-center text-xs"
        style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, border: `1px dashed ${theme.border}` }}
      >
        <ClipboardList className="w-5 h-5 mx-auto mb-2 opacity-50" />
        Sin historial cargado todavía
      </div>
    </div>
  );
}

// ============================================================
// PanelCelular — handoff PC ↔ celular: QR + Didit + steps en vivo
// ============================================================
function PanelCelular({ onAprobado, onCargarManual }: {
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
  const [stepProgress, setStepProgress] = useState<number>(0);
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

        const exp = new Date(e.expires_at).getTime();
        setSecondsLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)));

        if (e.estado === 'en_curso' && phase === 'awaiting') {
          setPhase('in_progress');
          setStepProgress((p) => Math.max(p, 30));
        } else if (e.estado === 'en_curso' && phase === 'in_progress') {
          // Avanza progresivamente — la API no expone steps, simulamos suavemente
          setStepProgress((p) => Math.min(p + 5, 85));
        } else if (e.estado === 'completada' && e.payload && e.payload.dni) {
          setStepProgress(100);
          setResultadoAprobado({
            datos: {
              user_id: e.payload.user_id,
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
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [handoffToken, phase]);

  useEffect(() => {
    if (!resultadoAprobado) return;
    const t = setTimeout(() => {
      onAprobado(resultadoAprobado.datos, resultadoAprobado.sessionId);
    }, 1200);
    return () => clearTimeout(t);
  }, [resultadoAprobado, onAprobado]);

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
    setStepProgress(0);
    try {
      const r = await capturaMovilApi.iniciar({});
      setHandoffToken(r.data.handoff_token);
      setQrValue(r.data.qr_value);
      setDiditUrl(r.data.didit_url);
      const exp = new Date(r.data.expires_at).getTime();
      setSecondsLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)));
      setPhase('awaiting');
      setStepProgress(10);
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
    setStepProgress(0);
    setPhase('idle');
  };

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {phase === 'idle' && (
        <div className="text-center space-y-4">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mx-auto"
            style={{ backgroundColor: '#22c55e15' }}
          >
            <Smartphone className="w-8 h-8" style={{ color: '#22c55e' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: theme.text }}>
              Validar identidad con tu celular
            </h3>
            <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Generamos un QR. Lo escaneás con tu celular y validás al vecino con la cámara
              del celu (<b>DNI</b> + <b>selfie</b> + <b>RENAPER</b>). Cuando termina, la PC se completa sola.
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
          <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: theme.textSecondary }}>
            <ShieldCheck className="w-3 h-3" />
            Validación biométrica oficial · sin tocar la PC de la municipalidad
          </div>
        </div>
      )}

      {phase === 'creating' && (
        <div className="text-center py-6 space-y-3">
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: '#22c55e' }} />
          <p className="text-sm" style={{ color: theme.textSecondary }}>Generando sesión…</p>
        </div>
      )}

      {(phase === 'awaiting' || phase === 'in_progress') && qrValue && (
        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-5 items-start">
          {/* QR del lado izquierdo */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="p-3 rounded-2xl bg-white"
              style={{ border: `2px solid ${phase === 'in_progress' ? '#22c55e' : theme.border}` }}
            >
              <QRCodeSVG
                value={qrValue}
                size={180}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: theme.textSecondary }}>
              <RefreshCcw className="w-3 h-3" />
              <span>Expira en <b style={{ color: theme.text }} className="font-mono tabular-nums">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</b></span>
            </div>
          </div>

          {/* Steps + progreso del lado derecho */}
          <div className="space-y-2">
            <div>
              <h3 className="text-base font-bold" style={{ color: theme.text }}>
                {phase === 'in_progress' ? 'Capturando en el celular…' : 'Escaneá con tu celular'}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                {phase === 'in_progress'
                  ? 'No cierres esta ventana. La PC se completa sola al terminar.'
                  : 'Abrí la cámara del celu y apuntá al QR.'}
              </p>
            </div>

            <QrStepRow done label="QR generado" sub="Esperando que el vecino escanee con su celu" />
            <QrStepRow
              done={stepProgress > 30}
              current={phase === 'in_progress' && stepProgress <= 30}
              index={2}
              label="Foto del DNI"
              sub="Frente + dorso desde el celu del vecino"
            />
            <QrStepRow
              done={stepProgress > 60}
              current={phase === 'in_progress' && stepProgress > 30 && stepProgress <= 60}
              index={3}
              label="Selfie con prueba de vida"
              sub="El vecino mira a la cámara y parpadea"
            />
            <QrStepRow
              done={stepProgress > 85}
              current={phase === 'in_progress' && stepProgress > 60}
              index={4}
              label="Validamos contra RENAPER"
              sub="Match biométrico oficial"
            />

            {/* Barra de progreso */}
            <div className="pt-2">
              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${stepProgress}%`, backgroundColor: '#22c55e' }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: theme.textSecondary }}>
                  <Sparkles className="w-3 h-3" style={{ color: theme.primary }} />
                  En progreso · {stepProgress}%
                </span>
                <button
                  onClick={cancelar}
                  className="text-[11px] px-2 py-1 rounded-md hover:bg-black/5"
                  style={{ color: theme.textSecondary }}
                >
                  Cancelar
                </button>
              </div>
            </div>

            {diditUrl && (
              <div
                className="rounded-lg p-2.5 text-[11px] mt-2"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
              >
                <span className="font-semibold mr-1" style={{ color: theme.text }}>¿No tenés el celu?</span>
                <a
                  href={diditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                  style={{ color: theme.primary }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir en esta PC
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'completed' && (
        <div className="text-center py-4 space-y-3 animate-in fade-in zoom-in-95 duration-300">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mx-auto"
            style={{ backgroundColor: '#22c55e20' }}
          >
            <CheckCircle2 className="w-9 h-9" style={{ color: '#22c55e' }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: '#22c55e' }}>Identidad validada con RENAPER</h3>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Datos biométricos coinciden. Cargando ficha…
            </p>
          </div>
        </div>
      )}

      {phase === 'rejected' && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mx-auto"
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
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mx-auto"
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
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mx-auto"
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

// ============================================================
// QrStepRow — una fila del check-list de captura biométrica
// ============================================================
function QrStepRow({ done, current, index, label, sub }: {
  done?: boolean;
  current?: boolean;
  index?: number;
  label: string;
  sub: string;
}) {
  const { theme } = useTheme();
  const color = done ? '#22c55e' : current ? '#22c55e' : theme.textSecondary;
  return (
    <div
      className="flex items-start gap-2.5 p-2 rounded-lg"
      style={{
        backgroundColor: current ? '#22c55e08' : 'transparent',
        border: current ? '1px solid #22c55e30' : '1px solid transparent',
      }}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
        style={{
          backgroundColor: done ? '#22c55e' : current ? '#22c55e20' : theme.backgroundSecondary,
          color: done ? '#fff' : color,
          border: done ? 'none' : `1px solid ${current ? '#22c55e' : theme.border}`,
        }}
      >
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : index}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold leading-tight" style={{ color: theme.text }}>{label}</div>
        <div className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>{sub}</div>
      </div>
    </div>
  );
}
