import React from 'react';

export interface HeroKpi {
  id: string;
  pad: string;
  linea: string;
  label: string;
  valor: string | number;
  color: string;
  nota: string;
}

interface PanelHeaderProps {
  titulo: string;
  veredicto: string;
  
  ctaNuevo?: string;
  onCtaClick?: () => void;

  hero?: {
    tinte: string;
    acento: string;
    eyebrow: string;
    veredicto: string;
    kpis: HeroKpi[];
  };

  pista?: {
    titulo: string;
    texto: string;
    cta: string;
    onCtaClick: () => void;
  };
}

export default function PanelHeader({ titulo, veredicto, ctaNuevo, onCtaClick, hero, pista }: PanelHeaderProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', rowGap: '10px' }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: 'Sora, sans-serif', fontSize: '19px', fontWeight: 700, letterSpacing: '-0.022em' }}>
            {titulo}
          </h2>
          <p style={{ margin: '7px 0 0', fontSize: '13.5px', lineHeight: 1.5, color: '#3D4945', textWrap: 'pretty', maxWidth: '88ch' }}>
            {veredicto}
          </p>
        </div>
        {ctaNuevo && (
          <button 
            onClick={onCtaClick}
            style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '8px', 
              height: '36px', padding: '0 15px', border: 0, 
              borderRadius: '11px', background: '#00B37E', 
              color: '#FFFFFF', fontFamily: 'Inter, sans-serif', 
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' 
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#008F63'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#00B37E'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {ctaNuevo}
          </button>
        )}
      </div>

      {hero && (
        <div style={{ position: 'relative', marginTop: '14px', padding: '18px 20px', background: `linear-gradient(180deg, ${hero.tinte} 0%, #FFFFFF 62%)`, border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: hero.acento }}></span>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.11em', color: '#7A8783' }}>
            {hero.eyebrow}
          </span>
          <p 
            style={{ margin: '9px 0 0', fontFamily: 'Sora, sans-serif', fontSize: '17px', fontWeight: 600, lineHeight: 1.42, letterSpacing: '-0.02em', color: '#0D1412', textWrap: 'pretty', maxWidth: '90ch' }}
            dangerouslySetInnerHTML={{ __html: hero.veredicto }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hero.kpis.length}, minmax(0, 1fr))`, gap: '1px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(13,20,18,0.07)' }}>
            {hero.kpis.map(k => (
              <div key={k.id} style={{ minWidth: 0, paddingLeft: k.pad, borderLeft: `1px solid ${k.linea}` }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0', lineHeight: 1.3 }}>{k.label}</span>
                <span style={{ display: 'block', fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '24px', lineHeight: 1, letterSpacing: '-0.03em', marginTop: '8px', color: k.color, whiteSpace: 'nowrap', fontFeatureSettings: "'tnum'" }}>{k.valor}</span>
                <span style={{ display: 'block', fontSize: '10.5px', color: '#98A3A0', marginTop: '5px', lineHeight: 1.35 }}>{k.nota}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pista && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', padding: '13px 16px', background: '#F7FBF9', border: '1px solid #C9EBDD', borderLeft: '3px solid #00B37E', borderRadius: '11px', flexWrap: 'wrap', rowGap: '10px' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#00794F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 17px' }}>
            <path d="m12 3 2.2 5.9 6.3.4-4.9 4 1.7 6.1-5.3-3.4-5.3 3.4 1.7-6.1-4.9-4 6.3-.4z" />
          </svg>
          <span style={{ minWidth: 0, flex: '1 1 320px' }}>
            <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: '#00794F' }}>{pista.titulo}</span>
            <span style={{ display: 'block', fontSize: '12.5px', lineHeight: 1.5, color: '#3D4945', marginTop: '4px', textWrap: 'pretty' }}>{pista.texto}</span>
          </span>
          <span 
            onClick={pista.onCtaClick} 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '34px', padding: '0 13px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9BDCC4'; e.currentTarget.style.background = '#F2FBF7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(13,20,18,0.12)'; e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#00794F' }}>{pista.cta}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00794F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 13px' }}>
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      )}
    </>
  );
}
