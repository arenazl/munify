/**
 * Helpers de color para el puente polimórfico de tokens (rediseño v2).
 * Derivan la paleta `--pl-*` del theme ACTIVO — así el diseño de Claude Design
 * funciona en todos los presets y marcas sin hardcodear ningún color.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16);
  return [num >> 16, (num >> 8) & 0xff, num & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1)}`;
}

/** Mezcla dos hex: ratio 0 → a, ratio 1 → b. */
export function mix(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * ratio, ag + (bg - ag) * ratio, ab + (bb - ab) * ratio);
}

export function lighten(hex: string, percent: number): string {
  return mix(hex, '#ffffff', percent / 100);
}

export function darken(hex: string, percent: number): string {
  return mix(hex, '#000000', percent / 100);
}

/** Luminancia relativa aproximada (0 oscuro → 1 claro). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.5;
}

/** hex + alpha (0..1) → rgba() string. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
