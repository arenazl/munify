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
