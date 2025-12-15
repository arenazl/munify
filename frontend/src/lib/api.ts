import axios from 'axios';

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;

  // Si hay URL configurada, usarla
  if (envUrl) {
    return envUrl;
  }

  // Fallback: en desarrollo usar el host actual
  if (import.meta.env.DEV) {
    const host = window.location.hostname;
    return `http://${host}:8002/api`;
  }

  return 'http://localhost:8002/api';
};

const API_URL = getApiUrl();
console.log('🔗 API URL:', API_URL);

if (!API_URL) {
  console.error('VITE_API_URL no está configurado en .env');
}

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
      const publicPaths = ['/nuevo-reclamo', '/publico', '/bienvenido', '/register'];
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

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: { email: string; password: string; nombre: string; apellido: string }) => {
    const municipioId = localStorage.getItem('municipio_id');
    return api.post('/auth/register', {
      ...data,
      municipio_id: municipioId ? parseInt(municipioId) : null
    });
  },
  me: () => api.get('/auth/me'),
};

// Reclamos
export const reclamosApi = {
  getAll: (params?: Record<string, string>) => api.get('/reclamos', { params }),
  getMisReclamos: () => api.get('/reclamos/mis-reclamos'),
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
  rechazar: (id: number, data: { motivo: string; descripcion?: string }) =>
    api.post(`/reclamos/${id}/rechazar`, data),
  // PATCH para cambiar estado via drag & drop en Kanban
  cambiarEstado: (id: number, estado: string) =>
    api.patch(`/reclamos/${id}`, null, { params: { nuevo_estado: estado } }),
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
};

// Categorías
export const categoriasApi = {
  getAll: (activo?: boolean) => api.get('/categorias', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/categorias/${id}`),
  create: (data: Record<string, unknown>) => api.post('/categorias', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/categorias/${id}`, data),
  delete: (id: number) => api.delete(`/categorias/${id}`),
};

// Zonas
export const zonasApi = {
  getAll: (activo?: boolean) => api.get('/zonas', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/zonas/${id}`),
  create: (data: Record<string, unknown>) => api.post('/zonas', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/zonas/${id}`, data),
  delete: (id: number) => api.delete(`/zonas/${id}`),
};

// Empleados
export const empleadosApi = {
  getAll: (activo?: boolean) => api.get('/empleados', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/empleados/${id}`),
  create: (data: Record<string, unknown>) => api.post('/empleados', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/empleados/${id}`, data),
  delete: (id: number) => api.delete(`/empleados/${id}`),
};

// Usuarios
export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id: number) => api.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
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
  getPublica: (clave: string) => api.get(`/configuracion/publica/${clave}`),
  update: (clave: string, data: { valor: string; municipio_id?: number | null }) => api.put(`/configuracion/${clave}`, data),
};

// Municipios
export const municipiosApi = {
  getAll: () => api.get('/municipios'),
  getOne: (id: number) => api.get(`/municipios/${id}`),
};

// Chat IA
export const chatApi = {
  sendMessage: async (message: string, history: Array<{role: string, content: string}> = []) => {
    const response = await api.post('/chat', { message, history });
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
  getTendencias: (dias?: number) => api.get('/publico/tendencias', { params: { dias } }),
  getCategorias: (municipioId?: number) => api.get('/publico/categorias', { params: { municipio_id: municipioId } }),
  getZonas: (municipioId?: number) => api.get('/publico/zonas', { params: { municipio_id: municipioId } }),
  getConfigRegistro: () => api.get('/configuracion/publica/registro'),
};

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
