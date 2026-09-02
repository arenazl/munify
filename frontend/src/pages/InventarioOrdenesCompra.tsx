/**
 * Órdenes de compra — la reposición del depósito.
 *
 * Deliberadamente corta para un municipio chico: se arma, se manda al
 * proveedor y se recibe (entera o en partes). **Recibir es lo que hace entrar
 * el stock**: cada recepción escribe los movimientos de ENTRADA, así que esto
 * no es una contabilidad paralela, es la puerta por la que entra la
 * mercadería.
 *
 * Cancelar NO revierte lo ya recibido: entró de verdad, y deshacerlo por acá
 * dejaría el stock mintiendo. Para sacarlo, un ajuste.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Truck, Plus, Trash2, PackageCheck, Ban } from 'lucide-react';
import { toast } from 'sonner';

import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import type { ColumnSpec, ChipTone } from '../components/abmv2/types';
import { seg } from '../lib/semanticHero';
import { inventarioApi } from '../lib/api';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { useTheme } from '../contexts/ThemeContext';
import { formatFechaAR } from '../lib/tesoreria-helpers';

interface Linea {
  id: number;
  item_id: number;
  item_nombre?: string | null;
  cantidad: number;
  cantidad_recibida: number;
  pendiente: number;
  precio_unitario?: number | null;
}

interface OrdenCompra {
  id: number;
  numero: string;
  proveedor?: string | null;
  estado: string;
  deposito_id?: number | null;
  deposito_nombre?: string | null;
  fecha?: string | null;
  fecha_esperada?: string | null;
  total_estimado?: number | null;
  notas?: string | null;
  lineas: Linea[];
}

interface ItemMini { id: number; nombre: string; naturaleza: string; unidad?: string | null }

/* Los estados, en un solo lugar y con fallback (regla 3). */
const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida_parcial: 'Llegó a medias',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
};
const ESTADO_TONO: Record<string, ChipTone> = {
  borrador: 'gray',
  enviada: 'blue',
  recibida_parcial: 'amber',
  recibida: 'green',
  cancelada: 'red',
};

type LineaForm = { item_id: string; cantidad: string; precio_unitario: string };

export default function InventarioOrdenesCompra() {
  const { theme } = useTheme();
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [items, setItems] = useState<ItemMini[]>([]);
  const [depositos, setDepositos] = useState<{ id: number; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editando, setEditando] = useState<OrdenCompra | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aRecibir, setARecibir] = useState<OrdenCompra | null>(null);
  const [aCancelar, setACancelar] = useState<OrdenCompra | null>(null);
  const [form, setForm] = useState<{ proveedor: string; deposito_id: string; fecha_esperada: string; notas: string; lineas: LineaForm[] }>(
    { proveedor: '', deposito_id: '', fecha_esperada: '', notas: '', lineas: [] },
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [ro, ri, rd] = await Promise.all([
        inventarioApi.listOrdenesCompra(),
        inventarioApi.listItems({ limit: 500 }),
        inventarioApi.listDepositos({ activo: true }),
      ]);
      setOrdenes(Array.isArray(ro.data) ? ro.data : []);
      const its: ItemMini[] = Array.isArray(ri.data) ? ri.data : (ri.data?.items ?? []);
      setItems(its);
      setDepositos(Array.isArray(rd.data) ? rd.data : []);
    } catch {
      toast.error('No se pudieron cargar las órdenes de compra');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Sólo consumibles: un activo no se repone por cantidad, se compra de a uno
  // y se da de alta como artículo.
  const consumibles = useMemo(() => items.filter((i) => i.naturaleza === 'consumible'), [items]);

  const visibles = useMemo(() => {
    const t = search.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (tab === 'esperando' && !['borrador', 'enviada', 'recibida_parcial'].includes(o.estado)) return false;
      if (tab === 'recibidas' && o.estado !== 'recibida') return false;
      if (tab === 'canceladas' && o.estado !== 'cancelada') return false;
      if (!t) return true;
      return `${o.numero} ${o.proveedor ?? ''} ${o.lineas.map((l) => l.item_nombre).join(' ')}`
        .toLowerCase().includes(t);
    });
  }, [ordenes, search, tab]);

  const esperando = useMemo(
    () => ordenes.filter((o) => ['borrador', 'enviada', 'recibida_parcial'].includes(o.estado)).length,
    [ordenes],
  );
  const recibidas = useMemo(() => ordenes.filter((o) => o.estado === 'recibida').length, [ordenes]);
  const canceladas = useMemo(() => ordenes.filter((o) => o.estado === 'cancelada').length, [ordenes]);
  const atrasadas = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return ordenes.filter(
      (o) => ['enviada', 'recibida_parcial'].includes(o.estado) && o.fecha_esperada && o.fecha_esperada < hoy,
    ).length;
  }, [ordenes]);

  const heroFrases = useMemo(() => {
    if (!ordenes.length) {
      return [{ segmentos: [
        seg('Todavía no hay ninguna orden de compra:'),
        seg('la reposición del depósito no está quedando registrada.', 'advertencia'),
      ] }];
    }
    if (atrasadas > 0) {
      return [{ segmentos: [
        seg(`${atrasadas} ${atrasadas === 1 ? 'orden pasó' : 'órdenes pasaron'} su fecha de entrega`, 'malo'),
        seg('— conviene llamar al proveedor.'),
      ] }];
    }
    if (esperando > 0) {
      return [{ segmentos: [
        seg(`${esperando} ${esperando === 1 ? 'orden esperando' : 'órdenes esperando'} mercadería`, 'advertencia'),
        seg('— al recibirlas entra el stock sola.'),
      ] }];
    }
    return [{ segmentos: [
      seg('Todo lo pedido ya llegó', 'bueno'),
      seg('y entró al depósito.'),
    ] }];
  }, [ordenes.length, esperando, atrasadas]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Esperando', valor: String(esperando) },
    { etiqueta: 'Atrasadas', valor: String(atrasadas) },
    { etiqueta: 'Recibidas', valor: String(recibidas) },
    { etiqueta: 'Canceladas', valor: String(canceladas) },
    { etiqueta: 'Total', valor: String(ordenes.length) },
  ]), [esperando, atrasadas, recibidas, canceladas, ordenes.length]);

  const columnas = useMemo<ColumnSpec<OrdenCompra>[]>(() => [
    {
      id: 'orden',
      header: 'Orden',
      width: 'minmax(200px, 1.6fr)',
      kind: 'entity',
      cell: (o) => (
        <EntityCell
          icon={Truck}
          title={`${o.numero}${o.proveedor ? ` · ${o.proveedor}` : ''}`}
          subtitle={
            o.lineas.length
              ? `${o.lineas.length} ${o.lineas.length === 1 ? 'artículo' : 'artículos'}: ${o.lineas.map((l) => l.item_nombre).filter(Boolean).slice(0, 3).join(', ')}`
              : 'Sin artículos cargados'
          }
        />
      ),
    },
    {
      id: 'estado',
      header: 'Cómo va',
      width: 'minmax(120px, 0.9fr)',
      kind: 'chip',
      cell: (o) => (
        <ChipEstado label={ESTADO_LABEL[o.estado] ?? o.estado} tone={ESTADO_TONO[o.estado] ?? 'gray'} />
      ),
    },
    {
      id: 'recibido',
      header: 'Recibido',
      width: 'minmax(110px, 0.8fr)',
      kind: 'text',
      align: 'right',
      cell: (o) => {
        const pedido = o.lineas.reduce((a, l) => a + (l.cantidad || 0), 0);
        const llego = o.lineas.reduce((a, l) => a + (l.cantidad_recibida || 0), 0);
        return pedido ? `${llego} de ${pedido}` : '—';
      },
    },
    {
      id: 'deposito',
      header: 'Entra a',
      width: 'minmax(120px, 0.9fr)',
      kind: 'text',
      cell: (o) => o.deposito_nombre || '—',
    },
    {
      id: 'esperada',
      header: 'La prometieron',
      width: 'minmax(120px, 0.8fr)',
      kind: 'text',
      cell: (o) => (o.fecha_esperada ? formatFechaAR(o.fecha_esperada) : '—'),
    },
    { id: 'acciones', header: '', width: '48px', kind: 'actions' },
  ], []);

  const abrirNueva = () => {
    setEditando(null);
    setForm({
      proveedor: '', deposito_id: depositos[0] ? String(depositos[0].id) : '',
      fecha_esperada: '', notas: '', lineas: [{ item_id: '', cantidad: '', precio_unitario: '' }],
    });
    setSheetOpen(true);
  };

  const abrirEdicion = (o: OrdenCompra) => {
    if (['recibida', 'cancelada'].includes(o.estado)) {
      toast.info('Una orden cerrada no se edita. Si llegó de más o de menos, corregilo con un ajuste de stock.');
      return;
    }
    setEditando(o);
    setForm({
      proveedor: o.proveedor ?? '',
      deposito_id: o.deposito_id ? String(o.deposito_id) : '',
      fecha_esperada: o.fecha_esperada ?? '',
      notas: o.notas ?? '',
      lineas: o.lineas.length
        ? o.lineas.map((l) => ({
            item_id: String(l.item_id),
            cantidad: String(l.cantidad ?? ''),
            precio_unitario: l.precio_unitario != null ? String(l.precio_unitario) : '',
          }))
        : [{ item_id: '', cantidad: '', precio_unitario: '' }],
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    const lineas = form.lineas
      .filter((l) => l.item_id && Number(l.cantidad) > 0)
      .map((l) => ({
        item_id: Number(l.item_id),
        cantidad: Number(l.cantidad),
        precio_unitario: l.precio_unitario ? Number(l.precio_unitario) : null,
      }));
    if (!lineas.length) { toast.error('Cargá al menos un artículo con su cantidad'); return; }
    setGuardando(true);
    try {
      const payload = {
        proveedor: form.proveedor.trim() || null,
        deposito_id: form.deposito_id ? Number(form.deposito_id) : null,
        fecha_esperada: form.fecha_esperada || null,
        notas: form.notas.trim() || null,
        lineas,
      };
      if (editando) await inventarioApi.updateOrdenCompra(editando.id, payload);
      else await inventarioApi.createOrdenCompra(payload);
      toast.success(editando ? 'Orden actualizada' : 'Orden creada');
      setSheetOpen(false);
      await cargar();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'No se pudo guardar la orden');
    } finally {
      setGuardando(false);
    }
  };

  const recibirTodo = async () => {
    if (!aRecibir) return;
    try {
      // Sin `lineas`, el backend recibe todo lo que faltaba de cada renglón.
      await inventarioApi.recibirOrdenCompra(aRecibir.id, {});
      toast.success('Mercadería recibida: el stock ya entró al depósito');
      setARecibir(null);
      await cargar();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'No se pudo registrar la recepción');
    }
  };

  const cancelar = async () => {
    if (!aCancelar) return;
    try {
      await inventarioApi.cancelarOrdenCompra(aCancelar.id);
      toast.success('Orden cancelada');
      setACancelar(null);
      await cargar();
    } catch {
      toast.error('No se pudo cancelar la orden');
    }
  };

  const setLinea = (i: number, campo: keyof LineaForm, valor: string) =>
    setForm((f) => ({ ...f, lineas: f.lineas.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)) }));

  const totalForm = useMemo(
    () => form.lineas.reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0),
    [form.lineas],
  );

  return (
    <>
      <SemanticAbmPage<OrdenCompra>
        moduleKey="inventario"
        eyebrow="Inventario"
        title="Órdenes de compra"
        description="Qué se le pidió a cada proveedor y qué llegó."
        hero={{ etiqueta: 'INVENTARIO', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'Recibir es lo que hace entrar el stock',
          texto:
            'Al marcar una orden como recibida, cada artículo suma su cantidad al depósito y queda el movimiento de entrada. Si llegó sólo una parte, se recibe eso y la orden sigue esperando el resto.',
        }}
        searchPlaceholder="Buscar por número, proveedor o artículo…"
        views={['table']}
        activeView="table"
        onViewChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Nueva orden', onClick: abrirNueva }}
        selects={[]}
        statusTabs={[
          { id: 'todos', label: 'Todas', count: ordenes.length },
          { id: 'esperando', label: 'Esperando', count: esperando },
          { id: 'recibidas', label: 'Recibidas', count: recibidas },
          { id: 'canceladas', label: 'Canceladas', count: canceladas },
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(o) => String(o.id)}
        rowActions={[
          {
            id: 'recibir',
            label: 'Marcar como recibida',
            icon: PackageCheck,
            onClick: (o: OrdenCompra) => {
              if (['recibida', 'cancelada'].includes(o.estado)) {
                toast.info('Esa orden ya está cerrada.');
                return;
              }
              setARecibir(o);
            },
          },
          {
            id: 'cancelar',
            label: 'Cancelar orden',
            icon: Ban,
            danger: true,
            onClick: (o: OrdenCompra) => setACancelar(o),
          },
        ]}
        onRowClick={abrirEdicion}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Nada coincide con "${search.trim()}".`
            : 'Todavía no hay órdenes de compra. Cargá una cuando le pidas mercadería a un proveedor: al recibirla, el stock entra solo.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${ordenes.length}`,
          note: 'Cancelar una orden no saca del depósito lo que ya se recibió: eso entró de verdad. Para descontarlo, un ajuste de stock.',
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editando ? `Orden ${editando.numero}` : 'Nueva orden de compra'}
        stickyFooter={
          <button
            onClick={guardar}
            disabled={guardando}
            className="w-full py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: theme.primary }}
          >
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear orden'}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Proveedor</p>
            <input
              className="w-full px-3 py-2 rounded-lg"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              value={form.proveedor}
              onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
              placeholder="A quién se le compra"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Entra al depósito</p>
            <ModernSelect
              value={form.deposito_id}
              onChange={(v) => setForm({ ...form, deposito_id: v })}
              options={[
                { value: '', label: 'Sin especificar' },
                ...depositos.map((d) => ({ value: String(d.id), label: d.nombre })),
              ]}
              placeholder="Elegí el depósito"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Cuándo la prometieron</p>
            <DatePicker
              value={form.fecha_esperada}
              onChange={(v) => setForm({ ...form, fecha_esperada: v })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase" style={{ color: theme.textSecondary }}>Qué se pide</p>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, lineas: [...f.lineas, { item_id: '', cantidad: '', precio_unitario: '' }] }))}
                className="inline-flex items-center gap-1 text-xs font-semibold"
                style={{ color: theme.primary }}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar artículo
              </button>
            </div>
            <div className="space-y-2">
              {form.lineas.map((l, i) => (
                <div key={i} className="rounded-lg p-3 space-y-2" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <ModernSelect
                        value={l.item_id}
                        onChange={(v) => setLinea(i, 'item_id', v)}
                        options={consumibles.map((it) => ({
                          value: String(it.id),
                          label: `${it.nombre}${it.unidad ? ` (${it.unidad})` : ''}`,
                        }))}
                        placeholder="Elegí el artículo"
                        searchable
                      />
                    </div>
                    {form.lineas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, lineas: f.lineas.filter((_, k) => k !== i) }))}
                        className="p-2 rounded-lg flex-none"
                        style={{ color: theme.textSecondary }}
                        aria-label="Quitar artículo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number" min={0} step="any"
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}`, color: theme.text }}
                      value={l.cantidad}
                      onChange={(e) => setLinea(i, 'cantidad', e.target.value)}
                      placeholder="Cantidad"
                    />
                    <input
                      type="number" min={0} step="any"
                      className="w-full px-3 py-2 rounded-lg"
                      style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}`, color: theme.text }}
                      value={l.precio_unitario}
                      onChange={(e) => setLinea(i, 'precio_unitario', e.target.value)}
                      placeholder="Precio c/u (opcional)"
                    />
                  </div>
                </div>
              ))}
            </div>
            {totalForm > 0 && (
              <p className="text-sm mt-2 text-right" style={{ color: theme.text }}>
                Total estimado: <b>${totalForm.toLocaleString('es-AR')}</b>
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Notas</p>
            <textarea
              rows={2}
              className="w-full px-3 py-2 rounded-lg"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Lo que convenga recordar de esta compra"
            />
          </div>

          {editando && editando.lineas.some((l) => l.cantidad_recibida > 0) && (
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              De esta orden ya llegó parte. Lo recibido no se toca al editar: si cambiás una cantidad,
              se recalcula sólo lo que falta.
            </p>
          )}
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!aRecibir}
        onClose={() => setARecibir(null)}
        onConfirm={recibirTodo}
        title="¿Llegó toda la mercadería?"
        message={
          aRecibir
            ? `Se van a sumar al depósito ${aRecibir.lineas.reduce((a, l) => a + l.pendiente, 0)} unidades pendientes de la orden ${aRecibir.numero}, y queda el movimiento de entrada de cada artículo. Si llegó sólo una parte, cancelá y cargá las entradas a mano desde Movimientos.`
            : ''
        }
        confirmText="Sí, entró todo"
        variant="success"
      />

      <ConfirmModal
        isOpen={!!aCancelar}
        onClose={() => setACancelar(null)}
        onConfirm={cancelar}
        title="¿Cancelar la orden?"
        message={
          aCancelar
            ? `La orden ${aCancelar.numero} queda cancelada. Lo que ya se recibió NO se descuenta: entró de verdad al depósito. Para sacarlo, cargá un ajuste de stock.`
            : ''
        }
        confirmText="Cancelar la orden"
        variant="danger"
      />
    </>
  );
}
