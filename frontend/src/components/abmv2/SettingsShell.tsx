/**
 * SettingsShell — página de AJUSTES del estándar v2.
 *
 * Implementa "Configuracion.dc.html" (canvas Claude Design, 2026-08-03).
 * Es la hermana de `SemanticAbmPage`: donde aquella resuelve LISTADOS, esta
 * resuelve la navegación de TRES niveles de un módulo de configuración.
 *
 *   <PageHeader>                       ← eyebrow + H1 + bajada (pieza del kit)
 *   [ buscador de ajustes ]            ← filtra grupos e ítems a la vez
 *   [ grupos ]                         ← "padres": barra horizontal con contador
 *   ┌──────────┬──────────────────────┐
 *   │ riel     │ título + veredicto   │ ← "hijos" del grupo activo
 *   │ (hijos)  │ + CTA + {children}   │
 *   └──────────┴──────────────────────┘
 *
 * El PANEL no lo dibuja este componente: lo recibe por `children`. Así el
 * consumidor mete adentro lo que corresponda —un `SemanticAbmPage` para un
 * catálogo, un formulario, un árbol— sin que el shell sepa nada de ese
 * contenido. Es el mismo contrato de composición del resto del kit.
 *
 * Reglas del estándar que implementa:
 *  - Polimórfico: cero hex inline. Todo sale de tokens `--pl-*` vía clases
 *    `av2-set-*` en abmv2.css. Los únicos inline permitidos serían valores de
 *    runtime que vengan de datos (hoy no hay ninguno).
 *  - Un solo CTA primario por panel (`primaryAction`), igual que ListToolbar.
 *  - El `veredicto` es transversal al kit: el panel puede declarar
 *    'bueno' | 'advertencia' | 'malo' y el CSS lo traduce por `--pl-tono`.
 *    Si no aplica, se omite y cae al acento del theme.
 *  - Los contadores (`count`) los precomputa la página, igual que los grupos
 *    del DataTable: el shell sólo pinta.
 *  - Estados vacíos: sin ítems, el riel no se renderiza y el panel ocupa todo.
 */
import type { ReactNode } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { PageHeader } from './PageHeader';
import type { Veredicto } from '../../lib/semanticHero';

/** "Padre": grupo de ajustes (Municipio, Personal, Operación…). */
export interface SettingsGroup {
  id: string;
  label: string;
  /** Cuántos ajustes tiene adentro. Lo cuenta la página. */
  count?: number;
}

/** "Hijo": un ajuste concreto dentro del grupo activo. */
export interface SettingsItem {
  id: string;
  label: string;
  /** Cuántas filas tiene ese catálogo. Lo cuenta la página. */
  count?: number;
  /** Marca de atención sobre el ítem (ej: sin configurar). */
  veredicto?: Veredicto;
}

export interface SettingsShellProps {
  eyebrow: string;
  title: string;
  description?: string;

  /** Buscador de ajustes. Sin `onSearchChange` no se renderiza. */
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;

  groups: SettingsGroup[];
  activeGroup: string;
  onGroupChange: (id: string) => void;

  /** Título del riel de hijos (normalmente el label del grupo activo). */
  railTitle?: string;
  items: SettingsItem[];
  activeItem?: string;
  onItemChange: (id: string) => void;

  /** Cabecera del panel derecho. */
  panelTitle: string;
  /**
   * Nota destacada del panel (patrón del canvas: barra de color a la
   * izquierda + lavado). Para explicar qué es el ajuste o avisar algo antes
   * de que el usuario toque nada.
   */
  panelAviso?: { eyebrow?: string; texto: ReactNode; tono?: 'ok' | 'alerta' | 'malo' };
  /** Bajada del panel: qué es y cómo está. Acepta veredicto. */
  panelNota?: string;
  panelVeredicto?: Veredicto;
  primaryAction?: { label: string; onClick: () => void };

  /** El panel en sí: SemanticAbmPage, formulario, árbol, lo que sea. */
  children: ReactNode;
}

export function SettingsShell({
  eyebrow, title, description,
  search, onSearchChange, searchPlaceholder = 'Buscar un ajuste…',
  groups, activeGroup, onGroupChange,
  railTitle, items, activeItem, onItemChange,
  panelTitle, panelNota, panelVeredicto, panelAviso, primaryAction,
  children,
}: SettingsShellProps) {
  return (
    <div className="av2-set">
      <div className="av2-set-cab">
        <div className="av2-set-cab-txt">
          <PageHeader eyebrow={eyebrow} title={title} description={description} />
        </div>
        {onSearchChange && (
          <label className="av2-set-buscador">
            <Search className="av2-set-buscador-ico" aria-hidden />
            <input
              type="search"
              className="av2-set-buscador-input"
              placeholder={searchPlaceholder}
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <span className="av2-set-buscador-kbd">⌘K</span>
          </label>
        )}
      </div>

      {/* Grupos ("padres"). Segmented horizontal, mismo lenguaje que los
          statusTabs de la FilterBar. */}
      <div className="av2-set-grupos" role="tablist">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === activeGroup}
            className={`av2-set-grupo ${g.id === activeGroup ? 'av2-set-grupo--activo' : ''}`}
            onClick={() => onGroupChange(g.id)}
          >
            {g.label}
            {g.count !== undefined && <span className="av2-set-grupo-n">{g.count}</span>}
          </button>
        ))}
      </div>

      <div className={`av2-set-cuerpo ${items.length === 0 ? 'av2-set-cuerpo--sin-riel' : ''}`}>
        {items.length > 0 && (
          <aside className="av2-set-riel">
            {railTitle && <span className="av2-set-riel-titulo">{railTitle}</span>}
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                className={[
                  'av2-set-item',
                  it.id === activeItem ? 'av2-set-item--activo' : '',
                  it.veredicto ? `av2-set-item--${it.veredicto}` : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onItemChange(it.id)}
              >
                <span className="av2-set-item-label">{it.label}</span>
                {it.count !== undefined && <span className="av2-set-item-n">{it.count}</span>}
              </button>
            ))}
          </aside>
        )}

        <section className={`av2-set-panel ${panelVeredicto ? `av2-set-panel--${panelVeredicto}` : ''}`}>
          <div className="av2-set-panel-cab">
            <div className="av2-set-panel-txt">
              <h2 className="av2-set-panel-titulo">{panelTitle}</h2>
              {panelNota && <p className="av2-set-panel-nota">{panelNota}</p>}
            </div>
            {primaryAction && (
              <button type="button" className="av2-set-cta" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </button>
            )}
          </div>
          <div className="av2-set-panel-cuerpo">
            {panelAviso && (
              <div className={`av2-nota av2-nota--${panelAviso.tono ?? 'ok'}`}>
                <Sparkles className="av2-nota-ico" aria-hidden />
                <span className="av2-nota-txt">
                  {panelAviso.eyebrow && <span className="av2-nota-eyebrow">{panelAviso.eyebrow}</span>}
                  {panelAviso.texto}
                </span>
              </div>
            )}
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
