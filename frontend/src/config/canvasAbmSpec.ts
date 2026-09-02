/**
 * canvasAbmSpec — los ABM de Configuración, TAL CUAL los declara el canvas.
 *
 * Copia directa de `abmSpec()` de "Configuracion.dc.html" (Claude Design,
 * proyecto 46976e44). Cada entidad declara su eyebrow, el veredicto en prosa,
 * los cinco KPIs, la pista, los filtros, las columnas, las filas de muestra y
 * la regla del pie.
 *
 * POR QUÉ ESTÁ ACÁ Y NO INVENTADO EN CADA PANTALLA: el diseño ya decidió qué
 * dice cada pantalla y con qué números. Traducirlo "a mi manera" pantalla por
 * pantalla fue exactamente el error que hizo que Configuración no se pareciera
 * al prototipo. Acá se copia; los datos reales se enganchan después,
 * reemplazando `filas` y los valores de `kpis` por lo que devuelve la API.
 *
 * ESTADO DE LOS DATOS: las `filas` y los números de `kpis` son los del
 * PROTOTIPO — datos de muestra del diseño, no del municipio. Cada pantalla los
 * va reemplazando por los suyos a medida que se le engancha el endpoint. Lo
 * que NUNCA cambia es la estructura: columnas, orden, copy y reglas.
 */

/** Una celda de la tabla, con las variantes que usa el canvas. */
export interface CeldaSpec {
  texto: string;
  esChip: boolean;
  esTexto: boolean;
  chipBg: string;
  chipCol: string;
  hayPunto: boolean;
  punto: string;
  haySub: boolean;
  sub: string;
  subCol: string;
  align: 'left' | 'right';
  just: string;
  peso: number;
  tam: string;
  color: string;
  fuente: string;
}

export interface FilaSpec {
  /** Nombre de la entidad (primera columna). */
  n: string;
  /** Renglón chico bajo el nombre. */
  s?: string;
  /** Iniciales del avatar (personas). */
  i?: string;
  /** Path del glifo del tile (cosas). */
  gl?: string;
  /** Nombre de icono lucide (tiene prioridad sobre `gl` si está). */
  icono?: string;
  /** Objeto crudo de la API, para que la pantalla cablee edición. */
  raw?: unknown;
  /** Tinte del tile. */
  t?: string;
  /** Color del icono/iniciales. */
  cc?: string;
  /** Fila apagada (inactiva). */
  off?: boolean;
  /** Se puede borrar. */
  del?: boolean;
  cel: CeldaSpec[];
  /** Nodos hijos para layouts en forma de árbol. */
  hijos?: FilaSpec[];
}

export interface AbmSpec {
  /** 'lectura' = sin alta ni edición (la traza de auditoría). */
  modo?: string;
  eyebrow: string;
  /** Color de la barra del hero. */
  acento: string;
  /** Fondo del hero. */
  tinte: string;
  /** Veredicto en prosa. Trae <strong> del canvas. */
  ver: string;
  /** [etiqueta, valor, nota, color] — color '' = neutro. */
  kpis: [string, string, string, string][];
  /** [título, texto, cta] o null. */
  pista: [string, string, string] | null;
  buscar: string;
  cta: string;
  /** [etiqueta, valor] de cada combo. */
  selects: [string, string][];
  /** [etiqueta, conteo] de cada chip de estado. */
  chips: [string, number][];
  /** [encabezado, alineación] de cada columna. */
  heads: [string, string][];
  /** grid-template-columns de la tabla. */
  cols: string;
  /** min-width antes de scrollear. */
  min: string;
  filas: FilaSpec[];
  /** La regla de la entidad, al pie. */
  pie: string;
  /** La entidad se lee como jerarquía, no como grilla plana: el cuerpo lo pone
   *  `AccordionTree` en vez de la tabla (categoría → trámite → requisitos). */
  usaArbol?: boolean;
}

type OpcionesCelda = {
  chip?: [string, string];
  punto?: string;
  sub?: string;
  subFuerte?: boolean;
  align?: 'left' | 'right';
  peso?: number;
  tam?: string;
  color?: string;
  sora?: boolean;
};

/** `cel()` del canvas: arma una celda con sus variantes. */
function c(texto: string, o: OpcionesCelda = {}): CeldaSpec {
  return {
    texto,
    esChip: !!o.chip,
    esTexto: !o.chip,
    chipBg: o.chip ? o.chip[0] : '',
    chipCol: o.chip ? o.chip[1] : '',
    hayPunto: !!o.punto,
    punto: o.punto || '',
    haySub: !!o.sub,
    sub: o.sub || '',
    subCol: o.subFuerte ? '#B4560F' : '#98A3A0',
    align: o.align || 'left',
    just: o.align === 'right' ? 'flex-end' : 'flex-start',
    peso: o.peso || 500,
    tam: o.tam || '12.5px',
    color: o.color || '#3D4945',
    fuente: o.sora ? 'Sora, sans-serif' : 'Inter, sans-serif',
  };
}

/** `num()` del canvas: celda numérica (display, a la derecha). */
function num(texto: string, o: OpcionesCelda = {}): CeldaSpec {
  return c(texto, { align: 'right', peso: 700, tam: '13px', sora: true, color: '#0D1412', ...o });
}

// Paleta del canvas. Son valores de MUESTRA del prototipo: cuando la pantalla
// engancha sus datos, los colores salen de la entidad (categoría, dependencia)
// y estos dejan de usarse.
const V = '#00B37E', A = '#F59E0B', AZ = '#3B82F6', R = '#E5484D', VI = '#8B5CF6', CI = '#06B6D4', G = '#98A3A0';
const tV = '#E7F6F0', tA = '#FDF1DF', tAZ = '#E8F1FE', tR = '#FDECEC', tVI = '#F1EBFE', tCI = '#E4F7FB', tG = '#F3F7F5';
const chipOp: [string, string] = ['#F3F7F5', '#3D4945'];
const chipAdm: [string, string] = [tAZ, '#1D6FD1'];

/** Glifos de los tiles (paths de 24x24), como los declara el canvas. */
const g = {
  dep: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6',
  zona: 'M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11zM12 8v4',
  caja: 'M3 7h18v12H3zM3 11h18M7 15h4',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
  caj: 'M4 8h16v12H4zM4 8l3-4h10l3 4M9 12h6',
  cuad: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.9.4 5 2.3 5 4.5',
  tar: 'M3 6h18v12H3zM3 10h18M7 14h3',
  pro: 'M4 20V6l7-3 7 3v14M4 20h16M9 20v-5h6v5',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 1.8',
  tasa: 'M9 7h6M9 12h6M9 17h3M5 3h14v18H5z',
  pago: 'M3 7h18v12H3zM7 15h2M16 11h2',
  /** Traza de auditoría: reloj que retrocede (lo que ya pasó). */
  log: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
};

export const ABM_SPEC: Record<string, AbmSpec> = {
  empleados: {
    eyebrow: 'PERSONAL · PLANTEL', acento: R, tinte: '#FDF6F6',
    ver: 'Tenés <strong>10 empleados activos</strong>, 9 operarios y 1 administrativo. <strong style="color: #C93A3E;">10 especialidades dependen de una sola persona</strong>: si esa persona falta, nadie la cubre.',
    kpis: [['ACTIVOS', '10', '9 operarios · 1 administrativo', ''], ['ESPECIALIDADES', '10', 'de 17 categorías', ''], ['SIN RESPALDO', '10', 'una sola persona cada una', R], ['SIN ZONA', '0', 'de 18 zonas', ''], ['INACTIVOS', '0', 'fuera del plantel', '']],
    pista: null,
    buscar: 'Buscar por nombre, apellido o especialidad…', cta: 'Nuevo empleado',
    selects: [['Tipo', 'Todos'], ['Especialidad', 'Todas'], ['Zona', 'Todas']],
    chips: [['Todos', 10], ['Operarios', 9], ['Administrativos', 1], ['Inactivos', 0]],
    heads: [['EMPLEADO', 'left'], ['TIPO', 'left'], ['ESPECIALIDAD', 'left'], ['ZONA', 'left'], ['DEPENDENCIA', 'left'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.5fr) 128px minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.3fr) 104px', min: '1000px',
    filas: [
      { n: 'Carolina Franco', s: '+595 971 100010', i: 'CF', t: tR, cc: '#C93A3E', cel: [c('Administrativo', { chip: chipAdm }), c('Ruidos y convivencia', { punto: R }), c('Microcentro', { punto: G, color: '#7A8783' }), c('Secretaría de Seguridad', { punto: R })] },
      { n: 'Cristhian Ojeda', s: '+595 971 100004', i: 'CO', t: tV, cc: '#00794F', cel: [c('Operario', { chip: chipOp }), c('Arbolado y espacios verdes', { punto: V }), c('Villa Morra', { punto: G, color: '#7A8783' }), c('Secretaría de Servicios P…', { punto: V })] },
      { n: 'Derlis Cardozo', s: '+595 971 100002', i: 'DC', t: tV, cc: '#00794F', cel: [c('Operario', { chip: chipOp }), c('Recolección de residuos', { punto: V }), c('Microcentro', { punto: G, color: '#7A8783' }), c('Secretaría de Servicios P…', { punto: V })] },
      { n: 'Fabián Gauto', s: '+595 971 100009', i: 'FG', t: tVI, cc: '#6D3FD4', cel: [c('Operario', { chip: chipOp }), c('Animales sueltos', { punto: VI }), c('Zeballos Cué', { punto: G, color: '#7A8783' }), c('Dirección de Zoonosis y …', { punto: VI })] },
      { n: 'Gustavo Benítez', s: '+595 971 100003', i: 'GB', t: tA, cc: '#B4560F', cel: [c('Operario', { chip: chipOp }), c('Alumbrado público', { punto: A }), c('Santísima Trinidad', { punto: G, color: '#7A8783' }), c('Secretaría de Servicios P…', { punto: V })] },
      { n: 'Hugo Espínola', s: '+595 971 100006', i: 'HE', t: tAZ, cc: '#1D6FD1', cel: [c('Operario', { chip: chipOp }), c('Agua y cloacas', { punto: AZ }), c('Microcentro', { punto: G, color: '#7A8783' }), c('Secretaría de Servicios P…', { punto: V })] },
      { n: 'Nelson Duarte', s: '+595 971 100005', i: 'ND', t: tCI, cc: '#0E7490', cel: [c('Operario', { chip: chipOp }), c('Higiene urbana', { punto: CI }), c('Chacarita', { punto: G, color: '#7A8783' }), c('Secretaría de Servicios P…', { punto: V })] },
      { n: 'Óscar Cabral', s: '+595 971 100007', i: 'ÓC', t: tR, cc: '#C93A3E', cel: [c('Operario', { chip: chipOp }), c('Tránsito y señalización', { punto: R }), c('Villa Morra', { punto: G, color: '#7A8783' }), c('Dirección de Tránsito y S…', { punto: R })] },
    ],
    pie: 'El empleado con reclamos asignados no se puede borrar: primero hay que reasignarlos.',
  },

  cuadrillas: {
    eyebrow: 'PERSONAL · CAMPO', acento: A, tinte: '#FDFAF3',
    ver: '<strong>7 cuadrillas</strong> para 18 zonas. <strong style="color: #B4560F;">La Cuadrilla 2 tiene 6 órdenes abiertas</strong> y las otras seis no pasan de dos: el trabajo no está repartido.',
    kpis: [['CUADRILLAS', '7', '6 activas · 1 de licencia', ''], ['INTEGRANTES', '9', 'operarios asignados', ''], ['ÓRDENES ABIERTAS', '12', 'sobre las 7 cuadrillas', ''], ['MÁS CARGADA', '6', 'Cuadrilla 2', A], ['SIN ZONA', '1', 'Cuadrilla 7', A]],
    pista: null,
    buscar: 'Buscar cuadrilla o responsable…', cta: 'Nueva cuadrilla',
    selects: [['Zona', 'Todas'], ['Estado', 'Todos']],
    chips: [['Todas', 7], ['Con órdenes', 5], ['Libres', 2]],
    heads: [['CUADRILLA', 'left'], ['RESPONSABLE', 'left'], ['INTEGRANTES', 'right'], ['ZONA', 'left'], ['ÓRDENES', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.3fr) minmax(0, 1.2fr) 108px minmax(0, 1.1fr) 108px 104px', min: '960px',
    filas: [
      { n: 'Cuadrilla 1', s: 'Bacheo y calles', gl: g.cuad, t: tA, cc: '#B4560F', cel: [c('Silvio Ramírez', { punto: A }), num('3'), c('Sajonia', { punto: G, color: '#7A8783' }), num('2')] },
      { n: 'Cuadrilla 2', s: 'Higiene urbana', gl: g.cuad, t: tR, cc: '#C93A3E', cel: [c('Derlis Cardozo', { punto: CI }), num('2'), c('Microcentro', { punto: G, color: '#7A8783' }), num('6', { color: '#C93A3E' })] },
      { n: 'Cuadrilla 3', s: 'Alumbrado público', gl: g.cuad, t: tA, cc: '#B4560F', cel: [c('Gustavo Benítez', { punto: A }), num('2'), c('Santísima Trinidad', { punto: G, color: '#7A8783' }), num('2')] },
      { n: 'Cuadrilla 4', s: 'Espacios verdes', gl: g.cuad, t: tV, cc: '#00794F', cel: [c('Cristhian Ojeda', { punto: V }), num('1'), c('Villa Morra', { punto: G, color: '#7A8783' }), num('1')] },
      { n: 'Cuadrilla 5', s: 'Agua y cloacas', gl: g.cuad, t: tAZ, cc: '#1D6FD1', cel: [c('Hugo Espínola', { punto: AZ }), num('1'), c('Chacarita', { punto: G, color: '#7A8783' }), num('1')] },
      { n: 'Cuadrilla 6', s: 'Zoonosis', gl: g.cuad, t: tVI, cc: '#6D3FD4', cel: [c('Fabián Gauto', { punto: VI }), num('1'), c('Zeballos Cué', { punto: G, color: '#7A8783' }), num('0', { color: '#98A3A0' })] },
      { n: 'Cuadrilla 7', s: 'Sin especialidad fija', gl: g.cuad, t: tG, cc: '#7A8783', off: true, del: true, cel: [c('Sin responsable', { punto: G, color: '#98A3A0' }), num('0', { color: '#98A3A0' }), c('Sin asignar', { punto: G, color: '#98A3A0' }), num('0', { color: '#98A3A0' })] },
    ],
    pie: 'La cuadrilla con órdenes abiertas no se puede borrar: primero hay que cerrarlas o reasignarlas.',
  },

  ausencias: {
    eyebrow: 'PERSONAL · DISPONIBILIDAD', acento: A, tinte: '#FDFAF3',
    ver: '<strong>12 ausencias</strong> cargadas este mes. <strong style="color: #B4560F;">Dos se solapan el 14 de agosto en Servicios Públicos</strong>: ese día la cuadrilla queda con un solo operario.',
    kpis: [['DEL MES', '12', 'sobre 10 empleados', ''], ['EN CURSO', '2', 'hoy fuera del plantel', ''], ['SE SOLAPAN', '2', '14 de agosto', A], ['SIN JUSTIFICAR', '1', 'falta el certificado', A], ['DÍAS PERDIDOS', '31', 'acumulados en el mes', '']],
    pista: null,
    buscar: 'Buscar por empleado…', cta: 'Nueva ausencia',
    selects: [['Tipo', 'Todos'], ['Mes', 'Agosto 2026']],
    chips: [['Todas', 12], ['En curso', 2], ['Programadas', 9], ['Cerradas', 1]],
    heads: [['EMPLEADO', 'left'], ['MOTIVO', 'left'], ['DESDE', 'left'], ['HASTA', 'left'], ['DÍAS', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.4fr) minmax(0, 1.2fr) 104px 104px 84px 104px', min: '940px',
    filas: [
      { n: 'Derlis Cardozo', s: 'Higiene urbana', i: 'DC', t: tR, cc: '#C93A3E', cel: [c('Licencia médica', { punto: R }), c('12 ago'), c('16 ago'), num('5', { color: '#C93A3E' })] },
      { n: 'Nelson Duarte', s: 'Higiene urbana', i: 'ND', t: tR, cc: '#C93A3E', cel: [c('Licencia médica', { punto: R }), c('14 ago'), c('15 ago'), num('2', { color: '#C93A3E' })] },
      { n: 'Perla Sanabria', s: 'Administración', i: 'PS', t: tV, cc: '#00794F', cel: [c('Vacaciones', { punto: V }), c('18 ago'), c('29 ago'), num('12')] },
      { n: 'Gustavo Benítez', s: 'Alumbrado público', i: 'GB', t: tA, cc: '#B4560F', cel: [c('Día de estudio', { punto: A }), c('20 ago'), c('20 ago'), num('1')] },
      { n: 'Hugo Espínola', s: 'Agua y cloacas', i: 'HE', t: tAZ, cc: '#1D6FD1', cel: [c('Franco compensatorio', { punto: AZ }), c('22 ago'), c('22 ago'), num('1')] },
      { n: 'Óscar Cabral', s: 'Tránsito', i: 'ÓC', t: tG, cc: '#7A8783', cel: [c('Sin justificar', { punto: A, sub: 'falta el certificado', subFuerte: true }), c('5 ago'), c('5 ago'), num('1')] },
    ],
    pie: 'La ausencia en curso no se puede borrar: se cierra con la fecha real de vuelta.',
  },

  vecinos: {
    eyebrow: 'ATENCIÓN AL VECINO · PADRÓN', acento: V, tinte: '#F5FBF8',
    ver: '<strong>3.412 vecinos</strong> registrados y <strong>1.284 reclamaron alguna vez</strong>. <strong style="color: #B4560F;">47 tienen tres reclamos o más sin resolver</strong>: son los que van a volver al mostrador.',
    kpis: [['REGISTRADOS', '3.412', 'con teléfono verificado', ''], ['CON RECLAMOS', '1.284', '38% del padrón', ''], ['REINCIDENTES', '47', '3 o más sin resolver', A], ['CALIFICACIÓN', '4,2', 'promedio de 892 votos', ''], ['BLOQUEADOS', '3', 'por uso indebido', '']],
    pista: null,
    buscar: 'Buscar por nombre, cédula o teléfono…', cta: 'Nuevo vecino',
    selects: [['Barrio', 'Todos'], ['Estado', 'Todos']],
    chips: [['Todos', 3412], ['Con reclamos', 1284], ['Reincidentes', 47], ['Bloqueados', 3]],
    heads: [['VECINO', 'left'], ['CONTACTO', 'left'], ['BARRIO', 'left'], ['RECLAMOS', 'right'], ['CALIFICACIÓN', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.4fr) minmax(0, 1.1fr) minmax(0, 1fr) 104px 116px 104px', min: '980px',
    filas: [
      { n: 'Mirta Beatriz Ayala', s: 'CI 3.482.117', i: 'MA', t: tR, cc: '#C93A3E', cel: [c('+595 981 442 310', { sub: 'WhatsApp' }), c('Villa Morra', { punto: G, color: '#7A8783' }), num('7', { color: '#C93A3E', sub: '4 abiertos' }), num('2,1', { color: '#C93A3E' })] },
      { n: 'Ramón Villalba', s: 'CI 2.104.882', i: 'RV', t: tA, cc: '#B4560F', cel: [c('+595 971 208 114', { sub: 'WhatsApp' }), c('Sajonia', { punto: G, color: '#7A8783' }), num('4', { sub: '2 abiertos' }), num('3,4')] },
      { n: 'Estela Noemí Rojas', s: 'CI 4.771.203', i: 'ER', t: tV, cc: '#00794F', cel: [c('+595 985 610 774', { sub: 'app del vecino' }), c('Microcentro', { punto: G, color: '#7A8783' }), num('3', { sub: 'todos cerrados' }), num('4,7')] },
      { n: 'Julio César Benítez', s: 'CI 1.998.410', i: 'JB', t: tV, cc: '#00794F', cel: [c('+595 972 118 903', { sub: 'mostrador' }), c('Chacarita', { punto: G, color: '#7A8783' }), num('2', { sub: 'todos cerrados' }), num('5,0')] },
      { n: 'Lourdes Giménez', s: 'CI 5.220.664', i: 'LG', t: tV, cc: '#00794F', cel: [c('+595 983 774 201', { sub: 'app del vecino' }), c('Recoleta', { punto: G, color: '#7A8783' }), num('1', { sub: 'cerrado' }), num('4,0')] },
      { n: 'Anónimo · 0981 100 442', s: 'sin cédula cargada', i: '?', t: tG, cc: '#7A8783', off: true, cel: [c('+595 981 100 442', { sub: 'sin verificar', subFuerte: true }), c('Sin barrio', { punto: G, color: '#98A3A0' }), num('1', { color: '#98A3A0' }), c('—', { align: 'right', color: '#98A3A0' })] },
    ],
    pie: 'El vecino con reclamos cargados no se borra: se bloquea, y su historial queda.',
  },

  sla: {
    eyebrow: 'ATENCIÓN AL VECINO · PLAZOS', acento: A, tinte: '#FDFAF3',
    ver: '<strong>9 categorías tienen plazo definido</strong> de las 17 que existen. <strong style="color: #C93A3E;">Bacheo cumple el 38%</strong>: prometés 7 días y tardás 19.',
    kpis: [['CON PLAZO', '9', 'de 17 categorías', ''], ['SIN PLAZO', '8', 'no prometen nada', A], ['CUMPLIMIENTO', '61%', 'promedio ponderado', ''], ['PEOR CATEGORÍA', '38%', 'Bacheo y calles', R], ['VENCIDOS HOY', '3', 'ya fuera de plazo', R]],
    pista: ['LOS PLAZOS SE CUENTAN EN DÍAS HÁBILES', 'El reloj arranca cuando el reclamo se deriva a la dependencia, no cuando el vecino lo carga. Los feriados municipales no cuentan.', 'Ver el calendario'],
    buscar: 'Buscar categoría…', cta: 'Nuevo plazo',
    selects: [['Dependencia', 'Todas'], ['Cumplimiento', 'Todos']],
    chips: [['Todos', 9], ['Cumplen', 5], ['No cumplen', 4]],
    heads: [['CATEGORÍA', 'left'], ['DEPENDENCIA', 'left'], ['PLAZO', 'right'], ['REAL', 'right'], ['CUMPLIMIENTO', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.4fr) minmax(0, 1.3fr) 96px 96px 128px 104px', min: '1000px',
    filas: [
      { n: 'Bacheo y calles', s: '97 reclamos en el período', gl: g.caj, t: tR, cc: '#C93A3E', cel: [c('Obras Públicas', { punto: A }), num('7 d'), num('19 d', { color: '#C93A3E' }), num('38%', { color: '#C93A3E', sub: '37 de 97' })] },
      { n: 'Alumbrado público', s: '62 reclamos', gl: g.caj, t: tA, cc: '#B4560F', cel: [c('Servicios Públicos', { punto: V }), num('5 d'), num('8 d', { color: '#B4560F' }), num('54%', { color: '#B4560F', sub: '33 de 62' })] },
      { n: 'Higiene urbana', s: '48 reclamos', gl: g.caj, t: tCI, cc: '#0E7490', cel: [c('Servicios Públicos', { punto: V }), num('3 d'), num('2 d'), num('88%', { color: '#00794F', sub: '42 de 48' })] },
      { n: 'Agua y cloacas', s: '34 reclamos', gl: g.caj, t: tAZ, cc: '#1D6FD1', cel: [c('Obras Públicas', { punto: A }), num('2 d'), num('2 d'), num('76%', { color: '#00794F', sub: '26 de 34' })] },
      { n: 'Zoonosis', s: '19 reclamos', gl: g.caj, t: tVI, cc: '#6D3FD4', cel: [c('Dirección de Zoonosis', { punto: VI }), num('2 d'), num('4 d', { color: '#B4560F' }), num('47%', { color: '#B4560F', sub: '9 de 19' })] },
      { n: 'Semáforos', s: '12 reclamos', gl: g.caj, t: tR, cc: '#C93A3E', cel: [c('Tránsito', { punto: R }), num('1 d'), num('1 d'), num('92%', { color: '#00794F', sub: '11 de 12' })] },
    ],
    pie: 'Bajar un plazo no reordena la cola: la prioridad se define en Asignación.',
  },

  dependencias: {
    eyebrow: 'CATÁLOGOS · ORGANIGRAMA', acento: V, tinte: '#F5FBF8',
    ver: '<strong>11 dependencias</strong> atienden las 17 categorías. <strong style="color: #C93A3E;">Servicios Públicos concentra 6 categorías y 210 reclamos</strong>; tres dependencias no reciben nada.',
    kpis: [['DEPENDENCIAS', '11', '10 activas · 1 inactiva', ''], ['CON CATEGORÍAS', '8', 'las otras 3 no reciben', A], ['MÁS CARGADA', '210', 'Servicios Públicos', R], ['SIN RESPONSABLE', '2', 'nadie a cargo', A], ['EN COLA', '244', 'reclamos repartidos', '']],
    pista: null,
    /* El municipio PUEDE crear las suyas: le damos un catálogo de arranque,
       pero si tiene una Secretaría de Vialidad propia la da de alta él. Lo que
       no elige el municipio son los MÓDULOS que usa — eso es facturación. */
    buscar: 'Buscar dependencia…', cta: 'Nueva dependencia',
    selects: [['Tipo', 'Todas'], ['Estado', 'Todos']],
    chips: [['Todas', 11], ['Con trabajo', 8], ['Sin trabajo', 3]],
    heads: [['DEPENDENCIA', 'left'], ['ATIENDE', 'left'], ['CATEGORÍAS', 'right'], ['TRÁMITES', 'right'], ['DIRECCIONES', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.8fr) minmax(0, 0.9fr) 112px 104px 112px 104px', min: '1020px',
    filas: [
      { n: 'Secretaría de Servicios Públicos', s: 'Secretaría · Higiene, alumbrado y verde', gl: g.dep, t: tV, cc: '#00794F', cel: [c('Ambos', { punto: V }), num('6'), num('3'), num('2')] },
      { n: 'Secretaría de Obras Públicas', s: 'Secretaría · Bacheo, agua y cloacas', gl: g.dep, t: tA, cc: '#B4560F', cel: [c('Ambos', { punto: V }), num('4'), num('2'), num('1')] },
      { n: 'Dirección de Tránsito y Seguridad Vial', s: 'Dirección · Semáforos y señalización', gl: g.dep, t: tR, cc: '#C93A3E', cel: [c('Ambos', { punto: V }), num('3'), num('2'), num('0')] },
      { n: 'Dirección de Zoonosis y Bromatología', s: 'Dirección · Animales y plagas', gl: g.dep, t: tVI, cc: '#6D3FD4', cel: [c('Reclamos', { punto: AZ }), num('2'), num('0'), num('0')] },
      { n: 'Secretaría de Seguridad', s: 'Secretaría · Ruidos y convivencia', gl: g.dep, t: tAZ, cc: '#1D6FD1', cel: [c('Reclamos', { punto: AZ }), num('1'), num('0'), num('0')] },
      { n: 'Dirección de Catastro', s: 'Dirección · Sin categorías asignadas', gl: g.dep, t: tG, cc: '#7A8783', del: true, cel: [c('Trámites', { punto: VI }), num('0', { color: '#98A3A0' }), num('1'), num('0', { color: '#98A3A0' })] },
    ],
    pie: 'El lápiz edita la identidad (icono y color se ven en toda la app) y el contacto local. Quién atiende qué se reparte en Asignaciones.',
  },

  /* Zonas: el canvas pedía BARRIOS y RESUELTOS por zona, datos que el modelo
     no tiene. En su lugar van cuadrillas, reclamos, participación sobre el
     total y estado — todos reales de /api/zonas (regla: otro dato REAL de la
     misma sección, nunca el número del mockup ni el hueco). */
  zonas: {
    eyebrow: 'CATÁLOGOS · TERRITORIO', acento: AZ, tinte: '#F5F8FD',
    ver: '<strong>18 zonas</strong> definidas. <strong style="color: #B4560F;">Cinco no tienen cuadrilla asignada</strong>: los reclamos de ahí entran sin equipo.',
    kpis: [['ZONAS', '18', 'territorios delimitados', ''], ['ACTIVAS', '18', 'en despacho de trabajo', ''], ['SIN CUADRILLA', '5', 'reclamos sin equipo', A], ['CUADRILLAS', '13', 'desplegadas', ''], ['RECLAMOS', '244', 'georreferenciados', '']],
    pista: ['LAS ZONAS SE DIBUJAN EN EL MAPA', 'Acá se editan el nombre, la cuadrilla y el estado. El polígono de cada zona se ajusta sobre el mapa, no en esta grilla.', 'Abrir el mapa de zonas'],
    buscar: 'Buscar zona…', cta: 'Nueva zona',
    selects: [['Cuadrilla', 'Todas'], ['Cobertura', 'Todas']],
    chips: [['Todas', 18], ['Con cuadrilla', 13], ['Sin cuadrilla', 5]],
    heads: [['ZONA', 'left'], ['CUADRILLAS', 'right'], ['RECLAMOS', 'right'], ['DEL TOTAL', 'right'], ['ESTADO', 'left'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.6fr) 112px 104px 104px minmax(0, 0.9fr) 104px', min: '1000px',
    filas: [
      { n: 'Zona 1 · Centro', s: 'AS-CENT-01', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [num('1'), num('63'), num('26%', { color: '#7A8783' }), c('Activa', { color: '#00794F' })] },
      { n: 'Zona 2 · Villa Morra', s: 'AS-VMOR-02', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [num('1'), num('52'), num('21%', { color: '#7A8783' }), c('Activa', { color: '#00794F' })] },
      { n: 'Zona 3 · Sajonia', s: 'AS-SAJO-03', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [num('1'), num('41'), num('17%', { color: '#7A8783' }), c('Activa', { color: '#00794F' })] },
      { n: 'Zona 4 · Trinidad', s: 'AS-TRIN-04', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [num('1'), num('34'), num('14%', { color: '#7A8783' }), c('Activa', { color: '#00794F' })] },
      { n: 'Zona 5 · Zeballos Cué', s: 'AS-ZEBA-05', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [num('1'), num('22'), num('9%', { color: '#7A8783' }), c('Activa', { color: '#00794F' })] },
      { n: 'Zona 18 · Chacarita', s: 'AS-COST-18', gl: g.zona, t: tG, cc: '#7A8783', cel: [num('0', { color: '#B4560F' }), num('19'), num('8%', { color: '#7A8783' }), c('Activa', { color: '#00794F' })] },
    ],
    pie: 'Borrar una zona deja su territorio sin cobertura: los reclamos entran sin cuadrilla.',
  },

  inv: {
    eyebrow: 'INVENTARIO · DEPÓSITO', acento: A, tinte: '#FDFAF3',
    ver: '<strong>240 artículos</strong> en tres depósitos. <strong style="color: #C93A3E;">14 están bajo el mínimo</strong> y cuatro de ellos son de bacheo, la categoría con más trabajo abierto.',
    kpis: [['ARTÍCULOS', '240', 'en 8 categorías', ''], ['BAJO MÍNIMO', '14', 'hay que reponer', R], ['SIN STOCK', '5', 'no se puede usar', R], ['MOVIMIENTOS DEL MES', '312', 'entradas y salidas', ''], ['SIN MOVIMIENTO', '38', 'hace más de 90 días', A]],
    pista: null,
    buscar: 'Buscar artículo o código…', cta: 'Nuevo artículo',
    selects: [['Categoría', 'Todas'], ['Depósito', 'Todos'], ['Stock', 'Todos']],
    chips: [['Todos', 240], ['Bajo mínimo', 14], ['Sin stock', 5], ['Quietos', 38]],
    heads: [['ARTÍCULO', 'left'], ['CATEGORÍA', 'left'], ['DEPÓSITO', 'left'], ['STOCK', 'right'], ['MÍNIMO', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 1fr) 108px 96px 104px', min: '1000px',
    filas: [
      { n: 'Cemento Portland 50 kg', s: 'ART-0114', gl: g.caja, t: tR, cc: '#C93A3E', cel: [c('Áridos y cemento', { punto: A }), c('Central', { color: '#7A8783' }), num('6', { color: '#C93A3E', sub: 'bajo mínimo' }), num('20')] },
      { n: 'Luminaria LED 60 W', s: 'ART-0208', gl: g.caja, t: tR, cc: '#C93A3E', cel: [c('Luminarias', { punto: A }), c('Central', { color: '#7A8783' }), num('0', { color: '#C93A3E', sub: 'sin stock' }), num('15')] },
      { n: 'Mezcla asfáltica en frío', s: 'ART-0131', gl: g.caja, t: tA, cc: '#B4560F', cel: [c('Áridos y cemento', { punto: A }), c('Corralón', { color: '#7A8783' }), num('18', { color: '#B4560F', sub: 'al límite' }), num('18')] },
      { n: 'Guantes de trabajo', s: 'ART-0402', gl: g.caja, t: tV, cc: '#00794F', cel: [c('Herramientas', { punto: V }), c('Corralón', { color: '#7A8783' }), num('84'), num('30')] },
      { n: 'Bolsas de residuos 120 L', s: 'ART-0311', gl: g.caja, t: tV, cc: '#00794F', cel: [c('Limpieza', { punto: V }), c('Central', { color: '#7A8783' }), num('1.240'), num('400')] },
      { n: 'Cartel de obra reflectivo', s: 'ART-0509', gl: g.caja, t: tG, cc: '#7A8783', cel: [c('Señalización', { punto: AZ }), c('Corralón', { color: '#7A8783' }), num('22', { sub: 'sin movimiento 4 m', }), num('10')] },
    ],
    pie: 'El artículo con movimientos no se borra: se da de baja y su historial queda.',
  },

  cajas: {
    eyebrow: 'TESORERÍA · FONDOS', acento: V, tinte: '#F5FBF8',
    ver: '<strong>4 cajas abiertas</strong> con $ 8.412.900 en total. <strong style="color: #B4560F;">La caja chica de Obras no se arquea desde hace 23 días</strong>: la regla dice cada 7.',
    kpis: [['CAJAS', '4', '3 chicas · 1 fondo fijo', ''], ['SALDO TOTAL', '$ 8.412.900', 'suma de las 4', ''], ['SIN ARQUEO', '1', 'hace 23 días', A], ['MOVIMIENTOS DEL MES', '96', 'ingresos y egresos', ''], ['DIFERENCIAS', '$ 0', 'último arqueo', '']],
    pista: null,
    buscar: 'Buscar caja o responsable…', cta: 'Nueva caja',
    selects: [['Tipo', 'Todas'], ['Estado', 'Todas']],
    chips: [['Todas', 4], ['Al día', 3], ['Sin arqueo', 1]],
    heads: [['CAJA', 'left'], ['RESPONSABLE', 'left'], ['SALDO', 'right'], ['ÚLTIMO ARQUEO', 'right'], ['MOVIMIENTOS', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.4fr) minmax(0, 1.1fr) 136px 128px 116px 104px', min: '1040px',
    filas: [
      { n: 'Tesorería central', s: 'Fondo fijo', gl: g.caja, t: tV, cc: '#00794F', cel: [c('Perla Sanabria', { punto: V }), num('$ 6.820.400'), num('hace 2 d', { color: '#00794F' }), num('54')] },
      { n: 'Caja chica · Obras Públicas', s: 'Rendición mensual', gl: g.caja, t: tA, cc: '#B4560F', cel: [c('Arnaldo Cantero', { punto: A }), num('$ 940.500'), num('hace 23 d', { color: '#B4560F', sub: 'la regla dice 7' }), num('22')] },
      { n: 'Caja chica · Servicios Públicos', s: 'Rendición mensual', gl: g.caja, t: tV, cc: '#00794F', cel: [c('Rocío Giménez', { punto: V }), num('$ 512.000'), num('hace 4 d', { color: '#00794F' }), num('14')] },
      { n: 'Caja de mostrador', s: 'Cobros del día', gl: g.caja, t: tV, cc: '#00794F', cel: [c('Dionisia Franco', { punto: V }), num('$ 140.000'), num('hoy', { color: '#00794F' }), num('6')] },
    ],
    pie: 'La caja con movimientos del mes no se cierra hasta que se arquee.',
  },

  retenciones: {
    eyebrow: 'TESORERÍA · IMPUESTOS', acento: AZ, tinte: '#F5F8FD',
    ver: '<strong>6 retenciones vigentes</strong> se aplican a los pagos a proveedores. <strong style="color: #B4560F;">Dos vencen el 31 de diciembre</strong> y hay que renovar la alícuota.',
    kpis: [['VIGENTES', '6', 'de 8 configuradas', ''], ['VENCEN ESTE AÑO', '2', '31 de diciembre', A], ['APLICADAS EN JULIO', '$ 1.412.800', 'sobre 12 pagos', ''], ['SIN USO', '2', 'nunca se aplicaron', ''], ['MÁS APLICADA', 'IVA 21%', '9 de 12 pagos', '']],
    pista: null,
    buscar: 'Buscar retención…', cta: 'Nueva retención',
    selects: [['Base', 'Todas'], ['Vigencia', 'Vigentes']],
    chips: [['Todas', 8], ['Vigentes', 6], ['Vencidas', 2]],
    heads: [['RETENCIÓN', 'left'], ['BASE DE CÁLCULO', 'left'], ['ALÍCUOTA', 'right'], ['VIGENCIA', 'right'], ['APLICADA', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.3fr) minmax(0, 1.3fr) 104px 128px 116px 104px', min: '1020px',
    filas: [
      { n: 'IVA', s: 'Retención general', gl: g.tasa, t: tAZ, cc: '#1D6FD1', cel: [c('Neto gravado', { color: '#7A8783' }), num('21%'), num('sin vencer', { color: '#00794F' }), num('9 pagos')] },
      { n: 'Ganancias', s: 'Servicios profesionales', gl: g.tasa, t: tAZ, cc: '#1D6FD1', cel: [c('Total menos mínimo', { color: '#7A8783' }), num('6%'), num('31 dic 2026', { color: '#B4560F' }), num('4 pagos')] },
      { n: 'Ingresos brutos', s: 'Jurisdicción municipal', gl: g.tasa, t: tAZ, cc: '#1D6FD1', cel: [c('Total facturado', { color: '#7A8783' }), num('2,5%'), num('31 dic 2026', { color: '#B4560F' }), num('7 pagos')] },
      { n: 'SUSS', s: 'Contratistas de obra', gl: g.tasa, t: tAZ, cc: '#1D6FD1', cel: [c('Mano de obra', { color: '#7A8783' }), num('1,2%'), num('sin vencer', { color: '#00794F' }), num('2 pagos')] },
      { n: 'Sellos', s: 'Contratos', gl: g.tasa, t: tG, cc: '#7A8783', off: true, del: true, cel: [c('Monto del contrato', { color: '#7A8783' }), num('1%', { color: '#98A3A0' }), num('vencida', { color: '#C93A3E' }), num('—', { color: '#98A3A0' })] },
    ],
    pie: 'La retención ya aplicada no se borra: se le pone fecha de fin y deja de calcularse.',
  },

  proyectos: {
    eyebrow: 'TESORERÍA · OBRAS', acento: A, tinte: '#FDFAF3',
    ver: '<strong>8 proyectos abiertos</strong> por $ 184.200.000. <strong style="color: #C93A3E;">La repavimentación de Eusebio Ayala ya ejecutó el 94% del presupuesto</strong> y le queda un tercio de obra.',
    kpis: [['ABIERTOS', '8', '3 con obra en curso', ''], ['PRESUPUESTADO', '$ 184.200.000', 'ejercicio 2026', ''], ['EJECUTADO', '61%', '$ 112.400.000', ''], ['EN RIESGO', '1', 'gasto sobre avance', R], ['SIN MOVIMIENTO', '2', 'hace más de 60 días', A]],
    pista: null,
    buscar: 'Buscar proyecto…', cta: 'Nuevo proyecto',
    selects: [['Estado', 'Todos'], ['Ejercicio', '2026']],
    chips: [['Todos', 8], ['En curso', 3], ['En riesgo', 1], ['Cerrados', 4]],
    heads: [['PROYECTO', 'left'], ['PRESUPUESTO', 'right'], ['EJECUTADO', 'right'], ['AVANCE DE OBRA', 'right'], ['ÚLTIMO GASTO', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.6fr) 140px 140px 128px 116px 104px', min: '1100px',
    filas: [
      { n: 'Repavimentación Eusebio Ayala', s: 'Obras Públicas · 2026', gl: g.pro, t: tR, cc: '#C93A3E', cel: [num('$ 62.000.000'), num('$ 58.280.000', { color: '#C93A3E', sub: '94% del total' }), num('68%', { color: '#C93A3E' }), num('hace 3 d')] },
      { n: 'Recambio a luminarias LED', s: 'Servicios Públicos · 2026', gl: g.pro, t: tA, cc: '#B4560F', cel: [num('$ 48.400.000'), num('$ 31.460.000', { sub: '65% del total' }), num('71%', { color: '#00794F' }), num('hace 1 d')] },
      { n: 'Plaza Uruguaya · puesta en valor', s: 'Servicios Públicos · 2026', gl: g.pro, t: tV, cc: '#00794F', cel: [num('$ 28.800.000'), num('$ 12.100.000', { sub: '42% del total' }), num('45%', { color: '#00794F' }), num('hace 8 d')] },
      { n: 'Desagüe pluvial Sajonia', s: 'Obras Públicas · 2026', gl: g.pro, t: tA, cc: '#B4560F', cel: [num('$ 24.000.000'), num('$ 6.400.000', { sub: '27% del total' }), num('30%', { color: '#00794F' }), num('hace 62 d', { color: '#B4560F' })] },
      { n: 'Señalización de escuelas', s: 'Tránsito · 2026', gl: g.pro, t: tG, cc: '#7A8783', cel: [num('$ 12.000.000'), num('$ 2.160.000', { sub: '18% del total' }), num('20%'), num('hace 74 d', { color: '#B4560F' })] },
    ],
    pie: 'El proyecto con gastos imputados no se borra: se cierra y sus gastos quedan atados.',
  },

  tarjetas: {
    eyebrow: 'TESORERÍA · MEDIOS DE PAGO', acento: AZ, tinte: '#F5F8FD',
    ver: '<strong>3 tarjetas corporativas</strong> con $ 2.104.700 de consumo sin rendir. <strong style="color: #B4560F;">La de Obras cierra en 4 días</strong> y tiene 11 consumos sin comprobante.',
    kpis: [['TARJETAS', '3', 'dos bancos', ''], ['CONSUMO SIN RENDIR', '$ 2.104.700', 'en el ciclo actual', ''], ['CIERRA PRONTO', '1', 'en 4 días', A], ['SIN COMPROBANTE', '11', 'consumos a rendir', A], ['LÍMITE USADO', '38%', 'del total disponible', '']],
    pista: null,
    buscar: 'Buscar tarjeta…', cta: 'Nueva tarjeta',
    selects: [['Banco', 'Todos'], ['Estado', 'Todas']],
    chips: [['Todas', 3], ['Al día', 2], ['A rendir', 1]],
    heads: [['TARJETA', 'left'], ['RESPONSABLE', 'left'], ['CONSUMO', 'right'], ['CIERRE', 'right'], ['VENCIMIENTO', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.3fr) minmax(0, 1.1fr) 132px 112px 124px 104px', min: '1020px',
    filas: [
      { n: 'Visa Corporate · 4417', s: 'Banco Continental', gl: g.tar, t: tA, cc: '#B4560F', cel: [c('Arnaldo Cantero', { punto: A }), num('$ 1.284.200', { sub: '11 sin comprobante', }), num('en 4 d', { color: '#B4560F' }), num('20 ago')] },
      { n: 'Mastercard · 8802', s: 'Banco Itaú', gl: g.tar, t: tV, cc: '#00794F', cel: [c('Perla Sanabria', { punto: V }), num('$ 620.500'), num('en 18 d', { color: '#00794F' }), num('3 sep')] },
      { n: 'Visa Débito · 1109', s: 'Banco Continental', gl: g.tar, t: tV, cc: '#00794F', cel: [c('Dionisia Franco', { punto: V }), num('$ 200.000'), num('sin ciclo', { color: '#98A3A0' }), num('—', { color: '#98A3A0' })] },
    ],
    pie: 'La tarjeta con consumos sin rendir no se da de baja hasta cerrar el ciclo.',
  },

  contactos: {
    eyebrow: 'TESORERÍA · TERCEROS', acento: V, tinte: '#F5FBF8',
    ver: '<strong>148 contactos</strong> entre proveedores y empleados. <strong style="color: #B4560F;">23 no tienen CBU cargado</strong>: a esos hay que pagarles por fuera del sistema.',
    kpis: [['CONTACTOS', '148', '112 proveedores · 36 empleados', ''], ['SIN CBU', '23', 'no entran al pago masivo', A], ['CON DEUDA', '14', '$ 43.048.905', ''], ['SIN MOVIMIENTO', '61', 'hace más de 6 meses', ''], ['DUPLICADOS', '2', 'mismo RUC', R]],
    pista: ['EL CBU ES LO QUE HABILITA EL PAGO MASIVO', 'Un contacto sin CBU se puede facturar igual, pero queda afuera de la transferencia en lote: hay que pagarle a mano.', 'Ver los 23 sin CBU'],
    buscar: 'Buscar por nombre, RUC o CBU…', cta: 'Nuevo contacto',
    selects: [['Tipo', 'Todos'], ['Categoría', 'Todas'], ['CBU', 'Todos']],
    chips: [['Todos', 148], ['Proveedores', 112], ['Empleados', 36], ['Sin CBU', 23]],
    heads: [['CONTACTO', 'left'], ['TIPO', 'left'], ['RUC', 'left'], ['DEUDA', 'right'], ['ÚLTIMO MOVIMIENTO', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.5fr) 132px minmax(0, 1fr) 128px 140px 104px', min: '1060px',
    filas: [
      { n: 'Corralón Itá Enramada', s: 'CBU cargado', i: 'CI', t: tV, cc: '#00794F', cel: [c('Proveedor', { chip: [tV, '#00794F'] }), c('80048291-4', { color: '#7A8783' }), num('$ 11.900.000'), num('hace 3 d')] },
      { n: 'Seguros La Consolidada S.A.', s: 'CBU cargado', i: 'SC', t: tV, cc: '#00794F', cel: [c('Proveedor', { chip: [tV, '#00794F'] }), c('80012004-7', { color: '#7A8783' }), num('$ 15.200.000', { color: '#C93A3E', sub: 'vencido' }), num('hace 22 d')] },
      { n: 'Consultora Jara y Asociados', s: 'sin CBU', i: 'CJ', t: tA, cc: '#B4560F', cel: [c('Servicio profesional', { chip: [tA, '#B4560F'] }), c('80099117-2', { color: '#7A8783' }), num('$ 1.600.000'), num('hace 9 d')] },
      { n: 'Perla Sanabria', s: 'CBU cargado', i: 'PS', t: tAZ, cc: '#1D6FD1', cel: [c('Empleado', { chip: chipAdm }), c('4.882.104', { color: '#7A8783' }), num('$ 3.000.000'), num('hace 1 d')] },
      { n: 'Limpieza Integral Ñanduti', s: 'CBU cargado · RUC duplicado', i: 'LÑ', t: tR, cc: '#C93A3E', cel: [c('Proveedor', { chip: [tV, '#00794F'] }), c('80077412-9', { color: '#C93A3E', sub: 'se repite en 2 contactos', subFuerte: true }), num('$ 9.600.000'), num('hace 14 d')] },
      { n: 'Ferretería Guaraní S.R.L.', s: 'sin CBU', i: 'FG', t: tA, cc: '#B4560F', cel: [c('Proveedor', { chip: [tV, '#00794F'] }), c('80031885-1', { color: '#7A8783' }), num('$ 7.400.000'), num('hace 6 d')] },
    ],
    pie: 'El contacto con movimientos no se borra: se da de baja y su historial queda.',
  },

  tasas: {
    eyebrow: 'TESORERÍA · INGRESOS', acento: V, tinte: '#F5FBF8',
    ver: '<strong>31 tasas en el catálogo</strong> y <strong>24 se cobraron este año</strong>. <strong style="color: #B4560F;">Siete tienen importe de 2024</strong>: se están cobrando desactualizadas.',
    kpis: [['EN CATÁLOGO', '31', '24 se cobran', ''], ['DESACTUALIZADAS', '7', 'importe de 2024', A], ['RECAUDADO', '$ 84.120.400', 'en el año', ''], ['MÁS COBRADA', 'ABL', '1.284 boletas', ''], ['SIN COBRAR', '7', 'nunca se emitieron', '']],
    pista: null,
    buscar: 'Buscar tasa…', cta: 'Nueva tasa',
    selects: [['Categoría', 'Todas'], ['Cálculo', 'Todos'], ['Vigencia', 'Todas']],
    chips: [['Todas', 31], ['Vigentes', 24], ['Desactualizadas', 7]],
    heads: [['TASA', 'left'], ['CÁLCULO', 'left'], ['IMPORTE', 'right'], ['ACTUALIZADA', 'right'], ['RECAUDADO', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.5fr) minmax(0, 1.1fr) 124px 124px 140px 104px', min: '1080px',
    filas: [
      { n: 'ABL · Alumbrado, barrido y limpieza', s: 'Bimestral', gl: g.tasa, t: tV, cc: '#00794F', cel: [c('Por m² del inmueble', { color: '#7A8783' }), num('$ 12.400'), num('jul 2026', { color: '#00794F' }), num('$ 41.208.400')] },
      { n: 'Habilitación comercial', s: 'Por trámite', gl: g.tasa, t: tV, cc: '#00794F', cel: [c('Monto fijo por rubro', { color: '#7A8783' }), num('$ 84.000'), num('may 2026', { color: '#00794F' }), num('$ 18.480.000')] },
      { n: 'Permiso de obra', s: 'Por trámite', gl: g.tasa, t: tA, cc: '#B4560F', cel: [c('Por m² a construir', { color: '#7A8783' }), num('$ 3.200'), num('nov 2024', { color: '#B4560F', sub: 'sin actualizar' }), num('$ 9.120.000')] },
      { n: 'Ocupación de vía pública', s: 'Mensual', gl: g.tasa, t: tA, cc: '#B4560F', cel: [c('Por m² y por día', { color: '#7A8783' }), num('$ 1.800'), num('nov 2024', { color: '#B4560F', sub: 'sin actualizar' }), num('$ 6.240.000')] },
      { n: 'Libre deuda', s: 'Por certificado', gl: g.tasa, t: tV, cc: '#00794F', cel: [c('Monto fijo', { color: '#7A8783' }), num('$ 14.000'), num('jul 2026', { color: '#00794F' }), num('$ 4.032.000')] },
      { n: 'Cementerio · traslado', s: 'Por trámite', gl: g.tasa, t: tG, cc: '#7A8783', del: true, cel: [c('Monto fijo', { color: '#7A8783' }), num('$ 22.000', { color: '#98A3A0' }), num('nov 2024', { color: '#B4560F' }), num('—', { color: '#98A3A0' })] },
    ],
    pie: 'La tasa con boletas emitidas no se borra: se le pone fecha de fin de vigencia.',
  },

  pagos: {
    eyebrow: 'INTEGRACIONES · COBROS', acento: V, tinte: '#F5FBF8',
    ver: '<strong>2 proveedores de pago conectados</strong>. <strong style="color: #00794F;">El 71% de los cobros del mes entró por Bancard</strong>; la pasarela de billeteras está en prueba y no cobra todavía.',
    kpis: [['CONECTADOS', '2', 'de 4 disponibles', ''], ['COBRADO ESTE MES', '$ 24.180.400', 'por los dos medios', ''], ['COMISIÓN PROMEDIO', '2,8%', '$ 677.050 del mes', ''], ['FALLIDOS', '14', 'de 892 intentos', A], ['EN PRUEBA', '1', 'no cobra todavía', '']],
    pista: ['LAS CREDENCIALES NO SE MUESTRAN', 'Una vez guardada, la clave privada queda cifrada y solo se ve el prefijo. Para rotarla hay que cargarla de nuevo, no se puede leer.', 'Cómo rotar una credencial'],
    buscar: 'Buscar proveedor…', cta: 'Conectar proveedor',
    selects: [['Modo', 'Todos'], ['Estado', 'Todos']],
    chips: [['Todos', 4], ['Conectados', 2], ['En prueba', 1], ['Sin conectar', 1]],
    heads: [['PROVEEDOR', 'left'], ['MODO', 'left'], ['COMISIÓN', 'right'], ['COBRADO', 'right'], ['ÚLTIMA CONEXIÓN', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.4fr) 128px 108px 136px 140px 104px', min: '1060px',
    filas: [
      { n: 'Bancard', s: 'Tarjetas y débito', gl: g.pago, t: tV, cc: '#00794F', cel: [c('Producción', { chip: [tV, '#00794F'] }), num('2,4%'), num('$ 17.168.100'), num('hace 3 min', { color: '#00794F' })] },
      { n: 'Pago Móvil Tigo', s: 'Billetera', gl: g.pago, t: tV, cc: '#00794F', cel: [c('Producción', { chip: [tV, '#00794F'] }), num('3,2%'), num('$ 7.012.300'), num('hace 12 min', { color: '#00794F' })] },
      { n: 'Billetera Personal', s: 'Billetera', gl: g.pago, t: tA, cc: '#B4560F', cel: [c('Prueba', { chip: [tA, '#B4560F'] }), num('3,0%'), num('$ 0', { color: '#98A3A0' }), num('hace 2 d', { color: '#B4560F' })] },
      { n: 'Transferencia bancaria', s: 'Sin credenciales cargadas', gl: g.pago, t: tG, cc: '#7A8783', off: true, del: true, cel: [c('Sin conectar', { chip: [tG, '#7A8783'] }), num('—', { color: '#98A3A0' }), num('—', { color: '#98A3A0' }), num('nunca', { color: '#98A3A0' })] },
    ],
    pie: 'Desconectar un proveedor no borra los cobros que ya entraron por él.',
  },

  auditoria: {
    modo: 'lectura',
    eyebrow: 'SUPER ADMIN · TRAZA', acento: AZ, tinte: '#F5F8FD',
    ver: '<strong>1.284 acciones registradas</strong> en los últimos 30 días. <strong style="color: #B4560F;">Tres borrados de registros</strong> los hizo el mismo usuario en un lapso de once minutos.',
    kpis: [['ACCIONES · 30 D', '1.284', 'de 12 usuarios', ''], ['BORRADOS', '3', 'mismo usuario', A], ['CAMBIOS DE CONFIG', '41', 'sobre 9 catálogos', ''], ['DESDE FUERA', '2', 'IP no municipal', R], ['USUARIO MÁS ACTIVO', '412', 'Rocío Giménez', '']],
    pista: null,
    buscar: 'Buscar por usuario, entidad o acción…', cta: 'Exportar la traza',
    selects: [['Usuario', 'Todos'], ['Acción', 'Todas'], ['Período', 'Últimos 30 días']],
    chips: [['Todas', 1284], ['Borrados', 3], ['Config', 41], ['Ingresos', 208]],
    heads: [['CUÁNDO', 'left'], ['USUARIO', 'left'], ['ACCIÓN', 'left'], ['ENTIDAD', 'left'], ['ORIGEN', 'left'], ['DETALLE', 'right']],
    cols: 'minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1fr) 104px', min: '1100px',
    filas: [
      { n: 'Hoy 09:41', s: 'hace 12 minutos', gl: g.log, t: tR, cc: '#C93A3E', cel: [c('Néstor Ayala', { punto: R }), c('Borró un registro', { punto: R, color: '#C93A3E' }), c('Tasa · Cementerio', { color: '#7A8783' }), c('190.128.44.2', { color: '#98A3A0', sub: 'IP no municipal', subFuerte: true })] },
      { n: 'Hoy 09:36', s: 'hace 17 minutos', gl: g.log, t: tR, cc: '#C93A3E', cel: [c('Néstor Ayala', { punto: R }), c('Borró un registro', { punto: R, color: '#C93A3E' }), c('Tasa · Exhumación', { color: '#7A8783' }), c('190.128.44.2', { color: '#98A3A0' })] },
      { n: 'Hoy 09:30', s: 'hace 23 minutos', gl: g.log, t: tA, cc: '#B4560F', cel: [c('Rocío Giménez', { punto: V }), c('Cambió un plazo', { punto: A, color: '#B4560F' }), c('SLA · Bacheo 7 d → 5 d', { color: '#7A8783' }), c('Red municipal', { color: '#98A3A0' })] },
      { n: 'Hoy 08:14', s: 'hace 1 hora', gl: g.log, t: tV, cc: '#00794F', cel: [c('Perla Sanabria', { punto: V }), c('Aprobó un pago', { punto: V }), c('OP-2026-0009', { color: '#7A8783' }), c('Red municipal', { color: '#98A3A0' })] },
      { n: 'Ayer 17:52', s: '2 ago', gl: g.log, t: tV, cc: '#00794F', cel: [c('Arnaldo Cantero', { punto: A }), c('Creó una cuadrilla', { punto: V }), c('Cuadrilla 7', { color: '#7A8783' }), c('Red municipal', { color: '#98A3A0' })] },
    ],
    pie: 'La traza no se edita ni se borra: es el respaldo de lo que pasó en la app.',
  },

  suscripciones: {
    eyebrow: 'SUPER ADMIN · CLIENTES', acento: V, tinte: '#F5FBF8',
    ver: '<strong>6 municipios</strong> con plan activo. <strong style="color: #B4560F;">Dos vencen este mes</strong> y uno de ellos todavía usa el plan de prueba con 3 módulos.',
    kpis: [['MUNICIPIOS', '6', '5 activos · 1 en prueba', ''], ['VENCEN ESTE MES', '2', 'renovación pendiente', A], ['FACTURACIÓN MENSUAL', '$ 8.400.000', 'suma de los planes', ''], ['MÓDULOS PROMEDIO', '6,2', 'de 8 disponibles', ''], ['EN PRUEBA', '1', 'vence en 9 días', A]],
    pista: null,
    buscar: 'Buscar municipio…', cta: 'Nueva suscripción',
    selects: [['Plan', 'Todos'], ['Estado', 'Todos']],
    chips: [['Todos', 6], ['Activos', 5], ['En prueba', 1], ['Por vencer', 2]],
    heads: [['MUNICIPIO', 'left'], ['PLAN', 'left'], ['MÓDULOS', 'right'], ['MENSUAL', 'right'], ['VENCE', 'right'], ['ACCIONES', 'right']],
    cols: 'minmax(0, 1.5fr) 132px 108px 132px 128px 104px', min: '1040px',
    filas: [
      { n: 'Municipalidad de Asunción', s: 'Paraguay Limpio', gl: g.dep, t: tV, cc: '#00794F', cel: [c('Completo', { chip: [tV, '#00794F'] }), num('8'), num('$ 2.400.000'), num('31 dic 2026', { color: '#00794F' })] },
      { n: 'Municipalidad de Luque', s: 'Luque Limpio', gl: g.dep, t: tA, cc: '#B4560F', cel: [c('Completo', { chip: [tV, '#00794F'] }), num('8'), num('$ 1.800.000'), num('en 12 d', { color: '#B4560F' })] },
      { n: 'Municipalidad de San Lorenzo', s: 'Mi San Lorenzo', gl: g.dep, t: tV, cc: '#00794F', cel: [c('Operativo', { chip: [tAZ, '#1D6FD1'] }), num('6'), num('$ 1.600.000'), num('30 jun 2027', { color: '#00794F' })] },
      { n: 'Municipalidad de Capiatá', s: 'Capiatá Responde', gl: g.dep, t: tA, cc: '#B4560F', cel: [c('Operativo', { chip: [tAZ, '#1D6FD1'] }), num('6'), num('$ 1.400.000'), num('en 21 d', { color: '#B4560F' })] },
      { n: 'Municipalidad de Areguá', s: 'Areguá Cuida', gl: g.dep, t: tV, cc: '#00794F', cel: [c('Reclamos', { chip: [tG, '#3D4945'] }), num('4'), num('$ 1.200.000'), num('30 sep 2026', { color: '#00794F' })] },
      { n: 'Municipalidad de Itauguá', s: 'sin marca definida', gl: g.dep, t: tG, cc: '#7A8783', cel: [c('Prueba', { chip: [tA, '#B4560F'] }), num('3'), num('$ 0', { color: '#98A3A0' }), num('en 9 d', { color: '#C93A3E' })] },
    ],
    pie: 'Dar de baja una suscripción no borra los datos del municipio: quedan en solo lectura.',
  },
};;

export const DESCRIPCION_AJUSTE: Record<string, string> = {
  empleados: 'Administradores, supervisores y operarios del municipio.',
  cuadrillas: 'Los equipos que salen a resolver las órdenes de trabajo.',
  ausencias: 'Licencias, vacaciones y francos del personal.',
  vecinos: 'El padrón de vecinos que usan la app y el mostrador.',
  sla: 'Cuántos días promete el municipio para resolver cada categoría.',
  dependencias: 'Las secretarías y direcciones que atienden reclamos y trámites.',
  zonas: 'Cómo se divide el municipio para repartir el trabajo.',
  inv: 'Los artículos del depósito, el corralón y el vivero.',
  cajas: 'Las cajas y fondos con los que se paga.',
  retenciones: 'Lo que se le retiene a cada pago de proveedor.',
  proyectos: 'Las obras con presupuesto propio.',
  tarjetas: 'Las tarjetas corporativas del municipio.',
  contactos: 'Proveedores y empleados a los que se les paga.',
  tasas: 'Lo que el municipio cobra y con qué cálculo.',
  pagos: 'Por dónde entran los cobros del vecino.',
  auditoria: 'Quién hizo cada cosa dentro de la app.',
  suscripciones: 'Los municipios que usan la app y el plan de cada uno.',
  'cat-reclamo': 'Lo que el vecino puede elegir cuando carga un reclamo.',
  'cat-tramite': 'Las carpetas generales de trámites: Obras, Comercio, Catastro.',
  'tipos-tramite': 'Cada trámite concreto con sus prerrequisitos.',
  'tipos-poi': 'Plazas, escuelas y paradas: dónde se ponen los carteles con QR.',
  'tipos-empleado': 'Planta, contratado o jornalero: define cómo se liquida.',
  parajes: 'Los parajes con los que se imputa cada gasto.',
  'cat-inv': 'Las familias en las que se agrupa el depósito.',
  conceptos: 'A qué partida imputa cada movimiento de dinero.',
  'conceptos-liq': 'Los conceptos con los que se arma cada liquidación.',
};;

/** Ajustes que NO son un ABM acá: viven en su módulo (ver PuenteModulo). */
export const AJUSTES_PUENTE = ['vecinos', 'inv', 'contactos', 'ausencias'];
