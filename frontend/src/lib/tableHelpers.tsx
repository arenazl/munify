import React from 'react';

/**
 * Helpers reutilizables para renderizar columnas de ABMTable
 * Evita código repetido en cada página
 */

// Tipos genéricos para los objetos que pueden tener estas propiedades
interface WithEmpleado {
  empleado_asignado?: {
    nombre?: string;
    apellido?: string;
  } | null;
}

interface WithFechas {
  created_at: string;
  updated_at?: string | null;
}

interface WithVencimiento {
  fecha_programada?: string | null;
}

/**
 * Renderiza el nombre de un empleado como "L. Apellido"
 * Si no hay empleado, retorna null (celda vacía)
 */
export function renderEmpleado<T extends WithEmpleado>(
  item: T,
  textColor: string
): React.ReactNode {
  if (!item.empleado_asignado) return null;
  const inicial = item.empleado_asignado.nombre?.charAt(0) || '';
  const apellido = item.empleado_asignado.apellido || '';
  return (
    <span className="text-xs" style={{ color: textColor }}>
      {inicial}. {apellido}
    </span>
  );
}

/**
 * Renderiza fechas en formato de 2 líneas:
 * - Línea 1: fecha de creación (gris)
 * - Línea 2: fecha de actualización (color acento)
 */
export function renderFechas<T extends WithFechas>(
  item: T,
  secondaryColor: string,
  primaryColor: string
): React.ReactNode {
  const creacion = new Date(item.created_at).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const actualizacion = item.updated_at
    ? new Date(item.updated_at).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : null;

  return (
    <div className="flex flex-col text-[10px] leading-tight">
      <span style={{ color: secondaryColor }}>{creacion}</span>
      {actualizacion && <span style={{ color: primaryColor }}>{actualizacion}</span>}
    </div>
  );
}

/**
 * Renderiza columna "Vence" con colores semáforo:
 * - Rojo: vencido
 * - Amarillo: próximo a vencer (<=3 días)
 * - Verde: OK
 */
export function renderVencimiento<T extends WithVencimiento>(
  item: T,
  secondaryColor: string
): React.ReactNode {
  if (!item.fecha_programada) return null;

  const fechaVenc = new Date(item.fecha_programada);
  const hoy = new Date();
  const dias = Math.ceil((fechaVenc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  const vencido = dias < 0;
  const porVencer = !vencido && dias <= 3;
  const color = vencido ? '#ef4444' : porVencer ? '#f59e0b' : '#10b981';
  const bg = vencido ? '#ef444420' : porVencer ? '#f59e0b20' : '#10b98120';

  const diasAbs = Math.abs(dias);
  let texto: string;
  if (dias === 0) {
    texto = 'Hoy';
  } else if (diasAbs < 30) {
    texto = vencido ? `-${diasAbs} días` : `${diasAbs} días`;
  } else {
    const meses = Math.floor(diasAbs / 30);
    texto = vencido
      ? `-${meses} ${meses > 1 ? 'meses' : 'mes'}`
      : `${meses} ${meses > 1 ? 'meses' : 'mes'}`;
  }

  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ color, backgroundColor: bg }}
    >
      {texto}
    </span>
  );
}

/**
 * Renderiza vencimiento calculado a partir de fecha de creación + días estimados
 * Útil para trámites donde el vencimiento se calcula dinámicamente
 */
export function renderVencimientoCalculado(
  fechaCreacion: string,
  diasEstimados: number | undefined | null,
  secondaryColor: string
): React.ReactNode {
  if (!diasEstimados) return null;

  const fechaVenc = new Date(fechaCreacion);
  fechaVenc.setDate(fechaVenc.getDate() + diasEstimados);

  const hoy = new Date();
  const dias = Math.ceil((fechaVenc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  const vencido = dias < 0;
  const porVencer = !vencido && dias <= 3;
  const color = vencido ? '#ef4444' : porVencer ? '#f59e0b' : '#10b981';
  const bg = vencido ? '#ef444420' : porVencer ? '#f59e0b20' : '#10b98120';

  const diasAbs = Math.abs(dias);
  let texto: string;
  if (dias === 0) {
    texto = 'Hoy';
  } else if (diasAbs < 30) {
    texto = vencido ? `-${diasAbs} días` : `${diasAbs} días`;
  } else {
    const meses = Math.floor(diasAbs / 30);
    texto = vencido
      ? `-${meses} ${meses > 1 ? 'meses' : 'mes'}`
      : `${meses} ${meses > 1 ? 'meses' : 'mes'}`;
  }

  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ color, backgroundColor: bg }}
    >
      {texto}
    </span>
  );
}

/**
 * Renderiza fechas con fecha de vencimiento calculada en la segunda línea
 */
export function renderFechasConVencimiento(
  fechaCreacion: string,
  diasEstimados: number | undefined | null,
  secondaryColor: string,
  primaryColor: string
): React.ReactNode {
  const creacion = new Date(fechaCreacion).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  let vencimiento: string | null = null;
  if (diasEstimados) {
    const fechaVenc = new Date(fechaCreacion);
    fechaVenc.setDate(fechaVenc.getDate() + diasEstimados);
    vencimiento = fechaVenc.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }

  return (
    <div className="flex flex-col text-[10px] leading-tight">
      <span style={{ color: secondaryColor }}>{creacion}</span>
      {vencimiento && <span style={{ color: primaryColor }}>{vencimiento}</span>}
    </div>
  );
}
