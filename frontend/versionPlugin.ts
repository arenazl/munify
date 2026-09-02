/**
 * auto-update-kit — plugin de Vite
 * -------------------------------------------------------------------------
 * Emite `dist/version.json` en cada build con una versión auto-incremental
 * (nº de commits + short SHA -> sube en cada push/deploy). El cliente
 * (autoUpdate.ts) compara contra ese archivo para detectar deploys nuevos.
 *
 * Uso en vite.config.ts:
 *
 *   import { versionPlugin, gitVersion } from './auto-update-kit/vite/versionPlugin'
 *   const APP_VERSION = gitVersion()
 *   export default defineConfig({
 *     plugins: [react(), versionPlugin(APP_VERSION)],
 *     define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
 *   })
 */
import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** Versión = "<nº commits>.<short sha>". Fallback estable si no hay git. */
export function gitVersion(): string {
  try {
    const count = execSync('git rev-list --count HEAD').toString().trim()
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    return `${count}.${sha}`
  } catch {
    // Sin git (build aislado): usar el timestamp del build para que igual cambie.
    return `dev-${Date.now()}`
  }
}

export function versionPlugin(version: string = gitVersion(), outDir = 'dist'): Plugin {
  return {
    name: 'auto-update-emit-version',
    apply: 'build',
    closeBundle() {
      try {
        const dir = resolve(outDir)
        mkdirSync(dir, { recursive: true })
        writeFileSync(
          resolve(dir, 'version.json'),
          JSON.stringify({ version, builtAt: new Date().toISOString() }),
        )
      } catch {
        /* dev server / sin dist: ignorar */
      }
    },
  }
}
