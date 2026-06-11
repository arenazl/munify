/**
 * Identificador estable del usuario logueado, para scopear el dismiss de los
 * hints/banners guia POR PERFIL.
 *
 * Regla: si un usuario cierra un hint, no le tiene que volver a aparecer a el.
 * Otro perfil/usuario que entre (incluso en el mismo navegador) lo ve de nuevo.
 *
 * Lee de localStorage (mismo patron que el resto de la app) para no acoplar los
 * componentes de hint al AuthContext. Si no hay usuario logueado, 'anon'.
 */
export function getHintUserKey(): string {
  if (typeof window === 'undefined') return 'anon';
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return 'anon';
    const u = JSON.parse(raw);
    return u?.id != null ? String(u.id) : 'anon';
  } catch {
    return 'anon';
  }
}

/**
 * Scope combinado USUARIO + MUNICIPIO para el dismiss de los hints.
 *
 * Si un perfil cierra el hint en un municipio, no le vuelve a aparecer ahi.
 * El super-admin que recorre municipios con el switcher lo ve fresco en cada
 * uno (combinacion usuario+muni distinta), pero no le reaparece donde ya lo
 * cerro. Para el cliente real (un municipio, usuario fijo) se comporta igual
 * que el scope por usuario: lo cierra una vez y listo.
 */
export function getHintScopeKey(): string {
  let muni = 'default';
  if (typeof window !== 'undefined') {
    try { muni = localStorage.getItem('municipio_codigo') || 'default'; } catch { /* ignore */ }
  }
  return `${getHintUserKey()}_${muni}`;
}
