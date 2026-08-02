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
import { Pause, ChevronRight } from 'lucide-react';
import { useCarruselAuto } from '../../lib/useCarruselAuto';

/** Cada cuánto pasa al mes siguiente. */
const INTERVALO_MS = 6000;

/**
 * Días que tiene que llevar el mes en curso para entrar a la comparación.
 *
 * Un mes recién empezado no se puede comparar contra uno entero: el 1° de
 * agosto, "agosto" son unas pocas horas, y al lado de un julio de 31 días
 * cualquier lectura miente — el promedio por día se dispara y la tasa de
 * cierre puede pasar el 100% porque se cierran cosas que entraron el mes
 * pasado. Hasta llegar a este umbral se muestran los meses completos.
 */
const DIAS_PARA_CONTAR_EL_MES = 10;

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
  /** "jul" — para el eje y el día más cargado, que se leen sueltos. */
  abrev: string;
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

/** Abreviaturas para el eje: "1 jul" se lee solo; "1" a secas, no. */
const ABREV_MES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
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
        abrev: ABREV_MES[mes] ?? '',
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
interface Veredicto {
  /** Las dos o tres palabras que califican el mes. Van en color. */
  etiqueta: string;
  /** El dato que respalda la etiqueta. Va en gris. */
  resto: string;
  tono: 'bueno' | 'malo' | 'neutro';
}

function veredictoDelMes(m: Mes, previo: Mes | null): Veredicto {
  const pct = Math.round(m.tasa * 100);
  const deCada10 = Math.round(m.tasa * 10);

  if (m.entraron === 0) {
    return { etiqueta: 'Sin movimiento', resto: 'no entraron reclamos en el período.', tono: 'neutro' };
  }
  if (m.tasa >= 1) {
    return {
      etiqueta: 'Se cerró más de lo que entró:',
      resto: `${nf(m.porDia, 1)} por día y ${pct}% resuelto — la cola bajó.`,
      tono: 'bueno',
    };
  }

  // Lo que califica al mes es el CAMBIO contra el anterior, no el número
  // suelto. Un 84% después de un 79% no es "se abría la brecha" — es que el
  // ritmo se sostuvo, y decirlo en rojo sería mentir sobre una buena gestión.
  const delta = previo ? m.tasa - previo.tasa : null;
  const SALTO = 0.05; // menos de cinco puntos entre meses es ruido, no tendencia

  if (delta !== null && delta > SALTO) {
    return {
      etiqueta: 'La brecha se está cerrando:',
      resto: `entraban ${nf(m.porDia, 1)} por día y se cerró el ${pct}% — ${deCada10} de cada 10, contra ${Math.round(previo!.tasa * 100)}% el mes anterior.`,
      tono: 'bueno',
    };
  }
  if (delta !== null && delta < -SALTO) {
    return {
      etiqueta: 'Se perdió terreno:',
      resto: `se cerró el ${pct}% contra el ${Math.round(previo!.tasa * 100)}% del mes anterior.`,
      tono: 'malo',
    };
  }
  // Sin cambio apreciable: manda el nivel en el que se sostiene.
  if (m.tasa >= 0.75) {
    return {
      etiqueta: 'Se sostuvo el ritmo:',
      resto: `entraban ${nf(m.porDia, 1)} por día y se cerró el ${pct}% — ${deCada10} de cada 10.`,
      tono: 'bueno',
    };
  }
  return {
    etiqueta: 'Se abría la brecha:',
    resto: `entraban ${nf(m.porDia, 1)} por día y se cerraba ${
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
  const lista = useMemo(() => {
    const grupos = agruparPorMes(datos);

    // "Hoy" se toma del último día de la serie, no del reloj del navegador:
    // así la decisión sale de los mismos datos que se están mostrando.
    const ultima = datos.reduce((may, p) => (p.fecha > may ? p.fecha : may), '');
    const ultimo = grupos[grupos.length - 1];
    const enCurso = ultimo && ultimo.clave === ultima.slice(0, 7);
    const arranca = Number(ultima.slice(8, 10)) < DIAS_PARA_CONTAR_EL_MES;

    // Se descarta sólo si quedan al menos dos meses para comparar: antes que
    // mostrar un mes suelto, es preferible dejar el parcial.
    if (enCurso && arranca && grupos.length > 2) grupos.pop();

    return grupos.slice(-meses);
  }, [datos, meses]);
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

  // "1 jul" y no "1": un número suelto no dice de qué mes es, y el bloque
  // justamente va cambiando de mes.
  const ejes = [0, 1, 2, 3].map((i) => {
    const d = mes.dias[Math.round((i / 3) * (mes.dias.length - 1))];
    return d ? `${Number(d.fecha.slice(8, 10))} ${mes.abrev}` : '';
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
        <strong>{veredicto.etiqueta}</strong> {veredicto.resto}
      </p>

      <div className="tm-kpis">
        <div className="tm-kpi">
          <span className="tm-kpi-et">Ingresados</span>
          <span className="tm-kpi-va">{nf(mes.entraron)}</span>
        </div>
        <div className="tm-kpi">
          <span className="tm-kpi-et">Resueltos</span>
          <span className="tm-kpi-va tm-kpi-va--bueno">{nf(mes.resueltos)}</span>
        </div>
        <div className="tm-kpi">
          <span className="tm-kpi-et">Tasa de cierre</span>
          <span className={`tm-kpi-va tm-kpi-va--${veredicto.tono}`}>{Math.round(mes.tasa * 100)}%</span>
        </div>
        <div className="tm-kpi">
          <span className="tm-kpi-et">Día más cargado</span>
          <span className="tm-kpi-va">
            {mes.pico ? `${mes.pico.dia} ${mes.abrev}` : '—'}
            {mes.pico && <span className="tm-kpi-nota">· {nf(mes.pico.cantidad)}</span>}
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

      {/* Los meses no son pastillas: son la barra de avance del recorrido.
          La del mes que se está viendo se llena; las otras quedan en su riel.
          Así se ve de un vistazo en qué punto del recorrido está. */}
      <div className="tm-meses">
        {lista.map((m, i) => (
          <button
            key={m.clave}
            type="button"
            className={`tm-mes-btn ${i === indice ? 'tm-mes-btn--activo' : ''}`}
            onClick={() => ir(i)}
            aria-current={i === indice}
          >
            <span className="tm-mes-riel" aria-hidden="true">
              <span className="tm-mes-avance" />
            </span>
            <span className="tm-mes-rotulo">{m.label} · {nf(m.entraron)} entraron</span>
          </button>
        ))}
      </div>
    </section>
  );
}
