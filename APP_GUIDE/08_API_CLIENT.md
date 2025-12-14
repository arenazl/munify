# CLIENT INTERFACE (API)

Este documento describe la interfaz completa del cliente para comunicarse con el backend. Incluye todos los endpoints, métodos y parámetros disponibles.

---

## Configuración Base

### URL de la API

```typescript
// frontend/src/lib/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
```

### Variables de Entorno

```bash
# frontend/.env
VITE_API_URL=http://localhost:8001/api
```

### Instancia de Axios

```typescript
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

---

## Interceptores

### Request Interceptor (Token JWT)

Agrega automáticamente el token de autenticación a cada request:

```typescript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Response Interceptor (Manejo de 401)

Redirige al login si el token expiró o es inválido:

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## Endpoints por Módulo

### 1. Autenticación (`/api/auth`)

| Método | Endpoint | Descripción | Body/Params |
|--------|----------|-------------|-------------|
| POST | `/auth/login` | Iniciar sesión | `username`, `password` (form-urlencoded) |
| POST | `/auth/register` | Registrar usuario | `{ email, password, nombre, apellido }` |
| GET | `/auth/me` | Obtener usuario actual | - |

```typescript
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: { email: string; password: string; nombre: string; apellido: string }) =>
    api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};
```

---

### 2. Reclamos (`/api/reclamos`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/reclamos` | Listar todos los reclamos | `?estado=&categoria_id=&zona_id=` |
| GET | `/reclamos/mis-reclamos` | Mis reclamos (ciudadano) | - |
| GET | `/reclamos/{id}` | Obtener un reclamo | - |
| GET | `/reclamos/{id}/historial` | Historial de cambios | - |
| POST | `/reclamos` | Crear reclamo | `{ titulo, descripcion, categoria_id, ... }` |
| PUT | `/reclamos/{id}` | Actualizar reclamo | `{ ... }` |
| PATCH | `/reclamos/{id}` | Cambiar estado (Kanban) | `?nuevo_estado=` |
| POST | `/reclamos/{id}/asignar` | Asignar a cuadrilla | `{ cuadrilla_id, fecha_programada?, ... }` |
| POST | `/reclamos/{id}/iniciar` | Iniciar trabajo | - |
| POST | `/reclamos/{id}/resolver` | Resolver reclamo | `{ resolucion }` |
| POST | `/reclamos/{id}/rechazar` | Rechazar reclamo | `{ motivo, descripcion? }` |
| POST | `/reclamos/{id}/upload` | Subir foto | `FormData(file)` + `?etapa=` |
| GET | `/reclamos/empleado/{id}/disponibilidad/{fecha}` | Disponibilidad empleado | `?buscar_siguiente=` |
| GET | `/reclamos/{id}/sugerencia-asignacion` | Sugerencia IA de asignación | - |

```typescript
export const reclamosApi = {
  getAll: (params?: Record<string, string>) => api.get('/reclamos', { params }),
  getMisReclamos: () => api.get('/reclamos/mis-reclamos'),
  getOne: (id: number) => api.get(`/reclamos/${id}`),
  getHistorial: (id: number) => api.get(`/reclamos/${id}/historial`),
  create: (data: Record<string, unknown>) => api.post('/reclamos', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/reclamos/${id}`, data),
  asignar: (id: number, data: {
    cuadrilla_id: number;
    fecha_programada?: string;
    hora_inicio?: string;
    hora_fin?: string;
    comentario?: string
  }) => api.post(`/reclamos/${id}/asignar`, data),
  iniciar: (id: number) => api.post(`/reclamos/${id}/iniciar`),
  resolver: (id: number, data: { resolucion: string }) => api.post(`/reclamos/${id}/resolver`, data),
  rechazar: (id: number, data: { motivo: string; descripcion?: string }) =>
    api.post(`/reclamos/${id}/rechazar`, data),
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
```

---

### 3. Categorías (`/api/categorias`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/categorias` | Listar categorías | `?activo=true/false` |
| GET | `/categorias/{id}` | Obtener una | - |
| POST | `/categorias` | Crear | `{ nombre, descripcion, ... }` |
| PUT | `/categorias/{id}` | Actualizar | `{ ... }` |
| DELETE | `/categorias/{id}` | Eliminar | - |

```typescript
export const categoriasApi = {
  getAll: (activo?: boolean) => api.get('/categorias', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/categorias/${id}`),
  create: (data: Record<string, unknown>) => api.post('/categorias', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/categorias/${id}`, data),
  delete: (id: number) => api.delete(`/categorias/${id}`),
};
```

---

### 4. Zonas (`/api/zonas`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/zonas` | Listar zonas | `?activo=true/false` |
| GET | `/zonas/{id}` | Obtener una | - |
| POST | `/zonas` | Crear | `{ nombre, codigo, ... }` |
| PUT | `/zonas/{id}` | Actualizar | `{ ... }` |
| DELETE | `/zonas/{id}` | Eliminar | - |

```typescript
export const zonasApi = {
  getAll: (activo?: boolean) => api.get('/zonas', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/zonas/${id}`),
  create: (data: Record<string, unknown>) => api.post('/zonas', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/zonas/${id}`, data),
  delete: (id: number) => api.delete(`/zonas/${id}`),
};
```

---

### 5. Cuadrillas / Empleados (`/api/cuadrillas`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/cuadrillas` | Listar cuadrillas | `?activo=true/false` |
| GET | `/cuadrillas/{id}` | Obtener una | - |
| POST | `/cuadrillas` | Crear | `{ nombre, especialidad, ... }` |
| PUT | `/cuadrillas/{id}` | Actualizar | `{ ... }` |
| DELETE | `/cuadrillas/{id}` | Eliminar | - |

```typescript
export const cuadrillasApi = {
  getAll: (activo?: boolean) => api.get('/cuadrillas', { params: activo !== undefined ? { activo } : {} }),
  getOne: (id: number) => api.get(`/cuadrillas/${id}`),
  create: (data: Record<string, unknown>) => api.post('/cuadrillas', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/cuadrillas/${id}`, data),
  delete: (id: number) => api.delete(`/cuadrillas/${id}`),
};

// Alias
export const empleadosApi = cuadrillasApi;
```

---

### 6. Usuarios (`/api/users`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/users` | Listar usuarios | - |
| GET | `/users/{id}` | Obtener uno | - |
| POST | `/users` | Crear | `{ email, password, nombre, rol, ... }` |
| PUT | `/users/{id}` | Actualizar | `{ ... }` |
| DELETE | `/users/{id}` | Eliminar | - |

```typescript
export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id: number) => api.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => api.post('/users', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};
```

---

### 7. Dashboard (`/api/dashboard`)

| Método | Endpoint | Descripción | Params |
|--------|----------|-------------|--------|
| GET | `/dashboard/stats` | Estadísticas generales | - |
| GET | `/dashboard/por-categoria` | Reclamos por categoría | - |
| GET | `/dashboard/por-zona` | Reclamos por zona | - |
| GET | `/dashboard/tendencia` | Tendencia temporal | `?dias=30` |

```typescript
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getPorCategoria: () => api.get('/dashboard/por-categoria'),
  getPorZona: () => api.get('/dashboard/por-zona'),
  getTendencia: (dias?: number) => api.get('/dashboard/tendencia', { params: dias ? { dias } : {} }),
};
```

---

### 8. Notificaciones (`/api/notificaciones`)

| Método | Endpoint | Descripción | Params |
|--------|----------|-------------|--------|
| GET | `/notificaciones` | Listar notificaciones | `?leidas=true/false` |
| GET | `/notificaciones/count` | Contador de no leídas | - |
| PUT | `/notificaciones/{id}/leer` | Marcar como leída | - |
| PUT | `/notificaciones/leer-todas` | Marcar todas leídas | - |

```typescript
export const notificacionesApi = {
  getAll: (leidas?: boolean) => api.get('/notificaciones', { params: leidas !== undefined ? { leidas } : {} }),
  getCount: () => api.get('/notificaciones/count'),
  marcarLeida: (id: number) => api.put(`/notificaciones/${id}/leer`),
  marcarTodasLeidas: () => api.put('/notificaciones/leer-todas'),
};
```

---

### 9. Configuración (`/api/configuracion`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/configuracion` | Listar todas | Solo admin |
| GET | `/configuracion/{clave}` | Obtener una | Solo admin |
| PUT | `/configuracion/{clave}` | Actualizar | `{ valor }` |
| GET | `/configuracion/publica/municipio` | Datos públicos del municipio | Sin auth |
| GET | `/configuracion/barrios/{municipio}` | Buscar barrios (OSM) | Solo admin |
| POST | `/configuracion/cargar-barrios` | Cargar barrios como zonas | `[nombres]` |

```typescript
export const configuracionApi = {
  getAll: () => api.get('/configuracion'),
  get: (clave: string) => api.get(`/configuracion/${clave}`),
  update: (clave: string, data: { valor: string }) => api.put(`/configuracion/${clave}`, data),
};
```

---

### 10. Chat IA (`/api/chat`)

| Método | Endpoint | Descripción | Body |
|--------|----------|-------------|------|
| POST | `/chat` | Enviar mensaje | `{ message, history: [{role, content}] }` |
| GET | `/chat/status` | Estado del servicio Ollama | - |

```typescript
export const chatApi = {
  sendMessage: async (message: string, history: Array<{role: string, content: string}> = []) => {
    const response = await api.post('/chat', { message, history });
    return response.data;
  },
  getStatus: () => api.get('/chat/status'),
};
```

---

### 11. SLA (`/api/sla`)

| Método | Endpoint | Descripción | Params/Body |
|--------|----------|-------------|-------------|
| GET | `/sla/config` | Listar configuraciones SLA | - |
| POST | `/sla/config` | Crear configuración | `{ categoria_id?, prioridad?, tiempo_respuesta, ... }` |
| PUT | `/sla/config/{id}` | Actualizar | `{ ... }` |
| DELETE | `/sla/config/{id}` | Eliminar | - |
| GET | `/sla/estado-reclamos` | Estado SLA de reclamos | `?solo_activos=&solo_vencidos=` |
| GET | `/sla/resumen` | Resumen de SLA | - |
| GET | `/sla/alertas` | Alertas activas | - |

```typescript
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
  updateConfig: (id: number, data: { ... }) => api.put(`/sla/config/${id}`, data),
  deleteConfig: (id: number) => api.delete(`/sla/config/${id}`),
  getEstadoReclamos: (soloActivos?: boolean, soloVencidos?: boolean) =>
    api.get('/sla/estado-reclamos', { params: { solo_activos: soloActivos, solo_vencidos: soloVencidos } }),
  getResumen: () => api.get('/sla/resumen'),
  getAlertas: () => api.get('/sla/alertas'),
};
```

---

### 12. Exportación (`/api/exportar`)

| Método | Endpoint | Descripción | Params |
|--------|----------|-------------|--------|
| GET | `/exportar/reclamos/csv` | Exportar reclamos | `?estado=&categoria_id=&fecha_desde=&fecha_hasta=` |
| GET | `/exportar/estadisticas/csv` | Exportar estadísticas | `?dias=` |
| GET | `/exportar/empleados/csv` | Exportar empleados | - |
| GET | `/exportar/sla/csv` | Exportar SLA | - |

```typescript
export const exportarApi = {
  reclamosCsv: (params?: {
    estado?: string;
    categoria_id?: number;
    zona_id?: number;
    cuadrilla_id?: number;
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
```

---

### 13. Analytics Avanzados (`/api/analytics`)

| Método | Endpoint | Descripción | Params |
|--------|----------|-------------|--------|
| GET | `/analytics/heatmap` | Mapa de calor | `?dias=&categoria_id=` |
| GET | `/analytics/clusters` | Clusters geográficos | `?radio_km=&min_reclamos=&dias=` |
| GET | `/analytics/distancias` | Análisis de distancias | `?dias=` |
| GET | `/analytics/cobertura` | Cobertura por zona | `?dias=` |
| GET | `/analytics/tiempo-resolucion` | Tiempos de resolución | `?dias=` |
| GET | `/analytics/rendimiento-cuadrillas` | Rendimiento cuadrillas | `?semanas=` |

```typescript
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
  getRendimientoCuadrillas: (semanas?: number) =>
    api.get('/analytics/rendimiento-cuadrillas', { params: { semanas } }),
};
```

---

### 14. Portal Público (`/api/publico`) - SIN AUTENTICACIÓN

Este módulo permite a los ciudadanos consultar información y crear reclamos con login mínimo (solo email para seguimiento).

| Método | Endpoint | Descripción | Params |
|--------|----------|-------------|--------|
| GET | `/publico/estadisticas` | Estadísticas públicas del municipio | - |
| GET | `/publico/reclamos-resueltos` | Reclamos resueltos recientes | `?categoria_id=&zona_id=&dias=30&limit=50` |
| GET | `/publico/mapa` | Puntos para mapa público | `?estado=&categoria_id=&dias=30` |
| GET | `/publico/consultar/{codigo}` | Consultar estado por número de reclamo | - |
| GET | `/publico/categorias` | Lista de categorías activas | - |
| GET | `/publico/zonas` | Lista de zonas activas | - |
| GET | `/publico/tendencias` | Tendencias de reclamos | `?dias=30` |

```typescript
// Agregar a api.ts
export const portalPublicoApi = {
  // Estadísticas generales del municipio
  getEstadisticas: () => api.get('/publico/estadisticas'),

  // Reclamos resueltos (mostrar trabajo del municipio)
  getReclamosResueltos: (params?: {
    categoria_id?: number;
    zona_id?: number;
    dias?: number;
    limit?: number;
  }) => api.get('/publico/reclamos-resueltos', { params }),

  // Datos para mapa público
  getMapa: (params?: {
    estado?: string;
    categoria_id?: number;
    dias?: number;
  }) => api.get('/publico/mapa', { params }),

  // Consultar estado de reclamo por número (sin login)
  consultarReclamo: (codigo: number) => api.get(`/publico/consultar/${codigo}`),

  // Categorías disponibles
  getCategorias: () => api.get('/publico/categorias'),

  // Zonas disponibles
  getZonas: () => api.get('/publico/zonas'),

  // Tendencias
  getTendencias: (dias?: number) => api.get('/publico/tendencias', { params: dias ? { dias } : {} }),
};
```

#### Flujo del Ciudadano (Menú Simplificado)

El portal público permite:

1. **Ver estadísticas** del municipio sin login
2. **Consultar estado** de un reclamo por número
3. **Ver mapa** de reclamos en la zona
4. **Crear reclamo** con registro mínimo (solo email)
5. **Ver historial** de sus reclamos

```
┌─────────────────────────────────────────────────────────┐
│                 PORTAL CIUDADANO                        │
├─────────────────────────────────────────────────────────┤
│  [🔍 Consultar Reclamo]   [📍 Ver Mapa]   [📊 Stats]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Ingrese número de reclamo: [_________]  [🔍]   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ─────────── O ───────────                             │
│                                                         │
│  [➕ Crear Nuevo Reclamo]                               │
│  (Solo necesita email para seguimiento)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Respuesta de Consulta de Reclamo

```json
{
  "id": 123,
  "titulo": "Bache en calle San Martín",
  "descripcion": "Hay un bache grande...",
  "estado": "en_proceso",
  "categoria": "Vialidad",
  "zona": "Centro",
  "direccion": "San Martín 450",
  "prioridad": 3,
  "fecha_creacion": "2025-01-10T14:30:00",
  "dias_abierto": 4,
  "fecha_programada": "2025-01-16T08:00:00",
  "fecha_resolucion": null,
  "historial": [
    {"estado": "nuevo", "accion": "Reclamo creado", "fecha": "2025-01-10T14:30:00"},
    {"estado": "asignado", "accion": "Asignado a cuadrilla", "fecha": "2025-01-11T09:00:00"},
    {"estado": "en_proceso", "accion": "Trabajo iniciado", "fecha": "2025-01-14T08:30:00"}
  ]
}
```

---

## Otros Routers del Backend

Estos endpoints existen en el backend pero aún no tienen cliente definido en `api.ts`:

| Prefijo | Módulo | Descripción |
|---------|--------|-------------|
| `/api/whatsapp` | WhatsApp | Integración con WhatsApp |
| `/api/turnos` | Turnos | Gestión de turnos de empleados |
| `/api/calificaciones` | Calificaciones | Calificaciones de reclamos |
| `/api/escalado` | Auto-Escalado | Sistema de escalamiento automático |
| `/api/emails` | Emails | Envío de correos |
| `/ws` | WebSocket | Conexión en tiempo real |

---

## WebSocket

### Conexión

```typescript
const ws = new WebSocket(`ws://localhost:8001/ws/${userId}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Manejar notificación en tiempo real
};
```

---

## Manejo de Errores

### Códigos HTTP Comunes

| Código | Significado | Acción |
|--------|-------------|--------|
| 200 | OK | Éxito |
| 201 | Created | Recurso creado |
| 400 | Bad Request | Validar datos enviados |
| 401 | Unauthorized | Token inválido/expirado (redirect a login) |
| 403 | Forbidden | Sin permisos |
| 404 | Not Found | Recurso no existe |
| 422 | Validation Error | Errores de validación |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Server Error | Error interno |

### Rate Limiting

La API tiene límites configurados:
- **Default**: 100 requests/minuto
- **Auth** (login/register): 10 requests/minuto
- **Create** (crear reclamos): 30 requests/minuto
- **Upload** (subir fotos): 20 requests/minuto

---

## Ejemplo de Uso

```typescript
import { reclamosApi, authApi } from '@/lib/api';

// Login
const loginResponse = await authApi.login('user@mail.com', 'password');
localStorage.setItem('token', loginResponse.data.access_token);

// Obtener reclamos
const reclamos = await reclamosApi.getAll({ estado: 'pendiente' });

// Crear reclamo
const nuevoReclamo = await reclamosApi.create({
  titulo: 'Bache en calle principal',
  descripcion: 'Hay un bache grande...',
  categoria_id: 1,
  zona_id: 2,
  latitud: -34.6037,
  longitud: -58.3816,
});

// Subir foto
const file = event.target.files[0];
await reclamosApi.upload(nuevoReclamo.data.id, file, 'inicial');
```
