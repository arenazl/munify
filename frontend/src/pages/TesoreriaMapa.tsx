import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Home, ChevronDown, ChevronRight, Loader2, Phone, Mail,
  Users, Plus, AlertTriangle, CheckCircle2, MinusCircle,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
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

/** SVG inline de casita (Lucide Home) con color custom. Se usa como DivIcon. */
function casitaDivIcon(color: string, size = 36) {
  const html = `
    <div style="
      position: relative;
      width: ${size}px;
      height: ${size}px;
      transform: translate(-50%, -100%);
      cursor: pointer;
    ">
      <svg viewBox="0 0 24 24" width="${size}" height="${size}"
        fill="${color}" stroke="#fff" stroke-width="1.5"
        style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
        <path d="M3 10.182V22a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6h6v6a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V10.182a2 2 0 0 0-.659-1.484l-7.999-7.273a2 2 0 0 0-2.683 0L3.66 8.698A2 2 0 0 0 3 10.182z"/>
      </svg>
      <div style="
        position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 6px solid ${color};
      "></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

/** Componente interno: auto-ajusta el zoom para que se vean todos los pines. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

export default function TesoreriaMapa() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [tipoFiltro, setTipoFiltro] = useState<TipoContacto | ''>('');
  const [search, setSearch] = useState('');
  const [montoMin, setMontoMin] = useState<number>(0);
  const [rango, setRango] = useState<DateRange>({ desde: '', hasta: '' });
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoContactoAgregado | ''>('');

  // Side modal
  const [selected, setSelected] = useState<Contacto | null>(null);
  const [gastosDetalle, setGastosDetalle] = useState<Gasto[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [expandedGasto, setExpandedGasto] = useState<number | null>(null);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <p className="p-6 text-sm">Sin permisos.</p>;
  }

  useEffect(() => {
    (async () => {
      try {
        const [c, g] = await Promise.all([
          contactosApi.list({ limit: 500, activo: true }),
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

  // Contactos con geo + filtros aplicados
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

  const extraFilters = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => setTipoFiltro('')}
        className="px-2 py-1 rounded-md text-xs font-medium"
        style={{
          backgroundColor: tipoFiltro === '' ? theme.primary : 'transparent',
          color: tipoFiltro === '' ? '#fff' : theme.textSecondary,
          border: `1px solid ${theme.border}`,
        }}
      >Todos</button>
      {(Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => (
        <button
          key={t}
          onClick={() => setTipoFiltro(tipoFiltro === t ? '' : t)}
          className="px-2 py-1 rounded-md text-xs font-medium"
          style={{
            backgroundColor: tipoFiltro === t ? TIPO_COLORS[t] : `${TIPO_COLORS[t]}15`,
            color: tipoFiltro === t ? '#fff' : TIPO_COLORS[t],
            border: `1px solid ${TIPO_COLORS[t]}40`,
          }}
        >{TIPO_LABELS[t]}</button>
      ))}
    </div>
  );

  // Segunda fila de filtros: rango de fechas + estado agregado
  const ESTADOS: { value: EstadoContactoAgregado | ''; label: string; color: string }[] = [
    { value: '', label: 'Cualquier estado', color: theme.primary },
    { value: 'al_dia', label: ESTADO_CONTACTO_LABEL.al_dia, color: ESTADO_CONTACTO_COLOR.al_dia },
    { value: 'en_mora', label: ESTADO_CONTACTO_LABEL.en_mora, color: ESTADO_CONTACTO_COLOR.en_mora },
    { value: 'sin_gastos', label: ESTADO_CONTACTO_LABEL.sin_gastos, color: ESTADO_CONTACTO_COLOR.sin_gastos },
  ];

  const secondaryFilters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase font-bold opacity-70" style={{ color: theme.textSecondary }}>
          Período
        </span>
        <DateRangePicker
          value={rango}
          onChange={setRango}
          allowClear
          placeholder="Todo el histórico"
        />
      </div>

      <div className="h-6 w-px" style={{ backgroundColor: theme.border }} />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase font-bold opacity-70" style={{ color: theme.textSecondary }}>
          Estado
        </span>
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
  );

  const headerActions = (
    <>
      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
        <span className="text-[10px] uppercase font-bold opacity-70" style={{ color: theme.textSecondary }}>Mín $</span>
        <input
          type="number"
          value={montoMin || ''}
          onChange={(e) => setMontoMin(parseFloat(e.target.value) || 0)}
          placeholder="0"
          min={0}
          step={10000}
          className="w-20 px-1 py-0 rounded text-xs bg-transparent outline-none"
          style={{ color: theme.text }}
        />
      </div>
      <div className="inline-flex items-center gap-3 px-3 py-2 rounded-xl"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
        <div className="text-center">
          <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Visibles</p>
          <p className="text-sm font-bold leading-none" style={{ color: theme.text }}>{visibles.length}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Gastos</p>
          <p className="text-sm font-bold leading-none" style={{ color: theme.text }}>{cantidadGastosVisibles}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Total</p>
          <p className="text-sm font-bold leading-none" style={{ color: theme.primary }}>
            ${totalVisible.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>Prom.</p>
          <p className="text-sm font-bold leading-none" style={{ color: theme.text }}>
            ${promedioPorContacto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase font-bold opacity-60" style={{ color: theme.textSecondary }}>En mora</p>
          <p
            className="text-sm font-bold leading-none"
            style={{ color: cantidadEnMora > 0 ? ESTADO_CONTACTO_COLOR.en_mora : theme.text }}
          >
            {cantidadEnMora}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="px-4 pt-3">
        <TesoreriaHint titulo="Mapa de Contactos" storageKey="mapa">
          Cada casita es un contacto con ubicación cargada. Tocá un pin para
          ver el detalle de los gastos. El tamaño del pin indica cuánto le
          pagaste en total. Usá los filtros para acotar período y estado.
        </TesoreriaHint>
      </div>

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
        loading={loading}
        isEmpty={!loading && visibles.length === 0}
        emptyMessage="No hay contactos visibles. Ajustá los filtros o agregá ubicaciones a los contactos."
      >
        <div className="rounded-xl overflow-hidden col-span-full" style={{ border: `1px solid ${theme.border}`, height: 600 }}>
          <MapContainer center={ARG_DEFAULT_CENTER} zoom={13} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <FitBounds points={points} />
            {visibles.map(c => {
              const total = totalesPorContacto[c.id] || 0;
              const baseSize = total > 0 ? Math.min(56, 32 + Math.log10(total + 1) * 4) : 32;
              // Si está en mora, el pin se pinta rojo para destacarse — lectura
              // visual instantánea del estado del contacto en el mapa.
              const pinColor = estadosPorContacto[c.id] === 'en_mora'
                ? ESTADO_CONTACTO_COLOR.en_mora
                : TIPO_COLORS[c.tipo];
              return (
                <Marker
                  key={c.id}
                  position={[c.latitud!, c.longitud!]}
                  icon={casitaDivIcon(pinColor, baseSize)}
                  eventHandlers={{ click: () => handlePinClick(c) }}
                />
              );
            })}
          </MapContainer>
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
