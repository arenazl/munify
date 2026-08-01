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
import { Fragment, useMemo, useState, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVecinoBadges } from '../../hooks/useVecinoBadges';
import { useNavBadges, type NavBadges } from './useNavBadges';
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

export function SidebarV2({ items, colapsado, onToggleColapsado }: SidebarV2Props) {
  const location = useLocation();
  const { user, municipioActual } = useAuth();
  const badges = useVecinoBadges();
  const navBadges = useNavBadges();

  // Acordeones: guardamos los CERRADOS (default: todos abiertos), así los
  // grupos nuevos que aparezcan por flags arrancan abiertos sin migración.
  const [cerrados, setCerrados] = useState<Set<string>>(() => new Set());

  const toggleGrupo = (id: string) => {
    setCerrados((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });
  };

  const { sueltos, grupos } = useMemo(() => {
    const sueltosAcc: ShellNavItem[] = [];
    const gruposAcc: GrupoNav[] = [];
    const porCategoria = new Map<string, GrupoNav>();
    for (const item of items) {
      const cat = item.categoria;
      if (!cat || cat === CATEGORIA_SUELTOS) {
        sueltosAcc.push(item);
        continue;
      }
      let grupo = porCategoria.get(cat);
      if (!grupo) {
        grupo = { id: cat, titulo: cat, items: [] };
        porCategoria.set(cat, grupo);
        gruposAcc.push(grupo);
      }
      grupo.items.push(item);
    }
    return { sueltos: sueltosAcc, grupos: gruposAcc };
  }, [items]);

  const activo = hrefActivo(location.pathname, items);
  const esActivo = (item: ShellNavItem) => activo !== '' && normalizarHref(item.href) === activo;

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

  // ---- Modo colapsado: tile de marca + solo iconos con title ----
  if (colapsado) {
    return (
      <aside className="sv2 sv2--colapsado">
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
          {grupos.map((grupo, i) => (
            <Fragment key={grupo.id}>
              {(sueltos.length > 0 || i > 0) && <span className="sv2-cseparador" role="separator" />}
              {grupo.items.map((item) => {
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
            </Fragment>
          ))}
        </nav>
        <span className="sv2-cespaciador" />
        <button
          type="button"
          className="sv2-expandir"
          title="Expandir menú"
          aria-label="Expandir menú"
          onClick={onToggleColapsado}
        >
          <ChevronRight className="sv2-chev" />
        </button>
      </aside>
    );
  }

  // ---- Modo expandido ----
  return (
    <aside className="sv2">
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
        <button
          type="button"
          className="sv2-colapsar"
          title="Colapsar menú"
          aria-label="Colapsar menú"
          onClick={onToggleColapsado}
        >
          <ChevronLeft className="sv2-chev" />
        </button>
      </div>

      <nav className="sv2-nav" aria-label="Navegación principal">
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

        {grupos.map((grupo) => {
          const abierto = !cerrados.has(grupo.id);
          return (
            <Fragment key={grupo.id}>
              <button
                type="button"
                className={clases('sv2-grupo-cab', !abierto && 'sv2-grupo-cab--cerrado')}
                aria-expanded={abierto}
                onClick={() => toggleGrupo(grupo.id)}
              >
                <span className="sv2-grupo-titulo">{grupo.titulo}</span>
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
      </nav>

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
