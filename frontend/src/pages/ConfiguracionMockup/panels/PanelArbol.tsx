import React, { useState } from 'react';
import * as LucideIcons from 'lucide-react';

export interface PanelArbolProps {
  tramites: any[]; // The hierarchical data from cargarArbolReal
}

// Component to render dynamic Lucide icons or fallback to path
const DynamicIcon = ({ name, color, size = 15, pathProps = {} }: { name: string, color?: string, size?: number, pathProps?: any }) => {
  // If name is a path command (contains M or m), render a raw SVG path
  if (name.includes('M') || name.includes('m')) {
    return <path d={name} stroke={color || "currentColor"} {...pathProps} />;
  }
  // Otherwise try to find it in Lucide
  const Icon = (LucideIcons as any)[name] || LucideIcons.FileText;
  return <Icon color={color || "currentColor"} size={size} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />;
};

export default function PanelArbol({ tramites }: PanelArbolProps) {
  // State for expanded nodes. Store node IDs.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderPrerrequisito = (req: any, idx: number) => (
    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', paddingLeft: '116px', background: '#FAFBFA', borderBottom: '1px solid rgba(13,20,18,0.05)', minWidth: 0 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '6px', background: '#F4F7F6', flex: '0 0 22px' }}>
        <LucideIcons.FileCheck size={12} color="#7A8783" />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '12.5px', color: '#3D4945' }}>{req.nombre || 'Documento requerido'}</span>
        {req.obligatorio && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, color: '#E5484D', background: '#FEECEB', padding: '1px 6px', borderRadius: '4px' }}>Obligatorio</span>}
      </span>
      <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '7px', cursor: 'pointer', flex: '0 0 28px' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F7F6'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <LucideIcons.Pencil size={12} color="#98A3A0" />
      </span>
    </div>
  );

  const renderTramite = (t: any) => {
    const id = `t-${t.id}`;
    const isExpanded = !!expanded[id];
    const mBg = t.modo === 'turno' ? '#E8F1FE' : (t.modo === 'online' ? '#E7F6F0' : '#FDF1DF');
    const mCol = t.modo === 'turno' ? '#1D6FD1' : (t.modo === 'online' ? '#00794F' : '#B4560F');
    const mLabel = t.modo === 'turno' ? 'Con turno' : (t.modo === 'online' ? '100% online' : 'Sin turno');

    return (
      <React.Fragment key={id}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', paddingLeft: '72px', background: isExpanded ? '#FAFBFA' : '#FFFFFF', borderBottom: '1px solid rgba(13,20,18,0.05)', cursor: 'pointer', minWidth: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '16px', flex: '0 0 16px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#98A3A0" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
          </span>
          <span style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', background: `${t.color}15`, flex: '0 0 28px' }}>
            {t.glifo && !t.glifo.includes('M') && !t.glifo.includes('m') ? (
              <DynamicIcon name={t.glifo} color={t.color} size={15} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={t.glifo} /></svg>
            )}
          </span>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D1412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nombre}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', borderRadius: '6px', background: mBg, fontSize: '10.5px', fontWeight: 600, color: mCol, whiteSpace: 'nowrap' }}>{mLabel}</span>
          </span>
          <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', cursor: 'pointer', flex: '0 0 32px' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F7F6'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <LucideIcons.Pencil size={15} color="#7A8783" />
          </span>
        </div>

        {isExpanded && (t.prerrequisitos || []).map((req: any, idx: number) => renderPrerrequisito(req, idx))}
        
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', paddingLeft: '116px', background: '#FAFBFA', borderBottom: '1px solid rgba(13,20,18,0.05)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px dashed #DCE1E0', background: '#FFFFFF' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F7F6'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}>
              <LucideIcons.Plus size={14} color="#5B6764" />
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#5B6764' }}>Nuevo prerrequisito</span>
            </span>
          </div>
        )}
      </React.Fragment>
    );
  };

  const renderCategoria = (cat: any, isLast: boolean) => {
    const id = `cat-${cat.id}`;
    const isExpanded = !!expanded[id];
    
    return (
      <React.Fragment key={id}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', paddingLeft: '48px', background: isExpanded ? '#FAFBFA' : '#FFFFFF', borderBottom: '1px solid rgba(13,20,18,0.05)', cursor: 'pointer', minWidth: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '16px', flex: '0 0 16px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#98A3A0" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
          </span>
          <span style={{ display: 'grid', placeItems: 'center', width: '26px', height: '26px', borderRadius: '8px', background: '#F4F7F6', flex: '0 0 26px' }}>
            <LucideIcons.Folder size={14} color="#5B6764" />
          </span>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#3D4945' }}>{cat.nombre}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', background: '#E8ECEA', borderRadius: '999px', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#5B6764' }}>{cat.tramites?.length || 0} tipos</span>
            </span>
          </span>
          <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', cursor: 'pointer', flex: '0 0 32px' }}>
            <LucideIcons.Pencil size={15} color="#7A8783" />
          </span>
        </div>
        
        {isExpanded && (cat.tramites || []).map((t: any) => renderTramite(t))}
        
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', paddingLeft: '84px', background: '#FAFBFA', borderBottom: '1px solid rgba(13,20,18,0.05)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px dashed #9BDCC4', background: '#FFFFFF' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#F2FBF7'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}>
              <LucideIcons.Plus size={14} color="#00794F" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#00794F' }}>Nuevo tipo de trámite en {cat.nombre}</span>
            </span>
          </div>
        )}
      </React.Fragment>
    );
  };

  const renderDependencia = (dep: any) => {
    const id = `dep-${dep.id}`;
    const isExpanded = !!expanded[id];
    const numCats = dep.hijos?.length || 0;
    const numTrams = dep.hijos?.reduce((acc: number, c: any) => acc + (c.tramites?.length || 0), 0) || 0;

    return (
      <React.Fragment key={id}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: isExpanded ? '#FDF1DF' : '#FFFFFF', borderBottom: '1px solid rgba(13,20,18,0.05)', cursor: 'pointer', minWidth: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '16px', flex: '0 0 16px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#98A3A0" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
          </span>
          <span style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '10px', background: '#FCE7CD', flex: '0 0 32px' }}>
            <LucideIcons.Landmark size={16} color="#D97706" />
          </span>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0D1412' }}>{dep.nombre}</span>
            <span style={{ fontSize: '11px', color: '#7A8783' }}>{numCats} categoría{numCats !== 1 ? 's' : ''} · {numTrams} tipo{numTrams !== 1 ? 's' : ''}</span>
          </span>
          {/* Read-only: No edit button for Dependencia */}
        </div>

        {isExpanded && (dep.hijos || []).map((cat: any, idx: number) => renderCategoria(cat, idx === dep.hijos.length - 1))}
        
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', paddingLeft: '48px', background: '#FFFFFF', borderBottom: '1px solid rgba(13,20,18,0.05)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px dashed #9BDCC4', background: '#FFFFFF' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#F2FBF7'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}>
              <LucideIcons.Plus size={14} color="#00794F" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#00794F' }}>Nueva categoría en {dep.nombre}</span>
            </span>
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ marginTop: '0px' }}>
      {/* TREE CONTENT */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
        {tramites.map((dep: any) => renderDependencia(dep))}
        
        {tramites.length > 0 && (
          <div style={{ padding: '16px', background: '#FAFBFA', display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: '11.5px', color: '#98A3A0' }}>Los dos catálogos anidados: cada categoría con sus tipos, y cada tipo con lo que le pide al vecino.</span>
          </div>
        )}
      </div>
    </div>
  );
}
