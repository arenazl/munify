import React from 'react';

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
    <div style={{ position: 'sticky', top: 0, zIndex: 8, padding: '20px 20px 0', background: '#F1F4F2', borderBottom: '1px solid rgba(13,20,18,0.08)' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(13,20,18,0.16) transparent' }}>
          {tabs.map(m => {
            const linea = m.isActive ? '#0D1412' : 'transparent';
            const peso = m.isActive ? 600 : 500;
            const color = m.isActive ? '#0D1412' : '#7A8783';
            const subColor = m.isActive ? '#0D1412' : '#98A3A0';

            return (
              <span 
                key={m.id}
                onClick={() => onTabClick(m.id)} 
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: '8px', 
                  height: '38px', padding: '0 13px', 
                  borderBottom: `2px solid ${linea}`, 
                  cursor: 'pointer', whiteSpace: 'nowrap' 
                }}
                onMouseEnter={(e) => {
                  if (!m.isActive) (e.currentTarget.style.background = 'rgba(13,20,18,0.03)');
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: peso, color: color }}>{m.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: subColor, fontFeatureSettings: "'tnum'" }}>{m.n}</span>
              </span>
            );
          })}
        </div>
        <span style={{ position: 'absolute', right: 0, top: 0, bottom: '6px', width: '36px', pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(241,244,242,0) 0%, #F1F4F2 70%)' }}></span>
      </div>
    </div>
  );
}
