import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Browser, BrowserContext, Page } from '@playwright/test';

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
 * El vecino paga su solicitud MÁS RECIENTE si está pendiente de pago
 * (trámites con cobro AL INICIO). Camina el checkout del provider MOCK:
 * elegir medio → confirmar → comprobante. Si no hay botón de pago, no-op —
 * los tenants sin trámites con costo pasan de largo.
 */
export async function vecinoPagaSiCorresponde(page: Page, tramite?: string): Promise<boolean> {
  await page.goto('/gestion/mis-tramites');
  await cerrarAvisos(page);
  // El botón de pago vive DENTRO del sheet de la solicitud: se abre la más
  // reciente (la lista ordena desc; con `tramite` se acota por buscador).
  if (tramite) {
    const buscador = page.getByPlaceholder(/Buscar en mis trámites/i);
    if (await buscador.isVisible().catch(() => false)) {
      await buscador.fill(tramite);
      await page.waitForTimeout(1_200);
    }
  }
  const tarjeta = page.getByText(/^Solicitud: /).first();
  if (!(await tarjeta.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false))) {
    return false;
  }
  await tarjeta.click();
  // Se paga SOLO si el pago es REQUISITO (cobro al inicio: banner "Esperando
  // tu pago"). En los trámites con cobro al final el botón también existe
  // (pago voluntario anticipado) pero el circuito NO paga en la puerta.
  const urgente = page.getByText('Esperando tu pago').first();
  if (!(await urgente.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false))) {
    await page.keyboard.press('Escape');
    return false;
  }
  await page.getByRole('button', { name: /Pagar trámite/i }).first().click();
  // Redirección dura al checkout público del mock (/pago/checkout/{sesion}).
  await page.waitForURL(/\/pago\/checkout\//, { timeout: 30_000 });

  // Medio SIN formulario extra: "Dinero en cuenta" confirma directo. Si el
  // muni filtra medios y no está, se cae al primero disponible y se completa
  // el panel que aparezca.
  const medioDirecto = page.getByRole('button', { name: /Dinero en cuenta/i }).first();
  if (await medioDirecto.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)) {
    await medioDirecto.click();
  } else {
    await page.getByRole('button', { name: /Tarjeta|Rapipago|Pago Fácil|Débito/i }).first().click();
  }
  const continuar = page.getByRole('button', { name: /^Continuar$|Continuar/ }).first();
  if (await continuar.isVisible().catch(() => false)) await continuar.click();

  // Paneles especializados (tarjeta/cupón): botón "Pagar $..." o "Simular pago".
  const pagarPanel = page.getByRole('button', { name: /^Pagar |Simular pago/i }).first();
  if (await pagarPanel.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
    await pagarPanel.click();
  }

  // Éxito REAL: la pantalla de comprobante del checkout.
  await page.getByText(/comprobante/i).first().waitFor({ state: 'visible', timeout: 30_000 });
  return true;
}
