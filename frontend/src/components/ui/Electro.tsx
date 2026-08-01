/**
 * Electro — pulso de una serie temporal, con forma de electrocardiograma.
 *
 * Componente del KIT: agnóstico, no sabe qué mide. Sirve para reclamos que
 * entran, ventas, altas y bajas, o cualquier par de series en el tiempo.
 *
 * QUÉ MUESTRA
 *  - Una línea fina que recorre TODO el período elegido.
 *  - Un HITO opcional (`hito`): línea vertical + etiqueta. La línea se pinta
 *    de un tono ANTES del hito y de otro DESPUÉS — así se lee de un vistazo
 *    que algo cambió a partir de ese momento. Sin hito, la línea es de un
 *    solo color.
 *  - Un cursor (`cursor`) con punto luminoso, para acompañar una reproducción.
 *  - Una franja (`ventana`) que sombrea el tramo visible durante el recorrido.
 *
 * DATOS
 *  Las series vienen YA agrupadas por el consumidor (`{ t, v }[]`, `t` en ms).
 *  El componente no agrupa ni inventa: dibuja lo que recibe. Si una serie
 *  viene vacía, no se dibuja — nunca se rellena con ceros fabricados.
 *
 * INTERACCIÓN
 *  Click (o teclado) sobre el trazo devuelve el `t` más cercano por
 *  `onSeleccionar`, para saltar a ese momento del recorrido.
 *
 * Estilos en styles/electro.css, 100% sobre tokens --pl-*.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface ElectroPunto {
  /** Momento en milisegundos (Date.getTime()). */
  t: number;
  v: number;
}

export interface ElectroHito {
  /** Momento del hito, en ms. Si cae fuera del rango, no se dibuja. */
  t: number;
  /** Etiqueta corta en caps (ej: "EMPEZARON A USAR EL SISTEMA"). */
  etiqueta: string;
}

export interface ElectroProps {
  /** Serie principal (la que dibuja el pulso). */
  serie: ElectroPunto[];
  /** Serie secundaria opcional, se dibuja tenue por debajo. */
  serieSecundaria?: ElectroPunto[];
  /** Hito que parte el trazo en "antes" y "después". */
  hito?: ElectroHito | null;
  /** Momento del cursor (reproducción). */
  cursor?: number | null;
  /** Tramo sombreado [desde, hasta] en ms. */
  ventana?: [number, number] | null;
  /** Click sobre el trazo → momento más cercano. */
  onSeleccionar?: (t: number) => void;
  /** Etiquetas del eje: las arma el consumidor (sabe el formato de fecha). */
  marcasEje?: { t: number; label: string }[];
  ariaLabel: string;
  className?: string;
}

const ALTO = 64;
const PAD_Y = 8;

/** Convierte una serie a coordenadas dentro del viewBox. */
const aPuntos = (
  serie: ElectroPunto[],
  min: number,
  span: number,
  maxV: number,
  ancho: number,
): [number, number][] =>
  serie.map((p) => [
    span > 0 ? ((p.t - min) / span) * ancho : 0,
    maxV > 0 ? ALTO - PAD_Y - (p.v / maxV) * (ALTO - PAD_Y * 2) : ALTO - PAD_Y,
  ]);

/** Path suavizado (curva de Catmull-Rom aproximada con cúbicas). */
const aPath = (pts: [number, number][]): string => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  return d;
};

export function Electro({
  serie,
  serieSecundaria,
  hito,
  cursor,
  ventana,
  onSeleccionar,
  marcasEje,
  ariaLabel,
  className,
}: ElectroProps) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);

  // El viewBox se estira al ancho real para que el trazo no se deforme.
  useLayoutEffect(() => {
    const nodo = cajaRef.current;
    if (!nodo) return;
    const medir = () => setAncho(Math.max(120, Math.round(nodo.clientWidth)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    // Sin puntos, o con TODOS en cero, no hay pulso que dibujar: una línea
    // recta no informa nada y hace creer que el gráfico está roto.
    if (serie.length === 0 || serie.every((p) => p.v === 0)) return null;
    const ts = serie.map((p) => p.t);
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    const span = max - min;
    const maxV = Math.max(
      1,
      ...serie.map((p) => p.v),
      ...(serieSecundaria ?? []).map((p) => p.v),
    );
    const x = (t: number) => (span > 0 ? ((t - min) / span) * ancho : 0);

    const pts = aPuntos(serie, min, span, maxV, ancho);
    // El hito sólo cuenta si cae DENTRO del rango dibujado.
    const hitoDentro = hito && hito.t > min && hito.t < max ? hito : null;

    let pathAntes = '';
    let pathDespues = '';
    if (hitoDentro) {
      // Se parte la serie en el punto del hito, repitiendo el punto de corte
      // para que los dos trazos se toquen y no quede un hueco.
      const corte = serie.findIndex((p) => p.t >= hitoDentro.t);
      const i = corte < 0 ? serie.length - 1 : corte;
      pathAntes = aPath(pts.slice(0, i + 1));
      pathDespues = aPath(pts.slice(i));
    } else {
      pathDespues = aPath(pts);
    }

    return {
      min,
      max,
      span,
      maxV,
      x,
      pts,
      pathAntes,
      pathDespues,
      hitoDentro,
      pathSecundaria: serieSecundaria?.length
        ? aPath(aPuntos(serieSecundaria, min, span, maxV, ancho))
        : '',
    };
  }, [serie, serieSecundaria, hito, ancho]);

  /** Traduce un click en coordenada de tiempo y devuelve el punto más cercano. */
  const alClickear = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeleccionar || !geo) return;
      const caja = e.currentTarget.getBoundingClientRect();
      const rel = (e.clientX - caja.left) / Math.max(1, caja.width);
      const t = geo.min + rel * geo.span;
      const cercano = serie.reduce((a, b) =>
        Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a,
      );
      onSeleccionar(cercano.t);
    },
    [onSeleccionar, geo, serie],
  );

  if (!geo) return null;

  const cursorX = cursor != null ? geo.x(cursor) : null;
  const puntoCursor =
    cursor != null
      ? serie.reduce((a, b) => (Math.abs(b.t - cursor) < Math.abs(a.t - cursor) ? b : a))
      : null;
  const cursorY =
    puntoCursor != null
      ? ALTO - PAD_Y - (puntoCursor.v / geo.maxV) * (ALTO - PAD_Y * 2)
      : null;

  return (
    <div className={`el${className ? ` ${className}` : ''}`}>
      <div
        ref={cajaRef}
        className={`el-caja${onSeleccionar ? ' el-caja--click' : ''}`}
        onClick={alClickear}
        role={onSeleccionar ? 'slider' : 'img'}
        aria-label={ariaLabel}
        aria-valuemin={onSeleccionar ? geo.min : undefined}
        aria-valuemax={onSeleccionar ? geo.max : undefined}
        aria-valuenow={onSeleccionar && cursor != null ? cursor : undefined}
        tabIndex={onSeleccionar ? 0 : undefined}
      >
        <svg
          className="el-svg"
          viewBox={`0 0 ${ancho} ${ALTO}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Franja de la ventana en reproducción */}
          {ventana && (
            <rect
              className="el-ventana"
              x={geo.x(ventana[0])}
              y={0}
              width={Math.max(2, geo.x(ventana[1]) - geo.x(ventana[0]))}
              height={ALTO}
            />
          )}

          {/* Serie secundaria (tenue, por debajo) */}
          {geo.pathSecundaria && (
            <path className="el-trazo el-trazo--secundario" d={geo.pathSecundaria} />
          )}

          {/* Trazo: antes del hito en tono de alerta, después en tono bueno */}
          {geo.pathAntes && (
            <path className="el-trazo el-trazo--antes" d={geo.pathAntes} />
          )}
          <path
            className={`el-trazo ${geo.hitoDentro ? 'el-trazo--despues' : 'el-trazo--neutro'}`}
            d={geo.pathDespues}
          />

          {/* Hito: vertical punteada */}
          {geo.hitoDentro && (
            <line
              className="el-hito-linea"
              x1={geo.x(geo.hitoDentro.t)}
              y1={PAD_Y}
              x2={geo.x(geo.hitoDentro.t)}
              y2={ALTO}
            />
          )}

          {/* Cursor de reproducción */}
          {cursorX != null && cursorY != null && (
            <>
              <line className="el-cursor-linea" x1={cursorX} y1={0} x2={cursorX} y2={ALTO} />
              <circle className="el-cursor-halo" cx={cursorX} cy={cursorY} r={5} />
              <circle className="el-cursor-punto" cx={cursorX} cy={cursorY} r={2.5} />
            </>
          )}

          {/* Punto final del trazo, siempre visible */}
          <circle
            className="el-final"
            cx={geo.pts[geo.pts.length - 1][0]}
            cy={geo.pts[geo.pts.length - 1][1]}
            r={3}
          />
        </svg>

        {/* Etiqueta del hito, en HTML para que el texto no se deforme con el
            preserveAspectRatio="none" del SVG. */}
        {geo.hitoDentro &&
          (() => {
            // La etiqueta se centra sobre el hito, PERO cerca de los bordes se
            // ancla en vez de centrarse: si no, se sale de la caja y se lee
            // cortada ("...RON A USAR EL SISTEMA").
            const pct = (geo.x(geo.hitoDentro.t) / ancho) * 100;
            const anclaIzq = pct < 22;
            const anclaDer = pct > 78;
            return (
              <span
                className="el-hito-tag"
                style={
                  anclaIzq
                    ? { left: 0, transform: 'none' }
                    : anclaDer
                      ? { left: '100%', transform: 'translateX(-100%)' }
                      : { left: `${pct}%` }
                }
              >
                <span className="el-hito-punto" aria-hidden="true" />
                {geo.hitoDentro.etiqueta}
              </span>
            );
          })()}
      </div>

      {marcasEje && marcasEje.length > 0 && (
        <div className="el-eje" aria-hidden="true">
          {marcasEje.map((m) => (
            <span
              key={m.t}
              className="el-eje-marca"
              style={{ left: `${(geo.x(m.t) / ancho) * 100}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default Electro;
