/**
 * Carga dinamica de Google Fonts.
 *
 * Inyecta un <link rel="stylesheet"> en el <head> con el `href` del
 * preset. Si ya esta cargado, no duplica. Es idempotente.
 */

import { fontPresets, getFontPreset, type FontPreset } from '../config/fontPresets';

const ATTR = 'data-font-preset-id';

export function loadGoogleFont(idOrPreset: string | FontPreset): FontPreset {
  const preset = typeof idOrPreset === 'string' ? getFontPreset(idOrPreset) : idOrPreset;

  // Si ya esta inyectado, no hacer nada
  const existing = document.querySelector(`link[${ATTR}="${preset.id}"]`);
  if (existing) return preset;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = preset.googleHref;
  link.setAttribute(ATTR, preset.id);
  document.head.appendChild(link);

  return preset;
}

/** Precarga el preset activo apenas se conoce el id (no espera al render) */
export function applyFontFamily(fontId: string | undefined | null) {
  const preset = getFontPreset(fontId);
  loadGoogleFont(preset);
  document.documentElement.style.setProperty('--app-font-family', preset.family);
  document.body.style.fontFamily = preset.family;
  return preset;
}

export { fontPresets };
