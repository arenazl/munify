/**
 * PuenteModulo — el cuerpo "puente" del prototipo.
 *
 * Hay ajustes que el usuario BUSCA en Configuración pero que no se administran
 * acá: los vecinos, el inventario, los contactos de tesorería y las ausencias.
 * El canvas resolvió eso con una pantalla que explica dónde viven y por qué, en
 * vez de duplicar la grilla del módulo — que es lo que venía pasando: dos
 * lugares para editar lo mismo, cada uno con la mitad de las acciones.
 *
 * Tiene cuatro partes, todas del spec:
 *  1. dónde vive y POR QUÉ (el motivo es lo que evita que alguien lo "arregle"
 *     trayéndolo de vuelta);
 *  2. qué se hace allá;
 *  3. qué SÍ se configura acá, con salto directo a esos ajustes;
 *  4. una muestra de los registros que más importan, en solo lectura, para que
 *     el usuario confirme que llegó al lugar correcto antes de irse.
 */
import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import { PageHeader } from '../abmv2/PageHeader';
import { useEmbed } from '../abmv2/useEmbed';
import type { PuenteSpec } from '../../config/canvasConfigSpec';

export interface PuenteModuloProps {
  spec: PuenteSpec;
  title: string;
  eyebrow: string;
  descripcion?: string;
  /** Ir al módulo donde se administra de verdad. */
  onIr?: () => void;
  /** Saltar a otro ajuste de Configuración (el id del riel). */
  onIrAjuste?: (idAjuste: string) => void;
}

export function PuenteModulo({
  spec,
  title,
  eyebrow,
  descripcion,
  onIr,
  onIrAjuste,
}: PuenteModuloProps) {
  const { embedded } = useEmbed();

  return (
    <div className="av2-page">
      {!embedded && <PageHeader eyebrow={eyebrow} title={title} description={descripcion} />}

      {/* 1. Dónde vive y por qué */}
      <div className="pu-cab">
        <div className="pu-cab-txt">
          <span className="av2-eyebrow">{spec.alla}</span>
          <p className="pu-motivo">{spec.motivo}</p>
        </div>
        {onIr && (
          <button type="button" className="pu-cta" onClick={onIr}>
            {spec.cta}
            <ArrowRight size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="pu-cols">
        {/* 2. Qué se hace en el módulo */}
        <section className="pu-caja">
          <span className="av2-eyebrow">Eso se hace en el módulo</span>
          <ul className="pu-lista">
            {spec.allaLista.map((item) => (
              <li key={item}>
                <ExternalLink size={13} strokeWidth={2} aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. Qué sí se configura acá */}
        <section className="pu-caja">
          <span className="av2-eyebrow">Lo que sí se configura acá</span>
          <div className="pu-atajos">
            {spec.aca.map(([label, para, idAjuste]) => (
              <button
                key={idAjuste}
                type="button"
                className="pu-atajo"
                onClick={() => onIrAjuste?.(idAjuste)}
                disabled={!onIrAjuste}
              >
                <span className="pu-atajo-txt">
                  <span className="pu-atajo-label">{label}</span>
                  <span className="pu-atajo-para">{para}</span>
                </span>
                <ArrowRight size={14} strokeWidth={2} aria-hidden />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* 4. La muestra: para confirmar que es el lugar correcto */}
      <section className="pu-muestra">
        <div className="pu-muestra-cab">
          <Sparkles size={15} strokeWidth={2} aria-hidden />
          <span className="av2-eyebrow">{spec.muestraTitulo}</span>
          <span className="pu-muestra-nota">{spec.muestraNota}</span>
        </div>
        <div className="pu-muestra-filas">
          {spec.muestra.map(([iniciales, tinte, color, nombre, detalle, cifra]) => (
            <div key={nombre} className="pu-fila">
              {/* Tinte y color vienen del dato de la fila (runtime). */}
              <span className="pu-avatar" style={{ background: tinte, color }}>
                {iniciales}
              </span>
              <span className="pu-fila-txt">
                <span className="pu-fila-nombre">{nombre}</span>
                <span className="pu-fila-detalle">{detalle}</span>
              </span>
              <span className="pu-fila-cifra">{cifra}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default PuenteModulo;
