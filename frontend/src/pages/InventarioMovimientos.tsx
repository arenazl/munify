/**
 * Movimientos de inventario — el libro del depósito.
 *
 * Esto SÍ es operación: qué entró, qué salió, qué se ajustó y qué se llevó
 * cada orden de trabajo. Antes no existía: el stock sólo se movía como efecto
 * colateral de completar una OT y no había forma de contestar "quién sacó las
 * diez bolsas de cemento" (dueño, 2026-08-31).
 *
 * El inventario (la lista de artículos) es un CATÁLOGO y vive en su pantalla;
 * acá está lo que se mueve todos los días.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Scale, Wrench, Undo2, Package,
} from 'lucide-react';
import { toast } from 'sonner';

import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import type { ColumnSpec, ChipTone } from '../components/abmv2/types';
import { seg } from '../lib/semanticHero';
import { inventarioApi } from '../lib/api';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { formatFechaAR } from '../lib/tesoreria-helpers';
import {
  movimientoLabels, movimientoSuman, movimientoRestan, signoMovimiento,
} from '../lib/enums/inventario';
import { useTheme } from '../contexts/ThemeContext';

interface Movimiento {
  id: number;
  item_id: number;
  item_nombre?: string | null;
  tipo: string;
  cantidad: number;
  stock_resultante?: number | null;
  deposito_id?: number | null;
  deposito_nombre?: string | null;
  contraparte?: string | null;
  motivo?: string | null;
  orden_trabajo_id?: number | null;
  orden_compra_id?: number | null;
  usuario_nombre?: string | null;
  fecha?: string | null;
}

interface ItemMini { id: number; nombre: string; naturaleza: string; unidad?: string | null; stock_actual?: number | null }
interface DepositoMini { id: number; nombre: string }

/* Los rótulos, colores y signos salen de `lib/enums/inventario` — los comparte
   con el historial de la ficha del artículo (regla 2: un solo lugar). */
const TIPO_ICON: Record<string, typeof Package> = {
  entrada: ArrowDownToLine,
  salida: ArrowUpFromLine,
  ajuste: Scale,
  consumo_ot: Wrench,
  reserva_ot: Wrench,
  devolucion_ot: Undo2,
};
/* El tono dice de un vistazo si el stock subió, bajó o se corrigió. Los
   valores son los del kit (ChipTone), no colores propios. */
const TIPO_TONO: Record<string, ChipTone> = {
  entrada: 'green',
  devolucion_ot: 'green',
  salida: 'amber',
  consumo_ot: 'amber',
  reserva_ot: 'blue',
  ajuste: 'red',
};
const SUMAN = movimientoSuman;
const RESTAN = movimientoRestan;

// Sólo estos tres se cargan a mano: los de OT los escribe el cierre de la orden.
const TIPOS_MANUALES = ['entrada', 'salida', 'ajuste'] as const;

export default function InventarioMovimientos() {
  const { theme } = useTheme();
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [items, setItems] = useState<ItemMini[]>([]);
  const [depositos, setDepositos] = useState<DepositoMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos');
  const [fDeposito, setFDeposito] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState<{ item_id: string; tipo: string; cantidad: string; deposito_id: string; contraparte: string; motivo: string }>(
    { item_id: '', tipo: 'entrada', cantidad: '', deposito_id: '', contraparte: '', motivo: '' },
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rm, ri, rd] = await Promise.all([
        inventarioApi.listMovimientos({ limit: 500 }),
        inventarioApi.listItems({ limit: 500 }),
        inventarioApi.listDepositos({ activo: true }),
      ]);
      setMovs(Array.isArray(rm.data) ? rm.data : []);
      const its: ItemMini[] = Array.isArray(ri.data) ? ri.data : (ri.data?.items ?? []);
      setItems(its);
      setDepositos(Array.isArray(rd.data) ? rd.data : []);
    } catch {
      toast.error('No se pudo cargar el libro del depósito');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const consumibles = useMemo(() => items.filter((i) => i.naturaleza === 'consumible'), [items]);
  const itemPorId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const visibles = useMemo(() => {
    const t = search.trim().toLowerCase();
    return movs.filter((m) => {
      if (tab === 'manuales' && !TIPOS_MANUALES.includes(m.tipo as never)) return false;
      if (tab === 'ot' && !m.tipo.endsWith('_ot')) return false;
      if (tab === 'entradas' && !SUMAN.has(m.tipo)) return false;
      if (tab === 'salidas' && !RESTAN.has(m.tipo)) return false;
      if (fDeposito && String(m.deposito_id ?? '') !== fDeposito) return false;
      if (!t) return true;
      return `${m.item_nombre ?? ''} ${m.motivo ?? ''} ${m.contraparte ?? ''} ${m.usuario_nombre ?? ''}`
        .toLowerCase().includes(t);
    });
  }, [movs, search, tab, fDeposito]);

  const entradas = useMemo(() => movs.filter((m) => SUMAN.has(m.tipo)).length, [movs]);
  const salidas = useMemo(() => movs.filter((m) => RESTAN.has(m.tipo)).length, [movs]);
  const ajustes = useMemo(() => movs.filter((m) => m.tipo === 'ajuste').length, [movs]);
  const porOT = useMemo(() => movs.filter((m) => m.tipo.endsWith('_ot')).length, [movs]);

  const heroFrases = useMemo(() => {
    if (!movs.length) {
      return [{ segmentos: [
        seg('El libro está vacío:'),
        seg('todavía no se registró ningún movimiento de stock.', 'advertencia'),
      ] }];
    }
    const ultima = movs[0]?.fecha ? formatFechaAR(movs[0].fecha) : null;
    return [{ segmentos: [
      seg(`${movs.length} ${movs.length === 1 ? 'movimiento registrado' : 'movimientos registrados'}`, 'bueno'),
      seg(ultima ? `— el último, el ${ultima}.` : '.'),
    ] }];
  }, [movs]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Entradas', valor: String(entradas) },
    { etiqueta: 'Salidas', valor: String(salidas) },
    { etiqueta: 'Ajustes', valor: String(ajustes) },
    { etiqueta: 'Por órdenes', valor: String(porOT) },
    { etiqueta: 'Depósitos', valor: String(depositos.length) },
  ]), [entradas, salidas, ajustes, porOT, depositos.length]);

  const columnas = useMemo<ColumnSpec<Movimiento>[]>(() => [
    {
      id: 'item',
      header: 'Artículo',
      width: 'minmax(200px, 2fr)',
      kind: 'entity',
      cell: (m) => (
        <EntityCell
          icon={TIPO_ICON[m.tipo] ?? Package}
          title={m.item_nombre || 'Artículo dado de baja'}
          subtitle={m.motivo || undefined}
        />
      ),
    },
    {
      id: 'tipo',
      header: 'Qué pasó',
      width: 'minmax(130px, 0.9fr)',
      kind: 'chip',
      cell: (m) => (
        <ChipEstado label={movimientoLabels[m.tipo] ?? m.tipo} tone={TIPO_TONO[m.tipo] ?? 'gray'} />
      ),
    },
    {
      id: 'cantidad',
      header: 'Cantidad',
      width: 'minmax(100px, 0.7fr)',
      kind: 'text',
      align: 'right',
      cell: (m) => {
        const u = itemPorId.get(m.item_id)?.unidad ?? '';
        // El signo lo da el tipo: sumar y restar tienen que distinguirse de un
        // vistazo, y el ajuste no tiene signo (fija un valor, no lo mueve).
        return `${signoMovimiento(m.tipo)}${m.cantidad} ${u}`.trim();
      },
    },
    {
      id: 'saldo',
      header: 'Quedó',
      width: 'minmax(90px, 0.6fr)',
      kind: 'text',
      align: 'right',
      cell: (m) => (m.stock_resultante == null ? '—' : String(m.stock_resultante)),
    },
    {
      id: 'deposito',
      header: 'Depósito',
      width: 'minmax(120px, 0.9fr)',
      kind: 'text',
      cell: (m) => m.deposito_nombre || '—',
    },
    {
      id: 'quien',
      header: 'Quién / de dónde',
      width: 'minmax(140px, 1fr)',
      kind: 'text',
      cell: (m) => m.contraparte || m.usuario_nombre || (m.orden_trabajo_id ? `Orden #${m.orden_trabajo_id}` : '—'),
    },
    {
      id: 'fecha',
      header: 'Cuándo',
      width: 'minmax(100px, 0.7fr)',
      kind: 'text',
      cell: (m) => (m.fecha ? formatFechaAR(m.fecha) : '—'),
    },
  ], [itemPorId]);

  const abrirNuevo = () => {
    setForm({
      item_id: '', tipo: 'entrada', cantidad: '',
      deposito_id: depositos[0] ? String(depositos[0].id) : '',
      contraparte: '', motivo: '',
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.item_id) { toast.error('Elegí el artículo'); return; }
    if (form.cantidad === '' || Number(form.cantidad) < 0) { toast.error('Poné una cantidad válida'); return; }
    setGuardando(true);
    try {
      await inventarioApi.createMovimiento({
        item_id: Number(form.item_id),
        tipo: form.tipo,
        cantidad: Number(form.cantidad),
        deposito_id: form.deposito_id ? Number(form.deposito_id) : null,
        contraparte: form.contraparte || null,
        motivo: form.motivo || null,
      });
      toast.success(form.tipo === 'ajuste' ? 'Stock corregido' : 'Movimiento registrado');
      setSheetOpen(false);
      await cargar();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'No se pudo registrar el movimiento');
    } finally {
      setGuardando(false);
    }
  };

  const itemElegido = form.item_id ? itemPorId.get(Number(form.item_id)) : undefined;

  return (
    <>
      <SemanticAbmPage<Movimiento>
        moduleKey="inventario"
        eyebrow="Inventario"
        title="Movimientos"
        description="Qué entró, qué salió y qué se llevó cada orden de trabajo."
        hero={{ etiqueta: 'INVENTARIO', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'El ajuste no mueve el stock: lo fija',
          texto:
            'Entrada y salida suman y restan. El ajuste es un conteo físico: se pone el número que hay de verdad y el sistema calcula la diferencia. Es la forma de corregir una rotura, un robo o un error de carga sin inventar una entrada que nunca ocurrió.',
        }}
        searchPlaceholder="Buscar por artículo, motivo o persona…"
        views={['table']}
        activeView="table"
        onViewChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Registrar movimiento', onClick: abrirNuevo }}
        selects={[
          {
            id: 'deposito',
            label: 'Depósito',
            value: fDeposito,
            onChange: setFDeposito,
            options: [
              { value: '', label: 'Todos los depósitos' },
              ...depositos.map((d) => ({ value: String(d.id), label: d.nombre })),
            ],
          },
        ]}
        statusTabs={[
          { id: 'todos', label: 'Todo', count: movs.length },
          { id: 'entradas', label: 'Entró', count: entradas },
          { id: 'salidas', label: 'Salió', count: salidas },
          { id: 'manuales', label: 'Cargados a mano', count: movs.filter((m) => TIPOS_MANUALES.includes(m.tipo as never)).length },
          { id: 'ot', label: 'Por órdenes', count: porOT },
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(m) => String(m.id)}
        /* El libro no se edita: un movimiento registrado es un hecho. Para
           corregir, se carga un ajuste — eso deja rastro, editar lo borra. */
        rowActions={[]}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Nada coincide con "${search.trim()}".`
            : movs.length
              ? 'No hay movimientos con ese filtro.'
              : 'Todavía no se registró ningún movimiento. Cargá una entrada cuando llegue mercadería, o un ajuste después de un conteo.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${movs.length}`,
          note: 'Los movimientos por orden de trabajo los escribe el sistema al completar la orden: no se cargan a mano.',
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Registrar movimiento"
        stickyFooter={
          <button
            onClick={guardar}
            disabled={guardando}
            className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: theme.primary }}
          >
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        }
      >
        <div className="space-y-4">
          <ModernSelect
            label="Artículo"
            value={form.item_id}
            onChange={(v) => setForm((f) => ({ ...f, item_id: String(v) }))}
            options={consumibles.map((i) => ({
              value: String(i.id),
              label: `${i.nombre}${i.stock_actual != null ? ` — hay ${i.stock_actual} ${i.unidad ?? ''}`.trimEnd() : ''}`,
            }))}
            placeholder="Elegí el artículo"
          />
          {/* Los activos no tienen stock: se toman y se liberan desde la OT.
              Por eso el selector sólo ofrece consumibles. */}
          <ModernSelect
            label="Qué pasó"
            value={form.tipo}
            onChange={(v) => setForm((f) => ({ ...f, tipo: String(v) }))}
            options={TIPOS_MANUALES.map((t) => ({ value: t, label: movimientoLabels[t] }))}
          />
          <div>
            <label className="block text-sm font-medium mb-1">
              {form.tipo === 'ajuste' ? 'Cuánto hay de verdad' : 'Cantidad'}
              {itemElegido?.unidad ? ` (${itemElegido.unidad})` : ''}
            </label>
            <input
              type="number"
              min={0}
              step="any"
              className="w-full rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--pl-border)', background: 'var(--pl-surface)', color: 'var(--pl-ink)' }}
              value={form.cantidad}
              onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
              placeholder={form.tipo === 'ajuste' ? 'El número del conteo' : '0'}
            />
            {form.tipo === 'ajuste' && itemElegido?.stock_actual != null && (
              <p className="text-xs mt-1" style={{ color: 'var(--pl-ink-3)' }}>
                El sistema dice que hay {itemElegido.stock_actual} {itemElegido.unidad ?? ''}. Poné lo que contaste.
              </p>
            )}
          </div>
          <ModernSelect
            label="Depósito"
            value={form.deposito_id}
            onChange={(v) => setForm((f) => ({ ...f, deposito_id: String(v) }))}
            options={[
              { value: '', label: 'Sin especificar' },
              ...depositos.map((d) => ({ value: String(d.id), label: d.nombre })),
            ]}
          />
          <div>
            <label className="block text-sm font-medium mb-1">
              {form.tipo === 'entrada' ? 'Proveedor' : form.tipo === 'salida' ? 'A quién se le entregó' : 'Quién contó'}
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--pl-border)', background: 'var(--pl-surface)', color: 'var(--pl-ink)' }}
              value={form.contraparte}
              onChange={(e) => setForm((f) => ({ ...f, contraparte: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Motivo</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--pl-border)', background: 'var(--pl-surface)', color: 'var(--pl-ink)' }}
              value={form.motivo}
              onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              placeholder={form.tipo === 'ajuste' ? 'Rotura, robo, error de carga…' : 'Por qué se mueve'}
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}
