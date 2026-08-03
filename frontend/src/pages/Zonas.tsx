/**
 * Zonas — cómo se divide el municipio para repartir el trabajo.
 *
 * ABM semántico del canvas de Configuración (`abmSpec.zonas`): eyebrow
 * "CATÁLOGOS · TERRITORIO", veredicto sobre la cobertura, cinco KPIs, la pista
 * de que el polígono se dibuja en el mapa, y la regla al pie.
 *
 * [2026-08-03] Migrada del `ABMPage` viejo (693 líneas con grilla de tarjetas,
 * sección de deshabilitados desplegable, paginación propia y tiles de
 * OpenStreetMap por tarjeta) al kit v2.
 *
 * Los números del hero salen de datos REALES que el listado ahora trae:
 * `reclamos_count` y `cuadrillas_count`, dos COUNT agrupados que se agregaron
 * al endpoint. El canvas pedía además "barrios cubiertos"; en el modelo un
 * barrio no cuelga de una zona, así que ese KPI no se dibuja en vez de
 * inventarlo — cuando exista la relación, entra sin tocar el layout.
 *
 * Se conserva lo que la pantalla vieja hacía bien: la validación de duplicados
 * con IA al escribir el nombre de una zona nueva.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Map, MapPin, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { zonasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell } from '../components/abmv2/DataTable';
import { MetricCell, Switch } from '../components/abmv2/Controls';
import { useEmbed, useReportarTotal } from '../components/abmv2/useEmbed';
import { seg } from '../lib/semanticHero';
import type { HeroFrase, HeroKpi } from '../lib/semanticHero';
import type { ColumnSpec, ViewKind } from '../components/abmv2/types';
import type { Zona } from '../types';

/** Respuesta de la validación de duplicados (endpoint /chat/validar-duplicado). */
interface ValidacionDuplicado {
  es_duplicado: boolean;
  similar_a: string | null;
  confianza: 'alta' | 'media' | 'baja';
  sugerencia: string;
}

/** El listado agrega estos dos conteos (ver schemas/zona.py). */
interface ZonaConPeso extends Zona {
  reclamos_count?: number | null;
  cuadrillas_count?: number | null;
}

const FORM_VACIO = {
  nombre: '',
  codigo: '',
  descripcion: '',
  latitud_centro: '',
  longitud_centro: '',
};

export default function Zonas() {
  const { theme } = useTheme();
  const { embedded } = useEmbed();

  const [zonas, setZonas] = useState<ZonaConPeso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [vista, setVista] = useState<ViewKind>('table');
  const [estadoTab, setEstadoTab] = useState('todos');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedZona, setSelectedZona] = useState<Zona | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);

  const [validando, setValidando] = useState(false);
  const [validacion, setValidacion] = useState<ValidacionDuplicado | null>(null);

  const [aBorrar, setABorrar] = useState<Zona | null>(null);
  const [borrando, setBorrando] = useState(false);

  useReportarTotal(zonas.length);

  const fetchZonas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await zonasApi.getAll();
      setZonas(response.data || []);
    } catch (error) {
      toast.error('Error al cargar zonas');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchZonas();
  }, [fetchZonas]);

  /* --- Alta / edición ------------------------------------------------- */

  /** Validación de duplicados con IA: sólo al crear, no al editar. */
  const validarDuplicado = async (nombre: string) => {
    if (!nombre.trim() || selectedZona) {
      setValidacion(null);
      return;
    }
    setValidando(true);
    try {
      const response = await api.post('/chat/validar-duplicado', {
        nombre: nombre.trim(),
        tipo: 'zona',
      });
      setValidacion(response.data);
    } catch (error) {
      console.error('Error validando duplicado:', error);
      setValidacion(null);
    } finally {
      setValidando(false);
    }
  };

  const openSheet = (zona: Zona | null = null) => {
    setValidacion(null);
    setValidando(false);
    setSelectedZona(zona);
    setFormData(
      zona
        ? {
            nombre: zona.nombre,
            codigo: zona.codigo || '',
            descripcion: zona.descripcion || '',
            latitud_centro: zona.latitud_centro?.toString() || '',
            longitud_centro: zona.longitud_centro?.toString() || '',
          }
        : FORM_VACIO,
    );
    setSheetOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    // Un duplicado con confianza alta se frena: dos zonas con el mismo nombre
    // parten los reclamos del mismo barrio en dos colas.
    if (!selectedZona && validacion?.es_duplicado && validacion.confianza === 'alta') {
      toast.error(`Ya existe una zona similar: "${validacion.similar_a}"`);
      return;
    }

    setSaving(true);
    const payload = {
      nombre: formData.nombre,
      codigo: formData.codigo || null,
      descripcion: formData.descripcion || null,
      latitud_centro: formData.latitud_centro ? parseFloat(formData.latitud_centro) : null,
      longitud_centro: formData.longitud_centro ? parseFloat(formData.longitud_centro) : null,
    };

    try {
      if (selectedZona) {
        await zonasApi.update(selectedZona.id, payload);
        toast.success('Zona actualizada');
      } else {
        await zonasApi.create(payload);
        toast.success('Zona creada');
      }
      await fetchZonas();
      setSheetOpen(false);
      setSelectedZona(null);
    } catch (error) {
      toast.error('Error al guardar la zona');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await zonasApi.delete(aBorrar.id);
      toast.success('Zona eliminada');
      setABorrar(null);
      await fetchZonas();
    } catch (error) {
      const detalle = (error as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      toast.error(detalle || 'Error al eliminar la zona');
    } finally {
      setBorrando(false);
    }
  };

  /** Activar/desactivar desde la lista, optimista y con rollback. */
  const alternarActivo = async (zona: ZonaConPeso, activo: boolean) => {
    setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, activo } : z)));
    try {
      await zonasApi.update(zona.id, { ...zona, activo });
    } catch {
      setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, activo: !activo } : z)));
      toast.error('No se pudo cambiar el estado');
    }
  };

  /* --- Derivados: los números del hero salen de acá ------------------- */

  const conCuadrilla = useMemo(
    () => zonas.filter((z) => (z.cuadrillas_count ?? 0) > 0).length,
    [zonas],
  );
  const sinCuadrilla = zonas.length - conCuadrilla;
  const hayPeso = zonas.some((z) => typeof z.reclamos_count === 'number');
  const totalReclamos = useMemo(
    () => zonas.reduce((acc, z) => acc + (z.reclamos_count ?? 0), 0),
    [zonas],
  );
  const sinReclamos = useMemo(
    () => (hayPeso ? zonas.filter((z) => (z.reclamos_count ?? 0) === 0).length : 0),
    [zonas, hayPeso],
  );
  const masCargada = useMemo(() => {
    if (!hayPeso || zonas.length === 0) return null;
    return zonas.slice().sort((a, b) => (b.reclamos_count ?? 0) - (a.reclamos_count ?? 0))[0];
  }, [zonas, hayPeso]);

  const heroKpis = useMemo<HeroKpi[]>(() => {
    if (loading || zonas.length === 0) return [];
    return [
      {
        etiqueta: 'Zonas',
        valor: zonas.length,
        sub: `${zonas.filter((z) => z.activo).length} activas`,
      },
      { etiqueta: 'Con cuadrilla', valor: conCuadrilla, sub: `de ${zonas.length} zonas` },
      {
        etiqueta: 'Sin cuadrilla',
        valor: sinCuadrilla,
        sub: sinCuadrilla ? 'los reclamos entran sin equipo' : 'todas cubiertas',
        veredicto: sinCuadrilla > 0 ? 'advertencia' : undefined,
      },
      {
        etiqueta: 'Reclamos',
        valor: hayPeso ? totalReclamos : '—',
        sub: hayPeso ? 'repartidos en el territorio' : 'sin dato de la API',
      },
      {
        etiqueta: 'Más cargada',
        valor: masCargada ? (masCargada.reclamos_count ?? 0) : '—',
        sub: masCargada ? masCargada.nombre : 'sin dato de la API',
      },
    ];
  }, [loading, zonas, conCuadrilla, sinCuadrilla, hayPeso, totalReclamos, masCargada]);

  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (loading) return [];
    if (zonas.length === 0) {
      return [
        {
          segmentos: [
            seg('Todavía no hay zonas', 'malo'),
            seg(': sin zonas, los reclamos entran sin territorio y nadie los reparte.'),
          ],
          acciones: [{ label: 'Crear la primera zona', onClick: () => openSheet(), primaria: true }],
        },
      ];
    }

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${zonas.length} zona${zonas.length === 1 ? '' : 's'}`, 'bueno'),
          seg(
            sinCuadrilla === 0
              ? ', todas con cuadrilla asignada.'
              : ` y ${conCuadrilla} con cuadrilla.`,
          ),
          ...(sinCuadrilla > 0
            ? [
                seg(` Hay ${sinCuadrilla} sin equipo`, 'advertencia'),
                seg(': los reclamos de ahí entran y no se despachan solos.'),
              ]
            : []),
        ],
      },
    ];

    if (masCargada && (masCargada.reclamos_count ?? 0) > 0) {
      frases.push({
        segmentos: [
          seg(`«${masCargada.nombre}» concentra ${masCargada.reclamos_count} reclamos`),
          seg(
            sinReclamos > 0
              ? ` y ${sinReclamos} zonas no recibieron ninguno: el territorio no está parejo.`
              : ' — es la que más trabajo genera.',
          ),
        ],
      });
    }
    return frases;
  }, [loading, zonas, conCuadrilla, sinCuadrilla, masCargada, sinReclamos]);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return zonas.filter((z) => {
      if (estadoTab === 'con' && (z.cuadrillas_count ?? 0) === 0) return false;
      if (estadoTab === 'sin' && (z.cuadrillas_count ?? 0) > 0) return false;
      if (estadoTab === 'inactivas' && z.activo) return false;
      if (!q) return true;
      return (
        z.nombre.toLowerCase().includes(q) ||
        (z.codigo ?? '').toLowerCase().includes(q) ||
        (z.descripcion ?? '').toLowerCase().includes(q)
      );
    });
  }, [zonas, search, estadoTab]);

  const columnas = useMemo<ColumnSpec<ZonaConPeso>[]>(
    () => [
      {
        id: 'nombre',
        header: 'Zona',
        width: 'minmax(200px, 1.6fr)',
        kind: 'entity',
        cell: (z) => (
          <EntityCell
            icon={MapPin}
            title={z.nombre}
            subtitle={z.descripcion || z.codigo || undefined}
          />
        ),
      },
      { id: 'codigo', header: 'Código', width: 'minmax(90px, 0.7fr)', kind: 'text' },
      {
        id: 'cuadrillas',
        header: 'Cuadrillas',
        width: 'minmax(100px, 0.7fr)',
        align: 'right',
        kind: 'metric',
        cell: (z) => {
          const n = z.cuadrillas_count ?? 0;
          return (
            <MetricCell
              value={String(n)}
              note={n === 0 ? 'sin equipo' : n === 1 ? 'asignada' : 'asignadas'}
              veredicto={n === 0 ? 'advertencia' : undefined}
            />
          );
        },
      },
      {
        id: 'reclamos',
        header: 'Reclamos',
        width: 'minmax(100px, 0.7fr)',
        align: 'right',
        kind: 'metric',
        cell: (z) => {
          const n = z.reclamos_count;
          if (typeof n !== 'number') return <MetricCell value="—" note="sin dato" muted />;
          return <MetricCell value={String(n)} note="recibidos" muted={n === 0} />;
        },
      },
      {
        id: 'activo',
        header: 'Estado',
        width: 'minmax(76px, 0.5fr)',
        align: 'right',
        cell: (z) => (
          <Switch
            checked={z.activo}
            ariaLabel={z.activo ? `Desactivar ${z.nombre}` : `Activar ${z.nombre}`}
            onChange={(v) => alternarActivo(z, v)}
          />
        ),
      },
      { id: 'acciones', header: 'Acciones', width: 'minmax(76px, 0.5fr)', kind: 'actions', align: 'right' },
    ],
    // Las columnas no dependen de nada que cambie su forma.
    [],
  );

  return (
    <>
      <SemanticAbmPage<ZonaConPeso>
        moduleKey="zonas"
        eyebrow="Catálogos · Territorio"
        title="Zonas"
        description="Cómo se divide el municipio para repartir el trabajo."
        hero={{
          etiqueta: 'CATÁLOGOS · TERRITORIO',
          frases: heroFrases,
          kpis: heroKpis,
        }}
        pista={{
          titulo: 'Las zonas se dibujan en el mapa',
          texto:
            'Acá se editan el nombre, el código y el estado. El área de cada zona se ajusta sobre el mapa, no en esta grilla.',
          accion: embedded ? undefined : { label: 'Abrir el mapa', to: '/gestion/mapa' },
        }}
        searchPlaceholder="Buscar zona, código o descripción…"
        views={['table']}
        activeView={vista}
        onViewChange={setVista}
        search={search}
        onSearchChange={setSearch}
        primaryAction={{ label: 'Nueva zona', onClick: () => openSheet() }}
        selects={[]}
        statusTabs={[
          { id: 'todos', label: 'Todas', count: zonas.length },
          { id: 'con', label: 'Con cuadrilla', count: conCuadrilla },
          { id: 'sin', label: 'Sin cuadrilla', count: sinCuadrilla },
          { id: 'inactivas', label: 'Inactivas', count: zonas.filter((z) => !z.activo).length },
        ]}
        activeStatus={estadoTab}
        onStatusChange={setEstadoTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(z) => z.id}
        rowActions={[
          { id: 'edit', label: 'Editar', icon: Pencil, onClick: (z) => openSheet(z) },
          { id: 'del', label: 'Eliminar', icon: Trash2, danger: true, onClick: (z) => setABorrar(z) },
        ]}
        onRowClick={(z) => openSheet(z)}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Ninguna zona coincide con "${search.trim()}".`
            : 'Todavía no hay zonas cargadas.'
        }
        footer={{
          showing: `Mostrando ${visibles.length} de ${zonas.length}`,
          note: 'Borrar una zona deja su territorio sin cobertura: los reclamos de ahí entran sin cuadrilla.',
        }}
      />

      {/* --- Drawer de alta / edición --- */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selectedZona ? 'Editar zona' : 'Nueva zona'}
        description={
          selectedZona ? 'Modificá los datos y guardá' : 'Completá los datos de la nueva zona'
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
              style={{ backgroundColor: theme.primary, color: '#fff' }}
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
              onBlur={(e) => validarDuplicado(e.target.value)}
              placeholder="Ej: Zona Centro"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
            {/* Validación de duplicados con IA: la pantalla vieja ya la tenía y
                es lo que evita partir los reclamos de un barrio en dos colas. */}
            {validando && (
              <p className="av2-campo-nota" style={{ marginTop: 6 }}>
                <Loader2 className="h-3 w-3 animate-spin" />
                Revisando si ya existe una zona parecida…
              </p>
            )}
            {!validando && validacion && !selectedZona && (
              <div
                className={`av2-nota ${validacion.es_duplicado ? 'av2-nota--alerta' : 'av2-nota--ok'}`}
              >
                {validacion.es_duplicado ? (
                  <AlertTriangle className="av2-nota-ico" aria-hidden />
                ) : (
                  <CheckCircle className="av2-nota-ico" aria-hidden />
                )}
                <span className="av2-nota-txt">
                  {validacion.es_duplicado
                    ? `Se parece a «${validacion.similar_a}» (confianza ${validacion.confianza}). ${validacion.sugerencia}`
                    : 'No hay ninguna zona parecida cargada.'}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="av2-campo-label">Código</label>
            <input
              type="text"
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              placeholder="Ej: Z-CENTRO"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          <div>
            <label className="av2-campo-label">Descripción</label>
            <textarea
              rows={2}
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Qué barrios abarca"
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          <div>
            <label className="av2-campo-label">Centro de la zona</label>
            <div className="av2-campo-fila">
              <input
                type="number"
                step="any"
                value={formData.latitud_centro}
                onChange={(e) => setFormData({ ...formData, latitud_centro: e.target.value })}
                placeholder="Latitud"
                className="av2-campo-num"
                style={{ width: 140 }}
              />
              <input
                type="number"
                step="any"
                value={formData.longitud_centro}
                onChange={(e) => setFormData({ ...formData, longitud_centro: e.target.value })}
                placeholder="Longitud"
                className="av2-campo-num"
                style={{ width: 140 }}
              />
            </div>
            <p className="av2-campo-nota-larga">
              <Map size={13} strokeWidth={2} aria-hidden /> Es el punto donde el mapa centra la
              zona. El área se dibuja desde el mapa, no acá.
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
        title="Eliminar zona"
        message={
          aBorrar
            ? `Se va a eliminar "${aBorrar.nombre}". Los reclamos de ese territorio van a entrar sin zona y sin cuadrilla hasta que crees otra.`
            : ''
        }
        confirmText="Eliminar"
      />
    </>
  );
}
