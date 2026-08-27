/**
 * Proxy same-origin para Cloudflare Pages (Functions).
 *
 * Es el reemplazo EXACTO del proxy que en Netlify vive en dist/_redirects
 * (generado por scripts/gen-redirects.mjs): /api, /static y /uploads se
 * sirven desde el MISMO origen del front y acá se reenvían al backend del
 * ambiente. Cloudflare Pages no proxya a otro dominio desde _redirects, así
 * que el cartero es esta function.
 *
 * La regla es la misma de siempre (anti-leak qa->prod): NADA de host
 * hardcodeado. El destino sale de la variable BACKEND_ORIGIN del proyecto
 * de Pages (binding de runtime, la setea Infra) y sin ella se corta con un
 * error que se ve — jamás un fallback a prod.
 */
export async function proxear(context) {
  const origin = context.env.BACKEND_ORIGIN;
  if (!origin) {
    return new Response(
      'BACKEND_ORIGIN sin configurar en el proyecto de Pages. Sin fallback a prod: se corta aca.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }
  const url = new URL(context.request.url);
  const destino = origin.replace(/\/+$/, '') + url.pathname + url.search;
  // Request nuevo sobre el mismo pedido: método, cuerpo y headers viajan tal
  // cual (incluido el Upgrade de WebSocket, que Workers reenvía por fetch).
  return fetch(new Request(destino, context.request));
}
