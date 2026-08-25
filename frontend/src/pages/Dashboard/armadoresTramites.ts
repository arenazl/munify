/**
 * Armadores del CIRCUITO DE TRÁMITES — las tres preguntas del mostrador.
 *
 * El tablero tenía a los trámites reducidos a un tramo de cinta y una frase
 * del hero: cuántos entraron y cuántos hay en curso. Nada de dónde se traban,
 * nada del turnero y nada de qué tipo de trámite tarda más. Acá vive el copy
 * de las tres preguntas que faltaban:
 *
 *   1. ¿Dónde se traban?      → quién tiene la pelota: el municipio o el vecino
 *   2. ¿Se cumplen los turnos? → presentismo REAL del turnero
 *   3. ¿Qué trámite duele más? → tiempos por tipo (o volumen, si no hay tiempos)
 *
 * REGLA DEL CERO (principio 3 del diseño, no negociable): un cero no se
 * enuncia NUNCA. Cada pregunta puede devolver `null` y desaparecer —sin
 * turnos no se dice "0 turnos", se omite la tarjeta— y cuando el cero es
 * buena noticia el copy la cuenta en positivo ("Nada trabado del lado del
 * vecino"). Toda rama de este archivo está escrita con las tres variantes
 * gramaticales resueltas: cero, uno y muchos.
 *
 * NADA se infiere: los números salen de `GET /dashboard/tramites-circuito`,
 * que sólo agrega lo que hay en la base. Cuando falta la base para afirmar
 * (ningún cierre medido, ningún turno registrado) no se afirma — se dice que
 * no se puede medir, que es distinto de decir cero.
 */
import { CalendarCheck, Layers, Split, Timer } from 'lucide-react';
import { resolverUmbrales, veredictoMasEsPeor, veredictoMenosEsMejor, veredictoTasa } from '../../lib/veredictos';
import type {
  CuellosTramites, PreguntaSemantica, TiposCircuito, TramitesCircuito, TurnosCircuito,
} from './tipos';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const fmt = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/** Un detalle vacío no existe: `KpiSemantico` pinta un párrafo, y un párrafo
 *  en blanco se lee como una tarjeta rota. */
type Parte = { texto: string; fuerte?: boolean };

/** Ruta canónica de cada pantalla del dominio (ver config/navigation.ts). */
const RUTA_TRAMITES = '/gestion/tramites';
const RUTA_AGENDA = '/gestion/agenda-turnos';

/**
 * Cómo se NOMBRA en castellano el motivo por el que una gestión espera al
 * vecino. Las claves son los estados reales de `solicitudes.estado`
 * (models/tramite.py): los nuevos van en minúscula, los legacy en mayúscula,
 * y por eso se busca normalizado.
 *
 * Patrón resiliente (regla 3): un estado que no esté en el mapa NO rompe la
 * frase — cae al propio nombre del estado con los guiones bajos abiertos.
 */
const MOTIVO_ESPERA_VECINO: Record<string, string> = {
  pendiente_pago: 'pendiente de pago',
  requiere_documentacion: 'falta documentación',
};

const nombrarMotivo = (estado: string): string =>
  MOTIVO_ESPERA_VECINO[estado.toLowerCase()] ?? estado.toLowerCase().replace(/_/g, ' ');

/**
 * Ausencias mínimas para hablar de "la franja que más falla".
 *
 * Con una o dos faltas la hora del día es casualidad, no un patrón, y
 * mandar a mover una ventanilla por eso es peor que no decir nada.
 */
const MIN_AUSENCIAS_PARA_FRANJA = 3;

/** "las 9" / "las 11" — la franja horaria dicha como se dice. */
const franjaHablada = (hora: number) => `las ${hora}`;

/**
 * Una duración en minutos, dicha en la unidad que corresponde.
 *
 * Devuelve null en 0 y en null, pero por motivos DISTINTOS que el que llama
 * ya distinguió: null es "no hay cierres medibles" y 0 es "cerró en el acto".
 * Ninguno de los dos es una duración que se pueda enunciar.
 */
export function duracionHablada(minutos: number | null): string | null {
  if (minutos == null || minutos <= 0) return null;
  if (minutos >= 1440) {
    const dias = minutos / 1440;
    return `${fmt(dias)} ${dias === 1 ? 'día' : 'días'}`;
  }
  if (minutos >= 60) {
    const horas = minutos / 60;
    return `${fmt(horas)} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  return `${Math.round(minutos)} min`;
}

// ------------------------------------------------- 1. ¿Dónde se traban?

/**
 * El reparto de lo abierto entre el municipio y el vecino.
 *
 * El veredicto NO lo da la cantidad —una cola de 30 puede ser sanísima en un
 * muni que recibe 30 por día— sino la ANTIGÜEDAD de la más vieja, que es lo
 * único que distingue una cola que corre de una que se pudre.
 */
function preguntaCuellos(c: CuellosTramites, hubo: boolean): PreguntaSemantica | null {
  const u = resolverUmbrales();
  const { abiertas, esperando_vecino: vecino, esperando_municipio: muni } = c;

  const base = {
    id: 'cuellos',
    pregunta: '¿Dónde se traban?',
    icono: Split,
    accion: { label: 'Ver los trámites', to: RUTA_TRAMITES },
  };

  // --- Nada abierto. Un cero que ES la buena noticia: se cuenta en positivo
  // y sin el número (nada de "0 gestiones abiertas").
  //
  // Pero "todas están cerradas" hay que poder AFIRMARLO: sin ninguna gestión
  // en la ventana, la tarjeta estaría felicitando a un mostrador por el que
  // no pasó nadie. Pasa de verdad cuando el admin filtra por una dependencia
  // que todavía no recibió trámites — ahí la pregunta se omite y listo.
  if (abiertas === 0) {
    if (!hubo) return null;
    return {
      ...base,
      tono: 'bueno',
      valor: 'Al día',
      unidad: 'nada quedó trabado',
      detalle: [{ texto: 'Todas las gestiones que entraron al mostrador ya están cerradas.' }],
    };
  }

  // --- Dónde se concentra. Dos guardas: con una sola dependencia decir "la
  // que más acumula" no informa nada (ahí manda el tipo de trámite), y con
  // una sola gestión encima tampoco hay nada acumulado que señalar.
  const candidato: { etiqueta: string; nombre: string; cantidad: number } | null =
    c.dependencias_con_abiertas > 1 && c.top_dependencia
      ? { etiqueta: 'La que más acumula es', ...c.top_dependencia }
      : c.tramites_con_abiertas > 1 && c.top_tramite
        ? { etiqueta: 'El que más acumula es', ...c.top_tramite }
        : null;
  const concentra = candidato && candidato.cantidad > 1 ? candidato : null;

  const detalle: Parte[] = [];
  const gestiones = `${abiertas} ${plural(abiertas, 'gestión abierta', 'gestiones abiertas')}`;

  if (vecino > 0 && muni > 0) {
    const motivos = Object.entries(c.por_estado_vecino)
      .sort((a, b) => b[1] - a[1])
      .map(([estado]) => nombrarMotivo(estado))
      .join(' y ');
    detalle.push(
      { texto: 'De las ' },
      { texto: gestiones, fuerte: true },
      { texto: `, ${muni} ${plural(muni, 'depende', 'dependen')} del municipio y ` },
      { texto: `${vecino} ${plural(vecino, 'espera', 'esperan')} al vecino`, fuerte: true },
      { texto: ` (${motivos}). ` },
    );
  } else if (vecino > 0) {
    // Todo lo abierto está del lado del vecino: el municipio no tiene nada
    // en su cancha, y eso se dice.
    const motivos = Object.entries(c.por_estado_vecino)
      .sort((a, b) => b[1] - a[1])
      .map(([estado]) => nombrarMotivo(estado))
      .join(' y ');
    detalle.push(
      { texto: 'El municipio no tiene nada pendiente: ' },
      { texto: `${plural(vecino, 'la única abierta espera', `las ${vecino} abiertas esperan`)} al vecino`, fuerte: true },
      { texto: ` (${motivos}). ` },
    );
  } else {
    detalle.push(
      { texto: 'Nada trabado del lado del vecino: ' },
      { texto: `${plural(muni, 'la única abierta depende', `las ${muni} abiertas dependen`)} del municipio`, fuerte: true },
      { texto: '. ' },
    );
  }

  if (concentra) {
    detalle.push(
      { texto: `${concentra.etiqueta} ` },
      { texto: concentra.nombre, fuerte: true },
      { texto: `, con ${concentra.cantidad}.` },
    );
  } else if (detalle.length > 0) {
    // Las ramas de arriba dejan el separador listo para la cláusula de
    // concentración. Si no la hubo, ese espacio final sobra.
    const ultima = detalle[detalle.length - 1];
    ultima.texto = ultima.texto.replace(/\s+$/, '');
  }

  // El pie es la vara: sin edad no hay con qué juzgar la cola.
  const dias = c.dias_mas_vieja;
  const pie = dias == null
    ? undefined
    : dias === 0
      ? 'Ninguna lleva más de un día abierta'
      : `La más vieja lleva ${dias} ${plural(dias, 'día', 'días')}`;

  return {
    ...base,
    // El protagonista es el lado que el municipio PUEDE mover. Si no tiene
    // nada propio, el número es el del vecino.
    valor: String(muni > 0 ? muni : vecino),
    unidad: muni > 0
      ? `${plural(muni, 'espera', 'esperan')} al municipio`
      : `${plural(vecino, 'espera', 'esperan')} al vecino`,
    tono: dias == null ? 'info' : (veredictoMasEsPeor(dias, u.diasSinActividad) ?? 'info'),
    detalle: detalle.length > 0 ? detalle : [{ texto: `Hay ${gestiones} en el mostrador.` }],
    pie,
  };
}

// --------------------------------------------- 2. ¿Se cumplen los turnos?

/**
 * El presentismo del turnero, medido SOLO sobre lo que se puede medir.
 *
 * El turno que ya pasó y sigue en 'reservado' no es una falta: es un turno
 * que nadie marcó. Contarlo como ausente inventaría ausentismo; ignorarlo
 * publicaría un porcentaje sobre una base minúscula sin avisar. Por eso,
 * cuando los sin marcar superan a los registrados, el titular de la tarjeta
 * PASA A SER ese agujero — que es el problema real y el que se arregla.
 */
function preguntaTurnos(t: TurnosCircuito): PreguntaSemantica | null {
  const u = resolverUmbrales();
  const base = {
    id: 'turnos',
    pregunta: '¿Se cumplen los turnos?',
    icono: CalendarCheck,
    accion: { label: 'Ver la agenda', to: RUTA_AGENDA },
  };

  // --- Ni turnos pasados ni agendados: la pregunta NO EXISTE. Un "0 turnos"
  // en un muni que no usa el turnero es ruido, no dato.
  if (t.total === 0 && t.proximos === 0) return null;

  const proximosPie = t.proximos > 0
    ? `${t.proximos} ${plural(t.proximos, 'turno por delante', 'turnos por delante')}`
    : undefined;

  // --- Hay agenda hacia adelante pero todavía no pasó ninguno.
  if (t.total === 0) {
    return {
      ...base,
      tono: 'info',
      valor: String(t.proximos),
      unidad: plural(t.proximos, 'turno agendado', 'turnos agendados'),
      detalle: [
        { texto: `En los últimos ${t.dias} días no pasó ningún turno, así que todavía no hay presentismo para medir. ` },
        { texto: `${plural(t.proximos, 'El primero está', 'Los primeros están')} por delante`, fuerte: true },
        { texto: '.' },
      ],
    };
  }

  const registrados = t.presentados + t.ausentes;
  const totalTexto = `${t.total} ${plural(t.total, 'turno', 'turnos')}`;

  // --- Nadie registró nada. Sin base no se inventa un porcentaje.
  if (registrados === 0) {
    if (t.sin_marcar > 0) {
      return {
        ...base,
        tono: 'advertencia',
        valor: String(t.sin_marcar),
        unidad: plural(t.sin_marcar, 'turno sin marcar', 'turnos sin marcar'),
        detalle: [
          {
            texto: t.total === 1
              ? `El único turno que pasó en ${t.dias} días sigue como reservado: `
              : `Los ${totalTexto} que pasaron en ${t.dias} días siguen como reservados: `,
          },
          {
            texto: t.total === 1
              ? 'nadie lo marcó como cumplido ni como ausente'
              : 'nadie los marcó como cumplidos ni como ausentes',
            fuerte: true,
          },
          { texto: ', así que no hay presentismo para medir.' },
        ],
        pie: proximosPie,
      };
    }
    // Todo lo que pasó se canceló antes de la hora.
    return {
      ...base,
      tono: 'info',
      valor: String(t.cancelados),
      unidad: plural(t.cancelados, 'turno cancelado', 'turnos cancelados'),
      detalle: [
        { texto: `${plural(t.cancelados, 'El único turno del período se canceló', `Los ${t.cancelados} turnos del período se cancelaron`)} antes de la hora`, fuerte: true },
        { texto: ', así que no hubo asistencia que medir.' },
      ],
      pie: proximosPie,
    };
  }

  const pct = Math.round((t.presentados / registrados) * 100);
  const registradosTexto = `${registrados} ${plural(registrados, 'turno', 'turnos')} con asistencia registrada`;

  // La coda de las ausencias, con su franja si la franja tiene entidad.
  const codaFalta: Parte[] = t.ausentes > 0
    ? [
        { texto: ' y ' },
        { texto: `${t.ausentes} ${plural(t.ausentes, 'faltó', 'faltaron')}`, fuerte: true },
        { texto: '.' },
      ]
    : [{ texto: ': ' }, { texto: 'no faltó nadie', fuerte: true }, { texto: '.' }];

  const codaFranja: Parte[] =
    t.franja_ausencias && t.franja_ausencias.cantidad >= MIN_AUSENCIAS_PARA_FRANJA
      ? [{ texto: ` La franja que más falla es la de ${franjaHablada(t.franja_ausencias.hora)}.` }]
      : [];

  // --- El agujero pesa más que el dato: los sin marcar son mayoría.
  if (t.sin_marcar > registrados) {
    return {
      ...base,
      tono: 'advertencia',
      valor: String(t.sin_marcar),
      unidad: plural(t.sin_marcar, 'turno sin marcar', 'turnos sin marcar'),
      detalle: [
        { texto: `De los ${totalTexto} que pasaron en ${t.dias} días, ` },
        { texto: `${t.sin_marcar} ${plural(t.sin_marcar, 'nunca se marcó', 'nunca se marcaron')}`, fuerte: true },
        { texto: '. El presentismo del ' },
        { texto: `${pct}%`, fuerte: true },
        { texto: ` sale sólo de los ${registrados} que sí quedaron registrados` },
        ...(t.ausentes > 0
          ? [{ texto: ` (${t.ausentes} ${plural(t.ausentes, 'falta', 'faltas')}).` }]
          : [{ texto: ', sin faltas.' }]),
        ...codaFranja,
      ],
      pie: proximosPie,
    };
  }

  // --- El caso sano: la mayoría de los turnos tiene resultado cargado.
  const detalle: Parte[] = registrados === 1
    ? [
        { texto: 'El único turno con asistencia registrada ' },
        {
          texto: t.presentados === 1 ? 'se presentó' : 'faltó',
          fuerte: true,
        },
        { texto: '.' },
      ]
    : [
        { texto: `De ${registradosTexto}, ` },
        { texto: `${t.presentados} ${plural(t.presentados, 'se presentó', 'se presentaron')}`, fuerte: true },
        ...codaFalta,
      ];
  if (t.sin_marcar > 0) {
    detalle.push({
      texto: t.sin_marcar === 1
        ? ' Otro pasó sin marcar, así que el número real puede ser otro.'
        : ` Otros ${t.sin_marcar} pasaron sin marcar, así que el número real puede ser otro.`,
    });
  }
  if (t.cancelados > 0) {
    detalle.push({
      texto: ` ${plural(t.cancelados, 'Uno más se canceló', `Otros ${t.cancelados} se cancelaron`)} antes de la hora.`,
    });
  }
  detalle.push(...codaFranja);

  return {
    ...base,
    tono: veredictoTasa(pct, u.tasaResolucion) ?? 'info',
    valor: `${pct}%`,
    unidad: 'de presentismo',
    detalle,
    pie: [`${totalTexto} en ${t.dias} días`, proximosPie].filter(Boolean).join(' · '),
  };
}

// ------------------------------------------ 3. ¿Qué trámite duele más?

/**
 * Los tipos de trámite: cuánto tarda cada uno y cuál se pide más.
 *
 * La pregunta CAMBIA según lo que la base permita afirmar. Con tiempos
 * medidos habla de tiempos; sin ellos —porque nada cerró, o porque todo
 * cerró en el acto— habla de volumen, que es un dato duro igual. Lo que no
 * hace nunca es publicar un "0 días" que se leería como "se resuelve al
 * instante" cuando lo único cierto es que no hay con qué medirlo.
 */
function preguntaTipos(t: TiposCircuito): PreguntaSemantica | null {
  const u = resolverUmbrales();
  // Sin un solo tipo con movimiento no hay nada que rankear.
  if (t.items.length === 0 || t.total === 0) return null;

  const accion = { label: 'Ver los trámites', to: RUTA_TRAMITES };
  const cierresMedidos = t.items.reduce((acc, i) => acc + i.cerradas, 0);
  const masPedido = t.items[0];
  const pctTop = Math.round((masPedido.solicitudes / t.total) * 100);

  // --- Hay un trámite que tarda más que el resto: ése es el titular.
  const lento = t.mas_lento;
  const duracion = lento ? duracionHablada(lento.minutos_promedio) : null;
  if (lento && duracion) {
    // El "resto" lo calcula el BACKEND con la misma vara que eligió al más
    // lento (ver `promedio_resto_minutos`). Promediarlo acá por nuestra cuenta
    // daba frases que se contradecían: un tipo con un solo cierre quedaba
    // fuera del ranking por poco fiable y entraba igual en el promedio, así
    // que "el más lento" terminaba siendo más rápido que "el resto".
    const promedioOtros = duracionHablada(t.promedio_resto_minutos);

    const detalle: Parte[] = [
      { texto: lento.nombre, fuerte: true },
      { texto: ` tarda ${duracion} sobre ${lento.cerradas} ${plural(lento.cerradas, 'cierre medido', 'cierres medidos')}` },
      { texto: promedioOtros ? `, contra ${promedioOtros} del resto. ` : '. ' },
    ];
    if (masPedido.tramite_id !== lento.tramite_id) {
      detalle.push(
        { texto: 'El más pedido es ' },
        { texto: masPedido.nombre, fuerte: true },
        { texto: `, con ${masPedido.solicitudes} de ${t.total}.` },
      );
    } else if (t.items.length > 1) {
      detalle.push({ texto: `Encima es el más pedido: ${masPedido.solicitudes} de ${t.total}.` });
    } else {
      // Con un solo tipo con movimiento, "es el más pedido, 10 de 10" es una
      // obviedad disfrazada de ranking.
      detalle.push({ texto: 'Es el único trámite con movimiento en el período.' });
    }

    const diasLento = (lento.minutos_promedio ?? 0) / 1440;
    return {
      id: 'tipos',
      pregunta: '¿Qué trámite duele más?',
      icono: Timer,
      tono: veredictoMenosEsMejor(diasLento, u.tiempoResolucionDias) ?? 'info',
      valor: duracion,
      unidad: 'tarda el más lento',
      detalle,
      pie: `${cierresMedidos} ${plural(cierresMedidos, 'cierre medido', 'cierres medidos')} en ${t.dias} días`,
      accion,
    };
  }

  // --- Sin tiempos que comparar, la pregunta pasa a ser el volumen. El dato
  // que el tablero nunca mostró —qué pide la gente— sigue siendo real.
  const segundo = t.items[1] ?? null;
  const detalle: Parte[] = [
    { texto: masPedido.nombre, fuerte: true },
    { texto: ` se lleva el ${pctTop}% de las ${t.total} ${plural(t.total, 'gestión', 'gestiones')} de ${t.dias} días` },
  ];
  if (segundo) {
    detalle.push(
      { texto: ', seguido de ' },
      { texto: segundo.nombre, fuerte: true },
      { texto: ` (${segundo.solicitudes})` },
    );
  }
  detalle.push({ texto: '. ' });
  detalle.push({
    // Dos motivos distintos para no tener tiempos, dichos distinto: no cerró
    // nada, o cerró todo en el acto. El primero es un dato que falta; el
    // segundo es un dato que existe y da lo mismo para todos.
    texto: cierresMedidos === 0
      ? 'Todavía ninguno cerró con fecha cargada, así que no hay tiempos para comparar.'
      : cierresMedidos === 1
        ? 'El único cierre con fecha se resolvió el mismo día, así que todavía no hay tiempos para comparar.'
        : `Los ${cierresMedidos} cierres se resolvieron el mismo día, así que todavía no hay uno que tarde más que otro.`,
  });

  return {
    id: 'tipos',
    pregunta: '¿Qué trámite piden más?',
    icono: Layers,
    tono: 'info',
    valor: String(masPedido.solicitudes),
    unidad: `de ${t.total} ${plural(t.total, 'gestión', 'gestiones')}`,
    detalle,
    pie: `${t.items.length} ${plural(t.items.length, 'tipo de trámite con movimiento', 'tipos de trámite con movimiento')}`,
    accion,
  };
}

// ------------------------------------------------------------- la sección

/**
 * Las preguntas del circuito de trámites que TIENEN algo que decir, en orden.
 *
 * Devuelve entre 0 y 3: cada una se omite sola cuando su dato no existe (sin
 * turnero no hay pregunta de turnos, sin tipos no hay pregunta de tipos). Con
 * cero preguntas la sección no se dibuja — decidirlo acá y no en el JSX es lo
 * que mantiene boba a la sección.
 */
export function construirPreguntasTramites(
  circuito: TramitesCircuito | null,
): PreguntaSemantica[] {
  if (!circuito) return [];
  // ¿Hubo gestiones que contar? Es lo que habilita a decir "todo cerrado" en
  // vez de omitir la pregunta: sin una sola solicitud en la ventana, "están
  // todas cerradas" felicitaría a un mostrador vacío.
  const hubo = circuito.tipos.total > 0 || circuito.cuellos.abiertas > 0;
  return [
    preguntaCuellos(circuito.cuellos, hubo),
    preguntaTurnos(circuito.turnos),
    preguntaTipos(circuito.tipos),
  ].filter((p): p is PreguntaSemantica => p !== null);
}
