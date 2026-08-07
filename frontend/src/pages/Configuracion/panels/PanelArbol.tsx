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
    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', paddingLeft: '116px', background: 'var(--pl-surface-2)', borderBottom: '1px solid var(--pl-border)', minWidth: 0 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '6px', background: 'var(--pl-surface-2)', flex: '0 0 22px' }}>
        <LucideIcons.FileCheck size={12} color="var(--pl-text-muted)" />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: '12.5px', color: 'var(--pl-text-2)' }}>{req.nombre || 'Documento requerido'}</span>
        {req.obligatorio && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--pl-red-700)', background: 'color-mix(in srgb, var(--pl-red-700) 10%, transparent)', padding: '1px 6px', borderRadius: '4px' }}>Obligatorio</span>}
      </span>
      <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '7px', cursor: 'pointer', flex: '0 0 28px' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <LucideIcons.Pencil size={12} color="var(--pl-text-faint)" />
      </span>
    </div>
  );

  const renderTramite = (t: any) => {
    const id = `t-${t.id}`;
    const isExpanded = !!expanded[id];
    const mBg = t.modo === 'turno' ? '#E8F1FE' : (t.modo === 'online' ? 'var(--pl-green-050)' : '#FDF1DF');
    const mCol = t.modo === 'turno' ? '#1D6FD1' : (t.modo === 'online' ? 'var(--pl-green-700)' : 'var(--pl-amber-strong)');
    const mLabel = t.modo === 'turno' ? 'Con turno' : (t.modo === 'online' ? '100% online' : 'Sin turno');

    return (
      <React.Fragment key={id}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', paddingLeft: '72px', background: isExpanded ? 'var(--pl-surface-2)' : 'var(--pl-surface)', borderBottom: '1px solid var(--pl-border)', cursor: 'pointer', minWidth: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '16px', flex: '0 0 16px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-faint)" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
          </span>
          <span style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', background: `${t.color}15`, flex: '0 0 28px' }}>
            {t.glifo && !t.glifo.includes('M') && !t.glifo.includes('m') ? (
              <DynamicIcon name={t.glifo} color={t.color} size={15} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={t.glifo} /></svg>
            )}
          </span>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nombre}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', borderRadius: '6px', background: mBg, fontSize: '10.5px', fontWeight: 600, color: mCol, whiteSpace: 'nowrap' }}>{mLabel}</span>
          </span>
          <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', cursor: 'pointer', flex: '0 0 32px' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <LucideIcons.Pencil size={15} color="var(--pl-text-muted)" />
          </span>
        </div>

        {isExpanded && (t.prerrequisitos || []).map((req: any, idx: number) => renderPrerrequisito(req, idx))}
        
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', paddingLeft: '116px', background: 'var(--pl-surface-2)', borderBottom: '1px solid var(--pl-border)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px dashed var(--pl-border-strong)', background: 'var(--pl-surface)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; }}>
              <LucideIcons.Plus size={14} color="var(--pl-text-2)" />
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pl-text-2)' }}>Nuevo prerrequisito</span>
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
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', paddingLeft: '48px', background: isExpanded ? 'var(--pl-surface-2)' : 'var(--pl-surface)', borderBottom: '1px solid var(--pl-border)', cursor: 'pointer', minWidth: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '16px', flex: '0 0 16px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-faint)" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
          </span>
          <span style={{ display: 'grid', placeItems: 'center', width: '26px', height: '26px', borderRadius: '8px', background: 'var(--pl-surface-2)', flex: '0 0 26px' }}>
            <LucideIcons.Folder size={14} color="var(--pl-text-2)" />
          </span>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pl-text-2)' }}>{cat.nombre}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', background: 'var(--pl-surface-3)', borderRadius: '999px', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--pl-text-2)' }}>{cat.tramites?.length || 0} tipos</span>
            </span>
          </span>
          <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', cursor: 'pointer', flex: '0 0 32px' }}>
            <LucideIcons.Pencil size={15} color="var(--pl-text-muted)" />
          </span>
        </div>
        
        {isExpanded && (cat.tramites || []).map((t: any) => renderTramite(t))}
        
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', paddingLeft: '84px', background: 'var(--pl-surface-2)', borderBottom: '1px solid var(--pl-border)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px dashed var(--pl-green-200)', background: 'var(--pl-surface)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-green-050)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; }}>
              <LucideIcons.Plus size={14} color="var(--pl-green-700)" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pl-green-700)' }}>Nuevo tipo de trámite en {cat.nombre}</span>
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
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: isExpanded ? '#FDF1DF' : 'var(--pl-surface)', borderBottom: '1px solid var(--pl-border)', cursor: 'pointer', minWidth: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '16px', flex: '0 0 16px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-faint)" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'transform 200ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="m9 6 6 6-6 6" /></svg>
          </span>
          <span style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '10px', background: 'color-mix(in srgb, var(--pl-amber-strong) 18%, transparent)', flex: '0 0 32px' }}>
            <LucideIcons.Landmark size={16} color="var(--pl-amber-strong)" />
          </span>
          <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pl-text)' }}>{dep.nombre}</span>
            <span style={{ fontSize: '11px', color: 'var(--pl-text-muted)' }}>{numCats} categoría{numCats !== 1 ? 's' : ''} · {numTrams} tipo{numTrams !== 1 ? 's' : ''}</span>
          </span>
          {/* Read-only: No edit button for Dependencia */}
        </div>

        {isExpanded && (dep.hijos || []).map((cat: any, idx: number) => renderCategoria(cat, idx === dep.hijos.length - 1))}
        
        {isExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', paddingLeft: '48px', background: 'var(--pl-surface)', borderBottom: '1px solid var(--pl-border)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px dashed var(--pl-green-200)', background: 'var(--pl-surface)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-green-050)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; }}>
              <LucideIcons.Plus size={14} color="var(--pl-green-700)" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pl-green-700)' }}>Nueva categoría en {dep.nombre}</span>
            </span>
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ marginTop: '0px' }}>
      {/* TREE CONTENT */}
      <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', overflow: 'hidden' }}>
        {tramites.map((dep: any) => renderDependencia(dep))}
        
        {tramites.length > 0 && (
          <div style={{ padding: '16px', background: 'var(--pl-surface-2)', display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--pl-text-faint)' }}>Los dos catálogos anidados: cada categoría con sus tipos, y cada tipo con lo que le pide al vecino.</span>
          </div>
        )}
      </div>
    </div>
  );
}
