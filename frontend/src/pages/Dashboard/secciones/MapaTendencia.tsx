/**
 * MapaTendencia — la fila grande de la pantalla: "Dónde se repiten los
 * reclamos" (FocosRotativos + filtro de categorías) y `TendenciaMeses`,
 * mitad y mitad. Sale del monolito `pages/Dashboard.tsx` :1067-1112, sin
 * tocar markup ni clases.
 *
 * Las dos piezas van FUERA de cualquier loader de la página: cada una ya
 * resuelve su propia espera —FocosRotativos recibe `loading`, y
 * TendenciaMeses no dibuja nada mientras no haya un solo día con movimiento
 * (con un mes de historia cambia de escala y muestra la ventana de días)—.
 * Mezclarlas en un ternario ajeno fue lo que dejó la tendencia colgada del
 * esqueleto de carga, visible sólo mientras cargaba.
 *
 * El filtro de categorías es estado LOCAL de esta sección: nadie más lo mira.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { AdaptiveFilter, type AdaptiveControl } from '../../../components/ui/AdaptiveFilter';
import { FocosRotativos, type Foco } from '../../../components/dashboard/FocosRotativos';
import { TendenciaMeses } from '../../../components/dashboard/TendenciaMeses';
import type { SeccionProps } from '../tipos';

export function MapaTendencia({ datos }: SeccionProps) {
  const navigate = useNavigate();
  const { porCategoria, recurrentes, heatmap, tendencias, cargandoHeatmap } = datos.reclamos;

  // Multi-selección: [] = todas las categorías (default del control 'multi').
  const [catsConcentracion, setCatsConcentracion] = useState<string[]>([]);

  // ---- Concentración: filtro de categorías DINÁMICO por municipio ----
  // Control 'multi' definitivo: van TODAS las categorías del muni con su
  // count; el control muestra las 3 más importantes como píldoras fijas y el
  // resto se elige desde el panel "+N más". En un muni pesa la basura y en
  // otro el alumbrado; se arma solo, sin lista fija en el código.
  const controlesConcentracion = useMemo<AdaptiveControl[]>(
    () => [
      {
        tipo: 'multi',
        id: 'concentracion-categoria',
        placeholder: 'Categorías',
        opciones: porCategoria.map((c) => ({
          value: c.categoria,
          label: c.categoria,
          count: c.cantidad,
        })),
        values: catsConcentracion,
        onChange: setCatsConcentracion,
      },
    ],
    [porCategoria, catsConcentracion],
  );

  // El heatmap trae la categoría en cada punto, así que el filtro es local:
  // no hace falta ir de nuevo al backend para cambiar de categoría.
  const heatmapFiltrado = useMemo(
    () =>
      catsConcentracion.length
        ? heatmap.filter((p) => catsConcentracion.includes(p.categoria))
        : heatmap,
    [heatmap, catsConcentracion],
  );

  // Los focos que el mapa RECORRE. Cuatro, como las categorías de la botonera:
  // el listado largo hacía crecer la tarjeta y rompía la simetría de la fila.
  const focosConcentracion = useMemo<Foco[]>(() => {
    const filtrando = catsConcentracion.length > 0;
    const base = filtrando
      ? recurrentes.filter((r) => r.categorias?.some((c) => catsConcentracion.includes(c)))
      : recurrentes;
    return base.slice(0, 4).map((r) => ({
      direccion: r.direccion,
      zona: r.zona,
      cantidad: r.cantidad,
      lat: r.lat,
      lng: r.lng,
      // Con "todas" se aclara qué categoría pesa en esa esquina; filtrando
      // por categorías elegidas sería repetir lo mismo.
      categoriaTop: filtrando ? null : r.categoria_top,
      categoriaTopCantidad: filtrando ? undefined : r.categoria_top_cantidad,
      diasMasViejo: r.dias_mas_viejo,
    }));
  }, [recurrentes, catsConcentracion]);

  return (
    <div className="dv2-grid-2 dv2-grid-2--mapa">
      <div className="dv2-card">
        <div className="dv2-card-head dv2-card-head--icono">
          <MapPin className="dv2-card-head-icono" aria-hidden="true" />
          <h3 className="dv2-card-titulo">Dónde se repiten los reclamos</h3>
          <span className="dv2-card-caption">90 días</span>
          {/* Antes acá iba el conteo de puntos: nadie sabe qué es un
              "punto" del mapa ni qué hacer con el número. En su lugar, lo
              que se está mirando, dicho en castellano. */}
          <span className="dv2-card-caption dv2-card-caption--auto">
            {catsConcentracion.length === 0
              ? 'Todas las categorías'
              : catsConcentracion.length === 1
                ? catsConcentracion[0]
                : `${catsConcentracion.length} categorías`}
          </span>
        </div>
        {/* Control 'multi' definitivo: las 3 categorías de más volumen del
            muni como píldoras fijas con su count, el resto se elige en el
            panel "+N más". Multi-selección; [] = todas. */}
        {porCategoria.length > 0 && (
          <AdaptiveFilter controles={controlesConcentracion} />
        )}
        {/* El mapa RECORRE los focos como un reproductor: se centra en cada
            esquina y cuenta qué pasa ahí. Antes iba un listado debajo, que
            crecía con los datos y rompía la simetría de la fila. Así el
            alto es fijo y además la pantalla se lee sola en una demo. */}
        <FocosRotativos
          focos={focosConcentracion}
          puntos={heatmapFiltrado}
          loading={cargandoHeatmap}
          altura="clamp(300px, 34vh, 430px)"
          onVerFoco={(f) => navigate(`/gestion/mapa?direccion=${encodeURIComponent(f.direccion)}`)}
        />
      </div>

      <TendenciaMeses datos={tendencias} />
    </div>
  );
}
