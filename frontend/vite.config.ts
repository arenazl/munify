import { versionPlugin, gitVersion } from './versionPlugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const APP_VERSION = gitVersion()
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    versionPlugin(APP_VERSION),react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false, // Si 5173 está en uso, usa el siguiente disponible
    // DEV LOCAL (excepción a la regla no-localhost, autorizada por el dueño
    // 2026-07-31 para el refactor v2): el front corre local con HMR pero
    // SIEMPRE contra el backend QA REAL (Cloud Run munify-api-qa + DB Aiven
    // QA) — cero backend/DB locales, y PROD JAMÁS. El push a qa sigue siendo
    // el cierre de cada módulo terminado.
    proxy: {
      '/api': {
        target: process.env.DEV_BACKEND_ORIGIN || 'https://munify-api-qa-vmpxsxe7ra-uk.a.run.app',
        changeOrigin: true,
      },
    },
  },
})
