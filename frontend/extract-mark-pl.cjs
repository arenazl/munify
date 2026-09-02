/**
 * Extrae el ISOTIPO (sol + colinas + camino, sin el texto) del logo real de
 * Paraguay Limpio y regenera los iconos PWA desde ese mark.
 *
 * Fuente: par-limpio/WhatsApp Image 2026-07-29 at 19.58.06.jpeg (logo oficial
 * que pasó el dueño). El mark ocupa el tercio izquierdo; se recorta, se
 * trimean los bordes blancos y se arma un tile cuadrado blanco con el mark
 * centrado (launcher icon estándar). NADA dibujado a mano: solo crop del real.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, '..', 'par-limpio', 'WhatsApp Image 2026-07-29 at 19.58.06.jpeg');
const OUT = path.join(ROOT, 'public/brand/paraguay-limpio');
const MARK = path.join(ROOT, 'public/brand/paraguay-limpio-mark.png');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  const meta = await sharp(SRC).metadata();
  // El isotipo vive en el ~42% izquierdo del lienzo. Crop generoso + trim
  // del blanco alrededor → queda el mark solo, ajustado.
  // (extract y trim en pipelines separados: encadenados en uno solo esta
  // version de sharp tira "bad extract area")
  const cropRaw = await sharp(SRC)
    .extract({ left: 0, top: 0, width: Math.round(meta.width * 0.44), height: meta.height })
    .png()
    .toBuffer();
  const crop = await sharp(cropRaw).trim({ threshold: 12 }).png().toBuffer();

  // Master del mark (sobre blanco, como el original).
  fs.writeFileSync(MARK, crop);
  const mm = await sharp(MARK).metadata();
  console.log(`mark extraido: ${mm.width}x${mm.height}`);

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // Tile cuadrado blanco con el mark al 76% (padding parejo).
  const tile = async (size, contentRatio = 0.76) => {
    const inner = Math.round(size * contentRatio);
    const markBuf = await sharp(MARK)
      .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: markBuf, gravity: 'centre' }])
      .png()
      .toBuffer();
  };

  for (const size of sizes) {
    fs.writeFileSync(path.join(OUT, `icon-${size}x${size}.png`), await tile(size));
    console.log(`OK icon-${size}x${size}.png`);
  }
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await tile(180));
  console.log('OK apple-touch-icon.png');
  // Maskable: contenido mas chico (64%) para sobrevivir el recorte circular de Android.
  fs.writeFileSync(path.join(OUT, 'icon-maskable-512x512.png'), await tile(512, 0.64));
  console.log('OK icon-maskable-512x512.png');
  console.log('Done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
