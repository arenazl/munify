/**
 * FLOTA — módulo Recursos, Etapa 1.
 *
 * El corralón lleva el combustible en un cuaderno y nadie sabe cuánto consume
 * cada vehículo. Esta pantalla responde eso con lo que el propio municipio
 * carga: cada carga de nafta con su kilometraje, y de ahí sale el consumo
 * cada 100 km.
 *
 * Dos cosas que la definen:
 *  - **El consumo manda el orden.** La lista abre por el que más consume, que
 *    es donde hay que mirar. Un vehículo que se dispara contra su propio
 *    promedio es la alerta que el intendente compra.
 *  - **Sin datos no se inventa.** Con menos de dos cargas con kilometraje, la
 *    celda dice "faltan cargas", no un cero ni una estimación: sobre ese
 *    número se decide si un vehículo está perdiendo combustible.
 *
 * El vehículo NO es una entidad nueva: es un activo de `inventario_items` con
 * datos de flota. Ver docs/recursos/01-modulo-recursos.md
 */
import { useEffect, useMemo, useState } from 'react';
import { Fuel, Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import type { ChipTone, ColumnSpec } from '../components/abmv2/types';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { seg } from '../lib/semanticHero';
import { cajasApi, contactosApi, flotaApi } from '../lib/api';
import type { Caja } from '../types';

interface Vehiculo {
  id: number;
  nombre: string;
  identificador: string | null;
  marca_modelo: string | null;
  anio: number | null;
  km_actual: number | null;
  tipo_combustible: string | null;
  vencimiento_vtv: string | null;
  vencimiento_seguro: string | null;
  km_proximo_service: number | null;
  estado_activo: string | null;
  consumo_100km: number | null;
  litros_mes: number | null;
  gasto_mes: string | null;
  cargas_total: number;
  ultima_carga: string | null;
}

type FormCarga = {
  item_id: number | null;
  fecha: string;
  litros: string;
  importe: string;
  km: string;
  caja_id: number | null;
  /** La estación de servicio. El gasto necesita un destino sí o sí. */
  contacto_id: number | null;
  observaciones: string;
};

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const FORM_VACIO: FormCarga = {
  item_id: null, fecha: hoyISO(), litros: '', importe: '', km: '',
  caja_id: null, contacto_id: null, observaciones: '',
};

const plata = (v: string | number | null | undefined) =>
  '$ ' + (Number(v || 0)).toLocaleString('es-AR', { maximumFractionDigits: 0 });

/** Días que faltan para una fecha, o null si no hay fecha. */
const diasPara = (iso: string | null): number | null => {
  if (!iso) return null;
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${hoyISO()}T00:00:00`).getTime()) / 86400000);
};

/** Lo que vence primero, en criollo. Null cuando no hay nada que avisar. */
function alertaDe(v: Vehiculo): { texto: string; tone: ChipTone } | null {
  const candidatos = [
    { nombre: 'VTV', dias: diasPara(v.vencimiento_vtv) },
    { nombre: 'Seguro', dias: diasPara(v.vencimiento_seguro) },
  ].filter((c): c is { nombre: string; dias: number } => c.dias !== null);

  const proximo = candidatos.sort((a, b) => a.dias - b.dias)[0];
  if (proximo) {
    if (proximo.dias < 0) return { texto: `${proximo.nombre} vencida`, tone: 'red' };
    if (proximo.dias <= 30) return { texto: `${proximo.nombre} en ${proximo.dias}d`, tone: 'amber' };
  }
  if (v.km_proximo_service && v.km_actual && v.km_actual >= v.km_proximo_service) {
    return { texto: 'Service vencido', tone: 'red' };
  }
  return null;
}

export default function Flota() {
  const { theme } = useTheme();
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoTab, setEstadoTab] = useState('todos');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<FormCarga>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [vRes, cRes, pRes] = await Promise.all([
        flotaApi.vehiculos(),
        cajasApi.list({ activo: true }).catch(() => ({ data: [] })),
        contactosApi.list({ activo: true }).catch(() => ({ data: [] })),
      ]);
      setVehiculos((vRes.data as Vehiculo[]) || []);
      setCajas((cRes.data as Caja[]) || []);
      setProveedores(((pRes.data as { id: number; nombre: string }[]) || []).slice(0, 200));
    } catch {
      toast.error('No se pudo cargar la flota');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const conAlerta = useMemo(() => vehiculos.filter((v) => alertaDe(v) !== null), [vehiculos]);
  const sinDatos = useMemo(() => vehiculos.filter((v) => v.consumo_100km === null), [vehiculos]);
  const litrosMes = useMemo(
    () => vehiculos.reduce((s, v) => s + (v.litros_mes || 0), 0), [vehiculos]);
  const gastoMes = useMemo(
    () => vehiculos.reduce((s, v) => s + Number(v.gasto_mes || 0), 0), [vehiculos]);

  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return vehiculos.filter((v) => {
      if (estadoTab === 'alerta' && alertaDe(v) === null) return false;
      if (estadoTab === 'sin-datos' && v.consumo_100km !== null) return false;
      if (!s) return true;
      return v.nombre.toLowerCase().includes(s)
        || (v.identificador || '').toLowerCase().includes(s)
        || (v.marca_modelo || '').toLowerCase().includes(s);
    });
  }, [vehiculos, search, estadoTab]);

  // El hero habla del combustible, que es la plata que se fuga.
  const heroFrases = useMemo(() => {
    if (vehiculos.length === 0) {
      return [{ segmentos: [
        seg('Todavía no cargaste ningún vehículo:'),
        seg('sin flota no hay control de combustible.', 'advertencia'),
      ] }];
    }
    if (conAlerta.length > 0) {
      return [{ segmentos: [
        seg(`${conAlerta.length} ${conAlerta.length === 1 ? 'vehículo tiene' : 'vehículos tienen'} algo vencido`, 'malo'),
        seg('o por vencer: VTV, seguro o service.'),
      ] }];
    }
    if (litrosMes > 0) {
      return [{ segmentos: [
        seg(`Este mes se cargaron ${Math.round(litrosMes)} litros`),
        seg(`por ${plata(gastoMes)}.`),
      ] }];
    }
    return [{ segmentos: [
      seg('Todavía no se registraron cargas este mes:'),
      seg('sin cargas no se puede calcular el consumo.', 'advertencia'),
    ] }];
  }, [vehiculos.length, conAlerta.length, litrosMes, gastoMes]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Vehículos', valor: String(vehiculos.length) },
    { etiqueta: 'Litros del mes', valor: litrosMes > 0 ? String(Math.round(litrosMes)) : '—' },
    { etiqueta: 'Gasto del mes', valor: gastoMes > 0 ? plata(gastoMes) : '—' },
    { etiqueta: 'Con alerta', valor: String(conAlerta.length) },
  ]), [vehiculos.length, litrosMes, gastoMes, conAlerta.length]);

  const columnas = useMemo<ColumnSpec<Vehiculo>[]>(() => [
    {
      id: 'vehiculo',
      header: 'Vehículo',
      width: 'minmax(200px, 1.8fr)',
      kind: 'entity',
      cell: (v) => (
        <EntityCell
          icon={Truck}
          title={v.nombre}
          subtitle={[v.identificador, v.marca_modelo, v.anio ? String(v.anio) : null]
            .filter(Boolean).join(' · ') || undefined}
        />
      ),
    },
    {
      id: 'consumo',
      header: 'Consumo',
      width: 'minmax(120px, 0.9fr)',
      align: 'right',
      kind: 'metric',
      cell: (v) => (
        <MetricCell
          value={v.consumo_100km !== null ? `${v.consumo_100km}` : '—'}
          note={v.consumo_100km !== null ? 'L cada 100 km' : 'faltan cargas'}
          veredicto={v.consumo_100km === null ? undefined
            : v.consumo_100km > 20 ? 'malo'
            : v.consumo_100km > 14 ? 'advertencia' : 'bueno'}
        />
      ),
    },
    {
      id: 'km',
      header: 'Kilómetros',
      width: 'minmax(110px, 0.8fr)',
      align: 'right',
      kind: 'text',
      cell: (v) => v.km_actual ? v.km_actual.toLocaleString('es-AR') : '—',
    },
    {
      id: 'alerta',
      header: 'Al día',
      width: 'minmax(130px, 0.9fr)',
      kind: 'chip',
      cell: (v) => {
        const a = alertaDe(v);
        return a ? <ChipEstado label={a.texto} tone={a.tone} />
                 : <ChipEstado label="Al día" tone="green" />;
      },
    },
    {
      id: 'mes',
      header: 'Combustible del mes',
      width: 'minmax(140px, 1fr)',
      align: 'right',
      kind: 'text',
      cell: (v) => v.litros_mes
        ? `${Math.round(v.litros_mes)} L · ${plata(v.gasto_mes)}`
        : 'sin cargas',
    },
    { id: 'acciones', header: '', width: '52px', kind: 'actions' },
  ], []);

  const abrirCarga = (v?: Vehiculo) => {
    setForm({ ...FORM_VACIO, item_id: v?.id ?? null, km: v?.km_actual ? String(v.km_actual) : '' });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.item_id) { toast.error('Elegí el vehículo'); return; }
    if (!form.litros || Number(form.litros) <= 0) { toast.error('Cargá los litros'); return; }
    setGuardando(true);
    try {
      await flotaApi.registrarCarga({
        item_id: form.item_id,
        fecha: form.fecha,
        litros: Number(form.litros),
        importe: form.importe ? Number(form.importe) : null,
        km: form.km ? Number(form.km) : null,
        caja_id: form.caja_id,
        contacto_id: form.contacto_id,
        observaciones: form.observaciones.trim() || null,
      });
      toast.success(form.caja_id && form.importe
        ? 'Carga registrada y gasto imputado en Tesorería'
        : 'Carga registrada');
      setSheetOpen(false);
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo registrar la carga');
    } finally {
      setGuardando(false);
    }
  };

  const opcionesVehiculo: SelectOption[] = vehiculos.map((v) => ({
    value: String(v.id),
    label: v.identificador ? `${v.nombre} (${v.identificador})` : v.nombre,
  }));
  const opcionesCaja: SelectOption[] = cajas
    .filter((c) => !c.es_tarjeta)
    .map((c) => ({ value: String(c.id), label: c.nombre, color: c.color || undefined }));

  return (
    <>
      <SemanticAbmPage<Vehiculo>
        moduleKey="flota"
        eyebrow="Recursos"
        title="Flota"
        description="Los vehículos del municipio, lo que consumen y lo que cuestan."
        hero={{ etiqueta: 'RECURSOS · FLOTA', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'El consumo sale de las cargas',
          texto:
            'Cada vez que se carga combustible se anota el kilometraje. Con dos cargas el sistema ya calcula cuántos litros consume el vehículo cada 100 km, y ahí se ve el que se desvía.',
        }}
        searchPlaceholder="Buscar por nombre, dominio o modelo…"
        views={['table']}
        activeView="table"
        onViewChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Registrar carga', onClick: () => abrirCarga() }}
        selects={[]}
        statusTabs={[
          { id: 'todos', label: 'Todos', count: vehiculos.length },
          { id: 'alerta', label: 'Con alerta', count: conAlerta.length },
          { id: 'sin-datos', label: 'Sin consumo', count: sinDatos.length },
        ]}
        activeStatus={estadoTab}
        onStatusChange={setEstadoTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(v) => v.id}
        rowActions={[
          { id: 'carga', label: 'Registrar carga', icon: Fuel, onClick: (v: Vehiculo) => abrirCarga(v) },
        ]}
        onRowClick={(v: Vehiculo) => abrirCarga(v)}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Ningún vehículo coincide con "${search.trim()}".`
            : 'Todavía no hay vehículos con datos de flota. Un vehículo se carga en Inventario como activo y se le completan el dominio, el modelo y el combustible.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${vehiculos.length}`,
          note: 'El consumo se calcula de tanque a tanque: hacen falta al menos dos cargas con kilometraje para tenerlo.',
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Registrar carga de combustible"
        description="Anotá el kilometraje: es lo que permite calcular el consumo."
        stickyFooter={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSheetOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: 'var(--pl-on-accent)' }}
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Vehículo
            </label>
            <ModernSelect
              options={opcionesVehiculo}
              value={form.item_id ? String(form.item_id) : ''}
              onChange={(v) => setForm((f) => ({ ...f, item_id: Number(v) }))}
              placeholder="Elegí el vehículo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Fecha
              </label>
              <DatePicker value={form.fecha} onChange={(v) => setForm((f) => ({ ...f, fecha: v || hoyISO() }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Litros
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={form.litros}
                onChange={(e) => setForm((f) => ({ ...f, litros: e.target.value }))}
                placeholder="45"
                className="w-full px-3 py-2 rounded-xl border text-base outline-none"
                style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Kilómetros
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={form.km}
                onChange={(e) => setForm((f) => ({ ...f, km: e.target.value }))}
                placeholder="84500"
                className="w-full px-3 py-2 rounded-xl border text-base outline-none"
                style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Importe
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={form.importe}
                onChange={(e) => setForm((f) => ({ ...f, importe: e.target.value }))}
                placeholder="58000"
                className="w-full px-3 py-2 rounded-xl border text-base outline-none"
                style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Estación de servicio
            </label>
            <ModernSelect
              options={proveedores.map((p) => ({ value: String(p.id), label: p.nombre }))}
              value={form.contacto_id ? String(form.contacto_id) : ''}
              onChange={(v) => setForm((f) => ({ ...f, contacto_id: v ? Number(v) : null }))}
              placeholder="Sin especificar"
              searchable
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Caja
            </label>
            <ModernSelect
              options={opcionesCaja}
              value={form.caja_id ? String(form.caja_id) : ''}
              onChange={(v) => setForm((f) => ({ ...f, caja_id: v ? Number(v) : null }))}
              placeholder="Sin imputar"
            />
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Con caja e importe, la carga se imputa sola como gasto en Tesorería y descuenta el saldo. Sin caja queda sólo como registro de consumo.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Observaciones
            </label>
            <input
              type="text"
              value={form.observaciones}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Opcional"
              className="w-full px-3 py-2 rounded-xl border text-base outline-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}
