/**
 * LLAVES DE ACCESO A LAS DEMOS.
 *
 * La grilla de `/demo` es una VITRINA: se ven todas las demos generadas, pero
 * entrar a una necesita la llave que se emitió al crearla (dueño, 2026-09-02:
 * "público pero no tan público"). La llave viaja una sola vez, en la respuesta
 * del alta, y vive acá — en el localStorage del que la generó. El link para
 * compartir es esa misma llave puesta en la URL.
 *
 * Lo que guardamos NO es un secreto de sesión ni una credencial de usuario: es
 * la llave de una demo con datos de ejemplo, pensada para pasarse por WhatsApp.
 * Por eso alcanza el localStorage y no hay recupero por UI: si se pierde, se
 * genera otra demo.
 */
const KEY = 'munify_demo_tokens';

type Tokens = Record<string, string>;

/** Todo lo guardado. Nunca tira: un storage roto o bloqueado vale como vacío. */
export function leerTokens(): Tokens {
  try {
    const crudo = localStorage.getItem(KEY);
    if (!crudo) return {};
    const parsed: unknown = JSON.parse(crudo);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Tokens;
  } catch {
    return {};
  }
}

export function guardarToken(codigo: string, token: string): void {
  if (!codigo || !token) return;
  try {
    const todos = leerTokens();
    todos[codigo] = token;
    localStorage.setItem(KEY, JSON.stringify(todos));
  } catch {
    // Modo privado o storage lleno: se pierde la llave, no la sesión.
  }
}

export function tokenDe(codigo?: string | null): string {
  if (!codigo) return '';
  return leerTokens()[codigo] || '';
}

/** Sufijo listo para pegar a una URL de la API (`''` si no hay llave). */
export function queryToken(codigo?: string | null, sep: '?' | '&' = '?'): string {
  const t = tokenDe(codigo);
  return t ? `${sep}t=${encodeURIComponent(t)}` : '';
}

/**
 * Entrada POR LINK. Si la URL trae `?t=`, esa llave se guarda como propia: a
 * partir de ahí este navegador entra a esa demo como si la hubiera generado,
 * que es exactamente lo que el dueño de la demo quiso al pasar el link.
 */
export function capturarTokenDeUrl(codigo?: string | null): string {
  if (!codigo) return '';
  try {
    const t = new URLSearchParams(window.location.search).get('t');
    if (t) {
      guardarToken(codigo, t);
      return t;
    }
  } catch {
    // URL rara: se sigue con lo que haya guardado.
  }
  return tokenDe(codigo);
}

/** El link que se copia y se pasa. Absoluto: va a viajar fuera de la app. */
export function linkDeAcceso(codigo: string): string {
  const t = tokenDe(codigo);
  const base = `${window.location.origin}/demo/listo?muni=${encodeURIComponent(codigo)}`;
  return t ? `${base}&t=${encodeURIComponent(t)}` : base;
}
