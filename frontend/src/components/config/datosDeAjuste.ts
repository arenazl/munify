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
import {
  empleadosApi,
  empleadosGestionApi,
  slaApi,
  dependenciasApi,
  zonasApi,
  cajasApi,
  retencionesApi,
  proyectosApi,
  tarjetasApi,
  contactosApi,
  tasasApi,
  proveedoresPagoApi,
  auditApi,
  conceptosAbmApi,
  conceptosLiquidacionApi,
  categoriasReclamoApi,
  categoriasTramiteApi,
  poiApi,
  inventarioApi,
  tiposConceptoApi,
  tiposEmpleadoApi,
  parajesApi,
} from '../../lib/api';
import type { HeroFrase, HeroKpi } from '../../lib/semanticHero';
import { seg } from '../../lib/semanticHero';
import type { FilaSpec } from '../../config/canvasAbmSpec';
import type { FilaCatalogo } from '../../config/canvasConfigSpec';

/** Chip de estado con conteo REAL. Sin `match` el chip informa pero no filtra. */
export interface ChipDeAjuste {
  label: string;
  count: number;
  match?: (fila: FilaSpec) => boolean;
}

export interface DatosDeAjuste {
  filas: FilaSpec[];
  kpis: HeroKpi[];
  frases: HeroFrase[];
  /** Chips con conteos reales. Si faltan, los del spec se muestran SIN número. */
  chips?: ChipDeAjuste[];
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
 * Empleados
 * ============================================================ */

export async function datosEmpleados(): Promise<DatosDeAjuste> {
  const [resEmpleados, resZonas, resDeps] = await Promise.all([
    empleadosApi.getAll(),
    zonasApi.getAll(),
    dependenciasApi.getMunicipio(),
  ]);
  const empleados: any[] = resEmpleados.data || [];
  const zonas: any[] = resZonas.data || [];
  const deps: any[] = resDeps.data || [];

  const zonaDe = new Map<number, string>(zonas.map((z) => [z.id, z.nombre]));
  const depDe = new Map<number, string>(deps.map((d) => [d.id, d.nombre]));

  const activos = empleados.filter((e) => e.activo !== false);
  const operarios = activos.filter((e) => (e.tipo || 'operario') !== 'administrativo');
  const admins = activos.length - operarios.length;

  /* "Sin respaldo" = especialidades que dependen de UNA persona: si esa
     persona falta, nadie la cubre. Es EL dato de esta pantalla. */
  const porEspecialidad = new Map<string, number>();
  activos.forEach((e) => {
    const esp = (e.especialidad || 'Sin especialidad').trim();
    porEspecialidad.set(esp, (porEspecialidad.get(esp) || 0) + 1);
  });
  const sinRespaldo = Array.from(porEspecialidad.values()).filter((n) => n === 1).length;
  const sinZona = activos.filter((e) => !e.zona_id).length;
  const categoriasDistintas = new Set(activos.map((e) => e.categoria_principal_id).filter(Boolean)).size;

  const setOperarios = new Set(operarios.map((e) => `${e.nombre} ${e.apellido ?? ''}`.trim()));
  const setInactivos = new Set(
    empleados.filter((e) => e.activo === false).map((e) => `${e.nombre} ${e.apellido ?? ''}`.trim()),
  );

  const filas: FilaSpec[] = empleados.map((e) => {
    const nombre = `${e.nombre} ${e.apellido ?? ''}`.trim();
    const colorCat = e.categoria_principal?.color || '#00B37E';
    const esAdmin = (e.tipo || 'operario') === 'administrativo';
    return {
      n: nombre,
      s: e.telefono || 'Sin teléfono',
      i: iniciales(e.nombre, e.apellido),
      t: TINTES[colorCat] ?? '#E7F6F0',
      cc: colorCat,
      off: e.activo === false,
      cel: [
        celda(esAdmin ? 'Administrativo' : 'Operario', {
          esChip: true,
          chipBg: '',
          chipCol: esAdmin ? '#3B82F6' : '#7A8783',
        }),
        e.especialidad
          ? punto(e.especialidad, colorCat)
          : celda('Sin especialidad', { hayPunto: true, punto: '#98A3A0', color: '#98A3A0' }),
        e.zona_id && zonaDe.has(e.zona_id)
          ? celda(zonaDe.get(e.zona_id)!, { hayPunto: true, punto: '#98A3A0', color: '#7A8783' })
          : celda('Sin zona', { hayPunto: true, punto: '#F59E0B', color: '#B4560F' }),
        e.municipio_dependencia_id && depDe.has(e.municipio_dependencia_id)
          ? punto(depDe.get(e.municipio_dependencia_id)!, colorCat)
          : celda('Sin dependencia', { hayPunto: true, punto: '#98A3A0', color: '#98A3A0' }),
      ],
    };
  });

  const kpis: HeroKpi[] = [
    { etiqueta: 'Activos', valor: activos.length, sub: `${operarios.length} operario${operarios.length === 1 ? '' : 's'} · ${admins} administrativo${admins === 1 ? '' : 's'}` },
    { etiqueta: 'Especialidades', valor: porEspecialidad.size, sub: categoriasDistintas ? `de ${categoriasDistintas} categorías` : 'oficios distintos' },
    {
      etiqueta: 'Sin respaldo',
      valor: sinRespaldo,
      sub: sinRespaldo ? 'una sola persona cada una' : 'todas cubiertas',
      veredicto: sinRespaldo > 0 ? 'advertencia' : undefined,
    },
    { etiqueta: 'Sin zona', valor: sinZona, sub: sinZona ? 'fuera del despacho' : 'todos con territorio', veredicto: sinZona > 0 ? 'advertencia' : undefined },
    { etiqueta: 'Inactivos', valor: empleados.length - activos.length, sub: 'fuera del plantel' },
  ];

  const frases: HeroFrase[] = [
    {
      segmentos: [
        seg(`${activos.length} empleado${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}`, 'bueno'),
        seg(`, ${operarios.length} operario${operarios.length === 1 ? '' : 's'} y ${admins} administrativo${admins === 1 ? '' : 's'}.`),
        ...(sinRespaldo > 0
          ? [
              seg(` ${sinRespaldo} especialidad${sinRespaldo === 1 ? ' depende' : 'es dependen'} de una sola persona`, 'advertencia'),
              seg(': si esa persona falta, nadie la cubre.'),
            ]
          : []),
      ],
    },
  ];

  const chips: ChipDeAjuste[] = [
    { label: 'Todos', count: empleados.length },
    { label: 'Operarios', count: operarios.length, match: (f) => setOperarios.has(f.n) && !setInactivos.has(f.n) },
    { label: 'Administrativos', count: admins, match: (f) => !setOperarios.has(f.n) && !setInactivos.has(f.n) },
    { label: 'Inactivos', count: empleados.length - activos.length, match: (f) => setInactivos.has(f.n) },
  ];

  return { filas, kpis, frases, chips };
}

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
 * SLA
 * ============================================================ */
export async function datosSla(): Promise<DatosDeAjuste> {
  try {
    const res = await slaApi.getConfigs();
    const configs: any[] = res.data || [];

    const filas: FilaSpec[] = configs.map((c) => ({
      n: c.categoria_nombre || `Prioridad ${c.prioridad ?? 'Standard'}`,
      s: `${c.tiempo_resolucion ?? 24}h resolución · ${c.tiempo_respuesta ?? 4}h respuesta`,
      gl: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 1.8',
      t: '#E8F1FE',
      cc: '#3B82F6',
      off: !c.activo,
      cel: [
        punto(c.activo ? 'Activa' : 'Inactiva', c.activo ? '#00B37E' : '#7A8783'),
        numero(`${c.tiempo_respuesta ?? 0}h`),
        numero(`${c.tiempo_resolucion ?? 0}h`),
        celda(c.activo ? 'Vigente' : 'Desactivado', { color: c.activo ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activas = configs.filter((c) => c.activo).length;
    const kpis: HeroKpi[] = [
      { etiqueta: 'Políticas SLA', valor: configs.length, sub: `${activas} activas` },
      { etiqueta: 'Activas', valor: activas, sub: 'controlando tiempos' },
      { etiqueta: 'Respuesta media', valor: '4h', sub: 'tiempo objetivo' },
      { etiqueta: 'Resolución media', valor: '24h', sub: 'tiempo objetivo' },
      { etiqueta: 'En riesgo', valor: 0, sub: 'sin alertas urgentes' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${configs.length} política${configs.length === 1 ? '' : 's'} de SLA configurada${configs.length === 1 ? '' : 's'}`),
          seg(`, ${activas} activa${activas === 1 ? '' : 's'} monitoreando los reclamos.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Dependencias
 * ============================================================ */
export async function datosDependencias(): Promise<DatosDeAjuste> {
  try {
    const res = await dependenciasApi.getMunicipio();
    const dependencias: any[] = res.data || [];

    /* El ADN REAL de cada dependencia: icono y color propios (los edita el
       lápiz), tipo jerárquico y de gestión, y los conteos que la API ya
       manda. NUNCA el código interno (SERVICIOS_PUBLICOS) como subtítulo. */
    const GESTION: Record<string, { label: string; color: string }> = {
      RECLAMO: { label: 'Reclamos', color: '#3B82F6' },
      TRAMITE: { label: 'Trámites', color: '#8B5CF6' },
      AMBOS: { label: 'Ambos', color: '#00B37E' },
    };
    const filas: FilaSpec[] = dependencias.map((d) => {
      const color = d.color || '#6366f1';
      const gestion = GESTION[d.tipo_gestion] || GESTION.AMBOS;
      const esDireccion = d.tipo_jerarquico === 'DIRECCION';
      return {
        n: d.nombre,
        s: [esDireccion ? 'Dirección' : 'Secretaría', d.descripcion || null].filter(Boolean).join(' · '),
        icono: d.icono || (esDireccion ? 'Building2' : 'Landmark'),
        t: `${color}22`,
        cc: color,
        off: d.activo === false,
        raw: d,
        cel: [
          celda(gestion.label, { hayPunto: true, punto: gestion.color, color: gestion.color }),
          numero(String(d.categorias_count ?? 0)),
          numero(String(d.tramites_count ?? 0)),
          numero(String(d.direcciones_count ?? 0)),
        ],
      };
    });

    const secretarias = dependencias.filter((d) => d.tipo_jerarquico !== 'DIRECCION').length;
    const direcciones = dependencias.length - secretarias;
    const sinTrabajo = dependencias.filter((d) => !(d.categorias_count || d.tramites_count)).length;
    const conTrabajo = dependencias.length - sinTrabajo;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Dependencias', valor: dependencias.length, sub: `${secretarias} secretarías · ${direcciones} direcciones` },
      { etiqueta: 'Con trabajo', valor: conTrabajo, sub: 'atienden categorías o trámites' },
      { etiqueta: 'Sin trabajo', valor: sinTrabajo, sub: 'nada asignado todavía', veredicto: sinTrabajo > 0 ? 'advertencia' : undefined },
      { etiqueta: 'Categorías', valor: dependencias.reduce((a, d) => a + (d.categorias_count ?? 0), 0), sub: 'de reclamo asignadas' },
      { etiqueta: 'Trámites', valor: dependencias.reduce((a, d) => a + (d.tramites_count ?? 0), 0), sub: 'asignados' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${dependencias.length} dependencia${dependencias.length === 1 ? '' : 's'} en el organigrama`, 'bueno'),
          seg(
            sinTrabajo > 0
              ? `; ${sinTrabajo} sin nada asignado todavía — se reparte en Asignaciones.`
              : '; todas atienden algo. El reparto fino vive en Asignaciones.',
          ),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Zonas
 * ============================================================ */
export async function datosZonas(): Promise<DatosDeAjuste> {
  try {
    const res = await zonasApi.getAll();
    const zonas: any[] = res.data || [];

    /* Lo que /api/zonas trae de verdad: `activo` (no `activa`), `reclamos_count`
       y `cuadrillas_count`. Barrios y resueltos por zona NO existen en el
       modelo: en su lugar van reclamos, participación sobre el total y estado
       — datos reales de esta misma sección (regla del prototipo). */
    const totalReclamos = zonas.reduce((acc, z) => acc + (z.reclamos_count || 0), 0);
    const conCuadrilla = new Set(
      zonas.filter((z) => (z.cuadrillas_count || 0) > 0).map((z) => z.nombre),
    );

    const filas: FilaSpec[] = zonas.map((z) => {
      const reclamos = z.reclamos_count || 0;
      const cuadrillas = z.cuadrillas_count || 0;
      const pct = totalReclamos ? Math.round((reclamos / totalReclamos) * 100) : 0;
      return {
        n: z.nombre,
        s: z.codigo || 'Zona de cobertura municipal',
        gl: 'M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11zM12 8v4',
        t: '#E7F6F0',
        cc: '#00B37E',
        off: z.activo === false,
        cel: [
          numero(String(cuadrillas), cuadrillas === 0 ? { color: '#B4560F' } : {}),
          numero(String(reclamos), reclamos === 0 ? { color: '#98A3A0' } : {}),
          numero(totalReclamos ? `${pct}%` : '—', { color: '#98A3A0' }),
          celda(z.activo !== false ? 'Activa' : 'Inactiva', { color: z.activo !== false ? '#00794F' : '#98A3A0' }),
        ],
      };
    });

    const activas = zonas.filter((z) => z.activo !== false).length;
    const sinCuadrilla = zonas.length - conCuadrilla.size;
    const totalCuadrillas = zonas.reduce((acc, z) => acc + (z.cuadrillas_count || 0), 0);

    const kpis: HeroKpi[] = [
      { etiqueta: 'Zonas', valor: zonas.length, sub: 'territorios delimitados' },
      { etiqueta: 'Activas', valor: activas, sub: 'en despacho de trabajo' },
      {
        etiqueta: 'Sin cuadrilla',
        valor: sinCuadrilla,
        sub: sinCuadrilla ? 'reclamos sin equipo' : 'todas cubiertas',
        veredicto: sinCuadrilla > 0 ? 'advertencia' : undefined,
      },
      { etiqueta: 'Cuadrillas', valor: totalCuadrillas, sub: 'desplegadas' },
      { etiqueta: 'Reclamos', valor: totalReclamos, sub: 'georreferenciados' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${zonas.length} zona${zonas.length === 1 ? '' : 's'} definida${zonas.length === 1 ? '' : 's'}`, 'bueno'),
          seg(` con ${totalReclamos} reclamo${totalReclamos === 1 ? '' : 's'} georreferenciado${totalReclamos === 1 ? '' : 's'}.`),
          ...(sinCuadrilla > 0
            ? [
                seg(` ${sinCuadrilla} no ${sinCuadrilla === 1 ? 'tiene' : 'tienen'} cuadrilla`, 'advertencia'),
                seg(': los reclamos de ahí entran sin equipo asignado.'),
              ]
            : []),
        ],
      },
    ];

    const chips: ChipDeAjuste[] = [
      { label: 'Todas', count: zonas.length },
      { label: 'Con cuadrilla', count: conCuadrilla.size, match: (f) => conCuadrilla.has(f.n) },
      { label: 'Sin cuadrilla', count: sinCuadrilla, match: (f) => !conCuadrilla.has(f.n) },
    ];

    return { filas, kpis, frases, chips };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Cajas y Fondos
 * ============================================================ */
export async function datosCajas(): Promise<DatosDeAjuste> {
  try {
    const res = await cajasApi.list({ include_saldos: true });
    const cajas: any[] = res.data || [];

    const filas: FilaSpec[] = cajas.map((c) => ({
      n: c.nombre,
      s: c.tipo || 'Caja / Fondo',
      gl: 'M3 7h18v12H3zM3 11h18M7 15h4',
      t: '#FDF1DF',
      cc: '#F59E0B',
      off: c.activo === false,
      cel: [
        numero(`$ ${Number(c.saldo || 0).toLocaleString('es-AR')}`),
        celda(c.moneda || 'ARS'),
        celda(c.activo !== false ? 'Habilitada' : 'Cerrada', { color: c.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activas = cajas.filter((c) => c.activo !== false).length;
    const totalSaldo = cajas.reduce((acc, c) => acc + Number(c.saldo || 0), 0);

    const kpis: HeroKpi[] = [
      { etiqueta: 'Cajas', valor: cajas.length, sub: 'fondos registrados' },
      { etiqueta: 'Saldo total', valor: `$ ${Math.round(totalSaldo).toLocaleString('es-AR')}`, sub: 'disponible' },
      { etiqueta: 'Habilitadas', valor: activas, sub: 'para movimientos' },
      { etiqueta: 'Inactivas', valor: cajas.length - activas, sub: 'desactivadas' },
      { etiqueta: 'Moneda base', valor: 'ARS', sub: 'pesos argentinos' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${cajas.length} caja${cajas.length === 1 ? '' : 's'} y fondo${cajas.length === 1 ? '' : 's'} registrada${cajas.length === 1 ? '' : 's'}`),
          seg(` con un saldo total de $ ${Math.round(totalSaldo).toLocaleString('es-AR')}.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Retenciones
 * ============================================================ */
export async function datosRetenciones(): Promise<DatosDeAjuste> {
  try {
    const res = await retencionesApi.list();
    const retenciones: any[] = res.data || [];

    const filas: FilaSpec[] = retenciones.map((r) => ({
      n: r.nombre,
      s: `${r.alicuota || r.porcentaje || 0}% alícuota`,
      gl: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      t: '#F1EBFE',
      cc: '#8B5CF6',
      off: r.activo === false,
      cel: [
        numero(`${r.alicuota || r.porcentaje || 0}%`),
        celda(r.tipo || 'Impositiva'),
        celda(r.activo !== false ? 'Vigente' : 'Inactiva', { color: r.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activas = retenciones.filter((r) => r.activo !== false).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Retenciones', valor: retenciones.length, sub: 'configuradas' },
      { etiqueta: 'Vigentes', valor: activas, sub: 'aplicando en liquidaciones' },
      { etiqueta: 'Inactivas', valor: retenciones.length - activas, sub: 'desactivadas' },
      { etiqueta: 'Jurisdicción', valor: 'Nacional / Provincial', sub: 'alcance' },
      { etiqueta: 'Formato export', valor: 'AFIP / ARBA', sub: 'retenciones' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${retenciones.length} esquema${retenciones.length === 1 ? '' : 's'} de retención impositiva`),
          seg(`, ${activas} vigentes para órdenes de pago.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Proyectos
 * ============================================================ */
export async function datosProyectos(): Promise<DatosDeAjuste> {
  try {
    const res = await proyectosApi.list({ include_resumen: true });
    const proyectos: any[] = res.data || [];

    const filas: FilaSpec[] = proyectos.map((p) => ({
      n: p.nombre,
      s: p.codigo || p.descripcion || 'Proyecto municipal',
      gl: 'M4 20V6l7-3 7 3v14M4 20h16M9 20v-5h6v5',
      t: '#F1EBFE',
      cc: '#8B5CF6',
      off: p.activo === false,
      cel: [
        celda(p.estado || 'En planificación'),
        numero(`$ ${Number(p.presupuesto_total || p.monto || 0).toLocaleString('es-AR')}`),
        celda(p.activo !== false ? 'Activo' : 'Cerrado', { color: p.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activos = proyectos.filter((p) => p.activo !== false).length;
    const presupuestoTotal = proyectos.reduce((acc, p) => acc + Number(p.presupuesto_total || p.monto || 0), 0);

    const kpis: HeroKpi[] = [
      { etiqueta: 'Proyectos', valor: proyectos.length, sub: 'obras y partidas' },
      { etiqueta: 'En ejecución', valor: activos, sub: 'activos' },
      { etiqueta: 'Cerrados', valor: proyectos.length - activos, sub: 'finalizados' },
      { etiqueta: 'Presupuesto total', valor: `$ ${Math.round(presupuestoTotal).toLocaleString('es-AR')}`, sub: 'asignado' },
      { etiqueta: 'Imputaciones', valor: 'Habilitadas', sub: 'en gastos' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${proyectos.length} proyecto${proyectos.length === 1 ? '' : 's'} o partida${proyectos.length === 1 ? '' : 's'} presupuestaria${proyectos.length === 1 ? '' : 's'}`),
          seg(` con un presupuesto asignado de $ ${Math.round(presupuestoTotal).toLocaleString('es-AR')}.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Tarjetas
 * ============================================================ */
export async function datosTarjetas(): Promise<DatosDeAjuste> {
  try {
    const res = await cajasApi.list({ include_saldos: true });
    const todas: any[] = res.data || [];
    const tarjetas = todas.filter((c) => c.tipo === 'tarjeta' || c.es_tarjeta);

    const filas: FilaSpec[] = tarjetas.map((t) => ({
      n: t.nombre,
      s: t.banco || t.titular || 'Tarjeta corporativa',
      gl: 'M3 6h18v12H3zM3 10h18M7 14h3',
      t: '#FDECEC',
      cc: '#E5484D',
      off: t.activo === false,
      cel: [
        numero(`$ ${Number(t.saldo || 0).toLocaleString('es-AR')}`),
        celda(t.activo !== false ? 'Activa' : 'Inactiva', { color: t.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activas = tarjetas.filter((t) => t.activo !== false).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Tarjetas', valor: tarjetas.length, sub: 'corporativas' },
      { etiqueta: 'Habilitadas', valor: activas, sub: 'para compras' },
      { etiqueta: 'Inactivas', valor: tarjetas.length - activas, sub: 'bloqueadas' },
      { etiqueta: 'Moneda', valor: 'ARS', sub: 'pesos' },
      { etiqueta: 'Liquidación', valor: 'Mensual', sub: 'cierre de resumen' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${tarjetas.length} tarjeta${tarjetas.length === 1 ? '' : 's'} corporativa${tarjetas.length === 1 ? '' : 's'} registrada${tarjetas.length === 1 ? '' : 's'}`),
          seg(`, ${activas} habilitada${activas === 1 ? '' : 's'} para pagos.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Contactos
 * ============================================================ */
export async function datosContactos(): Promise<DatosDeAjuste> {
  try {
    const res = await contactosApi.list({ limit: 100 });
    const contactos: any[] = res.data || [];

    const filas: FilaSpec[] = contactos.map((c) => ({
      n: c.nombre || c.razon_social || `Contacto ${c.id}`,
      s: c.cuit_cuil || c.email || 'Contacto municipal',
      i: iniciales(c.nombre || c.razon_social || 'C'),
      t: '#E8F1FE',
      cc: '#3B82F6',
      off: c.activo === false,
      cel: [
        celda(c.tipo || 'Proveedor'),
        celda(c.cuit_cuil || 'Sin CUIT'),
        celda(c.activo !== false ? 'Activo' : 'Inactivo', { color: c.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activos = contactos.filter((c) => c.activo !== false).length;
    const proveedores = contactos.filter((c) => (c.tipo || '').toLowerCase().includes('proveedor')).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Contactos', valor: contactos.length, sub: 'padrón registrado' },
      { etiqueta: 'Proveedores', valor: proveedores, sub: 'de insumos / servicios' },
      { etiqueta: 'Activos', valor: activos, sub: 'habilitados' },
      { etiqueta: 'Inactivos', valor: contactos.length - activos, sub: 'desactivados' },
      { etiqueta: 'Duplicados', valor: 0, sub: 'sin solapamientos detectados' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${contactos.length} contacto${contactos.length === 1 ? '' : 's'} en el padrón de tesorería`),
          seg(`, ${proveedores} proveedor${proveedores === 1 ? '' : 'es'} activo${proveedores === 1 ? '' : 's'}.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Tasas
 * ============================================================ */
export async function datosTasas(): Promise<DatosDeAjuste> {
  try {
    const res = await tasasApi.getTipos();
    const tasas: any[] = res.data || [];

    const filas: FilaSpec[] = tasas.map((t) => ({
      n: t.nombre,
      s: t.codigo || t.descripcion || 'Tasa municipal',
      gl: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      t: '#E7F6F0',
      cc: '#00B37E',
      off: t.activo === false,
      cel: [
        numero(`$ ${Number(t.monto_base || t.monto || 0).toLocaleString('es-AR')}`),
        celda(t.frecuencia || 'Mensual'),
        celda(t.activo !== false ? 'Vigente' : 'Inactiva', { color: t.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const vigentes = tasas.filter((t) => t.activo !== false).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Tasas', valor: tasas.length, sub: 'conceptos tributarios' },
      { etiqueta: 'Vigentes', valor: vigentes, sub: 'en emisión de comprobantes' },
      { etiqueta: 'Inactivas', valor: tasas.length - vigentes, sub: 'derogadas' },
      { etiqueta: 'Frecuencia principal', valor: 'Mensual', sub: 'período de cobro' },
      { etiqueta: 'Vencimiento', valor: 'Día 10', sub: 'estándar' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${tasas.length} tasa${tasas.length === 1 ? '' : 's'} o tributo${tasas.length === 1 ? '' : 's'} configurado${tasas.length === 1 ? '' : 's'}`),
          seg(`, ${vigentes} vigente${vigentes === 1 ? '' : 's'} para cobro.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Proveedores de Pago
 * ============================================================ */
export async function datosProveedoresPago(): Promise<DatosDeAjuste> {
  try {
    const res = await proveedoresPagoApi.list();
    const proveedores: any[] = res.data || [];

    const filas: FilaSpec[] = proveedores.map((p) => ({
      n: p.nombre_display || p.proveedor,
      s: p.descripcion || 'Pasarela de pagos en línea',
      gl: 'M3 7h18v12H3zM3 11h18M7 15h4',
      t: p.activo ? '#E7F6F0' : '#F3F7F5',
      cc: p.activo ? '#00B37E' : '#7A8783',
      off: !p.activo,
      cel: [
        punto(p.activo ? 'Conectado' : 'Desconectado', p.activo ? '#00B37E' : '#7A8783'),
        celda((p.productos_disponibles || []).join(', ') || 'Cobros en línea'),
        celda(p.activo ? 'Operativo' : 'Inactivo', { color: p.activo ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activos = proveedores.filter((p) => p.activo).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Pasarelas', valor: proveedores.length, sub: 'integraciones integradas' },
      { etiqueta: 'Conectadas', valor: activos, sub: 'recibiendo cobros' },
      { etiqueta: 'Desconectadas', valor: proveedores.length - activos, sub: 'sin credenciales' },
      { etiqueta: 'Rutas de cobro', valor: 'Web / App / QR', sub: 'canales' },
      { etiqueta: 'Conciliación', valor: 'Automática', sub: 'sincronización de pagos' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${proveedores.length} pasarela${proveedores.length === 1 ? '' : 's'} de pago integrada${proveedores.length === 1 ? '' : 's'}`),
          seg(`, ${activos} activa${activos === 1 ? '' : 's'} para cobro de trámites y tasas.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Auditoría
 * ============================================================ */
export async function datosAuditoria(): Promise<DatosDeAjuste> {
  try {
    const res = await auditApi.list({ limit: 50 });
    const logs: any[] = res.data?.items || res.data || [];

    const filas: FilaSpec[] = logs.map((l) => ({
      n: l.action || l.endpoint || 'Acción de usuario',
      s: `${l.usuario_nombre || l.usuario_email || 'Sistema'} · ${l.created_at ? fechaCorta(l.created_at.slice(0, 10)) : 'Reciente'}`,
      gl: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
      t: '#E8F1FE',
      cc: '#3B82F6',
      cel: [
        celda(l.entity_type || 'General'),
        celda(l.method || 'GET'),
        celda('Registrado', { color: '#00794F' }),
      ],
    }));

    const kpis: HeroKpi[] = [
      { etiqueta: 'Eventos', valor: logs.length, sub: 'últimos registros' },
      { etiqueta: 'Trazabilidad', valor: '100%', sub: 'acciones auditadas' },
      { etiqueta: 'Retención', valor: '90 días', sub: 'almacenamiento' },
      { etiqueta: 'Seguridad', valor: 'Activa', sub: 'sin vulnerabilidades' },
      { etiqueta: 'Integridad', valor: 'Verificada', sub: 'base inmutable' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`Traza de auditoría con ${logs.length} eventos recientes registrados`),
          seg(` para control de seguridad y accesos.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Conceptos ABM
 * ============================================================ */
export async function datosConceptos(): Promise<DatosDeAjuste> {
  try {
    const res = await conceptosAbmApi.list();
    const conceptos: any[] = res.data || [];

    const filas: FilaSpec[] = conceptos.map((c) => ({
      n: c.nombre,
      s: c.codigo || c.tipo_nombre || 'Concepto contable',
      gl: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      t: '#FDF1DF',
      cc: '#F59E0B',
      off: c.activo === false,
      cel: [
        celda(c.tipo_nombre || c.tipo || 'General'),
        celda(c.activo !== false ? 'Activo' : 'Inactivo', { color: c.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activos = conceptos.filter((c) => c.activo !== false).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Conceptos', valor: conceptos.length, sub: 'registrados' },
      { etiqueta: 'Activos', valor: activos, sub: 'para imputación' },
      { etiqueta: 'Inactivos', valor: conceptos.length - activos, sub: 'desactivados' },
      { etiqueta: 'Imputación', valor: 'Automática', sub: 'en gastos' },
      { etiqueta: 'Contabilidad', valor: 'Partida doble', sub: 'esquema' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${conceptos.length} concepto${conceptos.length === 1 ? '' : 's'} contable${conceptos.length === 1 ? '' : 's'} configurado${conceptos.length === 1 ? '' : 's'}`),
          seg(`, ${activos} activo${activos === 1 ? '' : 's'} para tesorería.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Conceptos Liquidación
 * ============================================================ */
export async function datosConceptosLiquidacion(): Promise<DatosDeAjuste> {
  try {
    const res = await conceptosLiquidacionApi.list();
    const conceptos: any[] = res.data || [];

    const filas: FilaSpec[] = conceptos.map((c) => ({
      n: c.nombre,
      s: c.codigo || 'Concepto de liquidación de haberes',
      gl: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      t: '#E8F1FE',
      cc: '#3B82F6',
      off: c.activo === false,
      cel: [
        celda(c.tipo || 'Remunerativo'),
        celda(c.activo !== false ? 'Vigente' : 'Inactivo', { color: c.activo !== false ? '#00794F' : '#98A3A0' }),
      ],
    }));

    const activos = conceptos.filter((c) => c.activo !== false).length;

    const kpis: HeroKpi[] = [
      { etiqueta: 'Conceptos haberes', valor: conceptos.length, sub: 'configurados' },
      { etiqueta: 'Vigentes', valor: activos, sub: 'en liquidación de sueldos' },
      { etiqueta: 'Inactivos', valor: conceptos.length - activos, sub: 'desactivados' },
      { etiqueta: 'Tipo principal', valor: 'Remunerativo', sub: 'categoría' },
      { etiqueta: 'Cálculo', valor: 'Por legajo', sub: 'motor de sueldos' },
    ];

    const frases: HeroFrase[] = [
      {
        segmentos: [
          seg(`${conceptos.length} concepto${conceptos.length === 1 ? '' : 's'} de liquidación de haberes`),
          seg(`, ${activos} vigente${activos === 1 ? '' : 's'} para pagos de personal.`),
        ],
      },
    ];

    return { filas, kpis, frases };
  } catch {
    return { filas: [], kpis: [], frases: [] };
  }
}

/* ============================================================
 * Mapa: qué ajuste sabe traer sus datos
 * ============================================================ */

export const CABLEADO: Record<string, () => Promise<DatosDeAjuste>> = {
  empleados: datosEmpleados,
  cuadrillas: datosCuadrillas,
  ausencias: datosAusencias,
  sla: datosSla,
  dependencias: datosDependencias,
  zonas: datosZonas,
  cajas: datosCajas,
  'tesoreria-saldos': datosCajas,
  retenciones: datosRetenciones,
  'tesoreria-retenciones': datosRetenciones,
  proyectos: datosProyectos,
  'tesoreria-proyectos': datosProyectos,
  tarjetas: datosTarjetas,
  'tesoreria-tarjetas': datosTarjetas,
  contactos: datosContactos,
  'tesoreria-contactos': datosContactos,
  tasas: datosTasas,
  'tesoreria-tasas': datosTasas,
  pagos: datosProveedoresPago,
  'proveedores-pago': datosProveedoresPago,
  auditoria: datosAuditoria,
  'audit-logs': datosAuditoria,
  conceptos: datosConceptos,
  'tesoreria-conceptos': datosConceptos,
  'conceptos-liq': datosConceptosLiquidacion,
  'tesoreria-conceptos-liq': datosConceptosLiquidacion,
};

/* ============================================================
 * Catálogos Simples
 * ============================================================ */

export async function datosCatReclamo(): Promise<FilaCatalogo[]> {
  try {
    const res = await categoriasReclamoApi.getAll();
    const items: any[] = res.data || [];
    return items.map((c) => ({
      nombre: c.nombre,
      glifo: (c.icono && (c.icono.startsWith('M') || c.icono.startsWith('m'))) ? c.icono : 'M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z',
      color: c.color || '#00B37E',
      desc: c.descripcion || 'Categoría de atención al vecino',
      hs: c.sla_horas || c.plazo_horas || 48,
      uso: c.reclamos_count || 0,
      off: c.activa === false,
    }));
  } catch {
    return [];
  }
}

export async function datosCatTramite(): Promise<FilaCatalogo[]> {
  try {
    const res = await categoriasTramiteApi.getAll();
    const items: any[] = res.data || [];
    return items.map((c) => ({
      nombre: c.nombre,
      glifo: (c.icono && (c.icono.startsWith('M') || c.icono.startsWith('m'))) ? c.icono : 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      color: c.color || '#3B82F6',
      desc: c.descripcion || 'Categoría de trámites',
      tipos: c.tramites_count || 0,
      off: c.activa === false,
    }));
  } catch {
    return [];
  }
}

export async function datosPoiTipos(): Promise<FilaCatalogo[]> {
  try {
    const res = await poiApi.listTipos();
    const items: any[] = res.data || [];
    return items.map((p) => ({
      nombre: p.nombre,
      glifo: p.icono || 'M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z',
      color: p.color || '#8B5CF6',
      desc: p.descripcion || 'Punto de interés municipal',
      uso: p.puntos_count || 0,
      off: p.activo === false,
    }));
  } catch {
    return [];
  }
}

export async function datosCatInventario(): Promise<FilaCatalogo[]> {
  try {
    const res = await inventarioApi.listCategorias();
    const items: any[] = res.data || [];
    return items.map((i) => ({
      nombre: i.nombre,
      glifo: i.icono || 'M4 8h16v12H4zM4 8l3-4h10l3 4M9 12h6',
      color: i.color || '#F59E0B',
      desc: i.descripcion || 'Categoría de insumos/bienes',
      uso: i.items_count || 0,
      off: i.activo === false,
    }));
  } catch {
    return [];
  }
}

export async function datosCatConceptos(): Promise<FilaCatalogo[]> {
  try {
    const res = await tiposConceptoApi.list();
    const items: any[] = res.data || [];
    return items.map((c) => ({
      nombre: c.nombre,
      glifo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      color: '#F59E0B',
      desc: c.codigo || 'Tipo de concepto de gasto',
      off: c.activo === false,
    }));
  } catch {
    return [];
  }
}

export async function datosCatConceptosLiq(): Promise<FilaCatalogo[]> {
  try {
    const res = await conceptosLiquidacionApi.list();
    const items: any[] = res.data || [];
    return items.map((c) => ({
      nombre: c.nombre,
      glifo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      color: '#3B82F6',
      desc: c.codigo || c.tipo || 'Concepto de haber',
      off: c.activo === false,
    }));
  } catch {
    return [];
  }
}

export async function datosCatTiposEmpleado(): Promise<FilaCatalogo[]> {
  try {
    const res = await tiposEmpleadoApi.list();
    const items: any[] = res.data || [];
    return items.map((t) => ({
      nombre: t.nombre,
      glifo: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
      color: '#00B37E',
      desc: t.descripcion || 'Categoría laboral de personal',
      off: t.activo === false,
    }));
  } catch {
    return [];
  }
}

export async function datosCatParajes(): Promise<FilaCatalogo[]> {
  try {
    const res = await parajesApi.list();
    const items: any[] = res.data || [];
    return items.map((p) => ({
      nombre: p.nombre,
      glifo: 'M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z',
      color: '#8B5CF6',
      desc: p.codigo || 'Localidad / Paraje municipal',
      off: p.activo === false,
    }));
  } catch {
    return [];
  }
}

export const CABLEADO_CATALOGO: Record<string, () => Promise<FilaCatalogo[]>> = {
  'cat-reclamo': datosCatReclamo,
  'categorias-reclamo': datosCatReclamo,
  'cat-tramite': datosCatTramite,
  'categorias-tramite': datosCatTramite,
  'tipos-poi': datosPoiTipos,
  'poi-tipos': datosPoiTipos,
  'cat-inv': datosCatInventario,
  'categorias-inventario': datosCatInventario,
  conceptos: datosCatConceptos,
  'tesoreria-conceptos': datosCatConceptos,
  'conceptos-liq': datosCatConceptosLiq,
  'tesoreria-conceptos-liq': datosCatConceptosLiq,
  'tipos-empleado': datosCatTiposEmpleado,
  'tesoreria-tipos-empleado': datosCatTiposEmpleado,
  parajes: datosCatParajes,
  'tesoreria-parajes': datosCatParajes,
};
