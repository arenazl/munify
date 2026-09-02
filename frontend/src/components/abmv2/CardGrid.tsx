/**
 * abmv2/CardGrid — la vista 'cards' del kit (§ CardGridProps de types.ts).
 *
 * Origen: vista de tarjetas del cuerpo "catalogo" de "Configuracion.dc.html"
 * (canvas Claude Design, 2026-08-03).
 *
 * Es la MISMA lista que la tabla con otra densidad, no otra pantalla: toma las
 * mismas piezas (entidad, métrica, acciones, interruptor) que la fila. El
 * toggle tabla/tarjetas de la toolbar sólo tiene sentido si las dos vistas
 * dicen lo mismo — si cada una muestra campos distintos, el usuario pierde
 * información al cambiar de vista y deja de usar el toggle.
 *
 * Existe porque cada pantalla que quería tarjetas se maquetaba su grilla:
 * seis tarjetas distintas para el mismo dato.
 */
import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MetricCell, Switch, Tile } from './Controls';
import type { CardGridProps } from './types';

function IconoTarjeta({ icon, color }: { icon?: LucideIcon | ReactNode; color?: string }) {
  if (icon == null) return null;
  if (isValidElement(icon)) return <Tile color={color} size={34}>{icon}</Tile>;
  const Icono = icon as LucideIcon;
  return (
    <Tile color={color} size={34}>
      <Icono size={18} strokeWidth={1.9} />
    </Tile>
  );
}

export function CardGrid<Row>({
  rows,
  rowKey,
  card,
  actions = [],
  toggle,
  onCardClick,
  loading = false,
  emptyMessage = 'No hay registros que coincidan con la búsqueda y los filtros aplicados.',
}: CardGridProps<Row>) {
  if (loading) {
    return (
      <div className="av2-cards" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="av2-card av2-card--skel">
            <span className="av2-skeleton av2-skeleton--tile" />
            <span className="av2-skeleton av2-skeleton--w2" />
            <span className="av2-skeleton av2-skeleton--w1 av2-skeleton--fina" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="av2-tabla av2-tabla-vacia">{emptyMessage}</div>;
  }

  return (
    <div className="av2-cards">
      {rows.map((row) => {
        const c = card(row);
        // El recorte por fila es el mismo criterio del DataTable: qué acciones
        // aplican depende del estado de CADA registro.
        const aplicables = actions.filter((a) => !a.visible || a.visible(row)).slice(0, 2);
        const encendido = toggle ? toggle.checked(row) : undefined;
        return (
          <div
            key={rowKey(row)}
            className={`av2-card${onCardClick ? ' av2-card--click' : ''}${
              encendido === false ? ' av2-card--apagada' : ''
            }`}
            onClick={onCardClick ? () => onCardClick(row) : undefined}
          >
            <div className="av2-card-cab">
              <IconoTarjeta icon={c.icon} color={c.tileColor} />
              <span className="av2-card-txt">
                <span className="av2-card-titulo">{c.title}</span>
                {c.subtitle && <span className="av2-card-sub">{c.subtitle}</span>}
              </span>
              {c.chip && (
                <span className={`av2-chip-estado av2-chip-estado--${c.chip.tone ?? 'gray'}`}>
                  {c.chip.label}
                </span>
              )}
            </div>

            {c.metric && (
              <div className="av2-card-metrica">
                <MetricCell {...c.metric} />
              </div>
            )}

            {(toggle || aplicables.length > 0) && (
              <div className="av2-card-pie" onClick={(e) => e.stopPropagation()}>
                {toggle && (
                  <Switch
                    size="sm"
                    checked={!!encendido}
                    onChange={(v) => toggle.onChange(row, v)}
                    label={encendido ? (toggle.labelOn ?? 'Activo') : (toggle.labelOff ?? 'Inactivo')}
                  />
                )}
                {aplicables.length > 0 && (
                  <span className="av2-card-acciones">
                    {aplicables.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`av2-tabla-accion${a.danger ? ' av2-tabla-accion--peligro' : ''}`}
                        title={a.label}
                        aria-label={a.label}
                        onClick={() => a.onClick(row)}
                      >
                        <a.icon size={15} strokeWidth={1.8} />
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default CardGrid;
