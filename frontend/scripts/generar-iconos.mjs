#!/usr/bin/env node
/**
 * generar-iconos.mjs — la fábrica de íconos de la app.
 * =====================================================================
 *
 * QUE HACE
 * --------
 * Toma UN SVG de marca (el isotipo limpio, sin fondo) y escupe TODOS los
 * PNG que la PWA necesita, centrados de verdad y con la zona segura que
 * cada tipo de ícono pide. La idea es que nadie vuelva a recortar un
 * ícono a mano en un editor: se corre este script y salen bien.
 *
 * POR QUE EXISTE
 * --------------
 * Lo que había antes, medido (2026-09-04): los diez PNG de /icons tenían
 * la CAJA centrada (dx ~0) pero la MASA corrida 6,5 % a la izquierda, el
 * mismo número en todos los tamaños — el error venía del original y el
 * reescalado lo propagó. Encima el dibujo ocupaba 99-100 % del lienzo,
 * sin aire y con el tilde cortado en el vértice. El único distinto era
 * el apple-touch-icon: alguien lo había empujado a ojo (caja +3,6 %)
 * para compensar, y así quedó suelto del resto del juego. Compensar a
 * mano es justo lo que impide arreglarlo de raíz: se arregla un archivo
 * y el próximo reescalado vuelve a traer el error.
 *
 * LAS TRES REGLAS QUE IMPLEMENTA
 * ------------------------------
 * 1. CENTRADO OPTICO, NO POR CAJA.
 *    El logo se centra por el CENTRO DE MASA de la tinta (cada píxel
 *    pesa según cuánto lo cubre el dibujo), no por el rectángulo que lo
 *    encierra. Para un isotipo con un trazo diagonal largo — como el
 *    tilde de Munify, que se va al vértice de arriba a la derecha — la
 *    caja centrada deja la mancha visual corrida. La masa no miente.
 *
 * 2. ZONA SEGURA POR TIPO.
 *    - `any` y `apple-touch-icon`: el logo ocupa el 60 % del lado. El
 *      40 % restante es aire, y es lo que hace que el ícono se vea del
 *      MISMO tamaño que los vecinos en la home de iOS/Android (todos
 *      traen ese aire; sin él, el nuestro se ve gigante y berreta).
 *    - `maskable`: Android recorta el ícono con la forma que quiera
 *      (círculo, squircle, gota). Sólo el círculo central del 80 % está
 *      garantizado, así que el logo entra en el 52 % del lado, que cabe
 *      dentro de ese círculo con margen aun con el corrimiento de masa.
 *
 * 3. UNA SOLA GEOMETRIA PARA TODOS LOS TAMAÑOS.
 *    Se compone un tile maestro de 2048 px por propósito y de ahí se
 *    baja a cada tamaño. Componer tamaño por tamaño obliga a redondear
 *    el offset a píxel entero, y medio píxel en un ícono de 16 es un
 *    3 % de corrimiento: el mismo bug, por la puerta de atrás.
 *
 * COMO SE USA
 * -----------
 *   cd frontend
 *   node scripts/generar-iconos.mjs                # marca por defecto (munify)
 *   node scripts/generar-iconos.mjs paraguay-limpio
 *   node scripts/generar-iconos.mjs --svg=public/brand/X.svg \
 *        --fondo=#ffffff --salida=public/brand/x --nombre=X
 *
 * PARA UNA MARCA NUEVA se agrega una entrada en MARCAS (abajo): SVG,
 * color de fondo y carpeta de salida. Son dos líneas, nada más.
 *
 * DEPENDENCIAS: `playwright` (rasteriza el SVG con Chromium, que es el
 * motor de referencia y respeta `<style>`/clases del SVG) y `sharp`
 * (compone, reescala y mide). Las dos ya viven en frontend/node_modules;
 * no hace falta instalar nada.
 *
 * VERIFICACION INCORPORADA
 * ------------------------
 * Al terminar, el script vuelve a ABRIR cada PNG que generó, reconstruye
 * la cobertura de tinta píxel por píxel (proyectando el color sobre la
 * paleta del SVG, que es la inversa exacta del compositing) y mide el
 * corrimiento de masa y de caja. Si algún archivo pasa la tolerancia de
 * masa, sale con error: un ícono corrido no llega al commit.
 *
 * OJO con la lectura de la tabla: el corrimiento de CAJA no es cero y no
 * tiene que serlo. Centrar por masa implica, por definición, que la caja
 * queda un poco corrida al lado opuesto de donde pesa el dibujo. La caja
 * se imprime como dato, no como veredicto; el veredicto es la masa.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------
// CONFIGURACION
// ---------------------------------------------------------------------

/** Tamaños `purpose: "any"` que publica la PWA (los que hoy existen en public/icons). */
const TAMANOS_ANY = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];
/** Tamaños `purpose: "maskable"`. Android recorta estos. */
const TAMANOS_MASKABLE = [512];
/** apple-touch-icon: iOS pide 180 y NO admite transparencia (la pinta de negro). */
const TAMANO_APPLE = 180;
/** favicon.ico multi-resolución (Windows/Edge y navegadores viejos lo piden solos). */
const TAMANOS_ICO = [16, 32, 48];
/** Badge de notificación: Android lo dibuja como SILUETA (usa sólo el alfa), así
 *  que este sale blanco sobre transparente — un tile opaco se vería como un
 *  cuadrado lleno. */
const TAMANO_BADGE = 96;

/** Cuánto del lado ocupa el logo, por propósito. Ver "zona segura por tipo" arriba. */
const OCUPACION = { any: 0.60, maskable: 0.52 };

/** Lado del tile maestro y del rasterizado del SVG. Cuanto más alto, menos
 *  error de redondeo arrastra el reescalado; 2048/3072 es de sobra. */
const LADO_MAESTRO = 2048;
const LADO_RASTER = 3072;

/** Tolerancia del gate: corrimiento de masa máximo, en % del lado. */
const TOLERANCIA_MASA = 0.5;

const MARCAS = {
  munify: {
    nombre: 'Munify',
    // De los cuatro SVG de /public/brand, este es el isotipo LIMPIO: viewBox
    // pegado al dibujo (sin márgenes muertos que descentran), cuerpo blanco y
    // tilde verde, o sea la paleta que funciona sobre el tile oscuro. Los v2/v3
    // son variantes de color para fondo claro y el -ios ya trae el fondo
    // horneado adentro (es un tile compuesto, no un isotipo).
    svg: 'public/brand/Munify.svg',
    fondo: '#0b1626',
    salida: 'public/icons',
    // apple-touch-icon y favicon viven en la raíz de /public porque el
    // index.html y los navegadores los piden desde ahí.
    salidaApple: 'public/apple-touch-icon.png',
    salidaFaviconPng: 'public/favicon.png',
    salidaFaviconIco: 'public/favicon.ico',
    salidaFaviconSvg: 'public/favicon.svg',
    salidaBadge: 'public/icons/icon-badge-96x96.png',
  },
};

// ---------------------------------------------------------------------
// ARGUMENTOS
// ---------------------------------------------------------------------

function leerArgumentos() {
  const args = process.argv.slice(2);
  const sueltos = args.filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(
    args
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const i = a.indexOf('=');
        return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
      }),
  );

  const id = sueltos[0] || 'munify';
  const base = MARCAS[id];
  if (!base && !flags.svg) {
    throw new Error(
      `Marca desconocida "${id}". Conocidas: ${Object.keys(MARCAS).join(', ')}. ` +
        'O pasá --svg=... --fondo=... --salida=...',
    );
  }
  const cfg = { ...(base || {}) };
  if (flags.svg) cfg.svg = flags.svg;
  if (flags.fondo) cfg.fondo = flags.fondo;
  if (flags.nombre) cfg.nombre = flags.nombre;
  if (flags.salida) {
    cfg.salida = flags.salida;
    // Con --salida a mano, todo va adentro de esa carpeta (es el layout de
    // las marcas white-label: brand/<marca>/apple-touch-icon.png).
    cfg.salidaApple = path.join(flags.salida, 'apple-touch-icon.png');
    cfg.salidaFaviconPng = null;
    cfg.salidaFaviconIco = null;
    cfg.salidaFaviconSvg = null;
    cfg.salidaBadge = null;
  }
  if (flags.prefijo) cfg.prefijo = flags.prefijo;
  cfg.prefijo = cfg.prefijo || 'icon-';
  // 'NxN' -> icon-192x192.png ; 'N' -> icono-192.png (así lo nombra /calls).
  cfg.sufijoTamano = flags['sufijo-tamano'] ?? cfg.sufijoTamano ?? 'NxN';
  const lista = (v) => String(v).split(',').map((n) => parseInt(n, 10)).filter(Boolean);
  cfg.tamanos = flags.tamanos ? lista(flags.tamanos) : cfg.tamanos || TAMANOS_ANY;
  cfg.tamanosMaskable = flags['tamanos-maskable']
    ? lista(flags['tamanos-maskable'])
    : cfg.tamanosMaskable || TAMANOS_MASKABLE;
  cfg.nombre = cfg.nombre || id;
  return cfg;
}

// ---------------------------------------------------------------------
// 1. RASTERIZAR EL SVG (Chromium, fondo transparente)
// ---------------------------------------------------------------------

/** Saca el viewBox y el contenido interno del SVG. Sirve tanto para calcular
 *  el aspecto del rasterizado como para emitir el favicon.svg. */
async function leerSvg(rutaSvg) {
  const texto = await fs.readFile(rutaSvg, 'utf8');
  const apertura = texto.match(/<svg\b[^>]*>/i);
  if (!apertura) throw new Error(`${rutaSvg}: no parece un SVG`);
  const viewBox = apertura[0].match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (!viewBox) throw new Error(`${rutaSvg}: el <svg> no declara viewBox`);
  const [vx, vy, vw, vh] = viewBox[1].trim().split(/[\s,]+/).map(Number);
  const inicio = apertura.index + apertura[0].length;
  const fin = texto.lastIndexOf('</svg>');
  return {
    texto,
    viewBox: { x: vx, y: vy, w: vw, h: vh },
    // Se le saca el <title> propio: al anidarlo dentro del tile quedarían dos
    // títulos y el lector de pantalla leería la marca repetida.
    interior: texto.slice(inicio, fin).replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, ''),
    /** Colores plenos del dibujo. Se usan para reconstruir la cobertura al
     *  verificar: un píxel del borde es una mezcla lineal entre el fondo y
     *  uno de estos, y proyectando se recupera cuánto lo cubría. */
    paleta: colores(texto),
  };
}

function colores(svg) {
  const vistos = new Set();
  for (const m of svg.matchAll(/fill\s*[:=]\s*["']?(#[0-9a-f]{3,8})/gi)) {
    const c = aRgb(m[1]);
    if (c) vistos.add(c.join(','));
  }
  for (const m of svg.matchAll(/stroke\s*[:=]\s*["']?(#[0-9a-f]{3,8})/gi)) {
    const c = aRgb(m[1]);
    if (c) vistos.add(c.join(','));
  }
  return [...vistos].map((s) => s.split(',').map(Number));
}

function aRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

async function rasterizar(rutaSvg, svg) {
  const escala = LADO_RASTER / Math.max(svg.viewBox.w, svg.viewBox.h);
  const ancho = Math.round(svg.viewBox.w * escala);
  const alto = Math.round(svg.viewBox.h * escala);
  const datos = Buffer.from(await fs.readFile(rutaSvg)).toString('base64');

  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: 1,
    });
    await pagina.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>html,body{margin:0;padding:0;background:transparent}
              img{display:block;width:${ancho}px;height:${alto}px}</style>
       <img src="data:image/svg+xml;base64,${datos}">`,
    );
    await pagina.locator('img').waitFor({ state: 'visible' });
    // omitBackground: el PNG sale con alfa real, que es lo que después se mide.
    const png = await pagina.screenshot({ omitBackground: true, type: 'png' });
    return { png, ancho, alto, escala };
  } finally {
    await navegador.close();
  }
}

// ---------------------------------------------------------------------
// 2. MEDIR LA TINTA (caja + centro de masa)
// ---------------------------------------------------------------------

/**
 * Mide un mapa de cobertura (0..1 por píxel) y devuelve la caja que encierra
 * la tinta y su centro de masa. El centro de masa pesa cada píxel por cuánto
 * lo cubre el dibujo: un borde antialiaseado al 30 % aporta 0,3. Eso es lo
 * que hace la medición subpíxel y por lo tanto confiable hasta en 16x16.
 */
function medirCobertura(cobertura, ancho, alto) {
  let minX = ancho, maxX = -1, minY = alto, maxY = -1;
  let sx = 0, sy = 0, peso = 0;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const c = cobertura[y * ancho + x];
      if (c <= 0.02) continue;
      // La caja se calcula con un umbral más alto que la masa: si no, una
      // pelusa de antialias de 1 % la agranda y arruina la escala.
      if (c > 0.25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      sx += (x + 0.5) * c;
      sy += (y + 0.5) * c;
      peso += c;
    }
  }
  if (peso === 0) throw new Error('La imagen no tiene tinta: revisá el SVG o el color de fondo.');
  return {
    caja: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    masa: { x: sx / peso, y: sy / peso },
    peso,
  };
}

/** Cobertura a partir del canal alfa (para el SVG rasterizado, sin fondo). */
function coberturaPorAlfa(datos, ancho, alto, canales) {
  const cob = new Float32Array(ancho * alto);
  for (let p = 0; p < ancho * alto; p++) cob[p] = datos[p * canales + (canales - 1)] / 255;
  return cob;
}

/**
 * Cobertura a partir del color, para un PNG ya compuesto sobre el fondo.
 * Cada píxel P es P = F + a·(C − F) con F el fondo y C un color pleno de la
 * paleta. Proyectando (P − F) sobre (C − F) se recupera `a`. Es la inversa
 * exacta del compositing, así que mide lo MISMO que la cobertura por alfa —
 * y por eso lo que verifica es de verdad lo que se generó, no una
 * aproximación por "distancia al fondo" (que le daría más peso al blanco que
 * al verde y movería el centro de masa a propósito).
 */
function coberturaPorColor(datos, ancho, alto, canales, fondo, paleta) {
  const cob = new Float32Array(ancho * alto);
  const ejes = paleta
    .map((c) => {
      const v = [c[0] - fondo[0], c[1] - fondo[1], c[2] - fondo[2]];
      const n2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      return { v, n2, n: Math.sqrt(n2) };
    })
    .filter((e) => e.n2 > 400); // colores casi iguales al fondo no son tinta
  if (!ejes.length) throw new Error('La paleta del SVG no se distingue del fondo.');

  for (let p = 0; p < ancho * alto; p++) {
    const i = p * canales;
    const d = [datos[i] - fondo[0], datos[i + 1] - fondo[1], datos[i + 2] - fondo[2]];
    const nd = Math.hypot(d[0], d[1], d[2]);
    if (nd < 6) continue; // ruido de compresión
    // El eje que mejor explica la dirección del desvío es el color que cubre
    // ese píxel; la proyección sobre él da la cobertura.
    let mejor = 0;
    for (const e of ejes) {
      const cos = (d[0] * e.v[0] + d[1] * e.v[1] + d[2] * e.v[2]) / (nd * e.n);
      const a = (d[0] * e.v[0] + d[1] * e.v[1] + d[2] * e.v[2]) / e.n2;
      if (cos > 0.9 && a > mejor) mejor = a;
    }
    cob[p] = Math.min(1, mejor);
  }
  return cob;
}

async function medirPng(ruta, fondo, paleta, modo = 'color') {
  const { data, info } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cob =
    modo === 'alfa'
      ? coberturaPorAlfa(data, width, height, channels)
      : coberturaPorColor(data, width, height, channels, fondo, paleta);
  const m = medirCobertura(cob, width, height);
  const pct = (v, lado) => +((v / lado) * 100).toFixed(2);
  const cajaCx = m.caja.x + m.caja.w / 2;
  const cajaCy = m.caja.y + m.caja.h / 2;
  // Radio máximo de la tinta desde el centro del lienzo, en % del lado: es lo
  // que define si un maskable sobrevive al recorte circular de Android.
  const esquinas = [
    [m.caja.x, m.caja.y],
    [m.caja.x + m.caja.w, m.caja.y],
    [m.caja.x, m.caja.y + m.caja.h],
    [m.caja.x + m.caja.w, m.caja.y + m.caja.h],
  ];
  const radio = Math.max(...esquinas.map(([x, y]) => Math.hypot(x - width / 2, y - height / 2)));
  return {
    lado: width,
    dxMasa: pct(m.masa.x - width / 2, width),
    dyMasa: pct(m.masa.y - height / 2, height),
    dxCaja: pct(cajaCx - width / 2, width),
    dyCaja: pct(cajaCy - height / 2, height),
    ocupa: +((Math.max(m.caja.w, m.caja.h) / width) * 100).toFixed(1),
    radio: +((radio / width) * 100).toFixed(1),
  };
}

// ---------------------------------------------------------------------
// 3. COMPONER EL TILE MAESTRO
// ---------------------------------------------------------------------

/**
 * Arma un tile cuadrado de LADO_MAESTRO con el logo escalado a `ocupacion`
 * del lado y su CENTRO DE MASA clavado en el centro del lienzo.
 */
async function componerMaestro(marca, ocupacion, fondoRgb) {
  const { pngMarca, medida, ancho } = marca;
  const objetivo = LADO_MAESTRO * ocupacion;
  const escala = objetivo / Math.max(medida.caja.w, medida.caja.h);
  const anchoDestino = Math.max(1, Math.round(medida.caja.w * escala));
  const altoDestino = Math.max(1, Math.round(medida.caja.h * escala));

  const recorte = await sharp(pngMarca)
    .extract({
      left: medida.caja.x,
      top: medida.caja.y,
      width: medida.caja.w,
      height: medida.caja.h,
    })
    .resize(anchoDestino, altoDestino, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Dónde cae la masa dentro del recorte ya escalado.
  const masaX = (medida.masa.x - medida.caja.x) * (anchoDestino / medida.caja.w);
  const masaY = (medida.masa.y - medida.caja.y) * (altoDestino / medida.caja.h);
  const left = Math.round(LADO_MAESTRO / 2 - masaX);
  const top = Math.round(LADO_MAESTRO / 2 - masaY);

  if (left < 0 || top < 0 || left + anchoDestino > LADO_MAESTRO || top + altoDestino > LADO_MAESTRO) {
    throw new Error(
      `El logo se sale del lienzo (left=${left}, top=${top}, ${anchoDestino}x${altoDestino}). ` +
        'Bajá la ocupación para esta marca.',
    );
  }

  void ancho;
  return sharp({
    create: {
      width: LADO_MAESTRO,
      height: LADO_MAESTRO,
      channels: 4,
      background: { r: fondoRgb[0], g: fondoRgb[1], b: fondoRgb[2], alpha: 1 },
    },
  })
    .composite([{ input: recorte, left, top }])
    .png()
    .toBuffer();
}

/**
 * Badge de notificación: la MISMA geometría, pero el dibujo en blanco pleno
 * sobre transparente. Android descarta el color del badge y se queda con el
 * alfa, así que lo único que importa es que la silueta esté centrada y con
 * aire; un tile opaco saldría como un cuadrado.
 */
async function componerBadge(marca, fondoRgb, destino) {
  void fondoRgb;
  const { pngMarca, medida } = marca;
  const objetivo = LADO_MAESTRO * OCUPACION.any;
  const escala = objetivo / Math.max(medida.caja.w, medida.caja.h);
  const anchoDestino = Math.max(1, Math.round(medida.caja.w * escala));
  const altoDestino = Math.max(1, Math.round(medida.caja.h * escala));

  const recorte = await sharp(pngMarca)
    .extract({ left: medida.caja.x, top: medida.caja.y, width: medida.caja.w, height: medida.caja.h })
    .resize(anchoDestino, altoDestino, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // Blanco pleno recortado por el alfa del isotipo (dest-in = "quedate con el
  // blanco donde el dibujo tiene tinta").
  const silueta = await sharp({
    create: { width: anchoDestino, height: altoDestino, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: recorte, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const masaX = (medida.masa.x - medida.caja.x) * (anchoDestino / medida.caja.w);
  const masaY = (medida.masa.y - medida.caja.y) * (altoDestino / medida.caja.h);

  // OJO: sharp aplica `composite` DESPUES del `resize` sin importar el orden en
  // que se encadenen, así que el tile se arma en un buffer aparte y recién
  // después se baja al tamaño final.
  const maestroBadge = await sharp({
    create: { width: LADO_MAESTRO, height: LADO_MAESTRO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: silueta, left: Math.round(LADO_MAESTRO / 2 - masaX), top: Math.round(LADO_MAESTRO / 2 - masaY) }])
    .png()
    .toBuffer();

  await fs.mkdir(path.dirname(destino), { recursive: true });
  await sharp(maestroBadge)
    .resize(TAMANO_BADGE, TAMANO_BADGE, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(destino);
  return destino;
}

/** Baja un maestro a un tamaño concreto, sin alfa (iOS pinta de negro lo transparente). */
async function bajar(maestro, lado, fondoRgb, destino) {
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await sharp(maestro)
    .resize(lado, lado, { kernel: 'lanczos3' })
    .flatten({ background: { r: fondoRgb[0], g: fondoRgb[1], b: fondoRgb[2] } })
    .png({ compressionLevel: 9 })
    .toFile(destino);
  return destino;
}

// ---------------------------------------------------------------------
// 4. FAVICONS (.ico multi-resolución y .svg vectorial)
// ---------------------------------------------------------------------

/** Empaqueta varios PNG en un .ico. Los navegadores modernos aceptan PNG adentro. */
function armarIco(pngs) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entradas = [];
  for (const { lado, buffer } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buffer.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecera, ...entradas, ...pngs.map((p) => p.buffer)]);
}

/**
 * Emite el favicon vectorial con la MISMA geometría que los PNG: tile de
 * fondo + el dibujo original anidado, escalado al 60 % y corrido para que la
 * masa quede en el centro. Se anida el SVG de origen tal cual (no se le tocan
 * los paths) para que la marca siga siendo editable en un solo lugar.
 */
function armarFaviconSvg(svg, medida, escalaRaster, fondo, nombre, ocupacion) {
  const LADO = 512;
  // Caja y masa, del raster de vuelta a unidades del SVG.
  const cx = medida.caja.x / escalaRaster;
  const cy = medida.caja.y / escalaRaster;
  const cw = medida.caja.w / escalaRaster;
  const ch = medida.caja.h / escalaRaster;
  const mx = medida.masa.x / escalaRaster;
  const my = medida.masa.y / escalaRaster;

  const s = (LADO * ocupacion) / Math.max(cw, ch);
  // El anidado usa el viewBox original: hay que correrlo para que la caja del
  // dibujo caiga donde queremos, y estirarlo a la misma escala.
  const anchoAnidado = svg.viewBox.w * s;
  const altoAnidado = svg.viewBox.h * s;
  const x = LADO / 2 - (mx - svg.viewBox.x) * s;
  const y = LADO / 2 - (my - svg.viewBox.y) * s;
  void cx;
  void cy;

  const r = (n) => +n.toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" width="${LADO}" height="${LADO}">
  <title>${nombre}</title>
  <!-- GENERADO por frontend/scripts/generar-iconos.mjs — no editar a mano.
       Misma geometría que los PNG: el isotipo ocupa el ${Math.round(ocupacion * 100)} % del lado
       y su centro de MASA (no el de su caja) queda clavado en el centro. -->
  <rect width="${LADO}" height="${LADO}" fill="${fondo}"/>
  <svg x="${r(x)}" y="${r(y)}" width="${r(anchoAnidado)}" height="${r(altoAnidado)}" viewBox="${svg.viewBox.x} ${svg.viewBox.y} ${svg.viewBox.w} ${svg.viewBox.h}" preserveAspectRatio="none">${svg.interior}</svg>
</svg>
`;
}

// ---------------------------------------------------------------------
// PRINCIPAL
// ---------------------------------------------------------------------

function nombreArchivo(cfg, lado, maskable) {
  const tam = cfg.sufijoTamano === 'N' ? `${lado}` : `${lado}x${lado}`;
  return `${cfg.prefijo}${maskable ? 'maskable-' : ''}${tam}.png`;
}

async function main() {
  const cfg = leerArgumentos();
  const rutaSvg = path.resolve(RAIZ, cfg.svg);
  const fondoRgb = aRgb(cfg.fondo);
  if (!fondoRgb) throw new Error(`Color de fondo inválido: ${cfg.fondo}`);

  console.log(`\nMarca:  ${cfg.nombre}`);
  console.log(`SVG:    ${path.relative(RAIZ, rutaSvg)}`);
  console.log(`Fondo:  ${cfg.fondo}`);
  console.log(`Salida: ${cfg.salida}\n`);

  const svg = await leerSvg(rutaSvg);
  const paleta = svg.paleta.filter(
    (c) => Math.abs(c[0] - fondoRgb[0]) + Math.abs(c[1] - fondoRgb[1]) + Math.abs(c[2] - fondoRgb[2]) > 30,
  );
  console.log(`Paleta detectada: ${paleta.map((c) => `rgb(${c.join(',')})`).join('  ')}`);

  const raster = await rasterizar(rutaSvg, svg);
  const { data, info } = await sharp(raster.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cob = coberturaPorAlfa(data, info.width, info.height, info.channels);
  const medida = medirCobertura(cob, info.width, info.height);
  const desviacion = {
    x: +(((medida.masa.x - (medida.caja.x + medida.caja.w / 2)) / medida.caja.w) * 100).toFixed(2),
    y: +(((medida.masa.y - (medida.caja.y + medida.caja.h / 2)) / medida.caja.h) * 100).toFixed(2),
  };
  console.log(
    `Isotipo: caja ${medida.caja.w}x${medida.caja.h} px @${info.width}x${info.height}; ` +
      `la masa está ${desviacion.x}% / ${desviacion.y}% corrida respecto del centro de su caja ` +
      '(por eso centrar por caja no alcanza).\n',
  );

  const marca = { pngMarca: raster.png, medida, ancho: info.width };
  const maestroAny = await componerMaestro(marca, OCUPACION.any, fondoRgb);
  const maestroMask = await componerMaestro(marca, OCUPACION.maskable, fondoRgb);

  const generados = [];
  for (const lado of cfg.tamanos) {
    generados.push({
      ruta: await bajar(maestroAny, lado, fondoRgb, path.resolve(RAIZ, cfg.salida, nombreArchivo(cfg, lado, false))),
      tipo: 'any',
    });
  }
  for (const lado of cfg.tamanosMaskable) {
    generados.push({
      ruta: await bajar(maestroMask, lado, fondoRgb, path.resolve(RAIZ, cfg.salida, nombreArchivo(cfg, lado, true))),
      tipo: 'maskable',
    });
  }
  if (cfg.salidaApple) {
    generados.push({
      ruta: await bajar(maestroAny, TAMANO_APPLE, fondoRgb, path.resolve(RAIZ, cfg.salidaApple)),
      tipo: 'apple',
    });
  }
  if (cfg.salidaFaviconPng) {
    generados.push({
      ruta: await bajar(maestroAny, 32, fondoRgb, path.resolve(RAIZ, cfg.salidaFaviconPng)),
      tipo: 'favicon',
    });
  }
  if (cfg.salidaBadge) {
    generados.push({
      ruta: await componerBadge(marca, fondoRgb, path.resolve(RAIZ, cfg.salidaBadge)),
      tipo: 'badge',
      modo: 'alfa',
    });
  }
  if (cfg.salidaFaviconIco) {
    const pngs = [];
    for (const lado of TAMANOS_ICO) {
      pngs.push({
        lado,
        buffer: await sharp(maestroAny)
          .resize(lado, lado, { kernel: 'lanczos3' })
          .flatten({ background: { r: fondoRgb[0], g: fondoRgb[1], b: fondoRgb[2] } })
          .png({ compressionLevel: 9 })
          .toBuffer(),
      });
    }
    const destino = path.resolve(RAIZ, cfg.salidaFaviconIco);
    await fs.writeFile(destino, armarIco(pngs));
    console.log(`ico:    ${path.relative(RAIZ, destino)} (${TAMANOS_ICO.join(', ')})`);
  }
  if (cfg.salidaFaviconSvg) {
    const destino = path.resolve(RAIZ, cfg.salidaFaviconSvg);
    await fs.writeFile(
      destino,
      armarFaviconSvg(svg, medida, raster.escala, cfg.fondo, cfg.nombre, OCUPACION.any),
      'utf8',
    );
    console.log(`svg:    ${path.relative(RAIZ, destino)}`);
  }

  // ---- verificación ----
  console.log('\nVERIFICACION (todo en % del lado; la CAJA queda corrida a propósito: se centra por MASA)\n');
  const filas = [];
  let fallas = 0;
  for (const g of generados) {
    const m = await medirPng(g.ruta, fondoRgb, paleta, g.modo);
    const limiteRadio = g.tipo === 'maskable' ? 40 : 100;
    const okMasa = Math.abs(m.dxMasa) <= TOLERANCIA_MASA && Math.abs(m.dyMasa) <= TOLERANCIA_MASA;
    const okRadio = m.radio <= limiteRadio;
    if (!okMasa || !okRadio) fallas++;
    filas.push({
      archivo: path.relative(path.resolve(RAIZ, 'public'), g.ruta).replace(/\\/g, '/'),
      tipo: g.tipo,
      lado: m.lado,
      'masa dx': m.dxMasa,
      'masa dy': m.dyMasa,
      'caja dx': m.dxCaja,
      'caja dy': m.dyCaja,
      'ocupa %': m.ocupa,
      'radio %': m.radio,
      ok: okMasa && okRadio ? 'si' : 'NO',
    });
  }
  console.table(filas);

  if (fallas) {
    throw new Error(
      `${fallas} ícono(s) fuera de tolerancia (masa ±${TOLERANCIA_MASA} %, radio maskable ≤40 %).`,
    );
  }
  console.log(`OK: ${generados.length} íconos centrados por masa, dentro de ±${TOLERANCIA_MASA} %.\n`);
}

main().catch((e) => {
  console.error('\nFALLO:', e.message);
  process.exit(1);
});
