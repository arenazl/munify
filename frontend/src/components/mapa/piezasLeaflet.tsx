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
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Un gesto de rueda = UN nivel de zoom.
 *
 * El zoom por rueda de Leaflet ACUMULA píxeles: `wheelPxPerZoomLevel` divide el
 * desplazamiento y devuelve cuántos niveles saltar de una. Con una rueda de alta
 * resolución --- o un trackpad, que manda decenas de eventos por gesto --- un
 * empujoncito se convierte en varios niveles y el mapa se va de viaje. Subir el
 * umbral (180px, como tenían todos los mapas) sólo corre el problema de lugar:
 * sigue dependiendo de cuántos píxeles reporte el dispositivo.
 *
 * Acá el zoom deja de ser proporcional al desplazamiento y pasa a ser discreto:
 * cada gesto mueve exactamente un nivel, y los eventos que llegan pegados dentro
 * de la misma ventana se ignoran. `setZoomAround` mantiene bajo el cursor el
 * punto que estabas mirando, igual que el zoom nativo.
 *
 * Se cuenta el GESTO, no el tiempo. Un tope de milisegundos entre zooms no
 * alcanza: un solo golpe de rueda dispara eventos durante medio segundo o más
 * --- las ruedas modernas y los trackpads mandan decenas con inercia --- así
 * que con 140 ms de tope entraban cinco o seis niveles por golpe. El primer
 * evento hace el zoom y los siguientes quedan ignorados hasta que haya
 * SILENCIO: mientras sigan llegando, es el mismo gesto.
 */
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

/** Cuantas capas tiene el mapa encima. Es el sospechoso numero uno cuando un
 *  zoom tarda: no tarda el zoom, tarda redibujar lo que hay. */
function contarCapas(map: ReturnType<typeof useMap>): number {
  let n = 0;
  map.eachLayer(() => { n += 1; });
  return n;
}

export const SILENCIO_FIN_GESTO_MS = 260;

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
    // Apagarlo solo desde acá no alcanza y ese fue el bug que sobrevivio al
    // primer arreglo (dueno, 2026-09-05: "me sigue haciendo zoom cuando quiere,
    // le doy uno y me hace cuarenta"). Este `disable()` corre en un efecto, o
    // sea DESPUES de que Leaflet monto el mapa con el zoom por rueda activo, y
    // cualquier cosa que reinicialice el handler --un cambio de props del
    // MapContainer, un remonte-- lo vuelve a prender sin pasar por aca. Con las
    // dos cosas actuando a la vez, un golpe de rueda hacia el salto discreto de
    // este componente MAS los niveles proporcionales de Leaflet.
    //
    // Declarado en el MapContainer, el handler nativo no llega a existir nunca.
    map.scrollWheelZoom.disable();
    const contenedor = map.getContainer();
    let enGesto = false;
    let eventosDelGesto = 0;
    let finGesto: ReturnType<typeof setTimeout> | null = null;
    const alGirar = (e: WheelEvent) => {
      // LA RUEDA SOLA ES DE LA PAGINA, NO DEL MAPA.
      //
      // El mapa ocupa casi toda la altura de la pantalla, asi que al bajar por
      // la pagina el cursor cae encima si o si; si el mapa se queda con ese
      // gesto, el scroll se traba y ademas se va el zoom del lugar donde uno
      // estaba (dueno, 2026-09-05: "te paras sobre el mapa y se te va toda la
      // miercoles"). Con Ctrl --el gesto de zoom que ya usa todo el mundo en
      // Google Maps y en el navegador-- el mapa toma el control.
      //
      // A pantalla completa no aplica: ahi no hay pagina detras.
      if (!zoomLibre && !e.ctrlKey && !e.metaKey) {
        onIntentoSinModificador?.();
        return;                            // sin preventDefault: scrollea la pagina
      }
      e.preventDefault();
      eventosDelGesto += 1;
      if (finGesto) clearTimeout(finGesto);
      finGesto = setTimeout(() => {
        enGesto = false;
        if (DEBUG) {
          console.log(
            `[zoom] gesto cerrado · ${eventosDelGesto} eventos de rueda ` +
            `· deltaMode=${e.deltaMode} (0=px 1=lineas 2=paginas) · ultimo deltaY=${e.deltaY}`,
          );
        }
        eventosDelGesto = 0;
      }, SILENCIO_FIN_GESTO_MS);
      if (enGesto) return;                // sigue el mismo golpe de rueda
      enGesto = true;
      const paso = e.deltaY > 0 ? -1 : 1;
      const desde = map.getZoom();
      const destino = Math.min(
        map.getMaxZoom(),
        Math.max(map.getMinZoom(), desde + paso),
      );
      if (destino !== desde) {
        // CUANTO TARDA, medido de punta a punta.
        //
        // No es curiosidad: el dueno reporto zooms que tardan segundos
        // (2026-09-05). El gesto en si es instantaneo; lo que puede tardar es
        // lo que el mapa REDIBUJA despues --cientos de marcadores, poligonos y
        // el canvas del heatmap, todos recalculados en cada nivel--. Separar
        // "cuanto tardo el zoom" de "cuanto tardo el redibujo" es la unica
        // forma de saber a quien culpar.
        const t0 = performance.now();
        map.once('zoomend', () => {
          const t1 = performance.now();
          if (DEBUG) {
            console.log(
              `[zoom] ${desde} -> ${destino} en ${Math.round(t1 - t0)} ms ` +
              `· capas en el mapa: ${contarCapas(map)}`,
            );
          }
          // El redibujo posterior (marcadores, heatmap) cae en el frame
          // siguiente: se mide aparte para no confundirlo con el zoom.
          requestAnimationFrame(() => {
            if (DEBUG) {
              console.log(`[zoom] pintado completo a los ${Math.round(performance.now() - t0)} ms`);
            }
          });
        });
        map.setZoomAround(map.mouseEventToContainerPoint(e), destino);
      }
    };
    contenedor.addEventListener('wheel', alGirar, { passive: false });
    return () => {
      contenedor.removeEventListener('wheel', alGirar);
      if (finGesto) clearTimeout(finGesto);
    };
  }, [map, zoomLibre, onIntentoSinModificador]);
  return null;
}

/**
 * El lienzo del mapa suele ser ELÁSTICO (toma el alto libre del viewport, o
 * cambia al colapsar el sidebar o al entrar en pantalla completa). Leaflet no
 * se entera solo de que su contenedor cambió: sin `invalidateSize()` deja
 * tiles a medio dibujar y el fitBounds queda descentrado. Un ResizeObserver
 * sobre el contenedor cubre TODOS los casos, no sólo el `window.resize`.
 */
export function InvalidarAlRedimensionar() {
  const map = useMap();
  useEffect(() => {
    const contenedor = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(contenedor);
    return () => ro.disconnect();
  }, [map]);
  return null;
}
