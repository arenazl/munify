import { test, expect, type Page } from '@playwright/test';
import { cargarTenant, cerrarAvisos, contextoDe, marcaDeCorrida, vecinoPagaSiCorresponde, type CasoTramite } from './soporte/tenant';

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

async function vecinoReservaTurno(page: Page, caso: CasoTramite): Promise<void> {
  await page.goto('/gestion/mis-turnos');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: 'Reservar turno' }).first().click();
  const tituloSheet = page.getByRole('heading', { name: 'Reservar turno' });
  await tituloSheet.waitFor({ state: 'visible', timeout: 15_000 });

  // El turno es PARA LA SOLICITUD ya creada: pestaña "Para un trámite ya
  // iniciado" + combo de solicitud (la más reciente de ese trámite = la
  // nuestra, con un solo worker no hay carreras).
  await page.getByRole('button', { name: 'Para un trámite ya iniciado' }).click();
  await page.getByText('Elegí una solicitud').first().click();
  // Las opciones listan el CÓDIGO de solicitud (SOL-...), ordenadas de la más
  // reciente a la más vieja: la primera es la recién creada (worker único).
  await page.getByText(/^SOL-\d{4}-\d+$/).first().click();

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
 * Abre en la bandeja de gestión la solicitud MÁS RECIENTE de ese trámite,
 * ESE vecino y ese estado. El scope por vecino evita tocar solicitudes del
 * seed u otras corridas (las filas no muestran la marca del caso).
 */
async function gestorAbreSolicitud(page: Page, caso: CasoTramite, vecinoNombre: string, estado?: RegExp): Promise<void> {
  await page.goto('/gestion/tramites');
  await cerrarAvisos(page);
  // Sin `estado` se abre la MÁS RECIENTE de ese trámite y vecino (la lista
  // ordena desc): los trámites online no entran como "Recibido" clásico.
  let fila = page.getByRole('row')
    .filter({ hasText: caso.tramite })
    .filter({ hasText: vecinoNombre });
  if (estado) fila = fila.filter({ hasText: estado });
  fila = fila.first();
  await fila.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(900);
  await fila.getByRole('button', { name: 'Ver' }).click({ timeout: 10_000 }).catch(async () => { await fila.click(); });
}

for (const caso of tenant.tramites) {
  const id = marcaDeCorrida(caso.caso);
  const vecinoRol = caso.caso % 2 === 0 ? 'vecino-2' : 'vecino';

  test(`tramite ${id} ${caso.tramite}${caso.conTurno ? ' + turno' : ''}`, async ({ browser }) => {
    // 1) El vecino crea la solicitud, PAGA si el trámite cobra al inicio
    //    (la solicitud nace PENDIENTE_PAGO y nadie puede trabajarla hasta que
    //    el dinero entra — checkout del provider mock), y reserva turno si aplica.
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, vecinoRol);
    await vecinoCreaSolicitud(vecino, caso, id);
    await vecinoPagaSiCorresponde(vecino, caso.tramite);
    if (caso.conTurno) await vecinoReservaTurno(vecino, caso);
    await ctxVecino.close();

    // 2) El gestor la pone en curso y la finaliza.
    const { ctx: ctxGestor, page: gestion } = await contextoDe(browser, 'admin');
    const vecinoNombre = tenant.login.nombres?.[vecinoRol] ?? '';
    await gestorAbreSolicitud(gestion, caso, vecinoNombre);
    await gestion.waitForTimeout(900); // settle de la animación del sheet

    // REGLA DE NEGOCIO REAL: recibido → en curso exige TODOS los documentos
    // obligatorios verificados; al verificar el último, la solicitud avanza
    // SOLA a en curso. Cada doc tiene SU botón (el botón no desaparece al
    // verificar: se clickea cada uno UNA vez, por índice).
    const verificadores = gestion.getByRole('button', { name: 'Verificado sin archivo' });
    // La sección Documentos carga ASYNC: esperar el primer verificador antes
    // de contar (si a los 15s no hay ninguno, el trámite no pide docs).
    await verificadores.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    const totalDocs = await verificadores.count();
    for (let i = 0; i < totalDocs; i++) {
      await verificadores.nth(i).click();
      await gestion.waitForTimeout(1_800); // cada verificación escribe en la DB real
    }

    // El pase a en curso puede ser AUTOMÁTICO (al verificar el último doc la
    // solicitud avanza sola y el botón desaparece en el acto) o manual: se
    // intenta el click con timeout corto y sin drama si ya no está.
    await gestion.getByRole('button', { name: 'Poner en Curso' })
      .click({ timeout: 8_000 }).catch(() => {});
    await gestion.waitForTimeout(2_000);

    // Finalizar (reabriendo en curso: las acciones cierran o refrescan el sheet).
    const finalizar = gestion.getByRole('button', { name: 'Finalizar', exact: true }).first();
    if (!(await finalizar.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false))) {
      await gestorAbreSolicitud(gestion, caso, vecinoNombre, /En Curso/i);
      await finalizar.waitFor({ state: 'visible', timeout: 25_000 });
    }
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
