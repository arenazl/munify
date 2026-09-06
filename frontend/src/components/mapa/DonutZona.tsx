/**
 * LA ZONA COMO DONUT: cuantos hay adentro y como se reparten por estado.
 *
 * Reemplaza al circulo relleno, que el dueno rechazo dos veces ("esos
 * circulitos no van, che, no van", 2026-09-05) y con razon: un disco de un solo
 * color tiene que elegir UN estado para pintarse, asi que muestra el que mas
 * manda y esconde el resto. Pero un barrio casi nunca es "todo pendiente" ---
 * tiene 10 pendientes, 2 frenados y 5 cerrados, y esa mezcla es justamente el
 * dato. El anillo la muestra entera sin elegir ganador, y encima deja ver el
 * mapa por el centro en vez de taparlo.
 *
 * La forma sale del diseno de Claude Design (2026-09-05), que la resolvio para
 * el modo "agrupar por zona". Se implementa con los tokens del kit: del diseno
 * se toma la ESTRUCTURA, nunca el markup.
 *
 * TONTO como manda el kit: no sabe de reclamos ni de estados. Recibe tramos ya
 * calculados, con su color y su valor.
 */

export interface TramoDonut {
  /** Solo para la key de React; el componente no lo interpreta. */
  id: string;
  valor: number;
  color: string;
}

export interface DatosDonut {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
  total: number;
  tramos: TramoDonut[];
}

/** Geometria del anillo, en el sistema de coordenadas del SVG (100 x 100). */
const RADIO = 38;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/**
 * El SVG del donut, como string listo para un `divIcon` de Leaflet.
 *
 * Se devuelve markup y no JSX porque Leaflet mete el icono en el DOM por su
 * cuenta: React no participa del ciclo de vida de un marcador. Es el mismo
 * camino que ya usan los pines de esta pantalla.
 *
 * Los tramos se dibujan como arcos sobre UN circulo con `stroke-dasharray`, que
 * es exacto y no necesita trigonometria por segmento: cada tramo pinta su
 * porcion y se corre con `stroke-dashoffset` lo que ya ocuparon los anteriores.
 */
export function svgDonut({
  tramos,
  texto,
  tamano,
  grosor,
  colorTexto,
  colorFondo,
  colorTrack,
  resaltado,
}: {
  tramos: TramoDonut[];
  /** Lo que va en el centro, YA redactado por quien llama: un numero, un
   *  porcentaje. La pregunta activa decide que significa; el kit solo lo
   *  dibuja. */
  texto: string;
  tamano: number;
  grosor: number;
  colorTexto: string;
  colorFondo: string;
  colorTrack: string;
  resaltado: boolean;
}): string {
  const suma = tramos.reduce((a, t) => a + t.valor, 0) || 1;
  let recorrido = 0;
  const arcos = tramos
    .filter((t) => t.valor > 0)
    .map((t) => {
      const largo = (t.valor / suma) * CIRCUNFERENCIA;
      // 0.5 de separacion entre tramos: sin ese respiro, dos colores contiguos
      // se leen como uno solo del color del segundo.
      const dash = `${Math.max(largo - 0.5, 0.5)} ${CIRCUNFERENCIA}`;
      const offset = -recorrido;
      recorrido += largo;
      return (
        `<circle cx="50" cy="50" r="${RADIO}" fill="none" stroke="${t.color}" ` +
        `stroke-width="${grosor}" stroke-dasharray="${dash}" ` +
        `stroke-dashoffset="${offset}" stroke-linecap="butt" />`
      );
    })
    .join('');

  // El numero se lee sobre el centro, asi que el centro lleva su propio disco
  // opaco: sobre el mapa a secas, el texto compite con calles y etiquetas.
  // Cuatro caracteres o mas (un "100%") no entran a 30px sin desbordar el
  // anillo.
  const fuente = texto.length >= 4 ? 24 : texto.length === 3 ? 27 : 30;
  return (
    `<svg viewBox="0 0 100 100" width="${tamano}" height="${tamano}" ` +
    `style="overflow:visible;transform:rotate(-90deg)">` +
    `<circle cx="50" cy="50" r="${RADIO - grosor / 2 - 1}" fill="${colorFondo}" />` +
    `<circle cx="50" cy="50" r="${RADIO}" fill="none" stroke="${colorTrack}" stroke-width="${grosor}" />` +
    arcos +
    (resaltado
      ? `<circle cx="50" cy="50" r="${RADIO + grosor / 2 + 2}" fill="none" ` +
        `stroke="${colorTexto}" stroke-width="2" opacity="0.55" />`
      : '') +
    `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" ` +
    `transform="rotate(90 50 50)" font-family="inherit" font-size="${fuente}" ` +
    `font-weight="700" fill="${colorTexto}">${texto}</text>` +
    `</svg>`
  );
}

/**
 * El tamano del donut segun cuantos resume. Raiz cuadrada para que crezca el
 * AREA y no el radio: lineal, una zona con el doble de reclamos se ve cuatro
 * veces mas grande y el mapa exagera.
 */
export function tamanoDonut(valor: number, max: number, min = 46, maxPx = 84): number {
  return Math.round(min + (maxPx - min) * Math.sqrt(valor / Math.max(max, 1)));
}
