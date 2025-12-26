import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { authApi } from '../lib/api';
import api from '../lib/api';
import { useMunicipioFromUrl, buildMunicipioUrl } from '../hooks/useSubdomain';
import { subscribeToPush, isPushSupported } from '../lib/pushNotifications';

export interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  color_primario?: string;
  color_secundario?: string;
  logo_url?: string;
  latitud?: number;
  longitud?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; nombre: string; apellido: string; es_anonimo?: boolean; telefono?: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  // Multi-tenant
  municipios: Municipio[];
  municipioActual: Municipio | null;
  setMunicipioActual: (municipio: Municipio) => void;
  loadMunicipios: () => Promise<void>;
  // Subdominio
  municipioFromUrl: string | null;
  getMunicipioUrl: (codigo: string, path?: string) => string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [municipioActual, setMunicipioActualState] = useState<Municipio | null>(null);

  // Detectar municipio desde URL (subdominio o query param)
  const municipioFromUrl = useMunicipioFromUrl();

  // Helper para generar URLs con subdominio
  const getMunicipioUrl = (codigo: string, path: string = '/') => {
    return buildMunicipioUrl(codigo, path);
  };

  // Cargar municipios disponibles para el usuario
  const loadMunicipios = async () => {
    try {
      const response = await api.get('/municipios');
      const munis = response.data;
      setMunicipios(munis);

      // Si no hay municipio seleccionado, seleccionar el del usuario o el primero
      if (!municipioActual && munis.length > 0) {
        const storedMuniId = localStorage.getItem('municipio_actual_id');
        const userMuniId = user?.municipio_id;

        let selectedMuni = munis[0];

        if (storedMuniId) {
          const found = munis.find((m: Municipio) => m.id === parseInt(storedMuniId));
          if (found) selectedMuni = found;
        } else if (userMuniId) {
          const found = munis.find((m: Municipio) => m.id === userMuniId);
          if (found) selectedMuni = found;
        }

        setMunicipioActualState(selectedMuni);
        localStorage.setItem('municipio_actual_id', String(selectedMuni.id));
        localStorage.setItem('municipio_id', String(selectedMuni.id));
        localStorage.setItem('municipio_nombre', selectedMuni.nombre);
        localStorage.setItem('municipio_codigo', selectedMuni.codigo);
        localStorage.setItem('municipio_color', selectedMuni.color_primario || '#3b82f6');
        if (selectedMuni.latitud) localStorage.setItem('municipio_lat', String(selectedMuni.latitud));
        if (selectedMuni.longitud) localStorage.setItem('municipio_lon', String(selectedMuni.longitud));
      }
    } catch (e) {
      console.error('Error cargando municipios:', e);
    }
  };

  const setMunicipioActual = (municipio: Municipio) => {
    setMunicipioActualState(municipio);
    localStorage.setItem('municipio_actual_id', String(municipio.id));
    localStorage.setItem('municipio_id', String(municipio.id));
    localStorage.setItem('municipio_nombre', municipio.nombre);
    localStorage.setItem('municipio_codigo', municipio.codigo);
    localStorage.setItem('municipio_color', municipio.color_primario || '#3b82f6');
    if (municipio.latitud) localStorage.setItem('municipio_lat', String(municipio.latitud));
    if (municipio.longitud) localStorage.setItem('municipio_lon', String(municipio.longitud));
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  // Cargar municipios cuando el usuario esté logueado
  useEffect(() => {
    if (user) {
      loadMunicipios();
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const { access_token, user } = response.data;

    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);

    // Super Admin (sin municipio_id): cargar todos los municipios y seleccionar el primero
    const isSuperAdmin = user.rol === 'admin' && !user.municipio_id;

    if (isSuperAdmin) {
      // Para super admin, cargar todos los municipios
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(`${apiUrl}/municipios`, {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (res.ok) {
          const munis = await res.json();
          setMunicipios(munis);
          if (munis.length > 0) {
            // Usar el guardado en localStorage o el primero
            const storedMuniId = localStorage.getItem('municipio_actual_id');
            let selectedMuni = munis[0];
            if (storedMuniId) {
              const found = munis.find((m: Municipio) => m.id === parseInt(storedMuniId));
              if (found) selectedMuni = found;
            }
            localStorage.setItem('municipio_actual_id', String(selectedMuni.id));
            localStorage.setItem('municipio_id', String(selectedMuni.id));
            localStorage.setItem('municipio_nombre', selectedMuni.nombre);
            localStorage.setItem('municipio_codigo', selectedMuni.codigo);
            localStorage.setItem('municipio_color', selectedMuni.color_primario || '#3b82f6');
            if (selectedMuni.latitud) localStorage.setItem('municipio_lat', String(selectedMuni.latitud));
            if (selectedMuni.longitud) localStorage.setItem('municipio_lon', String(selectedMuni.longitud));
            setMunicipioActualState(selectedMuni);
          }
        }
      } catch (e) {
        console.error('Error cargando municipios para super admin:', e);
      }
    } else if (user.municipio_id) {
      // Usuario normal: cargar solo su municipio
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(`${apiUrl}/municipios/${user.municipio_id}`, {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (res.ok) {
          const muni = await res.json();
          localStorage.setItem('municipio_actual_id', String(muni.id));
          localStorage.setItem('municipio_id', String(muni.id));
          localStorage.setItem('municipio_nombre', muni.nombre);
          localStorage.setItem('municipio_codigo', muni.codigo);
          localStorage.setItem('municipio_color', muni.color_primario || '#3b82f6');
          if (muni.latitud) localStorage.setItem('municipio_lat', String(muni.latitud));
          if (muni.longitud) localStorage.setItem('municipio_lon', String(muni.longitud));
          setMunicipioActualState(muni);
        }
      } catch (e) {
        console.error('Error cargando municipio:', e);
      }
    }

    // Auto-suscribir a push notifications por defecto
    if (isPushSupported()) {
      try {
        await subscribeToPush();
        console.log('Push notifications activadas automáticamente');
      } catch (e) {
        console.log('No se pudo activar push automáticamente:', e);
      }
    }
  };

  const register = async (data: { email: string; password: string; nombre: string; apellido: string; es_anonimo?: boolean; telefono?: string }) => {
    await authApi.register(data);
    // Auto-login después del registro
    await login(data.email, data.password);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('municipio_actual_id');
    setUser(null);
    setMunicipioActualState(null);
    setMunicipios([]);
  };

  const refreshUser = async () => {
    try {
      const response = await authApi.me();
      const updatedUser = response.data;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Error refrescando usuario:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
      municipios,
      municipioActual,
      setMunicipioActual,
      loadMunicipios,
      municipioFromUrl,
      getMunicipioUrl
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
