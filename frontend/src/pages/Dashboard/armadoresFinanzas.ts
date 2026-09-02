/**
 * Armadores del PERFIL FINANCIERO del dashboard.
 *
 * Todo el criterio de copy, de veredictos y de derivados vive acá; las
 * secciones (`HeroFinanciero`, `ColasPagos`, `TendenciaGastos`,
 * `FinanzasResumen`) son bobas y sólo componen piezas del kit.
 *
 * REGLA DEL CERO (principio 3, no negociable): un cero no se enuncia NUNCA.
 * Nada de "0 pagos vencidos", "$0" ni "0 OP por autorizar" — el copy pivotea
 * a lo que sí pasa ("Al día", "sin pagos vencidos") o el segmento se omite.
 * Cada rama de este archivo está escrita con las tres variantes resueltas:
 * cero, uno y muchos.
 *
 * NADA se inventa: los agregados salen de la serie diaria real del backend y
 * de las listas de cajas/pagos que el muni tiene cargadas. Cuando falta la
 * base de comparación (no hay mes anterior completo, no hay cajas), no se
 * afirma — se omite.
 */
import {
  Banknote, CalendarClock, FileSignature, PiggyBank, TrendingDown, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { KpiCardV2Props } from '../../components/dashboard/KpiCardV2';
import type { HeroStripKpi } from '../../components/dashboard/HeroBannerV2';
import type { PuntoTendencia } from '../../components/dashboard/TendenciaMeses';
import { seg, type HeroFrase, type HeroSegmento, type Veredicto } from '../../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor } from '../../lib/veredictos';
import {
  clasificarPagos, fmtMontoCompacto, fmtMontoPesos, parseFechaLocal, type ColaPagos,
} from '../../lib/tesoreria-helpers';
import type { DatosFinanzas } from './tipos';

const NOMBRE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** 'YYYY-MM' del día de hoy, en hora LOCAL (no UTC: en AR adelanta un día). */
function claveMesDeHoy(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

/** El mes anterior a una clave 'YYYY-MM'. */
function claveMesAnterior(clave: string): string {
  const anio = Number(clave.slice(0, 4));
  const mes = Number(clave.slice(5, 7));
  return mes === 1
    ? `${anio - 1}-12`
    : `${anio}-${String(mes - 1).padStart(2, '0')}`;
}

const labelDeClave = (clave: string) => NOMBRE_MES[Number(clave.slice(5, 7)) - 1] ?? clave;

/** "5 de septiembre" — el día de un vencimiento, dicho como se dice. */
export function diaYMes(iso: string | null | undefined): string {
  const d = parseFechaLocal(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${NOMBRE_MES[d.getMonth()]}`;
}

// ------------------------------------------------------------- agregados

export interface MesGasto {
  /** 'YYYY-MM' */
  clave: string;
  /** 'julio' */
  label: string;
  total: number;
  /** Días de ese mes presentes en la serie (la serie es contigua). */
  dias: number;
  /** El primer día del mes está en la serie: el mes entró COMPLETO. */
  desdeElPrimero: boolean;
}

/** Agrupa la serie diaria por mes calendario, del más viejo al más nuevo. */
export function agruparGastoPorMes(serie: { fecha: string; monto: number }[]): MesGasto[] {
  const mapa = new Map<string, { total: number; dias: number; primeraFecha: string }>();
  for (const p of serie) {
    const clave = (p.fecha || '').slice(0, 7);
    if (clave.length !== 7) continue;
    const prev = mapa.get(clave);
    if (prev) {
      prev.total += p.monto || 0;
      prev.dias += 1;
      if (p.fecha < prev.primeraFecha) prev.primeraFecha = p.fecha;
    } else {
      mapa.set(clave, { total: p.monto || 0, dias: 1, primeraFecha: p.fecha });
    }
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, v]) => ({
      clave,
      label: labelDeClave(clave),
      total: v.total,
      dias: v.dias,
      desdeElPrimero: v.primeraFecha.slice(8, 10) === '01',
    }));
}

/**
 * Los derivados del perfil financiero, calculados UNA vez y compartidos por
 * las cuatro secciones y por el hero.
 */
export interface ResumenFinanciero {
  /** El mes en curso (el del reloj, no el último con datos). */
  mesActual: MesGasto | null;
  mesAnterior: MesGasto | null;
  /**
   * Lo que el mes anterior llevaba gastado A ESTA MISMA ALTURA (sus días 1..N,
   * con N los días transcurridos del mes en curso).
   *
   * Es la ÚNICA base honesta para el delta: el mes que corre lleva 25 días y
   * el anterior tiene 31, así que compararlos enteros dice "gastaste 54%
   * menos" cuando lo único seguro es que todavía no terminó. null si el mes
   * anterior no entró completo en la ventana de la serie.
   */
  baseComparable: number | null;
  /** ¿La base comparable es el mes anterior ENTERO? (mes ya cumplido). */
  baseEsMesCompleto: boolean;
  /** Variación % del mes en curso contra `baseComparable`; null sin base. */
  deltaMes: number | null;
  /** Serie diaria del mes en curso, para la sparkline. */
  serieMesActual: number[];
  /** Suma de los saldos de las cajas que son PLATA (las tarjetas no lo son:
   *  ahí el "saldo" es crédito disponible, no fondos del muni). */
  saldoCajas: number;
  cajasContadas: number;
  /** Gasto promedio de los meses COMPLETOS de la ventana; null sin ninguno. */
  promedioMensual: number | null;
  /** Cuántos meses de ese gasto cubre el saldo; null si no se puede calcular. */
  cobertura: number | null;
  /** Los meses completos que entraron en el promedio (para decir de dónde sale). */
  mesesDelPromedio: MesGasto[];
  cola: ColaPagos;
}

export function construirResumenFinanciero(datos: DatosFinanzas): ResumenFinanciero {
  const meses = agruparGastoPorMes(datos.serie);
  const claveHoy = claveMesDeHoy();
  const claveAnterior = claveMesAnterior(claveHoy);

  const mesActual = meses.find((m) => m.clave === claveHoy) ?? null;
  const mesAnterior = meses.find((m) => m.clave === claveAnterior) ?? null;

  // Comparación a la misma altura del mes: los días 1..N del mes anterior, con
  // N los días que lleva el que corre. Sin esto el delta compara medio mes
  // contra uno entero y siempre da "se gastó muchísimo menos".
  const diasTranscurridos = mesActual?.dias ?? 0;
  const baseComparable =
    mesActual && mesAnterior && mesAnterior.desdeElPrimero && diasTranscurridos > 0
      ? datos.serie
          .filter((p) => p.fecha.slice(0, 7) === claveAnterior
            && Number(p.fecha.slice(8, 10)) <= diasTranscurridos)
          .reduce((acc, p) => acc + (p.monto || 0), 0)
      : null;
  const baseEsMesCompleto =
    baseComparable != null && mesAnterior != null && baseComparable >= mesAnterior.total;
  const deltaMes =
    mesActual && baseComparable != null && baseComparable > 0
      ? Math.round(((mesActual.total - baseComparable) / baseComparable) * 100)
      : null;

  const serieMesActual = datos.serie
    .filter((p) => p.fecha.slice(0, 7) === claveHoy)
    .map((p) => p.monto);

  // Las tarjetas de crédito quedan fuera del saldo: su `saldo_actual` es el
  // crédito DISPONIBLE (ver models/tesoreria_extra), no plata que el muni
  // tenga. Sumarlas infla el fondo con deuda por gastar.
  const cajasPlata = datos.cajas.filter((c) => !c.es_tarjeta);
  const saldoCajas = cajasPlata.reduce((acc, c) => acc + (parseFloat(c.saldo_actual || '0') || 0), 0);

  // Promedio de los meses COMPLETOS: se descarta el mes en curso (todavía no
  // terminó) y el más viejo de la ventana si entró cortado. Comparar el saldo
  // contra un mes a medias es cómo se dice "te alcanza para el doble".
  const mesesDelPromedio = meses.filter((m) => m.clave !== claveHoy && m.desdeElPrimero);
  const promedioMensual = mesesDelPromedio.length > 0
    ? mesesDelPromedio.reduce((acc, m) => acc + m.total, 0) / mesesDelPromedio.length
    : null;
  const cobertura = promedioMensual && promedioMensual > 0 ? saldoCajas / promedioMensual : null;

  return {
    mesActual,
    mesAnterior,
    baseComparable,
    baseEsMesCompleto,
    deltaMes,
    serieMesActual,
    saldoCajas,
    cajasContadas: cajasPlata.length,
    promedioMensual,
    cobertura,
    mesesDelPromedio,
    cola: clasificarPagos(datos.pagos),
  };
}

/**
 * Cómo se nombra la referencia del mes anterior.
 *
 * "julio llevaba $40,6M a esta altura" cuando el mes que corre todavía no lo
 * alcanzó en días; "julio cerró en $40,6M" cuando ya se comparan meses
 * enteros. Nunca "julio: $40,6M" a secas — eso invita a leer 25 días contra
 * 31 como si fueran lo mismo.
 */
export function fraseMesAnterior(r: ResumenFinanciero): string | null {
  if (!r.mesAnterior || r.mesAnterior.total <= 0) return null;
  const cerro = `${r.mesAnterior.label} cerró en ${fmtMontoCompacto(r.mesAnterior.total)}`;
  if (r.baseComparable == null || r.baseComparable <= 0 || r.baseEsMesCompleto) return cerro;
  return `${r.mesAnterior.label} llevaba ${fmtMontoCompacto(r.baseComparable)} a esta altura`;
}

/** "cubre 35 meses de gasto" / "no cubre un mes de gasto" / null sin base. */
export function fraseCobertura(cobertura: number | null): string | null {
  if (cobertura == null) return null;
  if (cobertura < 1) return 'no cubre un mes de gasto';
  const n = cobertura < 10
    ? cobertura.toLocaleString('es-AR', { maximumFractionDigits: 1 })
    : String(Math.round(cobertura));
  return `cubre ${n} ${cobertura < 2 ? 'mes' : 'meses'} de gasto`;
}

/** El veredicto del colchón: menos de un mes es rojo, menos de tres es ámbar. */
function veredictoCobertura(cobertura: number | null): Veredicto | undefined {
  if (cobertura == null) return undefined;
  if (cobertura < 1) return 'malo';
  if (cobertura < 3) return 'advertencia';
  return 'bueno';
}

// ------------------------------------------------------- los cinco KPIs

/** La 5.ª tarjeta del pool: contaduría manda; sin ella, la conciliación. */
export interface OpcionesKpisFinancieros {
  contaduriaActiva: boolean;
  /** Colores del tema para las sparklines (useSemColors). */
  color: string;
  colorNeutro: string;
}

/**
 * Los CINCO KPIs del hero financiero, en orden canónico:
 * gastado del mes · saldo de cajas · vencen en la quincena · pagos vencidos ·
 * (OP por autorizar | conciliación pendiente), según módulos.
 *
 * Ninguno se cae por estar en cero: se REDACTA distinto ("Al día", "Sin
 * gasto") para no dejar un hueco en la fila ni enunciar un cero.
 */
export function construirKpisFinancieros(
  r: ResumenFinanciero,
  datos: DatosFinanzas,
  opts: OpcionesKpisFinancieros,
): KpiCardV2Props[] {
  const u = resolverUmbrales();
  const colorear = (card: KpiCardV2Props): KpiCardV2Props => ({
    ...card,
    serieColor: card.atenuado ? opts.colorNeutro : opts.color,
  });

  // --- 1. Gastado del mes ---
  const mes = r.mesActual;
  const gastoMes = mes?.total ?? 0;
  const gastado: KpiCardV2Props = {
    eyebrow: mes ? `Gastado en ${mes.label}` : 'Gastado este mes',
    icono: TrendingDown,
    valor: gastoMes > 0 ? fmtMontoCompacto(gastoMes) : 'Sin gasto',
    atenuado: gastoMes === 0,
    // La sparkline es el día a día REAL del mes; con menos de dos días la
    // pieza dibuja sola su línea punteada neutra.
    serie: r.serieMesActual.length >= 2 ? r.serieMesActual : undefined,
    delta: r.deltaMes != null && Math.abs(r.deltaMes) >= 5
      ? {
          texto: `${Math.abs(r.deltaMes)}%`,
          direccion: r.deltaMes > 0 ? 'sube' : 'baja',
          veredicto: r.deltaMes > 0 ? 'advertencia' : 'bueno',
        }
      : null,
    // El sub dice contra QUÉ se está comparando. Sin eso, un "-54%" verde no
    // se puede auditar: no se sabe si el mes anterior entero o su misma
    // altura, que son dos números distintos.
    sub: gastoMes === 0
      ? (mes ? `Todavía no se cargó ningún gasto de ${mes.label}` : undefined)
      : (fraseMesAnterior(r) ?? undefined),
  };

  // --- 2. Saldo de cajas ---
  const cobertura = fraseCobertura(r.cobertura);
  const saldo: KpiCardV2Props = {
    eyebrow: 'Saldo en cajas',
    icono: PiggyBank,
    valor: r.cajasContadas === 0
      ? 'Sin cajas'
      : r.saldoCajas > 0 ? fmtMontoCompacto(r.saldoCajas) : 'Sin fondos',
    atenuado: r.saldoCajas <= 0,
    veredicto: r.saldoCajas > 0 ? veredictoCobertura(r.cobertura) : undefined,
    sub: r.cajasContadas === 0
      ? 'Todavía no se cargó ninguna caja'
      : cobertura
        ? `${cobertura} · ${r.cajasContadas} ${plural(r.cajasContadas, 'caja', 'cajas')}`
        : `${r.cajasContadas} ${plural(r.cajasContadas, 'caja activa', 'cajas activas')}`,
  };

  // --- 3. Vencen en la quincena ---
  const q = r.cola.quincena.length;
  const proximo = r.cola.primeraFechaQuincena;
  const quincena: KpiCardV2Props = {
    eyebrow: 'Vencen en 15 días',
    icono: CalendarClock,
    valor: q > 0 ? q : 'Nada',
    unidad: q > 0 ? plural(q, 'pago', 'pagos') : 'vence en la quincena',
    atenuado: q === 0,
    sub: q > 0
      ? `${fmtMontoCompacto(r.cola.montoQuincena)}${proximo ? ` · el primero, el ${diaYMes(proximo)}` : ''}`
      : (datos.pagos.length > 0
          ? 'Los pagos programados caen más adelante'
          : 'La agenda no tiene pagos cargados'),
  };

  // --- 4. Pagos vencidos ---
  const v = r.cola.vencidos.length;
  const vencidos: KpiCardV2Props = {
    eyebrow: 'Pagos vencidos',
    icono: Wallet,
    valor: v > 0 ? v : 'Al día',
    unidad: v > 0 ? plural(v, 'pago', 'pagos') : 'sin pagos vencidos',
    atenuado: false,
    veredicto: v > 0 ? veredictoMasEsPeor(v, u.vencidos) : 'bueno',
    sub: v > 0
      ? `${fmtMontoCompacto(r.cola.montoVencido)}${
          r.cola.diasDelMasViejo > 0
            ? ` · el más viejo, hace ${r.cola.diasDelMasViejo} ${plural(r.cola.diasDelMasViejo, 'día', 'días')}`
            : ''
        }`
      : 'Toda la agenda está al día',
  };

  // --- 5. El pool por módulo: contaduría o conciliación ---
  let quinto: KpiCardV2Props;
  if (opts.contaduriaActiva) {
    const op = datos.opPendientes;
    const n = op?.cantidad ?? 0;
    quinto = {
      eyebrow: 'Esperan tu firma',
      icono: FileSignature,
      valor: n > 0 ? n : 'Al día',
      unidad: n > 0 ? plural(n, 'orden de pago', 'órdenes de pago') : 'ninguna orden pendiente',
      atenuado: false,
      veredicto: n > 0 ? veredictoMasEsPeor(n, u.sinAsignar) : 'bueno',
      sub: n > 0
        ? `${fmtMontoCompacto(op?.monto ?? 0)} esperando autorización`
        : 'Contaduría no tiene órdenes pendientes',
    };
  } else {
    const c = datos.conciliacion;
    const n = c?.cantidad ?? 0;
    quinto = {
      eyebrow: 'Sin conciliar',
      icono: Banknote,
      valor: n > 0 ? n : 'Al día',
      unidad: n > 0 ? plural(n, 'movimiento', 'movimientos') : 'todo cruzado con el banco',
      atenuado: false,
      veredicto: n > 0 ? 'advertencia' : 'bueno',
      sub: n > 0
        ? `${fmtMontoCompacto(c?.monto ?? 0)} sin cruzar contra el extracto`
        : 'Los movimientos de caja están conciliados',
    };
  }

  return [gastado, saldo, quincena, vencidos, quinto].map(colorear);
}

// --------------------------------------------------- strip del hero (4)

/**
 * Los CUATRO KPIs del strip del banner cuando el muni es sólo financiero
 * (reclamos y trámites apagados): gastado del mes, saldo, quincena, vencidos.
 *
 * Es el mismo pool que la fila de cinco, sin la 5.ª: el strip vive dentro de
 * la foto del muni y ahí entran cuatro números, no cinco.
 */
export function construirStripFinanciero(r: ResumenFinanciero): HeroStripKpi[] {
  const gastoMes = r.mesActual?.total ?? 0;
  const q = r.cola.quincena.length;
  const v = r.cola.vencidos.length;
  return [
    {
      etiqueta: r.mesActual ? `Gastado en ${r.mesActual.label}` : 'Gastado este mes',
      etiquetaCorta: r.mesActual ? r.mesActual.label.replace(/^\w/, (c) => c.toUpperCase()) : 'Mes',
      valor: gastoMes > 0 ? fmtMontoCompacto(gastoMes) : '—',
    },
    {
      etiqueta: 'Saldo en cajas',
      etiquetaCorta: 'Cajas',
      valor: r.cajasContadas > 0 ? fmtMontoCompacto(r.saldoCajas) : '—',
    },
    {
      etiqueta: 'Vencen en 15 días',
      etiquetaCorta: 'Quincena',
      valor: q > 0 ? q : '—',
    },
    {
      etiqueta: 'Pagos vencidos',
      etiquetaCorta: 'Vencidos',
      // Al día no se dice con un cero: la casilla muestra una raya y el ámbar
      // se apaga. Lo que sí pasó lo cuenta la frase del hero.
      valor: v > 0 ? v : '—',
      amber: v > 0,
    },
  ];
}

// ------------------------------------------------- la frase del carrusel

/**
 * La frase financiera del `SemanticHero`.
 *
 * Un solo párrafo que dice las tres cosas que un intendente pregunta:
 * cuánto se gastó, qué se viene y qué se pasó de fecha. Cada cláusula se
 * enuncia SÓLO si existe; si no queda ninguna, no hay frase (null) y el
 * carrusel ni se entera.
 */
export function fraseFinanzas(r: ResumenFinanciero, datos: DatosFinanzas): HeroFrase | null {
  const u = resolverUmbrales();
  const segmentos: HeroSegmento[] = [];
  const gastoMes = r.mesActual?.total ?? 0;
  const v = r.cola.vencidos.length;
  const q = r.cola.quincena.length;

  // (a) El gasto del mes. "van" y no "se gastaron": el mes está corriendo.
  if (r.mesActual && gastoMes > 0) {
    segmentos.push(
      seg(`En ${r.mesActual.label} van `),
      seg(fmtMontoCompacto(gastoMes)),
      seg(' de gasto'),
    );
    const referencia = fraseMesAnterior(r);
    if (referencia) segmentos.push(seg(`; ${referencia}`));
    segmentos.push(seg('. '));
  }

  // (b) Lo que se viene y lo que se pasó. Un cero no abre cláusula: si no hay
  // vencidos se dice que la agenda está al día, que es lo que sí pasa.
  const vencenQ = plural(q, 'vence', 'vencen');
  if (q > 0 && v > 0) {
    segmentos.push(
      seg(`En la quincena ${vencenQ} `),
      seg(`${q} ${plural(q, 'pago', 'pagos')} por ${fmtMontoCompacto(r.cola.montoQuincena)}`, 'advertencia'),
      seg(' y hay '),
      seg(`${v} ${plural(v, 'vencido', 'vencidos')} por ${fmtMontoCompacto(r.cola.montoVencido)}`,
        veredictoMasEsPeor(v, u.vencidos)),
    );
    if (r.cola.diasDelMasViejo > 0) {
      segmentos.push(
        seg(', el más viejo hace '),
        seg(`${r.cola.diasDelMasViejo} ${plural(r.cola.diasDelMasViejo, 'día', 'días')}`,
          veredictoMasEsPeor(v, u.vencidos)),
      );
    }
    segmentos.push(seg('.'));
  } else if (q > 0) {
    segmentos.push(
      seg(`En la quincena ${vencenQ} `),
      seg(`${q} ${plural(q, 'pago', 'pagos')} por ${fmtMontoCompacto(r.cola.montoQuincena)}`, 'advertencia'),
      // La puntuación va PEGADA al segmento neutro, nunca abriendo la ficha de
      // color: un "; " adentro del chip verde se lee como parte del veredicto.
      seg(`${r.cola.primeraFechaQuincena
        ? `, el primero el ${diaYMes(r.cola.primeraFechaQuincena)}`
        : ''}; `),
      seg('sin vencidos, la agenda está al día.', 'bueno'),
    );
  } else if (v > 0) {
    segmentos.push(
      seg('Hay '),
      seg(`${v} ${plural(v, 'pago vencido', 'pagos vencidos')} por ${fmtMontoCompacto(r.cola.montoVencido)}`,
        veredictoMasEsPeor(v, u.vencidos)),
      seg(r.cola.diasDelMasViejo > 0
        ? `, el más viejo hace ${r.cola.diasDelMasViejo} ${plural(r.cola.diasDelMasViejo, 'día', 'días')}.`
        : '.'),
    );
  } else if (datos.pagos.length > 0) {
    const n = datos.pagos.length;
    segmentos.push(
      seg('La agenda de pagos '),
      seg('está al día', 'bueno'),
      seg(n === 1
        ? ': el único pago programado no está vencido.'
        : `: ninguno de los ${n} pagos programados está vencido.`),
    );
  }

  if (segmentos.length === 0) return null;

  return {
    segmentos,
    acciones: [
      { label: 'Ver los pagos', to: '/gestion/tesoreria/pagos-programados', primaria: true },
      { label: 'Ver los gastos', to: '/gestion/tesoreria' },
    ],
  };
}

// ------------------------------------------------------ tres preguntas

/** Una pregunta del resumen — lo que consume `KpiSemantico` de la sección. */
export interface PreguntaFinanciera {
  id: string;
  pregunta: string;
  icono: LucideIcon;
  tono: 'bueno' | 'malo' | 'advertencia' | 'info' | 'neutro';
  valor: string;
  unidad?: string;
  /** Partes de la explicación: el texto plano y lo que va en negrita. */
  detalle: { texto: string; fuerte?: boolean }[];
  pie?: string;
  accion: { label: string; to: string };
}

/**
 * Las TRES preguntas del resumen financiero — la variante que se muestra
 * cuando finanzas CONVIVE con reclamos/trámites (un muni full como Merlo).
 *
 * Prosa y nada más: cero grillas, cero colas. Lo que el intendente pregunta
 * cuando el tablero ya le habló de reclamos y trámites.
 */
export function construirPreguntasFinanzas(
  r: ResumenFinanciero,
  datos: DatosFinanzas,
  opts: { contaduriaActiva: boolean },
): PreguntaFinanciera[] {
  const u = resolverUmbrales();
  const cobertura = fraseCobertura(r.cobertura);
  const v = r.cola.vencidos.length;
  const q = r.cola.quincena.length;
  const gastoMes = r.mesActual?.total ?? 0;

  // --- 1. ¿Cómo venimos de plata? ---
  const detallePlata: { texto: string; fuerte?: boolean }[] = [];
  if (r.cajasContadas === 0) {
    detallePlata.push({ texto: 'Todavía no hay ninguna caja cargada, así que no hay fondo que medir.' });
  } else {
    if (cobertura && r.promedioMensual) {
      detallePlata.push(
        { texto: 'El saldo ' },
        { texto: cobertura, fuerte: true },
        { texto: `, tomando el promedio de ${fmtMontoCompacto(r.promedioMensual)} por mes. ` },
      );
    }
    if (r.mesActual && gastoMes > 0) {
      const referencia = fraseMesAnterior(r);
      detallePlata.push({ texto: `En ${r.mesActual.label} van ${fmtMontoCompacto(gastoMes)}` });
      detallePlata.push({ texto: referencia ? `; ${referencia}.` : '.' });
    } else if (r.mesActual) {
      detallePlata.push({ texto: `Todavía no se cargó ningún gasto de ${r.mesActual.label}.` });
    }
    // Sin gastos no hay nada que decir del fondo, y una tarjeta con la
    // explicación en blanco es peor que una frase corta: se dice lo único
    // cierto, que todavía no hay contra qué medirlo.
    if (detallePlata.length === 0) {
      detallePlata.push({ texto: 'Todavía no hay gastos cargados para medir cuánto dura el fondo.' });
    }
  }

  const plata: PreguntaFinanciera = {
    id: 'plata',
    pregunta: '¿Cómo venimos de plata?',
    icono: PiggyBank,
    tono: r.cajasContadas === 0
      ? 'info'
      : (veredictoCobertura(r.cobertura) ?? 'info'),
    valor: r.cajasContadas === 0 ? '—' : fmtMontoCompacto(r.saldoCajas),
    unidad: r.cajasContadas === 0
      ? 'sin cajas cargadas'
      : `en ${r.cajasContadas} ${plural(r.cajasContadas, 'caja', 'cajas')}`,
    detalle: detallePlata,
    pie: r.mesesDelPromedio.length > 0
      ? `Promedio de ${r.mesesDelPromedio.map((m) => m.label).join(', ')}`
      : undefined,
    accion: { label: 'Ver los gastos', to: '/gestion/tesoreria' },
  };

  // --- 2. ¿Qué hay que pagar? ---
  const detallePagos: { texto: string; fuerte?: boolean }[] = [];
  if (q > 0) {
    detallePagos.push(
      { texto: q === 1 ? 'Suma ' : 'Suman ' },
      { texto: fmtMontoCompacto(r.cola.montoQuincena), fuerte: true },
      { texto: r.cola.primeraFechaQuincena
        ? ` y el primero es el ${diaYMes(r.cola.primeraFechaQuincena)}. `
        : '. ' },
    );
  } else if (datos.pagos.length > 0) {
    detallePagos.push({ texto: 'No vence ninguno en los próximos quince días. ' });
  } else {
    detallePagos.push({ texto: 'La agenda todavía no tiene pagos programados. ' });
  }
  if (v > 0) {
    detallePagos.push(
      { texto: 'Ya ' },
      { texto: `${v === 1 ? 'hay 1 vencido' : `hay ${v} vencidos`} por ${fmtMontoCompacto(r.cola.montoVencido)}`, fuerte: true },
      { texto: r.cola.diasDelMasViejo > 0
        ? `, el más viejo hace ${r.cola.diasDelMasViejo} ${plural(r.cola.diasDelMasViejo, 'día', 'días')}.`
        : '.' },
    );
  } else if (datos.pagos.length > 0) {
    detallePagos.push({ texto: 'Sin vencidos: ' }, { texto: 'la agenda está al día.', fuerte: true });
  }

  const pagar: PreguntaFinanciera = {
    id: 'pagar',
    pregunta: '¿Qué hay que pagar?',
    icono: CalendarClock,
    tono: v > 0 ? (veredictoMasEsPeor(v, u.vencidos) === 'malo' ? 'malo' : 'advertencia') : 'bueno',
    valor: q > 0 ? `${q} ${plural(q, 'pago', 'pagos')}` : 'Nada',
    // "Nada vence" y "1 pago vence" van en singular; sólo de 2 en adelante
    // el verbo va en plural (el `plural` de arriba manda 0 al plural).
    unidad: `${q > 1 ? 'vencen' : 'vence'} en la quincena`,
    detalle: detallePagos,
    pie: datos.pagos.length > 0
      ? `${datos.pagos.length} ${plural(datos.pagos.length, 'pago programado activo', 'pagos programados activos')}`
      : undefined,
    accion: { label: 'Ver la agenda', to: '/gestion/tesoreria/pagos-programados' },
  };

  // --- 3. ¿Qué espera tu firma? (contaduría) o la conciliación ---
  let tercera: PreguntaFinanciera;
  if (opts.contaduriaActiva) {
    const n = datos.opPendientes?.cantidad ?? 0;
    tercera = {
      id: 'firma',
      pregunta: '¿Qué espera tu firma?',
      icono: FileSignature,
      tono: n > 0 ? (veredictoMasEsPeor(n, u.sinAsignar) === 'malo' ? 'malo' : 'advertencia') : 'bueno',
      valor: n > 0 ? String(n) : 'Al día',
      unidad: n > 0
        ? plural(n, 'orden de pago', 'órdenes de pago')
        : 'ninguna orden espera autorización',
      detalle: n > 0
        ? [
            { texto: 'Suman ' },
            { texto: fmtMontoCompacto(datos.opPendientes?.monto ?? 0), fuerte: true },
            { texto: ' y no salen de Contaduría hasta que las autorices.' },
          ]
        : [{ texto: 'Contaduría no tiene ninguna orden de pago esperando autorización.' }],
      accion: { label: 'Ver las órdenes', to: '/gestion/contaduria/ordenes-pago' },
    };
  } else {
    const n = datos.conciliacion?.cantidad ?? 0;
    tercera = {
      id: 'conciliar',
      pregunta: '¿Cuadra con el banco?',
      icono: Banknote,
      tono: n > 0 ? 'advertencia' : 'bueno',
      valor: n > 0 ? String(n) : 'Al día',
      unidad: n > 0 ? plural(n, 'movimiento sin conciliar', 'movimientos sin conciliar') : 'todo conciliado',
      detalle: n > 0
        ? [
            { texto: 'Suman ' },
            { texto: fmtMontoCompacto(datos.conciliacion?.monto ?? 0), fuerte: true },
            { texto: ' que todavía no se cruzaron contra el extracto bancario.' },
          ]
        : [{ texto: 'Todos los movimientos de caja están cruzados contra el extracto.' }],
      accion: { label: 'Ir a conciliación', to: '/gestion/tesoreria/conciliacion' },
    };
  }

  return [plata, pagar, tercera];
}

// ----------------------------------------------------------- tendencia

/**
 * La serie de gasto en el formato que come `TendenciaMeses`.
 *
 * La pieza habla de `cantidad` porque nació con reclamos; en modo 'monto' esa
 * cantidad son pesos. Se adapta acá y no en la pieza: el kit es bobo.
 */
export function serieParaTendencia(serie: { fecha: string; monto: number }[]): PuntoTendencia[] {
  return serie.map((p) => ({ fecha: p.fecha, cantidad: p.monto }));
}

/** El formateador que la tendencia usa para los pesos. */
export const formatoMonto = (n: number) => fmtMontoCompacto(n);

/** Idem, exacto — para el total del mes, donde el redondeo molesta. */
export const formatoMontoExacto = (n: number) => fmtMontoPesos(n);
