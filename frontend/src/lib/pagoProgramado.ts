/**
 * Un pago programado tiene UN destino: un CONTACTO (al ejecutarlo nace un
 * gasto, como un sueldo) o una TARJETA de crédito (al ejecutarlo se paga la
 * tarjeta: ingreso en la caja-tarjeta más egreso en la caja de origen, sin
 * gasto, porque las compras ya se registraron como gasto al hacerlas).
 *
 * De ahí que `contacto_id` y `monto_pesos` puedan venir en null: un pago de
 * tarjeta no tiene contacto, y sin monto significa "todo lo que deba ese día"
 * — un resumen cambia todos los meses, fijar un número era justo la trampa en
 * la que cayó San Pedro Norte (2026-09-11).
 *
 * Estos helpers son la única fuente de esa lectura: los usan la pantalla de
 * Programados, el pago masivo y Sueldos.
 */
import type { Caja, PagoProgramado } from '../types';

/** Lo que va a salir de la caja al ejecutar: el monto fijo, o lo que la
 *  tarjeta deba hoy. Nunca negativo: un saldo a favor no paga nada. */
export function montoPrevisto(p: PagoProgramado): number {
  if (p.es_pago_tarjeta) return Math.max(parseFloat(p.deuda_actual || '0') || 0, 0);
  return parseFloat(p.monto_pesos || '0') || 0;
}

/** A quién se le paga, para títulos, avisos y confirmaciones. */
export function nombreDestino(p: PagoProgramado): string {
  if (p.es_pago_tarjeta) return `Tarjeta ${p.tarjeta_nombre || ''}`.trim();
  return p.contacto_nombre || '';
}

/** Una caja que en realidad es una tarjeta de crédito (código TARJETA). */
export function esCajaTarjeta(c: Caja): boolean {
  return !!c.es_tarjeta || (c.codigo || '').toUpperCase() === 'TARJETA';
}
