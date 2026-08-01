/**
 * ListToolbar — fila 3 del `SemanticAbmPage` (§2 del estándar).
 *
 *   [buscador ── flex-grow ──] │ [vistas] [orden] [CTA primario verde]
 *
 * [v2.3] El chip "⌘K" y su listener se fueron de acá: el atajo ahora es del
 * buscador GLOBAL de la topbar (shell/BuscadorGlobal), que es el único de la
 * app. Este input sigue igual de vivo — es el que filtra la grilla — sólo que
 * sin atajo propio (dos controles peleándose ⌘K es un affordance que miente).
 *
 * [v2.2] Ya NO lleva el H1 del módulo ni el chip del total: el título se mudó
 * a la cabecera de página (`PageHeader`, arriba del hero) y el total lo dicen
 * el tab "Todos" de la FilterBar y el pie de la tabla. Toolbar y FilterBar
 * forman UNA sola tarjeta partida por una línea (los bordes los resuelve
 * abmv2.css: la toolbar redondea arriba, los filtros abajo, pegados con
 * margin-top:-1px).
 *
 * Reglas del estándar que implementa:
 *  - El buscador es el flex-grow de la fila; el bloque derecho NUNCA encoge.
 *  - Como máximo UN CTA primario verde por pantalla (`primaryAction`).
 *    [v2.1] Ahora OPCIONAL: sin él no se renderiza botón (vistas de solo
 *    consulta — ver types.ts).
 *  - El segmented de vistas solo se muestra si hay 2+ vistas disponibles.
 *  - [v2.1] `steps`: chips numerados de flujo (1 Cliente → 2 Items → 3 Cobro)
 *    entre las vistas y las acciones. El número lo pinta la POSICIÓN (no viene
 *    en datos); los anteriores al activo se pintan completados (check verde),
 *    el activo ámbar (mismo lenguaje que el StatusStepper del drawer). Con
 *    `onStep` son clickeables (volver a un paso); sin él, solo informativos.
 *    `activo` con id desconocido ⇒ todos pendientes (graceful).
 *
 * Presentacional puro: búsqueda y vista activa son estado CONTROLADO por la
 * página (props + callbacks). Estilos por clases `av2-*` (styles/abmv2.css),
 * todo token `--pl-*` — cero colores fijos.
 */
import {
  CalendarDays,
  CalendarRange,
  Check,
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
  searchPlaceholder,
  search,
  onSearchChange,
  views,
  activeView,
  onViewChange,
  secondaryAction,
  primaryAction,
  steps,
}: ListToolbarProps) {
  /* [v2.1] Índice del paso activo. -1 (id desconocido) ⇒ todos pendientes. */
  const idxPasoActivo = steps ? steps.items.findIndex((p) => p.id === steps.activo) : -1;

  return (
    <div className="av2-toolbar">
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

      <span className="av2-divisor" aria-hidden />

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

        {/* [v2.1] Chips numerados de flujo, entre las vistas y las acciones.
            En flujos tipo Mostrador lo usual es steps SIN CTA. */}
        {steps && steps.items.length > 0 && (
          <div className="av2-steps" role="group" aria-label="Pasos del flujo">
            {steps.items.map((paso, i) => {
              const estado =
                i === idxPasoActivo ? 'activo' : i < idxPasoActivo ? 'hecho' : 'pendiente';
              const clickeable = !!steps.onStep;
              return (
                <button
                  key={paso.id}
                  type="button"
                  className={`av2-step av2-step--${estado}`}
                  onClick={clickeable ? () => steps.onStep?.(paso.id) : undefined}
                  disabled={!clickeable}
                  aria-current={estado === 'activo' ? 'step' : undefined}
                >
                  <span className="av2-step-num av2-tnum" aria-hidden>
                    {estado === 'hecho' ? <Check size={11} strokeWidth={2.6} /> : i + 1}
                  </span>
                  {paso.label}
                </button>
              );
            })}
          </div>
        )}

        {secondaryAction && <BotonAccion action={secondaryAction} />}
        {/* [v2.1] CTA opcional: sin primaryAction no hay botón primario. */}
        {primaryAction && <BotonAccion action={primaryAction} primario />}
      </div>
    </div>
  );
}
