/**
 * Genera los iconos PWA de la demo Munify desde el SVG master del isotipo.
 * Master: public/brand/munify.svg (hexágono blanco + check verde, con el
 * viewBox ajustado al dibujo — sin eso el mark queda corrido dentro del tile,
 * que es como se veía el ícono instalado: "torcido").
 * Salida: public/brand/munify-py/ (icon-*.png, apple-touch, maskable).
 *
 * Composición: tile cuadrado NAVY con el mark CENTRADO (72% del canvas;
 * maskable al 60% para sobrevivir el recorte circular de Android). iOS no
 * soporta transparencia en apple-touch-icon, por eso el fondo sólido.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER = path.join(ROOT, 'public/brand/munify.svg');
const OUT = path.join(ROOT, 'public/brand/munify-py');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Navy de la marca (el mismo fondo del hero de acceso).
const FONDO = { r: 11, g: 22, b: 38 };

/** Corrimiento óptico a la derecha, como fracción del mark.
 *
 *  El check del logo se estira hacia arriba y a la DERECHA, más allá del
 *  hexágono. Centrar la caja que los contiene a los dos deja el hexágono
 *  —que es lo que el ojo lee como "el logo"— corrido a la izquierda, con el
 *  aire acumulado del lado contrario. Se compensa moviendo el conjunto a la
 *  derecha: centrado ÓPTICO, no matemático. */
const CORRIMIENTO_X = 0.05;

async function tile(size, contentRatio = 0.72) {
  const inner = Math.round(size * contentRatio);
  // `fit: contain` mantiene la proporción del mark; el ancho y el alto del
  // dibujo NO son iguales, así que sin esto el logo se apoya en un borde.
  const markBuf = await sharp(MASTER, { density: 400, limitInputPixels: false })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  // Posición explícita en vez de `gravity: centre`, para poder aplicar el
  // corrimiento óptico. Se topea en el borde por si el ratio sube.
  const libre = size - inner;
  const left = Math.min(Math.max(Math.round(libre / 2 + inner * CORRIMIENTO_X), 0), libre);
  const top = Math.round(libre / 2);
  return sharp({ create: { width: size, height: size, channels: 3, background: FONDO } })
    .composite([{ input: markBuf, left, top }])
    .png()
    .toBuffer();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const size of sizes) {
    fs.writeFileSync(path.join(OUT, `icon-${size}x${size}.png`), await tile(size));
  }
  // apple-touch-icon: iOS lo usa tal cual, sin recortar (le pone él las
  // esquinas redondeadas), así que va con la misma proporción del set.
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await tile(180));
  // maskable: Android recorta en círculo — el mark va más chico para que el
  // recorte no le coma el hexágono.
  fs.writeFileSync(path.join(OUT, 'icon-maskable-512x512.png'), await tile(512, 0.6));
  console.log(`[iconos] ${sizes.length + 2} archivos en ${path.relative(ROOT, OUT)}`);
})();
