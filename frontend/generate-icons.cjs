/**
 * Genera iconos PWA, favicon y apple-touch desde el SVG master.
 *
 * Master: public/brand/Munify.svg
 *
 * Ventajas del SVG: escala infinito, sin halo, sin pixelado. sharp lo
 * rasteriza a la densidad que necesitemos para cada tamano.
 *
 * Pipeline:
 *  1) sharp(svg).resize(N, N, fit: 'contain', background: transparent).
 *  2) version maskable con contenido al 80% del canvas (Android no recorta).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'public/brand/Munify.svg');
const OUT_ICONS = path.join(ROOT, 'public/icons');
const OUT_PUBLIC = path.join(ROOT, 'public');

const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

async function renderAt(size) {
  // Para SVGs, density mas baja es suficiente (el SVG ya es vectorial).
  // Limitamos a 300 para no exceder pixel limit en tamanos grandes.
  const density = Math.min(300, Math.max(96, size));
  return sharp(MASTER, { density, limitInputPixels: false })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function generateIcons() {
  if (!fs.existsSync(MASTER)) {
    console.error(`No existe master en ${MASTER}`);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_ICONS)) fs.mkdirSync(OUT_ICONS, { recursive: true });

  for (const size of sizes) {
    const out = path.join(OUT_ICONS, `icon-${size}x${size}.png`);
    fs.writeFileSync(out, await renderAt(size));
    console.log(`OK icon-${size}x${size}.png`);
  }

  // Favicon PNG (32x32) y favicon.svg copiado tal cual
  fs.writeFileSync(path.join(OUT_PUBLIC, 'favicon.png'), await renderAt(32));
  console.log('OK favicon.png');
  fs.copyFileSync(MASTER, path.join(OUT_PUBLIC, 'favicon.svg'));
  console.log('OK favicon.svg');

  // Apple touch 180
  fs.writeFileSync(path.join(OUT_PUBLIC, 'apple-touch-icon.png'), await renderAt(180));
  console.log('OK apple-touch-icon.png');

  // Maskable 512: contenido al 80% (410px) + padding transparente 51px
  const inner = await sharp(MASTER, { density: 300, limitInputPixels: false })
    .resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp(inner)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_ICONS, 'icon-maskable-512x512.png'));
  console.log('OK icon-maskable-512x512.png');

  // Tambien generamos un PNG grande "master" para los lugares que usan
  // logo.png directamente (Layout, Demo, DemoReady, etc.)
  fs.writeFileSync(path.join(OUT_PUBLIC, 'logo.png'), await renderAt(1024));
  fs.writeFileSync(path.join(OUT_PUBLIC, 'logo-removebg-preview.png'), await renderAt(1024));
  fs.writeFileSync(path.join(ROOT, 'src/assets/munify_logo.png'), await renderAt(1024));
  console.log('OK logo.png + logo-removebg-preview.png + munify_logo.png (1024)');

  console.log('Done.');
}

generateIcons().catch((e) => { console.error(e); process.exit(1); });
