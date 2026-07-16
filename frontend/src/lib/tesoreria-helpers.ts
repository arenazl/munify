// Helpers compartidos del módulo Tesorería.
//
// Funciones puras para derivar estados agregados a partir de cuotas. La
// premisa es no inventar nada: si no hay datos, devolvemos "sin_gastos" o
// el estado base del gasto. Los colores quedan en UN solo lugar para que
// el side modal del mapa y la home compartan el lenguaje visual.

import type { EstadoGastoCuota, Gasto, GastoCuota } from '../types';

// Estado agregado a nivel CONTACTO ----------------------------------------
export type EstadoContactoAgregado = 'al_dia' | 'en_mora' | 'sin_gastos';

export const ESTADO_CONTACTO_LABEL: Record<EstadoContactoAgregado, string> = {
  al_dia: 'Al día',
  en_mora: 'En mora',
  sin_gastos: 'Sin gastos',
};

export const ESTADO_CONTACTO_COLOR: Record<EstadoContactoAgregado, string> = {
  al_dia: '#10b981',     // verde
  en_mora: '#ef4444',    // rojo
  sin_gastos: '#71717a', // gris
};

// Estado agregado a nivel GASTO -------------------------------------------
// "completado" = todas las cuotas pagadas (o canceladas).
// "en_mora"    = al menos una cuota vencida.
// "al_dia"     = el resto (pendientes sin vencer).
export type EstadoGastoAgregado = 'al_dia' | 'en_mora' | 'completado';

export const ESTADO_GASTO_LABEL: Record<EstadoGastoAgregado, string> = {
  al_dia: 'Al día',
  en_mora: 'En mora',
  completado: 'Completado',
};

export const ESTADO_GASTO_COLOR: Record<EstadoGastoAgregado, string> = {
  al_dia: '#10b981',
  en_mora: '#ef4444',
  completado: '#3b82f6',
};

// Color por estado de cuota individual (single source of truth) -----------
export const ESTADO_CUOTA_COLOR: Record<EstadoGastoCuota, string> = {
  pagada: '#10b981',
  pendiente: '#f59e0b',
  vencida: '#ef4444',
  cancelada: '#71717a',
};

/**
 * Calcula el estado agregado de un gasto a partir de sus cuotas.
 * Si el gasto no tiene cuotas cargadas, asumimos "al_dia" (es el estado
 * neutro — no inventamos morosidad cuando no hay datos).
 */
export function estadoDeGasto(gasto: Gasto): EstadoGastoAgregado {
  const cuotas = gasto.cuotas || [];
  if (cuotas.length === 0) return 'al_dia';

  const haVencida = cuotas.some(c => c.estado === 'vencida');
  if (haVencida) return 'en_mora';

  const todasCerradas = cuotas.every(c => c.estado === 'pagada' || c.estado === 'cancelada');
  if (todasCerradas) return 'completado';

  return 'al_dia';
}

/**
 * Estado agregado de un contacto: pasada la lista de SUS gastos.
 * - Sin gastos -> 'sin_gastos'
 * - Algún gasto en mora -> 'en_mora'
 * - Caso contrario -> 'al_dia'
 */
export function estadoDeContacto(gastos: Gasto[]): EstadoContactoAgregado {
  if (!gastos || gastos.length === 0) return 'sin_gastos';
  const algunaEnMora = gastos.some(g => estadoDeGasto(g) === 'en_mora');
  if (algunaEnMora) return 'en_mora';
  return 'al_dia';
}

/**
 * Filtra las cuotas de un gasto al rango [desde, hasta] (ISO YYYY-MM-DD).
 * Si una de las puntas viene vacía, no se filtra por esa punta.
 * Devuelve un GASTO clonado con las cuotas filtradas — sin mutar el original.
 */
export function recortarGastoARango(g: Gasto, desde: string, hasta: string): Gasto {
  if (!desde && !hasta) return g;
  const cuotas = (g.cuotas || []).filter(c => enRango(c.fecha_vencimiento, desde, hasta));
  return { ...g, cuotas };
}

/**
 * ¿Una fecha ISO cae dentro del rango? Comparación lexicográfica (segura
 * con YYYY-MM-DD).
 */
export function enRango(fechaIso: string, desde: string, hasta: string): boolean {
  if (!fechaIso) return false;
  if (desde && fechaIso < desde) return false;
  if (hasta && fechaIso > hasta) return false;
  return true;
}

/**
 * ¿El gasto tiene actividad dentro del rango?
 * - fecha del gasto en rango, O
 * - alguna cuota con vencimiento en rango.
 * Si el rango está vacío, todo cuenta.
 */
export function gastoEnRango(g: Gasto, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  if (enRango(g.fecha, desde, hasta)) return true;
  const cuotas = g.cuotas || [];
  return cuotas.some((c: GastoCuota) => enRango(c.fecha_vencimiento, desde, hasta));
}

// Fechas ISO (YYYY-MM-DD) sin corrimiento de zona horaria ------------------
// `new Date('2026-07-14')` la interpreta como medianoche UTC; al mostrarla o
// compararla en Argentina (UTC-3) retrocede al día 13. Anclando la fecha con
// sus componentes (año, mes, día) queda en el día correcto en hora local.

/** Parsea 'YYYY-MM-DD' como fecha LOCAL (no UTC). Ignora cualquier hora. */
export function parseFechaLocal(iso: string | null | undefined): Date {
  const s = (iso || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/**
 * Formatea 'YYYY-MM-DD' a 'D/M/YYYY' (es-AR) sin el corrimiento de día que
 * introduce `new Date(iso)` al parsear como UTC. Devuelve '—' si es vacía o
 * inválida.
 */
export function formatFechaAR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseFechaLocal(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('es-AR');
}
