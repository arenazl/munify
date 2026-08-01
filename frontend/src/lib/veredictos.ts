/**
 * Umbrales de VEREDICTO para los heros semánticos (rediseño v2).
 *
 * El veredicto colorea los tramos dinámicos de la frase:
 *   bueno → acento · advertencia → ámbar · malo → rojo
 *
 * REGLA (dueño, 2026-07-31): los parámetros los fija el código por ahora,
 * pero tienen que ser CONFIGURABLES en settings. Por eso:
 *   - `UMBRALES_DEFAULT` = única fuente de los valores por defecto.
 *   - `resolverUmbrales(overrides)` mergea overrides parciales del municipio
 *     (cuando exista la pantalla de settings, guarda un JSON parcial con la
 *     misma forma — p.ej. en `tema_config.veredictos` o `configuraciones` —
 *     y las pantallas no cambian ni una línea).
 * Las pantallas NUNCA comparan números a mano: usan los helpers de abajo.
 */
import type { Veredicto } from './semanticHero';

export interface UmbralesVeredicto {
  /** Items en riesgo de SLA (cantidad): >= advertencia / >= malo. */
  slaRiesgo: { advertencia: number; malo: number };
  /** Reclamos sin asignar (cantidad). */
  sinAsignar: { advertencia: number; malo: number };
  /** Reclamos/trámites vencidos (cantidad). */
  vencidos: { advertencia: number; malo: number };
  /** Tasa de resolución (%): >= bueno → bueno; < malo → malo. */
  tasaResolucion: { bueno: number; malo: number };
  /** Tiempo promedio de resolución (días): <= bueno → bueno; >= malo → malo. */
  tiempoResolucionDias: { bueno: number; malo: number };
  /** Stock de un consumible vs mínimo (%): <= malo → malo; <= advertencia → advertencia. */
  stockSobreMinimoPct: { advertencia: number; malo: number };
  /** Turnos sin confirmar para hoy (cantidad). */
  turnosSinConfirmar: { advertencia: number; malo: number };
  /** Días desde el último movimiento/carga (frescura de datos). */
  diasSinActividad: { advertencia: number; malo: number };
}

export const UMBRALES_DEFAULT: UmbralesVeredicto = {
  slaRiesgo: { advertencia: 1, malo: 5 },
  sinAsignar: { advertencia: 3, malo: 8 },
  vencidos: { advertencia: 1, malo: 5 },
  tasaResolucion: { bueno: 60, malo: 30 },
  tiempoResolucionDias: { bueno: 7, malo: 21 },
  stockSobreMinimoPct: { advertencia: 120, malo: 100 },
  turnosSinConfirmar: { advertencia: 3, malo: 8 },
  diasSinActividad: { advertencia: 7, malo: 21 },
};

type OverridesParciales = {
  [K in keyof UmbralesVeredicto]?: Partial<UmbralesVeredicto[K]>;
};

/** Defaults + overrides parciales del municipio (futuro settings). */
export function resolverUmbrales(overrides?: OverridesParciales | null): UmbralesVeredicto {
  if (!overrides) return UMBRALES_DEFAULT;
  const out = { ...UMBRALES_DEFAULT } as UmbralesVeredicto;
  (Object.keys(overrides) as Array<keyof UmbralesVeredicto>).forEach((k) => {
    if (overrides[k]) out[k] = { ...UMBRALES_DEFAULT[k], ...overrides[k] } as never;
  });
  return out;
}

// ---------- Helpers de evaluación (las pantallas usan SOLO esto) ----------

/** Métricas donde MÁS es PEOR (sin asignar, vencidos, SLA en riesgo...). */
export function veredictoMasEsPeor(
  valor: number,
  u: { advertencia: number; malo: number },
): Veredicto | undefined {
  if (valor >= u.malo) return 'malo';
  if (valor >= u.advertencia) return 'advertencia';
  return valor === 0 ? 'bueno' : undefined;
}

/** Métricas de tasa donde MÁS es MEJOR (% resolución). */
export function veredictoTasa(
  pct: number,
  u: { bueno: number; malo: number },
): Veredicto | undefined {
  if (pct >= u.bueno) return 'bueno';
  if (pct < u.malo) return 'malo';
  return 'advertencia';
}

/** Métricas donde MENOS es MEJOR con piso bueno (días de resolución). */
export function veredictoMenosEsMejor(
  valor: number,
  u: { bueno: number; malo: number },
): Veredicto | undefined {
  if (valor <= u.bueno) return 'bueno';
  if (valor >= u.malo) return 'malo';
  return 'advertencia';
}

/**
 * META de días de resolución: el plazo que el tablero muestra como "Meta N d"
 * y contra el que cuenta cuántas categorías quedaron "sobre la meta".
 *
 * NO es un número nuevo: la meta ES el piso `bueno` de `tiempoResolucionDias`
 * — cerrar dentro de ese plazo es exactamente lo que el veredicto considera
 * bueno. Así el color de cada fila y el conteo del pie jamás se contradicen, y
 * cuando exista la pantalla de settings la meta se configura sola con el resto
 * de los umbrales (misma forma de override parcial).
 *
 * NOTA: el módulo SLA tiene metas MÁS FINAS por categoría/prioridad
 * (`sla_configs.tiempo_resolucion`, en HORAS). El tablero no las carga (serían
 * N requests para un caption); si algún día las necesita, este helper es el
 * único punto a tocar.
 */
export function metaResolucionDias(u: UmbralesVeredicto = UMBRALES_DEFAULT): number {
  return u.tiempoResolucionDias.bueno;
}
