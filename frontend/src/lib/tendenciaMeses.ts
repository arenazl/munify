/**
 * El NÚCLEO PURO de `TendenciaMeses` (components/dashboard): agrupar la serie
 * diaria por mes y decir qué pasó en cada uno.
 *
 * Separado del componente por dos razones, la misma que ya separó
 * `lib/semanticHero.ts`:
 *  1. La regla de fast-refresh (un archivo de componentes exporta SÓLO
 *     componentes) — el lint corta si se exporta una función desde el .tsx.
 *  2. Acá vive el COPY del bloque, que es lo que hay que poder revisar sin
 *     montar React: el veredicto de un mes se verifica contra los números
 *     reales del municipio, no mirando la pantalla.
 *
 * Nada de esto sabe de reclamos ni de gastos: recibe una serie de puntos y
 * el modo con el que hay que leerla.
 */

export interface PuntoTendencia {
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** Lo que entró ese día. En modo 'monto', los pesos gastados. */
  cantidad: number;
  /** Cerrados ese día. Opcional: el backend viejo no la manda. En modo
   *  'monto' no existe (no hay "gasto resuelto"). */
  resueltos?: number;
}

/** Qué mide la serie: un FLUJO de casos o un MONTO de dinero. */
export type ModoTendencia = 'flujo' | 'monto';

export interface Mes {
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

/**
 * La lectura del mes, en castellano y con su consecuencia.
 *
 * No describe la curva: dice qué pasó. Es la línea que un intendente puede
 * repetir en una reunión sin mirar el gráfico.
 */
export interface VeredictoMes {
  /** Las dos o tres palabras que califican el mes. Van en color. */
  etiqueta: string;
  /** El dato que respalda la etiqueta. Va en gris. */
  resto: string;
  tono: 'bueno' | 'malo' | 'neutro';
}

/**
 * Días que tiene que llevar el mes en curso para entrar a la comparación.
 *
 * Un mes recién empezado no se puede comparar contra uno entero: el 1° de
 * agosto, "agosto" son unas pocas horas, y al lado de un julio de 31 días
 * cualquier lectura miente — el promedio por día se dispara y la tasa de
 * cierre puede pasar el 100% porque se cierran cosas que entraron el mes
 * pasado. Hasta llegar a este umbral se muestran los meses completos.
 */
export const DIAS_PARA_CONTAR_EL_MES = 10;

export const NOMBRE_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Abreviaturas para el eje: "1 jul" se lee solo; "1" a secas, no. */
export const ABREV_MES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export const nf = (n: number, dec = 0) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Agrupa la serie diaria por mes calendario, del más viejo al más nuevo. */
export function agruparPorMes(datos: PuntoTendencia[]): Mes[] {
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

/**
 * Los meses que el bloque recorre: los últimos `meses` de la serie, sin el
 * mes en curso cuando recién arranca (ver DIAS_PARA_CONTAR_EL_MES).
 */
export function mesesDelRecorrido(datos: PuntoTendencia[], meses: number): Mes[] {
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
}

/** Puntos de una polilínea SVG, normalizados al alto del lienzo. */
export function puntosDeLinea(valores: number[], max: number, ancho: number, alto: number): string {
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

/** El veredicto en modo 'flujo': la BRECHA entre lo que entró y lo que cerró. */
export function veredictoDelMes(m: Mes, previo: Mes | null): VeredictoMes {
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

/**
 * El veredicto del mes en modo 'monto': cuánto se gastó contra el mes previo.
 *
 * Umbral del 5%: abajo de eso la variación entre meses es ruido —una factura
 * que se cargó el 31 o el 1— y decir "se gastó más" por un 2% es inventar una
 * tendencia. Con el mes EN CURSO el veredicto se queda en neutro: falta mes,
 * y celebrar medio agosto contra un julio entero es exactamente la lectura
 * que este bloque existe para evitar.
 */
export function veredictoDelMesMonto(
  m: Mes,
  previo: Mes | null,
  enCurso: boolean,
  fmt: (n: number) => string,
): VeredictoMes {
  // Con el mes corriendo la frase avisa que falta mes; si no, arranca directo
  // y con mayúscula (la etiqueta abre la oración).
  const abrir = (resto: string) =>
    enCurso
      ? `En lo que va de ${m.label.toLowerCase()} ${resto}`
      : resto.charAt(0).toUpperCase() + resto.slice(1);

  if (m.entraron === 0) {
    return {
      etiqueta: 'Sin gastos cargados:',
      resto: 'no se registró ningún egreso en el período.',
      tono: 'neutro',
    };
  }

  if (!previo || previo.entraron === 0) {
    return {
      etiqueta: abrir(`se gastaron ${fmt(m.entraron)}:`),
      resto: `${fmt(m.porDia)} por día en ${m.dias.length} ${m.dias.length === 1 ? 'día' : 'días'}.`,
      tono: 'neutro',
    };
  }

  const delta = (m.entraron - previo.entraron) / previo.entraron;
  const pct = Math.abs(Math.round(delta * 100));
  const mesPrevio = previo.label.toLowerCase();
  // El mes previo ya lo nombró la etiqueta: repetirlo acá daba "…menos que
  // julio: $18,7M contra $40,6M de julio".
  const contra = `${fmt(m.entraron)} contra ${fmt(previo.entraron)}.`;
  const SALTO = 0.05;

  if (delta > SALTO) {
    return {
      etiqueta: abrir(`se gastó un ${pct}% más que ${mesPrevio}:`),
      resto: contra,
      tono: enCurso ? 'neutro' : 'malo',
    };
  }
  if (delta < -SALTO) {
    return {
      etiqueta: abrir(`se gastó un ${pct}% menos que ${mesPrevio}:`),
      resto: contra,
      tono: enCurso ? 'neutro' : 'bueno',
    };
  }
  return {
    etiqueta: abrir(`el gasto quedó en línea con ${mesPrevio}:`),
    resto: contra,
    tono: 'neutro',
  };
}
