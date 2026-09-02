import { useEffect, useMemo, useState } from 'react';
import { Bot, Cpu } from 'lucide-react';
import { toast } from 'sonner';

import { SemanticAbmPage } from '../components/abmv2/SemanticAbmPage';
import { EntityCell } from '../components/abmv2/DataTable';
import type { ColumnSpec } from '../components/abmv2/types';
import { seg } from '../lib/semanticHero';
import { iaUsoApi, type FilaUsoIA, type ResumenUsoIA } from '../lib/api';

/**
 * Consumo de IA (SOLO superadmin).
 *
 * Contesta con datos lo que hasta el 2026-09-01 se discutía de memoria: qué
 * parte de la app gasta, cuántos tokens por llamada, cuánto tarda, y — lo más
 * importante — cuántas veces la IA NO contestó y el usuario ni se enteró.
 *
 * Esa última columna existe por un caso real: `gpt-oss-120b` se comía el
 * presupuesto de tokens razonando y devolvía vacío, sin error y sin log. La
 * clasificación de reclamos estuvo muda y se descubrió de casualidad. Con
 * "Sin respuesta" a la vista, eso salta el primer día.
 *
 * Versión rústica a propósito: primero juntar los datos, después pulir.
 */

/** Nombres legibles de cada camino que llama a la IA. */
const NOMBRE_FEATURE: Record<string, string> = {
  clasificar_reclamo: 'Clasificar reclamos',
  dashboard_reclamos: 'Tablero de reclamos',
  dashboard_tramites: 'Tablero de trámites',
  dashboard_tesoreria: 'Tablero de tesorería',
  revision: 'Revisión con IA',
  chat: 'Chat / asistente',
  calls_ia: 'Asistente de llamados',
  asignar_dependencias: 'Asignar dependencias',
  sugerir_organigrama: 'Sugerir organigrama',
};

const PERIODOS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

const miles = (n: number) => n.toLocaleString('es-AR');

export default function ConsumoIA() {
  const [dias, setDias] = useState('7');
  const [tab, setTab] = useState<'feature' | 'modelo'>('feature');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ResumenUsoIA | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `vivo` evita que una respuesta vieja pise a una nueva si el usuario
    // cambia de período mientras la anterior todavía viaja.
    let vivo = true;
    const cargar = async () => {
      setLoading(true);
      try {
        const r = await iaUsoApi.resumen(Number(dias));
        if (vivo) setData(r.data);
      } catch {
        if (vivo) toast.error('No se pudo leer el consumo de IA');
      } finally {
        if (vivo) setLoading(false);
      }
    };
    void cargar();
    return () => {
      vivo = false;
    };
  }, [dias]);

  const filas = useMemo(() => {
    const base = tab === 'feature' ? data?.por_feature : data?.por_modelo;
    const q = search.trim().toLowerCase();
    const conNombre = (base || []).map((f) => ({
      ...f,
      nombre: tab === 'feature' ? NOMBRE_FEATURE[f.clave] || f.clave : f.clave,
    }));
    return q ? conNombre.filter((f) => f.nombre.toLowerCase().includes(q)) : conNombre;
  }, [data, tab, search]);

  // El hero cuenta la historia; los números sueltos no dicen nada por sí solos.
  const heroFrases = useMemo(() => {
    if (!data || !data.llamadas) {
      return [{ segmentos: [seg('Todavía no hay llamadas registradas en este período.')] }];
    }
    const segmentos = [
      seg('La IA atendió '),
      seg(`${miles(data.llamadas)} llamadas`),
      seg(' y gastó '),
      seg(`${miles(data.tokens)} tokens`),
      seg(` en ${dias} días, a ${miles(data.tokens_por_llamada)} por llamada. `),
    ];
    if (data.tasa_vacias > 0) {
      segmentos.push(
        seg(`${data.tasa_vacias}% quedó sin respuesta`, data.tasa_vacias >= 5 ? 'malo' : 'advertencia'),
        seg(' — ese es el síntoma de un modelo que se queda sin presupuesto de tokens. '),
      );
    } else {
      segmentos.push(seg('Ninguna quedó sin respuesta', 'bueno'), seg('. '));
    }
    if (data.cuota_requests_restante != null) {
      segmentos.push(
        seg('Cuota del proveedor: '),
        seg(
          `${miles(data.cuota_requests_restante)} llamadas`,
          data.cuota_requests_restante < 100 ? 'malo' : data.cuota_requests_restante < 300 ? 'advertencia' : 'bueno',
        ),
        seg(' disponibles.'),
      );
    }
    return [{ segmentos }];
  }, [data, dias]);

  const heroKpis = useMemo(
    () => [
      { etiqueta: 'LLAMADAS', valor: miles(data?.llamadas || 0), sub: `en ${dias} días` },
      { etiqueta: 'TOKENS', valor: miles(data?.tokens || 0), sub: 'consumidos' },
      { etiqueta: 'POR LLAMADA', valor: miles(data?.tokens_por_llamada || 0), sub: 'tokens promedio' },
      {
        etiqueta: 'LATENCIA',
        valor: `${miles(Math.round((data?.latencia_media_ms || 0) / 100) / 10)} s`,
        sub: 'promedio',
        veredicto: (data?.latencia_media_ms || 0) > 5000 ? ('advertencia' as const) : undefined,
      },
      {
        etiqueta: 'SIN RESPUESTA',
        valor: `${data?.tasa_vacias ?? 0}%`,
        sub: `${data?.tasa_fallback ?? 0}% resolvió sin IA`,
        veredicto:
          (data?.tasa_vacias ?? 0) >= 5
            ? ('malo' as const)
            : (data?.tasa_vacias ?? 0) > 0
              ? ('advertencia' as const)
              : ('bueno' as const),
      },
    ],
    [data, dias],
  );

  type Fila = FilaUsoIA & { nombre: string };

  const columnas: ColumnSpec<Fila>[] = [
    {
      id: 'nombre',
      header: tab === 'feature' ? 'FUNCIÓN' : 'MODELO',
      width: 'minmax(200px, 2fr)',
      kind: 'entity',
      cell: (f) => (
        <EntityCell
          icon={tab === 'feature' ? Bot : Cpu}
          title={f.nombre}
          subtitle={`${miles(f.llamadas)} llamadas`}
        />
      ),
    },
    {
      id: 'tokens_por_llamada',
      header: 'TOKENS / LLAMADA',
      width: 'minmax(120px, 1fr)',
      kind: 'metric',
      align: 'right',
      cell: (f) => miles(f.tokens_por_llamada),
    },
    {
      id: 'reasoning_tokens',
      header: 'RAZONAMIENTO',
      width: 'minmax(110px, 0.9fr)',
      kind: 'metric',
      align: 'right',
      cell: (f) => (f.reasoning_tokens ? miles(f.reasoning_tokens) : '—'),
    },
    {
      id: 'latencia_media_ms',
      header: 'LATENCIA',
      width: 'minmax(90px, 0.8fr)',
      kind: 'metric',
      align: 'right',
      cell: (f) => `${Math.round(f.latencia_media_ms / 100) / 10} s`,
    },
    {
      id: 'vacias',
      header: 'SIN RESPUESTA',
      width: 'minmax(110px, 0.9fr)',
      kind: 'metric',
      align: 'right',
      cell: (f) => (f.vacias ? `${f.vacias}` : '—'),
    },
    {
      id: 'fallbacks',
      header: 'RESOLVIÓ SIN IA',
      width: 'minmax(110px, 0.9fr)',
      kind: 'metric',
      align: 'right',
      cell: (f) => (f.fallbacks ? `${f.fallbacks}` : '—'),
    },
  ];

  return (
    <SemanticAbmPage<Fila>
      moduleKey="configuracion"
      eyebrow="Super Admin"
      title="Consumo de IA"
      description="Qué gasta la IA, dónde, y cuántas veces no sirvió."
      hero={{
        etiqueta: `CONSUMO DE IA · ÚLTIMOS ${dias} DÍAS`,
        frases: heroFrases,
        kpis: heroKpis,
      }}
      pista={{
        titulo: 'Para qué mirar esto',
        texto:
          'La columna "Sin respuesta" es la que importa: son llamadas que el proveedor cobró y no devolvieron nada. Si una función tiene ese número alto, su tope de tokens quedó chico para el modelo que usa. "Resolvió sin IA" son las veces que la app siguió con el método viejo y el usuario no se enteró.',
      }}
      searchPlaceholder={tab === 'feature' ? 'Buscar función…' : 'Buscar modelo…'}
      views={['table']}
      activeView="table"
      onViewChange={() => {}}
      search={search}
      onSearchChange={setSearch}
      selects={[
        {
          id: 'periodo',
          label: 'Período',
          value: dias,
          options: PERIODOS,
          onChange: setDias,
        },
      ]}
      statusTabs={[
        { id: 'feature', label: 'Por función', count: data?.por_feature.length || 0 },
        { id: 'modelo', label: 'Por modelo', count: data?.por_modelo.length || 0 },
      ]}
      activeStatus={tab}
      onStatusChange={(id) => setTab(id as 'feature' | 'modelo')}
      kind="plain"
      columns={columnas}
      rows={filas}
      rowKey={(f) => f.clave}
      rowActions={[]}
      footer={{ showing: `Mostrando ${filas.length} de ${filas.length}` }}
      loading={loading}
      emptyMessage={
        search.trim()
          ? `Nada coincide con "${search.trim()}".`
          : 'Todavía no hay llamadas registradas en este período.'
      }
    />
  );
}
