// ============================================================
// Marca Munify para los reels de promoción (formato Facebook 9:16)
// Tokens sampleados del banner oficial (munify/_fb-split-navy.html y
// munify/brand.css). NO inventar colores: si cambia la marca, se
// actualiza acá y todos los reels heredan.
// ============================================================

export const BRAND = {
  // Superficies navy
  ink: '#0E1830',     // fondo principal
  ink2: '#1A2647',    // navy accent
  navy: '#103070',    // M exterior del logo
  azure: '#4070C0',   // diagonal interior del logo
  // Acentos
  gold: '#C8A24E',    // dorado de marca (tagline, CTA)
  cream: '#F1EAD8',   // texto crema
  cream2: '#EADFC5',
  white: '#FFFFFF',
  // Código de color por módulo (igual que el banner FB)
  reclamos: '#1FC591',   // verde
  tramites: '#5B9BFF',   // azul
  tesoreria: '#D8B25E',  // gold suave
  turnos: '#A78BFA',     // violeta
  ia: '#34D399',         // teal IA / WhatsApp
  soporte: '#E2D5B5',
} as const;

export const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
export const FONT_SANS = "'Inter', system-ui, -apple-system, sans-serif";

// Link de Google Fonts (Fraunces italic var + Inter) que se inyecta en la página.
export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500;1,9..144,600&family=Inter:wght@400;500;600;700;800&display=swap';

// Glow de fondo idéntico al banner navy (gold arriba-der, navy abajo-izq, azure)
export const GLOW_BG = `
  radial-gradient(circle at 86% 14%, rgba(200,162,78,0.20), transparent 46%),
  radial-gradient(circle at 6% 96%, rgba(26,38,71,0.75), transparent 55%),
  radial-gradient(circle at 72% 92%, rgba(64,112,192,0.12), transparent 50%)
`;

// Lienzo del reel: vertical 9:16 a resolución de export FB.
export const REEL_W = 1080;
export const REEL_H = 1920;
