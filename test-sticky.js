const puppeteer = require('puppeteer');

(async () => {
  console.log('Iniciando browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();

  // Paso 1: Seleccionar municipio
  console.log('1. Seleccionando municipio Merlo...');
  await page.goto('http://localhost:5173/bienvenido', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    const merloBtn = Array.from(document.querySelectorAll('button')).find(b =>
      b.textContent?.toLowerCase().includes('merlo')
    );
    if (merloBtn) merloBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Paso 2: Login con acceso rápido
  console.log('2. Haciendo login con Ana López (Supervisor)...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // Click en Ana López
  const anaBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Ana'));
  });
  if (anaBtn) await anaBtn.click();
  await new Promise(r => setTimeout(r, 3000));

  // Verificar login
  let currentUrl = await page.url();
  console.log('URL actual:', currentUrl);

  if (!currentUrl.includes('/gestion')) {
    console.log('Intentando login de nuevo...');
    await page.screenshot({ path: 'debug-login.png' });
    // Esperar más
    await new Promise(r => setTimeout(r, 3000));
    currentUrl = await page.url();
    console.log('URL después de esperar:', currentUrl);
  }

  // Paso 3: Ir a Trámites
  console.log('3. Navegando a /gestion/tramites...');
  await page.goto('http://localhost:5173/gestion/tramites', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot inicial
  await page.screenshot({ path: 'tramites-initial.png' });
  console.log('Screenshot inicial: tramites-initial.png');

  // Paso 4: Scroll para probar sticky
  console.log('4. Scrolleando 500px para probar sticky...');
  await page.evaluate(() => window.scrollBy(0, 500));
  await new Promise(r => setTimeout(r, 1000));

  // Screenshot después de scroll
  await page.screenshot({ path: 'tramites-scrolled.png' });
  console.log('Screenshot con scroll: tramites-scrolled.png');

  // Análisis sticky
  const analysis = await page.evaluate(() => {
    const result = {
      scrollY: window.scrollY,
      stickyElements: []
    };

    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        result.stickyElements.push({
          tag: el.tagName,
          class: el.className.substring(0, 80),
          top: Math.round(rect.top),
          cssTop: style.top
        });
      }
    });

    return result;
  });

  console.log('\n=== RESULTADO ===');
  console.log('Scroll Y:', analysis.scrollY);
  console.log('Elementos sticky:', analysis.stickyElements.length);
  analysis.stickyElements.forEach((el, i) => {
    console.log(`  ${i+1}. ${el.tag} top=${el.top}px (css: ${el.cssTop})`);
    console.log(`     ${el.class}`);
  });

  if (analysis.stickyElements.length > 0 && analysis.scrollY > 100) {
    const pageHeader = analysis.stickyElements.find(e => e.class.includes('sticky'));
    if (pageHeader && pageHeader.top >= 0 && pageHeader.top < 150) {
      console.log('\n✅ STICKY FUNCIONA! El header está fijo arriba.');
    } else {
      console.log('\n❌ STICKY NO FUNCIONA - el header se fue con el scroll');
    }
  }

  console.log('\n🖥️  Browser abierto - probalo manualmente y cerralo cuando termines');
  console.log('   Ctrl+C en terminal para cerrar');

  // Mantener abierto indefinidamente
  await new Promise(() => {});

})().catch(e => {
  console.error('Error:', e.message);
});
