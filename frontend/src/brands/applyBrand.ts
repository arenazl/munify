import { BRAND } from './index';

/**
 * Aplica el branding al documento en runtime: <title>, theme-color y favicon.
 *
 * `index.html` es estático y trae la marca Munify (por SEO). Esto lo re-marca
 * según `VITE_BRAND` en el arranque, sin necesitar un HTML distinto por marca.
 * Para 'munify' es un no-op efectivo (deja lo que ya trae el HTML).
 */
export function applyBrand(): void {
  if (typeof document === 'undefined') return;

  document.title = BRAND.title;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', BRAND.primary);

  // Tema fijo de marca: identidad de color propia desde el arranque. Seteamos
  // las CSS vars del tema al color del brand, así el shell (nombre con
  // gradiente, acentos) ya nace con la marca sin depender de que cargue el
  // municipio. Munify no setea `fixedTheme` → tema dinámico por muni, como hoy.
  if (BRAND.fixedTheme) {
    const root = document.documentElement;
    root.style.setProperty('--munify-primary', BRAND.primary);
    root.style.setProperty('--munify-hover', BRAND.accent || BRAND.primary);
    // Fuente propia de la marca (identidad tipográfica).
    if (BRAND.nameFont && !document.getElementById('brand-font')) {
      const link = document.createElement('link');
      link.id = 'brand-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap';
      document.head.appendChild(link);
    }
  }

  // Favicon propio de la marca (si tiene logo). Munify deja el de index.html.
  if (BRAND.logoSrc) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = BRAND.logoSrc;
  }
}
