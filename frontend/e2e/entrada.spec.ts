import { test, expect, type Page } from '@playwright/test';

/** El ambiente sale del entorno y NO de `use.baseURL`: este spec se corre suelto
 *  (`npx playwright test e2e/entrada.spec.ts`) y ahi la config de la suite no
 *  se aplica. Ademas no necesita el `auth.setup` del project `circuito`: mide
 *  la puerta, no lo que hay adentro. */
const BASE = (process.env.E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');

/**
 * LA PUERTA DE ENTRADA — que nadie quede encerrado, venga de donde venga.
 *
 * Por qué existe este spec, y no como ejercicio: el 2026-09-15 la app dejó
 * gente afuera de TRES maneras distintas en el mismo día, y las tres pasaron
 * `npm run build` y `eslint` sin una queja.
 *
 *   1. Al perder el token, `ProtectedRoute` mandaba a `/demos-listado` — una
 *      grilla de super admin, sin layout, sin login. El cliente productivo
 *      escribió: *"Abro la app y no está mi usuario de la muni. Tampoco sé
 *      cómo iniciar sesión"*.
 *   2. Un hotfix puso esa grilla detrás del guard y dejó el otro extremo vivo:
 *      /demos-listado → /login → /demos-listado. Bucle infinito, pantalla en
 *      blanco, 1.207 "Throttling navigation" en la consola de producción.
 *   3. Arreglado eso, `/login` sin municipio recordado renderizaba el hero y
 *      una botonera vacía: CERO inputs, CERO botones. Nadie podía entrar.
 *
 * Ninguna de las tres la ve un compilador. Todas se ven abriendo la página.
 * Por eso lo que se afirma acá son HECHOS DEL DOM —cuántos inputs hay, a qué
 * URL se llegó— y no llamadas a funciones.
 *
 *     E2E_BASE_URL=https://qa.munify.com.ar npx playwright test entrada.spec.ts
 *
 * No necesita credenciales ni fixture de tenant: mide la puerta, no lo que hay
 * adentro. El caso "entrar de verdad" vive en los specs de circuito.
 */

const MUNI_RECORDADO = {
  municipio_codigo: 'merlo',
  municipio_id: '1000149',
  municipio_nombre: 'Municipalidad de Merlo',
  municipio_color: '#3b82f6',
};

/** Deja el localStorage como lo tendría alguien que entró alguna vez por un
 *  municipio y despues perdio la sesion: municipio recordado, sin token. */
async function conMunicipioRecordado(page: Page, baseURL: string) {
  await page.goto(`${BASE}/login`);
  await page.evaluate((datos) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(datos)) localStorage.setItem(k, v as string);
  }, MUNI_RECORDADO);
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
}

async function sinNada(page: Page, baseURL: string) {
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
}

/** Lo único que importa de una puerta: que se pueda operar. */
async function sePuedeOperar(page: Page) {
  return {
    inputs: await page.locator('input:visible').count(),
    botones: await page.locator('button:visible, a:visible, [role="button"]:visible').count(),
    url: new URL(page.url()).pathname,
  };
}

test.describe('La puerta de entrada', () => {
  test('sin municipio recordado se puede escribir mail y clave', async ({ page }) => {
    await sinNada(page, BASE);
    const d = await sePuedeOperar(page);

    // ESTE es el caso que estuvo roto: hero, "Elegí un perfil" y nada más.
    expect(d.inputs, 'la pantalla tiene que tener campos para escribir').toBeGreaterThanOrEqual(2);
    expect(page.locator('input[type="email"], input[type="password"]').first()).toBeVisible();
    expect(d.url, 'no puede redirigir a ningún lado').toBe('/login');
  });

  test('con un municipio ajeno recordado hay una SALIDA, y lleva a una pantalla usable', async ({ page }) => {
    await conMunicipioRecordado(page, BASE);

    const salida = page.getByRole('button', { name: /no es tu municipio/i });
    await expect(salida, 'tiene que haber forma de salir del municipio equivocado').toBeVisible();

    await salida.click();
    await page.waitForLoadState('networkidle');

    // Lo que Infra encontró roto el 2026-09-15: la salida existía y
    // desembocaba en una pantalla sin un solo control.
    const d = await sePuedeOperar(page);
    expect(d.inputs, 'después de salir tiene que poder escribir sus credenciales').toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => localStorage.getItem('municipio_codigo')),
      'el municipio recordado tiene que quedar limpio').toBeNull();
  });

  test('perder la sesión lleva al LOGIN, nunca a la grilla de demos', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(() => localStorage.clear());

    // Una ruta protegida sin sesión: es lo que le pasa a cualquiera cuando se
    // le vence el token de 24h.
    await page.goto(`${BASE}/gestion`);
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).pathname,
      'sin sesión se va a la puerta, jamás a una grilla de super admin').not.toContain('demos-listado');

    const d = await sePuedeOperar(page);
    expect(d.inputs + d.botones, 'donde caiga, tiene que poder hacer algo').toBeGreaterThan(0);
  });

  test('ninguna puerta entra en bucle de redirección', async ({ page }) => {
    const navegaciones: string[] = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navegaciones.push(f.url()); });

    for (const ruta of ['/login', '/demo', '/bienvenido', '/demos-listado']) {
      navegaciones.length = 0;
      await page.goto(`${BASE}${ruta}`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}${ruta}`);
      await page.waitForTimeout(3000);   // el bucle se delata solo en 3 segundos

      // El bucle de producción hizo 1.207 navegaciones. Un redirect legítimo
      // hace dos o tres.
      expect(navegaciones.length, `${ruta} entró en bucle: ${navegaciones.length} navegaciones`)
        .toBeLessThan(8);
    }
  });

  test('no quedó ningún acceso con Google', async ({ page }) => {
    await sinNada(page, BASE);
    await expect(page.getByText(/continuar con google/i)).toHaveCount(0);
  });
});
