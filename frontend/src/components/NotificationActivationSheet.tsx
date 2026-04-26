import { useEffect, useState, useCallback } from 'react';
import { Bell, BellRing, X, CheckCircle2, BellOff, Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
} from '../lib/pushNotifications';

/**
 * NotificationActivationSheet
 * --------------------------------
 * Bottom-sheet de ~35% del viewport, atractivo y persistente, para que el
 * vecino active las notificaciones push.
 *
 * Reemplaza el banner gris del Layout y el toast flotante viejo
 * (NotificationPrompt). El objetivo es una sola UI consistente, fuerte y
 * con copy escalado segun cuantas veces el vecino lo cerro.
 *
 * Triggers:
 *   - "login": auto-trigger 2s despues del primer render. Solo si pasaron
 *     >= 6h desde el ultimo dismissal y el permiso no es 'granted' ni
 *     'denied' (o si es 'denied' y nunca le mostramos las instrucciones).
 *   - "post-creation": disparado por wizards via evento global
 *     `notification-prompt`. Aparece justo despues de crear un reclamo o
 *     tramite, en el momento de maxima motivacion.
 *
 * Para abrirlo desde cualquier wizard:
 *   window.dispatchEvent(new CustomEvent('notification-prompt', {
 *     detail: { context: 'post-creation', tipoCreado: 'reclamo' }
 *   }));
 */

const STORAGE_DISMISSAL_COUNT = 'notif_activation_dismiss_count';
const STORAGE_LAST_DISMISSAL_AT = 'notif_activation_last_dismissal';
const STORAGE_POST_CREATION_SHOWN = 'notif_activation_post_creation_shown';
const COOLDOWN_HOURS = 6;
const AUTO_TRIGGER_DELAY_MS = 2000;

type Context = 'login' | 'post-creation';

interface Detail {
  context: Context;
  tipoCreado?: 'reclamo' | 'tramite';
}

function readDismissCount(): number {
  return parseInt(localStorage.getItem(STORAGE_DISMISSAL_COUNT) || '0', 10) || 0;
}

function readLastDismissalAt(): number {
  return parseInt(localStorage.getItem(STORAGE_LAST_DISMISSAL_AT) || '0', 10) || 0;
}

function shouldAutoShow(): boolean {
  if (!isPushSupported()) return false;
  const perm = getNotificationPermission();
  // Si ya activo, no molestar.
  if (perm === 'granted') return false;
  // Si ya bloqueo en el browser, mostrar instrucciones (solo 1 vez por cooldown).
  // Si esta en 'default', mostrar segun cooldown.
  const lastDismissal = readLastDismissalAt();
  const elapsedMs = Date.now() - lastDismissal;
  return elapsedMs >= COOLDOWN_HOURS * 60 * 60 * 1000;
}

/**
 * Copy que escala segun cuantas veces el vecino cerro el sheet.
 * Mas blando al principio, mas urgente despues.
 */
function getCopy(context: Context, dismissCount: number, tipoCreado?: 'reclamo' | 'tramite') {
  if (context === 'post-creation') {
    const tipo = tipoCreado === 'tramite' ? 'tramite' : 'reclamo';
    const tipoCap = tipo === 'tramite' ? 'Trámite' : 'Reclamo';
    return {
      headline: `¡${tipoCap} cargado!`,
      subhead: `¿Querés que te avisemos apenas tu ${tipo} avance? Es el unico modo de enterarte sin tener que entrar a la app.`,
      bullet1: '🔔 Aviso al instante en tu celular',
      bullet2: '⚡ Al cambiar de estado o sumar comentarios',
      bullet3: '🛑 Lo desactivás cuando quieras',
      ctaLabel: 'Activar avisos',
      dismissLabel: 'Quizas mas tarde',
    };
  }

  // login
  if (dismissCount >= 4) {
    return {
      headline: 'Última: ¿activamos los avisos?',
      subhead: 'Si no las activás, cada novedad de tus reclamos solo va a aparecer si entrás a la app. Es 1 toque.',
      bullet1: '🔔 Aviso al instante en tu celular',
      bullet2: '⚡ Cuando avanza tu reclamo o trámite',
      bullet3: '🛑 Lo desactivás cuando quieras',
      ctaLabel: 'Activar (1 toque)',
      dismissLabel: 'Sigo sin activar',
    };
  }
  if (dismissCount >= 2) {
    return {
      headline: 'Estás a un paso',
      subhead: 'Activá las notificaciones para no perderte ninguna actualización de tus reclamos y trámites. Tarda 2 segundos.',
      bullet1: '🔔 Aviso al instante en tu celular',
      bullet2: '⚡ Apenas cambia el estado',
      bullet3: '🛑 Lo desactivás cuando quieras',
      ctaLabel: 'Activar avisos',
      dismissLabel: 'Ahora no',
    };
  }
  return {
    headline: 'Activá los avisos',
    subhead: 'Te avisamos en el celular apenas tu reclamo o trámite avance. Sin instalar nada, sin spam.',
    bullet1: '🔔 Aviso al instante en tu celular',
    bullet2: '⚡ Cuando hay novedades',
    bullet3: '🛑 Lo desactivás cuando quieras',
    ctaLabel: 'Activar avisos',
    dismissLabel: 'Ahora no',
  };
}

export function NotificationActivationSheet() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context>('login');
  const [tipoCreado, setTipoCreado] = useState<'reclamo' | 'tramite' | undefined>(undefined);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);

  // Cierre con cooldown.
  const dismiss = useCallback(() => {
    const next = readDismissCount() + 1;
    localStorage.setItem(STORAGE_DISMISSAL_COUNT, String(next));
    localStorage.setItem(STORAGE_LAST_DISMISSAL_AT, String(Date.now()));
    setDismissCount(next);
    setOpen(false);
  }, []);

  // Auto-trigger en login.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!shouldAutoShow()) return;
      setContext('login');
      setTipoCreado(undefined);
      setPermission(getNotificationPermission());
      setDismissCount(readDismissCount());
      setJustEnabled(false);
      setOpen(true);
    }, AUTO_TRIGGER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Listener de evento global (post-creacion desde wizards).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Detail>).detail || ({} as Detail);
      const ctx = detail.context || 'post-creation';
      // Si ya esta granted, no molestar.
      if (getNotificationPermission() === 'granted') return;
      if (!isPushSupported()) return;

      // En post-creation, solo mostramos UNA vez total (no escala),
      // porque es un momento contextual.
      if (ctx === 'post-creation') {
        const yaMostrado = localStorage.getItem(STORAGE_POST_CREATION_SHOWN);
        if (yaMostrado) return;
      }

      setContext(ctx);
      setTipoCreado(detail.tipoCreado);
      setPermission(getNotificationPermission());
      setDismissCount(readDismissCount());
      setJustEnabled(false);
      setOpen(true);
    };
    window.addEventListener('notification-prompt', handler as EventListener);
    return () => window.removeEventListener('notification-prompt', handler as EventListener);
  }, []);

  // Marcamos post-creation como vista al abrir (asi solo entra una vez).
  useEffect(() => {
    if (open && context === 'post-creation') {
      localStorage.setItem(STORAGE_POST_CREATION_SHOWN, String(Date.now()));
    }
  }, [open, context]);

  const handleEnable = async () => {
    setLoading(true);
    try {
      await subscribeToPush();
      const newPerm = getNotificationPermission();
      setPermission(newPerm);
      if (newPerm === 'granted') {
        setJustEnabled(true);
        // Reset contador de dismissals.
        localStorage.removeItem(STORAGE_DISMISSAL_COUNT);
        localStorage.removeItem(STORAGE_LAST_DISMISSAL_AT);
        setTimeout(() => setOpen(false), 1800);
      }
    } catch (err) {
      console.error('Error activando notificaciones:', err);
      setPermission(getNotificationPermission());
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const copy = getCopy(context, dismissCount, tipoCreado);
  const isDenied = permission === 'denied';
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  return (
    <>
      {/* Overlay oscuro detras (deja visible la parte superior atenuada). */}
      <div
        onClick={dismiss}
        className="fixed inset-0 z-[100] animate-in fade-in duration-200"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        aria-hidden="true"
      />

      {/* Sheet ~35vh anclado abajo. */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[101] animate-in slide-in-from-bottom duration-300"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="rounded-t-3xl shadow-2xl px-5 pt-5 pb-6 max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: theme.card,
            borderTop: `1px solid ${theme.border}`,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.45)',
          }}
        >
          {/* Pull-handle decorativo */}
          <div className="flex justify-center mb-3">
            <div
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: theme.border }}
            />
          </div>

          {/* Estado: ya activo (post-success animado) */}
          {justEnabled && (
            <div className="flex flex-col items-center text-center py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-3 animate-in zoom-in duration-300"
                style={{ backgroundColor: '#10b98120' }}
              >
                <CheckCircle2 className="h-9 w-9" style={{ color: '#10b981' }} />
              </div>
              <p className="text-lg font-bold mb-1" style={{ color: theme.text }}>
                ¡Listo, notificaciones activadas!
              </p>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Te vamos a avisar apenas haya novedades.
              </p>
            </div>
          )}

          {/* Estado: el navegador bloqueo y hay que ir a configuracion */}
          {!justEnabled && isDenied && (
            <div>
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${theme.primary}18` }}
                >
                  <BellOff className="h-6 w-6" style={{ color: theme.primary }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold leading-tight" style={{ color: theme.text }}>
                    Las bloqueaste sin querer
                  </h3>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Para volver a recibir avisos, activalas desde la configuración del navegador.
                  </p>
                </div>
                <button
                  onClick={dismiss}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
                </button>
              </div>

              <div
                className="rounded-2xl p-4 text-sm space-y-2"
                style={{ backgroundColor: theme.background }}
              >
                {isIOS ? (
                  <>
                    <Step n={1} text={<>Tocá el icono <strong>Aa</strong> en la barra de direcciones</>} color={theme.primary} secondary={theme.textSecondary} />
                    <Step n={2} text={<>Elegí <strong>"Configuración del sitio web"</strong></>} color={theme.primary} secondary={theme.textSecondary} />
                    <Step n={3} text={<>Activá <strong>"Permitir notificaciones"</strong></>} color={theme.primary} secondary={theme.textSecondary} />
                  </>
                ) : isAndroid ? (
                  <>
                    <Step n={1} text={<>Tocá el icono <strong>candado</strong> en la barra de direcciones</>} color={theme.primary} secondary={theme.textSecondary} />
                    <Step n={2} text={<>Tocá <strong>"Permisos"</strong> o <strong>"Configuración del sitio"</strong></>} color={theme.primary} secondary={theme.textSecondary} />
                    <Step n={3} text={<>Activá <strong>"Notificaciones"</strong></>} color={theme.primary} secondary={theme.textSecondary} />
                  </>
                ) : (
                  <>
                    <Step n={1} text={<>Hacé clic en el <strong>candado</strong> de la barra de direcciones</>} color={theme.primary} secondary={theme.textSecondary} />
                    <Step n={2} text={<>Buscá <strong>"Notificaciones"</strong> en los permisos</>} color={theme.primary} secondary={theme.textSecondary} />
                    <Step n={3} text={<>Cambialo a <strong>"Permitir"</strong> y recargá la página</>} color={theme.primary} secondary={theme.textSecondary} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Estado normal: pedir permiso */}
          {!justEnabled && !isDenied && (
            <div>
              {/* Header con icono pulsante */}
              <div className="flex items-start gap-3 mb-4">
                <div className="relative flex-shrink-0">
                  {/* Pulse anillo decorativo */}
                  <span
                    className="absolute inset-0 rounded-2xl animate-ping"
                    style={{ backgroundColor: `${theme.primary}40`, animationDuration: '1.6s' }}
                    aria-hidden="true"
                  />
                  <div
                    className="relative w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`,
                      boxShadow: `0 6px 20px ${theme.primary}55`,
                    }}
                  >
                    {context === 'post-creation'
                      ? <Sparkles className="h-7 w-7 text-white" />
                      : <BellRing className="h-7 w-7 text-white" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold leading-tight" style={{ color: theme.text }}>
                    {copy.headline}
                  </h3>
                  <p className="text-sm mt-1.5 leading-snug" style={{ color: theme.textSecondary }}>
                    {copy.subhead}
                  </p>
                </div>
                <button
                  onClick={dismiss}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
                </button>
              </div>

              {/* Bullets de beneficios */}
              <div className="space-y-1.5 mb-5">
                <Benefit text={copy.bullet1} text2={theme.text} bg={theme.background} />
                <Benefit text={copy.bullet2} text2={theme.text} bg={theme.background} />
                <Benefit text={copy.bullet3} text2={theme.text} bg={theme.background} />
              </div>

              {/* Acciones — botones separados, primario gigante */}
              <div className="space-y-2">
                <button
                  onClick={handleEnable}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-base font-bold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60"
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}dd 100%)`,
                    boxShadow: `0 8px 24px ${theme.primary}55`,
                  }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Bell className="h-5 w-5" />
                      {copy.ctaLabel}
                    </>
                  )}
                </button>
                <button
                  onClick={dismiss}
                  className="w-full py-2 text-xs font-medium transition-colors"
                  style={{ color: theme.textSecondary }}
                >
                  {copy.dismissLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Step({ n, text, color, secondary }: { n: number; text: React.ReactNode; color: string; secondary: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="font-bold text-xs" style={{ color }}>
        {n}.
      </span>
      <span className="text-xs" style={{ color: secondary }}>{text}</span>
    </div>
  );
}

function Benefit({ text, text2, bg }: { text: string; text2: string; bg: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
      style={{ backgroundColor: bg, color: text2 }}
    >
      <span>{text}</span>
    </div>
  );
}

/**
 * Helper para que los wizards llamen al cerrar el flujo de creacion.
 * Encapsula el dispatch del evento global.
 */
export function triggerNotificationPostCreation(tipoCreado: 'reclamo' | 'tramite') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('notification-prompt', {
    detail: { context: 'post-creation', tipoCreado },
  }));
}

export default NotificationActivationSheet;
