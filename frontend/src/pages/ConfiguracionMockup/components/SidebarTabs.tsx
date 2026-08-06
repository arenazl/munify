import React from 'react';

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
    <aside style={{ position: 'sticky', top: '74px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0', padding: '0 10px 8px' }}>
        {tituloRiel}
      </span>
      {tabs.map(h => {
        const bg = h.isActive ? '#E3E9E6' : 'transparent';
        const bgHover = h.isActive ? '#E3E9E6' : 'rgba(13,20,18,0.04)';
        const peso = h.isActive ? 600 : 500;
        const color = h.isActive ? '#0D1412' : '#3D4945';
        const subColor = h.isActive ? '#0D1412' : '#7A8783';

        return (
          <span 
            key={h.id}
            onClick={() => onTabClick(h.id)} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '10px', 
              minHeight: '36px', padding: '7px 10px', 
              borderRadius: '9px', background: bg, 
              cursor: 'pointer' 
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
          >
            <span style={{ fontSize: '13px', fontWeight: peso, lineHeight: 1.35, color: color, minWidth: 0, textWrap: 'pretty' }}>
              {h.label}
            </span>
            {h.n && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: subColor, whiteSpace: 'nowrap', fontFeatureSettings: "'tnum'" }}>
                {h.n}
              </span>
            )}
          </span>
        );
      })}
    </aside>
  );
}
