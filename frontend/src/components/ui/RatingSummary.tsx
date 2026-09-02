/**
 * RatingSummary — resumen de una calificación del KIT: promedio + estrellas
 * + subtítulo + distribución por nivel con barras.
 *
 * AGNÓSTICO: no sabe QUÉ se califica (reclamos, un producto, un curso, un
 * chofer): todo entra por props. Cero copy de dominio adentro — el texto de
 * contexto es `subtitulo` y lo compone quien lo usa. Estilos en
 * styles/rating-summary.css sobre tokens --pl-*.
 *
 * La rampa de color de la distribución se deriva de la RELACIÓN
 * `nivel / maxNivel`, no de "5 estrellas": así funciona igual con escalas de
 * 5, de 10 o de 3. El mejor nivel toma el acento, el medio el ámbar y el peor
 * el rojo (los 3 matices semánticos universales del estándar v2).
 *
 * Formato del promedio: `Intl.NumberFormat`. El separador decimal sale del
 * locale (prop `locale`, o el del navegador) — nunca un `replace('.', ',')`
 * hardcodeado.
 *
 * Inline SOLO valores runtime: el ancho % de cada barra.
 */
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';

export interface RatingSummaryNivel {
  /** 5, 4, 3… (el orden de render es el del array). */
  nivel: number;
  cantidad: number;
}

export interface RatingSummaryProps {
  /** Promedio a mostrar en grande. */
  promedio: number;
  /** Denominador de las barras (cantidad total de calificaciones). */
  total: number;
  /** Línea de contexto bajo el promedio. La compone quien usa el componente. */
  subtitulo?: ReactNode;
  distribucion: RatingSummaryNivel[];
  /** Escala: cuántas estrellas son el máximo. Default 5. */
  maxNivel?: number;
  /** Decimales del promedio. Default 1. */
  decimales?: number;
  /** Locale del formato numérico. Sin valor, el del navegador. */
  locale?: string;
  className?: string;
}

/** Tono de la barra según qué tan bueno es el nivel dentro de la escala. */
const tonoNivel = (nivel: number, maxNivel: number): string => {
  const r = maxNivel > 0 ? nivel / maxNivel : 0;
  if (r >= 0.9) return 'optimo';
  if (r >= 0.7) return 'bueno';
  if (r >= 0.5) return 'medio';
  if (r >= 0.3) return 'bajo';
  return 'malo';
};

const clampPct = (pct: number): number => Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

export function RatingSummary({
  promedio,
  total,
  subtitulo,
  distribucion,
  maxNivel = 5,
  decimales = 1,
  locale,
  className,
}: RatingSummaryProps) {
  const texto = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number.isFinite(promedio) ? promedio : 0);

  const llenas = Math.max(0, Math.min(maxNivel, Math.round(promedio)));

  return (
    <div className={`rs${className ? ` ${className}` : ''}`}>
      <div className="rs-score-row">
        <span className="rs-score">{texto}</span>
        <span className="rs-stars" aria-hidden="true">
          {Array.from({ length: maxNivel }, (_, i) => (
            <Star
              key={i}
              size={15}
              fill="currentColor"
              strokeWidth={0}
              className={i < llenas ? 'rs-star--on' : 'rs-star--off'}
            />
          ))}
        </span>
      </div>

      {subtitulo && <span className="rs-sub">{subtitulo}</span>}

      {distribucion.length > 0 && (
        <div className="rs-dist">
          {distribucion.map(({ nivel, cantidad }) => (
            <div key={nivel} className="rs-dist-fila">
              <span className="rs-dist-nivel">
                {nivel}
                <Star size={11} fill="currentColor" strokeWidth={0} />
              </span>
              <span className="rs-track" aria-hidden="true">
                {/* runtime: el ancho lo define el dato */}
                <span
                  className={`rs-fill rs-fill--${tonoNivel(nivel, maxNivel)}`}
                  style={{ width: `${clampPct(total > 0 ? (cantidad / total) * 100 : 0)}%` }}
                />
              </span>
              <span className="rs-dist-n">{cantidad}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RatingSummary;
