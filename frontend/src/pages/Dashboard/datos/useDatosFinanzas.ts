/**
 * useDatosFinanzas — el dominio FINANZAS del dashboard (tesorería + lo que
 * cuelga de ella: la nómina y la contaduría).
 *
 * Un hook por DOMINIO, mismo contrato que `useDatosReclamos`: se llama
 * SIEMPRE (cero riesgo de React #310) y con `enabled=false` no dispara ni un
 * request. Cada pieza va con su `.catch` propio — un muni sin conciliación
 * importada no puede dejar sin saldo de cajas al resto del tablero.
 *
 * QUÉ SE PIDE Y QUÉ NO
 *  - Cajas, agenda de pagos y la serie de gasto: siempre (son tesorería).
 *  - OPs pendientes: SÓLO con contaduría activa. Sin ese módulo el endpoint
 *    existe igual, pero preguntar por órdenes de pago a un muni que no las
 *    emite es tráfico para mostrar un cero — y un cero no se enuncia.
 *  - Conciliación: SÓLO cuando contaduría está apagada, porque ahí es la que
 *    ocupa la 5.ª tarjeta del pool. `/conciliacion/pendientes` es POR CAJA,
 *    así que son N requests: se acotan a las cajas activas que no son
 *    tarjetas (una tarjeta no se concilia contra el extracto del banco).
 *  - Nómina: SÓLO con sueldos activo y contaduría apagada — es la tercera
 *    cola de pagos en ese reparto, y con contaduría la ocupan las OPs.
 *
 * VENTANA DE LA SERIE: 120 días, no 90. La tendencia necesita tres meses
 * COMPLETOS para comparar, y con 90 días el más viejo de los tres entra
 * cortado por la mitad (en San Pedro Norte, mayo arrancaría el 27).
 */
import { useEffect, useMemo, useState } from 'react';
import { agendaPagosApi, cajasApi, conciliacionApi, gastosApi, ordenesPagoApi } from '../../../lib/api';
import type { Caja, PagoProgramado } from '../../../types';
import type { DatosFinanzas, NominaResumen, PilaFinanciera, PuntoSerieGasto } from '../tipos';

/** Días de serie de gasto que se piden: TRES AÑOS. La tendencia muestra toda
 *  la historia del muni (segmentada por año cuando es larga); 1095 puntos
 *  diarios son ~40KB de payload y un solo GROUP BY indexado. */
export const DIAS_SERIE_GASTO = 1095;

export interface OpcionesDatosFinanzas {
  /** Módulo tesorería activo Y página lista (módulos + dependencias). */
  enabled: boolean;
  contaduriaActiva: boolean;
  sueldosActivo: boolean;
  refreshKey: number;
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function useDatosFinanzas(opts: OpcionesDatosFinanzas): DatosFinanzas {
  const { enabled, contaduriaActiva, sueldosActivo, refreshKey } = opts;

  const [cajas, setCajas] = useState<Caja[]>([]);
  const [pagos, setPagos] = useState<PagoProgramado[]>([]);
  const [serie, setSerie] = useState<PuntoSerieGasto[]>([]);
  const [desdeOperativo, setDesdeOperativo] = useState<string | null>(null);
  const [opPendientes, setOpPendientes] = useState<PilaFinanciera | null>(null);
  const [conciliacion, setConciliacion] = useState<PilaFinanciera | null>(null);
  const [nomina, setNomina] = useState<NominaResumen | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;

    const fetchAll = async () => {
      // ---- Etapa 1: lo que SIEMPRE hace falta, en paralelo ----
      const [cajasRes, pagosRes, serieRes, inicioRes] = await Promise.all([
        cajasApi.list({ activo: true, include_saldos: true })
          .catch((err) => { console.error('Error cargando cajas:', err); return { data: [] }; }),
        agendaPagosApi.list({ activo: true })
          .catch((err) => { console.error('Error cargando agenda de pagos:', err); return { data: [] }; }),
        gastosApi.serie(DIAS_SERIE_GASTO)
          .catch((err) => { console.error('Error cargando serie de gastos:', err); return { data: [] }; }),
        // Sin esta señal la tendencia no se cae: usa su regla de densidad.
        gastosApi.inicioOperativo()
          .catch((err) => { console.error('Error cargando inicio operativo:', err); return { data: { desde: null } }; }),
      ]);
      if (cancel) return;
      setCajas((cajasRes.data || []) as Caja[]);
      setPagos((pagosRes.data || []) as PagoProgramado[]);
      setSerie((serieRes.data || []) as PuntoSerieGasto[]);
      setDesdeOperativo(inicioRes.data?.desde ?? null);
      // La primera carga termina acá: el tablero ya puede dibujarse. Lo de
      // abajo llena la 5.ª tarjeta y la 3.ª cola, que toleran llegar después.
      setCargando(false);

      // ---- Etapa 2: lo que depende de los módulos ----
      if (contaduriaActiva) {
        try {
          const res = await ordenesPagoApi.resumen();
          if (cancel) return;
          const p = res.data?.por_estado?.pendiente;
          setOpPendientes({ cantidad: p?.cantidad ?? 0, monto: num(p?.monto) });
        } catch (err) {
          console.error('Error cargando resumen de órdenes de pago:', err);
        }
      } else {
        // Sin contaduría la 5.ª tarjeta la ocupa la conciliación. Es N
        // requests (uno por caja), así que se acota a las que se concilian:
        // activas y no-tarjeta.
        const conciliables = ((cajasRes.data || []) as Caja[]).filter((c) => !c.es_tarjeta);
        try {
          const res = await Promise.all(
            conciliables.map((c) => conciliacionApi.pendientes(c.id).catch(() => ({ data: [] }))),
          );
          if (cancel) return;
          const filas = res.flatMap((r) => (r.data || []) as { monto: string }[]);
          setConciliacion({
            cantidad: filas.length,
            monto: filas.reduce((acc, m) => acc + num(m.monto), 0),
          });
        } catch (err) {
          console.error('Error cargando conciliación pendiente:', err);
        }
      }

      if (sueldosActivo && !contaduriaActiva) {
        try {
          const res = await agendaPagosApi.reportes();
          if (cancel) return;
          setNomina({
            empleados: res.data?.cantidad_empleados ?? 0,
            masa: num(res.data?.masa_salarial_mes),
            pagos: res.data?.cantidad_pagos_activos ?? 0,
          });
        } catch (err) {
          console.error('Error cargando reportes de nómina:', err);
        }
      }
    };

    fetchAll().catch((err) => {
      console.error('Error general cargando finanzas:', err);
      if (!cancel) setCargando(false);
    });
    return () => { cancel = true; };
  }, [enabled, contaduriaActiva, sueldosActivo, refreshKey]);

  // MEMOIZADO a propósito: cuatro consumidores (el hero del orquestador y las
  // tres secciones) hacen `useMemo(..., [datos.finanzas])` para no rearmar los
  // veredictos en cada render. Con un objeto nuevo por render esos memos no
  // sirven de nada, y el hero semántico recibiría un `frases` distinto cada
  // vez. Las piezas de adentro son referencias de estado: sólo cambian cuando
  // llegan datos nuevos.
  return useMemo(() => ({
    cajas,
    pagos,
    serie,
    desdeOperativo,
    opPendientes,
    conciliacion,
    nomina,
    // Con el módulo apagado nadie espera nada. El flag interno queda en true
    // para que, si el módulo se prende, la primera carga muestre el skeleton
    // en vez de un tablero vacío por un frame (mismo criterio que reclamos).
    cargando: enabled ? cargando : false,
  }), [cajas, pagos, serie, desdeOperativo, opPendientes, conciliacion, nomina, enabled, cargando]);
}
