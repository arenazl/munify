/**
 * MainTabs — la fila de grupos de Configuración (General, Personal, …).
 *
 * Presentacional puro. Estilos por clases `config-*` sobre tokens --pl-*:
 * cero colores acá adentro, así sigue los dos modos y los 6 fondos solo.
 */

export interface MainTabItem {
  id: string;
  label: string;
  n: number | string;
  isActive: boolean;
}

interface MainTabsProps {
  tabs: MainTabItem[];
  onTabClick: (id: string) => void;
}

export default function MainTabs({ tabs, onTabClick }: MainTabsProps) {
  return (
    <div className="config-maintabs">
      <div className="config-maintabs-pista">
        <div className="config-maintabs-scroll" role="tablist" aria-label="Grupos de configuración">
          {tabs.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.isActive}
              onClick={() => onTabClick(m.id)}
              className={`config-maintab${m.isActive ? ' config-maintab--activo' : ''}`}
            >
              <span className="config-maintab-label">{m.label}</span>
              {m.n !== '' && m.n !== undefined && <span className="config-maintab-n">{m.n}</span>}
            </button>
          ))}
        </div>
        <span className="config-maintabs-fade" aria-hidden />
      </div>
    </div>
  );
}
