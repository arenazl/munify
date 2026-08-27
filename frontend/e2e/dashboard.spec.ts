import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { cerrarAvisos, contextoDe } from './soporte/tenant';

/**
 * Tablero (dashboard MODULAR), de lectura. No escribe nada en la base.
 *
 * El dashboard lo reciben TODOS los clientes; lo que varía es su perfil de
 * MÓDULOS. Por eso este spec no pide expectativas en el fixture: las DERIVA
 * en vivo de las dos respuestas que la propia página consulta al cargar
 * (`GET /modulos/` y `GET /dashboard/actividad`), espejando las reglas del
 * registry (pages/Dashboard/registry.tsx). Sea Merlo, San Pedro Norte o una
 * demo recién nacida, el contrato es el mismo: módulos → secciones.
 *
 *   D1 — carga sin errores de API; las secciones que el perfil EXIGE están y
 *        las del perfil contrario NO (variante completa vs resumen incluida).
 *   D2 — regla del cero: la cinta de conteos jamás enuncia un cero.
 *   D3 — el orden: bloques por actividad (factor 3×, canónico si es parejo)
 *        y la Voz del Vecino cierra SIEMPRE.
 *
 * Anclajes ESTRUCTURALES, no texto suelto: el carrusel del hero repite los
 * labels de acción ("Ver los gastos") en slides ocultos y un getByText pelado
 * matchea eso. Acá se ancla en los títulos de sección del kit.
 */

/** Títulos estructurales de sección (los shells que usa el tablero). El de la
 *  Voz del Vecino cambia según haya o no calificaciones: la pieza del kit
 *  (`VozDelVecino`) titula "La voz del vecino" (.av2-voz-title) y la rama sin
 *  datos titula "Vecinos" (SectionTitleV2). */
const SEL_TITULOS = '.dv2-seccion-label, .tcola-enc-titulo, .dv2-card-titulo, .av2-voz-title';
const ANCLA_VOZ = 'Vecinos|La voz del vecino';

/** Semántica de municipio_modulos (lib/enums/modulos.ts): sin fila,
 *  opt-out = activo y opt-in = oculto. Sólo los dominios del tablero. */
const OPT_IN = new Set(['tesoreria', 'sueldos', 'contaduria', 'ordenes_trabajo', 'poi']);
interface FilaModulo { modulo: string; activo: boolean }
const moduloEfectivo = (filas: FilaModulo[], key: string): boolean => {
  const fila = filas.find((f) => f.modulo === key);
  return fila ? fila.activo : !OPT_IN.has(key);
};

interface DominioAct { total: number; ultimos30: number }
interface Actividad { reclamos: DominioAct; tramites: DominioAct; finanzas: DominioAct }
const CERO: DominioAct = { total: 0, ultimos30: 0 };

/** Espejo de `prioridadDominios`: burbuja con umbral 3×, canónico si es parejo. */
const FACTOR_EVIDENTE = 3;
function prioridad(actividad: Actividad | null): Array<'reclamos' | 'tramites' | 'finanzas'> {
  const orden: Array<'reclamos' | 'tramites' | 'finanzas'> = ['reclamos', 'tramites', 'finanzas'];
  if (!actividad) return orden;
  for (let pasada = 0; pasada < orden.length - 1; pasada++) {
    for (let i = 0; i < orden.length - 1 - pasada; i++) {
      if (actividad[orden[i + 1]].total > actividad[orden[i]].total * FACTOR_EVIDENTE) {
        const a = orden[i]; orden[i] = orden[i + 1]; orden[i + 1] = a;
      }
    }
  }
  return orden;
}

interface Tablero {
  ctx: BrowserContext;
  page: Page;
  fallidas: string[];
  reclamosOn: boolean;
  tramitesOn: boolean;
  finanzasOn: boolean;
  actividad: Actividad | null;
}

async function abrirTablero(browser: Browser): Promise<Tablero> {
  const { ctx, page } = await contextoDe(browser, 'admin');
  const fallidas: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) {
      fallidas.push(`${r.status()} ${new URL(r.url()).pathname}`);
    }
  });

  // Las MISMAS respuestas de las que vive la página: sin logins aparte.
  const respModulos = page
    .waitForResponse((r) => /\/api\/modulos\/?(\?|$)/.test(r.url()) && r.ok(), { timeout: 45_000 })
    .catch(() => null);
  const respActividad = page
    .waitForResponse((r) => r.url().includes('/dashboard/actividad') && r.ok(), { timeout: 45_000 })
    .catch(() => null);

  await page.goto('/gestion');
  await cerrarAvisos(page);

  const filas = ((await (await respModulos)?.json().catch(() => [])) ?? []) as FilaModulo[];
  const crudo = (await (await respActividad)?.json().catch(() => null)) as Partial<Actividad> | null;
  // FAIL-OPEN, como useActividad: sin actividad, todo dominio tiene historia.
  const actividad: Actividad | null = crudo
    ? { reclamos: crudo.reclamos ?? CERO, tramites: crudo.tramites ?? CERO, finanzas: crudo.finanzas ?? CERO }
    : null;
  const conHistoria = (d: keyof Actividad) => (actividad ? actividad[d].total > 0 : true);

  await expect(page.getByText('Cargando el tablero…')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.dv2-page')).toBeVisible({ timeout: 15_000 });

  return {
    ctx, page, fallidas, actividad,
    reclamosOn: moduloEfectivo(filas, 'reclamos') && conHistoria('reclamos'),
    tramitesOn: moduloEfectivo(filas, 'tramites') && conHistoria('tramites'),
    finanzasOn: moduloEfectivo(filas, 'tesoreria') && conHistoria('finanzas'),
  };
}

/** Locator EXACTO de un título de sección (hero y cinta quedan afuera).
 *  `texto` admite alternativas con `|` (ej. el título doble de la Voz). */
function titulo(page: Page, texto: string) {
  return page.locator(SEL_TITULOS).filter({ hasText: new RegExp(`^(?:${texto})$`) });
}

test.describe('tablero del admin (dashboard modular)', () => {
  test('D1 — carga sin errores de API, con las secciones del perfil y sin las ajenas', async ({ browser }) => {
    const t = await abrirTablero(browser);
    const { page } = t;

    // dominio → sus títulos de sección. La variante financiera la decide la
    // convivencia (registry: `soloSiDominioSolo`).
    const finanzasSola = t.finanzasOn && !t.reclamosOn && !t.tramitesOn;
    const esperadas: string[] = [
      ...(t.reclamosOn ? ['Tu cola de trabajo', 'Dónde se repiten los reclamos', 'Reclamos', ANCLA_VOZ] : []),
      ...(t.tramitesOn ? ['Trámites'] : []),
      ...(t.finanzasOn ? ['Tesorería'] : []),
      ...(finanzasSola ? ['Tu agenda de pagos'] : []),
    ];
    const prohibidas: string[] = [
      ...(t.reclamosOn ? [] : ['Tu cola de trabajo', 'Dónde se repiten los reclamos', 'Reclamos', ANCLA_VOZ]),
      ...(t.tramitesOn ? [] : ['Trámites']),
      ...(t.finanzasOn ? [] : ['Tesorería', 'Tu agenda de pagos']),
      // finanzas CONVIVIENDO: la variante completa no va ('Tu agenda de pagos'
      // es de la completa; 'Tesorería' queda igual porque lo lleva el resumen).
      ...(t.finanzasOn && !finanzasSola ? ['Tu agenda de pagos'] : []),
    ];

    for (const texto of esperadas) {
      await expect(titulo(page, texto).first(), `Falta la sección "${texto}"`)
        .toBeVisible({ timeout: 30_000 });
    }
    for (const texto of prohibidas) {
      await expect(titulo(page, texto), `La sección "${texto}" no corresponde a este perfil`)
        .toHaveCount(0);
    }
    expect(t.fallidas, `La carga del tablero devolvió errores de API: ${t.fallidas.join(' | ')}`)
      .toHaveLength(0);
    await t.ctx.close();
  });

  test('D2 — la cinta de conteos no enuncia ceros', async ({ browser }) => {
    const t = await abrirTablero(browser);
    test.skip(!t.reclamosOn && !t.tramitesOn, 'Perfil sin dominios operativos: la cinta no existe');

    const cinta = t.page.locator('.dcc');
    await expect(cinta, 'La cinta de conteos no se dibujó').toBeVisible({ timeout: 30_000 });
    await expect(cinta.locator('.dcc-valor').first()).toBeVisible();

    // La regla del cero (16 ramas auditadas en los armadores): un segmento con
    // valor 0 se OMITE, no se escribe. Un "0" suelto acá es una regresión.
    const texto = await cinta.innerText();
    expect(texto, `La cinta enuncia un cero: "${texto.replace(/\s+/g, ' ')}"`)
      .not.toMatch(/(^|[\s(])0([\s).,%]|$)/);
    await t.ctx.close();
  });

  test('D3 — los bloques van en el orden de la actividad y la Voz del Vecino cierra', async ({ browser }) => {
    const t = await abrirTablero(browser);
    const { page } = t;

    // Ancla de cada BLOQUE (su primer título) en el orden derivado.
    const anclaDe: Record<'reclamos' | 'tramites' | 'finanzas', string | null> = {
      reclamos: t.reclamosOn ? 'Tu cola de trabajo' : null,
      tramites: t.tramitesOn ? 'Trámites' : null,
      finanzas: t.finanzasOn ? 'Tesorería' : null,
    };
    const esperado = prioridad(t.actividad).map((d) => anclaDe[d]).filter((x): x is string => !!x);
    if (t.reclamosOn) esperado.push(ANCLA_VOZ); // alFondo: cierra SIEMPRE

    test.skip(esperado.length < 2, 'Con un solo bloque no hay orden que verificar');

    // El orden REAL sale del DOM (columna única): títulos en orden de documento.
    const reales = (await page.locator(SEL_TITULOS).allInnerTexts()).map((s) => s.trim());
    const posiciones = esperado.map((texto) => ({
      texto,
      i: reales.findIndex((r) => new RegExp(`^(?:${texto})$`).test(r)),
    }));
    for (const p of posiciones) {
      expect(p.i, `No apareció el título "${p.texto}" (títulos reales: ${reales.join(' · ')})`)
        .toBeGreaterThanOrEqual(0);
    }
    for (let k = 1; k < posiciones.length; k++) {
      expect(
        posiciones[k].i,
        `"${posiciones[k].texto}" debería ir DESPUÉS de "${posiciones[k - 1].texto}" `
        + `(orden real: ${reales.join(' · ')})`,
      ).toBeGreaterThan(posiciones[k - 1].i);
    }
    await t.ctx.close();
  });
});
