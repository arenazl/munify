import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  User as UserIcon, FileText, CheckCircle2, AlertTriangle, Copy, ExternalLink,
  Clock, Receipt, MessageSquare, Banknote, Upload, Camera, ScanLine, ShieldCheck,
  Loader2, RefreshCcw, ChevronRight, Sparkles, UserPlus, Search, UserCheck, Edit3,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { operadorApi, tramitesApi } from '../lib/api';
import { ModernSelect } from '../components/ui/ModernSelect';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import PageHint from '../components/ui/PageHint';
import type { Tramite } from '../types';

interface MostradorMetricas {
  tramites_hoy: number;
  pagados_hoy: number;
  monto_hoy: string;
  operador_nombre: string;
}

interface InicioResult {
  solicitud_id: number;
  numero_tramite: string;
  user_id: number;
  requiere_pago: boolean;
  pago_diferido: boolean;
  momento_pago: string | null;
  checkout_url: string | null;
  codigo_cut_qr: string | null;
  session_id: string | null;
  monto: number | null;
  wa_me_url: string | null;
  wa_me_mensaje: string | null;
  telefono_vecino: string | null;
}

interface KycDatos {
  dni: string | null;
  nombre: string | null;
  apellido: string | null;
  sexo?: string | null;
  fecha_nacimiento?: string | null;
  nacionalidad?: string | null;
  direccion?: string | null;
  // Extras para cliente pre-existente (Didit no los trae):
  email?: string | null;
  telefono?: string | null;
}

type Paso = 'biometria' | 'datos' | 'confirmar';

/**
 * Mostrador — consola de operador de ventanilla (Fase 6 v2).
 *
 * Flujo wizard de 3 pasos:
 *   1. Biometría (Didit) — identifica al vecino con webcam + escaneo DNI.
 *      Los datos filiatorios se prellenan desde RENAPER. Fallback: cargar a mano.
 *   2. Datos de contacto + trámite — teléfono/email (Didit no lo trae) +
 *      selector de trámite del catálogo.
 *   3. DJ + Enviar — declaración jurada + crea la solicitud y (si hay costo)
 *      genera la sesión de pago con el link wa.me para enviar al vecino.
 */
export default function Mostrador() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [metricas, setMetricas] = useState<MostradorMetricas | null>(null);
  const [tramites, setTramites] = useState<Tramite[]>([]);

  const [paso, setPaso] = useState<Paso>('biometria');

  // Datos del vecino (llenados por Didit o manualmente)
  const [kycSessionId, setKycSessionId] = useState<string | null>(null);
  const [kycDatos, setKycDatos] = useState<KycDatos | null>(null);
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [tramiteId, setTramiteId] = useState<number | null>(null);
  const [djFirmada, setDjFirmada] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [result, setResult] = useState<InicioResult | null>(null);
  const [efectivoOpen, setEfectivoOpen] = useState(false);

  const municipioId = user?.municipio_id ?? null;

  useEffect(() => {
    const load = async () => {
      try {
        const r = await tramitesApi.getAll();
        setTramites((r.data as Tramite[]).filter((t) => t.activo));
      } catch {
        setTramites([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await operadorApi.home();
        setMetricas(r.data);
      } catch {
        setMetricas(null);
      }
    };
    load();
  }, []);

  const tramiteSel = useMemo(
    () => tramites.find((t) => t.id === tramiteId) || null,
    [tramites, tramiteId],
  );

  const resetWizard = () => {
    setPaso('biometria');
    setKycSessionId(null);
    setKycDatos(null);
    setDni('');
    setNombre('');
    setApellido('');
    setEmail('');
    setTelefono('');
    setTramiteId(null);
    setDjFirmada(false);
    setResult(null);
  };

  const handleBiometriaOk = (datos: KycDatos, sessionId: string) => {
    setKycSessionId(sessionId);
    setKycDatos(datos);
    setDni(datos.dni || '');
    setNombre(datos.nombre || '');
    setApellido(datos.apellido || '');
    setPaso('datos');
  };

  const handleCargaManual = () => {
    // Fallback: si Didit no está disponible o falla, el operador carga DNI a mano
    setKycSessionId(null);
    setKycDatos(null);
    setPaso('datos');
  };

  const handleIniciar = async () => {
    if (!municipioId) return;
    if (!dni.trim() || !nombre.trim() || !apellido.trim() || !tramiteId) {
      toast.error('Faltan datos obligatorios');
      return;
    }
    if (!djFirmada) {
      toast.error('Firmá la DJ de validación presencial');
      return;
    }
    setEnviando(true);
    try {
      const r = await operadorApi.iniciarTramite({
        municipio_id: municipioId,
        tramite_id: tramiteId,
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        dj_firmada: true,
        kyc_session_id: kycSessionId || undefined,
      });
      setResult(r.data);
      toast.success(`Trámite ${r.data.numero_tramite} creado`);
      try {
        const m = await operadorApi.home();
        setMetricas(m.data);
      } catch { /* noop */ }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo iniciar el trámite');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <StickyPageHeader
        icon={<UserIcon className="h-5 w-5" />}
        title="Mostrador — Ventanilla"
        subtitle="Iniciar trámite presencial para vecino sin app"
      />

      <PageHint pageId="mostrador" />

      {metricas && (
        <div className="grid grid-cols-3 gap-3">
          <MetricaCard color="#3b82f6" icon={<FileText className="w-4 h-4" />} label="Trámites hoy" value={metricas.tramites_hoy} />
          <MetricaCard color="#22c55e" icon={<CheckCircle2 className="w-4 h-4" />} label="Pagados" value={metricas.pagados_hoy} />
          <MetricaCard color="#8b5cf6" icon={<Receipt className="w-4 h-4" />} label="Recaudado" value={metricas.monto_hoy} formatMoney />
        </div>
      )}

      {/* Wizard steps indicator */}
      {!result && (
        <StepsBar paso={paso} />
      )}

      {/* Contenido segun paso */}
      {!result && paso === 'biometria' && municipioId && (
        <PasoIdentificar
          municipioId={municipioId}
          onBiometriaOk={handleBiometriaOk}
          onManual={handleCargaManual}
          onClienteRegistrado={(datosVecino) => {
            // Cliente pre-existente: prellenamos todos los datos y saltamos
            // al Paso 2. kyc_session_id queda null (no es biometria nueva).
            setKycSessionId(null);
            setKycDatos(datosVecino);
            setDni(datosVecino.dni || '');
            setNombre(datosVecino.nombre || '');
            setApellido(datosVecino.apellido || '');
            setEmail(datosVecino.email || '');
            setTelefono(datosVecino.telefono || '');
            setPaso('datos');
          }}
        />
      )}

      {!result && paso === 'datos' && (
        <PasoDatos
          dni={dni} setDni={setDni}
          nombre={nombre} setNombre={setNombre}
          apellido={apellido} setApellido={setApellido}
          email={email} setEmail={setEmail}
          telefono={telefono} setTelefono={setTelefono}
          tramiteId={tramiteId} setTramiteId={setTramiteId}
          tramites={tramites} tramiteSel={tramiteSel}
          desdeBiometria={!!kycSessionId}
          kycDatos={kycDatos}
          onVolver={() => setPaso('biometria')}
          onSiguiente={() => setPaso('confirmar')}
        />
      )}

      {!result && paso === 'confirmar' && (
        <PasoConfirmar
          dni={dni} nombre={nombre} apellido={apellido}
          telefono={telefono} email={email}
          tramiteSel={tramiteSel}
          kycSessionId={kycSessionId}
          djFirmada={djFirmada} setDjFirmada={setDjFirmada}
          enviando={enviando}
          onVolver={() => setPaso('datos')}
          onEnviar={handleIniciar}
        />
      )}

      {/* Resultado */}
      {result && (
        <ResultadoPanel
          result={result}
          telefonoForm={telefono}
          onNuevoTramite={resetWizard}
          onPagoEfectivo={() => setEfectivoOpen(true)}
        />
      )}

      {result && result.requiere_pago && (
        <EfectivoModal
          open={efectivoOpen}
          onClose={() => setEfectivoOpen(false)}
          solicitudId={result.solicitud_id}
          montoSugerido={result.monto ?? 0}
          onConfirmed={() => {
            setEfectivoOpen(false);
            toast.success('Pago en efectivo registrado');
            operadorApi.home().then((m) => setMetricas(m.data)).catch(() => {});
          }}
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
    { key: 'biometria', label: '1. Identidad', icon: <ScanLine className="w-4 h-4" /> },
    { key: 'datos', label: '2. Contacto + trámite', icon: <FileText className="w-4 h-4" /> },
    { key: 'confirmar', label: '3. Confirmar', icon: <CheckCircle2 className="w-4 h-4" /> },
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
// Paso 1 — Identificar al vecino
// Dos caminos: Cliente nuevo (Didit o manual) vs Cliente registrado (buscar)
// ============================================================
function PasoIdentificar({
  municipioId,
  onBiometriaOk,
  onManual,
  onClienteRegistrado,
}: {
  municipioId: number;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onManual: () => void;
  onClienteRegistrado: (datos: KycDatos) => void;
}) {
  const { theme } = useTheme();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CardClienteNuevo
        municipioId={municipioId}
        onBiometriaOk={onBiometriaOk}
        onManual={onManual}
      />
      <CardClienteRegistrado
        onUsar={onClienteRegistrado}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Card izquierda — Cliente nuevo (biometría o manual)
// ------------------------------------------------------------
function CardClienteNuevo({
  municipioId,
  onBiometriaOk,
  onManual,
}: {
  municipioId: number;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onManual: () => void;
}) {
  const { theme } = useTheme();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [didurl, setDidurl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle'); // idle | starting | waiting | approved | declined | error
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detenerPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
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

      // Abrir popup centrado
      const w = 480;
      const h = 720;
      const x = window.screenX + (window.outerWidth - w) / 2;
      const y = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(
        r.data.url,
        'didit-kyc',
        `width=${w},height=${h},left=${x},top=${y},menubar=no,toolbar=no,location=no`,
      );

      setStatus('waiting');

      // Polling cada 2.5s
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
        } catch {
          /* retry silencioso, puede ser transitorio */
        }
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
              Activá la webcam y el escaneo de DNI. El vecino se para delante y el sistema valida contra RENAPER automáticamente.
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
              title="Didit no disponible o el vecino prefiere no escanearse — cargar datos a mano con DJ del operador"
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
              En la ventana que se abrió: escaneo del DNI + selfie. Esto tarda ~1 minuto.
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

function CardClienteRegistrado({
  onUsar,
}: {
  onUsar: (datos: KycDatos) => void;
}) {
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
      if (r.data.length === 0) {
        setSinResultados(true);
      } else {
        setResultados(r.data);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error buscando vecino');
    } finally {
      setBuscando(false);
    }
  };

  const usar = (v: VecinoEncontrado) => {
    onUsar({
      dni: v.dni,
      nombre: v.nombre,
      apellido: v.apellido,
      email: v.email,
      telefono: v.telefono,
      direccion: v.direccion,
    });
  };

  return (
    <div className="rounded-xl p-6 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2" style={{ backgroundColor: '#22c55e15', color: '#22c55e' }}>
          <UserCheck className="w-3 h-3" /> Cliente registrado
        </div>
        <h3 className="text-lg font-bold" style={{ color: theme.text }}>Buscar por DNI</h3>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Si el vecino ya usó el sistema antes, ingresá su DNI y lo traemos con los datos cargados.
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
                  onClick={() => usar(v)}
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
              Es cliente nuevo → usá la biometría de la izquierda o cargá los datos a mano.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// Paso 2 — Datos (contacto + trámite)
// ============================================================
function PasoDatos({
  dni, setDni,
  nombre, setNombre,
  apellido, setApellido,
  email, setEmail,
  telefono, setTelefono,
  tramiteId, setTramiteId,
  tramites, tramiteSel,
  desdeBiometria, kycDatos,
  onVolver, onSiguiente,
}: {
  dni: string; setDni: (v: string) => void;
  nombre: string; setNombre: (v: string) => void;
  apellido: string; setApellido: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  telefono: string; setTelefono: (v: string) => void;
  tramiteId: number | null; setTramiteId: (v: number | null) => void;
  tramites: Tramite[]; tramiteSel: Tramite | null;
  desdeBiometria: boolean; kycDatos: KycDatos | null;
  onVolver: () => void; onSiguiente: () => void;
}) {
  const { theme } = useTheme();
  const puedeSeguir = !!(dni.trim() && nombre.trim() && apellido.trim() && tramiteId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
            Datos del vecino
          </h3>
          {desdeBiometria && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
              <ShieldCheck className="w-3 h-3" /> Verificado RENAPER
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InputField label="DNI *" value={dni} onChange={(v) => setDni(v.replace(/\D/g, '').slice(0, 9))} readOnly={desdeBiometria} />
          <InputField label="Teléfono (para WhatsApp)" value={telefono} onChange={setTelefono} placeholder="+54 9 11 ..." />
          <InputField label="Nombre *" value={nombre} onChange={setNombre} readOnly={desdeBiometria} />
          <InputField label="Apellido *" value={apellido} onChange={setApellido} readOnly={desdeBiometria} />
        </div>
        <InputField label="Email (opcional)" value={email} onChange={setEmail} placeholder="vecino@ejemplo.com" />

        {kycDatos?.direccion && (
          <div className="rounded p-2 text-[11px]" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
            📍 Dirección en DNI: {kycDatos.direccion}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
          Trámite a iniciar
        </h3>
        <ModernSelect
          value={tramiteId === null ? '' : String(tramiteId)}
          onChange={(v) => setTramiteId(v ? Number(v) : null)}
          options={tramites.map((t) => ({
            value: String(t.id),
            label: t.costo ? `${t.nombre} — $${t.costo.toLocaleString('es-AR')}` : `${t.nombre} — Gratis`,
          }))}
          placeholder="Seleccioná un trámite"
          searchable
        />

        {tramiteSel && (
          <div className="rounded-lg p-3 text-xs space-y-1" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
            <p className="font-semibold" style={{ color: theme.text }}>{tramiteSel.nombre}</p>
            <p className="text-[11px]">{tramiteSel.descripcion || 'Sin descripción'}</p>
            {tramiteSel.requiere_cenat && (
              <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
                <AlertTriangle className="w-3 h-3" /> Requiere comprobante CENAT (se adjunta aparte)
              </p>
            )}
            {tramiteSel.requiere_kyc && !desdeBiometria && (
              <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
                <AlertTriangle className="w-3 h-3" /> Este trámite exige KYC — validá biométricamente en el paso 1
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
          <button
            onClick={onVolver}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            Volver
          </button>
          <button
            onClick={onSiguiente}
            disabled={!puedeSeguir}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            style={{ backgroundColor: theme.primary }}
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Paso 3 — Confirmar
// ============================================================
function PasoConfirmar({
  dni, nombre, apellido, telefono, email,
  tramiteSel, kycSessionId,
  djFirmada, setDjFirmada,
  enviando, onVolver, onEnviar,
}: {
  dni: string; nombre: string; apellido: string; telefono: string; email: string;
  tramiteSel: Tramite | null; kycSessionId: string | null;
  djFirmada: boolean; setDjFirmada: (v: boolean) => void;
  enviando: boolean; onVolver: () => void; onEnviar: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
        Confirmar y enviar
      </h3>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <ReadRow label="Vecino" value={`${nombre} ${apellido}`} />
        <ReadRow label="DNI" value={dni} />
        <ReadRow label="Teléfono" value={telefono || '—'} />
        <ReadRow label="Email" value={email || '—'} />
        <ReadRow label="Trámite" value={tramiteSel?.nombre || '—'} />
        <ReadRow label="Costo" value={tramiteSel?.costo ? `$${tramiteSel.costo.toLocaleString('es-AR')}` : 'Gratis'} />
      </div>

      <div className="rounded-lg p-2 text-[11px]" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
        <ShieldCheck className="w-3.5 h-3.5 inline mr-1" style={{ color: kycSessionId ? '#22c55e' : '#f59e0b' }} />
        {kycSessionId
          ? 'Identidad validada biométricamente contra RENAPER (kyc_modo=assisted)'
          : 'Sin biometría — DJ del operador cubre la validación presencial'}
      </div>

      <label
        className="flex items-start gap-2 cursor-pointer p-3 rounded-lg"
        style={{ backgroundColor: djFirmada ? '#22c55e10' : theme.backgroundSecondary, border: `1px solid ${djFirmada ? '#22c55e60' : theme.border}` }}
      >
        <input type="checkbox" checked={djFirmada} onChange={(e) => setDjFirmada(e.target.checked)} className="mt-0.5 flex-shrink-0" />
        <div className="text-sm" style={{ color: theme.text }}>
          <strong>Declaración Jurada:</strong> confirmo haber validado la identidad del vecino presencialmente
          {kycSessionId ? ' (complementa la verificación biométrica de Didit/RENAPER)' : ' verificando su DNI físico'}.
        </div>
      </label>

      <div className="flex items-center justify-between gap-2 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={onVolver}
          disabled={enviando}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
        >
          Volver
        </button>
        <button
          onClick={onEnviar}
          disabled={enviando || !djFirmada}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          style={{ backgroundColor: theme.primary }}
        >
          {enviando ? <Clock className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {enviando ? 'Creando…' : 'Crear trámite'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Resultado panel
// ============================================================
function ResultadoPanel({
  result, telefonoForm, onNuevoTramite, onPagoEfectivo,
}: {
  result: InicioResult;
  telefonoForm: string;
  onNuevoTramite: () => void;
  onPagoEfectivo: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div className="rounded-xl p-5 space-y-3" style={{ backgroundColor: theme.card, border: `2px solid #22c55e60` }}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
        <span className="text-sm font-bold">Trámite creado</span>
      </div>
      <div className="rounded-lg p-3 font-mono text-center" style={{ backgroundColor: theme.backgroundSecondary }}>
        <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>N° de trámite</p>
        <p className="text-2xl font-bold tabular-nums" style={{ color: theme.primary }}>{result.numero_tramite}</p>
      </div>

      {result.requiere_pago && result.pago_diferido && (
        <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: '#f59e0b10', border: '1px dashed #f59e0b60' }}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" style={{ color: '#d97706' }} />
            <p className="text-xs font-semibold" style={{ color: '#d97706' }}>
              Pago diferido — ${(result.monto ?? 0).toLocaleString('es-AR')}
            </p>
          </div>
          <p className="text-[11px]" style={{ color: theme.textSecondary }}>
            Este trámite se cobra al finalizar. Cuando esté listo para retirar, clickeá "Generar cupón ahora" para enviarle el link de pago al vecino.
          </p>
          <PagoDiferidoBoton solicitudId={result.solicitud_id} />
        </div>
      )}

      {result.requiere_pago && !result.pago_diferido && result.checkout_url && (
        <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: `${theme.primary}10`, border: `1px dashed ${theme.primary}60` }}>
          <p className="text-xs font-semibold" style={{ color: theme.primary }}>
            Link de pago — ${(result.monto ?? 0).toLocaleString('es-AR')}
          </p>
          <div className="flex items-center gap-2">
            <a href={result.checkout_url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-xs font-mono px-2 py-1.5 rounded" style={{ backgroundColor: theme.card, color: theme.text }}>
              {result.checkout_url}
            </a>
            <button onClick={() => { navigator.clipboard.writeText(result.checkout_url!); toast.success('Link copiado'); }} className="px-2 py-1.5 rounded text-xs" style={{ backgroundColor: theme.card, color: theme.primary, border: `1px solid ${theme.primary}40` }}>
              <Copy className="w-3.5 h-3.5" />
            </button>
            <a href={result.checkout_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1.5 rounded text-xs" style={{ backgroundColor: theme.primary, color: 'white' }}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <WaMeEnviar result={result} telefonoForm={telefonoForm} />
        </div>
      )}

      <div className="flex items-center gap-2">
        {result.requiere_pago && !result.pago_diferido && (
          <button onClick={onPagoEfectivo} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01] active:scale-95" style={{ backgroundColor: '#f59e0b20', color: '#d97706', border: '1px solid #f59e0b60' }}>
            <Banknote className="w-4 h-4" />
            Paga en efectivo (caja)
          </button>
        )}
        <button onClick={onNuevoTramite} className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}>
          Cargar otro trámite
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PagoDiferidoBoton — dispara la sesion cuando el tramite esta listo
// ============================================================
function PagoDiferidoBoton({ solicitudId }: { solicitudId: number }) {
  const { theme } = useTheme();
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<{ checkout_url: string; wa_me_url: string | null; monto: number } | null>(null);

  const generar = async () => {
    setGenerando(true);
    try {
      const r = await operadorApi.generarPagoDiferido(solicitudId);
      setResultado({ checkout_url: r.data.checkout_url, wa_me_url: r.data.wa_me_url, monto: r.data.monto });
      toast.success('Cupón generado');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo generar');
    } finally {
      setGenerando(false);
    }
  };

  if (!resultado) {
    return (
      <button onClick={generar} disabled={generando} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50" style={{ backgroundColor: '#d97706' }}>
        {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {generando ? 'Generando…' : 'Generar cupón de pago ahora'}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <a href={resultado.checkout_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded truncate" style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` }}>
        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{resultado.checkout_url}</span>
      </a>
      {resultado.wa_me_url && (
        <button onClick={() => window.open(resultado.wa_me_url!, '_blank', 'noopener,noreferrer')} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#25d366' }}>
          <MessageSquare className="w-4 h-4" />
          Enviar por WhatsApp
        </button>
      )}
    </div>
  );
}


// ============================================================
// WaMeEnviar (reusado) — link wa.me para operador
// ============================================================
function WaMeEnviar({ result, telefonoForm }: { result: InicioResult; telefonoForm: string }) {
  const { theme } = useTheme();
  const [url, setUrl] = useState<string | null>(result.wa_me_url);
  const [mensaje, setMensaje] = useState<string | null>(result.wa_me_mensaje);
  const [telefono, setTelefono] = useState(result.telefono_vecino || telefonoForm || '');
  const [editando, setEditando] = useState(!result.wa_me_url);
  const [generando, setGenerando] = useState(false);

  const handleGenerar = async () => {
    if (!telefono.trim()) { toast.error('Ingresá un teléfono'); return; }
    setGenerando(true);
    try {
      const r = await operadorApi.generarWaMeUrl(result.solicitud_id, telefono.trim());
      setMensaje(r.data.mensaje);
      if (r.data.ok && r.data.wa_me_url) {
        setUrl(r.data.wa_me_url);
        setEditando(false);
        toast.success('Link listo');
      } else {
        setUrl(null);
        toast.error(r.data.motivo_error || 'No se pudo armar');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="space-y-2">
      {url && !editando ? (
        <>
          <button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95" style={{ backgroundColor: '#25d366' }}>
            <MessageSquare className="w-4 h-4" />
            Abrir WhatsApp y enviar a {result.telefono_vecino || telefono}
          </button>
          <button onClick={() => setEditando(true)} className="text-[11px] underline" style={{ color: theme.textSecondary }}>Cambiar número</button>
          {mensaje && (
            <details className="text-[11px]" style={{ color: theme.textSecondary }}>
              <summary className="cursor-pointer">Ver mensaje</summary>
              <pre className="mt-1 p-2 rounded whitespace-pre-wrap" style={{ backgroundColor: theme.backgroundSecondary }}>{mensaje}</pre>
            </details>
          )}
        </>
      ) : (
        <>
          <div className="rounded p-2 text-xs" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
            <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
            Ingresá el teléfono para armar el link de WhatsApp
          </div>
          <div className="flex items-center gap-2">
            <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+54 9 11 ..." className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }} />
            <button onClick={handleGenerar} disabled={generando || !telefono.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#25d366' }}>
              <MessageSquare className="w-3.5 h-3.5" /> {generando ? 'Armando…' : 'Armar link'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// EfectivoModal + helpers de UI
// ============================================================
function EfectivoModal({ open, onClose, solicitudId, montoSugerido, onConfirmed }: { open: boolean; onClose: () => void; solicitudId: number; montoSugerido: number; onConfirmed: () => void }) {
  const { theme } = useTheme();
  const [monto, setMonto] = useState(String(montoSugerido || ''));
  const [numComp, setNumComp] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setMonto(String(montoSugerido || '')); setNumComp(''); setFoto(null); } }, [open, montoSugerido]);
  if (!open) return null;

  const handleSubmit = async () => {
    const m = parseFloat(monto);
    if (!Number.isFinite(m) || m <= 0) { toast.error('Monto inválido'); return; }
    if (!numComp.trim()) { toast.error('N° de comprobante obligatorio'); return; }
    setSubmitting(true);
    try {
      await operadorApi.registrarPagoEfectivo(solicitudId, m, numComp.trim(), foto);
      onConfirmed();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl p-5 w-full max-w-md space-y-3" style={{ backgroundColor: theme.card }}>
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5" style={{ color: '#d97706' }} />
          <h3 className="text-base font-bold">Registrar pago en efectivo</h3>
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1">Monto cobrado</label>
          <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1">N° comprobante caja *</label>
          <input type="text" value={numComp} onChange={(e) => setNumComp(e.target.value)} placeholder="Ej: 00001234" className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }} />
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1">Foto del ticket</label>
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} className="w-full text-xs" />
          {foto && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#22c55e' }}><Upload className="w-3 h-3" /> {foto.name}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-2 rounded-lg text-sm" style={{ color: theme.textSecondary }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={submitting} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#d97706' }}>
            <CheckCircle2 className="w-4 h-4" /> {submitting ? 'Registrando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, readOnly }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
  const { theme } = useTheme();
  return (
    <div>
      <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
        style={{
          backgroundColor: readOnly ? theme.backgroundSecondary : theme.backgroundSecondary,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          opacity: readOnly ? 0.85 : 1,
          cursor: readOnly ? 'not-allowed' : 'text',
        }}
      />
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>{label}</p>
      <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{value}</p>
    </div>
  );
}

function MetricaCard({ color, icon, label, value, formatMoney }: { color: string; icon: React.ReactNode; label: string; value: number | string; formatMoney?: boolean }) {
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
