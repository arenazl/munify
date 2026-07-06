import { useMemo } from 'react';
import {
  MapPinned,
  RefreshCw,
  Search,
  Loader2,
  Pencil,
  Trash2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { DynamicIcon } from '../ui/DynamicIcon';
import type { PuntoInteres } from '../../types';

/**
 * Panel lateral del MODO PUNTOS del Mapa.
 *
 * Lista los POIs del muni (buscables), y por cada uno muestra el contador de
 * reclamos activos dentro de su zona (radio) + un botón "Consolidar en OT" que
 * agrupa esos reclamos en una única orden de trabajo de zona.
 *
 * La creación/edición/borrado del POI vive en el mapa (click / drag / Sheet);
 * este panel sólo lista, selecciona (abre el Sheet en edición), consolida y
 * dispara el recálculo batch de zonas. NO redefine controles ni colores: todo
 * sale de `useTheme()` y del color propio del tipo de cada POI.
 */
interface MapaPuntosPanelProps {
  pois: PuntoInteres[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  /** poiId -> cantidad de reclamos activos en zona */
  counts: Record<number, number>;
  countsLoading: boolean;
  selectedId: number | null;
  onSelect: (poi: PuntoInteres) => void;
  onConsolidar: (poi: PuntoInteres) => void;
  consolidatingId: number | null;
  onDelete: (poi: PuntoInteres) => void;
  onRecalcular: () => void;
  recalculando: boolean;
}

export default function MapaPuntosPanel({
  pois,
  loading,
  search,
  onSearchChange,
  counts,
  countsLoading,
  selectedId,
  onSelect,
  onConsolidar,
  consolidatingId,
  onDelete,
  onRecalcular,
  recalculando,
}: MapaPuntosPanelProps) {
  const { theme } = useTheme();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pois;
    return pois.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.tipo_nombre || '').toLowerCase().includes(q) ||
        (p.direccion || '').toLowerCase().includes(q),
    );
  }, [pois, search]);

  return (
    <div
      className="rounded-lg shadow flex flex-col lg:w-[360px] flex-shrink-0"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, height: '600px' }}
    >
      {/* Header */}
      <div
        className="p-3 flex items-center justify-between gap-2 flex-shrink-0"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPinned className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
          <span className="text-sm font-semibold truncate" style={{ color: theme.text }}>
            Puntos de interés
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          >
            {pois.length}
          </span>
        </div>
        <button
          onClick={onRecalcular}
          disabled={recalculando}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex-shrink-0"
          style={{ backgroundColor: `${theme.primary}12`, color: theme.primary, border: `1px solid ${theme.primary}30` }}
          title="Recalcular qué reclamos caen dentro de cada zona"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recalculando ? 'animate-spin' : ''}`} />
          Recalcular
        </button>
      </div>

      {/* Buscador + hint */}
      <div className="p-3 flex-shrink-0" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: theme.textSecondary }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar punto..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>
        <p className="text-[11px] mt-2 flex items-center gap-1" style={{ color: theme.textSecondary }}>
          <Sparkles className="h-3 w-3 flex-shrink-0" />
          Hacé click en el mapa para crear un punto nuevo.
        </p>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-4 text-sm" style={{ color: theme.textSecondary }}>
            {pois.length === 0
              ? 'Todavía no hay puntos. Hacé click en el mapa para crear el primero.'
              : 'Ningún punto coincide con la búsqueda.'}
          </div>
        ) : (
          filtered.map((poi) => {
            const color = poi.tipo_color || theme.primary;
            const count = counts[poi.id] ?? 0;
            const isSelected = selectedId === poi.id;
            const isConsolidating = consolidatingId === poi.id;
            return (
              <div
                key={poi.id}
                className="rounded-xl p-3 transition-all"
                style={{
                  backgroundColor: isSelected ? `${color}12` : theme.background,
                  border: `1px solid ${isSelected ? color : theme.border}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onSelect(poi)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <DynamicIcon
                        name={poi.tipo_icono || 'MapPin'}
                        className="h-4 w-4"
                        style={{ color }}
                        fallback={<MapPinned className="h-4 w-4" style={{ color }} />}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                        {poi.nombre}
                      </p>
                      <p className="text-xs truncate" style={{ color: theme.textSecondary }}>
                        {poi.tipo_nombre || 'Sin tipo'} · {poi.radio_metros} m
                      </p>
                      {!poi.activo && (
                        <span
                          className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: `${theme.textSecondary}20`, color: theme.textSecondary }}
                        >
                          Inactivo
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onSelect(poi)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                      style={{ color: theme.textSecondary }}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(poi)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                      style={{ color: '#ef4444' }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Zona: contador + consolidar en OT */}
                <div
                  className="flex items-center justify-between gap-2 mt-2 pt-2"
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <span
                    className="text-xs flex items-center gap-1"
                    style={{ color: count > 0 ? theme.text : theme.textSecondary }}
                  >
                    <Layers className="h-3.5 w-3.5" style={{ color }} />
                    {countsLoading ? '…' : `${count} en zona`}
                  </span>
                  <button
                    onClick={() => onConsolidar(poi)}
                    disabled={isConsolidating || count === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: count > 0 ? theme.primary : `${theme.textSecondary}15`,
                      color: count > 0 ? '#fff' : theme.textSecondary,
                    }}
                    title={
                      count > 0
                        ? 'Crear o actualizar una OT con los reclamos de esta zona'
                        : 'No hay reclamos activos en esta zona'
                    }
                  >
                    {isConsolidating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Consolidar en OT
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
