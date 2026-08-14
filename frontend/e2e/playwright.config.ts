import { defineConfig, devices } from '@playwright/test';

/**
 * Suite E2E de circuito completo, AGNÓSTICA de tenant.
 *
 * - `E2E_BASE_URL`: contra qué ambiente corre (default: la app local).
 * - `E2E_TENANT`: qué fixture de tenant usa (default: paraguay).
 *   Todo lo específico del tenant (credenciales, marca, categorías, matriz
 *   de casos) vive en `e2e/tenants/<tenant>.json` — los specs no conocen
 *   ningún dato de Asunción.
 * - `E2E_RUN_ID`: sufijo determinístico para poder distinguir corridas en la
 *   base (default: "dev"). La matriz de casos es FIJA: sin randoms.
 *
 * Un solo worker y sin retries a propósito: el circuito escribe en una DB
 * real compartida (QA) y el orden de los pasos es parte de lo que se prueba.
 */
export default defineConfig({
  testDir: '.',
  outputDir: './.artifacts',
  // Los circuitos doc-pesados (licencia: wizard + turno + 3 verificaciones)
  // superan los 2 min contra la DB de QA cargada.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './.report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Asuncion',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'circuito',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
