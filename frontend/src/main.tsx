import { setupAutoUpdate } from './lib/autoUpdate'
import { toast } from 'sonner'
import { StrictMode } from 'react'
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

setupAutoUpdate({
  pollIntervalMs: 30_000,
  mode: 'prompt',
  onUpdateAvailable: ({ reload }) => {
    const appName = BRAND.name
    if (typeof toast !== 'undefined' && toast.info) {
      toast.info(`🚀 Nueva versión de ${appName} instalada`, {
        description: 'La aplicación se actualizará para cargar los cambios.',
        action: {
          label: 'Actualizar ahora',
          onClick: () => reload(),
        },
        duration: 15_000,
      })
    }
    setTimeout(() => {
      reload()
    }, 5000)
  },
})
