import React from 'react';

export interface FiltroSelect {
  id: string;
  label: string;
  valor: string;
}

export interface EstadoFiltro {
  id: string;
  label: string;
  n: number | string;
  col: string;
  sub: string;
  bd: string;
  bg: string;
}

export interface FilaCatalogo {
  id: string;
  nombre: string;
  desc?: string;
  colorNombre: string;
  tinte: string;
  color: string;
  glifo: string;
  sePisa?: boolean;
  tituloPisa?: string;
  sla?: string;
  puntos?: { id: string; bg: string }[];
  prioLabel?: string;
  uso: number | string;
  usoCol: string;
  usoNota: string;
  nota?: string;
  estado: string;
  estadoCol?: string;
  pistaBg: string;
  perilla: string;
  fondo: string;
  orden?: number;
  opTarjeta?: number;
  colBorrar?: string;
  cursorBorrar?: string;
  opBorrar?: number;
  tituloBorrar?: string;
}

interface PanelCatalogoProps {
  buscarCat: string;
  filtrosSelect: FiltroSelect[];
  estados: EstadoFiltro[];
  modoActual: 'tabla' | 'tarjetas';
  filas: FilaCatalogo[];
  cols: string;
  colRespuesta: string;
  pie: string;
  resumenFiltro: string;
  labelOrden: string;
  colOrden: string;
  bgOrden: string;
  bdOrden: string;
  bgTabla: string;
  shTabla: string;
  colTabla: string;
  bgTarjetas: string;
  shTarjetas: string;
  colTarjetas: string;
  onViewChange: (view: 'tabla' | 'tarjetas') => void;
  onFiltroClick: (id: string) => void;
  onEstadoClick: (id: string) => void;
  onReordenar: () => void;
  onAlternarFila: (id: string) => void;
  onEditarFila: (id: string) => void;
}

export default function PanelCatalogo({
  buscarCat, filtrosSelect, estados, modoActual, filas, cols, colRespuesta,
  pie, resumenFiltro, labelOrden, colOrden, bgOrden, bdOrden,
  bgTabla, shTabla, colTabla, bgTarjetas, shTarjetas, colTarjetas,
  onViewChange, onFiltroClick, onEstadoClick, onReordenar, onAlternarFila, onEditarFila
}: PanelCatalogoProps) {
  const modoTabla = modoActual === 'tabla';
  const modoTarjetas = modoActual === 'tarjetas';

  return (
    <div className="entrar-panel" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', rowGap: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', minWidth: 0, height: '36px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '10px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA5A1" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 15px' }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span style={{ fontSize: '12.5px', color: '#9AA5A1', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{buscarCat}</span>
        </span>
        {filtrosSelect.map(sl => (
          <span 
            key={sl.id}
            onClick={() => onFiltroClick(sl.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9BDCC4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(13,20,18,0.12)'; }}
          >
            <span style={{ fontSize: '12.5px', color: '#7A8783' }}>{sl.label}</span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0D1412' }}>{sl.valor}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7A8783" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 13px' }}>
              <path d="m7 9 5 5 5-5" />
            </svg>
          </span>
        ))}
        <span style={{ display: 'flex', gap: '2px', padding: '3px', background: '#E8ECEA', borderRadius: '10px', flex: '0 0 auto' }}>
          <span onClick={() => onViewChange('tabla')} title="Tabla" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '30px', borderRadius: '7px', background: bgTabla, boxShadow: shTabla, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colTabla} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 10h18M9 10v9" />
            </svg>
          </span>
          <span onClick={() => onViewChange('tarjetas')} title="Tarjetas" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '30px', borderRadius: '7px', background: bgTarjetas, boxShadow: shTarjetas, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colTarjetas} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="8" height="8" rx="2" />
              <rect x="13" y="3" width="8" height="8" rx="2" />
              <rect x="3" y="13" width="8" height="8" rx="2" />
              <rect x="13" y="13" width="8" height="8" rx="2" />
            </svg>
          </span>
        </span>
        <span 
          onClick={onReordenar} 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '36px', padding: '0 13px', border: `1px solid ${bdOrden}`, borderRadius: '10px', background: bgOrden, cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9BDCC4'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = bdOrden; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colOrden} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 15px' }}>
            <path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: colOrden }}>{labelOrden}</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap', rowGap: '8px' }}>
        {estados.map(e => (
          <span 
            key={e.id}
            onClick={() => onEstadoClick(e.id)} 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '30px', padding: '0 12px', borderRadius: '999px', border: `1px solid ${e.bd}`, background: e.bg, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: e.col }}>{e.label}</span>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: e.sub, fontFeatureSettings: "'tnum'" }}>{e.n}</span>
          </span>
        ))}
      </div>

      {modoTabla && (
        <div style={{ marginTop: '12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ boxSizing: 'border-box', display: 'grid', minWidth: '560px', gridTemplateColumns: cols, alignItems: 'center', gap: '12px', padding: '10px 16px', background: '#FAFBFA', borderBottom: '1px solid rgba(13,20,18,0.06)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>NOMBRE Y DESCRIPCIÓN</span>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>{colRespuesta}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0', textAlign: 'right' }}>EN USO</span>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0', textAlign: 'right' }}>ESTADO Y ACCIONES</span>
          </div>

          {filas.map((r, i) => {
            const id = r.id || `f-${i}`;
            const colorNombre = r.colorNombre || '#0D1412';
            const tinte = r.tinte || (r.color ? `${r.color}20` : '#E8ECEA');
            const color = r.color || '#3D4945';
            const glifo = r.glifo || 'm7 9 5 5 5-5';
            const pistaBg = r.pistaBg || '#E8ECEA';
            const perilla = r.perilla || '#FFFFFF';
            const fondo = r.fondo || '#FFFFFF';
            const usoCol = r.usoCol || '#0D1412';
            const usoNota = r.usoNota || r.nota || '';
            const estado = r.estado || 'Activo';

            return (
            <div 
              key={id}
              style={{ boxSizing: 'border-box', display: 'grid', minWidth: '560px', gridTemplateColumns: cols, alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: '1px solid rgba(13,20,18,0.05)', background: fondo }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFA'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = fondo; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                <span title="Arrastrá para reordenar" style={{ display: 'grid', placeItems: 'center', width: '24px', overflow: 'hidden', cursor: 'grab', opacity: 1, flex: '0 0 24px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C6CFCB" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                  </svg>
                </span>
                <span style={{ display: 'grid', placeItems: 'center', width: '30px', height: '30px', borderRadius: '9px', background: tinte, flex: '0 0 30px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={glifo} /></svg>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flexWrap: 'wrap', rowGap: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: colorNombre }}>{r.nombre}</span>
                    {r.sePisa && (
                      <span title={r.tituloPisa} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '18px', padding: '0 7px', background: '#FDF1DF', borderRadius: '999px', flex: '0 0 auto', cursor: 'help' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4560F" strokeWidth="2.4" strokeLinecap="round"><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></svg>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#B4560F' }}>se pisa</span>
                      </span>
                    )}
                  </span>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '11px', lineHeight: 1.4, color: '#98A3A0', marginTop: '3px' }}>{r.desc}</span>
                </span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#0D1412', whiteSpace: 'nowrap' }}>{r.sla}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  {r.puntos?.map(p => (
                    <span key={p.id} style={{ width: '6px', height: '6px', borderRadius: '999px', background: p.bg }}></span>
                  ))}
                  <span style={{ fontSize: '10.5px', color: '#98A3A0', marginLeft: '3px', whiteSpace: 'nowrap' }}>{r.prioLabel}</span>
                </span>
              </span>
              <span style={{ textAlign: 'right', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#0D1412', fontFeatureSettings: "'tnum'" }}>{r.uso}</span>
                <span style={{ display: 'block', fontSize: '12.5px', color: usoCol }}>{usoNota}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                <span 
                  onClick={() => onAlternarFila(r.id)} 
                  title={estado} 
                  style={{ position: 'relative', width: '32px', height: '18px', borderRadius: '999px', background: pistaBg, flex: '0 0 32px', cursor: 'pointer', transition: 'background 160ms cubic-bezier(0.2,0.8,0.2,1)' }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: perilla, width: '14px', height: '14px', borderRadius: '999px', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(13,20,18,0.2)', transition: 'left 160ms cubic-bezier(0.2,0.8,0.2,1)' }}></span>
                </span>
                <span 
                  onClick={() => onEditarFila(r.id)} 
                  title="Editar" 
                  style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EF'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7A8783" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L20 8l-4-4L4 16z" /></svg>
                </span>
                <span 
                  title={r.tituloBorrar || 'Borrar'} 
                  style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: r.cursorBorrar || 'pointer', opacity: r.opBorrar ?? 1 }}
                  onMouseEnter={(e) => { if (r.cursorBorrar !== 'not-allowed') e.currentTarget.style.background = '#FDF4F4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={r.colBorrar || '#D97373'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1zM6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" /></svg>
                </span>
              </span>
            </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#FAFBFA', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', color: '#7A8783' }}>{pie}</span>
            <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#98A3A0', whiteSpace: 'nowrap' }}>{resumenFiltro}</span>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Exportar</a>
          </div>
        </div>
      )}

      {modoTarjetas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {filas.map((r, i) => {
            const id = r.id || `t-${i}`;
            const colorNombre = r.colorNombre || '#0D1412';
            const tinte = r.tinte || (r.color ? `${r.color}20` : '#E8ECEA');
            const color = r.color || '#3D4945';
            const glifo = r.glifo || 'm7 9 5 5 5-5';
            const pistaBg = r.pistaBg || '#E8ECEA';
            const perilla = r.perilla || '#FFFFFF';
            const fondo = r.fondo || '#FFFFFF';
            const usoCol = r.usoCol || '#0D1412';
            const usoNota = r.usoNota || r.nota || '';
            const estado = r.estado || 'Activo';

            return (
            <div key={id} style={{ boxSizing: 'border-box', padding: '16px', background: fondo, border: '1px solid rgba(13,20,18,0.08)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', opacity: r.opTarjeta ?? 1 }}>
              <span onClick={() => onEditarFila(id)} title="Editar" style={{ position: 'absolute', top: '14px', right: '14px', display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFA'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D4945" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
              </span>
              
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: '38px', height: '38px', borderRadius: '10px', background: tinte, flex: '0 0 38px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={glifo} /></svg>
                </span>
                <span style={{ minWidth: 0, marginTop: '2px', paddingRight: '24px' }}>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: colorNombre, marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#98A3A0', marginTop: '2px' }}>Orden {r.orden}</span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', marginTop: '14px' }}>
                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '22px', fontWeight: 700, lineHeight: 1, color: usoCol, fontFeatureSettings: "'tnum'" }}>{r.uso}</span>
                <span style={{ fontSize: '11.5px', color: '#98A3A0' }}>{usoNota}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(13,20,18,0.06)' }}>
                <span onClick={() => onAlternarFila(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <span style={{ position: 'relative', width: '32px', height: '18px', borderRadius: '999px', background: pistaBg, flex: '0 0 32px', transition: 'background 160ms cubic-bezier(0.2,0.8,0.2,1)' }}>
                    <span style={{ position: 'absolute', top: '2px', left: perilla, width: '14px', height: '14px', borderRadius: '999px', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(13,20,18,0.2)', transition: 'left 160ms cubic-bezier(0.2,0.8,0.2,1)' }}></span>
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: r.estadoCol || '#0D1412' }}>{estado}</span>
                </span>
                <span 
                  title="Editar" 
                  style={{ marginLeft: 'auto', display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => onEditarFila(id)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EF'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D4945" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                </span>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
