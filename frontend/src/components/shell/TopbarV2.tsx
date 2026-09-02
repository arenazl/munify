/**
 * TopbarV2 — barra superior desktop del rediseño v2 de Munify.
 *
 * Filosofía (APP_GUIDE/components/v2/TopbarV2): CONTEXTO a la izquierda,
 * PERSONA a la derecha. El ámbito no es un usuario — siempre loguea una
 * persona con un rol y el ámbito es solo el contexto donde trabaja.
 *
 *  - IZQUIERDA (miga de pan de DOS tramos, "Ámbito / Página"). La miga la
 *    calcula `MigasProvider` (contexto) y acá sólo se DIBUJA; el control del
 *    primer tramo sale de `tipoAmbito`:
 *      · 'dependencia' → pill FIJA con la dependencia del usuario;
 *      · 'global' (super admin) → MunicipioSwitcher, que además de decir el
 *        ámbito deja cambiarlo (antes vivía en el sidebar);
 *      · 'municipio' → texto con el municipio actual.
 *    El ámbito NUNCA queda vacío: si no hay dependencia ni municipio cargado
 *    igual hay texto ("Municipalidad"). Segundo tramo = la pantalla actual,
 *    derivada de config/navigation.ts (ver shell/rutas.ts).
 *  - CENTRO: espacio libre. NO lleva buscador: la búsqueda de esta app es
 *    por pantalla (cada listado filtra lo que el usuario está viendo), así
 *    que un campo global acá duplicaba la función sin mejorarla, igual que
 *    el que se eliminó del sidebar. `BuscadorGlobal` sigue en el repo por si
 *    más adelante hay búsqueda indexada entre módulos.
 *  - DERECHA: slot `acciones` (tema/notificaciones/ajustes, los arma el
 *    Layout) | separador | persona (avatar con GUARDA de apellido, nombre,
 *    rol y el menú de usuario existente movido desde el sidebar viejo).
 *
 * El switcher "Todas las dependencias" del admin sigue sin existir: hoy
 * ninguna página expone un filtro de dependencia GLOBAL (los filtros son
 * locales de cada pantalla), así que la topbar no promete uno.
 *
 * Estilos en styles/shell-v2.css (prefijo tv2-), 100% sobre tokens --pl-*.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMigas } from '../../contexts/migas';
import MunicipioSwitcher from '../admin/MunicipioSwitcher';

export interface TopbarV2Props {
  /* Ya NO recibe `items`: el nombre de la pantalla lo resuelve el
     `MigasProvider` (contexto), no la barra. */
  /** Acciones globales de la app: tema, notificaciones, ajustes. */
  acciones?: ReactNode;
  /** Contenido del menú de la persona (Mi Perfil / notifs / salir). */
  menuUsuario?: ReactNode;
}

/** Cierra un desplegable al clickear afuera o apretar Escape. */
function useCerrarAfuera(abierto: boolean, cerrar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const alClickear = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('mousedown', alClickear);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClickear);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto, cerrar]);
  return ref;
}

interface BotonPersonaProps {
  iniciales: string;
  nombre: string;
  rol: string;
  menu?: ReactNode;
}

function BotonPersona({ iniciales, nombre, rol, menu }: BotonPersonaProps) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  const ref = useCerrarAfuera(abierto, cerrar);

  return (
    <div className="tv2-persona" ref={ref}>
      <button
        type="button"
        className="tv2-persona-btn"
        aria-haspopup={menu ? 'menu' : undefined}
        aria-expanded={menu ? abierto : undefined}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="tv2-avatar" aria-hidden>
          {iniciales}
        </span>
        <span className="tv2-persona-datos">
          <span className="tv2-persona-nombre">{nombre}</span>
          <span className="tv2-persona-rol">{rol}</span>
        </span>
        <ChevronDown className="tv2-chevron" aria-hidden />
      </button>

      {menu && abierto && (
        // Cualquier click adentro es una acción → cerrar el menú.
        <div className="tv2-persona-menu" role="menu" onClick={cerrar}>
          {menu}
        </div>
      )}
    </div>
  );
}

export function TopbarV2({ acciones, menuUsuario }: TopbarV2Props) {
  const { user } = useAuth();
  const migas = useMigas();

  if (!user) return null;

  const esSuperAdmin = user.rol === 'admin' && !user.municipio_id;

  // GUARDA de apellido: el avatar nunca rompe si falta nombre o apellido.
  const iniciales = `${user.nombre?.[0] ?? '?'}${user.apellido?.[0] ?? ''}`.toUpperCase();
  const nombreCompleto = [user.nombre, user.apellido].filter(Boolean).join(' ') || user.email;
  const rolLabel = user.dependencia ? 'Dependencia' : esSuperAdmin ? 'Super Admin' : user.rol;

  // Sin provider (montaje raro o test) la miga degrada a un ámbito genérico
  // antes que a un tramo vacío: la regla es que SIEMPRE haya dos.
  const tipoAmbito = migas?.tipoAmbito ?? (esSuperAdmin ? 'global' : 'municipio');
  const ambito = migas?.ambito ?? 'Municipalidad';
  const pagina = migas?.pagina ?? 'Inicio';

  return (
    <header className="tv2">
      {/* Izquierda: miga de pan de dos tramos — Ámbito / Página */}
      <nav className="tv2-migas" aria-label="Miga de pan">
        {tipoAmbito === 'dependencia' ? (
          <span className="tv2-pill-fijo" title={ambito}>
            <Building2 className="tv2-icono" aria-hidden />
            <span className="tv2-pill-label">{ambito}</span>
          </span>
        ) : tipoAmbito === 'global' ? (
          <div className="tv2-contexto-switcher">
            <MunicipioSwitcher />
          </div>
        ) : (
          <span className="tv2-ambito" title={ambito}>
            <Building2 className="tv2-icono" aria-hidden />
            <span className="tv2-pill-label">{ambito}</span>
          </span>
        )}
        <span className="tv2-sep-miga" aria-hidden>
          /
        </span>
        <span className="tv2-pagina" aria-current="page">
          {pagina}
        </span>
      </nav>

      {/* Centro: vacío a propósito. Acá vivió un buscador global; se sacó
          porque la búsqueda REAL de la app es por pantalla (cada listado
          tiene la suya, que filtra lo que el usuario está mirando) y un
          segundo campo arriba repetía la función sin hacerla mejor —el
          mismo motivo por el que se eliminó el del sidebar—. El componente
          `BuscadorGlobal` queda en el repo, listo para volver acá SI algún
          día existe búsqueda indexada entre módulos. */}
      <span className="tv2-espacio" aria-hidden />

      {/* Derecha: acciones globales | persona */}
      <div className="tv2-derecha">
        {acciones && (
          <>
            <div className="tv2-acciones">{acciones}</div>
            <span className="tv2-sep-v" aria-hidden />
          </>
        )}
        <BotonPersona
          iniciales={iniciales}
          nombre={nombreCompleto}
          rol={rolLabel}
          menu={menuUsuario}
        />
      </div>
    </header>
  );
}
