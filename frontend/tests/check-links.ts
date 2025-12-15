import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5178';
const API_URL = 'http://localhost:8000';

interface LinkResult {
  url: string;
  status: 'ok' | 'error' | 'redirect';
  statusCode?: number;
  error?: string;
}

async function checkLinks() {
  console.log('=== Verificando Links de la Aplicacion ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: LinkResult[] = [];
  const consoleErrors: string[] = [];

  // Capturar errores de consola
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Rutas publicas a verificar
  const publicRoutes = [
    '/',
    '/login',
    '/register',
  ];

  // Rutas que requieren auth
  const protectedRoutes = [
    '/dashboard',
    '/mis-reclamos',
    '/reclamos/nuevo',
    '/tablero',
    '/reclamos',
    '/mapa',
    '/categorias',
    '/zonas',
    '/empleados',
    '/usuarios',
  ];

  console.log('1. Verificando rutas publicas...\n');

  for (const route of publicRoutes) {
    try {
      const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 10000 });
      const status = response?.status() || 0;

      if (status >= 200 && status < 400) {
        console.log(`   [OK] ${route} (${status})`);
        results.push({ url: route, status: 'ok', statusCode: status });
      } else {
        console.log(`   [ERROR] ${route} (${status})`);
        results.push({ url: route, status: 'error', statusCode: status });
      }
    } catch (err: any) {
      console.log(`   [ERROR] ${route} - ${err.message}`);
      results.push({ url: route, status: 'error', error: err.message });
    }
  }

  console.log('\n2. Verificando API endpoints...\n');

  const apiEndpoints = [
    '/api/categorias',
    '/api/zonas',
    '/docs',
    '/openapi.json',
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const response = await page.goto(`${API_URL}${endpoint}`, { waitUntil: 'networkidle', timeout: 10000 });
      const status = response?.status() || 0;

      if (status >= 200 && status < 400) {
        console.log(`   [OK] API ${endpoint} (${status})`);
        results.push({ url: `API:${endpoint}`, status: 'ok', statusCode: status });
      } else if (status === 401) {
        console.log(`   [AUTH] API ${endpoint} (${status}) - Requiere autenticacion`);
        results.push({ url: `API:${endpoint}`, status: 'ok', statusCode: status });
      } else {
        console.log(`   [ERROR] API ${endpoint} (${status})`);
        results.push({ url: `API:${endpoint}`, status: 'error', statusCode: status });
      }
    } catch (err: any) {
      console.log(`   [ERROR] API ${endpoint} - ${err.message}`);
      results.push({ url: `API:${endpoint}`, status: 'error', error: err.message });
    }
  }

  console.log('\n3. Probando login y rutas protegidas...\n');

  // Login como admin
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

  // Capturar screenshot y HTML para debug
  await page.screenshot({ path: 'tests/login-debug.png' });
  const html = await page.content();
  console.log('   HTML de la pagina login (primeros 500 chars):');
  console.log('   ' + html.substring(0, 500).replace(/\n/g, ' '));
  console.log('');

  // Capturar errores de JS
  const jsErrors = consoleErrors.filter(e => e.includes('SyntaxError') || e.includes('export'));
  if (jsErrors.length > 0) {
    console.log('   [ERROR] Errores JS encontrados:');
    jsErrors.forEach(e => console.log('   - ' + e.substring(0, 150)));
    console.log('');
  }

  // Esperar a que el input email este visible
  try {
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  } catch {
    console.log('   [ERROR] No se encontro input de email - la app React no se cargo');
    results.push({ url: '/login', status: 'error', error: 'React app not loaded' });
    await browser.close();
    return false;
  }

  // Llenar formulario de login
  await page.fill('input[type="email"]', 'admin@municipio.gob');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');

  // Esperar redireccion (que salga de /login)
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

  const currentUrl = page.url();
  // Admin va a '/' que es el dashboard index
  if (!currentUrl.includes('/login')) {
    console.log('   [OK] Login exitoso\n');

    // Verificar rutas protegidas
    for (const route of protectedRoutes) {
      try {
        const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 10000 });
        const status = response?.status() || 0;

        if (status >= 200 && status < 400) {
          console.log(`   [OK] ${route} (${status})`);
          results.push({ url: route, status: 'ok', statusCode: status });
        } else {
          console.log(`   [ERROR] ${route} (${status})`);
          results.push({ url: route, status: 'error', statusCode: status });
        }
      } catch (err: any) {
        console.log(`   [ERROR] ${route} - ${err.message}`);
        results.push({ url: route, status: 'error', error: err.message });
      }
    }
  } else {
    console.log(`   [ERROR] Login fallo - Redirigido a: ${currentUrl}`);
    results.push({ url: '/login', status: 'error', error: 'Login failed' });
  }

  console.log('\n4. Errores de consola encontrados:\n');

  if (consoleErrors.length > 0) {
    consoleErrors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.substring(0, 200)}`);
    });
  } else {
    console.log('   Ninguno');
  }

  // Resumen
  console.log('\n=== RESUMEN ===\n');
  const okCount = results.filter(r => r.status === 'ok').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  console.log(`Total verificados: ${results.length}`);
  console.log(`Exitosos: ${okCount}`);
  console.log(`Con errores: ${errorCount}`);

  if (errorCount > 0) {
    console.log('\nLinks con errores:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${r.url}: ${r.error || `Status ${r.statusCode}`}`);
    });
  }

  await browser.close();

  return errorCount === 0;
}

checkLinks()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Error ejecutando verificacion:', err);
    process.exit(1);
  });
