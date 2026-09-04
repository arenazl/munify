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
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  FolderTree,
  Layers,
  LayoutGrid,
  ListChecks,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Plus,
  Rows3,
  Search,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useAnchoAngosto } from './FichaRegistro';
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
  arbol: { icon: FolderTree, label: 'Árbol' },
  map: { icon: MapIcon, label: 'Mapa' },
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
  sortSpec,
  groupSpec,
  secondaryAction,
  primaryAction,
  steps,
  viewLabels,
  pantallaCompleta,
  searchSuggestions,
  trail,
}: ListToolbarProps) {
  /* [v3.3] Con DOS vistas el segmented se lee como SOLAPAS: icono + label.
     Con tres o más, sólo icono (el ancho de la fila manda). */
  const vistasConLabel = views.length === 2;

  /* [v3.3] SUGERENCIAS del buscador: panel bajo el input mientras tiene foco
     y hay texto; flechas mueven, Enter elige, Esc cierra. `onMouseDown` con
     preventDefault en los items evita que el blur del input cierre el panel
     antes de que llegue el click. */
  const sugerencias = searchSuggestions?.items ?? [];
  const [sugAbierto, setSugAbierto] = useState(false);
  /* El índice activo se guarda JUNTO con la búsqueda a la que pertenece: si
     el texto cambió, vuelve a 0 sin efecto ni setState en render. */
  const [sugActivaDe, setSugActivaDe] = useState<{ clave: string; i: number }>({ clave: '', i: 0 });
  const claveSug = `${search}|${sugerencias.length}`;
  const sugActiva = sugActivaDe.clave === claveSug ? sugActivaDe.i : 0;
  const setSugActiva = (calc: (i: number) => number) => setSugActivaDe({ clave: claveSug, i: calc(sugActiva) });
  const hayTexto = search.trim().length > 0;
  const panelVisible =
    !!searchSuggestions && sugAbierto && hayTexto && (sugerencias.length > 0 || !!searchSuggestions.emptyMessage);
  const elegirSugerencia = (id: string) => {
    searchSuggestions?.onPick(id);
    setSugAbierto(false);
  };
  const teclaBuscador = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!searchSuggestions) return;
    if (e.key === 'Escape') {
      setSugAbierto(false);
      return;
    }
    if (!panelVisible || sugerencias.length === 0) {
      if (e.key === 'ArrowDown') setSugAbierto(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSugActiva((i) => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSugActiva((i) => (i - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      elegirSugerencia(sugerencias[Math.min(sugActiva, sugerencias.length - 1)].id);
    }
  };
  /* [v3.2] El orden es UN botón que CICLA las opciones (dueño): el label
     muestra el criterio activo; el click pasa al siguiente. */
  const idxOrden = sortSpec ? sortSpec.opciones.findIndex((o) => o.id === sortSpec.activo) : -1;
  const ordenActivo = sortSpec && idxOrden >= 0 ? sortSpec.opciones[idxOrden] : sortSpec?.opciones[0];
  const ciclarOrden = () => {
    if (!sortSpec || sortSpec.opciones.length === 0) return;
    const siguiente = sortSpec.opciones[(Math.max(idxOrden, 0) + 1) % sortSpec.opciones.length];
    sortSpec.onSort(siguiente.id);
  };
  /* [v2.1] Índice del paso activo. -1 (id desconocido) ⇒ todos pendientes. */
  const idxPasoActivo = steps ? steps.items.findIndex((p) => p.id === steps.activo) : -1;

  /* [proyección mobile] En angosto la zona de control es UNA SOLA LÍNEA:
     buscador, acción primaria y filtros. Nada más.

     El selector de vistas NO se achica: se elimina. A este ancho los tres
     modos se ven igual —la lista se dibuja como fichas cualquiera sea el
     elegido— así que ofrecer la opción es ruido. Los pasos de flujo y la
     acción secundaria tampoco entran: crecen con la configuración de cada
     pantalla, y una fila cuyo alto depende de la entidad es justamente lo que
     hace que el control se coma media pantalla. Ver la sección 05 de
     PROYECCION-MOBILE.md (tabla de conversión). */
  const { ref: refAncho, angosto } = useAnchoAngosto<HTMLDivElement>();
  const compacto = angosto === true;

  return (
    <div className="av2-toolbar" ref={refAncho}>
      {/* [v3.3] Recorrido por niveles: flecha "volver" + migas, ANTES del
          buscador. En el raíz la flecha queda deshabilitada; en angosto sólo
          flecha + nivel actual (las migas completas no entran). */}
      {trail && trail.items.length > 0 && (() => {
        const ultimo = trail.items[trail.items.length - 1];
        const enRaiz = trail.items.length < 2;
        return (
          <nav className="av2-recorrido" aria-label="Recorrido">
            <button
              type="button"
              className="av2-btn-secundario av2-btn-icono av2-recorrido-volver"
              onClick={trail.onBack}
              disabled={enRaiz}
              title={enRaiz ? 'Estás en el nivel más alto' : 'Volver un nivel'}
              aria-label="Volver un nivel"
            >
              <ArrowLeft size={15} strokeWidth={2} aria-hidden />
            </button>
            {compacto ? (
              <span className="av2-recorrido-miga av2-recorrido-miga--actual">{ultimo.label}</span>
            ) : (
              trail.items.map((it, i) => {
                const esUltimo = i === trail.items.length - 1;
                return (
                  <Fragment key={it.id}>
                    {i > 0 && <ChevronRight size={12} strokeWidth={2} className="av2-recorrido-sep" aria-hidden />}
                    {esUltimo || !trail.onGo ? (
                      <span
                        className={`av2-recorrido-miga${esUltimo ? ' av2-recorrido-miga--actual' : ''}`}
                        aria-current={esUltimo ? 'location' : undefined}
                      >
                        {it.label}
                      </span>
                    ) : (
                      <button type="button" className="av2-recorrido-miga" onClick={() => trail.onGo?.(it.id)}>
                        {it.label}
                      </button>
                    )}
                  </Fragment>
                );
              })
            )}
          </nav>
        );
      })()}

      {/* label como wrapper: click en cualquier parte enfoca el input.
          [v3.3] Con sugerencias, el label va dentro de un wrapper relativo
          que sostiene el panel; sin ellas el DOM es el de siempre. */}
      {(() => {
        const buscador = (
          <label className="av2-toolbar-buscador">
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (searchSuggestions) setSugAbierto(true);
              }}
              onFocus={searchSuggestions ? () => setSugAbierto(true) : undefined}
              onBlur={searchSuggestions ? () => setSugAbierto(false) : undefined}
              onKeyDown={searchSuggestions ? teclaBuscador : undefined}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              role={searchSuggestions ? 'combobox' : undefined}
              aria-expanded={searchSuggestions ? panelVisible : undefined}
              aria-autocomplete={searchSuggestions ? 'list' : undefined}
              autoComplete={searchSuggestions ? 'off' : undefined}
            />
          </label>
        );
        if (!searchSuggestions) return buscador;
        return (
          <div className="av2-buscador-wrap">
            {buscador}
            {panelVisible && (
              <ul className="av2-sugerencias" role="listbox">
                {sugerencias.length === 0 ? (
                  <li className="av2-sugerencia av2-sugerencia--vacia">{searchSuggestions.emptyMessage}</li>
                ) : (
                  sugerencias.map((sug, i) => {
                    const Icono = sug.icon;
                    return (
                      <li
                        key={sug.id}
                        role="option"
                        aria-selected={i === sugActiva}
                        className={`av2-sugerencia${i === sugActiva ? ' av2-sugerencia--activa' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setSugActiva(() => i)}
                        onClick={() => elegirSugerencia(sug.id)}
                      >
                        {Icono && <Icono size={14} strokeWidth={2} aria-hidden />}
                        <span className="av2-sugerencia-label">{sug.label}</span>
                        {sug.hint && <span className="av2-sugerencia-hint">{sug.hint}</span>}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        );
      })()}

      <span className="av2-divisor" aria-hidden />

      <div className="av2-toolbar-derecha">
        {views.length > 1 && !compacto && (
          <div className="av2-seg-vistas" role="group" aria-label="Vista del listado">
            {views.map((vista) => {
              const meta = VISTA_META[vista];
              const IconoVista = meta.icon;
              const activa = vista === activeView;
              const label = viewLabels?.[vista] ?? meta.label;
              return (
                <button
                  key={vista}
                  type="button"
                  className={[
                    'av2-seg-vista',
                    activa ? 'av2-seg-vista--activa' : '',
                    vistasConLabel ? 'av2-seg-vista--con-label' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onViewChange(vista)}
                  title={label}
                  aria-label={label}
                  aria-pressed={activa}
                >
                  <IconoVista size={15} strokeWidth={2} aria-hidden />
                  {vistasConLabel && <span className="av2-seg-vista-label">{label}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* [v3.2] Orden como UN botón que cicla el criterio. */}
        {sortSpec && ordenActivo && !compacto && (
          <button
            type="button"
            className="av2-btn-secundario"
            onClick={ciclarOrden}
            title={`Ordenar por ${ordenActivo.label.toLowerCase()} (click: siguiente criterio)`}
          >
            <ArrowUpDown size={14} strokeWidth={2} aria-hidden />
            {ordenActivo.label}
          </button>
        )}

        {/* [v3.2] Agrupamiento en la primera línea, segmented. */}
        {groupSpec && groupSpec.opciones.length > 0 && !compacto && (
          <div className="av2-orden" role="group" aria-label="Agrupar por">
            <Layers size={12} strokeWidth={2} className="av2-orden-icono" aria-hidden />
            {groupSpec.opciones.map((op) => {
              const activo = op.id === groupSpec.activo;
              return (
                <button
                  key={op.id}
                  type="button"
                  className={activo ? 'av2-orden-tab av2-orden-tab--activo' : 'av2-orden-tab'}
                  onClick={() => groupSpec.onGroup(op.id)}
                  aria-pressed={activo}
                  title={`Agrupar por ${op.label.toLowerCase()}`}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
        )}

        {/* [v2.1] Chips numerados de flujo, entre las vistas y las acciones.
            En flujos tipo Mostrador lo usual es steps SIN CTA. */}
        {steps && steps.items.length > 0 && !compacto && (
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

        {secondaryAction && !compacto && <BotonAccion action={secondaryAction} />}
        {/* [v2.1] CTA opcional: sin primaryAction no hay botón primario. */}
        {primaryAction && <BotonAccion action={primaryAction} primario />}
        {/* [v3.3] Pantalla completa: también en compacto — en el teléfono es
            donde más falta hace. */}
        {pantallaCompleta && (
          <button
            type="button"
            className={`av2-btn-secundario av2-btn-icono${pantallaCompleta.activa ? ' av2-btn-icono--activo' : ''}`}
            onClick={pantallaCompleta.onToggle}
            aria-pressed={pantallaCompleta.activa}
            title={pantallaCompleta.activa ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            aria-label={pantallaCompleta.activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {pantallaCompleta.activa ? (
              <Minimize2 size={15} strokeWidth={2} aria-hidden />
            ) : (
              <Maximize2 size={15} strokeWidth={2} aria-hidden />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
