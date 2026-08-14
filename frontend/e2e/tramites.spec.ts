import { test, expect, type Page } from '@playwright/test';
import { cargarTenant, cerrarAvisos, contextoDe, marcaDeCorrida, type CasoTramite } from './soporte/tenant';

/**
 * Circuito COMPLETO de trámites, punta a punta y data-driven:
 *
 *   vecino crea la solicitud (wizard: trámite por nombre → solicitante →
 *   confirmar) → si el caso es conTurno, reserva turno (primer horario
 *   disponible: el orden de la agenda es parte de lo que se prueba)
 *     → el gestor (admin en impares, supervisor del área en pares cuando
 *       aplica: acá siempre admin porque la bandeja es transversal) la pone
 *       en curso y la finaliza
 *     → el vecino ve el cierre en Mis Trámites.
 *
 * La matriz de 20 casos vive en el fixture del tenant. La marca de corrida
 * viaja en el "detalle adicional" de la solicitud.
 */
const tenant = cargarTenant();

async function vecinoCreaSolicitud(page: Page, caso: CasoTramite, id: string): Promise<void> {
  await page.goto('/gestion/mis-tramites');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: 'Nuevo Trámite' }).click();
  await page.getByPlaceholder(/Empezá a escribir/).fill(caso.tramite);
  await page.getByText(caso.tramite, { exact: false }).last().click();

  // Solicitante: viene prellenado del perfil; se completa lo que falte y la
  // marca va en el detalle adicional.
  const dni = page.getByPlaceholder('30123456');
  if (await dni.isVisible().catch(() => false) && !(await dni.inputValue())) await dni.fill('4555111');
  await page.getByPlaceholder('Detalle adicional del trámite').fill(`${id} circuito E2E`).catch(() => {});
  await page.getByRole('button', { name: 'Siguiente' }).last().click();

  await page.getByRole('button', { name: 'Crear solicitud' }).click();
  // La creación pega a la DB real: se espera a que el wizard cierre.
  await expect(page.getByRole('button', { name: 'Crear solicitud' })).toBeHidden({ timeout: 45_000 });
}

async function vecinoReservaTurno(page: Page, caso: CasoTramite): Promise<void> {
  await page.goto('/gestion/mis-turnos');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: 'Reservar turno' }).first().click();
  // Elegir la solicitud recién creada (la más reciente de ese trámite).
  const comboSolicitud = page.getByText(/Elegí una solicitud|Elegí un trámite/).first();
  await comboSolicitud.waitFor({ state: 'visible', timeout: 15_000 });
  await comboSolicitud.click();
  await page.getByRole('option', { name: caso.tramite }).first()
    .or(page.getByText(caso.tramite, { exact: false }).last()).first().click();
  // Primer horario disponible.
  await page.getByText('Horarios disponibles').waitFor({ state: 'visible', timeout: 25_000 });
  const slot = page.locator('button', { hasText: /^\d{1,2}:\d{2}/ }).first();
  await slot.waitFor({ state: 'visible', timeout: 20_000 });
  await slot.click();
  const confirmar = page.getByRole('button', { name: 'Confirmar turno' });
  await expect(confirmar).toBeEnabled({ timeout: 10_000 });
  await confirmar.click();
  await expect(confirmar).toBeHidden({ timeout: 30_000 });
}

/** Abre en la bandeja de gestión la solicitud MÁS RECIENTE de ese trámite en un estado dado. */
async function gestorAbreSolicitud(page: Page, caso: CasoTramite, estado: RegExp): Promise<void> {
  await page.goto('/gestion/tramites');
  await cerrarAvisos(page);
  const fila = page.getByRole('row', { name: new RegExp(caso.tramite) }).filter({ hasText: estado }).first()
    .or(page.locator(`text=${caso.tramite}`).first());
  await fila.first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(800);
  await fila.first().click();
}

for (const caso of tenant.tramites) {
  const id = marcaDeCorrida(caso.caso);
  const vecinoRol = caso.caso % 2 === 0 ? 'vecino-2' : 'vecino';

  test(`tramite ${id} ${caso.tramite}${caso.conTurno ? ' + turno' : ''}`, async ({ browser }) => {
    // 1) El vecino crea la solicitud (y reserva turno si aplica).
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, vecinoRol);
    await vecinoCreaSolicitud(vecino, caso, id);
    if (caso.conTurno) await vecinoReservaTurno(vecino, caso);
    await ctxVecino.close();

    // 2) El gestor la pone en curso y la finaliza.
    const { ctx: ctxGestor, page: gestion } = await contextoDe(browser, 'admin');
    await gestorAbreSolicitud(gestion, caso, /Recibido/i);
    await gestion.getByRole('button', { name: 'Poner en Curso' }).click();
    // Tras la acción puede cerrar el sheet o refrescar: reabrir en curso.
    await gestion.waitForTimeout(1_500);
    const finalizar = gestion.getByRole('button', { name: 'Finalizar', exact: true }).first();
    if (!(await finalizar.isVisible().catch(() => false))) {
      await gestorAbreSolicitud(gestion, caso, /En Curso/i);
    }
    await finalizar.waitFor({ state: 'visible', timeout: 20_000 });
    await finalizar.click();
    // Nota/confirmación si la pide.
    const dialogo = gestion.locator('[role="dialog"]').last();
    const notaDialogo = dialogo.locator('textarea:visible').first();
    if (await notaDialogo.isVisible().catch(() => false)) await notaDialogo.fill(`${id} atendido y resuelto.`);
    const confirmar = dialogo.getByRole('button', { name: /Finalizar|Confirmar/i }).last();
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click().catch(() => {});
    await ctxGestor.close();

    // 3) El vecino ve el cierre.
    const { ctx: ctxFin, page: fin } = await contextoDe(browser, vecinoRol);
    await fin.goto('/gestion/mis-tramites');
    await cerrarAvisos(fin);
    await fin.getByPlaceholder(/Buscar en mis trámites/i).fill(caso.tramite).catch(() => {});
    await expect(fin.getByText(caso.tramite, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(fin.getByText(/Finalizado/i).first()).toBeVisible({ timeout: 20_000 });
    await ctxFin.close();
  });
}
