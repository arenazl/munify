import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { ArrowRight, BarChart3, CalendarDays, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, ordenesTrabajoApi } from '../lib/api';
import { Reclamo, EstadoReclamo } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { resolverUmbrales } from '../lib/veredictos';

/**
 * TABLERO — kanban de reclamos, estándar v2 (canvas "Tablero.dc.html").
 *
 * Lectura de la pantalla: fila de título compacta → frase-veredicto (qué está
 * pasando) → cuatro columnas. Tres son colas de trabajo con drag & drop
 * (Sin tomar / En curso / Pospuestos); la cuarta (Cerrados) NO es una cola:
 * es el RESUMEN de lo que ya se terminó, así el tablero no invita a "cerrar
 * arrastrando" sin dejar resolución.
 *
 * COLOR: las columnas NO son 1:1 con estados (Cerrados agrupa finalizado +
 * resuelto + rechazado), así que el color de columna sale de los tokens
 * SEMÁNTICOS del sistema (--pl-red / --pl-amber / --pl-green / grises) y no de
 * `estadoColors` — ese SSoT pinta la CARA de un estado suelto (pills, cards del
 * vecino), que es otra pregunta. Cero hex nuevo acá.
 */

// ---------------------------------------------------------------------------
// Estados: agrupaciones canónicas (las mismas que usa la lista de Reclamos)
// ---------------------------------------------------------------------------

const ESTADOS_SIN_TOMAR: EstadoReclamo[] = ['recibido', 'nuevo', 'asignado'];
const ESTADOS_EN_CURSO: EstadoReclamo[] = ['en_curso', 'en_proceso', 'pendiente_confirmacion'];
const ESTADOS_POSPUESTO: EstadoReclamo[] = ['pospuesto'];
const ESTADOS_CERRADO: EstadoReclamo[] = ['finalizado', 'resuelto', 'rechazado'];

const enGrupo = (r: Reclamo, grupo: EstadoReclamo[]) => grupo.includes(r.estado);

/**
 * Transiciones permitidas — ESPEJO de `TRANSICIONES_VALIDAS` de
 * backend/api/reclamos.py (incluidos los estados legacy). Si el backend suma
 * una arista, se agrega acá; un estado no mapeado no tiene transiciones
 * (bloquea en vez de romper).
 */
const TRANSICIONES: Record<string, EstadoReclamo[]> = {
  recibido: ['en_curso', 'rechazado'],
  en_curso: ['finalizado', 'pospuesto', 'rechazado', 'pendiente_confirmacion', 'recibido'],
  finalizado: ['en_curso', 'recibido'],
  pospuesto: ['en_curso', 'finalizado', 'rechazado', 'recibido'],
  rechazado: ['recibido'],
  nuevo: ['recibido', 'asignado', 'rechazado'],
  asignado: ['recibido', 'en_curso', 'rechazado'],
  en_proceso: ['finalizado', 'pospuesto', 'rechazado', 'pendiente_confirmacion', 'recibido'],
  pendiente_confirmacion: ['finalizado', 'en_curso', 'recibido'],
  resuelto: ['en_curso', 'recibido'],
};

const puedeTransicionar = (from: EstadoReclamo | null, to: EstadoReclamo): boolean => {
  if (!from) return true;
  if (from === to) return true;
  return (TRANSICIONES[from] || []).includes(to);
};

// ---------------------------------------------------------------------------
// Tonos de columna (tokens semánticos, cero hex)
// ---------------------------------------------------------------------------

type Tono = 'rojo' | 'ambar' | 'gris' | 'verde';

const TONO_TEXTO: Record<Tono, string> = {
  rojo: 'var(--pl-red-700)',
  ambar: 'var(--pl-amber-700)',
  gris: 'var(--pl-text-3)',
  verde: 'var(--pl-green-700)',
};

const TONO_DOT: Record<Tono, string> = {
  rojo: 'var(--pl-red)',
  ambar: 'var(--pl-amber)',
  gris: 'var(--pl-border-strong)',
  verde: 'var(--pl-green)',
};

// ---------------------------------------------------------------------------
// Helpers de tiempo
// ---------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;

const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Días enteros transcurridos desde `iso` hasta ahora (0 = hoy). */
const diasDesde = (iso?: string | null): number | null => {
  const t = ms(iso);
  if (t == null) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DIA_MS));
};

/** Último movimiento conocido del reclamo (lo que la lista tiene). */
const ultimoMovimiento = (r: Reclamo): string => r.updated_at || r.created_at;

const esHoy = (iso?: string | null): boolean => {
  const t = ms(iso);
  if (t == null) return false;
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  return t >= inicioHoy.getTime();
};

/** Nota de antigüedad de una tarjeta: texto + tono. */
const notaAntiguedad = (dias: number | null, sufijo: string, umbral: { advertencia: number; malo: number }) => {
  if (dias == null) return { texto: sufijo, tono: 'gris' as Tono };
  const texto = dias === 0 ? `hoy · ${sufijo}` : `${dias} d ${sufijo}`;
  const tono: Tono = dias >= umbral.malo ? 'rojo' : dias >= umbral.advertencia ? 'ambar' : 'gris';
  return { texto, tono };
};

/**
 * Cabecera de columna: punto del tono + título + conteo del MISMO tono + sub
 * gris a la derecha. Vive fuera del componente para no remontarse en cada
 * render (y en cada frame del drag).
 */
function CabeceraColumna({
  tono,
  titulo,
  conteo,
  sub,
}: {
  tono: Tono;
  titulo: string;
  conteo: number;
  sub: string;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--pl-border)' }}
    >
      <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, backgroundColor: TONO_DOT[tono] }} />
      <span
        className="text-[13px] font-bold"
        style={{ fontFamily: 'var(--pl-font-display)', color: 'var(--pl-text)', letterSpacing: '-0.02em' }}
      >
        {titulo}
      </span>
      <span
        className="text-[13px] font-bold tabular-nums"
        style={{ fontFamily: 'var(--pl-font-display)', color: TONO_TEXTO[tono] }}
      >
        {conteo}
      </span>
      {sub && (
        <span className="ml-auto text-[11px] truncate" style={{ color: 'var(--pl-text-faint)' }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/** Contenido de una tarjeta: título, lugar, fila de nota + área, y pie opcional. */
function TarjetaReclamo({
  reclamo,
  nota,
  notaTono,
  pie,
}: {
  reclamo: Reclamo;
  nota: string;
  notaTono: Tono;
  pie?: React.ReactNode;
}) {
  const area = reclamo.dependencia_asignada?.nombre || reclamo.categoria?.nombre || 'Sin área';
  return (
    <>
      <Link
        to={`/gestion/reclamos/${reclamo.id}`}
        className="block text-[13px] font-semibold hover:underline"
        style={{ color: 'var(--pl-text)', lineHeight: 1.35 }}
      >
        {reclamo.titulo}
      </Link>
      <div className="text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--pl-text-3)' }}>
        {reclamo.direccion || 'Sin dirección'}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: TONO_TEXTO[notaTono] }}>
          {nota}
        </span>
        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--pl-text-faint)' }}>
          ·
        </span>
        <span className="text-[11px] truncate" style={{ color: 'var(--pl-text-3)' }}>
          {area}
        </span>
      </div>
      {pie}
    </>
  );
}

const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';

// ---------------------------------------------------------------------------
// Responsable de campo (vive en la OT, no en la fila del listado)
// ---------------------------------------------------------------------------

interface OtLite {
  empleado_nombre?: string | null;
  cuadrilla_nombre?: string | null;
  reclamos?: { id: number }[];
}

type MapaResponsables = Record<number, string>;

/** Etiqueta de responsable: primero la OT (empleado / cuadrilla), si no la dependencia. */
const responsableDe = (r: Reclamo, mapa: MapaResponsables): string | null =>
  mapa[r.id] || r.dependencia_asignada?.nombre || null;

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

const PERIODOS: { value: string; label: string; frase: string }[] = [
  { value: '7', label: 'Últimos 7 días', frase: 'en los últimos 7 días' },
  { value: '30', label: 'Últimos 30 días', frase: 'en los últimos 30 días' },
  { value: '90', label: 'Últimos 90 días', frase: 'en los últimos 90 días' },
  { value: '0', label: 'Todo el histórico', frase: 'en todo el histórico' },
];

// Paginado: el endpoint devuelve 20 por defecto y 100 como máximo. El tablero
// necesita el período COMPLETO (los conteos de la frase y del resumen de
// cerrados serían mentira con una página suelta), así que trae hasta 6 páginas.
const PAGINA = 100;
const MAX_PAGINAS = 6;

export default function Tablero() {
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [responsables, setResponsables] = useState<MapaResponsables>({});
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [periodo, setPeriodo] = useState('30');
  const [arrastrando, setArrastrando] = useState<Reclamo | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const canDrag = user?.rol === 'admin' || user?.rol === 'supervisor';
  const umbrales = useMemo(() => resolverUmbrales(), []);

  const fetchReclamos = useCallback(async () => {
    try {
      const acumulado: Reclamo[] = [];
      for (let p = 0; p < MAX_PAGINAS; p++) {
        const res = await reclamosApi.getAll({ skip: p * PAGINA, limit: PAGINA });
        const lote: Reclamo[] = res.data || [];
        acumulado.push(...lote);
        if (lote.length < PAGINA) break;
      }
      setReclamos(acumulado);
    } catch (error) {
      console.error('Error cargando reclamos:', error);
      toast.error('Error al cargar reclamos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReclamos();
    // El responsable de campo (empleado/cuadrilla) NO viaja en la fila del
    // listado: vive en la orden de trabajo. Se pide aparte y, si falla o el
    // muni no usa OTs formales, la tarjeta cae a la dependencia asignada.
    ordenesTrabajoApi
      .list({ vigentes: true, limit: 200 })
      .then((res) => {
        const mapa: MapaResponsables = {};
        ((res.data as OtLite[]) || []).forEach((ot) => {
          const partes = [ot.empleado_nombre, ot.cuadrilla_nombre].filter(Boolean) as string[];
          if (partes.length === 0) return;
          const etiqueta = partes.join(' · ');
          (ot.reclamos || []).forEach((r) => {
            if (!mapa[r.id]) mapa[r.id] = etiqueta;
          });
        });
        setResponsables(mapa);
      })
      .catch(() => setResponsables({}));
  }, [fetchReclamos]);

  // ---- Filtrado (período + hallazgo) --------------------------------------

  const visibles = useMemo(() => {
    const dias = parseInt(periodo, 10) || 0;
    const desde = dias > 0 ? Date.now() - dias * DIA_MS : null;
    const term = busqueda.trim().toLowerCase();
    const soloNum = term.replace(/\D/g, '');

    return reclamos.filter((r) => {
      if (desde != null) {
        const creado = ms(r.created_at);
        if (creado == null || creado < desde) return false;
      }
      if (!term) return true;
      if (soloNum && String(r.id).includes(soloNum)) return true;
      const vecino = `${r.creador?.nombre || ''} ${r.creador?.apellido || ''}`.toLowerCase();
      return (
        (r.direccion || '').toLowerCase().includes(term) ||
        vecino.includes(term) ||
        (r.titulo || '').toLowerCase().includes(term) ||
        (r.categoria?.nombre || '').toLowerCase().includes(term) ||
        (r.dependencia_asignada?.nombre || '').toLowerCase().includes(term)
      );
    });
  }, [reclamos, periodo, busqueda]);

  const sinTomar = useMemo(() => visibles.filter((r) => enGrupo(r, ESTADOS_SIN_TOMAR)), [visibles]);
  const enCurso = useMemo(() => visibles.filter((r) => enGrupo(r, ESTADOS_EN_CURSO)), [visibles]);
  const pospuestos = useMemo(() => visibles.filter((r) => enGrupo(r, ESTADOS_POSPUESTO)), [visibles]);
  const cerrados = useMemo(() => visibles.filter((r) => enGrupo(r, ESTADOS_CERRADO)), [visibles]);

  /** Trabado = en curso y sin novedades hace más de N días (umbral del sistema). */
  const esTrabado = useCallback(
    (r: Reclamo) => (diasDesde(ultimoMovimiento(r)) ?? 0) >= umbrales.diasSinActividad.advertencia,
    [umbrales],
  );

  const trabados = useMemo(() => enCurso.filter(esTrabado).length, [enCurso, esTrabado]);

  // ---- Subtítulos de columna (datos reales) -------------------------------

  const entraronHoy = useMemo(() => sinTomar.filter((r) => esHoy(r.created_at)).length, [sinTomar]);

  const enCursoConResponsable = useMemo(
    () => enCurso.filter((r) => responsableDe(r, responsables) !== null).length,
    [enCurso, responsables],
  );

  const pospuestoMasViejo = useMemo(() => {
    const dias = pospuestos.map((r) => diasDesde(ultimoMovimiento(r)) ?? 0);
    return dias.length ? Math.max(...dias) : 0;
  }, [pospuestos]);

  // ---- Resumen de cerrados ------------------------------------------------

  const resumenCerrados = useMemo(() => {
    const finalizados = cerrados.filter((r) => r.estado !== 'rechazado').length;
    const rechazados = cerrados.filter((r) => r.estado === 'rechazado').length;

    // Promedio de cierre: solo sobre los que tienen fecha de resolución real.
    const duraciones = cerrados
      .map((r) => {
        const fin = ms(r.fecha_resolucion);
        const ini = ms(r.created_at);
        if (fin == null || ini == null || fin < ini) return null;
        return (fin - ini) / DIA_MS;
      })
      .filter((d): d is number => d != null);
    const promedio = duraciones.length
      ? Math.round((duraciones.reduce((a, b) => a + b, 0) / duraciones.length) * 10) / 10
      : null;

    const ultimos = [...cerrados]
      .sort((a, b) => (ms(b.fecha_resolucion || ultimoMovimiento(b)) || 0) - (ms(a.fecha_resolucion || ultimoMovimiento(a)) || 0))
      .slice(0, 4)
      .map((r) => {
        const fin = ms(r.fecha_resolucion || ultimoMovimiento(r));
        const ini = ms(r.created_at);
        const dias = fin != null && ini != null && fin >= ini ? Math.round((fin - ini) / DIA_MS) : null;
        return { reclamo: r, dias };
      });

    return { finalizados, rechazados, promedio, ultimos };
  }, [cerrados]);

  const fraseperiodo = PERIODOS.find((p) => p.value === periodo)?.frase || '';

  // ---- Drag & drop --------------------------------------------------------

  const handleDragStart = (start: { draggableId: string }) => {
    const r = reclamos.find((x) => x.id === parseInt(start.draggableId, 10)) || null;
    setArrastrando(r);
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, draggableId } = result;
    setArrastrando(null);
    if (!destination) return;

    const reclamoId = parseInt(draggableId, 10);
    const reclamo = reclamos.find((r) => r.id === reclamoId);
    if (!reclamo) return;

    const nuevoEstado = destination.droppableId as EstadoReclamo;
    const estadoAnterior = reclamo.estado;
    if (estadoAnterior === nuevoEstado) return;

    // La transición se valida contra el estado REAL del reclamo, no contra el
    // id de la columna: una columna agrupa varios estados (recibido/nuevo/
    // asignado) y sus transiciones válidas no son las mismas.
    if (!puedeTransicionar(estadoAnterior, nuevoEstado)) {
      toast.error(`No se puede pasar de "${estadoAnterior}" a "${nuevoEstado}"`);
      return;
    }

    setReclamos((prev) => prev.map((r) => (r.id === reclamoId ? { ...r, estado: nuevoEstado } : r)));

    try {
      await reclamosApi.cambiarEstado(reclamoId, nuevoEstado);
      toast.success('Estado actualizado');
    } catch (error: unknown) {
      setReclamos((prev) => prev.map((r) => (r.id === reclamoId ? { ...r, estado: estadoAnterior } : r)));
      console.error('Error al cambiar estado:', error);
      const detalle =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error al cambiar el estado del reclamo';
      toast.error(detalle);
    }
  };

  const dropBloqueado = (destino: EstadoReclamo) =>
    !canDrag || (arrastrando !== null && !puedeTransicionar(arrastrando.estado, destino));

  // ---- Contexto del encabezado -------------------------------------------

  const municipio = (localStorage.getItem('municipio_nombre') || '')
    .replace('Municipalidad de ', '')
    .replace('Municipio de ', '')
    .trim();
  const ambito = user?.dependencia?.nombre || 'todas las dependencias';
  const chipContexto = municipio ? `${municipio} · ${ambito}` : ambito;

  const opcionesPeriodo: SelectOption[] = PERIODOS.map((p) => ({
    value: p.value,
    label: p.label,
    icon: <CalendarDays className="h-3.5 w-3.5" style={{ color: 'var(--pl-green-700)' }} />,
  }));

  // ---- Piezas visuales ----------------------------------------------------

  const cuerpoColumna = (isDraggingOver: boolean): React.CSSProperties => ({
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 96,
    backgroundColor: isDraggingOver ? 'color-mix(in srgb, var(--pl-green) 6%, transparent)' : 'transparent',
    transition: 'background-color var(--pl-dur-ui) var(--pl-ease)',
    borderRadius: '0 0 var(--pl-radius-lg) var(--pl-radius-lg)',
  });

  const estiloTarjeta = (tono: Tono, trabado: boolean, isDragging: boolean): React.CSSProperties => ({
    padding: '11px 12px',
    borderRadius: 'var(--pl-radius-md)',
    border: `1px solid ${trabado ? 'color-mix(in srgb, var(--pl-amber) 32%, var(--pl-border))' : 'var(--pl-border)'}`,
    borderLeft: `3px solid ${TONO_DOT[tono]}`,
    backgroundColor: trabado
      ? 'color-mix(in srgb, var(--pl-amber) 8%, var(--pl-surface))'
      : 'var(--pl-surface)',
    opacity: isDragging ? 0.45 : 1,
    cursor: canDrag ? 'grab' : 'default',
  });

  const columnaShell: React.CSSProperties = {
    backgroundColor: 'var(--pl-surface)',
    border: '1px solid var(--pl-border)',
    borderRadius: 'var(--pl-radius-lg)',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-10 w-10 border-b-2"
          style={{ borderColor: 'var(--pl-green)' }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- Fila de título ---------- */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span
          className="relative grid place-items-center flex-shrink-0"
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: 'var(--pl-green-100)',
            color: 'var(--pl-green-700)',
          }}
        >
          <BarChart3 className="h-4 w-4" />
          <span className="rs-latido" />
        </span>

        <h1
          className="text-[20px] font-bold flex-shrink-0"
          style={{ fontFamily: 'var(--pl-font-display)', color: 'var(--pl-text)', letterSpacing: '-0.025em' }}
        >
          Tablero
        </h1>

        <span
          className="text-[11.5px] font-semibold px-2.5 py-1 truncate max-w-[280px] flex-shrink-0"
          style={{
            backgroundColor: 'var(--pl-green-100)',
            color: 'var(--pl-green-700)',
            borderRadius: 'var(--pl-radius-pill)',
          }}
          title={chipContexto}
        >
          {chipContexto}
        </span>

        <div className="w-[152px] flex-shrink-0">
          <ModernSelect value={periodo} onChange={setPeriodo} options={opcionesPeriodo} variant="v2" />
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
            style={{ color: 'var(--pl-text-faint)' }}
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por dirección, vecino o número…"
            className="w-full h-8 pl-8 pr-3 text-[12.5px] outline-none"
            style={{
              backgroundColor: 'var(--pl-surface-2)',
              border: '1px solid var(--pl-border)',
              borderRadius: 'var(--pl-radius-md)',
              color: 'var(--pl-text)',
            }}
          />
        </div>

        <Link
          to="/gestion/reclamos"
          className="text-[12px] font-semibold whitespace-nowrap flex-shrink-0 hover:underline"
          style={{ color: 'var(--pl-green-700)' }}
        >
          Ver como lista
        </Link>
      </div>

      {/* ---------- Frase-veredicto ---------- */}
      <p
        className="text-[17px] font-semibold"
        style={{
          fontFamily: 'var(--pl-font-display)',
          letterSpacing: '-0.02em',
          maxWidth: '92ch',
          lineHeight: 1.4,
        }}
      >
        {visibles.length === 0 ? (
          <span style={{ color: 'var(--pl-text-2)' }}>
            No hay reclamos {fraseperiodo}. Cambiá el período o la búsqueda para ver más.
          </span>
        ) : (
          <>
            <span style={{ color: sinTomar.length > 0 ? 'var(--pl-red-700)' : 'var(--pl-green-700)' }}>
              {sinTomar.length === 1
                ? '1 reclamo entró y nadie lo tomó'
                : `${sinTomar.length} reclamos entraron y nadie los tomó`}
            </span>
            <span style={{ color: 'var(--pl-text-2)' }}>; hay </span>
            <span style={{ color: enCurso.length > 0 ? 'var(--pl-amber-700)' : 'var(--pl-green-700)' }}>
              {enCurso.length} en curso
            </span>
            {trabados > 0 && (
              <span style={{ color: 'var(--pl-amber-700)' }}>
                {`, ${trabados} ${trabados === 1 ? 'trabado' : 'trabados'}`}
              </span>
            )}
            <span style={{ color: 'var(--pl-text-2)' }}>
              {canDrag ? '. Arrastrá una tarjeta para cambiarle el estado.' : '.'}
            </span>
          </>
        )}
      </p>

      {/* ---------- Grilla ---------- */}
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.85fr)] gap-3 items-start">
          {/* ===== Sin tomar ===== */}
          <section style={columnaShell}>
            <CabeceraColumna
              tono="rojo"
              titulo="Sin tomar"
              conteo={sinTomar.length}
              sub={entraronHoy > 0 ? `${entraronHoy} entraron hoy` : 'nadie los abrió todavía'}
            />
            <Droppable droppableId="recibido" isDropDisabled={dropBloqueado('recibido')}>
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} style={cuerpoColumna(snapshot.isDraggingOver)}>
                  {sinTomar.map((r, index) => {
                    const nota = notaAntiguedad(diasDesde(r.created_at), 'sin tomar', umbrales.diasSinActividad);
                    return (
                      <Draggable key={r.id} draggableId={String(r.id)} index={index} isDragDisabled={!canDrag}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            {...dp.dragHandleProps}
                            style={{ ...dp.draggableProps.style, ...estiloTarjeta('rojo', false, ds.isDragging) }}
                          >
                            <TarjetaReclamo reclamo={r} nota={nota.texto} notaTono={nota.tono} />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  <Link
                    to="/gestion/reclamos?filtrar_estado=recibido"
                    className="flex items-center justify-center text-[12px] font-semibold"
                    style={{
                      height: 38,
                      border: '1px dashed var(--pl-border-strong)',
                      borderRadius: 'var(--pl-radius-md)',
                      color: 'var(--pl-text-2)',
                    }}
                  >
                    Ver la cola completa
                  </Link>
                </div>
              )}
            </Droppable>
          </section>

          {/* ===== En curso ===== */}
          <section style={columnaShell}>
            <CabeceraColumna
              tono="ambar"
              titulo="En curso"
              conteo={enCurso.length}
              sub={`${enCursoConResponsable} con responsable · ${enCurso.length - enCursoConResponsable} sin asignar`}
            />
            <Droppable droppableId="en_curso" isDropDisabled={dropBloqueado('en_curso')}>
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} style={cuerpoColumna(snapshot.isDraggingOver)}>
                  {enCurso.map((r, index) => {
                    const trabado = esTrabado(r);
                    const nota = notaAntiguedad(
                      diasDesde(ultimoMovimiento(r)),
                      'sin novedades',
                      umbrales.diasSinActividad,
                    );
                    const responsable = responsableDe(r, responsables);
                    const pie = (
                      <div
                        className="flex items-center gap-1.5 mt-2 pt-2 min-w-0"
                        style={{ borderTop: '1px solid var(--pl-border)' }}
                      >
                        {responsable ? (
                          <>
                            <span
                              className="grid place-items-center rounded-full flex-shrink-0 text-[9.5px] font-bold"
                              style={{
                                width: 22,
                                height: 22,
                                backgroundColor: 'var(--pl-green-100)',
                                color: 'var(--pl-green-700)',
                              }}
                            >
                              {iniciales(responsable)}
                            </span>
                            <span className="text-[11.5px] truncate" style={{ color: 'var(--pl-text-2)' }} title={responsable}>
                              {responsable}
                            </span>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => navigate(`/gestion/reclamos?abrir=${r.id}`)}
                            className="inline-flex items-center gap-1 hover:gap-2 transition-all text-[11.5px] font-semibold"
                            style={{ color: 'var(--pl-amber-700)' }}
                          >
                            Asignar cuadrilla
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                    return (
                      <Draggable key={r.id} draggableId={String(r.id)} index={index} isDragDisabled={!canDrag}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            {...dp.dragHandleProps}
                            style={{ ...dp.draggableProps.style, ...estiloTarjeta('ambar', trabado, ds.isDragging) }}
                          >
                            <TarjetaReclamo reclamo={r} nota={nota.texto} notaTono={nota.tono} pie={pie} />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </section>

          {/* ===== Pospuestos ===== */}
          <section style={columnaShell}>
            <CabeceraColumna
              tono="gris"
              titulo="Pospuestos"
              conteo={pospuestos.length}
              sub={pospuestos.length > 0 ? `el más viejo, ${pospuestoMasViejo} d` : ''}
            />
            <Droppable droppableId="pospuesto" isDropDisabled={dropBloqueado('pospuesto')}>
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} style={cuerpoColumna(snapshot.isDraggingOver)}>
                  {pospuestos.map((r, index) => {
                    const nota = notaAntiguedad(
                      diasDesde(ultimoMovimiento(r)),
                      'en pausa',
                      umbrales.diasSinActividad,
                    );
                    return (
                      <Draggable key={r.id} draggableId={String(r.id)} index={index} isDragDisabled={!canDrag}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            {...dp.dragHandleProps}
                            style={{ ...dp.draggableProps.style, ...estiloTarjeta('gris', false, ds.isDragging) }}
                          >
                            <TarjetaReclamo reclamo={r} nota={nota.texto} notaTono="gris" />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  <div
                    className="grid place-items-center text-center"
                    style={{
                      padding: 22,
                      border: `1px dashed ${snapshot.isDraggingOver ? 'var(--pl-green)' : 'var(--pl-border-strong)'}`,
                      borderRadius: 'var(--pl-radius-md)',
                      transition: 'border-color var(--pl-dur-ui) var(--pl-ease)',
                    }}
                  >
                    <Clock className="h-4 w-4" style={{ color: 'var(--pl-text-faint)' }} />
                    <div className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--pl-text-2)' }}>
                      {pospuestos.length === 0 ? 'Nada postergado' : 'Podés sumar más'}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--pl-text-faint)' }}>
                      Soltá acá lo que depende de un tercero
                    </div>
                  </div>
                </div>
              )}
            </Droppable>
          </section>

          {/* ===== Cerrados (resumen, NO es una cola) ===== */}
          <section style={{ ...columnaShell, backgroundColor: 'var(--pl-surface-2)' }}>
            <CabeceraColumna tono="verde" titulo="Cerrados" conteo={cerrados.length} sub={fraseperiodo} />
            <div className="p-3 flex flex-col gap-3">
              <p className="text-[12px]" style={{ color: 'var(--pl-text-2)', lineHeight: 1.5 }}>
                {`${resumenCerrados.finalizados} ${resumenCerrados.finalizados === 1 ? 'finalizado' : 'finalizados'} y ${resumenCerrados.rechazados} ${resumenCerrados.rechazados === 1 ? 'rechazado' : 'rechazados'} ${fraseperiodo}.`}
                {resumenCerrados.promedio != null && ` Promedio de cierre: ${resumenCerrados.promedio} días.`}
              </p>

              {resumenCerrados.ultimos.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {resumenCerrados.ultimos.map(({ reclamo, dias }) => (
                    <div key={reclamo.id} className="flex items-center gap-2 min-w-0">
                      <span
                        className="rounded-full flex-shrink-0"
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor:
                            reclamo.estado === 'rechazado' ? 'var(--pl-red)' : 'var(--pl-green)',
                        }}
                      />
                      <Link
                        to={`/gestion/reclamos/${reclamo.id}`}
                        className="text-[11.5px] truncate hover:underline"
                        style={{ color: 'var(--pl-text-2)' }}
                        title={reclamo.titulo}
                      >
                        {reclamo.titulo}
                      </Link>
                      {dias != null && (
                        <span
                          className="ml-auto text-[11px] tabular-nums flex-shrink-0"
                          style={{ color: 'var(--pl-text-faint)' }}
                        >
                          {dias} d
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {resumenCerrados.finalizados > 0 && (
                <Link
                  to="/gestion/reclamos?filtrar_estado=finalizado"
                  className="text-[11.5px] font-semibold hover:underline"
                  style={{ color: 'var(--pl-green-700)' }}
                >
                  {`Ver los ${resumenCerrados.finalizados} finalizados`}
                </Link>
              )}
            </div>
          </section>
        </div>
      </DragDropContext>
    </div>
  );
}
