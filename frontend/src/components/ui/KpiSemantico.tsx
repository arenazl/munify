/**
 * KpiSemantico — una tarjeta que responde una PREGUNTA, no que muestra un número.
 *
 * QUÉ PROBLEMA RESUELVE
 * Un ranking de barrios, un donut de estados y una lista de tiempos son tres
 * gráficos distintos que obligan a lo mismo: mirar, comparar y sacar la
 * conclusión uno mismo. En una demo —y en la reunión de un intendente— eso no
 * pasa nunca. Esta tarjeta hace el trabajo al revés: arranca por la pregunta
 * ("¿Dónde se concentran?"), contesta con UN dato grande ("Villa Morra") y
 * abajo explica en castellano por qué ese dato importa.
 *
 * El gráfico no desaparece: se lo reemplaza por su conclusión, y el link del
 * pie lleva al detalle completo para el que quiera ver los datos crudos.
 *
 * POR QUÉ ES AGNÓSTICO
 * No sabe nada de reclamos, barrios ni municipios: recibe pregunta, valor,
 * unidad, una explicación ya redactada y a dónde ir. Sirve igual para
 * facturación, stock o cualquier tablero — por eso vive en `components/ui/`.
 *
 * El veredicto (`tono`) tiñe el icono y el valor. No es decoración: es lo que
 * permite barrer cinco tarjetas de un vistazo y ver cuál está en problemas.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export type TonoKpi = 'bueno' | 'malo' | 'advertencia' | 'neutro';

export interface KpiSemanticoProps {
  /** La pregunta que contesta la tarjeta. Va en el encabezado. */
  pregunta: string;
  icono: LucideIcon;
  /** La respuesta, en grande. Puede ser un número o un nombre ("Villa Morra"). */
  valor: string;
  /** Qué es ese valor ("23 reclamos", "es bacheo y calles"). */
  unidad?: string;
  /**
   * Por qué ese dato importa, ya redactado. Acepta nodos para poder resaltar
   * la parte que manda con <strong>.
   */
  detalle: ReactNode;
  /** Dato de respaldo del pie ("Top 5 = 72 de 244"). */
  pie?: string;
  /** A dónde va el que quiere ver los datos crudos. */
  accion?: { label: string; to: string };
  tono?: TonoKpi;
  className?: string;
}

export function KpiSemantico({
  pregunta,
  icono: Icono,
  valor,
  unidad,
  detalle,
  pie,
  accion,
  tono = 'neutro',
  className,
}: KpiSemanticoProps) {
  return (
    <article className={`kse kse--${tono} ${className || ''}`}>
      {/* Marca de agua: el mismo icono en grande, apenas visible. Da carácter
          a la tarjeta sin competir con el dato. `aria-hidden` porque no aporta
          nada a quien la escucha. */}
      <span className="kse-marca" aria-hidden="true">
        <Icono />
      </span>

      <header className="kse-cab">
        <span className="kse-icono">
          {/* El anillo que late marca que el dato es de ahora, no una foto vieja. */}
          <span className="kse-latido" aria-hidden="true" />
          <Icono aria-hidden="true" />
        </span>
        <h3 className="kse-pregunta">{pregunta}</h3>
      </header>

      <p className="kse-valor-fila">
        <span className="kse-valor">{valor}</span>
        {unidad && <span className="kse-unidad">{unidad}</span>}
      </p>

      <p className="kse-detalle">{detalle}</p>

      {/* El pie se empuja abajo con margin-top:auto para que cinco tarjetas de
          texto desigual terminen todas con la línea a la misma altura. */}
      {(pie || accion) && (
        <footer className="kse-pie">
          {pie && <span className="kse-pie-dato">{pie}</span>}
          {accion && (
            <Link to={accion.to} className="kse-pie-link">
              {accion.label}
            </Link>
          )}
        </footer>
      )}
    </article>
  );
}
