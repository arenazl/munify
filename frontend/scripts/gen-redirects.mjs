// Genera dist/_redirects con el proxy al backend DEL AMBIENTE, desde BACKEND_ORIGIN.
// Sin BACKEND_ORIGIN -> corta el build (fail-closed; NUNCA cae a prod).
import { writeFileSync } from 'node:fs'

const origin = process.env.BACKEND_ORIGIN
if (!origin) {
  console.error('FATAL: BACKEND_ORIGIN vacío. Sin fallback a prod: corto el build.')
  process.exit(1)
}
const o = origin.replace(/\/+$/, '')

// HOME_PATH (opcional, por SITE): a dónde manda la RAÍZ del sitio.
//
// Existe para los sites que sirven UNA sola puerta —un tenant, una demo— y no
// el acceso multi-municipio de Munify. Sin esta variable no cambia nada: la
// raíz entra a la app y el ruteo decide, como siempre.
//
// Por qué en el borde y no en el front: una PWA ya instalada tiene su
// `start_url` CONGELADO desde el día que se agregó al inicio (iOS no lo vuelve
// a leer), y arranca en "/" pase lo que pase. Redirigir acá es lo único que
// alcanza a esa app sin reinstalarla — no depende del bundle, del storage ni
// de que el JS llegue a correr.
const home = (process.env.HOME_PATH || '').trim()
const reglaHome = home ? `/           ${home}           302\n` : ''

const body = `# GENERADO en build desde BACKEND_ORIGIN. NO hardcodear hosts acá.
${reglaHome}/api/*      ${o}/api/:splat      200!
/static/*   ${o}/static/:splat   200!
/uploads/*  ${o}/uploads/:splat  200!
/*          /index.html          200
`
writeFileSync('dist/_redirects', body)
console.log(`[gen-redirects] dist/_redirects -> ${o}${home ? ` (raíz -> ${home})` : ''}`)
