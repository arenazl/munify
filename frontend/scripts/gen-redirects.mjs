// Genera dist/_redirects con el proxy al backend DEL AMBIENTE, desde BACKEND_ORIGIN.
// Sin BACKEND_ORIGIN -> corta el build (fail-closed; NUNCA cae a prod).
import { writeFileSync } from 'node:fs'

const origin = process.env.BACKEND_ORIGIN
if (!origin) {
  console.error('FATAL: BACKEND_ORIGIN vacío. Sin fallback a prod: corto el build.')
  process.exit(1)
}
const o = origin.replace(/\/+$/, '')

// SIN redirect de raíz en el borde (a propósito).
//
// Hubo un `HOME_PATH` que mandaba "/" a la puerta de una marca con un 302, para
// alcanzar a las PWA ya instaladas (su `start_url` queda congelado en "/" y no
// se re-lee). El problema: el borde NO puede distinguir una app instalada de un
// navegador, así que ese 302 se llevaba puesto a todo el mundo — escribir el
// dominio pelado terminaba en el tenant de la demo. En un dominio multi-tenant
// la raíz es de Munify y la URL manda siempre.
//
// El rescate de la PWA instalada vive en el front (`rutaDeAccesoInstalada`),
// que sí sabe si corre en modo standalone y sólo actúa con la marca que ese
// dispositivo recordó.

const body = `# GENERADO en build desde BACKEND_ORIGIN. NO hardcodear hosts acá.
/api/*      ${o}/api/:splat      200!
/static/*   ${o}/static/:splat   200!
/uploads/*  ${o}/uploads/:splat  200!
/*          /index.html          200
`
writeFileSync('dist/_redirects', body)
console.log(`[gen-redirects] dist/_redirects -> ${o}`)
