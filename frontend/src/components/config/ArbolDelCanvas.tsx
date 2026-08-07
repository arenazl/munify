/**
 * ArbolDelCanvas — el catálogo de trámites leído como jerarquía.
 *
 * Categoría → tipo de trámite → requisitos. El cuerpo NO es una grilla: entra
 * por `viewSlots.arbol`, y por eso las props de tabla van en neutro (el kit las
 * pide igual; ver nota abajo).
 *
 * La dependencia se muestra como DATO, no como control: acá se da de alta el
 * trámite, y a quién le toca atenderlo se decide en la pestaña Asignación. Un
 * segundo lugar para editar el mismo vínculo es cómo aparecen las dos verdades.
 */
import { useEffect, useMemo, useState } from 'react';
import { SemanticAbmPage } from '../abmv2/SemanticAbmPage';
import PanelArbol from '../../pages/Configuracion/panels/PanelArbol';
import { cargarArbolReal } from '../../pages/Configuracion/data/datosRealesConfig';

export interface ArbolDelCanvasProps {
  /** Alta de un tipo de trámite. Sin handler el CTA no se dibuja. */
  onNuevo?: () => void;
}

export function ArbolDelCanvas({ onNuevo }: ArbolDelCanvasProps) {
  const [data, setData] = useState<any[] | null>(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    cargarArbolReal().then(setData).catch(console.error);
  }, []);

  const totalCategorias = (data || []).reduce((acc: number, dep: any) => acc + (dep.hijos?.length || 0), 0);
  const totalTramites = (data || []).reduce((acc: number, dep: any) => {
    return acc + (dep.hijos?.reduce((acc2: number, cat: any) => acc2 + (cat.tramites?.length || 0), 0) || 0);
  }, 0);

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
    <SemanticAbmPage
      moduleKey="arbol-tramite"
      title="Trámites"
      description={`${totalCategorias} categorías y ${totalTramites} tipos en una sola vista, con los prerrequisitos que enfrenta el vecino en cada uno.`}
      primaryAction={onNuevo ? { label: 'Nuevo tipo de trámite', onClick: onNuevo } : undefined}
      pista={{
        titulo: 'Arrancá con la estructura sugerida y complejizala cuando la necesites.',
        texto: 'Nada se aplica sin que lo confirmes: la sugerencia queda marcada en el árbol para que la revises rama por rama.',
      }}
      loading={!data}
      searchPlaceholder="Buscar categoría o trámite…"
      search={busqueda}
      onSearchChange={setBusqueda}
      viewSlots={{ arbol: data ? <PanelArbol tramites={visibles} /> : null }}
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
        showing: `${totalCategorias} categorías · ${totalTramites} tipos`,
        note: 'Quién atiende cada trámite se define en Asignación, no acá.',
      }}
      embedded={true}
    />
  );
}

export default ArbolDelCanvas;
