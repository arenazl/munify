import React from 'react';

export interface TemaItem {
  id: string;
  nombre: string;
  borde: string;
  fondoCard: string;
  lienzo: string;
  barra: string;
  linea: string;
  peso: number;
  color: string;
  tick: number;
}

export interface AcentoItem {
  id: string;
  nombre: string;
  hex: string;
  anillo: string;
  borde: string;
  tick: number;
}

export interface BarraItem {
  id: string;
  nombre: string;
  borde: string;
  fondoCard: string;
  lienzo: string;
  textoAlto: string;
  textoBajo: string;
  peso: number;
  color: string;
  tick: number;
}

interface PanelAparienciaProps {
  veloMarca: string;
  acento: string;
  nombreAcento: string;
  temas: TemaItem[];
  acentos: AcentoItem[];
  barras: BarraItem[];
  onTemaSelect: (id: string) => void;
  onAcentoSelect: (id: string) => void;
  onBarraSelect: (id: string) => void;
}

export default function PanelApariencia({ veloMarca, acento, nombreAcento, temas: rawTemas, acentos: rawAcentos, barras: rawBarras, onTemaSelect, onAcentoSelect, onBarraSelect }: PanelAparienciaProps) {
  const temas = rawTemas?.length ? rawTemas : [
    { id: 't1', nombre: 'Claro puro', borde: 'rgba(13,20,18,0.06)', fondoCard: '#FFFFFF', lienzo: '#FAFBFA', barra: '#FFFFFF', linea: 'rgba(13,20,18,0.08)', peso: 400, color: '#0D1412', tick: 1 },
    { id: 't2', nombre: 'Gris moderno', borde: '#D7DDDC', fondoCard: '#FFFFFF', lienzo: '#EDF1EF', barra: '#F3F5F4', linea: '#D7DDDC', peso: 500, color: '#0D1412', tick: 0 },
    { id: 't3', nombre: 'Oscuro', borde: 'rgba(255,255,255,0.1)', fondoCard: '#1E2321', lienzo: '#0D1412', barra: '#1E2321', linea: 'rgba(255,255,255,0.15)', peso: 300, color: '#FFFFFF', tick: 0 }
  ];

  const acentos = rawAcentos?.length ? rawAcentos : [
    { id: 'a1', nombre: 'Verde Bosque', hex: '#00B37E', anillo: 'rgba(0,179,126,0.2)', borde: 'rgba(13,20,18,0.1)', tick: 1 },
    { id: 'a2', nombre: 'Azul Mar', hex: '#3B82F6', anillo: 'rgba(59,130,246,0.2)', borde: 'rgba(13,20,18,0.1)', tick: 0 },
    { id: 'a3', nombre: 'Rojo Fuego', hex: '#EF4444', anillo: 'rgba(239,68,68,0.2)', borde: 'rgba(13,20,18,0.1)', tick: 0 }
  ];

  const barras = rawBarras?.length ? rawBarras : [
    { id: 'b1', nombre: 'Moderna', borde: 'rgba(13,20,18,0.06)', fondoCard: '#FFFFFF', lienzo: '#FFFFFF', textoAlto: '#0D1412', textoBajo: '#7A8783', peso: 400, color: '#0D1412', tick: 1 },
    { id: 'b2', nombre: 'Plana', borde: 'transparent', fondoCard: '#FAFBFA', lienzo: '#FAFBFA', textoAlto: '#0D1412', textoBajo: '#7A8783', peso: 400, color: '#0D1412', tick: 0 }
  ];
  return (
    <div className="entrar-panel" style={{ marginTop: '16px' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', padding: '18px 20px', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>BANNER DEL TABLERO</span>
        <p style={{ margin: '9px 0 0', fontSize: '13px', lineHeight: 1.5, color: '#5B6764', textWrap: 'pretty', maxWidth: '68ch' }}>
          Es la foto que ve el equipo al entrar. Conviene una imagen del municipio, horizontal, con el lado izquierdo despejado: ahí va el título.
        </p>

        <div style={{ position: 'relative', marginTop: '14px', height: '300px', borderRadius: '12px', overflow: 'hidden', background: '#EDF1EF' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span style={{ fontSize: '12px', color: '#98A3A0' }}>Arrastrá la foto del banner — 2000 × 700 px o más</span>
          </div>
          <div style={{ position: 'absolute', inset: 0, background: veloMarca, opacity: 0.35, mixBlendMode: 'multiply', pointerEvents: 'none', transition: 'opacity 200ms cubic-bezier(0.2,0.8,0.2,1)' }}></div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,32,24,0.78) 0%, rgba(6,32,24,0.44) 48%, rgba(6,32,24,0.06) 100%)', pointerEvents: 'none' }}></div>
          <div style={{ position: 'absolute', left: '20px', right: '20px', top: '20px', pointerEvents: 'none' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.11em', color: 'rgba(255,255,255,0.72)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 12px' }}>
                <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              MUNICIPALIDAD · VISTA CONSOLIDADA
            </span>
            <span style={{ display: 'block', marginTop: '8px', fontFamily: 'Sora, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#FFFFFF' }}>Asunción, Dpto. Central</span>
            <span style={{ display: 'block', marginTop: '6px', fontSize: '12.5px', color: 'rgba(255,255,255,0.82)' }}>Así se va a ver el título sobre tu foto</span>
          </div>
          <span 
            style={{ position: 'absolute', right: '14px', bottom: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '28px', padding: '0 11px', background: 'rgba(255,255,255,0.94)', borderRadius: '999px', boxShadow: '0 2px 8px rgba(13,20,18,0.16)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.94)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D4945" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 13px' }}>
              <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14" />
            </svg>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#3D4945' }}>Cambiar foto</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', padding: '10px 12px', background: '#FAFBFA', borderRadius: '10px', flexWrap: 'wrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#98A3A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 14px' }}>
            <path d="M12 8v5M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <span style={{ fontSize: '11.5px', color: '#7A8783', minWidth: 0 }}>El tinte del color de marca y el degradé que protege el título se aplican solos: subí la foto sin retocar.</span>
        </div>

        <span style={{ display: 'block', height: '1px', background: 'rgba(13,20,18,0.06)', margin: '18px 0' }}></span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', rowGap: '12px' }}>
          <span style={{ width: '60px', height: '60px', borderRadius: '14px', overflow: 'hidden', background: '#F3F7F5', border: '1px solid rgba(13,20,18,0.07)', flex: '0 0 60px', display: 'grid', placeItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#98A3A0' }}>Logo</span>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>LOGO</span>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0D1412', marginTop: '5px' }}>PNG con fondo transparente</span>
            <span style={{ display: 'block', fontSize: '11.5px', color: '#7A8783', marginTop: '3px' }}>512 × 512 px · se usa en el menú y en los comprobantes</span>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', lineHeight: 1.45, color: '#98A3A0', maxWidth: '34ch' }}>La app corre white-label: el mismo esqueleto con la marca de cada municipio.</span>
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', padding: '18px 20px', marginTop: '12px', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>TEMA DEL PANEL</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: '#7A8783', marginTop: '5px' }}>El acento se aplica sobre cualquier tema.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '9px', marginTop: '11px' }}>
          {temas.map(t => (
            <span 
              key={t.id}
              onClick={() => onTemaSelect(t.id)} 
              title={t.nombre} 
              style={{ display: 'flex', flexDirection: 'column', gap: '7px', padding: '7px', border: `1px solid ${t.borde}`, borderRadius: '11px', background: t.fondoCard, cursor: 'pointer', minWidth: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9BDCC4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.borde; }}
            >
              <span style={{ display: 'flex', height: '62px', borderRadius: '7px', overflow: 'hidden', background: t.lienzo }}>
                <span style={{ width: '30%', height: '100%', background: t.barra }}></span>
                <span style={{ flex: 1, minWidth: 0, padding: '7px 6px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ display: 'block', height: '4px', width: '76%', borderRadius: '999px', background: acento }}></span>
                  <span style={{ display: 'block', height: '3px', width: '92%', borderRadius: '999px', background: t.linea }}></span>
                  <span style={{ display: 'block', height: '3px', width: '64%', borderRadius: '999px', background: t.linea }}></span>
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 2px 1px' }}>
                <span style={{ fontSize: '12px', fontWeight: t.peso, color: t.color, minWidth: 0 }}>{t.nombre}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={acento} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flex: '0 0 13px', opacity: t.tick }}>
                  <path d="m4 12 5 5L20 6" />
                </svg>
              </span>
            </span>
          ))}
        </div>

        <span style={{ display: 'block', height: '1px', background: 'rgba(13,20,18,0.06)', margin: '18px 0' }}></span>

        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>COLOR DE ACENTO</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: '#7A8783', marginTop: '5px' }}>Pinta botones, estados activos y detalles en toda la app.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          {acentos.map(a => (
            <span 
              key={a.id}
              onClick={() => onAcentoSelect(a.id)} 
              title={a.nombre} 
              style={{ display: 'grid', placeItems: 'center', width: '34px', height: '34px', borderRadius: '999px', background: a.hex, cursor: 'pointer', boxShadow: `0 0 0 ${a.anillo} #FFFFFF, 0 0 0 ${a.borde} ${a.hex}` }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: a.tick }}>
                <path d="m4 12 5 5L20 6" />
              </svg>
            </span>
          ))}
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: acento, marginLeft: '4px', whiteSpace: 'nowrap' }}>{nombreAcento}</span>
        </div>

        <span style={{ display: 'block', height: '1px', background: 'rgba(13,20,18,0.06)', margin: '18px 0' }}></span>

        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>FONDO DE LA BARRA LATERAL</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: '#7A8783', marginTop: '5px' }}>Se arma en armonía con el acento activo.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '9px', marginTop: '11px', maxWidth: '420px' }}>
          {barras.map(b => (
            <span 
              key={b.id}
              onClick={() => onBarraSelect(b.id)} 
              title={b.nombre} 
              style={{ display: 'flex', flexDirection: 'column', gap: '7px', padding: '7px', border: `1px solid ${b.borde}`, borderRadius: '11px', background: b.fondoCard, cursor: 'pointer', minWidth: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9BDCC4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = b.borde; }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '62px', padding: '11px 10px', borderRadius: '7px', background: b.lienzo }}>
                <span style={{ display: 'block', height: '4px', width: '68%', borderRadius: '999px', background: b.textoAlto }}></span>
                <span style={{ display: 'block', height: '4px', width: '84%', borderRadius: '999px', background: acento }}></span>
                <span style={{ display: 'block', height: '4px', width: '52%', borderRadius: '999px', background: b.textoBajo }}></span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 2px 1px' }}>
                <span style={{ fontSize: '12px', fontWeight: b.peso, color: b.color, minWidth: 0 }}>{b.nombre}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={acento} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flex: '0 0 13px', opacity: b.tick }}>
                  <path d="m4 12 5 5L20 6" />
                </svg>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
