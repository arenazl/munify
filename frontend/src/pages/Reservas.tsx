/**
 * RESERVAS — módulo Recursos, Etapa 3.
 *
 * El municipio presta cosas: el salón comunitario, la cancha, el camión de
 * agua, la retro. Hoy eso vive en un cuaderno y se superpone — dos familias
 * con el salón el mismo sábado.
 *
 * La pantalla abre por lo que espera respuesta: un pedido sin contestar es
 * un vecino esperando. Y el bien prestable no es una entidad nueva: es un
 * activo de Inventario con el tilde "se puede prestar al vecino".
 *
 * Ver docs/recursos/01-modulo-recursos.md
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell, ChipEstado } from '../components/abmv2/DataTable';
import type { ChipTone, ColumnSpec } from '../components/abmv2/types';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { DatePicker } from '../components/ui/DatePicker';
import { seg } from '../lib/semanticHero';
import { reservasApi } from '../lib/api';

interface Reserva {
  id: number;
  item_id: number;
  item_nombre: string | null;
  solicitante_nombre: string;
  solicitante_telefono: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  motivo: string | null;
  estado: string;
  motivo_rechazo: string | null;
}

interface BienDisponible {
  id: number;
  nombre: string;
  descripcion: string | null;
}

const ESTADO_LABEL: Record<string, string> = {
  solicitada: 'Esperando respuesta',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  cumplida: 'Cumplida',
};

const ESTADO_TONE: Record<string, ChipTone> = {
  solicitada: 'amber', aprobada: 'green', rechazada: 'red',
  cancelada: 'gray', cumplida: 'blue',
};

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${a}`;
};

const rango = (r: Reserva) =>
  r.fecha_desde === r.fecha_hasta ? fmt(r.fecha_desde) : `${fmt(r.fecha_desde)} al ${fmt(r.fecha_hasta)}`;

type FormState = {
  item_id: string;
  solicitante_nombre: string;
  solicitante_telefono: string;
  fecha_desde: string;
  fecha_hasta: string;
  motivo: string;
};

const FORM_VACIO: FormState = {
  item_id: '', solicitante_nombre: '', solicitante_telefono: '',
  fecha_desde: hoyISO(), fecha_hasta: hoyISO(), motivo: '',
};

export default function Reservas() {
  const { theme } = useTheme();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [bienes, setBienes] = useState<BienDisponible[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('pendientes');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [aRechazar, setARechazar] = useState<Reserva | null>(null);
  const [resolviendo, setResolviendo] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [rRes, bRes] = await Promise.all([
        reservasApi.list(),
        reservasApi.disponibles().catch(() => ({ data: [] })),
      ]);
      setReservas((rRes.data as Reserva[]) || []);
      setBienes((bRes.data as BienDisponible[]) || []);
    } catch {
      toast.error('No se pudieron cargar las reservas');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const pendientes = useMemo(() => reservas.filter((r) => r.estado === 'solicitada'), [reservas]);
  const aprobadas = useMemo(() => reservas.filter((r) => r.estado === 'aprobada'), [reservas]);
  const proximas = useMemo(
    () => aprobadas.filter((r) => r.fecha_hasta >= hoyISO()), [aprobadas]);

  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return reservas.filter((r) => {
      if (tab === 'pendientes' && r.estado !== 'solicitada') return false;
      if (tab === 'proximas' && !proximas.includes(r)) return false;
      if (tab === 'cerradas' && !['rechazada', 'cancelada', 'cumplida'].includes(r.estado)) return false;
      if (!s) return true;
      return r.solicitante_nombre.toLowerCase().includes(s)
        || (r.item_nombre || '').toLowerCase().includes(s);
    });
  }, [reservas, search, tab, proximas]);

  const heroFrases = useMemo(() => {
    if (bienes.length === 0) {
      return [{ segmentos: [
        seg('No hay nada habilitado para prestar:'),
        seg('marcá "se puede prestar al vecino" en Inventario.', 'advertencia'),
      ] }];
    }
    if (pendientes.length > 0) {
      return [{ segmentos: [
        seg(`${pendientes.length} ${pendientes.length === 1 ? 'pedido espera' : 'pedidos esperan'} respuesta`, 'advertencia'),
        seg('— del otro lado hay un vecino esperando.'),
      ] }];
    }
    if (proximas.length > 0) {
      return [{ segmentos: [
        seg(`${proximas.length} ${proximas.length === 1 ? 'reserva aprobada' : 'reservas aprobadas'} por delante`, 'bueno'),
        seg('y ningún pedido sin contestar.'),
      ] }];
    }
    return [{ segmentos: [
      seg(`${bienes.length} ${bienes.length === 1 ? 'bien disponible' : 'bienes disponibles'} para prestar`, 'bueno'),
      seg('y nada pendiente.'),
    ] }];
  }, [bienes.length, pendientes.length, proximas.length]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Esperan respuesta', valor: String(pendientes.length) },
    { etiqueta: 'Aprobadas por venir', valor: String(proximas.length) },
    { etiqueta: 'Bienes prestables', valor: String(bienes.length) },
    { etiqueta: 'Pedidos totales', valor: String(reservas.length) },
  ]), [pendientes.length, proximas.length, bienes.length, reservas.length]);

  const resolver = async (r: Reserva, accion: 'aprobar' | 'cancelar') => {
    setResolviendo(true);
    try {
      if (accion === 'aprobar') await reservasApi.aprobar(r.id);
      else await reservasApi.cancelar(r.id);
      toast.success(accion === 'aprobar' ? 'Reserva aprobada' : 'Reserva cancelada');
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo completar');
    } finally {
      setResolviendo(false);
    }
  };

  const rechazar = async (motivo: string) => {
    if (!aRechazar) return;
    setResolviendo(true);
    try {
      await reservasApi.rechazar(aRechazar.id, motivo);
      toast.success('Pedido rechazado');
      setARechazar(null);
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo rechazar');
    } finally {
      setResolviendo(false);
    }
  };

  const guardar = async () => {
    if (!form.item_id) { toast.error('Elegí qué se presta'); return; }
    if (!form.solicitante_nombre.trim()) { toast.error('Falta el nombre de quien lo pide'); return; }
    setGuardando(true);
    try {
      await reservasApi.crear({
        item_id: Number(form.item_id),
        solicitante_nombre: form.solicitante_nombre.trim(),
        solicitante_telefono: form.solicitante_telefono.trim() || null,
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta || form.fecha_desde,
        motivo: form.motivo.trim() || null,
      });
      toast.success('Pedido cargado');
      setSheetOpen(false);
      await cargar();
    } catch (e) {
      // El 409 trae quién lo tiene tomado: es LA información del error.
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo cargar el pedido');
    } finally {
      setGuardando(false);
    }
  };

  const columnas = useMemo<ColumnSpec<Reserva>[]>(() => [
    {
      id: 'bien',
      header: 'Qué se presta',
      width: 'minmax(180px, 1.4fr)',
      kind: 'entity',
      cell: (r) => (
        <EntityCell
          icon={CalendarCheck}
          title={r.item_nombre || 'Bien dado de baja'}
          subtitle={r.motivo || undefined}
        />
      ),
    },
    {
      id: 'quien',
      header: 'Quién lo pide',
      width: 'minmax(150px, 1fr)',
      kind: 'text',
      cell: (r) => r.solicitante_telefono
        ? `${r.solicitante_nombre} · ${r.solicitante_telefono}`
        : r.solicitante_nombre,
    },
    {
      id: 'cuando',
      header: 'Cuándo',
      width: 'minmax(140px, 1fr)',
      kind: 'text',
      cell: (r) => rango(r),
    },
    {
      id: 'estado',
      header: 'Estado',
      width: 'minmax(150px, 1fr)',
      kind: 'chip',
      cell: (r) => <ChipEstado label={ESTADO_LABEL[r.estado] || r.estado} tone={ESTADO_TONE[r.estado] || 'gray'} />,
    },
    { id: 'acciones', header: '', width: '52px', kind: 'actions' },
  ], []);

  const opcionesBien: SelectOption[] = bienes.map((b) => ({
    value: String(b.id), label: b.nombre, description: b.descripcion || undefined,
  }));

  return (
    <>
      <SemanticAbmPage<Reserva>
        moduleKey="reservas"
        eyebrow="Recursos"
        title="Reservas"
        description="Lo que el municipio presta: salón, cancha, maquinaria."
        hero={{ etiqueta: 'RECURSOS · RESERVAS', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'Los bienes salen de Inventario',
          texto:
            'Un bien se presta si en Inventario tiene tildado "se puede prestar al vecino". El sistema no deja reservarlo dos veces para los mismos días: si está tomado, lo avisa al cargar.',
        }}
        searchPlaceholder="Buscar por vecino o por bien…"
        views={['table']}
        activeView="table"
        onViewChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Cargar pedido', onClick: () => { setForm(FORM_VACIO); setSheetOpen(true); } }}
        selects={[]}
        statusTabs={[
          { id: 'pendientes', label: 'Esperan respuesta', count: pendientes.length },
          { id: 'proximas', label: 'Aprobadas', count: proximas.length },
          { id: 'cerradas', label: 'Cerradas', count: reservas.filter((r) => ['rechazada', 'cancelada', 'cumplida'].includes(r.estado)).length },
          { id: 'todos', label: 'Todos', count: reservas.length },
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(r) => r.id}
        rowActions={[
          {
            id: 'aprobar',
            label: 'Aprobar',
            icon: Check,
            onClick: (r: Reserva) => {
              if (r.estado !== 'solicitada') { toast.info(`Esta reserva ya está ${ESTADO_LABEL[r.estado]?.toLowerCase()}`); return; }
              resolver(r, 'aprobar');
            },
          },
          {
            id: 'rechazar',
            label: 'Rechazar',
            icon: X,
            danger: true,
            onClick: (r: Reserva) => {
              if (r.estado !== 'solicitada') { toast.info('Sólo se rechaza un pedido que espera respuesta'); return; }
              setARechazar(r);
            },
          },
        ]}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Nada coincide con "${search.trim()}".`
            : tab === 'pendientes'
              ? 'Ningún pedido esperando respuesta.'
            : bienes.length === 0
              ? 'Todavía no hay bienes habilitados para prestar. Se habilitan en Inventario, con el tilde "se puede prestar al vecino".'
            : 'Todavía no hay pedidos.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${reservas.length}`,
          note: 'Un pedido rechazado o cancelado libera los días: el bien vuelve a estar disponible para otro vecino.',
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Cargar un pedido"
        description="Para los pedidos que entran por teléfono o por el mostrador."
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
              Cargar
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Qué se presta
            </label>
            <ModernSelect
              options={opcionesBien}
              value={form.item_id}
              onChange={(v) => setForm((f) => ({ ...f, item_id: v }))}
              placeholder={bienes.length ? 'Elegí el bien' : 'No hay bienes habilitados'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Quién lo pide
            </label>
            <input
              type="text"
              value={form.solicitante_nombre}
              onChange={(e) => setForm((f) => ({ ...f, solicitante_nombre: e.target.value }))}
              placeholder="Nombre y apellido"
              className="w-full px-3 py-2 rounded-xl border text-base outline-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={form.solicitante_telefono}
              onChange={(e) => setForm((f) => ({ ...f, solicitante_telefono: e.target.value }))}
              placeholder="Para avisarle la respuesta"
              className="w-full px-3 py-2 rounded-xl border text-base outline-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Desde
              </label>
              <DatePicker
                value={form.fecha_desde}
                onChange={(v) => setForm((f) => ({ ...f, fecha_desde: v || hoyISO() }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Hasta
              </label>
              <DatePicker
                value={form.fecha_hasta}
                onChange={(v) => setForm((f) => ({ ...f, fecha_hasta: v || f.fecha_desde }))}
              />
            </div>
          </div>
          <p className="text-[11px] -mt-2" style={{ color: theme.textSecondary }}>
            Para un solo día, poné la misma fecha en los dos.
          </p>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Para qué
            </label>
            <input
              type="text"
              value={form.motivo}
              onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              placeholder="Cumpleaños, torneo, mudanza…"
              className="w-full px-3 py-2 rounded-xl border text-base outline-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
          </div>
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={aRechazar !== null}
        onClose={() => setARechazar(null)}
        onConfirm={(motivo) => rechazar(motivo || '')}
        loading={resolviendo}
        title="Rechazar el pedido"
        message={`${aRechazar?.solicitante_nombre} pidió ${aRechazar?.item_nombre} para el ${aRechazar ? rango(aRechazar) : ''}.`}
        promptLabel="Por qué se rechaza"
        promptPlaceholder="Ese día está tomado por un acto del municipio…"
        confirmText="Rechazar"
        variant="danger"
      />
    </>
  );
}
