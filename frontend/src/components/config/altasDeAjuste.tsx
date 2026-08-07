/**
 * altasDeAjuste — qué sheet abre el botón "Nuevo" de cada ajuste.
 *
 * Mismo criterio que `CABLEADO` en `datosDeAjuste`: el panel no sabe nada de
 * ninguna entidad, sólo busca por id. Enganchar el alta de una pantalla es
 * escribir su sheet y sumarlo acá — el CTA aparece solo, porque
 * `AbmDeConfiguracion` no dibuja el botón si no hay handler.
 *
 * Que un ajuste NO esté acá es una DECISIÓN, no un olvido: sin alta cableada
 * la pantalla queda de lectura y el botón no se dibuja, en vez de ofrecer uno
 * que no hace nada.
 *
 * DEPENDENCIAS NO VA ACÁ, a propósito (decisión del dueño, 2026-08-06): la
 * estructura de secretarías y direcciones es el ESTÁNDAR DEL PAÍS, no algo que
 * cada municipio inventa. Munify mantiene el master —uno por país, porque en
 * Paraguay y Uruguay los nombres son otros— y el municipio sólo habilita de
 * ahí y hace ajustes internos. Si un intendente necesita una secretaría que no
 * está, se la pide al super admin.
 */
import type { ComponentType } from 'react';

export interface AltaSheetProps {
  open: boolean;
  onClose: () => void;
  /** El alta ya quedó guardada: el panel recarga la lista. */
  onGuardado?: () => void;
}

export const ALTA_DE_AJUSTE: Record<string, ComponentType<AltaSheetProps>> = {
  // Vacío por ahora. Las entidades que SÍ crea el municipio (zonas, cuadrillas,
  // cajas…) entran acá a medida que se les escriba el sheet.
};
