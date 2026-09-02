import { useEffect } from 'react';
import { loadMunicipioSync } from '../utils/municipioStorage';
import { BRAND, rutaDeAcceso } from '../brands';

/**
 * Componente que actualiza el manifest de la PWA, el `<title>` del documento,
 * y el meta `theme-color` de forma dinámica en base al municipio activo.
 *
 * Marca white-label (BRAND.iconPath seteado): el manifest es SIEMPRE el de la
 * marca — con o sin municipio cargado, en login o adentro. Sin esto, instalar
 * la PWA desde el login caía en el manifest.json estático (Munify).
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

    // Aplica un manifest via blob:URL, revocando el anterior.
    // IMPORTANTE: en un blob las URLs relativas no resuelven — todas las URLs
    // del manifest (start_url, scope, icons) deben ser absolutas.
    const setManifest = (manifest: Record<string, unknown>) => {
      // Si la marca publica su manifest como ARCHIVO, gana ese: Safari no lee
      // los `blob:` y, sin archivo, la instalación en iPhone cae al
      // manifest.json estático (start_url "/", o sea la app sin marca).
      const manifestUrl = BRAND.manifestPath
        ? `${window.location.origin}/${BRAND.manifestPath}`
        : URL.createObjectURL(
            new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
          );

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
      if (activeManifestUrl && activeManifestUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeManifestUrl);
      }
      activeManifestUrl = manifestUrl;
    };

    const iconSet = (base: string) => [
      { src: `${base}/icon-72x72.png`, sizes: '72x72', type: 'image/png' },
      { src: `${base}/icon-96x96.png`, sizes: '96x96', type: 'image/png' },
      { src: `${base}/icon-128x128.png`, sizes: '128x128', type: 'image/png' },
      { src: `${base}/icon-144x144.png`, sizes: '144x144', type: 'image/png' },
      { src: `${base}/icon-152x152.png`, sizes: '152x152', type: 'image/png' },
      { src: `${base}/icon-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: `${base}/icon-384x384.png`, sizes: '384x384', type: 'image/png' },
      { src: `${base}/icon-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ];

    const applyMunicipio = () => {
      const data = loadMunicipioSync();
      const origin = window.location.origin;
      const brandIcons = BRAND.iconPath; // ej. 'brand/paraguay-limpio' → marca white-label

      // Super admin (usuario sin municipio asignado) no debe ver el
      // nombre de un municipio en el title del tab — aunque tenga uno
      // "seleccionado" en localStorage por conveniencia operativa, el
      // branding de la pestaña queda en la marca activa (BRAND.name) para
      // reflejar su rol cross-tenant.
      let isSuperAdmin = false;
      try {
        const rawUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          isSuperAdmin = !!parsed?.is_super_admin || (parsed?.rol === 'admin' && !parsed?.municipio_id);
        }
      } catch {
        isSuperAdmin = false;
      }

      // ---- Marca white-label: manifest de MARCA, siempre. ----
      if (brandIcons) {
        const base = `${origin}/${brandIcons}`;
        setManifest({
          name: BRAND.name,
          short_name: BRAND.name,
          description: BRAND.tagline || BRAND.title,
          // La PWA arranca SIEMPRE por la puerta de la marca (`/py/asuncion`,
          // `/asuncion`), no por una ruta genérica. La marca se resuelve por el
          // PATH: con `start_url` en `/home?municipio=...` la app instalada
          // abría sin marca — como Munify multi-tenant — y terminaba en el
          // generador de demos. Con la ruta de la marca, el arranque es siempre
          // el mismo y siempre correcto. Sin ruta propia (Munify), la raíz.
          start_url: `${origin}${rutaDeAcceso(BRAND) ?? '/'}`,
          display: 'standalone',
          background_color: '#ffffff', // splash a juego con los tiles blancos del icono
          theme_color: BRAND.primary,
          // 'any' y no 'portrait-primary': con una orientación fija, una
          // tablet apoyada en su teclado abre la PWA y Android la ROTA a la
          // fuerza — se ve la ventana chica un instante y después el giro.
          // La app es responsive (verificado en 390, 834 y 1440), así que no
          // hay motivo para pelearse con cómo el usuario tiene el aparato.
          orientation: 'any',
          icons: [
            { src: `${base}/icon-maskable-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            ...iconSet(base),
          ],
          categories: ['government', 'utilities'],
          lang: 'es-AR',
          dir: 'ltr',
          prefer_related_applications: false,
          scope: `${origin}/`,
        });

        // apple-touch-icon (iOS no lee el manifest para el icono del home).
        let appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
        if (!appleLink) {
          appleLink = document.createElement('link');
          appleLink.rel = 'apple-touch-icon';
          document.head.appendChild(appleLink);
        }
        appleLink.href = `${base}/apple-touch-icon.png`;

        // Nombre al "Agregar a inicio" en iOS: Safari usa esta meta (o cae al
        // <title>). Sin ella la PWA se guardaba como "Munify" en iPhone.
        const ensureMeta = (name: string, content: string) => {
          let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
          if (!meta) {
            meta = document.createElement('meta');
            meta.name = name;
            document.head.appendChild(meta);
          }
          meta.content = content;
        };
        ensureMeta('apple-mobile-web-app-title', BRAND.name);
        ensureMeta('application-name', BRAND.name);

        const themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
        if (themeColorMeta) themeColorMeta.content = BRAND.primary;

        document.title = BRAND.title || BRAND.name;
        return;
      }

      // ---- Munify: comportamiento por municipio, como siempre. ----
      if (!data?.codigo || isSuperAdmin) {
        // Sin municipio activo, o super admin: branding genérico de la marca activa.
        // Resetear título + manifest y revocar cualquier blob previo para
        // que el browser no quede pidiendo un blob:URL huérfano.
        document.title = BRAND.name;
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

      setManifest({
        name: municipioNombre || 'Reclamos Municipal',
        short_name: municipioNombre?.replace('Municipalidad de ', '') || 'Reclamos',
        description: `Sistema de reclamos - ${municipioNombre}`,
        start_url: `${origin}/home?municipio=${municipioCodigo}`,
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: municipioColor,
        // Ver la nota de arriba: orientación libre para no forzar el giro
        // en tablets.
        orientation: 'any',
        icons: [
          { src: `${origin}/icon-notification.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ...iconSet(`${origin}/icons`),
        ],
        categories: ['government', 'utilities'],
        lang: 'es-AR',
        dir: 'ltr',
        prefer_related_applications: false,
        scope: `${origin}/`,
      });

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
