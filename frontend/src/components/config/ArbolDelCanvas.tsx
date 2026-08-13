/**
 * ArbolDelCanvas — el catálogo de trámites leído como jerarquía.
 *
 * Dependencia del municipio → categoría → tipo de trámite → prerrequisitos.
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
import { cargarArbolReal } from '../../pages/Configuracion/data/datosRealesConfig';
import { AltaTramiteWizard, EdicionTramiteSheet } from './tramiteFlows';
import { CategoriaTramiteSheet } from './CategoriaTramiteSheet';
import { seg } from '../../lib/semanticHero';
import type { HeroFrase, HeroKpi } from '../../lib/semanticHero';
import { useReportarTotal } from '../abmv2/useEmbed';

export function ArbolDelCanvas() {
  const [data, setData] = useState<any[] | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const recargar = useCallback(() => {
    cargarArbolReal().then(setData).catch(console.error);
  }, []);
  useEffect(() => { recargar(); }, [recargar]);

  /* --- Sheets: alta de trámite (wizard de producción), edición de trámite y
         alta/edición de categoría. El árbol es el dueño de sus flujos. --- */
  const [altaTramite, setAltaTramite] = useState<{ abierta: boolean; categoriaId: number | null }>({ abierta: false, categoriaId: null });
  const [tramiteEnEdicion, setTramiteEnEdicion] = useState<any | null>(null);
  const [sheetCategoria, setSheetCategoria] = useState<{ abierta: boolean; categoria: any | null }>({ abierta: false, categoria: null });

  /* Totales SIN duplicar: una categoría puede aparecer bajo dos dependencias
     si sus trámites se reparten; el hero cuenta entidades, no nodos. */
  const tramitesPlanos = useMemo(
    () => (data || []).flatMap((dep: any) => (dep.hijos || []).flatMap((c: any) => c.tramites || [])),
    [data],
  );
  const totalCategorias = useMemo(
    () => new Set((data || []).flatMap((dep: any) => (dep.hijos || []).map((c: any) => c.id))).size,
    [data],
  );
  const tramitesUnicos = useMemo(() => {
    const vistos = new Map<number, any>();
    tramitesPlanos.forEach((t: any) => vistos.set(t.id, t));
    return Array.from(vistos.values());
  }, [tramitesPlanos]);
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

  /* El buscador filtra la rama entera: si el texto matchea la categoría se
     conserva completa; si matchea sólo un trámite, queda la categoría con ese
     trámite. Sin esto el input estaría de adorno. */
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q || !data) return data || [];
    const coincide = (v: unknown) => String(v ?? '').toLowerCase().includes(q);
    return data
      .map((dep: any) => {
        if (coincide(dep.nombre ?? dep.n)) return dep;
        const hijos = (dep.hijos || [])
          .map((cat: any) => {
            if (coincide(cat.nombre ?? cat.n)) return cat;
            const tramites = (cat.tramites || []).filter((t: any) => coincide(t.nombre ?? t.n));
            return tramites.length ? { ...cat, tramites } : null;
          })
          .filter(Boolean);
        return hijos.length ? { ...dep, hijos } : null;
      })
      .filter(Boolean);
  }, [data, busqueda]);

  return (
    <>
      <SemanticAbmPage
        moduleKey="arbol-tramite"
        title="Trámites"
        hero={{ etiqueta: 'ATENCIÓN AL VECINO · TRÁMITES', frases, kpis }}
        primaryAction={{
          label: 'Nueva categoría de trámite',
          onClick: () => setSheetCategoria({ abierta: true, categoria: null }),
        }}
        pista={{
          titulo: 'Arrancá con la estructura sugerida y complejizala cuando la necesites.',
          texto: 'Nada se aplica sin que lo confirmes: la sugerencia queda marcada en el árbol para que la revises rama por rama.',
        }}
        loading={!data}
        searchPlaceholder="Buscar dependencia, categoría o trámite…"
        search={busqueda}
        onSearchChange={setBusqueda}
        /* La clave `arbol` recién existe cuando hay datos: SemanticAbmPage
           decide con `in`, y un slot presente con null se lee como "vista sin
           cuerpo" en vez de caer al loading. */
        viewSlots={data ? {
          arbol: (
            <PanelArbol
              tramites={visibles}
              onNuevoTramite={(categoriaId) => setAltaTramite({ abierta: true, categoriaId })}
              onEditarTramite={(raw) => setTramiteEnEdicion(raw)}
              onNuevaCategoria={() => setSheetCategoria({ abierta: true, categoria: null })}
              onEditarCategoria={(raw) => setSheetCategoria({ abierta: true, categoria: raw })}
            />
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
          note: 'Quién atiende cada trámite se define en Asignación, no acá.',
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
