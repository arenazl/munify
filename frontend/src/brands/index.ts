// Sistema de marca (white-label) — UN solo codebase, N marcas por configuración.
//
// La marca activa se elige por la variable de entorno de BUILD `VITE_BRAND`.
// Cada site de Netlify se buildea del MISMO repo con distinta `VITE_BRAND`:
//   - VITE_BRAND=munify           -> app.munify.com.ar
//   - VITE_BRAND=paraguay-limpio  -> el site white-label (Asunción)
//
// ADITIVO Y SEGURO: sin `VITE_BRAND` (o valor desconocido) cae en 'munify' =
// comportamiento actual, cero cambios. Así Munify no se toca y la marca nueva
// hereda TODO el código (cada mejora de Munify le llega en el próximo build).

import type { ComponentType } from 'react';
import type { ThemeVariant } from '../config/themePresets';
import { ParaguayLimpioLogo } from './ParaguayLimpioLogo';

export interface Brand {
  id: string;
  /** Nombre visible de la app (sidebar, textos del shell). */
  name: string;
  /** <title> de la pestaña del navegador. */
  title: string;
  /** Bajada corta (para metas / pantallas de marca). */
  tagline?: string;
  /** Logo raster propio (marcas white-label). Si es null, se usa el SVG MunifyLogo. */
  logoSrc?: string | null;
  /** Color primario de la marca (theme-color del navegador + acento del shell). */
  primary: string;
  /** Acento secundario. */
  accent?: string;
  /** Mono-tenant: código del municipio único. Si está presente, la marca entra
   *  directo a este muni (no hay generador de demos ni grilla): el ruteo cerrado
   *  se DERIVA de esta propiedad, no de un flag "soy white-label". */
  municipioCodigo?: string;
  /** Ruta de entrada propia, cuando no alcanza con `/<municipioCodigo>`. Admite
   *  varios tramos ('py/asuncion'). Existe para que DOS marcas puedan vivir
   *  sobre el MISMO tenant: `/asuncion` abre Paraguay Limpio y `/py/asuncion`
   *  el mismo municipio con la marca Munify. Sin setear, la ruta de entrada
   *  sigue siendo `/<municipioCodigo>`, como siempre. */
  rutaAcceso?: string;
  /** Logo como componente SVG (editable, fondo transparente). Preferido sobre logoSrc. */
  Logo?: ComponentType<{ size?: number; className?: string; title?: string }>;
  /** Carpeta (relativa a /public) con los iconos PWA propios de la marca:
   *  icon-*.png, apple-touch-icon.png, icon-maskable-512x512.png. Si se setea,
   *  el manifest dinámico + el apple-touch-icon usan ESTOS (así la PWA se
   *  instala con el logo de la marca, no el de Munify). Munify no lo setea. */
  iconPath?: string;
  /** Fuente propia para el nombre de la marca (identidad tipográfica). */
  nameFont?: string;
  /** Bicolor del nombre para marcas de UNA palabra: índice donde arranca el
   *  tramo acentuado (ej. Munify con 4 → "Muni"+"fy" en accent). Las marcas
   *  multi-palabra no lo necesitan: el corte es por espacio. */
  nameAccentIndex?: number;
  /** Layout de la pantalla de login. 'split' = hero de marca + panel de acceso;
   *  'centered' (default, sin setear) = login clásico de Munify centrado. */
  loginLayout?: 'split' | 'centered';
  /** Identidad de color FIJA: el tema NO es dinámico por municipio, es el color
   *  de la marca desde el arranque. Se modela con un booleano explícito (y no se
   *  deriva de `municipioCodigo`) a propósito: "ruteo mono-tenant" y "tema fijo"
   *  son conceptos distintos y quedan desacoplados (una marca podría querer uno
   *  sin el otro). Munify no lo setea → tema dinámico por muni, como hoy. */
  fixedTheme?: boolean;
  /** Preset de tema por defecto de la marca (solo si `fixedTheme`). Deriva el
   *  look completo (fondo/sidebar/cards), no sólo el acento. Munify no lo setea
   *  → sigue el default global (carbon-vsc) o el tema_config del municipio. */
  themePresetId?: string;
  /** Variante (tonalidad del sidebar) del preset de marca. Default: 'vintage'. */
  themeVariant?: ThemeVariant;
  /** Presets que la marca OFRECE en su selector (solo si `fixedTheme`). Permite
   *  que el usuario alterne, p.ej., entre la versión clara y la oscura del
   *  mismo acento de marca. Si no se setea, el selector muestra los presets
   *  activos normales (colección de Munify). */
  themePresetIds?: string[];
}

const BRANDS: Record<string, Brand> = {
  munify: {
    id: 'munify',
    name: 'Munify',
    title: 'Munify - Sistema de Gestión Municipal',
    tagline: 'Reclamos, trámites y seguimiento en tiempo real.',
    logoSrc: null,
    primary: '#3b82f6',
    accent: '#22c55e',
    nameAccentIndex: 4, // "Muni" + "fy" en verde (espejo del logo azul+check verde)
  },
  'paraguay-limpio': {
    id: 'paraguay-limpio',
    name: 'Paraguay Limpio',
    title: 'Paraguay Limpio · Asunción',
    tagline: 'Tu ciudad más limpia. Reportá y seguí tus reclamos.',
    logoSrc: null,        // usa el SVG editable, no un PNG con fondo blanco
    Logo: ParaguayLimpioLogo,
    iconPath: 'brand/paraguay-limpio', // iconos PWA propios (isotipo real)
    // SIN nameFont a pedido del dueño (2026-07-31): misma letra SIEMPRE — el
    // nombre renderiza con la fuente de la app (Inter), igual que Munify.
    primary: '#1b7a3d',   // verde oscuro del logo
    accent: '#5cb85c',    // verde claro del logo
    municipioCodigo: 'asuncion',
    loginLayout: 'split', // hero de marca + panel de acceso
    fixedTheme: true,     // identidad verde fija (no dinámica por municipio)
    themePresetId: 'onix-verde', // Onix (casi-negro) con el verde del logo
    themeVariant: 'vintage',     // sidebar casi-negro (#222226)
    themePresetIds: ['onix-verde', 'nieve-verde'], // el user alterna oscuro/claro
  },
  // MISMO tenant que Paraguay Limpio (muni 146, `asuncion`: barrios, reclamos,
  // trámites y POIs ya curados) mostrado con la marca MUNIFY. Es la demo de
  // venta "producto nuestro" sobre una base real, sin duplicar municipio ni
  // semilla: sólo cambia la piel. Entra por `/py/asuncion`.
  'munify-py': {
    id: 'munify-py',
    name: 'Munify',
    title: 'Munify · Asunción',
    tagline: 'Reclamos, trámites y seguimiento en tiempo real.',
    logoSrc: null,        // logo Munify (BrandMark cae en MunifyLogo)
    primary: '#3b82f6',
    accent: '#22c55e',
    nameAccentIndex: 4,   // "Muni" + "fy", igual que la marca madre
    municipioCodigo: 'asuncion',
    rutaAcceso: 'py/asuncion',
    loginLayout: 'split', // el hero de acceso de la demo, con identidad Munify
    // Identidad de color de MARCA, no del municipio: la ficha del muni 146
    // guarda el verde de Paraguay Limpio (`color_primario` #1b7a3d) y sin esto
    // la demo arrancaría verde. El acento que elija el usuario en Apariencia
    // (localStorage) sigue mandando por encima — es lo que se busca.
    fixedTheme: true,
    themePresetId: 'carbon-vsc',
  },
};

// Mapa dominio -> marca. Un solo build sirve a TODOS los dominios y elige la
// marca por el host (sin env var por site). Infra bindea el mismo repo/branch a
// cada dominio y listo. Fallback: VITE_BRAND (build) y por último 'munify'.
const HOST_TO_BRAND: Record<string, string> = {
  'paraguay-limpio.netlify.app': 'paraguay-limpio',
};

/** Dónde se recuerda la marca elegida por URL, mientras dure la pestaña. */
const CLAVE_MARCA_SESION = 'brand_id';

/** Tramos de la ruta de entrada: 'py/asuncion' -> ['py', 'asuncion']. */
function tramosDeAcceso(b: Brand): string[] {
  return (b.rutaAcceso || b.municipioCodigo || '').toLowerCase().split('/').filter(Boolean);
}

/**
 * Marca cuya ruta de entrada coincide con este path, o null.
 *
 * Gana la ruta MÁS ESPECÍFICA: con dos marcas sobre el mismo municipio,
 * `/py/asuncion` (2 tramos, marca Munify) tiene que ganarle a `/asuncion`
 * (1 tramo, Paraguay Limpio) y no al revés.
 */
function marcaPorRuta(pathname: string): Brand | null {
  const tramos = pathname.toLowerCase().split('/').filter(Boolean);
  if (!tramos.length) return null;
  const candidatas = Object.values(BRANDS)
    .map((b) => ({ b, slug: tramosDeAcceso(b) }))
    .filter((c) => c.slug.length > 0)
    .sort((a, z) => z.slug.length - a.slug.length);
  for (const { b, slug } of candidatas) {
    if (slug.every((tramo, i) => tramos[i] === tramo)) return b;
  }
  return null;
}

/** Ruta de entrada de una marca mono-tenant ('/py/asuncion'), o null. */
export function rutaDeAcceso(b: Brand): string | null {
  const tramos = tramosDeAcceso(b);
  return tramos.length ? `/${tramos.join('/')}` : null;
}

/**
 * Accesos que el router tiene que registrar a mano: los de ruta propia. El
 * `/:codigo` genérico sólo matchea UN tramo, así que `/py/asuncion` no le
 * llega. Cada entrada dice qué municipio abrir, independiente del path.
 */
export const ACCESOS_DE_MARCA: Array<{ ruta: string; codigo: string }> = Object.values(BRANDS)
  .filter((b) => b.rutaAcceso && b.municipioCodigo)
  .map((b) => ({ ruta: rutaDeAcceso(b) as string, codigo: b.municipioCodigo as string }));

/**
 * Qué marca mostrar. En orden, de lo más explícito a lo más general:
 *
 *   1. HOST propio de la marca (paraguay-limpio.netlify.app).
 *   2. RUTA de entrada — `/asuncion` abre Paraguay Limpio y `/py/asuncion` la
 *      demo con marca Munify, en CUALQUIER dominio. Es la vía que pidió el
 *      dueño: el dominio pelado lleva al acceso de siempre y sólo la ruta de
 *      la marca entra a su identidad. Gana la ruta más específica.
 *   3. Lo elegido antes en esta pestaña: la SPA navega de `/asuncion` a
 *      `/login` y el path deja de tener el código, pero la identidad tiene
 *      que sobrevivir a ese salto.
 *   4. VITE_BRAND del build.
 *   5. Munify.
 *
 * El HOST va primero y la RUTA después a propósito: en el dominio propio de
 * una marca no hay forma de salirse de ella escribiendo otra URL.
 */
function resolveBrandId(): string {
  if (typeof window !== 'undefined') {
    const byHost = HOST_TO_BRAND[window.location.hostname];
    if (byHost && BRANDS[byHost]) return byHost;

    const porRuta = marcaPorRuta(window.location.pathname);
    if (porRuta) {
      try {
        window.sessionStorage.setItem(CLAVE_MARCA_SESION, porRuta.id);
      } catch {
        // Navegación privada sin sessionStorage: la marca vale para esta
        // vista igual, sólo no sobrevive al cambio de ruta.
      }
      return porRuta.id;
    }

    try {
      const recordada = window.sessionStorage.getItem(CLAVE_MARCA_SESION);
      if (recordada && BRANDS[recordada]) return recordada;
    } catch {
      // Sin sessionStorage se sigue con el resto de la cadena.
    }
  }
  const env = (import.meta.env.VITE_BRAND as string | undefined)?.trim();
  if (env && BRANDS[env]) return env;
  return 'munify';
}

/**
 * ¿Este municipio tiene marca propia? Devuelve la marca, o null.
 *
 * Sirve para no mostrar un municipio de marca ajena dentro del acceso
 * genérico: si alguien entra por la raíz con "asuncion" guardado de una
 * visita anterior, corresponde mandarlo a SU login, no pintar el nombre de
 * Asunción arriba de una pantalla que no es la suya.
 *
 * Con varias marcas sobre el mismo municipio devuelve la primera: alcanza,
 * porque el único dato que se usa acá es "este muni tiene dueño", no cuál.
 */
export function marcaDeMunicipio(codigo: string | null | undefined): Brand | null {
  if (!codigo) return null;
  const buscado = codigo.trim().toLowerCase();
  return (
    Object.values(BRANDS).find(
      (b) => b.municipioCodigo && b.municipioCodigo.toLowerCase() === buscado,
    ) || null
  );
}

export const BRAND: Brand = BRANDS[resolveBrandId()] || BRANDS.munify;
