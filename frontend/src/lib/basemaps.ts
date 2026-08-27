/**
 * Los mapas base de la app, en UN solo lugar.
 *
 * POR QUÉ EXISTE
 * CARTO (`basemaps.cartocdn.com`) pasó a exigir API key: no devuelve error,
 * devuelve el tile CON UNA MARCA DE AGUA que dice "API KEY REQUIRED" cruzada
 * sobre el mapa. Eso salió publicado en el dashboard, en el mapa de reclamos y
 * en el de tesorería — tres pantallas, tres copias de la misma URL. Ahora la
 * URL vive acá y se cambia una vez.
 *
 * QUÉ SE USA
 * Esri World Canvas (light/dark): gris neutro, sin key, pensado justamente
 * para poner datos encima. Es el equivalente directo del voyager/dark_all que
 * usábamos, y para un heatmap es mejor que un mapa a todo color: no compite.
 *
 * OJO CON EL ORDEN DE LAS COORDENADAS: Esri sirve `{z}/{y}/{x}` (fila antes
 * que columna), al revés que OSM y CARTO. Si algún día se cambia de
 * proveedor, revisar eso primero: con el orden invertido el mapa carga, pero
 * muestra otro lugar del mundo.
 *
 * Tampoco lleva `{s}` (subdominios) ni `{r}` (retina): Esri sirve desde un
 * host único y Leaflet deja los placeholders sin resolver si no existen.
 */

export const BASEMAP = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
} as const;

/** Atribución que pide Esri para el Canvas. Va en el control del mapa. */
export const BASEMAP_ATTR = '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

/** El mapa base que corresponde al tema activo. */
export const basemapDe = (oscuro: boolean): string => (oscuro ? BASEMAP.dark : BASEMAP.light);

/**
 * Alternativa a todo color, cuando el mapa ES el contenido y no el fondo
 * (el mapa de contactos de tesorería lo ofrece como opción).
 */
export const BASEMAP_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const BASEMAP_OSM_ATTR = '&copy; OpenStreetMap contributors';
