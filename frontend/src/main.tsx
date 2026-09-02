import { setupAutoUpdate } from './lib/autoUpdate'
import { toast } from 'sonner'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ThemedToaster } from './components/ThemedToaster'
import DynamicManifest from './components/DynamicManifest'
import ServiceWorkerUpdater from './components/ServiceWorkerUpdater'
import { router } from './routes'
import { BRAND } from './brands'
import { applyBrand } from './brands/applyBrand'
import './index.css'
import './styles/animations.css'
import './styles/pl-tokens.css'
import './styles/semantic-hero.css'
import './styles/abmv2.css'
// componente del KIT: listas de barras (ranking / cobertura / comparativa)
import './styles/bar-list.css'
import './styles/electro.css'
// componente del KIT: lista rankeada (top N con puesto, detalle y valor)
import './styles/ranked-list.css'
// componente del KIT: barra de balance (lo que se cerró vs. lo que entró)
import './styles/balance-bar.css'
// componente del dashboard: el mapa recorriendo los focos (altura fija)
import './styles/focos-rotativos.css'
// componente del KIT: menu de acciones en mosaico asimetrico (jerarquia por tamano)
import './styles/bento-menu.css'
// componente del KIT: fila de listado para pantalla angosta (barra de estado)
import './styles/fila-lista.css'
// bloque del dashboard: recorrido de los ultimos meses (reproductor)
import './styles/tendencia-meses.css'
import './styles/tarjeta-cola.css'
import './styles/kpi-semantico.css'
// componente del KIT: barra de filtros de una sola línea (pills ⇄ combos)
import './styles/adaptive-filter.css'
import './styles/reclamo-sheet.css'
import './styles/gasto-sheet.css'
// componente del KIT: carrusel de cards de altura fija (N por vista medido)
import './styles/card-carousel.css'
// componente del KIT: promedio + estrellas + distribución de una calificación
import './styles/rating-summary.css'
// variante v2 (opt-in) del ModernSelect — el clásico no la usa
import './styles/modern-select-v2.css'
// dashboard v2 (agente de la página Dashboard) — hero banner + strip + cards v2
import './styles/dashboard-v2.css'
// bloque del dashboard: la cinta de conteos (reemplaza las filas de KpiCardV2)
import './styles/cinta-conteos.css'
// mapa base neutro (filtro sobre los tiles de OSM, ver lib/basemaps.ts)
import './styles/mapa-base.css'
import './styles/shell-v2.css'

// Aplica la marca activa (VITE_BRAND) al documento antes del render:
// título, favicon y theme-color. Para 'munify' es un no-op efectivo.
applyBrand()

const queryClient = new QueryClient()
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')!).render(
  <GoogleOAuthProvider clientId={googleClientId}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <DynamicManifest />
          <ServiceWorkerUpdater />
          <RouterProvider router={router} />
          <ThemedToaster />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </GoogleOAuthProvider>,
)

// Auto-update NO invasivo (estándar de la carpeta compartida, 6-GUIA-PWA.md):
// al detectar un build nuevo se avisa con un popup PERSISTENTE abajo a la
// derecha y la recarga la dispara EL USUARIO. Antes había un
// `setTimeout(reload, 5000)` que recargaba igual a los 5 segundos: si estabas
// cargando un reclamo o llenando un formulario, te lo comía. La única recarga
// automática que sobrevive es el chunk-guard de `autoUpdate.ts` (ahí la app ya
// está rota y recargar es rescate, no interrupción).
setupAutoUpdate({
  pollIntervalMs: 30_000,
  mode: 'prompt',
  onUpdateAvailable: ({ reload }) => {
    toast(`Hay una versión nueva de ${BRAND.name}`, {
      description: 'Actualizá cuando quieras — hasta que toques, seguís trabajando.',
      action: { label: 'Actualizar', onClick: () => reload() },
      duration: Infinity,
      position: 'bottom-right',
    })
  },
})
