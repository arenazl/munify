import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

const getApiUrl = () => {
  // Si hay URL completa configurada, usarla
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl;
  }

  // Usar puerto configurable (default 8000)
  const port = import.meta.env.VITE_API_PORT || '8000';
  const host = window.location.hostname || 'localhost';

  return `http://${host}:${port}/api`;
};

export const API_URL = getApiUrl();
export const API_BASE_URL = API_URL.replace('/api', '');
console.log('🔗 API URL:', API_URL);

if (!API_URL) {
  console.error('VITE_API_URL no está configurado en .env');
}

// ============================================
// Sistema de Caché con TTL para datos estáticos
// ============================================
// Cachea respuestas de endpoints que raramente cambian
// (categorías, tipos, zonas) para evitar llamadas innecesarias

interface CachedResponse {
  data: AxiosResponse;
  timestamp: number;
  ttl: number;
}

// Caché de respuestas (key = URL + params)
const responseCache = new Map<string, CachedResponse>();

// Configuración de TTL por endpoint (en milisegundos)
const CACHE_TTL_CONFIG: Record<string, number> = {
  '/categorias': 5 * 60 * 1000,           // 5 minutos
  '/zonas': 5 * 60 * 1000,                // 5 minutos
  '/tramites/tipos': 5 * 60 * 1000,       // 5 minutos
  '/tramites/catalogo': 3 * 60 * 1000,    // 3 minutos
  '/publico/categorias': 5 * 60 * 1000,   // 5 minutos
  '/publico/zonas': 5 * 60 * 1000,        // 5 minutos
  '/empleados': 2 * 60 * 1000,            // 2 minutos (cambia más seguido)
};

// Obtener TTL para un endpoint
const getCacheTTL = (url: string): number | null => {
  for (const [pattern, ttl] of Object.entries(CACHE_TTL_CONFIG)) {
    if (url.startsWith(pattern)) {
      return ttl;
    }
  }
  return null;
};

// Verificar si una respuesta cacheada es válida
const isCacheValid = (cached: CachedResponse): boolean => {
  return Date.now() - cached.timestamp < cached.ttl;
};

// Invalidar caché para un patrón de URL
export const invalidateCache = (urlPattern: string) => {
  for (const key of responseCache.keys()) {
    if (key.includes(urlPattern)) {
      responseCache.delete(key);
      console.log(`🗑️ [CACHE] Invalidado: ${key}`);
    }
  }
};

// Invalidar todo el caché
export const clearCache = () => {
  responseCache.clear();
  console.log('🗑️ [CACHE] Limpiado completamente');
};

// ============================================
// Sistema de Deduplicación de Requests
// ============================================
// Evita llamadas duplicadas cuando múltiples componentes
// solicitan los mismos datos simultáneamente

interface PendingRequest {
  promise: Promise<AxiosResponse>;
  timestamp: number;
}

// Mapa de requests en vuelo (key = URL + params)
const pendingRequests = new Map<string, PendingRequest>();

// Generar clave única para un request GET
const getRequestKey = (config: AxiosRequestConfig): string | null => {
  // Solo deduplicar GETs (no mutaciones)
  if (config.method?.toLowerCase() !== 'get') return null;

  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${url}|${params}`;
};

// Limpiar requests completados después de un tiempo
const DEDUP_WINDOW_MS = 100; // Ventana de 100ms para deduplicar

const cleanupPendingRequest = (key: string) => {
  setTimeout(() => {
    pendingRequests.delete(key);
  }, DEDUP_WINDOW_MS);
};

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token y municipio seleccionado
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Agregar municipio seleccionado (para multi-tenant)
  const municipioId = localStorage.getItem('municipio_actual_id');
  if (municipioId) {
    config.headers['X-Municipio-ID'] = municipioId;
  }

  return config;
});

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // No redirigir en páginas públicas donde se espera que el usuario no esté autenticado
      const publicPaths = ['/nuevo-reclamo', '/publico', '/bienvenido', '/register', '/app'];
      const currentPath = window.location.pathname;
      const isPublicPath = publicPaths.some(path => currentPath.startsWith(path));

      if (!isPublicPath) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================
// API con Caché + Deduplicación
// ============================================
// Guardar referencia al get original ANTES de crear el wrapper
const originalGet = api.get.bind(api);

// Función que envuelve api.get() con caché TTL + deduplicación
const cachedDedupGet = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
  const key = getRequestKey({ ...config, url, method: 'get' });

  // Si no es deduplicable o no hay key, hacer request normal
  if (!key) {
    return originalGet<T>(url, config);
  }

  // 1. Verificar caché primero
  const ttl = getCacheTTL(url);
  if (ttl) {
    const cached = responseCache.get(key);
    if (cached && isCacheValid(cached)) {
      console.log(`💾 [CACHE] Hit: ${url}`);
      return Promise.resolve(cached.data as AxiosResponse<T>);
    }
  }

  // 2. Si ya hay un request en vuelo para esta key, reutilizarlo
  const pending = pendingRequests.get(key);
  if (pending) {
    console.log(`🔄 [DEDUP] Reutilizando request en vuelo: ${url}`);
    return pending.promise as Promise<AxiosResponse<T>>;
  }

  // 3. Crear nuevo request y guardarlo (usar originalGet para evitar recursión)
  const promise = originalGet<T>(url, config).then((response) => {
    // Guardar en caché si tiene TTL configurado
    if (ttl) {
      responseCache.set(key, { data: response, timestamp: Date.now(), ttl });
      console.log(`💾 [CACHE] Stored: ${url} (TTL: ${ttl / 1000}s)`);
    }
    return response;
  }).finally(() => {
    cleanupPendingRequest(key);
  });

  pendingRequests.set(key, { promise, timestamp: Date.now() });
  return promise;
};

// Reemplazar api.get con versión con caché + deduplicación
api.get = cachedDedupGet as typeof api.get;

// Exportar api original sin dedup para casos especiales
export const apiRaw = {
  get: originalGet,
  post: api.post.bind(api),
  put: api.put.bind(api),
  patch: api.patch.bind(api),
  delete: api.delete.bind(api),
};

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: { email: string; password: string; nombre: string; apellido: string; es_anonimo?: boolean; telefono?: string }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.post('/auth/register', {
      ...data,
      municipio_id: municipioId ? parseInt(municipioId) : null
    });
  },
  me: () => api.get('/auth/me'),
  checkEmail: (email: string) => api.get<{ exists: boolean }>('/auth/check-email', { params: { email } }),
};

// Reclamos
export const reclamosApi = {
  getAll: (params?: Record<string, string | number>) => api.get('/reclamos', { params }),
  getMisReclamos: (params?: { skip?: number; limit?: number }) => api.get('/reclamos/mis-reclamos', { params }),
  getMisEstadisticas: () => api.get('/reclamos/mis-estadisticas'),
  getMiHistorial: (params?: { skip?: number; limit?: number; estado?: string }) =>
    api.get('/reclamos/mi-historial', { params }),
  getOne: (id: number) => api.get(`/reclamos/${id}`),
  getHistorial: (id: number) => api.get(`/reclamos/${id}/historial`),
  create: (data: Record<string, unknown>) => api.post('/reclamos', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/reclamos/${id}`, data),
  asignar: (id: number, data: {
    empleado_id: number;
    fecha_programada?: string;
    hora_inicio?: string;
    hora_fin?: string;
    comentario?: string
  }) => api.post(`/reclamos/${id}/asignar`, data),
  iniciar: (id: number) => api.post(`/reclamos/${id}/iniciar`),
  resolver: (id: number, data: { resolucion: string }) => api.post(`/reclamos/${id}/resolver`, data),
  confirmar: (id: number, comentario?: string) =>
    api.post(`/reclamos/${id}/confirmar`, null, { params: comentario ? { comentario } : {} }),
  devolver: (id: number, motivo: string) =>
    api.post(`/reclamos/${id}/devolver`, null, { params: { motivo } }),
  rechazar: (id: number, data: { motivo: string; descripcion?: string }) =>
    api.post(`/reclamos/${id}/rechazar`, data),
  agregarComentario: (id: number, comentario: string) =>
    api.post(`/reclamos/${id}/comentario`, { comentario }),
  // PATCH para cambiar estado via drag & drop en Kanban
  cambiarEstado: (id: number, estado: string, comentario?: string) =>
    api.patch(`/reclamos/${id}`, null, { params: { nuevo_estado: estado, ...(comentario ? { comentario } : {}) } }),
  upload: (id: number, file: File, etapa: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/reclamos/${id}/upload?etapa=${etapa}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getDisponibilidadEmpleado: (empleadoId: number, fecha: string, buscarSiguiente: boolean = false) =>
    api.get(`/reclamos/empleado/${empleadoId}/disponibilidad/${fecha}`, { params: { buscar_siguiente: buscarSiguiente } }),
  getSugerenciaAsignacion: (reclamoId: number) =>
    api.get(`/reclamos/${reclamoId}/sugerencia-asignacion`),
  getSimilares: (params: {
    categoria_id: number;
    latitud?: number;
    longitud?: number;
    radio_metros?: number;
    dias_atras?: number;
    limit?: number;
  }) => api.get('/reclamos/similares', { params }),
  getRecurrentes: (params?: {
    limit?: number;
    dias_atras?: number;
    min_similares?: number;
    municipio_id?: number;
  }) => api.get('/reclamos/recurrentes', { params }),
  getCantidadSimilares: (reclamoId: number) =>
    api.get(`/reclamos/${reclamoId}/cantidad-similares`),
};

// Categorías
export const categoriasApi = {
  // Catálogo maestro (TODAS las categorías)
  getCatalogo: (activo?: boolean) => api.get('/categorias/catalogo', { params: activo !== undefined ? { activo } : {} }),
  // Categorías habilitadas para el municipio del usuario
  getAll: (activo?: boolean) => api.get('/categorias', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/categorias/${id}`),
  create: (data: Record<string, unknown>) => api.post('/categorias', data).then(res => { invalidateCache('/categorias'); return res; }),
  update: (id: number, data: Record<string, unknown>) => api.put(`/categorias/${id}`, data).then(res => { invalidateCache('/categorias'); return res; }),
  delete: (id: number) => api.delete(`/categorias/${id}`).then(res => { invalidateCache('/categorias'); return res; }),
  // IDs de categorías habilitadas para el municipio
  getHabilitadas: () => api.get<number[]>('/categorias/municipio/habilitadas'),
  // Habilitar/deshabilitar categoría para el municipio
  habilitar: (categoriaId: number) =>
    api.post(`/categorias/${categoriaId}/habilitar`).then(res => { invalidateCache('/categorias'); return res; }),
  deshabilitar: (categoriaId: number) =>
    api.delete(`/categorias/${categoriaId}/deshabilitar`).then(res => { invalidateCache('/categorias'); return res; }),
  habilitarTodas: () =>
    api.post('/categorias/habilitar-todas').then(res => { invalidateCache('/categorias'); return res; }),
};

// Zonas
export const zonasApi = {
  getAll: (activo?: boolean) => api.get('/zonas', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/zonas/${id}`),
  create: (data: Record<string, unknown>) => api.post('/zonas', data).then(res => { invalidateCache('/zonas'); return res; }),
  update: (id: number, data: Record<string, unknown>) => api.put(`/zonas/${id}`, data).then(res => { invalidateCache('/zonas'); return res; }),
  delete: (id: number) => api.delete(`/zonas/${id}`).then(res => { invalidateCache('/zonas'); return res; }),
};

// Direcciones (unidades organizativas municipales)
export const direccionesApi = {
  getAll: (params?: { activo?: boolean; tipo_gestion?: string }) =>
    api.get('/direcciones', { params }),
  getOne: (id: number) => api.get(`/direcciones/${id}`),
  create: (data: Record<string, unknown>) =>
    api.post('/direcciones', data).then(res => { invalidateCache('/direcciones'); return res; }),
  update: (id: number, data: Record<string, unknown>) =>
    api.put(`/direcciones/${id}`, data).then(res => { invalidateCache('/direcciones'); return res; }),
  delete: (id: number) =>
    api.delete(`/direcciones/${id}`).then(res => { invalidateCache('/direcciones'); return res; }),
  // Asignación de categorías
  getCategorias: (direccionId: number) => api.get(`/direcciones/${direccionId}/categorias`),
  asignarCategorias: (direccionId: number, categoriaIds: number[]) =>
    api.post(`/direcciones/${direccionId}/categorias`, { categoria_ids: categoriaIds }),
  // Asignación de tipos de trámite
  getTiposTramite: (direccionId: number) => api.get(`/direcciones/${direccionId}/tipos-tramite`),
  asignarTiposTramite: (direccionId: number, tipoTramiteIds: number[]) =>
    api.post(`/direcciones/${direccionId}/tipos-tramite`, { tipo_tramite_ids: tipoTramiteIds }),
  // Para configuración / drag & drop
  getCategoriasDisponibles: () => api.get('/direcciones/configuracion/categorias-disponibles'),
  getTiposTramiteDisponibles: () => api.get('/direcciones/configuracion/tipos-tramite-disponibles'),
};

// Dependencias (nuevo modelo desacoplado)
export const dependenciasApi = {
  // Catálogo global
  getCatalogo: (params?: { activo?: boolean; tipo_gestion?: string }) =>
    api.get('/dependencias/catalogo', { params }),
  createCatalogo: (data: Record<string, unknown>) =>
    api.post('/dependencias/catalogo', data).then(res => { invalidateCache('/dependencias'); return res; }),
  updateCatalogo: (id: number, data: Record<string, unknown>) =>
    api.put(`/dependencias/catalogo/${id}`, data).then(res => { invalidateCache('/dependencias'); return res; }),

  // Dependencias del municipio actual
  getMunicipio: (params?: { activo?: boolean; tipo_gestion?: string; include_assignments?: boolean }) =>
    api.get('/dependencias/municipio', { params }),
  getOneMunicipio: (id: number) => api.get(`/dependencias/municipio/${id}`),
  habilitarDependencias: (dependenciaIds: number[]) =>
    api.post('/dependencias/municipio/habilitar', { dependencia_ids: dependenciaIds })
      .then(res => { invalidateCache('/dependencias'); return res; }),
  updateMunicipio: (id: number, data: Record<string, unknown>) =>
    api.put(`/dependencias/municipio/${id}`, data).then(res => { invalidateCache('/dependencias'); return res; }),
  deshabilitarDependencia: (id: number) =>
    api.delete(`/dependencias/municipio/${id}`).then(res => { invalidateCache('/dependencias'); return res; }),

  // Asignación de categorías a una dependencia del municipio
  getCategorias: (muniDepId: number) => api.get(`/dependencias/municipio/${muniDepId}/categorias`),
  asignarCategorias: (muniDepId: number, categoriaIds: number[]) =>
    api.post(`/dependencias/municipio/${muniDepId}/categorias`, { categoria_ids: categoriaIds }),

  // Asignación de tipos de trámite a una dependencia del municipio
  getTiposTramite: (muniDepId: number) => api.get(`/dependencias/municipio/${muniDepId}/tipos-tramite`),
  asignarTiposTramite: (muniDepId: number, tipoTramiteIds: number[]) =>
    api.post(`/dependencias/municipio/${muniDepId}/tipos-tramite`, { tipo_tramite_ids: tipoTramiteIds }),

  // Asignación de trámites específicos a una dependencia del municipio
  getTramites: (muniDepId: number) => api.get(`/dependencias/municipio/${muniDepId}/tramites`),
  asignarTramites: (muniDepId: number, tramiteIds: number[]) =>
    api.post(`/dependencias/municipio/${muniDepId}/tramites`, { tramite_ids: tramiteIds }),
};

// Empleados
export const empleadosApi = {
  getAll: (activo?: boolean) => api.get('/empleados', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/empleados/${id}`),
  create: (data: Record<string, unknown>) => api.post('/empleados', data).then(res => { invalidateCache('/empleados'); return res; }),
  update: (id: number, data: Record<string, unknown>) => api.put(`/empleados/${id}`, data).then(res => { invalidateCache('/empleados'); return res; }),
  delete: (id: number) => api.delete(`/empleados/${id}`).then(res => { invalidateCache('/empleados'); return res; }),
  // Obtener empleados con disponibilidad y horarios, ordenados por disponibilidad
  getDisponibilidad: (tipo?: 'operario' | 'administrativo') =>
    api.get('/empleados/disponibilidad', { params: tipo ? { tipo } : {} }),
};

// Usuarios
export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id: number) => api.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
  // Perfil propio
  getMyProfile: () => api.get('/users/me'),
  updateMyProfile: (data: { nombre?: string; apellido?: string; telefono?: string; dni?: string; direccion?: string }) =>
    api.put('/users/me', data),
};

// Dashboard
export const dashboardApi = {
  getConfig: () => api.get('/dashboard/config'),
  getStats: () => api.get('/dashboard/stats'),
  getMisStats: () => api.get('/dashboard/mis-stats'),
  getEmpleadoStats: () => api.get('/dashboard/empleado-stats'),
  getPorCategoria: () => api.get('/dashboard/por-categoria'),
  getPorZona: () => api.get('/dashboard/por-zona'),
  getTendencia: (dias?: number) => api.get('/dashboard/tendencia', { params: dias ? { dias } : {} }),
  getMetricasAccion: () => api.get('/dashboard/metricas-accion'),
  getMetricasDetalle: () => api.get('/dashboard/metricas-detalle'),
  getRecurrentes: (dias?: number, minReclamos?: number) => api.get('/dashboard/recurrentes', { params: { dias: dias || 90, min_reclamos: minReclamos || 2 } }),
  getConteoCategorias: (estado?: string) => api.get('/dashboard/conteo-categorias', { params: estado ? { estado } : {} }),
  getConteoEstados: () => api.get('/dashboard/conteo-estados'),
};

// Notificaciones
export const notificacionesApi = {
  getAll: (leidas?: boolean) => api.get('/notificaciones', { params: leidas !== undefined ? { leidas } : {} }),
  getCount: () => api.get('/notificaciones/count'),
  marcarLeida: (id: number) => api.put(`/notificaciones/${id}/leer`),
  marcarTodasLeidas: () => api.put('/notificaciones/leer-todas'),
};

// Configuración
export const configuracionApi = {
  getAll: () => api.get('/configuracion'),
  get: (clave: string) => api.get(`/configuracion/${clave}`),
  getPublica: (clave: string) => {
    const municipioId = localStorage.getItem('municipio_id');
    const params = municipioId ? { municipio_id: municipioId } : {};
    return api.get(`/configuracion/publica/${clave}`, { params });
  },
  update: (clave: string, data: { valor: string; municipio_id?: number | null }) => api.put(`/configuracion/${clave}`, data),
  // Dashboard config
  getDashboardConfig: (rol: string) => api.get(`/configuracion/dashboard/${rol}`),
  updateDashboardConfig: (rol: string, config: object) => api.put(`/configuracion/dashboard/${rol}`, config),
};

// Municipios
export const municipiosApi = {
  getAll: () => api.get('/municipios'),
  getOne: (id: number) => api.get(`/municipios/${id}`),
  updateBranding: (id: number, formData: FormData) =>
    api.post(`/municipios/${id}/branding`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateTema: (id: number, tema: any) => api.put(`/municipios/${id}/tema`, tema),
  updateImagenPortada: (id: number, formData: FormData) =>
    api.post(`/municipios/${id}/imagen-portada`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteImagenPortada: (id: number) => api.delete(`/municipios/${id}/imagen-portada`),
  updateSidebarBg: (id: number, formData: FormData) =>
    api.post(`/municipios/${id}/sidebar-bg`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  // ABM de municipios (solo super admin)
  create: (data: {
    nombre: string;
    codigo: string;
    latitud: number;
    longitud: number;
    radio_km: number;
    color_primario: string;
    activo: boolean;
  }) => api.post('/municipios', data),
  update: (id: number, data: object) => api.put(`/municipios/${id}`, data),
  delete: (id: number) => api.delete(`/municipios/${id}`),
  // Barrios (se cargan automáticamente)
  getBarrios: (municipioId: number) => api.get(`/municipios/${municipioId}/barrios`),
  cargarBarrios: (municipioId: number) => api.post(`/municipios/${municipioId}/barrios/cargar`),
  // Generar direcciones con IA
  generarDirecciones: (municipioId: number) => api.post(`/municipios/${municipioId}/direcciones/generar`),
};

// Chat IA
export const chatApi = {
  sendMessage: async (message: string, history: Array<{role: string, content: string}> = []) => {
    const response = await api.post('/chat', { message, history });
    return response.data;
  },

  /**
   * Chat dinámico genérico - acepta cualquier contexto
   * @param pregunta - La pregunta del usuario
   * @param contexto - Objeto con cualquier dato relevante (se convierte en prompt)
   * @param tipo - Tipo de contexto: 'tramite', 'reclamo', 'consulta', 'empleado'
   *
   * Ejemplo de uso:
   * chatApi.askDynamic("¿Qué documentos necesito?", {
   *   nombre_tramite: "Habilitación comercial",
   *   documentos: "DNI, Contrato, etc",
   *   costo: 15000,
   *   tiempo_dias: 30
   * }, "tramite")
   */
  askDynamic: async (pregunta: string, contexto: Record<string, unknown> = {}, tipo?: string) => {
    const response = await api.post('/chat/dinamico', { pregunta, contexto, tipo });
    return response.data;
  },

  /**
   * Asistente con acceso a datos del municipio
   * Solo para admin, supervisor y empleados
   * Tiene acceso a estadísticas de reclamos, trámites, empleados, etc.
   */
  asistente: async (message: string, history: Array<{role: string, content: string}> = []) => {
    const response = await api.post('/chat/asistente', { message, history });
    return response.data;
  },

  /**
   * Consulta gerencial con SQL dinámico (con paginación e historial)
   * La IA genera el SQL necesario para responder consultas complejas.
   * Solo para admin, supervisor y empleados.
   * Devuelve: { response: string (HTML), sql_ejecutado: string, datos_crudos: any[], total_registros, page, page_size }
   */
  consulta: async (pregunta: string, page: number = 1, page_size: number = 50, historial: Array<{role: string; content: string}> = []): Promise<{
    response: string;
    sql_ejecutado: string | null;
    datos_crudos: any[] | null;
    total_registros: number | null;
    page: number;
    page_size: number;
    mostrar_grilla: boolean;
  }> => {
    const response = await api.post('/chat/consulta', { pregunta, page, page_size, historial });
    return response.data;
  },

  /**
   * Regenera el cache del schema de la BD
   * Solo para admins. Usar después de agregar tablas/columnas.
   */
  refreshSchema: async () => {
    const response = await api.post('/chat/refresh-schema');
    return response.data;
  },

  /**
   * 
   * Obtiene KPIs en tiempo real para el panel BI
   */
  getKPIs: async (): Promise<{
    reclamos: {
      total: number;
      pendientes: number;
      nuevos: number;
      asignados: number;
      en_proceso: number;
      resueltos: number;
      hoy: number;
      esta_semana: number;
      este_mes: number;
    };
    tramites: {
      total: number;
      iniciados: number;
      en_revision: number;
      en_proceso: number;
      aprobados: number;
      esta_semana: number;
    };
    empleados: {
      total: number;
      activos: number;
    };
    tendencias: {
      reclamos_cambio_semanal: number;
      reclamos_semana_pasada: number;
    };
  }> => {
    const response = await api.get('/chat/kpis');
    return response.data;
  },

  /**
   * Obtiene la lista de entidades/tablas disponibles para consultas
   */
  getEntities: async (): Promise<{
    entities: Array<{
      nombre: string;
      tabla: string;
      icono: string;
      descripcion: string;
      campos: Array<{ name: string; type: string; fk: string | null }>;
    }>;
  }> => {
    const response = await api.get('/chat/entities');
    return response.data;
  },

  /**
   * Obtiene el schema de la DB para autocompletado
   */
  getSchema: async (): Promise<{
    tables: Record<string, Array<{
      name: string;
      type: string;
      fk: string | null;
    }>>;
  }> => {
    const response = await api.get('/chat/schema');
    return response.data;
  },

  /**
   * Lista consultas guardadas (propias + públicas)
   */
  getConsultasGuardadas: async (): Promise<Array<{
    id: number;
    nombre: string;
    descripcion: string | null;
    pregunta_original: string;
    sql_query: string | null;
    icono: string;
    color: string;
    tipo_visualizacion: string;
    es_publica: boolean;
    veces_ejecutada: number;
    created_at: string;
    usuario_nombre: string | null;
  }>> => {
    const response = await api.get('/chat/consultas-guardadas');
    return response.data;
  },

  /**
   * Crea una nueva consulta guardada
   */
  crearConsultaGuardada: async (data: {
    nombre: string;
    descripcion?: string;
    pregunta_original: string;
    sql_query?: string;
    icono?: string;
    color?: string;
    tipo_visualizacion?: string;
    es_publica?: boolean;
  }) => {
    const response = await api.post('/chat/consultas-guardadas', data);
    return response.data;
  },

  /**
   * Actualiza una consulta guardada
   */
  actualizarConsultaGuardada: async (id: number, data: {
    nombre?: string;
    descripcion?: string;
    icono?: string;
    color?: string;
    tipo_visualizacion?: string;
    es_publica?: boolean;
  }) => {
    const response = await api.put(`/chat/consultas-guardadas/${id}`, data);
    return response.data;
  },

  /**
   * Elimina una consulta guardada
   */
  eliminarConsultaGuardada: async (id: number) => {
    const response = await api.delete(`/chat/consultas-guardadas/${id}`);
    return response.data;
  },

  /**
   * Ejecuta una consulta guardada y devuelve resultados
   */
  ejecutarConsultaGuardada: async (id: number): Promise<{
    response: string;
    sql_ejecutado: string | null;
    datos_crudos: any[] | null;
  }> => {
    const response = await api.post(`/chat/consultas-guardadas/${id}/ejecutar`);
    return response.data;
  },

  getStatus: () => api.get('/chat/status'),
};

// Clasificación IA
export const clasificacionApi = {
  clasificar: async (texto: string, municipioId: number, usarIa: boolean = true) => {
    const response = await api.post('/publico/clasificar', {
      texto,
      municipio_id: municipioId,
      usar_ia: usarIa,
    });
    return response.data;
  },
  clasificarTramite: async (texto: string, municipioId: number, usarIa: boolean = true) => {
    const response = await api.post('/tramites/clasificar', {
      texto,
      municipio_id: municipioId,
      usar_ia: usarIa,
    });
    return response.data;
  },
};

// SLA
export const slaApi = {
  getConfigs: () => api.get('/sla/config'),
  createConfig: (data: {
    categoria_id?: number;
    prioridad?: number;
    tiempo_respuesta: number;
    tiempo_resolucion: number;
    tiempo_alerta_amarilla: number;
    activo: boolean;
  }) => api.post('/sla/config', data),
  updateConfig: (id: number, data: {
    categoria_id?: number;
    prioridad?: number;
    tiempo_respuesta: number;
    tiempo_resolucion: number;
    tiempo_alerta_amarilla: number;
    activo: boolean;
  }) => api.put(`/sla/config/${id}`, data),
  deleteConfig: (id: number) => api.delete(`/sla/config/${id}`),
  getEstadoReclamos: (soloActivos?: boolean, soloVencidos?: boolean) =>
    api.get('/sla/estado-reclamos', { params: { solo_activos: soloActivos, solo_vencidos: soloVencidos } }),
  getResumen: () => api.get('/sla/resumen'),
  getAlertas: () => api.get('/sla/alertas'),
};

// Exportación de informes
export const exportarApi = {
  reclamosCsv: (params?: {
    estado?: string;
    categoria_id?: number;
    zona_id?: number;
    empleado_id?: number;
    fecha_desde?: string;
    fecha_hasta?: string;
  }) => api.get('/exportar/reclamos/csv', { params, responseType: 'blob' }),
  estadisticasCsv: (dias?: number) =>
    api.get('/exportar/estadisticas/csv', { params: { dias }, responseType: 'blob' }),
  empleadosCsv: () =>
    api.get('/exportar/empleados/csv', { responseType: 'blob' }),
  slaCsv: () =>
    api.get('/exportar/sla/csv', { responseType: 'blob' }),
};

// Portal público (sin auth)
export const publicoApi = {
  getEstadisticas: () => api.get('/publico/estadisticas'),
  getEstadisticasMunicipio: (municipioId: number) => api.get('/publico/estadisticas/municipio', { params: { municipio_id: municipioId } }),
  getTendencias: (dias?: number) => api.get('/publico/tendencias', { params: { dias } }),
  getCategorias: (municipioId?: number) => api.get('/publico/categorias', { params: { municipio_id: municipioId } }),
  getZonas: (municipioId?: number) => api.get('/publico/zonas', { params: { municipio_id: municipioId } }),
  getConfigRegistro: () => api.get('/configuracion/publica/registro'),
  chatConsulta: (message: string, history: { role: string; content: string }[], municipioId?: number) =>
    api.post('/publico/chat', { message, history, municipio_id: municipioId }),

  /**
   * Chat de landing con sesiones persistentes
   * Mantiene el contexto de la conversación con session_id
   */
  chatLanding: async (message: string, sessionId?: string, municipioId?: number): Promise<{
    response: string;
    session_id: string;
    municipio_id: number | null;
    municipio_nombre: string | null;
  }> => {
    const response = await api.post('/chat/landing', {
      message,
      session_id: sessionId,
      municipio_id: municipioId
    });
    return response.data;
  },
};

// Alias para compatibilidad
export const publicApi = publicoApi;

// Analytics avanzados
export const analyticsApi = {
  getHeatmap: (dias?: number, categoriaId?: number) =>
    api.get('/analytics/heatmap', { params: { dias, categoria_id: categoriaId } }),
  getClusters: (radioKm?: number, minReclamos?: number, dias?: number) =>
    api.get('/analytics/clusters', { params: { radio_km: radioKm, min_reclamos: minReclamos, dias } }),
  getDistancias: (dias?: number) =>
    api.get('/analytics/distancias', { params: { dias } }),
  getCobertura: (dias?: number) =>
    api.get('/analytics/cobertura', { params: { dias } }),
  getTiempoResolucion: (dias?: number) =>
    api.get('/analytics/tiempo-resolucion', { params: { dias } }),
  getRendimientoEmpleados: (semanas?: number) =>
    api.get('/analytics/rendimiento-empleados', { params: { semanas } }),
};

// Imágenes
export const imagenesApi = {
  buscar: (query: string, tipo: 'general' | 'categoria' = 'general') =>
    api.get('/imagenes/buscar', { params: { q: query, tipo } }),
  getCategoria: (nombre: string) =>
    api.get(`/imagenes/categoria/${encodeURIComponent(nombre)}`),
  // Helper para construir URL completa de imagen estática
  getStaticUrl: (path: string | null): string | null => {
    if (!path) return null;
    // Si ya es URL absoluta, retornarla
    if (path.startsWith('http')) return path;
    // Construir URL del backend para archivos estáticos
    const baseUrl = API_URL.replace('/api', '');
    return `${baseUrl}${path}`;
  },
};

// Gamificación
export const gamificacionApi = {
  // Perfil y puntos
  getMiPerfil: () => api.get('/gamificacion/mi-perfil'),
  getPerfil: (userId: number) => api.get(`/gamificacion/perfil/${userId}`),
  getMisPuntos: () => api.get('/gamificacion/mis-puntos'),

  // Badges
  getMisBadges: () => api.get('/gamificacion/mis-badges'),
  getBadgesDisponibles: () => api.get('/gamificacion/badges-disponibles'),

  // Leaderboard
  getLeaderboard: (params?: { zona_id?: number; periodo?: 'mes' | 'total'; limite?: number }) =>
    api.get('/gamificacion/leaderboard', { params }),
  getMiPosicion: (periodo?: 'mes' | 'total') =>
    api.get('/gamificacion/mi-posicion', { params: { periodo } }),

  // Historial
  getHistorial: (limite?: number) =>
    api.get('/gamificacion/historial', { params: { limite } }),

  // Recompensas
  getRecompensas: () => api.get('/gamificacion/recompensas'),
  canjearRecompensa: (recompensaId: number) =>
    api.post('/gamificacion/recompensas/canjear', { recompensa_id: recompensaId }),
  getMisCanjes: () => api.get('/gamificacion/mis-canjes'),

  // Admin
  crearRecompensa: (data: {
    nombre: string;
    descripcion?: string;
    icono?: string;
    puntos_requeridos: number;
    stock?: number;
    fecha_inicio?: string;
    fecha_fin?: string;
  }) => api.post('/gamificacion/recompensas', data),
  actualizarRecompensa: (id: number, data: {
    nombre: string;
    descripcion?: string;
    icono?: string;
    puntos_requeridos: number;
    stock?: number;
    fecha_inicio?: string;
    fecha_fin?: string;
  }) => api.put(`/gamificacion/recompensas/${id}`, data),
  eliminarRecompensa: (id: number) => api.delete(`/gamificacion/recompensas/${id}`),
  getCanjesPendientes: () => api.get('/gamificacion/admin/canjes-pendientes'),
  entregarCanje: (canjeId: number) => api.post(`/gamificacion/admin/entregar-canje/${canjeId}`),
};

// WhatsApp
export const whatsappApi = {
  // Configuración
  getConfig: () => api.get('/whatsapp/config'),
  getConfigFull: () => api.get('/whatsapp/config/full'),
  createConfig: (data: {
    habilitado?: boolean;
    provider?: 'meta' | 'twilio';
    meta_phone_number_id?: string;
    meta_access_token?: string;
    meta_business_account_id?: string;
    meta_webhook_verify_token?: string;
    twilio_account_sid?: string;
    twilio_auth_token?: string;
    twilio_phone_number?: string;
    notificar_reclamo_recibido?: boolean;
    notificar_reclamo_asignado?: boolean;
    notificar_cambio_estado?: boolean;
    notificar_reclamo_resuelto?: boolean;
    notificar_comentarios?: boolean;
  }) => api.post('/whatsapp/config', data),
  updateConfig: (data: {
    habilitado?: boolean;
    provider?: 'meta' | 'twilio';
    meta_phone_number_id?: string;
    meta_access_token?: string;
    meta_business_account_id?: string;
    meta_webhook_verify_token?: string;
    twilio_account_sid?: string;
    twilio_auth_token?: string;
    twilio_phone_number?: string;
    notificar_reclamo_recibido?: boolean;
    notificar_reclamo_asignado?: boolean;
    notificar_cambio_estado?: boolean;
    notificar_reclamo_resuelto?: boolean;
    notificar_comentarios?: boolean;
  }) => api.put('/whatsapp/config', data),
  deleteConfig: () => api.delete('/whatsapp/config'),

  // Test
  testMessage: (data: { telefono: string; mensaje?: string }) =>
    api.post('/whatsapp/test', data),

  // Logs y estadísticas
  getLogs: (params?: { skip?: number; limit?: number }) =>
    api.get('/whatsapp/logs', { params }),
  getLogsByReclamo: (reclamoId: number) =>
    api.get(`/whatsapp/logs/reclamo/${reclamoId}`),
  getStats: () => api.get('/whatsapp/stats'),

  // Notificaciones manuales
  notificarReclamoRecibido: (reclamoId: number) =>
    api.post(`/whatsapp/notificar/reclamo-recibido/${reclamoId}`),
  notificarCambioEstado: (reclamoId: number) =>
    api.post(`/whatsapp/notificar/cambio-estado/${reclamoId}`),
  notificarReclamoResuelto: (reclamoId: number) =>
    api.post(`/whatsapp/notificar/reclamo-resuelto/${reclamoId}`),

  // Reenviar mensaje fallido
  resend: (reclamoId: number, tipoMensaje: string) => {
    // Mapear tipo de mensaje al endpoint correspondiente
    const endpointMap: Record<string, string> = {
      reclamo_recibido: 'reclamo-recibido',
      reclamo_asignado: 'reclamo-asignado',
      cambio_estado: 'cambio-estado',
      reclamo_resuelto: 'reclamo-resuelto',
    };
    const endpoint = endpointMap[tipoMensaje] || 'cambio-estado';
    return api.post(`/whatsapp/notificar/${endpoint}/${reclamoId}`);
  },
};

// Tramites - Nueva estructura de 3 niveles
export const tramitesApi = {
  // ============================================
  // NIVEL 1: Tipos de Trámite (categorías)
  // ============================================
  getTipos: (params?: { solo_activos?: boolean }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/tipos', {
      params: { municipio_id: municipioId, solo_activos: params?.solo_activos ?? true }
    });
  },
  // Catálogo completo (para configuración de superusuario)
  getTiposCatalogo: (params?: { solo_activos?: boolean }) =>
    api.get('/tramites/tipos/catalogo', {
      params: { solo_activos: params?.solo_activos ?? true }
    }),
  getTipo: (id: number) => api.get(`/tramites/tipos/${id}`),
  createTipo: (data: Record<string, unknown>) => {
    const municipioId = localStorage.getItem('municipio_id');
    // municipio_id es opcional (superadmin no tiene municipio) - va como query param
    const params = municipioId ? { municipio_id: municipioId } : {};
    return api.post('/tramites/tipos', data, { params }).then(res => { invalidateCache('/tramites/tipos'); return res; });
  },
  updateTipo: (id: number, data: Record<string, unknown>) =>
    api.put(`/tramites/tipos/${id}`, data).then(res => { invalidateCache('/tramites/tipos'); return res; }),
  deleteTipo: (id: number) => api.delete(`/tramites/tipos/${id}`).then(res => { invalidateCache('/tramites/tipos'); return res; }),

  // ============================================
  // NIVEL 2: Catálogo de Trámites
  // ============================================
  getCatalogo: (params?: { tipo_tramite_id?: number; solo_activos?: boolean }) =>
    api.get('/tramites/catalogo', { params: { ...params, solo_activos: params?.solo_activos ?? true } }),
  getTramite: (id: number) => api.get(`/tramites/catalogo/${id}`),
  createTramite: (data: Record<string, unknown>) => {
    const municipioId = localStorage.getItem('municipio_id');
    // municipio_id es opcional (superadmin no tiene municipio) - va como query param
    const params = municipioId ? { municipio_id: municipioId } : {};
    return api.post('/tramites/catalogo', data, { params }).then(res => { invalidateCache('/tramites/catalogo'); return res; });
  },
  updateTramite: (id: number, data: Record<string, unknown>) =>
    api.put(`/tramites/catalogo/${id}`, data).then(res => { invalidateCache('/tramites/catalogo'); return res; }),
  deleteTramite: (id: number) => api.delete(`/tramites/catalogo/${id}`).then(res => { invalidateCache('/tramites/catalogo'); return res; }),

  // ============================================
  // NIVEL 3: Solicitudes (las de vecinos)
  // ============================================
  getSolicitudes: (params?: { estado?: string; tramite_id?: number; skip?: number; limit?: number }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/solicitudes', { params: { ...params, municipio_id: municipioId } });
  },
  getMisSolicitudes: () => api.get('/tramites/solicitudes/mis-solicitudes'),
  getSolicitud: (id: number) => api.get(`/tramites/solicitudes/${id}`),
  consultarSolicitud: (numeroTramite: string) => api.get(`/tramites/solicitudes/consultar/${numeroTramite}`),
  createSolicitud: (data: Record<string, unknown>) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.post('/tramites/solicitudes', data, { params: { municipio_id: municipioId } });
  },
  updateSolicitud: (id: number, data: { estado?: string; empleado_id?: number; prioridad?: number; respuesta?: string; observaciones?: string }) =>
    api.put(`/tramites/solicitudes/${id}`, data),
  asignarSolicitud: (id: number, data: { empleado_id: number; comentario?: string }) =>
    api.post(`/tramites/solicitudes/${id}/asignar`, data),
  getHistorialSolicitud: (id: number) => api.get(`/tramites/solicitudes/${id}/historial`),

  // ============================================
  // Gestión y Stats
  // ============================================
  getGestionSolicitudes: (params?: {
    estado?: string;
    tramite_id?: number;
    empleado_id?: number;
    sin_asignar?: boolean;
    search?: string;
    skip?: number;
    limit?: number;
  }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/gestion/solicitudes', { params: { ...params, municipio_id: municipioId } });
  },
  getResumen: (municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    return api.get('/tramites/stats/resumen', { params: { municipio_id: mId } });
  },

  // ============================================
  // Alias para compatibilidad (deprecados)
  // ============================================
  // getServicios devuelve trámites habilitados para el municipio (usa tabla intermedia)
  getServicios: (params?: { municipio_id?: number; solo_activos?: boolean }) => {
    const municipioId = params?.municipio_id || localStorage.getItem('municipio_id');
    return api.get(`/tramites/municipio/${municipioId}/tramites`, {
      params: { solo_activos: params?.solo_activos ?? true }
    });
  },
  getAll: (params?: { estado?: string; skip?: number; limit?: number }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/solicitudes', { params: { ...params, municipio_id: municipioId } });
  },
  getGestionTodos: (params?: Record<string, unknown>) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/gestion/solicitudes', { params: { ...params, municipio_id: municipioId } });
  },
  getOne: (id: number) => api.get(`/tramites/solicitudes/${id}`),
  create: (data: Record<string, unknown>) => {
    const municipioId = localStorage.getItem('municipio_id');
    // Mapear servicio_id -> tramite_id para compatibilidad
    const mappedData = { ...data };
    if (mappedData.servicio_id && !mappedData.tramite_id) {
      mappedData.tramite_id = mappedData.servicio_id;
      delete mappedData.servicio_id;
    }
    return api.post('/tramites/solicitudes', mappedData, { params: { municipio_id: municipioId } });
  },
  update: (id: number, data: Record<string, unknown>) => api.put(`/tramites/solicitudes/${id}`, data),
  asignar: (id: number, data: { empleado_id: number; comentario?: string }) =>
    api.post(`/tramites/solicitudes/${id}/asignar`, data),
  getHistorial: (id: number) => api.get(`/tramites/solicitudes/${id}/historial`),
  consultar: (numeroTramite: string) => api.get(`/tramites/solicitudes/consultar/${numeroTramite}`),
  sugerirEmpleado: (id: number) => api.get(`/tramites/solicitudes/${id}/sugerir-empleado`),

  // Conteos para filtros (optimizado)
  getConteoEstados: () => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/stats/conteo-estados', { params: { municipio_id: municipioId } });
  },
  getConteoTipos: () => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get('/tramites/stats/conteo-tipos', { params: { municipio_id: municipioId } });
  },

  // Alias de Servicios -> Catálogo (para Servicios.tsx)
  getServicio: (id: number) => api.get(`/tramites/catalogo/${id}`),
  createServicio: (data: Record<string, unknown>) => api.post('/tramites/catalogo', data).then(res => { invalidateCache('/tramites/catalogo'); return res; }),
  updateServicio: (id: number, data: Record<string, unknown>) => api.put(`/tramites/catalogo/${id}`, data).then(res => { invalidateCache('/tramites/catalogo'); return res; }),
  deleteServicio: (id: number) => api.delete(`/tramites/catalogo/${id}`).then(res => { invalidateCache('/tramites/catalogo'); return res; }),

  // Documentos de solicitudes
  uploadDocumento: (solicitudId: number, formData: FormData, params?: { tipo_documento?: string; descripcion?: string; etapa?: string }) =>
    api.post(`/tramites/solicitudes/${solicitudId}/documentos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params,
    }),
  getDocumentos: (solicitudId: number) => api.get(`/tramites/solicitudes/${solicitudId}/documentos`),
  deleteDocumento: (solicitudId: number, documentoId: number) =>
    api.delete(`/tramites/solicitudes/${solicitudId}/documentos/${documentoId}`),

  // Obtener trámites habilitados para el municipio (desde municipio_tramites)
  getTramitesMunicipio: (params?: { tipo_tramite_id?: number; solo_activos?: boolean }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.get(`/tramites/municipio/${municipioId}/tramites`, { params });
  },

  // Habilitar tipos para municipio
  habilitarTipoMunicipio: (tipoId: number, municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    return api.post(`/tramites/tipos/${tipoId}/habilitar`, null, { params: { municipio_id: mId } }).then(res => { invalidateCache('/tramites/tipos'); return res; });
  },
  habilitarTodosTiposMunicipio: async (municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    // Habilitar tipos del 1 al 10
    const promises = [];
    for (let i = 1; i <= 10; i++) {
      promises.push(api.post(`/tramites/tipos/${i}/habilitar`, null, { params: { municipio_id: mId } }).catch(() => null));
    }
    const result = await Promise.all(promises);
    invalidateCache('/tramites/tipos');
    return result;
  },

  // IDs de trámites habilitados para el municipio actual
  getHabilitados: () => api.get<number[]>('/tramites/municipio/habilitados'),

  // Habilitar/deshabilitar trámite individual
  habilitarTramite: (tramiteId: number, municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    return api.post(`/tramites/catalogo/${tramiteId}/habilitar`, null, { params: { municipio_id: mId } })
      .then(res => { invalidateCache('/tramites'); return res; });
  },
  deshabilitarTramite: (tramiteId: number, municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    return api.delete(`/tramites/catalogo/${tramiteId}/deshabilitar`, { params: { municipio_id: mId } })
      .then(res => { invalidateCache('/tramites'); return res; });
  },
  habilitarTodosTramites: (municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    return api.post('/tramites/tramites/habilitar-todos', null, { params: { municipio_id: mId } })
      .then(res => { invalidateCache('/tramites'); return res; });
  },
};

// Calificaciones
export const calificacionesApi = {
  // Autenticadas
  crear: (data: { reclamo_id: number; puntuacion: number; comentario?: string }) =>
    api.post('/calificaciones', data),
  getReclamo: (reclamoId: number) => api.get(`/calificaciones/reclamo/${reclamoId}`),
  getPendientes: () => api.get('/calificaciones/pendientes'),
  getEstadisticas: (params?: { empleado_id?: number; categoria_id?: number; dias?: number }) =>
    api.get('/calificaciones/estadisticas', { params }),
  getRankingEmpleados: (dias?: number) =>
    api.get('/calificaciones/ranking-empleados', { params: { dias } }),

  // Públicas (para link de WhatsApp)
  getInfoPublica: (reclamoId: number) =>
    api.get(`/calificaciones/calificar/${reclamoId}`),
  calificarPublica: (reclamoId: number, data: { puntuacion: number; comentario?: string }) =>
    api.post(`/calificaciones/calificar/${reclamoId}`, data),
};

// Noticias
export const noticiasApi = {
  getAll: (params?: { municipio_id?: number; solo_activas?: boolean; skip?: number; limit?: number }) => {
    const municipioId = params?.municipio_id || localStorage.getItem('municipio_id');
    return api.get('/noticias', { params: { ...params, municipio_id: municipioId } });
  },
  getOne: (id: number) => api.get(`/noticias/${id}`),
  create: (data: Record<string, unknown>, municipioId?: number) => {
    const mId = municipioId || localStorage.getItem('municipio_id');
    return api.post('/noticias', data, { params: { municipio_id: mId } });
  },
  update: (id: number, data: Record<string, unknown>) => api.put(`/noticias/${id}`, data),
  delete: (id: number) => api.delete(`/noticias/${id}`),
};

// Gestion de Empleados (cuadrillas, ausencias, horarios, metricas, capacitaciones)
export const empleadosGestionApi = {
  // Empleado-Cuadrilla
  getCuadrillas: (params?: { empleado_id?: number; cuadrilla_id?: number; activo?: boolean }) =>
    api.get('/empleados-gestion/cuadrillas', { params }),
  asignarCuadrilla: (data: { empleado_id: number; cuadrilla_id: number; es_lider?: boolean }) =>
    api.post('/empleados-gestion/cuadrillas', data),
  updateAsignacionCuadrilla: (id: number, data: { es_lider?: boolean; activo?: boolean }) =>
    api.put(`/empleados-gestion/cuadrillas/${id}`, data),
  desasignarCuadrilla: (id: number) =>
    api.delete(`/empleados-gestion/cuadrillas/${id}`),

  // Ausencias
  getAusencias: (params?: { empleado_id?: number; tipo?: string; aprobado?: boolean; fecha_desde?: string; fecha_hasta?: string }) =>
    api.get('/empleados-gestion/ausencias', { params }),
  createAusencia: (data: { empleado_id: number; tipo: string; fecha_inicio: string; fecha_fin: string; motivo?: string }) =>
    api.post('/empleados-gestion/ausencias', data),
  updateAusencia: (id: number, data: { tipo?: string; fecha_inicio?: string; fecha_fin?: string; motivo?: string; aprobado?: boolean }) =>
    api.put(`/empleados-gestion/ausencias/${id}`, data),
  deleteAusencia: (id: number) =>
    api.delete(`/empleados-gestion/ausencias/${id}`),

  // Horarios
  getHorarios: (params?: { empleado_id?: number; activo?: boolean }) =>
    api.get('/empleados-gestion/horarios', { params }),
  createHorario: (data: { empleado_id: number; dia_semana: number; hora_entrada: string; hora_salida: string; activo?: boolean }) =>
    api.post('/empleados-gestion/horarios', data),
  updateHorario: (id: number, data: { hora_entrada?: string; hora_salida?: string; activo?: boolean }) =>
    api.put(`/empleados-gestion/horarios/${id}`, data),
  deleteHorario: (id: number) =>
    api.delete(`/empleados-gestion/horarios/${id}`),
  setHorariosSemana: (empleadoId: number, horarios: Array<{ empleado_id: number; dia_semana: number; hora_entrada: string; hora_salida: string; activo?: boolean }>) =>
    api.post(`/empleados-gestion/horarios/bulk/${empleadoId}`, horarios),

  // Metricas
  getMetricas: (params?: { empleado_id?: number; periodo_desde?: string; periodo_hasta?: string }) =>
    api.get('/empleados-gestion/metricas', { params }),
  createMetrica: (data: Record<string, unknown>) =>
    api.post('/empleados-gestion/metricas', data),

  // Capacitaciones
  getCapacitaciones: (params?: { empleado_id?: number; vigentes?: boolean }) =>
    api.get('/empleados-gestion/capacitaciones', { params }),
  createCapacitacion: (data: { empleado_id: number; nombre: string; descripcion?: string; institucion?: string; fecha_inicio?: string; fecha_fin?: string; fecha_vencimiento?: string; certificado_url?: string }) =>
    api.post('/empleados-gestion/capacitaciones', data),
  updateCapacitacion: (id: number, data: Record<string, unknown>) =>
    api.put(`/empleados-gestion/capacitaciones/${id}`, data),
  deleteCapacitacion: (id: number) =>
    api.delete(`/empleados-gestion/capacitaciones/${id}`),

  // Helper: companeros de cuadrilla
  getCompaneros: (empleadoId: number) =>
    api.get(`/empleados-gestion/companeros/${empleadoId}`),

  // Cuadrillas (ABM basico - ya existe en /cuadrillas pero agregamos alias)
  getCuadrillasAll: (params?: { activo?: boolean }) =>
    api.get('/cuadrillas', { params }),
  getCuadrilla: (id: number) => api.get(`/cuadrillas/${id}`),
  createCuadrillaEntity: (data: Record<string, unknown>) => api.post('/cuadrillas', data),
  updateCuadrillaEntity: (id: number, data: Record<string, unknown>) => api.put(`/cuadrillas/${id}`, data),
  deleteCuadrillaEntity: (id: number) => api.delete(`/cuadrillas/${id}`),
};

// Planificación Semanal
export const planificacionApi = {
  getSemanal: (fechaInicio: string, fechaFin: string, empleadoId?: number) =>
    api.get('/planificacion/semanal', {
      params: {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        empleado_id: empleadoId,
      },
    }),
  asignarFecha: (reclamoId: number, empleadoId: number, fechaProgramada: string, horaInicio?: string, horaFin?: string) =>
    api.post('/planificacion/asignar-fecha', null, {
      params: {
        reclamo_id: reclamoId,
        empleado_id: empleadoId,
        fecha_programada: fechaProgramada,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      },
    }),
};
