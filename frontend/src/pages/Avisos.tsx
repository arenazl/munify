/**
 * AVISOS — módulo Comunicación, Etapa 1.
 *
 * Lo que el municipio le cuenta al vecino sin que el vecino pregunte: un corte
 * de agua, una obra que arranca, una alerta por tormenta.
 *
 * El canal ya existía —la tabla `noticias` y las tres pantallas del vecino que
 * la muestran— pero estaba VACÍO en todos los municipios porque no había dónde
 * cargarlo. Esta pantalla es esa punta suelta.
 *
 * Dos cosas la separan de un ABM cualquiera:
 *  - **La vigencia hace el estado.** El aviso del corte de agua se apaga solo
 *    el día que pasa: "Vigente / Programado / Vencido" se DEDUCE de las fechas,
 *    no es un campo que alguien tenga que acordarse de bajar.
 *  - **Avisar es irreversible.** El push le llega a todo el municipio y no se
 *    puede deshacer: el botón pide confirmación y, una vez enviado, queda como
 *    constancia ("Avisado a N vecinos") en vez de volver a estar disponible.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Megaphone, Pin, Send, Trash2, Pencil } from 'lucide-react';
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
import { noticiasApi } from '../lib/api';

interface Aviso {
  id: number;
  titulo: string;
  descripcion: string;
  imagen_url: string | null;
  tipo: 'aviso' | 'noticia' | 'alerta';
  fecha_desde: string | null;
  fecha_hasta: string | null;
  fijado: boolean;
  activo: boolean;
  enviado_at: string | null;
  enviados_count: number;
  created_at: string;
}

const TIPOS: SelectOption[] = [
  { value: 'aviso', label: 'Aviso' },
  { value: 'noticia', label: 'Noticia' },
  { value: 'alerta', label: 'Alerta' },
];

type FormState = {
  titulo: string;
  descripcion: string;
  tipo: 'aviso' | 'noticia' | 'alerta';
  fecha_desde: string;
  fecha_hasta: string;
  fijado: boolean;
  activo: boolean;
};

const FORM_VACIO: FormState = {
  titulo: '',
  descripcion: '',
  tipo: 'aviso',
  fecha_desde: '',
  fecha_hasta: '',
  fijado: false,
  activo: true,
};

/** 'YYYY-MM-DD' de hoy en hora LOCAL. Nunca `toISOString()`: es UTC y de noche
 *  (UTC-3) adelanta un día — un aviso vigente hasta hoy se vería vencido. */
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Estado = 'vigente' | 'programado' | 'vencido' | 'bajado';

/** El estado NO es un campo: sale de la vigencia. */
function estadoDe(a: Aviso): Estado {
  const hoy = hoyISO();
  if (!a.activo) return 'bajado';
  if (a.fecha_hasta && a.fecha_hasta < hoy) return 'vencido';
  if (a.fecha_desde && a.fecha_desde > hoy) return 'programado';
  return 'vigente';
}

const ESTADO_LABEL: Record<Estado, string> = {
  vigente: 'Vigente',
  programado: 'Programado',
  vencido: 'Vencido',
  bajado: 'Bajado',
};

const ESTADO_TONE: Record<Estado, ChipTone> = {
  vigente: 'green',
  programado: 'amber',
  vencido: 'gray',
  bajado: 'gray',
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${a}`;
};

const vigenciaTexto = (a: Aviso) => {
  const desde = fmtFecha(a.fecha_desde);
  const hasta = fmtFecha(a.fecha_hasta);
  if (desde && hasta) return `Del ${desde} al ${hasta}`;
  if (hasta) return `Hasta el ${hasta}`;
  if (desde) return `Desde el ${desde}`;
  return 'Sin vencimiento';
};

export default function Avisos() {
  const { theme } = useTheme();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoTab, setEstadoTab] = useState('todos');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Aviso | null>(null);
  const [aAvisar, setAAvisar] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await noticiasApi.getAll();
      setAvisos((res.data as Aviso[]) || []);
    } catch {
      toast.error('No se pudieron cargar los avisos');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const vigentes = useMemo(() => avisos.filter((a) => estadoDe(a) === 'vigente'), [avisos]);
  const sinAvisar = useMemo(
    () => avisos.filter((a) => !a.enviado_at && estadoDe(a) === 'vigente'),
    [avisos],
  );
  const alcanzados = useMemo(
    () => avisos.reduce((s, a) => s + (a.enviados_count || 0), 0),
    [avisos],
  );

  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return avisos.filter((a) => {
      if (estadoTab === 'vigentes' && estadoDe(a) !== 'vigente') return false;
      if (estadoTab === 'sin-avisar' && (a.enviado_at || estadoDe(a) !== 'vigente')) return false;
      if (estadoTab === 'terminados' && !['vencido', 'bajado'].includes(estadoDe(a))) return false;
      if (!s) return true;
      return a.titulo.toLowerCase().includes(s) || a.descripcion.toLowerCase().includes(s);
    });
  }, [avisos, search, estadoTab]);

  // El hero habla del canal, no de la tabla: lo que importa es si el vecino se
  // está enterando. Sin avisos cargados, la frase lo dice sin enunciar ceros.
  const heroFrases = useMemo(() => {
    if (avisos.length === 0) {
      return [{
        segmentos: [
          seg('Todavía no publicaste ningún aviso:'),
          seg('el vecino no está recibiendo novedades del municipio.', 'advertencia'),
        ],
      }];
    }
    if (sinAvisar.length > 0) {
      return [{
        segmentos: [
          seg(
            `${sinAvisar.length} ${sinAvisar.length === 1 ? 'aviso vigente todavía no se notificó' : 'avisos vigentes todavía no se notificaron'}`,
            'advertencia',
          ),
          seg('al celular del vecino.'),
        ],
      }];
    }
    return [{
      segmentos: [
        seg(`${vigentes.length} ${vigentes.length === 1 ? 'aviso vigente' : 'avisos vigentes'}`, 'bueno'),
        seg('en la app del vecino, todos notificados.'),
      ],
    }];
  }, [avisos.length, sinAvisar.length, vigentes.length]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Vigentes', valor: String(vigentes.length) },
    { etiqueta: 'Sin avisar', valor: String(sinAvisar.length) },
    { etiqueta: 'Publicados', valor: String(avisos.length) },
    { etiqueta: 'Vecinos alcanzados', valor: String(alcanzados) },
  ]), [vigentes.length, sinAvisar.length, avisos.length, alcanzados]);

  const columnas = useMemo<ColumnSpec<Aviso>[]>(() => [
    {
      id: 'titulo',
      header: 'Aviso',
      width: 'minmax(220px, 2fr)',
      kind: 'entity',
      cell: (a) => (
        <EntityCell
          icon={a.fijado ? Pin : Megaphone}
          title={a.titulo}
          subtitle={a.descripcion}
        />
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      width: 'minmax(120px, 0.8fr)',
      kind: 'chip',
      cell: (a) => {
        const e = estadoDe(a);
        return <ChipEstado label={ESTADO_LABEL[e]} tone={ESTADO_TONE[e]} />;
      },
    },
    {
      id: 'vigencia',
      header: 'Vigencia',
      width: 'minmax(150px, 1fr)',
      kind: 'text',
      cell: (a) => vigenciaTexto(a),
    },
    {
      id: 'avisado',
      header: 'Avisado',
      width: 'minmax(120px, 0.8fr)',
      align: 'right',
      kind: 'text',
      cell: (a) =>
        a.enviado_at
          ? `${a.enviados_count} ${a.enviados_count === 1 ? 'vecino' : 'vecinos'}`
          : 'todavía no',
    },
    { id: 'acciones', header: '', width: '52px', kind: 'actions' },
  ], []);

  const abrirNuevo = () => {
    setEditId(null);
    setForm(FORM_VACIO);
    setSheetOpen(true);
  };

  const abrirEdicion = (a: Aviso) => {
    setEditId(a.id);
    setForm({
      titulo: a.titulo,
      descripcion: a.descripcion,
      tipo: a.tipo,
      fecha_desde: a.fecha_desde || '',
      fecha_hasta: a.fecha_hasta || '',
      fijado: a.fijado,
      activo: a.activo,
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.titulo.trim() || !form.descripcion.trim()) {
      toast.error('El aviso necesita título y texto');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        tipo: form.tipo,
        fecha_desde: form.fecha_desde || null,
        fecha_hasta: form.fecha_hasta || null,
        fijado: form.fijado,
        ...(editId ? { activo: form.activo } : {}),
      };
      if (editId) await noticiasApi.update(editId, payload);
      else await noticiasApi.create(payload);
      toast.success(editId ? 'Aviso actualizado' : 'Aviso publicado');
      setSheetOpen(false);
      await cargar();
    } catch {
      toast.error('No se pudo guardar el aviso');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    try {
      await noticiasApi.delete(aBorrar.id);
      toast.success('Aviso eliminado');
      setABorrar(null);
      await cargar();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const avisar = async () => {
    if (!aAvisar) return;
    setEnviando(true);
    try {
      const { data } = await noticiasApi.enviar(aAvisar.id);
      if (data.ya_enviado) toast.info(`Ya se había avisado a ${data.enviados} vecinos`);
      else if (data.enviados === 0) toast.info('Ningún vecino tiene las notificaciones activadas todavía');
      else toast.success(`Avisado a ${data.enviados} ${data.enviados === 1 ? 'vecino' : 'vecinos'}`);
      setAAvisar(null);
      await cargar();
    } catch {
      toast.error('No se pudo enviar el aviso');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <SemanticAbmPage<Aviso>
        moduleKey="comunicacion"
        eyebrow="Comunicación"
        title="Avisos"
        description="Lo que el municipio le cuenta al vecino sin que el vecino pregunte."
        hero={{
          etiqueta: 'COMUNICACIÓN',
          frases: heroFrases,
          kpis: heroKpis,
        }}
        pista={{
          titulo: 'El aviso se apaga solo',
          texto:
            'Poniéndole fecha de fin, el aviso desaparece del celular del vecino cuando corresponde. Sin fecha, queda hasta que lo bajes.',
        }}
        searchPlaceholder="Buscar por título o texto…"
        views={['table']}
        activeView="table"
        // Una sola vista: el segmented no se dibuja y el handler no se llama.
        onViewChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Nuevo aviso', onClick: abrirNuevo }}
        selects={[]}
        statusTabs={[
          { id: 'todos', label: 'Todos', count: avisos.length },
          { id: 'vigentes', label: 'Vigentes', count: vigentes.length },
          { id: 'sin-avisar', label: 'Sin avisar', count: sinAvisar.length },
          {
            id: 'terminados',
            label: 'Terminados',
            count: avisos.filter((a) => ['vencido', 'bajado'].includes(estadoDe(a))).length,
          },
        ]}
        activeStatus={estadoTab}
        onStatusChange={setEstadoTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(a) => a.id}
        rowActions={[
          { id: 'edit', label: 'Editar', icon: Pencil, onClick: abrirEdicion },
          {
            id: 'avisar',
            label: 'Avisar a los vecinos',
            icon: Send,
            onClick: (a: Aviso) => setAAvisar(a),
          },
          { id: 'del', label: 'Eliminar', icon: Trash2, danger: true, onClick: (a: Aviso) => setABorrar(a) },
        ]}
        onRowClick={abrirEdicion}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Ningún aviso coincide con "${search.trim()}".`
            : 'Todavía no publicaste ningún aviso. Lo que escribas acá le aparece al vecino en la app: un corte de agua, una obra que arranca, el cambio de cronograma.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${avisos.length}`,
          note: 'Avisar manda una notificación al celular de todos los vecinos del municipio. Se hace una sola vez por aviso y no se puede deshacer.',
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editId ? 'Editar aviso' : 'Nuevo aviso'}
        description={
          editId
            ? 'Cambiá el texto o la vigencia y guardá.'
            : 'Escribí lo que querés que le llegue al vecino.'
        }
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
              {editId ? 'Guardar cambios' : 'Publicar aviso'}
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Título
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Corte de agua en el centro"
              maxLength={200}
              className="w-full px-3 py-2 rounded-xl border text-base outline-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Texto
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Mañana de 8 a 14 no va a haber agua por una reparación en la red."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border text-base outline-none resize-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Este texto es el que le llega al celular: corto y concreto.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Tipo
            </label>
            <ModernSelect
              options={TIPOS}
              value={form.tipo}
              onChange={(v) => setForm((f) => ({ ...f, tipo: v as FormState['tipo'] }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Desde
              </label>
              <DatePicker
                value={form.fecha_desde}
                onChange={(v) => setForm((f) => ({ ...f, fecha_desde: v || '' }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Hasta
              </label>
              <DatePicker
                value={form.fecha_hasta}
                onChange={(v) => setForm((f) => ({ ...f, fecha_hasta: v || '' }))}
              />
            </div>
          </div>
          <p className="text-[11px] -mt-2" style={{ color: theme.textSecondary }}>
            Sin fechas, el aviso queda hasta que lo bajes. Con fecha de fin, se apaga solo.
          </p>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.fijado}
              onChange={(e) => setForm((f) => ({ ...f, fijado: e.target.checked }))}
              className="w-4 h-4"
            />
            <span className="text-sm" style={{ color: theme.text }}>Fijar arriba de todo</span>
          </label>

          {editId !== null && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm" style={{ color: theme.text }}>Visible para el vecino</span>
            </label>
          )}
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={borrar}
        title="Eliminar el aviso"
        message={`"${aBorrar?.titulo}" se borra del feed del vecino. Si sólo querés que deje de verse, destildá "Visible para el vecino".`}
        confirmText="Eliminar"
        variant="danger"
      />

      <ConfirmModal
        isOpen={aAvisar !== null}
        onClose={() => setAAvisar(null)}
        onConfirm={avisar}
        loading={enviando}
        title="Avisar a los vecinos"
        message={`Les va a llegar "${aAvisar?.titulo}" como notificación al celular. Se manda una sola vez y no se puede deshacer.`}
        confirmText="Avisar"
        variant="info"
      />
    </>
  );
}
