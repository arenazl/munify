import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  MapPin, Home, ChevronDown, ChevronRight, Loader2, Phone, Mail,
  Users, Plus, AlertTriangle, CheckCircle2, MinusCircle,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';
import { Sheet } from '../components/ui/Sheet';
import { ABMPage } from '../components/ui/ABMPage';
import { DateRangePicker, type DateRange } from '../components/ui/DateRangePicker';
import { contactosApi, gastosApi } from '../lib/api';
import type { Contacto, Gasto, GastoCuota, TipoContacto } from '../types';
import {
  estadoDeContacto, estadoDeGasto, gastoEnRango, recortarGastoARango,
  ESTADO_CONTACTO_LABEL, ESTADO_CONTACTO_COLOR,
  ESTADO_GASTO_LABEL, ESTADO_GASTO_COLOR,
  ESTADO_CUOTA_COLOR,
  type EstadoContactoAgregado,
} from '../lib/tesoreria-helpers';

const TIPO_COLORS: Record<TipoContacto, string> = {
  concejal: '#8b5cf6',
  empleado: '#3b82f6',
  profesional: '#f59e0b',
  proveedor: '#10b981',
  contratista: '#06b6d4',
  beneficiario: '#ec4899',
  otro: '#71717a',
};

const TIPO_LABELS: Record<TipoContacto, string> = {
  concejal: 'Concejal',
  empleado: 'Empleado',
  profesional: 'Profesional',
  proveedor: 'Proveedor',
  contratista: 'Contratista',
  beneficiario: 'Beneficiario',
  otro: 'Otro',
};

const ARG_DEFAULT_CENTER: [number, number] = [-30.266, -64.125];

const ESTADO_ICON: Record<EstadoContactoAgregado, typeof CheckCircle2> = {
  al_dia: CheckCircle2,
  en_mora: AlertTriangle,
  sin_gastos: MinusCircle,
};

// Proveedores de tiles disponibles para el mapa. Toggle visible arriba a la
// izquierda. Si esto funciona bien, despues lo extraemos a lib/mapTiles.tsx
// para que el resto de los mapas tambien lo use.
type TileProviderId = 'osm' | 'stadia' | 'voyager';

const TILE_PROVIDERS: Record<TileProviderId, { label: string; url: string; attribution: string }> = {
  osm: {
    label: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  stadia: {
    label: 'Stadia',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Stadia Maps &copy; OpenStreetMap',
  },
  voyager: {
    label: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OSM &copy; CARTO',
  },
};

/** CSS global para los pines (inyectado una sola vez al cargar el modulo). */
if (typeof document !== 'undefined' && !document.getElementById('tesoreria-pin-styles')) {
  const style = document.createElement('style');
  style.id = 'tesoreria-pin-styles';
  style.textContent = `
    @keyframes pulse-mora {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6), 0 4px 12px rgba(0,0,0,0.35); }
      50% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0), 0 4px 12px rgba(0,0,0,0.35); }
    }
    /* Reset del background/border que Leaflet aplica por default a .leaflet-div-icon.
       Sin esto se ve un cuadradito blanco con sombra alrededor del pin real. */
    .tesoreria-divicon {
      background: transparent !important;
      border: none !important;
    }
    .tesoreria-pin {
      cursor: pointer;
      transition: transform 0.15s ease-out;
    }
    .tesoreria-pin:hover { transform: translate(-50%, -100%) scale(1.18); z-index: 1000 !important; }
    .tesoreria-pin.highlight .tesoreria-pin-bg {
      animation: pulse-mora 1.4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

/** Pin clasico drop-pin renderizado como IMG con data-URL SVG. Es un L.icon
 *  (no L.divIcon) a proposito: asi el browser lo trata como imagen pura,
 *  sin wrapper div con CSS de Leaflet que pueda meter cuadraditos blancos
 *  o bordes. Robusto en cualquier theme/CSS global. */
function casitaDivIcon(opts: {
  color: string;
  size?: number;
  // Estos params se mantienen por compat con el call site pero no se
  // usan visualmente en esta version. Si los necesitamos de nuevo
  // (badge de count, pulse de mora), reagregar arriba del SVG.
  count?: number;
  pulse?: boolean;
  highlight?: boolean;
}) {
  const { color, size = 16 } = opts;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 24 34"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>`;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return L.icon({
    iconUrl: dataUrl,
    iconSize: [size, size * 1.4],
    iconAnchor: [size / 2, size * 1.4],
  });
}

/** Oscurece un color hex un X% (0-100). Helper para el gradient del pin. */
function darken(hex: string, percent: number): string {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * percent / 100));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Auto-ajusta el zoom inicial + expone el map al padre via callback. */
// Captura clicks en el mapa cuando hay un contacto "pendiente de ubicar".
// Si lo hay, llama al callback con lat/lon; si no, no-op.
function MapClickCapture({ active, onPick }: { active: boolean; onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => {
      if (active) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapController({
  points,
  triggerFit,
  onReady,
}: {
  points: [number, number][];
  triggerFit: number;
  onReady?: (map: L.Map) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (onReady) onReady(map);
  }, [map, onReady]);
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
  }, [points, map, triggerFit]);
  return null;
}

export default function TesoreriaMapa() {
  const { theme } = useTheme();
  const { user } = useAuth();
  // Detecta tema oscuro por luminancia del background (mismo patron que Dashboard).
  // Si es oscuro, aplicamos un filter CSS al tile layer para que el mapa no
  // brille blanco contra una UI dark.
  const isDarkTheme = (() => {
    const hex = (theme.background || '#ffffff').replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return ((r * 299 + g * 587 + b * 114) / 1000) <= 155;
  })();

  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [tipoFiltro, setTipoFiltro] = useState<TipoContacto | ''>('');
  // Filtro lista lateral: 'todos' | 'geo' (con ubicacion) | 'sin' (sin ubicacion).
  const [geoFiltro, setGeoFiltro] = useState<'todos' | 'geo' | 'sin'>('todos');
  // Contacto en modo "ubicar": al hacer click en el mapa se guarda ese punto.
  const [pendingGeoId, setPendingGeoId] = useState<number | null>(null);
  const [savingGeo, setSavingGeo] = useState(false);
  const [search, setSearch] = useState('');
  const [montoMin, setMontoMin] = useState<number>(0);
  const [rango, setRango] = useState<DateRange>({ desde: '', hasta: '' });
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoContactoAgregado | ''>('');

  // Side modal
  const [selected, setSelected] = useState<Contacto | null>(null);
  const [gastosDetalle, setGastosDetalle] = useState<Gasto[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [expandedGasto, setExpandedGasto] = useState<number | null>(null);

  // Provider de tiles activo (toggle visible arriba del mapa)
  const [tileProvider, setTileProvider] = useState<TileProviderId>('osm');
  const tile = TILE_PROVIDERS[tileProvider];

  // Wizard de "Nuevo gasto" (boton fijo al final del header)
  const [wizardOpen, setWizardOpen] = useState(false);

  // Navegabilidad: hover state compartido entre sidebar y pines + ref al mapa
  const [hoveredContacto, setHoveredContacto] = useState<number | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0); // incrementar -> re-ajusta el fit
  const mapRef = useRef<L.Map | null>(null);

  // Click en el item del sidebar: vuela al pin con zoom alto y abre el detalle
  const handleItemClick = (c: Contacto) => {
    if (mapRef.current && c.latitud && c.longitud) {
      mapRef.current.flyTo([c.latitud, c.longitud], 17, { duration: 0.9 });
    }
    handlePinClick(c);
  };

  // Persiste lat/lon en el contacto y refresca el estado local.
  // Borra la ubicacion de un contacto (lat/lon -> null).
  const clearContactoGeo = async (contactoId: number) => {
    try {
      await contactosApi.update(contactoId, { latitud: null, longitud: null });
      setContactos(prev => prev.map(x => x.id === contactoId ? { ...x, latitud: null, longitud: null } : x));
      toast.success('Ubicación borrada');
    } catch {
      toast.error('No se pudo borrar la ubicación');
    }
  };

  const saveContactoGeo = async (contactoId: number, lat: number, lon: number) => {
    setSavingGeo(true);
    try {
      await contactosApi.update(contactoId, { latitud: lat, longitud: lon });
      setContactos(prev => prev.map(x => x.id === contactoId ? { ...x, latitud: lat, longitud: lon } : x));
      setPendingGeoId(null);
      toast.success('Ubicación guardada');
      // Vuela al nuevo punto.
      if (mapRef.current) mapRef.current.flyTo([lat, lon], 17, { duration: 0.6 });
    } catch (e) {
      console.error(e);
      toast.error('No se pudo guardar la ubicación');
    } finally {
      setSavingGeo(false);
    }
  };

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <p className="p-6 text-sm">Sin permisos.</p>;
  }

  useEffect(() => {
    (async () => {
      try {
        const [c, g] = await Promise.all([
          contactosApi.list({ limit: 5000, activo: true }),
          gastosApi.list({ destino_tipo: 'contacto', limit: 1000 }),
        ]);
        setContactos(c.data);
        setGastos(g.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Soporte para query param ?ubicar=<contactoId>. Lo dispara el wizard
  // de gasto cuando el user pide "Guardar y ubicar en el mapa". Activa
  // el modo pendingGeoId (mismo flujo que el boton "Ubicar" de la fila)
  // sobre ese contacto, asi al hacer click en el mapa fija el pin.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const ubicar = searchParams.get('ubicar');
    if (!ubicar || contactos.length === 0) return;
    const id = parseInt(ubicar, 10);
    if (!Number.isFinite(id)) return;
    const c = contactos.find(x => x.id === id);
    if (!c) return;
    setPendingGeoId(id);
    setHoveredContacto(id);
    // Si ya tiene coords, centramos el mapa ahi para que el user vea de
    // donde esta saliendo. Si no, el user va a hacer click en el mapa.
    if (c.latitud && c.longitud && mapRef.current) {
      mapRef.current.flyTo([c.latitud, c.longitud], 17, { duration: 0.9 });
    }
    // Limpiar el param para que un refresh no reactive el modo.
    const next = new URLSearchParams(searchParams);
    next.delete('ubicar');
    setSearchParams(next, { replace: true });
  }, [searchParams, contactos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gastos agrupados por contacto (ya recortados al rango si hay rango).
  const gastosPorContacto = useMemo(() => {
    const map: Record<number, Gasto[]> = {};
    for (const g of gastos) {
      if (!g.destino_contacto_id) continue;
      if (!gastoEnRango(g, rango.desde, rango.hasta)) continue;
      const recortado = recortarGastoARango(g, rango.desde, rango.hasta);
      (map[g.destino_contacto_id] = map[g.destino_contacto_id] || []).push(recortado);
    }
    return map;
  }, [gastos, rango]);

  // Total gastado por contacto (en el rango filtrado, si aplica)
  const totalesPorContacto = useMemo(() => {
    const map: Record<number, number> = {};
    for (const [cid, lista] of Object.entries(gastosPorContacto)) {
      map[Number(cid)] = lista.reduce((acc, g) => acc + parseFloat(g.monto_pesos), 0);
    }
    return map;
  }, [gastosPorContacto]);

  // Estado agregado por contacto
  const estadosPorContacto = useMemo(() => {
    const map: Record<number, EstadoContactoAgregado> = {};
    for (const c of contactos) {
      map[c.id] = estadoDeContacto(gastosPorContacto[c.id] || []);
    }
    return map;
  }, [contactos, gastosPorContacto]);

  // Contactos con geo + filtros aplicados (los que se muestran como pin en mapa).
  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contactos.filter(c => {
      if (!c.latitud || !c.longitud) return false;
      if (tipoFiltro && c.tipo !== tipoFiltro) return false;
      const total = totalesPorContacto[c.id] || 0;
      if (montoMin && total < montoMin) return false;
      if (estadoFiltro && estadosPorContacto[c.id] !== estadoFiltro) return false;
      if (s) {
        const nombreCompleto = `${c.nombre} ${c.apellido || ''}`.toLowerCase();
        if (!nombreCompleto.includes(s) && !(c.alias_pago?.toLowerCase().includes(s))) {
          return false;
        }
      }
      return true;
    });
  }, [contactos, tipoFiltro, search, montoMin, estadoFiltro, totalesPorContacto, estadosPorContacto]);

  // Lista lateral: TODOS los contactos (con y sin geo). Respeta tipoFiltro + search.
  // El toggle geoFiltro restringe a 'geo' (con coords) o 'sin' (sin coords).
  const listaContactos = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contactos.filter(c => {
      if (tipoFiltro && c.tipo !== tipoFiltro) return false;
      const tieneGeo = !!(c.latitud && c.longitud);
      if (geoFiltro === 'geo' && !tieneGeo) return false;
      if (geoFiltro === 'sin' && tieneGeo) return false;
      if (s) {
        const nombreCompleto = `${c.nombre} ${c.apellido || ''}`.toLowerCase();
        if (!nombreCompleto.includes(s) && !(c.alias_pago?.toLowerCase().includes(s))) {
          return false;
        }
      }
      return true;
    });
  }, [contactos, tipoFiltro, geoFiltro, search]);
  const countSinGeo = useMemo(() => contactos.filter(c => !c.latitud || !c.longitud).length, [contactos]);

  // Puntos para FitBounds
  const points = useMemo<[number, number][]>(
    () => visibles.map(c => [c.latitud!, c.longitud!]),
    [visibles],
  );

  // Métricas del header
  const totalVisible = useMemo(
    () => visibles.reduce((acc, c) => acc + (totalesPorContacto[c.id] || 0), 0),
    [visibles, totalesPorContacto],
  );

  const cantidadGastosVisibles = useMemo(
    () => visibles.reduce((acc, c) => acc + (gastosPorContacto[c.id]?.length || 0), 0),
    [visibles, gastosPorContacto],
  );

  const promedioPorContacto = visibles.length > 0
    ? Math.round(totalVisible / visibles.length)
    : 0;

  const cantidadEnMora = useMemo(
    () => visibles.filter(c => estadosPorContacto[c.id] === 'en_mora').length,
    [visibles, estadosPorContacto],
  );

  // Al elegir un contacto: fetch gastos del contacto con cuotas
  const handlePinClick = async (c: Contacto) => {
    setSelected(c);
    setLoadingDetalle(true);
    setExpandedGasto(null);
    try {
      const res = await gastosApi.list({ contacto_id: c.id, limit: 200 });
      setGastosDetalle(res.data);
    } catch {
      setGastosDetalle([]);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const closeDetalle = () => {
    setSelected(null);
    setGastosDetalle([]);
    setExpandedGasto(null);
  };

  // Gastos del detalle ya recortados al rango (consistente con el mapa)
  const gastosDetalleFiltrados = useMemo(() => {
    if (!rango.desde && !rango.hasta) return gastosDetalle;
    return gastosDetalle
      .filter(g => gastoEnRango(g, rango.desde, rango.hasta))
      .map(g => recortarGastoARango(g, rango.desde, rango.hasta));
  }, [gastosDetalle, rango]);

  const totalDetalle = useMemo(
    () => gastosDetalleFiltrados.reduce((acc, g) => acc + parseFloat(g.monto_pesos), 0),
    [gastosDetalleFiltrados],
  );

  const estadoSeleccionado: EstadoContactoAgregado | null = selected
    ? estadoDeContacto(gastosDetalleFiltrados)
    : null;

  // Estado agregado: opciones para los chips
  const ESTADOS: { value: EstadoContactoAgregado | ''; label: string; color: string }[] = [
    { value: '', label: 'Cualquier estado', color: theme.primary },
    { value: 'al_dia', label: ESTADO_CONTACTO_LABEL.al_dia, color: ESTADO_CONTACTO_COLOR.al_dia },
    { value: 'en_mora', label: ESTADO_CONTACTO_LABEL.en_mora, color: ESTADO_CONTACTO_COLOR.en_mora },
    { value: 'sin_gastos', label: ESTADO_CONTACTO_LABEL.sin_gastos, color: ESTADO_CONTACTO_COLOR.sin_gastos },
  ];

  // Header limpio: NO chips ni métricas. Solo el search global del ABMPage.
  const extraFilters = null;
  const headerActions = null;

  // Una sola fila secundaria con secciones bien separadas por etiquetas:
  // PERÍODO  |  ESTADO  |  TIPO  |  MÍN $
  // Las métricas viven en una banda aparte (afuera del ABMPage, en children).
  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <span
      className="text-[9px] uppercase font-bold tracking-wider whitespace-nowrap"
      style={{ color: theme.textSecondary }}
    >
      {children}
    </span>
  );
  const VerticalDivider = () => (
    <div className="h-8 w-px self-center" style={{ backgroundColor: theme.border }} />
  );

  const secondaryFilters = (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 rounded-xl"
      style={{ backgroundColor: `${theme.backgroundSecondary}90`, border: `1px solid ${theme.border}` }}
    >
      {/* Período */}
      <div className="flex items-center gap-2">
        <FieldLabel>Período</FieldLabel>
        <DateRangePicker
          value={rango}
          onChange={setRango}
          allowClear
          placeholder="Todo el histórico"
        />
      </div>

      <VerticalDivider />

      {/* Estado */}
      <div className="flex items-center gap-2">
        <FieldLabel>Estado</FieldLabel>
        <div className="flex flex-wrap gap-1">
          {ESTADOS.map(s => {
            const active = estadoFiltro === s.value;
            return (
              <button
                key={s.value || 'all'}
                onClick={() => setEstadoFiltro(s.value as EstadoContactoAgregado | '')}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                style={{
                  backgroundColor: active ? s.color : `${s.color}15`,
                  color: active ? '#fff' : s.color,
                  border: `1px solid ${s.color}40`,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <VerticalDivider />

      {/* Tipo de contacto */}
      <div className="flex items-center gap-2">
        <FieldLabel>Tipo</FieldLabel>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTipoFiltro('')}
            className="px-2.5 py-1 rounded-md text-xs font-medium"
            style={{
              backgroundColor: tipoFiltro === '' ? theme.primary : 'transparent',
              color: tipoFiltro === '' ? '#fff' : theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            Todos
          </button>
          {(Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => (
            <button
              key={t}
              onClick={() => setTipoFiltro(tipoFiltro === t ? '' : t)}
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{
                backgroundColor: tipoFiltro === t ? TIPO_COLORS[t] : `${TIPO_COLORS[t]}15`,
                color: tipoFiltro === t ? '#fff' : TIPO_COLORS[t],
                border: `1px solid ${TIPO_COLORS[t]}40`,
              }}
            >
              {TIPO_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <VerticalDivider />

      {/* Monto mínimo */}
      <div className="flex items-center gap-2">
        <FieldLabel>Mín $</FieldLabel>
        <input
          type="number"
          value={montoMin || ''}
          onChange={(e) => setMontoMin(parseFloat(e.target.value) || 0)}
          placeholder="0"
          min={0}
          step={10000}
          className="w-24 px-2 py-1 rounded-md text-xs"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>
    </div>
  );

  // Banda de métricas (KPIs) — aparece entre la fila de filtros y el mapa.
  const metricsBar = (
    <div
      className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl p-2"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="text-center py-1">
        <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Visibles</p>
        <p className="text-lg font-bold leading-tight" style={{ color: theme.text }}>{visibles.length}</p>
      </div>
      <div className="text-center py-1" style={{ borderLeft: `1px solid ${theme.border}` }}>
        <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Gastos</p>
        <p className="text-lg font-bold leading-tight" style={{ color: theme.text }}>{cantidadGastosVisibles}</p>
      </div>
      <div className="text-center py-1" style={{ borderLeft: `1px solid ${theme.border}` }}>
        <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Total</p>
        <p className="text-lg font-bold leading-tight" style={{ color: theme.primary }}>
          ${totalVisible.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </p>
      </div>
      <div className="text-center py-1" style={{ borderLeft: `1px solid ${theme.border}` }}>
        <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Promedio</p>
        <p className="text-lg font-bold leading-tight" style={{ color: theme.text }}>
          ${promedioPorContacto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </p>
      </div>
      <div className="text-center py-1" style={{ borderLeft: `1px solid ${theme.border}` }}>
        <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>En mora</p>
        <p
          className="text-lg font-bold leading-tight"
          style={{ color: cantidadEnMora > 0 ? ESTADO_CONTACTO_COLOR.en_mora : theme.text }}
        >
          {cantidadEnMora}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <TesoreriaHint titulo="Mapa de Contactos" storageKey="mapa">
        Cada casita es un contacto con ubicación cargada. Tocá un pin para
        ver el detalle de los gastos. El tamaño del pin indica cuánto le
        pagaste en total. Usá los filtros para acotar período y estado.
      </TesoreriaHint>

      <ABMPage
        title="Mapa"
        icon={<MapPin className="h-5 w-5" />}
        backLink="/gestion/tesoreria"
        searchPlaceholder="Buscar por nombre o alias…"
        searchValue={search}
        onSearchChange={setSearch}
        extraFilters={extraFilters}
        secondaryFilters={secondaryFilters}
        headerActions={headerActions}
        buttonLabel="Nuevo Gasto"
        onAdd={() => setWizardOpen(true)}
        loading={loading}
        isEmpty={contactos.length === 0}
        emptyMessage="No hay contactos visibles. Ajustá los filtros o agregá ubicaciones a los contactos."
      >
        <div className="col-span-full grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ height: 'calc(100vh - 200px)' }}>
          {/* Sidebar 25% — lista de contactos visibles con click para volar al pin */}
          <div
            className="lg:col-span-1 rounded-xl overflow-hidden flex flex-col"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="px-3 py-2 flex flex-col gap-2 flex-shrink-0"
              style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.backgroundSecondary }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                  Contactos · {listaContactos.length}
                </p>
                <button
                  type="button"
                  onClick={() => setFitTrigger(v => v + 1)}
                  className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all hover:scale-105"
                  style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                  title="Ajustar zoom para ver todos los pines"
                >
                  Ver todos
                </button>
              </div>
              {/* Toggle filtro geo: Todos / Geolocalizados / Sin ubicar */}
              <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
                {([
                  { key: 'todos', label: 'Todos', count: contactos.length },
                  { key: 'geo',   label: 'Ubicados', count: contactos.length - countSinGeo },
                  { key: 'sin',   label: 'Sin ubicar', count: countSinGeo },
                ] as const).map(opt => {
                  const active = geoFiltro === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGeoFiltro(opt.key)}
                      className="flex-1 text-[10px] font-semibold py-1 transition-all"
                      style={{
                        backgroundColor: active ? `${theme.primary}25` : 'transparent',
                        color: active ? theme.primary : theme.textSecondary,
                      }}
                    >
                      {opt.label} <span className="opacity-70">({opt.count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Filtro por tipo de contacto: pills con count por tipo */}
              <div className="flex flex-wrap gap-1">
                {(() => {
                  const countsByTipo = contactos.reduce((acc, c) => {
                    acc[c.tipo] = (acc[c.tipo] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);
                  return (Object.keys(TIPO_LABELS) as TipoContacto[])
                    .filter(t => (countsByTipo[t] || 0) > 0)
                    .map(t => {
                      const active = tipoFiltro === t;
                      const color = TIPO_COLORS[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTipoFiltro(active ? '' : t)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all"
                          style={{
                            backgroundColor: active ? color : `${color}18`,
                            color: active ? '#fff' : color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {TIPO_LABELS[t]} <span className="opacity-70">({countsByTipo[t]})</span>
                        </button>
                      );
                    });
                })()}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
              {listaContactos.length === 0 ? (
                <p className="text-xs text-center p-4 opacity-60" style={{ color: theme.textSecondary }}>
                  Sin resultados con los filtros actuales.
                </p>
              ) : (
                listaContactos.map(c => {
                  const total = totalesPorContacto[c.id] || 0;
                  const estado = estadosPorContacto[c.id];
                  const tipoColor = TIPO_COLORS[c.tipo];
                  const isHovered = hoveredContacto === c.id;
                  const isSelected = selected?.id === c.id;
                  const tieneGeo = !!(c.latitud && c.longitud);
                  const isPending = pendingGeoId === c.id;
                  return (
                    <div
                      key={c.id}
                      onMouseEnter={() => setHoveredContacto(c.id)}
                      onMouseLeave={() => setHoveredContacto(null)}
                      className="w-full px-3 py-2 transition-all flex items-start gap-2"
                      style={{
                        borderBottom: `1px solid ${theme.border}40`,
                        backgroundColor: isPending
                          ? `${theme.primary}25`
                          : isSelected ? `${theme.primary}15`
                          : isHovered ? theme.backgroundSecondary : 'transparent',
                        cursor: tieneGeo ? 'pointer' : 'default',
                      }}
                      onClick={() => { if (tieneGeo) handleItemClick(c); }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${tipoColor}25`, color: tipoColor }}
                      >
                        <Home className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          {tieneGeo && (
                            <MapPin className="h-3 w-3 flex-shrink-0" style={{ color: '#10b981' }} />
                          )}
                          <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>
                            {c.nombre} {c.apellido || ''}
                          </p>
                        </div>
                        <p className="text-[10px] truncate opacity-70" style={{ color: theme.textSecondary }}>
                          {TIPO_LABELS[c.tipo]}
                          {(() => {
                            const n = gastosPorContacto[c.id]?.length || 0;
                            return n > 0 ? ` (${n} ${n === 1 ? 'pago' : 'pagos'})` : '';
                          })()}
                        </p>
                        {total > 0 && (
                          <p className="text-[11px] font-bold tabular-nums mt-0.5" style={{ color: theme.primary }}>
                            ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {estado && estado !== 'sin_gastos' && (
                          <span
                            className="text-[8px] uppercase font-bold px-1 py-0.5 rounded"
                            style={{
                              backgroundColor: `${ESTADO_CONTACTO_COLOR[estado]}25`,
                              color: ESTADO_CONTACTO_COLOR[estado],
                            }}
                          >
                            {estado === 'en_mora' ? 'Mora' : 'OK'}
                          </span>
                        )}
                        {!tieneGeo && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPendingGeoId(isPending ? null : c.id); }}
                            disabled={savingGeo}
                            className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all hover:scale-105"
                            style={{
                              backgroundColor: isPending ? theme.primary : `${theme.primary}20`,
                              color: isPending ? '#fff' : theme.primary,
                              border: `1px solid ${theme.primary}40`,
                            }}
                            title={isPending ? 'Cancelar' : 'Click en el mapa para fijar ubicación'}
                          >
                            {isPending ? 'Cancelar' : 'Ubicar'}
                          </button>
                        )}
                        {tieneGeo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Borrar ubicación de ${c.nombre} ${c.apellido || ''}?`)) {
                                clearContactoGeo(c.id);
                              }
                            }}
                            className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all hover:scale-105"
                            style={{
                              backgroundColor: '#ef444415',
                              color: '#ef4444',
                              border: '1px solid #ef444440',
                            }}
                            title="Borrar ubicación"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Mapa 75% */}
          <div
            className={`lg:col-span-3 rounded-xl overflow-hidden relative ${isDarkTheme ? 'tesoreria-mapa-dark' : ''}`}
            style={{ border: `1px solid ${theme.border}` }}
          >
            <style>{`
              .tesoreria-mapa-dark .leaflet-tile-pane {
                filter: brightness(0.55) saturate(0.6) hue-rotate(200deg);
              }
              /* Los pines (markers) NO deben afectarse. */
              .tesoreria-mapa-dark .leaflet-marker-pane,
              .tesoreria-mapa-dark .leaflet-popup-pane,
              .tesoreria-mapa-dark .leaflet-shadow-pane {
                filter: none;
              }
            `}</style>
            <MapContainer center={ARG_DEFAULT_CENTER} zoom={13} style={{ width: '100%', height: '100%' }}>
              <TileLayer
                key={tileProvider}
                attribution={tile.attribution}
                url={tile.url}
                maxZoom={19}
              />
              <MapController points={points} triggerFit={fitTrigger} onReady={(m) => { mapRef.current = m; }} />
              <MapClickCapture
                active={pendingGeoId != null && !savingGeo}
                onPick={(lat, lon) => {
                  if (pendingGeoId != null) saveContactoGeo(pendingGeoId, lat, lon);
                }}
              />
              {visibles.map(c => {
                const total = totalesPorContacto[c.id] || 0;
                const cantidad = gastosPorContacto[c.id]?.length || 0;
                const baseSize = total > 0 ? Math.min(24, 14 + Math.log10(total + 1) * 2) : 14;
                const enMora = estadosPorContacto[c.id] === 'en_mora';
                const pinColor = enMora ? ESTADO_CONTACTO_COLOR.en_mora : TIPO_COLORS[c.tipo];
                const isHovered = hoveredContacto === c.id;
                return (
                  <Marker
                    key={c.id}
                    position={[c.latitud!, c.longitud!]}
                    icon={casitaDivIcon({
                      color: pinColor,
                      size: isHovered ? baseSize * 1.18 : baseSize,
                      count: cantidad,
                      pulse: enMora,
                      highlight: isHovered,
                    })}
                    eventHandlers={{
                      click: () => handlePinClick(c),
                      mouseover: () => setHoveredContacto(c.id),
                      mouseout: () => setHoveredContacto(null),
                    }}
                  />
                );
              })}
            </MapContainer>

            {/* Banner overlay cuando hay un contacto pendiente de ubicar */}
            {pendingGeoId != null && (
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-3 py-2 rounded-lg shadow-lg flex items-center gap-2"
                style={{ backgroundColor: theme.primary, color: '#fff', border: `2px solid ${theme.primary}` }}
              >
                <MapPin className="h-4 w-4" />
                <span className="text-xs font-semibold">
                  {savingGeo ? 'Guardando…' : 'Click en el mapa para fijar la ubicación'}
                </span>
                {!savingGeo && (
                  <button
                    type="button"
                    onClick={() => setPendingGeoId(null)}
                    className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}

            {/* Toggle de proveedor de tiles (experimento: OSM vs Stadia) */}
            <div
              className="absolute top-3 left-3 z-[1000] flex rounded-lg overflow-hidden shadow-lg"
              style={{ border: `1px solid ${theme.border}` }}
            >
              {(Object.keys(TILE_PROVIDERS) as TileProviderId[]).map((id) => {
                const isActive = id === tileProvider;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTileProvider(id)}
                    className="px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: isActive ? theme.primary : theme.card,
                      color: isActive ? theme.card : theme.text,
                    }}
                    title={`Cambiar a ${TILE_PROVIDERS[id].label}`}
                  >
                    {TILE_PROVIDERS[id].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ABMPage>

      {/* Side modal con detalle del contacto + gastos expandibles */}
      <Sheet
        open={!!selected}
        onClose={closeDetalle}
        title={selected ? `${selected.nombre} ${selected.apellido || ''}`.trim() : ''}
        description={selected ? TIPO_LABELS[selected.tipo] : ''}
        stickyFooter={
          selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/gestion/tesoreria/contactos"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              >
                <Users className="h-3.5 w-3.5" /> Ver en agenda
              </Link>
              <Link
                to="/gestion/tesoreria"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                  color: '#fff',
                  boxShadow: `0 4px 14px ${theme.primary}40`,
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Cargar gasto
              </Link>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            {/* Estado agregado del contacto - prominente arriba */}
            {estadoSeleccionado && (() => {
              const Icon = ESTADO_ICON[estadoSeleccionado];
              const color = ESTADO_CONTACTO_COLOR[estadoSeleccionado];
              return (
                <div
                  className="p-3 rounded-xl flex items-center gap-3"
                  style={{
                    backgroundColor: `${color}15`,
                    border: `1px solid ${color}40`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase font-bold" style={{ color }}>
                      Estado del contacto
                    </p>
                    <p className="text-base font-bold" style={{ color: theme.text }}>
                      {ESTADO_CONTACTO_LABEL[estadoSeleccionado]}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Header info (tipo + alias) */}
            <div
              className="p-3 rounded-xl flex items-center gap-3"
              style={{
                backgroundColor: `${TIPO_COLORS[selected.tipo]}15`,
                border: `1px solid ${TIPO_COLORS[selected.tipo]}40`,
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: TIPO_COLORS[selected.tipo] }}
              >
                <Home className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ color: theme.text }}>
                  {selected.nombre} {selected.apellido || ''}
                </p>
                <p className="text-[11px] uppercase font-semibold" style={{ color: TIPO_COLORS[selected.tipo] }}>
                  {TIPO_LABELS[selected.tipo]}
                </p>
                {selected.alias_pago && (
                  <p className="text-xs font-mono mt-0.5" style={{ color: theme.textSecondary }}>
                    {selected.alias_pago}
                  </p>
                )}
              </div>
            </div>

            {/* Mini preview del mapa centrado en el contacto */}
            {selected.latitud != null && selected.longitud != null && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ height: 140, border: `1px solid ${theme.border}` }}
              >
                <MapContainer
                  center={[selected.latitud, selected.longitud]}
                  zoom={16}
                  style={{ width: '100%', height: '100%' }}
                  zoomControl={false}
                  attributionControl={false}
                  dragging={false}
                  doubleClickZoom={false}
                  scrollWheelZoom={false}
                >
                  <TileLayer key={tileProvider} url={tile.url} attribution={tile.attribution} />
                  <Marker
                    position={[selected.latitud, selected.longitud]}
                    icon={casitaDivIcon({ color: TIPO_COLORS[selected.tipo], size: 18 })}
                  />
                </MapContainer>
              </div>
            )}

            {/* Datos de contacto */}
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              {selected.direccion && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: theme.textSecondary }} />
                  <span style={{ color: theme.text }}>{selected.direccion}</span>
                </div>
              )}
              {selected.telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  <span style={{ color: theme.text }}>{selected.telefono}</span>
                </div>
              )}
              {selected.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  <span style={{ color: theme.text }}>{selected.email}</span>
                </div>
              )}
              {selected.latitud && selected.longitud && (
                <p className="text-[10px] opacity-60" style={{ color: theme.textSecondary }}>
                  Coords: {selected.latitud.toFixed(5)}, {selected.longitud.toFixed(5)}
                </p>
              )}
            </div>

            {/* Total + cantidad - respeta rango si está seteado */}
            <div
              className="p-3 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <div>
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
                  {rango.desde || rango.hasta ? 'Pagado en período' : 'Total pagado'}
                </p>
                <p className="text-2xl font-bold" style={{ color: theme.primary }}>
                  ${totalDetalle.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
                  Gastos
                </p>
                <p className="text-lg font-semibold" style={{ color: theme.text }}>
                  {gastosDetalleFiltrados.length}
                </p>
              </div>
            </div>

            {/* Lista de gastos con cuotas expandibles */}
            <div>
              <h3 className="text-xs uppercase font-bold mb-2" style={{ color: theme.textSecondary }}>
                Detalle de gastos
              </h3>
              {loadingDetalle ? (
                <div className="text-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" style={{ color: theme.primary }} />
                </div>
              ) : gastosDetalleFiltrados.length === 0 ? (
                <p className="text-sm text-center py-4 opacity-60" style={{ color: theme.textSecondary }}>
                  {rango.desde || rango.hasta
                    ? 'Sin gastos en el período seleccionado.'
                    : 'Sin gastos cargados.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {gastosDetalleFiltrados.map(g => {
                    const isExpanded = expandedGasto === g.id;
                    const cuotas = g.cuotas || [];
                    const estadoG = estadoDeGasto(g);
                    const estadoColor = ESTADO_GASTO_COLOR[estadoG];
                    return (
                      <div
                        key={g.id}
                        className="rounded-lg overflow-hidden"
                        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedGasto(isExpanded ? null : g.id)}
                          className="w-full p-3 flex items-center gap-2 transition-colors hover:opacity-90"
                          style={{ color: theme.text }}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 flex-shrink-0" />
                            : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{g.concepto}</p>
                              <span
                                className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{
                                  backgroundColor: `${estadoColor}20`,
                                  color: estadoColor,
                                  border: `1px solid ${estadoColor}40`,
                                }}
                              >
                                {ESTADO_GASTO_LABEL[estadoG]}
                              </span>
                            </div>
                            <p className="text-[10px] opacity-60">
                              {new Date(g.fecha).toLocaleDateString('es-AR')} · {g.tipo_financiacion}
                            </p>
                          </div>
                          <p className="font-bold tabular-nums whitespace-nowrap">
                            ${parseFloat(g.monto_pesos).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </p>
                        </button>
                        {isExpanded && cuotas.length > 0 && (
                          <div
                            className="px-3 pb-3 pt-1"
                            style={{ borderTop: `1px solid ${theme.border}` }}
                          >
                            <p className="text-[10px] uppercase font-bold mb-1.5 opacity-70" style={{ color: theme.textSecondary }}>
                              Cuotas ({cuotas.length})
                            </p>
                            <div className="space-y-0.5">
                              {cuotas.map(cu => (
                                <CuotaRow key={cu.id} cuota={cu} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <CrearGastoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          setWizardOpen(false);
          // Refresh gastos sin recargar la página
          gastosApi.list({ destino_tipo: 'contacto', limit: 1000 })
            .then(r => setGastos(r.data))
            .catch(() => {});
        }}
      />
    </>
  );
}

function CuotaRow({ cuota }: { cuota: GastoCuota }) {
  const { theme } = useTheme();
  const c = ESTADO_CUOTA_COLOR[cuota.estado] || theme.textSecondary;
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span
        className="w-5 h-5 rounded flex items-center justify-center font-bold flex-shrink-0"
        style={{ backgroundColor: `${c}25`, color: c }}
      >
        {cuota.numero}
      </span>
      <span className="flex-1 min-w-0 truncate" style={{ color: theme.text }}>
        Vence {new Date(cuota.fecha_vencimiento).toLocaleDateString('es-AR')}
      </span>
      <span
        className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
        style={{ backgroundColor: `${c}20`, color: c }}
      >
        {cuota.estado}
      </span>
      <span className="font-semibold tabular-nums" style={{ color: theme.text }}>
        ${parseFloat(cuota.monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}
