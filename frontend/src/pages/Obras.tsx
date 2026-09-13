/**
 * Obras — la lista, sobre el kit v3 (`SemanticAbmPage`).
 *
 * Obra = Proyecto de tipo `obra`; los programas conviven en la misma tabla y acá
 * son una solapa. Reemplaza a `TesoreriaProyectos` (ABMPage legacy). Diseño en
 * docs/design-sync/obras/Main.dc.html. El detalle es una SEGUNDA PANTALLA
 * completa (`/gestion/obras/:id`), nunca un modal (dueño, 2026-09-13).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Construction, Plus } from 'lucide-react';
import SemanticAbmPage from '../components/abmv2/SemanticAbmPage';
import type { ColumnSpec, RolesSemanticos, StatusTab, ViewKind } from '../components/abmv2/types';
import { seg, type Veredicto } from '../lib/semanticHero';
import { obrasApi } from '../lib/api';
import NuevaObraWizard from '../components/obras/NuevaObraWizard';
import { fmtMoney } from '../lib/obras-helpers';

export interface ObraResumen {
  id: number; nombre: string; tipo: 'obra' | 'programa'; tipo_obra?: string | null; modalidad?: string | null;
  estado: string; estado_obra?: string | null; publico: boolean;
  contratista?: { id: number; nombre: string; tipo?: string | null } | null;
  presupuesto_vigente?: string | null; ejecutado: string; n_gastos: number; avance?: number | null;
  etapa_actual?: { orden: number; nombre: string; total: number } | null; n_etapas: number; sin_etapa: number;
  atraso_dias: number; veredicto: Veredicto; motivo: string; fecha_inicio?: string | null; fecha_fin?: string | null;
}
interface Listado {
  items: ObraResumen[]; frase: string;
  kpis: { en_ejecucion: number; atrasadas: number; con_desvio: number; sin_etapas: number; publicadas: number; total_obras: number; total_programas: number; plata_en_ejecucion: string };
}

const MODALIDAD: Record<string, string> = { contrato: 'por contrato', administracion: 'por administración' };

export default function Obras() {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<Listado | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'obra' | 'programa'>('obra');
  const [search, setSearch] = useState('');
  const [vista, setVista] = useState<ViewKind>('cards');
  const [nueva, setNueva] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await obrasApi.list('todos');
      setDatos(r.data);
    } catch {
      toast.error('No se pudieron cargar las obras');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (datos?.items ?? []).filter((o) => o.tipo === tab && (!q || o.nombre.toLowerCase().includes(q) || (o.contratista?.nombre ?? '').toLowerCase().includes(q)));
  }, [datos, tab, search]);

  const k = datos?.kpis;
  const frases = useMemo(() => {
    if (!datos) return [{ segmentos: [seg('Cargando…')] }];
    const v: Veredicto | undefined = k && k.con_desvio > 0 ? 'malo' : k && k.atrasadas > 0 ? 'advertencia' : 'bueno';
    return [{ segmentos: [seg(datos.frase, v)] }];
  }, [datos, k]);

  const heroKpis = useMemo(() => k ? [
    { etiqueta: 'En ejecución', valor: String(k.en_ejecucion), sub: `de ${k.total_obras} cargada${k.total_obras === 1 ? '' : 's'}` },
    { etiqueta: 'Atrasadas', valor: String(k.atrasadas), sub: k.atrasadas ? 'pasadas de su plazo' : 'todas en plazo', veredicto: k.atrasadas ? ('advertencia' as const) : undefined },
    { etiqueta: 'Con desvío de plata', valor: String(k.con_desvio), sub: k.con_desvio ? 'gastaron más de lo que avanzaron' : 'ninguna', veredicto: k.con_desvio ? ('malo' as const) : undefined },
    { etiqueta: 'Sin etapas', valor: String(k.sin_etapas), sub: k.sin_etapas ? 'sin avance ni desvío que mirar' : 'todas con etapas', veredicto: k.sin_etapas ? ('advertencia' as const) : ('bueno' as const) },
    { etiqueta: 'Publicadas al vecino', valor: String(k.publicadas), sub: 'en Obras en tu ciudad' },
  ] : [], [k]);

  const statusTabs: StatusTab[] = [
    { id: 'obra', label: 'Obras', count: k?.total_obras },
    { id: 'programa', label: 'Programas', count: k?.total_programas },
  ];

  const roles: RolesSemanticos<ObraResumen> = useMemo(() => ({
    identity: (o) => o.tipo_obra || null,
    taxonomy: (o) => ({ label: o.modalidad ? MODALIDAD[o.modalidad] ?? o.modalidad : (o.tipo === 'obra' ? 'obra' : 'programa') }),
    headline: (o) => o.nombre,
    actor: (o) => o.contratista?.nombre ?? null,
    // La tarjeta del kit dibuja: cabecera (headline + pills), descripción, meta (due) y pie (context + state).
    // La plata va en la descripción, la etapa en el vencimiento y el avance como prioridad.
    context: (o) => `${o.n_gastos} gastos${o.n_etapas ? ` · ${o.n_etapas} etapas` : ' · sin etapas cargadas'}`,
    description: (o) => `${fmtMoney(o.ejecutado)} ejecutados${o.presupuesto_vigente ? ` de ${fmtMoney(o.presupuesto_vigente)}` : ' · sin presupuesto cargado'}`,
    due: (o) => o.etapa_actual ? { label: `Etapa ${o.etapa_actual.orden} de ${o.etapa_actual.total} · ${o.etapa_actual.nombre}`, veredicto: o.atraso_dias > 0 ? 'advertencia' : undefined } : null,
    priority: (o) => o.avance != null ? { label: `${o.avance}% de avance`, veredicto: o.veredicto === 'malo' ? 'malo' : undefined } : null,
    state: (o) => ({ label: o.motivo, tono: o.veredicto }),
    verdict: (o) => o.veredicto,
    badges: (o) => [
      ...(o.publico ? [{ label: 'publicada' }] : []),
      ...(o.sin_etapa ? [{ label: `${o.sin_etapa} sin etapa` }] : []),
    ],
  }), []);

  const columns: ColumnSpec<ObraResumen>[] = useMemo(() => [
    { id: 'nombre', header: 'Obra', width: '2fr', cell: (o) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{o.nombre}</div>
        <div style={{ fontSize: 'var(--pl-fs-caption)', color: 'var(--pl-text-muted)' }}>{[o.tipo_obra, o.modalidad ? MODALIDAD[o.modalidad] : null, o.contratista?.nombre].filter(Boolean).join(' · ') || '—'}</div>
      </div>
    ) },
    { id: 'etapa', header: 'Etapa', width: '1.4fr', cell: (o) => o.etapa_actual ? `${o.etapa_actual.orden} de ${o.etapa_actual.total} · ${o.etapa_actual.nombre}` : <span style={{ color: 'var(--pl-text-muted)' }}>{o.n_etapas ? `${o.n_etapas} etapas` : 'sin etapas'}</span> },
    { id: 'avance', header: 'Avance', width: '0.7fr', align: 'right', cell: (o) => o.avance != null ? `${o.avance}%` : '—' },
    { id: 'plata', header: 'Ejecutado', width: '1.2fr', align: 'right', cell: (o) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.ejecutado)}{o.presupuesto_vigente ? <span style={{ color: 'var(--pl-text-muted)' }}> / {fmtMoney(o.presupuesto_vigente)}</span> : null}</span> },
    { id: 'estado', header: 'Cómo viene', width: '1.2fr', cell: (o) => <span className={`av2-vered-${o.veredicto}`}>{o.motivo}</span> },
  ], []);

  return (
    <>
      <SemanticAbmPage<ObraResumen>
        moduleKey="obras"
        eyebrow="Obras · gestión interna"
        title="Obras"
        description="Cada obra con sus etapas, su plata y su gente. Lo que se publica al vecino se decide en Comunicación."
        hero={{ etiqueta: 'OBRAS EN MARCHA', frases, kpis: heroKpis }}
        accentColor={k && k.con_desvio > 0 ? 'var(--pl-red)' : k && k.atrasadas > 0 ? 'var(--pl-amber-strong)' : undefined}
        searchPlaceholder="Buscar por nombre, contratista o expediente…"
        views={['cards', 'table']}
        primaryAction={{ label: 'Nueva obra', icon: Plus, onClick: () => setNueva(true) }}
        statusTabs={statusTabs}
        activeStatus={tab}
        onStatusChange={(id) => setTab(id as 'obra' | 'programa')}
        filterSummary={datos ? `${items.length} ${tab === 'obra' ? 'obras' : 'programas'}` : undefined}
        kind="plain"
        columns={columns}
        roles={roles}
        groupBy="none"
        rows={items}
        rowKey={(o) => o.id}
        rowActions={[]}
        onRowClick={(o) => navigate(`/gestion/obras/${o.id}`)}
        loading={loading}
        emptyMessage={tab === 'obra' ? 'Todavía no hay obras. Cargá una nueva o marcá cuáles de tus proyectos son obras.' : 'No hay programas cargados.'}
        footer={{ showing: datos ? `${items.length} ${tab === 'obra' ? 'obras' : 'programas'}` : 'Cargando…' }}
        search={search}
        onSearchChange={setSearch}
        activeView={vista}
        onViewChange={setVista}
      />
      <NuevaObraWizard
        open={nueva}
        onClose={() => setNueva(false)}
        onCreada={(id) => { setNueva(false); toast.success('Obra creada'); navigate(`/gestion/obras/${id}`); }}
        icono={<Construction className="h-5 w-5" />}
      />
    </>
  );
}
