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
