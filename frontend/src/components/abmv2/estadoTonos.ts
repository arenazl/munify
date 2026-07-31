/**
 * abmv2/estadoTonos — paleta de estados → tono de chip (StatusPill del
 * estándar): azul = recibido/completado · ámbar = en curso/pendiente ·
 * verde = al día/finalizado · gris = pospuesto/rechazado · rojo = vencido/mora.
 * Resiliente: estado desconocido → gris.
 *
 * Separado de DataTable.tsx por la regla de fast-refresh (solo componentes
 * en archivos de componentes).
 */
import type { ChipTone } from './types';

export const TONE_POR_ESTADO: Record<string, ChipTone> = {
  // azul — entró al circuito / se completó un paso
  recibido: 'blue',
  nuevo: 'blue',
  asignado: 'blue',
  completado: 'blue',
  registrado: 'blue',
  emitido: 'blue',
  // ámbar — en curso / esperando a alguien
  en_curso: 'amber',
  en_proceso: 'amber',
  pendiente: 'amber',
  pendiente_confirmacion: 'amber',
  autorizado: 'amber',
  notificado: 'amber',
  // verde — al día / terminado bien
  finalizado: 'green',
  resuelto: 'green',
  al_dia: 'green',
  pagado: 'green',
  cobrado: 'green',
  conciliado: 'green',
  // gris — salió del circuito
  pospuesto: 'gray',
  rechazado: 'gray',
  anulado: 'gray',
  // rojo — exige acción ya
  vencido: 'red',
  mora: 'red',
};

/** Tono de chip para un estado. Resiliente: desconocido/null → 'gray'. */
export const toneDeEstado = (estado?: string | null): ChipTone =>
  (estado && TONE_POR_ESTADO[estado]) || 'gray';
