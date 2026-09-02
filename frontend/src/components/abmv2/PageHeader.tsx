/**
 * PageHeader — cabecera de módulo del estándar `SemanticAbmPage` (§0, v2.2).
 *
 *   [EYEBROW EN CAPS]
 *   H1 de 34px que nombra lo que el usuario viene a resolver
 *   Bajada de una o dos líneas: de dónde salen las filas y cómo se ordenan.
 *
 * Es el PRIMER bloque de la página, ARRIBA del hero semántico. Nace de la
 * referencia nueva de Reclamos (design/handoff-v2/references/
 * reclamos-lista-v2.dc.html), que el dueño adoptó como estándar de todos los
 * ABMs: hasta v2.1 el título del módulo vivía dentro del `ListToolbar` y
 * quedaba abajo del hero, pegado al buscador.
 *
 * Agnóstico y presentacional puro: sólo copy, cero datos y cero estado. Los
 * números viven en el hero. `eyebrow` y `description` son opcionales: una
 * pantalla que sólo mande `title` renderiza igual (degrada sin eyebrow ni
 * bajada, sin huecos).
 *
 * [v2.3] EYEBROW ANTI-ECO — la topbar ya muestra la miga de pan "Ámbito /
 * Página", así que un eyebrow que dice lo mismo que el último tramo repite la
 * palabra dos veces en tres centímetros de pantalla ("Reclamos" en la miga y
 * "RECLAMOS" acá abajo). Cuando eso pasa, el eyebrow NO se renderiza. La prop
 * sigue viva a propósito: una pantalla cuyo eyebrow aporte algo distinto lo
 * conserva entero —"CIERRE MENSUAL" sobre un H1 de liquidaciones, o
 * "RECLAMOS DEL ÁREA" cuando la miga dice sólo "Reclamos"—. La comparación es
 * por texto NORMALIZADO (sin tildes, minúsculas, espacios colapsados), así
 * "Órdenes de Pago" y "ordenes  de pago" cuentan como el mismo eco.
 *
 * El eco sólo cuenta si la miga se está VIENDO (`migas.visible`): en mobile no
 * hay topbar, así que ahí el eyebrow se conserva — esconder algo por un eco
 * invisible es perder información. Y fuera del `MigasProvider` (tests,
 * pantallas sin shell) `useMigas()` devuelve null: el eyebrow se renderiza
 * siempre, nunca se esconde por accidente.
 *
 * Estilos: clases `av2-pagehead-*` (styles/abmv2.css, sección [PAGEHEAD])
 * sobre tokens `--pl-*`. Cero colores fijos, cero estilos inline.
 */
import { useMigas } from '../../contexts/migas';
import { normalizarTexto } from '../shell/rutas';
import type { PageHeaderProps } from './types';

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  const migas = useMigas();
  const ecoDeLaMiga =
    !!eyebrow &&
    !!migas &&
    migas.visible &&
    normalizarTexto(eyebrow) === normalizarTexto(migas.pagina);
  const mostrarEyebrow = !!eyebrow && !ecoDeLaMiga;

  return (
    <header className="av2-pagehead">
      {/* Caps por CSS (text-transform): la página pasa texto natural y el
          lector de pantalla no deletrea. */}
      {mostrarEyebrow && <span className="av2-pagehead-eyebrow">{eyebrow}</span>}
      <h1 className="av2-pagehead-titulo">{title}</h1>
      {description && <p className="av2-pagehead-bajada">{description}</p>}
    </header>
  );
}

export default PageHeader;
