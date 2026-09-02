/**
 * Contrato entre una pantalla y el contenedor que la embebe (ver EmbedContext).
 *
 * Vive separado del Provider porque un archivo que exporta componentes Y
 * funciones rompe el fast-refresh de Vite (react-refresh/only-export-components).
 */
import { createContext, useContext, useEffect } from 'react';

export interface EmbedContextValue {
  /** true ⇒ la pantalla vive dentro de otra: sin cabecera propia. */
  embedded: boolean;
  /** Id del ajuste que se está mostrando (clave del contador). */
  slotId?: string;
  /** La pantalla informa cuántas filas tiene. */
  reportarTotal?: (slotId: string, total: number) => void;
}

export const EmbedContext = createContext<EmbedContextValue | null>(null);

/** Devuelve el contexto o el default "soy una página normal". */
export function useEmbed(): EmbedContextValue {
  return useContext(EmbedContext) ?? { embedded: false };
}

/**
 * Publica cuántas filas tiene la pantalla para el contador del riel.
 *
 * Lo llaman las pantallas que no pasan por `ABMPage`/`SemanticAbmPage` (arman
 * su propia tabla) o que no exponen paginación ni tab "Todos". Fuera de un
 * contenedor no hace nada.
 */
export function useReportarTotal(total: number | undefined): void {
  const { slotId, reportarTotal } = useEmbed();
  useEffect(() => {
    if (slotId && reportarTotal && typeof total === 'number') {
      reportarTotal(slotId, total);
    }
  }, [slotId, reportarTotal, total]);
}
