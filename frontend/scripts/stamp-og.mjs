// Sella en dist/index.html la URL del AMBIENTE para las fichas de compartir
// (Open Graph / Twitter) y el canonical, desde SITE_URL.
//
// Por que existe: el mismo index.html se publica en QA, en produccion y en
// cada marca, y tenia el dominio de produccion escrito a mano. Resultado real
// (2026-08-28): compartir el link de QA por WhatsApp mostraba la direccion de
// produccion. Ningun host va hardcodeado en el repo — mismo criterio que
// gen-redirects.mjs con el backend.
//
// Sin SITE_URL NO se cae a produccion: se BORRAN og:url, twitter:url y
// canonical, y la imagen queda relativa. Sin og:url, el scraper usa la URL
// que la persona compartio, que es siempre la correcta. Preferimos una ficha
// sin URL declarada antes que una ficha que nombra otro ambiente.
import { readFileSync, writeFileSync } from 'node:fs'

const ARCHIVO = 'dist/index.html'
const sitio = (process.env.SITE_URL || '').replace(/\/+$/, '')

let html = readFileSync(ARCHIVO, 'utf8')

if (sitio) {
  html = html.replaceAll('__SITE_URL__', sitio)
  console.log(`[stamp-og] fichas de compartir -> ${sitio}`)
} else {
  // Las lineas cuyo valor es EXACTAMENTE el placeholder son las de URL: se van.
  const antes = html.split('\n').length
  html = html
    .split('\n')
    .filter((linea) => !/(?:href|content)="__SITE_URL__"/.test(linea))
    .join('\n')
    .replaceAll('__SITE_URL__/', '/')
  const borradas = antes - html.split('\n').length
  console.log(`[stamp-og] sin SITE_URL: ${borradas} metas de URL borradas, imagen relativa`)
}

writeFileSync(ARCHIVO, html)

if (html.includes('__SITE_URL__')) {
  console.error('[stamp-og] FATAL: quedo un __SITE_URL__ sin resolver en dist/index.html')
  process.exit(1)
}
