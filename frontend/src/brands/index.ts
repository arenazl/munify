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

import type { ComponentType } from 'react';
import type { ThemeVariant } from '../config/themePresets';
import { ParaguayLimpioLogo } from './ParaguayLimpioLogo';

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
  /** Mono-tenant: código del municipio único. Si está presente, la marca entra
   *  directo a este muni (no hay generador de demos ni grilla): el ruteo cerrado
   *  se DERIVA de esta propiedad, no de un flag "soy white-label". */
  municipioCodigo?: string;
  /** Logo como componente SVG (editable, fondo transparente). Preferido sobre logoSrc. */
  Logo?: ComponentType<{ size?: number; className?: string; title?: string }>;
  /** Carpeta (relativa a /public) con los iconos PWA propios de la marca:
   *  icon-*.png, apple-touch-icon.png, icon-maskable-512x512.png. Si se setea,
   *  el manifest dinámico + el apple-touch-icon usan ESTOS (así la PWA se
   *  instala con el logo de la marca, no el de Munify). Munify no lo setea. */
  iconPath?: string;
  /** Fuente propia para el nombre de la marca (identidad tipográfica). */
  nameFont?: string;
  /** Layout de la pantalla de login. 'split' = hero de marca + panel de acceso;
   *  'centered' (default, sin setear) = login clásico de Munify centrado. */
  loginLayout?: 'split' | 'centered';
  /** Identidad de color FIJA: el tema NO es dinámico por municipio, es el color
   *  de la marca desde el arranque. Se modela con un booleano explícito (y no se
   *  deriva de `municipioCodigo`) a propósito: "ruteo mono-tenant" y "tema fijo"
   *  son conceptos distintos y quedan desacoplados (una marca podría querer uno
   *  sin el otro). Munify no lo setea → tema dinámico por muni, como hoy. */
  fixedTheme?: boolean;
  /** Preset de tema por defecto de la marca (solo si `fixedTheme`). Deriva el
   *  look completo (fondo/sidebar/cards), no sólo el acento. Munify no lo setea
   *  → sigue el default global (carbon-vsc) o el tema_config del municipio. */
  themePresetId?: string;
  /** Variante (tonalidad del sidebar) del preset de marca. Default: 'vintage'. */
  themeVariant?: ThemeVariant;
  /** Presets que la marca OFRECE en su selector (solo si `fixedTheme`). Permite
   *  que el usuario alterne, p.ej., entre la versión clara y la oscura del
   *  mismo acento de marca. Si no se setea, el selector muestra los presets
   *  activos normales (colección de Munify). */
  themePresetIds?: string[];
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
    logoSrc: null,        // usa el SVG editable, no un PNG con fondo blanco
    Logo: ParaguayLimpioLogo,
    iconPath: 'brand/paraguay-limpio', // iconos PWA propios (fondo verde + hoja)
    nameFont: "'Plus Jakarta Sans', system-ui, sans-serif",
    primary: '#1b7a3d',   // verde oscuro del logo
    accent: '#5cb85c',    // verde claro del logo
    municipioCodigo: 'asuncion',
    loginLayout: 'split', // hero de marca + panel de acceso
    fixedTheme: true,     // identidad verde fija (no dinámica por municipio)
    themePresetId: 'onix-verde', // Onix (casi-negro) con el verde del logo
    themeVariant: 'vintage',     // sidebar casi-negro (#222226)
    themePresetIds: ['onix-verde', 'nieve-verde'], // el user alterna oscuro/claro
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
