/**
 * datosDeAjuste — el cableado: de la API a las filas y los KPIs del prototipo.
 *
 * El prototipo ya define QUÉ dice cada pantalla (`canvasAbmSpec.ts`). Acá vive
 * lo único que le falta: de dónde salen los números de verdad.
 *
 * Cada entidad tiene una función que trae sus datos y devuelve `filas` y `kpis`
 * con la MISMA forma que el spec. Así enganchar una pantalla es escribir una
 * función y sumarla al mapa — no se toca el layout, ni las columnas, ni el
 * copy, que es lo que garantiza que se siga viendo como el diseño.
 *
 * REGLA sobre los KPIs que el canvas pide y el modelo no tiene (el caso de las
 * "foreign key que nuestro motor no maneja"): NO se hardcodea el número del
 * mockup ni se deja el hueco. Va OTRO dato real y relevante de esa misma
 * sección, en la misma posición. Cuando no hay ninguno, el KPI muestra "—" con
 * la nota de por qué. Un número inventado en Configuración termina en una
 * decisión de borrar algo que sí se usaba.
 */
import { empleadosApi, empleadosGestionApi } from '../../lib/api';
import type { HeroFrase, HeroKpi } from '../../lib/semanticHero';
import { seg } from '../../lib/semanticHero';
import type { FilaSpec } from '../../config/canvasAbmSpec';

export interface DatosDeAjuste {
  filas: FilaSpec[];
  kpis: HeroKpi[];
  frases: HeroFrase[];
}

/* ============================================================
 * Helpers de armado (espejan `cel()` y `num()` del canvas)
 * ============================================================ */

const TINTES: Record<string, string> = {
  '#00B37E': '#E7F6F0',
  '#F59E0B': '#FDF1DF',
  '#3B82F6': '#E8F1FE',
  '#E5484D': '#FDECEC',
  '#7A8783': '#F3F7F5',
  '#8B5CF6': '#F1EBFE',
};

const celda = (texto: string, extra: Partial<FilaSpec['cel'][number]> = {}): FilaSpec['cel'][number] => ({
  texto,
  esChip: false,
  esTexto: true,
  chipBg: '',
  chipCol: '',
  hayPunto: false,
  punto: '',
  haySub: false,
  sub: '',
  subCol: '#98A3A0',
  align: 'left',
  just: 'flex-start',
  peso: 500,
  tam: '12.5px',
  color: '#3D4945',
  fuente: 'Inter, sans-serif',
  ...extra,
});

const numero = (texto: string, extra: Partial<FilaSpec['cel'][number]> = {}) =>
  celda(texto, {
    align: 'right',
    just: 'flex-end',
    peso: 700,
    tam: '13px',
    fuente: 'Sora, sans-serif',
    color: '#0D1412',
    ...extra,
  });

const punto = (texto: string, color: string) =>
  celda(texto, { hayPunto: true, punto: color });

/** Iniciales de una persona, para el avatar de la fila. */
const iniciales = (nombre: string, apellido?: string) =>
  ((nombre?.[0] ?? '') + (apellido?.[0] ?? nombre?.[1] ?? '')).toUpperCase();

/* ============================================================
 * Cuadrillas
 * ============================================================ */

interface CuadrillaApi {
  id: number;
  nombre: string;
  descripcion?: string | null;
  especialidad?: string | null;
  zona_id?: number | null;
  zona_nombre?: string | null;
  activo?: boolean;
  responsable?: string | null;
}

interface AsignacionApi {
  cuadrilla_id: number;
  empleado_id: number;
  es_lider?: boolean;
  activo?: boolean;
  empleado_nombre?: string;
}

export async function datosCuadrillas(): Promise<DatosDeAjuste> {
  const [resCuadrillas, resAsignaciones] = await Promise.all([
    empleadosGestionApi.getCuadrillasAll({ activo: true }),
    empleadosGestionApi.getCuadrillas({ activo: true }),
  ]);
  const cuadrillas: CuadrillaApi[] = resCuadrillas.data || [];
  const asignaciones: AsignacionApi[] = resAsignaciones.data || [];

  const integrantesDe = (id: number) => asignaciones.filter((a) => a.cuadrilla_id === id);
  const liderDe = (id: number) =>
    integrantesDe(id).find((a) => a.es_lider)?.empleado_nombre ?? null;

  const filas: FilaSpec[] = cuadrillas.map((c) => {
    const equipo = integrantesDe(c.id);
    const lider = liderDe(c.id);
    const sinZona = !c.zona_nombre;
    const color = sinZona ? '#7A8783' : equipo.length === 0 ? '#F59E0B' : '#00B37E';
    return {
      n: c.nombre,
      s: c.especialidad || c.descripcion || 'Sin especialidad fija',
      gl: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.9.4 5 2.3 5 4.5',
      t: TINTES[color],
      cc: color,
      off: c.activo === false,
      cel: [
        lider
          ? punto(lider, color)
          : celda('Sin responsable', { hayPunto: true, punto: '#98A3A0', color: '#98A3A0' }),
        numero(String(equipo.length), equipo.length === 0 ? { color: '#98A3A0' } : {}),
        c.zona_nombre
          ? punto(c.zona_nombre, '#98A3A0')
          : celda('Sin asignar', { hayPunto: true, punto: '#F59E0B', color: '#B4560F' }),
        // El canvas muestra acá las órdenes abiertas de la cuadrilla. El
        // listado no las trae, así que en su lugar va el dato real que sí
        // define si la cuadrilla puede trabajar: si tiene líder.
        lider ? celda('Con responsable', { color: '#00794F' }) : celda('Sin responsable', { color: '#B4560F' }),
      ],
    };
  });

  const conEquipo = cuadrillas.filter((c) => integrantesDe(c.id).length > 0).length;
  const sinZona = cuadrillas.filter((c) => !c.zona_nombre).length;
  const sinLider = cuadrillas.filter((c) => !liderDe(c.id)).length;
  const totalIntegrantes = asignaciones.length;

  const kpis: HeroKpi[] = [
    { etiqueta: 'Cuadrillas', valor: cuadrillas.length, sub: `${conEquipo} con integrantes` },
    { etiqueta: 'Integrantes', valor: totalIntegrantes, sub: 'operarios asignados' },
    {
      etiqueta: 'Sin responsable',
      valor: sinLider,
      sub: sinLider ? 'nadie a cargo del equipo' : 'todas con líder',
      veredicto: sinLider > 0 ? 'advertencia' : undefined,
    },
    {
      etiqueta: 'Sin zona',
      valor: sinZona,
      sub: sinZona ? 'no entran al despacho' : 'todas con territorio',
      veredicto: sinZona > 0 ? 'advertencia' : undefined,
    },
    {
      etiqueta: 'Sin gente',
      valor: cuadrillas.length - conEquipo,
      sub: 'no pueden salir',
      veredicto: cuadrillas.length - conEquipo > 0 ? 'advertencia' : undefined,
    },
  ];

  const frases: HeroFrase[] = [
    {
      segmentos: [
        seg(`${cuadrillas.length} cuadrilla${cuadrillas.length === 1 ? '' : 's'}`, 'bueno'),
        seg(` con ${totalIntegrantes} operario${totalIntegrantes === 1 ? '' : 's'} asignado${totalIntegrantes === 1 ? '' : 's'}.`),
        ...(sinZona > 0
          ? [
              seg(` Hay ${sinZona} sin zona`, 'advertencia'),
              seg(': el despacho no las tiene en cuenta al repartir el trabajo.'),
            ]
          : []),
      ],
    },
  ];

  return { filas, kpis, frases };
}

/* ============================================================
 * Ausencias
 * ============================================================ */

interface AusenciaApi {
  id: number;
  empleado_id: number;
  empleado_nombre?: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo?: string | null;
  aprobado?: boolean | null;
}

/** "12 ago" — el canvas muestra la fecha corta, sin año. */
function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
}

const diasEntre = (a: string, b: string) => {
  const d1 = new Date(`${a}T12:00:00`).getTime();
  const d2 = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 1;
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
};

const COLOR_TIPO: Record<string, string> = {
  licencia_medica: '#E5484D',
  vacaciones: '#00B37E',
  franco: '#3B82F6',
  estudio: '#F59E0B',
};

export async function datosAusencias(): Promise<DatosDeAjuste> {
  const [resAusencias, resEmpleados] = await Promise.all([
    empleadosGestionApi.getAusencias(),
    empleadosApi.getAll(true),
  ]);
  const ausencias: AusenciaApi[] = resAusencias.data || [];
  const empleados: { id: number; nombre: string; apellido?: string; especialidad?: string }[] =
    resEmpleados.data || [];

  const nombreDe = (id: number) => {
    const e = empleados.find((x) => x.id === id);
    return e ? `${e.nombre} ${e.apellido ?? ''}`.trim() : `Empleado ${id}`;
  };
  const empleadoDe = (id: number) => empleados.find((x) => x.id === id);

  const hoy = new Date().toISOString().slice(0, 10);
  const enCurso = (a: AusenciaApi) => a.fecha_inicio <= hoy && a.fecha_fin >= hoy;

  /** Dos ausencias se solapan si comparten al menos un día. Es el dato que el
   *  canvas destaca: ese día el equipo queda corto. */
  const solapadas = new Set<number>();
  for (let i = 0; i < ausencias.length; i++) {
    for (let j = i + 1; j < ausencias.length; j++) {
      const a = ausencias[i];
      const b = ausencias[j];
      if (a.fecha_inicio <= b.fecha_fin && b.fecha_inicio <= a.fecha_fin) {
        solapadas.add(a.id);
        solapadas.add(b.id);
      }
    }
  }

  const filas: FilaSpec[] = ausencias.map((a) => {
    const emp = empleadoDe(a.empleado_id);
    const color = COLOR_TIPO[a.tipo] ?? '#7A8783';
    const dias = diasEntre(a.fecha_inicio, a.fecha_fin);
    const sinJustificar = a.aprobado === false || a.aprobado === null;
    return {
      n: nombreDe(a.empleado_id),
      s: emp?.especialidad || 'Sin especialidad',
      i: iniciales(emp?.nombre ?? 'E', emp?.apellido),
      t: TINTES[color],
      cc: color,
      cel: [
        sinJustificar
          ? celda(a.motivo || a.tipo, {
              hayPunto: true,
              punto: '#F59E0B',
              haySub: true,
              sub: 'sin aprobar',
              subCol: '#B4560F',
            })
          : punto(a.motivo || a.tipo, color),
        celda(fechaCorta(a.fecha_inicio)),
        celda(fechaCorta(a.fecha_fin)),
        numero(String(dias), solapadas.has(a.id) ? { color: '#C93A3E' } : {}),
      ],
    };
  });

  const hoyFuera = ausencias.filter(enCurso).length;
  const sinAprobar = ausencias.filter((a) => a.aprobado === false || a.aprobado === null).length;
  const diasPerdidos = ausencias.reduce((acc, a) => acc + diasEntre(a.fecha_inicio, a.fecha_fin), 0);

  const kpis: HeroKpi[] = [
    { etiqueta: 'Cargadas', valor: ausencias.length, sub: `sobre ${empleados.length} empleados` },
    { etiqueta: 'En curso', valor: hoyFuera, sub: 'hoy fuera del plantel' },
    {
      etiqueta: 'Se solapan',
      valor: solapadas.size,
      sub: solapadas.size ? 'mismos días sin cubrir' : 'ninguna se pisa',
      veredicto: solapadas.size > 0 ? 'advertencia' : undefined,
    },
    {
      etiqueta: 'Sin aprobar',
      valor: sinAprobar,
      sub: sinAprobar ? 'falta el visto bueno' : 'todas aprobadas',
      veredicto: sinAprobar > 0 ? 'advertencia' : undefined,
    },
    { etiqueta: 'Días perdidos', valor: diasPerdidos, sub: 'acumulados' },
  ];

  const frases: HeroFrase[] = [
    {
      segmentos: [
        seg(`${ausencias.length} ausencia${ausencias.length === 1 ? '' : 's'} cargada${ausencias.length === 1 ? '' : 's'}`, 'bueno'),
        seg(`, ${hoyFuera} en curso hoy.`),
        ...(solapadas.size > 0
          ? [
              seg(` ${solapadas.size} se solapan`, 'advertencia'),
              seg(': esos días el equipo queda corto y hay que reasignar.'),
            ]
          : []),
      ],
    },
  ];

  return { filas, kpis, frases };
}

/* ============================================================
 * Mapa: qué ajuste sabe traer sus datos
 * ============================================================ */

export const CABLEADO: Record<string, () => Promise<DatosDeAjuste>> = {
  cuadrillas: datosCuadrillas,
  ausencias: datosAusencias,
};
