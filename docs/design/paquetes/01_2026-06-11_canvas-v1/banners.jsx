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

Object.assign(window, {
  FB_W, FB_H,
  BannerEditorial, BannerPromo, BannerSplit,
});
