import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, AlertTriangle, Check,
  ClipboardList, ShieldCheck, ArrowRight,
  Loader2, RefreshCcw, ChevronRight, ExternalLink, Search,
  X, Edit3, IdCard, Smartphone, QrCode,
  Mail, MapPin, Banknote, Clock, CalendarClock,
} from 'lucide-react';
import ReservarTurnoSheet from '../components/turnos/ReservarTurnoSheet';
import { AltaManualVecinoSheet } from '../components/mostrador/AltaManualVecinoSheet';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { operadorApi, capturaMovilApi, type CapturaMovilEstado } from '../lib/api';
import { PageHeader } from '../components/abmv2/PageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../lib/veredictos';

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
  // 0 = sin verificar · 2 = identidad validada (RENAPER, self-service o asistida).
  // Regla de negocio: trámites exigen >= 2; reclamos/turnos no.
  nivel_verificacion?: number;
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

/** Pasos del flujo de atención (canvas Mostrador.dc.html: 3 chips). El 3°
 *  no es un estado de esta pantalla: la carga pasa en el módulo elegido
 *  (Reclamos / Trámites / Turnos) con el vecino precargado — por eso el chip
 *  existe pero no es clickeable. */
const PASOS: { id: Paso | 'cargar'; label: string; deshabilitado?: boolean }[] = [
  { id: 'identificar', label: 'Identificar al vecino' },
  { id: 'hub', label: 'Elegir gestión' },
  { id: 'cargar', label: 'Cargar la gestión', deshabilitado: true },
];

/**
 * Mostrador — consola de operador de ventanilla.
 *
 * MARCO v2 (kit abmv2, referencia del canvas `Mostrador.dc.html`; en esta
 * pasada se usó la versión anterior de la referencia,
 * design/handoff-v2/references/mostrador-flujo.dc.html):
 *   PageHeader → SemanticHero con la stat strip ADENTRO → fila de pasos
 *   (chips `av2-step`) → cuerpo del paso activo.
 * Cero KpiCards sueltos, cero hex: todo sobre tokens `--pl-*`.
 *
 * FLUJO (intacto):
 *   1. Identificar: dos columnas a la par — DNI (padrón) | Celular (QR +
 *      RENAPER + selfie por Didit), más búsqueda libre y alta manual.
 *   2. Hub: franja del vecino + 4 gestiones (reclamo, trámite, turno, tasas)
 *      + actividad reciente.
 *
 * NOTA: los chips numerados se pintan acá con las clases del kit
 * (`av2-steps`/`av2-step*`) en lugar de pasar por `ListToolbar`, porque esa
 * pieza exige `search` + `views` y el Mostrador no tiene ni buscador de lista
 * ni vistas alternativas: montarlos sería un control que no filtra nada.
 */
export default function Mostrador() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [paso, setPaso] = useState<Paso>('identificar');
  const [vecino, setVecino] = useState<KycDatos | null>(null);
  const [kycSessionId, setKycSessionId] = useState<string | null>(null);
  const [metricas, setMetricas] = useState<MostradorMetricas | null>(null);
  const [turnoSheetOpen, setTurnoSheetOpen] = useState(false);
  // Alta manual de vecino (sin biometria) — se abre desde "Cargar vecino
  // nuevo" / "Cargar a mano", opcionalmente con el DNI ya tipeado.
  const [altaManualOpen, setAltaManualOpen] = useState(false);
  const [altaManualDni, setAltaManualDni] = useState('');

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

  // Reclamo ANONIMO: saltea el paso de identificacion SOLO para reclamos.
  // Usa el vecino-sistema "Anonimo" del muni (singleton, lo resuelve el
  // backend) y va directo a la carga. Tramites jamas anonimos (gate 403).
  const irReclamoAnonimo = async () => {
    try {
      const r = await operadorApi.vecinoAnonimo();
      persistirContexto({
        user_id: r.data.user_id,
        dni: r.data.dni,
        nombre: r.data.nombre,
        apellido: r.data.apellido,
        email: r.data.email,
        telefono: r.data.telefono,
        nivel_verificacion: r.data.nivel_verificacion,
      }, null);
      navigate(`/gestion/crear-reclamo?actuando_como=${r.data.user_id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo iniciar el reclamo anónimo');
    }
  };

  const reset = () => {
    sessionStorage.removeItem('mostrador_ctx');
    setVecino(null);
    setKycSessionId(null);
    setPaso('identificar');
  };

  // Click en un chip del flujo. Volver al 1 = cambiar de vecino (limpia el
  // contexto); saltar al 2 sin vecino no se permite.
  const irAPaso = (destino: Paso) => {
    if (destino === paso) return;
    if (destino === 'identificar') {
      reset();
      return;
    }
    if (!vecino?.user_id) {
      toast.error('Primero identificá al vecino');
      return;
    }
    setPaso('hub');
  };

  const operadorLabel = useMemo(
    () => metricas?.operador_nombre || `${user?.nombre || ''} ${user?.apellido || ''}`.trim() || user?.email || '',
    [metricas, user],
  );

  // Hero semántico: frase con datos reales del día (solo si las métricas ya cargaron).
  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (!metricas) return [];
    const u = resolverUmbrales();
    const atendidos = metricas.tramites_hoy;
    const pendientes = Math.max(0, metricas.tramites_hoy - metricas.pagados_hoy);
    return [{
      segmentos: [
        seg('Hoy se atendieron '),
        seg(
          `${atendidos.toLocaleString('es-AR')} trámite${atendidos === 1 ? '' : 's'}`,
          atendidos > 0 ? 'bueno' : undefined,
        ),
        seg(' en ventanilla y '),
        pendientes === 0
          ? seg('no queda ninguno pendiente de pago', veredictoMasEsPeor(pendientes, u.sinAsignar))
          : seg(
              `${pendientes.toLocaleString('es-AR')} sigue${pendientes === 1 ? '' : 'n'} pendiente${pendientes === 1 ? '' : 's'} de pago`,
              veredictoMasEsPeor(pendientes, u.sinAsignar),
            ),
        seg('.'),
      ],
      acciones: [{ label: 'Ver trámites', to: '/gestion/tramites', primaria: true }],
    }];
  }, [metricas]);

  // Stat strip DENTRO del hero (estándar v2: nada de KpiCards sueltos arriba).
  // Solo números que devuelve el backend — nada estimado ni de relleno.
  const heroKpis = useMemo<HeroKpi[]>(() => {
    if (!metricas) return [];
    const u = resolverUmbrales();
    const recaudadoNum = Number(metricas.monto_hoy);
    const pendientes = Math.max(0, metricas.tramites_hoy - metricas.pagados_hoy);
    const pct = metricas.tramites_hoy > 0
      ? Math.round((metricas.pagados_hoy / metricas.tramites_hoy) * 100)
      : 0;
    return [
      {
        etiqueta: 'TRÁMITES HOY',
        valor: metricas.tramites_hoy.toLocaleString('es-AR'),
        sub: 'iniciados en ventanilla',
      },
      {
        etiqueta: 'PAGADOS',
        valor: metricas.pagados_hoy.toLocaleString('es-AR'),
        sub: metricas.tramites_hoy > 0 ? `${pct}% del total` : 'sin trámites todavía',
        veredicto: metricas.pagados_hoy > 0 ? 'bueno' : undefined,
      },
      {
        etiqueta: 'PENDIENTES DE PAGO',
        valor: pendientes.toLocaleString('es-AR'),
        sub: pendientes === 0 ? 'no queda ninguno' : 'esperando cobro',
        veredicto: veredictoMasEsPeor(pendientes, u.sinAsignar),
      },
      {
        etiqueta: 'COBRADO EN CAJA',
        valor: Number.isFinite(recaudadoNum)
          ? `$ ${recaudadoNum.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
          : String(metricas.monto_hoy),
        sub: 'en lo que va del día',
      },
    ];
  }, [metricas]);

  const idxPasoActivo = PASOS.findIndex((p) => p.id === paso);

  return (
    <div className="av2-page" data-module="mostrador">
      {/* 1. Cabecera de módulo: eyebrow + H1 + bajada (arriba de todo). */}
      <PageHeader
        eyebrow="Mostrador"
        title="Atendé al vecino de la ventanilla, de principio a fin"
        description={
          'Identificá al vecino por DNI del padrón o validá su identidad con RENAPER desde su celular, y arrancá el reclamo, el trámite, el turno o el pago sin que tenga que volver.'
          + (operadorLabel ? ` Atiende ${operadorLabel}.` : '')
        }
      />

      {/* 2. ModuleHero = SemanticHero con la stat strip ADENTRO. */}
      <div className="av2-hero-wrap">
        <SemanticHero
          etiqueta="MOSTRADOR · VENTANILLA ASISTIDA"
          frases={heroFrases}
          kpis={heroKpis}
          className="av2-hero"
        />
      </div>

      {/* 3. Fila del flujo: chips numerados (kit) + nota de identidad. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4">
        <div className="av2-steps" role="group" aria-label="Pasos de la atención">
          {PASOS.map((p, i) => {
            const estado = i === idxPasoActivo ? 'activo' : i < idxPasoActivo ? 'hecho' : 'pendiente';
            return (
              <Fragment key={p.id}>
                {i > 0 && (
                  <ArrowRight
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: 'var(--pl-text-faint)' }}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  className={`av2-step av2-step--${estado}`}
                  onClick={p.deshabilitado ? undefined : () => irAPaso(p.id as Paso)}
                  disabled={p.deshabilitado}
                  title={p.deshabilitado ? 'La carga pasa en el módulo elegido, con el vecino precargado' : undefined}
                  aria-current={estado === 'activo' ? 'step' : undefined}
                >
                  <span className="av2-step-num av2-tnum" aria-hidden>
                    {estado === 'hecho' ? <Check size={11} strokeWidth={2.6} /> : i + 1}
                  </span>
                  {p.label}
                </button>
              </Fragment>
            );
          })}
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-[11.5px]"
          style={{ color: 'var(--pl-text-muted)' }}
        >
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          Identidad validada contra RENAPER
        </span>
      </div>

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
              nivel_verificacion: v.nivel_verificacion,
            }, null)
          }
          onBiometriaOk={(d, sid) =>
            handleVecinoListo({
              user_id: d.user_id,
              dni: d.dni,
              nombre: d.nombre,
              apellido: d.apellido,
              nivel_verificacion: 2,
            }, sid)
          }
          onCargarManual={(dniPrefill) => {
            // Guard: si llega desde un onClick directo, el primer arg es un
            // MouseEvent — solo aceptamos string.
            setAltaManualDni(typeof dniPrefill === 'string' ? dniPrefill : '');
            setAltaManualOpen(true);
          }}
          onReclamoAnonimo={irReclamoAnonimo}
        />
      )}

      {/* Alta manual de vecino (sin biometria): crea el registro real y
          recien ahi avanza al hub — antes este boton mandaba al hub con un
          vecino vacio (user_id undefined) y todo quedaba bloqueado. */}
      <AltaManualVecinoSheet
        open={altaManualOpen}
        dniInicial={altaManualDni}
        onClose={() => setAltaManualOpen(false)}
        onCreado={(v) => {
          setAltaManualOpen(false);
          handleVecinoListo({
            user_id: v.user_id,
            dni: v.dni,
            nombre: v.nombre,
            apellido: v.apellido,
            email: v.email,
            telefono: v.telefono,
            direccion: v.direccion,
            nivel_verificacion: v.nivel_verificacion,
          }, null);
        }}
      />

      {paso === 'hub' && vecino && (
        <Hub
          vecino={vecino}
          kycSessionId={kycSessionId}
          onIrReclamo={() => irA('/gestion/crear-reclamo')}
          onIrTramite={() => irA('/gestion/crear-tramite')}
          onIrTasas={() => irA('/gestion/mis-tasas')}
          onIrTurno={() => setTurnoSheetOpen(true)}
          onReset={reset}
        />
      )}

      {/* Turnero desde ventanilla: la funcionaria toma el turno por el vecino */}
      {vecino?.user_id && (
        <ReservarTurnoSheet
          open={turnoSheetOpen}
          onClose={() => setTurnoSheetOpen(false)}
          onReservado={() => setTurnoSheetOpen(false)}
          actuandoComoUserId={vecino.user_id}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Fases del handoff PC ↔ celular. Se declara acá (y no dentro de
 * PanelCelular) porque el chip de estado vive en la CABECERA de la columna,
 * que la pinta el padre — la fase sube por callback.
 * ============================================================ */
type FaseCelular =
  | 'idle' | 'creating' | 'awaiting' | 'in_progress'
  | 'completed' | 'rejected' | 'cancelled' | 'expired' | 'error';

/** Chip de estado de la columna Celular: tono del kit + copy de la fase. */
const CHIP_FASE: Record<FaseCelular, { tono: string; label: string } | null> = {
  idle: null,
  creating: { tono: 'blue', label: 'Generando' },
  awaiting: { tono: 'blue', label: 'Esperando escaneo' },
  in_progress: { tono: 'blue', label: 'En progreso' },
  completed: { tono: 'green', label: 'Validado' },
  rejected: { tono: 'red', label: 'Rechazada' },
  cancelled: { tono: 'gray', label: 'Cancelada' },
  expired: { tono: 'gray', label: 'Expirada' },
  error: { tono: 'red', label: 'Error' },
};

// ============================================================
// PasoIdentificar — 2 columnas 50/50 SIEMPRE visibles (DNI | Celular)
// Sin tabs, sin cambio de modo: las 2 opciones a la par.
// ============================================================
function PasoIdentificar({ onClienteRegistrado, onBiometriaOk, onCargarManual, onReclamoAnonimo }: {
  onClienteRegistrado: (v: VecinoEncontrado) => void;
  onBiometriaOk: (datos: KycDatos, sessionId: string) => void;
  onCargarManual: (dniPrefill?: string) => void;
  onReclamoAnonimo: () => void;
}) {
  /* Canvas Mostrador.dc.html: dos maneras de identificar en un SEGMENTED
     (una card a la vez, max ~560px), no dos columnas a la par. El fallback
     de "vecino nuevo" es la pestaña Por celular. */
  const [modo, setModo] = useState<'buscar' | 'celular'>('buscar');
  const [faseCelular, setFaseCelular] = useState<FaseCelular>('idle');
  const chip = CHIP_FASE[faseCelular];

  return (
    <div className="space-y-3 mt-3">
      <div
        className="inline-flex items-center gap-1 p-1"
        role="tablist"
        aria-label="Cómo identificar al vecino"
        style={{ backgroundColor: 'var(--pl-surface-3)', borderRadius: 'var(--pl-radius-md)' }}
      >
        {([
          { id: 'buscar' as const, label: 'Buscar vecino', icon: <Search className="w-3.5 h-3.5" /> },
          { id: 'celular' as const, label: 'Por celular', icon: <Smartphone className="w-3.5 h-3.5" /> },
        ]).map((t) => {
          const activo = modo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setModo(t.id)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold transition-all"
              style={{
                backgroundColor: activo ? 'var(--pl-surface)' : 'transparent',
                color: activo ? 'var(--pl-text)' : 'var(--pl-text-muted)',
                borderRadius: 'var(--pl-radius-sm)',
                boxShadow: activo ? '0 1px 2px var(--pl-border-strong)' : 'none',
              }}
            >
              {t.icon}
              {t.label}
              {t.id === 'celular' && chip && !activo && (
                <span className={`av2-chip-estado av2-chip-estado--${chip.tono}`}>{chip.label}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="max-w-[560px]">
        {modo === 'buscar' ? (
          <ColumnaModo
            color="var(--pl-green)"
            fondo="var(--pl-green-100)"
            icon={<Search className="w-[17px] h-[17px]" />}
            label="Buscar vecino"
            sub="Por DNI o por nombre y apellido"
          >
            <PanelBuscarVecino onUsar={onClienteRegistrado} onCargarManual={onCargarManual} />
          </ColumnaModo>
        ) : (
          <ColumnaModo
            color="var(--pl-blue)"
            fondo="var(--pl-blue-100)"
            icon={<Smartphone className="w-[17px] h-[17px]" />}
            label="Por celular"
            sub="Generamos un QR · RENAPER + selfie del lado del vecino"
            chip={chip ? <span className={`av2-chip-estado av2-chip-estado--${chip.tono}`}>{chip.label}</span> : undefined}
          >
            <PanelCelular
              onAprobado={onBiometriaOk}
              onCargarManual={onCargarManual}
              onFase={setFaseCelular}
            />
          </ColumnaModo>
        )}
      </div>

      {/* Escape hatch de la pantalla: reclamo sin identificar (solo reclamos). */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs max-w-[560px]"
        style={{
          backgroundColor: 'var(--pl-surface)',
          border: '1px solid var(--pl-border)',
          color: 'var(--pl-text-muted)',
        }}
      >
        <span>Si el vecino no quiere identificarse, sólo se puede cargar un reclamo.</span>
        <button type="button" onClick={onReclamoAnonimo} className="av2-btn-secundario">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
          Reclamo anónimo
        </button>
      </div>
    </div>
  );
}

// ColumnaModo — wrapper de cada columna con header (tile + título + sub +
// chip opcional) y el contenido del modo dentro. Superficie del kit.
function ColumnaModo({ color, fondo, icon, label, sub, chip, children }: {
  color: string;
  fondo: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-5 flex flex-col gap-4 h-full"
      style={{
        backgroundColor: 'var(--pl-surface)',
        border: '1px solid var(--pl-border)',
        borderRadius: 'var(--pl-radius-lg)',
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-[34px] h-[34px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: fondo, color, borderRadius: 'var(--pl-radius-md)' }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[15px] font-bold leading-tight"
            style={{ color: 'var(--pl-text)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
          >
            {label}
          </div>
          <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: 'var(--pl-text-muted)' }}>
            {sub}
          </div>
        </div>
        {chip}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}

// ============================================================
// PanelBuscarVecino — UN solo input reactivo (canvas): DNI o nombre y
// apellido, autocomplete desde 2 caracteres, selección con banda verde y
// "Continuar". Reemplaza al par input-DNI + búsqueda libre.
// ============================================================
function PanelBuscarVecino({ onUsar, onCargarManual }: {
  onUsar: (v: VecinoEncontrado) => void;
  onCargarManual: (dniPrefill?: string) => void;
}) {
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<VecinoEncontrado[] | null>(null);
  const [sinResultados, setSinResultados] = useState(false);
  const [seleccionado, setSeleccionado] = useState<VecinoEncontrado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  /* Búsqueda reactiva con debounce. Si lo tipeado es un DNI (solo dígitos,
     7+), va por el índice exacto de documento; si no, por nombre/DNI parcial.
     Tipear de nuevo levanta la selección (canvas). */
  useEffect(() => {
    setSeleccionado(null);
    const term = q.trim();
    if (term.length < 2) {
      setResultados(null);
      setSinResultados(false);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const digitos = term.replace(/\D/g, '');
        const esDniCompleto = digitos.length >= 7 && /^[\d.\s]+$/.test(term);
        const r = await operadorApi.buscarVecino(
          esDniCompleto ? digitos : undefined,
          esDniCompleto ? undefined : term,
        );
        setResultados(r.data);
        setSinResultados(r.data.length === 0);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error(msg || 'Error buscando vecino');
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const limpiar = () => {
    setQ('');
    setSeleccionado(null);
    setResultados(null);
    setSinResultados(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (seleccionado) onUsar(seleccionado);
      else if (resultados && resultados.length > 0) setSeleccionado(resultados[0]);
    }
    if (e.key === 'Escape') limpiar();
  };

  const dniTipeado = q.replace(/\D/g, '');

  return (
    <div className="w-full flex flex-col flex-1">
      <div
        className="flex items-center gap-2 px-3 h-10"
        style={{
          backgroundColor: 'var(--pl-surface)',
          border: '1px solid var(--pl-border-strong)',
          borderRadius: 'var(--pl-radius-md)',
        }}
      >
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--pl-text-faint)' }} />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="DNI o nombre y apellido"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold"
          style={{ color: 'var(--pl-text)' }}
        />
        {buscando && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: 'var(--pl-text-faint)' }} />}
        {q && !buscando && (
          <button
            type="button"
            onClick={limpiar}
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--pl-text-faint)' }}
            title="Limpiar (ESC)"
            aria-label="Limpiar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Selección hecha: banda verde con el vecino y el Continuar (canvas). */}
      {seleccionado && (
        <div
          className="mt-3 p-3 flex flex-wrap items-center gap-3"
          style={{
            backgroundColor: 'var(--pl-green-050)',
            border: '1px solid var(--pl-green-200)',
            borderRadius: 'var(--pl-radius-lg)',
          }}
        >
          <div
            className="w-10 h-10 flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: 'var(--pl-green-100)', color: 'var(--pl-green-700)', borderRadius: 'var(--pl-radius-md)' }}
          >
            {(seleccionado.nombre?.[0] || '?')}{(seleccionado.apellido?.[0] || '')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--pl-text)' }}>
              {seleccionado.nombre} {seleccionado.apellido}
            </p>
            <p className="text-[11px] av2-tnum" style={{ color: 'var(--pl-green-700)' }}>
              DNI {seleccionado.dni}{seleccionado.telefono ? ` · ${seleccionado.telefono}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => onUsar(seleccionado)} className="av2-btn-primario flex-shrink-0">
            Continuar
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sugerencias en vivo (se ocultan al seleccionar). */}
      {!seleccionado && resultados && resultados.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="av2-eyebrow">
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--pl-text-muted)' }}>
              <Kbd>↵</Kbd> elige el primero
            </p>
          </div>
          <div className="space-y-2">
            {resultados.map((v, i) => (
              <ResultadoVecino key={v.user_id} vecino={v} selected={i === 0} onUsar={setSeleccionado} />
            ))}
          </div>
        </div>
      )}

      {!seleccionado && sinResultados && (
        <AvisoSinPadron dni={dniTipeado.length >= 7 ? dniTipeado : undefined} onCargarManual={onCargarManual} />
      )}
    </div>
  );
}

// ============================================================
// AvisoSinPadron — bloque ámbar "no está en el padrón" (DRY: lo usan el
// panel de DNI y la búsqueda libre).
// ============================================================
function AvisoSinPadron({ dni, onCargarManual }: {
  dni?: string;
  onCargarManual: (dniPrefill?: string) => void;
}) {
  return (
    <div
      className="mt-4 flex items-start gap-3 p-3"
      style={{
        backgroundColor: 'var(--pl-amber-100)',
        borderRadius: 'var(--pl-radius-md)',
        color: 'var(--pl-amber-700)',
      }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 text-xs">
        <p className="font-semibold">
          {dni ? `No hay vecino con el DNI ${dni} en el padrón` : 'No hay vecino con esos datos en el padrón'}
        </p>
        <p className="opacity-80 mt-0.5">
          Validalo con el celular (pestaña de al lado) o cargá los datos a mano.
        </p>
        <button
          type="button"
          onClick={() => onCargarManual(dni)}
          className="av2-btn-secundario mt-2"
        >
          <Edit3 className="w-3.5 h-3.5" aria-hidden />
          {dni ? 'Cargar a mano con este DNI' : 'Cargar a mano'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ResultadoVecino — fila enriquecida (avatar + badges + contacto)
// ============================================================
function ResultadoVecino({ vecino: v, selected, onUsar }: {
  vecino: VecinoEncontrado;
  selected?: boolean;
  onUsar: (v: VecinoEncontrado) => void;
}) {
  const verificado = v.nivel_verificacion >= 2;
  const isAssisted = v.kyc_modo === 'assisted';
  return (
    <button
      type="button"
      onClick={() => onUsar(v)}
      className="w-full text-left p-3 flex items-center gap-3 transition-all hover:shadow-md"
      style={{
        backgroundColor: 'var(--pl-surface-2)',
        border: `1.5px solid ${selected ? 'var(--pl-green-200)' : 'var(--pl-border)'}`,
        borderRadius: 'var(--pl-radius-lg)',
      }}
    >
      <div
        className="w-11 h-11 flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{
          backgroundColor: 'var(--pl-green-100)',
          color: 'var(--pl-green-700)',
          borderRadius: 'var(--pl-radius-md)',
        }}
      >
        {(v.nombre?.[0] || '?')}{(v.apellido?.[0] || '')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--pl-text)' }}>
            {v.nombre} {v.apellido}
          </p>
          {verificado && (
            <span className={`av2-chip-estado av2-chip-estado--${isAssisted ? 'blue' : 'green'}`}>
              {isAssisted ? 'Asistido' : 'Verificado'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] mt-0.5 flex-wrap" style={{ color: 'var(--pl-text-muted)' }}>
          <span className="inline-flex items-center gap-1"><IdCard className="w-3 h-3" /> <span className="av2-tnum">{v.dni}</span></span>
          {v.telefono && <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> {v.telefono}</span>}
          {v.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {v.email}</span>}
        </div>
      </div>
      <span className="av2-btn-primario flex-shrink-0">
        Usar
        <ChevronRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

// ============================================================
// Hub — VecinoStrip + 4 GestionCards + RecentActivity
// ============================================================
function Hub({ vecino, kycSessionId, onIrReclamo, onIrTramite, onIrTasas, onIrTurno, onReset }: {
  vecino: KycDatos;
  kycSessionId: string | null;
  onIrReclamo: () => void;
  onIrTramite: () => void;
  onIrTasas: () => void;
  onIrTurno: () => void;
  onReset: () => void;
}) {
  // Regla de negocio: TRAMITES exigen identidad validada (RENAPER, nivel >= 2
  // o sesion biometrica de esta atencion). RECLAMOS y turnos: alta simple.
  const tramiteHabilitado = (vecino.nivel_verificacion ?? 0) >= 2 || !!kycSessionId;
  const irTramiteGuard = useCallback(() => {
    if (!tramiteHabilitado) {
      toast.error(
        'Para trámites el vecino tiene que validar su identidad con RENAPER (opción "Por celular"). Para reclamos no hace falta.',
      );
      return;
    }
    onIrTramite();
  }, [tramiteHabilitado, onIrTramite]);

  // Atajos de teclado: R / T / D / U / Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onIrReclamo(); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); irTramiteGuard(); }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); onIrTasas(); }
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); onIrTurno(); }
      if (e.key === 'Escape') { e.preventDefault(); onReset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onIrReclamo, irTramiteGuard, onIrTasas, onIrTurno, onReset]);

  return (
    <div className="space-y-4 mt-3">
      <VecinoStrip vecino={vecino} kycSessionId={kycSessionId} onReset={onReset} />

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="av2-eyebrow">¿Qué gestión vamos a iniciar?</span>
        <span className="hidden sm:flex items-center gap-2 text-[11px]" style={{ color: 'var(--pl-text-muted)' }}>
          <Kbd>R</Kbd> reclamo
          <Kbd>T</Kbd> trámite
          <Kbd>U</Kbd> turno
          <Kbd>D</Kbd> tasas
          <Kbd>Esc</Kbd> cancelar
        </span>
      </div>

      {/* Colores por gestión según el canvas: Reclamo ámbar, Trámite verde
          destacado, Turno azul, Tasas ocre. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <GestionCard
          color="var(--pl-amber)"
          fondo="var(--pl-amber-100)"
          icon={<AlertTriangle className="w-5 h-5" />}
          kbd="R"
          title="Reclamo"
          subtitle="Reportar problema urbano (bache, alumbrado, residuos, ramas)"
          ctaLabel="Cargar reclamo"
          onStart={onIrReclamo}
        />
        <GestionCard
          color="var(--pl-green)"
          fondo="var(--pl-green-100)"
          icon={<FileText className="w-5 h-5" />}
          kbd="T"
          title="Trámite"
          subtitle={tramiteHabilitado
            ? 'Iniciar trámite. Mandá requisitos por WhatsApp o imprimí el PDF.'
            : 'Requiere validar la identidad del vecino con RENAPER (pestaña "Por celular").'}
          contextBadge={tramiteHabilitado ? undefined : { tone: 'red', text: 'Requiere RENAPER' }}
          pie={tramiteHabilitado ? 'Ayuda a clasificar' : undefined}
          highlighted={tramiteHabilitado}
          ctaLabel={tramiteHabilitado ? 'Iniciar trámite' : 'Falta RENAPER'}
          onStart={irTramiteGuard}
        />
        <GestionCard
          color="var(--pl-blue)"
          fondo="var(--pl-blue-100)"
          icon={<CalendarClock className="w-5 h-5" />}
          kbd="U"
          title="Turno"
          subtitle="Tomar turno para un trámite presencial (el vecino se va con día y hora)"
          pie="Turno-first"
          ctaLabel="Tomar turno"
          onStart={onIrTurno}
        />
        <GestionCard
          color="var(--pl-amber-strong)"
          fondo="var(--pl-amber-100)"
          icon={<Banknote className="w-5 h-5" />}
          kbd="D"
          title="Tasas"
          subtitle="Pagar tasas pendientes (ABL, patente, cementerio, multas)"
          ctaLabel="Ver deudas"
          onStart={onIrTasas}
        />
      </div>

      <RecentActivity vecino={vecino} />
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="av2-tnum inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        backgroundColor: 'var(--pl-track)',
        border: '1px solid var(--pl-border)',
        borderRadius: 'var(--pl-radius-sm)',
        color: 'var(--pl-text-3)',
      }}
    >
      {children}
    </kbd>
  );
}

// ============================================================
// VecinoStrip — franja "identidad validada" con los datos del vecino
// ============================================================
function VecinoStrip({ vecino, kycSessionId, onReset }: {
  vecino: KycDatos;
  kycSessionId: string | null;
  onReset: () => void;
}) {
  const verificado = !!kycSessionId || (vecino.nivel_verificacion ?? 0) >= 2;
  return (
    <div
      className="p-4 flex flex-wrap items-center justify-between gap-3"
      style={{
        backgroundColor: verificado ? 'var(--pl-green-050)' : 'var(--pl-surface)',
        border: `1px solid ${verificado ? 'var(--pl-green-200)' : 'var(--pl-border)'}`,
        borderRadius: 'var(--pl-radius-lg)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-12 h-12 flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{
            backgroundColor: 'var(--pl-green-100)',
            color: 'var(--pl-green-700)',
            borderRadius: 'var(--pl-radius-md)',
          }}
        >
          {(vecino.nombre?.[0] || '?')}{(vecino.apellido?.[0] || '')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-bold truncate" style={{ color: 'var(--pl-text)' }}>
              {vecino.nombre || '—'} {vecino.apellido || ''}
            </p>
            {verificado && (
              <span className="av2-chip-estado av2-chip-estado--green">
                {kycSessionId ? 'Verificado RENAPER' : 'Identidad verificada'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] mt-0.5 flex-wrap" style={{ color: 'var(--pl-text-muted)' }}>
            <span className="inline-flex items-center gap-1"><IdCard className="w-3 h-3" /> DNI <span className="av2-tnum">{vecino.dni || '—'}</span></span>
            {vecino.telefono && <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> {vecino.telefono}</span>}
            {vecino.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {vecino.email}</span>}
            {vecino.direccion && <span className="inline-flex items-center gap-1 truncate"><MapPin className="w-3 h-3" /> {vecino.direccion}</span>}
          </div>
        </div>
      </div>
      <button type="button" onClick={onReset} className="av2-btn-secundario flex-shrink-0">
        <RefreshCcw className="w-3.5 h-3.5" aria-hidden />
        Cambiar
      </button>
    </div>
  );
}

// ============================================================
// GestionCard — card del canvas: tile de color arriba-izq, kbd arriba-der,
// watermark del icono al fondo, y pie separado por borde con el dato
// contextual a la izquierda y el CTA con flecha a la derecha.
// ============================================================
function GestionCard({ color, fondo, icon, kbd, title, subtitle, contextBadge, pie, highlighted, ctaLabel, onStart }: {
  color: string;
  fondo: string;
  icon: React.ReactNode;
  kbd: string;
  title: string;
  subtitle: string;
  contextBadge?: { tone: 'amber' | 'blue' | 'red' | 'gray' | 'green'; text: string };
  /** Dato contextual del pie (solo texto REAL o descriptor, nunca números inventados). */
  pie?: string;
  highlighted?: boolean;
  ctaLabel: string;
  onStart: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="relative overflow-hidden text-left p-4 flex flex-col transition-all hover:shadow-lg min-h-[176px]"
      style={{
        backgroundColor: 'var(--pl-surface)',
        border: `1px solid ${highlighted ? 'var(--pl-green-200)' : 'var(--pl-border)'}`,
        borderRadius: 'var(--pl-radius-lg)',
      }}
    >
      {/* Watermark del icono (canvas): gigante, casi invisible, decorativo. */}
      <span
        aria-hidden
        className="absolute -right-3 -top-3 pointer-events-none [&>svg]:w-24 [&>svg]:h-24"
        style={{ color, opacity: 0.06 }}
      >
        {icon}
      </span>

      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-10 h-10 flex items-center justify-center"
          style={{ backgroundColor: fondo, color, borderRadius: 'var(--pl-radius-md)' }}
        >
          {icon}
        </div>
        {highlighted && (
          <span className="av2-chip-estado av2-chip-estado--green">Sugerido</span>
        )}
        <span className="ml-auto">
          <Kbd>{kbd}</Kbd>
        </span>
      </div>
      <h3
        className="text-base font-bold mb-1"
        style={{ color: 'var(--pl-text)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
      >
        {title}
      </h3>
      <p className="text-xs flex-1 mb-3 leading-relaxed" style={{ color: 'var(--pl-text-muted)' }}>
        {subtitle}
      </p>
      <div
        className="flex items-center justify-between gap-2 mt-auto pt-2.5 flex-wrap"
        style={{ borderTop: '1px solid var(--pl-border)' }}
      >
        {contextBadge && (
          <span className={`av2-chip-estado av2-chip-estado--${contextBadge.tone}`}>
            {contextBadge.text}
          </span>
        )}
        {!contextBadge && pie && (
          <span className="text-[11px]" style={{ color: 'var(--pl-text-muted)' }}>{pie}</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold ml-auto" style={{ color }}>
          {ctaLabel}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

// ============================================================
// RecentActivity — historial del vecino (ver TODO del endpoint)
// ============================================================
function RecentActivity({ vecino }: { vecino: KycDatos }) {
  // TODO: conectar a un endpoint /api/operador/historial/{user_id}.
  // Por ahora muestra placeholder vacío en producción (sin datos mock).
  // El layout queda en el componente para cuando llegue el endpoint.
  const nombre = vecino.nombre || 'el vecino';
  return (
    <div
      className="p-4"
      style={{
        backgroundColor: 'var(--pl-surface)',
        border: '1px solid var(--pl-border)',
        borderRadius: 'var(--pl-radius-lg)',
      }}
    >
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="av2-eyebrow inline-flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" aria-hidden />
          Gestiones previas de {nombre}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
          style={{ color: 'var(--pl-green-700)' }}
          onClick={() => { /* TODO: navegar a historial completo */ }}
        >
          Ver historial completo <ExternalLink className="w-3 h-3" />
        </button>
      </div>
      <div
        className="p-6 text-center text-xs"
        style={{
          backgroundColor: 'var(--pl-surface-2)',
          color: 'var(--pl-text-muted)',
          border: '1px dashed var(--pl-border-strong)',
          borderRadius: 'var(--pl-radius-md)',
        }}
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
function PanelCelular({ onAprobado, onCargarManual, onFase }: {
  onAprobado: (datos: KycDatos, sessionId: string) => void;
  onCargarManual: () => void;
  onFase: (fase: FaseCelular) => void;
}) {
  const [phase, setPhase] = useState<FaseCelular>('idle');
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

  // El chip de estado vive en la cabecera de la columna (la pinta el padre):
  // le avisamos cada vez que cambia la fase real del handoff.
  useEffect(() => { onFase(phase); }, [phase, onFase]);

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

  // Copy del pie de la barra, derivado del avance REAL del polling.
  const leyendaAvance =
    stepProgress <= 30 ? 'Paso 1 de 4 · esperando que escanee'
      : stepProgress <= 60 ? 'Paso 2 de 4 · foto del DNI'
        : stepProgress <= 85 ? 'Paso 3 de 4 · selfie con prueba de vida'
          : 'Paso 4 de 4 · validando contra RENAPER';

  return (
    <div className="w-full h-full flex flex-col">
      {phase === 'idle' && (
        <div className="text-center space-y-4 flex flex-col items-center justify-center flex-1 py-4">
          <div
            className="inline-flex items-center justify-center w-16 h-16 mx-auto"
            style={{ backgroundColor: 'var(--pl-blue-100)', borderRadius: 'var(--pl-radius-lg)' }}
          >
            <Smartphone className="w-8 h-8" style={{ color: 'var(--pl-blue)' }} />
          </div>
          <div>
            <h3
              className="text-base font-bold"
              style={{ color: 'var(--pl-text)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
            >
              Validar identidad con el celular
            </h3>
            <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--pl-text-muted)' }}>
              Generamos un QR. Lo escaneás con tu celular y validás al vecino con la cámara
              del celu (<b>DNI</b> + <b>selfie</b> + <b>RENAPER</b>). Cuando termina, la PC se completa sola.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--pl-text-muted)' }}>
            <span className="inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> QR</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> celular</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> RENAPER</span>
          </div>
          <button type="button" onClick={generar} className="av2-btn-primario">
            <QrCode className="w-4 h-4" />
            Generar QR
          </button>
          <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--pl-text-muted)' }}>
            <ShieldCheck className="w-3 h-3" />
            Validación biométrica oficial · sin tocar la PC de la municipalidad
          </div>
        </div>
      )}

      {phase === 'creating' && (
        <div className="text-center py-6 space-y-3">
          <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: 'var(--pl-blue)' }} />
          <p className="text-sm" style={{ color: 'var(--pl-text-muted)' }}>Generando sesión…</p>
        </div>
      )}

      {(phase === 'awaiting' || phase === 'in_progress') && qrValue && (
        <div className="grid grid-cols-1 md:grid-cols-[160px,1fr] gap-5 items-start">
          {/* QR del lado izquierdo */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="p-3 bg-white"
              style={{
                border: `2px solid ${phase === 'in_progress' ? 'var(--pl-blue)' : 'var(--pl-border-strong)'}`,
                borderRadius: 'var(--pl-radius-lg)',
              }}
            >
              <QRCodeSVG
                value={qrValue}
                size={132}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--pl-text-muted)' }}>
              <RefreshCcw className="w-3 h-3" />
              <span>
                Expira en{' '}
                <b className="av2-tnum" style={{ color: 'var(--pl-text)' }}>
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                </b>
              </span>
            </div>
          </div>

          {/* Steps + progreso del lado derecho */}
          <div className="space-y-2 min-w-0">
            <div>
              <h3
                className="text-base font-bold"
                style={{ color: 'var(--pl-text)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
              >
                {phase === 'in_progress' ? 'Capturando en el celular…' : 'Escaneá con tu celular'}
              </h3>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--pl-text-muted)' }}>
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
              sub="Frente y dorso desde el celular"
            />
            <QrStepRow
              done={stepProgress > 60}
              current={phase === 'in_progress' && stepProgress > 30 && stepProgress <= 60}
              index={3}
              label="Selfie con prueba de vida"
              sub="Mira a la cámara y parpadea"
            />
            <QrStepRow
              done={stepProgress > 85}
              current={phase === 'in_progress' && stepProgress > 60}
              index={4}
              label="Validación RENAPER"
              sub="Match biométrico oficial"
            />

            {/* Barra de progreso */}
            <div className="pt-2">
              <div
                className="h-1.5 w-full overflow-hidden"
                style={{ backgroundColor: 'var(--pl-track)', borderRadius: 'var(--pl-radius-pill)' }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${stepProgress}%`,
                    backgroundColor: 'var(--pl-blue)',
                    borderRadius: 'var(--pl-radius-pill)',
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[11.5px]" style={{ color: 'var(--pl-text-muted)' }}>
                  {leyendaAvance}
                </span>
                <button
                  type="button"
                  onClick={cancelar}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--pl-text-3)' }}
                >
                  Cancelar
                </button>
              </div>
            </div>

            {diditUrl && (
              <div
                className="flex items-center gap-2 mt-2 text-[11.5px]"
                style={{ color: 'var(--pl-text-muted)' }}
              >
                <span>¿No trajo el celular?</span>
                <a
                  href={diditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold hover:underline"
                  style={{ color: 'var(--pl-green-700)' }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Hacerlo en esta PC
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'completed' && (
        <div className="text-center py-4 space-y-3 animate-in fade-in zoom-in-95 duration-300">
          <div
            className="inline-flex items-center justify-center w-16 h-16 mx-auto"
            style={{ backgroundColor: 'var(--pl-green-100)', borderRadius: 'var(--pl-radius-lg)' }}
          >
            <CheckCircle2 className="w-9 h-9" style={{ color: 'var(--pl-green-700)' }} />
          </div>
          <div>
            <h3
              className="text-base font-bold"
              style={{ color: 'var(--pl-green-700)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
            >
              Identidad validada con RENAPER
            </h3>
            <p className="text-sm" style={{ color: 'var(--pl-text-muted)' }}>
              Datos biométricos coinciden. Cargando ficha…
            </p>
          </div>
        </div>
      )}

      {phase === 'rejected' && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 mx-auto"
            style={{ backgroundColor: 'var(--pl-red-100)', borderRadius: 'var(--pl-radius-lg)' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: 'var(--pl-red-700)' }} />
          </div>
          <h3
            className="text-base font-bold"
            style={{ color: 'var(--pl-red-700)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
          >
            Verificación rechazada
          </h3>
          <p className="text-sm" style={{ color: 'var(--pl-text-muted)' }}>{error}</p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button type="button" onClick={() => { reset(); generar(); }} className="av2-btn-primario">
              <RefreshCcw className="w-3.5 h-3.5" /> Reintentar
            </button>
            <button type="button" onClick={() => onCargarManual()} className="av2-btn-secundario">
              Cargar a mano
            </button>
          </div>
        </div>
      )}

      {(phase === 'cancelled' || phase === 'expired') && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 mx-auto"
            style={{ backgroundColor: 'var(--pl-amber-100)', borderRadius: 'var(--pl-radius-lg)' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: 'var(--pl-amber-700)' }} />
          </div>
          <h3
            className="text-base font-bold"
            style={{ color: 'var(--pl-text)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
          >
            {phase === 'cancelled' ? 'Sesión cancelada' : 'Sesión expirada'}
          </h3>
          <div className="flex justify-center">
            <button type="button" onClick={() => { reset(); generar(); }} className="av2-btn-primario">
              <RefreshCcw className="w-3.5 h-3.5" /> Generar nuevo QR
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="text-center py-6 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 mx-auto"
            style={{ backgroundColor: 'var(--pl-red-100)', borderRadius: 'var(--pl-radius-lg)' }}
          >
            <AlertTriangle className="w-9 h-9" style={{ color: 'var(--pl-red-700)' }} />
          </div>
          <h3
            className="text-base font-bold"
            style={{ color: 'var(--pl-red-700)', fontFamily: 'var(--pl-font-display)', letterSpacing: '-0.02em' }}
          >
            No se pudo iniciar
          </h3>
          <p className="text-sm" style={{ color: 'var(--pl-text-muted)' }}>{error}</p>
          <div className="flex justify-center">
            <button type="button" onClick={() => onCargarManual()} className="av2-btn-secundario">
              Seguir con carga manual
            </button>
          </div>
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
  return (
    <div
      className="flex items-start gap-2.5 p-2"
      style={{
        backgroundColor: current ? 'var(--pl-blue-100)' : 'transparent',
        border: `1px solid ${current ? 'var(--pl-blue)' : 'transparent'}`,
        borderRadius: 'var(--pl-radius-md)',
      }}
    >
      <div
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 text-[10.5px] font-bold"
        style={{
          backgroundColor: done ? 'var(--pl-green)' : current ? 'var(--pl-blue-100)' : 'var(--pl-track)',
          color: done ? 'var(--pl-on-accent)' : current ? 'var(--pl-blue-700)' : 'var(--pl-text-3)',
        }}
      >
        {done ? <Check className="w-3 h-3" strokeWidth={3} /> : index}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold leading-tight" style={{ color: done || current ? 'var(--pl-text)' : 'var(--pl-text-2)' }}>
          {label}
        </div>
        <div className="text-[11.5px] leading-tight" style={{ color: 'var(--pl-text-muted)' }}>{sub}</div>
      </div>
    </div>
  );
}
