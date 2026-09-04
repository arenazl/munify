/**
 * abmv2/TildesAditivas — píldoras ADITIVAS de la FilterBar.
 *
 * [v3.4] Pedido del dueño (2026-09-03, auditoría de demos): "que me deje
 * tildar Sin barrios, Sin contorno… y que sean aditivas: una no saca la
 * otra". Es el hermano del `SelectorAdaptativo` (que es EXCLUYENTE: una
 * opción a la vez) para los recortes que se COMBINAN: cada tilde suma una
 * condición y la página decide cómo las cruza (normalmente AND).
 *
 * Dumb y tonta: el padre declara opciones, conteos y veredictos, y recibe
 * la lista de ids activos. Conteo 0 ⇒ apagada y no clickeable (misma regla
 * que los StatusTab: nunca un filtro que deje la lista vacía sin avisar).
 * Estilos por clases av2-* sobre tokens --pl-*; en angosto la FilterBar la
 * apila dentro de su panel, como al resto de los filtros.
 */
import { Check } from 'lucide-react';
import type { TildesSpec } from './types';

export function TildesAditivas({ label, opciones, activas, onChange }: TildesSpec) {
  if (opciones.length === 0) return null;

  const alternar = (id: string) =>
    onChange(activas.includes(id) ? activas.filter((a) => a !== id) : [...activas, id]);

  return (
    <div className="av2-tildes" role="group" aria-label={label ?? 'Filtros combinables'}>
      {label && <span className="av2-select-etiqueta">{label}</span>}
      {opciones.map((o) => {
        const activa = activas.includes(o.id);
        const cero = o.count === 0 && !activa;
        const clases = [
          'av2-tilde',
          activa ? 'av2-tilde--activa' : '',
          cero ? 'av2-tilde--cero' : '',
          o.veredicto ? `av2-tilde--${o.veredicto}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={o.id}
            type="button"
            className={clases}
            onClick={cero ? undefined : () => alternar(o.id)}
            disabled={cero}
            aria-pressed={activa}
            title={o.title}
          >
            <span className="av2-tilde-marca" aria-hidden>
              {activa && <Check size={11} strokeWidth={3} />}
            </span>
            {o.label}
            {o.count !== undefined && (
              <span className="av2-tilde-conteo">{o.count.toLocaleString('es-AR')}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TildesAditivas;
