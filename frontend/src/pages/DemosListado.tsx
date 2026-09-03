/**
 * /demos-listado — AUDITORÍA de las demos generadas (dueño, 2026-09-03).
 *
 * "Ahí hago yo una auditoría de lo que va creando" el generador de demos:
 * qué pudo crear bien cada una — los BARRIOS, los POLÍGONOS, las zonas, los
 * catálogos y los seeds — ordenado por un score de INTEGRIDAD.
 *
 * Pública y sin llave: son demos con datos de ejemplo; la auditoría no
 * muestra nada que la vitrina /demo no exponga ya.
 *
 * Es también una pantalla EJEMPLAR del ABM v3: SemanticAbmPage full por
 * props — roles semánticos, 3 vistas built-in, enfoque declarado por
 * veredicto, agrupada por nivel de integridad y CERO estilos propios.
 *
 * EL SCORE (0-100, calculado acá con datos reales del endpoint, pesos a la
 * vista para poder discutirlos):
 *   contorno del municipio 15 · hay barrios 10 · % de barrios con polígono
 *   real 30 · hay zonas 10 · catálogos completos 10 · reclamos 8 ·
 *   trámites 7 · noticias 5 · usuarios 5.
 * Niveles: 75+ íntegra (verde) · 40-74 a medias (ámbar) · <40 rota (rojo).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { ChipEstado, EntityCell } from '../components/abmv2/DataTable';
import { MetricCell } from '../components/abmv2/Controls';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { Action, ChipTone, ColumnSpec, RolesSemanticos, TableGroup, ViewKind } from '../components/abmv2/types';
import { API_URL } from '../lib/api';
import { seg } from '../lib/semanticHero';

interface DemoAudit {
  id: number;
  codigo: string;
  nombre: string;
  pais: string;
  activo: boolean;
  con_contorno: boolean;
  barrios_total: number;
  barrios_con_poligono: number;
  zonas_total: number;
  zonas_con_poligono: number;
  categorias_reclamo: number;
  categorias_tramite: number;
  usuarios: number;
  reclamos: number;
  solicitudes: number;
  noticias: number;
}

function scoreDe(d: DemoAudit): number {
  let s = 0;
  if (d.con_contorno) s += 15;
  if (d.barrios_total > 0) s += 10;
  s += Math.round(30 * (d.barrios_total > 0 ? d.barrios_con_poligono / d.barrios_total : 0));
  if (d.zonas_total > 0) s += 10;
  if (d.categorias_reclamo > 0 && d.categorias_tramite > 0) s += 10;
  if (d.reclamos > 0) s += 8;
  if (d.solicitudes > 0) s += 7;
  if (d.noticias > 0) s += 5;
  if (d.usuarios > 0) s += 5;
  return s;
}

type Nivel = 'integra' | 'a_medias' | 'rota';
const nivelDe = (score: number): Nivel => (score >= 75 ? 'integra' : score >= 40 ? 'a_medias' : 'rota');
const NIVEL_LABEL: Record<Nivel, string> = { integra: 'Íntegra', a_medias: 'A medias', rota: 'Rota' };
const NIVEL_TONO: Record<Nivel, string> = { integra: 'green', a_medias: 'amber', rota: 'red' };
const NIVEL_VEREDICTO = { integra: 'bueno', a_medias: 'advertencia', rota: 'malo' } as const;

const PAIS_LABEL: Record<string, string> = { AR: 'Argentina', PY: 'Paraguay', CL: 'Chile' };

export default function DemosListado() {
  const [demos, setDemos] = useState<DemoAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todas');
  const [vista, setVista] = useState<ViewKind>('table');
  const [orden, setOrden] = useState('integridad');

  const cargar = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/demos/auditoria`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: DemoAudit[]) => setDemos(data))
      .catch(() => setDemos([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  /* --- PURGA (dueño, 2026-09-03): borrar una demo o el grupo entero desde
     acá. El backend exige sesión de SUPER ADMIN — se usa el token que ya
     tenga este navegador (entrando por /super); sin él, avisa cómo. --- */
  const [aBorrar, setABorrar] = useState<{ ids: number[]; titulo: string } | null>(null);
  const [purgando, setPurgando] = useState(false);

  const purgar = async () => {
    if (!aBorrar) return;
    setPurgando(true);
    try {
      const res = await fetch(`${API_URL}/demos/purga`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ municipio_ids: aBorrar.ids }),
      });
      if (res.status === 401 || res.status === 403) {
        toast.error('Borrar demos exige tu sesión de super admin: entrá por /super y volvé.');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const rechazadas = (data.resultados as Array<{ ok: boolean; codigo?: string; motivo?: string }>)
        .filter((r) => !r.ok);
      toast.success(`${data.borradas} de ${data.total} demos eliminadas.`);
      for (const r of rechazadas.slice(0, 3)) {
        toast.info(`${r.codigo ?? 'demo'}: ${r.motivo}`);
      }
      cargar();
    } catch {
      toast.error('No se pudo completar la purga. Probá de nuevo.');
    } finally {
      setPurgando(false);
      setABorrar(null);
    }
  };

  const conScore = useMemo(
    () =>
      demos
        .map((d) => ({ ...d, score: scoreDe(d), nivel: nivelDe(scoreDe(d)) }))
        .sort((a, b) =>
          orden === 'barrios' ? b.barrios_total - a.barrios_total : b.score - a.score,
        ),
    [demos, orden],
  );
  type Fila = (typeof conScore)[number];

  const integras = conScore.filter((d) => d.nivel === 'integra');
  const aMedias = conScore.filter((d) => d.nivel === 'a_medias');
  const rotas = conScore.filter((d) => d.nivel === 'rota');
  const totalBarrios = conScore.reduce((n, d) => n + d.barrios_total, 0);
  const totalConPoligono = conScore.reduce((n, d) => n + d.barrios_con_poligono, 0);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conScore.filter((d) => {
      if (tab !== 'todas' && d.nivel !== tab) return false;
      if (!q) return true;
      return d.nombre.toLowerCase().includes(q) || d.codigo.toLowerCase().includes(q);
    });
  }, [conScore, search, tab]);

  const abrirDemo = (d: Fila) => {
    window.open(`/demo/${d.codigo}/login`, '_blank', 'noopener');
  };

  const heroFrases = useMemo(() => {
    if (conScore.length === 0) {
      return [{ segmentos: [seg('Todavía no hay demos generadas para auditar.')] }];
    }
    const problema = rotas.length + aMedias.length;
    if (problema > 0) {
      return [{
        segmentos: [
          seg(`Hay ${conScore.length} demos: `),
          seg(`${integras.length} íntegras`, 'bueno'),
          seg(', '),
          seg(`${aMedias.length} a medias`, 'advertencia'),
          seg(' y '),
          seg(`${rotas.length} rotas`, rotas.length > 0 ? 'malo' : undefined),
          seg('.'),
        ],
      }];
    }
    return [{
      segmentos: [seg(`Las ${conScore.length} demos están íntegras`, 'bueno'), seg('.')],
    }];
  }, [conScore.length, integras.length, aMedias.length, rotas.length]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Demos', valor: String(conScore.length), sub: 'generadas' },
    {
      etiqueta: 'Íntegras',
      valor: String(integras.length),
      sub: 'geografía y seeds OK',
      ...(integras.length > 0 ? { veredicto: 'bueno' as const } : {}),
    },
    {
      etiqueta: 'A medias',
      valor: String(aMedias.length),
      sub: 'les falta algo',
      ...(aMedias.length > 0 ? { veredicto: 'advertencia' as const } : {}),
    },
    {
      etiqueta: 'Rotas',
      valor: String(rotas.length),
      sub: rotas.length > 0 ? 'sin geografía o sin datos' : 'ninguna',
      ...(rotas.length > 0 ? { veredicto: 'malo' as const } : {}),
    },
    {
      etiqueta: 'Barrios con polígono',
      valor: String(totalConPoligono),
      sub: `de ${totalBarrios} obtenidos`,
      ...(totalBarrios > 0 && totalConPoligono < totalBarrios
        ? { veredicto: 'advertencia' as const }
        : {}),
    },
  ]), [conScore.length, integras.length, aMedias.length, rotas.length, totalBarrios, totalConPoligono]);

  const roles = useMemo<RolesSemanticos<Fila>>(() => ({
    taxonomy: (d) => ({ label: PAIS_LABEL[d.pais] ?? d.pais, icon: 'Landmark' }),
    headline: (d) => d.nombre,
    identity: (d) => d.codigo,
    description: (d) =>
      `${d.barrios_total} barrios (${d.barrios_con_poligono} con polígono), ` +
      `${d.zonas_total} ${d.zonas_total === 1 ? 'zona' : 'zonas'} y ` +
      `${d.con_contorno ? 'contorno propio' : 'SIN contorno del municipio'}.`,
    badges: (d) => [
      { label: `${d.categorias_reclamo + d.categorias_tramite} catálogos` },
      ...(d.activo ? [] : [{ label: 'Inactiva' }]),
    ],
    context: (d) => `${d.reclamos} reclamos · ${d.solicitudes} trámites · ${d.noticias} noticias`,
    due: (d) => {
      const sinPoligono = d.barrios_total - d.barrios_con_poligono;
      return sinPoligono > 0
        ? { label: `${sinPoligono} ${sinPoligono === 1 ? 'barrio' : 'barrios'} sin polígono`, veredicto: 'advertencia' }
        : null;
    },
    amount: (d) => `${d.score}%`,
    /* Sin el % en el label: agruparía por "A medias · 55%" y fragmentaría
       los grupos por score — el % ya vive en la columna Integridad. */
    state: (d) => ({ label: NIVEL_LABEL[d.nivel], tono: NIVEL_TONO[d.nivel] }),
    verdict: (d) => NIVEL_VEREDICTO[d.nivel],
  }), []);

  const columnas = useMemo<ColumnSpec<Fila>[]>(() => [
    {
      id: 'demo',
      header: 'Demo',
      width: 'minmax(200px, 1.6fr)',
      kind: 'entity',
      cell: (d) => (
        <EntityCell icon={undefined} title={d.nombre} subtitle={`${d.codigo} · ${PAIS_LABEL[d.pais] ?? d.pais}`} />
      ),
    },
    {
      id: 'barrios',
      header: 'Barrios',
      width: 'minmax(110px, 0.8fr)',
      kind: 'metric',
      cell: (d) => (
        <MetricCell
          value={String(d.barrios_total)}
          note={d.barrios_total > 0 ? `${d.barrios_con_poligono} con polígono` : 'sin barrios'}
          veredicto={
            d.barrios_total === 0
              ? 'malo'
              : d.barrios_con_poligono < d.barrios_total
                ? 'advertencia'
                : 'bueno'
          }
          muted={d.barrios_total === 0}
        />
      ),
    },
    {
      id: 'zonas',
      header: 'Zonas',
      width: 'minmax(90px, 0.6fr)',
      kind: 'metric',
      cell: (d) => (
        <MetricCell
          value={String(d.zonas_total)}
          note={d.zonas_con_poligono > 0 ? `${d.zonas_con_poligono} con polígono` : undefined}
          muted={d.zonas_total === 0}
        />
      ),
    },
    {
      id: 'contorno',
      header: 'Contorno',
      width: 'minmax(100px, 0.6fr)',
      kind: 'chip',
      cell: (d) => (
        <ChipEstado
          label={d.con_contorno ? 'Dibujado' : 'Falta'}
          tone={(d.con_contorno ? 'green' : 'red') as ChipTone}
        />
      ),
    },
    {
      id: 'catalogos',
      header: 'Catálogos',
      width: 'minmax(120px, 0.8fr)',
      kind: 'text',
      cell: (d) => `${d.categorias_reclamo} reclamo · ${d.categorias_tramite} trámite`,
    },
    {
      id: 'seeds',
      header: 'Datos vivos',
      width: 'minmax(150px, 1fr)',
      kind: 'text',
      cell: (d) => `${d.reclamos} recl · ${d.solicitudes} trám · ${d.noticias} notas · ${d.usuarios} users`,
    },
    {
      id: 'integridad',
      header: 'Integridad',
      width: 'minmax(120px, 0.8fr)',
      align: 'right',
      kind: 'metric',
      cell: (d) => (
        <MetricCell value={`${d.score}%`} note={NIVEL_LABEL[d.nivel]} veredicto={NIVEL_VEREDICTO[d.nivel]} />
      ),
    },
  ], []);

  const purgarNivel = useCallback((nivel: Nivel) => {
    const filas = conScore.filter((d) => d.nivel === nivel);
    if (filas.length === 0) return;
    setABorrar({
      ids: filas.map((d) => d.id),
      titulo: `las ${filas.length} demos "${NIVEL_LABEL[nivel]}"`,
    });
  }, [conScore]);

  const accionPurgaNivel = useCallback((nivel: Nivel): Action => ({
    label: `Eliminar ${conScore.filter((d) => d.nivel === nivel).length}`,
    icon: Trash2,
    onClick: () => purgarNivel(nivel),
  }), [conScore, purgarNivel]);

  const enfoque = useMemo(() => ({
    resumen:
      rotas.length + aMedias.length > 0
        ? `${rotas.length + aMedias.length} demos piden una mirada`
        : 'todas las demos íntegras',
    secciones: [
      {
        id: 'rota',
        titulo: 'Rotas — sin geografía o sin datos',
        subtitulo: 'Sin contorno, sin barrios con polígono o sin seeds: no sirven para mostrar',
        icon: AlertTriangle,
        veredicto: 'malo' as const,
        match: (d: Fila) => d.nivel === 'rota',
        ctaLabel: 'Abrir la demo',
        emptyMessage: 'Ninguna demo rota.',
        headerAction: accionPurgaNivel('rota'),
      },
      {
        id: 'a_medias',
        titulo: 'A medias — les falta algo',
        subtitulo: 'Tienen la base pero quedaron barrios sin polígono o seeds sin correr',
        icon: Wrench,
        veredicto: 'advertencia' as const,
        match: (d: Fila) => d.nivel === 'a_medias',
        ctaLabel: 'Abrir la demo',
        headerAction: accionPurgaNivel('a_medias'),
      },
      {
        id: 'integra',
        titulo: 'Íntegras — listas para mostrar',
        subtitulo: 'Contorno, barrios con polígono, catálogos y seeds completos',
        icon: CheckCircle2,
        veredicto: 'bueno' as const,
        match: () => true,
        colapsable: true,
      },
    ],
  }), [rotas.length, aMedias.length, accionPurgaNivel]);

  return (
    <div className="av2-standalone">
      <SemanticAbmPage<Fila>
        moduleKey="demos-auditoria"
        eyebrow="Demos"
        title="Qué pudo crear bien el generador y qué quedó a medias"
        description="Cada demo con sus barrios, polígonos, zonas, catálogos y seeds. El score de integridad lo calcula esta pantalla; los pesos están en el código, a la vista."
        hero={{ etiqueta: 'DEMOS · AUDITORÍA', frases: heroFrases, kpis: heroKpis }}
        pista={{
          titulo: 'Qué mide la integridad',
          texto:
            'Contorno del municipio, barrios obtenidos y qué porcentaje tiene polígono real, zonas, catálogos de reclamos y trámites, y seeds vivos (reclamos, trámites, noticias, usuarios). Una demo sin geografía no es una demo funcional.',
        }}
        searchPlaceholder="Buscar por nombre o código…"
        roles={roles}
        enfoque={enfoque}
        groupBy="state"
        activeView={vista}
        onViewChange={setVista}
        search={search}
        onSearchChange={setSearch}
        sortSpec={{
          opciones: [
            { id: 'integridad', label: 'Integridad' },
            { id: 'barrios', label: 'Barrios' },
          ],
          activo: orden,
          onSort: setOrden,
        }}
        statusTabs={[
          { id: 'todas', label: 'Todas', count: conScore.length },
          { id: 'integra', label: 'Íntegras', count: integras.length },
          { id: 'a_medias', label: 'A medias', count: aMedias.length },
          { id: 'rota', label: 'Rotas', count: rotas.length },
        ]}
        activeStatus={tab}
        onStatusChange={setTab}
        kind="plain"
        columns={columnas}
        rows={visibles}
        rowKey={(d) => d.codigo}
        rowActions={[
          { id: 'abrir', label: 'Abrir la demo', icon: ExternalLink, onClick: abrirDemo },
          {
            id: 'del',
            label: 'Eliminar la demo',
            icon: Trash2,
            danger: true,
            onClick: (d: Fila) => setABorrar({ ids: [d.id], titulo: `la demo "${d.nombre}"` }),
          },
        ]}
        groupAction={(g: TableGroup<Fila>) =>
          g.rows.length > 0
            ? {
                label: `Eliminar estas ${g.rows.length}`,
                icon: Trash2,
                onClick: () =>
                  setABorrar({
                    ids: g.rows.map((d) => d.id),
                    titulo: `las ${g.rows.length} demos "${g.title ?? g.key}"`,
                  }),
              }
            : null
        }
        onRowClick={abrirDemo}
        loading={loading}
        emptyMessage={
          search.trim()
            ? `Ninguna demo coincide con "${search.trim()}".`
            : 'No hay demos generadas todavía. Se crean desde la landing comercial o la vitrina /demo.'
        }
        footer={{ showing: `Mostrando ${visibles.length} de ${conScore.length}` }}
      />

      <ConfirmModal
        isOpen={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={purgar}
        title="Eliminar demos"
        message={
          aBorrar
            ? `Se ${aBorrar.ids.length === 1 ? 'elimina' : 'eliminan'} ${aBorrar.titulo} con TODOS sus datos (borrado guiado por el esquema, sin vuelta atrás). La demo de muestra y los municipios con usuarios reales quedan protegidos por el backend.${purgando ? ' Purgando…' : ''}`
            : ''
        }
      />
    </div>
  );
}
