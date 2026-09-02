/**
 * BalanceBar — "¿sacamos más de lo que entra?" en una sola barra.
 *
 * QUÉ PROBLEMA RESUELVE
 * Un conteo suelto no significa nada: "6 resueltos esta semana" no dice si
 * está bien o mal, porque falta contra qué. El dato con consecuencia es el
 * BALANCE — cuánto se cerró de lo que entró en el mismo período. Con los dos
 * números la barra puede dar VEREDICTO:
 *
 *   cerrados >= entrados  → bueno       (al día: no se acumula nada)
 *   cerrados >= 75%       → advertencia (empatando, se junta de a poco)
 *   menos                 → malo        (la cola crece)
 *
 * AGNÓSTICO: no sabe de reclamos ni de municipios. Son dos números y dos
 * palabras. Sirve para tickets cerrados vs. abiertos, pedidos despachados vs.
 * recibidos, o piezas terminadas vs. encargadas.
 *
 * Es deliberadamente una barra recta y no un medidor de aguja: la aguja no
 * agrega ningún dato que el número no diga ya, y se come la tarjeta entera.
 *
 * Estilos en styles/balance-bar.css sobre tokens --pl-* (polimórfico).
 */
import { veredictoBalance } from '../../lib/balance';

interface BalanceBarProps {
  /** Lo que se cerró/completó en el período. */
  cerrados: number;
  /** Lo que entró en el MISMO período. */
  entrados: number;
  /** Palabra para lo cerrado (default: "cerrados"). */
  etiquetaCerrados?: string;
  /** Palabra para lo que entró (default: "entraron"). */
  etiquetaEntrados?: string;
  className?: string;
}

export function BalanceBar({
  cerrados,
  entrados,
  etiquetaCerrados = 'cerrados',
  etiquetaEntrados = 'entraron',
  className,
}: BalanceBarProps) {
  const veredicto = veredictoBalance(cerrados, entrados);
  // El riel representa lo que entró. Si se cerró MÁS de lo que entró (se
  // descargó cola vieja), la barra se llena del todo y no se pasa de rosca.
  const base = Math.max(entrados, cerrados, 1);
  const porcentaje = Math.min(100, Math.round((cerrados / base) * 100));

  return (
    <div className={`bb ${className || ''}`}>
      <div
        className="bb-riel"
        role="img"
        aria-label={`${cerrados} ${etiquetaCerrados} de ${entrados} que ${etiquetaEntrados}`}
      >
        <div className={`bb-fill bb-fill--${veredicto}`} style={{ width: `${porcentaje}%` }}>
          {porcentaje >= 22 && <span className="bb-fill-num">{cerrados}</span>}
        </div>
      </div>
      <div className="bb-leyenda">
        <span className="bb-item">
          <i className={`bb-chip bb-chip--${veredicto}`} aria-hidden="true" />
          {etiquetaCerrados} {cerrados}
        </span>
        <span className="bb-item">
          <i className="bb-chip bb-chip--riel" aria-hidden="true" />
          {etiquetaEntrados} {entrados}
        </span>
      </div>
    </div>
  );
}
