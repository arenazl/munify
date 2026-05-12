import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Home, Search, X, ChevronDown, ChevronRight, Loader2, Phone, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TesoreriaHint } from '../components/tesoreria/TesoreriaHint';
import { Sheet } from '../components/ui/Sheet';
import { contactosApi, gastosApi } from '../lib/api';
import type { Contacto, Gasto, GastoCuota, TipoContacto } from '../types';

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

  // Total gastado por contacto
  const totalesPorContacto = useMemo(() => {
    const map: Record<number, number> = {};
    for (const g of gastos) {
      if (g.destino_contacto_id) {
        map[g.destino_contacto_id] = (map[g.destino_contacto_id] || 0) + parseFloat(g.monto_pesos);
      }
    }
    return map;
  }, [gastos]);

  // Contactos con geo + filtros aplicados
  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contactos.filter(c => {
      if (!c.latitud || !c.longitud) return false;
      if (tipoFiltro && c.tipo !== tipoFiltro) return false;
      const total = totalesPorContacto[c.id] || 0;
      if (montoMin && total < montoMin) return false;
      if (s) {
        const nombreCompleto = `${c.nombre} ${c.apellido || ''}`.toLowerCase();
        if (!nombreCompleto.includes(s) && !(c.alias_pago?.toLowerCase().includes(s))) {
          return false;
        }
      }
      return true;
    });
  }, [contactos, tipoFiltro, search, montoMin, totalesPorContacto]);

  // Puntos para FitBounds
  const points = useMemo<[number, number][]>(
    () => visibles.map(c => [c.latitud!, c.longitud!]),
    [visibles],
  );

  // Métricas
  const totalVisible = useMemo(
    () => visibles.reduce((acc, c) => acc + (totalesPorContacto[c.id] || 0), 0),
    [visibles, totalesPorContacto],
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Link to="/gestion/tesoreria" className="text-sm inline-flex items-center gap-1 mb-3" style={{ color: theme.primary }}>
        <ArrowLeft className="h-4 w-4" /> Volver a Tesorería
      </Link>

      <TesoreriaHint titulo="Mapa de Contactos" storageKey="mapa">
        Cada casita es un contacto con ubicación cargada. Tocá un pin para ver
        el detalle de los gastos que tuvo. Usá los filtros para ver solo
        cierto tipo o un rango de monto.
      </TesoreriaHint>

      {/* Header con métricas en vivo */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
          <MapPin className="h-6 w-6" /> Mapa
        </h1>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Visibles</p>
            <p className="text-lg font-bold" style={{ color: theme.text }}>{visibles.length}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>Total $</p>
            <p className="text-lg font-bold" style={{ color: theme.primary }}>
              ${totalVisible.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold opacity-70" style={{ color: theme.textSecondary }}>Tipo:</span>
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
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold opacity-70" style={{ color: theme.textSecondary }}>Mín $:</span>
          <input
            type="number"
            value={montoMin || ''}
            onChange={(e) => setMontoMin(parseFloat(e.target.value) || 0)}
            placeholder="0"
            min={0}
            step={10000}
            className="w-28 px-2 py-1 rounded-md text-xs"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-center py-12" style={{ color: theme.textSecondary }}>Cargando...</p>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}` }}>
          <MapPin className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
          <p className="font-semibold" style={{ color: theme.text }}>No hay contactos visibles</p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Ajustá los filtros o agregá ubicaciones a los contactos.
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}`, height: 600 }}>
          <MapContainer center={ARG_DEFAULT_CENTER} zoom={13} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <FitBounds points={points} />
            {visibles.map(c => {
              const total = totalesPorContacto[c.id] || 0;
              // Tamaño del pin proporcional al monto total (32-56 px)
              const baseSize = total > 0 ? Math.min(56, 32 + Math.log10(total + 1) * 4) : 32;
              return (
                <Marker
                  key={c.id}
                  position={[c.latitud!, c.longitud!]}
                  icon={casitaDivIcon(TIPO_COLORS[c.tipo], baseSize)}
                  eventHandlers={{
                    click: () => handlePinClick(c),
                  }}
                />
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* Side modal con detalle del contacto + gastos expandibles */}
      <Sheet
        open={!!selected}
        onClose={closeDetalle}
        title={selected ? `${selected.nombre} ${selected.apellido || ''}`.trim() : ''}
        description={selected ? TIPO_LABELS[selected.tipo] : ''}
      >
        {selected && (
          <div className="space-y-4">
            {/* Header info */}
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

            {/* Total gastado */}
            <div
              className="p-3 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <div>
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
                  Total pagado
                </p>
                <p className="text-2xl font-bold" style={{ color: theme.primary }}>
                  ${(totalesPorContacto[selected.id] || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
                  Gastos
                </p>
                <p className="text-lg font-semibold" style={{ color: theme.text }}>
                  {gastosDetalle.length}
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
              ) : gastosDetalle.length === 0 ? (
                <p className="text-sm text-center py-4 opacity-60" style={{ color: theme.textSecondary }}>
                  Sin gastos cargados.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {gastosDetalle.map(g => {
                    const isExpanded = expandedGasto === g.id;
                    const cuotas = g.cuotas || [];
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
                            <p className="font-medium text-sm truncate">{g.concepto}</p>
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
    </div>
  );
}

function CuotaRow({ cuota }: { cuota: GastoCuota }) {
  const { theme } = useTheme();
  const colors: Record<string, string> = {
    pagada: '#10b981',
    pendiente: '#f59e0b',
    vencida: '#ef4444',
    cancelada: '#71717a',
  };
  const c = colors[cuota.estado] || theme.textSecondary;
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
