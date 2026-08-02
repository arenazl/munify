/**
 * TarjetaCola — una cosa que hacer, con el número grande y el botón que la resuelve.
 *
 * QUÉ PROBLEMA RESUELVE
 * La cola anterior mostraba, en cada columna, la LISTA de los reclamos
 * pendientes. Eso tenía tres problemas: las columnas quedaban de alturas
 * distintas según cuántos hubiera, leer cuatro títulos truncados no dice qué
 * hacer, y el dato que importa —CUÁNTOS hay y si eso está bien o mal— quedaba
 * en un numerito arriba a la derecha.
 *
 * Acá el orden se invierte: primero el número, grande; después una frase que
 * dice por qué importa; y al final UNA acción concreta. El detalle está a un
 * clic, que es donde tiene que estar.
 *
 * La barra fina bajo el número no es adorno: muestra qué porción de toda la
 * cola es esta pila. Sin ella, "4 sin asignar" no se sabe si es mucho o poco.
 *
 * Agnóstico: no sabe de reclamos ni de municipios. Recibe qué mostrar, en qué
 * proporción y a dónde ir.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/** El color de la tarjeta. Es el veredicto, no una decoración. */
export type TonoCola = 'rojo' | 'ambar' | 'verde';

export interface TarjetaColaProps {
  icono: LucideIcon;
  titulo: string;
  valor: number;
  /** Qué son ("reclamos sin dueño"). Ya viene en singular o plural. */
  unidad: string;
  /** Porción de la cola total, 0..1. Dibuja la barra fina. */
  proporcion: number;
  /** Por qué importa. Acepta nodos para resaltar el dato con <strong>. */
  detalle: ReactNode;
  accion: { label: string; to: string };
  tono: TonoCola;
}

export function TarjetaCola({
  icono: Icono,
  titulo,
  valor,
  unidad,
  proporcion,
  detalle,
  accion,
  tono,
}: TarjetaColaProps) {
  // La barra nunca desaparece del todo ni se pasa: aun con una sola cosa
  // pendiente tiene que verse que hay algo.
  const ancho = valor === 0 ? 0 : Math.max(6, Math.min(100, Math.round(proporcion * 100)));

  return (
    <article className={`tcola tcola--${tono}`}>
      <span className="tcola-marca" aria-hidden="true">
        <Icono />
      </span>

      <header className="tcola-cab">
        <span className="tcola-icono">
          <span className="tcola-latido" aria-hidden="true" />
          <Icono aria-hidden="true" />
        </span>
        <h3 className="tcola-titulo">{titulo}</h3>
      </header>

      <p className="tcola-valor-fila">
        <span className="tcola-valor">{valor}</span>
        <span className="tcola-unidad">{unidad}</span>
      </p>

      {/* Ancho runtime: es el dato, no un estilo. */}
      <span className="tcola-barra" aria-hidden="true">
        <span className="tcola-barra-lleno" style={{ width: `${ancho}%` }} />
      </span>

      <p className="tcola-detalle">{detalle}</p>

      {/* Empujada abajo para que las tres tarjetas terminen parejas aunque el
          texto de arriba ocupe distinto. */}
      <Link to={accion.to} className="tcola-accion">
        {accion.label}
        <ArrowRight className="tcola-flecha" aria-hidden="true" />
      </Link>
    </article>
  );
}
