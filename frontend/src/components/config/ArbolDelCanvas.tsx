import React, { useState, useEffect } from 'react';
import { SemanticAbmPage } from '../abmv2/SemanticAbmPage';
import PanelArbol from '../../pages/ConfiguracionMockup/panels/PanelArbol';
import { cargarArbolReal } from '../../pages/ConfiguracionMockup/data/datosRealesConfig';

export function ArbolDelCanvas() {
  const [data, setData] = useState<any[] | null>(null);

  useEffect(() => {
    cargarArbolReal().then(setData).catch(console.error);
  }, []);

  const totalCategorias = (data || []).reduce((acc: number, dep: any) => acc + (dep.hijos?.length || 0), 0);
  const totalTramites = (data || []).reduce((acc: number, dep: any) => {
    return acc + (dep.hijos?.reduce((acc2: number, cat: any) => acc2 + (cat.tramites?.length || 0), 0) || 0);
  }, 0);

  return (
    <SemanticAbmPage
      moduleKey="arbol-tramite"
      title="Trámites"
      description={`${totalCategorias} categorías y ${totalTramites} tipos en una sola vista, con los prerrequisitos que enfrenta el vecino en cada uno.`}
      primaryAction={{
        label: 'Nuevo tipo de trámite',
        onClick: () => {}
      }}
      pista={{
        titulo: 'Arrancá con la estructura sugerida y complejizala cuando la necesites.',
        texto: 'Nada se aplica sin que lo confirmes: la sugerencia queda marcada en el árbol para que la revises rama por rama.'
      }}
      loading={!data}
      viewSlots={{
        arbol: data ? <PanelArbol tramites={data} /> : null
      }}
      activeView="arbol"
      views={[{ id: 'arbol', label: 'Árbol', icon: 'FolderTree' }]}
      embedded={true}
    />
  );
}

export default ArbolDelCanvas;
