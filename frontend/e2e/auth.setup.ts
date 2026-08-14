import { test as setup } from '@playwright/test';
import { asegurarAuthDir, cargarTenant, contextoNuevo, loginPersonaUI, rutaStorageState } from './soporte/tenant';

/**
 * Autenticación previa: UNA sesión por rol lógico del fixture, guardada como
 * storageState. Los specs abren contextos ya logueados y no repiten el login
 * en cada caso (el circuito prueba el negocio, no el login 40 veces —
 * el login en sí queda probado acá, una vez por rol).
 */
const tenant = cargarTenant();

setup.beforeAll(() => asegurarAuthDir());

for (const rol of Object.keys(tenant.login.personas)) {
  setup(`login ${rol}`, async ({ browser }) => {
    const ctx = await contextoNuevo(browser);
    const page = await ctx.newPage();
    await loginPersonaUI(page, tenant, rol);
    await ctx.storageState({ path: rutaStorageState(rol) });
    await ctx.close();
  });
}
