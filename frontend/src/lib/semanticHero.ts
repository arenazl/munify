/**
 * Tipos + azúcar del SemanticHero (hero semántico del rediseño v2).
 * Separado del componente por la regla de fast-refresh (solo componentes
 * en archivos de componentes). Las pantallas importan `seg` de acá.
 */

export type Veredicto = 'bueno' | 'advertencia' | 'malo';

export interface HeroSegmento {
  texto: string;
  veredicto?: Veredicto;
}

export interface HeroAccion {
  label: string;
  to?: string;
  onClick?: () => void;
  primaria?: boolean;
}

export interface HeroFrase {
  segmentos: HeroSegmento[];
  acciones?: HeroAccion[];
}

/** KPI del strip del hero (estilo mockup: eyebrow caps + número display +
 *  sub-caption chica debajo, ej. "50 pagos" / "71% · 10 pagos"). */
export interface HeroKpi {
  etiqueta: string;
  valor: string | number;
  /** Renglón chico bajo el número (contexto del KPI). */
  sub?: string;
  veredicto?: Veredicto;
}

/** Azúcar para armar segmentos: seg('12 abiertos', 'advertencia') */
export function seg(texto: string, veredicto?: Veredicto): HeroSegmento {
  return { texto, veredicto };
}

/** Veredicto dominante de una frase (para el color del punto del carrusel). */
export function veredictoDominante(frase: HeroFrase): Veredicto | undefined {
  const vs = frase.segmentos.map((s) => s.veredicto);
  if (vs.includes('malo')) return 'malo';
  if (vs.includes('advertencia')) return 'advertencia';
  if (vs.includes('bueno')) return 'bueno';
  return undefined;
}
