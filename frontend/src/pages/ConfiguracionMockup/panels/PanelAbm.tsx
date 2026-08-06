import React from 'react';

export interface FiltroSelect {
  id?: string;
  label: string;
  valor: string;
}

export interface AbmChip {
  id?: string;
  label: string;
  n: number | string;
  col: string;
  sub: string;
  bd: string;
  bg: string;
  ir?: () => void;
}

export interface AbmHead {
  label: string;
  align: any;
}

export interface AbmCelda {
  esChip?: boolean;
  chipBg?: string;
  chipCol?: string;
  texto?: string;
  esTexto?: boolean;
  just?: string;
  hayPunto?: boolean;
  punto?: string;
  fuente?: string;
  tam?: string;
  peso?: number | string;
  color?: string;
  haySub?: boolean;
  sub?: string;
  subCol?: string;
  align?: any;
}

export interface AbmFila {
  id?: string;
  fondo?: string;
  hayAvatar?: boolean;
  radio?: string;
  tinte?: string;
  hayGlifo?: boolean;
  colorIcono?: string;
  glifo?: string;
  hayIniciales?: boolean;
  iniciales?: string;
  colorNombre?: string;
  nombre: string;
  fuenteSub?: string;
  sub?: string;
  celdas: AbmCelda[];
  editable?: boolean;
  estado?: string;
  pistaBg?: string;
  perilla?: string;
  tituloBorrar?: string;
  cursorBorrar?: string;
  opBorrar?: number;
  colBorrar?: string;
  soloLectura?: boolean;
  alternar?: () => void;
}

export interface PanelAbmProps {
  spec: any;
}

export default function PanelAbm({ spec }: PanelAbmProps) {
  const {
    buscar: abmBuscar, selects: filtrosSelect = [], 
    chips: abmChipsInfo = [],
    min: abmMin, cols: abmCols, heads: abmHeadsInfo = [], filas: abmFilasInfo = [],
    pie: abmPie
  } = spec || {};

  const abmChips = abmChipsInfo.map((x: any, i: number) => ({
    label: x[0], n: x[1], bg: i === 0 ? '#FFFFFF' : '#F6F8F7', bd: i === 0 ? 'rgba(13,20,18,0.18)' : 'rgba(13,20,18,0.07)',
    col: i === 0 ? '#0D1412' : '#3D4945', sub: i === 0 ? '#5B6764' : '#98A3A0'
  }));
  const abmHeads = abmHeadsInfo.length > 0 
    ? abmHeadsInfo.map((h: any) => ({ label: h[0], align: h[1] })) 
    : [];
    
  const sampleFila = abmFilasInfo[0] || {};
  if (abmHeadsInfo.length === 0) {
    if ('uso' in sampleFila) abmHeads.push({ label: 'USO', align: 'right' });
    if ('hs' in sampleFila) abmHeads.push({ label: 'SLA', align: 'right' });
    if ('prio' in sampleFila) abmHeads.push({ label: 'PRIO', align: 'right' });
    if ('nota' in sampleFila) abmHeads.push({ label: 'NOTA', align: 'left' });
  }

  const abmFilas = abmFilasInfo.map((r: any) => {
    let celdas = r.cel || r.celdas;
    if (!celdas && abmHeadsInfo.length === 0) {
      celdas = [];
      if ('uso' in r) celdas.push({ texto: String(r.uso || 0), color: '#0D1412', align: 'right' });
      if ('hs' in r) celdas.push({ texto: r.hs ? `${r.hs}h` : '-', color: '#5B6764', align: 'right' });
      if ('prio' in r) celdas.push({ texto: r.prio ? String(r.prio) : '-', color: '#5B6764', align: 'right' });
      if ('nota' in r) celdas.push({ texto: r.nota || '', color: '#5B6764', align: 'left' });
    }

    const glifo = r.gl || r.glifo || '';
    const iniciales = r.i || r.iniciales || '';
    const color = r.color || r.cc;
    
    // Si viene r.color (ej #00B37E), usamos un fondo grisecito o pastel por defecto
    let tinte = r.t || r.tinte || '#F3F7F5';
    if (!r.t && !r.tinte && color) {
      if (color === '#00B37E') tinte = '#E7F6F0';
      else if (color === '#F59E0B') tinte = '#FDF1DF';
      else if (color === '#3B82F6') tinte = '#E8F1FE';
      else if (color === '#E5484D') tinte = '#FDECEC';
      else if (color === '#8B5CF6') tinte = '#F1EBFE';
      else tinte = '#F3F7F5';
    }

    return {
      nombre: r.n || r.nombre || r.label || '', 
      sub: r.s || r.sub || r.desc || '',
      hayAvatar: true, 
      hayGlifo: !!glifo, 
      glifo, 
      hayIniciales: !glifo, 
      iniciales,
      radio: iniciales && !glifo ? '999px' : '9px', 
      tinte, 
      colorIcono: color || '#0D1412', 
      colorNombre: '#0D1412', 
      fondo: '#FFFFFF',
      celdas: celdas || [], 
      editable: true, 
      estado: 'Activo', 
      pistaBg: '#00B37E', 
      perilla: '16px', 
      colBorrar: '#D5DDDA', 
      opBorrar: 0.5
    };
  });
  const filtrosSelectMapped = filtrosSelect.map((x: any) => ({ label: x[0], valor: x[1] }));
  const hayEdicion = true;
  const modoTabla = true;
  const modoTarjetas = false;
  const onViewChange = (view: 'tabla' | 'tarjetas') => {};
  const onReordenar = () => {};
  const abmResumen = abmFilas.length + ' en pantalla';
  const abmMostrando = 'Mostrando ' + abmFilas.length;

  const bgTabla = '#FFFFFF';
  const shTabla = '0 1px 2px rgba(13,20,18,0.12)';
  const colTabla = '#0D1412';
  const bgTarjetas = '#E8ECEA';
  const shTarjetas = 'none';
  const colTarjetas = '#98A3A0';
  const bdOrden = 'rgba(13,20,18,0.12)';
  const bgOrden = '#FFFFFF';
  const colOrden = '#3D4945';
  const labelOrden = 'Reordenar';

  return (
    <div className="entrar-panel" style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', rowGap: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', minWidth: 0, height: '36px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '10px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA5A1" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 15px' }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span style={{ fontSize: '12.5px', color: '#9AA5A1', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{abmBuscar}</span>
        </span>
        
        {filtrosSelectMapped.map((sl: any, idx: number) => (
          <span 
            key={idx}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9BDCC4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(13,20,18,0.12)'; }}
          >
            <span style={{ fontSize: '12.5px', color: '#7A8783' }}>{sl.label}</span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0D1412' }}>{sl.valor}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7A8783" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 13px' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        ))}

        {hayEdicion && (
          <>
            <span style={{ display: 'flex', gap: '2px', padding: '3px', background: '#E8ECEA', borderRadius: '10px', flex: '0 0 auto' }}>
              <span onClick={() => onViewChange && onViewChange('tabla')} title="Tabla" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '30px', borderRadius: '7px', background: bgTabla, boxShadow: shTabla, cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colTabla} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 10h18M9 10v9" />
                </svg>
              </span>
              <span onClick={() => onViewChange && onViewChange('tarjetas')} title="Tarjetas" style={{ display: 'grid', placeItems: 'center', width: '32px', height: '30px', borderRadius: '7px', background: bgTarjetas, boxShadow: shTarjetas, cursor: 'pointer' }}>
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
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap', rowGap: '8px' }}>
        {abmChips.map((e: any, idx: number) => (
          <span 
            key={idx}
            onClick={e.ir} 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '30px', padding: '0 12px', borderRadius: '999px', border: `1px solid ${e.bd}`, background: e.bg, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: e.col }}>{e.label}</span>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: e.sub, fontFeatureSettings: "'tnum'" }}>{e.n}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#98A3A0', whiteSpace: 'nowrap' }}>{abmResumen}</span>
      </div>

      {modoTabla && (
        <div style={{ marginTop: '12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ boxSizing: 'border-box', display: 'grid', minWidth: abmMin, gridTemplateColumns: abmCols, alignItems: 'center', gap: '12px', padding: '10px 16px', background: '#FAFBFA', borderBottom: '1px solid rgba(13,20,18,0.06)' }}>
            {abmHeads.map((h: any, idx: number) => (
              <span key={idx} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0', textAlign: h.align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.label}</span>
            ))}
          </div>

          {abmFilas.map((r: any, idx: number) => (
            <div 
              key={idx}
              style={{ boxSizing: 'border-box', display: 'grid', minWidth: abmMin, gridTemplateColumns: abmCols, alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: '1px solid rgba(13,20,18,0.05)', background: r.fondo }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFA'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = r.fondo || 'transparent'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {r.hayAvatar !== false && (
                  <span style={{ display: 'grid', placeItems: 'center', width: '30px', height: '30px', borderRadius: r.radio || '9px', background: r.tinte || '#F3F7F5', flex: '0 0 30px' }}>
                    {r.hayGlifo ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.colorIcono || '#0D1412'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={r.glifo} /></svg>
                    ) : r.hayIniciales ? (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: r.colorIcono }}>{r.iniciales}</span>
                    ) : null}
                  </span>
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: r.colorNombre || '#0D1412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                  {r.sub && (
                    <span style={{ display: 'block', fontSize: '11px', color: '#98A3A0', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: r.fuenteSub || 'inherit' }}>{r.sub}</span>
                  )}
                </span>
              </span>

              {r.celdas.map((c: any, cIdx: number) => (
                <span key={cIdx} style={{ minWidth: 0, textAlign: c.align || 'left' }}>
                  {c.esChip && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '22px', padding: '0 9px', background: c.chipBg, borderRadius: '999px', whiteSpace: 'nowrap' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: c.chipCol }}></span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: c.chipCol }}>{c.texto}</span>
                    </span>
                  )}
                  {c.esTexto !== false && !c.esChip && (
                    <>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '7px', justifyContent: c.just || 'flex-start', minWidth: 0 }}>
                        {c.hayPunto && (
                          <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: c.punto, flex: '0 0 7px' }}></span>
                        )}
                        <span style={{ fontFamily: c.fuente || 'inherit', fontSize: c.tam || '13px', fontWeight: c.peso || 400, color: c.color || '#0D1412', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFeatureSettings: "'tnum'" }}>{c.texto}</span>
                      </span>
                      {c.haySub && (
                        <span style={{ display: 'block', fontSize: '10.5px', color: c.subCol || '#98A3A0', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.sub}</span>
                      )}
                    </>
                  )}
                </span>
              ))}

              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                {r.editable !== false && (
                  <>
                    <span onClick={r.alternar} title={r.estado} style={{ position: 'relative', width: '32px', height: '18px', borderRadius: '999px', background: r.pistaBg, flex: '0 0 32px', cursor: 'pointer', transition: 'background 160ms cubic-bezier(0.2,0.8,0.2,1)' }}>
                      <span style={{ position: 'absolute', top: '2px', left: r.perilla, width: '14px', height: '14px', borderRadius: '999px', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(13,20,18,0.2)', transition: 'left 160ms cubic-bezier(0.2,0.8,0.2,1)' }}></span>
                    </span>
                    <span title="Editar" style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EF'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7A8783" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L20 8l-4-4L4 16z" /></svg>
                    </span>
                    <span title={r.tituloBorrar} style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: r.cursorBorrar || 'pointer', opacity: r.opBorrar || 1 }} onMouseEnter={(e) => { if(r.cursorBorrar !== 'not-allowed') e.currentTarget.style.background = '#FDF4F4'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={r.colBorrar || '#C93A3E'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1zM6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" /></svg>
                    </span>
                  </>
                )}
                {r.soloLectura && (
                  <span title="Ver el detalle del registro" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '26px', padding: '0 10px', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F7F6'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5B6764" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 13px' }}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.4" /></svg>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#5B6764' }}>Ver</span>
                  </span>
                )}
              </span>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#FAFBFA', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', color: '#7A8783' }}>{abmPie}</span>
            <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#98A3A0', whiteSpace: 'nowrap' }}>{abmMostrando}</span>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Exportar</a>
          </div>
        </div>
      )}

      {modoTarjetas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginTop: '12px' }}>
          {abmFilas.map((r: any, idx: number) => (
            <div key={idx} style={{ background: r.fondo || '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', padding: '14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: '34px', height: '34px', borderRadius: r.radio || '10px', background: r.tinte || '#F3F7F5', flex: '0 0 34px' }}>
                  {r.hayGlifo ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={r.colorIcono || '#0D1412'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={r.glifo} /></svg>
                  ) : r.hayIniciales ? (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: r.colorIcono }}>{r.iniciales}</span>
                  ) : null}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: r.colorNombre || '#0D1412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#98A3A0', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '13px' }}>
                {r.celdas.map((c: any, cIdx: number) => (
                  <span key={cIdx} style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    {c.hayPunto && (
                      <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: c.punto, flex: '0 0 7px' }}></span>
                    )}
                    <span style={{ fontSize: '12px', color: c.color || '#0D1412', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFeatureSettings: "'tnum'" }}>{c.texto}</span>
                  </span>
                ))}
              </div>

              {r.editable !== false && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '13px', paddingTop: '12px', borderTop: '1px solid rgba(13,20,18,0.06)' }}>
                  <span onClick={r.alternar} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <span style={{ position: 'relative', width: '32px', height: '18px', borderRadius: '999px', background: r.pistaBg, flex: '0 0 32px', transition: 'background 160ms cubic-bezier(0.2,0.8,0.2,1)' }}>
                      <span style={{ position: 'absolute', top: '2px', left: r.perilla, width: '14px', height: '14px', borderRadius: '999px', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(13,20,18,0.2)', transition: 'left 160ms cubic-bezier(0.2,0.8,0.2,1)' }}></span>
                    </span>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#5B6764' }}>{r.estado}</span>
                  </span>
                  <span title="Editar" style={{ marginLeft: 'auto', display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#EDF1EF'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7A8783" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L20 8l-4-4L4 16z" /></svg>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
