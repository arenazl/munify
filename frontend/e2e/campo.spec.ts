import { test, expect, type Page, type Locator } from '@playwright/test';
import { cargarTenant, cerrarAvisos, contextoDe, marcaDeCorrida, type CasoReclamo } from './soporte/tenant';

/**
 * Circuito de CAMPO: inventario + órdenes de trabajo + cierre jerárquico.
 *
 * Los CUATRO actores del universo:
 *   - el vecino carga el reclamo;
 *   - el supervisor arma la OT: reserva ACTIVOS (camión), planea CONSUMIBLES
 *     (tornillos) y la asigna al operario;
 *   - el operario (cuadrilla) la trabaja y la COMPLETA con el consumo real
 *     — SIN cerrar los reclamos: eso no es suyo;
 *   - el supervisor revisa y FINALIZA el reclamo (el vecino ve el cierre).
 *
 * Reglas de negocio que se verifican con números exactos:
 *   - reservar un activo lo deja "En uso" y NADIE más puede tomarlo;
 *   - completar descuenta el consumo REAL (no el planeado) y libera activos;
 *   - cancelar libera activos y NO toca stock;
 *   - una OT con dos reclamos se puede cerrar PARCIAL: el supervisor
 *     finaliza el reparado y el otro sigue su circuito.
 *
 * Todo por la UI real, data-driven del bloque `campo` del tenant. La corrida
 * crea SUS PROPIOS ítems de inventario (marca [E2E <run>]) así la matemática
 * del stock es exacta y no depende de datos preexistentes.
 */
const tenant = cargarTenant();
const campo = tenant.campo;

const STOCK_INICIAL = 100;
const CONSUMO_PLANEADO = 25;
const CONSUMO_REAL = 20;
const STOCK_FINAL = STOCK_INICIAL - CONSUMO_REAL; // 80

const marca = marcaDeCorrida(41).replace('#41', 'campo'); // [E2E <run> campo]
const NOMBRE_ACTIVO = `Camión volcador ${marca}`;
const NOMBRE_CONSUMIBLE = `Tornillos galvanizados ${marca}`;

/** Abre un ModernSelect (por su texto visible actual) y elige una opción.
 *  `buscar` acota el dropdown searchable antes de clickear la opción. */
async function elegirDeSelect(page: Page, disparador: string | RegExp, opcion: string | RegExp, buscar?: string): Promise<void> {
  await page.getByRole('button', { name: disparador }).first().click();
  const buscador = page.getByPlaceholder('Buscar...').first();
  if (await buscador.isVisible().catch(() => false)) {
    const texto = buscar ?? (typeof opcion === 'string' ? opcion : '');
    if (texto) await buscador.fill(texto);
  }
  await page.getByRole('button', { name: opcion }).first().click();
}

/** Camina el wizard del vecino (mismo camino que reclamos.spec). */
async function vecinoCreaReclamo(page: Page, caso: CasoReclamo): Promise<void> {
  await page.goto('/gestion/crear-reclamo');
  await cerrarAvisos(page);
  await page.locator('input:visible').first().fill(`${marcaDeCorrida(caso.caso)} ${caso.detalle.slice(0, 70)}`);
  await page.getByRole('button', { name: /Prefiero elegir/i }).click();
  await page.getByRole('button', { name: caso.categoria, exact: true }).click();
  const direccion = page.getByPlaceholder(/Av\. San Mart/i);
  await direccion.waitFor({ state: 'visible' });
  await direccion.fill(caso.direccion);
  await page.getByPlaceholder(/frente a la plaza/i).fill('Referencia E2E campo');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  const detalle = page.locator('textarea:visible').first();
  if (await detalle.isVisible().catch(() => false)) await detalle.fill(caso.detalle);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Crear reclamo' }).click();
  await page.waitForURL(/mis-reclamos/, { timeout: 30_000 });
}

/** Busca un ítem en el ABM de Inventario y devuelve su fila. */
async function filaInventario(page: Page, nombre: string): Promise<Locator> {
  await page.goto('/gestion/inventario');
  await cerrarAvisos(page);
  const buscador = page.getByPlaceholder(/Buscar por nombre/i);
  await buscador.waitFor({ state: 'visible', timeout: 30_000 });
  await buscador.fill(nombre);
  const fila = page.getByRole('row', { name: nombre }).first();
  await fila.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(800); // settle del refetch con debounce
  return fila;
}

/** Crea un ítem de inventario por el Sheet del ABM (admin). */
async function crearItemInventario(page: Page, opts: {
  categoria: string; nombre: string; stock?: number; unidad?: string;
}): Promise<void> {
  await page.goto('/gestion/inventario');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: /Nuevo ítem/i }).click();
  await elegirDeSelect(page, /Elegí una categoría/i, opts.categoria);
  await page.getByPlaceholder(/Camioneta Ford|Cemento Portland/i).fill(opts.nombre);
  if (opts.stock != null) {
    // Grilla del consumible: Stock actual es el primer number input.
    await page.locator('input[type="number"]:visible').first().fill(String(opts.stock));
    if (opts.unidad) await page.getByPlaceholder(/bolsas, m3, u/i).fill(opts.unidad);
  }
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  // Señal real: el sheet se cierra y el ítem aparece en la lista.
  await expect(page.getByText(opts.nombre).first()).toBeVisible({ timeout: 20_000 });
}

/** Abre la OT cuyo título contiene la marca dada (bandeja de OT). */
async function abrirOT(page: Page, tituloMarca: string, filtroEstado?: RegExp): Promise<void> {
  await page.goto('/gestion/ordenes-trabajo');
  await cerrarAvisos(page);
  if (filtroEstado) await page.getByRole('button', { name: filtroEstado }).first().click().catch(() => {});
  const fila = page.getByText(tituloMarca, { exact: false }).first();
  for (let i = 0; i < 8 && !(await fila.isVisible().catch(() => false)); i++) {
    const cargarMas = page.getByRole('button', { name: /Cargar más/i }).first();
    if (await cargarMas.isVisible().catch(() => false)) await cargarMas.click();
    else await page.waitForTimeout(1_000);
  }
  await fila.click();
}

/** Pasa a en curso + finaliza un reclamo desde la bandeja de gestión
 *  (versión condensada del camino probado en reclamos.spec). */
async function supervisorFinalizaReclamo(page: Page, caso: CasoReclamo): Promise<void> {
  await page.goto('/gestion/reclamos');
  await cerrarAvisos(page);
  const buscador = page.getByPlaceholder(/Buscar por c/i);
  await buscador.waitFor({ state: 'visible', timeout: 30_000 });
  await buscador.fill(caso.direccion);
  const id = marcaDeCorrida(caso.caso);
  const fila = page.getByRole('row', { name: id }).first();
  await fila.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1_200);
  const accionesSheet = page.getByRole('button', { name: /Pasar a en curso|Finalizar|Rechazar/i }).first();
  for (let intento = 0; intento < 3; intento++) {
    await cerrarAvisos(page);
    await fila.getByRole('button', { name: 'Ver' }).click({ timeout: 8_000 }).catch(async () => { await fila.click().catch(() => {}); });
    if (await accionesSheet.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) break;
  }

  // Si sigue Recibido: elegir candidato (si hay), plan y a en curso.
  const pasar = page.getByRole('button', { name: 'Pasar a en curso' });
  if (await pasar.isVisible().catch(() => false)) {
    await page.getByText(/Buscando candidatos/i).first().waitFor({ state: 'hidden', timeout: 90_000 }).catch(() => {});
    const candidato = page.getByRole('radio').first();
    if (await candidato.isVisible().catch(() => false)) await candidato.click();
    const plan = page.getByRole('textbox', { name: /Qué se va a hacer/i });
    if (await plan.isVisible().catch(() => false)) await plan.fill(`${id} La cuadrilla ya trabajó la OT; se valida el cierre.`);
    await expect(pasar).toBeEnabled({ timeout: 15_000 });
    await pasar.click();
    await expect(page.getByRole('row', { name: id }).first()).toContainText(/En Curso/i, { timeout: 25_000 });
    // Reabrir para finalizar.
    await page.waitForTimeout(1_000);
    await fila.getByRole('button', { name: 'Ver' }).click({ timeout: 8_000 }).catch(async () => { await fila.click().catch(() => {}); });
  }

  const notaFinal = `${id} Validado por el supervisor: el trabajo de campo quedó bien hecho.`;
  const panelFinalizar = page.getByRole('button', { name: 'Finalizar Trabajo' });
  const descripcion = page.getByRole('textbox', { name: /cómo se resolvió/i });
  if (!(await descripcion.isVisible().catch(() => false))) await panelFinalizar.click();
  await descripcion.waitFor({ state: 'visible', timeout: 15_000 });
  await descripcion.fill(notaFinal);
  const submit = page.getByRole('button', { name: 'Finalizar', exact: true });
  if (!(await submit.isEnabled().catch(() => false))) {
    await page.getByRole('button', { name: 'Finalizado', exact: true }).click();
    if (!(await descripcion.inputValue().catch(() => ''))) await descripcion.fill(notaFinal);
  }
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  await submit.click();
  await expect(page.getByRole('row', { name: id }).first()).toContainText(/Finalizado/i, { timeout: 25_000 });
}

/** Crea una OT desde el ABM: reclamos vinculados + recursos + responsable. */
async function supervisorCreaOT(page: Page, opts: {
  titulo: string;
  reclamos: CasoReclamo[];
  reservarActivo?: boolean;
  consumo?: number;
}): Promise<void> {
  await page.goto('/gestion/ordenes-trabajo');
  await cerrarAvisos(page);
  await page.getByRole('button', { name: /Nueva orden/i }).click();
  await page.getByPlaceholder(/Poda y despeje/i).fill(opts.titulo);

  // Vincular reclamos (combo searchable: matchea por la marca del título).
  for (const r of opts.reclamos) {
    await elegirDeSelect(page, /Agregar reclamo/i,
      new RegExp(marcaDeCorrida(r.caso).replace(/[[\]]/g, '\\$&')), marcaDeCorrida(r.caso));
  }

  // Responsable = el operario del fixture (así el login de campo ve la OT
  // y el caso es determinístico — nada de ranking).
  await elegirDeSelect(page, /Responsable|Seleccionar/i, campo!.operarioNombre);

  // Recursos del inventario.
  if (opts.reservarActivo) {
    await elegirDeSelect(page, /Agregar del inventario/i,
      new RegExp(NOMBRE_ACTIVO.replace(/[[\]()]/g, '\\$&')), NOMBRE_ACTIVO);
  }
  if (opts.consumo != null) {
    await elegirDeSelect(page, /Agregar del inventario/i,
      new RegExp(NOMBRE_CONSUMIBLE.replace(/[[\]()]/g, '\\$&')), NOMBRE_CONSUMIBLE);
    // La cantidad planeada se edita en la fila del recurso recién agregado.
    const filaRecurso = page.locator('div', { hasText: NOMBRE_CONSUMIBLE }).locator('input[type="number"]:visible').last();
    await filaRecurso.fill(String(opts.consumo));
  }

  await page.getByRole('button', { name: /Guardar|Crear/i }).first().click();
  // Señal real: el sheet se cierra y la OT aparece en la bandeja.
  await expect(page.getByText(opts.titulo).first()).toBeVisible({ timeout: 25_000 });
}

test.describe.serial('circuito de campo (OT + inventario + cierre jerárquico)', () => {
  test.skip(!campo, 'el tenant no define el bloque campo');

  const [casoA, casoB, casoC] = campo ? campo.reclamos : [undefined, undefined, undefined] as unknown as CasoReclamo[];
  const TITULO_OT1 = `${marcaDeCorrida(casoA?.caso ?? 31)} OT de campo con recursos`;
  const TITULO_OT2 = `${marcaDeCorrida(casoB?.caso ?? 32)} OT doble para cierre parcial`;
  const TITULO_OT3 = `${marcaDeCorrida(casoC?.caso ?? 33)} OT que se cancela`;

  test('C1 — el admin da de alta los recursos (activo + consumible)', async ({ browser }) => {
    const { ctx, page } = await contextoDe(browser, 'admin');
    await crearItemInventario(page, { categoria: campo!.categoriaActivo, nombre: NOMBRE_ACTIVO });
    await crearItemInventario(page, {
      categoria: campo!.categoriaConsumible, nombre: NOMBRE_CONSUMIBLE,
      stock: STOCK_INICIAL, unidad: 'u',
    });
    const fila = await filaInventario(page, NOMBRE_CONSUMIBLE);
    await expect(fila).toContainText(String(STOCK_INICIAL));
    await ctx.close();
  });

  test('C2 — vecino reclama; el supervisor arma la OT: reserva el camión, planea tornillos y la asigna al operario', async ({ browser }) => {
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, 'vecino');
    await vecinoCreaReclamo(vecino, casoA);
    await ctxVecino.close();

    const { ctx, page } = await contextoDe(browser, campo!.supervisor);
    await supervisorCreaOT(page, {
      titulo: TITULO_OT1, reclamos: [casoA],
      reservarActivo: true, consumo: CONSUMO_PLANEADO,
    });
    // El activo quedó TOMADO: en inventario figura en uso.
    const fila = await filaInventario(page, NOMBRE_ACTIVO);
    await expect(fila).toContainText(/En uso/i);
    await ctx.close();
  });

  test('C3 — exclusividad: el camión tomado NO se ofrece para otra OT', async ({ browser }) => {
    const { ctx, page } = await contextoDe(browser, campo!.supervisor);
    await page.goto('/gestion/ordenes-trabajo');
    await cerrarAvisos(page);
    await page.getByRole('button', { name: /Nueva orden/i }).click();
    await page.getByRole('button', { name: /Agregar del inventario/i }).first().click();
    const buscador = page.getByPlaceholder('Buscar...').first();
    if (await buscador.isVisible().catch(() => false)) await buscador.fill(NOMBRE_ACTIVO);
    await expect(page.getByRole('button', { name: new RegExp(NOMBRE_ACTIVO.replace(/[[\]()]/g, '\\$&')) })).toHaveCount(0);
    await ctx.close();
  });

  test('C4 — el operario completa la OT con el consumo REAL, sin cerrar el reclamo', async ({ browser }) => {
    const { ctx, page } = await contextoDe(browser, campo!.operario);
    await abrirOT(page, TITULO_OT1, /^Asignada/);

    const queSeHizo = page.getByPlaceholder(/Qué se hizo/);
    await queSeHizo.waitFor({ state: 'visible', timeout: 20_000 });
    await queSeHizo.fill(`${marcaDeCorrida(casoA.caso)} Se repararon los baches; sobraron tornillos.`);

    // Consumo REAL: 20 en vez de los 25 planeados (el panel lo precarga con
    // el planeado — se corrige al número real). El input vive en la sección
    // "Consumo real usado" (la fila de Recursos tiene OTRO input igual pero
    // deshabilitado: no confundirlos).
    const seccionConsumo = page.getByText('Consumo real usado').locator('xpath=..');
    const consumoReal = seccionConsumo.locator('input[type="number"]').first();
    await consumoReal.waitFor({ state: 'visible', timeout: 15_000 });
    await consumoReal.fill(String(CONSUMO_REAL));

    // El checkbox "Finalizar también..." queda APAGADO: la cuadrilla no
    // cierra reclamos — eso es del supervisor (regla del circuito).
    const cascada = page.getByRole('checkbox');
    if (await cascada.first().isChecked().catch(() => false)) await cascada.first().uncheck();

    const completar = page.getByRole('button', { name: 'Completar', exact: true }).first();
    await expect(completar).toBeEnabled({ timeout: 10_000 });
    await completar.click();
    // Señal real: el sheet se cierra (la OT completada sale del filtro
    // "Asignada", así que la fila NO sirve como señal).
    await queSeHizo.waitFor({ state: 'hidden', timeout: 25_000 });
    await ctx.close();

    // Números exactos, verificados por el ADMIN (el operario no tiene la
    // pantalla de Inventario): stock 100 → 80 (descuenta el REAL, no el
    // planeado) y el camión vuelve a estar disponible.
    const { ctx: ctxAdmin, page: admin } = await contextoDe(browser, 'admin');
    const filaCons = await filaInventario(admin, NOMBRE_CONSUMIBLE);
    await expect(filaCons).toContainText(String(STOCK_FINAL));
    const filaAct = await filaInventario(admin, NOMBRE_ACTIVO);
    await expect(filaAct).not.toContainText(/En uso/i);
    await ctxAdmin.close();
  });

  test('C5 — el supervisor valida y FINALIZA el reclamo; el vecino ve el cierre', async ({ browser }) => {
    const { ctx, page } = await contextoDe(browser, campo!.supervisor);
    await supervisorFinalizaReclamo(page, casoA);
    await ctx.close();

    const { ctx: ctxFin, page: fin } = await contextoDe(browser, 'vecino');
    await fin.goto('/gestion/mis-reclamos');
    await cerrarAvisos(fin);
    const buscadorVecino = fin.getByPlaceholder(/Buscar en mis reclamos/i);
    if (await buscadorVecino.isVisible().catch(() => false)) await buscadorVecino.fill(casoA.direccion);
    await expect(fin.getByText(marcaDeCorrida(casoA.caso), { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(fin.getByText(/Finalizado/i).first()).toBeVisible({ timeout: 20_000 });
    await ctxFin.close();
  });

  test('C6 — cierre PARCIAL: una OT con dos reclamos; se finaliza solo el reparado', async ({ browser }) => {
    const { ctx: ctxVecino, page: vecino } = await contextoDe(browser, 'vecino');
    await vecinoCreaReclamo(vecino, casoB);
    await vecinoCreaReclamo(vecino, casoC);
    await ctxVecino.close();

    const { ctx, page } = await contextoDe(browser, campo!.supervisor);
    await supervisorCreaOT(page, { titulo: TITULO_OT2, reclamos: [casoB, casoC] });
    await ctx.close();

    // El operario la completa sin cerrar nada.
    const { ctx: ctxOp, page: op } = await contextoDe(browser, campo!.operario);
    await abrirOT(op, TITULO_OT2, /^Asignada/);
    const queSeHizo = op.getByPlaceholder(/Qué se hizo/);
    await queSeHizo.waitFor({ state: 'visible', timeout: 20_000 });
    await queSeHizo.fill(`${marcaDeCorrida(casoB.caso)} Se reparó una vereda; la otra quedó pendiente de material.`);
    const cascada = op.getByRole('checkbox');
    if (await cascada.first().isChecked().catch(() => false)) await cascada.first().uncheck();
    const completar = op.getByRole('button', { name: 'Completar', exact: true }).first();
    await expect(completar).toBeEnabled({ timeout: 10_000 });
    await completar.click();
    await queSeHizo.waitFor({ state: 'hidden', timeout: 25_000 });
    await ctxOp.close();

    // El supervisor finaliza SOLO el reclamo B; el C sigue abierto.
    const { ctx: ctxSup, page: sup } = await contextoDe(browser, campo!.supervisor);
    await supervisorFinalizaReclamo(sup, casoB);
    await sup.goto('/gestion/reclamos');
    await cerrarAvisos(sup);
    const buscador = sup.getByPlaceholder(/Buscar por c/i);
    await buscador.waitFor({ state: 'visible', timeout: 30_000 });
    await buscador.fill(casoC.direccion);
    const filaC = sup.getByRole('row', { name: marcaDeCorrida(casoC.caso) }).first();
    await filaC.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(filaC).not.toContainText(/Finalizado/i);
    await ctxSup.close();
  });

  test('C7 — cancelar una OT libera el activo y NO descuenta stock', async ({ browser }) => {
    const { ctx, page } = await contextoDe(browser, campo!.supervisor);
    await supervisorCreaOT(page, {
      titulo: TITULO_OT3, reclamos: [],
      reservarActivo: true, consumo: 10,
    });
    await abrirOT(page, TITULO_OT3, /^Asignada/);
    // Botón "Cancelar OT" del sheet → ConfirmModal con motivo → confirmar
    // (el botón de confirmación del modal también dice "Cancelar OT").
    await page.getByRole('button', { name: 'Cancelar OT', exact: true }).first().click();
    const motivo = page.locator('textarea:visible').last();
    if (await motivo.isVisible().catch(() => false)) await motivo.fill('Cancelada por el circuito E2E (caso C7).');
    await page.getByRole('button', { name: 'Cancelar OT', exact: true }).last().click();
    await page.getByText('Cancelar orden de trabajo').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});

    const filaAct = await filaInventario(page, NOMBRE_ACTIVO);
    await expect(filaAct).not.toContainText(/En uso/i);
    const filaCons = await filaInventario(page, NOMBRE_CONSUMIBLE);
    await expect(filaCons).toContainText(String(STOCK_FINAL)); // sigue en 80
    await ctx.close();
  });

  test('C8 — negativo: el operario no tiene las acciones de gestión del reclamo', async ({ browser }) => {
    const { ctx, page } = await contextoDe(browser, campo!.operario);
    await page.goto('/gestion/reclamos');
    await cerrarAvisos(page);
    await page.waitForTimeout(2_000);
    // O la ruta lo saca, o la bandeja que ve no ofrece las acciones de cierre.
    const finalizar = page.getByRole('button', { name: 'Finalizar Trabajo' });
    const pasar = page.getByRole('button', { name: 'Pasar a en curso' });
    await expect(finalizar).toHaveCount(0);
    await expect(pasar).toHaveCount(0);
    await ctx.close();
  });
});
