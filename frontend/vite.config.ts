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
  },
})
