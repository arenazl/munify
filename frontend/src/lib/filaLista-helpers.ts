/**
 * Adaptadores de dominio → `FilaLista`.
 *
 * La fila del kit es agnóstica: no sabe qué es un reclamo ni un trámite. Acá
 * vive la traducción, en un solo lugar, para que las dos pantallas muestren
 * lo mismo de la misma forma — que era la condición: una sola pieza, mismo
 * comportamiento en reclamos y en trámites.
 */
import type { FilaTono } from '../components/ui/FilaLista';

/**
 * Cuánto hace, dicho como lo diría una persona.
 *
 * No se muestra la fecha absoluta: en un listado que se revisa todos los días,
 * "hace 2 h" ubica mucho más rápido que "1/8/2026". La fecha exacta queda en
 * el detalle, para quien la necesite.
 */
export function haceCuanto(fecha: string | Date | null | undefined): string {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';

  const minutos = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `${dias} d`;

  const meses = Math.floor(dias / 30);
  if (meses < 12) return `${meses} m`;
  return `${Math.floor(meses / 12)} a`;
}

/**
 * Estado → matiz de la barra lateral.
 *
 * El criterio es el mismo que en todo el kit y NO es "cada estado su color":
 * es qué significa ese estado para quien mira la lista. Cerrado es bueno, lo
 * que está trabado o esperando algo es advertencia, lo rechazado es malo, y
 * lo que recién entró todavía no es ni una cosa ni la otra.
 *
 * Resiliente por diseño: un estado que no esté en la tabla cae en 'neutro' en
 * vez de romper. Mañana aparece un estado nuevo y la lista sigue andando.
 */
const TONO_POR_ESTADO: Record<string, FilaTono> = {
  // cierre
  finalizado: 'bueno',
  resuelto: 'bueno',
  aprobado: 'bueno',
  // en movimiento
  en_curso: 'info',
  en_proceso: 'info',
  asignado: 'info',
  // esperando algo de alguien
  pendiente_confirmacion: 'advertencia',
  pendiente_pago: 'advertencia',
  pospuesto: 'advertencia',
  requiere_documentacion: 'advertencia',
  // frenado
  rechazado: 'malo',
  // recién entrado
  recibido: 'neutro',
  nuevo: 'neutro',
  iniciado: 'neutro',
};

export function tonoDeEstado(estado: string | null | undefined): FilaTono {
  if (!estado) return 'neutro';
  return TONO_POR_ESTADO[String(estado).toLowerCase()] || 'neutro';
}
