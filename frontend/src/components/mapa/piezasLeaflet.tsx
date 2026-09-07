/**
 * Piezas COMPARTIDAS para todo <MapContainer> de la app. Van como hijos del
 * MapContainer (usan `useMap`). Nacieron en Mapa.tsx y se sacaron acá porque
 * el zoom por rueda "se iba de viaje" en TODAS las pantallas con mapa y el
 * arreglo estaba en una sola (dueño, 2026-09-03: "aprovechemos para
 * encontrar el fix y lo repartimos a toda la app").
 *
 * Uso mínimo:
 *   <MapContainer ...>
 *     <ZoomRuedaDeAUno />
 *     <InvalidarAlRedimensionar />
 *     ...
 *   </MapContainer>
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Un gesto de rueda = UN nivel de zoom.
 *
 * El zoom por rueda de Leaflet ACUMULA pixeles: `wheelPxPerZoomLevel` divide el
 * desplazamiento y devuelve cuantos niveles saltar de una. Con una rueda
 * configurada en varios renglones --- o un trackpad, que manda decenas de
 * eventos por gesto --- un empujoncito se convierte en tres o cuatro niveles y
 * el mapa se va de viaje. Es comportamiento NATIVO, no un bug de esta app:
 * pasa igual en cualquier mapa Leaflet sin tocar (el dueno lo confirmo el
 * 2026-09-05 viendo el mismo salto en un prototipo ajeno). Subir el umbral solo
 * corre el problema de lugar: sigue dependiendo de cuantos pixeles reporte el
 * dispositivo.
 *
 * Aca el zoom deja de ser proporcional al desplazamiento y pasa a ser discreto:
 * cada gesto mueve exactamente un nivel. `setZoomAround` mantiene bajo el
 * cursor el punto que estabas mirando, igual que el zoom nativo.
 *
 * Por eso vive en `piezasLeaflet` y no en una pantalla: el arreglo es agnostico
 * y lo consumen los siete mapas de la app.
 */
/**
 * Cuanto espera entre un zoom y el siguiente.
 *
 * REEMPLAZA a la "ventana de silencio" anterior, que era el bug: el gesto se
 * daba por terminado recien cuando pasaban 260 ms SIN eventos, y ese contador
 * se reagendaba con cada evento nuevo. Una rueda configurada en varios
 * renglones --o un trackpad-- manda eventos en rafaga continua, asi que
 * mientras el usuario seguia girando nunca habia silencio: el gesto no
 * terminaba nunca y todo zoom quedaba bloqueado. Se soltaba al parar de girar,
 * y el movimiento siguiente disparaba. De ahi el "no reacciona y a los dos o
 * tres segundos lo hace" que lo volvia inusable (dueno, 2026-09-05).
 *
 * El enfriamiento se mide desde el ULTIMO ZOOM APLICADO, no desde el ultimo
 * evento. Un golpe de rueda con inercia entra como un solo nivel; girar
 * sostenido avanza a un ritmo parejo y siempre responde.
 */
export const ENFRIAMIENTO_ZOOM_MS = 140;

/**
 * El log del zoom se prende con `?debugmapa=1` o dejando `debugmapa` en el
 * localStorage. Va apagado por default: son varias lineas por gesto y en uso
 * normal solo ensucian la consola.
 */
const DEBUG = (() => {
  try {
    return typeof window !== 'undefined'
      && (new URLSearchParams(window.location.search).has('debugmapa')
          || window.localStorage.getItem('debugmapa') === '1');
  } catch {
    return false;   // localStorage puede tirar en modo privado
  }
})();

export function ZoomRuedaDeAUno({
  zoomLibre = false,
  onIntentoSinModificador,
}: {
  /** A pantalla completa no hay pagina detras que scrollear: la rueda hace
   *  zoom directo, sin pedir Ctrl. */
  zoomLibre?: boolean;
  /** Se avisa cuando alguien giro la rueda sin Ctrl y el zoom no ocurrio, para
   *  que la pantalla pueda decirle como se hace. Sin este aviso el mapa
   *  parece roto: girás y no pasa nada. */
  onIntentoSinModificador?: () => void;
} = {}) {
  const map = useMap();
  useEffect(() => {
    // OJO: el MapContainer TIENE que declarar `scrollWheelZoom={false}`.
    //
    // Apagarlo solo desde aca no alcanza: este `disable()` corre en un efecto,
    // o sea DESPUES de que Leaflet monto el mapa con el zoom por rueda activo,
    // y cualquier cosa que reinicialice el handler lo vuelve a prender sin
    // pasar por aca. Con los dos actuando a la vez, un golpe de rueda hacia el
    // salto discreto de este componente MAS los niveles proporcionales de
    // Leaflet: el "le doy uno y me hace cuarenta".
    map.scrollWheelZoom.disable();
    const contenedor = map.getContainer();
    let ultimoZoom = 0;

    const alGirar = (e: WheelEvent) => {
      // LA RUEDA SOLA ES DE LA PAGINA, NO DEL MAPA.
      //
      // El mapa ocupa casi toda la altura, asi que al bajar por la pagina el
      // cursor cae encima si o si; si el mapa se queda con ese gesto, el scroll
      // se traba. Con Ctrl --el gesto de zoom que ya usa todo el mundo-- el
      // mapa toma el control. A pantalla completa no aplica: no hay pagina
      // detras.
      if (!zoomLibre && !e.ctrlKey && !e.metaKey) {
        onIntentoSinModificador?.();
        return;                            // sin preventDefault: scrollea la pagina
      }
      e.preventDefault();

      const ahora = performance.now();
      if (ahora - ultimoZoom < ENFRIAMIENTO_ZOOM_MS) return;
      ultimoZoom = ahora;

      const paso = e.deltaY > 0 ? -1 : 1;
      const desde = map.getZoom();
      const destino = Math.min(
        map.getMaxZoom(),
        Math.max(map.getMinZoom(), desde + paso),
      );
      if (destino === desde) return;

      if (DEBUG) {
        const t0 = performance.now();
        map.once('zoomend', () => {
          console.log(
            `[zoom] ${desde} -> ${destino} en ${Math.round(performance.now() - t0)} ms ` +
            `· capas: ${contarCapas(map)} · deltaMode=${e.deltaMode} deltaY=${e.deltaY}`,
          );
        });
      }

      // SIN ANIMACION. La animacion de zoom de Leaflet reposiciona cada capa
      // durante ~250 ms; con cientos de marcadores, poligonos y el canvas del
      // heatmap encima, esos cuadros se atragantan y el zoom se siente pegajoso
      // --- y dos gestos seguidos encolan dos animaciones. El salto directo es
      // instantaneo y es lo que se espera de un control que se toca varias
      // veces seguidas.
      map.setZoomAround(map.mouseEventToContainerPoint(e), destino, { animate: false });
    };

    contenedor.addEventListener('wheel', alGirar, { passive: false });
    return () => {
      contenedor.removeEventListener('wheel', alGirar);
    };
  }, [map, zoomLibre, onIntentoSinModificador]);
  return null;
}

/** Cuantas capas tiene el mapa encima. Es el sospechoso numero uno cuando un
 *  zoom tarda: no tarda el zoom, tarda redibujar lo que hay. */
function contarCapas(map: ReturnType<typeof useMap>): number {
  let n = 0;
  map.eachLayer(() => { n += 1; });
  return n;
}

/**
 * El lienzo del mapa suele ser ELÁSTICO (toma el alto libre del viewport, o
 * cambia al colapsar el sidebar o al entrar en pantalla completa). Leaflet no
 * se entera solo de que su contenedor cambió: sin `invalidateSize()` deja
 * tiles a medio dibujar y el fitBounds queda descentrado. Un ResizeObserver
 * sobre el contenedor cubre TODOS los casos, no sólo el `window.resize`.
 */
export function InvalidarAlRedimensionar({
  onRedimensionar,
}: {
  /**
   * Se avisa cuando el mapa cambio de tamano DE VERDAD, para que la pantalla
   * pueda volver a encuadrar.
   *
   * `invalidateSize` sola no alcanza: le dice a Leaflet cuanto mide ahora, pero
   * le deja el mismo zoom. Un mapa que crece muestra mas territorio alrededor
   * de lo mismo, asi que al agrandar la ventana --o al colapsar el panel de al
   * lado-- el municipio se quedaba chiquito con campo ajeno alrededor, y en un
   * monitor grande el sobrante daba para meter pueblos vecinos enteros (dueno,
   * 2026-09-06). Redimensionar es justo cuando uno quiere ver todo, no cuando
   * esta mirando una esquina, asi que re-encuadrar ahi no le pisa la vista a
   * nadie.
   */
  onRedimensionar?: () => void;
} = {}) {
  const map = useMap();
  const avisar = useRef(onRedimensionar);
  useEffect(() => { avisar.current = onRedimensionar; }, [onRedimensionar]);

  useEffect(() => {
    const contenedor = map.getContainer();
    let ancho = contenedor.clientWidth;
    let alto = contenedor.clientHeight;
    let pendiente: ReturnType<typeof setTimeout> | null = null;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      const w = contenedor.clientWidth;
      const h = contenedor.clientHeight;
      if (!w || !h) return;
      // Solo los cambios que descuadran. Un par de pixeles --una barra de
      // scroll que aparece, el redondeo de un flex-- no justifican mover la
      // vista de alguien.
      const cambio = Math.max(Math.abs(w - ancho) / ancho, Math.abs(h - alto) / alto);
      ancho = w; alto = h;
      if (cambio < 0.08) return;
      // Al final del arrastre, no en cada cuadro: redimensionar una ventana
      // dispara decenas de eventos y no hace falta encuadrar en todos.
      if (pendiente) clearTimeout(pendiente);
      pendiente = setTimeout(() => avisar.current?.(), 220);
    });
    ro.observe(contenedor);
    return () => { ro.disconnect(); if (pendiente) clearTimeout(pendiente); };
  }, [map]);
  return null;
}
