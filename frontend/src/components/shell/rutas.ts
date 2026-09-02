/**
 * rutas.ts — mapa de rutas del shell v2: fuente ÚNICA de "cómo se llama la
 * pantalla en la que estoy parado".
 *
 * Lo consumen (nadie mantiene una lista paralela):
 *  - `MigasContexto` → segundo tramo de la miga de pan de la TopbarV2;
 *  - `PageHeader` (vía la miga) → para no repetir un eyebrow que la miga ya
 *    está diciendo dos líneas más arriba.
 *
 * Todo sale de `config/navigation.ts` (los items YA filtrados por rol/flags
 * que el Layout le pasa al shell) + `FALLBACK_TITULOS` para las rutas que no
 * figuran en el sidebar. Si una ruta no matchea nada, degrada al último
 * segmento prettificado y avisa con `conocida: false`.
 */
import type { ShellNavItem } from './SidebarV2';

/** Títulos de rutas que existen pero no figuran en el sidebar. */
const FALLBACK_TITULOS: Record<string, string> = {
  '/gestion/consola': 'Consola',
  '/gestion/crear-reclamo': 'Nuevo reclamo',
  '/gestion/crear-tramite': 'Nuevo trámite',
};

export interface RutaResuelta {
  /** Nombre del módulo que matcheó en navigation.ts (null si ninguno). */
  modulo: string | null;
  /** Etiqueta de la pantalla actual = último tramo de la miga. */
  pagina: string;
  /** false ⇒ la ruta no está en el menú ni en los fallbacks (nombre inferido). */
  conocida: boolean;
}

/** Saca la barra final ('/gestion/' → '/gestion'), salvo la raíz. */
export function normalizarRuta(ruta: string): string {
  return ruta.endsWith('/') && ruta !== '/' ? ruta.slice(0, -1) : ruta;
}

/* Rango Unicode de los diacríticos combinantes que deja `normalize('NFD')`.
   Se filtra por code point (y no con una clase de regex con los caracteres
   crudos) para que el archivo no dependa de cómo lo guarde cada editor. */
const DIACRITICO_MIN = 0x0300;
const DIACRITICO_MAX = 0x036f;

/**
 * Normaliza texto para COMPARAR (no para mostrar): sin tildes, minúsculas,
 * sin espacios de más. "Órdenes  de Pago " se compara igual que "ordenes de pago".
 */
export function normalizarTexto(texto: string): string {
  const sinTildes = Array.from(texto.normalize('NFD'))
    .filter((caracter) => {
      const cp = caracter.codePointAt(0) ?? 0;
      return cp < DIACRITICO_MIN || cp > DIACRITICO_MAX;
    })
    .join('');
  return sinTildes.toLowerCase().replace(/\s+/g, ' ').trim();
}

function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/**
 * Resuelve la ruta actual contra la navegación.
 *
 * Match por LONGEST-PREFIX de segmento: gana el href más largo que sea la
 * ruta o un prefijo de segmento de ella. '/gestion' (Dashboard) sólo gana por
 * match exacto — si no, titularía "Dashboard" a cualquier ruta desconocida.
 *
 * Cuando la ruta tiene profundidad EXTRA sobre el módulo (detalle:
 * '/gestion/reclamos/5622'), la etiqueta de pantalla se arma con el módulo +
 * el identificador ("Reclamos #5622") para que la miga siga teniendo exactos
 * dos tramos sin perder de vista dónde está parado el usuario.
 */
export function resolverRuta(pathname: string, items: ShellNavItem[]): RutaResuelta {
  const ruta = normalizarRuta(pathname);

  let modulo: string | null = null;
  let base = '';
  for (const item of items) {
    const href = normalizarRuta(item.href);
    const matchea = ruta === href || ruta.startsWith(`${href}/`);
    const prefijoValido = ruta === href || href !== '/gestion';
    if (matchea && prefijoValido && href.length > base.length) {
      base = href;
      modulo = item.name;
    }
  }

  // Match exacto con el menú ⇒ la pantalla ES el módulo.
  if (modulo && base === ruta) return { modulo, pagina: modulo, conocida: true };

  const fallback = FALLBACK_TITULOS[ruta];
  if (fallback) return { modulo, pagina: fallback, conocida: true };

  const segmento = ruta.split('/').filter(Boolean).pop() ?? '';

  // Detalle dentro de un módulo ('/gestion/reclamos/5622').
  if (modulo && segmento) {
    const etiqueta = /^\d+$/.test(segmento)
      ? `#${segmento}`
      : capitalizar(segmento.replace(/-/g, ' '));
    return { modulo, pagina: `${modulo} ${etiqueta}`, conocida: true };
  }

  if (!segmento) return { modulo, pagina: modulo ?? 'Inicio', conocida: !!modulo };
  return { modulo, pagina: capitalizar(segmento.replace(/-/g, ' ')), conocida: false };
}
