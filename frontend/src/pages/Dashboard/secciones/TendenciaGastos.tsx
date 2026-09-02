/**
 * TendenciaGastos — el recorrido de los últimos meses de GASTO.
 *
 * Es la MISMA pieza que la tendencia de reclamos (`TendenciaMeses`), en modo
 * 'monto': una serie en pesos, veredictos de gasto y mini-KPIs de dinero. No
 * hay componente nuevo — la pieza del kit se generalizó por props, que es lo
 * que se pedía: mismos gráficos, otros datos.
 *
 * La pieza se calla sola cuando no hay NADA cargado (devuelve null) y cambia
 * de escala cuando hay un solo mes con gasto: ahí muestra la ventana de días
 * hasta hoy en vez de un carrusel de un mes suelto.
 */
import { useMemo } from 'react';
import { TendenciaMeses } from '../../../components/dashboard/TendenciaMeses';
import { formatoMonto, serieParaTendencia } from '../armadoresFinanzas';
import type { SeccionProps } from '../tipos';

export function TendenciaGastos({ datos }: SeccionProps) {
  const serie = datos.finanzas.serie;
  const puntos = useMemo(() => serieParaTendencia(serie), [serie]);

  return (
    <TendenciaMeses
      datos={puntos}
      desde={datos.finanzas.desdeOperativo ?? undefined}
      modo="monto"
      titulo="Tendencia de gastos"
      etiquetaAccesible="Tendencia de gastos"
      formatoValor={formatoMonto}
    />
  );
}
