import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failed = 0;

  const arbol = [
    { id: 'general', hijos: ['muni', 'qr', 'apariencia'] },
    { id: 'personal', hijos: ['empleados', 'cuadrillas', 'ausencias'] },
    { id: 'vecino', hijos: ['vecinos', 'cat-reclamo', 'arbol-tramite', 'sla', 'tipos-poi'] },
    { id: 'catalogos', hijos: ['dependencias', 'asignacion', 'zonas'] },
    { id: 'inventario', hijos: ['inv', 'cat-inv'] },
    { id: 'tesoreria', hijos: ['conceptos', 'conceptos-liq', 'tipos-empleado', 'cajas', 'retenciones', 'parajes', 'proyectos', 'tarjetas', 'contactos', 'tasas'] },
    { id: 'integraciones', hijos: ['pagos', 'wa', 'ia'] },
    { id: 'super', hijos: ['auditoria', 'suscripciones', 'sidebar'] }
  ];

  for (const p of arbol) {
    for (const h of p.hijos) {
      const url = `http://localhost:5173/configuracion-mockup?tab=${p.id}&sub=${h}`;
      await page.goto(url);
      await page.waitForTimeout(100);
      
      const hasErrors = await page.evaluate(() => {
        return !!document.querySelector('.error-boundary') || document.body.innerText.includes('Cannot read properties of undefined');
      });

      const title = await page.evaluate(() => {
        const el = document.querySelector('h2'); // The title in the riel
        return el ? el.innerText : 'NO TITLE';
      });

      if (hasErrors) {
        console.log(`❌ ERROR on ${p.id} -> ${h}`);
        failed++;
      } else {
        console.log(`✅ OK: ${p.id} -> ${h} (${title})`);
      }
    }
  }

  await browser.close();
  console.log(`\nFinished! Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
