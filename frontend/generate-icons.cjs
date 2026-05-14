/**
 * Genera iconos PWA, favicon y apple-touch a partir del logo master.
 *
 * Master: public/brand/Logo.png (PNG con fondo transparente).
 *
 * Pipeline:
 *  1) trim() - recorta bordes transparentes del master.
 *  2) extend con fondo transparente hasta cuadrado (no deforma).
 *  3) resize a cada tamano (contain, fondo transparente).
 *  4) version maskable (icono dentro del 80% del canvas).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'public/brand/Logo.png');
const OUT_ICONS = path.join(ROOT, 'public/icons');
const OUT_PUBLIC = path.join(ROOT, 'public');
const OUT_TRIMMED = path.join(ROOT, 'public/brand/Logo-square.png');

const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

async function makeSquareMaster() {
  // 1) trim borde transparente
  const buf = await sharp(MASTER).trim().png().toBuffer();
  const trimMeta = await sharp(buf).metadata();
  const w = trimMeta.width;
  const h = trimMeta.height;
  const side = Math.max(w, h);
  // 2) padding a cuadrado
  const padX = Math.floor((side - w) / 2);
  const padY = Math.floor((side - h) / 2);
  const squareBuf = await sharp(buf)
    .extend({
      top: padY,
      bottom: side - h - padY,
      left: padX,
      right: side - w - padX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(OUT_TRIMMED, squareBuf);
  console.log(`Master trimmed: ${w}x${h} -> ${side}x${side}`);
  return squareBuf;
}

async function generateIcons() {
  if (!fs.existsSync(MASTER)) {
    console.error(`No existe master en ${MASTER}`);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_ICONS)) fs.mkdirSync(OUT_ICONS, { recursive: true });
  if (!fs.existsSync(path.dirname(OUT_TRIMMED))) fs.mkdirSync(path.dirname(OUT_TRIMMED), { recursive: true });

  const masterBuf = await makeSquareMaster();

  for (const size of sizes) {
    const out = path.join(OUT_ICONS, `icon-${size}x${size}.png`);
    await sharp(masterBuf)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`OK icon-${size}x${size}.png`);
  }

  await sharp(masterBuf)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_PUBLIC, 'favicon.png'));
  console.log('OK favicon.png (32x32)');

  await sharp(masterBuf)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_PUBLIC, 'apple-touch-icon.png'));
  console.log('OK apple-touch-icon.png (180x180)');

  // Maskable 512: contenido al 80% para que Android no lo recorte
  const inner = await sharp(masterBuf)
    .resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp(inner)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_ICONS, 'icon-maskable-512x512.png'));
  console.log('OK icon-maskable-512x512.png');

  console.log('Done.');
}

generateIcons().catch((e) => { console.error(e); process.exit(1); });
