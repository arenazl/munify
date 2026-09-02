/**
 * abmv2/AssignmentPanel — emparejar filas con destinos (§ AssignmentPanelProps).
 *
 * Origen: cuerpo "asignacion" de "Configuracion.dc.html" (canvas Claude
 * Design, 2026-08-03). En Munify resuelve categoría → dependencia, pero el
 * componente no sabe de eso: habla de FILAS y DESTINOS, así que sirve igual
 * para zona → cuadrilla, concepto → caja o empleado → sector.
 *
 * Anatomía:
 *
 *   [ lados ]  [ buscador ─── flex ─── ]  [ CTA masivo de sugerencias ]
 *   FILTRAR  ( chips con contador )
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ENTIDAD              EN USO    QUIÉN LO ATIENDE             │
 *   │ ● GRUPO · detalle                                           │
 *   │  [tile] Nombre        38       [ combo lleno    ▾ ]         │
 *   │  [tile] Nombre         0       [ ✦ sugerencia punteada ]    │
 *   │ pie: resumen                                    dato        │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Por qué la sugerencia se pinta PUNTEADA y no como un valor más: el usuario
 * tiene que distinguir de un vistazo lo que ya decidió de lo que el sistema
 * le propone. Un combo relleno con la sugerencia adentro se lee como
 * "asignado" y nadie vuelve a mirarlo.
 *
 * Presentacional puro: buscar, filtrar y agrupar es de la página; acá se
 * pinta y se avisa. Cero colores fijos (clases av2-* sobre tokens --pl-*);
 * los únicos inline son los colores de entidad que vienen de datos.
 */
import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';
import { FilterChips, MetricCell, SegmentedControl, Tile } from './Controls';
import type { AssignRow, AssignmentPanelProps } from './types';

/** Tile de la entidad: acepta un componente lucide o un nodo ya instanciado
 *  (la misma discriminación que EntityCell — `typeof` no alcanza porque
 *  lucide usa forwardRef). */
function IconoEntidad({ icon, color }: { icon?: LucideIcon | ReactNode; color?: string }) {
  if (icon == null) return null;
  if (isValidElement(icon)) {
    return (
      <Tile color={color}>{icon}</Tile>
    );
  }
  const Icono = icon as LucideIcon;
  return (
    <Tile color={color}>
      <Icono size={16} strokeWidth={1.9} />
    </Tile>
  );
}

export function AssignmentPanel({
  sides,
  activeSide,
  onSideChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  bulkAction,
  filters,
  activeFilter,
  onFilterChange,
  columnLabels,
  targets,
  groups,
  onAssign,
  onClear,
  footer,
  loading = false,
  emptyMessage = 'No hay filas que coincidan con la búsqueda y los filtros aplicados.',
}: AssignmentPanelProps) {
  const totalFilas = groups.reduce((n, g) => n + g.rows.length, 0);

  // Componente inteligente: si NINGUNA fila trae métrica, la columna del medio
  // no se dibuja. Un encabezado "EN USO" sobre una columna vacía es peor que
  // no tenerla — el usuario lee que le falta un dato que nadie prometió.
  const hayMetrica = groups.some((g) => g.rows.some((r) => r.metric));
  const clsGrid = `av2-asig-grid${hayMetrica ? '' : ' av2-asig-grid--sin-metrica'}`;

  // Opciones del combo. La opción vacía sólo existe si la página acepta
  // desasignar: ofrecer "—" sin handler sería un control que miente.
  const opcionesCombo = onClear
    ? [{ value: '', label: 'Sin asignar' }, ...targets.map((t) => ({ value: t.value, label: t.label }))]
    : targets.map((t) => ({ value: t.value, label: t.label }));

  const renderDestino = (fila: AssignRow) => {
    if (fila.assignedTo) {
      const destino = targets.find((t) => t.value === fila.assignedTo);
      return (
        <span className="av2-asig-destino">
          {destino?.dotColor && (
            // Color del destino = runtime (viene de datos).
            <span className="av2-asig-punto" style={{ background: destino.dotColor }} />
          )}
          <ModernSelect
            variant="v2"
            value={fila.assignedTo}
            options={opcionesCombo}
            searchable={opcionesCombo.length > 8}
            disabled={fila.disabled}
            onChange={(v) => (v === '' ? onClear?.(fila.id) : onAssign(fila.id, v))}
            className="av2-asig-combo"
          />
        </span>
      );
    }

    if (fila.suggestion) {
      return (
        <button
          type="button"
          className="av2-asig-sugerencia"
          title={
            fila.suggestion.reason
              ? `Aplicar: ${fila.suggestion.label} — ${fila.suggestion.reason}`
              : `Aplicar: ${fila.suggestion.label}`
          }
          disabled={fila.disabled}
          onClick={() => onAssign(fila.id, fila.suggestion!.value)}
        >
          <Sparkles size={13} strokeWidth={2} />
          <span className="av2-asig-sugerencia-txt">{fila.suggestion.label}</span>
        </button>
      );
    }

    return (
      <ModernSelect
        variant="v2"
        value=""
        placeholder="Sin asignar"
        options={opcionesCombo}
        searchable={opcionesCombo.length > 8}
        disabled={fila.disabled}
        onChange={(v) => v && onAssign(fila.id, v)}
        className="av2-asig-combo"
      />
    );
  };

  return (
    <div className="av2-asig">
      {/* --- Controles --- */}
      {(sides || onSearchChange || bulkAction) && (
        <div className="av2-asig-controles">
          {sides && sides.length > 0 && (
            <SegmentedControl
              options={sides}
              value={activeSide ?? sides[0].id}
              onChange={(id) => onSideChange?.(id)}
              ariaLabel="Qué se asigna"
            />
          )}
          {onSearchChange && (
            <label className="av2-asig-buscador">
              <Search size={15} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={search ?? ''}
                placeholder={searchPlaceholder}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </label>
          )}
          {/* Sólo cuando hay algo que aplicar: un CTA que no hace nada enseña
              a ignorarlo. Que exista o no lo decide la página. */}
          {bulkAction && (
            <button
              type="button"
              className="av2-asig-masivo"
              onClick={bulkAction.onClick}
              disabled={bulkAction.disabled}
              title={bulkAction.disabled ? bulkAction.disabledReason : undefined}
            >
              {bulkAction.icon ? (
                <bulkAction.icon size={15} strokeWidth={2} />
              ) : (
                <Sparkles size={15} strokeWidth={2} />
              )}
              {bulkAction.label}
            </button>
          )}
        </div>
      )}

      {filters && filters.length > 0 && (
        <div className="av2-asig-filtros">
          <FilterChips chips={filters} value={activeFilter} onChange={onFilterChange} label="Filtrar" />
        </div>
      )}

      {/* --- Tabla de asignación --- */}
      <div className="av2-asig-tabla">
        <div className={`${clsGrid} av2-asig-encabezado`} role="row">
          <span className="av2-eyebrow">{columnLabels?.entity ?? 'Entidad'}</span>
          {hayMetrica && (
            <span className="av2-eyebrow av2-al-der">{columnLabels?.metric ?? 'En uso'}</span>
          )}
          <span className="av2-eyebrow">{columnLabels?.target ?? 'Asignado a'}</span>
        </div>

        {loading ? (
          <div aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={`${clsGrid} av2-asig-fila`} role="presentation">
                <span className="av2-skel-entidad">
                  <span className="av2-skeleton av2-skeleton--tile" />
                  <span className="av2-skel-lineas">
                    <span className="av2-skeleton av2-skeleton--w2" />
                  </span>
                </span>
                <span className="av2-skeleton av2-skeleton--w1" />
                <span className="av2-skeleton av2-skeleton--w3" />
              </div>
            ))}
          </div>
        ) : totalFilas === 0 ? (
          <div className="av2-tabla-vacia">{emptyMessage}</div>
        ) : (
          groups.map((g) => (
            <div key={g.key} role="rowgroup">
              <div
                className={`av2-asig-grupo${g.veredicto ? ` av2-asig-grupo--${g.veredicto}` : ''}`}
              >
                <span className="av2-asig-grupo-punto" />
                <span className="av2-asig-grupo-titulo">{g.title}</span>
                {g.detail && <span className="av2-asig-grupo-detalle">{g.detail}</span>}
              </div>
              {g.rows.map((fila) => (
                <div key={fila.id} className={`${clsGrid} av2-asig-fila`} role="row">
                  <span className="av2-asig-entidad">
                    <IconoEntidad icon={fila.icon} color={fila.tileColor} />
                    <span className="av2-asig-nombre">{fila.label}</span>
                  </span>
                  {hayMetrica && (
                    <span className="av2-celda av2-al-der">
                      {fila.metric ? <MetricCell {...fila.metric} /> : null}
                    </span>
                  )}
                  <span className="av2-asig-celda-destino">
                    {renderDestino(fila)}
                    {/* La × sólo aparece con destino puesto: es "deshacer lo
                        que decidí", no una tercera forma de elegir. */}
                    {onClear && fila.assignedTo && !fila.disabled && (
                      <button
                        type="button"
                        className="av2-asig-quitar"
                        title="Quitar asignación"
                        aria-label="Quitar asignación"
                        onClick={() => onClear(fila.id)}
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}

        {footer && (footer.left || footer.right) && (
          <div className="av2-asig-pie">
            {footer.left && <span className="av2-asig-pie-txt">{footer.left}</span>}
            {footer.right && <span className="av2-asig-pie-dato">{footer.right}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignmentPanel;
