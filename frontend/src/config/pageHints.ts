/**
 * Diccionario de hints para cada pantalla de gestión.
 *
 * Un hint puede tener dos formas:
 *   1. Simple — `{ title, description }` — card informativo con 2 líneas.
 *   2. Wizard — `{ title, steps: [{ title, description, icon }] }` — mini
 *      tutorial con navegación Next/Back, indicador de progreso y CTA final.
 *
 * El dismiss queda persistido en localStorage con la key
 * `hint_dismissed_{pageId}` — ver `PageHint.tsx`.
 */

export interface HintStep {
  title: string;
  description: string;
  /** Nombre de ícono de lucide-react, ej: "ClipboardList". Opcional. */
  icon?: string;
  /**
   * Link opcional a una pantalla relacionada (ej: "ir a dar de alta").
   * Se renderiza como un botón secundario dentro del step.
   */
  cta?: {
    label: string;
    href: string;
  };
}

export interface PageHintConfig {
  title: string;
  description?: string;
  /** Si está presente, el hint se renderiza en modo wizard (tutorial). */
  steps?: HintStep[];
  /** Color de acento del hint. Default: 'blue'. */
  accent?: 'blue' | 'violet' | 'emerald' | 'amber';
}

export const PAGE_HINTS: Record<string, PageHintConfig> = {
  // ========================================================================
  // DASHBOARD — mini tutorial del sistema completo (wizard)
  // ========================================================================
  'dashboard-home': {
    title: 'Bienvenido a Munify',
    accent: 'violet',
    steps: [
      {
        title: '¿Qué es Munify?',
        description:
          'La plataforma que unifica la gestión de reclamos y trámites de tu municipio. Los vecinos reportan o inician trámites desde la app, y vos los gestionás desde acá.',
        icon: 'Sparkles',
      },
      {
        title: 'Reclamos',
        description:
          'Los vecinos reportan problemas (baches, alumbrado, residuos). Cada reclamo se asigna automáticamente a la dependencia responsable según la categoría. Vos asignás empleados o cuadrillas y respondés al vecino.',
        icon: 'ClipboardList',
        cta: { label: 'Ver reclamos', href: '/gestion/reclamos' },
      },
      {
        title: 'Trámites',
        description:
          'Procesos con documentación (licencias, habilitaciones, certificados). Definís qué trámites ofrecés, qué documentos piden y los vecinos los inician desde la app. Seguís cada solicitud hasta finalizar.',
        icon: 'FileText',
        cta: { label: 'Configurar trámites', href: '/gestion/tramites-config' },
      },
      {
        title: 'Equipo y organización',
        description:
          'Empleados, cuadrillas, zonas y dependencias. Armás tu estructura operativa una vez y el sistema enruta todo automáticamente. Cada supervisor ve solo lo de su dependencia.',
        icon: 'Users',
        cta: { label: 'Gestionar empleados', href: '/gestion/empleados' },
      },
      {
        title: 'Mapa y métricas',
        description:
          'Visualizá reclamos en el mapa, analizá tendencias en el dashboard, consultá datos con IA en el Panel BI. Todo para que tomes mejores decisiones.',
        icon: 'TrendingUp',
        cta: { label: 'Abrir mapa', href: '/gestion/mapa' },
      },
      {
        title: '¡Dale una vuelta!',
        description:
          'Esta es una demo con datos de ejemplo. Navegá por el menú lateral — cada sección tiene su propia guía. Cuando quieras implementarlo en tu municipio, hablemos.',
        icon: 'Rocket',
      },
    ],
  },

  // ========================================================================
  // MÓDULO FINANCIERO — un hint por pantalla, 5 steps con lenguaje claro
  // pensado para el intendente (no técnico).
  // Cubre los 14 items del sidebar del módulo.
  // ========================================================================
  'contaduria-ordenes': {
    title: 'Órdenes de Pago',
    accent: 'emerald',
    steps: [
      {
        title: '¿Qué es una Orden de Pago?',
        description: 'Es el documento formal con el que el muni autoriza un pago. Antes de que la plata salga de la caja, alguien tiene que firmar la OP. Acá la creás, la autorizás y la pagás. Queda todo registrado con audit.',
        icon: 'FileText',
      },
      {
        title: 'Cómo se crea una',
        description: 'Apretás "Nueva OP", ponés a quién le pagás (proveedor o secretaría), el concepto y el monto. Si tenés la factura del proveedor, la adjuntás (PDF o foto). Elegís la caja de dónde saldrá la plata.',
        icon: 'ClipboardList',
      },
      {
        title: 'Retenciones impositivas',
        description: 'Si el muni retiene impuestos al pagar (Tasa Muni, Ganancias, IIBB, SUSS), tildás cuáles aplican. El sistema calcula el monto neto que efectivamente sale de caja, y el bruto queda registrado para el Tribunal de Cuentas.',
        icon: 'Lightbulb',
      },
      {
        title: 'Etapas contables del gasto',
        description: 'Cada OP pasa por 4 etapas: Preventivo (reserva el presupuesto) → Compromiso (firmás el contrato/orden) → Devengado (recibiste el bien/servicio) → Pagado. Esto es lo que pide el Tribunal de Cuentas.',
        icon: 'Sparkles',
      },
      {
        title: 'Al pagar, ¿qué pasa?',
        description: 'Cuando apretás "Pagar" en una OP autorizada, automáticamente: 1) se crea el gasto en Tesorería, 2) se descuenta la caja, 3) la OP queda en estado "Pagada". Una sola acción, todo conectado.',
        icon: 'Rocket',
        cta: { label: 'Ver Pagos en Tesorería', href: '/gestion/tesoreria' },
      },
    ],
  },

  'contaduria-reportes': {
    title: 'Reportes de Contaduría',
    accent: 'emerald',
    steps: [
      {
        title: '¿Para qué sirve esta pantalla?',
        description: 'Es el tablero de control de las OPs. De un vistazo ves qué pagos están vencidos, qué se viene en los próximos días y dónde está concentrado el gasto del muni este mes.',
        icon: 'TrendingUp',
      },
      {
        title: 'OPs vencidas (rojo)',
        description: 'Son las que tenían fecha de vencimiento y todavía no se pagaron. Es lo primero que mirás cada mañana: si hay rojo, hay un problema con un proveedor que no le pagamos a tiempo.',
        icon: 'Lightbulb',
      },
      {
        title: 'Próximas a vencer (amarillo)',
        description: 'Las que vencen en los próximos 7 días. Para que el tesorero anticipe la disponibilidad de fondos y no se nos pase ninguna.',
        icon: 'ClipboardList',
      },
      {
        title: 'Top beneficiarios del mes',
        description: 'A quiénes se les pagó más plata este mes. Sirve para detectar si estamos muy concentrados en un solo proveedor o si hay un gasto que se disparó.',
        icon: 'Users',
      },
      {
        title: 'Portal de Transparencia',
        description: 'Botón "JSON/CSV" arriba: bajás todos los pagos hechos en formato abierto para publicarlos en la web del muni. Es lo que pide la Ley de Acceso a la Información Pública.',
        icon: 'Rocket',
      },
    ],
  },

  'tesoreria-movimientos': {
    title: 'Pagos de Tesorería',
    accent: 'emerald',
    steps: [
      {
        title: '¿Qué ves acá?',
        description: 'Todo el dinero que efectivamente sale del muni. Cada gasto del muni aparece acá, sea originado en una OP de Contaduría o en una liquidación de sueldo. Es la "fuente de verdad" del dinero gastado.',
        icon: 'Sparkles',
      },
      {
        title: 'Cargar un gasto suelto',
        description: 'Si necesitás registrar un gasto que no vino por OP (un pago en efectivo, una compra menor), apretás "Nuevo Pago" y lo cargás directo. Elegís de qué caja sale.',
        icon: 'ClipboardList',
      },
      {
        title: 'Filtros y búsqueda',
        description: 'Buscás por concepto, por contacto o por descripción. También filtrás por mes, por dependencia, por caja, por forma de pago. Para encontrar cualquier gasto rápido.',
        icon: 'Lightbulb',
      },
      {
        title: 'Cada gasto descuenta una caja',
        description: 'Cuando se carga un gasto con caja asignada, automáticamente se descuenta del saldo de esa caja. Así el saldo de Coparticipación, Tesoro propio, etc. siempre está actualizado.',
        icon: 'TrendingUp',
        cta: { label: 'Ver saldos de cajas', href: '/gestion/tesoreria/cajas' },
      },
      {
        title: 'Curación con IA (Bartolo)',
        description: 'Si importás gastos viejos (Excel, Mercurio Pago) hay una pantalla aparte donde la IA clasifica los gastos dudosos y vos los corregís. Mantiene tu histórico limpio.',
        icon: 'Rocket',
      },
    ],
  },

  'tesoreria-cajas': {
    title: 'Cajas / Fondos',
    accent: 'emerald',
    steps: [
      {
        title: '¿Qué son las cajas?',
        description: 'Son las "billeteras" del muni: Tesoro propio, Coparticipación provincial, FOFINDE, FODEMEP, fondos afectados a una obra, etc. Cada caja tiene su saldo en vivo.',
        icon: 'Sparkles',
      },
      {
        title: 'Saldo inicial',
        description: 'Al crear una caja le ponés el saldo con el que arranca. Después cada gasto y cada ingreso modifican ese saldo automáticamente. No hay que llevar planilla aparte.',
        icon: 'ClipboardList',
      },
      {
        title: 'Ingresos y egresos',
        description: 'Cargás ingresos a la caja (Coparticipación que llega, transferencias recibidas, recaudación). Cada gasto registrado en Pagos o cada OP pagada descuenta automáticamente.',
        icon: 'TrendingUp',
      },
      {
        title: 'Fondos con afectación específica',
        description: 'Si un fondo está afectado a una obra puntual (FONDO ESCUELA, FONDO VIVIENDA), creás una caja específica para que la plata no se mezcle con los recursos corrientes.',
        icon: 'Lightbulb',
      },
      {
        title: 'Conciliación bancaria',
        description: 'Cuando llega el extracto del banco, lo subís en Conciliación y el sistema cruza los movimientos automáticamente. Cierra el ciclo: lo que sale de caja en el sistema = lo que sale del banco.',
        icon: 'Rocket',
        cta: { label: 'Ir a Conciliación', href: '/gestion/tesoreria/conciliacion' },
      },
    ],
  },

  'tesoreria-conciliacion': {
    title: 'Conciliación Bancaria',
    accent: 'emerald',
    steps: [
      {
        title: '¿Qué es conciliar?',
        description: 'Es chequear que lo que registramos en el sistema coincida con lo que registró el banco en el extracto. Si vos cargaste un pago de $50.000 y el banco lo cobró por $50.000, esa fila está "conciliada".',
        icon: 'Sparkles',
      },
      {
        title: 'Subís el extracto del banco',
        description: 'Bajás el extracto desde el home-banking en formato CSV (Excel exportado) y lo subís acá. Elegís a qué caja corresponde (Tesoro propio, Coparticipación, etc.).',
        icon: 'ClipboardList',
      },
      {
        title: 'Match automático',
        description: 'El sistema busca cada línea del extracto contra los movimientos de la caja: si coinciden el monto + el tipo (ingreso/egreso) + la fecha (±N días que vos elegís), se marca como conciliado solo.',
        icon: 'Rocket',
      },
      {
        title: 'Lo que no matchea',
        description: 'Lo que el sistema no pudo matchear queda abajo. Lo conciliás manualmente apretando el botón verde. Si algo en el extracto no figura en tus movimientos, es señal de que falta cargarlo.',
        icon: 'Lightbulb',
      },
      {
        title: '¿Por qué es importante?',
        description: 'Conciliar todos los meses te asegura que no hay errores, robos ni faltantes. Y es lo primero que pide el Tribunal de Cuentas: "Mostrame el extracto bancario contra el libro caja".',
        icon: 'TrendingUp',
      },
    ],
  },

  'tesoreria-proyeccion': {
    title: 'Proyección / Resumen',
    accent: 'emerald',
    steps: [
      {
        title: '¿Para qué sirve?',
        description: 'Es la vista resumen del gasto del muni: cuánto gastamos cada mes, en qué se nos fue la plata, qué proveedor cobra más. Para tomar decisiones a mediano plazo.',
        icon: 'TrendingUp',
      },
      {
        title: 'Modo mes vs modo año',
        description: 'Con las flechas ← → navegás entre meses (o entre años si estás en modo año). En modo año cada mes se puede expandir para ver el detalle adentro.',
        icon: 'ClipboardList',
      },
      {
        title: 'Filtros poderosos',
        description: 'Filtrás por dependencia (Secretaría de Obras, Salud, etc.), por contacto, por tipo de concepto, por forma de pago, por caja. Combinás filtros para responder preguntas concretas.',
        icon: 'Lightbulb',
      },
      {
        title: 'Total destacado',
        description: 'Arriba siempre ves el total acumulado del período + filtros aplicados. Útil para preguntas tipo: "¿cuánto gastamos en sueldos de personal contratado este año?".',
        icon: 'Sparkles',
      },
      {
        title: 'Cuándo usarla',
        description: 'Antes de aprobar un gasto grande, conviene mirar acá: ¿venimos cumpliendo presupuesto? ¿hay rubros que se dispararon? Es el "panel de control" del intendente.',
        icon: 'Rocket',
      },
    ],
  },

  'tesoreria-ubicacion': {
    title: 'Mapa de Tesorería',
    accent: 'emerald',
    steps: [
      {
        title: '¿Qué muestra el mapa?',
        description: 'La ubicación geográfica de tus contactos (proveedores, empleados, beneficiarios) y de cada gasto del muni. Sirve para entender la distribución territorial.',
        icon: 'Sparkles',
      },
      {
        title: 'Contactos del muni',
        description: 'Ves dónde viven tus empleados, dónde están los proveedores que más le pagás, qué barrios concentran subsidios. Cada chinche es un contacto activo.',
        icon: 'ClipboardList',
      },
      {
        title: 'Por paraje / zona',
        description: 'Si cargaste contactos por paraje (Santa Rita, Los Álamos, etc.), podés ver el resumen agrupado por zona: cuánto se gastó en cada paraje en el período elegido.',
        icon: 'Lightbulb',
      },
      {
        title: 'Filtros temporales',
        description: 'Elegís el mes/año para ver dónde se gastó la plata. Útil para comparar: "¿el mes pasado vs este mes, gastamos más en el centro o en los parajes?".',
        icon: 'TrendingUp',
      },
      {
        title: '¿Cuándo es útil?',
        description: 'Cuando querés explicarle al Concejo Deliberante o a un vecino dónde se invierte la plata del muni. Una imagen del mapa con los gastos del mes vale más que mil planillas.',
        icon: 'Rocket',
      },
    ],
  },

  'tesoreria-contactos': {
    title: 'Contactos',
    accent: 'emerald',
    steps: [
      {
        title: 'El padrón compartido del muni',
        description: 'Acá viven todos los contactos del muni: empleados, proveedores, beneficiarios de subsidios, contratistas. Un solo lugar para no duplicar datos.',
        icon: 'Users',
      },
      {
        title: 'Tipos de contacto',
        description: 'Cada contacto tiene un tipo: Empleado, Beneficiario, Proveedor, Contratista. Si es Empleado, además podés clasificarlo (corralón, personal de planta, jornalizado, etc.) para los reportes.',
        icon: 'ClipboardList',
      },
      {
        title: 'Cuenta corriente del proveedor',
        description: 'Si hacés clic en un proveedor ves su cuenta corriente: todas las OPs emitidas a su nombre, lo que se le pagó, lo que está pendiente. Total del año, retenciones aplicadas, todo.',
        icon: 'TrendingUp',
      },
      {
        title: 'Ubicación y datos',
        description: 'Cargás la dirección con autocompletar (o un paraje si vive en el campo), DNI/CUIT, teléfono, alias bancario para transferencias, y el sistema sabe cómo pagarle.',
        icon: 'Lightbulb',
      },
      {
        title: 'Unificar duplicados',
        description: 'Si por error cargaste dos veces al mismo contacto (con nombre apenas distinto), hay un botón "Unificar" que fusiona los dos en uno sin perder el histórico de pagos.',
        icon: 'Rocket',
      },
    ],
  },

  'tesoreria-reportes': {
    title: 'Reportes de Tesorería',
    accent: 'emerald',
    steps: [
      {
        title: '¿Para qué sirve?',
        description: 'Es el panel ejecutivo de Tesorería: en qué se nos va la plata, qué cajas se mueven más, cómo viene la evolución mes a mes. La info que un intendente mira con su mate por la mañana.',
        icon: 'TrendingUp',
      },
      {
        title: 'Egresos por caja',
        description: 'Cuánto salió de cada caja este mes y qué porcentaje del total representa. Útil para ver si estamos balanceando el uso de los fondos (no usar todo de una sola caja).',
        icon: 'Sparkles',
      },
      {
        title: 'Top conceptos del mes',
        description: 'Los conceptos de gasto que se llevaron más plata: sueldos, combustible, obras, gastos de movilidad, etc. Para identificar rápido dónde se concentra el gasto.',
        icon: 'ClipboardList',
      },
      {
        title: 'Top dependencias',
        description: 'Qué secretarías recibieron más asignación de gasto este mes. Compara consumo entre áreas y detecta desbalances.',
        icon: 'Users',
      },
      {
        title: 'Evolución mensual',
        description: 'Gráfico de barras con los últimos 6 meses de gasto total. De un vistazo ves si veníamos creciendo, si se aplastó o si tuvimos un pico anómalo.',
        icon: 'Rocket',
      },
    ],
  },

  'sueldos-liquidaciones': {
    title: 'Liquidaciones',
    accent: 'emerald',
    steps: [
      {
        title: '¿Qué son las liquidaciones?',
        description: 'Son los pagos recurrentes a empleados: sueldos mensuales, presentismo semanal, incentivos. Cada uno se programa una vez y el sistema te avisa cuándo toca pagarlo.',
        icon: 'ClipboardList',
      },
      {
        title: 'Sueldo + premios separados',
        description: 'Cada empleado tiene su sueldo mensual + el presentismo (semanal, todos los viernes) + el incentivo (mensual, día 15). Tres pagos distintos, cada uno con su propio botón "Pagar".',
        icon: 'Sparkles',
      },
      {
        title: 'Auto-generación',
        description: 'Cuando cargás el sueldo de un empleado nuevo, automáticamente se le crean los pagos de cada premio activo del catálogo. No hay que cargar 3 cosas por empleado, con cargar el sueldo basta.',
        icon: 'Rocket',
      },
      {
        title: 'Si el empleado no se ganó el premio',
        description: 'No le apretás "Pagar" a ese premio ese mes. No afecta al sueldo ni a los próximos. Por ejemplo: si faltó un viernes, ese presentismo no se paga, pero los demás viernes sí.',
        icon: 'Lightbulb',
      },
      {
        title: 'Filtro Realizados',
        description: 'En el chip "Realizados" arriba ves todos los pagos ya ejecutados de los últimos 90 días. Útil para responder "¿ya le pagué a Juan este mes?".',
        icon: 'TrendingUp',
        cta: { label: 'Configurar premios', href: '/gestion/configuracion/tesoreria?tab=premios' },
      },
    ],
  },

  'sueldos-empleados': {
    title: 'Empleados',
    accent: 'emerald',
    steps: [
      {
        title: 'El padrón de personal',
        description: 'Acá ves todos los empleados del muni que cobran sueldo. Cada empleado es un contacto tipo "empleado" con sub-clasificación (planta, contratado, corralón, etc.).',
        icon: 'Users',
      },
      {
        title: 'KPIs arriba',
        description: 'Cantidad de empleados activos, cuántos ya tienen liquidación cargada, y masa salarial total (suma de sueldos base sin premios). Te da la foto del personal del muni.',
        icon: 'TrendingUp',
      },
      {
        title: 'Estado de cada empleado',
        description: 'Cada fila te muestra si el empleado ya tiene la liquidación cargada (verde) o no (gris). Si está gris, falta cargarle el sueldo y los premios automáticos no se le aplicarán.',
        icon: 'Lightbulb',
      },
      {
        title: 'Filtrar por tipo',
        description: 'En el combo "Tipos" filtrás por sub-clasificación: ver solo Personal de planta, solo Jornalizados, solo Corralón. Útil para reportes específicos.',
        icon: 'ClipboardList',
      },
      {
        title: 'Para cargar uno nuevo',
        description: 'Si entra un empleado nuevo al muni: primero lo creás como Contacto (tipo=Empleado, con DNI y datos) y después le cargás la liquidación de sueldo en la sección Liquidaciones.',
        icon: 'Rocket',
        cta: { label: 'Ir a Contactos', href: '/gestion/tesoreria/contactos' },
      },
    ],
  },

  'sueldos-reportes': {
    title: 'Reportes de Sueldos',
    accent: 'emerald',
    steps: [
      {
        title: 'El panel de personal',
        description: 'Es la foto financiera del personal del muni: cuánto pesa la masa salarial, qué empleados cobran más, distribución por tipo de pago.',
        icon: 'TrendingUp',
      },
      {
        title: 'Masa salarial',
        description: 'El total mensual que pagás en sueldos. Si crece mes a mes, hay que prestar atención. Es uno de los gastos más grandes del muni.',
        icon: 'Sparkles',
      },
      {
        title: 'Top sueldos',
        description: 'Ranking de los empleados con los sueldos más altos. Útil para revisión presupuestaria: ¿corresponde a sus cargos? ¿hay desbalance?.',
        icon: 'ClipboardList',
      },
      {
        title: 'Distribución por frecuencia',
        description: 'Cuántas liquidaciones son mensuales vs quincenales vs semanales. Mostrás cómo se compone el pago de sueldos.',
        icon: 'Lightbulb',
      },
      {
        title: 'Próximos pagos',
        description: 'Lista cronológica de los próximos 30 días de pagos a personal. Útil para planificación de tesorería y para saber qué viene la semana próxima.',
        icon: 'Rocket',
      },
    ],
  },

  'configuracion-tesoreria': {
    title: 'Configuración de Tesorería',
    accent: 'emerald',
    steps: [
      {
        title: 'El catálogo del módulo',
        description: 'Acá cargás todo lo "estable" del muni: cajas, conceptos, tipos de empleado, premios, retenciones, parajes, proyectos. Se hace una sola vez y de acá se alimenta TODO lo demás.',
        icon: 'Sparkles',
      },
      {
        title: 'Conceptos y tipos de empleado',
        description: 'Conceptos = de qué tipo es un gasto (Sueldo, Combustible, Obra, etc.). Tipos de empleado = sub-clasificación de empleados (corralón, planta, jornalizado).',
        icon: 'ClipboardList',
      },
      {
        title: 'Cajas / Fondos',
        description: 'Acá creás las "billeteras" del muni: Tesoro propio, Coparticipación, FOFINDE, etc. Con su saldo inicial y color. Después cada gasto descuenta de la que corresponda.',
        icon: 'TrendingUp',
      },
      {
        title: 'Premios (semanal/mensual)',
        description: 'Cargás Presentismo (frecuencia semanal, día viernes) e Incentivo (frecuencia mensual, día 15). El monto es fijo. Después se aplican automáticamente a cada empleado con sueldo cargado.',
        icon: 'Lightbulb',
      },
      {
        title: 'Retenciones impositivas',
        description: 'Tasa Muni, Ganancias, IIBB, SUSS, etc. Cada una con su porcentaje. Al crear una OP marcás cuáles aplican y el sistema calcula el neto a pagar al proveedor.',
        icon: 'Rocket',
        cta: { label: 'Ir a Órdenes de Pago', href: '/gestion/contaduria/ordenes-pago' },
      },
    ],
  },

  // ========================================================================
  // Wizard del flujo completo (kept para compat si lo necesitamos en Dashboard)
  // ========================================================================
  'gestion-financiera-onboarding': {
    title: 'Gestión financiera del muni',
    accent: 'emerald',
    steps: [
      {
        title: 'Cómo se conecta todo',
        description:
          'El módulo financiero tiene 4 secciones que trabajan en cadena: Configuración (catálogo) → Contaduría (OPs formales) → Tesorería (cajas, conciliación) → Sueldos (liquidaciones recurrentes). Te llevo de a una.',
        icon: 'Sparkles',
      },
      {
        title: '1) Configuración → Tesorería (el catálogo)',
        description:
          'Primero cargás lo "estable": cajas/fondos (Coparticipación, Tesoro propio), conceptos de gasto, tipos de empleado, premios (con su frecuencia: presentismo semanal, incentivo mensual) y retenciones impositivas (Tasa Muni, Ganancias, IIBB, SUSS). De acá se alimenta todo lo demás.',
        icon: 'ClipboardList',
        cta: { label: 'Ir a Configuración', href: '/gestion/configuracion/tesoreria' },
      },
      {
        title: '2) Contaduría → Órdenes de Pago',
        description:
          'Acá nace cada pago formal: cargás beneficiario + concepto + monto + factura, marcás retenciones, autorizás. Al pagar la OP, automáticamente se crea el gasto en Tesorería y se descuenta la caja elegida. Todo con audit log.',
        icon: 'FileText',
        cta: { label: 'Ir a Órdenes de Pago', href: '/gestion/contaduria/ordenes-pago' },
      },
      {
        title: '3) Tesorería → Movimientos y Cajas',
        description:
          'Acá ves TODO el gasto del muni (sea originado en una OP o en una liquidación). Es la fuente de verdad. En Cajas ves los saldos en vivo de cada fondo: cada gasto descuenta de la caja que elegiste.',
        icon: 'TrendingUp',
        cta: { label: 'Ir a Cajas', href: '/gestion/tesoreria/cajas' },
      },
      {
        title: '4) Tesorería → Conciliación bancaria',
        description:
          'Cuando llega el extracto del banco lo subís en CSV y el sistema auto-matchea contra tus movimientos por (monto + tipo + fecha ±N días). Los que no matchean los conciliás manualmente. Cierra el ciclo: lo que sale de caja = lo que sale del banco.',
        icon: 'Lightbulb',
        cta: { label: 'Ir a Conciliación', href: '/gestion/tesoreria/conciliacion' },
      },
      {
        title: '5) Sueldos → Liquidaciones recurrentes',
        description:
          'Cada empleado tiene su sueldo mensual + premios independientes: presentismo se paga todos los VIERNES, incentivo el DÍA 15. Cada uno con su propio botón Pagar. Si un viernes el empleado no se ganó el presentismo, simplemente no se le ejecuta.',
        icon: 'Users',
        cta: { label: 'Ir a Liquidaciones', href: '/gestion/tesoreria/agenda' },
      },
      {
        title: '6) Reportes y Portal de Transparencia',
        description:
          'Cada módulo tiene su pantalla de Reportes (vencidos, top beneficiarios, masa salarial, evolución mensual). En Contaduría → Reportes hay un botón "Portal de Transparencia" que exporta JSON/CSV abierto para publicar en la web del muni.',
        icon: 'TrendingUp',
        cta: { label: 'Reportes Contaduría', href: '/gestion/contaduria/reportes' },
      },
      {
        title: '¡Listo! El flujo en una imagen',
        description:
          'Catálogo → OP → Pago (gasto + caja) → Conciliación bancaria. En paralelo: Empleado → Liquidaciones (sueldo + premios) → Pago. Todo queda registrado con auditoría, exportable y conciliable.',
        icon: 'Rocket',
      },
    ],
  },

  // ========================================================================
  // HINTS SIMPLES POR PANTALLA
  // ========================================================================
  'reclamos-list': {
    title: 'Gestión de reclamos',
    accent: 'blue',
    steps: [
      {
        title: '¿Qué son los reclamos?',
        description:
          'Reportes de problemas que hacen los vecinos desde la app (baches, alumbrado, basura, ruidos...). Cada reclamo tiene categoría, ubicación y descripción. Acá los gestionás hasta resolverlos.',
        icon: 'ClipboardList',
      },
      {
        title: 'Cómo se asignan automáticamente',
        description:
          'Cada categoría (ej: "Alumbrado") está mapeada a una dependencia (ej: "Servicios Públicos") en "Dependencias → Categorías". Cuando entra un reclamo, el sistema resuelve a quién le corresponde sin intervención manual.',
        icon: 'Sparkles',
        cta: { label: 'Configurar dependencias', href: '/gestion/dependencias' },
      },
      {
        title: 'Ciclo de vida de un reclamo',
        description:
          'Recibido → En curso → Finalizado. También puede ir a Pospuesto (espera repuestos, por ejemplo) o Rechazado (fuera de jurisdicción). Cada cambio de estado requiere un comentario que el vecino ve en tiempo real.',
        icon: 'TrendingUp',
      },
      {
        title: 'Tu rol como gestor',
        description:
          'Desde cada reclamo podés: cambiar el estado, asignarlo a un empleado o cuadrilla, programar fecha y hora, agregar comentarios, y marcarlo como resuelto. El vecino recibe notificaciones en cada cambio.',
        icon: 'Users',
        cta: { label: 'Ver empleados', href: '/gestion/empleados' },
      },
      {
        title: 'SLA y métricas',
        description:
          'Cada reclamo tiene un SLA (tiempo máximo) según su categoría. El sistema alerta con amarillo cuando está cerca de vencer y rojo cuando venció. En el Dashboard ves métricas de cumplimiento por dependencia, zona y categoría.',
        icon: 'Rocket',
        cta: { label: 'Configurar SLA', href: '/gestion/sla' },
      },
    ],
  },
  'tramites-list': {
    title: 'Gestión de trámites',
    accent: 'blue',
    steps: [
      {
        title: '¿Qué son las solicitudes de trámite?',
        description:
          'Procesos formales que un vecino inicia desde la app: licencia de conducir, habilitación comercial, certificado de libre deuda, etc. Cada uno tiene costo, tiempo estimado y documentos requeridos.',
        icon: 'FileText',
      },
      {
        title: 'Cómo llegan a esta lista',
        description:
          'El vecino ve en su app los trámites que configuraste en "Trámites → Configuración", elige uno, sube los documentos pedidos y crea una solicitud. Automáticamente se asigna a la dependencia correspondiente según la categoría del trámite.',
        icon: 'Sparkles',
        cta: { label: 'Dar de alta trámites', href: '/gestion/tramites-config' },
      },
      {
        title: 'Verificación de documentos',
        description:
          'Cada solicitud tiene un checklist de documentos. El empleado de la dependencia revisa cada uno y lo marca como verificado. Si un documento obligatorio queda sin verificar, la solicitud NO puede pasar a "En curso".',
        icon: 'ClipboardList',
      },
      {
        title: 'Ciclo de vida de una solicitud',
        description:
          'Recibido → En curso → Finalizado. También puede ir a Pospuesto (falta documentación extra) o Rechazado (con motivo). Cada transición queda registrada en el historial y el vecino se notifica.',
        icon: 'TrendingUp',
      },
      {
        title: 'Diferencia con reclamos',
        description:
          'Reclamos = reportes de problemas urbanos (suelen ser gratis y urgentes). Solicitudes = procesos administrativos con costo, tiempo estimado y papeles formales. Ambos comparten sistema de estados, dependencias y gestión visual.',
        icon: 'Rocket',
        cta: { label: 'Ver reclamos', href: '/gestion/reclamos' },
      },
    ],
  },
  'tramites-config': {
    title: 'Configuración de trámites',
    accent: 'blue',
    steps: [
      {
        title: 'Catálogo de trámites del municipio',
        description:
          'Acá definís qué trámites ofrece tu municipio a los vecinos. Si un trámite no está en este catálogo, el vecino NO puede iniciarlo desde la app. Arrancás con una lista de ejemplos pero la editás libremente.',
        icon: 'FileText',
      },
      {
        title: 'Crear un trámite',
        description:
          'Completás: nombre, descripción, categoría (ej: Habilitaciones Comerciales), costo, tiempo estimado en días y si requiere validación de identidad (DNI + facial). La categoría determina qué dependencia lo va a procesar.',
        icon: 'Sparkles',
      },
      {
        title: 'Documentos requeridos',
        description:
          'Por cada trámite listás los documentos que el vecino debe subir. Ej: "Licencia de conducir" pide DNI, certificado médico y foto carnet. Cada documento puede ser obligatorio u opcional — los obligatorios bloquean el avance.',
        icon: 'ClipboardList',
      },
      {
        title: 'Requiere CENAT (licencias de conducir)',
        description:
          'Activá este toggle para trámites de licencia. El vecino sube el comprobante del CENAT nacional (Agencia Nacional de Seguridad Vial) como documento aparte, antes de que el operador cierre el legajo. El pago del CENAT es externo a Munify — solo trackeamos el adjunto.',
        icon: 'Lightbulb',
      },
      {
        title: 'Requiere verificación biométrica (KYC)',
        description:
          'Para trámites sensibles. Si lo activás, el vecino debe tener su identidad verificada por Didit (nivel 2 = DNI + selfie) antes de iniciar. Si llega sin KYC, el sistema lo rechaza con un 403 y un link para verificarse. El operador de ventanilla puede validar presencialmente (kyc_modo=assisted).',
        icon: 'Users',
      },
      {
        title: 'Cómo se asigna la dependencia',
        description:
          'Los trámites se enrutan por su categoría (igual que los reclamos). Ej: un trámite de categoría "Habilitaciones Comerciales" cae en la Dirección de Habilitaciones. Configurás el mapeo en "Dependencias".',
        icon: 'Users',
        cta: { label: 'Gestionar dependencias', href: '/gestion/dependencias' },
      },
      {
        title: '¿Y después?',
        description:
          'Guardado el trámite, el vecino lo ve al instante en su app bajo "Nuevo trámite". Cuando inicie una solicitud, la vas a ver en "Trámites → Gestión" con los documentos listos para verificar.',
        icon: 'Rocket',
        cta: { label: 'Ir a gestión de trámites', href: '/gestion/tramites' },
      },
    ],
  },
  'dependencias': {
    title: 'Dependencias habilitadas',
    description:
      'Las dependencias (Obras Públicas, Rentas, etc.) son las áreas que procesan reclamos y trámites. Acá elegís cuáles tiene tu municipio. El mapeo categoría → dependencia define a quién le llega cada reclamo de forma automática.',
  },
  'categorias-reclamo': {
    title: 'Categorías de reclamo',
    description:
      'Tipos de problemas que los vecinos pueden reportar (baches, alumbrado, etc.). Cada categoría tiene color, ícono, prioridad por defecto y se asigna a una dependencia responsable.',
  },
  'empleados': {
    title: 'Empleados',
    description:
      'Personal del municipio con acceso operativo. Cada empleado puede tener zona, categoría principal y formar parte de cuadrillas. Los reclamos en curso se asignan a empleados para seguimiento y ejecución.',
    accent: 'emerald',
  },
  'cuadrillas': {
    title: 'Cuadrillas',
    description:
      'Equipos de trabajo formados por empleados. Tienen un líder, una zona y una categoría principal. Se usan para asignar trabajos en conjunto (ej: cuadrilla de poda, cuadrilla de alumbrado).',
    accent: 'emerald',
  },
  'zonas': {
    title: 'Zonas geográficas',
    description:
      'Divisiones internas del municipio (Centro, Norte, Sur, etc.). Se usan para asignar empleados y cuadrillas a sectores, y para ver reportes de gestión agrupados por zona.',
  },
  'sla': {
    title: 'Acuerdos de nivel de servicio (SLA)',
    description:
      'Definí cuánto tiempo máximo puede tardar cada categoría de reclamo en ser respondida y resuelta. El sistema alerta cuando un reclamo está cerca de vencer (amarillo) o ya venció (rojo).',
    accent: 'amber',
  },
  'planificacion': {
    title: 'Planificación semanal',
    description:
      'Calendario de trabajos programados. Cada reclamo en curso puede tener fecha, hora y empleado asignado. Útil para planificar rutas y cargas de trabajo del equipo.',
  },
  'tablero-kanban': {
    title: 'Tablero Kanban',
    description:
      'Vista visual de los reclamos agrupados por estado (Recibido / En curso / Finalizado). Arrastrá tarjetas para cambiar estado. Alternativa visual a la lista de reclamos.',
  },
  'panel-bi': {
    title: 'Panel de BI',
    description:
      'Consultas personalizadas con IA sobre tu base de reclamos. Tipeá una pregunta en español y el sistema genera el SQL y el gráfico automáticamente. Guardá las consultas frecuentes para reutilizarlas.',
    accent: 'violet',
  },
  'mapa-reclamos': {
    title: 'Mapa de reclamos',
    description:
      'Vista geográfica de todos los reclamos con coordenadas. Filtrá por categoría, estado o fecha. Las chinchetas se colorean según la categoría del reclamo.',
  },
  'gamificacion': {
    title: 'Gamificación',
    description:
      'Sistema de puntos y medallas para vecinos que participan activamente. Los vecinos ganan puntos al reportar reclamos y pueden canjearlos por recompensas del municipio.',
    accent: 'violet',
  },
  'exportar': {
    title: 'Exportar datos',
    description:
      'Descargá reclamos, trámites o métricas en Excel o CSV. Aplicá filtros de rango de fechas, categoría y estado antes de exportar.',
  },
  'ajustes': {
    title: 'Ajustes del municipio',
    description:
      'Configuración general: branding (logo, colores), ABMs visibles en el sidebar, integración WhatsApp, preferencias de notificación.',
  },
  'audit-logs': {
    title: 'Consola de auditoría',
    accent: 'violet',
    description:
      'Logs en tiempo real de cada request HTTP relevante en el sistema. Filtrá por municipio, endpoint, latencia, status o usuario para investigar incidentes y entender la carga. Activá el "Modo debug" para capturar también GETs y request bodies (aumenta el volumen ~5×). Los logs viejos se borran manualmente con el botón "Limpiar >30d".',
  },

  // ========================================================================
  // BUNDLE DE PAGOS (9 fases)
  // ========================================================================

  'gestion-pagos': {
    title: 'Gestión de Pagos',
    accent: 'emerald',
    steps: [
      {
        title: 'Tres vistas en una sola pantalla',
        description:
          'Historial te muestra todos los pagos aprobados, rechazados o pendientes del checkout. Cola de imputación es donde Contaduría trabaja los pagos que faltan cargar en RAFAM. Dashboard omnicanal muestra cuánto entra por App vs Ventanilla día a día.',
        icon: 'Sparkles',
      },
      {
        title: 'Cola de imputación (uso diario)',
        description:
          'Cada pago aprobado queda "pendiente de imputar" hasta que alguien le pone el N° de asiento del sistema tributario. Desde acá lo marcás imputado uno por uno, lo rechazás con motivo, o seleccionás varios y los imputás en lote pegando las referencias.',
        icon: 'ClipboardList',
      },
      {
        title: 'Exportar batch',
        description:
          'El botón "Exportar batch" arriba te baja un archivo CSV, JSON o TXT RAFAM con todos los pagos del filtro actual. Pegalo en tu sistema contable y los referenciás con el bulk-marcar para cerrar el circuito en segundos.',
        icon: 'FileText',
      },
      {
        title: 'Dashboard omnicanal',
        description:
          'El tablero que le mostrás al intendente: cuánto cobraste hoy por la App, cuánto por Ventanilla, ranking de operadores de mostrador y serie diaria. Ideal para justificar la inversión en digitalización.',
        icon: 'TrendingUp',
      },
      {
        title: 'CUT — Código Único de Trámite',
        description:
          'Cada pago aprobado genera un código corto tipo CUT-A3F2B1. El operador lo escanea o lo tipea para verificar contra el backend que el vecino efectivamente pagó. Evita capturas de WhatsApp editadas.',
        icon: 'Rocket',
      },
    ],
  },

  'proveedores-pago': {
    title: 'Proveedores de pago',
    accent: 'blue',
    steps: [
      {
        title: 'Un proveedor = un rail de cobro',
        description:
          'GIRE, MercadoPago y MODO son los tres canales habilitados. Activás los que tu municipio tenga convenio, y dentro de cada uno elegís qué productos usar (botón de pago web, cupón Rapipago, débito automático, QR interoperable).',
        icon: 'Sparkles',
      },
      {
        title: 'Conectar credenciales reales',
        description:
          'Cada proveedor tiene un botón "Conectar credenciales reales". Ahí pegás el Access Token (se cifra en DB con Fernet antes de guardarse), la Public Key y el CUIT del municipio. Con eso los pagos entran DIRECTO a tu cuenta — Munify nunca custodia fondos.',
        icon: 'ClipboardList',
      },
      {
        title: 'Modo sandbox primero',
        description:
          'Arrancá con el toggle "Modo sandbox" activo y probá TEST-tokens de MP. Cuando todo funcione end-to-end, desactivás sandbox y pegás los tokens APP- reales. La UI muestra un warning grande cuando estás en producción.',
        icon: 'Rocket',
      },
      {
        title: 'Webhook para confirmación automática',
        description:
          'El webhook secret sirve para validar la firma HMAC de los avisos del proveedor. Cuando un pago se aprueba, MP nos avisa, validamos firma y marcamos el pago como aprobado sin intervención del operador.',
        icon: 'Lightbulb',
      },
      {
        title: 'Importar padrón',
        description:
          'Una vez conectado, importá el padrón de cuentas/contribuyentes desde el proveedor. Ese listado se usa para matchear deudas del muni con lo que cobra el proveedor externamente.',
        icon: 'FileText',
      },
    ],
  },

  'mostrador': {
    title: 'Mostrador — Ventanilla asistida',
    accent: 'amber',
    steps: [
      {
        title: '¿Para qué sirve?',
        description:
          'Para vecinos que NO tienen la app: típicamente adultos mayores. El operador de mostrador carga el trámite a nombre del vecino con asistencia biométrica, y le entrega (o envía) el link de pago.',
        icon: 'Sparkles',
      },
      {
        title: 'Paso 1 — Validación biométrica (webcam + DNI)',
        description:
          'Clickeás "Iniciar validación biométrica" y se abre Didit en una ventana. El vecino se escanea el DNI y se saca una selfie frente a la webcam del mostrador. En ~1 minuto el sistema valida contra RENAPER y prellena DNI, nombre y apellido automáticamente. Si Didit no está disponible, podés cargar los datos a mano con tu DJ como respaldo.',
        icon: 'ClipboardList',
      },
      {
        title: 'Paso 2 — Contacto + trámite',
        description:
          'Los datos filiatorios ya vienen de RENAPER (no editables). Completás teléfono (clave para el link WhatsApp) y email. Seleccionás el trámite del catálogo. Si el trámite exige CENAT o KYC, el paso avisa.',
        icon: 'Lightbulb',
      },
      {
        title: 'Paso 3 — Declaración Jurada',
        description:
          'Firmás la DJ de validación presencial. Si ya se hizo biometría, la DJ complementa el KYC; si fue carga manual, la DJ es la huella legal única. Queda grabada con tu usuario + timestamp.',
        icon: 'ClipboardList',
      },
      {
        title: 'Enviar link por WhatsApp',
        description:
          'Si el trámite tiene costo, el sistema arma un link wa.me con el mensaje pre-cargado. Lo abrís en tu WhatsApp Web (o celular del muni) y el mensaje aparece listo para vos apretar "Enviar". El vecino lo recibe en su WhatsApp y paga desde su celular (o un familiar lo hace por él).',
        icon: 'Rocket',
      },
      {
        title: 'Alternativa: pago en efectivo',
        description:
          'Si el vecino paga en la caja física del municipio, después volvé al Mostrador, tocá "El vecino paga en efectivo" y cargás el N° de comprobante del ticket + una foto. Queda como pago aprobado con medio "efectivo_ventanilla" y canal "ventanilla_asistida".',
        icon: 'FileText',
      },
      {
        title: 'Métricas del día',
        description:
          'Arriba ves tu contador personal: cuántos trámites cargaste, cuántos se pagaron, cuánto recaudaste. El Dashboard Omnicanal agrega todos los operadores para el intendente.',
        icon: 'TrendingUp',
      },
    ],
  },
};
