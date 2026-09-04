/**
 * abmv2/HintBanner — la PISTA del módulo, en el segmento de ayudas.
 *
 * [v3] Sale de la espec del dueño (2026-09-02): la ayuda contextual no va en
 * el medio de la página (entre hero y controles) — va ARRIBA DE TODO, en el
 * segmento donde viven las ayudas, y SE CIERRA CON UNA CRUZ. Una vez cerrada
 * no vuelve: se persiste por módulo en localStorage (el patrón probado del
 * ViewToggleHint del ABMPage legacy, migrado acá como pieza del kit — el
 * legacy no recibe piezas nuevas ni se importa desde el kit).
 *
 * Dumb component: el padre declara título, texto y acción; la única lógica
 * propia es el dismiss persistido, que es de presentación (qué ayuda ya leyó
 * este usuario en este navegador — no es estado del dominio).
 *
 * Sin números adentro (regla de la pista): una ayuda con cifras envejece sin
 * que nadie la actualice. Estilos por clases av2-* sobre tokens --pl-*.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { cerrarPista, pistaCerrada, suscribirPistas } from './pistas';
import type { Action } from './types';

export interface HintBannerProps {
  /** Clave de persistencia del dismiss (una por módulo/pantalla). */
  storageKey: string;
  titulo: string;
  texto: string;
  accion?: Action;
}

export function HintBanner({ storageKey, titulo, texto, accion }: HintBannerProps) {
  /* [v3.4] La persistencia vive en ./pistas.ts: localStorage por defecto y,
     si la app enchufó un adaptador, POR USUARIO (cerrada en el teléfono,
     cerrada en la tablet). Si el adaptador llega después del primer render,
     la suscripción retira la pista que ya estaba cerrada. */
  const [visible, setVisible] = useState(() => !pistaCerrada(storageKey));

  useEffect(
    () =>
      suscribirPistas(() => {
        if (pistaCerrada(storageKey)) setVisible(false);
      }),
    [storageKey],
  );

  if (!visible) return null;

  const cerrar = () => {
    cerrarPista(storageKey);
    setVisible(false);
  };

  return (
    <div className="av2-nota av2-nota--ok av2-nota--hint" role="note">
      <span className="av2-hint-tile" aria-hidden>
        <Sparkles size={15} strokeWidth={1.9} />
      </span>
      <span className="av2-nota-txt">
        <span className="av2-nota-eyebrow">{titulo}</span>
        {texto}
      </span>
      {accion &&
        (accion.to ? (
          <Link className="av2-btn-secundario" to={accion.to}>
            {accion.label}
            <ArrowRight size={15} strokeWidth={2} />
          </Link>
        ) : (
          <button type="button" className="av2-btn-secundario" onClick={accion.onClick}>
            {accion.label}
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        ))}
      <button
        type="button"
        className="av2-nota-cerrar"
        onClick={cerrar}
        title="Cerrar esta ayuda"
        aria-label="Cerrar esta ayuda"
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

export default HintBanner;
