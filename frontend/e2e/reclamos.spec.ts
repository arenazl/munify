import { test, expect, type Page } from '@playwright/test';
import { cargarTenant, cerrarAvisos, contextoDe, marcaDeCorrida, type CasoReclamo } from './soporte/tenant';

/**
 * Circuito COMPLETO de reclamos, punta a punta y data-driven:
 *
 *   vecino crea (wizard con categoría MANUAL — sin IA: determinístico)
 *     → el gestor lo toma (admin en casos impares, el SUPERVISOR de la
 *       dependencia en pares: así los dos roles quedan ejercitados)
 *     → pasar a en curso → finalizar
 *     → el vecino ve el estado final en Mis Reclamos.
 *
 * La matriz de 20 casos vive en el fixture del tenant (categorías,
 * direcciones y variantes reales de ESE municipio). El spec no conoce
 * ningún dato de Asunción.
 */
const tenant = cargarTenant();

/** Camina el wizard del vecino y devuelve el título único del reclamo. */
async function vecinoCreaReclamo(page: Page, caso: CasoReclamo): Promise<string> {
  const titulo = `${marcaDeCorrida(caso.caso)} ${caso.detalle.slice(0, 70)}`;
  await page.goto('/gestion/crear-reclamo');
  await cerrarAvisos(page);

  // Qué: texto libre + categoría MANUAL (la clasificación IA queda afuera
  // del circuito a propósito: el resultado debe ser siempre el mismo).
  await page.locator('input:visible').first().fill(titulo);
  await page.getByRole('button', { name: /Prefiero elegir/i }).click();
  await page.getByRole('button', { name: caso.categoria, exact: true }).click();

  // Dónde: dirección + referencia.
  const direccion = page.getByPlaceholder(/Av\. San Mart/i);
  await direccion.waitFor({ state: 'visible' });
  await direccion.fill(caso.direccion);
  await page.getByPlaceholder(/frente a la plaza/i).fill('Referencia E2E');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // Qué pasó: el detalle largo.
  const detalle = page.locator('textarea:visible').first();
  if (await detalle.isVisible().catch(() => false)) await detalle.fill(caso.detalle);
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // Foto: opcional, se saltea.
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // Confirmar.
  await page.getByRole('button', { name: 'Crear reclamo' }).click();
  await page.waitForURL(/mis-reclamos/, { timeout: 30_000 });
  await expect(page.getByText(marcaDeCorrida(caso.caso)).first()).toBeVisible({ timeout: 15_000 });
  return titulo;
}

/** Abre el detalle del reclamo en la bandeja de gestión buscando por dirección. */
async function gestorAbreReclamo(page: Page, caso: CasoReclamo): Promise<void> {
  await page.goto('/gestion/reclamos');
  await cerrarAvisos(page);
  const buscador = page.getByPlaceholder(/Buscar por c/i);
  await buscador.waitFor({ state: 'visible', timeout: 30_000 });
  await buscador.fill(caso.direccion);
  const fila = page.getByRole('row', { name: marcaDeCorrida(caso.caso) }).first();
  await fila.waitFor({ state: 'visible', timeout: 20_000 });
  // El buscador refetchea con debounce y REMONTA las filas: un click inmediato
  // se pierde en el remount. Settle corto + click en la acción "Ver" de la
  // fila, con un reintento si el sheet no abrió.
  await page.waitForTimeout(1_200);
  const accionesSheet = page.getByRole('button', { name: /Pasar a en curso|Finalizar|Rechazar/i }).first();
  for (let intento = 0; intento < 3; intento++) {
    await cerrarAvisos(page); // el aviso de notificaciones puede reaparecer y tapar el click
    await fila.getByRole('button', { name: 'Ver' }).click({ timeout: 8_000 }).catch(async () => { await fila.click().catch(() => {}); });
    const abrio = await accionesSheet.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    if (abrio) return;
  }
  await accionesSheet.waitFor({ state: 'visible', timeout: 10_000 });
}

for (const caso of tenant.reclamos) {
  const id = marcaDeCorrida(caso.caso);
  // Gestor alternado: así el circuito ejercita al admin Y a los responsables.
  const gestor = caso.caso % 2 === 0 ? `sup-${caso.dep}` : 'admin';

  test(`reclamo ${id} ${caso.categoria} — cierra ${gestor}`, async ({ browser }) => {
    // 1) El vecino carga el reclamo.
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, 'vecino');
    await vecinoCreaReclamo(vecino, caso);
    await ctxVecino.close();

    // 2) El gestor lo toma y lo lleva a término.
    const { ctx: ctxGestor, page: gestion } = await contextoDe(browser, gestor);
    await gestorAbreReclamo(gestion, caso);

    // Reglas de negocio del pase a en curso: (1) elegir QUIÉN lo va a hacer
    // (primer candidato sugerido — el ranking del sistema es parte de lo que
    // se prueba) y (2) escribir QUÉ se va a hacer (queda en el historial).
    const candidato = gestion.getByRole('radio').first();
    await candidato.waitFor({ state: 'visible', timeout: 15_000 });
    await candidato.click();
    await gestion.getByRole('textbox', { name: /Qué se va a hacer/i })
      .fill(`${id} Se programa cuadrilla para atender el pedido.`);
    const pasar = gestion.getByRole('button', { name: 'Pasar a en curso' });
    await expect(pasar).toBeEnabled({ timeout: 15_000 });
    await pasar.click();
    // La acción cierra el sheet y la fila queda "En Curso".
    await expect(gestion.getByRole('row', { name: id }).first()).toContainText(/En Curso/i, { timeout: 20_000 });

    // Reabrir para FINALIZAR: panel "Finalizar Trabajo" → resultado
    // "Finalizado" → describir la resolución → Finalizar.
    await gestorAbreReclamo(gestion, caso);
    const notaFinal = `${id} Trabajo realizado, se repuso el servicio.`;
    const panelFinalizar = gestion.getByRole('button', { name: 'Finalizar Trabajo' });
    const descripcion = gestion.getByRole('textbox', { name: /cómo se resolvió/i });
    // El panel puede venir abierto con "Finalizado" preseleccionado: sólo se
    // abre si la descripción no está a la vista, y sólo se toca el resultado
    // si el submit sigue deshabilitado (clickearlo de más lo DESelecciona).
    if (!(await descripcion.isVisible().catch(() => false))) await panelFinalizar.click();
    await descripcion.waitFor({ state: 'visible', timeout: 15_000 });
    await descripcion.fill(notaFinal);
    const submit = gestion.getByRole('button', { name: 'Finalizar', exact: true });
    if (!(await submit.isEnabled().catch(() => false))) {
      await gestion.getByRole('button', { name: 'Finalizado', exact: true }).click();
      if (!(await descripcion.inputValue().catch(() => ''))) await descripcion.fill(notaFinal);
    }
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();
    await expect(gestion.getByRole('row', { name: id }).first()).toContainText(/Finalizado/i, { timeout: 25_000 });
    await ctxGestor.close();

    // 3) El vecino ve el cierre.
    const { ctx: ctxFin, page: fin } = await contextoDe(browser, 'vecino');
    await fin.goto('/gestion/mis-reclamos');
    await cerrarAvisos(fin);
    const tarjeta = fin.getByText(id, { exact: false }).first();
    await expect(tarjeta).toBeVisible({ timeout: 20_000 });
    await ctxFin.close();
  });
}
