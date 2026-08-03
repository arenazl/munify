/**
 * SemanticHero — "hero semántico" del rediseño v2 (Claude Design).
 *
 * Reemplaza los hints/banners estáticos de las pantallas por una FRASE con
 * información DINÁMICA de esa pantalla, coloreada por VEREDICTO:
 *   bueno → acento del theme · advertencia → ámbar · malo → rojo
 * Soporta varias frases (carrusel con puntos + flechas), cada una con SUS
 * PROPIAS acciones (hasta 3), y un strip de KPIs opcional.
 *
 * ES EL ÚNICO HERO de la app: el estándar `SemanticAbmPage` usa ESTE
 * componente con la clase de contexto `av2-hero`, que en styles/abmv2.css
 * ([PAGE]) aplica la variante de layout de la referencia nueva. No hay —ni
 * debe haber— un segundo componente de hero.
 *
 * AGNÓSTICO: no sabe de reclamos, trámites ni de ningún dominio. Recibe
 * frases ya armadas y las muestra. Sirve igual para una fábrica de tornillos
 * que para un municipio; lo único que cambia es quién arma las frases.
 *
 * ALTURA ESTABLE (sin JS): todas las frases se renderizan apiladas en la
 * misma celda de un grid, y las inactivas quedan con `visibility: hidden`
 * — siguen ocupando su lugar, así que el alto del bloque es SIEMPRE el de la
 * frase más larga y el carrusel no pega saltos al rotar. Se prefiere esto a
 * medir el nodo con JS: medir el nodo real lo hace colapsar, dejar de
 * desbordar, volver y parpadear para siempre.
 *
 * ROTACIÓN: con 2+ frases rota sola cada `intervaloMs` (10 s por defecto),
 * con transición de slide. Se PAUSA sola cuando el mouse está encima o algo
 * adentro tiene el foco — nadie pierde el renglón que estaba leyendo ni el
 * botón que iba a apretar. Con `prefers-reduced-motion` no se desplaza (sólo
 * funde) y no rota sola.
 *
 * Polimórfico: estilos en styles/semantic-hero.css sobre tokens --pl-*
 * (derivados del theme activo por ThemeContext) — funciona en todos los
 * presets y marcas. Sin colores fijos, sin estilos inline.
 *
 * Uso:
 *   <SemanticHero
 *     etiqueta="RECLAMOS · HOY"
 *     frases={[{
 *       segmentos: [
 *         seg('Se resolvieron '), seg('12 reclamos', 'bueno'),
 *         seg(' esta semana, pero '), seg('3 vencen hoy', 'advertencia'), seg('.'),
 *       ],
 *       acciones: [{ label: 'Ver vencimientos', to: '/gestion/sla', primaria: true }],
 *     }]}
 *   />
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type HeroFrase, type HeroKpi, veredictoDominante } from '../../lib/semanticHero';

/** Cada cuánto pasa a la frase siguiente cuando hay más de una. */
const INTERVALO_ROTACION_MS = 10_000;

interface SemanticHeroProps {
  /** Etiqueta del módulo, en caps (ej: "RECLAMOS · HOY"). */
  etiqueta: string;
  /** Una o más frases; con 2+ aparece el carrusel. Vacío → no renderiza. */
  frases: HeroFrase[];
  /** Strip de KPIs opcional (estilo mockup): eyebrow + número display + sub.
   *  Regla del estándar: el hero va SIEMPRE primero en la página con sus KPIs
   *  adentro (orden: frase → KPIs → acciones); nada de filas de KPI sueltas. */
  kpis?: HeroKpi[];
  /** Cada cuánto rota. Por defecto 10 s. */
  intervaloMs?: number;
  /** Cortar la rotación automática (las flechas y los puntos siguen andando). */
  sinAutoRotacion?: boolean;
  className?: string;
}

/** ¿El visitante pidió menos movimiento? Entonces no se desplaza ni rota solo. */
function usaMenosMovimiento(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * El dato, girando como las fichas de un tablero de estación.
 *
 * Gira SÓLO lo veredictado —los números—, no la frase entera, por dos motivos:
 * el texto se puede leer desde el primer instante (con toda la frase girando
 * queda ilegible casi medio segundo, y esta es una pantalla que alguien mira
 * todo el día), y los números SON lo que cambia entre una frase y otra: que
 * giren justo ellos no es un adorno, está diciendo "esto es lo que se
 * actualizó".
 *
 * Accesibilidad: el texto se parte en caracteres sólo para la vista. El span
 * de afuera lleva el valor entero como `aria-label` y las fichas quedan
 * ocultas para los lectores de pantalla, que si no deletrearían "1", "1", "8".
 */
function SegmentoTablero({ texto, veredicto }: { texto: string; veredicto: string }) {
  return (
    <span className={`sh-seg--${veredicto} sh-tablero`} aria-label={texto}>
      {[...texto].map((caracter, i) =>
        caracter === ' ' ? (
          ' '
        ) : (
          <span
            key={i}
            className="sh-ficha"
            aria-hidden="true"
            // El retardo en cascada hace que las fichas caigan una detrás de
            // otra, como en el tablero real, en vez de todas de golpe.
            style={{ animationDelay: `${i * 26}ms` }}
          >
            {caracter}
          </span>
        ),
      )}
    </span>
  );
}

export function SemanticHero({
  etiqueta,
  frases,
  kpis,
  intervaloMs = INTERVALO_ROTACION_MS,
  sinAutoRotacion,
  className,
}: SemanticHeroProps) {
  const [idx, setIdx] = useState(0);
  // Hacia dónde entra la frase nueva: define de qué lado aparece el slide.
  const [sentido, setSentido] = useState<'adelante' | 'atras'>('adelante');
  const [detenido, setDetenido] = useState(false);
  // useState con inicializador perezoso, no useRef: la preferencia se lee una
  // sola vez al montar y leer `.current` durante el render está prohibido.
  const [menosMovimiento] = useState(usaMenosMovimiento);

  const validas = frases.filter((f) => f.segmentos.length > 0);
  const total = validas.length;
  const varias = total > 1;

  const ir = useCallback(
    (destino: number, desde: number) => {
      if (total === 0) return;
      const siguiente = ((destino % total) + total) % total;
      setSentido(siguiente === desde ? 'adelante' : siguiente > desde ? 'adelante' : 'atras');
      setIdx(siguiente);
    },
    [total],
  );

  // Rotación automática. Depende de `idx` a propósito: cada avance —también el
  // manual— reinicia la cuenta, así una frase recién elegida se ve entera.
  useEffect(() => {
    if (!varias || detenido || sinAutoRotacion || menosMovimiento) return;
    const t = window.setTimeout(() => {
      setSentido('adelante');
      setIdx((i) => (i + 1) % total);
    }, intervaloMs);
    return () => window.clearTimeout(t);
  }, [idx, varias, detenido, sinAutoRotacion, menosMovimiento, intervaloMs, total]);

  if (total === 0) return null;

  const actual = Math.min(idx, total - 1);

  // TONO de la card = veredicto de la frase que se está leyendo. Tiñe el
  // gradiente de arriba y la barra izquierda, y cambia al rotar el carrusel:
  // si la frase que entra habla de vencidos, el hero entero se pone en rojo.
  // Sin veredicto la card no lleva clase y el CSS cae al acento del theme.
  const tono = veredictoDominante(validas[actual]);

  return (
    <section
      className={`sh-card pl-tinte-tono ${tono ? `sh-card--${tono}` : ''} ${className || ''}`}
      aria-label={etiqueta}
      onMouseEnter={() => setDetenido(true)}
      onMouseLeave={() => setDetenido(false)}
      onFocusCapture={() => setDetenido(true)}
      onBlurCapture={() => setDetenido(false)}
    >
      <div className="sh-head">
        <span className="sh-etiqueta">{etiqueta}</span>
        {varias && (
          <div className="sh-controles">
            {validas.map((f, i) => {
              const v = veredictoDominante(f);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Frase ${i + 1} de ${total}`}
                  aria-current={i === actual}
                  className={`sh-dot ${v ? `sh-dot--${v}` : ''} ${i === actual ? 'sh-dot--activo' : ''}`}
                  onClick={() => ir(i, actual)}
                />
              );
            })}
            <button type="button" aria-label="Anterior" className="sh-nav" onClick={() => ir(actual - 1, actual)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Siguiente" className="sh-nav" onClick={() => ir(actual + 1, actual)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Pila: todas las frases en la misma celda. Las inactivas siguen
          ocupando lugar (visibility, no display) — de ahí sale la altura
          estable, sin medir nada. */}
      <div className={`sh-stack sh-stack--${sentido}`} aria-live="polite">
        {validas.map((frase, i) => (
          <div
            key={i}
            className={`sh-slide ${i === actual ? 'sh-slide--activo' : ''}`}
            aria-hidden={i !== actual}
          >
            <p className="sh-frase">
              {frase.segmentos.map((s, j) =>
                s.veredicto ? (
                  // La `key` lleva el slide activo A PROPÓSITO: al cambiar,
                  // React remonta la ficha y el navegador vuelve a lanzar la
                  // animación. Con una key fija (`j`) el nodo se reutiliza, la
                  // regla CSS ya estaba aplicada y el giro sólo se veía la
                  // primera vuelta — después el número cambiaba de golpe.
                  <SegmentoTablero key={`${actual}-${j}`} texto={s.texto} veredicto={s.veredicto} />
                ) : (
                  <span key={j}>{s.texto}</span>
                ),
              )}
            </p>

          </div>
        ))}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="sh-kpis">
          {kpis.map((k, i) => (
            <div key={i} className="sh-kpi">
              <span className="sh-kpi-etiqueta">{k.etiqueta}</span>
              <span className={`sh-kpi-valor ${k.veredicto ? `sh-kpi-valor--${k.veredicto}` : ''}`}>
                {k.valor}
              </span>
              {k.sub && <span className="sh-kpi-sub">{k.sub}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Acciones ABAJO del strip de KPIs (diseño 2026-08-02): cierran la
          tarjeta como fila de CTAs. Son DE la frase activa, así que van en
          una pila espejada con la de frases — misma celda de grid,
          visibility para altura estable y fundido al rotar. */}
      {validas.some((f) => f.acciones && f.acciones.length > 0) && (
        <div className={`sh-stack sh-stack--${sentido} sh-pie`}>
          {validas.map((frase, i) => (
            <div
              key={i}
              className={`sh-slide ${i === actual ? 'sh-slide--activo' : ''}`}
              aria-hidden={i !== actual}
            >
              {frase.acciones && frase.acciones.length > 0 && (
                <div className="sh-acciones">
                  {frase.acciones.slice(0, 3).map((a, j) =>
                    a.to ? (
                      <Link key={j} to={a.to} className={`sh-accion ${a.primaria ? 'sh-accion--primaria' : ''}`}>
                        {a.label}
                      </Link>
                    ) : (
                      <button
                        key={j}
                        type="button"
                        onClick={a.onClick}
                        className={`sh-accion ${a.primaria ? 'sh-accion--primaria' : ''}`}
                      >
                        {a.label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
