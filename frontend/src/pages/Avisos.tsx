/**
 * COMUNICACIÓN — todo lo que el municipio le muestra al vecino, en UNA pantalla.
 *
 * El feed del vecino tiene tres bloques, y los tres son la misma cosa: una
 * imagen, un título y una descripción. Por eso se cargan acá y no en tres
 * pantallas distintas. Lo único que cambia es DÓNDE aparece cada publicación:
 *
 *   Destacado → el banner grande de arriba (rota si hay varios)
 *   Novedad   → las tarjetas del medio
 *   Obra      → el bloque de obras, con su avance
 *
 * LAS OBRAS VIENEN PRECARGADAS. No se escriben acá: Tesorería las carga como
 * proyectos —con sus gastos imputados— y aparecen en esta lista esperando
 * decisión. **Comunicación decide cuáles publica y cuáles no.** Así el que
 * comunica no entra al módulo de la plata, y la obra sigue siendo un solo
 * registro en el sistema.
 *
 * Dos reglas más que se ven en la pantalla:
 *  - **La vigencia hace el estado.** El aviso del corte de agua se apaga solo
 *    el día que pasa: se deduce de las fechas, no es un campo que alguien
 *    tenga que acordarse de bajar.
 *  - **Avisar es irreversible.** El push le llega a todo el municipio: pide
 *    confirmación y después queda como constancia.
 */
import { useEffect, useMemo, useState } from 'react';
import { Hammer, Loader2, Megaphone, Pencil, Pin, Send, Trash2 } from 'lucide-react';
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
import { noticiasApi, proyectosApi } from '../lib/api';

/** Una publicación del feed. `origen` dice de qué tabla salió: las novedades
 *  viven en `noticias`, las obras en `proyectos` (Tesorería). El resto de la
 *  pantalla las trata igual. */
interface Publicacion {
  id: number;
  origen: 'noticia' | 'obra';
  titulo: string;
  descripcion: string;
  imagen_url: string | null;
  /** destacado | novedad | obra */
  tipo: string;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  activo: boolean;
  enviado_at: string | null;
  enviados_count: number;
  avance: number | null;
  estado_obra: string | null;
  /** Sólo obras: si Comunicación ya decidió publicarla. */
  publicada: boolean;
}

const TIPOS: SelectOption[] = [
  { value: 'destacado', label: 'Destacado', description: 'El banner grande de arriba. Si hay varios, van rotando' },
  { value: 'novedad', label: 'Novedad', description: 'Las tarjetas del medio del feed' },
];

const ESTADOS_OBRA: SelectOption[] = [
  { value: 'por_empezar', label: 'Por empezar' },
  { value: 'en_ejecucion', label: 'En ejecución' },
  { value: 'terminada', label: 'Terminada' },
];

type FormState = {
  titulo: string;
  descripcion: string;
  imagen_url: string;
  tipo: string;
  fecha_desde: string;
  fecha_hasta: string;
  activo: boolean;
  avance: string;
  estado_obra: string;
  publicada: boolean;
};

const FORM_VACIO: FormState = {
  titulo: '', descripcion: '', imagen_url: '', tipo: 'novedad',
  fecha_desde: '', fecha_hasta: '', activo: true,
  avance: '', estado_obra: 'en_ejecucion', publicada: false,
};

/** 'YYYY-MM-DD' de hoy en hora LOCAL. Nunca `toISOString()`: es UTC y de noche
 *  (UTC-3) adelanta un día — un aviso vigente hasta hoy se vería vencido. */
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Estado = 'vigente' | 'programado' | 'vencido' | 'bajado' | 'sin-publicar';

function estadoDe(p: Publicacion): Estado {
  if (p.origen === 'obra' && !p.publicada) return 'sin-publicar';
  if (!p.activo) return 'bajado';
  if (p.fecha_hasta && p.fecha_hasta < hoyISO()) return 'vencido';
  if (p.fecha_desde && p.fecha_desde > hoyISO()) return 'programado';
  return 'vigente';
}

const ESTADO_LABEL: Record<Estado, string> = {
  vigente: 'Publicado', programado: 'Programado', vencido: 'Vencido',
  bajado: 'Bajado', 'sin-publicar': 'Sin publicar',
};

const ESTADO_TONE: Record<Estado, ChipTone> = {
  vigente: 'green', programado: 'amber', vencido: 'gray',
  bajado: 'gray', 'sin-publicar': 'blue',
};

const TIPO_LABEL: Record<string, string> = {
  destacado: 'Banner', novedad: 'Novedad', obra: 'Obra',
  // Lo cargado antes del cambio de nombres cae en Novedad.
  aviso: 'Novedad', noticia: 'Novedad', alerta: 'Novedad',
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${a}`;
};

const detalleDe = (p: Publicacion) => {
  if (p.origen === 'obra') {
    return p.avance !== null ? `${p.avance}% de avance` : 'sin avance cargado';
  }
  const desde = fmtFecha(p.fecha_desde);
  const hasta = fmtFecha(p.fecha_hasta);
  if (desde && hasta) return `Del ${desde} al ${hasta}`;
  if (hasta) return `Hasta el ${hasta}`;
  if (desde) return `Desde el ${desde}`;
  return 'Sin vencimiento';
};

export default function Avisos() {
  const { theme } = useTheme();
  const [items, setItems] = useState<Publicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editando, setEditando] = useState<Publicacion | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Publicacion | null>(null);
  const [aAvisar, setAAvisar] = useState<Publicacion | null>(null);
  const [enviando, setEnviando] = useState(false);

  /** Las dos fuentes, unificadas: las novedades que se escriben acá y las
   *  obras que Tesorería ya cargó, esperando decisión de publicarlas. */
  const cargar = async () => {
    setLoading(true);
    try {
      const [nRes, pRes] = await Promise.all([
        noticiasApi.getAll(),
        proyectosApi.list({ activo: true }).catch(() => ({ data: [] })),
      ]);

      const novedades: Publicacion[] = ((nRes.data as Record<string, unknown>[]) || []).map((n) => ({
        id: n.id as number,
        origen: 'noticia' as const,
        titulo: n.titulo as string,
        descripcion: (n.descripcion as string) || '',
        imagen_url: (n.imagen_url as string) ?? null,
        tipo: n.fijado ? 'destacado' : ((n.tipo as string) || 'novedad'),
        fecha_desde: (n.fecha_desde as string) ?? null,
        fecha_hasta: (n.fecha_hasta as string) ?? null,
        activo: Boolean(n.activo),
        enviado_at: (n.enviado_at as string) ?? null,
        enviados_count: (n.enviados_count as number) ?? 0,
        avance: null, estado_obra: null, publicada: true,
      }));

      const obras: Publicacion[] = ((pRes.data as Record<string, unknown>[]) || []).map((p) => ({
        id: p.id as number,
        origen: 'obra' as const,
        titulo: p.nombre as string,
        descripcion: (p.descripcion as string) || '',
        imagen_url: (p.foto_url as string) ?? null,
        tipo: 'obra',
        fecha_desde: null, fecha_hasta: null,
        activo: Boolean(p.activo),
        enviado_at: null, enviados_count: 0,
        avance: (p.avance as number) ?? null,
        estado_obra: (p.estado_obra as string) ?? null,
        publicada: Boolean(p.publico),
      }));

      setItems([...novedades, ...obras]);
    } catch {
      toast.error('No se pudieron cargar las comunicaciones');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const destacados = useMemo(() => items.filter((i) => i.tipo === 'destacado'), [items]);
  const novedades = useMemo(
    () => items.filter((i) => i.origen === 'noticia' && i.tipo !== 'destacado'), [items]);
  const obras = useMemo(() => items.filter((i) => i.origen === 'obra'), [items]);
  const sinPublicar = useMemo(() => obras.filter((o) => !o.publicada), [obras]);
  const sinAvisar = useMemo(
    () => items.filter((i) => i.origen === 'noticia' && !i.enviado_at && estadoDe(i) === 'vigente'),
    [items],
  );

  const visibles = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((i) => {
      if (tab === 'destacados' && i.tipo !== 'destacado') return false;
      if (tab === 'novedades' && !(i.origen === 'noticia' && i.tipo !== 'destacado')) return false;
      if (tab === 'obras' && i.origen !== 'obra') return false;
      if (tab === 'pendientes' && !(sinPublicar.includes(i) || sinAvisar.includes(i))) return false;
      if (!s) return true;
      return i.titulo.toLowerCase().includes(s) || i.descripcion.toLowerCase().includes(s);
    });
  }, [items, search, tab, sinPublicar, sinAvisar]);

  const pendientes = sinPublicar.length + sinAvisar.length;

  const heroFrases = useMemo(() => {
    if (items.length === 0) {
      return [{ segmentos: [
        seg('Todavía no publicaste nada:'),
        seg('el vecino no está recibiendo novedades del municipio.', 'advertencia'),
      ] }];
    }
    if (pendientes > 0) {
      return [{ segmentos: [
        seg(`${pendientes} ${pendientes === 1 ? 'publicación espera' : 'publicaciones esperan'} una decisión`, 'advertencia'),
        seg('— obras sin publicar o novedades sin notificar.'),
      ] }];
    }
    const alAire = destacados.length + novedades.length + obras.filter((o) => o.publicada).length;
    return [{ segmentos: [
      seg(`${alAire} ${alAire === 1 ? 'publicación' : 'publicaciones'} al aire`, 'bueno'),
      seg('en la app del vecino.'),
    ] }];
  }, [items.length, pendientes, destacados.length, novedades.length, obras]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'En el banner', valor: String(destacados.length) },
    { etiqueta: 'Novedades', valor: String(novedades.length) },
    { etiqueta: 'Obras publicadas', valor: String(obras.filter((o) => o.publicada).length) },
    { etiqueta: 'Esperan decisión', valor: String(pendientes) },
  ]), [destacados.length, novedades.length, obras, pendientes]);

  const columnas = useMemo<ColumnSpec<Publicacion>[]>(() => [
    {
      id: 'titulo',
      header: 'Publicación',
      width: 'minmax(220px, 2fr)',
      kind: 'entity',
      cell: (p) => (
        <EntityCell
          icon={p.origen === 'obra' ? Hammer : p.tipo === 'destacado' ? Pin : Megaphone}
          title={p.titulo}
          subtitle={p.descripcion || undefined}
        />
      ),
    },
    {
      id: 'donde',
      header: 'Dónde sale',
      width: 'minmax(110px, 0.8fr)',
      kind: 'text',
      cell: (p) => TIPO_LABEL[p.tipo] || 'Novedad',
    },
    {
      id: 'estado',
      header: 'Estado',
      width: 'minmax(120px, 0.8fr)',
      kind: 'chip',
      cell: (p) => {
        const e = estadoDe(p);
        return <ChipEstado label={ESTADO_LABEL[e]} tone={ESTADO_TONE[e]} />;
      },
    },
    {
      id: 'detalle',
      header: 'Vigencia / avance',
      width: 'minmax(150px, 1fr)',
      kind: 'text',
      cell: (p) => detalleDe(p),
    },
    {
      id: 'avisado',
      header: 'Avisado',
      width: 'minmax(110px, 0.7fr)',
      align: 'right',
      kind: 'text',
      cell: (p) => p.origen === 'obra' ? '—'
        : p.enviado_at ? `${p.enviados_count} ${p.enviados_count === 1 ? 'vecino' : 'vecinos'}` : 'todavía no',
    },
    { id: 'acciones', header: '', width: '52px', kind: 'actions' },
  ], []);

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setSheetOpen(true);
  };

  const abrirEdicion = (p: Publicacion) => {
    setEditando(p);
    setForm({
      titulo: p.titulo,
      descripcion: p.descripcion,
      imagen_url: p.imagen_url || '',
      tipo: p.tipo,
      fecha_desde: p.fecha_desde || '',
      fecha_hasta: p.fecha_hasta || '',
      activo: p.activo,
      avance: p.avance !== null ? String(p.avance) : '',
      estado_obra: p.estado_obra || 'en_ejecucion',
      publicada: p.publicada,
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.titulo.trim()) { toast.error('Falta el título'); return; }
    setGuardando(true);
    try {
      if (editando?.origen === 'obra') {
        // La obra se edita EN SU PROYECTO: acá no se crea una copia.
        await proyectosApi.update(editando.id, {
          publico: form.publicada,
          estado_obra: form.estado_obra,
          avance: form.avance ? Number(form.avance) : null,
          foto_url: form.imagen_url.trim() || null,
          descripcion: form.descripcion.trim() || null,
        });
        toast.success(form.publicada ? 'La obra ya se ve en la app del vecino' : 'La obra dejó de publicarse');
      } else {
        const payload = {
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim(),
          imagen_url: form.imagen_url.trim() || null,
          tipo: form.tipo,
          fijado: form.tipo === 'destacado',
          fecha_desde: form.fecha_desde || null,
          fecha_hasta: form.fecha_hasta || null,
          ...(editando ? { activo: form.activo } : {}),
        };
        if (editando) await noticiasApi.update(editando.id, payload);
        else await noticiasApi.create(payload);
        toast.success(editando ? 'Publicación actualizada' : 'Publicada');
      }
      setSheetOpen(false);
      await cargar();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    try {
      if (aBorrar.origen === 'obra') {
        // Una obra NO se borra desde acá: se deja de publicar. Borrarla sería
        // borrar el proyecto de Tesorería con sus gastos imputados.
        await proyectosApi.update(aBorrar.id, { publico: false });
        toast.success('La obra dejó de publicarse');
      } else {
        await noticiasApi.delete(aBorrar.id);
        toast.success('Publicación eliminada');
      }
      setABorrar(null);
      await cargar();
    } catch {
      toast.error('No se pudo completar');
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
      toast.error('No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  const esObra = editando?.origen === 'obra';

  return (
    <>
      <SemanticAbmPage<Publicacion>
        moduleKey="comunicacion"
        eyebrow="Comunicación"
        title="Publicaciones"
        description="Todo lo que el vecino ve en su app, en un solo lugar."
        hero={{ etiqueta: 'COMUNICACIÓN', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'Las obras las carga Tesorería',
          texto:
            'Las obras aparecen acá solas, tomadas de los proyectos de Tesorería. Comunicación decide cuáles se publican y les pone la foto y el avance. La obra sigue siendo una sola en el sistema.',
        }}
        searchPlaceholder="Buscar por título o texto…"
        views={['table']}
        activeView="table"
        onViewChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Nueva publicación', onClick: abrirNuevo }}
        selects={[]}
        statusTabs={[
          { id: 'todos', label: 'Todo', count: items.length },
          { id: 'destacados', label: 'Banner', count: destacados.length },
          { id: 'novedades', label: 'Novedades', count: novedades.length },
          { id: 'obras', label: 'Obras', count: obras.length },
          { id: 'pendientes', label: 'Esperan decisión', count: pendientes },
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(p) => `${p.origen}-${p.id}`}
        rowActions={[
          { id: 'edit', label: 'Editar', icon: Pencil, onClick: abrirEdicion },
          {
            id: 'avisar',
            label: 'Avisar a los vecinos',
            icon: Send,
            onClick: (p: Publicacion) => {
              if (p.origen === 'obra') {
                toast.info('Las obras no se notifican: se ven en el bloque de obras de la app.');
                return;
              }
              setAAvisar(p);
            },
          },
          {
            id: 'del',
            label: 'Quitar del feed',
            icon: Trash2,
            danger: true,
            onClick: (p: Publicacion) => setABorrar(p),
          },
        ]}
        onRowClick={abrirEdicion}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Nada coincide con "${search.trim()}".`
            : tab === 'obras'
              ? 'No hay obras cargadas. Las carga Tesorería como proyectos y aparecen acá para publicar.'
            : tab === 'destacados'
              ? 'Nada en el banner. Lo que marques como Destacado rota arriba de todo en la app del vecino.'
            : tab === 'pendientes'
              ? 'No hay nada esperando decisión.'
            : 'Todavía no publicaste nada. Lo que cargues acá le aparece al vecino en la app.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${items.length}`,
          note: 'Avisar manda una notificación al celular de todos los vecinos, una sola vez por publicación. Las obras no se notifican.',
        }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={esObra ? 'Publicar la obra' : editando ? 'Editar publicación' : 'Nueva publicación'}
        description={
          esObra
            ? 'Esta obra la cargó Tesorería. Acá decidís si el vecino la ve y con qué foto.'
            : 'Una imagen, un título y un texto. El tipo decide dónde aparece.'
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
              {esObra ? 'Guardar' : editando ? 'Guardar cambios' : 'Publicar'}
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          {!esObra && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Dónde aparece
              </label>
              <ModernSelect
                options={TIPOS}
                value={form.tipo}
                onChange={(v) => setForm((f) => ({ ...f, tipo: v }))}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Título
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              disabled={esObra}
              placeholder="Corte de agua en el centro"
              maxLength={200}
              className="w-full px-3 py-2 rounded-xl border text-base outline-none disabled:opacity-60"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
            {esObra && (
              <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                El nombre de la obra se cambia en Tesorería, para que no queden dos nombres distintos.
              </p>
            )}
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
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Imagen
            </label>
            <input
              type="url"
              value={form.imagen_url}
              onChange={(e) => setForm((f) => ({ ...f, imagen_url: e.target.value }))}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-xl border text-base outline-none"
              style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
            />
            {form.imagen_url.trim() && (
              <img
                src={form.imagen_url}
                alt=""
                className="mt-2 w-full h-32 object-cover rounded-xl"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Sin imagen la publicación sale igual, con el ícono del municipio.
            </p>
          </div>

          {esObra ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Cómo viene
                  </label>
                  <ModernSelect
                    options={ESTADOS_OBRA}
                    value={form.estado_obra}
                    onChange={(v) => setForm((f) => ({ ...f, estado_obra: v }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Avance (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.avance}
                    onChange={(e) => setForm((f) => ({ ...f, avance: e.target.value }))}
                    placeholder="60"
                    className="w-full px-3 py-2 rounded-xl border text-base outline-none"
                    style={{ backgroundColor: theme.background, borderColor: theme.border, color: theme.text }}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.publicada}
                  onChange={(e) => setForm((f) => ({ ...f, publicada: e.target.checked }))}
                  className="w-4 h-4"
                />
                <span className="text-sm" style={{ color: theme.text }}>
                  Mostrar esta obra al vecino
                  <span className="block text-[11px]" style={{ color: theme.textSecondary }}>
                    Sin tildar, la obra sigue en Tesorería pero no se ve en la app.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <>
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
                Sin fechas queda hasta que la bajes. Con fecha de fin, se apaga sola.
              </p>

              {editando && (
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
            </>
          )}
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={borrar}
        title={aBorrar?.origen === 'obra' ? 'Dejar de publicar la obra' : 'Eliminar la publicación'}
        message={
          aBorrar?.origen === 'obra'
            ? `"${aBorrar?.titulo}" deja de verse en la app. La obra y sus gastos siguen en Tesorería.`
            : `"${aBorrar?.titulo}" se borra del feed del vecino.`
        }
        confirmText={aBorrar?.origen === 'obra' ? 'Dejar de publicar' : 'Eliminar'}
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
