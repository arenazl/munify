import { CircleMarker, Tooltip } from 'react-leaflet';

/**
 * Un barrio dibujado como BURBUJA: un circulo parado en su punto, del tamano
 * de cuantos reclamos tiene y del color de como esta.
 *
 * Por que una burbuja y no el contorno del barrio
 * ------------------------------------------------
 * Porque el contorno es un lujo y el punto no. En la base de QA hay 2.028
 * barrios: 2.026 tienen su coordenada y solo 349 tienen contorno. Una lectura
 * del territorio que dependa del poligono deja mudo al 83% de los municipios
 * (dueno, 2026-09-05: "el dato del contorno del barrio es un lujo que no nos
 * podemos dar"). La burbuja necesita lo que siempre hay: un punto y un numero.
 *
 * Por que una burbuja y no una mancha de calor
 * ---------------------------------------------
 * Porque contestan cosas distintas con la misma entrada. La mancha dice "aca
 * hay muchos" --y donde vive mas gente siempre hay mas, asi que termina siendo
 * un mapa de poblacion--. La burbuja dice QUE barrio, CUANTOS y SI ESTA BIEN O
 * MAL, que es lo que un intendente mira: "en estos barrios tenes problemas, en
 * estos no". Ademas se compara: dos burbujas al lado se miden entre si, dos
 * manchas difusas no.
 *
 * TONTO a proposito (regla 6.bis del kit): no sabe de reclamos, de estados ni
 * de veredictos. El padre declara el valor, el color y el texto; el componente
 * solo decide el TAMANO --que es geometria, no negocio-- y como se rotula.
 */

export interface BurbujaBarrio {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
  /** Lo que define el tamano. El padre decide que significa. */
  valor: number;
  /** El padre lo elige: el kit no interpreta el dato. */
  color: string;
  /** Renglon principal del rotulo, ya redactado ("15 reclamos"). */
  etiqueta: string;
  /** Segundo renglon opcional ("el mas viejo hace 220 dias"). */
  detalle?: string;
}

interface Props {
  burbujas: BurbujaBarrio[];
  /** El barrio elegido: se resalta y su rotulo queda fijo. */
  elegidoId?: number | null;
  onElegir?: (id: number) => void;
  /** Cuantos rotulos quedan escritos sin pasar el mouse. Los demas, al hover. */
  rotulosFijos?: number;
  radioMin?: number;
  radioMax?: number;
}

export function BurbujasBarrio({
  burbujas,
  elegidoId = null,
  onElegir,
  rotulosFijos = 4,
  radioMin = 9,
  radioMax = 30,
}: Props) {
  if (burbujas.length === 0) return null;

  const max = Math.max(...burbujas.map((b) => b.valor), 1);

  // Los que se rotulan sin hover: los mas grandes. Rotular las cuarenta
  // taparia el mapa con texto y ninguna se leeria; la gracia es que las que
  // importan se lean de un vistazo y el resto conteste al pasar el mouse.
  const conRotulo = new Set(
    [...burbujas].sort((a, b) => b.valor - a.valor).slice(0, rotulosFijos).map((b) => b.id),
  );

  // Se dibujan de mayor a menor para que las chicas queden ENCIMA: al reves,
  // una burbuja grande se come a las chicas que caen adentro y no se pueden
  // ni ver ni tocar.
  const orden = [...burbujas].sort((a, b) => b.valor - a.valor);

  return (
    <>
      {orden.map((b) => {
        const elegido = elegidoId === b.id;
        // Raiz cuadrada: el AREA del circulo crece con el valor, no el radio.
        // Con el radio lineal, un barrio con el doble de reclamos se ve cuatro
        // veces mas grande y el mapa exagera.
        const radio = radioMin + (radioMax - radioMin) * Math.sqrt(b.valor / max);
        const fijo = elegido || conRotulo.has(b.id);
        return (
          <CircleMarker
            key={`burbuja-${b.id}`}
            center={[b.lat, b.lng]}
            radius={radio}
            pathOptions={{
              color: b.color,
              weight: elegido ? 3 : 1.5,
              opacity: elegido ? 1 : 0.85,
              fillColor: b.color,
              fillOpacity: elegido ? 0.5 : 0.28,
            }}
            eventHandlers={onElegir ? { click: () => onElegir(b.id) } : undefined}
          >
            {/* UN tooltip en dos modos, igual que los poligonos: Leaflet
                permite uno solo por capa y `permanent` es opcion de
                construccion, de ahi la `key` que lo remonta al cambiar. */}
            <Tooltip
              key={fijo ? `fijo-${b.id}` : `hover-${b.id}`}
              permanent={fijo}
              direction="top"
              offset={[0, -radio + 2]}
              className="av2-rotulo"
            >
              <div className="font-medium text-sm">{b.nombre}</div>
              <div className="text-xs">{b.etiqueta}</div>
              {b.detalle && <div className="text-xs opacity-80">{b.detalle}</div>}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default BurbujasBarrio;
