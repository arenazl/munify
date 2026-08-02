/**
 * FocosRotativos — el mapa como REPRODUCTOR de los focos del municipio.
 *
 * QUÉ PROBLEMA RESUELVE
 * Antes debajo del mapa iba un listado de esquinas. Como el listado crece con
 * los datos, la tarjeta crecía con él y rompía la simetría de la fila del
 * dashboard: las tarjetas de al lado quedaban cortas y la grilla se veía
 * desarmada. Además el listado se lee una vez y después es peso muerto.
 *
 * Ahora el mapa RECORRE los focos: se centra en uno, cuenta qué pasa ahí, y a
 * los pocos segundos pasa al siguiente. La tarjeta tiene SIEMPRE el mismo alto
 * —la altura no depende de cuántos focos haya— y el movimiento hace que la
 * pantalla se lea sola en una demo, sin que nadie toque nada.
 *
 * El pie se arma sobre una pila de altura estable (todos los focos ocupan su
 * lugar, sólo se ve el activo), así que tampoco salta al cambiar de uno a
 * otro aunque los nombres de calle midan distinto.
 *
 * La rotación vive en `useCarruselAuto`, el mismo hook que usa el hero: se
 * pausa al pasar el mouse o al enfocar algo adentro, y no rota sola si el
 * visitante pidió menos movimiento.
 */
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import HeatmapWidget from '../ui/HeatmapWidget';
import { useCarruselAuto } from '../../lib/useCarruselAuto';

/** Cada cuánto salta al foco siguiente. */
const INTERVALO_MS = 7000;
/** Zoom al encuadrar un foco: la cuadra, no la ciudad. */
const ZOOM_FOCO = 16;

export interface Foco {
  /** Dirección/esquina, tal como la escribió el vecino. */
  direccion: string;
  zona?: string | null;
  cantidad: number;
  lat?: number | null;
  lng?: number | null;
  /** La categoría que más pesa ahí, y cuántos de sus reclamos son. */
  categoriaTop?: string | null;
  categoriaTopCantidad?: number;
  /**
   * Antigüedad del reclamo más viejo de esa esquina, en días. Es lo que
   * convierte el foco en algo urgente: cuatro reclamos juntos son un dato,
   * cuatro reclamos juntos hace cuarenta días son un problema.
   */
  diasMasViejo?: number | null;
}

interface HeatPoint {
  lat: number;
  lng: number;
  intensidad: number;
  estado: string;
  categoria: string;
}

interface FocosRotativosProps {
  focos: Foco[];
  /** Puntos del mapa de calor (ya filtrados por la categoría elegida). */
  puntos: HeatPoint[];
  loading?: boolean;
  altura?: string;
  onVerFoco?: (foco: Foco) => void;
}

export function FocosRotativos({
  focos,
  puntos,
  loading,
  altura = '260px',
  onVerFoco,
}: FocosRotativosProps) {
  // Sin coordenadas no se puede encuadrar: esos focos se saltean en vez de
  // mandar el mapa a un punto inventado.
  const conMapa = focos.filter((f) => typeof f.lat === 'number' && typeof f.lng === 'number');
  const { indice, ir, siguiente, anterior, propsPausa, menosMovimiento, pausado, alternarPausa } = useCarruselAuto({
    total: conMapa.length,
    intervaloMs: INTERVALO_MS,
  });

  if (conMapa.length === 0) {
    return (
      <HeatmapWidget
        data={puntos}
        showMarkers={false}
        showLegend={false}
        height={altura}
        title="Mapa de calor"
        loading={loading}
      />
    );
  }

  const activo = conMapa[indice];

  return (
    <div className="fr" {...propsPausa}>
      <div className="fr-mapa" style={{ height: altura }}>
        <HeatmapWidget
          data={puntos}
          showMarkers={false}
          /* La leyenda de categorías del mapa duplicaba la botonera de cuatro
             que vive arriba de la tarjeta: dos controles para lo mismo, y ocho
             chips donde el dueño pidió cuatro. */
          showLegend={false}
          height={altura}
          title="Mapa de calor"
          loading={loading}
          center={[activo.lat as number, activo.lng as number]}
          zoom={ZOOM_FOCO}
        />
      </div>

      {/* El reproductor va FLOTANDO sobre el mapa, no debajo: el mapa se queda
          con todo el alto y los controles quedan sobre la parte de abajo, que
          es la que menos información tiene. */}
      <div className="fr-pie">
        <button
          type="button"
          className="fr-nav"
          onClick={anterior}
          aria-label="Foco anterior"
          title="Anterior"
        >
          <ChevronLeft className="fr-nav-icono" aria-hidden="true" />
        </button>

        <span className="fr-puesto" aria-hidden="true">{activo.cantidad}</span>

        {/* Pila de altura estable: todos los focos ocupan su lugar y sólo se
            ve el activo, así el pie no cambia de alto entre calles largas y
            cortas. Misma técnica que el hero. */}
        <div className="fr-stack" aria-live="polite">
          {conMapa.map((f, i) => (
            <button
              key={`${f.direccion}-${i}`}
              type="button"
              className={`fr-foco ${i === indice ? 'fr-foco--activo' : ''}`}
              aria-hidden={i !== indice}
              onClick={() => onVerFoco?.(f)}
            >
              <span className="fr-direccion">{f.direccion}</span>
              <span className="fr-detalle">
                {f.zona ? `${f.zona} · ` : ''}
                {f.categoriaTop && f.categoriaTopCantidad
                  ? `${f.categoriaTopCantidad} de ${f.cantidad} son ${f.categoriaTop.toLowerCase()}`
                  : `${f.cantidad} ${f.cantidad === 1 ? 'reclamo' : 'reclamos'}`}
                {f.diasMasViejo != null && f.diasMasViejo > 0
                  ? ` · el más viejo hace ${f.diasMasViejo} ${f.diasMasViejo === 1 ? 'día' : 'días'}`
                  : ''}
              </span>
            </button>
          ))}
        </div>

        {/* Los puntos: el activo se estira. Con cuatro focos, cuatro puntos
            iguales no dicen en cuál estás. */}
        <div className="fr-dots">
          {conMapa.map((f, i) => (
            <button
              key={`dot-${f.direccion}-${i}`}
              type="button"
              className={`fr-dot ${i === indice ? 'fr-dot--activo' : ''}`}
              aria-label={`Foco ${i + 1} de ${conMapa.length}: ${f.direccion}`}
              aria-current={i === indice}
              onClick={() => ir(i)}
            />
          ))}
        </div>

        {/* Refleja el estado REAL: si el visitante pidió menos movimiento el
            recorrido no arranca, y el botón pasa a ser "siguiente". */}
        <button
          type="button"
          className="fr-nav"
          onClick={menosMovimiento ? siguiente : alternarPausa}
          aria-label={menosMovimiento ? 'Ver el siguiente' : pausado ? 'Retomar el recorrido' : 'Pausar el recorrido'}
          title={menosMovimiento ? 'Ver el siguiente' : pausado ? 'Retomar' : 'Pausar'}
        >
          {menosMovimiento || pausado
            ? <Play className="fr-nav-icono" aria-hidden="true" />
            : <Pause className="fr-nav-icono" aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="fr-nav"
          onClick={siguiente}
          aria-label="Foco siguiente"
          title="Siguiente"
        >
          <ChevronRight className="fr-nav-icono" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
