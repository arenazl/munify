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
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ARCHIVO = 'dist/index.html'
const sitio = (process.env.SITE_URL || '').replace(/\/+$/, '')

let html = readFileSync(ARCHIVO, 'utf8')

// ---------------------------------------------------------------------------
// LA MARCA, en la ficha de compartir.
//
// La app entera ya sabe ser Paraguay Limpio: el shell, el tema y hasta los
// iconos con los que se instala en el telefono. Pero la ficha que arma WhatsApp
// seguia diciendo Munify, y no por un olvido de React --- WhatsApp NO ejECUTA
// JavaScript: lee este HTML tal como sale del build. Todo lo que la marca hace
// en runtime le llega tarde.
//
// Los textos no se escriben aca: salen de `src/brands/index.ts`, que ya es la
// fuente de verdad de cada marca. Se lee como texto (es un .ts y este script
// corre en node crudo) y, si el formato cambiara, no pasa nada: sin match se
// deja la ficha de Munify, que es el comportamiento de siempre.
// ---------------------------------------------------------------------------
const marcaId = (process.env.VITE_BRAND || '').trim()

function leerMarca(id) {
  if (!id || id === 'munify') return null
  const fuente = 'src/brands/index.ts'
  if (!existsSync(fuente)) return null
  const texto = readFileSync(fuente, 'utf8')
  // El bloque de ESA marca: desde su `id: '<id>'` hasta la llave que lo cierra.
  const desde = texto.indexOf(`id: '${id}'`)
  if (desde < 0) return null
  const bloque = texto.slice(desde, desde + 1600)
  const campo = (nombre) => {
    const m = bloque.match(new RegExp(`${nombre}:\\s*'([^']*)'`))
    return m ? m[1] : null
  }
  const name = campo('name')
  if (!name) return null
  return {
    name,
    title: campo('title') || name,
    tagline: campo('tagline') || '',
    iconPath: campo('iconPath'),
    primary: campo('primary'),
  }
}

const marca = leerMarca(marcaId)
if (marca) {
  const escapar = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  // "Una empresa de Munify": la sub-marca se presenta sola y de quien es, que es
  // lo que hay que leer en la ficha de un link que llega por WhatsApp.
  const bajada = escapar([marca.tagline, 'Una empresa de Munify.'].filter(Boolean).join(' '))
  const titulo = escapar(marca.title)
  const nombre = escapar(marca.name)
  // El icono con el que la PWA se instala es el mismo que va en la ficha: es el
  // que la gente ya asocia con la marca.
  const imagen = marca.iconPath ? `/${marca.iconPath}/icon-512x512.png` : null

  const reemplazos = [
    [/<title>[^<]*<\/title>/, `<title>${titulo}</title>`],
    [/(<meta name="description" content=")[^"]*(")/, `$1${bajada}$2`],
    [/(<meta name="author" content=")[^"]*(")/, `$1${nombre}$2`],
    [/(<meta property="og:title" content=")[^"]*(")/, `$1${titulo}$2`],
    [/(<meta property="og:description" content=")[^"]*(")/, `$1${bajada}$2`],
    [/(<meta property="og:site_name" content=")[^"]*(")/, `$1${nombre}$2`],
    [/(<meta name="twitter:title" content=")[^"]*(")/, `$1${titulo}$2`],
    [/(<meta name="twitter:description" content=")[^"]*(")/, `$1${bajada}$2`],
  ]
  if (marca.primary) {
    reemplazos.push([/(<meta name="theme-color" content=")[^"]*(")/, `$1${marca.primary}$2`])
  }
  if (imagen) {
    // La ficha usa el icono de la marca; el og-image de Munify no aplica aca.
    reemplazos.push([/(<meta property="og:image" content="[^"]*?)\/og-image\.png(")/, `$1${imagen}$2`])
    reemplazos.push([/(<meta name="twitter:image" content="[^"]*?)\/og-image\.png(")/, `$1${imagen}$2`])
    // 512x512 es cuadrado: las medidas de la imagen de Munify mentirian.
    html = html.replace(/\s*<meta property="og:image:(width|height)" content="\d+" \/>/g, '')
  }
  let aplicados = 0
  for (const [buscar, poner] of reemplazos) {
    const antes = html
    html = html.replace(buscar, poner)
    if (html !== antes) aplicados++
  }
  console.log(`[stamp-og] marca "${marcaId}" -> ${marca.title} (${aplicados} metas selladas`
    + `${imagen ? `, icono ${imagen}` : ''})`)
} else if (marcaId && marcaId !== 'munify') {
  console.warn(`[stamp-og] AVISO: VITE_BRAND="${marcaId}" no se encontro en src/brands/index.ts`
    + ' — la ficha de compartir queda con la marca Munify')
}

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
