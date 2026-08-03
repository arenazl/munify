// Shared Munify brand pieces.

// Logo mark — the official Munify hexagonal M.
// Two colors: `main` (the outer M and bars) and `accent` (inner diagonal stroke).
// Auto-pairs sensible variants for dark / light backgrounds.
const LogoMark = ({ size = 36, main, accent, variant = 'auto', centerHex = false }) => {
  // variant: 'light' (for cream/light bg) | 'dark' (for navy/dark bg) | 'auto'
  // centerHex: when true, use a viewBox symmetric around the hexagon's center
  //   so the dense mass sits dead-center (for standalone / profile use). When
  //   false (default), tight viewBox — best for the inline lockup.
  let _main = main;
  let _accent = accent;
  if (!_main) _main = variant === 'dark' ? '#FFFFFF' : 'var(--logo-navy)';
  if (!_accent) _accent = variant === 'dark' ? 'var(--logo-azure)' : 'var(--logo-azure)';
  // Hexagon spans x[0,1271.65] (center 635.8); swoosh tip reaches x=1446.79.
  // Symmetric box around 635.8 → left = -175.14, width = 1621.93.
  const vb = centerHex ? '-175.14 0 1621.93 1426' : '0 0 1446.79 1426';
  const ratio = centerHex ? 1426 / 1621.93 : 1426 / 1446.79;
  return (
    <svg width={size} height={size * ratio} viewBox={vb}
         style={{ display: 'block', overflow: 'visible' }}>
      {/* Outer hexagonal M */}
      <polygon
        fill={_main}
        points="1271.65 371.24 1271.65 1069.5 635.82 1426 0 1069.5 0 356.5 635.82 0 1128.59 276.29 1000.48 381.26 636.9 177.4 160.18 444.69 160.18 979.27 636.9 1246.56 1113.62 979.27 1113.62 544.87 1271.65 371.24"/>
      {/* Inner diagonal azure highlight */}
      <polygon
        fill={_accent}
        points="1446.79 79.97 1225.77 330.78 1113.62 458.05 644.86 989.99 448.06 781.76 448.06 568.98 637.63 759.38 1052.94 410.67 1179.19 304.66 1446.79 79.97"/>
      {/* Left inner leg */}
      <polygon
        fill={_main}
        points="404.64 517.83 404.64 1037.89 253.8 953.49 253.8 500.38 332.09 454.86 404.64 517.83"/>
      {/* Right inner leg */}
      <polygon
        fill={_main}
        points="1020.14 650.78 1020.14 954.08 867.22 1039.31 868.09 818.95 1020.14 650.78"/>
    </svg>
  );
};

// "Munify" wordmark (just the word, in display roman or italic)
const Wordmark = ({ size = 32, color = 'var(--ink)', style = 'roman' }) => (
  <span
    className={style === 'italic' ? 'display' : 'display-roman'}
    style={{ fontSize: size, color, lineHeight: 1, fontWeight: 500 }}>
    Munify
  </span>
);

// Lockup: mark + wordmark side by side.
// `color` = wordmark color. Mark uses official colors on light bg, inverts on dark.
const Lockup = ({ size = 36, color = 'var(--ink)', gap = 10, wordSize }) => {
  const isLight = color === 'white' || color === '#fff' || color === '#FFFFFF';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <LogoMark size={size} variant={isLight ? 'dark' : 'light'}/>
      <Wordmark size={wordSize || size * 0.85} color={color} style="roman"/>
    </span>
  );
};

// Small bullet pill (like "● Software de gestión municipal · Argentina")
const Bullet = ({ children, dotColor = 'var(--ink)', tone = 'cream' }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '7px 14px 7px 12px',
    borderRadius: 999,
    background: tone === 'cream' ? 'rgba(255,255,255,0.55)' : 'transparent',
    border: tone === 'cream' ? '1px solid rgba(14,24,48,0.08)' : '1px solid rgba(255,255,255,0.18)',
    fontFamily: 'var(--sans)', fontSize: 13,
    color: tone === 'cream' ? 'var(--ink-soft)' : 'rgba(255,255,255,0.85)',
    letterSpacing: '.01em',
  }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }}/>
    {children}
  </span>
);

// "NUEVO" pill
const NuevoBadge = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 10px', borderRadius: 999,
    background: 'var(--ink)', color: 'white',
    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
    letterSpacing: '.08em',
  }}>NUEVO</span>
);

// Dark primary button (rounded pill, navy bg, white text + arrow)
const ButtonPrimary = ({ children, big = false }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 10,
    padding: big ? '16px 28px' : '12px 22px',
    borderRadius: 999,
    background: 'var(--ink)', color: 'white',
    fontFamily: 'var(--sans)', fontSize: big ? 16 : 14, fontWeight: 600,
  }}>
    {children}
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1em',
    }}>→</span>
  </span>
);

// Ghost button (cream bg, dark border, with icon)
const ButtonGhost = ({ children, icon = null, big = false }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: big ? '15px 26px' : '11px 20px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(14,24,48,0.18)',
    color: 'var(--ink)', fontFamily: 'var(--sans)',
    fontSize: big ? 15 : 13.5, fontWeight: 500,
  }}>
    {icon}
    {children}
  </span>
);

const WhatsIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.5 12a8.5 8.5 0 1 1-15.7 4.45L4 20l3.7-.95A8.5 8.5 0 0 1 20.5 12Z"/>
    <path d="M9 10c.4 1.7 1.7 3.3 3.5 4.2.7-.2 1.3-.6 1.7-1.2.4.2 1.5.7 1.7.8.2.1.2.4 0 .7-.5.8-1.6 1.4-2.4 1.4-1.3 0-3-.7-4.3-2-1.3-1.3-2-3-2-4.3 0-.8.6-1.9 1.4-2.4.3-.2.6-.2.7 0 .1.2.6 1.3.8 1.7-.6.4-1 1-1.2 1.7Z" fill="currentColor"/>
  </svg>
);

// Renaper / DNI mini-illustration
const DniIllustration = ({ size = 200 }) => (
  <svg width={size} height={size * 0.65} viewBox="0 0 200 130" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="dni-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1A2647"/>
        <stop offset="1" stopColor="#0E1830"/>
      </linearGradient>
    </defs>
    {/* card */}
    <rect x="6" y="6" width="160" height="100" rx="10" fill="url(#dni-grad)"/>
    {/* photo placeholder */}
    <rect x="18" y="20" width="46" height="58" rx="6" fill="rgba(255,255,255,0.18)"/>
    <circle cx="41" cy="42" r="11" fill="rgba(255,255,255,0.5)"/>
    <path d="M22 78c4-10 12-15 19-15s15 5 19 15" fill="rgba(255,255,255,0.5)"/>
    {/* lines */}
    <rect x="76" y="22" width="76" height="6" rx="3" fill="rgba(255,255,255,0.35)"/>
    <rect x="76" y="34" width="60" height="4" rx="2" fill="rgba(255,255,255,0.22)"/>
    <rect x="76" y="44" width="68" height="4" rx="2" fill="rgba(255,255,255,0.22)"/>
    <rect x="76" y="56" width="52" height="4" rx="2" fill="rgba(255,255,255,0.22)"/>
    {/* chip */}
    <rect x="18" y="86" width="14" height="10" rx="2" fill="#C8A24E"/>
    {/* checkmark badge floating */}
    <circle cx="166" cy="96" r="22" fill="#0E1830" stroke="#F1EAD8" strokeWidth="4"/>
    <path d="M156 96l7 7 13-14" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Bare phone silhouette (for promo / cover)
const PhoneSilhouette = ({ width = 220, color = 'var(--ink)', alpha = 0.08 }) => (
  <svg width={width} height={width * 2} viewBox="0 0 220 440" style={{ display: 'block' }}>
    <rect x="10" y="10" width="200" height="420" rx="34" fill="none" stroke={color} strokeWidth="2" opacity={alpha + 0.2}/>
    <rect x="22" y="22" width="176" height="396" rx="24" fill={color} opacity={alpha}/>
    <rect x="86" y="30" width="48" height="10" rx="5" fill={color} opacity={alpha + 0.1}/>
  </svg>
);

// Chat / 24h support mini-illustration — WhatsApp-ish bubble with online dot
const ChatIllustration = ({ size = 200 }) => (
  <svg width={size} height={size * 0.78} viewBox="0 0 200 156" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="bubble-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1A2647"/>
        <stop offset="1" stopColor="#0E1830"/>
      </linearGradient>
    </defs>
    {/* incoming bubble (cream/white) */}
    <path d="M14 18 h92 a10 10 0 0 1 10 10 v34 a10 10 0 0 1 -10 10 h-72 l-14 12 v-12 a10 10 0 0 1 -6 -10 v-34 a10 10 0 0 1 10 -10 Z"
      fill="white" stroke="rgba(14,24,48,0.10)" strokeWidth="1.5"/>
    <rect x="26" y="32" width="68" height="4" rx="2" fill="rgba(14,24,48,0.35)"/>
    <rect x="26" y="42" width="54" height="4" rx="2" fill="rgba(14,24,48,0.22)"/>
    <rect x="26" y="52" width="60" height="4" rx="2" fill="rgba(14,24,48,0.22)"/>
    {/* outgoing bubble (navy) */}
    <path d="M68 90 h120 a10 10 0 0 1 10 10 v30 a10 10 0 0 1 -10 10 h-104 l-14 12 v-12 a10 10 0 0 1 -6 -10 v-30 a10 10 0 0 1 4 -10 Z"
      fill="url(#bubble-grad)"/>
    <rect x="84" y="104" width="86" height="4" rx="2" fill="rgba(255,255,255,0.55)"/>
    <rect x="84" y="114" width="68" height="4" rx="2" fill="rgba(255,255,255,0.35)"/>
    <rect x="84" y="124" width="76" height="4" rx="2" fill="rgba(255,255,255,0.35)"/>
    {/* online indicator on top-left avatar */}
    <circle cx="14" cy="14" r="9" fill="#4070C0" stroke="#EADFC5" strokeWidth="3"/>
    <circle cx="14" cy="14" r="3.5" fill="white"/>
    {/* tiny "24h" badge */}
    <g transform="translate(170 12)">
      <circle r="14" fill="#C8A24E"/>
      <text x="0" y="4" textAnchor="middle" fill="#0E1830"
        fontFamily="ui-sans-serif, system-ui" fontSize="11" fontWeight="700">24h</text>
    </g>
  </svg>
);

Object.assign(window, {
  LogoMark, Wordmark, Lockup, Bullet, NuevoBadge,
  ButtonPrimary, ButtonGhost, WhatsIcon,
  DniIllustration, PhoneSilhouette, ChatIllustration,
});
