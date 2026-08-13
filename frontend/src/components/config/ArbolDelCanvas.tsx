/**
 * ArbolDelCanvas — el catálogo de trámites leído como jerarquía.
 *
 * Categoría → tipo de trámite → prerrequisitos. La dependencia NO es un nivel
 * (decisión del dueño 2026-08-13): arriba va una banda de chips de referencia
 * que además filtra; la relación se edita en Asignaciones.
 * El cuerpo NO es una grilla: entra por `viewSlots.arbol`, y por eso las props
 * de tabla van en neutro (el kit las pide igual; ver nota abajo).
 *
 * Unifica las DOS pantallas viejas de producción (Categorías de Trámite y
 * Catálogo de Trámites): misma información y mismas operaciones, en una sola
 * vista. Las altas y ediciones reusan los flujos existentes de producción
 * (`tramiteFlows`) — acá no se reinventa ningún formulario.
 *
 * La dependencia se muestra como DATO, no como control: a quién le toca
 * atender cada trámite se decide en la pestaña Asignación.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SemanticAbmPage } from '../abmv2/SemanticAbmPage';
import PanelArbol from '../../pages/Configuracion/panels/PanelArbol';
import { cargarArbolReal, type ArbolTramites } from '../../pages/Configuracion/data/datosRealesConfig';
import { AltaTramiteWizard, EdicionTramiteSheet } from './tramiteFlows';
import { CategoriaTramiteSheet } from './CategoriaTramiteSheet';
import { seg } from '../../lib/semanticHero';
import type { HeroFrase, HeroKpi } from '../../lib/semanticHero';
import { useReportarTotal } from '../abmv2/useEmbed';

export function ArbolDelCanvas() {
  const [data, setData] = useState<ArbolTramites | null>(null);
  const [busqueda, setBusqueda] = useState('');
  /* Banda de dependencias: referencia arriba, jamás un nivel de la grilla.
     Tocar un chip filtra el árbol a lo que esa oficina atiende. */
  const [depFiltro, setDepFiltro] = useState<'todas' | 'sin' | number>('todas');

  const recargar = useCallback(() => {
    cargarArbolReal().then(setData).catch(console.error);
  }, []);
  useEffect(() => { recargar(); }, [recargar]);

  /* --- Sheets: alta de trámite (wizard de producción), edición de trámite y
         alta/edición de categoría. El árbol es el dueño de sus flujos. --- */
  const [altaTramite, setAltaTramite] = useState<{ abierta: boolean; categoriaId: number | null }>({ abierta: false, categoriaId: null });
  const [tramiteEnEdicion, setTramiteEnEdicion] = useState<any | null>(null);
  const [sheetCategoria, setSheetCategoria] = useState<{ abierta: boolean; categoria: any | null }>({ abierta: false, categoria: null });

  const categorias = useMemo(() => data?.categorias ?? [], [data]);
  const totalCategorias = categorias.length;
  const tramitesUnicos = useMemo(
    () => categorias.flatMap((c: any) => c.tramites || []),
    [categorias],
  );
  /* Qué trámites tienen dueño (para el chip "Sin dependencia"). */
  const asignados = useMemo(
    () => new Set((data?.deps ?? []).flatMap((d) => d.tramiteIds)),
    [data],
  );
  const sinDepCount = useMemo(
    () => tramitesUnicos.filter((t: any) => !asignados.has(t.id)).length,
    [tramitesUnicos, asignados],
  );
  useReportarTotal(data ? tramitesUnicos.length : undefined);

  const masPesado = useMemo(() => {
    if (!tramitesUnicos.length) return null;
    return tramitesUnicos.slice().sort((a, b) => (b.docs + b.validaciones) - (a.docs + a.validaciones))[0];
  }, [tramitesUnicos]);

  const conCosto = tramitesUnicos.filter((t) => t.costo > 0).length;
  const online = tramitesUnicos.filter((t) => t.modo === 'online').length;

  /* Mientras el árbol carga, el hero no inventa: etiquetas con "—" y frase
     de carga (misma regla que el resto de Configuración). */
  const kpis: HeroKpi[] = !data
    ? ['Categorías', 'Tipos', 'Más pesado', 'Con costo', '100% online'].map((etiqueta) => ({
        etiqueta,
        valor: '—',
        sub: 'cargando…',
      }))
    : [
        { etiqueta: 'Categorías', valor: totalCategorias, sub: 'carpetas del catálogo' },
        { etiqueta: 'Tipos', valor: tramitesUnicos.length, sub: 'trámites concretos' },
        {
          etiqueta: 'Más pesado',
          valor: masPesado ? masPesado.docs + masPesado.validaciones : '—',
          sub: masPesado ? masPesado.nombre : 'sin trámites cargados',
          veredicto: masPesado && masPesado.docs + masPesado.validaciones >= 4 ? 'advertencia' : undefined,
        },
        { etiqueta: 'Con costo', valor: conCosto, sub: 'pagan tasa' },
        { etiqueta: '100% online', valor: online, sub: 'sin ir al municipio' },
      ];

  const frases: HeroFrase[] = !data
    ? [{ segmentos: [seg('Trayendo el catálogo de trámites…')] }]
    : [
        {
          segmentos: [
            seg(`${totalCategorias} categoría${totalCategorias === 1 ? '' : 's'} y ${tramitesUnicos.length} tipo${tramitesUnicos.length === 1 ? '' : 's'}`, 'bueno'),
            seg(' en una sola vista, con los prerrequisitos que enfrenta el vecino en cada uno.'),
            ...(masPesado && masPesado.docs + masPesado.validaciones > 0
              ? [
                  seg(` El más pesado, ${masPesado.nombre},`),
                  seg(` le pide ${masPesado.docs} documento${masPesado.docs === 1 ? '' : 's'} y ${masPesado.validaciones} validaci${masPesado.validaciones === 1 ? 'ón' : 'ones'}.`, 'advertencia'),
                ]
              : []),
          ],
        },
      ];

  /* El filtro compone: primero el chip de dependencia (deja sólo los tipos
     que esa oficina atiende), después el buscador sobre la rama entera — si
     el texto matchea la categoría se conserva completa; si matchea sólo un
     trámite, queda la categoría con ese trámite. */
  const visibles = useMemo(() => {
    let cats = categorias;
    if (depFiltro !== 'todas') {
      const deDep = depFiltro === 'sin'
        ? null
        : new Set((data?.deps ?? []).find((d) => d.id === depFiltro)?.tramiteIds ?? []);
      cats = cats
        .map((cat: any) => {
          const tramites = (cat.tramites || []).filter((t: any) =>
            depFiltro === 'sin' ? !asignados.has(t.id) : deDep!.has(t.id),
          );
          return tramites.length ? { ...cat, tramites } : null;
        })
        .filter(Boolean);
    }
    const q = busqueda.trim().toLowerCase();
    if (!q) return cats;
    const coincide = (v: unknown) => String(v ?? '').toLowerCase().includes(q);
    return cats
      .map((cat: any) => {
        if (coincide(cat.nombre ?? cat.n)) return cat;
        const tramites = (cat.tramites || []).filter((t: any) => coincide(t.nombre ?? t.n));
        return tramites.length ? { ...cat, tramites } : null;
      })
      .filter(Boolean);
  }, [categorias, data, depFiltro, asignados, busqueda]);

  return (
    <>
      <SemanticAbmPage
        moduleKey="arbol-tramite"
        title="Trámites"
        hero={{ etiqueta: 'TRÁMITES · CATÁLOGO', frases, kpis }}
        primaryAction={{
          label: 'Nueva categoría de trámite',
          onClick: () => setSheetCategoria({ abierta: true, categoria: null }),
        }}
        pista={{
          titulo: 'Arrancá con la estructura sugerida y complejizala cuando la necesites.',
          texto: 'Nada se aplica sin que lo confirmes: la sugerencia queda marcada en el árbol para que la revises rama por rama.',
        }}
        loading={!data}
        searchPlaceholder="Buscar categoría o trámite…"
        search={busqueda}
        onSearchChange={setBusqueda}
        /* La clave `arbol` recién existe cuando hay datos: SemanticAbmPage
           decide con `in`, y un slot presente con null se lee como "vista sin
           cuerpo" en vez de caer al loading. */
        viewSlots={data ? {
          arbol: (
            <>
              {/* Banda de dependencias: REFERENCIA arriba (y filtro), nunca
                  un nivel de la grilla — la relación se edita en Asignaciones. */}
              {data.deps.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', rowGap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', marginRight: '2px' }}>QUIÉN ATIENDE</span>
                  {([
                    { clave: 'todas' as const, nombre: 'Todas', color: null, n: tramitesUnicos.length },
                    ...data.deps.map((d) => ({ clave: d.id as number | 'todas' | 'sin', nombre: d.nombre, color: d.color, n: d.tramiteIds.length })),
                    ...(sinDepCount > 0 ? [{ clave: 'sin' as const, nombre: 'Sin dependencia', color: 'var(--pl-red-700)', n: sinDepCount }] : []),
                  ]).map((c) => {
                    const activo = depFiltro === c.clave;
                    return (
                      <button
                        key={String(c.clave)}
                        type="button"
                        onClick={() => setDepFiltro(activo ? 'todas' : c.clave)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '7px', height: '30px', padding: '0 12px', borderRadius: '999px',
                          border: `1px solid ${activo ? 'var(--pl-border-strong)' : 'var(--pl-border)'}`,
                          background: activo ? 'var(--pl-surface)' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: c.color ?? 'var(--pl-text-faint)', flex: '0 0 6px' }}></span>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: activo ? 'var(--pl-text)' : 'var(--pl-text-2)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span>
                        <span className="av2-tnum" style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pl-text-faint)' }}>{c.n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <PanelArbol
                tramites={visibles}
                onNuevoTramite={(categoriaId) => setAltaTramite({ abierta: true, categoriaId })}
                onEditarTramite={(raw) => setTramiteEnEdicion(raw)}
                onNuevaCategoria={() => setSheetCategoria({ abierta: true, categoria: null })}
                onEditarCategoria={(raw) => setSheetCategoria({ abierta: true, categoria: raw })}
              />
            </>
          ),
        } : undefined}
        activeView="arbol"
        views={['arbol']}
        onViewChange={() => {}}
        /* El cuerpo entra por `viewSlots`, así que no hay grilla que describir.
           El contrato de SemanticAbmPage pide igual las props de tabla: van en
           neutro. Cuando el kit las vuelva opcionales para páginas con slot,
           este bloque se borra entero. */
        kind="plain"
        columns={[]}
        rows={[]}
        rowKey={(_r: unknown, i?: number) => String(i ?? 0)}
        rowActions={[]}
        selects={[]}
        statusTabs={[]}
        activeStatus="todos"
        onStatusChange={() => {}}
        footer={{
          showing: `${totalCategorias} categorías · ${tramitesUnicos.length} tipos`,
          note: 'Quién atiende cada trámite se define en Asignaciones, no acá.',
        }}
        embedded={true}
      />

      <AltaTramiteWizard
        open={altaTramite.abierta}
        categoriaInicial={altaTramite.categoriaId}
        onClose={() => setAltaTramite({ abierta: false, categoriaId: null })}
        onGuardado={recargar}
      />
      <EdicionTramiteSheet
        open={tramiteEnEdicion !== null}
        tramite={tramiteEnEdicion}
        onClose={() => setTramiteEnEdicion(null)}
        onGuardado={recargar}
      />
      <CategoriaTramiteSheet
        open={sheetCategoria.abierta}
        categoria={sheetCategoria.categoria}
        onClose={() => setSheetCategoria({ abierta: false, categoria: null })}
        onGuardado={recargar}
      />
    </>
  );
}

export default ArbolDelCanvas;
