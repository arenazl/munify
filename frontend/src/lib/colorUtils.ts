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

/**
 * Relación de contraste WCAG entre dos colores (1 = iguales, 21 = negro/blanco).
 *
 * Usa la luminancia RELATIVA de la norma —con la corrección gamma—, que no es
 * lo mismo que `luminance()` de acá arriba: esa es el promedio ponderado rápido
 * que sirve para decidir "claro u oscuro", y da otro número.
 */
export function contraste(a: string, b: string): number {
  const rel = (hex: string): number => {
    const canal = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, bb] = hexToRgb(hex);
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(bb);
  };
  const [l1, l2] = [rel(a), rel(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Empuja `color` hasta que se LEE sobre `fondo`.
 *
 * Existe porque "el acento un 14% más oscuro" no es una garantía: con un azul
 * alcanza y con un amarillo no —un amarillo oscurecido sigue siendo amarillo
 * claro—, y ahí el texto sobre el tinte del acento queda ilegible. Esto no
 * cambia el TONO, sólo lo oscurece (o aclara, en tema oscuro) lo necesario.
 *
 * Si ni al máximo llega al objetivo, devuelve el extremo: un gris muy oscuro o
 * uno muy claro. Preferimos perder el color antes que perder la lectura.
 */
export function contrastar(color: string, fondo: string, sobreClaro: boolean,
                           objetivo = 4.5): string {
  let actual = color;
  for (let paso = 0; paso <= 20; paso++) {
    if (contraste(actual, fondo) >= objetivo) return actual;
    actual = sobreClaro ? darken(color, paso * 5) : lighten(color, paso * 5);
  }
  return sobreClaro ? '#1a1a1a' : '#f5f5f5';
}
