import { test, expect, type Page } from '@playwright/test';
import {
  abrirSolicitudDelVecino,
  cargarTenant,
  cerrarAvisos,
  cerrarSheet,
  contextoDe,
  marcaDeCorrida,
  pagarDesdeElSheet,
  vecinoPagaDeudaPendiente,
  type CasoTramite,
} from './soporte/tenant';

/**
 * Circuito COMPLETO de trámites, punta a punta y data-driven:
 *
 *   vecino crea la solicitud (wizard: trámite por nombre → solicitante →
 *   confirmar) → paga si el trámite cobra AL INICIO (nace PENDIENTE_PAGO y
 *   ni siquiera tiene dependencia asignada hasta que entra la plata) → si el
 *   caso es conTurno, reserva turno para ESA solicitud (primer horario
 *   disponible: el orden de la agenda es parte de lo que se prueba)
 *     → el gestor verifica los documentos (al verificar el último obligatorio
 *       la solicitud avanza SOLA a en curso)
 *     → si el trámite cobra AL FINAL, el vecino paga ahora: el backend
 *       BLOQUEA el cierre con 400 mientras no haya una sesión aprobada
 *     → el gestor la finaliza y el vecino ve el cierre en Mis Trámites.
 *
 * La matriz de 20 casos vive en el fixture del tenant. La marca de corrida
 * viaja en el "detalle adicional" de la solicitud y es la que ancla TODAS las
 * búsquedas: sin ella se abría cualquier solicitud vieja del seed.
 */
const tenant = cargarTenant();

async function vecinoCreaSolicitud(page: Page, caso: CasoTramite, id: string): Promise<void> {
  await page.goto('/gestion/mis-tramites');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: 'Nuevo Trámite' }).click();
  await page.getByPlaceholder(/Empezá a escribir/).fill(caso.tramite);
  // El resultado es un BOTÓN cuyo nombre accesible arranca con el trámite.
  const resultado = page.getByRole('button', { name: caso.tramite }).first();
  await resultado.waitFor({ state: 'visible', timeout: 20_000 });
  await resultado.click();

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

async function vecinoReservaTurno(page: Page, numero: string): Promise<void> {
  await page.goto('/gestion/mis-turnos');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: 'Reservar turno' }).first().click();
  const tituloSheet = page.getByRole('heading', { name: 'Reservar turno' });
  await tituloSheet.waitFor({ state: 'visible', timeout: 15_000 });

  // El turno es PARA LA SOLICITUD ya creada: pestaña "Para un trámite ya
  // iniciado" + el combo filtrado por SU código (el combo es searchable).
  await page.getByRole('button', { name: 'Para un trámite ya iniciado' }).click();
  await page.getByText('Elegí una solicitud').first().click();
  await page.getByPlaceholder('Buscar...').fill(numero);
  const opcion = page.getByRole('button', { name: numero, exact: true }).first();
  await opcion.waitFor({ state: 'visible', timeout: 15_000 });
  await opcion.click();

  // Primer horario disponible: el orden de la agenda es parte de lo probado.
  const slot = page.getByRole('button', { name: /^\d{1,2}:\d{2}/ }).first();
  await slot.waitFor({ state: 'visible', timeout: 25_000 });
  await slot.click();
  await page.getByRole('button', { name: 'Confirmar turno' }).click();
  // El éxito REAL es que el sheet cierre (el botón cambia de label mientras
  // reserva: no sirve como señal).
  await expect(tituloSheet).toBeHidden({ timeout: 45_000 });
}

/**
 * Abre en la bandeja de gestión LA solicitud del caso.
 *
 * Las filas no muestran la marca, así que se recorren las candidatas (mismo
 * trámite, mismo vecino, mismo estado) y se confirma DENTRO del sheet, donde
 * el detalle adicional sí se ve. Quedarse con `.first()` era una apuesta al
 * orden de la tabla: el seed y las corridas anteriores dejan varias filas
 * idénticas.
 */
async function gestorAbreSolicitud(
  page: Page,
  caso: CasoTramite,
  vecinoNombre: string,
  marca: string,
  estado?: RegExp,
): Promise<void> {
  await page.goto('/gestion/tramites');
  await cerrarAvisos(page);
  let filas = page.getByRole('row')
    .filter({ hasText: caso.tramite })
    .filter({ hasText: vecinoNombre });
  if (estado) filas = filas.filter({ hasText: estado });
  await filas.first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(900);

  const candidatas = Math.min(await filas.count(), 6);
  for (let i = 0; i < candidatas; i++) {
    const fila = filas.nth(i);
    await fila.getByRole('button', { name: 'Ver' }).click({ timeout: 10_000 }).catch(async () => { await fila.click(); });
    // El sheet imprime el detalle adicional: ahí vive la marca del caso.
    const detalle = page.getByText(marca, { exact: false }).first();
    if (await detalle.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) return;
    await cerrarSheet(page);
  }
  throw new Error(`No apareció en la bandeja de gestión la solicitud ${marca} de "${caso.tramite}"`);
}

/**
 * Verifica TODOS los documentos pendientes del sheet abierto.
 *
 * El botón "Verificado sin archivo" DESAPARECE al verificar (el requisito
 * pasa a tener documento): la lista se ACHICA a cada click. Iterar por índice
 * fijo pedía un nth() que ya no existe y el test se colgaba hasta el timeout.
 * Se clickea siempre el primero y la señal REAL de que la verificación entró
 * en la DB es que la cuenta baje.
 */
async function gestorVerificaDocumentos(page: Page): Promise<void> {
  const verificadores = page.getByRole('button', { name: 'Verificado sin archivo' });
  // La sección Documentos carga ASYNC: si a los 15s no hay ninguno, el
  // trámite no pide docs.
  await verificadores.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  for (let guarda = 0; guarda < 12; guarda++) {
    const pendientes = await verificadores.count();
    if (pendientes === 0) return;
    await verificadores.first().click();
    await expect
      .poll(() => verificadores.count(), { timeout: 25_000, intervals: [400] })
      .toBeLessThan(pendientes);
  }
  throw new Error('Quedaron documentos sin verificar después de 12 pasadas');
}

for (const caso of tenant.tramites) {
  const id = marcaDeCorrida(caso.caso);
  const vecinoRol = caso.caso % 2 === 0 ? 'vecino-2' : 'vecino';

  test(`tramite ${id} ${caso.tramite}${caso.conTurno ? ' + turno' : ''}`, async ({ browser }) => {
    // 1) El vecino crea la solicitud, PAGA si el trámite cobra al inicio (la
    //    solicitud nace PENDIENTE_PAGO y nadie puede trabajarla hasta que el
    //    dinero entra — checkout del provider mock), y reserva turno si aplica.
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, vecinoRol);
    await vecinoCreaSolicitud(vecino, caso, id);

    const sol = await abrirSolicitudDelVecino(vecino, caso.tramite, id);
    expect(sol.abierta, `la solicitud ${id} no apareció en Mis Trámites`).toBe(true);
    expect(sol.numero, `la solicitud ${id} no expuso su código SOL-`).toMatch(/^SOL-\d{4}-\d+$/);
    if (sol.urgente) await pagarDesdeElSheet(vecino);
    else await cerrarSheet(vecino);

    if (caso.conTurno) await vecinoReservaTurno(vecino, sol.numero);

    // 2) El gestor verifica los documentos. Con el último obligatorio la
    //    solicitud pasa SOLA a en curso; si el trámite no pide docs, el pase
    //    es manual.
    const { ctx: ctxGestor, page: gestion } = await contextoDe(browser, 'admin');
    const vecinoNombre = tenant.login.nombres?.[vecinoRol] ?? '';
    await gestorAbreSolicitud(gestion, caso, vecinoNombre, id);
    await gestion.waitForTimeout(900); // settle de la animación del sheet
    await gestorVerificaDocumentos(gestion);

    // El pase a en curso lo hace el backend al verificar el último obligatorio,
    // pero el sheet lo refleja recién con el autorefresh de 10s de la pantalla:
    // por eso se le da aire antes de decidir si hay que apretarlo a mano.
    const finalizar = gestion.getByRole('button', { name: 'Finalizar', exact: true }).first();
    const avanzoSolo = await finalizar.waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (!avanzoSolo) {
      // Trámite sin documentos obligatorios: el pase es manual (cierra el sheet).
      await gestion.getByRole('button', { name: 'Poner en Curso' }).click({ timeout: 10_000 });
      await gestion.waitForTimeout(2_000);
    }

    // 3) Cobro AL FINAL: el backend rechaza el cierre con 400 mientras el
    //    vecino no tenga una sesión de pago aprobada. Paga ahora, con el
    //    trabajo ya en curso (el pago es el hito POSTERIOR a los documentos).
    await vecinoPagaDeudaPendiente(vecino, caso.tramite, id);

    // 4) El gestor la finaliza. Reabrimos: cualquier acción cierra el sheet.
    await gestorAbreSolicitud(gestion, caso, vecinoNombre, id, /En Curso/i);
    await gestion.waitForTimeout(900);
    await finalizar.waitFor({ state: 'visible', timeout: 25_000 });
    await finalizar.click();
    // Señal REAL: el toast del backend. El label del botón cambia a
    // "Finalizando..." apenas se clickea, así que no sirve como señal.
    await expect(gestion.getByText('Trámite finalizado').first()).toBeVisible({ timeout: 40_000 });
    await ctxGestor.close();

    // 5) El vecino ve el cierre en SU solicitud (la del código, no cualquiera):
    //    se abre por número y el estado se lee DENTRO del panel.
    const cierre = await abrirSolicitudDelVecino(vecino, sol.numero, sol.numero);
    expect(cierre.abierta, `la solicitud ${sol.numero} no volvió a abrirse`).toBe(true);
    await expect(vecino.locator('.sheet-panel').last().getByText('Finalizado').first())
      .toBeVisible({ timeout: 20_000 });
    await ctxVecino.close();
  });
}
