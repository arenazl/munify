import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';

// El paquete es ESM: __dirname clásico no existe.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fixture de tenant + helpers de sesión por rol.
 *
 * Los specs NUNCA hardcodean un dato del municipio: todo sale del JSON de
 * `e2e/tenants/`. Para correr contra otro tenant alcanza con otro JSON y
 * `E2E_TENANT=<id>` — los circuitos son los mismos.
 *
 * El login usa el PICKER de personas de la demo (un click = una sesión).
 * Si un tenant no tiene picker, se agrega acá el camino email+password
 * leyendo `usuarios` del fixture (mismo contrato, otro `login.tipo`).
 */

export interface CasoReclamo {
  caso: number;
  categoria: string;
  dep: string;
  direccion: string;
  detalle: string;
  /** 'resolver' = el gestor resuelve directo · 'ot' = pasa por orden de trabajo. */
  circuito: 'resolver' | 'ot';
}

export interface CasoTramite {
  caso: number;
  tramite: string;
  conTurno: boolean;
}

/** Bloque del circuito de CAMPO (OT + inventario + cierre jerárquico). */
export interface BloqueCampo {
  /** rol del picker que opera en campo (debe existir en login.personas). */
  operario: string;
  /** nombre visible del operario en el select "Responsable" de la OT. */
  operarioNombre: string;
  /** rol del picker que gestiona las OT y cierra los reclamos. */
  supervisor: string;
  /** categorías de inventario REALES del tenant, una de cada naturaleza. */
  categoriaActivo: string;
  categoriaConsumible: string;
  /** tres reclamos del circuito: A (simple), B y C (parcial en una misma OT). */
  reclamos: CasoReclamo[];
}

export interface Tenant {
  id: string;
  nombre: string;
  rutaMarca: string;
  password: string;
  usuarios: {
    admin: string;
    vecinos: string[];
    supervisores: Record<string, string>;
  };
  login: {
    tipo: 'picker';
    /** rol lógico → texto del botón de persona en el picker de la demo. */
    personas: Record<string, string>;
    /** rol lógico → nombre visible en las filas de gestión (para scopear). */
    nombres?: Record<string, string>;
  };
  reclamos: CasoReclamo[];
  tramites: CasoTramite[];
  /** opcional: tenants sin el bloque se saltean campo.spec.ts. */
  campo?: BloqueCampo;
}

export const TENANT_ID = process.env.E2E_TENANT || 'paraguay';
export const RUN_ID = process.env.E2E_RUN_ID || 'dev';

export function cargarTenant(): Tenant {
  const ruta = path.join(__dirname, '..', 'tenants', `${TENANT_ID}.json`);
  return JSON.parse(fs.readFileSync(ruta, 'utf-8')) as Tenant;
}

/** Marca determinística en los textos que la corrida escribe en la DB. */
export function marcaDeCorrida(caso: number): string {
  return `[E2E ${RUN_ID} #${String(caso).padStart(2, '0')}]`;
}

const AUTH_DIR = path.join(__dirname, '..', '.auth');

export function rutaStorageState(rol: string): string {
  return path.join(AUTH_DIR, `${TENANT_ID}-${rol}.json`);
}

export function asegurarAuthDir(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

/**
 * Cierra los avisos que tapan la pantalla (sheet de notificaciones
 * bloqueadas, tips "Entendido"). Idempotente: si no hay nada, no hace nada.
 */
export async function cerrarAvisos(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const dialogo = page.locator('[role="dialog"]:visible').last();
    const botonDialogo = dialogo.getByRole('button', { name: /Cerrar|Entendido/ }).first();
    if (await botonDialogo.isVisible().catch(() => false)) { await botonDialogo.click().catch(() => {}); await page.waitForTimeout(300); continue; }
    const entendido = page.getByRole('button', { name: 'Entendido' }).first();
    if (await entendido.isVisible().catch(() => false)) { await entendido.click().catch(() => {}); await page.waitForTimeout(300); continue; }
    break;
  }
}

/** Login por el picker de personas de la demo (auth.setup.ts). */
export async function loginPersonaUI(page: Page, tenant: Tenant, rol: string): Promise<void> {
  const persona = tenant.login.personas[rol];
  if (!persona) throw new Error(`El tenant ${tenant.id} no define la persona para el rol "${rol}"`);
  await page.goto(tenant.rutaMarca);
  const boton = page.getByRole('button', { name: persona });
  await boton.waitFor({ state: 'visible', timeout: 30_000 });
  await boton.click();
  // Demo PROTEGIDA: al tocar el perfil aparece el modal de PIN. La clave es
  // la `password` del fixture (el PIN ES la password de los usuarios demo).
  // En tenants sin PIN el modal no existe y se sigue directo a /gestion.
  const modalPin = page.getByRole('dialog', { name: 'Demo protegida' });
  const pidioPin = await Promise.race([
    modalPin.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false),
    page.waitForURL((url) => url.pathname.startsWith('/gestion'), { timeout: 30_000 }).then(() => false).catch(() => false),
  ]);
  if (pidioPin) {
    await modalPin.getByPlaceholder('PIN numérico').fill(tenant.password);
    await modalPin.getByRole('button', { name: 'Entrar' }).click();
  }
  await page.waitForURL((url) => url.pathname.startsWith('/gestion'), { timeout: 30_000 });
  // El token queda en localStorage: esperamos que esté para que el
  // storageState guardado sirva.
  await page.waitForFunction(() => !!localStorage.getItem('token'), undefined, { timeout: 15_000 });
}

/**
 * El sheet "Las bloqueaste sin querer" reaparece en momentos aleatorios y
 * tapa clicks. Se lo apaga en la RAÍZ: sus flags de "ya mostrado" quedan
 * seteados ANTES de que la app arranque (claves de
 * NotificationActivationSheet.tsx). cerrarAvisos() queda de respaldo.
 */
const STUB_AVISOS = `
  try {
    localStorage.setItem('notif_activation_denied_shown', String(Date.now()));
    localStorage.setItem('notif_activation_post_creation_shown', String(Date.now()));
    localStorage.setItem('notif_activation_dismiss_count', '99');
    localStorage.setItem('notif_activation_last_dismissal', String(Date.now()));
  } catch (e) { /* almacenamiento no disponible: el respaldo es cerrarAvisos */ }
`;

export async function contextoNuevo(browser: Browser, opts: { storageState?: string } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
    permissions: ['notifications'],
  });
  await ctx.addInitScript(STUB_AVISOS);
  return ctx;
}

/** Abre un contexto ya logueado con la sesión guardada de ese rol. */
export async function contextoDe(browser: Browser, rol: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await contextoNuevo(browser, { storageState: rutaStorageState(rol) });
  const page = await ctx.newPage();
  return { ctx, page };
}

/**
 * Cierra el side panel (`components/ui/Sheet`) por su BACKDROP.
 *
 * El Sheet NO escucha Escape: cerrarlo con teclado era un no-op silencioso
 * que dejaba el panel encima y hacía fallar el click siguiente.
 */
export async function cerrarSheet(page: Page): Promise<void> {
  const backdrop = page.locator('.sheet-backdrop').last();
  if (await backdrop.isVisible().catch(() => false)) {
    // Arriba a la izquierda: el panel vive pegado al borde derecho.
    await backdrop.click({ position: { x: 8, y: 8 }, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

const visible = (l: Locator) => l.isVisible().catch(() => false);

/**
 * El checkout del provider MOCK (`PayBridgeCheckout`) se pinta en UNA de
 * cinco formas según los `medios_soportados` que el backend deriva del
 * `tipo_pago` del trámite:
 *
 *   boton_pago      → selector con tarjeta + dinero en cuenta
 *   rapipago        → panel de cupón (un solo botón: "Simular pago...")
 *   adhesion_debito → panel de adhesión: CBU de 22 dígitos + aceptar T&C
 *   sólo tarjeta    → formulario de tarjeta
 *   sesión aprobada → comprobante directo
 *
 * Reconocerlas es OBLIGATORIO: elegir "el primer medio que matchee" mandaba
 * el circuito a la adhesión por débito y ahí el botón queda DESHABILITADO
 * hasta cargar el CBU — se colgaba hasta el timeout del test.
 */
type FormaCheckout = 'comprobante' | 'debito' | 'cupon' | 'tarjeta' | 'selector' | 'cargando';

function comprobanteDelCheckout(page: Page): Locator {
  return page.getByRole('button', { name: 'Volver al municipio' });
}

async function formaDelCheckout(page: Page): Promise<FormaCheckout> {
  if (await visible(comprobanteDelCheckout(page))) return 'comprobante';
  if (await visible(page.getByRole('heading', { name: 'Adhesión a débito automático' }))) return 'debito';
  if (await visible(page.getByRole('button', { name: /Simular pago en sucursal/i }))) return 'cupon';
  if (await visible(page.getByRole('heading', { name: 'Datos de tu tarjeta' }))) return 'tarjeta';
  if (await visible(page.getByRole('button', { name: /Continuar/ }))) return 'selector';
  return 'cargando';
}

async function esperarFormaCheckout(page: Page, timeout = 30_000): Promise<FormaCheckout> {
  const limite = Date.now() + timeout;
  while (Date.now() < limite) {
    const forma = await formaDelCheckout(page);
    if (forma !== 'cargando') return forma;
    await page.waitForTimeout(400);
  }
  return 'cargando';
}

/** Camina el checkout del mock hasta el comprobante, sea cual sea su forma. */
export async function caminarCheckoutMock(page: Page): Promise<void> {
  // Redirección dura al checkout público del mock (/pago/checkout/{sesion}).
  await page.waitForURL(/\/pago\/checkout\//, { timeout: 30_000 });

  for (let paso = 0; paso < 4; paso++) {
    const forma = await esperarFormaCheckout(page);

    if (forma === 'comprobante') return;

    if (forma === 'selector') {
      // Los medios que confirman de una: el de tarjeta abre un formulario.
      const directo = page
        .getByRole('button', { name: /Dinero en cuenta|Transferencia bancaria|Pago Fácil, Rapipago|Débito automático/i })
        .first();
      if (await visible(directo)) {
        await directo.click();
        await page.getByRole('button', { name: /Continuar/ }).first().click();
      } else {
        await page.getByRole('button', { name: /Tarjeta de crédito/i }).first().click();
        continue; // la vuelta siguiente ve el formulario de tarjeta
      }
    } else if (forma === 'tarjeta') {
      // Números de PRUEBA del sandbox (no hay cobro real: el provider es mock).
      await page.getByPlaceholder('1234 5678 9012 3456').fill('4111111111111111');
      await page.getByPlaceholder('LUCAS ARENAZ').fill('CIRCUITO E2E');
      await page.getByPlaceholder('MM/AA').fill('1230');
      await page.getByPlaceholder('123').fill('123');
      await page.getByPlaceholder('30123456').fill('4555111');
      await page.getByRole('button', { name: /^Pagar / }).first().click();
    } else if (forma === 'cupon') {
      await page.getByRole('button', { name: /Simular pago en sucursal/i }).click();
    } else if (forma === 'debito') {
      // "Confirmar adhesión" nace DESHABILITADO: exige CBU de 22 dígitos + T&C.
      await page.getByPlaceholder('0000000000000000000000').fill('0000000000000000000000');
      await page.getByRole('checkbox').first().check();
      await page.getByRole('button', { name: /Confirmar adhesión/i }).click();
    } else {
      throw new Error('El checkout del mock no pintó ningún panel de pago reconocible');
    }

    // Éxito REAL: la pantalla de comprobante ("Volver al municipio"). Los
    // labels de los botones cambian mientras procesan: no sirven de señal.
    if (await comprobanteDelCheckout(page).waitFor({ state: 'visible', timeout: 45_000 }).then(() => true).catch(() => false)) {
      return;
    }
  }
  throw new Error('El checkout del mock nunca llegó al comprobante');
}

/** Lo que el sheet de Mis Trámites dice de la solicitud recién abierta. */
export interface SolicitudAbierta {
  /** false = no se encontró la tarjeta en Mis Trámites. */
  abierta: boolean;
  /** código SOL-AAAA-N leído del título del sheet (ancla para el turnero). */
  numero: string;
  /** el trámite tiene costo (dato del endpoint /pagos/estado-solicitud). */
  requierePago: boolean;
  /** ya hay una sesión de pago aprobada. */
  pagado: boolean;
  /** banner "Esperando tu pago": el pago es REQUISITO para que avance. */
  urgente: boolean;
}

/**
 * Abre en Mis Trámites la solicitud del caso y devuelve su estado de pago.
 *
 * Con `marca` (la del run, que viaja en el detalle adicional) la tarjeta se
 * ubica por un texto ÚNICO en la base: nada de "la primera de la lista", que
 * mezclaba las solicitudes del seed y de corridas anteriores.
 */
export async function abrirSolicitudDelVecino(page: Page, tramite?: string, marca?: string): Promise<SolicitudAbierta> {
  const vacia: SolicitudAbierta = { abierta: false, numero: '', requierePago: false, pagado: false, urgente: false };
  await page.goto('/gestion/mis-tramites');
  await cerrarAvisos(page);
  if (tramite) {
    const buscador = page.getByPlaceholder(/Buscar en mis trámites/i);
    if (await visible(buscador)) {
      await buscador.fill(tramite);
      await page.waitForTimeout(1_200);
    }
  }
  const tarjeta = marca
    ? page.getByText(marca, { exact: false }).first()
    : page.getByText(/^Solicitud: /).first();
  if (!(await tarjeta.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false))) {
    return vacia;
  }

  // El sheet resuelve el estado de pago contra la API; MIENTRAS CARGA asume
  // NO pagado y el botón de pagar aparece igual. Se lee la RESPUESTA, no el
  // parpadeo del DOM. (La pide sólo si el trámite tiene costo: sin costo la
  // request no existe y esperarla sería tiempo tirado.)
  const respuestaPago = page
    .waitForResponse((r) => r.url().includes('/pagos/estado-solicitud/') && r.status() === 200, { timeout: 25_000 })
    .catch(() => null);
  await tarjeta.click();

  const titulo = page.getByRole('heading', { name: /^Trámite SOL-/ }).first();
  const abierta = await titulo.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  if (!abierta) return vacia;
  const numero = (await titulo.innerText()).match(/SOL-\d{4}-\d+/)?.[0] ?? '';

  // Con costo el footer pinta "Pagar trámite" o "Pago confirmado"; sin costo
  // no pinta ninguno de los dos.
  const botonPagar = page.getByRole('button', { name: /Pagar trámite/i }).first();
  const yaPagado = page.getByText('Pago confirmado').first();
  let tieneCosto = false;
  for (let i = 0; i < 12 && !tieneCosto; i++) {
    tieneCosto = (await visible(botonPagar)) || (await visible(yaPagado));
    if (!tieneCosto) await page.waitForTimeout(500);
  }
  const res = tieneCosto ? await respuestaPago : null;
  const datos = res ? await res.json().catch(() => null) : null;
  const urgente = tieneCosto && await page.getByText('Esperando tu pago').first()
    .waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);

  return {
    abierta: true,
    numero,
    requierePago: !!datos?.requiere_pago,
    pagado: !!datos?.pagado,
    urgente,
  };
}

/** Dispara el pago desde el sheet ya abierto y camina el checkout. */
export async function pagarDesdeElSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Pagar trámite/i }).first().click();
  await caminarCheckoutMock(page);
}

/**
 * El vecino paga en la PUERTA: sólo si el pago es requisito para que la
 * solicitud avance (cobro al inicio → estado pendiente_pago → banner
 * "Esperando tu pago"). En los trámites con cobro al final el botón también
 * existe (pago anticipado voluntario) y el circuito NO paga acá.
 */
export async function vecinoPagaSiCorresponde(page: Page, tramite?: string, marca?: string): Promise<boolean> {
  const sol = await abrirSolicitudDelVecino(page, tramite, marca);
  if (!sol.abierta || !sol.urgente) {
    await cerrarSheet(page);
    return false;
  }
  await pagarDesdeElSheet(page);
  return true;
}

/**
 * El vecino salda lo que DEBE de esa solicitud (cobro al final). Sin esto el
 * backend rechaza el cierre con 400 "No se puede finalizar: el vecino aún no
 * pagó ...".
 */
export async function vecinoPagaDeudaPendiente(page: Page, tramite?: string, marca?: string): Promise<boolean> {
  const sol = await abrirSolicitudDelVecino(page, tramite, marca);
  if (!sol.abierta || !sol.requierePago || sol.pagado) {
    await cerrarSheet(page);
    return false;
  }
  await pagarDesdeElSheet(page);
  return true;
}
