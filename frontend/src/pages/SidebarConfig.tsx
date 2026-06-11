import { useEffect, useMemo, useState } from 'react';
import { Layers, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { sidebarAdminApi, municipiosApi } from '../lib/api';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { ModernSelect } from '../components/ui/ModernSelect';
import { getNavigation } from '../config/navigation';

interface MuniOpt {
  id: number;
  nombre: string;
  codigo: string;
}

interface CatalogoItem {
  href: string;
  name: string;
  description?: string;
  categoria: string;
}

// Todos los feature-flags posibles. Al armar el catalogo abrimos TODOS los
// modulos para que getNavigation devuelva tambien las pantallas opt-in
// (Tesoreria/Contaduria/Sueldos dependen de modulosActivos.has('tesoreria')).
// Si no, esas pantallas no aparecerian en la grilla de config.
const TODOS_MODULOS = [
  'tesoreria', 'reclamos', 'tramites', 'tasas', 'pagos', 'mostrador',
  'mapa', 'tablero', 'planificacion', 'sla', 'panel-bi', 'dashboard', 'turnos',
];

/**
 * Config del sidebar por municipio (solo superadmin).
 *
 * Flujo:
 *   - Elegí un muni del selector.
 *   - Vemos el catalogo de items del sidebar (derivado de navigation.ts)
 *     y cuales estan ocultos hoy.
 *   - Togglear y guardar → PUT a /admin/sidebar-items/{muni}.
 */
export default function SidebarConfig() {
  const { theme } = useTheme();
  const [munis, setMunis] = useState<MuniOpt[]>([]);
  const [muniId, setMuniId] = useState<number | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [seccion, setSeccion] = useState('');

  // Cargar lista de munis
  useEffect(() => {
    const load = async () => {
      try {
        const r = await municipiosApi.getAll();
        const arr = (r.data as MuniOpt[]).map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo }));
        setMunis(arr.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      } catch {
        toast.error('No se pudieron cargar los municipios');
      }
    };
    load();
  }, []);

  // Cargar hrefs ocultos cuando cambia el muni
  useEffect(() => {
    if (!muniId) {
      setOcultos(new Set());
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const r = await sidebarAdminApi.get(muniId);
        setOcultos(new Set(r.data.ocultos.map((o) => o.href)));
      } catch {
        setOcultos(new Set());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [muniId]);

  // Catalogo completo de items que existen en el sidebar.
  // Llamamos getNavigation con todos los flags y modulos abiertos para ver
  // TODO lo que un usuario podria llegar a ver, y despues filtramos duplicados.
  const catalogo = useMemo<CatalogoItem[]>(() => {
    const seen = new Set<string>();
    const acc: CatalogoItem[] = [];
    const base = {
      modulosActivos: TODOS_MODULOS,
      modulosDesactivados: [] as string[],
      iaHabilitada: true,
      abmEnSidebar: true,
    };
    const combinaciones = [
      { ...base, userRole: 'admin', isSuperAdmin: false, hasDependencia: false },
      { ...base, userRole: 'supervisor', isSuperAdmin: false, hasDependencia: false },
      { ...base, userRole: 'supervisor', isSuperAdmin: false, hasDependencia: true },
      { ...base, userRole: 'vecino', isSuperAdmin: false, hasDependencia: false },
      { ...base, userRole: 'admin', isSuperAdmin: true, hasDependencia: false },
    ];
    for (const opts of combinaciones) {
      const nav = getNavigation(opts as Parameters<typeof getNavigation>[0]);
      for (const raw of nav) {
        const it = raw as { href: string; name: string; description?: string; categoria?: string };
        if (!seen.has(it.href)) {
          seen.add(it.href);
          acc.push({ href: it.href, name: it.name, description: it.description, categoria: it.categoria || 'Otros' });
        }
      }
    }
    return acc;
  }, []);

  // Secciones en orden de aparicion (para el filtro de arriba).
  const secciones = useMemo(() => {
    const orden: string[] = [];
    for (const it of catalogo) if (!orden.includes(it.categoria)) orden.push(it.categoria);
    return orden;
  }, [catalogo]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogo.filter((it) => {
      if (seccion && it.categoria !== seccion) return false;
      if (q && !it.name.toLowerCase().includes(q) && !it.href.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogo, search, seccion]);

  // Agrupar lo visible por seccion, preservando orden de aparicion.
  const grupos = useMemo(() => {
    const map = new Map<string, CatalogoItem[]>();
    for (const it of visible) {
      const arr = map.get(it.categoria);
      if (arr) arr.push(it);
      else map.set(it.categoria, [it]);
    }
    return Array.from(map.entries());
  }, [visible]);

  const toggle = (href: string) => {
    setOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const handleGuardar = async () => {
    if (!muniId) return;
    setSaving(true);
    try {
      await sidebarAdminApi.put(muniId, Array.from(ocultos));
      toast.success('Configuración guardada');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const muniSel = munis.find((m) => m.id === muniId);

  return (
    <div className="space-y-4">
      <StickyPageHeader
        icon={<Layers className="h-5 w-5" />}
        title="Configuración del sidebar por municipio"
      />

      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
              Municipio
            </label>
            <ModernSelect
              value={muniId === null ? '' : String(muniId)}
              onChange={(v) => setMuniId(v ? Number(v) : null)}
              options={munis.map((m) => ({ value: String(m.id), label: `${m.nombre} [${m.codigo}]` }))}
              placeholder="Seleccioná un municipio"
              searchable
            />
          </div>

          {muniSel && (
            <>
              <div className="min-w-[200px]">
                <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
                  Sección
                </label>
                <ModernSelect
                  value={seccion}
                  onChange={(v) => setSeccion(v || '')}
                  options={[{ value: '', label: 'Todas las secciones' }, ...secciones.map((s) => ({ value: s, label: s }))]}
                  placeholder="Todas las secciones"
                />
              </div>

              <div className="flex-1 min-w-[220px] relative">
                <Search className="w-4 h-4 absolute left-3 top-[34px]" style={{ color: theme.textSecondary }} />
                <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>
                  Buscar item
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Reclamos, Pagos, Mostrador…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
                />
              </div>

              <button
                onClick={handleGuardar}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 self-end"
                style={{ backgroundColor: theme.primary }}
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
        </div>

        {muniSel && (
          <div className="text-[11px] flex items-center gap-3" style={{ color: theme.textSecondary }}>
            <span>Items totales: <strong>{catalogo.length}</strong></span>
            <span>·</span>
            <span>Visibles: <strong>{catalogo.length - ocultos.size}</strong></span>
            <span>·</span>
            <span>Ocultos: <strong style={{ color: '#ef4444' }}>{ocultos.size}</strong></span>
          </div>
        )}
      </div>

      {!muniId ? (
        <div className="rounded-xl p-12 text-center" style={{ backgroundColor: theme.card, border: `1px dashed ${theme.border}`, color: theme.textSecondary }}>
          Seleccioná un municipio arriba para ver y editar qué items del sidebar se muestran.
        </div>
      ) : loading ? (
        <div className="rounded-xl p-12 text-center" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
          Cargando…
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          {grupos.map(([cat, items]) => {
            const ocultosGrupo = items.filter((it) => ocultos.has(it.href)).length;
            return (
              <div key={cat}>
                {/* Header del subset (seccion del sidebar) */}
                <div
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, borderTop: `1px solid ${theme.border}` }}
                >
                  <span>{cat}</span>
                  <span style={{ color: ocultosGrupo ? '#ef4444' : theme.textSecondary }}>
                    {ocultosGrupo > 0 ? `${ocultosGrupo}/${items.length} ocultas` : `${items.length}`}
                  </span>
                </div>
                {items.map((it) => {
                  const estaOculto = ocultos.has(it.href);
                  return (
                    <label
                      key={it.href}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ borderTop: `1px solid ${theme.border}` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: theme.text }}>
                          {it.name}
                          {estaOculto && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#ef4444' }}>
                              Oculto
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] font-mono truncate" style={{ color: theme.textSecondary }}>
                          {it.href}
                          {it.description && <span className="ml-2" style={{ color: theme.textSecondary }}>— {it.description}</span>}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.preventDefault(); toggle(it.href); }}
                        className="relative inline-flex h-6 w-11 rounded-full transition-colors"
                        style={{ backgroundColor: estaOculto ? '#9ca3af' : '#22c55e' }}
                        title={estaOculto ? 'Oculto — click para mostrar' : 'Visible — click para ocultar'}
                      >
                        <span
                          className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
                          style={{ transform: estaOculto ? 'translateX(2px)' : 'translateX(22px)', marginTop: '2px' }}
                        />
                      </button>
                    </label>
                  );
                })}
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="p-8 text-center text-sm" style={{ color: theme.textSecondary }}>
              Sin coincidencias{search ? ` con "${search}"` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
