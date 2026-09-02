/**
 * migas.ts — contrato de la miga de pan del shell v2 (tipos + contexto + hook).
 *
 * REGLA DURA del dueño: la miga NUNCA muestra un solo valor. Siempre son
 * exactamente DOS tramos, "Ámbito / Página":
 *
 *    Municipalidad de San Pedro Norte / Dashboard
 *    Obras Públicas / Reclamos
 *    Municipalidad de San Pedro Norte / Reclamos #5622
 *
 *  - TRAMO 1 = ÁMBITO donde está parado el usuario. Nunca queda vacío (ver
 *    `MigasProvider`): dependencia asignada, municipio actual, o el contexto
 *    del super admin.
 *  - TRAMO 2 = la pantalla actual, derivada de `shell/rutas.ts` (o sea, de
 *    config/navigation.ts). Si la ruta tiene profundidad extra, el segundo
 *    tramo la absorbe ("Reclamos #5622") en vez de agregar un tercer tramo.
 *
 * El valor y el hook viven acá (sin JSX) para que el provider quede en un
 * archivo de sólo-componentes: así fast-refresh no se rompe.
 */
import { createContext, useContext } from 'react';

/** Qué control tiene que dibujar la topbar para el primer tramo. */
export type TipoAmbito = 'dependencia' | 'municipio' | 'global';

export interface Migas {
  /** Primer tramo. SIEMPRE con texto — nunca vacío. */
  ambito: string;
  tipoAmbito: TipoAmbito;
  /** Segundo (y último) tramo: la pantalla actual. */
  pagina: string;
  /** Módulo del menú que matcheó la ruta (null si no está en el menú). */
  modulo: string | null;
  /** Los dos tramos ya listos para render, en orden. */
  tramos: [string, string];
  /**
   * ¿La miga se está DIBUJANDO en pantalla? En mobile no hay topbar (el header
   * mobile muestra el municipio, no la pantalla), así que la miga existe como
   * dato pero nadie la ve. Quien la use para NO repetir información —el
   * `PageHeader` con su eyebrow— tiene que mirar este flag: esconder algo por
   * un eco que el usuario no está viendo es perder información.
   */
  visible: boolean;
}

export const MigasContexto = createContext<Migas | null>(null);

/**
 * Miga activa. Devuelve null FUERA del provider y los consumidores degradan
 * (el `PageHeader` renderiza su eyebrow siempre), así los componentes siguen
 * siendo usables en tests o en pantallas sin shell.
 */
export function useMigas(): Migas | null {
  return useContext(MigasContexto);
}
