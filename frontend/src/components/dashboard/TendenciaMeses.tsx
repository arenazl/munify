/**
 * TendenciaMeses — la HISTORIA COMPLETA del municipio, en una curva.
 *
 * QUÉ PROBLEMA RESUELVE
 * Un gráfico que se llama "Tendencia" promete una curva continua, no un
 * carrusel de meses de a uno (dueño, 2026-08-28). El bloque abre con el
 * PANORAMA: toda la historia disponible hasta hoy en una sola línea, con su
 * frase-veredicto y los KPIs del período completo. Los tramos de abajo son el
 * DRILL-DOWN: click en un mes (o un año) y se ve su detalle diario, con el
 * veredicto y los KPIs de ese tramo. Nada rota solo: una tendencia se mira,
 * no gira.
 *
 * ESCALA ELÁSTICA, DOS VECES
 *  - La ventana la deciden los datos: se muestra toda la historia que haya
 *    (un muni de 4 meses ve 4 meses; San Pedro Norte, tres años).
 *  - Los tramos también: hasta ~14 meses de historia el índice es por MES;
 *    más que eso, por AÑO (2024 · 2025 · 2026). Criterio en
 *    `lib/tendenciaMeses.ts` (`MESES_PARA_SEGMENTAR_POR_ANIO`).
 *  - Con UN solo mes con historia el bloque cambia a VENTANA DE DÍAS, una
 *    sola vista sin tramos. Sin datos no se dibuja nada: jamás un panel de
 *    ceros.
 *
 * SIN FUTUROLOGÍA: la serie puede traer fechas futuras (cuotas cargadas por
 * adelantado) y este bloque las corta en HOY. Lo comprometido hacia adelante
 * lo cuentan la agenda de pagos y la proyección, no la tendencia.
 *
 * DOS MODOS (la pieza es del KIT, no de reclamos):
 *  - `'flujo'` (default): dos series —entró / se cerró— y veredictos de brecha.
 *  - `'monto'`: una serie en pesos, veredictos de gasto. El período EN CURSO
 *    no se califica: se dice "en lo que va de".
 */
import { useMemo, useState } from 'react';

import {
  abrevDeFecha,
  granularidadPara,
  kpisDelPanorama,
  kpisDelPeriodo,
  puntosDeLinea,
  rangoDelRecorrido,
  recorridoDeTendencia,
  resamplear,
  rotuloDelPeriodo,
  segmentosDelRecorrido,
  veredictoDeVentana,
  veredictoDelMes,
  veredictoDelMesMonto,
  veredictoDelPanorama,
  nf,
  type ModoTendencia,
  type PuntoTendencia,
} from '../../lib/tendenciaMeses';

// El núcleo puro del bloque (el recorte de la ventana, la segmentación por
// mes/año, los veredictos, los mini-KPIs, la polilínea) vive en
// lib/tendenciaMeses.ts. Se separó por la regla de fast-refresh —un archivo
// de componentes exporta SOLO componentes— y porque ahí vive el COPY, que se
// verifica contra los números reales del municipio sin montar React.
export type { ModoTendencia, PuntoTendencia };

interface TendenciaMesesProps {
  datos: PuntoTendencia[];
  /** Tope de meses de historia. Default: 36 (tres años). */
  meses?: number;
  /** Primer día de OPERACIÓN real ('YYYY-MM-DD'): la historia arranca en ese
   *  mes y lo importado en bloque queda afuera. Sin señal, la densidad de
   *  días con movimiento decide sola. */
  desde?: string;
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
  meses = 36,
  desde,
  className,
  modo = 'flujo',
  titulo,
  formatoValor,
  etiquetaAccesible,
}: TendenciaMesesProps) {
  const esMonto = modo === 'monto';
  const fmt = formatoValor ?? ((n: number) => nf(n, n < 10 && !Number.isInteger(n) ? 1 : 0));

  /** 'YYYY-MM' de HOY (hora local): el período que todavía está corriendo. */
  const claveHoy = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const recorrido = useMemo(
    () => recorridoDeTendencia(datos, meses, undefined, desde),
    [datos, meses, desde],
  );
  const mesesLista = useMemo(() => recorrido?.periodos ?? [], [recorrido]);
  const segmentos = useMemo(() => segmentosDelRecorrido(mesesLista), [mesesLista]);
  const panoramaDias = useMemo(() => mesesLista.flatMap((p) => p.dias), [mesesLista]);

  // El tramo elegido (clave de segmento) o null = panorama. Clave y no índice:
  // si la serie se recarga, un índice viejo apuntaría a otro tramo.
  const [seleccion, setSeleccion] = useState<string | null>(null);

  if (!recorrido) return null;

  const esVentana = recorrido.modo === 'ventana';
  const idxSeleccion = seleccion === null ? -1 : segmentos.findIndex((s) => s.clave === seleccion);
  const vistaDetalle = esVentana
    ? recorrido.periodos[0]
    : idxSeleccion >= 0 ? segmentos[idxSeleccion] : null;
  const enPanorama = !esVentana && vistaDetalle === null;

  const previo = idxSeleccion > 0 ? segmentos[idxSeleccion - 1] : null;
  const enCursoDetalle = vistaDetalle !== null
    && (vistaDetalle.clave === claveHoy || vistaDetalle.clave === claveHoy.slice(0, 4));

  const veredicto = enPanorama
    ? veredictoDelPanorama(mesesLista, modo, fmt, claveHoy)
    : esVentana
      ? veredictoDeVentana(vistaDetalle!, modo, fmt)
      : esMonto
        ? veredictoDelMesMonto(vistaDetalle!, previo, enCursoDetalle, fmt)
        : veredictoDelMes(vistaDetalle!, previo);

  const kpis = enPanorama
    ? kpisDelPanorama(mesesLista, modo, fmt, claveHoy)
    : kpisDelPeriodo({
        periodo: vistaDetalle!,
        previo,
        modo,
        recorrido: recorrido.modo,
        tono: veredicto.tono,
        fmt,
      });

  // Los tramos sólo existen fuera de la ventana y con más de un segmento.
  const hayRecorrido = !esVentana && segmentos.length > 1;

  const W = 620;
  const H = 170;
  const diasVista = enPanorama ? panoramaDias : vistaDetalle!.dias;
  // La granularidad del trazo se DERIVA del largo de la ventana: días, semanas
  // o meses. 970 puntos diarios en 620px no son una curva, son un peine.
  const gran = granularidadPara(diasVista.length);
  const puntosVista = resamplear(diasVista, gran);
  const ins = puntosVista.map((d) => d.cantidad || 0);
  const outs = puntosVista.map((d) => d.resueltos || 0);
  const hayResueltos = outs.some((v) => v > 0);
  const max = Math.max(1, ...ins, ...outs);
  const lineaIn = puntosDeLinea(ins, max, W, H);
  const area = lineaIn ? `0,${H} ${lineaIn} ${W},${H}` : '';

  // Eje: "1 jul" por días o semanas; por meses el día es ruido y manda
  // "jul 2025" (con más de un año a la vista, siempre con el año).
  const multiAnio = diasVista.length > 0
    && diasVista[0].fecha.slice(0, 4) !== diasVista[diasVista.length - 1].fecha.slice(0, 4);
  const ejes = [0, 1, 2, 3].map((i) => {
    const d = puntosVista[Math.round((i / 3) * (puntosVista.length - 1))];
    if (!d) return '';
    if (gran === 'mes') return `${abrevDeFecha(d.fecha)} ${d.fecha.slice(0, 4)}`;
    const dia = `${Number(d.fecha.slice(8, 10))} ${abrevDeFecha(d.fecha)}`;
    return multiAnio ? `${dia} ${d.fecha.slice(0, 4)}` : dia;
  });

  const chip = esVentana ? vistaDetalle!.label : enPanorama ? 'Panorama' : vistaDetalle!.label;

  return (
    <section
      className={`tm ${className || ''}`}
      style={{
        // Anchos runtime de las grillas: los KPIs y los tramos varían con lo
        // que el municipio tenga (los tramos suman el chip "Panorama").
        ['--tm-kpis' as string]: `${Math.max(1, kpis.length)}`,
        ['--tm-tramos' as string]: `${Math.max(1, segmentos.length + 1)}`,
      }}
      aria-label={etiquetaAccesible ?? 'Tendencia de reclamos'}
    >
      <header className="tm-head">
        <h3 className="tm-titulo">{titulo ?? 'Tendencia de reclamos'}</h3>
        <span className="tm-mes">{chip}</span>
        <span className="tm-sub">
          {esVentana ? 'hasta hoy' : rangoDelRecorrido(mesesLista)}
        </span>

        <div className="tm-controles">
          <span className="tm-leyenda">
            <i className="tm-punto tm-punto--in" />{esMonto ? 'Gastado' : 'Ingresados'}
          </span>
          {hayResueltos && (
            <span className="tm-leyenda"><i className="tm-punto tm-punto--out" />Resueltos</span>
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

      {/* Los tramos son el ÍNDICE de la historia: el panorama abre, y cada
          mes (o año, cuando la historia es larga) se visita con un click.
          Nada avanza solo. */}
      {hayRecorrido && (
        <div className="tm-meses">
          <button
            type="button"
            className={`tm-mes-btn ${enPanorama ? 'tm-mes-btn--activo' : ''}`}
            onClick={() => setSeleccion(null)}
            aria-current={enPanorama}
          >
            <span className="tm-mes-rotulo">Panorama</span>
          </button>
          {segmentos.map((m) => (
            <button
              key={m.clave}
              type="button"
              className={`tm-mes-btn ${vistaDetalle?.clave === m.clave ? 'tm-mes-btn--activo' : ''}`}
              onClick={() => setSeleccion(m.clave)}
              aria-current={vistaDetalle?.clave === m.clave}
            >
              <span className="tm-mes-rotulo">{rotuloDelPeriodo(m, modo, fmt)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
