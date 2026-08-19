import React from 'react';

export interface TemaItem {
  id: string;
  nombre: string;
  /** Fila de la matriz: claro u oscuro. */
  modo: 'claro' | 'oscuro';
  /** Columna de la matriz: qué tan plano, tostado o azulado es ese gris. */
  temperatura: 'neutro' | 'calido' | 'frio';
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

/** Los dos ejes del selector. El orden es el de la lectura: primero se decide
 *  claro u oscuro (la pregunta grande) y despues la temperatura. */
const FILAS: { modo: TemaItem['modo']; label: string; ayuda: string }[] = [
  { modo: 'oscuro', label: 'Oscuro', ayuda: 'Turnos noche, salas de guardia' },
  { modo: 'claro', label: 'Claro', ayuda: 'Mostrador, oficinas con luz' },
];

const COLUMNAS: { id: TemaItem['temperatura']; label: string }[] = [
  { id: 'neutro', label: 'Neutro' },
  { id: 'calido', label: 'Cálido' },
  { id: 'frio', label: 'Frío' },
];

interface PanelAparienciaProps {
  veloMarca: string;
  acento: string;
  /** @deprecated El nombre del acento ahora se muestra debajo de cada muestra. */
  nombreAcento?: string;
  temas: TemaItem[];
  acentos: AcentoItem[];
  barras: BarraItem[];
  onTemaSelect: (id: string) => void;
  onAcentoSelect: (id: string) => void;
  onBarraSelect: (id: string) => void;
}

export default function PanelApariencia({ veloMarca, acento, temas: rawTemas, acentos: rawAcentos, barras: rawBarras, onTemaSelect, onAcentoSelect, onBarraSelect }: PanelAparienciaProps) {
  // Placeholders de cuando el panel se mira suelto, sin el motor de temas
  // detrás. Ocupan una columna de la matriz; los otros casilleros quedan vacíos
  // a propósito, que es exactamente lo que se ve sin datos.
  const temas: TemaItem[] = rawTemas?.length ? rawTemas : [
    { id: 't1', nombre: 'Claro', modo: 'claro', temperatura: 'neutro', borde: 'var(--pl-border)', fondoCard: 'var(--pl-surface)', lienzo: 'var(--pl-surface-2)', barra: 'var(--pl-surface)', linea: 'var(--pl-border)', peso: 400, color: 'var(--pl-text)', tick: 1 },
    { id: 't3', nombre: 'Oscuro', modo: 'oscuro', temperatura: 'neutro', borde: 'rgba(255,255,255,0.1)', fondoCard: 'var(--pl-surface-2)', lienzo: 'var(--pl-text)', barra: 'var(--pl-surface-2)', linea: 'rgba(255,255,255,0.15)', peso: 300, color: 'var(--pl-surface)', tick: 0 },
  ];

  const acentos = rawAcentos?.length ? rawAcentos : [
    { id: 'a1', nombre: 'Verde Bosque', hex: 'var(--pl-green)', anillo: 'rgba(0,179,126,0.2)', borde: 'var(--pl-border)', tick: 1 },
    { id: 'a2', nombre: 'Azul Mar', hex: '#3B82F6', anillo: 'rgba(59,130,246,0.2)', borde: 'var(--pl-border)', tick: 0 },
    { id: 'a3', nombre: 'Rojo Fuego', hex: 'var(--pl-red-700)', anillo: 'rgba(239,68,68,0.2)', borde: 'var(--pl-border)', tick: 0 }
  ];

  const barras = rawBarras?.length ? rawBarras : [
    { id: 'b1', nombre: 'Moderna', borde: 'var(--pl-border)', fondoCard: 'var(--pl-surface)', lienzo: 'var(--pl-surface)', textoAlto: 'var(--pl-text)', textoBajo: 'var(--pl-text-muted)', peso: 400, color: 'var(--pl-text)', tick: 1 },
    { id: 'b2', nombre: 'Plana', borde: 'transparent', fondoCard: 'var(--pl-surface-2)', lienzo: 'var(--pl-surface-2)', textoAlto: 'var(--pl-text)', textoBajo: 'var(--pl-text-muted)', peso: 400, color: 'var(--pl-text)', tick: 0 }
  ];
  /** Una muestra del tema. Los colores son valores de cada tema (runtime), por
   *  eso van inline; la caja y la grilla salen de `Configuracion.css`. */
  const renderTema = (t: TemaItem) => (
    <button
      key={t.id}
      type="button"
      className="ap-tema"
      onClick={() => onTemaSelect(t.id)}
      title={t.nombre}
      aria-pressed={t.tick === 1}
      style={{ borderColor: t.borde, background: t.fondoCard }}
    >
      <span className="ap-tema-muestra" style={{ background: t.lienzo }}>
        <span className="ap-tema-barra" style={{ background: t.barra }}></span>
        <span className="ap-tema-lineas">
          <span className="ap-tema-linea ap-tema-linea--acento" style={{ background: acento }}></span>
          <span className="ap-tema-linea" style={{ background: t.linea, width: '92%' }}></span>
          <span className="ap-tema-linea" style={{ background: t.linea, width: '64%' }}></span>
        </span>
      </span>
      <span className="ap-tema-pie">
        <span className="ap-tema-nombre" style={{ fontWeight: t.peso, color: t.color }}>{t.nombre}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={acento} strokeWidth="2.8"
             strokeLinecap="round" strokeLinejoin="round" style={{ opacity: t.tick }} aria-hidden="true">
          <path d="m4 12 5 5L20 6" />
        </svg>
      </span>
    </button>
  );

  return (
    <div className="entrar-panel" style={{ marginTop: '16px' }}>
      <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '18px 20px', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>BANNER DEL TABLERO</span>
        <p style={{ margin: '9px 0 0', fontSize: '13px', lineHeight: 1.5, color: 'var(--pl-text-2)', textWrap: 'pretty', maxWidth: '68ch' }}>
          Es la foto que ve el equipo al entrar. Conviene una imagen del municipio, horizontal, con el lado izquierdo despejado: ahí va el título.
        </p>

        <div style={{ position: 'relative', marginTop: '14px', height: '300px', borderRadius: '12px', overflow: 'hidden', background: 'var(--pl-surface-3)' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span style={{ fontSize: '12px', color: 'var(--pl-text-faint)' }}>Arrastrá la foto del banner — 2000 × 700 px o más</span>
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
            <span style={{ display: 'block', marginTop: '8px', fontFamily: 'Sora, sans-serif', fontSize: '24px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.025em', color: 'var(--pl-on-brand)' }}>Asunción, Dpto. Central</span>
            <span style={{ display: 'block', marginTop: '6px', fontSize: '12.5px', color: 'rgba(255,255,255,0.82)' }}>Así se va a ver el título sobre tu foto</span>
          </div>
          <span 
            style={{ position: 'absolute', right: '14px', bottom: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '28px', padding: '0 11px', background: 'rgba(255,255,255,0.94)', borderRadius: '999px', boxShadow: '0 2px 8px var(--pl-border-strong)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.94)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 13px' }}>
              <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14" />
            </svg>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pl-text-2)' }}>Cambiar foto</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', padding: '10px 12px', background: 'var(--pl-surface-2)', borderRadius: '10px', flexWrap: 'wrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 14px' }}>
            <path d="M12 8v5M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <span style={{ fontSize: '11.5px', color: 'var(--pl-text-muted)', minWidth: 0 }}>El tinte del color de marca y el degradé que protege el título se aplican solos: subí la foto sin retocar.</span>
        </div>

        <span style={{ display: 'block', height: '1px', background: 'var(--pl-border)', margin: '18px 0' }}></span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', rowGap: '12px' }}>
          <span style={{ width: '60px', height: '60px', borderRadius: '14px', overflow: 'hidden', background: 'var(--pl-surface-3)', border: '1px solid var(--pl-border)', flex: '0 0 60px', display: 'grid', placeItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--pl-text-faint)' }}>Logo</span>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>LOGO</span>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pl-text)', marginTop: '5px' }}>PNG con fondo transparente</span>
            <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pl-text-muted)', marginTop: '3px' }}>512 × 512 px · se usa en el menú y en los comprobantes</span>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', lineHeight: 1.45, color: 'var(--pl-text-faint)', maxWidth: '34ch' }}>La app corre white-label: el mismo esqueleto con la marca de cada municipio.</span>
        </div>
      </div>

      <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '18px 20px', marginTop: '12px', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>TEMA DEL PANEL</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pl-text-muted)', marginTop: '5px' }}>Dos preguntas: ¿claro u oscuro?, ¿neutro, cálido o frío? El acento se aplica sobre cualquiera.</span>
        {/* MATRIZ, no lista. Antes eran seis muestras en fila y había que
            comparar dos casi iguales para descubrir en qué se diferenciaban
            —"gris, negro y azul los veo muy similares"—. Puestos en grilla, la
            posición explica el tema: la fila dice claro u oscuro y la columna
            si ese gris es plano, tostado o azulado. */}
        <div className="ap-matriz">
          <span aria-hidden="true"></span>
          {COLUMNAS.map(c => (
            <span key={c.id} className="ap-matriz-col">{c.label}</span>
          ))}
          {FILAS.map(f => (
            <React.Fragment key={f.modo}>
              <span className="ap-matriz-fila">{f.label}</span>
              {COLUMNAS.map(c => {
                const t = temas.find(x => x.modo === f.modo && x.temperatura === c.id);
                // Un casillero vacío sería un hueco en la grilla y se leería
                // como que falta cargar algo: se reserva el lugar.
                if (!t) return <span key={c.id} aria-hidden="true"></span>;
                return renderTema(t);
              })}
            </React.Fragment>
          ))}
        </div>

        <span style={{ display: 'block', height: '1px', background: 'var(--pl-border)', margin: '18px 0' }}></span>

        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>COLOR DE ACENTO</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pl-text-muted)', marginTop: '5px' }}>
          Ocho, probados contra la barra oscura y contra blanco. No hay selector libre: con
          color a elección alguien elige uno con el que el texto deja de leerse.
        </span>
        {/* Cuadrados de 30px con radio 8, como el canvas. Cada uno con su
            nombre: un círculo de color suelto obliga a pasar el mouse por
            encima para saber cuál es. */}
        <div className="ap-acentos">
          {acentos.map(a => (
            <button
              key={a.id}
              type="button"
              className={`ap-acento${a.tick === 1 ? ' ap-acento--activo' : ''}`}
              onClick={() => onAcentoSelect(a.id)}
              title={a.nombre}
              aria-pressed={a.tick === 1}
            >
              <span className="ap-acento-muestra" style={{ background: a.hex }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pl-on-accent)"
                     strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: a.tick }}>
                  <path d="m4 12 5 5L20 6" />
                </svg>
              </span>
              <span className="ap-acento-nombre">{a.nombre}</span>
            </button>
          ))}
        </div>

        <span style={{ display: 'block', height: '1px', background: 'var(--pl-border)', margin: '18px 0' }}></span>

        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>FONDO DE LA BARRA LATERAL</span>
        <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pl-text-muted)', marginTop: '5px' }}>Se arma en armonía con el acento activo.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '9px', marginTop: '11px', maxWidth: '420px' }}>
          {barras.map(b => (
            <span 
              key={b.id}
              onClick={() => onBarraSelect(b.id)} 
              title={b.nombre} 
              style={{ display: 'flex', flexDirection: 'column', gap: '7px', padding: '7px', border: `1px solid ${b.borde}`, borderRadius: '11px', background: b.fondoCard, cursor: 'pointer', minWidth: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pl-green-200)'; }}
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
