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
          'Para vecinos que NO tienen la app: típicamente adultos mayores. El operador de mostrador carga el trámite a nombre del vecino desde la PC de ventanilla, valida la identidad con el DNI físico y le entrega (o envía) el link de pago.',
        icon: 'Sparkles',
      },
      {
        title: 'Completar el formulario',
        description:
          'DNI, nombre, apellido y trámite son obligatorios. Teléfono y email son opcionales (pero el teléfono es ideal para mandar el link de pago por WhatsApp). Si el vecino ya existe en el sistema, sus datos se precargan solos.',
        icon: 'ClipboardList',
      },
      {
        title: 'Firmar la Declaración Jurada',
        description:
          'Antes de iniciar tenés que tildar "Confirmo validación presencial". Esa DJ queda grabada con tu usuario y timestamp, y el vecino queda marcado como KYC assisted — verificado por vos, no por la app. Es la huella legal de que viste el DNI.',
        icon: 'Lightbulb',
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
