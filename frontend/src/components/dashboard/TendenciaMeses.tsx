/**
 * TendenciaMeses — el recorrido de los últimos meses, como un reproductor.
 *
 * QUÉ PROBLEMA RESUELVE
 * Una serie de 30 días es una línea plana con algún pico: no cuenta nada. Lo
 * que se quiere saber es si el municipio viene GANANDO o PERDIENDO, y eso
 * sólo se ve comparando meses. Este bloque recorre los últimos tres, uno por
 * vez, y de cada uno dice lo mismo: cuánto entró, cuánto se cerró, qué
 * proporción se logró y qué día fue el peor.
 *
 * La frase de arriba es lo que hace el trabajo: no describe el gráfico, lo
 * INTERPRETA ("se abría la brecha: entraban 2,4 por día y se cerraba menos de
 * la mitad"). El gráfico está para respaldarla, no al revés.
 *
 * El recorrido automático es lo que lo vuelve una pieza de demo: la pantalla
 * se cuenta sola, sin que nadie toque nada. Se pausa al pasar el mouse y con
 * `prefers-reduced-motion` no arranca — el hook del kit ya resuelve todo eso.
 *
 * Los meses sin datos no se inventan: si el backend devuelve menos de dos
 * meses, el bloque no se muestra (no hay recorrido posible con uno solo).
 */
import { useMemo } from 'react';
import { Pause, Play, ChevronRight } from 'lucide-react';
import { useCarruselAuto } from '../../lib/useCarruselAuto';

/** Cada cuánto pasa al mes siguiente. */
const INTERVALO_MS = 6000;

export interface PuntoTendencia {
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** Ingresados ese día. */
  cantidad: number;
  /** Cerrados ese día. Opcional: el backend viejo no la manda. */
  resueltos?: number;
}

interface Mes {
  clave: string;
  label: string;
  dias: PuntoTendencia[];
  entraron: number;
  resueltos: number;
  /** Qué proporción de lo que entró se logró cerrar, 0..1 */
  tasa: number;
  porDia: number;
  pico: { dia: number; cantidad: number } | null;
}

const NOMBRE_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const nf = (n: number, dec = 0) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Agrupa la serie diaria por mes calendario, del más viejo al más nuevo. */
function agruparPorMes(datos: PuntoTendencia[]): Mes[] {
  const mapa = new Map<string, PuntoTendencia[]>();
  for (const p of datos) {
    const clave = (p.fecha || '').slice(0, 7); // YYYY-MM
    if (clave.length !== 7) continue;
    const lista = mapa.get(clave);
    if (lista) lista.push(p);
    else mapa.set(clave, [p]);
  }

  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, dias]) => {
      const entraron = dias.reduce((s, d) => s + (d.cantidad || 0), 0);
      const resueltos = dias.reduce((s, d) => s + (d.resueltos || 0), 0);
      const mes = Number(clave.slice(5, 7)) - 1;
      const pico = dias.reduce<{ dia: number; cantidad: number } | null>((may, d) => {
        const n = d.cantidad || 0;
        if (!may || n > may.cantidad) return { dia: Number(d.fecha.slice(8, 10)), cantidad: n };
        return may;
      }, null);
      return {
        clave,
        label: NOMBRE_MES[mes] ?? clave,
        dias,
        entraron,
        resueltos,
        tasa: entraron > 0 ? resueltos / entraron : 0,
        porDia: dias.length > 0 ? entraron / dias.length : 0,
        pico,
      };
    });
}

/** Puntos de una polilínea SVG, normalizados al alto del lienzo. */
function puntos(valores: number[], max: number, ancho: number, alto: number): string {
  if (valores.length === 0) return '';
  const paso = valores.length > 1 ? ancho / (valores.length - 1) : ancho;
  return valores
    .map((v, i) => {
      const x = i * paso;
      const y = alto - 6 - (max > 0 ? (v / max) * (alto - 16) : 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * La lectura del mes, en castellano y con su consecuencia.
 *
 * No describe la curva: dice qué pasó. Es la línea que un intendente puede
 * repetir en una reunión sin mirar el gráfico.
 */
function veredictoDelMes(m: Mes, previo: Mes | null): { texto: string; tono: 'bueno' | 'malo' | 'neutro' } {
  const pct = Math.round(m.tasa * 100);
  const deCada10 = Math.round(m.tasa * 10);

  if (m.entraron === 0) {
    return { texto: 'No entraron reclamos en el período.', tono: 'neutro' };
  }
  if (m.tasa >= 1) {
    return {
      texto: `Se cerró más de lo que entró: ${nf(m.porDia, 1)} por día y ${pct}% resuelto — la cola bajó.`,
      tono: 'bueno',
    };
  }
  const mejora = previo && m.tasa > previo.tasa + 0.05;
  if (mejora) {
    return {
      texto: `Se achicó la brecha: entraban ${nf(m.porDia, 1)} por día y se cerró el ${pct}% — ${deCada10} de cada 10.`,
      tono: 'bueno',
    };
  }
  return {
    texto: `Se abría la brecha: entraban ${nf(m.porDia, 1)} por día y se cerraba ${
      m.tasa < 0.5 ? 'menos de la mitad' : `el ${pct}%`
    } — ${deCada10} de cada 10.`,
    tono: 'malo',
  };
}

interface TendenciaMesesProps {
  datos: PuntoTendencia[];
  /** Cuántos meses recorrer, del más reciente hacia atrás. */
  meses?: number;
  className?: string;
}

export function TendenciaMeses({ datos, meses = 3, className }: TendenciaMesesProps) {
  const lista = useMemo(() => agruparPorMes(datos).slice(-meses), [datos, meses]);
  const { indice, ir, propsPausa, menosMovimiento } = useCarruselAuto({
    total: lista.length,
    intervaloMs: INTERVALO_MS,
  });

  // Con un solo mes no hay recorrido que hacer, y el bloque entero pierde
  // sentido: se prefiere no mostrarlo antes que fingir una comparación.
  if (lista.length < 2) return null;

  const mes = lista[indice];
  const previo = indice > 0 ? lista[indice - 1] : null;
  const veredicto = veredictoDelMes(mes, previo);

  const W = 620;
  const H = 170;
  const ins = mes.dias.map((d) => d.cantidad || 0);
  const outs = mes.dias.map((d) => d.resueltos || 0);
  const hayResueltos = outs.some((v) => v > 0);
  const max = Math.max(1, ...ins, ...outs);
  const lineaIn = puntos(ins, max, W, H);
  const area = lineaIn ? `0,${H} ${lineaIn} ${W},${H}` : '';

  const ejes = [0, 1, 2, 3].map((i) => {
    const d = mes.dias[Math.round((i / 3) * (mes.dias.length - 1))];
    return d ? `${Number(d.fecha.slice(8, 10))}` : '';
  });

  return (
    <section className={`tm ${className || ''}`} {...propsPausa} aria-label="Tendencia de reclamos">
      <header className="tm-head">
        <h3 className="tm-titulo">Tendencia de reclamos</h3>
        <span className="tm-mes">{mes.label}</span>
        <span className="tm-sub">de los últimos {lista.length} meses</span>

        <div className="tm-controles">
          <span className="tm-leyenda"><i className="tm-punto tm-punto--in" />Ingresados</span>
          {hayResueltos && (
            <span className="tm-leyenda"><i className="tm-punto tm-punto--out" />Resueltos</span>
          )}
          {/* El play/pausa refleja el estado REAL: si el visitante pidió menos
              movimiento, el recorrido no arranca y el botón lo dice. */}
          <button
            type="button"
            className="tm-play"
            onClick={() => ir(indice + 1)}
            title={menosMovimiento ? 'Ver el mes siguiente' : 'Pausar el recorrido'}
            aria-label={menosMovimiento ? 'Ver el mes siguiente' : 'Pausar el recorrido'}
          >
            {menosMovimiento ? <ChevronRight className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
        </div>
      </header>

      <p className={`tm-veredicto tm-veredicto--${veredicto.tono}`} aria-live="polite">
        {veredicto.texto}
      </p>

      <div className="tm-kpis">
        <div className="tm-kpi">
          <span className="tm-kpi-et">Ingresados</span>
          <span className="tm-kpi-va">{nf(mes.entraron)}</span>
        </div>
        <div className="tm-kpi">
          <span className="tm-kpi-et">Resueltos</span>
          <span className="tm-kpi-va">{nf(mes.resueltos)}</span>
        </div>
        <div className="tm-kpi">
          <span className="tm-kpi-et">Tasa de cierre</span>
          <span className={`tm-kpi-va tm-kpi-va--${veredicto.tono}`}>{Math.round(mes.tasa * 100)}%</span>
        </div>
        <div className="tm-kpi">
          <span className="tm-kpi-et">Día más cargado</span>
          <span className="tm-kpi-va">
            {mes.pico ? `${mes.pico.dia}` : '—'}
            {mes.pico && <span className="tm-kpi-nota">{nf(mes.pico.cantidad)}</span>}
          </span>
        </div>
      </div>

      <div className="tm-lienzo">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
          <g className="tm-grilla">
            {[14, 52, 90, 128, 166].map((y) => <path key={y} d={`M0 ${y}h${W}`} />)}
          </g>
          {area && <polygon className="tm-area" points={area} />}
          {lineaIn && <polyline className="tm-linea tm-linea--in" points={lineaIn} />}
          {hayResueltos && <polyline className="tm-linea tm-linea--out" points={puntos(outs, max, W, H)} />}
        </svg>
      </div>
      <div className="tm-eje">{ejes.map((e, i) => <span key={i}>{e}</span>)}</div>

      <div className="tm-meses">
        {lista.map((m, i) => (
          <button
            key={m.clave}
            type="button"
            className={`tm-mes-btn ${i === indice ? 'tm-mes-btn--activo' : ''}`}
            onClick={() => ir(i)}
            aria-current={i === indice}
          >
            <span className="tm-mes-dot" />
            {m.label} · {nf(m.entraron)} entraron
          </button>
        ))}
      </div>
    </section>
  );
}
