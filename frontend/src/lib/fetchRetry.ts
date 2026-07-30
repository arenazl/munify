/**
 * GET JSON con reintentos y backoff progresivo.
 *
 * Pensado para las cargas públicas del arranque (perfiles demo del login,
 * detalle del municipio): con el backend en Cloud Run scale-to-zero, el primer
 * request tras un rato frío puede fallar o devolver 5xx transitorio. Un único
 * intento tragado en silencio deja pantallas a medias (ej. login sin la
 * sección ÁREAS). Regla: 4xx definitivos NO se reintentan (son respuesta
 * real, ej. 404); errores de red y 5xx sí, con espera creciente.
 */
export async function fetchJsonRetry<T>(
  url: string,
  opts?: { tries?: number; baseDelayMs?: number },
): Promise<T> {
  const tries = opts?.tries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 800;
  let lastError: unknown;

  for (let intento = 0; intento < tries; intento++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 && res.status !== 408 && res.status !== 429) {
        // Respuesta definitiva del server (404, 403...): reintentar no cambia nada.
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, definitive: true });
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      if ((e as { definitive?: boolean })?.definitive) throw e;
      lastError = e;
    }
    if (intento < tries - 1) {
      await new Promise((r) => setTimeout(r, baseDelayMs * (intento + 1)));
    }
  }
  throw lastError;
}
