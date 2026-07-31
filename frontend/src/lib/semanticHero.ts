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
