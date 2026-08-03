import { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  bgThemes,
  accents as accentCatalog,
  sidebarModes,
  BgTheme,
  AccentOption,
  SidebarMode,
  SidebarModeOption,
  ThemeColors,
  ThemeMode,
  ThemeVariant,
  buildThemeColors,
  getBgTheme,
  resolveSavedAccent,
  resolveSavedPreset,
  resolveSidebarMode,
} from '../config/themePresets';
import { DEFAULT_FONT_ID } from '../config/fontPresets';
import { applyFontFamily } from '../lib/fontLoader';
import { mix, lighten, darken, alpha, isLight } from '../lib/colorUtils';
import { BRAND } from '../brands';

// Selección por defecto de la MARCA activa: sólo si la marca declara
// `fixedTheme` (identidad de color fija). Munify no lo setea → undefined, y el
// tema sigue saliendo del municipio / default global, como siempre.
// El preset que declara la marca es de la colección vieja (traía el acento
// adentro), así que se traduce al par (fondo, acento) del modelo nuevo.
const brandDefault =
  BRAND.fixedTheme && BRAND.themePresetId ? resolveSavedPreset(BRAND.themePresetId) : null;
const brandDefaultPreset = brandDefault?.bgId;
const brandDefaultAccent = brandDefault?.accentId ?? null;
const brandDefaultSidebar = BRAND.fixedTheme ? resolveSidebarMode(BRAND.themeVariant) : undefined;

// El selector ofrece SIEMPRE el catálogo completo: los seis temas de fondo y
// todos los acentos, para cualquier marca.
//
// Antes la marca recortaba las dos listas (`BRAND.themePresetIds` filtraba los
// fondos y un acento de marca dejaba UNO solo). En Paraguay Limpio eso se veía
// como un único color verde sin forma de cambiarlo, que es justo lo contrario
// de lo que pide el canvas: "el acento se aplica sobre cualquier tema".
//
// La marca sigue mandando en lo que importa: `brandDefaultPreset` y
// `brandDefaultAccent` son con lo que ARRANCA el municipio (Paraguay abre en
// verde). Elegir otro es del usuario.
const selectorPresets: BgTheme[] = bgThemes;
const selectorAccents: AccentOption[] = accentCatalog;

// Exportar tipos necesarios
export type {
  BgTheme,
  AccentOption,
  ThemeColors,
  ThemeMode,
  ThemeVariant,
  SidebarMode,
  SidebarModeOption,
};
export { bgThemes };

// Interfaz del tema activo (combina colors + metadata)
export interface Theme extends ThemeColors {
  name: string;
  label: string;
}

interface ThemeContextType {
  // Tema actual (colores + metadata)
  theme: Theme;

  // --- Apariencia: 3 ejes independientes (ver config/themePresets.ts) ---

  /** Eje 1 — tema de fondo. Conserva el nombre `currentPresetId` porque es la
   *  clave con la que se persiste desde siempre. */
  currentPresetId: string;
  setPreset: (presetId: string) => void;
  /** Modo del tema de fondo activo. Es lo que hay que mirar para saber si la
   *  app está en claro u oscuro (no adivinar por el id ni por el color). */
  currentMode: ThemeMode;
  /**
   * Cambia de claro a oscuro y viceversa, volviendo al ÚLTIMO tema que el
   * usuario eligió de ese modo. Es lo que hace la luna/sol de la topbar.
   *
   * Por eso se recuerdan dos temas y no uno: el usuario elige en Configuración
   * su claro (blanco, marfil o ámbar) y su oscuro (negro, gris o azul), y la
   * luna alterna entre ESOS dos. Con un solo tema guardado, la luna tendría
   * que adivinar a cuál volver y siempre le erraría a alguien.
   */
  alternarModo: () => void;

  /** Eje 2 — acento activo: el que eligió el usuario, o el `acentoRecomendado`
   *  del tema de fondo mientras no haya elegido ninguno. */
  currentAccentId: string;
  setAccent: (accentId: string) => void;

  /** Eje 3 — cómo se arma el fondo de la barra lateral. */
  currentSidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;

  // Imágenes de fondo
  sidebarBgImage: string | null;
  setSidebarBgImage: (url: string | null) => void;
  sidebarBgOpacity: number;
  setSidebarBgOpacity: (opacity: number) => void;
  contentBgImage: string | null;
  setContentBgImage: (url: string | null) => void;
  contentBgOpacity: number;
  setContentBgOpacity: (opacity: number) => void;

  // Tipografia (solo persiste si user es superadmin/admin)
  currentFontId: string;
  setFont: (fontId: string) => void;

  // Catálogos que ofrece el selector (filtrados por la marca activa)
  presets: BgTheme[];
  accents: AccentOption[];
  sidebarOptions: SidebarModeOption[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Las preferencias de tema se guardan por usuario para no mezclarlas entre
// logins en el mismo navegador. Las claves globales quedan como fallback para
// sesiones anónimas / previos al login.
const userScopedKey = (userId: number | undefined, key: string) =>
  userId ? `user_${userId}:${key}` : key;

const readTheme = (userId: number | undefined) => {
  const preset = localStorage.getItem(userScopedKey(userId, 'themePresetId'));
  const accent = localStorage.getItem(userScopedKey(userId, 'themeAccentId'));
  const sidebarMode = localStorage.getItem(userScopedKey(userId, 'themeSidebarMode'));
  // Eje viejo (tonalidad del sidebar). Se lee sólo para migrar las sesiones
  // que lo tengan guardado; no se escribe más.
  const variant = localStorage.getItem(userScopedKey(userId, 'themeVariant'));
  const sidebarBg = localStorage.getItem(userScopedKey(userId, 'sidebarBgImage'));
  const sidebarOp = localStorage.getItem(userScopedKey(userId, 'sidebarBgOpacity'));
  const contentBg = localStorage.getItem(userScopedKey(userId, 'contentBgImage'));
  const contentOp = localStorage.getItem(userScopedKey(userId, 'contentBgOpacity'));
  const fontId = localStorage.getItem(userScopedKey(userId, 'fontId'));
  return { preset, accent, sidebarMode, variant, sidebarBg, sidebarOp, contentBg, contentOp, fontId };
};

/** Lo que el municipio deja guardado como apariencia por defecto. */
interface TemaMunicipio {
  presetId?: string;
  accentId?: string;
  sidebarMode?: string;
  variant?: string;
}

/** La selección de apariencia, ya normalizada a los 3 ejes. */
interface SeleccionApariencia {
  bgId: string;
  /** null = seguir el `acentoRecomendado` del tema de fondo. */
  accentId: string | null;
  sidebarMode: SidebarMode;
}

/**
 * Resuelve la apariencia efectiva. TOLERANTE por diseño: cualquier valor
 * guardado que ya no exista (un preset de la colección vieja, un acento
 * borrado, una variante del eje anterior) cae al default sin tirar error.
 *
 * Prioridad: lo guardado por el usuario > la marca > el municipio > el default.
 */
function resolverApariencia(
  saved: ReturnType<typeof readTheme>,
  muni?: TemaMunicipio | null,
): SeleccionApariencia {
  const preset = resolveSavedPreset(saved.preset || brandDefaultPreset || muni?.presetId);
  // El acento elegido por el usuario MANDA. Si no eligió, hereda el de la
  // marca o el del municipio, y si tampoco hay, queda en null → se usa el
  // recomendado del tema de fondo (o el que traía adentro un preset viejo).
  const accentId =
    resolveSavedAccent(saved.accent) ??
    brandDefaultAccent ??
    resolveSavedAccent(muni?.accentId) ??
    preset.accentId;
  const sidebarMode = resolveSidebarMode(
    saved.sidebarMode || brandDefaultSidebar || saved.variant || muni?.sidebarMode || muni?.variant,
  );
  return { bgId: preset.bgId, accentId, sidebarMode };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Get user + municipio from AuthContext to load per-user theme config
  const { user, municipioActual } = useAuth();

  // Estado del preset y variante seleccionados — inicialmente desde el usuario
  // actual (si ya hay sesión) o las claves globales como fallback
  const initial = readTheme(user?.id);
  const inicialApariencia = resolverApariencia(initial);

  const [currentPresetId, setCurrentPresetId] = useState<string>(inicialApariencia.bgId);
  // Último tema elegido de cada modo, para que la luna sepa a cuál volver.
  // Arrancan en el tema activo (si es de ese modo) o en el default del modo.
  const [ultimoClaro, setUltimoClaro] = useState<string>(
    () => localStorage.getItem(userScopedKey(user?.id, 'themePresetClaro'))
      || (getBgTheme(inicialApariencia.bgId).modo === 'claro' ? inicialApariencia.bgId : 'blanco'),
  );
  const [ultimoOscuro, setUltimoOscuro] = useState<string>(
    () => localStorage.getItem(userScopedKey(user?.id, 'themePresetOscuro'))
      || (getBgTheme(inicialApariencia.bgId).modo === 'oscuro' ? inicialApariencia.bgId : 'gris'),
  );
  // null = seguir el acento recomendado del tema; un id = elección del usuario.
  const [accentOverride, setAccentOverride] = useState<string | null>(inicialApariencia.accentId);
  const [currentSidebarMode, setCurrentSidebarMode] = useState<SidebarMode>(
    inicialApariencia.sidebarMode
  );
  const [sidebarBgImage, setSidebarBgImageState] = useState<string | null>(
    initial.sidebarBg && initial.sidebarBg !== 'null' ? initial.sidebarBg : null
  );
  const [sidebarBgOpacity, setSidebarBgOpacityState] = useState<number>(
    initial.sidebarOp ? parseFloat(initial.sidebarOp) : 0.3
  );
  const [contentBgImage, setContentBgImageState] = useState<string | null>(
    initial.contentBg && initial.contentBg !== 'null' ? initial.contentBg : null
  );
  const [contentBgOpacity, setContentBgOpacityState] = useState<number>(
    initial.contentOp ? parseFloat(initial.contentOp) : 0.1
  );
  const [currentFontId, setCurrentFontId] = useState<string>(
    initial.fontId || DEFAULT_FONT_ID
  );

  // Flag para evitar guardar en localStorage durante la hidratación inicial
  // al cambiar de usuario/municipio (sobrescribiría la preferencia recién leída).
  const hydratingRef = useRef(true);

  // Al cambiar el usuario logueado (o el municipio) rehidratar el tema:
  // 1° preferencia guardada del usuario, 2° default del municipio, 3° default global.
  useEffect(() => {
    hydratingRef.current = true;

    const saved = readTheme(user?.id);
    const muniConfig = municipioActual?.tema_config;

    const apariencia = resolverApariencia(saved, muniConfig);

    const sidebarBg = saved.sidebarBg !== null
      ? (saved.sidebarBg && saved.sidebarBg !== 'null' ? saved.sidebarBg : null)
      : (muniConfig?.sidebarBgImage ?? null);
    const sidebarOp = saved.sidebarOp !== null
      ? parseFloat(saved.sidebarOp)
      : (muniConfig?.sidebarBgOpacity ?? 0.3);
    const contentBg = saved.contentBg !== null
      ? (saved.contentBg && saved.contentBg !== 'null' ? saved.contentBg : null)
      : (muniConfig?.contentBgImage ?? null);
    const contentOp = saved.contentOp !== null
      ? parseFloat(saved.contentOp)
      : (muniConfig?.contentBgOpacity ?? 0.1);

    setCurrentPresetId(apariencia.bgId);
    setAccentOverride(apariencia.accentId);
    setCurrentSidebarMode(apariencia.sidebarMode);
    setSidebarBgImageState(sidebarBg);
    setSidebarBgOpacityState(sidebarOp);
    setContentBgImageState(contentBg);
    setContentBgOpacityState(contentOp);

    // Fuente: prioridad localStorage del usuario > tema_config del muni > default
    const fontId = saved.fontId || (muniConfig as any)?.fontId || DEFAULT_FONT_ID;
    setCurrentFontId(fontId);

    // Dejamos de hidratar en el próximo microtask, después de que los setState
    // hagan flush — así los effects que persisten en localStorage ignoran este
    // ciclo y sólo guardan cambios originados por el usuario.
    const t = setTimeout(() => { hydratingRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [user?.id, municipioActual]);

  // Tema de fondo activo. `getBgTheme` es tolerante: un id que ya no exista
  // (preset viejo, tema borrado) devuelve el default en vez de romper.
  const bgTheme = getBgTheme(currentPresetId);
  const currentAccentId = accentOverride ?? bgTheme.acentoRecomendado;

  // Los 13 colores se DERIVAN de los 3 ejes. Memorizado: sin esto se
  // recalcularía la paleta entera —y se re-dispararía el efecto que escribe
  // ~40 CSS vars— en cada render del árbol.
  const theme: Theme = useMemo(
    () => ({
      ...buildThemeColors(bgTheme.id, currentAccentId, currentSidebarMode),
      name: bgTheme.id,
      label: bgTheme.name,
    }),
    [bgTheme.id, bgTheme.name, currentAccentId, currentSidebarMode]
  );

  // Aplicar CSS variables cuando cambia el tema
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', theme.background);
    root.style.setProperty('--bg-secondary', theme.backgroundSecondary);
    root.style.setProperty('--text-primary', theme.text);
    root.style.setProperty('--text-secondary', theme.textSecondary);
    root.style.setProperty('--border-color', theme.border);
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-primary-hover', theme.primaryHover);
    root.style.setProperty('--bg-card', theme.card);
    root.style.setProperty('--bg-sidebar', theme.sidebar);

    // ---- Puente POLIMÓRFICO de tokens del rediseño v2 (--pl-*) ----
    // La paleta completa de Claude Design se DERIVA del theme activo: acento,
    // tintes, superficies, textos, rampa de datos y scrims del hero. Así el
    // rediseño funciona en todos los presets y marcas sin un color fijo.
    // (Los tokens estáticos —tipografía/espaciado/radios— viven en
    // styles/pl-tokens.css.)
    const p = theme.primary;
    const claro = isLight(theme.background);
    const set = (k: string, v: string) => root.style.setProperty(k, v);

    set('--pl-green', p);
    set('--pl-green-600', theme.primaryHover);
    set('--pl-green-700', claro ? darken(p, 14) : lighten(p, 30)); // texto sobre acento suave
    // Ink del acento: texto sobre superficies blancas DENTRO del banner brand
    // (botón sólido del hero). No depende de claro/oscuro: el banner es oscuro siempre.
    set('--pl-accent-ink', darken(p, 32));
    set('--pl-green-200', mix(theme.card, p, 0.30));
    set('--pl-green-100', mix(theme.card, p, 0.16));
    set('--pl-green-050', mix(theme.card, p, 0.08));
    set('--pl-on-brand', theme.primaryText);
    // Lo que va ENCIMA del acento sólido (ícono del botón "+" de la barra
    // inferior, número dentro de una barra llena, etc.): casi-blanco sobre
    // acentos oscuros, casi-negro sobre acentos claros. Se decide por la
    // LUMINANCIA del acento, no por si el tema es claro u oscuro — un tema
    // oscuro puede tener acento amarillo, y ahí el blanco no se lee.
    // Sale del theme, así que ninguna marca necesita su propio hardcodeo.
    set('--pl-on-accent', isLight(p) ? '#101614' : '#ffffff');

    // Semánticos: ÚNICAS constantes = los 3 matices universales (warning/
    // danger/info). Todas sus variantes (texto accesible, superficie suave)
    // se DERIVAN del theme activo, igual que el resto.
    const AMBER = '#F59E0B';
    const RED = '#E5484D';
    const BLUE = '#3B82F6';
    const semantico = (base: string, prefijo: string) => {
      set(`--pl-${prefijo}`, base);
      set(`--pl-${prefijo}-700`, claro ? darken(base, 22) : lighten(base, 25));
      set(`--pl-${prefijo}-100`, mix(theme.card, base, 0.14));
    };
    semantico(AMBER, 'amber');
    semantico(RED, 'red');
    semantico(BLUE, 'blue');
    set('--pl-amber-strong', AMBER);
    // Ámbar legible SOBRE el banner brand (fondo oscuro siempre): valor fijo
    // de la referencia, variante on-brand del matiz universal.
    set('--pl-amber-onbrand', '#FFD66B');

    // Rampa para series de datos (acento → neutro)
    set('--pl-data-1', p);
    set('--pl-data-2', mix(p, theme.card, 0.25));
    set('--pl-data-3', mix(p, theme.card, 0.45));
    set('--pl-data-4', mix(p, theme.card, 0.62));
    set('--pl-data-5', mix(theme.card, theme.textSecondary, 0.35));

    // Superficies y texto
    set('--pl-bg', theme.background);
    set('--pl-surface', theme.card);
    set('--pl-surface-2', theme.backgroundSecondary);
    set('--pl-surface-3', mix(theme.card, theme.background, 0.35));
    set('--pl-surface-hover', mix(theme.card, theme.text, 0.05));
    set('--pl-track', mix(theme.card, theme.text, 0.08));
    set('--pl-sidebar-bg', theme.sidebar);
    set('--pl-text', theme.text);
    set('--pl-text-2', mix(theme.text, theme.textSecondary, 0.45));
    set('--pl-text-3', theme.textSecondary);
    set('--pl-text-muted', mix(theme.textSecondary, theme.background, 0.25));
    set('--pl-text-faint', mix(theme.textSecondary, theme.background, 0.45));
    set('--pl-text-disabled', mix(theme.textSecondary, theme.background, 0.62));
    set('--pl-border', alpha(theme.text, 0.08));
    set('--pl-border-strong', alpha(theme.text, 0.14));
    set('--pl-scrim', alpha('#000000', claro ? 0.40 : 0.62));

    // Sombras (suaves en claro, profundas en oscuro)
    set('--pl-shadow-card', claro
      ? '0 1px 2px rgba(13,20,18,.04), 0 2px 6px rgba(13,20,18,.04)'
      : '0 1px 2px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.35)');
    set('--pl-shadow-float', claro
      ? '0 6px 20px rgba(13,20,18,.10), 0 2px 6px rgba(13,20,18,.06)'
      : '0 6px 20px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.35)');

    // Hero: gradiente del acento + veils sobre foto, todo derivado del primary
    set('--pl-hero-gradient', `linear-gradient(180deg, ${p} 0%, ${darken(p, 25)} 100%)`);
    set('--pl-hero-veil',
      `linear-gradient(96deg, ${alpha(darken(p, 38), 0.90)} 0%, ${alpha(darken(p, 30), 0.62)} 42%, ` +
      `${alpha(p, 0.18)} 78%, ${alpha(lighten(p, 8), 0.06)} 100%)`);
    set('--pl-hero-fade',
      `linear-gradient(180deg, ${alpha(darken(p, 42), 0.28)} 0%, rgba(0,0,0,0) 30%, ${alpha(darken(p, 42), 0.42)} 100%)`);
    set('--pl-hero-strip',
      `linear-gradient(180deg, ${alpha(darken(p, 45), 0.62)} 0%, ${alpha(darken(p, 45), 0.82)} 100%)`);
    // Fondo del botón outline DEL HERO: acento casi negro al 50% (no scrim neutro)
    set('--pl-hero-scrim', alpha(darken(p, 45), 0.50));

    // Aplicar al body directamente
    document.body.style.backgroundColor = theme.background;
    document.body.style.color = theme.text;
  }, [theme]);

  // Guardar preset/variante/fondos en localStorage con scope por usuario.
  // Durante la hidratación inicial (switch de usuario/municipio) no guardamos
  // para no pisar la preferencia recién leída con los defaults.
  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'themePresetId'), currentPresetId);
  }, [currentPresetId, user?.id]);

  // El acento se guarda SÓLO si el usuario eligió uno: sin la clave, cada tema
  // de fondo aplica su `acentoRecomendado`.
  useEffect(() => {
    if (hydratingRef.current) return;
    const key = userScopedKey(user?.id, 'themeAccentId');
    if (accentOverride) {
      localStorage.setItem(key, accentOverride);
    } else {
      localStorage.removeItem(key);
    }
  }, [accentOverride, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'themeSidebarMode'), currentSidebarMode);
  }, [currentSidebarMode, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    const key = userScopedKey(user?.id, 'sidebarBgImage');
    if (sidebarBgImage) {
      localStorage.setItem(key, sidebarBgImage);
    } else {
      localStorage.removeItem(key);
    }
  }, [sidebarBgImage, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'sidebarBgOpacity'), String(sidebarBgOpacity));
  }, [sidebarBgOpacity, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    const key = userScopedKey(user?.id, 'contentBgImage');
    if (contentBgImage) {
      localStorage.setItem(key, contentBgImage);
    } else {
      localStorage.removeItem(key);
    }
  }, [contentBgImage, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'contentBgOpacity'), String(contentBgOpacity));
  }, [contentBgOpacity, user?.id]);

  // Aplicar la fuente cuando cambia (carga Google Fonts + setea CSS var
  // + setea body.style.fontFamily). Persiste en localStorage del usuario.
  useEffect(() => {
    applyFontFamily(currentFontId);
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'fontId'), currentFontId);
  }, [currentFontId, user?.id]);

  // Eje 1: el tema de fondo. No pisa el acento — si el usuario ya eligió uno,
  // esa elección manda sobre el recomendado del tema nuevo.
  const setPreset = (presetId: string) => {
    setCurrentPresetId(presetId);
    // Se recuerda como "el claro" o "el oscuro" del usuario según su modo.
    const modo = getBgTheme(presetId).modo;
    if (modo === 'claro') {
      setUltimoClaro(presetId);
      localStorage.setItem(userScopedKey(user?.id, 'themePresetClaro'), presetId);
    } else {
      setUltimoOscuro(presetId);
      localStorage.setItem(userScopedKey(user?.id, 'themePresetOscuro'), presetId);
    }
  };

  /** La luna/sol de la topbar: salta al último tema del otro modo. */
  const alternarModo = () => {
    setCurrentPresetId(bgTheme.modo === 'claro' ? ultimoOscuro : ultimoClaro);
  };

  // Eje 2: a partir de acá el acento es una elección explícita del usuario.
  const setAccent = (accentId: string) => {
    setAccentOverride(accentId);
  };

  // Eje 3: fondo de la barra lateral.
  const setSidebarMode = (mode: SidebarMode) => {
    setCurrentSidebarMode(mode);
  };

  const setSidebarBgImage = (url: string | null) => {
    setSidebarBgImageState(url);
  };

  const setSidebarBgOpacity = (opacity: number) => {
    setSidebarBgOpacityState(opacity);
  };

  const setContentBgImage = (url: string | null) => {
    setContentBgImageState(url);
  };

  const setContentBgOpacity = (opacity: number) => {
    setContentBgOpacityState(opacity);
  };

  const setFont = (fontId: string) => {
    setCurrentFontId(fontId);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        currentPresetId,
        setPreset,
        currentMode: bgTheme.modo,
        alternarModo,
        currentAccentId,
        setAccent,
        currentSidebarMode,
        setSidebarMode,
        sidebarBgImage,
        setSidebarBgImage,
        sidebarBgOpacity,
        setSidebarBgOpacity,
        contentBgImage,
        setContentBgImage,
        contentBgOpacity,
        setContentBgOpacity,
        currentFontId,
        setFont,
        presets: selectorPresets,
        accents: selectorAccents,
        sidebarOptions: sidebarModes,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
