/**
 * Categorías de inventario = otra instancia del ABM de catálogo del kit.
 *
 * [2026-08-03] Eran 348 líneas que repetían el mismo ABM que Categorías de
 * reclamo con otro nombre. Lo propio de este catálogo es UNA cosa —la
 * naturaleza— y es la que decide todo el comportamiento del módulo de campo:
 * un ACTIVO se toma y se devuelve (una motoniveladora), un CONSUMIBLE se
 * descuenta del stock (cemento). Por eso es lo primero que se elige.
 */
import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import type { CategoriaItem } from '../components/config/CategoriaConfigBase';
import { ChipEstado } from '../components/abmv2/DataTable';
import { MetricCell, SegmentedControl } from '../components/abmv2/Controls';
import { inventarioApi } from '../lib/api';
import { naturalezaLabels, naturalezaDescripcion } from '../lib/enums/inventario';
import type { InventarioCategoria, NaturalezaInventario } from '../types';

/** El genérico habla de `CategoriaItem`; las columnas propias necesitan la
 *  fila cruda que el adaptador guardó en `__raw`. */
function crudo(item: CategoriaItem | null): InventarioCategoria | undefined {
  return (item as unknown as { __raw?: InventarioCategoria } | null)?.__raw;
}

/** El listado devuelve `null` donde el catálogo genérico espera `undefined`.
 *  Se normaliza en el borde, no dentro del componente compartido. */
function aItem(c: InventarioCategoria): CategoriaItem {
  return {
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion ?? undefined,
    icono: c.icono ?? undefined,
    color: c.color ?? undefined,
    orden: c.orden,
    activo: c.activo,
  };
}

const NATURALEZAS: NaturalezaInventario[] = ['activo', 'consumible'];

export default function InventarioCategoriasConfig() {
  return (
    <CategoriaConfigBase
      title="Categorías de inventario"
      entidad="categoría"
      api={{
        getAll: async () => {
          const res = await inventarioApi.listCategorias();
          const filas = (res.data || []) as InventarioCategoria[];
          // Se conserva el crudo para las columnas propias (naturaleza, ítems).
          return { data: filas.map((c) => ({ ...aItem(c), __raw: c }) as CategoriaItem) };
        },
        create: async (data) => {
          const res = await inventarioApi.createCategoria(data);
          return { data: aItem(res.data as InventarioCategoria) };
        },
        update: async (id, data) => {
          const res = await inventarioApi.updateCategoria(id, data);
          return { data: aItem(res.data as InventarioCategoria) };
        },
        delete: (id) => inventarioApi.deleteCategoria(id),
      }}
      extras={{
        inicial: (item) => ({ naturaleza: crudo(item)?.naturaleza ?? 'consumible' }),
        columnas: [
          {
            id: 'naturaleza',
            header: 'Qué es',
            width: 'minmax(120px, 0.9fr)',
            kind: 'chip',
            cell: (r) => {
              const nat = crudo(r)?.naturaleza ?? 'consumible';
              return (
                <ChipEstado
                  label={naturalezaLabels[nat] ?? nat}
                  tone={nat === 'activo' ? 'blue' : 'amber'}
                />
              );
            },
          },
          {
            id: 'items',
            header: 'Cargados',
            width: 'minmax(90px, 0.6fr)',
            align: 'right',
            kind: 'metric',
            cell: (r) => {
              const n = crudo(r)?.items_count ?? 0;
              // El cero se apaga: que una categoría no tenga ítems todavía no
              // es una alerta, es un dato menor.
              return (
                <MetricCell value={String(n)} note={n === 1 ? 'ítem' : 'ítems'} muted={n === 0} />
              );
            },
          },
        ],
        metrica: (r) => {
          const n = crudo(r)?.items_count ?? 0;
          return { value: String(n), note: n === 1 ? 'ítem' : 'ítems', muted: n === 0 };
        },
        campos: (valores, set) => {
          const nat = (valores.naturaleza as NaturalezaInventario) ?? 'consumible';
          return (
            <div>
              <label className="av2-campo-label">Qué es</label>
              <SegmentedControl
                fullWidth
                ariaLabel="Naturaleza de la categoría"
                value={nat}
                onChange={(v) => set('naturaleza', v)}
                options={NATURALEZAS.map((n) => ({ id: n, label: naturalezaLabels[n] ?? n }))}
              />
              <p className="av2-campo-nota-larga">{naturalezaDescripcion[nat]}</p>
            </div>
          );
        },
      }}
    />
  );
}
