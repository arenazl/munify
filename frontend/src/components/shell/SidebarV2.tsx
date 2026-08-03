/**
 * SidebarV2 — sidebar desktop del rediseño v2 de Munify (Claude Design).
 *
 * Adaptación del componente agnóstico APP_GUIDE/components/v2/SidebarV2 al
 * shell real de Munify:
 *  - 256px expandido / 72px colapsado (tokens --pl-sidebar-w*). El estado de
 *    colapso es CONTROLADO por el Layout (persiste en localStorage y de él
 *    sale el padding-left del contenido), por eso acá entra por props.
 *  - Header de marca: BrandMark en tile + nombre bicolor existente (misma
 *    lógica que el sidebar viejo: multi-palabra corta por espacio; una
 *    palabra usa BRAND.nameAccentIndex) + municipio como subtítulo.
 *  - SIN buscador: el que había acá era inerte (parecía buscar y no buscaba)
 *    y se borró. La búsqueda vive en la topbar (`BuscadorGlobal`), que además
 *    se quedó con el atajo ⌘K. El espacio liberado se lo lleva el header de
 *    marca.
 *  - Navegación desde config/navigation.ts agrupada en ACORDEONES por
 *    `categoria`. La categoría "Principal" (Dashboard) va como items
 *    sueltos arriba, como en la referencia.
 *  - Item activo: pill acento + barra 3px, resuelto por LONGEST-PREFIX
 *    match ('/gestion' no puede quedar activo en '/gestion/reclamos').
 *  - Badges: items con badgeKey (vecino) usan useVecinoBadges; items de
 *    gestión (Reclamos/Órdenes/Trámites/SLA) mapean por href contra
 *    useNavBadges (una carga por sesión, cache de módulo). SLA va en
 *    ámbar cuando hay reclamos en riesgo.
 *  - Pie fijo "Ayuda y soporte" (solo expandido), inerte por ahora.
 *
 * Estilos en styles/shell-v2.css (prefijo sv2-), 100% sobre tokens --pl-*.
 * Únicos inline permitidos: valores runtime de marca (BRAND.accent,
 * BRAND.nameFont), igual que en el sidebar viejo.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, HelpCircle, MoveRight, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVecinoBadges } from '../../hooks/useVecinoBadges';
import { useNavBadges, type NavBadges } from './useNavBadges';
import { ICONO_CATEGORIA } from '../../config/navigation';
import { BrandMark } from '../../brands/BrandMark';
import { BRAND } from '../../brands';

/** Item de navegación tal como sale de config/navigation.ts (post-filter). */
export interface ShellNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  categoria?: string;
  description?: string;
  badgeKey?: string;
}

export interface SidebarV2Props {
  items: ShellNavItem[];
  colapsado: boolean;
  onToggleColapsado: () => void;
}

/** Categoría cuyos items van sueltos arriba de los acordeones. */
const CATEGORIA_SUELTOS = 'Principal';

/**
 * Categoría que va suelta ABAJO de todo, después de los acordeones.
 *
 * Existe porque "Configuración" era un grupo desplegable con UN solo item que
 * se llamaba igual que el grupo: abrirlo mostraba "Configuración >
 * Configuración". Un acordeón de un elemento no agrupa nada, sólo agrega un
 * click. Como el destino es el cierre del menú —lo último que se toca—, va
 * suelto al pie, no arriba con Dashboard y Mostrador.
 */
const CATEGORIA_SUELTOS_PIE = 'Configuración';

/**
 * Badges de gestión (admin/supervisor): href del item → campo de NavBadges.
 * Los items de vecino siguen resolviendo por su `badgeKey` (useVecinoBadges).
 */
const BADGE_NAV_POR_HREF: Record<string, keyof NavBadges> = {
  '/gestion/reclamos': 'reclamos',
  '/gestion/tramites': 'tramites',
  '/gestion/sla': 'sla',
  '/gestion/ordenes-trabajo': 'ordenes',
};

function clases(...xs: Array<string | false | undefined>): string {
  return xs.filter(Boolean).join(' ');
}

function normalizarHref(href: string): string {
  return href.endsWith('/') && href !== '/' ? href.slice(0, -1) : href;
}

/**
 * Href activo = el item cuyo href matchea el pathname con el prefijo MÁS
 * largo (exacto o por segmento). Evita que '/gestion' quede activo cuando
 * la ruta es '/gestion/reclamos', o '/gestion/tesoreria' cuando es
 * '/gestion/tesoreria/cajas'.
 */
function hrefActivo(pathname: string, items: ShellNavItem[]): string {
  let mejor = '';
  for (const item of items) {
    const base = normalizarHref(item.href);
    if (pathname === base || pathname.startsWith(`${base}/`)) {
      if (base.length > mejor.length) mejor = base;
    }
  }
  return mejor;
}

/** Parte el nombre de marca en [base, acento] — misma lógica del shell viejo. */
function partirNombreMarca(): [string, string] {
  const words = BRAND.name.split(' ');
  if (words.length > 1) {
    return [words[0], ` ${words.slice(1).join(' ')}`];
  }
  if (BRAND.nameAccentIndex) {
    return [BRAND.name.slice(0, BRAND.nameAccentIndex), BRAND.name.slice(BRAND.nameAccentIndex)];
  }
  return [BRAND.name, ''];
}

interface GrupoNav {
  id: string;
  titulo: string;
  items: ShellNavItem[];
  /** Icono de la categoría para el rail colapsado (fallback: el del 1er item). */
  icono: ComponentType<{ className?: string }>;
}

/**
 * Flyout del rail: abre con demora corta y cierra con demora un poco mayor.
 * El delay de cierre es lo que permite cruzar el hueco entre el icono y el
 * panel sin que parpadee; el de apertura evita que barrer el rail con el mouse
 * dispare cuatro paneles seguidos.
 */
const FLY_ABRIR_MS = 120;
const FLY_CERRAR_MS = 200;

/**
 * Mantiene la cabecera clickeada QUIETA mientras el acordeón exclusivo pliega
 * al grupo anterior: si el que se pliega queda arriba, el bloque subiría y la
 * cabecera se escaparía del cursor. Compensa scrollTop del nav frame a frame
 * mientras dura la transición (grid-template-rows, --pl-dur-sheet 240ms; el
 * loop corre 450ms para cubrirla con margen y muere solo).
 * Llamar ANTES de que el re-render toque el DOM: captura la posición actual.
 */
function anclarCabecera(nav: HTMLElement, cab: HTMLElement) {
  const y0 = cab.getBoundingClientRect().top;
  const t0 = performance.now();
  const paso = () => {
    nav.scrollTop += cab.getBoundingClientRect().top - y0;
    if (performance.now() - t0 < 450) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

interface ItemNavProps {
  item: ShellNavItem;
  activo: boolean;
  badge: number;
  /** Pill en tono alerta (ámbar) — hoy solo SLA con reclamos en riesgo. */
  badgeAlerta?: boolean;
  suelto?: boolean;
}

function ItemNav({ item, activo, badge, badgeAlerta, suelto }: ItemNavProps) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      title={item.description}
      aria-current={activo ? 'page' : undefined}
      className={clases('sv2-item', suelto && 'sv2-item--suelto', activo && 'sv2-item--activo')}
    >
      <span className="sv2-item-icono">
        <Icon />
      </span>
      <span className="sv2-item-label">{item.name}</span>
      {badge > 0 && (
        <span className={clases('sv2-badge', badgeAlerta && 'sv2-badge--alerta')}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function ItemColapsado({
  item,
  activo,
  badge,
  badgeAlerta,
}: {
  item: ShellNavItem;
  activo: boolean;
  badge: number;
  badgeAlerta?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      title={item.name}
      aria-label={item.name}
      aria-current={activo ? 'page' : undefined}
      className={clases('sv2-citem', activo && 'sv2-citem--activo')}
    >
      <span className="sv2-item-icono">
        <Icon />
      </span>
      {badge > 0 && (
        <span className={clases('sv2-minibadge', badgeAlerta && 'sv2-minibadge--alerta')}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

/**
 * Icono de GRUPO en el rail colapsado. Reemplaza al listado plano de items:
 * colapsado se ve un icono por categoría (4-6), no los ~24 items sueltos que
 * no dejaban saber a qué grupo pertenecía cada uno. Los items salen en el
 * flyout, al pasar el mouse.
 *
 * Es <button> y no <Link> a propósito: no navega a ningún lado — abre el panel.
 * Navegar es tarea de los items de adentro.
 */
function GrupoColapsado({
  grupo,
  marcado,
  contieneActivo,
  badge,
  onAbrir,
  onCerrar,
}: {
  grupo: GrupoNav;
  /** Grupo que quedó abierto en modo expandido: se recuerda al colapsar. */
  marcado: boolean;
  contieneActivo: boolean;
  badge: number;
  onAbrir: (el: HTMLElement) => void;
  onCerrar: () => void;
}) {
  const Icon = grupo.icono;
  return (
    <button
      type="button"
      title={grupo.titulo}
      aria-label={grupo.titulo}
      aria-haspopup="menu"
      className={clases(
        'sv2-cgrupo',
        contieneActivo && 'sv2-cgrupo--activo',
        marcado && !contieneActivo && 'sv2-cgrupo--marcado',
      )}
      onMouseEnter={(e) => onAbrir(e.currentTarget)}
      onMouseLeave={onCerrar}
      onFocus={(e) => onAbrir(e.currentTarget)}
      onClick={(e) => onAbrir(e.currentTarget)}
    >
      <span className="sv2-item-icono">
        <Icon />
      </span>
      {badge > 0 && <span className="sv2-minibadge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

export function SidebarV2({ items, colapsado, onToggleColapsado }: SidebarV2Props) {
  const location = useLocation();
  const { user, municipioActual } = useAuth();
  const badges = useVecinoBadges();
  const navBadges = useNavBadges();

  // Acordeón EXCLUSIVO: a lo sumo UN grupo abierto — por default el de la
  // ruta activa, el resto plegado (con munis con muchos módulos activos,
  // todo abierto no entra en una pantalla; plegado, las categorías son un
  // índice). La elección manual (abrir otro / plegar el activo) vale para la
  // ruta donde se hizo: al navegar vuelve a mandar la ruta activa. Modelo
  // derivado, sin efecto ni estado espejo.
  const [manual, setManual] = useState<{ ruta: string; id: string | null } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Flyout del rail colapsado: qué grupo y a qué altura. `top` se mide contra
  // el aside (no contra la ventana) para que el panel salga alineado al icono
  // aunque el rail esté scrolleado.
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(null);
  const flyTimer = useRef<number | undefined>(undefined);

  const cancelarTimer = () => {
    if (flyTimer.current !== undefined) {
      window.clearTimeout(flyTimer.current);
      flyTimer.current = undefined;
    }
  };

  const abrirFlyout = useCallback((id: string, el: HTMLElement) => {
    cancelarTimer();
    const aside = asideRef.current;
    if (!aside) return;
    const top = el.getBoundingClientRect().top - aside.getBoundingClientRect().top;
    flyTimer.current = window.setTimeout(() => setFlyout({ id, top }), FLY_ABRIR_MS);
  }, []);

  const cerrarFlyout = useCallback(() => {
    cancelarTimer();
    flyTimer.current = window.setTimeout(() => setFlyout(null), FLY_CERRAR_MS);
  }, []);

  useEffect(() => cancelarTimer, []);

  // El flyout sólo existe colapsado: se DERIVA en vez de sincronizarse con un
  // effect, así no queda un panel huérfano flotando sobre la nav expandida.
  const flyActivo = colapsado ? flyout : null;

  // Alternar SIEMPRE por acá (botón y teclado): cierra el panel abierto en el
  // mismo gesto, para que al volver a colapsar no reaparezca uno viejo sin
  // que el usuario haya pasado el mouse.
  const alternarColapso = useCallback(() => {
    cancelarTimer();
    setFlyout(null);
    onToggleColapsado();
  }, [onToggleColapsado]);

  // Atajo "[": alterna el colapso. Se ignora mientras se escribe, si no
  // tipear un corchete en un campo plegaría el menú.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      alternarColapso();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alternarColapso]);

  const { sueltos, sueltosPie, grupos } = useMemo(() => {
    const sueltosAcc: ShellNavItem[] = [];
    const sueltosPieAcc: ShellNavItem[] = [];
    const gruposAcc: GrupoNav[] = [];
    const porCategoria = new Map<string, GrupoNav>();
    for (const item of items) {
      const cat = item.categoria;
      if (!cat || cat === CATEGORIA_SUELTOS) {
        sueltosAcc.push(item);
        continue;
      }
      if (cat === CATEGORIA_SUELTOS_PIE) {
        sueltosPieAcc.push(item);
        continue;
      }
      let grupo = porCategoria.get(cat);
      if (!grupo) {
        // Icono de la categoría; si no está mapeada, el del primer item que la
        // estrena — así una categoría nueva entra al rail sin tocar el mapa.
        grupo = { id: cat, titulo: cat, items: [], icono: ICONO_CATEGORIA[cat] ?? item.icon };
        porCategoria.set(cat, grupo);
        gruposAcc.push(grupo);
      }
      grupo.items.push(item);
    }
    return { sueltos: sueltosAcc, sueltosPie: sueltosPieAcc, grupos: gruposAcc };
  }, [items]);

  const activo = hrefActivo(location.pathname, items);
  const esActivo = (item: ShellNavItem) => activo !== '' && normalizarHref(item.href) === activo;

  const grupoDeRutaActiva = useMemo(
    () => grupos.find((g) => g.items.some((it) => normalizarHref(it.href) === activo))?.id ?? null,
    [grupos, activo],
  );
  const abiertoId = manual && manual.ruta === activo ? manual.id : grupoDeRutaActiva;

  // Al abrir un grupo se pliega el anterior; anclarCabecera evita que la
  // cabecera clickeada se mueva de lugar cuando el plegado ocurre arriba.
  const toggleGrupo = (id: string, cab?: HTMLElement) => {
    setManual({ ruta: activo, id: abiertoId === id ? null : id });
    if (cab && navRef.current) anclarCabecera(navRef.current, cab);
  };

  // Badge de un item:
  //  1) items de vecino → badgeKey contra useVecinoBadges ('turnos' aún no
  //     existe en el hook: el fallback lo deja en cero sin romper);
  //  2) items de gestión → href contra useNavBadges (Reclamos/Órdenes/
  //     Trámites en acento suave; SLA en ámbar cuando hay en riesgo).
  const badgeDe = (item: ShellNavItem): { n: number; alerta: boolean } => {
    if (item.badgeKey) {
      const n = (badges as unknown as Record<string, unknown>)[item.badgeKey];
      return { n: typeof n === 'number' ? n : 0, alerta: false };
    }
    const clave = BADGE_NAV_POR_HREF[normalizarHref(item.href)];
    if (!clave) return { n: 0, alerta: false };
    const n = navBadges[clave];
    return { n: typeof n === 'number' ? n : 0, alerta: clave === 'sla' };
  };

  const [nombreBase, nombreAcento] = partirNombreMarca();
  const subtitulo = user?.municipio_id && municipioActual ? municipioActual.nombre : undefined;

  // Botón ÚNICO de colapso, anclado al borde a la altura del logo. Antes eran
  // dos (uno en el header para cerrar, otro al pie para abrir): el control
  // cambiaba de lugar según el estado, así que había que buscarlo. Ahora no se
  // mueve nunca y sólo gira la flecha.
  const botonToggle = (
    <button
      type="button"
      className="sv2-toggle"
      title={`${colapsado ? 'Expandir' : 'Colapsar'} el menú  [`}
      aria-label={colapsado ? 'Expandir el menú' : 'Colapsar el menú'}
      aria-expanded={!colapsado}
      onClick={alternarColapso}
    >
      <ChevronLeft className="sv2-chev" />
    </button>
  );

  // ---- Modo colapsado: rail de GRUPOS (no de items) + flyout ----
  if (colapsado) {
    const grupoFly = flyActivo ? grupos.find((g) => g.id === flyActivo.id) ?? null : null;
    return (
      <aside className="sv2 sv2--colapsado" ref={asideRef}>
        <Link to="/gestion" className="sv2-logo sv2-logo--tile" title={BRAND.name}>
          <BrandMark size={26} variant="sidebar" />
        </Link>
        <nav className="sv2-cnav" aria-label="Navegación principal">
          {sueltos.map((item) => {
            const b = badgeDe(item);
            return (
              <ItemColapsado
                key={item.href}
                item={item}
                activo={esActivo(item)}
                badge={b.n}
                badgeAlerta={b.alerta}
              />
            );
          })}
          {sueltos.length > 0 && grupos.length > 0 && (
            <span className="sv2-cseparador" role="separator" />
          )}
          {grupos.map((grupo) => (
            <GrupoColapsado
              key={grupo.id}
              grupo={grupo}
              marcado={abiertoId === grupo.id}
              contieneActivo={grupo.items.some(esActivo)}
              badge={grupo.items.reduce((acc, it) => acc + badgeDe(it).n, 0)}
              onAbrir={(el) => abrirFlyout(grupo.id, el)}
              onCerrar={cerrarFlyout}
            />
          ))}
          {sueltosPie.length > 0 && (
            <>
              {grupos.length > 0 && <span className="sv2-cseparador" role="separator" />}
              {sueltosPie.map((item) => {
                const b = badgeDe(item);
                return (
                  <ItemColapsado
                    key={item.href}
                    item={item}
                    activo={esActivo(item)}
                    badge={b.n}
                    badgeAlerta={b.alerta}
                  />
                );
              })}
            </>
          )}
        </nav>

        {grupoFly && (
          <div
            className="sv2-flyout"
            role="menu"
            aria-label={grupoFly.titulo}
            style={{ top: flyActivo?.top }}
            onMouseEnter={cancelarTimer}
            onMouseLeave={cerrarFlyout}
          >
            <div className="sv2-flyout-cab">
              <span className="sv2-flyout-titulo">{grupoFly.titulo}</span>
            </div>
            <div className="sv2-flyout-items">
              {grupoFly.items.map((item) => {
                const b = badgeDe(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    role="menuitem"
                    className={clases('sv2-flyout-item', esActivo(item) && 'sv2-flyout-item--activo')}
                    onClick={() => setFlyout(null)}
                  >
                    <span className="sv2-item-icono">
                      <Icon />
                    </span>
                    <span className="sv2-item-label">{item.name}</span>
                    {b.n > 0 && (
                      <span className={clases('sv2-badge', b.alerta && 'sv2-badge--alerta')}>
                        {b.n > 99 ? '99+' : b.n}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {botonToggle}
      </aside>
    );
  }

  // ---- Modo expandido ----
  return (
    <aside className="sv2" ref={asideRef}>
      <div className="sv2-marca">
        <Link to="/gestion" className="sv2-logo" title={BRAND.name}>
          <BrandMark size={26} variant="sidebar" />
        </Link>
        <div className="sv2-marca-textos">
          {/* BRAND.nameFont y BRAND.accent son valores runtime de marca
              (white-label): inline permitido, igual que en el shell viejo. */}
          <span className="sv2-nombre" style={{ fontFamily: BRAND.nameFont }}>
            {nombreBase}
            {nombreAcento !== '' && <span style={{ color: BRAND.accent }}>{nombreAcento}</span>}
          </span>
          {subtitulo && <span className="sv2-subtitulo">{subtitulo}</span>}
        </div>
      </div>
      {botonToggle}

      <nav className="sv2-nav" ref={navRef} aria-label="Navegación principal">
        {/* Los sueltos van en su propio bloque con una hairline abajo: sin ella
            quedaban flotando contra el primer título de grupo y se leían como
            un grupo más al que le faltaba la cabecera. */}
        {sueltos.length > 0 && (
          <div className="sv2-sueltos">
            {sueltos.map((item) => {
              const b = badgeDe(item);
              return (
                <ItemNav
                  key={item.href}
                  item={item}
                  activo={esActivo(item)}
                  badge={b.n}
                  badgeAlerta={b.alerta}
                  suelto
                />
              );
            })}
          </div>
        )}

        {grupos.map((grupo) => {
          const abierto = abiertoId === grupo.id;
          // Plegado, la cabecera resume los badges de sus items (suma); al
          // abrirse el detalle queda a la vista y el agregado sobra.
          const nGrupo = abierto ? 0 : grupo.items.reduce((acc, it) => acc + badgeDe(it).n, 0);
          return (
            <Fragment key={grupo.id}>
              <button
                type="button"
                className={clases('sv2-grupo-cab', !abierto && 'sv2-grupo-cab--cerrado')}
                aria-expanded={abierto}
                onClick={(e) => toggleGrupo(grupo.id, e.currentTarget)}
              >
                <span className="sv2-grupo-titulo">{grupo.titulo}</span>
                {nGrupo > 0 && (
                  <span className="sv2-badge sv2-badge--grupo">{nGrupo > 99 ? '99+' : nGrupo}</span>
                )}
                <ChevronDown className="sv2-grupo-chevron" />
              </button>
              <div className={clases('sv2-grupo-items', !abierto && 'sv2-grupo-items--cerrado')}>
                <div className="sv2-grupo-items-int">
                  {grupo.items.map((item) => {
                    const b = badgeDe(item);
                    return (
                      <ItemNav
                        key={item.href}
                        item={item}
                        activo={esActivo(item)}
                        badge={b.n}
                        badgeAlerta={b.alerta}
                      />
                    );
                  })}
                </div>
              </div>
            </Fragment>
          );
        })}

        {/* Cierre del menú: suelto al pie, con su hairline arriba. Antes era un
            acordeón de un solo item llamado igual que el grupo. */}
        {sueltosPie.length > 0 && (
          <div className="sv2-sueltos sv2-sueltos--pie">
            {sueltosPie.map((item) => {
              const b = badgeDe(item);
              return (
                <ItemNav
                  key={item.href}
                  item={item}
                  activo={esActivo(item)}
                  badge={b.n}
                  badgeAlerta={b.alerta}
                  suelto
                />
              );
            })}
          </div>
        )}
      </nav>

      {/* [MOCK] Tarjeta contextual del módulo abierto — cifra, texto y acción
          son datos de MUESTRA hardcodeados; acá va a vivir la info contextual
          real del módulo (pendientes, alertas, vencimientos) cuando se cablee
          al backend. Solo el título sigue al grupo abierto. */}
      {(() => {
        const grupoAbierto = grupos.find((g) => g.id === abiertoId) ?? null;
        const IconoCtx = grupoAbierto?.items[0]?.icon ?? Star;
        return (
          <div className="sv2-ctx">
            <div className="sv2-ctx-cab">
              <span className="sv2-ctx-icono">
                <IconoCtx />
                <span className="sv2-ctx-latido" />
              </span>
              <span className="sv2-ctx-titulo">{grupoAbierto ? grupoAbierto.titulo : 'Hoy'}</span>
              <span className="sv2-ctx-cifra">8 pendientes</span>
            </div>
            <p className="sv2-ctx-texto">1 venció su SLA y 4 no tienen cuadrilla asignada.</p>
            <span className="sv2-ctx-link">
              Ver el vencido
              <MoveRight />
            </span>
          </div>
        );
      })()}

      {/* Pie fijo (paridad referencia): "Ayuda y soporte" con hairline
          arriba. Todavía sin destino — inerte, cursor default. */}
      <div className="sv2-pie">
        <span className="sv2-pie-item" title="Próximamente">
          <span className="sv2-item-icono">
            <HelpCircle />
          </span>
          <span className="sv2-item-label">Ayuda y soporte</span>
        </span>
      </div>
    </aside>
  );
}
