/**
 * tintaLegible — colores de DATOS (cajas, categorías, dependencias) que se
 * leen sobre cualquier superficie del tema.
 *
 * El problema real (2026-08-28): la caja-tarjeta "Visa ····9594" guarda el azul
 * marino de la marca (#1a1f71) y el combo pintaba el label con ese color crudo
 * — sobre el panel oscuro del dark mode el texto desaparecía. Lo mismo pasa al
 * revés: un amarillo pálido sobre fondo claro.
 *
 * La regla es UNA y por luminancia (misma filosofía que la tinta sobre
 * acento): el color del dato se corre hacia blanco o hacia negro —conservando
 * el matiz— hasta alcanzar contraste WCAG suficiente contra la superficie
 * donde se apoya. El dato elige el matiz; el tema garantiza que se lea.
 *
 * Uso: `tintaLegible(color, superficie)` en el punto de PINTADO (los
 * componentes del kit), nunca cambiando el color guardado — el dato queda
 * intacto y el ajuste es por tema.
 */

/** #rgb / #rrggbb -> [r,g,b] 0-255, o null si no es un hex parseable. */
function hexARgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
function luminancia([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ratio de contraste WCAG entre dos luminancias (1 a 21). */
function contraste(l1: number, l2: number): number {
  const [alto, bajo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (bajo + 0.05);
}

const rgbAHex = ([r, g, b]: [number, number, number]): string =>
  '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

const mezclar = (
  [r, g, b]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
  t: number,
): [number, number, number] => [r + (r2 - r) * t, g + (g2 - g) * t, b + (b2 - b) * t];

/**
 * Devuelve `color` ajustado para leerse sobre `superficie` con al menos
 * `minContraste` (4.5:1 = texto normal WCAG AA). Si ya alcanza, vuelve tal
 * cual. Si algún valor no es hex (`var(...)`, nombres), vuelve el original:
 * fail-open, nunca rompe un render por un color raro.
 */
export function tintaLegible(color: string, superficie: string, minContraste = 4.5): string {
  const rgb = hexARgb(color);
  const fondo = hexARgb(superficie);
  if (!rgb || !fondo) return color;

  const lFondo = luminancia(fondo);
  if (contraste(luminancia(rgb), lFondo) >= minContraste) return color;

  // Superficie oscura -> correr hacia blanco; clara -> hacia negro.
  const destino: [number, number, number] = lFondo < 0.5 ? [255, 255, 255] : [0, 0, 0];
  for (let paso = 1; paso <= 20; paso++) {
    const candidato = mezclar(rgb, destino, paso / 20);
    if (contraste(luminancia(candidato), lFondo) >= minContraste) return rgbAHex(candidato);
  }
  return rgbAHex(destino);
}
