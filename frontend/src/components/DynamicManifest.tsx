import { useEffect } from 'react';
import { loadMunicipioSync } from '../utils/municipioStorage';

/**
 * Componente que actualiza el manifest de la PWA, el `<title>` del documento,
 * y el meta `theme-color` de forma dinámica en base al municipio activo.
 *
 * Re-ejecuta el sync cada vez que:
 *   - Se dispara el evento `municipio-changed` (login, logout, cambio de
 *     municipio del super admin — ver `utils/municipioStorage.ts`).
 *   - Cambia el localStorage en otra pestaña (evento nativo `storage`).
 *   - Se monta el componente por primera vez.
 */
export default function DynamicManifest() {
  useEffect(() => {
    let activeManifestUrl: string | null = null;

    const applyMunicipio = () => {
      const data = loadMunicipioSync();

      if (!data?.codigo) {
        // No hay municipio activo (p.ej. después del logout o en /demo).
        // Resetear título + manifest a valores genéricos de la marca, y
        // revocar cualquier blob previo para que el browser no quede
        // pidiendo un blob:URL huérfano.
        document.title = 'Munify';
        const existingLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
        if (existingLink?.href.startsWith('blob:')) {
          URL.revokeObjectURL(existingLink.href);
        }
        if (existingLink) {
          // Apuntar al manifest estático default del /public
          existingLink.href = '/manifest.json';
        }
        if (activeManifestUrl && activeManifestUrl.startsWith('blob:')) {
          URL.revokeObjectURL(activeManifestUrl);
        }
        activeManifestUrl = null;
        return;
      }

      const municipioCodigo = data.codigo;
      const municipioNombre = data.nombre;
      const municipioColor = data.color || '#4f46e5';

      // Manifest PWA dinámico por municipio.
      // IMPORTANTE: el manifest se sirve desde un `blob:` URL, y en ese
      // contexto las URLs relativas no se pueden resolver. Por eso usamos
      // URLs absolutas con `window.location.origin` para start_url, scope
      // e íconos. Sin esto, el navegador loguea "property 'start_url'
      // ignored, URL is invalid" (y lo mismo para scope e icons.src).
      const origin = window.location.origin;
      const manifest = {
        name: municipioNombre || 'Reclamos Municipal',
        short_name: municipioNombre?.replace('Municipalidad de ', '') || 'Reclamos',
        description: `Sistema de reclamos - ${municipioNombre}`,
        start_url: `${origin}/home?municipio=${municipioCodigo}`,
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: municipioColor,
        orientation: 'portrait-primary',
        icons: [
          { src: `${origin}/icon-notification.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: `${origin}/icons/icon-72x72.png`, sizes: '72x72', type: 'image/png' },
          { src: `${origin}/icons/icon-96x96.png`, sizes: '96x96', type: 'image/png' },
          { src: `${origin}/icons/icon-128x128.png`, sizes: '128x128', type: 'image/png' },
          { src: `${origin}/icons/icon-144x144.png`, sizes: '144x144', type: 'image/png' },
          { src: `${origin}/icons/icon-152x152.png`, sizes: '152x152', type: 'image/png' },
          { src: `${origin}/icons/icon-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: `${origin}/icons/icon-384x384.png`, sizes: '384x384', type: 'image/png' },
          { src: `${origin}/icons/icon-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['government', 'utilities'],
        lang: 'es-AR',
        dir: 'ltr',
        prefer_related_applications: false,
        scope: `${origin}/`,
      };

      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const manifestUrl = URL.createObjectURL(blob);

      let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (manifestLink) {
        if (manifestLink.href.startsWith('blob:')) {
          URL.revokeObjectURL(manifestLink.href);
        }
        manifestLink.href = manifestUrl;
      } else {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.href = manifestUrl;
        document.head.appendChild(manifestLink);
      }

      // Trackear la URL actual para revocarla al desmontar/cambiar.
      if (activeManifestUrl && activeManifestUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeManifestUrl);
      }
      activeManifestUrl = manifestUrl;

      // theme-color del navegador (barra superior en mobile, etc.)
      const themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (themeColorMeta) {
        themeColorMeta.content = municipioColor;
      }

      // Título del tab del navegador
      document.title = municipioNombre || 'Reclamos Municipal';
    };

    // Aplicar al montar
    applyMunicipio();

    // Escuchar cambios: misma pestaña (custom event) + otras pestañas (storage)
    const handleStorageEvent = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('municipio_')) {
        applyMunicipio();
      }
    };
    window.addEventListener('municipio-changed', applyMunicipio);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('municipio-changed', applyMunicipio);
      window.removeEventListener('storage', handleStorageEvent);
      if (activeManifestUrl && activeManifestUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeManifestUrl);
      }
    };
  }, []);

  return null;
}
