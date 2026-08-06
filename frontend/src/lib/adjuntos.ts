/**
 * Helpers para abrir adjuntos servidos por Cloudinary.
 *
 * PROBLEMA QUE RESUELVE
 * ---------------------
 * Los PDF viejos se subieron a Cloudinary como `raw` SIN extension en el
 * public_id. Cloudinary fija el Content-Type en el momento del upload segun la
 * extension: sin extension quedan `application/octet-stream`, y el navegador
 * los baja como archivo generico en vez de abrirlos en su visor de PDF.
 *
 * El saneamiento (backend/scripts/_fix_facturas_content_type.py) re-sube el
 * binario para que Cloudinary lo vuelva a etiquetar bien, pero eso genera una
 * VERSION NUEVA del asset. Y Cloudinary no ignora el segmento `/vNNNNNNN/` de
 * la URL: si se lo pedis, sirve esa version congelada, con el Content-Type
 * viejo. Como la DB guarda la URL completa CON version, pedirla tal cual
 * seguiria devolviendo el archivo mal etiquetado.
 *
 * Sacandole el segmento de version, Cloudinary sirve la version ACTUAL del
 * asset — ya saneada. Asi evitamos tener que hacer un UPDATE masivo de las
 * URLs sobre la base de produccion.
 */

const CLOUDINARY_HOST = 'res.cloudinary.com';
const SEGMENTO_VERSION = /\/upload\/v\d+\//;

/**
 * Normaliza la URL de un adjunto de Cloudinary para que se sirva con el
 * Content-Type actual del asset.
 *
 * Deja intacta cualquier URL que no sea de Cloudinary.
 */
export function urlAdjunto(url?: string | null): string {
  if (!url) return '';
  if (!url.includes(CLOUDINARY_HOST)) return url;
  return url.replace(SEGMENTO_VERSION, '/upload/');
}
