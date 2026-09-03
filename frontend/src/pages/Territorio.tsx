/**
 * Territorio — el catálogo de cartografía offline, para MIRARLO.
 *
 * Pedido del dueño (2026-09-03): "una pantallita en Munify para poder ver esto
 * de forma tangible… ir recorriendo país, provincia, municipio… de dónde salió
 * el dato, en qué municipio se llenó con barrio, en cuál con localidad, en
 * cuál zona… no para hacer curaciones desde ahí". Y: "esto tiene que ir en el
 * panel de super admin, no en ningún municipio".
 *
 * Backend: `backend/api/admin_territorio.py` (gate `require_super_admin`,
 * cross-tenant a propósito: el catálogo es global). Tres pedidos: países
 * (una vez), municipios de un país (una vez por país: ~2.000 filas chicas,
 * con eso se dibuja el mapa de puntos y se arman las provincias sin volver
 * a pedir) y el detalle de un municipio (contorno + todas sus filas).
 *
 * UNA SOLA METÁFORA: EL MAPA A TRES ZOOMS
 * ---------------------------------------
 * El dueño quiere gráficos antes que tablas y el dato es geográfico, así que
 * el cuerpo es un mapa Leaflet (el que ya usa la app) que cambia de nivel:
 *   país       → un punto por municipio, coloreado por CÓMO SE LLENA
 *   provincia  → los mismos puntos, encuadrados en la provincia
 *   municipio  → el contorno (la Zona única) y adentro lo que se dibuja:
 *                polígonos y puntos coloreados por FUENTE; el respaldo
 *                (hoja = 0) se puede prender en gris para ver POR QUÉ quedó
 *                afuera (duplicado, contenedor, absorbido, sin coordenada)
 * La tabla de abajo es el apoyo del mapa: provincias → municipios → barrios,
 * y el click en una fila baja un nivel (o encuadra el barrio).
 *
 * Cero hex inline: los colores de los trazos de Leaflet (que necesitan un
 * string concreto) se leen de los tokens `--pl-*` del CSS computado, mismo
 * patrón que Mapa.tsx y PagosProgramados.tsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Eye, EyeOff, Landmark, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../contexts/ThemeContext';
import { territorioApi } from '../lib/api';
import type {
  TerritorioAgregado,
  TerritorioBarrio,
  TerritorioDetalle,
  TerritorioMunicipio,
  TerritorioPais,
  TerritorioProvincia,
  TerritorioRelleno,
} from '../lib/api';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { ChipEstado, DataTable, EntityCell } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import { seg } from '../lib/semanticHero';
import type { HeroFrase, HeroKpi, Veredicto } from '../lib/semanticHero';
import type { ChipTone, ColumnSpec, StatusTab, ViewKind } from '../components/abmv2/types';
import { BASEMAP, BASEMAP_ATTR, BASEMAP_MAX_ZOOM, claseBasemap } from '../lib/basemaps';
import './Territorio.css';

/* ============================================================
 * Vocabulario
 * ============================================================ */

const NOMBRE_PAIS: Record<string, string> = {
  AR: 'Argentina',
  PY: 'Paraguay',
  UY: 'Uruguay',
  CL: 'Chile',
  BO: 'Bolivia',
  PE: 'Perú',
};

/** Cómo se llena un municipio cuando nace una demo (misma regla que la semilla). */
const RELLENO: Record<TerritorioRelleno, { label: string; tone: ChipTone; veredicto?: Veredicto; token: string }> = {
  barrios: { label: 'Barrios', tone: 'green', veredicto: 'bueno', token: '--pl-green' },
  localidades: { label: 'Localidades', tone: 'blue', veredicto: 'advertencia', token: '--pl-blue' },
  zona: { label: 'Zona sola', tone: 'amber', veredicto: 'malo', token: '--pl-amber' },
  sin_contorno: { label: 'Sin contorno', tone: 'red', veredicto: 'malo', token: '--pl-red' },
};

const ORDEN_RELLENO: TerritorioRelleno[] = ['barrios', 'localidades', 'zona', 'sin_contorno'];

const FUENTE: Record<string, { label: string; tone: ChipTone; token: string }> = {
  osm_pbf: { label: 'Mapa OSM', tone: 'green', token: '--pl-green' },
  georef: { label: 'Padrón georef', tone: 'blue', token: '--pl-blue' },
};

/** Los motivos vienen del marcador (`scripts/geo/_hojas.py`) como prefijos. */
function explicarMotivo(motivo: string | null): string {
  if (!motivo) return 'Se dibuja';
  if (motivo.startsWith('dup:')) return `Duplicado de ${motivo.slice(4)}`;
  if (motivo.startsWith('contenedor:')) return `Contiene a otros (${motivo.slice(11)})`;
  if (motivo.startsWith('absorbido:')) return `Absorbido por ${motivo.slice(10)}`;
  if (motivo === 'sin_coord') return 'Sin coordenada';
  return motivo;
}

const fmt = (n: number) => n.toLocaleString('es-AR');
const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : '—');
const nombrePais = (codigo: string) => NOMBRE_PAIS[codigo] || codigo;

type Nivel = 'pais' | 'provincia' | 'municipio';

/* ============================================================
 * Mapa: helpers
 * ============================================================ */

/** El catálogo guarda anillos `[[lon, lat], …]`; Leaflet quiere `[lat, lon]`. */
const anilloALatLng = (anillo: [number, number][]): [number, number][] =>
  anillo.map(([lon, lat]) => [lat, lon]);

/**
 * Encuadra el mapa cuando cambia el nivel y vuela a un barrio cuando se lo
 * elige en la tabla. Va como hijo del MapContainer porque `useMap` sólo vive
 * ahí adentro.
 */
function Encuadre({
  bounds,
  foco,
}: {
  bounds: L.LatLngBounds | null;
  foco: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [map, bounds]);
  useEffect(() => {
    if (foco) map.setView(foco, Math.max(map.getZoom(), 14), { animate: true });
  }, [map, foco]);
  return null;
}

/* ============================================================
 * Página
 * ============================================================ */

export default function Territorio() {
  const { theme } = useTheme();

  /* ---------- Recorrido ---------- */
  const [paises, setPaises] = useState<TerritorioPais[]>([]);
  const [pais, setPais] = useState('AR');
  const [provincia, setProvincia] = useState<string | null>(null);
  const [muniId, setMuniId] = useState<string | null>(null);

  const [datosPais, setDatosPais] = useState<{
    pais: string;
    total: TerritorioAgregado;
    provincias: TerritorioProvincia[];
    items: TerritorioMunicipio[];
  } | null>(null);
  const [detalle, setDetalle] = useState<TerritorioDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  /* ---------- Controles ---------- */
  const [busqueda, setBusqueda] = useState('');
  const [tab, setTab] = useState('todos');
  const [vista, setVista] = useState<ViewKind>('table');
  const [verRespaldo, setVerRespaldo] = useState(false);
  const [foco, setFoco] = useState<[number, number] | null>(null);
  const [barrioSel, setBarrioSel] = useState<number | null>(null);

  const nivel: Nivel = muniId ? 'municipio' : provincia ? 'provincia' : 'pais';

  /* ---------- Datos ---------- */
  useEffect(() => {
    territorioApi
      .paises()
      .then((r) => {
        const items = r.data.items;
        setPaises(items);
        if (items.length && !items.some((p) => p.pais === 'AR')) setPais(items[0].pais);
      })
      .catch(() => toast.error('No se pudo leer el catálogo de países'));
  }, []);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setDatosPais(null);
    territorioApi
      .municipios(pais)
      .then((r) => {
        if (vivo) setDatosPais(r.data);
      })
      .catch(() => toast.error(`No se pudieron leer los municipios de ${nombrePais(pais)}`))
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [pais]);

  useEffect(() => {
    if (!muniId) {
      setDetalle(null);
      return;
    }
    let vivo = true;
    setCargandoDetalle(true);
    setDetalle(null);
    territorioApi
      .detalle(muniId)
      .then((r) => {
        if (vivo) setDetalle(r.data);
      })
      .catch(() => toast.error('No se pudo leer el detalle del municipio'))
      .finally(() => {
        if (vivo) setCargandoDetalle(false);
      });
    return () => {
      vivo = false;
    };
  }, [muniId]);

  // Cambiar de nivel resetea lo que sólo tiene sentido en el nivel anterior.
  const irAPais = (codigo: string) => {
    setPais(codigo);
    setProvincia(null);
    setMuniId(null);
    setTab('todos');
    setBusqueda('');
    setFoco(null);
    setBarrioSel(null);
  };
  const irAProvincia = (nombre: string | null) => {
    setProvincia(nombre);
    setMuniId(null);
    setTab('todos');
    setBusqueda('');
    setFoco(null);
    setBarrioSel(null);
  };
  const irAMunicipio = (m: TerritorioMunicipio) => {
    setProvincia(m.provincia);
    setMuniId(m.id);
    setTab('todos');
    setBusqueda('');
    setFoco(null);
    setBarrioSel(null);
  };

  /* ---------- Colores de los trazos (tokens, no hex) ---------- */
  const colores = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const leer = (token: string, fallback: string) => cs.getPropertyValue(token).trim() || fallback;
    return {
      relleno: Object.fromEntries(
        ORDEN_RELLENO.map((r) => [r, leer(RELLENO[r].token, theme.primary)]),
      ) as Record<TerritorioRelleno, string>,
      fuente: Object.fromEntries(
        Object.keys(FUENTE).map((f) => [f, leer(FUENTE[f].token, theme.primary)]),
      ) as Record<string, string>,
      respaldo: leer('--pl-text-muted', theme.textSecondary),
      contorno: leer('--pl-text', theme.text),
    };
  }, [theme.primary, theme.textSecondary, theme.text]);

  const isDarkTheme = (() => {
    const hex = theme.background?.replace('#', '') || '';
    if (hex.length !== 6) return false;
    const n = parseInt(hex, 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff)) / 255;
    return lum < 0.5;
  })();

  /* ---------- Derivados ---------- */
  const munisDelNivel = useMemo(() => {
    const todos = datosPais?.items ?? [];
    return provincia ? todos.filter((m) => m.provincia === provincia) : todos;
  }, [datosPais, provincia]);

  const agregado: TerritorioAgregado | null = useMemo(() => {
    if (!datosPais) return null;
    if (!provincia) return datosPais.total;
    const p = datosPais.provincias.find((x) => x.provincia === provincia);
    return p ?? null;
  }, [datosPais, provincia]);

  const q = busqueda.trim().toLowerCase();

  // Municipios que pasan el tab (relleno) y la búsqueda: alimentan el mapa de
  // puntos y la tabla de municipios.
  const munisVisibles = useMemo(
    () =>
      munisDelNivel.filter(
        (m) =>
          (tab === 'todos' || m.relleno === tab) &&
          (!q || m.nombre.toLowerCase().includes(q) || (m.provincia || '').toLowerCase().includes(q)),
      ),
    [munisDelNivel, tab, q],
  );

  const provinciasVisibles = useMemo(
    () => (datosPais?.provincias ?? []).filter((p) => !q || p.provincia.toLowerCase().includes(q)),
    [datosPais, q],
  );

  const barriosVisibles = useMemo(() => {
    const todos = detalle?.barrios ?? [];
    return todos.filter(
      (b) =>
        (tab === 'todos' || (tab === 'dibujan' ? b.hoja : !b.hoja)) &&
        (!q || b.nombre.toLowerCase().includes(q)),
    );
  }, [detalle, tab, q]);

  const muniActual = useMemo(
    () => (muniId ? datosPais?.items.find((m) => m.id === muniId) ?? null : null),
    [datosPais, muniId],
  );

  /* ---------- Encuadre del mapa ---------- */
  const bounds = useMemo(() => {
    if (nivel === 'municipio') {
      if (!detalle) return null;
      const b = L.latLngBounds([]);
      if (detalle.municipio.poligono) anilloALatLng(detalle.municipio.poligono).forEach((p) => b.extend(p));
      detalle.barrios.forEach((x) => {
        if (x.hoja && x.lat != null && x.lon != null) b.extend([x.lat, x.lon]);
      });
      return b;
    }
    const b = L.latLngBounds([]);
    munisDelNivel.forEach((m) => {
      if (m.lat != null && m.lng != null) b.extend([m.lat, m.lng]);
    });
    return b;
    // Se encuadra por NIVEL, no por filtro: filtrar por tab no mueve el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, detalle, pais, provincia]);

  /* ---------- Hero ---------- */
  const { heroKpis, heroFrases, etiqueta } = useMemo((): {
    heroKpis: HeroKpi[];
    heroFrases: HeroFrase[];
    etiqueta: string;
  } => {
    if (nivel === 'municipio') {
      const r = detalle?.resumen;
      const nombre = detalle?.municipio.nombre ?? muniActual?.nombre ?? '';
      if (!r) return { heroKpis: [], heroFrases: [], etiqueta: `TERRITORIO · ${nombre.toUpperCase()}` };
      const info = RELLENO[r.relleno];
      const barrios = r.hojas - r.hojas_loc;
      const frase1: HeroFrase = {
        segmentos:
          r.relleno === 'zona'
            ? [seg(`${nombre} nace con la zona sola: `), seg('el catálogo no tiene nada que dibujar adentro', 'malo'), seg('.')]
            : r.relleno === 'sin_contorno'
              ? [seg(`${nombre} `), seg('no tiene contorno en el catálogo', 'malo'), seg(': no se puede sembrar nada adentro.')]
              : [
                  seg(`${nombre} se llena con `),
                  seg(info.label.toLowerCase(), info.veredicto),
                  seg(`: ${fmt(r.hojas)} nombres se dibujan, `),
                  seg(
                    `${fmt(r.hojas_poli)} con contorno`,
                    r.hojas_poli * 2 >= r.hojas ? 'bueno' : 'advertencia',
                  ),
                  seg(r.hojas_poli === r.hojas ? '.' : ' y el resto como punto.'),
                ],
      };
      const frase2: HeroFrase = {
        segmentos: [
          seg(`${fmt(r.hojas_osm)} vienen del mapa OSM y ${fmt(r.hojas_padron)} del padrón georef`),
          seg(r.respaldo ? `; ${fmt(r.respaldo)} quedan de respaldo: ` : '.'),
          ...(r.respaldo ? [seg('duplicados, contenedores o sin coordenada', 'advertencia'), seg('.')] : []),
        ],
        acciones: r.respaldo
          ? [{ label: verRespaldo ? 'Ocultar respaldo' : 'Ver respaldo en el mapa', onClick: () => setVerRespaldo((v) => !v) }]
          : undefined,
      };
      return {
        etiqueta: `TERRITORIO · ${nombre.toUpperCase()}`,
        heroFrases: r.hojas || r.respaldo ? [frase1, frase2] : [frase1],
        heroKpis: [
          { etiqueta: 'Se dibujan', valor: fmt(r.hojas), sub: 'nombres con hoja', veredicto: r.hojas ? 'bueno' : 'malo' },
          { etiqueta: 'Con contorno', valor: fmt(r.hojas_poli), sub: pct(r.hojas_poli, r.hojas) + ' de lo que se dibuja' },
          { etiqueta: 'Barrios', valor: fmt(barrios), sub: 'admin 9/10, suburb, quarter' },
          { etiqueta: 'Localidades', valor: fmt(r.hojas_loc), sub: 'town, village, padrón' },
          { etiqueta: 'Respaldo', valor: fmt(r.respaldo), sub: 'existen, no se dibujan' },
        ],
      };
    }

    const a = agregado;
    const donde = nivel === 'provincia' ? provincia ?? '' : nombrePais(pais);
    if (!a) return { heroKpis: [], heroFrases: [], etiqueta: `TERRITORIO · ${donde.toUpperCase()}` };
    const frase1: HeroFrase = {
      segmentos: [
        seg(`De los ${fmt(a.municipios)} municipios, `),
        seg(`${fmt(a.barrios)} se llenan con barrios`, 'bueno'),
        seg(', '),
        seg(`${fmt(a.localidades)} con localidades`, 'advertencia'),
        seg(' y '),
        seg(`${fmt(a.zona)} nacen con la zona sola`, a.zona ? 'malo' : undefined),
        ...(a.sin_contorno ? [seg('; '), seg(`${fmt(a.sin_contorno)} sin contorno`, 'malo')] : []),
        seg('.'),
      ],
    };
    const frase2: HeroFrase = {
      segmentos: [
        seg(`${fmt(a.hojas)} nombres se dibujan (${fmt(a.hojas_osm)} del mapa OSM, ${fmt(a.hojas_padron)} del padrón); `),
        seg(`${fmt(a.hojas_poli)} tienen contorno`, a.hojas_poli * 2 >= a.hojas ? 'bueno' : 'advertencia'),
        seg(` y ${fmt(a.respaldo)} quedan de respaldo.`),
      ],
    };
    return {
      etiqueta: `TERRITORIO · ${donde.toUpperCase()}`,
      heroFrases: [frase1, frase2],
      heroKpis: [
        { etiqueta: 'Municipios', valor: fmt(a.municipios), sub: 'en el catálogo' },
        { etiqueta: 'Con barrios', valor: fmt(a.barrios), sub: pct(a.barrios, a.municipios) + ' de los municipios', veredicto: 'bueno' },
        { etiqueta: 'Con localidades', valor: fmt(a.localidades), sub: pct(a.localidades, a.municipios), veredicto: 'advertencia' },
        { etiqueta: 'Zona sola', valor: fmt(a.zona), sub: pct(a.zona, a.municipios) + ' sin nada adentro', veredicto: a.zona ? 'malo' : undefined },
        { etiqueta: 'Dibujados', valor: fmt(a.dibujados), sub: 'la mayoría con contorno' },
      ],
    };
  }, [nivel, detalle, agregado, pais, provincia, muniActual, verRespaldo]);

  /* ---------- Tabs ---------- */
  const statusTabs: StatusTab[] = useMemo(() => {
    if (nivel === 'municipio') {
      const r = detalle?.resumen;
      return r
        ? [
            { id: 'todos', label: 'Todas', count: r.filas },
            { id: 'dibujan', label: 'Se dibujan', count: r.hojas },
            { id: 'respaldo', label: 'Respaldo', count: r.respaldo },
          ]
        : [{ id: 'todos', label: 'Todas' }];
    }
    if (!agregado) return [{ id: 'todos', label: 'Todos' }];
    return [
      { id: 'todos', label: 'Todos', count: agregado.municipios },
      ...ORDEN_RELLENO.map((r) => ({ id: r, label: RELLENO[r].label, count: agregado[r] })),
    ];
  }, [nivel, detalle, agregado]);

  /* ---------- Columnas ---------- */
  const columnasProvincias: ColumnSpec<TerritorioProvincia>[] = useMemo(
    () => [
      {
        id: 'provincia', header: 'Provincia', width: 'minmax(180px, 1.6fr)', kind: 'entity',
        cell: (p) => <EntityCell icon={Landmark} title={p.provincia} subtitle={`${fmt(p.municipios)} municipios`} />,
      },
      {
        id: 'barrios', header: 'Con barrios', width: 'minmax(96px, 0.8fr)', align: 'right', kind: 'metric',
        cell: (p) => <MetricCell value={fmt(p.barrios)} note={pct(p.barrios, p.municipios)} veredicto={p.barrios ? 'bueno' : undefined} muted={!p.barrios} />,
      },
      {
        id: 'localidades', header: 'Con localidades', width: 'minmax(96px, 0.8fr)', align: 'right', kind: 'metric',
        cell: (p) => <MetricCell value={fmt(p.localidades)} note={pct(p.localidades, p.municipios)} muted={!p.localidades} />,
      },
      {
        id: 'zona', header: 'Zona sola', width: 'minmax(96px, 0.8fr)', align: 'right', kind: 'metric',
        cell: (p) => <MetricCell value={fmt(p.zona)} note={pct(p.zona, p.municipios)} veredicto={p.zona ? 'malo' : undefined} muted={!p.zona} />,
      },
      {
        id: 'hojas', header: 'Nombres', width: 'minmax(110px, 0.9fr)', align: 'right', kind: 'metric',
        cell: (p) => <MetricCell value={fmt(p.hojas)} note={`${fmt(p.hojas_poli)} con contorno`} muted={!p.hojas} />,
      },
    ],
    [],
  );

  const columnasMunicipios: ColumnSpec<TerritorioMunicipio>[] = useMemo(
    () => [
      {
        id: 'municipio', header: 'Municipio', width: 'minmax(200px, 1.8fr)', kind: 'entity',
        cell: (m) => (
          <EntityCell
            icon={MapPin}
            tileColor={colores.relleno[m.relleno]}
            title={m.nombre}
            subtitle={nivel === 'pais' ? `${m.provincia || '—'} · ${m.id}` : m.id}
          />
        ),
      },
      {
        id: 'relleno', header: 'Se llena con', width: 'minmax(120px, 0.9fr)', kind: 'chip',
        cell: (m) => <ChipEstado label={RELLENO[m.relleno].label} tone={RELLENO[m.relleno].tone} />,
      },
      {
        id: 'hojas', header: 'Nombres', width: 'minmax(110px, 0.9fr)', align: 'right', kind: 'metric',
        cell: (m) => (
          <MetricCell
            value={fmt(m.hojas)}
            note={m.hojas ? `${fmt(m.hojas_poli)} con contorno` : 'nada adentro'}
            veredicto={!m.hojas ? undefined : m.hojas_poli * 2 >= m.hojas ? 'bueno' : 'advertencia'}
            muted={!m.hojas}
          />
        ),
      },
      {
        id: 'fuentes', header: 'Fuentes', width: 'minmax(130px, 1fr)', kind: 'text',
        cell: (m) => (m.hojas ? `${fmt(m.hojas_osm)} OSM · ${fmt(m.hojas_padron)} padrón` : '—'),
      },
      {
        id: 'respaldo', header: 'Respaldo', width: 'minmax(90px, 0.7fr)', align: 'right', kind: 'metric',
        cell: (m) => <MetricCell value={fmt(m.respaldo)} muted={!m.respaldo} />,
      },
    ],
    [colores, nivel],
  );

  const columnasBarrios: ColumnSpec<TerritorioBarrio>[] = useMemo(
    () => [
      {
        id: 'nombre', header: 'Nombre', width: 'minmax(200px, 1.8fr)', kind: 'entity',
        cell: (b) => (
          <EntityCell
            icon={b.nivel === 'localidad' ? Landmark : MapPin}
            tileColor={b.hoja ? colores.fuente[b.fuente] ?? colores.respaldo : colores.respaldo}
            title={b.nombre}
            subtitle={b.tipo || (b.fuente === 'georef' ? 'padrón' : '—')}
          />
        ),
      },
      {
        id: 'nivel', header: 'Nivel', width: 'minmax(96px, 0.7fr)', kind: 'chip',
        cell: (b) => <ChipEstado label={b.nivel === 'localidad' ? 'Localidad' : 'Barrio'} tone={b.nivel === 'localidad' ? 'blue' : 'green'} />,
      },
      {
        id: 'fuente', header: 'Fuente', width: 'minmax(120px, 0.9fr)', kind: 'text',
        cell: (b) => FUENTE[b.fuente]?.label ?? b.fuente,
      },
      {
        id: 'contorno', header: 'Contorno', width: 'minmax(110px, 0.8fr)', align: 'right', kind: 'metric',
        cell: (b) =>
          b.poligono ? (
            <MetricCell value={fmt(b.vertices ?? b.poligono.length)} note="vértices" />
          ) : (
            <MetricCell value="punto" muted note={b.lat == null ? 'sin coordenada' : undefined} />
          ),
      },
      {
        id: 'estado', header: 'En la demo', width: 'minmax(160px, 1.2fr)', kind: 'chip',
        cell: (b) =>
          b.hoja ? (
            <ChipEstado label="Se dibuja" tone="green" />
          ) : (
            <span className="territorio-motivo">
              <ChipEstado label="Respaldo" tone="gray" />
              <span className="territorio-motivo-texto">{explicarMotivo(b.motivo_hoja)}</span>
            </span>
          ),
      },
    ],
    [colores],
  );

  /* ---------- Cuerpo: migas + mapa + tabla ---------- */
  const enfocarBarrio = (b: TerritorioBarrio) => {
    setBarrioSel(b.id);
    if (b.poligono) {
      const bb = L.latLngBounds(anilloALatLng(b.poligono));
      setFoco([bb.getCenter().lat, bb.getCenter().lng]);
    } else if (b.lat != null && b.lon != null) {
      setFoco([b.lat, b.lon]);
    } else {
      toast.message(`${b.nombre} no tiene coordenada: no se puede ubicar en el mapa.`);
    }
  };

  const migas = (
    <nav className="territorio-migas" aria-label="Recorrido">
      <button type="button" className="territorio-miga" onClick={() => irAPais(pais)} disabled={nivel === 'pais'}>
        {nombrePais(pais)}
      </button>
      {provincia && (
        <>
          <ChevronRight size={14} className="territorio-miga-sep" />
          <button type="button" className="territorio-miga" onClick={() => irAProvincia(provincia)} disabled={nivel === 'provincia'}>
            {provincia}
          </button>
        </>
      )}
      {muniActual && (
        <>
          <ChevronRight size={14} className="territorio-miga-sep" />
          <span className="territorio-miga territorio-miga--actual">{muniActual.nombre}</span>
        </>
      )}
      {nivel === 'municipio' && (detalle?.resumen.respaldo ?? 0) > 0 && (
        <button type="button" className="territorio-toggle" onClick={() => setVerRespaldo((v) => !v)}>
          {verRespaldo ? <EyeOff size={14} /> : <Eye size={14} />}
          {verRespaldo ? 'Ocultar respaldo' : 'Mostrar respaldo'}
        </button>
      )}
    </nav>
  );

  const leyenda =
    nivel === 'municipio' ? (
      <ul className="territorio-leyenda">
        <li><i className="territorio-leyenda-trazo" /> Contorno del municipio (la Zona única)</li>
        <li><i className="territorio-leyenda-punto territorio-leyenda-punto--osm" /> Mapa OSM</li>
        <li><i className="territorio-leyenda-punto territorio-leyenda-punto--padron" /> Padrón georef</li>
        {verRespaldo && <li><i className="territorio-leyenda-punto territorio-leyenda-punto--respaldo" /> Respaldo (no se dibuja)</li>}
      </ul>
    ) : (
      <ul className="territorio-leyenda">
        {ORDEN_RELLENO.map((r) => (
          <li key={r}>
            <i className={`territorio-leyenda-punto territorio-leyenda-punto--${r}`} /> {RELLENO[r].label}
          </li>
        ))}
      </ul>
    );

  const capasMunicipio = detalle && (
    <>
      {detalle.municipio.poligono && (
        <Polygon
          positions={anilloALatLng(detalle.municipio.poligono)}
          pathOptions={{ color: colores.contorno, weight: 2, dashArray: '6 4', fill: false }}
          interactive={false}
        />
      )}
      {detalle.barrios
        .filter((b) => (b.hoja || verRespaldo) && (b.poligono || (b.lat != null && b.lon != null)))
        .map((b) => {
          const color = b.hoja ? colores.fuente[b.fuente] ?? colores.respaldo : colores.respaldo;
          const elegido = barrioSel === b.id;
          const texto = `${b.nombre} · ${b.nivel === 'localidad' ? 'localidad' : 'barrio'} · ${FUENTE[b.fuente]?.label ?? b.fuente}${b.hoja ? '' : ` · ${explicarMotivo(b.motivo_hoja)}`}`;
          return b.poligono ? (
            <Polygon
              key={b.id}
              positions={anilloALatLng(b.poligono)}
              pathOptions={{ color, weight: elegido ? 3 : 1, fillColor: color, fillOpacity: b.hoja ? 0.18 : 0.06, dashArray: b.hoja ? undefined : '3 3' }}
              eventHandlers={{ click: () => setBarrioSel(b.id) }}
            >
              <Tooltip sticky>{texto}</Tooltip>
            </Polygon>
          ) : (
            <CircleMarker
              key={b.id}
              center={[b.lat as number, b.lon as number]}
              radius={elegido ? 8 : 5}
              pathOptions={{ color, weight: elegido ? 3 : 1.5, fillColor: color, fillOpacity: b.hoja ? 0.7 : 0.25 }}
              eventHandlers={{ click: () => setBarrioSel(b.id) }}
            >
              <Tooltip>{texto}</Tooltip>
            </CircleMarker>
          );
        })}
    </>
  );

  const capasPuntos =
    nivel !== 'municipio' &&
    munisVisibles
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.lat as number, m.lng as number]}
          radius={nivel === 'pais' ? 3.5 : 6}
          pathOptions={{ color: colores.relleno[m.relleno], weight: 1, fillColor: colores.relleno[m.relleno], fillOpacity: 0.75 }}
          eventHandlers={{ click: () => irAMunicipio(m) }}
        >
          <Tooltip>
            {`${m.nombre} · ${RELLENO[m.relleno].label}${m.hojas ? ` · ${fmt(m.hojas)} nombres (${fmt(m.hojas_poli)} con contorno)` : ''}`}
          </Tooltip>
        </CircleMarker>
      ));

  const mapa = (
    <div className="av2-mapa territorio-mapa">
      <div className={`av2-mapa-lienzo ${claseBasemap(isDarkTheme)}`}>
        <MapContainer
          center={[-34.6, -58.4]}
          zoom={5}
          preferCanvas
          wheelPxPerZoomLevel={180}
          wheelDebounceTime={60}
          maxZoom={BASEMAP_MAX_ZOOM}
          zoomSnap={1}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={BASEMAP} attribution={BASEMAP_ATTR} maxZoom={BASEMAP_MAX_ZOOM} />
          <Encuadre bounds={bounds} foco={foco} />
          {capasPuntos}
          {capasMunicipio}
        </MapContainer>
      </div>
      {(cargando || cargandoDetalle) && <div className="territorio-mapa-velo">Leyendo el catálogo…</div>}
    </div>
  );

  const tabla =
    nivel === 'municipio' ? (
      <DataTable<TerritorioBarrio>
        kind="plain"
        columns={columnasBarrios}
        rows={barriosVisibles}
        rowKey={(b) => b.id}
        rowActions={[{ id: 'ubicar', label: 'Ubicar en el mapa', icon: Search, onClick: enfocarBarrio }]}
        onRowClick={enfocarBarrio}
        loading={cargandoDetalle}
        emptyMessage={
          q || tab !== 'todos'
            ? 'Ningún nombre coincide con lo que estás filtrando.'
            : 'El catálogo no tiene ningún nombre para este municipio: la demo nace con la zona sola.'
        }
        footer={{
          showing: detalle ? `Mostrando ${fmt(barriosVisibles.length)} de ${fmt(detalle.resumen.filas)} nombres` : 'Leyendo el catálogo…',
        }}
      />
    ) : nivel === 'pais' && !q ? (
      <DataTable<TerritorioProvincia>
        kind="plain"
        columns={columnasProvincias}
        rows={provinciasVisibles}
        rowKey={(p) => p.provincia}
        rowActions={[{ id: 'entrar', label: 'Ver la provincia', icon: ChevronRight, onClick: (p) => irAProvincia(p.provincia) }]}
        onRowClick={(p) => irAProvincia(p.provincia)}
        loading={cargando}
        emptyMessage="El catálogo no tiene municipios de este país."
        footer={{ showing: datosPais ? `${fmt(provinciasVisibles.length)} provincias · ${fmt(datosPais.total.municipios)} municipios` : 'Leyendo el catálogo…' }}
      />
    ) : (
      <DataTable<TerritorioMunicipio>
        kind="plain"
        columns={columnasMunicipios}
        rows={munisVisibles}
        rowKey={(m) => m.id}
        rowActions={[{ id: 'entrar', label: 'Ver el municipio', icon: ChevronRight, onClick: irAMunicipio }]}
        onRowClick={irAMunicipio}
        loading={cargando}
        emptyMessage="Ningún municipio coincide con lo que estás filtrando."
        footer={{ showing: `Mostrando ${fmt(munisVisibles.length)} de ${fmt(munisDelNivel.length)} municipios` }}
      />
    );

  const cuerpo = (
    <div className="territorio-cuerpo">
      {migas}
      {mapa}
      {leyenda}
      {tabla}
    </div>
  );

  const placeholderBusqueda =
    nivel === 'municipio'
      ? 'Buscar un barrio o localidad…'
      : nivel === 'provincia'
        ? 'Buscar un municipio de la provincia…'
        : 'Buscar un municipio o una provincia…';

  return (
    <SemanticAbmPage<TerritorioMunicipio>
      moduleKey="territorio"
      eyebrow="Super admin · Territorio"
      title="Con qué se llena cada municipio cuando nace una demo"
      description="El catálogo de cartografía offline, recorrido país → provincia → municipio. El mapa muestra cómo se llena cada lugar (barrios, localidades o la zona sola) y, adentro de un municipio, de dónde salió cada nombre y por qué se dibuja o queda de respaldo. Es para mirar: la curación sigue siendo por scripts."
      hero={heroKpis.length ? { etiqueta, frases: heroFrases, kpis: heroKpis } : undefined}
      pista={{
        titulo: 'La zona es del negocio; los barrios son del mapa',
        texto:
          'Toda demo nace con una Zona única (el contorno del municipio) y adentro se dibuja lo que el catálogo tiene marcado con hoja: barrios donde el mapa los trae, localidades donde no, y nada donde el catálogo sigue vacío. El respaldo son nombres que existen pero la regla de contención dejó afuera: duplicados, contenedores de otros, absorbidos o sin coordenada.',
      }}
      searchPlaceholder={placeholderBusqueda}
      views={['table']}
      activeView={vista}
      onViewChange={setVista}
      search={busqueda}
      onSearchChange={setBusqueda}
      selects={
        paises.length > 1
          ? [
              {
                id: 'pais',
                label: 'País',
                value: pais,
                options: paises.map((p) => ({ value: p.pais, label: `${nombrePais(p.pais)} (${fmt(p.municipios)})` })),
                onChange: irAPais,
              },
            ]
          : []
      }
      statusTabs={statusTabs}
      activeStatus={tab}
      onStatusChange={setTab}
      filterSummary={
        nivel === 'municipio'
          ? undefined
          : tab !== 'todos'
            ? `${fmt(munisVisibles.length)} municipios que se llenan con ${RELLENO[tab as TerritorioRelleno]?.label.toLowerCase() ?? tab}`
            : undefined
      }
      viewSlots={{ table: cuerpo }}
      kind="plain"
      columns={columnasMunicipios}
      rows={munisVisibles}
      rowKey={(m) => m.id}
      rowActions={[]}
      loading={cargando}
      footer={{ showing: '' }}
    />
  );
}
