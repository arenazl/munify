import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User as UserIcon, FileText, CheckCircle2, AlertTriangle, Receipt,
  ClipboardList, ScanLine, Camera, ShieldCheck,
  Loader2, RefreshCcw, ChevronRight, ExternalLink, Search, UserPlus,
  UserCheck, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { operadorApi } from '../lib/api';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
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
 * Mostrador — consola de operador de ventanilla.
 *
 * Dos pasos:
 *   1. Identificar al vecino (biometría Didit, buscador por DNI o carga manual).
 *   2. Hub con 3 cards: Reclamo · Trámite · Tasas. Clic → wizard del vecino con
 *      `?actuando_como=<user_id>`. El wizard maneja PDF/WhatsApp de requisitos
 *      y muestra un modal de confirmación al crear.
 *
 * No hay DJ: el audit trail (operador_user_id + canal=ventanilla_asistida +
 * timestamp + RENAPER session_id si aplica) ya cubre la trazabilidad.
 */
export default function Mostrador() {
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

  return (
    <div className="space-y-4">
      <StickyPageHeader
        icon={<UserIcon className="h-5 w-5" />}
        title="Mostrador — Ventanilla asistida"
      />

      <PageHint pageId="mostrador" />

      {metricas && (
        <div className="grid grid-cols-3 gap-3">
          <MetricaCard color="#3b82f6" icon={<FileText className="w-4 h-4" />} label="Trámites hoy" value={metricas.tramites_hoy} />
          <MetricaCard color="#22c55e" icon={<CheckCircle2 className="w-4 h-4" />} label="Pagados" value={metricas.pagados_hoy} />
          <MetricaCard color="#8b5cf6" icon={<Receipt className="w-4 h-4" />} label="Recaudado" value={metricas.monto_hoy} formatMoney />
        </div>
      )}

      <StepsBar paso={paso} />

      {paso === 'identificar' && municipioId && (
        <PasoIdentificar
          municipioId={municipioId}
          onBiometriaOk={(d, sid) => handleVecinoListo({
            user_id: undefined,
            dni: d.dni,
            nombre: d.nombre,
            apellido: d.apellido,
          }, sid)}
          onManual={() => handleVecinoListo({
            user_id: undefined,
            dni: null,
            nombre: null,
            apellido: null,
          }, null)}
          onClienteRegistrado={(v) => handleVecinoListo({
            user_id: v.user_id,
            dni: v.dni,
            nombre: v.nombre,
            apellido: v.apellido,
            email: v.email,
            telefono: v.telefono,
            direccion: v.direccion,
          }, null)}
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
// Steps bar
// ============================================================
function StepsBar({ paso }: { paso: Paso }) {
  const { theme } = useTheme();
  const steps: Array<{ key: Paso; label: string; icon: React.ReactNode }> = [
    { key: 'identificar', label: '1. Identificar al vecino', icon: <ScanLine className="w-4 h-4" /> },
    { key: 'hub', label: '2. Elegir gestión', icon: <Sparkles className="w-4 h-4" /> },
  ];
  const idx = steps.findIndex((s) => s.key === paso);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const activo = i === idx;
        const pasado = i < idx;
        const color = activo || pasado ? theme.primary : theme.textSecondary;
        return (
          <div key={s.key} className="flex items-center gap-2 flex-1">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold flex-1"
              style={{
                backgroundColor: activo ? `${theme.primary}15` : pasado ? `${theme.primary}08` : theme.backgroundSecondary,
                color,
                border: `1px solid ${activo ? theme.primary : pasado ? `${theme.primary}50` : theme.border}`,
              }}
            >
              <span>{pasado ? <CheckCircle2 className="w-4 h-4" /> : s.icon}</span>
              <span className="truncate">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: theme.textSecondary }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Hub — 3 cards principales (Reclamo / Trámite / Tasas)
// ============================================================
function Hub({
  vecino, kycSessionId, onIrReclamo, onIrTramite, onIrTasas, onReset,
}: {
  vecino: KycDatos;
  kycSessionId: string | null;
  onIrReclamo: () => void;
  onIrTramite: () => void;
  onIrTasas: () => void;
  onReset: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div className="space-y-3">
      {/* Banner del vecino identificado */}
      <div
        className="rounded-xl p-3 flex items-center justify-between gap-3"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
          >
            {(vecino.nombre?.[0] || '?')}{(vecino.apellido?.[0] || '')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate" style={{ color: theme.text }}>
              {vecino.nombre || '—'} {vecino.apellido || ''}
            </p>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.textSecondary }}>
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
          className="text-[11px] underline flex-shrink-0"
          style={{ color: theme.textSecondary }}
        >
          Cambiar vecino
        </button>
      </div>

      {/* 3 cards iguales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BigCard
          color="#3b82f6"
          icon={<ClipboardList className="w-7 h-7" />}
          title="Reclamo"
          desc="Reportar un problema urbano (bache, alumbrado, residuos)"
          actionLabel="Cargar reclamo"
          onAction={onIrReclamo}
        />
        <BigCard
          color="#22c55e"
          icon={<FileText className="w-7 h-7" />}
          title="Trámite"
          desc="Iniciar un trámite. Podés mandar requisitos por WhatsApp o imprimir el PDF antes de cargarlo."
          actionLabel="Iniciar trámite"
          onAction={onIrTramite}
        />
        <BigCard
          color="#8b5cf6"
          icon={<Receipt className="w-7 h-7" />}
          title="Tasas"
          desc="Pagar tasas pendientes (ABL, patente, multas, etc.)"
          actionLabel="Ver deudas y pagar"
          onAction={onIrTasas}
        />
      </div>
    </div>
  );
}

// ============================================================
// BigCard — card genérica para Reclamo / Trámite / Tasas
// ============================================================
function BigCard({
  color, icon, title, desc, actionLabel, onAction,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div
      className="rounded-xl p-4 flex flex-col"
      style={{ backgroundColor: theme.card, border: `1.5px solid ${color}40` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: theme.text }}>{title}</h3>
        </div>
      </div>
      <p className="text-xs flex-1 mb-3" style={{ color: theme.textSecondary }}>
        {desc}
      </p>
      <button
        onClick={onAction}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95"
        style={{ backgroundColor: color }}
      >
        {actionLabel}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================
// Paso 1 — Identificar al vecino (biometría / buscador / manual)
// ============================================================
function PasoIdentificar({
  municipioId, onBiometriaOk, onManual, onClienteRegistrado,
}: {
  municipioId: number;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onManual: () => void;
  onClienteRegistrado: (datos: VecinoEncontrado) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CardClienteNuevo
        municipioId={municipioId}
        onBiometriaOk={onBiometriaOk}
        onManual={onManual}
      />
      <CardClienteRegistrado onUsar={onClienteRegistrado} />
    </div>
  );
}

// ------------------------------------------------------------
// Card izquierda — Cliente nuevo (biometría o manual)
// ------------------------------------------------------------
function CardClienteNuevo({
  municipioId, onBiometriaOk, onManual,
}: {
  municipioId: number;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onManual: () => void;
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
            onBiometriaOk(e.data.datos as KycDatos, r.data.session_id);
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

  const reintentar = () => {
    detenerPolling();
    setSessionId(null);
    setDidurl(null);
    setStatus('idle');
    setError(null);
  };

  const reAbrirPopup = () => {
    if (!didurl) return;
    const w = 480, h = 720;
    const x = window.screenX + (window.outerWidth - w) / 2;
    const y = window.screenY + (window.outerHeight - h) / 2;
    popupRef.current = window.open(didurl, 'didit-kyc', `width=${w},height=${h},left=${x},top=${y}`);
  };

  return (
    <div className="rounded-xl p-6 text-center space-y-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto" style={{ backgroundColor: `${theme.primary}15` }}>
        {status === 'waiting' ? (
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.primary }} />
        ) : status === 'approved' ? (
          <CheckCircle2 className="w-8 h-8" style={{ color: '#22c55e' }} />
        ) : status === 'declined' || status === 'error' ? (
          <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
        ) : (
          <ScanLine className="w-8 h-8" style={{ color: theme.primary }} />
        )}
      </div>

      {status === 'idle' && (
        <>
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              <UserPlus className="w-3 h-3" /> Cliente nuevo
            </div>
            <h3 className="text-lg font-bold" style={{ color: theme.text }}>Validar identidad del vecino</h3>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              Activá la webcam y el escaneo de DNI. El vecino se para delante y RENAPER valida automáticamente.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px]" style={{ color: theme.textSecondary }}>
            <Camera className="w-3.5 h-3.5" /> webcam
            <span>·</span>
            <ScanLine className="w-3.5 h-3.5" /> scan DNI
            <span>·</span>
            <ShieldCheck className="w-3.5 h-3.5" /> RENAPER
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={iniciar}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
              style={{ backgroundColor: theme.primary }}
            >
              <Camera className="w-4 h-4" />
              Iniciar validación biométrica
            </button>
            <button
              onClick={onManual}
              className="px-3 py-2.5 rounded-lg text-sm font-medium"
              style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              Cargar a mano
            </button>
          </div>
        </>
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
              Escaneo del DNI + selfie en la ventana abierta. Esto tarda ~1 minuto.
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
            <button
              onClick={reintentar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Cancelar
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
            <button onClick={reintentar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: theme.primary }}>
              <RefreshCcw className="w-3.5 h-3.5" /> Reintentar
            </button>
            <button onClick={onManual} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
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
          <button onClick={onManual} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ color: theme.text, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
            Seguir con carga manual
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Card derecha — Cliente ya registrado (buscar por DNI)
// ------------------------------------------------------------
function CardClienteRegistrado({ onUsar }: { onUsar: (datos: VecinoEncontrado) => void }) {
  const { theme } = useTheme();
  const [dni, setDni] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<VecinoEncontrado[] | null>(null);
  const [sinResultados, setSinResultados] = useState(false);

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

  return (
    <div className="rounded-xl p-6 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2" style={{ backgroundColor: '#22c55e15', color: '#22c55e' }}>
          <UserCheck className="w-3 h-3" /> Cliente registrado
        </div>
        <h3 className="text-lg font-bold" style={{ color: theme.text }}>Buscar por DNI</h3>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Si el vecino ya usó el sistema, ingresá su DNI y traemos sus datos.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={dni}
          onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 9))}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
          placeholder="DNI del vecino"
          autoFocus
          className="flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        />
        <button
          onClick={buscar}
          disabled={buscando || !dni.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: theme.primary }}
        >
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {resultados && (
        <div className="space-y-2">
          {resultados.map((v) => {
            const verificado = v.nivel_verificacion >= 2;
            const isAssisted = v.kyc_modo === 'assisted';
            return (
              <div
                key={v.user_id}
                className="rounded-lg p-3"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{v.nombre} {v.apellido}</p>
                    <p className="text-xs font-mono" style={{ color: theme.textSecondary }}>DNI {v.dni}</p>
                  </div>
                  {verificado && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: isAssisted ? '#8b5cf620' : '#22c55e20', color: isAssisted ? '#8b5cf6' : '#22c55e' }}>
                      <ShieldCheck className="w-3 h-3" />
                      {isAssisted ? 'Asistido' : 'Verificado'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mb-2" style={{ color: theme.textSecondary }}>
                  {v.telefono && <div>📱 {v.telefono}</div>}
                  {v.email && <div className="truncate" title={v.email}>✉️ {v.email}</div>}
                </div>
                <button
                  onClick={() => onUsar(v)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-[1.01] active:scale-95"
                  style={{ backgroundColor: theme.primary }}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Usar este cliente
                </button>
              </div>
            );
          })}
        </div>
      )}

      {sinResultados && (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b40' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} />
          <div className="text-xs">
            <p className="font-semibold" style={{ color: theme.text }}>No se encontró vecino con ese DNI</p>
            <p style={{ color: theme.textSecondary }}>
              Es cliente nuevo — usá biometría o cargá los datos a mano.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers visuales
// ============================================================
function MetricaCard({ color, icon, label, value, formatMoney }: {
  color: string; icon: React.ReactNode; label: string; value: number | string; formatMoney?: boolean;
}) {
  const { theme } = useTheme();
  const display = formatMoney
    ? `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
    : String(value);
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>{icon}</span>
      </div>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: theme.text }}>{display}</p>
    </div>
  );
}
