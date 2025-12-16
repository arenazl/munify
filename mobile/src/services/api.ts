import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Reclamo, Categoria, Zona, Notificacion, Municipio } from '../types';

// URL base de la API - cambiar en producción
const API_URL = __DEV__
  ? 'http://192.168.1.100:8002/api'  // Cambiar por tu IP local
  : 'https://reclamos-mun-api-aedc8e147cbe.herokuapp.com/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor para agregar token
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const municipioId = await AsyncStorage.getItem('municipio_actual_id');
  if (municipioId) {
    config.headers['X-Municipio-ID'] = municipioId;
  }

  return config;
});

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['token', 'user']);
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post('/auth/login', formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  register: async (data: {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    telefono?: string;
    municipio_id?: number;
  }) => {
    const response = await api.post<User>('/auth/register', data);
    return response.data;
  },

  me: async () => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },
};

// Reclamos
export const reclamosApi = {
  getMisReclamos: async () => {
    const response = await api.get<Reclamo[]>('/reclamos/mis-reclamos');
    return response.data;
  },

  getOne: async (id: number) => {
    const response = await api.get<Reclamo>(`/reclamos/${id}`);
    return response.data;
  },

  create: async (data: {
    titulo: string;
    descripcion: string;
    categoria_id: number;
    direccion: string;
    latitud?: number;
    longitud?: number;
    zona_id?: number;
    referencia?: string;
  }) => {
    const response = await api.post<Reclamo>('/reclamos', data);
    return response.data;
  },

  uploadImage: async (reclamoId: number, uri: string, etapa: string = 'creacion') => {
    const formData = new FormData();

    const filename = uri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', {
      uri,
      name: filename,
      type,
    } as unknown as Blob);

    const response = await api.post(`/reclamos/${reclamoId}/upload?etapa=${etapa}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getHistorial: async (id: number) => {
    const response = await api.get(`/reclamos/${id}/historial`);
    return response.data;
  },
};

// Categorías
export const categoriasApi = {
  getAll: async (municipioId?: number) => {
    const response = await api.get<Categoria[]>('/publico/categorias', {
      params: { municipio_id: municipioId },
    });
    return response.data;
  },
};

// Zonas
export const zonasApi = {
  getAll: async (municipioId?: number) => {
    const response = await api.get<Zona[]>('/publico/zonas', {
      params: { municipio_id: municipioId },
    });
    return response.data;
  },
};

// Notificaciones
export const notificacionesApi = {
  getAll: async (leidas?: boolean) => {
    const response = await api.get<Notificacion[]>('/notificaciones', {
      params: leidas !== undefined ? { leidas } : {},
    });
    return response.data;
  },

  getCount: async () => {
    const response = await api.get<{ no_leidas: number }>('/notificaciones/count');
    return response.data;
  },

  marcarLeida: async (id: number) => {
    await api.put(`/notificaciones/${id}/leer`);
  },

  marcarTodasLeidas: async () => {
    await api.put('/notificaciones/leer-todas');
  },
};

// Dashboard (stats del vecino)
export const dashboardApi = {
  getMisStats: async () => {
    const response = await api.get('/dashboard/mis-stats');
    return response.data;
  },
};

// Municipios
export const municipiosApi = {
  getAll: async () => {
    const response = await api.get<Municipio[]>('/municipios');
    return response.data;
  },
};

// Clasificación IA
export const clasificacionApi = {
  clasificar: async (texto: string, municipioId: number) => {
    const response = await api.post('/publico/clasificar', {
      texto,
      municipio_id: municipioId,
      usar_ia: true,
    });
    return response.data;
  },
};

export default api;
