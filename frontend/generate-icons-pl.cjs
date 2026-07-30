/**
 * Genera los iconos PWA de la marca Paraguay Limpio desde su SVG master.
 * Master: public/brand/paraguay-limpio.svg (fondo verde full-bleed + hoja clara).
 * Salida: public/brand/paraguay-limpio/  (icon-*.png, apple-touch-icon.png, maskable).
 *
 * A diferencia de generate-icons.cjs (Munify, fondo transparente), acá usamos
 * fit:'cover' porque el master ya trae el fondo solido — iOS necesita fondo,
 * y asi el icono guardado deja de ser el logo de Munify en blanco.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'public/brand/paraguay-limpio.svg');
const OUT = path.join(ROOT, 'public/brand/paraguay-limpio');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function renderAt(size) {
  return sharp(MASTER, { density: 300, limitInputPixels: false })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(MASTER)) { console.error('No existe ' + MASTER); process.exit(1); }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  for (const size of sizes) {
    fs.writeFileSync(path.join(OUT, `icon-${size}x${size}.png`), await renderAt(size));
    console.log(`OK icon-${size}x${size}.png`);
  }
  // apple-touch 180 (iOS home screen)
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await renderAt(180));
  console.log('OK apple-touch-icon.png');
  // notification / any-maskable 512 (el master ya trae padding interno)
  fs.writeFileSync(path.join(OUT, 'icon-maskable-512x512.png'), await renderAt(512));
  console.log('OK icon-maskable-512x512.png');

  console.log('Done PL icons.');
}
main().catch((e) => { console.error(e); process.exit(1); });
