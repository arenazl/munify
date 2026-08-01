/**
 * ConsultaGuiada — patrón universal del KIT: "elegí una PREGUNTA, el sistema
 * te contesta".
 *
 * AGNÓSTICO: no sabe de mapas, ni de reclamos, ni de ningún dominio. Sirve
 * igual para "¿dónde se repiten los reclamos?" que para "¿qué clientes
 * dejaron de comprar en los últimos 90 días?". Todo entra por props y los
 * estilos viven en styles/consulta-guiada.css sobre tokens --pl-*.
 *
 * POR QUÉ EXISTE
 * Una barra de herramientas ofrece CAPACIDADES con nombre técnico (capa,
 * calor, hotspots, time-lapse) que sólo entiende quien construyó la pantalla.
 * Una consulta guiada ofrece PREGUNTAS en el idioma del que trabaja, y el
 * sistema decide qué herramienta usar para contestarlas. El usuario no elige
 * "heatmap": elige "dónde se repiten".
 *
 * ANATOMÍA
 *
 *   ¿QUÉ QUERÉS VER?  [Dónde se repiten] [Lo atrasado] [Qué resolvimos]   ver todo
 *
 *   ▲ 5 esquinas concentran 30 reclamos: 6 de cada 10 del período.
 *   ────────────────────────────────────────────────────────────────
 *   Mostrame dónde se repiten los reclamos de [Higiene ▾] en [Julio ▾] ▶ …y cómo
 *   [herramienta] [herramienta] [herramienta]
 *
 * Tres momentos, en ese orden y con esa jerarquía: PREGUNTO → ME CONTESTA →
 * REFINO. La respuesta va ARRIBA de la oración y es lo que más pesa del
 * bloque: es lo que le enseña al usuario qué está mirando. La oración queda
 * abajo, separada por un hairline, porque es el ajuste fino — se toca después
 * de leer la respuesta, no antes.
 *
 *   1. las PREGUNTAS (una activa a la vez, o ninguna si se eligió "ver todo");
 *   2. la RESPUESTA, una línea corta en el mismo idioma, con los números
 *      veredictados (la calcula quien usa el componente: acá no hay ni una
 *      regla de negocio). El icono es el de la pregunta activa y toma el
 *      matiz del primer tramo veredictado — nunca un bullet decorativo;
 *   3. la ORACIÓN, que se arma sola desde la `plantilla` de la pregunta
 *      activa: los tramos con fondo son los FILTROS (se tocan y se abren) y
 *      el resto es texto plano. Se lee de corrido.
 *
 * PLANTILLA
 * Texto con marcadores `{id}`. Cada marcador se reemplaza por el filtro con
 * ese `id`; el marcador reservado `{pregunta}` se reemplaza por la etiqueta
 * de la pregunta activa, resaltada. Un filtro cuyo marcador NO aparece en la
 * plantilla simplemente no se muestra: cada pregunta decide qué filtros tienen
 * sentido para ella (preguntar "lo atrasado en los últimos 7 días" no
 * significa nada, así que esa plantilla no lleva el marcador del período).
 *
 * OPCIONES DEL FILTRO = TEXTO DE LA ORACIÓN. El label de cada opción es lo que
 * se LEE dentro de la frase, así que se escribe en minúscula y en el caso
 * gramatical que corresponda ("cualquier categoría", "los últimos 30 días").
 * La opción "sin acotar" es una opción más, con `value: ''`.
 *
 * RESPONSIVE: la oración es texto corriente (los combos son `inline-flex`), así
 * que envuelve como un párrafo normal y nunca se corta un combo al medio. Las
 * herramientas del costado pierden el label antes de desaparecer.
 */
import type { CSSProperties, ReactNode } from 'react';
import { CornerDownRight, type LucideIcon } from 'lucide-react';
import { ModernSelect } from './ModernSelect';
import '../../styles/consulta-guiada.css';

/** Matiz semántico de un tramo de la respuesta. */
export type ConsultaTono = 'bueno' | 'advertencia' | 'malo' | 'neutro';

export interface ConsultaOpcion {
  /** '' = la opción "sin acotar" (siempre conviene que exista). */
  value: string;
  /** Lo que se LEE en la oración y en el desplegable. */
  label: string;
  /** Tinte opcional del valor (dato del dominio, ej: color de un estado). */
  color?: string;
}

/** Un control embebido en la oración. */
export interface ConsultaFiltro {
  /** Marcador `{id}` que ocupa dentro de la plantilla. */
  id: string;
  /** Nombre del filtro (accesibilidad y placeholder si no matchea opción). */
  etiqueta: string;
  /** Valor activo; '' = sin acotar. */
  valor: string;
  opciones: ConsultaOpcion[];
  onChange: (value: string) => void;
  /** Buscador dentro del desplegable (listas largas). */
  buscable?: boolean;
  /** Ancho mínimo del combo, en px. Sin esto, un valor corto deja un
   *  desplegable angosto donde no se leen las opciones largas. */
  anchoMin?: number;
}

export interface ConsultaPregunta {
  id: string;
  /** Lo que se lee en la píldora. */
  etiqueta: string;
  /** Con qué se reemplaza `{pregunta}` DENTRO de la oración. Por defecto la
   *  etiqueta; se declara aparte porque la píldora arranca en mayúscula y en
   *  medio de una frase eso está mal escrito ("Mostrame Lo atrasado:"). */
  enfasis?: string;
  /** Oración con marcadores. Ver "PLANTILLA" en la cabecera. */
  plantilla: string;
  /** Explicación al pasar el mouse (opcional). */
  ayuda?: string;
  icono?: LucideIcon;
}

/** Herramienta del costado: no filtra, hace algo. */
export interface ConsultaAccion {
  id: string;
  /** Texto visible. Vacío = el botón queda redondo, sólo con su ícono. */
  label: string;
  /** Nombre accesible cuando no hay label (title + aria-label). */
  titulo?: string;
  icono?: LucideIcon;
  activo?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Tramo de la respuesta, con su veredicto. */
export interface ConsultaSegmento {
  texto: string;
  tono?: ConsultaTono;
}

export interface ConsultaGuiadaProps {
  /** Rótulo de la fila de preguntas ("¿QUÉ QUERÉS VER EN EL MAPA?"). */
  titulo: string;
  preguntas: ConsultaPregunta[];
  /** Id de la pregunta activa; '' = ninguna (ver todo). */
  valor: string;
  onChange: (id: string) => void;
  filtros: ConsultaFiltro[];
  /** Línea de respuesta: nodo libre o tramos con veredicto. */
  respuesta?: ReactNode | ConsultaSegmento[];
  /** Herramientas: NO filtran ni son parte de la consulta, así que viven en su
   *  propia línea debajo de la oración — nunca al costado, donde le comerían
   *  el ancho y la partirían en dos renglones. */
  acciones?: ConsultaAccion[];
  /** Acción que CONTINÚA la oración ("…y cómo fue apareciendo"). */
  continuacion?: ConsultaAccion;
  /** Salida discreta al lado de las preguntas: limpia la selección. */
  verTodo?: {
    /** Texto del enlace ("ver todo"). */
    label: string;
    /** Oración cuando no hay pregunta activa. */
    plantilla: string;
    /** Con qué se reemplaza `{pregunta}` en esa plantilla. */
    enfasis?: string;
  };
  className?: string;
}

// =====================================================================
// Armado de la oración
// =====================================================================
type Parte = { tipo: 'texto'; texto: string } | { tipo: 'marca'; id: string };

const MARCADOR = /\{([a-zA-Z0-9_]+)\}/g;

/** Parte la plantilla en texto plano y marcadores, conservando el orden. */
function partirPlantilla(plantilla: string): Parte[] {
  const partes: Parte[] = [];
  let ultimo = 0;
  for (const m of plantilla.matchAll(MARCADOR)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ tipo: 'texto', texto: plantilla.slice(ultimo, i) });
    partes.push({ tipo: 'marca', id: m[1] });
    ultimo = i + m[0].length;
  }
  if (ultimo < plantilla.length) partes.push({ tipo: 'texto', texto: plantilla.slice(ultimo) });
  return partes;
}

/** ¿La respuesta vino como tramos veredictados o como nodo libre? */
function esSegmentos(r: ReactNode | ConsultaSegmento[] | undefined): r is ConsultaSegmento[] {
  return (
    Array.isArray(r) &&
    r.length > 0 &&
    r.every((s) => typeof s === 'object' && s !== null && typeof (s as ConsultaSegmento).texto === 'string')
  );
}

export function ConsultaGuiada({
  titulo,
  preguntas,
  valor,
  onChange,
  filtros,
  respuesta,
  acciones,
  continuacion,
  verTodo,
  className,
}: ConsultaGuiadaProps) {
  const activa = preguntas.find((p) => p.id === valor) ?? null;
  const plantilla = activa ? activa.plantilla : (verTodo?.plantilla ?? '');
  const enfasis = activa ? (activa.enfasis ?? activa.etiqueta) : (verTodo?.enfasis ?? '');
  const partes = plantilla ? partirPlantilla(plantilla) : [];
  const porId = new Map(filtros.map((f) => [f.id, f]));

  // La respuesta se marca con el icono de la pregunta que contesta y toma el
  // matiz de su primer tramo veredictado: el ojo sabe si son buenas o malas
  // noticias antes de terminar de leer.
  const IconoRespuesta = activa?.icono ?? CornerDownRight;
  const tonoRespuesta = esSegmentos(respuesta)
    ? respuesta.find((s) => s.tono && s.tono !== 'neutro')?.tono
    : undefined;
  const hayRespuesta = respuesta != null && respuesta !== false;

  return (
    <section className={`cg ${className || ''}`} aria-label={titulo}>
      {/* 1 · Las preguntas */}
      <div className="cg-cabecera">
        <span className="cg-rotulo">{titulo}</span>
        <div className="cg-preguntas" role="group" aria-label={titulo}>
          {preguntas.map((p) => {
            const Icono = p.icono;
            const esActiva = p.id === valor;
            return (
              <button
                key={p.id}
                type="button"
                className={`cg-pregunta${esActiva ? ' cg-pregunta--activa' : ''}`}
                aria-pressed={esActiva}
                title={p.ayuda}
                onClick={() => onChange(p.id)}
              >
                {Icono && <Icono className="cg-pregunta-icono" aria-hidden />}
                {p.etiqueta}
              </button>
            );
          })}
        </div>
        {verTodo && (
          <button
            type="button"
            className={`cg-vertodo${valor === '' ? ' cg-vertodo--activa' : ''}`}
            aria-pressed={valor === ''}
            onClick={() => onChange('')}
          >
            {verTodo.label}
          </button>
        )}
      </div>

      {/* 2 · La RESPUESTA: lo que más pesa del bloque. Va antes de la oración
             a propósito — primero se lee qué pasa, después se refina. */}
      {hayRespuesta && (
        <p
          className={`cg-respuesta${tonoRespuesta ? ` cg-respuesta--${tonoRespuesta}` : ''}`}
          role="status"
          aria-live="polite"
        >
          <IconoRespuesta className="cg-respuesta-icono" aria-hidden />
          <span className="cg-respuesta-texto">
            {esSegmentos(respuesta)
              ? respuesta.map((s, i) => (
                  <span key={i} className={s.tono ? `cg-seg cg-seg--${s.tono}` : undefined}>
                    {s.texto}
                  </span>
                ))
              : (respuesta as ReactNode)}
          </span>
        </p>
      )}

      {/* 3 · La oración (los tramos con fondo SON los filtros) */}
      {partes.length > 0 && (
        <div className="cg-consulta">
          {/* La oración es un <div>, no un <p>: adentro viven los combos (que
              renderizan un <div>) y un <p> no puede contener flujo. */}
          <div className="cg-oracion">
            {partes.map((parte, i) => {
              if (parte.tipo === 'texto') {
                // Nunca se corta el renglón ENTRE la preposición y su combo
                // ("a cargo de" arriba y el combo abajo se lee entrecortado):
                // el último espacio antes de un control es duro.
                const siguiente = partes[i + 1];
                const pegaConControl =
                  siguiente?.tipo === 'marca' &&
                  (siguiente.id === 'pregunta' || porId.has(siguiente.id));
                return pegaConControl ? parte.texto.replace(/ $/, ' ') : parte.texto;
              }
              if (parte.id === 'pregunta') {
                return (
                  <strong key={`e-${i}`} className="cg-enfasis">
                    {enfasis}
                  </strong>
                );
              }
              const filtro = porId.get(parte.id);
              // Marcador sin filtro: se muestra tal cual para que el error de
              // plantilla se VEA (nunca se traga en silencio).
              if (!filtro) return `{${parte.id}}`;
              return (
                <span
                  key={`f-${filtro.id}-${i}`}
                  className="cg-combo-wrap"
                  style={
                    filtro.anchoMin
                      ? ({ '--cg-combo-min': `${filtro.anchoMin}px` } as CSSProperties)
                      : undefined
                  }
                >
                  <ModernSelect
                    variant="v2"
                    className="cg-combo"
                    value={filtro.valor}
                    onChange={filtro.onChange}
                    options={filtro.opciones}
                    placeholder={filtro.etiqueta}
                    searchable={filtro.buscable}
                    abbreviate={false}
                  />
                </span>
              );
            })}
            {continuacion && (
              /* Sin `label` el botón queda REDONDO, sólo con su ícono. Un
                 botón con texto largo metido dentro de la oración competía
                 con la frase y en tablet se le encimaba: el play se explica
                 solo, y el nombre queda en el title y en el aria-label para
                 quien lo necesite. Cuando hay algo que decir —el rango que se
                 está reproduciendo— vuelve el texto. */
              <button
                type="button"
                className={
                  `cg-continuacion${continuacion.activo ? ' cg-continuacion--activa' : ''}` +
                  (continuacion.label ? '' : ' cg-continuacion--icono')
                }
                onClick={continuacion.onClick}
                disabled={continuacion.disabled}
                title={continuacion.titulo || continuacion.label}
                aria-label={continuacion.titulo || continuacion.label}
              >
                {continuacion.icono && <continuacion.icono className="cg-continuacion-icono" aria-hidden />}
                {continuacion.label}
              </button>
            )}
          </div>

          {acciones && acciones.length > 0 && (
            <div className="cg-acciones">
              {acciones.map((a) => {
                const Icono = a.icono;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`cg-accion${a.activo ? ' cg-accion--activa' : ''}`}
                    onClick={a.onClick}
                    disabled={a.disabled}
                    aria-pressed={a.activo}
                    title={a.label}
                  >
                    {Icono && <Icono className="cg-accion-icono" aria-hidden />}
                    <span className="cg-accion-label">{a.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default ConsultaGuiada;
