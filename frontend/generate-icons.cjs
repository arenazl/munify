/**
 * Genera iconos PWA, favicon y apple-touch desde el master.
 *
 * Master: public/brand/Logo-unedited.png (RGBA).
 *
 * Pipeline:
 *  1) whiteToTransparent — convierte pixeles muy blancos a alpha=0
 *     (por si el png viene con fondo blanco "falso transparente").
 *  2) trim() — recorta borde transparente real.
 *  3) extend a cuadrado (padding transparente).
 *  4) resize a cada tamano (contain, fondo transparente).
 *  5) version maskable con contenido al 80% del canvas.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'public/brand/Logo-unedited.png');
const OUT_ICONS = path.join(ROOT, 'public/icons');
const OUT_PUBLIC = path.join(ROOT, 'public');
const OUT_TRIMMED = path.join(ROOT, 'public/brand/Logo-square.png');

// Umbral: si R+G+B > 245*3 y alpha > 0 -> setear alpha=0
const WHITE_THRESHOLD = 245;

const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

async function whiteToTransparent(inputPath) {
  const img = sharp(inputPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`expected 4 channels, got ${channels}`);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeSquareMaster() {
  // 1) blanco -> alpha 0
  const cleaned = await whiteToTransparent(MASTER);
  // 2) trim
  const trimmed = await sharp(cleaned).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const w = meta.width;
  const h = meta.height;
  const side = Math.max(w, h);
  // 3) padding a cuadrado
  const padX = Math.floor((side - w) / 2);
  const padY = Math.floor((side - h) / 2);
  const squareBuf = await sharp(trimmed)
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
  console.log(`Master: ${w}x${h} -> ${side}x${side}`);
  return squareBuf;
}

async function generateIcons() {
  if (!fs.existsSync(MASTER)) {
    console.error(`No existe master en ${MASTER}`);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_ICONS)) fs.mkdirSync(OUT_ICONS, { recursive: true });

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
  console.log('OK favicon.png');

  await sharp(masterBuf)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_PUBLIC, 'apple-touch-icon.png'));
  console.log('OK apple-touch-icon.png');

  // Maskable: contenido al 80% para Android
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
