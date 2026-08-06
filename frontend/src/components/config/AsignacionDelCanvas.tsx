import React, { useState, useEffect } from 'react';
import PanelAsignacion, { GrupoAsig, TabAsig } from '../../pages/ConfiguracionMockup/panels/PanelAsignacion';
import PanelHeader from '../../pages/ConfiguracionMockup/components/PanelHeader';
import { cargarAsignacionReal } from '../../pages/ConfiguracionMockup/data/datosRealesConfig';

export interface AsignacionDelCanvasProps {
  title: string;
  veredicto: string;
}

export function AsignacionDelCanvas({ title, veredicto }: AsignacionDelCanvasProps) {
  const [data, setData] = useState<{
    tabsAsig: TabAsig[];
    haySugerencias: boolean;
    labelSugerencias: string;
    gruposAsig: GrupoAsig[];
    pieAsig: string;
  } | null>(null);

  useEffect(() => {
    cargarAsignacionReal().then(setData).catch(console.error);
  }, []);

  if (!data) return <div>Cargando asignaciones...</div>;

  return (
    <>
      <PanelHeader titulo={title} veredicto={veredicto} />
      <PanelAsignacion 
        tabsAsig={data.tabsAsig}
        haySugerencias={data.haySugerencias}
        labelSugerencias={data.labelSugerencias}
        chipsAsig={[]}
        colUsoAsig="USO"
        gruposAsig={data.gruposAsig}
        pieAsig={data.pieAsig}
        resumenAsig=""
        onTabClick={() => {}} 
        onAplicarTodas={() => {}} 
        onChipClick={() => {}} 
        onQuitarFila={() => {}} 
        onAplicarFila={() => {}}
      />
    </>
  );
}

export default AsignacionDelCanvas;
