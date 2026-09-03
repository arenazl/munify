/**
 * canvasConfigSpec — el PROTOTIPO de Configuración, en datos.
 *
 * Copia fiel de "Configuracion.dc.html" (canvas Claude Design 46976e44): el
 * árbol de navegación de 40 pantallas, los catálogos con sus filas y los
 * "puentes" (los ajustes que se administran en otro módulo).
 *
 * Va junto con `canvasAbmSpec.ts`, que trae los 17 ABM. Entre los dos está
 * TODO el prototipo: primero se reproduce estático y navegable, se valida
 * contra el mockup, y recién después cada pantalla cambia estos datos por su
 * endpoint. El camino inverso —migrar de a una con datos reales— es el que
 * hizo que a los dos días Configuración no se pareciera al diseño.
 *
 * TODO lo de este archivo son DATOS DE MUESTRA del diseño: no es data del
 * municipio y no debe presentarse como tal.
 */
export type TipoCuerpo = 'form' | 'qr' | 'apariencia' | 'abm' | 'catalogo' | 'arbol' | 'asignacion';

export interface HijoConfig {
  id: string;
  label: string;
  tipo: TipoCuerpo;
  /** Contador del riel, ya formateado por el diseño ("3.412"). */
  n?: string;
}

export interface GrupoConfig {
  id: string;
  label: string;
  hijos: HijoConfig[];
}

export interface FilaCatalogo {
  nombre: string;
  glifo: string;
  color: string;
  desc?: string;
  /** Cuántos registros la usan. */
  uso?: number;
  /** Plazo comprometido, en horas. */
  hs?: number | null;
  prio?: number | null;
  /** Con qué otra entrada se solapa. */
  pisa?: string;
  /** Inactiva. */
  off?: boolean;
  /** Renglón chico de la fila (lo que aclara el diseño en algunos casos). */
  nota?: string;
  /** Cuántos tipos cuelgan de esta entrada (categorías de trámite). */
  tipos?: number;
  /** Datos propios de otros catálogos del prototipo. */
  [extra: string]: unknown;
}

export interface CatalogoSpec {
  nuevo: string;
  unidad: string;
  filas: FilaCatalogo[];
}

export interface PuenteSpec {
  /** Dónde vive de verdad ("Vive en Atención al vecino"). */
  alla: string;
  /** Por qué no se administra desde Configuración. */
  motivo: string;
  /** Lo que SÍ se configura acá: [label, para qué, id del ajuste]. */
  aca: [string, string, string][];
  /** Lo que se hace en el módulo. */
  allaLista: string[];
  cta: string;
  muestraTitulo: string;
  muestraNota: string;
  /** [iniciales, tinte, color, nombre, detalle, cifra] */
  muestra: [string, string, string, string, string, string][];
}

export const ARBOL_CONFIG: GrupoConfig[] = [
    { id: 'general', label: 'General', hijos: [
      { id: 'muni', label: 'Datos del municipio', tipo: 'form' },
      { id: 'qr', label: 'QR de cartelería', tipo: 'qr', n: '14' },
      { id: 'apariencia', label: 'Apariencia', tipo: 'apariencia' },
    ] },
    /* Opción 1 del reparto (decisión del dueño 2026-08-13): pestañas por
       MÓDULO de negocio + "Municipio" como transversal (estructura, derivación,
       geografía y padrón). La semántica de objeto (catálogo vs regla) ordena
       ADENTRO de cada pestaña: primero listas, después reglas. Los ids de los
       hijos NO cambian (los loaders cablean por ajusteId). */
    { id: 'municipio', label: 'Municipio', hijos: [
      { id: 'dependencias', label: 'Dependencias', tipo: 'abm', n: '11' },
      { id: 'asignacion', label: 'Asignaciones', tipo: 'asignacion', n: '11' },
      { id: 'zonas', label: 'Zonas', tipo: 'abm', n: '18' },
      { id: 'barrios', label: 'Barrios', tipo: 'abm', n: '40' },
      { id: 'parajes', label: 'Parajes', tipo: 'catalogo', n: '12' },
      { id: 'vecinos', label: 'Vecinos', tipo: 'abm', n: '3.412' },
    ] },
    { id: 'personal', label: 'Personal', hijos: [
      { id: 'empleados', label: 'Empleados', tipo: 'abm', n: '86' },
      { id: 'cuadrillas', label: 'Cuadrillas', tipo: 'abm', n: '7' },
      /* Ausencias NO va acá: la carga es OPERACIÓN (vive en GestionAusencias).
         Si algún día el tipo de ausencia se vuelve catálogo configurable, acá
         entra "Tipos de ausencia" — hoy es un string libre del modelo. */
      { id: 'tipos-empleado', label: 'Tipos de empleado', tipo: 'catalogo', n: '5' },
    ] },
    { id: 'reclamos', label: 'Reclamos', hijos: [
      { id: 'cat-reclamo', label: 'Categorías de reclamo', tipo: 'abm', n: '9' },
      { id: 'sla', label: 'SLA', tipo: 'abm', n: '9' },
      { id: 'tipos-poi', label: 'Tipos de punto de interés', tipo: 'catalogo', n: '5' },
    ] },
    { id: 'tramites', label: 'Trámites', hijos: [
      { id: 'arbol-tramite', label: 'Trámites', tipo: 'abm' },
    ] },
    { id: 'inventario', label: 'Inventario', hijos: [
      { id: 'inv', label: 'Inventario', tipo: 'abm', n: '240' },
      { id: 'cat-inv', label: 'Categorías de inventario', tipo: 'catalogo', n: '8' },
    ] },
    { id: 'tesoreria', label: 'Tesorería', hijos: [
      { id: 'conceptos', label: 'Conceptos', tipo: 'catalogo', n: '22' },
      { id: 'conceptos-liq', label: 'Conceptos de liquidación', tipo: 'catalogo', n: '9' },
      { id: 'cajas', label: 'Cajas y fondos', tipo: 'abm', n: '4' },
      { id: 'retenciones', label: 'Retenciones', tipo: 'abm', n: '6' },
      { id: 'proyectos', label: 'Proyectos', tipo: 'abm', n: '8' },
      { id: 'tarjetas', label: 'Tarjetas', tipo: 'abm', n: '3' },
      { id: 'contactos', label: 'Contactos', tipo: 'abm', n: '148' },
      { id: 'tasas', label: 'Catálogo de tasas', tipo: 'abm', n: '31' },
    ] },
    { id: 'integraciones', label: 'Integraciones', hijos: [
      { id: 'pagos', label: 'Proveedores de pago', tipo: 'abm', n: '2' },
      { id: 'wa', label: 'WhatsApp', tipo: 'form' },
      { id: 'ia', label: 'IA', tipo: 'form' },
    ] },
    { id: 'super', label: 'Super Admin', hijos: [
      { id: 'auditoria', label: 'Auditoría', tipo: 'abm' },
      { id: 'suscripciones', label: 'Suscripciones', tipo: 'abm' },
      { id: 'sidebar', label: 'Config del sidebar', tipo: 'form' },
    ] },
  ];

const g = {
    bache: 'M4 8h16v12H4zM4 8l3-4h10l3 4M9 12h6',
    luz: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3z',
    basura: 'M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1zM6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12',
    agua: 'M12 3s6 6.4 6 10.4A6 6 0 0 1 6 13.4C6 9.4 12 3 12 3z',
    arbol: 'M12 21v-5M8.5 16a4.5 4.5 0 0 1-1.4-8.4A5 5 0 0 1 17 6.6 4.5 4.5 0 0 1 15.5 16z',
    perro: 'M6.5 8 4 5.5v4M17.5 8 20 5.5v4M6.5 8v5a5.5 5.5 0 0 0 11 0V8M10 12h.01M14 12h.01',
    semaforo: 'M9 3h6v18H9zM12 7h.01M12 12h.01M12 17h.01',
    ruido: 'M11 5 6.5 9H3v6h3.5L11 19zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10',
    plaza: 'M4 20h16M6 20v-6h4v6M14 20v-9h4v9M8 8V4h8v4',
    vereda: 'M5 4h6v16H5zM13 4h6v16h-6M5 9h6M5 14h6M13 9h6M13 14h6',
    plaga: 'M12 8v9M8.5 10.5 12 8l3.5 2.5M6 13h12M7 17l2-2M17 17l-2-2M9 8 7 5M15 8l2-3',
    cono: 'M12 4 5 20h14zM8.5 14h7M4 20h16',
    cable: 'M7 4v6a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v4M5 4h4M15 4h4',
    auto: 'M4 16h16v-4l-2-4H6L4 12zM7 16v2M17 16v2M8 12h8',
    local: 'M4 9h16v11H4zM4 9l2-4h12l2 4M9 20v-6h6v6',
    obra: 'M12 4 5 20h14zM8.5 14h7',
    mapa: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
    tasa: 'M2.5 6h19v12h-19zM2.5 11h19M6 15h4',
    salud: 'M12 20s7-4.4 7-9.4A3.6 3.6 0 0 0 12 8a3.6 3.6 0 0 0-7 2.6C5 15.6 12 20 12 20z',
    doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  };
  const c = { verde: '#00B37E', ambar: '#F59E0B', azul: '#3B82F6', rojo: '#E5484D', gris: '#7A8783', violeta: '#8B5CF6' };
  
export const DATOS_CATALOGO: Record<string, CatalogoSpec> = {
    'cat-reclamo': { nuevo: 'Nueva categoría', unidad: 'reclamos', filas: [
      { nombre: 'Bacheo y calles', glifo: g.bache, color: c.ambar, uso: 97, hs: 168, prio: 3, pisa: '',
        desc: 'Deterioro de pavimento y asfalto: baches, hundimientos, pozos y roturas de calzada.' },
      { nombre: 'Alumbrado público', glifo: g.luz, color: c.ambar, uso: 62, hs: 120, prio: 3, pisa: '',
        desc: 'Luminarias apagadas o intermitentes, postes caídos, cables sueltos y zonas sin cobertura de iluminación.' },
      { nombre: 'Higiene urbana', glifo: g.basura, color: c.verde, uso: 48, hs: 72, prio: 2, pisa: 'Recolección de residuos',
        desc: 'Barrido de calles, limpieza de desagües pluviales, retiro de graffitis y cartelería.' },
      { nombre: 'Agua y cloacas', glifo: g.agua, color: c.azul, uso: 34, hs: 48, prio: 4, pisa: 'Desagües y pluviales',
        desc: 'Pérdidas de agua en vía pública, cortes de suministro y cloacas desbordadas.' },
      { nombre: 'Arbolado y espacios verdes', glifo: g.arbol, color: c.verde, uso: 26, hs: 240, prio: 2, pisa: 'Plazas y juegos',
        desc: 'Mantenimiento de plazas, parques y juegos; árboles caídos, ramas y poda.' },
      { nombre: 'Animales sueltos', glifo: g.perro, color: c.rojo, uso: 19, hs: 48, prio: 4, pisa: '',
        desc: 'Perros sueltos, animales heridos o muertos en vía pública, maltrato animal.' },
      { nombre: 'Semáforos', glifo: g.semaforo, color: c.azul, uso: 12, hs: 24, prio: 5, pisa: 'Tránsito y señalización',
        desc: 'Semáforos apagados, intermitentes o descoordinados.' },
      { nombre: 'Veredas en mal estado', glifo: g.vereda, color: c.ambar, uso: 11, hs: 168, prio: 3, pisa: '',
        desc: 'Baldosas flojas, rotas o veredas intransitables.' },
      { nombre: 'Recolección de residuos', glifo: g.basura, color: c.verde, uso: 9, hs: 48, prio: 3, pisa: 'Higiene urbana',
        desc: 'Fallas en el servicio: basura no retirada, contenedores desbordados o rotos.' },
      { nombre: 'Desagües y pluviales', glifo: g.agua, color: c.azul, uso: 7, hs: 72, prio: 4, pisa: 'Agua y cloacas',
        desc: 'Bocas de tormenta tapadas, anegamientos y agua servida en la calle.' },
      { nombre: 'Plagas y control', glifo: g.plaga, color: c.rojo, uso: 5, hs: 96, prio: 3, pisa: '',
        desc: 'Roedores, insectos, palomas y situaciones que requieran fumigación.' },
      { nombre: 'Tránsito y señalización', glifo: g.cono, color: c.rojo, uso: 4, hs: 72, prio: 3, pisa: 'Semáforos',
        desc: 'Carteles caídos, señalización borrosa y demarcación faltante.' },
      { nombre: 'Cableado suelto', glifo: g.cable, color: c.violeta, uso: 3, hs: 24, prio: 5, pisa: '',
        desc: 'Cables colgando, postes inclinados o instalaciones a la vista.' },
      { nombre: 'Estacionamiento indebido', glifo: g.auto, color: c.violeta, uso: 2, hs: 24, prio: 2, pisa: '',
        desc: 'Vehículos sobre la vereda, en rampas o en doble fila.' },
      { nombre: 'Vehículos abandonados', glifo: g.auto, color: c.violeta, uso: 1, hs: 336, prio: 1, pisa: '',
        desc: 'Autos o motos abandonados en la vía pública.' },
      { nombre: 'Plazas y juegos', glifo: g.plaza, color: c.gris, uso: 0, hs: 240, prio: 2, pisa: 'Arbolado y espacios verdes', off: true,
        desc: 'Juegos rotos, bancos dañados o plazas sin mantenimiento.' },
      { nombre: 'Ruidos y convivencia', glifo: g.ruido, color: c.gris, uso: 0, hs: 72, prio: 1, pisa: '', off: true,
        desc: 'Ruidos excesivos de viviendas, comercios, obras o vehículos.' },
    ] },
    'cat-tramite': { nuevo: 'Nueva categoría', unidad: 'tipos de trámite', filas: [
      { nombre: 'Habilitaciones Comerciales', glifo: g.local, color: c.ambar, hs: null, prio: null, pisa: '',
        desc: 'Habilitación y renovación de locales, industrias y actividades económicas.' },
      { nombre: 'Espacios Públicos', glifo: g.arbol, color: c.verde, hs: null, prio: null, pisa: '',
        desc: 'Uso de la vía pública: poda, publicidad, ferias y eventos en plazas.' },
      { nombre: 'Tasas y Tributos', glifo: g.tasa, color: c.verde, hs: null, prio: null, pisa: '',
        desc: 'Liquidación y pago de tasas municipales.' },
      { nombre: 'Certificados y Documentación', glifo: g.doc, color: c.azul, hs: null, prio: null, pisa: '',
        desc: 'Certificados que emite la municipalidad a pedido del vecino.' },
      { nombre: 'Obras Particulares', glifo: g.obra, color: c.ambar, hs: null, prio: null, pisa: '',
        desc: 'Permisos de construcción, refacción y demolición en propiedad privada.' },
      { nombre: 'Tránsito y Transporte', glifo: g.auto, color: c.violeta, hs: null, prio: null, pisa: '',
        desc: 'Licencias de conducir, remises y transporte de pasajeros.' },
      { nombre: 'Salud y Bromatología', glifo: g.salud, color: c.rojo, hs: null, prio: null, pisa: '',
        desc: 'Habilitaciones sanitarias y control de manipulación de alimentos.' },
      { nombre: 'Catastro', glifo: g.mapa, color: c.azul, hs: null, prio: null, pisa: '',
        desc: 'Datos parcelarios, certificados catastrales y cambios de titularidad.' },
    ] },
    'tipos-poi': { nuevo: 'Nuevo tipo', unidad: 'puntos', filas: [
      { nombre: 'Plaza', glifo: g.plaza, color: c.verde, uso: 34, nota: 'Con QR de cartelería' },
      { nombre: 'Escuela', glifo: g.semaforo, color: c.azul, uso: 22, nota: 'Con QR de cartelería' },
      { nombre: 'Parada de colectivo', glifo: g.luz, color: c.ambar, uso: 18, nota: 'Con QR de cartelería' },
      { nombre: 'Edificio municipal', glifo: g.bache, color: c.azul, uso: 11, nota: 'Sin QR' },
      { nombre: 'Contenedor', glifo: g.basura, color: c.gris, uso: 0, nota: 'Se define por zona, no por punto', off: true },
    ] },
    'tipos-empleado': { nuevo: 'Nuevo tipo', unidad: 'empleados', filas: [
      { nombre: 'Planta permanente', glifo: g.plaza, color: c.verde, uso: 52, nota: 'Liquidación mensual' },
      { nombre: 'Contratado', glifo: g.bache, color: c.azul, uso: 21, nota: 'Liquidación mensual' },
      { nombre: 'Jornalero', glifo: g.arbol, color: c.ambar, uso: 11, nota: 'Liquidación semanal' },
      { nombre: 'Pasante', glifo: g.luz, color: c.gris, uso: 2, nota: 'Liquidación mensual' },
      { nombre: 'Ad honorem', glifo: g.perro, color: c.gris, uso: 0, nota: 'Nunca se usó', off: true },
    ] },
    'parajes': { nuevo: 'Nuevo paraje', unidad: 'gastos', filas: [
      { nombre: 'Centro histórico', glifo: g.plaza, color: c.verde, uso: 18, nota: 'Zona 1' },
      { nombre: 'Villa Morra', glifo: g.arbol, color: c.verde, uso: 14, nota: 'Zona 2' },
      { nombre: 'Sajonia', glifo: g.agua, color: c.azul, uso: 11, nota: 'Zona 3' },
      { nombre: 'Trinidad', glifo: g.bache, color: c.ambar, uso: 7, nota: 'Zona 4' },
      { nombre: 'Tacumbú', glifo: g.basura, color: c.ambar, uso: 5, nota: 'Zona 3' },
      { nombre: 'Zeballos Cué', glifo: g.luz, color: c.gris, uso: 0, nota: 'Sin gastos imputados', off: true },
    ] },
    'cat-inv': { nuevo: 'Nueva categoría', unidad: 'artículos', filas: [
      { nombre: 'Áridos y cemento', glifo: g.bache, color: c.ambar, uso: 62, nota: 'Depósito central' },
      { nombre: 'Luminarias', glifo: g.luz, color: c.ambar, uso: 48, nota: 'Depósito central' },
      { nombre: 'Herramientas', glifo: g.plaza, color: c.verde, uso: 41, nota: 'Corralón' },
      { nombre: 'Limpieza', glifo: g.basura, color: c.verde, uso: 34, nota: 'Depósito central' },
      { nombre: 'Señalización', glifo: g.semaforo, color: c.azul, uso: 26, nota: 'Corralón' },
      { nombre: 'Riego y plantines', glifo: g.arbol, color: c.verde, uso: 19, nota: 'Vivero' },
      { nombre: 'Insumos veterinarios', glifo: g.perro, color: c.rojo, uso: 8, nota: 'Zoonosis' },
      { nombre: 'Papelería', glifo: g.plaza, color: c.gris, uso: 0, nota: 'Se compra por caja chica', off: true },
    ] },
    'conceptos': { nuevo: 'Nuevo concepto', unidad: 'movimientos', filas: [
      { nombre: 'Servicios profesionales', glifo: g.plaza, color: c.azul, uso: 34, nota: 'Egreso · imputa a Gastos' },
      { nombre: 'Insumos y materiales', glifo: g.bache, color: c.ambar, uso: 28, nota: 'Egreso · imputa a Gastos' },
      { nombre: 'Combustible', glifo: g.luz, color: c.ambar, uso: 22, nota: 'Egreso · imputa a Gastos' },
      { nombre: 'Alquileres', glifo: g.plaza, color: c.azul, uso: 14, nota: 'Egreso · pago programado' },
      { nombre: 'Tasas cobradas', glifo: g.agua, color: c.verde, uso: 11, nota: 'Ingreso · imputa a Cobros' },
      { nombre: 'Multas', glifo: g.semaforo, color: c.verde, uso: 6, nota: 'Ingreso · imputa a Cobros' },
      { nombre: 'Pagos varios', glifo: g.basura, color: c.gris, uso: 3, nota: 'Egreso · sin partida definida' },
    ] },
    'conceptos-liq': { nuevo: 'Nuevo concepto', unidad: 'liquidaciones', filas: [
      { nombre: 'Sueldo mensual', glifo: g.plaza, color: c.verde, uso: 52, nota: 'Remunerativo' },
      { nombre: 'Presentismo', glifo: g.arbol, color: c.verde, uso: 38, nota: 'Remunerativo' },
      { nombre: 'Horas extra', glifo: g.luz, color: c.ambar, uso: 24, nota: 'Remunerativo' },
      { nombre: 'Antigüedad', glifo: g.bache, color: c.azul, uso: 19, nota: 'Remunerativo' },
      { nombre: 'Adelanto', glifo: g.agua, color: c.ambar, uso: 8, nota: 'Descuento' },
      { nombre: 'Aporte jubilatorio', glifo: g.semaforo, color: c.rojo, uso: 52, nota: 'Descuento' },
    ] },
    'tipos-tramite': { nuevo: 'Nuevo tipo', unidad: 'trámites', filas: [
      { nombre: 'Habilitación de local', glifo: g.plaza, color: c.azul, uso: 22, nota: '6 pasos · requiere inspección' },
      { nombre: 'Renovación de habilitación', glifo: g.plaza, color: c.verde, uso: 18, nota: '3 pasos' },
      { nombre: 'Permiso de obra menor', glifo: g.bache, color: c.ambar, uso: 14, nota: '4 pasos · requiere plano' },
      { nombre: 'Cartel publicitario', glifo: g.semaforo, color: c.verde, uso: 9, nota: '3 pasos' },
      { nombre: 'Permiso de evento', glifo: g.ruido, color: c.verde, uso: 7, nota: '5 pasos · requiere seguro' },
      { nombre: 'Poda autorizada', glifo: g.arbol, color: c.verde, uso: 4, nota: '2 pasos' },
      { nombre: 'Baja de comercio', glifo: g.basura, color: c.gris, uso: 0, nota: 'Se hace por mostrador', off: true },
    ] },
  };

export const PUENTE_SPEC: Record<string, PuenteSpec> = {
  vecinos: {
    alla: 'Vive en Atención al vecino',
    motivo: 'El padrón se carga solo: cada reclamo nuevo da de alta al vecino. Editar 3.412 fichas desde Configuración es la forma más lenta de hacerlo.',
    aca: [
      ['Tipos de documento', 'CI, RUC o pasaporte para el mostrador', 'tipos-empleado'],
      ['Categorías de reclamo', 'lo que el vecino puede elegir al reclamar', 'cat-reclamo'],
      ['Zonas', 'de qué barrio es cada vecino', 'zonas'],
    ],
    allaLista: ['Alta, edición y bloqueo de cada vecino', 'Historial de reclamos y calificaciones', 'Fusionar fichas duplicadas'],
    cta: 'Abrir el padrón de vecinos',
    muestraTitulo: 'LOS QUE MÁS RECLAMAN', muestraNota: 'para editarlos hay que abrir el módulo',
    muestra: [
      ['MA', '#FDECEC', '#C93A3E', 'Mirta Beatriz Ayala', 'Villa Morra · CI 3.482.117', '7 reclamos · 4 abiertos'],
      ['RV', '#FDF1DF', '#B4560F', 'Ramón Villalba', 'Sajonia · CI 2.104.882', '4 reclamos · 2 abiertos'],
      ['ER', '#E7F6F0', '#00794F', 'Estela Noemí Rojas', 'Microcentro · CI 4.771.203', '3 reclamos · cerrados'],
    ],
  },
  inv: {
    alla: 'Vive en Operaciones',
    motivo: 'El stock se mueve todos los días con cada orden de trabajo. Acá se define cómo está organizado el depósito, no cuánto queda de cada cosa.',
    aca: [
      ['Categorías de inventario', 'las 8 familias en las que se agrupa', 'cat-inv'],
      ['Depósitos', 'central, corralón y vivero', 'zonas'],
    ],
    allaLista: ['Entradas, salidas y ajustes de stock', 'Alta de artículos y códigos', 'Órdenes de compra y reposición'],
    cta: 'Abrir el inventario',
    muestraTitulo: 'LO QUE ESTÁ BAJO EL MÍNIMO', muestraNota: 'reponer se hace desde el módulo',
    muestra: [
      ['LE', '#FDECEC', '#C93A3E', 'Luminaria LED 60 W', 'ART-0208 · Central', 'sin stock · mínimo 15'],
      ['CP', '#FDECEC', '#C93A3E', 'Cemento Portland 50 kg', 'ART-0114 · Central', '6 · mínimo 20'],
      ['MA', '#FDF1DF', '#B4560F', 'Mezcla asfáltica en frío', 'ART-0131 · Corralón', '18 · mínimo 18'],
    ],
  },
  contactos: {
    alla: 'Vive en Tesorería',
    motivo: 'Un contacto se crea cuando entra la primera factura y arrastra deuda, pagos y retenciones. Acá se definen las listas con las que se clasifica.',
    aca: [
      ['Conceptos', 'a qué partida imputa cada movimiento', 'conceptos'],
      ['Retenciones', 'qué se le retiene a cada tipo de contacto', 'retenciones'],
      ['Tipos de empleado', 'para los contactos que son personal', 'tipos-empleado'],
    ],
    allaLista: ['Alta y edición de proveedores y empleados', 'CBU, condición fiscal y deuda', 'Fusionar contactos con el mismo RUC'],
    cta: 'Abrir contactos de Tesorería',
    muestraTitulo: 'LOS QUE NO ENTRAN AL PAGO MASIVO', muestraNota: '23 contactos sin CBU cargado',
    muestra: [
      ['CJ', '#FDF1DF', '#B4560F', 'Consultora Jara y Asociados', 'RUC 80099117-2 · sin CBU', 'debe $ 1.600.000'],
      ['FG', '#FDF1DF', '#B4560F', 'Ferretería Guaraní S.R.L.', 'RUC 80031885-1 · sin CBU', 'debe $ 7.400.000'],
      ['LÑ', '#FDECEC', '#C93A3E', 'Limpieza Integral Ñanduti', 'RUC 80077412-9 · duplicado', 'debe $ 9.600.000'],
    ],
  },
  ausencias: {
    alla: 'Vive en la Agenda',
    motivo: 'Una ausencia es un rango de fechas que choca con otras: eso se ve en un calendario, no en una grilla. Acá se definen los motivos que se pueden elegir.',
    aca: [
      ['Motivos de ausencia', 'licencia, vacaciones, franco', 'tipos-empleado'],
      ['Cuadrillas', 'quién cubre a quién cuando falta', 'cuadrillas'],
    ],
    allaLista: ['Cargar y cerrar ausencias sobre el calendario', 'Ver los solapamientos antes de aprobar', 'Reasignar la cuadrilla del que falta'],
    cta: 'Abrir la agenda de personal',
    muestraTitulo: 'LO QUE SE SOLAPA ESTE MES', muestraNota: '14 de agosto, Servicios Públicos',
    muestra: [
      ['DC', '#FDECEC', '#C93A3E', 'Derlis Cardozo', 'Licencia médica · Higiene urbana', '12 al 16 ago'],
      ['ND', '#FDECEC', '#C93A3E', 'Nelson Duarte', 'Licencia médica · Higiene urbana', '14 al 15 ago'],
      ['PS', '#E7F6F0', '#00794F', 'Perla Sanabria', 'Vacaciones · Administración', '18 al 29 ago'],
    ],
  },
};
