/**
 * auto-update-kit — cliente
 * -------------------------------------------------------------------------
 * Detecta un deploy nuevo y actualiza la app SOLA, sin que el usuario tenga
 * que hacer Ctrl+Shift+R (ni cerrar/reinstalar la PWA).
 *
 * Tres mecanismos combinados:
 *   1. version.json  — compara __APP_VERSION__ (la que arrancó esta pestaña)
 *      contra /version.json. Chequea al arrancar, al volver a foco
 *      (visibilitychange/focus) y, opcional, por intervalo.
 *   2. chunk-guard   — si tras un deploy la app pide un bundle viejo que ya no
 *      existe (ChunkLoadError / "failed to fetch dynamically imported module"),
 *      recarga una vez para traer el index nuevo. La guía original NO cubría esto.
 *   3. anti-loop     — recarga UNA vez por versión detectada, y no reintenta un
 *      chunk-reload más de una vez cada CHUNK_GUARD_WINDOW_MS (si el server
 *      realmente está roto, no entra en bucle de recargas).
 *
 * No depende de ninguna librería (sonner, etc.). Para AVISAR en vez de recargar
 * solo, pasá mode:'prompt' + onUpdateAvailable y mostrá tu propio toast.
 */

declare const __APP_VERSION__: string | undefined

export type AutoUpdateMode = 'reload' | 'prompt'

export interface AutoUpdateOptions {
  /** Versión con la que arrancó esta pestaña. Default: __APP_VERSION__ (inyectada por el build). */
  currentVersion?: string
  /** URL del manifiesto de versión. Default: '/version.json'. */
  versionUrl?: string
  /** Si > 0, además chequea cada N ms (útil para dashboards abiertos mucho rato). Default: 0. */
  pollIntervalMs?: number
  /** 'reload' recarga sola; 'prompt' delega el aviso en onUpdateAvailable. Default: 'reload'. */
  mode?: AutoUpdateMode
  /** Callback cuando hay versión nueva (para mostrar tu toast). Recibís reload() para gatillarlo. */
  onUpdateAvailable?: (info: UpdateInfo) => void
  /** Logs de diagnóstico en consola. Default: false. */
  debug?: boolean
}

export interface UpdateInfo {
  current: string
  next: string
  reload: () => void
}

const VERSION_GUARD_PREFIX = 'auk-reloaded-'
const CHUNK_GUARD_KEY = 'auk-chunk-reload-at'
const CHUNK_GUARD_WINDOW_MS = 20_000

// Errores típicos de "el chunk que pido ya no existe tras un deploy" (Vite/Chrome/Safari).
const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [\d]+ failed|(failed|error) (to )?(fetch|loading) dynamically imported module|Importing a module script failed/i

/** Arranca la auto-actualización. Llamalo una vez en main.tsx: `setupAutoUpdate()`. */
export function setupAutoUpdate(options: AutoUpdateOptions = {}): () => void {
  const {
    versionUrl = '/version.json',
    pollIntervalMs = 0,
    mode = 'reload',
    onUpdateAvailable,
    debug = false,
  } = options

  const current =
    options.currentVersion ??
    (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined)

  const log = (...a: unknown[]) => { if (debug) console.info('[auto-update]', ...a) }

  if (!current) {
    log('sin __APP_VERSION__: version-check deshabilitado (solo queda el chunk-guard).')
  }

  const reload = () => { try { window.location.reload() } catch { /* noop */ } }

  const handleNewVersion = (next: string) => {
    const guard = VERSION_GUARD_PREFIX + next
    if (sessionStorage.getItem(guard)) return // ya reaccionamos a esta versión
    sessionStorage.setItem(guard, '1')
    log(`versión nueva: ${current} -> ${next} (mode=${mode})`)
    if (mode === 'prompt' && onUpdateAvailable) {
      onUpdateAvailable({ current: current ?? '?', next, reload })
      return
    }
    if (isUserBusy()) {
      // No interrumpir a alguien tipeando: soltamos el guard y reintentamos en el próximo check.
      sessionStorage.removeItem(guard)
      log('usuario tipeando: pospongo la recarga.')
      return
    }
    reload()
  }

  const check = async () => {
    if (!current) return
    if (document.visibilityState !== 'visible') return
    const server = await fetchServerVersion(versionUrl)
    if (!server || server === current) return
    handleNewVersion(server)
  }

  // Chunk-guard: un bundle referenciado por el index viejo devolvió 404 tras el deploy.
  const onError = (evt: ErrorEvent | PromiseRejectionEvent) => {
    const msg =
      (evt as ErrorEvent).message ||
      String((evt as PromiseRejectionEvent).reason?.message ?? (evt as PromiseRejectionEvent).reason ?? '')
    if (!CHUNK_ERROR_RE.test(msg)) return
    const last = Number(sessionStorage.getItem(CHUNK_GUARD_KEY) || 0)
    const now = Date.now()
    if (now - last < CHUNK_GUARD_WINDOW_MS) {
      log('chunk error pero ya recargué recién: no reintento (evito bucle).')
      return
    }
    sessionStorage.setItem(CHUNK_GUARD_KEY, String(now))
    log('chunk faltante tras deploy: recargo para traer el index nuevo.')
    reload()
  }

  check() // al arrancar
  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onError as EventListener)

  let timer: ReturnType<typeof setInterval> | undefined
  if (pollIntervalMs > 0) timer = setInterval(check, pollIntervalMs)

  // Cleanup (útil en tests / HMR). En una app real no hace falta llamarlo.
  return () => {
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onError as EventListener)
    if (timer) clearInterval(timer)
  }
}

async function fetchServerVersion(url: string): Promise<string | null> {
  try {
    const r = await fetch(`${url}?_=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const data = (await r.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null // offline / error de red: no hacemos nada
  }
}

function isUserBusy(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true
}
