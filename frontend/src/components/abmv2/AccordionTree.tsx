import React, { useState } from 'react';
import { ChevronRight, Folder, FileCheck, CircleParking, Info, Plus } from 'lucide-react';
import type { FilaSpec } from '../../../config/canvasAbmSpec';

// A simple Switch component placeholder, replace with your actual Switch component if you have one.
const Switch = ({ checked, onCheckedChange }: { checked: boolean, onCheckedChange: (c: boolean) => void }) => (
  <div 
    onClick={() => onCheckedChange(!checked)}
    style={{ 
      width: '32px', height: '18px', borderRadius: '9px', 
      background: checked ? '#00B37E' : '#D5DDDA', 
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s' 
    }}
  >
    <div style={{ 
      position: 'absolute', top: '2px', left: checked ? '16px' : '2px', 
      width: '14px', height: '14px', borderRadius: '7px', 
      background: '#FFF', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 0.2s' 
    }} />
  </div>
);

export interface AccordionTreeProps {
  data: FilaSpec[];
}

export function AccordionTree({ data }: AccordionTreeProps) {
  const [agruparDep, setAgruparDep] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const IconMap: Record<string, React.ReactNode> = {
    Folder: <Folder size={15} strokeWidth={1.5} color="#5B6764" />,
    FileCheck: <FileCheck size={15} strokeWidth={1.5} color="#5B6764" />,
    CircleParking: <CircleParking size={15} strokeWidth={1.5} color="#5B6764" />,
    Info: <Info size={15} strokeWidth={1.5} color="#5B6764" />,
  };

  const getLucideIcon = (name?: string, def = 'Folder') => {
    return IconMap[name || def] || IconMap[def];
  };

  const renderPrerequisito = (pre: any, pIdx: number, arr: any[]) => (
    <div key={pIdx} style={{ display: 'flex', alignItems: 'center', height: '40px', paddingLeft: '42px', borderBottom: pIdx === arr.length - 1 ? 'none' : '1px solid rgba(13,20,18,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#5B6764' }}>{pre.n || pre.nombre}</span>
        {pre.obligatorio && (
          <span style={{ fontSize: '10px', background: '#FDECEC', color: '#E5484D', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Obligatorio</span>
        )}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
        <span style={{ cursor: 'pointer', padding: '4px' }}><Info size={14} color="#9AA5A1" /></span>
      </div>
    </div>
  );

  const renderTramite = (t: FilaSpec, tIdx: number, arr: any[]) => {
    const id = `t-${t.n}`;
    const isExpanded = !!expanded[id];
    const prerequisitos = t.hijos || [];
    
    return (
      <div key={id} style={{ display: 'flex', flexDirection: 'column', borderBottom: tIdx === arr.length - 1 ? 'none' : '1px solid rgba(13,20,18,0.06)' }}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', height: '44px', paddingLeft: '24px', cursor: prerequisitos.length > 0 ? 'pointer' : 'default' }}>
          {prerequisitos.length > 0 ? (
            <ChevronRight size={14} color="#9AA5A1" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', marginRight: '8px' }} />
          ) : (
            <div style={{ width: '22px' }} />
          )}
          <span style={{ display: 'grid', placeItems: 'center', width: '24px', height: '24px', borderRadius: '6px', background: '#F3F7F5', marginRight: '10px' }}>
            {getLucideIcon(t.gl, 'FileCheck')}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#0D1412' }}>{t.n}</span>
            {t.s && <span style={{ fontSize: '11px', color: '#98A3A0' }}>{t.s}</span>}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', paddingRight: '12px' }}>
          </div>
        </div>
        
        {isExpanded && prerequisitos.length > 0 && (
          <div style={{ background: '#FAFBFA', padding: '4px 0 4px 44px' }}>
            {prerequisitos.map((pre, pIdx) => renderPrerequisito(pre, pIdx, prerequisitos))}
            <div style={{ display: 'flex', alignItems: 'center', height: '36px', paddingLeft: '42px', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#00B37E', fontWeight: 500, border: '1px dashed #00B37E', padding: '4px 8px', borderRadius: '6px' }}>
                <Plus size={14} /> Nuevo prerrequisito
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCategoria = (cat: FilaSpec, isLast: boolean) => {
    const id = `cat-${cat.n}`;
    const isExpanded = !!expanded[id];
    const tramites = cat.hijos || [];
    
    return (
      <React.Fragment key={id}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', height: '52px', padding: '0 16px', borderBottom: isExpanded ? '1px solid rgba(13,20,18,0.06)' : isLast ? 'none' : '1px solid rgba(13,20,18,0.06)', cursor: 'pointer', background: '#FFFFFF' }}>
          <ChevronRight size={16} color="#9AA5A1" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', marginRight: '12px' }} />
          <span style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '8px', background: cat.t || '#FDF1DF', marginRight: '12px' }}>
            {getLucideIcon(cat.gl, 'Folder')}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0D1412' }}>{cat.n}</span>
            <span style={{ fontSize: '12px', color: '#7A8783' }}>{tramites.length} tipos</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ background: '#FFFFFF', borderBottom: isLast ? 'none' : '1px solid rgba(13,20,18,0.06)' }}>
            {tramites.map((t, tIdx) => renderTramite(t, tIdx, tramites))}
          </div>
        )}
      </React.Fragment>
    );
  };

  const renderDependencia = (dep: FilaSpec, isLast: boolean) => {
    const id = `dep-${dep.n}`;
    const isExpanded = expanded[id] ?? true;
    const categorias = dep.hijos || [];
    
    return (
      <div key={id} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(13,20,18,0.08)' }}>
        <div onClick={() => toggleExpand(id)} style={{ display: 'flex', alignItems: 'center', height: '48px', padding: '0 16px', background: '#FAFBFA', borderBottom: '1px solid rgba(13,20,18,0.05)', cursor: 'pointer' }}>
          <ChevronRight size={16} color="#9AA5A1" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', marginRight: '8px' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#5B6764', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {dep.n}
          </span>
        </div>
        {isExpanded && (
          <div style={{ paddingLeft: '12px' }}>
            {categorias.map((cat, idx) => renderCategoria(cat, idx === categorias.length - 1))}
          </div>
        )}
      </div>
    );
  };

  // Logic for grouping/flattening based on toggle
  const isDataGroupedByDep = data.some(d => d.hijos && d.hijos.some(c => c.hijos));
  
  let renderData = data;
  if (!agruparDep && isDataGroupedByDep) {
    // Flatten dependencias into just categorias
    renderData = data.flatMap(dep => dep.hijos || []);
  }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(13,20,18,0.08)', background: '#FAFBFA' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Switch checked={agruparDep} onCheckedChange={setAgruparDep} />
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#3D4945' }}>Agrupar por dependencia</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <span onClick={() => setExpanded({})} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, color: '#5B6764', cursor: 'pointer', padding: '4px 8px', border: '1px solid rgba(13,20,18,0.1)', borderRadius: '6px' }}>
            + Expandir todo
          </span>
        </div>
      </div>

      <div>
        {renderData.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#98A3A0', fontSize: '13px' }}>No hay elementos para mostrar</div>
        ) : agruparDep && isDataGroupedByDep ? (
          renderData.map((dep, idx) => renderDependencia(dep, idx === renderData.length - 1))
        ) : (
          renderData.map((cat, idx) => renderCategoria(cat, idx === renderData.length - 1))
        )}
      </div>
    </div>
  );
}
