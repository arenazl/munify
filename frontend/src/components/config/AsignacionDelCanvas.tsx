/**
 * AsignacionDelCanvas — qué categorías atiende cada dependencia.
 *
 * Usa el MISMO hero que el resto de Configuración (`PantallaDeAjuste`), en su
 * variante `simple`: acá el dato que importa es cuántas categorías quedaron
 * sin dueño, y eso se dice en una frase — no necesita stat strip.
 */
import { useState, useEffect } from 'react';
import PanelAsignacion, { GrupoAsig, TabAsig } from '../../pages/Configuracion/panels/PanelAsignacion';
import { PantallaDeAjuste } from './PantallaDeAjuste';
import { cargarAsignacionReal } from '../../pages/Configuracion/data/datosRealesConfig';

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

  const [error, setError] = useState<string | null>(null);

  /* El catch NO se traga el error: antes iba a `console.error` y la pantalla
     se quedaba en "Cargando asignaciones…" para siempre, que se lee como
     "tarda" y es "se rompió". Un fallo que no se ve es un fallo que nadie
     arregla. */
  useEffect(() => {
    cargarAsignacionReal()
      .then(setData)
      .catch((e) => {
        console.error('No se pudieron traer las asignaciones:', e);
        setError(e?.response?.data?.detail || e?.message || 'Error desconocido');
      });
  }, []);

  if (error) {
    return (
      <PantallaDeAjuste
        eyebrow={`CATÁLOGOS · ${title.toUpperCase()}`}
        veredicto={`No se pudieron traer las asignaciones: ${error}`}
        resaltado="No se pudieron traer las asignaciones"
        tono="malo"
      >
        <span />
      </PantallaDeAjuste>
    );
  }

  if (!data) return <div className="av2-skeleton" style={{ minHeight: 220 }} aria-busy />;

  /* Las categorías sin dependencia son EL dato de esta pantalla: cada una es
     un reclamo que va a entrar y nadie va a recibir. Si hay, se resalta. */
  const sinDuenio = data.gruposAsig
    .flatMap((g) => g.filas || [])
    .filter((f) => f.sinAsignar).length;
  const frase = sinDuenio
    ? `${sinDuenio} ${sinDuenio === 1 ? 'categoría no tiene' : 'categorías no tienen'} dependencia: lo que entre por ahí hay que derivarlo a mano.`
    : veredicto || 'Todas las categorías tienen dependencia: lo que entra se deriva solo.';

  return (
    <PantallaDeAjuste
      eyebrow={`CATÁLOGOS · ${title.toUpperCase()}`}
      veredicto={frase}
      resaltado={sinDuenio ? `${sinDuenio} ${sinDuenio === 1 ? 'categoría no tiene' : 'categorías no tienen'} dependencia` : undefined}
      tono={sinDuenio ? 'malo' : undefined}
    >
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
    </PantallaDeAjuste>
  );
}

export default AsignacionDelCanvas;
