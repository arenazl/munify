/**
 * PantallaDeAjuste — la cáscara común de una subpestaña de Configuración.
 *
 * POR QUÉ EXISTE: los ajustes que no son listas (los datos del municipio, el
 * QR, Apariencia, WhatsApp, IA) se maquetaban cada uno su propio encabezado
 * con `PanelHeader`, que era un `SemanticHero` rehecho a mano — mismo dibujo,
 * otro código, y con `dangerouslySetInnerHTML` para el veredicto. Resultado:
 * dos piezas que hay que mantener sincronizadas para que la pantalla 4 se
 * parezca a la 5.
 *
 * Acá entra el hero DE VERDAD, en `size="simple"`: la misma barra teñida por
 * veredicto y la misma frase que el resto del módulo, sin la stat strip que
 * estas pantallas no tienen con qué llenar. El cuerpo va como children.
 *
 * Las subpestañas que SÍ son listas siguen por `SemanticAbmPage`, que ya usa
 * el mismo hero adentro. Así las ocho pestañas comparten pieza, no parecido.
 */
import type { ReactNode } from 'react';
import { SemanticHero } from '../ui/SemanticHero';
import { seg } from '../../lib/semanticHero';
import type { Veredicto } from '../../lib/semanticHero';

export interface PantallaDeAjusteProps {
  /** Caps, arriba del todo: "GENERAL · IDENTIDAD". */
  eyebrow: string;
  /** Qué dice esta pantalla, en prosa. Es el veredicto, no una descripción. */
  veredicto: string;
  /**
   * Tramo del veredicto que lleva el color, si hay algo que marcar. Tiene que
   * ser un fragmento EXACTO de `veredicto`; si no aparece, se ignora y la
   * frase queda neutra (nunca se rompe el texto).
   */
  resaltado?: string;
  /** Qué tan grave es lo resaltado. Sin esto el hero va en color de marca. */
  tono?: Veredicto;
  children: ReactNode;
}

export function PantallaDeAjuste({
  eyebrow,
  veredicto,
  resaltado,
  tono,
  children,
}: PantallaDeAjusteProps) {
  /* El resaltado se parte por posición en vez de inyectar HTML: así el copy
     sigue siendo texto plano en el dato y el color lo pone el kit. */
  const segmentos = (() => {
    if (!resaltado || !tono) return [seg(veredicto)];
    const i = veredicto.indexOf(resaltado);
    if (i < 0) return [seg(veredicto)];
    return [
      ...(i > 0 ? [seg(veredicto.slice(0, i))] : []),
      seg(resaltado, tono),
      ...(i + resaltado.length < veredicto.length
        ? [seg(veredicto.slice(i + resaltado.length))]
        : []),
    ];
  })();

  return (
    <div className="entrar-panel">
      <SemanticHero etiqueta={eyebrow} frases={[{ segmentos }]} size="simple" />
      {children}
    </div>
  );
}

export default PantallaDeAjuste;
