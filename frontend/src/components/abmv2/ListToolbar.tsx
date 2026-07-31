/**
 * ListToolbar — fila 2 del `SemanticAbmPage` (§2 del estándar).
 *
 *   [H1 22px] [chip total] [buscador ── flex-grow, max 420 ──]
 *                  [segmented de vistas] [secundario] [CTA primario verde]
 *
 * Reglas del estándar que implementa:
 *  - El buscador es el flex-grow de la fila; el bloque derecho NUNCA encoge.
 *  - UN SOLO CTA primario verde por pantalla (`primaryAction`).
 *  - El segmented de vistas solo se muestra si hay 2+ vistas disponibles.
 *
 * Presentacional puro: búsqueda y vista activa son estado CONTROLADO por la
 * página (props + callbacks). Estilos por clases `av2-*` (styles/abmv2.css),
 * todo token `--pl-*` — cero colores fijos.
 */
import {
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  ListChecks,
  Plus,
  Rows3,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Action, ListToolbarProps, ViewKind } from './types';

/** Icono + label accesible de cada vista del segmented. */
const VISTA_META: Record<ViewKind, { icon: LucideIcon; label: string }> = {
  cards: { icon: LayoutGrid, label: 'Tarjetas' },
  table: { icon: Rows3, label: 'Tabla' },
  guided: { icon: ListChecks, label: 'Guiada' },
  day: { icon: CalendarDays, label: 'Día' },
  week: { icon: CalendarRange, label: 'Semana' },
};

/**
 * Botón de acción de la toolbar. Soporta `Action` con `to` (Link de
 * react-router) o `onClick`. El primario sin icono explícito usa `Plus`
 * (referencia visual del estándar). Deshabilitado ⇒ `disabledReason`
 * como title — nunca un botón muerto sin explicación.
 */
function BotonAccion({ action, primario = false }: { action: Action; primario?: boolean }) {
  const clase = primario ? 'av2-btn-primario' : 'av2-btn-secundario';
  const Icono = action.icon ?? (primario ? Plus : undefined);
  const title = action.disabled ? action.disabledReason : undefined;
  const contenido = (
    <>
      {Icono && <Icono size={primario ? 15 : 14} strokeWidth={primario ? 2.4 : 2} aria-hidden />}
      {action.label}
    </>
  );

  if (action.to && !action.disabled) {
    return (
      <Link to={action.to} className={clase}>
        {contenido}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={clase}
      onClick={action.onClick}
      disabled={action.disabled}
      title={title}
    >
      {contenido}
    </button>
  );
}

export function ListToolbar({
  title,
  totalCount,
  searchPlaceholder,
  search,
  onSearchChange,
  views,
  activeView,
  onViewChange,
  secondaryAction,
  primaryAction,
}: ListToolbarProps) {
  return (
    <div className="av2-toolbar">
      <h1 className="av2-toolbar-titulo">{title}</h1>

      <span className="av2-toolbar-total">{totalCount.toLocaleString('es-AR')}</span>

      {/* label como wrapper: click en cualquier parte enfoca el input */}
      <label className="av2-toolbar-buscador">
        <Search size={16} strokeWidth={2} aria-hidden />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      </label>

      <div className="av2-toolbar-derecha">
        {views.length > 1 && (
          <div className="av2-seg-vistas" role="group" aria-label="Vista del listado">
            {views.map((vista) => {
              const meta = VISTA_META[vista];
              const IconoVista = meta.icon;
              const activa = vista === activeView;
              return (
                <button
                  key={vista}
                  type="button"
                  className={activa ? 'av2-seg-vista av2-seg-vista--activa' : 'av2-seg-vista'}
                  onClick={() => onViewChange(vista)}
                  title={meta.label}
                  aria-label={meta.label}
                  aria-pressed={activa}
                >
                  <IconoVista size={15} strokeWidth={2} aria-hidden />
                </button>
              );
            })}
          </div>
        )}

        {secondaryAction && <BotonAccion action={secondaryAction} />}
        <BotonAccion action={primaryAction} primario />
      </div>
    </div>
  );
}
