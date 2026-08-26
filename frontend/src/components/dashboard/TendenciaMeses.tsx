/**
 * TendenciaMeses — el recorrido del período que el municipio REALMENTE tiene,
 * como un reproductor.
 *
 * QUÉ PROBLEMA RESUELVE
 * Una serie de 30 días es una línea plana con algún pico: no cuenta nada. Lo
 * que se quiere saber es si el municipio viene GANANDO o PERDIENDO, y eso
 * sólo se ve comparando meses. Este bloque recorre los últimos, uno por vez, y
 * de cada uno dice lo mismo: cuánto entró, cuánto se cerró, qué proporción se
 * logró y qué día fue el peor.
 *
 * La frase de arriba es lo que hace el trabajo: no describe el gráfico, lo
 * INTERPRETA ("se abría la brecha: entraban 2,4 por día y se cerraba menos de
 * la mitad"). El gráfico está para respaldarla, no al revés.
 *
 * El recorrido automático es lo que lo vuelve una pieza de demo: la pantalla
 * se cuenta sola, sin que nadie toque nada. Se pausa al pasar el mouse y con
 * `prefers-reduced-motion` no arranca — el hook del kit ya resuelve todo eso.
 *
 * ESCALA ELÁSTICA (la ventana la deciden los datos, no el calendario)
 * Los meses vacíos de las puntas no son períodos y se recortan; si después de
 * eso queda UN solo mes con historia, el bloque cambia de escala y muestra una
 * VENTANA DE DÍAS —del primer día con movimiento hasta hoy, piso de 15 días—
 * en una sola vista, sin carrusel. Un municipio con quince días de vida se lee
 * en quince días; uno con tres meses, mes a mes. Sin datos, no se dibuja nada:
 * jamás un panel de ceros. Todo el criterio vive en `lib/tendenciaMeses.ts`.
 *
 * DOS MODOS (la pieza es del KIT, no de reclamos):
 *  - `'flujo'` (default): dos series —lo que entró y lo que se cerró— y el
 *    veredicto habla de la BRECHA entre ambas. Es el uso histórico.
 *  - `'monto'`: UNA serie en dinero. El veredicto habla de cuánto se gastó
 *    contra el mes anterior (umbral del 5%, abajo de eso es ruido) y los
 *    mini-KPIs cambian a total / promedio por día / variación / día más caro.
 *    El mes EN CURSO no se califica en verde ni en rojo: se dice "en lo que
 *    va de", porque celebrar un mes a mitad de camino contra uno entero es
 *    exactamente la comparación que este bloque existe para evitar.
 */
import { useMemo } from 'react';
import { Pause, Play, ChevronRight } from 'lucide-react';
import { useCarruselAuto } from '../../lib/useCarruselAuto';

import {
  abrevDeFecha,
  kpisDelPeriodo,
  nf,
  puntosDeLinea,
  recorridoDeTendencia,
  rotuloDelPeriodo,
  veredictoDeVentana,
  veredictoDelMes,
  veredictoDelMesMonto,
  type ModoTendencia,
  type PuntoTendencia,
} from '../../lib/tendenciaMeses';

// El nucleo puro del bloque (el recorte elastico de la ventana, los
// veredictos, los mini-KPIs, la polilinea) vive en lib/tendenciaMeses.ts. Se
// separo por la regla de fast-refresh —un archivo de componentes exporta SOLO
// componentes— y porque ahi vive el COPY, que hay que poder verificar contra
// los numeros reales del municipio sin montar React. Mismo criterio que
// lib/semanticHero.ts.
export type { ModoTendencia, PuntoTendencia };

/** Cada cuanto pasa al mes siguiente. */
// Cada mes se queda el DOBLE de tiempo que antes (6s -> 12s).
// La frase que acompania al grafico hay que leerla, no alcanzar a verla: a
// 6 segundos el panel cambiaba antes de que uno terminara de entenderlo.
const INTERVALO_MS = 12000;

interface TendenciaMesesProps {
  datos: PuntoTendencia[];
  /** Cuántos meses recorrer, del más reciente hacia atrás. */
  meses?: number;
  className?: string;
  /** Qué mide la serie. Default 'flujo' — el uso histórico, intacto. */
  modo?: ModoTendencia;
  /** Título del bloque. Default: el de reclamos. */
  titulo?: string;
  /** Cómo se escribe un valor de la serie. Default: número es-AR. En modo
   *  'monto' se le pasa el formateador de pesos. */
  formatoValor?: (n: number) => string;
  /** `aria-label` de la sección. Default: el de reclamos. */
  etiquetaAccesible?: string;
}

export function TendenciaMeses({
  datos,
  meses = 3,
  className,
  modo = 'flujo',
  titulo,
  formatoValor,
  etiquetaAccesible,
}: TendenciaMesesProps) {
  const esMonto = modo === 'monto';
  const fmt = formatoValor ?? ((n: number) => nf(n, n < 10 && !Number.isInteger(n) ? 1 : 0));

  /** 'YYYY-MM' del último dato de la serie: el mes que todavía está corriendo. */
  const claveUltima = useMemo(
    () => datos.reduce((may, p) => (p.fecha > may ? p.fecha : may), '').slice(0, 7),
    [datos],
  );

  const recorrido = useMemo(() => recorridoDeTendencia(datos, meses), [datos, meses]);
  const lista = useMemo(() => recorrido?.periodos ?? [], [recorrido]);
  const { indice, ir, propsPausa, menosMovimiento, pausado, alternarPausa } = useCarruselAuto({
    total: lista.length,
    intervaloMs: INTERVALO_MS,
  });

  // Sin un solo día con movimiento no hay nada que contar: antes que un panel
  // de ceros, el bloque no se dibuja.
  if (!recorrido) return null;

  const esVentana = recorrido.modo === 'ventana';
  const mes = lista[indice];
  const previo = indice > 0 ? lista[indice - 1] : null;
  const enCurso = mes.clave === claveUltima;
  const veredicto = esVentana
    ? veredictoDeVentana(mes, modo, fmt)
    : esMonto
      ? veredictoDelMesMonto(mes, previo, enCurso, fmt)
      : veredictoDelMes(mes, previo);

  const kpis = kpisDelPeriodo({
    periodo: mes,
    previo,
    modo,
    recorrido: recorrido.modo,
    tono: veredicto.tono,
    fmt,
  });

  // Con un solo tramo no hay recorrido: ni barra de progreso, ni rótulos, ni
  // botón de play. La ventana de días es UNA vista.
  const hayRecorrido = lista.length > 1;

  const W = 620;
  const H = 170;
  const ins = mes.dias.map((d) => d.cantidad || 0);
  const outs = mes.dias.map((d) => d.resueltos || 0);
  const hayResueltos = outs.some((v) => v > 0);
  const max = Math.max(1, ...ins, ...outs);
  const lineaIn = puntosDeLinea(ins, max, W, H);
  const area = lineaIn ? `0,${H} ${lineaIn} ${W},${H}` : '';

  // "1 jul" y no "1": un número suelto no dice de qué mes es, y el eje puede
  // cruzar meses (la ventana de días arranca en julio y termina en agosto).
  const ejes = [0, 1, 2, 3].map((i) => {
    const d = mes.dias[Math.round((i / 3) * (mes.dias.length - 1))];
    return d ? `${Number(d.fecha.slice(8, 10))} ${abrevDeFecha(d.fecha)}` : '';
  });

  return (
    <section
      className={`tm ${className || ''}${pausado ? ' tm--pausado' : ''}`}
      {...propsPausa}
      style={{
        // Duración runtime: la barra tarda EXACTAMENTE lo que el carrusel, de
        // un solo número. Si mañana cambia el intervalo, la barra lo sigue
        // sola. Las otras dos son el ancho de las grillas, que ya no son
        // fijas: los KPIs y los tramos varían con lo que el municipio tenga.
        ['--tm-paso' as string]: `${INTERVALO_MS}ms`,
        ['--tm-kpis' as string]: `${Math.max(1, kpis.length)}`,
        ['--tm-tramos' as string]: `${Math.max(1, lista.length)}`,
      }}
      aria-label={etiquetaAccesible ?? 'Tendencia de reclamos'}
    >
      <header className="tm-head">
        <h3 className="tm-titulo">{titulo ?? 'Tendencia de reclamos'}</h3>
        <span className="tm-mes">{mes.label}</span>
        <span className="tm-sub">
          {esVentana ? 'hasta hoy' : `de los últimos ${lista.length} meses`}
        </span>

        <div className="tm-controles">
          <span className="tm-leyenda">
            <i className="tm-punto tm-punto--in" />{esMonto ? 'Gastado' : 'Ingresados'}
          </span>
          {hayResueltos && (
            <span className="tm-leyenda"><i className="tm-punto tm-punto--out" />Resueltos</span>
          )}
          {/* El play/pausa refleja el estado REAL: si el visitante pidió menos
              movimiento, el recorrido no arranca y el botón lo dice. */}
          {hayRecorrido && (
            <button
              type="button"
              className="tm-play"
              onClick={menosMovimiento ? () => ir(indice + 1) : alternarPausa}
              title={menosMovimiento ? 'Ver el mes siguiente' : pausado ? 'Retomar el recorrido' : 'Pausar el recorrido'}
              aria-label={menosMovimiento ? 'Ver el mes siguiente' : pausado ? 'Retomar el recorrido' : 'Pausar el recorrido'}
            >
              {menosMovimiento ? <ChevronRight className="h-3 w-3" />
                : pausado ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </button>
          )}
        </div>
      </header>

      <p className={`tm-veredicto tm-veredicto--${veredicto.tono}`} aria-live="polite">
        <strong>{veredicto.etiqueta}</strong> {veredicto.resto}
      </p>

      {/* Un período sin movimiento no tiene números: se queda con la frase y
          la curva plana. Cuatro ceros en fila no son un dato. */}
      {kpis.length > 0 && (
        <div className="tm-kpis">
          {kpis.map((k) => (
            <div className="tm-kpi" key={k.etiqueta}>
              <span className="tm-kpi-et">{k.etiqueta}</span>
              <span className={`tm-kpi-va${k.tono ? ` tm-kpi-va--${k.tono}` : ''}`}>
                {k.valor}
                {k.nota && <span className="tm-kpi-nota">{k.nota}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="tm-lienzo">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
          <g className="tm-grilla">
            {[14, 52, 90, 128, 166].map((y) => <path key={y} d={`M0 ${y}h${W}`} />)}
          </g>
          {area && <polygon className="tm-area" points={area} />}
          {lineaIn && <polyline className="tm-linea tm-linea--in" points={lineaIn} />}
          {hayResueltos && <polyline className="tm-linea tm-linea--out" points={puntosDeLinea(outs, max, W, H)} />}
        </svg>
      </div>
      <div className="tm-eje">{ejes.map((e, i) => <span key={i}>{e}</span>)}</div>

      {/* Los meses no son pastillas: son la línea de tiempo del recorrido.
          Es UNA barra continua que va de punta a punta —del primer mes al
          último—, no una barra por mes que se llena por turno: lo que se está
          mostrando es un recorrido, y la barra tiene que leerse como ese
          recorrido, no como cosas sueltas. Con un solo tramo no hay recorrido
          y la barra desaparece. */}
      {hayRecorrido && (
        <>
          <div
            className="tm-progreso"
            aria-hidden="true"
            style={{
              // De dónde a dónde avanza en este tramo. Con el índice adentro, el
              // salto entre meses es continuo: el tramo nuevo arranca justo donde
              // terminó el anterior, sin volver a cero.
              ['--tm-desde' as string]: `${indice / lista.length}`,
              ['--tm-hasta' as string]: `${(indice + 1) / lista.length}`,
            }}
          >
            <span key={`prog-${indice}`} className="tm-progreso-avance" />
          </div>

          <div className="tm-meses">
            {lista.map((m, i) => (
              <button
                key={m.clave}
                type="button"
                className={`tm-mes-btn ${i === indice ? 'tm-mes-btn--activo' : ''}${
                  i < indice ? ' tm-mes-btn--visto' : ''
                }`}
                onClick={() => ir(i)}
                aria-current={i === indice}
              >
                <span className="tm-mes-rotulo">{rotuloDelPeriodo(m, modo, fmt)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
