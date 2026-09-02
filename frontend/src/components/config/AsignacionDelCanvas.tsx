/**
 * AsignacionDelCanvas — quién atiende cada categoría, en los dos mundos.
 *
 * Orquesta el PanelAsignacion (canvas): segmented Reclamos | Trámites,
 * huérfanas en rojo, nodo READONLY por dependencia, y acciones que impactan
 * de verdad con los endpoints que ya existían (el tablero de arrastre viejo
 * usaba estos mismos):
 *   - reclamos: asignarCategorias(muniDep, lista completa) — el backend
 *     garantiza 1 categoría = 1 dependencia y REEMPLAZA el set de esa dep,
 *     por eso siempre se manda la lista recalculada.
 *   - trámites: setDependenciaTramite(tipo, muniDep) por cada tipo de la
 *     categoría (la categoría arrastra sus tipos).
 *   - IA: los auto-asignar existentes; APLICAN el mapa completo del mundo
 *     activo (por eso el ConfirmModal antes).
 *
 * La celda de la derecha es el ModernSelect del kit (searchable): un nivel,
 * listado entero de secretarías, en los dos mundos por igual.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import PanelAsignacion from '../../pages/Configuracion/panels/PanelAsignacion';
import { PantallaDeAjuste } from './PantallaDeAjuste';
import {
  cargarAsignacion,
  type DatosAsignacion,
  type FilaAsignacion,
  type ModoAsignacion,
} from '../../pages/Configuracion/data/datosRealesConfig';
import { dependenciasApi, turnosApi } from '../../lib/api';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useReportarTotal } from '../abmv2/useEmbed';

export interface AsignacionDelCanvasProps {
  title: string;
}

export function AsignacionDelCanvas({ title }: AsignacionDelCanvasProps) {
  const [modo, setModo] = useState<ModoAsignacion>('reclamos');
  /* Caché por mundo: cambiar de segmented NO borra la pantalla ni refetchea —
     cada mundo se trae UNA vez y el switch es instantáneo (pedido del dueño
     2026-08-13: nada de "postback"). Se invalida sólo al guardar/IA. */
  const [cache, setCache] = useState<Partial<Record<ModoAsignacion, DatosAsignacion>>>({});
  const datos = cache[modo] ?? null;
  const [conteos, setConteos] = useState<{ reclamos: number | null; tramites: number | null }>({ reclamos: null, tramites: null });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoIA, setConfirmandoIA] = useState(false);
  const [aplicandoIA, setAplicandoIA] = useState(false);

  const recargar = useCallback((m: ModoAsignacion) => {
    setError(null);
    cargarAsignacion(m)
      .then((d) => {
        setCache((prev) => ({ ...prev, [m]: d }));
        setConteos((prev) => ({ ...prev, [m]: d.filas.length }));
      })
      .catch((e) => {
        console.error('No se pudieron traer las asignaciones:', e);
        setError(e?.response?.data?.detail || e?.message || 'Error desconocido');
      });
  }, []);

  useEffect(() => {
    if (!cache[modo]) recargar(modo);
  }, [modo, cache, recargar]);

  /* El contador del riel = huérfanas del mundo activo (canvas: baja en vivo
     al asignar). */
  const sinAsignar = useMemo(
    () => (datos ? datos.filas.filter((f) => !f.depId).length : undefined),
    [datos],
  );
  useReportarTotal(sinAsignar);

  /* --- Acciones reales --- */

  const asignarReclamo = async (fila: FilaAsignacion, depDestinoId: number | null) => {
    if (!datos) return;
    const origen = datos.deps.find((d) => d.id === fila.depId);
    const destino = datos.deps.find((d) => d.id === depDestinoId);
    // El POST reemplaza el set completo de la dependencia: siempre va la
    // lista recalculada. Al asignar a otra dep, el backend la quita solo de
    // la anterior (1 categoría = 1 dependencia).
    if (destino) {
      await dependenciasApi.asignarCategorias(destino.id, [...new Set([...destino.categoriaIds, fila.id])]);
    } else if (origen) {
      await dependenciasApi.asignarCategorias(origen.id, origen.categoriaIds.filter((id) => id !== fila.id));
    }
  };

  const asignarTramites = async (fila: FilaAsignacion, depDestinoId: number | null) => {
    const tipos = fila.tipoIds ?? [];
    if (!tipos.length) {
      toast.error('Esta categoría no tiene tipos de trámite todavía.');
      return;
    }
    // La categoría arrastra sus tipos: un PUT atómico por tipo (el vínculo
    // del turnero es por trámite).
    for (const tipoId of tipos) {
      await turnosApi.setDependenciaTramite(tipoId, depDestinoId);
    }
  };

  const asignar = async (fila: FilaAsignacion, depDestinoId: number | null) => {
    if (!datos) return;
    if (fila.depId === depDestinoId && !fila.depMixta) return; // sin cambio real
    setGuardando(true);
    try {
      if (modo === 'reclamos') await asignarReclamo(fila, depDestinoId);
      else await asignarTramites(fila, depDestinoId);
      const destino = datos.deps.find((d) => d.id === depDestinoId);
      toast.success(
        destino
          ? `${fila.nombre} ahora la atiende ${destino.nombre}.`
          : `${fila.nombre} quedó sin dependencia.`,
      );
      recargar(modo);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo guardar la asignación');
    } finally {
      setGuardando(false);
    }
  };

  const aplicarIA = async () => {
    if (!datos) return;
    setConfirmandoIA(false);
    setAplicandoIA(true);
    try {
      const depsPayload = datos.deps.map((d) => ({
        id: d.dependenciaId,
        nombre: d.nombre,
        descripcion: d.descripcion ?? undefined,
      }));
      const catsPayload = datos.filas.map((f) => ({ id: f.id, nombre: f.nombre }));
      if (modo === 'reclamos') {
        await dependenciasApi.autoAsignarCategoriasIA(catsPayload, depsPayload);
      } else {
        await dependenciasApi.autoAsignarCategoriasTramiteIA(catsPayload, depsPayload);
      }
      toast.success('La IA asignó el mapa completo. Revisalo y ajustá lo que no cierre.');
      recargar(modo);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'La IA no pudo asignar');
    } finally {
      setAplicandoIA(false);
    }
  };

  /* --- Veredicto del hero (números reales del mundo activo) --- */
  const cabecera = useMemo(() => {
    if (!datos) return { veredicto: 'Trayendo las asignaciones…', resaltado: undefined as string | undefined, tono: undefined as 'bueno' | 'malo' | undefined };
    const total = datos.filas.length;
    const huerfanas = datos.filas.filter((f) => !f.depId).length;
    const cosa = modo === 'reclamos' ? 'de reclamo' : 'de trámite';
    if (huerfanas === 0) {
      return {
        veredicto: `Las ${total} categorías ${cosa} tienen dependencia. ${modo === 'reclamos' ? 'Todo reclamo que entra se deriva solo, sin que nadie lo toque.' : 'Todo trámite que entra se deriva solo, sin que nadie lo toque.'}`,
        resaltado: `${total} categorías ${cosa} tienen dependencia`,
        tono: 'bueno' as const,
      };
    }
    const conUso = modo === 'reclamos' && datos.usoTotal > 0
      ? ` Por esas entraron ${datos.usoSinAsignar} de los ${datos.usoTotal} reclamos históricos, y cada uno hubo que derivarlo a mano.`
      : ' El turnero no puede reservar turnos para lo que entre por ahí.';
    return {
      veredicto: `${huerfanas} de ${total} categorías ${cosa} no tienen dependencia.${conUso}`,
      resaltado: `${huerfanas} de ${total} categorías ${cosa} no tienen dependencia`,
      tono: 'malo' as const,
    };
  }, [datos, modo]);

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

  const filas = datos?.filas ?? [];
  const huerfanas = filas.filter((f) => !f.depId).length;

  return (
    <PantallaDeAjuste
      eyebrow={`CATÁLOGOS · ${title.toUpperCase()}`}
      veredicto={cabecera.veredicto}
      resaltado={cabecera.resaltado}
      tono={cabecera.tono}
    >
      {/* El skeleton de pantalla completa es SOLO del primer render de la
          pestaña; el cambio de mundo mantiene el shell (segmented, chips,
          tabla) y carga adentro. */}
      {!datos && !cache.reclamos && !cache.tramites ? (
        <div className="av2-skeleton" style={{ minHeight: 220 }} aria-busy />
      ) : (
        <PanelAsignacion
          modo={modo}
          onModo={setModo}
          cargando={!datos}
          conteoReclamos={conteos.reclamos}
          conteoTramites={conteos.tramites}
          filas={filas}
          deps={(datos ?? cache.reclamos ?? cache.tramites)!.deps.map((d) => ({ id: d.id, nombre: d.nombre, color: d.color }))}
          labelIA={huerfanas > 0 ? `Autoasignar con IA (${huerfanas})` : 'Reasignar con IA'}
          aplicandoIA={aplicandoIA}
          onIA={() => setConfirmandoIA(true)}
          onAsignar={asignar}
          guardando={guardando}
          pie={
            modo === 'reclamos'
              ? 'Una categoría sin dependencia entra a la cola sin dueño: alguien la tiene que derivar a mano.'
              : 'Todas las categorías con dependencia: los trámites se derivan solos al entrar.'
          }
          resumen={`${filas.length - huerfanas} de ${filas.length} categorías`}
        />
      )}

      <ConfirmModal
        isOpen={confirmandoIA}
        title={`Autoasignar ${modo === 'reclamos' ? 'reclamos' : 'trámites'} con IA`}
        message={`La IA arma el mapa COMPLETO de ${modo === 'reclamos' ? 'categorías de reclamo' : 'categorías de trámite'} → dependencias y lo aplica de una (pisa las asignaciones actuales de este mundo). Después podés ajustar cualquier fila a mano.`}
        onConfirm={aplicarIA}
        onClose={() => setConfirmandoIA(false)}
      />
    </PantallaDeAjuste>
  );
}

export default AsignacionDelCanvas;
