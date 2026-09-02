import { test, expect, type Page } from '@playwright/test';
import { cargarTenant, cerrarAvisos, contextoDe, marcaDeCorrida, vecinoPagaSiCorresponde } from './soporte/tenant';

/**
 * Circuito de COBROS de trámites, punta a punta con el provider MOCK
 * (determinístico: el checkout simulado siempre aprueba; con Mercado Pago
 * real el mismo camino entra por el webhook firmado y se verifica a mano).
 *
 *   P1 — cobro AL INICIO: la solicitud nace PENDIENTE_PAGO, el vecino paga
 *        por el checkout, la solicitud pasa a RECIBIDO y el pago aparece en
 *        la pantalla Cobros del admin (historial para contaduría).
 *   P2 — cobro AL FINAL: la solicitud entra directo (RECIBIDO) sin pedirle
 *        el pago al vecino en la puerta.
 *
 * Los dos trámites salen del fixture por su momento_pago real en la semilla.
 */
const tenant = cargarTenant();

const TRAMITE_INICIO = 'Licencia de conducir - Primera vez';
const TRAMITE_FIN = 'Certificado de libre deuda municipal';

async function vecinoCreaSolicitud(page: Page, tramite: string, id: string): Promise<void> {
  await page.goto('/gestion/mis-tramites');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: 'Nuevo Trámite' }).click();
  await page.getByPlaceholder(/Empezá a escribir/).fill(tramite);
  const resultado = page.getByRole('button', { name: tramite }).first();
  await resultado.waitFor({ state: 'visible', timeout: 20_000 });
  await resultado.click();
  const dni = page.getByPlaceholder('30123456');
  if (await dni.isVisible().catch(() => false) && !(await dni.inputValue())) await dni.fill('4555111');
  await page.getByPlaceholder('Detalle adicional del trámite').fill(`${id} circuito E2E de pagos`).catch(() => {});
  await page.getByRole('button', { name: 'Siguiente' }).last().click();
  await page.getByRole('button', { name: 'Crear solicitud' }).click();
  await expect(page.getByRole('button', { name: 'Crear solicitud' })).toBeHidden({ timeout: 45_000 });
}

test.describe.serial('circuito de cobros de trámites', () => {
  test(`P1 — cobro al inicio: ${TRAMITE_INICIO} se paga por el checkout y llega a Cobros`, async ({ browser }) => {
    const id = marcaDeCorrida(51);
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, 'vecino');
    await vecinoCreaSolicitud(vecino, TRAMITE_INICIO, id);

    // La solicitud nace PENDIENTE de pago y el sheet ofrece pagar: el helper
    // abre la solicitud, paga por el checkout del mock y espera el comprobante.
    const pago = await vecinoPagaSiCorresponde(vecino, TRAMITE_INICIO);
    expect(pago).toBe(true);

    // Con el dinero adentro, reabrir la solicitud muestra "Pago confirmado"
    // en lugar del botón de pago.
    await vecino.goto('/gestion/mis-tramites');
    await cerrarAvisos(vecino);
    await vecino.getByPlaceholder(/Buscar en mis trámites/i).fill(TRAMITE_INICIO).catch(() => {});
    await vecino.waitForTimeout(1_500);
    await vecino.getByText(/^Solicitud: /).first().click();
    await expect(vecino.getByText('Pago confirmado').first()).toBeVisible({ timeout: 20_000 });
    await expect(vecino.getByRole('button', { name: /Pagar trámite/i })).toHaveCount(0);
    await ctxVecino.close();

    // El admin lo ve en Cobros (historial transaccional para contaduría).
    const { ctx: ctxAdmin, page: admin } = await contextoDe(browser, 'admin');
    await admin.goto('/gestion/cobros');
    await cerrarAvisos(admin);
    await expect(admin.getByText(new RegExp(TRAMITE_INICIO.slice(0, 20))).first()).toBeVisible({ timeout: 30_000 });
    await ctxAdmin.close();
  });

  test(`P2 — cobro al final: ${TRAMITE_FIN} entra sin pedir el pago en la puerta`, async ({ browser }) => {
    const id = marcaDeCorrida(52);
    const { ctx, page } = await contextoDe(browser, 'vecino');
    await vecinoCreaSolicitud(page, TRAMITE_FIN, id);

    await page.goto('/gestion/mis-tramites');
    await cerrarAvisos(page);
    await page.getByPlaceholder(/Buscar en mis trámites/i).fill(TRAMITE_FIN).catch(() => {});
    await page.waitForTimeout(1_500);
    // La solicitud entró como Recibido: al abrirla NO hay "Esperando tu pago"
    // (el pago con momento 'fin' no es requisito para arrancar).
    await page.getByText(/^Solicitud: /).first().click();
    await page.waitForTimeout(2_000);
    await expect(page.getByText('Esperando tu pago')).toHaveCount(0);
    await ctx.close();
  });
});
