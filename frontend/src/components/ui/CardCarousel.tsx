/**
 * CardCarousel — carrusel de cards de ALTURA FIJA del KIT.
 *
 * AGNÓSTICO: es un componente del framework, no de esta app. No sabe qué
 * muestra (reseñas, productos, próximos turnos, novedades…): recibe
 * `children` y los pagina. Cero lógica de dominio, cero colores fijos — los
 * estilos viven en styles/card-carousel.css sobre tokens --pl-*.
 *
 * Las dos reglas que lo definen:
 *
 * 1. ALTURA FIJA. El carrusel NUNCA crece con el contenido: su alto lo manda
 *    quien lo usa (prop `height`, o el alto del contenedor si no viene) y las
 *    cards se recortan dentro (`overflow: hidden` en cada slide). Así una
 *    sección puede tener un bloque que "manda" la altura y el carrusel al
 *    lado sin que la card entera se estire ni queden huecos.
 *
 * 2. CUÁNTAS ENTRAN, NO CUÁNTAS DIJIMOS. Las cards por vista se calculan
 *    midiendo el ANCHO REAL disponible (`ResizeObserver` sobre el viewport)
 *    contra `minCardWidth` — mismo criterio que el AdaptiveFilter: se mide el
 *    contenedor, no se adivina por breakpoints. Un contenedor de 900px con
 *    `minCardWidth=275` muestra 3; el mismo componente en 550px muestra 2.
 *    Sin loop de realimentación posible: el ancho del viewport (flex/absolute
 *    dentro de su contenedor) NO depende de cuántas cards se dibujen.
 *
 * Detalles de comportamiento:
 *   - El desplazamiento es por PÁGINA (N cards), pero se recorta para que la
 *     última página termine al ras del borde derecho: nunca se ve media card
 *     ni un hueco al final.
 *   - Si entran todas (`total <= porVista`) la navegación NO se dibuja.
 *   - Accesible: `role="group"` + `aria-roledescription`, flechas y puntos con
 *     etiqueta, flechas de teclado, y si el foco cae en una card fuera de vista
 *     el carrusel salta a su página (el foco jamás desplaza el viewport a mano).
 *   - `prefers-reduced-motion`: sin transición (ver el CSS).
 *
 * Inline SOLO valores runtime, y como custom properties (no estilos sueltos):
 * ancho de slide y desplazamiento en px, que salen de la medición.
 */
import {
  Children,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CardCarouselProps {
  /** Las cards. Cada hijo se envuelve en un slide de ancho calculado. */
  children: ReactNode;
  /** Ancho mínimo legible de una card, en px. Define cuántas entran por vista. */
  minCardWidth?: number;
  /** Separación entre cards, en px. */
  gap?: number;
  /** Alto del carrusel: número (px) o cualquier medida CSS. Sin prop, toma el
   *  100% del contenedor (que es quien manda la altura). */
  height?: number | string;
  /** Etiqueta accesible del grupo: obligatoria, el carrusel no sabe qué muestra. */
  ariaLabel: string;
  className?: string;
}

/** Colchón (px) contra redondeos subpíxel al calcular cuántas entran. */
const SEGURIDAD = 1;

const medidaCss = (v: number | string | undefined): string | undefined =>
  v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;

export function CardCarousel({
  children,
  minCardWidth = 240,
  gap = 12,
  height,
  ariaLabel,
  className,
}: CardCarouselProps) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const total = items.length;

  const viewportRef = useRef<HTMLDivElement>(null);
  // 0 = todavía sin medir. El layout effect corre antes del primer paint,
  // así que nunca se llega a pintar el estado sin medir.
  const [ancho, setAncho] = useState(0);
  const [pagina, setPagina] = useState(0);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      // Mismo valor ⇒ mismo objeto de estado ⇒ React corta el re-render.
      setAncho((previo) => (Math.abs(previo - w) < 0.5 ? previo : w));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cuántas cards entran de verdad en el ancho medido (nunca menos de 1, y
  // nunca más de las que hay: si sobran columnas las cards se ensanchan en
  // vez de dejar un hueco).
  const porVista = useMemo(() => {
    if (ancho <= 0 || total === 0) return 1;
    const cabe = Math.floor((ancho + gap - SEGURIDAD) / (minCardWidth + gap));
    return Math.max(1, Math.min(cabe, total));
  }, [ancho, gap, minCardWidth, total]);

  const paginas = Math.max(1, Math.ceil(total / porVista));
  const hayNav = total > porVista;

  // Si al achicar la ventana la página vigente dejó de existir, se recorta EN
  // EL RENDER (no en un efecto: eso encadenaría un render de más).
  const paginaVigente = Math.min(pagina, paginas - 1);

  // Desplazamiento en cantidad de slides, recortado para que la última
  // página termine al ras (sin hueco ni media card).
  const corrimiento = Math.max(0, Math.min(paginaVigente * porVista, total - porVista));
  const anchoSlide = ancho > 0 ? (ancho - (porVista - 1) * gap) / porVista : 0;

  const vars = {
    '--cc-gap': `${gap}px`,
    '--cc-slide': anchoSlide > 0 ? `${anchoSlide}px` : '100%',
    '--cc-offset': `${corrimiento * (anchoSlide + gap)}px`,
    '--cc-h': medidaCss(height),
  } as CSSProperties;

  const ir = useCallback(
    (delta: number) => setPagina(Math.max(0, Math.min(paginaVigente + delta, paginas - 1))),
    [paginaVigente, paginas],
  );

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      ir(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      ir(-1);
    }
  };

  // Si el foco (tab) cae en una card que no está a la vista, se navega hasta
  // ella. El viewport nunca se desplaza solo: el movimiento es del track.
  const alFoco = (e: FocusEvent<HTMLDivElement>) => {
    const slide = (e.target as HTMLElement).closest?.('[data-cc-slide]');
    if (viewportRef.current) viewportRef.current.scrollLeft = 0;
    if (!slide) return;
    const i = Number(slide.getAttribute('data-cc-slide'));
    if (!Number.isFinite(i)) return;
    const destino = Math.min(Math.floor(i / porVista), paginas - 1);
    setPagina((p) => (p === destino ? p : destino));
  };

  if (total === 0) return null;

  return (
    <div
      className={`cc${className ? ` ${className}` : ''}`}
      style={vars}
      role="group"
      aria-roledescription="carrusel"
      aria-label={ariaLabel}
      tabIndex={hayNav ? 0 : undefined}
      onKeyDown={hayNav ? alTeclado : undefined}
    >
      <div className="cc-viewport" ref={viewportRef} onFocus={alFoco}>
        <div className="cc-track">
          {items.map((hijo, i) => (
            <div
              key={isValidElement(hijo) && hijo.key != null ? hijo.key : i}
              className="cc-slide"
              data-cc-slide={i}
            >
              {hijo}
            </div>
          ))}
        </div>
      </div>

      {hayNav && (
        <div className="cc-nav">
          <span className="cc-dots">
            {Array.from({ length: paginas }, (_, p) => (
              <button
                key={p}
                type="button"
                className={`cc-dot${p === paginaVigente ? ' cc-dot--activo' : ''}`}
                aria-label={`Grupo ${p + 1} de ${paginas}`}
                aria-current={p === paginaVigente}
                onClick={() => setPagina(p)}
              />
            ))}
          </span>
          <button
            type="button"
            className="cc-flecha cc-flecha--prev"
            onClick={() => ir(-1)}
            disabled={paginaVigente === 0}
            aria-label="Anteriores"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="cc-flecha cc-flecha--sig"
            onClick={() => ir(1)}
            disabled={paginaVigente >= paginas - 1}
            aria-label="Siguientes"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default CardCarousel;
