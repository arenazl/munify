// @ts-nocheck
import { patchMockData } from './mockHelpers';

export class MockDataService {
  state = { padre: 'vecino', hijo: 'cat-reclamo', filtro: 'todos', vista: 'tabla', orden: false, apagados: [],
    edita: null, picker: false, unidad: 'auto', prio: null, icono: null, color: null };

  state = { padre: 'vecino', hijo: 'cat-reclamo', filtro: 'todos', vista: 'tabla', orden: false, apagados: [],
    edita: null, picker: false, unidad: 'auto', prio: null, icono: null, color: null };

  // Estructura del brief. `tipo` decide qué cuerpo entra en el tab hijo:
  // catalogo = el ABM genérico (nombre, icono, color, activo, orden),
  // form / qr = cuerpos propios, abm = el SemanticAbmPage completo.
  arbol() {
    return [
      { id: 'general', label: 'General', hijos: [
        { id: 'muni', label: 'Datos del municipio', tipo: 'form' },
        { id: 'qr', label: 'QR de cartelería', tipo: 'qr', n: '14' },
        { id: 'apariencia', label: 'Apariencia', tipo: 'apariencia' },
      ] },
      { id: 'personal', label: 'Personal', hijos: [
        { id: 'empleados', label: 'Empleados', tipo: 'abm', n: '86' },
        { id: 'cuadrillas', label: 'Cuadrillas', tipo: 'abm', n: '7' },
        { id: 'ausencias', label: 'Ausencias', tipo: 'abm', n: '12' },
      ] },
      { id: 'vecino', label: 'Atención al vecino', hijos: [
        { id: 'vecinos', label: 'Vecinos', tipo: 'abm', n: '3.412' },
        { id: 'cat-reclamo', label: 'Categorías de reclamo', tipo: 'catalogo', n: '9' },
        { id: 'arbol-tramite', label: 'Trámites', tipo: 'arbol' },
        { id: 'sla', label: 'SLA', tipo: 'abm', n: '9' },
        { id: 'tipos-poi', label: 'Tipos de punto de interés', tipo: 'catalogo', n: '5' },
      ] },
      { id: 'catalogos', label: 'Catálogos', hijos: [
        { id: 'dependencias', label: 'Dependencias', tipo: 'abm', n: '11' },
        { id: 'asignacion', label: 'Asignación', tipo: 'asignacion', n: '11' },
        { id: 'zonas', label: 'Zonas', tipo: 'abm', n: '18' },
      ] },
      { id: 'inventario', label: 'Inventario', hijos: [
        { id: 'inv', label: 'Inventario', tipo: 'abm', n: '240' },
        { id: 'cat-inv', label: 'Categorías de inventario', tipo: 'catalogo', n: '8' },
      ] },
      { id: 'tesoreria', label: 'Tesorería', hijos: [
        { id: 'conceptos-liq', label: 'Conceptos de liquidación', tipo: 'catalogo', n: '9' },
        { id: 'tipos-empleado', label: 'Tipos de empleado', tipo: 'catalogo', n: '5' },
        { id: 'cajas', label: 'Cajas y fondos', tipo: 'abm', n: '4' },
        { id: 'retenciones', label: 'Retenciones', tipo: 'abm', n: '6' },
        { id: 'parajes', label: 'Parajes', tipo: 'catalogo', n: '12' },
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
  }

  // Los 7 catálogos que el brief marca como idénticos comparten forma:
  // nombre, icono, color, activo, orden — y "en uso", que es lo que decide
  // si se puede borrar una fila o no.
  datos() {
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
    const t = { '#00B37E': '#E7F6F0', '#F59E0B': '#FDF1DF', '#3B82F6': '#E8F1FE', '#E5484D': '#FDECEC', '#7A8783': '#F3F7F5', '#8B5CF6': '#F1EBFE' };
    const base = {
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
    return this.armar(base, t, this.state.hijo);
  }

  // Permite leer un catálogo puntual sin depender del tab activo.
  datosDe(id) {
    const guardado = this.state.hijo;
    this.state.hijo = id;
    const d = this.datos();
    this.state.hijo = guardado;
    return d;
  }

  armar(base, t, cual) {
    const conf = base[cual] || { nuevo: 'Nuevo ítem', unidad: 'ítems', filas: [] };
    // Las categorías de trámite cuentan sus tipos: el uso sale de tramites(),
    // no de un literal, así el catálogo padre nunca contradice al hijo.
    if (cual === 'cat-tramite') {
      const tipos = this.tramites();
      conf.filas.forEach((f) => { f.uso = tipos.filter((x) => x.cat === f.nombre).length; });
    }
    return { nuevo: conf.nuevo, unidad: conf.unidad, tinte: t, filas: conf.filas };
  }

  // Los 10 trámites. `modo` es cómo se atiende, `pago` cuándo cobra,
  // `docs` y `checks` son la colección de prerrequisitos que enfrenta el vecino.
  tramites() {
    const g = {
      auto: 'M4 16h16v-4l-2-4H6L4 12zM7 16v2M17 16v2',
      local: 'M4 9h16v11H4zM4 9l2-4h12l2 4M9 20v-6h6v6',
      obra: 'M12 4 5 20h14zM8.5 14h7',
      mapa: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
      tasa: 'M2.5 6h19v12h-19zM2.5 11h19M6 15h4',
      salud: 'M12 20s7-4.4 7-9.4A3.6 3.6 0 0 0 12 8a3.6 3.6 0 0 0-7 2.6C5 15.6 12 20 12 20z',
      arbol: 'M12 21v-5M8.5 16a4.5 4.5 0 0 1-1.4-8.4A5 5 0 0 1 17 6.6 4.5 4.5 0 0 1 15.5 16z',
      doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
    };
    const c = { verde: '#00B37E', ambar: '#F59E0B', azul: '#3B82F6', rojo: '#E5484D', violeta: '#8B5CF6' };
    return [
      { nombre: 'Habilitación comercial', cat: 'Habilitaciones Comerciales', glifo: g.local, color: c.ambar,
        dias: 30, costo: 450000, modo: 'turno', pago: 'inicio', docs: 3, checks: 2, uso: 41 },
      { nombre: 'Renovación de habilitación', cat: 'Habilitaciones Comerciales', glifo: g.local, color: c.ambar,
        dias: 10, costo: 200000, modo: 'sinturno', pago: 'inicio', docs: 1, checks: 1, uso: 22 },
      { nombre: 'Permiso de obra menor', cat: 'Obras Particulares', glifo: g.obra, color: c.ambar,
        dias: 20, costo: 150000, modo: 'sinturno', pago: 'inicio', docs: 2, checks: 1, uso: 18 },
      { nombre: 'Certificado de libre deuda municipal', cat: 'Certificados y Documentación', glifo: g.doc, color: c.azul,
        dias: 5, costo: 60000, modo: 'turno', pago: 'inicio', docs: 2, checks: 1, uso: 34 },
      { nombre: 'Pago de tasa de recolección de residuos', cat: 'Tasas y Tributos', glifo: g.tasa, color: c.verde,
        dias: 1, costo: 0, modo: 'online', pago: 'inicio', docs: 1, checks: 0, uso: 96 },
      { nombre: 'Habilitación de transporte de alimentos', cat: 'Salud y Bromatología', glifo: g.salud, color: c.rojo,
        dias: 15, costo: 300000, modo: 'turno', pago: 'inicio', docs: 3, checks: 3, uso: 9 },
      { nombre: 'Permiso de poda de árbol', cat: 'Espacios Públicos', glifo: g.arbol, color: c.verde,
        dias: 12, costo: 0, modo: 'sinturno', pago: 'sin', docs: 2, checks: 0, uso: 14 },
      { nombre: 'Licencia de conducir', cat: 'Tránsito y Transporte', glifo: g.auto, color: c.violeta,
        dias: 7, costo: 180000, modo: 'turno', pago: 'inicio', docs: 3, checks: 4, uso: 62 },
      { nombre: 'Certificado catastral', cat: 'Catastro', glifo: g.mapa, color: c.azul,
        dias: 8, costo: 90000, modo: 'sinturno', pago: 'inicio', docs: 2, checks: 1, uso: 11 },
      { nombre: 'Permiso de publicidad en vía pública', cat: 'Espacios Públicos', glifo: g.arbol, color: c.verde,
        dias: 14, costo: 220000, modo: 'turno', pago: 'inicio', docs: 2, checks: 1, uso: 6 },
    ];
  }

  // La insignia del riel sale de la misma fuente que las filas, no de un literal:
  // así no se desfasa cuando cambian los datos.
  conteoDe(h) {
    if (h.tipo === 'catalogo') {
      const guardado = this.state.hijo;
      this.state.hijo = h.id;
      const n = this.datos().filas.length;
      this.state.hijo = guardado;
      return String(n);
    }
    if (h.tipo === 'tramites' || h.tipo === 'arbol') return String(this.tramites().length);
    if (h.tipo === 'asignacion') {
      const rep = this.reparto();
      const extra = this.state.asignadas || {};
      return String(this.catalogoReclamos().filter((x) => !(extra[x.nombre] || (rep[x.nombre] && rep[x.nombre].dep))).length);
    }
    return h.n || '';
  }

  // La cadena completa: dependencia → categoría → tipo → prerrequisitos.
  // Hoy eso vive en tres tabs separados y hay que cruzarlos de memoria.
  cadena() {
    return [
      { dep: 'Dirección de Habilitaciones', color: '#F59E0B', cats: ['Habilitaciones Comerciales'] },
      { dep: 'Secretaría de Obras Públicas', color: '#F59E0B', cats: ['Obras Particulares', 'Catastro'] },
      { dep: 'Secretaría de Hacienda', color: '#00B37E', cats: ['Tasas y Tributos', 'Certificados y Documentación'] },
      { dep: 'Dirección de Tránsito y Seguridad Vial', color: '#E5484D', cats: ['Tránsito y Transporte'] },
      { dep: 'Dirección de Salud y Bromatología', color: '#E5484D', cats: ['Salud y Bromatología'] },
      { dep: 'Secretaría de Servicios Públicos y Ambiente', color: '#00B37E', cats: ['Espacios Públicos'] },
    ];
  }

  prerequisitos() {
    return {
      'Habilitación comercial': { docs: ['Cédula del titular', 'Título de propiedad o contrato de alquiler', 'Plano del local'], checks: ['Validación de cédula', 'Verificación biométrica'] },
      'Renovación de habilitación': { docs: ['Habilitación anterior'], checks: ['Validación de cédula'] },
      'Permiso de obra menor': { docs: ['Cédula del titular', 'Croquis de la obra'], checks: ['Validación de cédula'] },
      'Certificado de libre deuda municipal': { docs: ['Cédula del titular', 'Número de cuenta municipal'], checks: ['Validación de cédula'] },
      'Pago de tasa de recolección de residuos': { docs: ['Número de cuenta municipal'], checks: [] },
      'Habilitación de transporte de alimentos': { docs: ['Cédula del titular', 'Registro del vehículo', 'Carnet de manipulación de alimentos'], checks: ['Validación de cédula', 'Verificación biométrica', 'Comprobante CENAT'] },
      'Permiso de poda de árbol': { docs: ['Cédula del titular', 'Foto del árbol'], checks: [] },
      'Licencia de conducir': { docs: ['Cédula de identidad', 'Certificado de aptitud psicofísica', 'Comprobante de curso vial'], checks: ['Validación de cédula', 'Validación facial', 'Comprobante CENAT', 'Verificación biométrica'] },
      'Certificado catastral': { docs: ['Cédula del titular', 'Número de finca'], checks: ['Validación de cédula'] },
      'Permiso de publicidad en vía pública': { docs: ['Cédula del titular', 'Diseño del cartel'], checks: ['Validación de cédula'] },
    };
  }

  guaranies(n) { return n === 0 ? 'Gratis' : '$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  // Las categorías de reclamo, sin importar en qué tab estés parado:
  // la pantalla de asignación siempre habla de ellas.
  catalogoReclamos() { return this.datosDe('cat-reclamo').filas; }

  // Las 5 dependencias del municipio y la categoría que le corresponde a cada una.
  // `dep` es lo asignado hoy; `sug` es lo que el sistema propone para las 11 huérfanas.
  dependencias() {
    return {
      'servicios': { label: 'Servicios Públicos y Ambiente', color: '#00B37E' },
      'obras': { label: 'Obras Públicas', color: '#F59E0B' },
      'transito': { label: 'Tránsito y Seguridad Vial', color: '#E5484D' },
      'zoonosis': { label: 'Zoonosis y Salud Animal', color: '#8B5CF6' },
      'seguridad': { label: 'Seguridad', color: '#3B82F6' },
    };
  }

  reparto() {
    return {
      'Plazas y juegos': { dep: 'servicios' },
      'Desagües y pluviales': { dep: 'obras' },
      'Estacionamiento indebido': { dep: 'transito' },
      'Plagas y control': { dep: 'zoonosis' },
      'Animales sueltos': { dep: 'zoonosis' },
      'Cableado suelto': { dep: 'seguridad' },
      'Semáforos': { sug: 'transito' },
      'Vehículos abandonados': { sug: 'transito' },
      'Veredas en mal estado': { sug: 'obras' },
      'Alumbrado público': { sug: 'servicios' },
      'Bacheo y calles': { sug: 'obras' },
      'Recolección de residuos': { sug: 'servicios' },
      'Higiene urbana': { sug: 'servicios' },
      'Arbolado y espacios verdes': { sug: 'servicios' },
      'Tránsito y señalización': { sug: 'transito' },
      'Agua y cloacas': { sug: 'obras' },
      'Ruidos y convivencia': { sug: 'seguridad' },
    };
  }

  // ---- Motor del ABM semántico -------------------------------------------
  // Cada entidad declara hero, pista, filtros, columnas y filas. La pantalla
  // no sabe de qué entidad se trata: arma todo desde este spec.
  miles(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  cel(texto, o) {
    o = o || {};
    return {
      texto: texto,
      esChip: !!o.chip, esTexto: !o.chip,
      chipBg: o.chip ? o.chip[0] : '', chipCol: o.chip ? o.chip[1] : '',
      hayPunto: !!o.punto, punto: o.punto || '',
      haySub: !!o.sub, sub: o.sub || '', subCol: o.subFuerte ? '#B4560F' : '#98A3A0',
      align: o.align || 'left', just: o.align === 'right' ? 'flex-end' : 'flex-start',
      peso: o.peso || 500, tam: o.tam || '12.5px',
      color: o.color || '#3D4945',
      fuente: o.sora ? 'Sora, sans-serif' : 'Inter, sans-serif',
    };
  }

  descripcion(id) {
    const D = {
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
    };
    return D[id] || '';
  }

  puenteSpec(id) {
    const P = {
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
    return P[id] || null;
  }

  abmSpec(id) {
    const V = '#00B37E', A = '#F59E0B', AZ = '#3B82F6', R = '#E5484D', VI = '#8B5CF6', CI = '#06B6D4', G = '#98A3A0';
    const tV = '#E7F6F0', tA = '#FDF1DF', tAZ = '#E8F1FE', tR = '#FDECEC', tVI = '#F1EBFE', tCI = '#E4F7FB', tG = '#F3F7F5';
    const c = (t, o) => this.cel(t, o);
    const num = (t, o) => this.cel(t, Object.assign({ align: 'right', peso: 700, tam: '13px', sora: true, color: '#0D1412' }, o || {}));
    const chipOp = ['#F3F7F5', '#3D4945'], chipAdm = [tAZ, '#1D6FD1'];
    const g = {
      dep: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6',
      zona: 'M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11zM12 8v4',
      caja: 'M3 7h18v12H3zM3 11h18M7 15h4',
      doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      caj: 'M4 8h16v12H4zM4 8l3-4h10l3 4M9 12h6',
      cuad: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.9.4 5 2.3 5 4.5',
      tar: 'M3 6h18v12H3zM3 10h18M7 14h3',
      pro: 'M4 20V6l7-3 7 3v14M4 20h16M9 20v-5h6v5',
      log: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
      reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 1.8',
      tasa: 'M9 7h6M9 12h6M9 17h3M5 3h14v18H5z',
      pago: 'M3 7h18v12H3zM7 15h2M16 11h2',
    };

    const S = {
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
        buscar: 'Buscar dependencia o responsable…', cta: 'Nueva dependencia',
        selects: [['Tipo', 'Todas'], ['Estado', 'Todos']],
        chips: [['Todas', 11], ['Con cola', 8], ['Sin trabajo', 3]],
        heads: [['DEPENDENCIA', 'left'], ['RESPONSABLE', 'left'], ['CATEGORÍAS', 'right'], ['EN COLA', 'right'], ['CUADRILLAS', 'right'], ['ACCIONES', 'right']],
        cols: 'minmax(0, 1.6fr) minmax(0, 1.2fr) 112px 104px 112px 104px', min: '1020px',
        filas: [
          { n: 'Secretaría de Servicios Públicos', s: 'Higiene, alumbrado y verde', gl: g.dep, t: tV, cc: '#00794F', cel: [c('Rocío Giménez', { punto: V }), num('6'), num('210', { color: '#C93A3E' }), num('4')] },
          { n: 'Secretaría de Obras Públicas', s: 'Bacheo, agua y cloacas', gl: g.dep, t: tA, cc: '#B4560F', cel: [c('Arnaldo Cantero', { punto: A }), num('4'), num('131')  , num('2')] },
          { n: 'Dirección de Tránsito y Seguridad Vial', s: 'Semáforos y señalización', gl: g.dep, t: tR, cc: '#C93A3E', cel: [c('Néstor Ayala', { punto: R }), num('3'), num('71'), num('1')] },
          { n: 'Dirección de Zoonosis y Bromatología', s: 'Animales y plagas', gl: g.dep, t: tVI, cc: '#6D3FD4', cel: [c('Graciela Espínola', { punto: VI }), num('2'), num('19'), num('1')] },
          { n: 'Secretaría de Seguridad', s: 'Ruidos y convivencia', gl: g.dep, t: tAZ, cc: '#1D6FD1', cel: [c('Carolina Franco', { punto: AZ }), num('1'), num('9'), num('0')] },
          { n: 'Dirección de Catastro', s: 'Sin categorías asignadas', gl: g.dep, t: tG, cc: '#7A8783', del: true, cel: [c('Sin responsable', { punto: A, color: '#B4560F' }), num('0', { color: '#98A3A0' }), num('0', { color: '#98A3A0' }), num('0', { color: '#98A3A0' })] },
        ],
        pie: 'La dependencia con reclamos en cola no se puede borrar: primero hay que reasignar sus categorías.',
      },

      zonas: {
        eyebrow: 'CATÁLOGOS · TERRITORIO', acento: AZ, tinte: '#F5F8FD',
        ver: '<strong>18 zonas</strong> cubren los 24 barrios. <strong style="color: #B4560F;">Seis barrios no están en ninguna zona</strong>: los reclamos de ahí entran sin cuadrilla asignada.',
        kpis: [['ZONAS', '18', 'sobre 24 barrios', ''], ['BARRIOS CUBIERTOS', '18', '75% del municipio', ''], ['SIN COBERTURA', '6', 'sin cuadrilla asignada', A], ['CON CUADRILLA', '13', 'de las 18 zonas', ''], ['RECLAMOS', '244', 'georreferenciados', '']],
        pista: ['LAS ZONAS SE DIBUJAN EN EL MAPA', 'Acá se editan el nombre, la cuadrilla y el estado. El polígono de cada zona se ajusta sobre el mapa, no en esta grilla.', 'Abrir el mapa de zonas'],
        buscar: 'Buscar zona o barrio…', cta: 'Nueva zona',
        selects: [['Cuadrilla', 'Todas'], ['Cobertura', 'Todas']],
        chips: [['Todas', 18], ['Con cuadrilla', 13], ['Sin cuadrilla', 5]],
        heads: [['ZONA', 'left'], ['BARRIOS', 'left'], ['CUADRILLA', 'left'], ['RECLAMOS', 'right'], ['RESUELTOS', 'right'], ['ACCIONES', 'right']],
        cols: 'minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1.1fr) 104px 112px 104px', min: '1000px',
        filas: [
          { n: 'Zona 1 · Centro', s: 'Radio céntrico', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [c('Microcentro, Catedral', { color: '#7A8783' }), c('Cuadrilla 2', { punto: CI }), num('63'), num('68%', { color: '#00794F' })] },
          { n: 'Zona 2 · Villa Morra', s: 'Corredor este', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [c('Villa Morra, Recoleta', { color: '#7A8783' }), c('Cuadrilla 4', { punto: V }), num('52'), num('54%', { color: '#00794F' })] },
          { n: 'Zona 3 · Sajonia', s: 'Franja sur', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [c('Sajonia, Tacumbú', { color: '#7A8783' }), c('Cuadrilla 1', { punto: A }), num('41'), num('38%', { color: '#B4560F' })] },
          { n: 'Zona 4 · Trinidad', s: 'Franja norte', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [c('Santísima Trinidad', { color: '#7A8783' }), c('Cuadrilla 3', { punto: A }), num('34'), num('31%', { color: '#B4560F' })] },
          { n: 'Zona 5 · Zeballos Cué', s: 'Periferia norte', gl: g.zona, t: tAZ, cc: '#1D6FD1', cel: [c('Zeballos Cué, Loma Pytã', { color: '#7A8783' }), c('Cuadrilla 6', { punto: VI }), num('22'), num('18%', { color: '#C93A3E' })] },
          { n: 'Zona 18 · Chacarita', s: 'Sin cuadrilla', gl: g.zona, t: tG, cc: '#7A8783', cel: [c('Chacarita Alta y Baja', { color: '#7A8783' }), c('Sin asignar', { punto: A, color: '#B4560F' }), num('19'), num('0%', { color: '#C93A3E' })] },
        ],
        pie: 'Borrar una zona deja sus barrios sin cobertura: los reclamos entran sin cuadrilla.',
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
    };

    const base = S[id];
    if (!base) return null;
    return base;
  }

  renderVals() {
    const acento = this.state.marca || '#00B37E';
    const contratados = String(this.props.contratados ?? 'general,personal,vecino,catalogos,inventario,tesoreria,integraciones,super')
      .split(',').map((x) => x.trim());
    const arbol = this.arbol().filter((m) => contratados.indexOf(m.id) > -1);
    const padre = arbol.filter((m) => m.id === this.state.padre)[0] || arbol[0];
    const hijos = padre ? padre.hijos : [];
    const hijo = hijos.filter((h) => h.id === this.state.hijo)[0] || hijos[0];
    const compacta = (this.props.densidad ?? 'comoda') === 'compacta';

    const d = this.datos();
    const apagados = this.state.apagados;
    const activas = d.filas.filter((f) => !(f.off || apagados.indexOf(f.nombre) > -1));
    const sinUso = d.filas.filter((f) => f.uso === 0);
    const top = d.filas.slice().sort((a, b) => b.uso - a.uso)[0];
    const f = this.state.filtro;
    const visibles = f === 'activos' ? activas
      : f === 'inactivos' ? d.filas.filter((x) => x.off || apagados.indexOf(x.nombre) > -1)
      : f === 'sinuso' ? sinUso : d.filas;

    const chip = (id, label, n) => {
      const on = f === id;
      return { label, n, ir: () => this.setState({ filtro: id }),
        bg: on ? '#FFFFFF' : '#F6F8F7', bd: on ? 'rgba(13,20,18,0.18)' : 'rgba(13,20,18,0.07)',
        col: on ? '#0D1412' : '#3D4945', sub: on ? '#5B6764' : '#98A3A0' };
    };

    const totalUso = d.filas.reduce((t, x) => t + x.uso, 0);
    const pisadas = d.filas.filter((x) => x.pisa).length;
    const pnt = hijo && hijo.tipo === 'abm' ? this.puenteSpec(hijo.id) : null;
    const spec = hijo && hijo.tipo === 'abm' && !pnt ? this.abmSpec(hijo.id) : null;
    const heroInfo = pnt ? this.abmSpec(hijo.id) : null;
    const heroCat = {
      ver: top
        ? '<strong>' + d.filas.length + ' en el catálogo, ' + activas.length + ' activas.</strong> «' + top.nombre + '» concentra ' + top.uso + ' ' + d.unidad
          + (sinUso.length ? ', y <strong style="color: #B4560F;">' + sinUso.length + ' no se usaron nunca</strong>: esas se pueden borrar.' : '.')
        : 'Todavía no hay nada cargado en este catálogo.',
      kpis: [
        ['EN EL CATÁLOGO', String(d.filas.length), 'entradas cargadas', ''],
        ['ACTIVAS', String(activas.length), 'se ofrecen al vecino', ''],
        ['SIN USAR', String(sinUso.length), sinUso.length ? 'se pueden borrar' : 'todas tienen uso', sinUso.length ? '#B4560F' : ''],
        ['MÁS USADA', top ? String(top.uso) : '—', top ? top.nombre : 'sin datos', ''],
        ['SE PISAN', String(pisadas), pisadas ? 'nombres parecidos' : 'ninguna se repite', pisadas ? '#B4560F' : ''],
      ],
    };
    const veredictoCatalogo = top
      ? React.createElement('span', { dangerouslySetInnerHTML: { __html:
          '<strong style="font-weight: 600; color: #0D1412;">' + d.filas.length + ' en el catálogo, ' + activas.length + ' activas.</strong> '
          + '«' + top.nombre + '» concentra ' + top.uso + ' de ' + totalUso + ' ' + d.unidad
          + (sinUso.length ? ', ' + sinUso.length + ' no se usaron nunca' : '')
          + (pisadas ? ' y <strong style="font-weight: 600; color: #B4560F;">' + pisadas + ' se solapan con otra</strong>: ahí el vecino elige mal y el mismo problema entra por dos lados.' : '.') } })
      : '';

    const veredictos = {
      muni: 'Lo que el vecino ve en la app y lo que sale impreso en los comprobantes. El correo de contacto todavía no está verificado.',
      qr: '14 carteles activos apuntan a este QR. Si lo regenerás, los impresos viejos dejan de funcionar.',
      apariencia: 'La foto del banner, el logo y el color con el que corre la app en este municipio. Todo se previsualiza acá antes de guardarlo.',
      wa: 'La línea de WhatsApp por la que entran reclamos y salen los avisos de estado.',
      ia: 'Clasificación automática de reclamos y redacción de respuestas al vecino.',
      sidebar: 'Qué módulos ve cada municipio y en qué orden aparecen en el menú.',
    };

    const notasAbm = {
      empleados: 'Empleados no es un catálogo: tiene legajo, foto, cuadrilla, ausencias y liquidación.',
      cuadrillas: 'Cuadrillas cruza personal con zonas y órdenes de trabajo abiertas.',
      ausencias: 'Ausencias es un calendario con solapamientos, no una lista de nombres.',
      vecinos: '3.412 vecinos con historial de reclamos y calificaciones: necesita hero, filtros y buscador.',
      sla: 'SLA define plazos por categoría y dependencia, y muestra el cumplimiento real.',
      dependencias: 'Dependencias tiene responsables, jerarquía y qué categorías atiende cada una.',
      asignacion: 'Asignación son reglas: qué cuadrilla toma qué categoría en qué zona.',
      zonas: 'Zonas se edita sobre el mapa, no en una grilla.',
      inv: '240 artículos con stock, mínimos y movimientos: es el ABM más pesado de la app.',
      cajas: 'Cajas y fondos maneja saldos y arqueos, con montos que hay que conciliar.',
      retenciones: 'Retenciones son porcentajes con vigencia y base de cálculo.',
      proyectos: 'Proyectos agrupa gastos con presupuesto y avance.',
      tarjetas: 'Tarjetas tiene cierres, vencimientos y consumos asociados.',
      contactos: '148 contactos entre proveedores y empleados, con CUIT y datos bancarios.',
      tasas: 'El catálogo de tasas tiene importes, vigencias y fórmulas de cálculo.',
      auditoria: 'Auditoría es un log con filtros por usuario, fecha y entidad.',
      suscripciones: 'Suscripciones maneja el plan de cada municipio y su facturación.',
      pagos: 'Cada proveedor de pago tiene credenciales, comisiones y estado de conexión.',
    };

    const cols = compacta
      ? 'minmax(210px, 2fr) 96px 72px 100px'
      : 'minmax(220px, 2fr) 100px 76px 104px';

    const ed = d.filas.filter((x) => x.nombre === this.state.edita)[0];
    const edPrio = ed ? (this.state.prio || ed.prio) : 3;
    const edGlifo = ed ? (this.state.icono || ed.glifo) : '';
    const edColor = ed ? (this.state.color || ed.color) : '#00B37E';
    const enDias = ed ? (this.state.unidad === 'auto' ? ed.hs % 24 === 0 : this.state.unidad === 'dias') : true;
    const etiquetas = ['muy baja', 'baja', 'media', 'alta', 'urgente'];
    const tonoPrio = (n) => (n >= 4 ? '#E5484D' : n === 3 ? '#F59E0B' : '#00B37E');
    const paleta = [
      { nombre: 'Verde', hex: '#00B37E' }, { nombre: 'Ámbar', hex: '#F59E0B' }, { nombre: 'Azul', hex: '#3B82F6' },
      { nombre: 'Rojo', hex: '#E5484D' }, { nombre: 'Violeta', hex: '#8B5CF6' }, { nombre: 'Gris', hex: '#7A8783' },
    ];
    const glifos = d.filas.map((x) => x.glifo).filter((x, i, a) => a.indexOf(x) === i);

    // --- Asignación de categorías a dependencias ---
    const deps = this.dependencias();
    const rep = this.reparto();
    // La asignación tiene dos lados: categorías de reclamo y categorías de trámite.
    const ladoAsig = this.state.ladoAsig || 'reclamos';
    const tiposTram = this.tramites();
    const catsTram = this.cadena().reduce((acc, rama) => acc.concat(rama.cats.map((c) => ({
      nombre: c, glifo: 'M4 7h6l2 2h8v9H4z', color: rama.color, uso: tiposTram.filter((t) => t.cat === c).length, dep: rama.dep,
    }))), []);
    const catsRec = ladoAsig === 'tramites' ? catsTram : this.catalogoReclamos();
    const asignadasExtra = this.state.asignadas || {};
    const depsTram = {};
    catsTram.forEach((c) => { depsTram[c.nombre] = c.dep; });
    const depDe = (nombre) => {
      if (asignadasExtra[nombre]) return asignadasExtra[nombre];
      if (ladoAsig === 'tramites') return depsTram[nombre] ? 'tram:' + depsTram[nombre] : null;
      return (rep[nombre] && rep[nombre].dep) || null;
    };
    const sugDe = (nombre) => (rep[nombre] && rep[nombre].sug) || null;
    const huerfanas = catsRec.filter((x) => !depDe(x.nombre));
    const cubiertas = catsRec.filter((x) => depDe(x.nombre));
    const enRiesgo = huerfanas.reduce((t, x) => t + x.uso, 0);
    const totalRec = catsRec.reduce((t, x) => t + x.uso, 0);
    const fa = this.state.filtroAsig || 'sin';
    const visiblesAsig = fa === 'sin' ? huerfanas : fa === 'con' ? cubiertas : catsRec;

    const filaAsig = (x) => {
      const id = depDe(x.nombre);
      const sug = sugDe(x.nombre);
      return {
        nombre: x.nombre, glifo: x.glifo, color: x.color, tinte: d.tinte[x.color] || '#F3F7F5',
        uso: x.uso === 0 ? '—' : String(x.uso),
        usoNota: ladoAsig === 'tramites'
          ? (x.uso === 1 ? 'tipo' : 'tipos')
          : (x.uso === 0 ? 'sin usar' : x.uso === 1 ? 'histórico' : 'históricos'),
        tituloAplicar: sug ? 'Asignar a ' + deps[sug].label : 'Elegir dependencia',
        sugerida: sug ? 'Asignar a ' + deps[sug].label : 'Elegir dependencia',
        usoCol: x.uso === 0 ? '#98A3A0' : (!id && x.uso > 20 ? '#C93A3E' : '#0D1412'),
        asignada: !!id, sinAsignar: !id,
        dep: id ? (deps[id] ? deps[id].label : id.replace(/^tram:/, '')) : '',
        depColor: id ? (deps[id] ? deps[id].color : '#00B37E') : '#C6CFCB',

        aplicar: () => { if (!sug) return; this.setState((st) => ({ asignadas: Object.assign({}, st.asignadas, { [x.nombre]: sug }) })); },
        quitar: () => this.setState((st) => {
          const n = Object.assign({}, st.asignadas);
          n[x.nombre] = null;
          return { asignadas: n };
        }),
      };
    };

    const chipAsig = (id, label, n, punto) => {
      const on = fa === id;
      return { label, n, punto, ir: () => this.setState({ filtroAsig: id }),
        bg: on ? '#FFFFFF' : '#F6F8F7', bd: on ? 'rgba(13,20,18,0.18)' : 'rgba(13,20,18,0.07)',
        col: on ? '#0D1412' : '#3D4945', sub: on ? '#5B6764' : '#98A3A0' };
    };

    // --- Trámites ---
    const tram = this.tramites();
    const modos = {
      online: { label: '100% online', bg: '#E7F6F0', col: '#00794F', glifo: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 9h17M3.5 15h17M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18' },
      turno: { label: 'Con turno', bg: '#E8F1FE', col: '#1D6FD1', glifo: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4' },
      sinturno: { label: 'Sin turno, hay que ir', bg: '#FDECEC', col: '#C93A3E', glifo: 'M9 8.5a3 3 0 1 0 6 0 3 3 0 0 0-6 0M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7' },
    };
    const ft = this.state.filtroTram || 'todos';
    const online = tram.filter((t) => t.modo === 'online');
    const presencial = tram.filter((t) => t.modo !== 'online');
    const pesados = tram.filter((t) => t.docs >= 3);
    const visiblesTram = ft === 'online' ? online : ft === 'presencial' ? presencial : ft === 'pesados' ? pesados : tram;
    const chipTram = (id, label, n, punto) => {
      const on = ft === id;
      return { label, n, punto, ir: () => this.setState({ filtroTram: id }),
        bg: on ? '#FFFFFF' : '#F6F8F7', bd: on ? 'rgba(13,20,18,0.18)' : 'rgba(13,20,18,0.07)',
        col: on ? '#0D1412' : '#3D4945', sub: on ? '#5B6764' : '#98A3A0' };
    };
    const cobraAntes = tram.filter((t) => t.pago === 'inicio' && t.costo > 0).length;

    // --- Árbol dependencia → categoría → tipo → prerrequisitos ---
    const abiertos = this.state.abiertosArbol || { 'Tránsito y Transporte': true, 'Licencia de conducir': true };
    const todo = this.state.abiertoArbol === 'todo';
    const abierto = (k) => todo || !!abiertos[k];
    const alternar = (k) => () => this.setState((st) => {
      const n = Object.assign({}, st.abiertosArbol || abiertos);
      n[k] = !n[k];
      return { abiertosArbol: n, abiertoArbol: null };
    });
    const pre = this.prerequisitos();
    const gDep = 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M9 11h.01M15 11h.01';
    const gCat = 'M4 7h6l2 2h8v9H4z';
    const nodos = [];
    this.cadena().forEach((rama) => {
      const tiposDep = tram.filter((t) => rama.cats.indexOf(t.cat) > -1);
      nodos.push({
        label: rama.dep, glifo: gDep, color: rama.color, tinte: d.tinte[rama.color] || '#F3F7F5',
        sangria: '14px', padding: '12px 18px 12px 14px', bg: '#F3F6F5', bgHover: '#EDF1EF', cursor: 'pointer',
        esNodo: true, esAgregar: false,
        fuente: 'Sora, sans-serif', tamano: '13.5px', peso: 700, tracking: '-0.015em', colorTexto: '#0D1412',
        iconoCaja: '30px', iconoSvg: '16px',
        chev: abierto(rama.dep) ? 'rotate(90deg)' : 'rotate(0deg)', opChev: 1,
        tieneSub: true, sub: rama.cats.length + (rama.cats.length === 1 ? ' categoría · ' : ' categorías · ') + tiposDep.length + (tiposDep.length === 1 ? ' trámite' : ' trámites'),
        tieneChip: false, tieneMonto: false, tieneAcciones: true, esReq: false,
        toggle: alternar(rama.dep),
      });
      if (!abierto(rama.dep)) return;
      rama.cats.forEach((cat) => {
        const tiposCat = tram.filter((t) => t.cat === cat);
        nodos.push({
          label: cat, glifo: gCat, color: '#7A8783', tinte: '#F3F7F5',
          sangria: '40px', padding: '10px 18px', bg: '#FFFFFF', bgHover: '#FAFBFA', cursor: 'pointer',
          esNodo: true, esAgregar: false,
          fuente: 'Inter, sans-serif', tamano: '13px', peso: 600, tracking: '0', colorTexto: '#3D4945',
          iconoCaja: '26px', iconoSvg: '14px',
          chev: abierto(cat) ? 'rotate(90deg)' : 'rotate(0deg)', opChev: 1,
          tieneSub: false, tieneChip: true, chip: tiposCat.length + (tiposCat.length === 1 ? ' trámite' : ' trámites'),
          chipBg: '#EDF1EF', chipCol: '#5B6764', chipGlifo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
          tieneMonto: false, tieneAcciones: true, esReq: false,
          toggle: alternar(cat),
        });
        if (!abierto(cat)) return;
        tiposCat.forEach((t) => {
          const m = modos[t.modo];
          const p = pre[t.nombre] || { docs: [], checks: [] };
          nodos.push({
            label: t.nombre, glifo: t.glifo, color: t.color, tinte: d.tinte[t.color] || '#F3F7F5',
            sangria: '46px', padding: '11px 18px', bg: '#FFFFFF', bgHover: '#FAFBFA', cursor: 'pointer',
            esNodo: true, esAgregar: false,
            fuente: 'Inter, sans-serif', tamano: '13px', peso: 600, tracking: '0', colorTexto: '#0D1412',
            iconoCaja: '28px', iconoSvg: '15px',
            chev: abierto(t.nombre) ? 'rotate(90deg)' : 'rotate(0deg)', opChev: 1,
            tieneSub: true, sub: p.docs.length + (p.docs.length === 1 ? ' documento' : ' documentos') + (p.checks.length ? ' · ' + p.checks.length + (p.checks.length === 1 ? ' validación' : ' validaciones') : ' · sin validaciones'),
            tieneChip: true, chip: m.label, chipBg: m.bg, chipCol: m.col, chipGlifo: m.glifo,
            tieneMonto: true, monto: this.guaranies(t.costo), montoCol: t.costo === 0 ? '#00794F' : '#0D1412',
            montoNota: t.dias === 1 ? 'en 1 día' : 'en ' + t.dias + ' días',
            tieneAcciones: true,
            colBorrar: t.uso === 0 ? '#C93A3E' : '#D5DDDA',
            opBorrar: t.uso === 0 ? 1 : 0.5,
            cursorBorrar: t.uso === 0 ? 'pointer' : 'not-allowed',
            tituloBorrar: t.uso === 0 ? 'Borrar' : 'No se puede borrar: lo iniciaron ' + t.uso + ' vecinos',
            esReq: abierto(t.nombre), sangriaReq: '46px',
            docs: p.docs.map((x, i) => ({ label: x, nota: i === 0 ? 'obligatorio' : 'obligatorio', col: '#B4560F' })),
            checks: p.checks.length ? p.checks.map((x) => ({ label: x, bg: '#00B37E', tickCol: '#FFFFFF', col: '#3D4945' }))
              : [{ label: 'No pide validación de identidad', bg: '#EDF1EF', tickCol: '#C6CFCB', col: '#98A3A0' }],
            resumenReq: 'El vecino tiene que juntar ' + p.docs.length + (p.docs.length === 1 ? ' documento' : ' documentos')
              + (p.checks.length ? ' y pasar ' + p.checks.length + (p.checks.length === 1 ? ' validación' : ' validaciones') : '')
              + ' antes de poder iniciarlo.',
            toggle: alternar(t.nombre),
          });
        });
        nodos.push({ esNodo: false, esAgregar: true, label: 'Nuevo trámite en ' + cat, sangria: '66px' });
      });
      nodos.push({ esNodo: false, esAgregar: true, label: 'Nueva categoría en ' + rama.dep.replace(/^(Secretaría|Dirección) de /, ''), sangria: '40px' });
    });

    const gruposAsig = [];
    const gSin = visiblesAsig.filter((x) => !depDe(x.nombre));
    const gCon = visiblesAsig.filter((x) => depDe(x.nombre));
    if (gSin.length) gruposAsig.push({
      titulo: 'SIN DEPENDENCIA', bg: '#FDF4F4', punto: '#E5484D', col: '#C93A3E',
      detalle: 'los reclamos que entren por acá no se asignan a nadie',
      filas: gSin.slice().sort((a, b) => b.uso - a.uso).map(filaAsig),
    });
    if (gCon.length) gruposAsig.push({
      titulo: 'YA TIENEN DUEÑO', bg: '#F3F6F5', punto: '#00B37E', col: '#00794F',
      detalle: gCon.length + ' de ' + catsRec.length + ' categorías',
      filas: gCon.slice().sort((a, b) => b.uso - a.uso).map(filaAsig),
    });

    return {
      sinSalto: (e) => { if (e && e.preventDefault) e.preventDefault(); },
      arbol: nodos,
      hayCta: (!!spec && !pnt) || !!hijo && (hijo.tipo === 'catalogo' || hijo.tipo === 'arbol'),
      pieArbol: 'Los dos catálogos anidados: cada categoría con sus tipos, y cada tipo con lo que le pide al vecino.',
      expandirTodo: () => this.setState((st) => ({ abiertoArbol: st.abiertoArbol === 'todo' ? null : 'todo' })),
      labelExpandir: this.state.abiertoArbol === 'todo' ? 'Colapsar todo' : 'Expandir todo',
      glifoExpandir: this.state.abiertoArbol === 'todo' ? 'M8 4v16M16 4v16M4 8h16M4 16h16' : 'M12 5v14M5 12h14',
      filasTram: visiblesTram.map((t) => {
        const m = modos[t.modo];
        return {
          nombre: t.nombre, cat: t.cat, glifo: t.glifo, color: t.color, tinte: d.tinte[t.color] || '#F3F7F5',
          costo: this.guaranies(t.costo),
          costoCol: t.costo === 0 ? '#00794F' : '#0D1412',
          plazo: t.dias === 1 ? 'en 1 día' : 'en ' + t.dias + ' días',
          modo: m.label, modoBg: m.bg, modoCol: m.col, modoGlifo: m.glifo,
          requisitos: t.docs + (t.docs === 1 ? ' documento' : ' documentos') + (t.checks ? ' · ' + t.checks + ' validaciones' : ''),
          uso: String(t.uso), usoNota: 'este año',
          usoCol: t.uso === 0 ? '#98A3A0' : '#0D1412',
          editar: () => this.setState({ editaTram: t.nombre }),
          colBorrar: t.uso === 0 ? '#C93A3E' : '#D5DDDA',
          opBorrar: t.uso === 0 ? 1 : 0.5,
          cursorBorrar: t.uso === 0 ? 'pointer' : 'not-allowed',
          tituloBorrar: t.uso === 0 ? 'Borrar' : 'No se puede borrar: lo iniciaron ' + t.uso + ' vecinos',
        };
      }),
      chipsTram: [
        chipTram('todos', 'Todos', tram.length, '#C6CFCB'),
        chipTram('presencial', 'Obligan a ir', presencial.length, '#E5484D'),
        chipTram('online', 'Se hacen online', online.length, '#00B37E'),
        chipTram('pesados', 'Piden 3 o más papeles', pesados.length, '#F59E0B'),
      ],
      resumenTram: visiblesTram.length + ' de ' + tram.length + ' trámites',
      pieTram: 'Un trámite con pago al inicio cobra antes de que la municipalidad lo apruebe: si se rechaza, hay que devolver la plata.',
      colUsoAsig: ladoAsig === 'tramites' ? 'TIPOS' : 'RECLAMOS',
      acento: acento,
      temas: [
        { id: 'oscuro', nombre: 'Oscuro', lienzo: '#141B19', barra: '#0C1211', linea: 'rgba(255,255,255,0.22)' },
        { id: 'gris', nombre: 'Gris', lienzo: '#2A302E', barra: '#1E2422', linea: 'rgba(255,255,255,0.24)' },
        { id: 'azul', nombre: 'Azul', lienzo: '#141C2E', barra: '#0E1524', linea: 'rgba(255,255,255,0.22)' },
        { id: 'claro', nombre: 'Claro', lienzo: '#F6F8FA', barra: '#E6EBF0', linea: 'rgba(13,20,18,0.16)' },
        { id: 'marfil', nombre: 'Marfil', lienzo: '#FBF9F5', barra: '#F1EDE4', linea: 'rgba(13,20,18,0.14)' },
      ].map((t) => {
        const on = (this.state.tema || 'claro') === t.id;
        return { nombre: t.nombre, lienzo: t.lienzo, barra: t.barra, linea: t.linea,
          elegir: () => this.setState({ tema: t.id }),
          borde: on ? acento : 'rgba(13,20,18,0.10)',
          fondoCard: on ? '#F7FCFA' : '#FFFFFF',
          peso: on ? 600 : 500, color: on ? '#0D1412' : '#5B6764', tick: on ? 1 : 0 };
      }),
      acentos: [
        { nombre: 'Verde Paraguay Limpio', hex: '#00B37E' },
        { nombre: 'Verde esmeralda', hex: '#0E9F6E' },
        { nombre: 'Azul Munify', hex: '#3B82F6' },
        { nombre: 'Índigo', hex: '#5B5BD6' },
        { nombre: 'Bordó', hex: '#B4234A' },
        { nombre: 'Lima NúcleoCheck', hex: '#A8CE1D' },
      ].map((a) => {
        const on = acento === a.hex;
        return { nombre: a.nombre, hex: a.hex, elegir: () => this.setState({ marca: a.hex }),
          tick: on ? 1 : 0, anillo: on ? '2px' : '0px', borde: on ? '4px' : '0px' };
      }),
      nombreAcento: ({ '#00B37E': 'Verde Paraguay Limpio', '#0E9F6E': 'Verde esmeralda', '#3B82F6': 'Azul Munify', '#5B5BD6': 'Índigo', '#B4234A': 'Bordó', '#A8CE1D': 'Lima NúcleoCheck' })[acento] || 'Personalizado',
      barras: [
        { id: 'organico', nombre: 'Orgánico' },
        { id: 'tinte', nombre: 'Tinte' },
        { id: 'claro', nombre: 'Claro' },
      ].map((b) => {
        const on = (this.state.barra || 'organico') === b.id;
        const lienzo = b.id === 'organico' ? 'linear-gradient(160deg, ' + acento + '14 0%, #FFFFFF 78%)'
          : b.id === 'tinte' ? acento + '2E' : '#FFFFFF';
        return { nombre: b.nombre, lienzo: lienzo,
          textoAlto: 'rgba(13,20,18,0.42)', textoBajo: 'rgba(13,20,18,0.20)',
          elegir: () => this.setState({ barra: b.id }),
          borde: on ? acento : 'rgba(13,20,18,0.10)',
          fondoCard: on ? '#F7FCFA' : '#FFFFFF',
          peso: on ? 600 : 500, color: on ? '#0D1412' : '#5B6764', tick: on ? 1 : 0 };
      }),
      marcaHex: this.state.marca || '#00B37E',
      veloMarca: this.state.marca || '#00B37E',
      notaTinte: (this.state.tinte == null ? 0.35 : this.state.tinte) >= 0.9
        ? 'Al 100% la foto casi no se ve: conviene Suave o Medio'
        : 'Tiñe la foto con el color del municipio',
      notaMarca: 'Cada acento viene con su fondo: el gris de la app se tiñe apenas hacia el color de marca',
      sinBanner: (e) => { if (e && e.preventDefault) e.preventDefault(); },
      tabsAsig: [
        { label: 'Reclamos', n: this.catalogoReclamos().length, ir: () => this.setState({ ladoAsig: 'reclamos', filtroAsig: 'sin' }),
          glifo: 'M5 4h14v17H5zM9 4h6v3H9zM9 12h6M9 16h4',
          bg: ladoAsig === 'reclamos' ? '#FFFFFF' : 'transparent',
          sombra: ladoAsig === 'reclamos' ? '0 1px 2px rgba(13,20,18,0.06)' : 'none',
          col: ladoAsig === 'reclamos' ? '#0D1412' : '#7A8783',
          sub: ladoAsig === 'reclamos' ? '#00794F' : '#B4BDBA' },
        { label: 'Trámites', n: catsTram.length, ir: () => this.setState({ ladoAsig: 'tramites', filtroAsig: 'todas' }),
          glifo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
          bg: ladoAsig === 'tramites' ? '#FFFFFF' : 'transparent',
          sombra: ladoAsig === 'tramites' ? '0 1px 2px rgba(13,20,18,0.06)' : 'none',
          col: ladoAsig === 'tramites' ? '#0D1412' : '#7A8783',
          sub: ladoAsig === 'tramites' ? '#00794F' : '#B4BDBA' },
      ],
      gruposAsig: gruposAsig,
      chipsAsig: [
        chipAsig('sin', 'Sin asignar', huerfanas.length, '#E5484D'),
        chipAsig('con', 'Asignadas', cubiertas.length, '#00B37E'),
        chipAsig('todas', 'Todas', catsRec.length, '#C6CFCB'),
      ],
      resumenAsig: visiblesAsig.length + ' de ' + catsRec.length + ' categorías',
      haySugerencias: huerfanas.filter((x) => sugDe(x.nombre)).length > 0,
      labelSugerencias: 'Aplicar las ' + huerfanas.filter((x) => sugDe(x.nombre)).length + ' sugerencias',
      aplicarTodas: () => this.setState((st) => {
        const n = Object.assign({}, st.asignadas);
        huerfanas.forEach((x) => { const sug = sugDe(x.nombre); if (sug) n[x.nombre] = sug; });
        return { asignadas: n };
      }),
      pieAsig: huerfanas.length
        ? 'Una categoría sin dependencia entra a la cola sin dueño: alguien la tiene que derivar a mano.'
        : 'Todas las categorías tienen dependencia: los ' + (ladoAsig === 'tramites' ? 'trámites' : 'reclamos') + ' se derivan solos al entrar.',
      veredictoAsig: React.createElement('span', { dangerouslySetInnerHTML: { __html:
        huerfanas.length
          ? '<strong style="font-weight: 600; color: #C93A3E;">' + huerfanas.length + ' de ' + catsRec.length + ' categorías no tienen dependencia.</strong> '
            + 'Por esas entraron <strong style="font-weight: 600; color: #0D1412;">' + enRiesgo + ' de los ' + totalRec + ' reclamos</strong> históricos, y cada uno hubo que derivarlo a mano.'
          : '<strong style="font-weight: 600; color: #00794F;">Las ' + catsRec.length + ' categorías tienen dependencia.</strong> '
            + 'Todo reclamo que entra se deriva solo, sin que nadie lo toque.' } }),
      esAsignacionVals: true,
      editando: !!ed,
      cerrarEdicion: () => this.setState({ edita: null, picker: false }),
      edNombre: ed ? ed.nombre : '',
      edSubtitulo: ed ? 'Categoría de reclamo · orden ' + (d.filas.indexOf(ed) + 1) : '',
      edDesc: ed ? ed.desc : '',
      edGlifo: edGlifo,
      edColor: edColor,
      edTinte: d.tinte[edColor] || '#F3F7F5',
      edSePisa: !!(ed && ed.pisa),
      edPisa: ed ? ed.pisa : '',
      togglePicker: () => this.setState((st) => ({ picker: !st.picker })),
      labelPicker: this.state.picker ? 'Listo' : 'Cambiar',
      grPicker: this.state.picker ? '1fr' : '0fr',
      opPicker: this.state.picker ? 1 : 0,
      iconos: glifos.map((gl) => ({
        glifo: gl, elegir: () => this.setState({ icono: gl }),
        bg: gl === edGlifo ? (d.tinte[edColor] || '#F3F7F5') : '#FFFFFF',
        bd: gl === edGlifo ? edColor : 'rgba(13,20,18,0.10)',
        color: gl === edGlifo ? edColor : '#7A8783',
      })),
      colores: paleta.map((p) => ({
        nombre: p.nombre, hex: p.hex, elegir: () => this.setState({ color: p.hex }),
        tick: p.hex === edColor ? 1 : 0,
        anillo: p.hex === edColor ? '2px' : '0px',
        borde: p.hex === edColor ? '4px' : '0px',
      })),
      edPlazoValor: ed ? (enDias ? String(Math.round(ed.hs / 24)) : String(ed.hs)) : '',
      enHoras: () => this.setState({ unidad: 'horas' }),
      enDias: () => this.setState({ unidad: 'dias' }),
      bgHoras: !enDias ? '#FFFFFF' : 'transparent',
      shHoras: !enDias ? '0 1px 2px rgba(13,20,18,0.06)' : 'none',
      colHoras: !enDias ? '#0D1412' : '#7A8783',
      bgDias: enDias ? '#FFFFFF' : 'transparent',
      shDias: enDias ? '0 1px 2px rgba(13,20,18,0.06)' : 'none',
      colDias: enDias ? '#0D1412' : '#7A8783',
      edPlazoNota: ed ? (enDias ? 'son ' + ed.hs + ' horas' : 'son ' + (ed.hs / 24) + ' días') : '',
      prioridades: [1, 2, 3, 4, 5].map((n) => ({
        n: String(n), label: etiquetas[n - 1], elegir: () => this.setState({ prio: n }),
        bg: n === edPrio ? (tonoPrio(n) === '#E5484D' ? '#FDECEC' : tonoPrio(n) === '#F59E0B' ? '#FDF1DF' : '#E7F6F0') : '#FFFFFF',
        bd: n === edPrio ? tonoPrio(n) : 'rgba(13,20,18,0.10)',
        col: n === edPrio ? tonoPrio(n) : '#7A8783',
        colSub: n === edPrio ? tonoPrio(n) : '#B4BDBA',
      })),
      edPrioNota: edPrio >= 4
        ? 'Con prioridad ' + edPrio + ' el reclamo entra directo a Urgentes y aparece arriba en la cola del supervisor.'
        : 'Define en qué orden lo ve el supervisor. Recién en 4 o 5 el reclamo entra a Urgentes.',
      edOrden: ed ? String(d.filas.indexOf(ed) + 1) : '',
      edOrdenNota: ed ? 'Aparece ' + (d.filas.indexOf(ed) === 0 ? 'primera' : 'en la posición ' + (d.filas.indexOf(ed) + 1)) + ' cuando el vecino elige categoría' : '',
      edUsoTexto: ed ? (ed.uso === 0
        ? 'Nunca se usó: se puede borrar sin afectar reclamos.'
        : 'La usan ' + ed.uso + ' reclamos. No se puede borrar; si cambiás el plazo, solo aplica a los nuevos.') : '',
      edUsoCol: ed && ed.uso === 0 ? '#7A8783' : '#8A6410',
      edUsoBg: ed && ed.uso === 0 ? '#F3F7F5' : '#FDF8EE',
      edUsoGlifo: ed && ed.uso === 0
        ? 'M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1zM6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12'
        : 'M12 8v5M12 17h.01',
      padres: arbol.map((m) => {
        const on = padre && m.id === padre.id;
        return { label: m.label, n: m.hijos.length, ir: () => this.setState({ padre: m.id, hijo: m.hijos[0].id, filtro: 'todos' }),
          linea: on ? '#00B37E' : 'transparent', peso: on ? 600 : 500,
          color: on ? '#0D1412' : '#5B6764', subColor: on ? '#00794F' : '#B4BDBA' };
      }),
      tituloRiel: padre ? padre.label.toUpperCase() : '',
      hijos: hijos.map((h) => {
        const sp = h.tipo === 'abm' ? this.abmSpec(h.id) : null;
        const nSpec = sp ? this.miles(sp.chips[0][1]) : '';
        const on = hijo && h.id === hijo.id;
        return { label: h.label, n: nSpec || this.conteoDe(h), ir: () => this.setState({ hijo: h.id, filtro: 'todos' }),
          bg: on ? '#E7F6F0' : 'transparent', bgHover: on ? '#E7F6F0' : '#EAEEEC',
          peso: on ? 600 : 500, color: on ? '#00794F' : '#3D4945', subColor: on ? '#4FB894' : '#B4BDBA' };
      }),
      tituloHijo: hijo ? hijo.label : '',
      esCatalogo: !!hijo && hijo.tipo === 'catalogo',
      esForm: !!hijo && hijo.tipo === 'form',
      esQr: !!hijo && hijo.tipo === 'qr',
      esApariencia: !!hijo && hijo.tipo === 'apariencia',
      esAsignacion: !!hijo && hijo.tipo === 'asignacion',
      esTramites: !!hijo && hijo.tipo === 'tramites',
      esArbol: !!hijo && hijo.tipo === 'arbol',
      esPuente: !!pnt,
      puenteTituloAlla: pnt ? pnt.alla : '',
      puenteMotivo: pnt ? pnt.motivo : '',
      puenteCta: pnt ? pnt.cta : '',
      puenteAca: pnt ? pnt.aca.map((x) => ({ label: x[0], nota: x[1], ir: () => this.setState({ hijo: x[2], filtro: 'todos', chipAbm: 0 }) })) : [],
      puenteAlla: pnt ? pnt.allaLista.map((x) => ({ label: x })) : [],
      puenteMuestraTitulo: pnt ? pnt.muestraTitulo : '',
      puenteMuestraNota: pnt ? pnt.muestraNota : '',
      puenteMuestra: pnt ? pnt.muestra.map((m) => ({ iniciales: m[0], tinte: m[1], colorIcono: m[2], nombre: m[3], sub: m[4], dato: m[5], radio: '999px' })) : [],

      // ---- Hero, pista y grilla del ABM -----------------------------------
      hayHero: !!(hijo && (hijo.tipo === 'catalogo' || hijo.tipo === 'abm')),
      heroEyebrow: (spec || heroInfo) ? (spec || heroInfo).eyebrow : (padre ? padre.label.toUpperCase() + ' · CATÁLOGO' : ''),
      heroAcento: (spec || heroInfo) ? (spec || heroInfo).acento : '#00B37E',
      heroTinte: (spec || heroInfo) ? (spec || heroInfo).tinte : '#F5FBF8',
      heroVeredicto: React.createElement('span', { dangerouslySetInnerHTML: { __html: (spec || heroInfo) ? (spec || heroInfo).ver : heroCat.ver } }),
      nKpis: ((spec || heroInfo) ? (spec || heroInfo).kpis : heroCat.kpis).length,
      heroKpis: ((spec || heroInfo) ? (spec || heroInfo).kpis : heroCat.kpis).map((k, i) => ({
        label: k[0], valor: k[1], nota: k[2],
        color: k[3] || '#0D1412',
        pad: i === 0 ? '0px' : '18px',
        linea: i === 0 ? 'transparent' : 'rgba(13,20,18,0.08)',
      })),
      hayPista: !!(spec && spec.pista),
      pistaTitulo: spec && spec.pista ? spec.pista[0] : '',
      pistaTexto: spec && spec.pista ? spec.pista[1] : '',
      pistaCta: spec && spec.pista ? spec.pista[2] : '',

      buscarCat: 'Buscar en el catálogo…',
      filtrosSelect: spec ? spec.selects.map((x) => ({ label: x[0], valor: x[1] })) : [],
      abmBuscar: spec ? spec.buscar : '',
      abmSelects: spec ? spec.selects.map((x) => ({ label: x[0], valor: x[1] })) : [],
      hayEdicion: !spec || spec.modo !== 'lectura',
      abmChips: spec ? spec.chips.map((x, i) => {
        const on = (this.state.chipAbm || 0) === i;
        return { label: x[0], n: this.miles(x[1]), ir: () => this.setState({ chipAbm: i }),
          bg: on ? '#FFFFFF' : '#F6F8F7', bd: on ? 'rgba(13,20,18,0.18)' : 'rgba(13,20,18,0.07)',
          col: on ? '#0D1412' : '#3D4945', sub: on ? '#5B6764' : '#98A3A0' };
      }) : [],
      abmResumen: spec ? spec.filas.length + ' en pantalla' : '',
      abmCols: spec ? spec.cols : '',
      abmMin: spec ? spec.min : '900px',
      abmHeads: spec ? spec.heads.map((h) => ({ label: h[0], align: h[1] })) : [],
      abmPie: spec ? spec.pie : '',
      abmMostrando: spec ? 'Mostrando ' + spec.filas.length + ' de ' + this.miles(spec.chips[0][1]) : '',
      abmFilas: spec ? spec.filas.map((r) => {
        const soloLectura = spec.modo === 'lectura';
        const off = r.off || (this.state.apagados || []).indexOf(r.n) > -1;
        return {
          nombre: r.n, sub: r.s || '',
          hayAvatar: true,
          hayGlifo: !!r.gl, glifo: r.gl || '',
          hayIniciales: !r.gl, iniciales: r.i || '',
          radio: r.i && !r.gl ? '999px' : '9px',
          tinte: off ? '#F3F7F5' : r.t, colorIcono: off ? '#98A3A0' : r.cc,
          colorNombre: off ? '#7A8783' : '#0D1412',
          fondo: off ? '#FCFDFC' : '#FFFFFF',
          fuenteSub: 'Inter, sans-serif',
          celdas: r.cel,
          editable: !soloLectura,
          soloLectura: soloLectura,
          estado: off ? 'Inactivo' : 'Activo',
          pistaBg: off ? '#D5DDDA' : '#00B37E',
          perilla: off ? '2px' : '16px',
          alternar: () => this.setState((st) => ({
            apagados: (st.apagados || []).indexOf(r.n) > -1
              ? st.apagados.filter((x) => x !== r.n)
              : (st.apagados || []).concat([r.n]),
          })),
          colBorrar: r.del ? '#C93A3E' : '#D5DDDA',
          opBorrar: r.del ? 1 : 0.5,
          cursorBorrar: r.del ? 'pointer' : 'not-allowed',
          tituloBorrar: r.del ? 'Borrar' : 'No se puede borrar: tiene movimientos asociados',
        };
      }) : [],
      esAbmCompleto: !!spec,
      notaAbm: (hijo && notasAbm[hijo.id]) || 'Esta pestaña necesita el ABM completo, no el catálogo simple.',
      veredicto: hijo && hijo.tipo === 'arbol' ? React.createElement('span', { dangerouslySetInnerHTML: { __html:
          '<strong style="font-weight: 600; color: #0D1412;">' + this.datosDe('cat-tramite').filas.length + ' categorías y ' + tram.length + ' tipos</strong> en una sola vista, '
          + 'con los prerrequisitos que enfrenta el vecino en cada uno. '
          + 'El más pesado, Licencia de conducir, le pide 3 documentos y 4 validaciones.' } })
        : hijo && hijo.tipo === 'tramites' ? React.createElement('span', { dangerouslySetInnerHTML: { __html:
          '<strong style="font-weight: 600; color: #C93A3E;">Solo ' + online.length + ' de ' + tram.length + ' trámites se completa sin ir a la municipalidad.</strong> '
          + 'Y ' + cobraAntes + ' cobran al inicio: el vecino paga antes de saber si se lo aprueban.' } })
        : hijo && hijo.tipo === 'asignacion' ? React.createElement('span', { dangerouslySetInnerHTML: { __html:
          huerfanas.length
            ? '<strong style="font-weight: 600; color: #C93A3E;">' + huerfanas.length + ' de ' + catsRec.length + ' categorías de ' + (ladoAsig === 'tramites' ? 'trámite' : 'reclamo') + ' no tienen dependencia.</strong> '
              + 'Por esas entraron <strong style="font-weight: 600; color: #0D1412;">' + enRiesgo + ' de los ' + totalRec + ' ' + (ladoAsig === 'tramites' ? 'trámites' : 'reclamos') + '</strong> históricos, y cada uno hubo que derivarlo a mano.'
            : '<strong style="font-weight: 600; color: #00794F;">Las ' + catsRec.length + ' categorías de ' + (ladoAsig === 'tramites' ? 'trámite' : 'reclamo') + ' tienen dependencia.</strong> '
              + 'Todo ' + (ladoAsig === 'tramites' ? 'trámite' : 'reclamo') + ' que entra se deriva solo, sin que nadie lo toque.' } })
        : (hijo && this.descripcion(hijo.id)) || (hijo && veredictos[hijo.id]) || '',
      // En el árbol se da de alta el TRÁMITE. Las dependencias se dan de alta
      // en Catálogos, y a quién le toca cada trámite se decide en Asignación.
      ctaNuevo: spec ? spec.cta : (hijo && hijo.tipo === 'arbol') ? 'Nuevo tipo de trámite' : d.nuevo,
      cols: cols,
      colRespuesta: (hijo && hijo.id === 'cat-reclamo') ? 'PLAZO Y PRIORIDAD' : 'PLAZO',
      colOrdenLabel: this.state.orden ? 'ARRASTRÁ' : 'ORDEN',
      cursorOrden: this.state.orden ? 'grab' : 'default',
      anchoHandle: this.state.orden ? '14px' : '0px',
      opOrden: this.state.orden ? 1 : 0.25,
      reordenar: () => this.setState((st) => ({ orden: !st.orden })),
      labelOrden: this.state.orden ? 'Listo' : 'Reordenar',
      bgOrden: this.state.orden ? '#E7F6F0' : '#FFFFFF',
      bdOrden: this.state.orden ? '#C9EBDD' : 'rgba(13,20,18,0.12)',
      colOrden: this.state.orden ? '#00794F' : '#3D4945',
      verTabla: () => this.setState({ vista: 'tabla' }),
      verTarjetas: () => this.setState({ vista: 'tarjetas' }),
      modoTabla: this.state.vista === 'tabla',
      modoTarjetas: this.state.vista === 'tarjetas',
      bgTabla: this.state.vista === 'tabla' ? '#FFFFFF' : 'transparent',
      shTabla: this.state.vista === 'tabla' ? '0 1px 2px rgba(13,20,18,0.06)' : 'none',
      colTabla: this.state.vista === 'tabla' ? '#0D1412' : '#7A8783',
      bgTarjetas: this.state.vista === 'tarjetas' ? '#FFFFFF' : 'transparent',
      shTarjetas: this.state.vista === 'tarjetas' ? '0 1px 2px rgba(13,20,18,0.06)' : 'none',
      colTarjetas: this.state.vista === 'tarjetas' ? '#0D1412' : '#7A8783',
      estados: [
        chip('todos', 'Todas', d.filas.length),
        chip('activos', 'Activas', activas.length),
        chip('inactivos', 'Inactivas', d.filas.length - activas.length),
        chip('sinuso', 'Sin usar', sinUso.length),
      ],
      resumenFiltro: visibles.length + ' de ' + d.filas.length,
      pie: sinUso.length
        ? 'Las filas en uso no se pueden borrar: primero hay que reasignar sus ' + d.unidad + '.'
        : 'Ninguna fila se puede borrar: todas están en uso.',
      filas: visibles.map((r, i) => {
        const off = r.off || apagados.indexOf(r.nombre) > -1;
        return {
          orden: String(i + 1),
          nombre: r.nombre,
          nota: r.nota,
          glifo: r.glifo,
          color: off ? '#98A3A0' : r.color,
          tinte: off ? '#F3F7F5' : (d.tinte[r.color] || '#F3F7F5'),
          colorNombre: off ? '#7A8783' : '#0D1412',
          fondo: off ? '#FCFDFC' : '#FFFFFF',
          opTarjeta: off ? 0.72 : 1,
          estado: off ? 'Inactiva' : 'Activa',
          estadoCol: off ? '#98A3A0' : '#00794F',
          pistaBg: off ? '#D5DDDA' : '#00B37E',
          perilla: off ? '2px' : '16px',
          alternar: () => this.setState((st) => ({
            apagados: st.apagados.indexOf(r.nombre) > -1
              ? st.apagados.filter((x) => x !== r.nombre)
              : st.apagados.concat([r.nombre]),
          })),
          desc: r.desc || r.nota,
          sePisa: !!r.pisa,
          tituloPisa: r.pisa ? 'Se solapa con «' + r.pisa + '»: el vecino no sabe cuál elegir' : '',
          sla: r.hs ? (r.hs % 24 === 0 ? (r.hs / 24) + (r.hs === 24 ? ' día' : ' días') : r.hs + ' hs') : '—',
          prioLabel: r.prio ? ['muy baja', 'baja', 'media', 'alta', 'urgente'][r.prio - 1] : '',
          puntos: [1, 2, 3, 4, 5].map((n) => ({
            bg: !r.prio ? '#E3E9E6' : n <= r.prio ? (r.prio >= 4 ? '#E5484D' : r.prio === 3 ? '#F59E0B' : '#00B37E') : '#E3E9E6',
          })),
          editar: () => this.setState({ edita: r.nombre, picker: false, unidad: 'auto', prio: null, icono: null, color: null }),
          uso: r.uso === 0 ? '—' : String(r.uso),
          usoNota: r.uso === 0 ? 'sin usar' : r.uso === 1 ? d.unidad.replace(/s$/, '') : d.unidad,
          usoCol: r.uso === 0 ? '#98A3A0' : '#0D1412',
          colBorrar: r.uso === 0 ? '#C93A3E' : '#D5DDDA',
          opBorrar: r.uso === 0 ? 1 : 0.5,
          cursorBorrar: r.uso === 0 ? 'pointer' : 'not-allowed',
          tituloBorrar: r.uso === 0 ? 'Borrar' : 'No se puede borrar: tiene ' + r.uso + ' ' + d.unidad,
        };
      }),
    };
  }
}

export const MockData = new MockDataService();
patchMockData(MockData);
