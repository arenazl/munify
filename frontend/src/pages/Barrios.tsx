/**
 * Barrios — el nivel fino del territorio (municipio -> zona -> barrio).
 *
 * Vive en Configuración > Municipio, entre Zonas y Parajes. Los barrios
 * vienen del mapa (la cartografía offline los trae con su contorno al dar de
 * alta la ciudad); lo que el municipio decide es a qué ZONA pertenece cada
 * uno — por eso el dato editable central acá es la zona, no la geometría.
 *
 * Datos que consume: GET /barrios (con zona_nombre, reclamos_count y
 * tiene_contorno ya calculados) y GET /zonas para el combo de zona.
 *
 * Why (dueño, 2026-09-02, prueba de Rosario en QA): con el modelo nuevo una
 * ciudad nace con una sola zona y 40 barrios adentro, y ninguna pantalla los
 * mostraba — "invisibles en toda la app".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Map, MapPin, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { barriosApi, zonasApi } from '../lib/api';
import type { BarrioMunicipio } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect } from '../components/ui/ModernSelect';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import { useEmbed, useReportarTotal } from '../components/abmv2/useEmbed';
import { seg } from '../lib/semanticHero';
import type { HeroFrase, HeroKpi } from '../lib/semanticHero';
import type { ColumnSpec, ViewKind } from '../components/abmv2/types';
import type { Zona } from '../types';

/** Valor del combo para "sin zona" (ModernSelect trabaja con strings). */
const SIN_ZONA = '0';

const FORM_VACIO = {
  nombre: '',
  zona_id: SIN_ZONA,
  tipo: '',
  latitud: '',
  longitud: '',
};

const errorDetalle = (error: unknown, fallback: string) => {
  const e = error as { response?: { data?: { detail?: unknown } } };
  const d = e?.response?.data?.detail;
  return typeof d === 'string' && d ? d : fallback;
};

export default function Barrios() {
  const { theme } = useTheme();
  const { embedded } = useEmbed();

  const [barrios, setBarrios] = useState<BarrioMunicipio[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [estadoTab, setEstadoTab] = useState('todos');
  const [zonaFiltro, setZonaFiltro] = useState('todas');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [seleccionado, setSeleccionado] = useState<BarrioMunicipio | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);

  const [aBorrar, setABorrar] = useState<BarrioMunicipio | null>(null);
  const [borrando, setBorrando] = useState(false);

  useReportarTotal(barrios.length);

  const fetchTodo = useCallback(async () => {
    setLoading(true);
    try {
      const [rb, rz] = await Promise.all([barriosApi.getAll(), zonasApi.getAll()]);
      setBarrios(rb.data || []);
      setZonas(rz.data || []);
    } catch (error) {
      toast.error('Error al cargar barrios');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodo();
  }, [fetchTodo]);

  /* --- Alta / edición ------------------------------------------------- */

  const openSheet = useCallback((barrio: BarrioMunicipio | null = null) => {
    setSeleccionado(barrio);
    setFormData(
      barrio
        ? {
            nombre: barrio.nombre,
            zona_id: barrio.zona_id != null ? String(barrio.zona_id) : SIN_ZONA,
            tipo: barrio.tipo || '',
            latitud: barrio.latitud?.toString() || '',
            longitud: barrio.longitud?.toString() || '',
          }
        : {
            ...FORM_VACIO,
            // Con una sola zona no hay nada que elegir: el barrio nuevo nace adentro.
            zona_id: zonas.length === 1 ? String(zonas[0].id) : SIN_ZONA,
          },
    );
    setSheetOpen(true);
  }, [zonas]);

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const lat = formData.latitud ? parseFloat(formData.latitud) : null;
    const lon = formData.longitud ? parseFloat(formData.longitud) : null;
    if ((lat === null) !== (lon === null)) {
      toast.error('La ubicación lleva latitud y longitud juntas');
      return;
    }
    setSaving(true);
    const payload = {
      nombre: formData.nombre.trim(),
      zona_id: formData.zona_id === SIN_ZONA ? null : Number(formData.zona_id),
      tipo: formData.tipo.trim() || null,
      latitud: lat,
      longitud: lon,
    };
    try {
      if (seleccionado) {
        await barriosApi.update(seleccionado.id, payload);
        toast.success('Barrio actualizado');
      } else {
        await barriosApi.create(payload);
        toast.success('Barrio creado');
      }
      await fetchTodo();
      setSheetOpen(false);
      setSeleccionado(null);
    } catch (error) {
      toast.error(errorDetalle(error, 'No se pudo guardar el barrio'));
    } finally {
      setSaving(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await barriosApi.delete(aBorrar.id);
      toast.success('Barrio eliminado');
      setABorrar(null);
      await fetchTodo();
    } catch (error) {
      // 409 = tiene reclamos: el backend lo explica en el detail.
      toast.error(errorDetalle(error, 'No se pudo eliminar el barrio'));
    } finally {
      setBorrando(false);
    }
  };

  /* --- Derivados: los números del hero salen de acá ------------------- */

  const conZona = useMemo(() => barrios.filter((b) => b.zona_id != null).length, [barrios]);
  const sinZona = barrios.length - conZona;
  const conUbicacion = useMemo(
    () => barrios.filter((b) => b.latitud != null && b.longitud != null).length,
    [barrios],
  );
  const conContorno = useMemo(() => barrios.filter((b) => !!b.tiene_contorno).length, [barrios]);
  const sinContorno = barrios.length - conContorno;
  const totalReclamos = useMemo(
    () => barrios.reduce((acc, b) => acc + (b.reclamos_count ?? 0), 0),
    [barrios],
  );
  const conReclamos = useMemo(
    () => barrios.filter((b) => (b.reclamos_count ?? 0) > 0).length,
    [barrios],
  );
  const masCargado = useMemo(() => {
    if (barrios.length === 0) return null;
    const top = barrios.slice().sort((a, b) => (b.reclamos_count ?? 0) - (a.reclamos_count ?? 0))[0];
    return (top.reclamos_count ?? 0) > 0 ? top : null;
  }, [barrios]);
  const zonasConBarrios = useMemo(
    () => new Set(barrios.filter((b) => b.zona_id != null).map((b) => b.zona_id)).size,
    [barrios],
  );
  const zonaUnica = zonas.length === 1 ? zonas[0] : null;

  const heroKpis = useMemo<HeroKpi[]>(() => {
    if (loading || barrios.length === 0) return [];
    return [
      {
        etiqueta: 'Barrios',
        valor: barrios.length,
        sub: zonaUnica
          ? `todos en «${zonaUnica.nombre}»`
          : `en ${zonasConBarrios} zona${zonasConBarrios === 1 ? '' : 's'}`,
      },
      {
        etiqueta: 'Sin zona',
        valor: sinZona,
        sub: sinZona ? 'sus reclamos no tienen cuadrilla' : 'todos asignados',
        veredicto: sinZona > 0 ? 'advertencia' : undefined,
      },
      {
        etiqueta: 'Con contorno',
        valor: conContorno,
        sub: sinContorno ? `${sinContorno} sólo como punto` : 'se dibujan en el mapa',
      },
      {
        etiqueta: 'Con ubicación',
        valor: conUbicacion,
        sub: conUbicacion === barrios.length ? 'todos ubicados' : `de ${barrios.length}`,
        veredicto: conUbicacion < barrios.length ? 'advertencia' : undefined,
      },
      {
        etiqueta: 'Más reclamos',
        valor: masCargado ? (masCargado.reclamos_count ?? 0) : '—',
        sub: masCargado ? `${masCargado.nombre} · ${totalReclamos} en total` : 'sin reclamos todavía',
      },
    ];
  }, [
    loading, barrios.length, zonaUnica, zonasConBarrios, sinZona, conContorno, sinContorno,
    conUbicacion, masCargado, totalReclamos,
  ]);

  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (loading) return [];
    if (barrios.length === 0) {
      return [
        {
          segmentos: [
            seg('Todavía no hay barrios', 'malo'),
            seg(': sin barrios, el mapa no puede decir dónde crece el trabajo ni qué lugar quedó sin atender.'),
          ],
          acciones: [{ label: 'Cargar el primero', onClick: () => openSheet(), primaria: true }],
        },
      ];
    }
    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${barrios.length} barrio${barrios.length === 1 ? '' : 's'}`, 'bueno'),
          seg(
            zonaUnica
              ? `, todos adentro de «${zonaUnica.nombre}». Cuando crees la segunda zona, desde acá los repartís.`
              : `, repartidos en ${zonasConBarrios} zona${zonasConBarrios === 1 ? '' : 's'}.`,
          ),
          ...(sinZona > 0
            ? [
                seg(` Hay ${sinZona} sin zona`, 'advertencia'),
                seg(': los reclamos de ahí entran sin cuadrilla.'),
              ]
            : []),
        ],
      },
    ];
    if (sinContorno > 0) {
      frases.push({
        segmentos: [
          seg(`${sinContorno} barrio${sinContorno === 1 ? '' : 's'} sin contorno`, 'advertencia'),
          seg(': en el mapa aparecen como un punto, no como un área. El contorno lo trae la cartografía; no se dibuja a mano.'),
        ],
      });
    }
    if (masCargado) {
      frases.push({
        segmentos: [
          seg(`«${masCargado.nombre}» concentra ${masCargado.reclamos_count} reclamos`),
          seg(
            conReclamos < barrios.length
              ? ` y ${barrios.length - conReclamos} barrios no recibieron ninguno.`
              : ' — es donde más se pide.',
          ),
        ],
      });
    }
    return frases;
  }, [loading, barrios.length, zonaUnica, zonasConBarrios, sinZona, sinContorno, masCargado, conReclamos, openSheet]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return barrios.filter((b) => {
      if (zonaFiltro !== 'todas') {
        if (zonaFiltro === SIN_ZONA ? b.zona_id != null : String(b.zona_id) !== zonaFiltro) return false;
      }
      if (estadoTab === 'sin_zona' && b.zona_id != null) return false;
      if (estadoTab === 'sin_contorno' && b.tiene_contorno) return false;
      if (estadoTab === 'con_reclamos' && (b.reclamos_count ?? 0) === 0) return false;
      if (!q) return true;
      return (
        b.nombre.toLowerCase().includes(q) ||
        (b.zona_nombre ?? '').toLowerCase().includes(q) ||
        (b.tipo ?? '').toLowerCase().includes(q)
      );
    });
  }, [barrios, search, estadoTab, zonaFiltro]);

  const opcionesZona = useMemo(
    () => zonas.map((z) => ({ value: String(z.id), label: z.nombre })),
    [zonas],
  );

  const columnas = useMemo<ColumnSpec<BarrioMunicipio>[]>(
    () => [
      {
        id: 'nombre',
        header: 'Barrio',
        width: 'minmax(200px, 1.6fr)',
        kind: 'entity',
        cell: (b) => <EntityCell icon={MapPin} title={b.nombre} subtitle={b.tipo || undefined} />,
      },
      {
        id: 'zona',
        header: 'Zona',
        width: 'minmax(120px, 1fr)',
        kind: 'text',
        cell: (b) =>
          b.zona_nombre ? (
            <span>{b.zona_nombre}</span>
          ) : (
            <MetricCell value="sin zona" veredicto="advertencia" />
          ),
      },
      {
        id: 'reclamos',
        header: 'Reclamos',
        width: 'minmax(100px, 0.7fr)',
        align: 'right',
        kind: 'metric',
        cell: (b) => {
          const n = b.reclamos_count;
          if (typeof n !== 'number') return <MetricCell value="—" note="sin dato" muted />;
          return <MetricCell value={String(n)} note="recibidos" muted={n === 0} />;
        },
      },
      {
        id: 'mapa',
        header: 'En el mapa',
        width: 'minmax(110px, 0.7fr)',
        align: 'right',
        kind: 'metric',
        cell: (b) =>
          b.tiene_contorno ? (
            <MetricCell value="área" note="con contorno" />
          ) : b.latitud != null && b.longitud != null ? (
            <MetricCell value="punto" note="sin contorno" muted />
          ) : (
            <MetricCell value="—" note="sin ubicación" veredicto="advertencia" />
          ),
      },
      { id: 'acciones', header: 'Acciones', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
    ],
    [],
  );

  return (
    <>
      <SemanticAbmPage<BarrioMunicipio>
        moduleKey="barrios"
        eyebrow="Catálogos · Territorio"
        title="Barrios"
        description="Los lugares del municipio, adentro de cada zona."
        hero={{
          etiqueta: 'CATÁLOGOS · TERRITORIO',
          frases: heroFrases,
          kpis: heroKpis,
        }}
        pista={{
          titulo: 'Los barrios vienen del mapa',
          texto:
            'La cartografía los trae con su contorno cuando la ciudad se da de alta. Acá se corrige el nombre, se cambia de zona o se agrega uno que el mapa no conocía. El contorno no se edita: se ve en el mapa.',
          accion: embedded ? undefined : { label: 'Abrir el mapa', to: '/gestion/mapa' },
        }}
        searchPlaceholder="Buscar barrio o zona…"
        views={['table']}
        activeView={vista}
        onViewChange={setVista}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Nuevo barrio', onClick: () => openSheet() }}
        selects={
          zonas.length > 1
            ? [
                {
                  id: 'zona',
                  label: 'Zona',
                  value: zonaFiltro,
                  options: [
                    { value: 'todas', label: 'Todas' },
                    ...opcionesZona,
                    ...(sinZona > 0 ? [{ value: SIN_ZONA, label: 'Sin zona' }] : []),
                  ],
                  onChange: setZonaFiltro,
                },
              ]
            : []
        }
        statusTabs={[
          { id: 'todos', label: 'Todos', count: barrios.length },
          { id: 'sin_zona', label: 'Sin zona', count: sinZona },
          { id: 'sin_contorno', label: 'Sin contorno', count: sinContorno },
          { id: 'con_reclamos', label: 'Con reclamos', count: conReclamos },
        ]}
        activeStatus={estadoTab}
        onStatusChange={setEstadoTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(b) => b.id}
        rowActions={[
          { id: 'edit', label: 'Editar', icon: Pencil, onClick: (b) => openSheet(b) },
          { id: 'del', label: 'Eliminar', icon: Trash2, danger: true, onClick: (b) => setABorrar(b) },
        ]}
        onRowClick={(b) => openSheet(b)}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Ningún barrio coincide con "${search.trim()}".`
            : 'Todavía no hay barrios cargados.'
        }
        footer={{ showing: `Mostrando ${visibles.length} de ${barrios.length}` }}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={seleccionado ? 'Editar barrio' : 'Nuevo barrio'}
        description={
          seleccionado ? 'Corregí el nombre o cambialo de zona' : 'Un lugar que la cartografía no trajo'
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
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: 'var(--pl-on-accent)' }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="av2-campo-label">
              Nombre <span style={{ color: 'var(--pl-red)' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Ej: Barrio Belgrano"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          <div>
            <label className="av2-campo-label">Zona</label>
            <ModernSelect
              variant="v2"
              value={formData.zona_id}
              onChange={(v) => setFormData({ ...formData, zona_id: v })}
              options={[{ value: SIN_ZONA, label: 'Sin zona' }, ...opcionesZona]}
              placeholder="Elegí la zona"
            />
            {zonaUnica && (
              <p className="av2-campo-nota-larga">
                Hay una sola zona, «{zonaUnica.nombre}». Cuando crees la segunda, desde acá movés
                el barrio.
              </p>
            )}
          </div>

          <div>
            <label className="av2-campo-label">Tipo</label>
            <input
              type="text"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              placeholder="Ej: barrio, paraje, villa"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          <div>
            <label className="av2-campo-label">Ubicación</label>
            <div className="av2-campo-fila">
              <input
                type="number"
                step="any"
                value={formData.latitud}
                onChange={(e) => setFormData({ ...formData, latitud: e.target.value })}
                placeholder="Latitud"
                className="av2-campo-num"
                style={{ width: 140 }}
              />
              <input
                type="number"
                step="any"
                value={formData.longitud}
                onChange={(e) => setFormData({ ...formData, longitud: e.target.value })}
                placeholder="Longitud"
                className="av2-campo-num"
                style={{ width: 140 }}
              />
            </div>
            <p className="av2-campo-nota-larga">
              <Map size={13} strokeWidth={2} aria-hidden /> Es el punto con el que el mapa ubica el
              barrio. El contorno lo trae la cartografía, no se carga acá.
            </p>
          </div>
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!aBorrar}
        onClose={() => setABorrar(null)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        variant="danger"
        title="Eliminar barrio"
        message={
          aBorrar
            ? (aBorrar.reclamos_count ?? 0) > 0
              ? `"${aBorrar.nombre}" tiene ${aBorrar.reclamos_count} reclamos: no se puede borrar. Si sobra, cambialo de zona o renombralo.`
              : `Se va a eliminar "${aBorrar.nombre}". Si la cartografía lo trajo, no vuelve solo.`
            : ''
        }
        confirmText="Eliminar"
      />
    </>
  );
}
