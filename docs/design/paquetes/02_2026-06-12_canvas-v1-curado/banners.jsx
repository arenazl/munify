// Facebook page cover banners — 851×315 (tamaño estándar de portada FB).
// El borde inferior-izquierdo lo pisa la foto de perfil en desktop, así que
// el contenido clave va centrado / a la derecha de esa esquina.

const FB_W = 851;
const FB_H = 315;

const FBShell = ({ children, bg = 'var(--cream)', extra = null }) => (
  <div style={{
    width: FB_W, height: FB_H, background: bg,
    position: 'relative', overflow: 'hidden',
    fontFamily: 'var(--sans)', color: 'var(--ink)',
  }}>
    {extra}
    {children}
  </div>
);

const FBPaper = () => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background:
      'radial-gradient(ellipse at 80% 15%, rgba(255,255,255,0.6), transparent 55%),' +
      'radial-gradient(ellipse at 15% 90%, rgba(14,24,48,0.045), transparent 60%)',
  }}/>
);


// === Banner A · Editorial cream (recomendado) ==============================
// Logo + nombre centrados, bajada institucional. Sobrio y reconocible.

const BannerEditorial = () => (
  <FBShell extra={<FBPaper/>}>
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18,
    }}>
      <Lockup size={56} wordSize={52} gap={16}/>
      <div style={{ width: 64, height: 2, background: 'var(--logo-azure)', opacity: 0.6, borderRadius: 2 }}/>
      <div className="display-roman" style={{
        fontSize: 30, color: 'var(--ink-soft)', letterSpacing: '-0.01em',
        textAlign: 'center',
      }}>
        Software de gestión municipal para Argentina
      </div>
    </div>
  </FBShell>
);


// === Banner B · Promo navy =================================================
// Para campañas: fondo oscuro, gancho de 1 mes gratis.

const BannerPromo = () => (
  <FBShell bg="var(--ink)">
    <div style={{
      position: 'absolute', inset: 0,
      background:
        'radial-gradient(circle at 85% 18%, rgba(200,162,78,0.20), transparent 48%),' +
        'radial-gradient(circle at 8% 95%, rgba(26,38,71,0.65), transparent 55%)',
    }}/>
    {/* logo top-left */}
    <div style={{ position: 'absolute', top: 30, left: 44 }}>
      <Lockup size={40} wordSize={30} color="white" gap={12}/>
    </div>
    {/* big promo, centered-right to clear the profile overlap */}
    <div style={{
      position: 'absolute', left: 44, right: 44, top: 0, bottom: 0,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ height: 36 }}/>
      <div style={{
        fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 8,
      }}>
        Reclamos · Trámites · Tesorería
      </div>
      <span className="display" style={{
        fontSize: 62, lineHeight: 1.0, color: 'white',
      }}>
        Probalo <span style={{ color: 'var(--accent)' }}>un mes gratis.</span>
      </span>
      <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.7)', marginTop: 14 }}>
        Sin tarjeta de crédito · sin compromiso · con tus datos reales
      </div>
    </div>
  </FBShell>
);


// === Banner C · Split editorial ============================================
// Titular fuerte a la izquierda, módulos listados a la derecha.

const BannerSplit = () => (
  <FBShell extra={<FBPaper/>}>
    {/* logo top-left */}
    <div style={{ position: 'absolute', top: 30, left: 48 }}>
      <Lockup size={40} wordSize={30} gap={12}/>
    </div>
    {/* headline left */}
    <div style={{
      position: 'absolute', left: 48, top: 0, bottom: 0, width: 470,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ height: 30 }}/>
      <span className="display" style={{
        fontSize: 60, lineHeight: 1.0, color: 'var(--ink)',
      }}>
        Tu municipio,<br/>
        <span style={{ color: 'var(--ink-2)' }}>al día.</span>
      </span>
    </div>
    {/* module list right */}
    <div style={{
      position: 'absolute', right: 48, top: 0, bottom: 0, width: 250,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
    }}>
      {[
        { c: '#00B37E', t: 'Reclamos vecinales' },
        { c: '#3B82F6', t: 'Trámites online · RENAPER' },
        { c: '#C8A24E', t: 'Tesorería municipal' },
        { c: '#1A2647', t: 'Soporte humano 24/7' },
      ].map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.c, flexShrink: 0 }}/>
          <span style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 500 }}>{m.t}</span>
        </div>
      ))}
    </div>
  </FBShell>
);

// ===========================================================================
// SERIE AZUL · enfocada en QUÉ HACE la app
// ===========================================================================

// Mini line-icons (azure stroke, currentColor)
const FBIcon = ({ paths, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);
const IcPin   = <FBIcon paths={<><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></>}/>;
const IcDoc   = <FBIcon paths={<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></>}/>;
const IcWallet= <FBIcon paths={<><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h3M3 9h18"/></>}/>;
const IcChat  = <FBIcon paths={<><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.2A8 8 0 1 1 21 12Z"/></>}/>;
const IcBolt  = <FBIcon paths={<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>}/>;
const IcSpark = <FBIcon paths={<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></>}/>;

// Shared dark-blue shell with azure glow
const FBBlue = ({ children }) => (
  <div style={{
    width: FB_W, height: FB_H, background: '#0C1A36',
    position: 'relative', overflow: 'hidden',
    fontFamily: 'var(--sans)', color: 'white',
  }}>
    <div style={{
      position: 'absolute', inset: 0,
      background:
        'radial-gradient(circle at 88% 12%, rgba(64,112,192,0.30), transparent 45%),' +
        'radial-gradient(circle at 4% 96%, rgba(16,48,112,0.7), transparent 55%)',
    }}/>
    {children}
  </div>
);


// === Banner D · Los 4 módulos (qué hace) ===================================

const BannerModulos = () => {
  const mods = [
    { ic: IcPin,    t: 'Reclamos vecinales', d: 'Reporte con foto y GPS' },
    { ic: IcDoc,    t: 'Trámites digitales', d: 'Con validación RENAPER' },
    { ic: IcWallet, t: 'Tesorería',          d: 'Gastos al día, con IA' },
    { ic: IcChat,   t: 'Atención al vecino',  d: 'Soporte humano 24/7' },
  ];
  return (
    <FBBlue>
      <div style={{ position: 'absolute', top: 28, left: 44 }}>
        <Lockup size={38} wordSize={28} color="white" gap={12}/>
      </div>
      <div style={{
        position: 'absolute', left: 44, right: 44, top: 92, bottom: 30,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <span className="display" style={{ fontSize: 38, lineHeight: 1.0, marginBottom: 18 }}>
          Todo tu municipio, <span style={{ color: '#6E9BE0' }}>en una app.</span>
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          {mods.map((m, i) => (
            <div key={i} style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(110,155,224,0.18)',
            }}>
              <div style={{ color: '#6E9BE0', marginBottom: 8 }}>{m.ic}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>{m.t}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{m.d}</div>
            </div>
          ))}
        </div>
      </div>
    </FBBlue>
  );
};


// === Banner E · Trazabilidad / flujo =======================================

const BannerFlujo = () => {
  const steps = [
    { n: '1', t: 'El vecino\nreporta' },
    { n: '2', t: 'La IA\nasigna' },
    { n: '3', t: 'La cuadrilla\nresuelve' },
    { n: '4', t: 'Se notifica\nal vecino' },
  ];
  return (
    <FBBlue>
      <div style={{ position: 'absolute', top: 28, left: 44 }}>
        <Lockup size={38} wordSize={28} color="white" gap={12}/>
      </div>
      <div style={{ position: 'absolute', left: 44, right: 44, top: 96, bottom: 30 }}>
        <span className="display" style={{ fontSize: 40, lineHeight: 1.0 }}>
          Trazabilidad <span style={{ color: '#6E9BE0' }}>total.</span>
        </span>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 6, marginBottom: 22 }}>
          Del celular del vecino hasta la cuadrilla que resuelve — todo en tiempo real.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(110,155,224,0.18)', border: '1px solid #6E9BE0',
                  color: '#6E9BE0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                }}>{s.n}</div>
                <div style={{ fontSize: 13.5, color: 'white', fontWeight: 500, whiteSpace: 'pre-line', lineHeight: 1.15 }}>{s.t}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, rgba(110,155,224,0.5), rgba(110,155,224,0.15))', minWidth: 16 }}/>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </FBBlue>
  );
};


// === Banner F · En tiempo real (valor) =====================================

const BannerTiempoReal = () => {
  const chips = [
    { ic: IcBolt,  t: 'Reportes en tiempo real' },
    { ic: IcSpark, t: 'Asignación con IA' },
    { ic: IcPin,   t: 'Desde el celular del vecino' },
  ];
  return (
    <FBBlue>
      <div style={{ position: 'absolute', top: 28, left: 44 }}>
        <Lockup size={38} wordSize={28} color="white" gap={12}/>
      </div>
      <div style={{
        position: 'absolute', left: 44, right: 44, top: 88, bottom: 30,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#6E9BE0', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 10 }}>
          Software de gestión municipal
        </div>
        <span className="display" style={{ fontSize: 50, lineHeight: 1.0 }}>
          Tu municipio, <span style={{ color: '#6E9BE0' }}>en tiempo real.</span>
        </span>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          {chips.map((c, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 15px', borderRadius: 999,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(110,155,224,0.22)',
              fontSize: 14, color: 'white', fontWeight: 500,
            }}>
              <span style={{ color: '#6E9BE0', display: 'inline-flex' }}>{React.cloneElement(c.ic, { size: 16 })}</span>
              {c.t}
            </span>
          ))}
        </div>
      </div>
    </FBBlue>
  );
};

Object.assign(window, {
  FB_W, FB_H,
  BannerEditorial, BannerPromo, BannerSplit,
  BannerModulos, BannerFlujo, BannerTiempoReal,
});

// ===========================================================================
// SERIE WEB · fuente del sitio (serif romano) + mensaje oficial resumido
// ===========================================================================

const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif";

// Pill como el del sitio
const WebPill = ({ children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 9,
    padding: '7px 15px 7px 12px', borderRadius: 999,
    background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(14,24,48,0.10)',
    fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 500,
  }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--logo-navy)' }}/>
    {children}
  </span>
);

// === Variante 1 · Hero (espejo del sitio) ==================================

const BannerWebHero = () => (
  <FBShell extra={<FBPaper/>}>
    <div style={{ position: 'absolute', top: 26, left: 44 }}>
      <Lockup size={38} wordSize={28} gap={12}/>
    </div>
    <div style={{ position: 'absolute', left: 44, right: 44, top: 92, bottom: 30 }}>
      <div style={{ marginBottom: 14 }}><WebPill>Software de gestión municipal · Argentina</WebPill></div>
      <div style={{
        fontFamily: SERIF, fontWeight: 500, fontSize: 46, lineHeight: 1.04,
        color: 'var(--ink)', letterSpacing: '-0.01em',
      }}>
        Gestión municipal para Argentina, <span style={{ color: 'var(--logo-navy)' }}>por fin Munify.</span>
      </div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 16, color: 'var(--ink-soft)', marginTop: 14, maxWidth: 720, lineHeight: 1.4 }}>
        Reclamos, trámites, tesorería y atención al ciudadano — en una sola plataforma.
      </div>
    </div>
  </FBShell>
);

// === Variante 2 · Servicios ================================================

const BannerWebServicios = () => (
  <FBShell extra={<FBPaper/>}>
    <div style={{ position: 'absolute', top: 26, left: 44 }}>
      <Lockup size={38} wordSize={28} gap={12}/>
    </div>
    <div style={{ position: 'absolute', left: 44, right: 44, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ height: 28 }}/>
      <div style={{
        fontFamily: SERIF, fontWeight: 500, fontSize: 50, lineHeight: 1.05,
        color: 'var(--ink)', letterSpacing: '-0.01em',
      }}>
        Todo tu municipio, <span style={{ color: 'var(--logo-navy)' }}>online.</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {['Reclamos vecinales', 'Trámites digitales', 'Tesorería', 'Atención al ciudadano'].map((t, i) => (
          <span key={i} style={{
            fontFamily: 'var(--sans)', fontSize: 14.5, fontWeight: 500, color: 'var(--ink)',
            padding: '9px 16px', borderRadius: 999, background: 'rgba(14,24,48,0.06)',
          }}>{t}</span>
        ))}
      </div>
    </div>
  </FBShell>
);

// === Variante 3 · Tiempo real / IA =========================================

const BannerWebIA = () => (
  <FBShell bg="var(--cream-2)" extra={<FBPaper/>}>
    <div style={{ position: 'absolute', top: 26, left: 44 }}>
      <Lockup size={38} wordSize={28} gap={12}/>
    </div>
    <div style={{ position: 'absolute', left: 44, right: 44, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ height: 24 }}/>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-mute)', fontWeight: 600, letterSpacing: '.13em', textTransform: 'uppercase', marginBottom: 10 }}>
        Reportes en tiempo real · IA
      </div>
      <div style={{
        fontFamily: SERIF, fontWeight: 500, fontSize: 44, lineHeight: 1.05,
        color: 'var(--ink)', letterSpacing: '-0.01em',
      }}>
        Del celular del vecino <span style={{ color: 'var(--logo-navy)' }}>a la cuadrilla que resuelve.</span>
      </div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 15.5, color: 'var(--ink-soft)', marginTop: 14, maxWidth: 730, lineHeight: 1.4 }}>
        Asignación automática con IA y trazabilidad total — de punta a punta.
      </div>
    </div>
  </FBShell>
);

Object.assign(window, { BannerWebHero, BannerWebServicios, BannerWebIA });
