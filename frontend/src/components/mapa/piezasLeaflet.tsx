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
export const SILENCIO_FIN_GESTO_MS = 260;

export function ZoomRuedaDeAUno() {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    const contenedor = map.getContainer();
    let enGesto = false;
    let finGesto: ReturnType<typeof setTimeout> | null = null;
    const alGirar = (e: WheelEvent) => {
      e.preventDefault();
      if (finGesto) clearTimeout(finGesto);
      finGesto = setTimeout(() => { enGesto = false; }, SILENCIO_FIN_GESTO_MS);
      if (enGesto) return;                // sigue el mismo golpe de rueda
      enGesto = true;
      const paso = e.deltaY > 0 ? -1 : 1;
      const destino = Math.min(
        map.getMaxZoom(),
        Math.max(map.getMinZoom(), map.getZoom() + paso),
      );
      if (destino !== map.getZoom()) {
        map.setZoomAround(map.mouseEventToContainerPoint(e), destino);
      }
    };
    contenedor.addEventListener('wheel', alGirar, { passive: false });
    return () => {
      contenedor.removeEventListener('wheel', alGirar);
      if (finGesto) clearTimeout(finGesto);
    };
  }, [map]);
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
