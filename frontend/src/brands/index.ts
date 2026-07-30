// Sistema de marca (white-label) — UN solo codebase, N marcas por configuración.
//
// La marca activa se elige por la variable de entorno de BUILD `VITE_BRAND`.
// Cada site de Netlify se buildea del MISMO repo con distinta `VITE_BRAND`:
//   - VITE_BRAND=munify           -> app.munify.com.ar
//   - VITE_BRAND=paraguay-limpio  -> el site white-label (Asunción)
//
// ADITIVO Y SEGURO: sin `VITE_BRAND` (o valor desconocido) cae en 'munify' =
// comportamiento actual, cero cambios. Así Munify no se toca y la marca nueva
// hereda TODO el código (cada mejora de Munify le llega en el próximo build).

export interface Brand {
  id: string;
  /** Nombre visible de la app (sidebar, textos del shell). */
  name: string;
  /** <title> de la pestaña del navegador. */
  title: string;
  /** Bajada corta (para metas / pantallas de marca). */
  tagline?: string;
  /** Logo raster propio (marcas white-label). Si es null, se usa el SVG MunifyLogo. */
  logoSrc?: string | null;
  /** Color primario de la marca (theme-color del navegador + acento del shell). */
  primary: string;
  /** Acento secundario. */
  accent?: string;
  /** White-label monolítico: código del municipio único. En white-label el
   *  acceso entra directo a este muni (no hay generador de demos ni grilla). */
  municipioCodigo?: string;
}

const BRANDS: Record<string, Brand> = {
  munify: {
    id: 'munify',
    name: 'Munify',
    title: 'Munify - Sistema de Gestión Municipal',
    tagline: 'Reclamos, trámites y seguimiento en tiempo real.',
    logoSrc: null,
    primary: '#3b82f6',
    accent: '#22c55e',
  },
  'paraguay-limpio': {
    id: 'paraguay-limpio',
    name: 'Paraguay Limpio',
    title: 'Paraguay Limpio · Asunción',
    tagline: 'Tu ciudad más limpia. Reportá y seguí tus reclamos.',
    logoSrc: '/brands/paraguay-limpio/logo.png',
    primary: '#1b7a3d',   // verde oscuro del logo
    accent: '#5cb85c',    // verde claro del logo
    municipioCodigo: 'asuncion',
  },
};

// Mapa dominio -> marca. Un solo build sirve a TODOS los dominios y elige la
// marca por el host (sin env var por site). Infra bindea el mismo repo/branch a
// cada dominio y listo. Fallback: VITE_BRAND (build) y por último 'munify'.
const HOST_TO_BRAND: Record<string, string> = {
  'paraguay-limpio.netlify.app': 'paraguay-limpio',
};

function resolveBrandId(): string {
  if (typeof window !== 'undefined') {
    const byHost = HOST_TO_BRAND[window.location.hostname];
    if (byHost && BRANDS[byHost]) return byHost;
  }
  const env = (import.meta.env.VITE_BRAND as string | undefined)?.trim();
  if (env && BRANDS[env]) return env;
  return 'munify';
}

export const BRAND: Brand = BRANDS[resolveBrandId()] || BRANDS.munify;
export const IS_WHITE_LABEL = BRAND.id !== 'munify';
