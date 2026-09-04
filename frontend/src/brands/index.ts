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
  /** Manifest propio servido como ARCHIVO (relativo a /public). Cuando está,
   *  el `<link rel="manifest">` apunta a ese archivo en vez del blob generado
   *  en runtime: Safari ignora los manifests `blob:` y, sin esto, la PWA se
   *  instala con el manifest.json estático (start_url "/"). */
  manifestPath?: string;
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
    // Sin nameAccentIndex a pedido del dueño (2026-08-24): el bicolor
    // "Muni"+"fy" se retiró — el wordmark va plano, en un solo color.
    // El layout split (hero + panel de acceso, el de Asunción) es EL login de
    // la casa desde 2026-08-24: mismo componente, distinta config por marca.
    loginLayout: 'split',
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
    // Wordmark plano, igual que la marca madre (bicolor retirado 2026-08-24)
    municipioCodigo: 'asuncion',
    rutaAcceso: 'py/asuncion',
    loginLayout: 'split', // el hero de acceso de la demo, con identidad Munify
    // PWA con identidad Munify: con `iconPath` el manifest entra por la rama de
    // MARCA (nombre "Munify", theme_color azul, apple-touch-icon y meta de
    // título de iOS propios). Sin esto caía en la rama del municipio y la app
    // instalada se guardaba como "Asunción, Dpto. Central" con la barra en el
    // verde de la ficha.
    // Set propio (generate-icons-munify.cjs) y no el estático `icons/`: ahí el
    // mark estaba descentrado y el ícono instalado se veía torcido.
    iconPath: 'brand/munify-py',
    // Manifest servido como ARCHIVO REAL. El manifest dinámico se monta con
    // una `blob:` URL y Safari NO la lee: al "Agregar a inicio" caía en el
    // manifest.json estático, cuyo `start_url` es "/" — la raíz sin marca, o
    // sea el generador de demos. Con un archivo http normal, iOS lee el
    // start_url correcto.
    manifestPath: 'manifest-munify-py.json',
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
  // Dominio propio, sobre el MISMO proyecto de Cloudflare Pages que munify-qa:
  // como la marca sale del host, un solo deploy sirve a las dos y Paraguay
  // Limpio nunca queda en una version distinta de la app.
  'pylimpio.munify.com.ar': 'paraguay-limpio',
  // El de Netlify sigue RESPONDIENDO (verificado 2026-09-03: http 200) con un
  // build congelado del 27/08 — la plataforma salio de uso pero el site no se
  // dio de baja. Se deja mapeado para que, si alguien entra por ahi, al menos
  // vea la marca correcta. Darlo de baja es tarea de Infra.
  'paraguay-limpio.netlify.app': 'paraguay-limpio',
};

/**
 * Rutas que son de MUNIFY y de nadie más, pase lo que pase.
 *
 * El generador de demos y la galería de estilos no pertenecen a ningún
 * municipio: son la herramienta de Munify. Tienen que comportarse como la raíz
 * —limpiar la marca recordada y volver a la del site— porque si no heredan la
 * que quedó pegada en la pestaña.
 *
 * Ese era un bug real: entrabas a una ruta de Asunción, la marca se guardaba en
 * `sessionStorage`, y a partir de ahí `/demo` resolvía como Paraguay Limpio.
 * Como esa marca SÍ tiene `municipioCodigo`, la ruta redirigía al home del
 * municipio y el generador de demos se volvía inalcanzable en esa pestaña,
 * sin más forma de salir que cerrarla.
 */
const RUTAS_DE_MUNIFY = [
  '/demo',          // el generador de demos
  '/demos',         // la galería de estilos
  '/reels',         // estudio de reels
  '/voz',           // estudio de voz
  '/presentacion',  // la presentación comercial
  '/bienvenido',    // la landing
];

/** ¿El pathname es una de esas rutas (o algo colgando de ellas)? */
function esRutaDeMunify(pathname: string): boolean {
  const limpio = pathname.replace(/\/+$/, '').toLowerCase();
  return RUTAS_DE_MUNIFY.some((r) => limpio === r || limpio.startsWith(`${r}/`));
}

/** Dónde se recuerda la marca elegida por URL, mientras dure la pestaña. */
const CLAVE_MARCA_SESION = 'brand_id';
/** Ídem, pero PERSISTENTE — sólo se lee con la PWA instalada (ver abajo). */
const CLAVE_MARCA_INSTALADA = 'brand_id_pwa';

/** ¿La app corre como PWA instalada (sin barra de direcciones)? */
function esAppInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (window.navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

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

/**
 * Qué logo institucional corresponde mostrar: el del municipio, o ninguno
 * porque manda la marca. ÚNICO punto de decisión — el shell (desktop, mobile,
 * dashboard del vecino) pregunta acá en vez de leer `logo_url` crudo.
 *
 * En una marca MONO-TENANT la identidad visual la pone la marca, no la ficha
 * del municipio: dos marcas pueden compartir el mismo tenant (Paraguay Limpio
 * y la demo Munify viven las dos sobre el municipio 146, cuya ficha guarda el
 * logo de Paraguay Limpio). Devolver null hace que el shell caiga en
 * `BrandMark`, que ya resuelve el logo de la marca activa.
 *
 * Munify multi-tenant no cambia: sigue mostrando el logo que cargó cada muni.
 */
export function logoDelMunicipio(url?: string | null): string | null {
  if (BRAND.municipioCodigo) return null;
  return url || null;
}

/** Ruta de entrada de una marca mono-tenant ('/py/asuncion'), o null. */
export function rutaDeAcceso(b: Brand): string | null {
  const tramos = tramosDeAcceso(b);
  return tramos.length ? `/${tramos.join('/')}` : null;
}

/**
 * A dónde mandar una APP INSTALADA que arrancó sin marca en la URL, o null si
 * no corresponde tocar nada.
 *
 * Una PWA guarda su `start_url` el día que se instala y no lo vuelve a leer:
 * las que se agregaron antes de que la marca publicara su manifest arrancan en
 * la raíz y caen en el generador de demos. Este rescate las lleva a la puerta
 * de la marca — primero la que quedó recordada en este dispositivo y, si no
 * hay, la única marca con ruta propia (no hay ambigüedad posible mientras
 * exista una sola).
 *
 * Sólo con la app instalada: en el navegador la URL es la fuente de verdad y
 * la raíz debe seguir llevando al acceso de siempre.
 */
export function rutaDeAccesoInstalada(): string | null {
  if (typeof window === 'undefined' || !esAppInstalada()) return null;
  let recordada: string | null = null;
  try {
    recordada = window.localStorage.getItem(CLAVE_MARCA_INSTALADA);
  } catch {
    recordada = null;
  }
  // SOLO la marca por la que este dispositivo entró realmente. Sin recuerdo no
  // se adivina: antes se caía en "la única marca con ruta propia" y eso mandaba
  // a la demo de Asunción CUALQUIER app instalada, incluida la de Munify
  // genérico o la de otro municipio. Sin marca, la raíz sigue su curso normal.
  const marca = (recordada && BRANDS[recordada]) || null;
  return marca ? rutaDeAcceso(marca) : null;
}

/**
 * Accesos que el router tiene que registrar a mano: TODA marca con municipio.
 * Los de ruta propia porque el `/:codigo` genérico sólo matchea UN tramo y
 * `/py/asuncion` no le llega; y los de un tramo (`/asuncion`, Paraguay Limpio)
 * porque si caen en el genérico el municipio, que es demo, sale disparado a
 * `/demo/asuncion/login`, ruta que la marca rechaza y devuelve a su home:
 * un bucle infinito de "Ingresando..." (visto en pylimpio.munify.com.ar,
 * 2026-09-04). Cada entrada dice qué municipio abrir, independiente del path,
 * y con eso el login se rinde EN EL LUGAR, con la marca en la URL.
 */
export const ACCESOS_DE_MARCA: Array<{ ruta: string; codigo: string }> = Object.values(BRANDS)
  .filter((b) => b.municipioCodigo)
  .map((b) => ({ ruta: rutaDeAcceso(b) as string, codigo: b.municipioCodigo as string }));

/**
 * Qué marca mostrar. En orden, de lo más explícito a lo más general:
 *
 *   1. HOST propio de la marca (pylimpio.munify.com.ar).
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
 *
 * EXCEPCIÓN A LOS PASOS 3-4 — LA RAÍZ DESPEGA LA MARCA. Escribir el dominio
 * pelado en el navegador tiene que devolver SIEMPRE al acceso de Munify,
 * aunque un rato antes se haya visitado `/py/asuncion` en esa misma pestaña.
 * El recuerdo existe para que la marca sobreviva el salto interno de la SPA
 * (`/asuncion` → `/login`), no para dejar el dominio pegado a un tenant: sin
 * esto, una marca mono-tenant se llevaba puestas también `/demo`,
 * `/bienvenido` y el resto de las rutas que redirigen a su home.
 * Con la app INSTALADA no aplica: ahí no hay barra de direcciones donde
 * escribir otra URL, así que el recuerdo es la única señal de por qué puerta
 * entró y es justo el caso que rescata `rutaDeAccesoInstalada()`.
 */
function resolveBrandId(): string {
  if (typeof window !== 'undefined') {
    const byHost = HOST_TO_BRAND[window.location.hostname];
    if (byHost && BRANDS[byHost]) return byHost;

    // La raíz y las rutas propias de Munify se tratan igual: son la puerta de
    // la herramienta, no la de un municipio.
    const ruta = window.location.pathname;
    const esGlobal = ruta.replace(/\/+$/, '') === '' || esRutaDeMunify(ruta);
    if (esGlobal && !esAppInstalada()) {
      try {
        window.sessionStorage.removeItem(CLAVE_MARCA_SESION);
      } catch {
        // sin storage no hay nada pegado que limpiar
      }
      const envRaiz = (import.meta.env.VITE_BRAND as string | undefined)?.trim();
      // VITE_BRAND sí manda: es la identidad del SITE (el build de la marca),
      // no algo que el usuario haya arrastrado navegando.
      return envRaiz && BRANDS[envRaiz] ? envRaiz : 'munify';
    }

    const porRuta = marcaPorRuta(window.location.pathname);
    if (porRuta) {
      try {
        window.sessionStorage.setItem(CLAVE_MARCA_SESION, porRuta.id);
        // Persistente: la PWA instalada arranca sin que nadie escriba la URL,
        // así que necesita recordar por qué puerta entró. En el navegador NO se
        // lee (ver abajo), para que la URL siga mandando siempre.
        window.localStorage.setItem(CLAVE_MARCA_INSTALADA, porRuta.id);
      } catch {
        // Navegación privada sin storage: la marca vale para esta vista igual,
        // sólo no sobrevive al cambio de ruta.
      }
      return porRuta.id;
    }

    try {
      const recordada = window.sessionStorage.getItem(CLAVE_MARCA_SESION);
      if (recordada && BRANDS[recordada]) return recordada;
    } catch {
      // Sin sessionStorage se sigue con el resto de la cadena.
    }

    // PWA instalada: no hay barra de direcciones donde escribir otra URL, y el
    // arranque puede caer en un path que no nombra la marca (`/gestion`, `/login`
    // tras un cierre). Sin esto, la app instalada de la demo abría como Munify
    // genérico y terminaba en el generador de demos. En el navegador esta clave
    // se IGNORA a propósito: ahí la URL es la fuente de verdad y recordar una
    // marca dejaría el dominio pegado a ella.
    if (esAppInstalada()) {
      try {
        const instalada = window.localStorage.getItem(CLAVE_MARCA_INSTALADA);
        if (instalada && BRANDS[instalada]) return instalada;
      } catch {
        // sin localStorage: sigue la cadena
      }
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
