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
  };
  reclamos: CasoReclamo[];
  tramites: CasoTramite[];
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
  await page.waitForURL((url) => url.pathname.startsWith('/gestion'), { timeout: 30_000 });
  // El token queda en localStorage: esperamos que esté para que el
  // storageState guardado sirva.
  await page.waitForFunction(() => !!localStorage.getItem('token'), undefined, { timeout: 15_000 });
}

/** Abre un contexto ya logueado con la sesión guardada de ese rol. */
export async function contextoDe(browser: Browser, rol: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: rutaStorageState(rol),
    permissions: ['notifications'], // sin esto, el sheet "Las bloqueaste sin querer" tapa la UI
  });
  const page = await ctx.newPage();
  return { ctx, page };
}
