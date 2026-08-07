/**
 * SidebarTabs — el riel de subpantallas del grupo activo.
 *
 * Presentacional puro, clases `config-riel-*` sobre tokens --pl-*. En pantalla
 * angosta el CSS lo apila arriba en fila envolvente: el grid de dos columnas
 * no entra y el riel no puede comerse el ancho del panel.
 */

export interface SidebarTabItem {
  id: string;
  label: string;
  n?: number | string;
  isActive: boolean;
}

interface SidebarTabsProps {
  tituloRiel: string;
  tabs: SidebarTabItem[];
  onTabClick: (id: string) => void;
}

export default function SidebarTabs({ tituloRiel, tabs, onTabClick }: SidebarTabsProps) {
  return (
    <aside className="config-riel">
      <span className="config-riel-titulo">{tituloRiel}</span>
      {tabs.map((h) => (
        <button
          key={h.id}
          type="button"
          aria-current={h.isActive ? 'page' : undefined}
          onClick={() => onTabClick(h.id)}
          className={`config-riel-item${h.isActive ? ' config-riel-item--activo' : ''}`}
        >
          <span className="config-riel-label">{h.label}</span>
          {!!h.n && <span className="config-riel-n">{h.n}</span>}
        </button>
      ))}
    </aside>
  );
}
