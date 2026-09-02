/**
 * Genera los iconos PWA de Paraguay Limpio desde el SVG master del isotipo.
 * Master: public/brand/paraguay-limpio.svg (opcion 1 "Fiel al original",
 * elegida por el dueño 2026-07-31 — sol + colinas + camino, transparente).
 * Salida: public/brand/paraguay-limpio/ (icon-*.png, apple-touch, maskable).
 *
 * Composicion: tile cuadrado BLANCO con el mark centrado (76% del canvas;
 * maskable al 64% para sobrevivir el recorte circular de Android). iOS no
 * soporta transparencia en apple-touch-icon, por eso el fondo solido.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'public/brand/paraguay-limpio.svg');
const OUT = path.join(ROOT, 'public/brand/paraguay-limpio');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function tile(size, contentRatio = 0.76) {
  const inner = Math.round(size * contentRatio);
  const markBuf = await sharp(MASTER, { density: 300, limitInputPixels: false })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: markBuf, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(MASTER)) { console.error('No existe ' + MASTER); process.exit(1); }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  for (const size of sizes) {
    fs.writeFileSync(path.join(OUT, `icon-${size}x${size}.png`), await tile(size));
    console.log(`OK icon-${size}x${size}.png`);
  }
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await tile(180));
  console.log('OK apple-touch-icon.png');
  fs.writeFileSync(path.join(OUT, 'icon-maskable-512x512.png'), await tile(512, 0.64));
  console.log('OK icon-maskable-512x512.png');
  console.log('Done PL icons (vector master).');
}
main().catch((e) => { console.error(e); process.exit(1); });
