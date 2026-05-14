/**
 * Sistema de fuentes (Google Fonts) — solo configurable por superadmin.
 *
 * Cada preset declara:
 *  - `id`: clave persistida.
 *  - `name`: label en el selector.
 *  - `family`: la `font-family` CSS exacta (con fallback al system stack).
 *  - `googleHref`: URL del CSS de Google Fonts (se inyecta dinamicamente
 *    solo cuando el preset esta activo — no cargamos las 9 al boot).
 *  - `weights`: pesos que usamos en la app (400 normal, 600 semibold, 700 bold).
 *
 * La carga es opt-in: ver `loadGoogleFont(preset)` en `lib/fontLoader.ts`.
 */

export interface FontPreset {
  id: string;
  name: string;
  family: string;
  googleHref: string;
  /** Texto de muestra opcional para el preview. Default: nombre de la app. */
  sample?: string;
}

export const fontPresets: FontPreset[] = [
  {
    id: 'inter',
    name: 'Inter',
    family: '"Inter", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  {
    id: 'geist',
    name: 'Geist Sans',
    family: '"Geist", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    family: '"Manrope", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap',
  },
  {
    id: 'jakarta',
    name: 'Plus Jakarta Sans',
    family: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    family: '"DM Sans", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    family: '"Space Grotesk", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
  },
  {
    id: 'sora',
    name: 'Sora',
    family: '"Sora", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    family: '"Outfit", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap',
  },
  {
    id: 'ibm-plex',
    name: 'IBM Plex Sans',
    family: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
    googleHref: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
  },
];

export const DEFAULT_FONT_ID = 'inter';

export function getFontPreset(id: string | undefined | null): FontPreset {
  return fontPresets.find(f => f.id === id) || fontPresets.find(f => f.id === DEFAULT_FONT_ID)!;
}
