/**
 * Tipos de punto de interés = otra instancia del ABM de catálogo del kit.
 *
 * [2026-08-03] Eran 287 líneas que repetían, con otro nombre, lo mismo que
 * Categorías: cargar, buscar, grilla de tarjetas, drawer con grid de iconos y
 * grid de colores, borrar con confirmación. Todo eso vive en
 * `CategoriaConfigBase`; acá quedan sólo las dos cosas propias del catálogo:
 * su API y el radio por defecto.
 *
 * El radio es lo único que este catálogo agrega: cuando el vecino manda un
 * reclamo cerca de un punto (una plaza, una escuela), el sistema lo asocia si
 * cae dentro de ese radio.
 */
import { MapPin } from 'lucide-react';
import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import type { CategoriaItem } from '../components/config/CategoriaConfigBase';
import { MetricCell } from '../components/abmv2/Controls';
import { poiApi } from '../lib/api';
import type { PoiTipo } from '../types';

// Coinciden con PuntoInteres del backend.
const RADIO_DEFAULT = 2000;
const RADIO_MIN = 100;
const RADIO_MAX = 10000;
const RADIO_STEP = 100;

/** Metros → texto corto. "2000 m" no se lee de un vistazo; "2 km" sí. */
function formatearRadio(metros?: number | null): string {
  if (!metros) return '—';
  return metros >= 1000 ? `${(metros / 1000).toString().replace('.', ',')} km` : `${metros} m`;
}

/** El listado devuelve `null` donde el catálogo genérico espera `undefined`.
 *  Se normaliza acá, en el borde, y no dentro del componente compartido. */
function aItem(t: PoiTipo): CategoriaItem {
  return {
    id: t.id,
    nombre: t.nombre,
    icono: t.icono ?? undefined,
    color: t.color ?? undefined,
    orden: t.orden,
    activo: t.activo,
  };
}

export default function POITiposConfig() {
  return (
    <CategoriaConfigBase
      eyebrow="Atención al vecino · Catálogo"
      title="Tipos de punto de interés"
      descripcion="Plazas, escuelas y paradas: dónde se ponen los carteles con QR."
      entidad="tipo"
      regla="El tipo con puntos cargados no se borra: primero hay que reasignar esos puntos."
      pista={{
        titulo: 'El radio decide qué reclamo se asocia al punto',
        texto:
          'Cuando el vecino carga un reclamo cerca de un punto de interés, el sistema lo asocia solo si cae dentro del radio de ese tipo. Un radio grande junta reclamos de otra cuadra; uno chico deja el punto sin usar.',
      }}
      api={{
        getAll: async () => {
          const res = await poiApi.listTipos();
          return { data: ((res.data || []) as PoiTipo[]).map(aItem) };
        },
        create: async (data) => {
          const res = await poiApi.createTipo(data);
          return { data: aItem(res.data as PoiTipo) };
        },
        update: async (id, data) => {
          const res = await poiApi.updateTipo(id, data);
          return { data: aItem(res.data as PoiTipo) };
        },
        delete: (id) => poiApi.deleteTipo(id),
      }}
      extras={{
        inicial: (item) => ({
          radio_default_metros:
            (item as unknown as PoiTipo | null)?.radio_default_metros ?? RADIO_DEFAULT,
        }),
        columnas: [
          {
            id: 'radio',
            header: 'Alcance',
            width: 'minmax(110px, 0.8fr)',
            align: 'right',
            cell: (r) => (
              <MetricCell
                value={formatearRadio((r as unknown as PoiTipo).radio_default_metros)}
                note="a la redonda"
              />
            ),
          },
        ],
        metrica: (r) => ({
          value: formatearRadio((r as unknown as PoiTipo).radio_default_metros),
          note: 'a la redonda',
        }),
        campos: (valores, set) => (
          <div>
            <label className="av2-campo-label">Radio por defecto</label>
            <div className="av2-campo-fila">
              <input
                type="number"
                min={RADIO_MIN}
                max={RADIO_MAX}
                step={RADIO_STEP}
                value={Number(valores.radio_default_metros ?? RADIO_DEFAULT)}
                onChange={(e) =>
                  set(
                    'radio_default_metros',
                    Math.min(RADIO_MAX, Math.max(RADIO_MIN, Number(e.target.value) || RADIO_MIN)),
                  )
                }
                className="av2-campo-num"
              />
              <span className="av2-campo-nota">
                <MapPin size={13} strokeWidth={2} aria-hidden />
                metros — un reclamo que caiga adentro se asocia solo al punto (
                {formatearRadio(Number(valores.radio_default_metros ?? RADIO_DEFAULT))})
              </span>
            </div>
          </div>
        ),
      }}
    />
  );
}
