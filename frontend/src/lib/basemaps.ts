/**
 * El mapa base de la app, en UN solo lugar.
 *
 * POR QUÉ EXISTE
 * CARTO (`basemaps.cartocdn.com`) pasó a exigir API key, y no falla: devuelve
 * el tile CON UNA MARCA DE AGUA cruzada que dice "API KEY REQUIRED". Eso salió
 * publicado en el dashboard, en el mapa de reclamos y en el de tesorería —
 * tres pantallas con la misma URL copiada. Ahora vive acá y se cambia una vez.
 *
 * POR QUÉ OSM Y NO OTRO
 * Se evaluó el Canvas gris de Esri, que es el equivalente directo. Se descartó:
 * la propia documentación de Esri dice que los basemaps raster clásicos "ya no
 * se actualizan y podrían desactivarse sin aviso", y los nuevos piden API key.
 * Es la misma trampa que CARTO con otro nombre.
 *
 * OpenStreetMap no tiene ese problema: lo sostiene la OSM Foundation, no pide
 * key, y ya lo usaban el mapa de contactos y el selector de ubicación de la
 * app sin inconvenientes. El uso de un municipio está lejísimos de los límites
 * de su política (que apunta a scrapers masivos, no a un tablero).
 *
 * EL GRIS SALE DE CSS, NO DEL PROVEEDOR
 * OSM es colorido y le compite el color a un mapa de calor. En vez de depender
 * de un proveedor que sirva tiles grises, se desatura la CAPA DE TILES por CSS
 * (ver `.leaflet-tile-pane` en styles/mapa-base.css). El filtro toca sólo el
 * fondo: el heatmap, los pines y los polígonos viven en otros panes de Leaflet
 * y quedan con su color intacto.
 *
 * Ventaja de hacerlo así: el modo oscuro es un filtro distinto sobre el MISMO
 * tile, con lo cual no hay que mantener dos URLs ni pedirle al proveedor que
 * tenga versión dark.
 */

/** El único tile server. `{s}` son los subdominios (a/b/c) que Leaflet rota. */
export const BASEMAP = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Atribución obligatoria de OSM. Va en el control del mapa. */
export const BASEMAP_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * La clase que le pone el filtro al contenedor del mapa.
 *
 * Se aplica al `<MapContainer className=...>`; el CSS de `mapa-base.css`
 * desatura desde ahí la capa de tiles. Con `oscuro` invierte, para que el
 * mismo tile sirva de base nocturna.
 */
export const claseBasemap = (oscuro: boolean): string =>
  oscuro ? 'mapa-neutro mapa-neutro--oscuro' : 'mapa-neutro';
