import { useEffect } from 'react';
import { loadMunicipioSync } from '../utils/municipioStorage';

/**
 * Componente que actualiza el manifest de la PWA dinámicamente
 * para incluir el municipio en el start_url
 */
export default function DynamicManifest() {
  useEffect(() => {
    const data = loadMunicipioSync();
    const municipioCodigo = data?.codigo;
    const municipioNombre = data?.nombre;
    const municipioColor = data?.color || '#4f46e5';

    if (!municipioCodigo) return;

    // Crear manifest dinámico
    const manifest = {
      name: municipioNombre || 'Reclamos Municipal',
      short_name: municipioNombre?.replace('Municipalidad de ', '') || 'Reclamos',
      description: `Sistema de reclamos - ${municipioNombre}`,
      start_url: `/home?municipio=${municipioCodigo}`,
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: municipioColor,
      orientation: 'portrait-primary',
      icons: [
        {
          src: '/icon-notification.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-72x72.png',
          sizes: '72x72',
          type: 'image/png'
        },
        {
          src: '/icons/icon-96x96.png',
          sizes: '96x96',
          type: 'image/png'
        },
        {
          src: '/icons/icon-128x128.png',
          sizes: '128x128',
          type: 'image/png'
        },
        {
          src: '/icons/icon-144x144.png',
          sizes: '144x144',
          type: 'image/png'
        },
        {
          src: '/icons/icon-152x152.png',
          sizes: '152x152',
          type: 'image/png'
        },
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icons/icon-384x384.png',
          sizes: '384x384',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ],
      categories: ['government', 'utilities'],
      lang: 'es-AR',
      dir: 'ltr',
      prefer_related_applications: false,
      scope: '/'
    };

    // Crear blob URL para el manifest
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestUrl = URL.createObjectURL(blob);

    // Buscar y actualizar el link del manifest
    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;

    if (manifestLink) {
      // Revocar URL anterior si existía una blob URL
      if (manifestLink.href.startsWith('blob:')) {
        URL.revokeObjectURL(manifestLink.href);
      }
      manifestLink.href = manifestUrl;
    } else {
      // Crear nuevo link si no existe
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = manifestUrl;
      document.head.appendChild(manifestLink);
    }

    // Actualizar theme-color
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (themeColorMeta) {
      themeColorMeta.content = municipioColor;
    }

    // Actualizar apple-touch-icon title
    document.title = municipioNombre || 'Reclamos Municipal';

    // Cleanup
    return () => {
      if (manifestUrl.startsWith('blob:')) {
        URL.revokeObjectURL(manifestUrl);
      }
    };
  }, []);

  return null;
}
