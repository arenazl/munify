import * as XLSX from 'xlsx';
import type { ProyeccionResponse, CuotaProyeccion } from '../types';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface FiltrosAplicados {
  desde: string;
  hasta: string;
  dependencia_nombre?: string | null;
  contacto_nombre?: string | null;
  tipo_financiacion?: string | null;
  concepto?: string | null;
}

/**
 * Exporta la proyeccion de pagos a un archivo Excel con 2 hojas:
 *  - Resumen: KPIs y desglose mensual + por tipo de financiacion.
 *  - Detalle: lista de cuotas individuales si fueron cargadas (drill-down).
 *
 * Llama a `XLSX.writeFile` que dispara la descarga en el browser.
 */
export function exportProyeccionExcel(
  data: ProyeccionResponse,
  filtros: FiltrosAplicados,
  cuotasDetalle?: CuotaProyeccion[],
): void {
  const wb = XLSX.utils.book_new();

  // -------- Hoja 1: Resumen --------
  const resumen: (string | number)[][] = [
    ['Proyección de Pagos'],
    [],
    ['Periodo desde:', filtros.desde],
    ['Periodo hasta:', filtros.hasta],
  ];
  if (filtros.dependencia_nombre) resumen.push(['Dependencia:', filtros.dependencia_nombre]);
  if (filtros.contacto_nombre) resumen.push(['Contacto:', filtros.contacto_nombre]);
  if (filtros.tipo_financiacion) resumen.push(['Tipo financiacion:', filtros.tipo_financiacion]);
  if (filtros.concepto) resumen.push(['Concepto contiene:', filtros.concepto]);
  resumen.push(
    [],
    ['Total proyectado:', Number(data.total_pesos)],
    ['Cantidad de cuotas:', data.cantidad_cuotas],
    ['Cuotas vencidas:', data.cuotas_vencidas ?? 0],
  );
  if (data.mes_pico) {
    resumen.push([
      'Mes pico:',
      `${MESES[data.mes_pico.mes - 1]} ${data.mes_pico.anio}`,
      Number(data.mes_pico.total_pesos),
    ]);
  }

  resumen.push(
    [],
    ['Detalle mensual'],
    ['Mes', 'Total ($)', 'Cuotas', 'Vencidas'],
  );
  for (const m of data.por_mes) {
    resumen.push([
      `${MESES[m.mes - 1]} ${m.anio}`,
      Number(m.total_pesos),
      m.cantidad_cuotas,
      m.cuotas_vencidas ?? 0,
    ]);
  }

  if (data.desglose_por_tipo && data.desglose_por_tipo.length > 0) {
    resumen.push(
      [],
      ['Desglose por tipo de financiacion'],
      ['Tipo', 'Total ($)', 'Cuotas'],
    );
    for (const t of data.desglose_por_tipo) {
      resumen.push([t.tipo, Number(t.total_pesos), t.cantidad_cuotas]);
    }
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  // Anchos de columna
  wsResumen['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // -------- Hoja 2: Detalle (si hay cuotas cargadas) --------
  if (cuotasDetalle && cuotasDetalle.length > 0) {
    const detalle = cuotasDetalle.map(c => ({
      'Fecha venc.': c.fecha_vencimiento,
      'Concepto': c.concepto,
      'Contacto': c.contacto_nombre ?? '',
      'Dependencia': c.dependencia_nombre ?? '',
      'Tipo': c.tipo_financiacion,
      'Cuota N°': c.total_cuotas ? `${c.numero_cuota}/${c.total_cuotas}` : String(c.numero_cuota),
      'Monto ($)': Number(c.monto),
      'Estado': c.estado,
    }));
    const wsDetalle = XLSX.utils.json_to_sheet(detalle);
    wsDetalle['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 24 }, { wch: 24 },
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de cuotas');
  }

  XLSX.writeFile(wb, `proyeccion_pagos_${filtros.desde}_${filtros.hasta}.xlsx`);
}
