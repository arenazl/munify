// Genera dist/_redirects con el proxy al backend DEL AMBIENTE, desde BACKEND_ORIGIN.
// Sin BACKEND_ORIGIN -> corta el build (fail-closed; NUNCA cae a prod).
import { writeFileSync } from 'node:fs'

const origin = process.env.BACKEND_ORIGIN
if (!origin) {
  console.error('FATAL: BACKEND_ORIGIN vacío. Sin fallback a prod: corto el build.')
  process.exit(1)
}
const o = origin.replace(/\/+$/, '')
const body = `# GENERADO en build desde BACKEND_ORIGIN. NO hardcodear hosts acá.
/api/*      ${o}/api/:splat      200!
/static/*   ${o}/static/:splat   200!
/uploads/*  ${o}/uploads/:splat  200!
/*          /index.html          200
`
writeFileSync('dist/_redirects', body)
console.log(`[gen-redirects] dist/_redirects -> ${o}`)
