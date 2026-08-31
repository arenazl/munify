/**
 * Depósitos = otra instancia del ABM de catálogo del kit.
 *
 * Dónde está guardada cada cosa: depósito central, corralón, vivero. Hasta el
 * 2026-08-31 el inventario no sabía ubicación —la pantalla de Configuración la
 * prometía sin que existiera la columna— y no se podía contestar dónde está
 * una motoniveladora sin llamar a alguien.
 *
 * Todo municipio arranca con los tres del template (van en la semilla, como
 * las categorías) y de ahí los edita.
 */
import { CategoriaConfigBase } from '../components/config/CategoriaConfigBase';
import type { CategoriaItem } from '../components/config/CategoriaConfigBase';
import { MetricCell } from '../components/abmv2/Controls';
import { inventarioApi } from '../lib/api';

interface Deposito {
  id: number;
  nombre: string;
  descripcion?: string | null;
  direccion?: string | null;
  responsable?: string | null;
  activo: boolean;
  orden: number;
  items_count?: number;
}

function crudo(item: CategoriaItem | null): Deposito | undefined {
  return (item as unknown as { __raw?: Deposito } | null)?.__raw;
}

/** El listado devuelve `null` donde el catálogo genérico espera `undefined`.
 *  Se normaliza en el borde, no dentro del componente compartido. */
function aItem(d: Deposito): CategoriaItem {
  return {
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion ?? d.direccion ?? undefined,
    icono: 'Warehouse',
    color: '#b45309',
    orden: d.orden,
    activo: d.activo,
  };
}

export default function InventarioDepositosConfig() {
  return (
    <CategoriaConfigBase
      eyebrow="Inventario · Catálogo"
      title="Depósitos"
      descripcion="Dónde está guardada cada cosa: el central, el corralón, el vivero."
      entidad="depósito"
      regla="El depósito con artículos adentro no se da de baja: primero hay que moverlos a otro, si no quedan sin ubicación y el historial apunta a la nada."
      api={{
        getAll: async () => {
          const res = await inventarioApi.listDepositos();
          const filas = (res.data || []) as Deposito[];
          return { data: filas.map((d) => ({ ...aItem(d), __raw: d }) as CategoriaItem) };
        },
        create: async (data) => {
          const res = await inventarioApi.createDeposito(data);
          return { data: aItem(res.data as Deposito) };
        },
        update: async (id, data) => {
          const res = await inventarioApi.updateDeposito(id, data);
          return { data: aItem(res.data as Deposito) };
        },
        delete: (id) => inventarioApi.deleteDeposito(id),
      }}
      extras={{
        inicial: (item) => ({
          direccion: crudo(item)?.direccion ?? '',
          responsable: crudo(item)?.responsable ?? '',
        }),
        columnas: [
          {
            id: 'donde',
            header: 'Dónde queda',
            width: 'minmax(160px, 1.2fr)',
            kind: 'text',
            cell: (r) => crudo(r)?.direccion || '—',
          },
          {
            id: 'responsable',
            header: 'A cargo',
            width: 'minmax(120px, 0.9fr)',
            kind: 'text',
            cell: (r) => crudo(r)?.responsable || '—',
          },
          {
            id: 'items',
            header: 'Guardados',
            width: 'minmax(90px, 0.6fr)',
            align: 'right',
            kind: 'metric',
            cell: (r) => {
              const n = crudo(r)?.items_count ?? 0;
              // El cero se apaga: un depósito recién creado no es una alerta.
              return (
                <MetricCell value={String(n)} note={n === 1 ? 'artículo' : 'artículos'} muted={n === 0} />
              );
            },
          },
        ],
        metrica: (r) => {
          const n = crudo(r)?.items_count ?? 0;
          return { value: String(n), note: n === 1 ? 'artículo' : 'artículos', muted: n === 0 };
        },
        campos: (valores, set) => (
          <>
            <div>
              <label className="av2-campo-label">Dónde queda</label>
              <input
                className="av2-campo-input"
                value={String(valores.direccion ?? '')}
                onChange={(e) => set('direccion', e.target.value)}
                placeholder="Av. San Martín 1200"
              />
            </div>
            <div>
              <label className="av2-campo-label">Quién lo tiene a cargo</label>
              <input
                className="av2-campo-input"
                value={String(valores.responsable ?? '')}
                onChange={(e) => set('responsable', e.target.value)}
                placeholder="Nombre del encargado"
              />
            </div>
          </>
        ),
      }}
    />
  );
}
