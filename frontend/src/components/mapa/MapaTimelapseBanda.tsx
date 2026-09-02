/**
 * MapaTimelapseBanda — banda del RECORRIDO temporal del Mapa.
 *
 * Se monta debajo de la consulta guiada SÓLO mientras el recorrido está
 * activo. Tres pisos, en este orden:
 *
 *   1. CABECERA en una línea: play redondo · "ACUMULADO" + el rango
 *      grande · el conteo de la ventana con su comparación · velocidades
 *      (1x/2x/4x), bucle y salida.
 *   2. EL ELECTRO (`components/ui/Electro`): el pulso del período completo,
 *      con el hito del alta, el cursor de reproducción y la franja de la
 *      ventana. Reemplaza a la barra de progreso lineal que había antes: la
 *      barra decía "cuánto falta" y no decía NADA del municipio.
 *   3. EL REMATE, cuando el recorrido termina: una frase con el delta real
 *      de tiempo de respuesta entre el primer tramo y el último.
 *
 * Cero colores literales: clases `mtl-*` sobre tokens --pl-* (styles/
 * mapa-timelapse.css). Los únicos valores runtime son los que posiciona el
 * propio Electro.
 */
import { Pause, Play, Repeat, TrendingDown, TrendingUp, X } from 'lucide-react';
import { Electro, type ElectroHito, type ElectroPunto } from '../ui/Electro';
import '../../styles/mapa-timelapse.css';

/** Velocidades del recorrido. 1x = el paso nominal del plan. */
export type VelocidadTimelapse = 1 | 2 | 4;

export interface ComparacionVentana {
  texto: string;
  tono: 'bueno' | 'malo' | 'neutro';
}

export interface RemateTimelapse {
  texto: string;
  /** true = el tiempo de respuesta BAJÓ (icono de tendencia a la baja). */
  mejora: boolean;
}

interface Props {
  /** Rango de la ventana visible ("2 – 31 jul"). */
  rangoLabel: string;
  /** Cuántos reclamos entran en la ventana visible. */
  reclamosEnVentana: number;
  /**
   * El último reclamo que entró, ya escrito ("Bache — Av. Rivadavia 1200").
   * Es lo que convierte al recorrido en algo que se puede narrar: sin esto
   * aparecen puntos de colores y no se sabe qué es cada uno.
   */
  entrando: string | null;
  /** Cómo viene esa ventana contra la anterior (dato real, nunca inventado). */
  comparacion: ComparacionVentana;

  reproduciendo: boolean;
  finalizado: boolean;
  onTogglePlay: () => void;
  velocidad: VelocidadTimelapse;
  onVelocidad: (v: VelocidadTimelapse) => void;
  bucle: boolean;
  onToggleBucle: () => void;
  onReset: () => void;

  // ---- Electro ----
  serieEntradas: ElectroPunto[];
  serieResueltos: ElectroPunto[];
  hito: ElectroHito | null;
  cursor: number | null;
  ventana: [number, number] | null;
  marcasEje: { t: number; label: string }[];
  onSeleccionar: (t: number) => void;
  /** Qué mide cada punto, para el lector de pantalla. */
  ariaLabelElectro: string;

  /** Frase de cierre; sólo cuando el recorrido terminó y hay delta real. */
  remate: RemateTimelapse | null;
}

const VELOCIDADES: VelocidadTimelapse[] = [1, 2, 4];

export default function MapaTimelapseBanda({
  rangoLabel,
  reclamosEnVentana,
  entrando,
  comparacion,
  reproduciendo,
  finalizado,
  onTogglePlay,
  velocidad,
  onVelocidad,
  bucle,
  onToggleBucle,
  onReset,
  serieEntradas,
  serieResueltos,
  hito,
  cursor,
  ventana,
  marcasEje,
  onSeleccionar,
  ariaLabelElectro,
  remate,
}: Props) {
  const IconoPlay = reproduciendo ? Pause : Play;
  const IconoRemate = remate?.mejora ? TrendingDown : TrendingUp;

  return (
    <section className="mtl" aria-label="Recorrido temporal del mapa">
      <header className="mtl-cab">
        {/* En reposo el botón LATE y arrastra el rótulo "Ver la evolución":
            sin eso nada invitaba a tocarlo y el recorrido quedaba escondido. */}
        <button
          type="button"
          className={`mtl-play${reproduciendo ? '' : ' mtl-play--llama'}`}
          onClick={onTogglePlay}
          aria-label={reproduciendo ? 'Pausar el recorrido' : 'Ver cómo evolucionó'}
          title={reproduciendo ? 'Pausar el recorrido' : 'Ver cómo evolucionó'}
        >
          <IconoPlay className="mtl-play-icono" aria-hidden />
        </button>

        <div className="mtl-rango">
          {reproduciendo || rangoLabel ? (
            <>
              <span className="mtl-rotulo">Acumulado</span>
              <span className="mtl-fechas">{rangoLabel}</span>
            </>
          ) : (
            <>
              <span className="mtl-rotulo">El pulso del municipio</span>
              <span className="mtl-fechas mtl-fechas--invita">Ver cómo evolucionó</span>
            </>
          )}
        </div>

        <div className="mtl-conteo" role="status" aria-live="polite">
          <span className="mtl-conteo-valor">
            {reclamosEnVentana} {reclamosEnVentana === 1 ? 'reclamo' : 'reclamos'}
          </span>
          <span className={`mtl-conteo-cmp mtl-conteo-cmp--${comparacion.tono}`}>
            {comparacion.texto}
          </span>
        </div>

        {/* Qué acaba de entrar. Va al lado del conteo y no sobre el mapa: ahí
            taparía justo la zona donde cayó el reclamo. */}
        {entrando && (
          <div className="mtl-entrando" role="status" aria-live="polite">
            <span className="mtl-entrando-punto" aria-hidden />
            <span className="mtl-entrando-texto" title={entrando}>{entrando}</span>
          </div>
        )}

        <div className="mtl-controles">
          <div className="mtl-vel" role="group" aria-label="Velocidad del recorrido">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                type="button"
                className={`mtl-vel-btn${v === velocidad ? ' mtl-vel-btn--activo' : ''}`}
                onClick={() => onVelocidad(v)}
                aria-pressed={v === velocidad}
              >
                {v}x
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`mtl-icono-btn${bucle ? ' mtl-icono-btn--activo' : ''}`}
            onClick={onToggleBucle}
            aria-pressed={bucle}
            title="Repetir en bucle al llegar al final"
            aria-label="Repetir en bucle al llegar al final"
          >
            <Repeat className="mtl-icono" aria-hidden />
          </button>

          <button type="button" className="mtl-salir" onClick={onReset}>
            <X className="mtl-icono" aria-hidden />
            Salir del recorrido
          </button>
        </div>
      </header>

      <Electro
        serie={serieEntradas}
        serieSecundaria={serieResueltos.length > 0 ? serieResueltos : undefined}
        hito={hito}
        cursor={cursor}
        ventana={ventana}
        marcasEje={marcasEje}
        onSeleccionar={onSeleccionar}
        ariaLabel={ariaLabelElectro}
        className="mtl-electro"
      />

      {finalizado && remate && (
        <p className="mtl-remate">
          <IconoRemate className="mtl-remate-icono" aria-hidden />
          {remate.texto}
        </p>
      )}
    </section>
  );
}
