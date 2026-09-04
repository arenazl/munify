/**
 * abmv2/pistas — dónde se recuerda que una pista (HintBanner) fue cerrada.
 *
 * Por defecto, en localStorage: por navegador. Eso es lo que hacía el
 * HintBanner desde v3 y lo que hizo que una pista cerrada en el teléfono
 * volviera a aparecer en la tablet (dueño, 2026-09-03: "si el usuario lo
 * cierra, no vuelve a aparecer"). La app puede enchufar una persistencia
 * POR USUARIO con `configurarPersistenciaPistas` — en Munify, las
 * preferencias de interfaz que guarda el backend — y el kit la consulta
 * primero. El kit no sabe de usuarios ni de endpoints: sólo pregunta
 * "¿está cerrada?" y avisa "la cerraron".
 *
 * Los banners montados se suscriben: cuando la app configura el adaptador
 * DESPUÉS de que la página ya se dibujó (el usuario llega del storage en un
 * efecto), la pista que ya estaba cerrada en el backend se retira sola.
 */

export interface PersistenciaPistas {
  estaCerrada(key: string): boolean;
  cerrar(key: string): void;
}

const PREFIJO = 'av2_hint_';

let adaptador: PersistenciaPistas | null = null;
const oyentes = new Set<() => void>();

export function configurarPersistenciaPistas(nuevo: PersistenciaPistas | null): void {
  adaptador = nuevo;
  oyentes.forEach((f) => f());
}

/** Avisa cuando cambia el adaptador. Devuelve la función para desuscribirse. */
export function suscribirPistas(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function pistaCerrada(key: string): boolean {
  if (adaptador?.estaCerrada(key)) return true;
  try {
    return localStorage.getItem(PREFIJO + key) === '1';
  } catch {
    return false;
  }
}

export function cerrarPista(key: string): void {
  try {
    localStorage.setItem(PREFIJO + key, '1');
  } catch {
    /* sin storage (modo privado): queda el adaptador, si hay */
  }
  adaptador?.cerrar(key);
}
