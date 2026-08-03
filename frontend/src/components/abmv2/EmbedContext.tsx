/**
 * EmbedProvider — contrato entre una pantalla y el contenedor que la embebe.
 *
 * Nace del panel del `SettingsShell`: adentro entra una pantalla COMPLETA
 * (Empleados, Zonas, SLA…) que hasta ahora se creía sola en el mundo y
 * dibujaba su propia cabecera. Con este contexto:
 *
 *  1. La pantalla sabe que está embebida y no repite el título que el
 *     contenedor ya puso. Lo leen `ABMPage` y `SemanticAbmPage`, así que
 *     ninguna de las 22 páginas consumidoras tuvo que cambiar.
 *  2. La pantalla PUBLICA cuánto tiene (`reportarTotal`) y el contenedor lo
 *     usa para el contador del riel. El número sale del dato real que la
 *     pantalla ya cargó — no se inventa ni se pide aparte.
 *
 * Fuera de un contenedor el contexto vale `null`, así que todas las pantallas
 * siguen funcionando igual en su ruta propia.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { EmbedContext, type EmbedContextValue } from './useEmbed';

export function EmbedProvider({
  slotId, reportarTotal, children,
}: {
  slotId: string;
  reportarTotal: (slotId: string, total: number) => void;
  children: ReactNode;
}) {
  const value = useMemo<EmbedContextValue>(
    () => ({ embedded: true, slotId, reportarTotal }),
    [slotId, reportarTotal],
  );
  return <EmbedContext.Provider value={value}>{children}</EmbedContext.Provider>;
}
