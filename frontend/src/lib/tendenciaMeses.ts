/**
 * El NÚCLEO PURO de `TendenciaMeses` (components/dashboard): recortar la serie
 * diaria al período que REALMENTE tiene historia y decir qué pasó en él.
 *
 * Separado del componente por dos razones, la misma que ya separó
 * `lib/semanticHero.ts`:
 *  1. La regla de fast-refresh (un archivo de componentes exporta SÓLO
 *     componentes) — el lint corta si se exporta una función desde el .tsx.
 *  2. Acá vive el COPY del bloque, que es lo que hay que poder revisar sin
 *     montar React: el veredicto de un período se verifica contra los números
 *     reales del municipio, no mirando la pantalla.
 *
 * Nada de esto sabe de reclamos ni de gastos: recibe una serie de puntos y
 * el modo con el que hay que leerla.
 *
 * LA VENTANA LA DECIDEN LOS DATOS, NO EL CALENDARIO
 * ------------------------------------------------
 * Antes el bloque tomaba los últimos tres meses calendario estuvieran vacíos o
 * no, y un municipio con datos sólo en julio abría en "Junio · 0 entraron" con
 * los cuatro números en cero y la línea pegada al piso. Eso no es una
 * tendencia: es un mes que no existió, enunciado como si fuera un resultado.
 *
 * Ahora la escala es elástica:
 *  - Los períodos vacíos de los EXTREMOS se recortan siempre (no son historia,
 *    son el largo de la ventana que pidió el front).
 *  - Un mes vacío INTERMEDIO se conserva: entre dos meses con datos, el hueco
 *    es información real —la actividad se cortó y volvió— y sacarlo haría que
 *    mayo y agosto se lean como consecutivos. Eso sí: no se enuncia con un
 *    cero (ni en el rótulo ni en mini-KPIs; ver `kpisDelPeriodo`).
 *  - Con DOS o más meses con movimiento se recorren los meses, como siempre.
 *  - Con UNO solo se pasa a VENTANA DE DÍAS: una sola vista, del primer día
 *    con movimiento hasta HOY, con piso de 15 días. El eje termina siempre en
 *    el presente aunque los últimos días estén en cero — esa ausencia es real
 *    y se ve en la curva, pero no se dice "0".
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

/** Un tramo del recorrido: un mes calendario o la ventana de días. */
export interface Periodo {
  clave: string;
  /** 'Julio' o 'Últimos 15 días'. */
  label: string;
  /** "jul" — vacío en la ventana de días, que cruza meses. */
  abrev: string;
  dias: PuntoTendencia[];
  entraron: number;
  resueltos: number;
  /** Qué proporción de lo que entró se logró cerrar, 0..1 */
  tasa: number;
  porDia: number;
  /** Cuántos de sus días tuvieron algún movimiento. */
  diasConMovimiento: number;
  /** El día más cargado, con su mes: en una ventana no todos son del mismo. */
  pico: { dia: number; abrev: string; cantidad: number } | null;
  /** Es un AÑO entero (la historia larga se segmenta por año, no por mes). */
  esAnio?: boolean;
}

/** Cómo se está leyendo la serie: mes a mes, o una sola ventana de días. */
export type ModoRecorrido = 'meses' | 'ventana';

export interface Recorrido {
  modo: ModoRecorrido;
  /** Los meses del recorrido, o la única ventana. Nunca vacío. */
  periodos: Periodo[];
}

/**
 * La lectura del período, en castellano y con su consecuencia.
 *
 * No describe la curva: dice qué pasó. Es la línea que un intendente puede
 * repetir en una reunión sin mirar el gráfico.
 */
export interface VeredictoMes {
  /** Las dos o tres palabras que califican el período. Van en color. */
  etiqueta: string;
  /** El dato que respalda la etiqueta. Va en gris. */
  resto: string;
  tono: 'bueno' | 'malo' | 'neutro';
}

/** Un mini-KPI del strip. La pieza sólo lo dibuja. */
export interface KpiTendencia {
  etiqueta: string;
  valor: string;
  /** El segundo dato, más chico ("· 14"). */
  nota?: string;
  tono?: 'bueno' | 'malo' | 'neutro';
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

/**
 * Con más de esta cantidad de meses de historia, el recorrido se segmenta por
 * AÑO: 32 chips de meses no son un índice, son ruido. San Pedro Norte (tres
 * años de gastos) se lee 2024 · 2025 · 2026; un muni de cuatro meses, mes a
 * mes.
 */
export const MESES_PARA_SEGMENTAR_POR_ANIO = 14;

/**
 * Piso de la ventana de días: con menos, la curva es un palito.
 * Si el municipio tiene tres días de historia igual se muestran quince —los
 * doce vacíos de atrás son parte de la lectura ("recién arranca").
 */
export const PISO_VENTANA_DIAS = 15;

/**
 * Techo de la ventana: dos meses. Más que eso ya no es "los últimos días" y
 * conviene el recorrido por meses. Nunca recorta un día CON movimiento: si
 * todo lo que hay quedó afuera del techo, manda el dato (ver `ventanaDeDias`).
 */
export const TECHO_VENTANA_DIAS = 62;

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

/** La abreviatura del mes al que pertenece un 'YYYY-MM-DD'. */
export const abrevDeFecha = (fecha: string) => ABREV_MES[Number(fecha.slice(5, 7)) - 1] ?? '';

/** ¿Ese día pasó algo? Vale para los dos modos: en 'monto' no hay resueltos. */
const conMovimiento = (p: PuntoTendencia) => (p.cantidad || 0) > 0 || (p.resueltos || 0) > 0;

/** ¿Hubo algo en el período? Un mes en cero no es un mes: es un hueco. */
export const periodoConMovimiento = (p: Periodo) => p.entraron > 0 || p.resueltos > 0;

const picoDe = (dias: PuntoTendencia[]) =>
  dias.reduce<{ dia: number; abrev: string; cantidad: number } | null>((may, d) => {
    const n = d.cantidad || 0;
    if (!may || n > may.cantidad) {
      return { dia: Number(d.fecha.slice(8, 10)), abrev: abrevDeFecha(d.fecha), cantidad: n };
    }
    return may;
  }, null);

/** Los agregados que comparten el mes y la ventana. */
function armarPeriodo(clave: string, label: string, abrev: string, dias: PuntoTendencia[]): Periodo {
  const entraron = dias.reduce((s, d) => s + (d.cantidad || 0), 0);
  const resueltos = dias.reduce((s, d) => s + (d.resueltos || 0), 0);
  return {
    clave,
    label,
    abrev,
    dias,
    entraron,
    resueltos,
    tasa: entraron > 0 ? resueltos / entraron : 0,
    porDia: dias.length > 0 ? entraron / dias.length : 0,
    diasConMovimiento: dias.filter(conMovimiento).length,
    pico: picoDe(dias),
  };
}

/** Agrupa la serie diaria por mes calendario, del más viejo al más nuevo. */
export function agruparPorMes(datos: PuntoTendencia[]): Periodo[] {
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
      const mes = Number(clave.slice(5, 7)) - 1;
      return armarPeriodo(clave, NOMBRE_MES[mes] ?? clave, ABREV_MES[mes] ?? '', dias);
    });
}

/** Saca los períodos SIN movimiento de las dos puntas. Los del medio quedan. */
function recortarExtremos(periodos: Periodo[]): Periodo[] {
  let ini = 0;
  let fin = periodos.length - 1;
  while (ini <= fin && !periodoConMovimiento(periodos[ini])) ini++;
  while (fin >= ini && !periodoConMovimiento(periodos[fin])) fin--;
  return periodos.slice(ini, fin + 1);
}

/**
 * La ventana de días: del primer día con movimiento hasta HOY (el último día
 * de la serie, que el backend rellena siempre hasta la fecha).
 *
 * El piso la estira hacia atrás cuando la historia es cortita; el techo la
 * acota cuando es larga, PERO nunca deja afuera un día con movimiento: entre
 * respetar el techo y esconder el único dato que hay, gana el dato.
 */
export function ventanaDeDias(datos: PuntoTendencia[]): Periodo | null {
  if (datos.length === 0) return null;
  const orden = [...datos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const primerMov = orden.findIndex(conMovimiento);
  if (primerMov < 0) return null;

  // Piso: al menos PISO_VENTANA_DIAS de eje, sin salirse de la serie.
  const porPiso = Math.max(0, orden.length - PISO_VENTANA_DIAS);
  let desde = Math.min(primerMov, porPiso);

  // Techo: se aplica sólo si adentro sigue quedando movimiento.
  if (orden.length - desde > TECHO_VENTANA_DIAS) {
    const candidato = orden.length - TECHO_VENTANA_DIAS;
    if (orden.slice(candidato).some(conMovimiento)) desde = candidato;
  }

  const dias = orden.slice(desde);
  return armarPeriodo(
    `ventana-${dias[0].fecha}`,
    `Últimos ${nf(dias.length)} días`,
    '',
    dias,
  );
}

/**
 * Qué recorre el bloque: los meses con historia, o una sola ventana de días.
 * `null` cuando no hubo NADA — ahí el bloque no se dibuja (jamás un panel de
 * ceros).
 */
/** 'YYYY-MM-DD' de HOY en hora LOCAL. Nunca `toISOString()`: es UTC y de
 *  noche (UTC-3) correría el día — el bug de fechas que ya pagamos una vez. */
function fechaLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recorridoDeTendencia(
  datos: PuntoTendencia[],
  meses: number,
  /** Inyectable para tests; en runtime es el HOY local del navegador. */
  hoyISO?: string,
): Recorrido | null {
  // SIN FUTUROLOGÍA (dueño, 2026-08-28): la tendencia es la historia HASTA
  // HOY. La serie puede traer fechas futuras (cuotas, pagos cargados por
  // adelantado) — acá se cortan: lo que viene lo cuenta la agenda de pagos,
  // no este gráfico. "Hoy" es el del CALENDARIO, no el último día de la
  // serie, que con futuras dejó de significar "el presente".
  const hoy = hoyISO ?? fechaLocalISO();
  const claveHoy = hoy.slice(0, 7);
  const diaHoy = Number(hoy.slice(8, 10));

  let lista = recortarExtremos(agruparPorMes(datos.filter((p) => p.fecha <= hoy)));
  if (lista.length === 0) return null;

  // El mes en curso recién arrancado se descarta sólo si quedan al menos dos
  // meses para comparar: antes que mostrar un mes suelto, queda el parcial.
  const enCurso = lista[lista.length - 1].clave === claveHoy;
  if (enCurso && diaHoy < DIAS_PARA_CONTAR_EL_MES && lista.length > 2) {
    lista = recortarExtremos(lista.slice(0, -1));
  }

  const periodos = lista.slice(-meses);
  const conHistoria = periodos.filter(periodoConMovimiento).length;
  if (conHistoria >= 2) return { modo: 'meses', periodos };

  const ventana = ventanaDeDias(datos.filter((p) => p.fecha <= hoy));
  return ventana ? { modo: 'ventana', periodos: [ventana] } : null;
}

/**
 * Los CHIPS del recorrido: los mismos meses si la historia es corta, o
 * AGRUPADOS por año cuando es larga (más de `MESES_PARA_SEGMENTAR_POR_ANIO`).
 * Un segmento-año es un `Periodo` común con `esAnio` — mismos agregados,
 * misma maquinaria de veredictos y KPIs.
 */
export function segmentosDelRecorrido(periodos: Periodo[]): Periodo[] {
  if (periodos.length <= MESES_PARA_SEGMENTAR_POR_ANIO) return periodos;
  const porAnio = new Map<string, PuntoTendencia[]>();
  for (const p of periodos) {
    const anio = p.clave.slice(0, 4);
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), ...p.dias]);
  }
  return [...porAnio.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([anio, dias]) => ({ ...armarPeriodo(anio, anio, '', dias), esAnio: true }));
}

/** "de enero 2024 a hoy" / "de junio a hoy" (mismo año: sin repetirlo). */
export function rangoDelRecorrido(periodos: Periodo[], hoyISO?: string): string {
  if (periodos.length === 0) return '';
  const primero = periodos[0];
  const hoy = hoyISO ?? fechaLocalISO();
  const multiAnio = primero.clave.slice(0, 4) !== hoy.slice(0, 4);
  const desde = multiAnio
    ? `${primero.label.toLowerCase()} ${primero.clave.slice(0, 4)}`
    : primero.label.toLowerCase();
  return `de ${desde} a hoy`;
}

/**
 * El VEREDICTO del panorama: la lectura de TODA la historia en una frase.
 * Mismo contrato que los veredictos de período: interpreta, no describe.
 */
export function veredictoDelPanorama(
  periodos: Periodo[],
  modo: ModoTendencia,
  fmt: (n: number) => string,
): VeredictoMes {
  const total = periodos.reduce((s, p) => s + p.entraron, 0);
  const resueltos = periodos.reduce((s, p) => s + p.resueltos, 0);
  const n = periodos.length;

  if (modo === 'monto') {
    const promedio = n > 0 ? total / n : 0;
    return {
      etiqueta: `Venís gastando ${fmt(promedio)} por mes:`,
      resto: `${fmt(total)} en ${nf(n)} meses.`,
      tono: 'neutro',
    };
  }
  const tasa = total > 0 ? resueltos / total : 0;
  const pct = Math.round(tasa * 100);
  return {
    etiqueta: `Entraron ${nf(total)} y se cerró el ${pct}%:`,
    resto: `${nf(resueltos)} resueltos en ${nf(n)} meses.`,
    tono: tasa >= 0.75 ? 'bueno' : tasa >= 0.5 ? 'neutro' : 'malo',
  };
}

/** Los mini-KPIs del panorama. Regla del cero intacta: sin datos, sin KPI. */
export function kpisDelPanorama(
  periodos: Periodo[],
  modo: ModoTendencia,
  fmt: (n: number) => string,
): KpiTendencia[] {
  const conMov = periodos.filter(periodoConMovimiento);
  if (conMov.length === 0) return [];
  const total = periodos.reduce((s, p) => s + p.entraron, 0);
  const n = periodos.length;
  const multiAnio = periodos.length > 0
    && periodos[0].clave.slice(0, 4) !== periodos[periodos.length - 1].clave.slice(0, 4);
  const caro = conMov.reduce((may, p) => (p.entraron > may.entraron ? p : may), conMov[0]);
  const labelMes = multiAnio ? `${caro.label} ${caro.clave.slice(0, 4)}` : caro.label;

  if (modo === 'monto') {
    return [
      { etiqueta: 'Total gastado', valor: fmt(total), nota: `· ${nf(n)} meses` },
      { etiqueta: 'Promedio mensual', valor: fmt(n > 0 ? total / n : 0) },
      { etiqueta: 'Mes más caro', valor: labelMes, nota: `· ${fmt(caro.entraron)}` },
    ];
  }
  const resueltos = periodos.reduce((s, p) => s + p.resueltos, 0);
  const kpis: KpiTendencia[] = [
    { etiqueta: 'Ingresados', valor: nf(total), nota: `· ${nf(n)} meses` },
  ];
  if (resueltos > 0) {
    kpis.push({ etiqueta: 'Resueltos', valor: nf(resueltos), tono: 'bueno' });
    kpis.push({ etiqueta: 'Tasa de cierre', valor: `${Math.round((resueltos / Math.max(1, total)) * 100)}%` });
  }
  kpis.push({ etiqueta: 'Mes más cargado', valor: labelMes, nota: `· ${nf(caro.entraron)}` });
  return kpis;
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
export function veredictoDelMes(m: Periodo, previo: Periodo | null): VeredictoMes {
  const pct = Math.round(m.tasa * 100);
  const deCada10 = Math.round(m.tasa * 10);

  if (m.entraron === 0) {
    // Un mes vacío INTERMEDIO del recorrido. No se enuncia el cero: se dice
    // qué no pasó, y los mini-KPIs de ese mes ni se dibujan.
    return {
      etiqueta: `Sin movimiento en ${m.label.toLowerCase()}:`,
      resto: 'no entró ni se cerró ningún reclamo.',
      tono: 'neutro',
    };
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
  m: Periodo,
  previo: Periodo | null,
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

/**
 * El veredicto de la VENTANA DE DÍAS: el municipio no tiene meses que
 * comparar, así que la frase no compara — interpreta lo que hubo.
 *
 * Regla del cero: acá es donde más fácil se cuela ("se cerraron 0"). Ninguna
 * rama enuncia un cero: cuando no hubo cierres la frase pivotea a lo que sí
 * pasó ("todavía no se cerró ninguno") y el mini-KPI correspondiente ni
 * aparece.
 */
export function veredictoDeVentana(
  v: Periodo,
  modo: ModoTendencia,
  fmt: (n: number) => string,
): VeredictoMes {
  const dias = v.dias.length;
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

  if (modo === 'monto') {
    return {
      etiqueta: `Se gastaron ${fmt(v.entraron)} en ${dias} días:`,
      resto: `${fmt(v.porDia)} por día — hubo movimiento en ${v.diasConMovimiento} de esos días.`,
      tono: 'neutro',
    };
  }

  // Sólo cierres: entró nada, pero se descargó la cola vieja. Es una buena
  // noticia y no se la puede contar como "0 ingresados".
  if (v.entraron === 0) {
    return {
      etiqueta: `Se cerraron ${nf(v.resueltos)} ${plural(v.resueltos, 'reclamo', 'reclamos')}:`,
      resto: `no entró ninguno nuevo en ${dias} días — la cola bajó.`,
      tono: 'bueno',
    };
  }

  const entrados = `${nf(v.entraron)} ${plural(v.entraron, 'reclamo', 'reclamos')}`;

  if (v.resueltos === 0) {
    // Si todo entró en la última semana, todavía no hubo tiempo de cerrarlo:
    // marcarlo en rojo sería un reproche inventado.
    const reciente = v.diasConMovimiento > 0
      && dias - v.dias.findIndex(conMovimiento) <= 7;
    return {
      etiqueta: `Entraron ${entrados}:`,
      resto: reciente
        ? 'recién arranca el circuito, todavía no se cerró ninguno.'
        : `todavía no se cerró ninguno — ${nf(v.porDia, 1)} por día.`,
      tono: reciente ? 'neutro' : 'malo',
    };
  }

  const deCada10 = Math.round(v.tasa * 10);
  if (v.tasa >= 1) {
    return {
      etiqueta: `Entraron ${entrados} y se cerraron ${nf(v.resueltos)}:`,
      resto: 'se cerró todo lo que entró y algo de la cola vieja.',
      tono: 'bueno',
    };
  }
  return {
    etiqueta: `Entraron ${entrados} y se cerraron ${nf(v.resueltos)}:`,
    resto: `${deCada10} de cada 10, a ${nf(v.porDia, 1)} por día.`,
    tono: v.tasa >= 0.75 ? 'bueno' : 'malo',
  };
}

interface OpcionesKpis {
  periodo: Periodo;
  previo: Periodo | null;
  modo: ModoTendencia;
  recorrido: ModoRecorrido;
  tono: VeredictoMes['tono'];
  fmt: (n: number) => string;
}

/**
 * Los cuatro (o menos) números que respaldan la frase.
 *
 * REGLA DEL CERO: un KPI que sólo puede decir "0" no se dibuja. Un mes vacío
 * intermedio devuelve la lista VACÍA —queda la frase y la curva plana, que ya
 * cuentan que no pasó nada— en lugar del panel de ceros con "1 jun · 0" que
 * es lo que motivó todo este cambio.
 */
export function kpisDelPeriodo({ periodo, previo, modo, recorrido, tono, fmt }: OpcionesKpis): KpiTendencia[] {
  const m = periodo;
  if (!periodoConMovimiento(m)) return [];

  const pico = m.pico && m.pico.cantidad > 0 ? m.pico : null;

  if (modo === 'monto') {
    const kpis: KpiTendencia[] = [
      { etiqueta: 'Total gastado', valor: fmt(m.entraron) },
      { etiqueta: 'Promedio por día', valor: fmt(m.porDia) },
    ];
    if (recorrido === 'meses') {
      // Sin período previo no hay variación: una raya, no un 0%.
      const delta = previo && previo.entraron > 0
        ? Math.round(((m.entraron - previo.entraron) / previo.entraron) * 100)
        : null;
      kpis.push({
        etiqueta: m.esAnio ? 'Vs. año anterior' : 'Vs. mes anterior',
        valor: delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`,
        tono,
      });
    } else {
      kpis.push({
        etiqueta: 'Días con gasto',
        valor: `${nf(m.diasConMovimiento)} de ${nf(m.dias.length)}`,
      });
    }
    kpis.push({
      etiqueta: 'Día más caro',
      valor: pico ? `${pico.dia} ${pico.abrev}` : '—',
      nota: pico ? `· ${fmt(pico.cantidad)}` : undefined,
    });
    return kpis;
  }

  // --- flujo ---
  if (recorrido === 'meses') {
    // Los cuatro de siempre: el recorrido por meses no cambió.
    return [
      { etiqueta: 'Ingresados', valor: nf(m.entraron) },
      { etiqueta: 'Resueltos', valor: nf(m.resueltos), tono: 'bueno' },
      { etiqueta: 'Tasa de cierre', valor: `${Math.round(m.tasa * 100)}%`, tono },
      {
        etiqueta: 'Día más cargado',
        valor: m.pico ? `${m.pico.dia} ${m.pico.abrev}` : '—',
        nota: m.pico ? `· ${nf(m.pico.cantidad)}` : undefined,
      },
    ];
  }

  const kpis: KpiTendencia[] = [];
  if (m.entraron > 0) kpis.push({ etiqueta: 'Ingresados', valor: nf(m.entraron) });
  if (m.resueltos > 0) kpis.push({ etiqueta: 'Resueltos', valor: nf(m.resueltos), tono: 'bueno' });
  if (m.entraron > 0 && m.resueltos > 0) {
    kpis.push({ etiqueta: 'Tasa de cierre', valor: `${Math.round(m.tasa * 100)}%`, tono });
  } else if (m.entraron > 0) {
    // Sin cierres, la tasa sería un 0% enunciado: en su lugar, el ritmo.
    kpis.push({ etiqueta: 'Promedio por día', valor: nf(m.porDia, 1) });
  } else {
    // Sólo hubo cierres: el ritmo de ingreso sería otro cero, así que el
    // segundo número dice en cuántos días se descargó la cola.
    kpis.push({ etiqueta: 'Días con cierres', valor: `${nf(m.diasConMovimiento)} de ${nf(m.dias.length)}` });
  }
  // "1 jun · 0" no es un día más cargado: si no hubo ninguno, no hay KPI.
  if (pico) {
    kpis.push({
      etiqueta: 'Día más cargado',
      valor: `${pico.dia} ${pico.abrev}`,
      nota: `· ${nf(pico.cantidad)}`,
    });
  }
  return kpis;
}

/** El rótulo de un tramo del recorrido. Un mes sin movimiento no dice "0". */
export function rotuloDelPeriodo(m: Periodo, modo: ModoTendencia, fmt: (n: number) => string): string {
  if (!periodoConMovimiento(m)) return `${m.label} · sin movimiento`;
  return `${m.label} · ${modo === 'monto' ? fmt(m.entraron) : `${nf(m.entraron)} entraron`}`;
}
