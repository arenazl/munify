import React from 'react';
import { Glifo } from '../../../components/abmv2/Glifo';

export interface TabAsig {
  id: string;
  label: string;
  n: number | string;
  glifo: string;
  col: string;
  sub: string;
  bg: string;
  sombra: string;
}

export interface ChipAsig {
  id: string;
  label: string;
  n: number | string;
  punto: string;
  col: string;
  sub: string;
  bg: string;
  bd: string;
}

export interface FilaAsig {
  id: string;
  nombre: string;
  tinte: string;
  color: string;
  glifo: string;
  uso: number | string;
  usoCol: string;
  usoNota: string;
  asignada: boolean;
  dep?: string;
  depColor?: string;
  sinAsignar: boolean;
  sugerida?: string;
  tituloAplicar?: string;
}

export interface GrupoAsig {
  id: string;
  titulo: string;
  detalle: string;
  punto: string;
  col: string;
  bg: string;
  filas: FilaAsig[];
}

interface PanelAsignacionProps {
  tabsAsig: TabAsig[];
  haySugerencias: boolean;
  labelSugerencias: string;
  chipsAsig: ChipAsig[];
  colUsoAsig: string;
  gruposAsig: GrupoAsig[];
  pieAsig: string;
  resumenAsig: string;
  onTabClick: (id: string) => void;
  onAplicarTodas: () => void;
  onChipClick: (id: string) => void;
  onQuitarFila: (id: string) => void;
  onAplicarFila: (id: string) => void;
}

export default function PanelAsignacion({
  tabsAsig = [], haySugerencias, labelSugerencias, chipsAsig = [], colUsoAsig, gruposAsig = [], pieAsig, resumenAsig, onTabClick, onAplicarTodas, onChipClick,
  onQuitarFila, onAplicarFila
}: PanelAsignacionProps) {
  let tabs = tabsAsig;
  let chips = chipsAsig;
  let grupos = gruposAsig;

  if (tabs.length === 0) {
    tabs = [
      { id: '1', label: 'Bacheo', n: 14, glifo: 'm7 9 5 5 5-5', col: '#1D6FD1', sub: 'Pendientes', bg: '#E8F1FE', sombra: 'none' },
      { id: '2', label: 'Alumbrado', n: 5, glifo: 'm7 9 5 5 5-5', col: 'var(--pl-amber-strong)', sub: 'Pendientes', bg: '#FDF1DF', sombra: 'none' }
    ];
  }

  if (chips.length === 0) {
    chips = [
      { id: 'c1', label: 'Todas las áreas', n: 24, punto: 'var(--pl-green)', col: 'var(--pl-text)', sub: '', bg: 'var(--pl-surface)', bd: 'var(--pl-border)' }
    ];
  }

  if (grupos.length === 0) {
    grupos = [
      { 
        id: 'g1', titulo: 'Dirección de Obras', detalle: '4 asignadas', punto: '#3B82F6', col: 'var(--pl-text-2)', bg: 'var(--pl-surface-2)',
        filas: [
          { id: 'f1', nombre: 'Bacheo y calles', tinte: '#E8F1FE', color: '#3B82F6', glifo: 'm7 9 5 5 5-5', uso: 120, usoCol: 'var(--pl-text)', usoNota: 'Frecuente', asignada: true, sinAsignar: false }
        ]
      }
    ];
  }

  return (
    <div className="entrar-panel" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', rowGap: '10px' }}>
        <div style={{ display: 'flex', gap: '2px', padding: '3px', background: 'var(--pl-surface-3)', borderRadius: '10px', width: 'fit-content', maxWidth: '100%', flex: '0 0 auto' }}>
          {tabs.map(t => (
            <span 
              key={t.id}
              onClick={() => onTabClick(t.id)} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '32px', padding: '0 14px', borderRadius: '8px', background: t.bg, boxShadow: t.sombra, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <Glifo glifo={t.glifo} size={14} color={t.col} strokeWidth={2} fallback="Building2" />
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: t.col }}>{t.label}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: t.sub, fontFeatureSettings: "'tnum'" }}>{t.n}</span>
            </span>
          ))}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 220px', minWidth: 0, height: '34px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '10px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-faint)" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 15px' }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span style={{ fontSize: '12.5px', color: 'var(--pl-text-faint)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Buscar categoría o dependencia</span>
        </span>
        {haySugerencias && (
          <span 
            onClick={onAplicarTodas} 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '34px', padding: '0 14px', borderRadius: '10px', background: 'var(--pl-green)', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-green-600)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-green)'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pl-surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 15px' }}>
              <path d="m12 3 1.7 4.6L18 9.5l-4.3 1.9L12 16l-1.7-4.6L6 9.5l4.3-1.9z" />
              <path d="m18.5 16.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
            </svg>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-surface)' }}>{labelSugerencias}</span>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--pl-border)', flexWrap: 'wrap', rowGap: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', marginRight: '2px' }}>FILTRAR</span>
        {chipsAsig.map(c => (
          <span 
            key={c.id}
            onClick={() => onChipClick(c.id)} 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '30px', padding: '0 12px', borderRadius: '999px', border: `1px solid ${c.bd}`, background: c.bg, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: c.punto }}></span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: c.col }}>{c.label}</span>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: c.sub, fontFeatureSettings: "'tnum'" }}>{c.n}</span>
          </span>
        ))}
      </div>

      <div style={{ marginTop: '12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ boxSizing: 'border-box', display: 'grid', minWidth: '560px', gridTemplateColumns: 'minmax(200px, 1.5fr) 96px minmax(190px, 1.35fr)', alignItems: 'center', gap: '14px', padding: '10px 16px', background: 'var(--pl-surface-2)', borderBottom: '1px solid var(--pl-border)' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>CATEGORÍA</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', textAlign: 'right' }}>{colUsoAsig}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>QUIÉN LOS ATIENDE</span>
        </div>

        {gruposAsig.map(g => (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: g.bg, borderTop: '1px solid var(--pl-border)', borderBottom: '1px solid var(--pl-border)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: g.punto, flex: '0 0 7px' }}></span>
              <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: g.col }}>{g.titulo}</span>
              <span style={{ fontSize: '11.5px', color: 'var(--pl-text-faint)', minWidth: 0 }}>{g.detalle}</span>
            </div>

            {g.filas.map(r => (
              <div 
                key={r.id}
                style={{ boxSizing: 'border-box', display: 'grid', minWidth: '560px', gridTemplateColumns: 'minmax(200px, 1.5fr) 96px minmax(190px, 1.35fr)', alignItems: 'center', gap: '14px', padding: '10px 16px', borderBottom: '1px solid var(--pl-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: '30px', height: '30px', borderRadius: '9px', background: r.tinte, flex: '0 0 30px' }}>
                    <Glifo glifo={r.glifo} size={16} color={r.color} />
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pl-text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                </span>
                <span style={{ textAlign: 'right', minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'Sora, sans-serif', fontSize: '13px', fontWeight: 700, color: r.usoCol, whiteSpace: 'nowrap', fontFeatureSettings: "'tnum'" }}>{r.uso}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--pl-text-faint)', marginTop: '2px', whiteSpace: 'nowrap' }}>{r.usoNota}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  {r.asignada && (
                    <span 
                      onClick={() => onQuitarFila(r.id)} 
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, height: '34px', padding: '0 11px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '10px', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pl-green-200)'; e.currentTarget.style.background = 'var(--pl-green-050)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--pl-border)'; e.currentTarget.style.background = 'var(--pl-surface)'; }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: r.depColor, flex: '0 0 6px' }}></span>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.dep}</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-muted)" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', flex: '0 0 13px' }}>
                        <path d="m7 9 5 5 5-5" />
                      </svg>
                    </span>
                  )}
                  {r.sinAsignar && (
                    <span 
                      onClick={() => onAplicarFila(r.id)} 
                      title={r.tituloAplicar} 
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0, height: '34px', padding: '0 11px', background: 'var(--pl-surface)', border: '1px dashed var(--pl-green-200)', borderRadius: '10px', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-green-050)'; e.currentTarget.style.borderColor = 'var(--pl-green)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; e.currentTarget.style.borderColor = 'var(--pl-green-200)'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-green-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 13px' }}>
                        <path d="m12 3 1.7 4.6L18 9.5l-4.3 1.9L12 16l-1.7-4.6L6 9.5l4.3-1.9z" />
                      </svg>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-green-700)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sugerida}</span>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--pl-surface-2)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--pl-text-muted)', minWidth: 0 }}>{pieAsig}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: 'var(--pl-text-faint)', whiteSpace: 'nowrap' }}>{resumenAsig}</span>
        </div>
      </div>
    </div>
  );
}
