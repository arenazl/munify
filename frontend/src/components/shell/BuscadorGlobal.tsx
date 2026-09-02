/**
 * BuscadorGlobal — el buscador de la TOPBAR. Es GLOBAL (busca en toda la app),
 * no contextual: el placeholder es fijo, igual que en la referencia del
 * diseñador (design/handoff-v2/references/reclamos-lista-v2.dc.html, panel de
 * búsqueda) — "Buscar reclamo, trámite, vecino…".
 *
 * Único dueño del atajo ⌘K / Ctrl+K en la app: el chip del `ListToolbar` de
 * los ABMs se sacó y el buscador inerte del sidebar se borró. El input de la
 * toolbar del ABM sigue existiendo y filtrando la grilla, sin atajo.
 *
 * ESTADO ACTUAL (fase 1): la UI está completa pero TODAVÍA NO HAY MOTOR de
 * búsqueda. Como un control que se traga el texto y no devuelve nada es un
 * control que miente, mientras no llegue el motor el desplegable dice, con
 * todas las letras, que la búsqueda global está en construcción. No se
 * deshabilita el input (eso escondería el atajo y la función), se es honesto
 * sobre lo que pasa al tipear.
 *
 * FASE 2 — enchufar datos sin tocar el componente:
 *   <BuscadorGlobal
 *     onBuscar={(texto) => { ...  debounce + fetch a cargo del consumidor }}
 *     cargando={cargando}
 *     grupos={[{ id: 'reclamos', titulo: 'Reclamos', items: [...] }]}
 *   />
 * Con `onBuscar` presente el aviso de construcción desaparece solo y el panel
 * pasa a renderizar los grupos (o el vacío "sin resultados"). El markup de
 * resultados agrupados por tipo de entidad ya está escrito acá abajo.
 *
 * El reseteo al navegar (panel cerrado + consulta vacía) no se hace con un
 * efecto: la topbar lo monta con `key={pathname}`, así cambiar de pantalla
 * remonta el buscador limpio sin cascada de renders.
 *
 * Estilos: clases `tv2-buscar*` en styles/shell-v2.css, 100% tokens --pl-*.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Placeholder global (referencia del diseñador). */
export const PLACEHOLDER_BUSQUEDA = 'Buscar reclamo, trámite, vecino…';

/** Mac usa ⌘; el resto, Ctrl. El chip nunca miente sobre la tecla real. */
const ES_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const ATAJO_LABEL = ES_MAC ? '⌘K' : 'Ctrl K';

/** Tono de la píldora de un resultado (mismo lenguaje que los estados). */
export type TonoResultado = 'neutro' | 'exito' | 'alerta' | 'peligro';

/** Una fila del desplegable. */
export interface ResultadoBusqueda {
  id: string;
  /** Línea principal (ej. "Bache profundo sobre Eusebio Ayala"). */
  titulo: string;
  /** Línea secundaria (ej. "Reclamo #1042 · Bacheo y calles · 3 días"). */
  detalle?: string;
  /** Píldora a la derecha (ej. "Urgente"). */
  etiqueta?: string;
  tono?: TonoResultado;
  /** Icono de la entidad. Sin icono se usa la lupa. */
  icono?: LucideIcon;
  /** Destino. Con `to` la fila es un <Link>; si no, un <button> con onSelect. */
  to?: string;
  onSelect?: () => void;
}

/** Un bloque del desplegable = un TIPO DE ENTIDAD (reclamos, trámites, …). */
export interface GrupoResultados {
  id: string;
  /** Título del bloque, se pinta en MAYÚSCULAS por CSS. */
  titulo: string;
  items: ResultadoBusqueda[];
}

export interface BuscadorGlobalProps {
  /**
   * Motor de búsqueda. Se llama en cada tecla con el texto crudo: el debounce
   * y el fetch son responsabilidad de quien lo enchufa. Su AUSENCIA es la que
   * activa el aviso de "en construcción" — no hay flag aparte que se pueda
   * olvidar de apagar.
   */
  onBuscar?: (texto: string) => void;
  /** Resultados agrupados por tipo de entidad. */
  grupos?: GrupoResultados[];
  /** true mientras el motor resuelve. */
  cargando?: boolean;
  /** Placeholder alternativo (por defecto, el global de la referencia). */
  placeholder?: string;
}

function Fila({ item, onCerrar }: { item: ResultadoBusqueda; onCerrar: () => void }) {
  const Icono = item.icono ?? Search;
  const contenido = (
    <>
      <span className="tv2-buscar-fila-icono" aria-hidden>
        <Icono size={16} strokeWidth={2} />
      </span>
      <span className="tv2-buscar-fila-textos">
        <span className="tv2-buscar-fila-titulo">{item.titulo}</span>
        {item.detalle && <span className="tv2-buscar-fila-detalle">{item.detalle}</span>}
      </span>
      {item.etiqueta && (
        <span className={`tv2-buscar-pill tv2-buscar-pill--${item.tono ?? 'neutro'}`}>
          {item.etiqueta}
        </span>
      )}
    </>
  );

  if (item.to) {
    return (
      <Link to={item.to} className="tv2-buscar-fila" onClick={onCerrar} role="option" aria-selected={false}>
        {contenido}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="tv2-buscar-fila"
      role="option"
      aria-selected={false}
      onClick={() => {
        item.onSelect?.();
        onCerrar();
      }}
    >
      {contenido}
    </button>
  );
}

export function BuscadorGlobal({
  onBuscar,
  grupos,
  cargando = false,
  placeholder = PLACEHOLDER_BUSQUEDA,
}: BuscadorGlobalProps) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  /* Sin motor enchufado no hay resultados posibles: el panel lo dice. */
  const enConstruccion = !onBuscar;
  const cerrar = useCallback(() => setAbierto(false), []);

  /* Atajo global ⌘/Ctrl + K. Se ignora si el foco ya está en un campo de
     texto para no robarle el atajo a un formulario abierto. */
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      const activo = document.activeElement as HTMLElement | null;
      const enCampo =
        !!activo &&
        activo !== inputRef.current &&
        (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA' || activo.isContentEditable);
      if (enCampo) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      setAbierto(true);
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, []);

  /* Click afuera cierra el panel (el input conserva el texto tipeado). */
  useEffect(() => {
    if (!abierto) return;
    const alClickear = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('mousedown', alClickear);
    return () => document.removeEventListener('mousedown', alClickear);
  }, [abierto, cerrar]);

  const alTipear = (valor: string) => {
    setTexto(valor);
    setAbierto(true);
    onBuscar?.(valor);
  };

  const hayResultados = !!grupos?.some((g) => g.items.length > 0);

  return (
    <div className="tv2-buscar-zona" ref={contenedorRef}>
      {/* label como wrapper: click en cualquier parte enfoca el input */}
      <label className="tv2-buscar">
        <Search className="tv2-buscar-icono" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          className="tv2-buscar-input"
          value={texto}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-expanded={abierto}
          aria-controls={panelId}
          autoComplete="off"
          onChange={(e) => alTipear(e.target.value)}
          onFocus={() => setAbierto(true)}
        />
        {/* Se esconde apenas hay texto: ahí el atajo ya no es la próxima acción. */}
        {!texto && (
          <kbd className="tv2-buscar-atajo" aria-hidden>
            {ATAJO_LABEL}
          </kbd>
        )}
      </label>

      {abierto && (
        <div className="tv2-buscar-panel" id={panelId} role="listbox" aria-label="Resultados de la búsqueda">
          {cargando && (
            <p className="tv2-buscar-estado">
              <Loader2 className="tv2-buscar-spinner" aria-hidden />
              Buscando…
            </p>
          )}

          {/* Resultados agrupados por tipo de entidad. Hoy nunca llegan
              (no hay motor), pero el markup ya es el definitivo. */}
          {hayResultados &&
            grupos!
              .filter((grupo) => grupo.items.length > 0)
              .map((grupo) => (
                <section className="tv2-buscar-grupo" key={grupo.id}>
                  <h3 className="tv2-buscar-grupo-titulo">{grupo.titulo}</h3>
                  {grupo.items.map((item) => (
                    <Fila key={item.id} item={item} onCerrar={cerrar} />
                  ))}
                </section>
              ))}

          {/* HONESTIDAD: sin motor, el panel dice por qué no pasa nada. */}
          {enConstruccion && !cargando && (
            <p className="tv2-buscar-aviso" role="status">
              <strong>La búsqueda global está en construcción.</strong>
              Todavía no busca en reclamos, trámites ni vecinos. Mientras tanto, usá el buscador de
              cada pantalla para filtrar su listado.
            </p>
          )}

          {!enConstruccion && !cargando && !hayResultados && (
            <p className="tv2-buscar-estado">
              {texto ? `Sin resultados para "${texto}"` : 'Escribí para buscar en toda la app'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default BuscadorGlobal;
