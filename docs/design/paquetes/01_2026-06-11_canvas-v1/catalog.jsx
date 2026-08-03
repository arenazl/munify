// Catalog cards for WhatsApp Business — 1080x1080 each.
// Each follows the Munify website template:
//   logo top-left · pill top-right · big italic serif headline · subtitle · footer

const CARD = 1080;
const PAD = 88;

// === Reusable card chrome ==================================================

const Card = ({ children, bg = 'var(--cream)', extra = null }) => (
  <div style={{
    width: CARD, height: CARD, background: bg,
    position: 'relative', overflow: 'hidden',
    fontFamily: 'var(--sans)',
    color: 'var(--ink)',
  }}>
    {extra}
    {children}
  </div>
);

const CardHeader = ({ left, right, color = 'var(--ink)' }) => (
  <div style={{
    position: 'absolute', top: 48, left: PAD, right: PAD,
    display: 'flex', alignItems: 'center', gap: 16,
    color,
  }}>
    <div style={{ flex: '0 0 auto' }}>{left}</div>
    <div style={{ flex: 1 }}/>
    <div style={{ flex: '0 0 auto' }}>{right}</div>
  </div>
);

const CardFooter = ({ children, color = 'var(--ink-soft)' }) => (
  <div style={{
    position: 'absolute', bottom: 56, left: PAD, right: PAD,
    display: 'flex', alignItems: 'center', gap: 16,
    color, fontSize: 18,
  }}>
    {children}
  </div>
);

// Watermark grid (very subtle, behind everything) — adds texture like the site bg
const PaperTexture = () => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background:
      'radial-gradient(ellipse at top right, rgba(255,255,255,0.55), transparent 55%),' +
      'radial-gradient(ellipse at bottom left, rgba(14,24,48,0.04), transparent 60%)',
  }}/>
);


// === 1. COVER / WELCOME ====================================================

const CoverCard = () => (
  <Card extra={<PaperTexture/>}>
    <CardHeader
      left={<Lockup size={56} wordSize={32}/>}
      right={<Bullet>Argentina · 2026</Bullet>}
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 240, bottom: 240,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <span className="display" style={{
        fontSize: 140, lineHeight: 1.0, color: 'var(--ink)',
      }}>
        Software<br/>de gestión<br/>
        <span style={{ color: 'var(--ink-2)' }}>municipal.</span>
      </span>
      <div style={{ height: 40 }}/>
      <div style={{ fontSize: 26, color: 'var(--ink-soft)', maxWidth: 720, lineHeight: 1.35 }}>
        Reclamos vecinales, trámites online, tesorería e IA — en una sola plataforma para Argentina.
      </div>
    </div>
    <CardFooter>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 600 }}>munify.com.ar</div>
        <div style={{ marginTop: 4, fontSize: 15, color: 'var(--ink-mute)' }}>+54 9 11 6022 3474</div>
      </div>
      <ButtonPrimary big>Solicitar demo</ButtonPrimary>
    </CardFooter>
  </Card>
);


// === 2. COMBO PROMO (hero of catalog) ======================================

const ComboCard = () => (
  <Card bg="var(--ink)">
    {/* Subtle warm radial */}
    <div style={{
      position: 'absolute', inset: 0,
      background:
        'radial-gradient(circle at 80% 20%, rgba(200,162,78,0.18), transparent 50%),' +
        'radial-gradient(circle at 10% 90%, rgba(26,38,71,0.6), transparent 60%)',
    }}/>
    <CardHeader
      left={<Lockup size={56} wordSize={32} color="white"/>}
      right={
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 14px 7px 12px', borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.18)',
          fontSize: 13, color: 'rgba(255,255,255,0.85)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }}/>
          Promo activa
        </span>
      }
      color="white"
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 200, bottom: 220, color: 'white',
    }}>
      <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.6)', letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600 }}>
        Combo · 3 módulos
      </div>
      <div style={{ height: 24 }}/>
      <span className="display" style={{
        fontSize: 126, lineHeight: 1.02, color: 'white',
        display: 'block',
      }}>Un mes,</span>
      <span className="display" style={{
        fontSize: 126, lineHeight: 1.02, color: 'var(--accent)',
        display: 'block', marginTop: 4,
      }}>invita la casa.</span>
      <div style={{ height: 44 }}/>
      <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.75)', maxWidth: 780, lineHeight: 1.4 }}>
        Probá los tres módulos — Reclamos, Trámites y Tesorería — durante 30 días. Sin tarjeta de crédito, sin compromiso, con tus datos reales.
      </div>
    </div>
    <CardFooter color="rgba(255,255,255,0.7)">
      <div style={{ flex: 1, fontSize: 17 }}>
        Implementación en 1–2 semanas · Capacitación incluida
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '16px 28px', borderRadius: 999,
        background: 'white', color: 'var(--ink)',
        fontSize: 16, fontWeight: 600,
      }}>Quiero la promo <span>→</span></span>
    </CardFooter>
  </Card>
);


// === Module card template (Reclamos / Trámites / Tesorería) ================

const ModuleCard = ({
  pillText, headline, subhead, urlPath,
  features = [], badge = null, accentLine = null,
}) => (
  <Card extra={<PaperTexture/>}>
    <CardHeader
      left={<Lockup size={48} wordSize={28}/>}
      right={<Bullet>{pillText}</Bullet>}
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 200, bottom: 220,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      {badge && <div style={{ marginBottom: 24 }}>{badge}</div>}
      <span className="display" style={{
        fontSize: 106, lineHeight: 1.04, color: 'var(--ink)',
      }}>{headline}</span>
      <div style={{ height: 44 }}/>
      <div style={{ fontSize: 24, color: 'var(--ink-soft)', maxWidth: 800, lineHeight: 1.4 }}>
        {subhead}
      </div>
      {features.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 36, flexWrap: 'wrap' }}>
          {features.map((f, i) => (
            <span key={i} style={{
              padding: '8px 16px', borderRadius: 999,
              background: 'rgba(14,24,48,0.06)',
              fontSize: 16, color: 'var(--ink)',
              fontWeight: 500,
            }}>{f}</span>
          ))}
        </div>
      )}
    </div>
    <CardFooter>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600 }}>munify.com.ar{urlPath}</div>
        <div style={{ marginTop: 4, fontSize: 14, color: 'var(--ink-mute)' }}>WhatsApp +54 9 11 6022 3474</div>
      </div>
      <ButtonPrimary>Probar demo</ButtonPrimary>
    </CardFooter>
  </Card>
);


// === 3. RECLAMOS VECINALES =================================================

const ReclamosCard = () => (
  <ModuleCard
    pillText="Módulo · Reclamos vecinales"
    headline={<>Reclamos vecinales, <span style={{ color: 'var(--ink-soft)' }}>trazables de punta a punta.</span></>}
    subhead="El vecino reporta con foto y GPS, el municipio asigna a la cuadrilla y todos ven el estado en tiempo real."
    urlPath="/reclamos-vecinales"
    features={['App vecino gratis', 'Mapa + hotspots', 'Asignación con IA', 'Notificaciones automáticas']}
  />
);


// === 4. TRÁMITES MUNICIPALES ===============================================

const TramitesCard = () => (
  <ModuleCard
    pillText="Módulo · Trámites municipales"
    headline={<>Trámites <span style={{ color: 'var(--ink-soft)' }}>online,</span> con validez oficial.</>}
    subhead="Habilitaciones, libre deuda, licencias y más, desde el celular. Validación biométrica vía RENAPER incluida."
    urlPath="/tramites-municipales"
    features={['Validación RENAPER', 'Pago online', 'Mostrador asistido', 'Firma digital']}
  />
);


// === 5. TESORERÍA MUNICIPAL (NUEVO) ========================================

const TesoreriaCard = () => (
  <ModuleCard
    pillText="Módulo · Tesorería"
    badge={<NuevoBadge/>}
    headline={<>Tesorería <span style={{ color: 'var(--ink-soft)' }}>al día,</span> sin más planillas.</>}
    subhead="Cada gasto imputado a su proyecto, fondo y caja. El intendente ve a dónde va la plata, mes a mes."
    urlPath="/tesoreria"
    features={['Categorización con IA', 'Fondos · proyectos', 'Proyecciones 30/60/90', 'Importa tu Excel']}
  />
);


// === 6. VALIDACIÓN RENAPER (diferenciador) =================================

const RenaperCard = () => (
  <Card bg="var(--cream-2)" extra={<PaperTexture/>}>
    <CardHeader
      left={<Lockup size={48} wordSize={28}/>}
      right={<Bullet>Diferenciador</Bullet>}
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 180, bottom: 220,
    }}>
      <span className="display" style={{
        fontSize: 116, lineHeight: 1.02, color: 'var(--ink)',
        display: 'block',
      }}>
        Validación<br/>
        <span style={{ color: 'var(--ink-2)' }}>biométrica</span><br/>
        oficial.
      </span>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 40, marginTop: 48,
      }}>
        <div style={{ flex: 1, fontSize: 22, color: 'var(--ink-soft)', lineHeight: 1.4, maxWidth: 460 }}>
          Integración directa con <strong style={{ color: 'var(--ink)' }}>RENAPER</strong>. DNI + selfie con prueba de vida, validado contra el registro nacional en menos de 30 segundos.
        </div>
        <div style={{ flexShrink: 0 }}>
          <DniIllustration size={340}/>
        </div>
      </div>
    </div>
    <CardFooter>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600 }}>Validez gubernamental garantizada</div>
        <div style={{ marginTop: 4, fontSize: 14, color: 'var(--ink-mute)' }}>
          Licencias · habilitaciones · libre deuda
        </div>
      </div>
      <ButtonPrimary>Ver cómo funciona</ButtonPrimary>
    </CardFooter>
  </Card>
);


// === Plan card template ====================================================

const PlanCard = ({ tier, range, headline, features, highlight = false }) => (
  <Card bg={highlight ? 'var(--ink)' : 'var(--cream)'} extra={!highlight ? <PaperTexture/> : null}>
    {highlight && (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 80% 20%, rgba(200,162,78,0.18), transparent 55%)',
      }}/>
    )}
    <CardHeader
      left={<Lockup size={48} wordSize={28} color={highlight ? 'white' : 'var(--ink)'}/>}
      right={
        highlight ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 14px 7px 12px', borderRadius: 999,
            background: 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.2)',
            fontSize: 13, color: 'rgba(255,255,255,0.9)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }}/>
            Más elegido
          </span>
        ) : <Bullet>Plan · {tier}</Bullet>
      }
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 200, bottom: 200,
      color: highlight ? 'white' : 'var(--ink)',
    }}>
      <div style={{
        fontSize: 20, color: highlight ? 'rgba(255,255,255,0.6)' : 'var(--ink-mute)',
        letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600,
      }}>
        Plan {tier}
      </div>
      <div style={{ height: 16 }}/>
      <span className="display" style={{
        fontSize: 118, lineHeight: 1.02, display: 'block',
        color: highlight ? 'white' : 'var(--ink)',
      }}>
        {headline}
      </span>
      <div style={{ height: 16 }}/>
      <div style={{
        fontSize: 22, color: highlight ? 'rgba(255,255,255,0.7)' : 'var(--ink-soft)',
      }}>{range}</div>

      <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {features.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            fontSize: 20,
            color: highlight ? 'rgba(255,255,255,0.95)' : 'var(--ink)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', marginTop: 12,
              background: highlight ? 'var(--accent)' : 'var(--ink)',
              flexShrink: 0,
            }}/>
            {f}
          </div>
        ))}
      </div>
    </div>
    <CardFooter color={highlight ? 'rgba(255,255,255,0.7)' : 'var(--ink-soft)'}>
      <div style={{ flex: 1, fontSize: 16 }}>
        Precio a confirmar · Pesos argentinos
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '14px 24px', borderRadius: 999,
        background: highlight ? 'white' : 'var(--ink)',
        color: highlight ? 'var(--ink)' : 'white',
        fontSize: 15, fontWeight: 600,
      }}>Pedir cotización <span>→</span></span>
    </CardFooter>
  </Card>
);


// === 7-9. PLANES ===========================================================

const PlanEstandarCard = () => (
  <PlanCard
    tier="Estándar"
    range="Municipios hasta 20.000 habitantes"
    headline={<>Para arrancar <span style={{ color: 'var(--ink-soft)' }}>bien.</span></>}
    features={[
      'Reclamos vecinales online',
      'Trámites básicos',
      'App vecinos iOS + Android',
      'Panel web · Soporte email + WhatsApp',
    ]}
  />
);

const PlanExpressCard = () => (
  <PlanCard
    tier="Express"
    range="20.000 a 100.000 habitantes"
    headline={<><span style={{ color: 'var(--accent)' }}>El más</span> elegido.</>}
    features={[
      'Todo lo del plan Estándar',
      'Trámites ilimitados · múltiples dependencias',
      'Reportes avanzados · Chat IA',
      'Soporte prioritario 24/7',
    ]}
    highlight
  />
);

const PlanPremiumCard = () => (
  <PlanCard
    tier="Premium"
    range="Ciudades de +100.000 habitantes"
    headline={<>A <span style={{ color: 'var(--ink-soft)' }}>medida.</span></>}
    features={[
      'Todo lo del plan Express',
      'Integración con sistemas legacy',
      'Capacitación en sitio · usuarios ilimitados',
      'SLA garantizado · personalización completa',
    ]}
  />
);


// === 11. SOPORTE 24/7 ======================================================

const SoporteCard = () => (
  <Card bg="var(--cream-2)" extra={<PaperTexture/>}>
    <CardHeader
      left={<Lockup size={48} wordSize={28}/>}
      right={<Bullet dotColor="#4070C0">Soporte · 24/7</Bullet>}
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 180, bottom: 220,
    }}>
      <span className="display" style={{
        fontSize: 124, lineHeight: 1.02, color: 'var(--ink)', display: 'block',
      }}>
        Acá estamos.<br/>
        <span style={{ color: 'var(--logo-navy)' }}>Siempre.</span>
      </span>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 40, marginTop: 56,
      }}>
        <div style={{ flex: 1, fontSize: 22, color: 'var(--ink-soft)', lineHeight: 1.45, maxWidth: 480 }}>
          WhatsApp, llamada o email. Atendemos a tu municipio <strong style={{ color: 'var(--ink)' }}>sin horarios, sin feriados</strong> — y sin tickets que esperan tres días.
        </div>
        <div style={{ flexShrink: 0 }}>
          <ChatIllustration size={340}/>
        </div>
      </div>
    </div>
    <CardFooter>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600 }}>WhatsApp +54 9 11 6022 3474</div>
        <div style={{ marginTop: 4, fontSize: 14, color: 'var(--ink-mute)' }}>
          Respuesta en menos de 10 minutos · Plan Express y Premium
        </div>
      </div>
      <ButtonPrimary>Escribirnos ahora</ButtonPrimary>
    </CardFooter>
  </Card>
);


// === 12. DEMO CTA (autogestiva) ============================================

const DemoCard = () => (
  <Card extra={<PaperTexture/>}>
    <CardHeader
      left={<Lockup size={48} wordSize={28}/>}
      right={<Bullet>Demo · en un clic</Bullet>}
    />
    <div style={{
      position: 'absolute', left: PAD, right: PAD, top: 200, bottom: 220,
    }}>
      <div style={{ fontSize: 22, color: 'var(--ink-mute)', letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}>
        Sin coordinar nada
      </div>
      <div style={{ height: 24 }}/>
      <span className="display" style={{
        fontSize: 124, lineHeight: 1.02, color: 'var(--ink)', display: 'block',
      }}>
        Creá tu demo,<br/>
        <span style={{ color: 'var(--logo-navy)' }}>vos mismo.</span>
      </span>
      <div style={{ height: 40 }}/>
      <div style={{ fontSize: 24, color: 'var(--ink-soft)', maxWidth: 800, lineHeight: 1.4 }}>
        Un clic y estás adentro. Probá Munify con los datos de tu municipio — gratis, sin tarjeta, hoy mismo.
      </div>
    </div>
    <CardFooter>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--ink)', fontSize: 17, fontWeight: 600 }}>app.munify.com.ar/demo</div>
        <div style={{ marginTop: 4, fontSize: 14, color: 'var(--ink-mute)' }}>
          O escribinos: +54 9 11 6022 3474
        </div>
      </div>
      <ButtonPrimary big>Crear mi demo</ButtonPrimary>
    </CardFooter>
  </Card>
);

Object.assign(window, {
  CARD,
  CoverCard, ComboCard,
  ReclamosCard, TramitesCard, TesoreriaCard,
  RenaperCard, SoporteCard,
  PlanEstandarCard, PlanExpressCard, PlanPremiumCard,
  DemoCard,
});
