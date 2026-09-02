import { versionPlugin, gitVersion } from './versionPlugin'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const APP_VERSION = gitVersion()
export default defineConfig(({ mode }) => {
  // `loadEnv` para poder fijar el backend en `.env.local` (que está
  // gitignoreado) y no tener que acordarse de exportar la variable en cada
  // terminal. Precedencia: variable del proceso > .env.local > QA.
  const env = loadEnv(mode, process.cwd(), '')
  const backend =
    process.env.DEV_BACKEND_ORIGIN ||
    env.DEV_BACKEND_ORIGIN ||
    'https://munify-api-qa-vmpxsxe7ra-uk.a.run.app'

  return {
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
    plugins: [versionPlugin(APP_VERSION), react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false, // Si 5173 está en uso, usa el siguiente disponible
      // DEV LOCAL (excepción a la regla no-localhost, autorizada por el dueño
      // 2026-07-31 para el refactor v2): el front corre local con HMR contra
      // un backend REAL. Por defecto el de QA (Cloud Run munify-api-qa + DB
      // Aiven QA); con `DEV_BACKEND_ORIGIN=http://127.0.0.1:8002` en
      // `.env.local`, contra un uvicorn local — que igual usa la DB de QA.
      // PROD JAMÁS.
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
  }
})
