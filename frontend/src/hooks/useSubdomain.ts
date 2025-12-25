/**
 * Hook para detectar y manejar subdominios dinámicos por municipio.
 *
 * Ejemplos de URLs soportadas:
 * - merlo.reclamos.app -> municipio "merlo"
 * - moreno.sistema.com -> municipio "moreno"
 * - localhost:5173 -> sin subdominio (landing general)
 * - 192.168.1.40:5173 -> sin subdominio (desarrollo local)
 */

const MAIN_DOMAINS = [
  'localhost',
  '127.0.0.1',
  'reclamos.app',
  'reclamos.com',
  'municipios.app',
];

/**
 * Extrae el código de municipio del subdominio actual.
 * @returns El código del municipio si hay subdominio, null si es el dominio principal
 */
export function getSubdomainMunicipio(): string | null {
  const hostname = window.location.hostname;

  // Ignorar IPs (desarrollo local)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  // Ignorar localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  // Separar por puntos
  const parts = hostname.split('.');

  // Si hay más de 2 partes, el primero es el subdominio
  // ej: merlo.reclamos.app -> ['merlo', 'reclamos', 'app']
  if (parts.length > 2) {
    const subdomain = parts[0].toLowerCase();

    // Ignorar subdominios comunes que no son municipios
    const ignoredSubdomains = ['www', 'api', 'admin', 'app', 'demo', 'staging', 'test'];
    if (ignoredSubdomains.includes(subdomain)) {
      return null;
    }

    return subdomain;
  }

  // Si tiene exactamente 2 partes, podría ser un dominio sin subdominio
  // ej: reclamos.app -> sin subdominio
  return null;
}

/**
 * Construye una URL para un municipio específico.
 * @param codigoMunicipio Código del municipio (ej: "merlo")
 * @param path Path opcional (ej: "/login")
 * @returns URL completa con subdominio
 */
export function buildMunicipioUrl(codigoMunicipio: string, path: string = '/'): string {
  const { protocol, port } = window.location;
  const hostname = window.location.hostname;

  // En desarrollo local, no usar subdominios
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    // En desarrollo, usar query param en vez de subdominio
    const portStr = port ? `:${port}` : '';
    return `${protocol}//${hostname}${portStr}${path}?municipio=${codigoMunicipio}`;
  }

  // En producción, construir URL con subdominio
  const parts = hostname.split('.');
  let baseDomain: string;

  if (parts.length > 2) {
    // Ya tiene subdominio, reemplazarlo
    baseDomain = parts.slice(1).join('.');
  } else {
    // No tiene subdominio
    baseDomain = hostname;
  }

  const portStr = port && port !== '80' && port !== '443' ? `:${port}` : '';
  return `${protocol}//${codigoMunicipio}.${baseDomain}${portStr}${path}`;
}

/**
 * Verifica si estamos en un entorno de desarrollo.
 */
export function isDevelopment(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'localhost' ||
         hostname === '127.0.0.1' ||
         /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

/**
 * Hook para usar el subdominio del municipio.
 * En desarrollo, también revisa el query param ?municipio=
 */
export function useMunicipioFromUrl(): string | null {
  // Primero intentar desde subdominio
  const subdomain = getSubdomainMunicipio();
  if (subdomain) {
    return subdomain;
  }

  // En desarrollo, también aceptar query param
  if (isDevelopment()) {
    const params = new URLSearchParams(window.location.search);
    const municipioParam = params.get('municipio');
    if (municipioParam) {
      return municipioParam.toLowerCase();
    }
  }

  return null;
}
