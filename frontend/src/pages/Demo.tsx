import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Shield, Users, Wrench, User, MapPinned, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';
import { API_URL } from '../lib/api';
import munifyLogo from '../assets/munify_logo.png';

export default function Demo() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Configuración visual por rol - usando colores Munify
  // Orden: Supervisor, Vecino, Empleado Técnico, Empleado Administrativo
  const demoProfiles = [
    {
      id: 'supervisor',
      name: 'Ana Martínez',
      role: 'supervisor',
      email: 'ana.martinez@demo.com',
      label: 'Supervisor',
      description: 'Coordina equipos y monitorea métricas',
      icon: Users,
      gradient: 'from-[#0088cc] to-[#2aa198]',
      features: ['Asignar trabajos', 'Ver reportes', 'Gestionar equipos']
    },
    {
      id: 'vecino',
      name: 'María García',
      role: 'vecino',
      email: 'maria.garcia@demo.com',
      label: 'Vecino',
      description: 'Crea reclamos, hace trámites y sigue el estado',
      icon: User,
      gradient: 'from-[#0088cc] to-[#56b4e9]',
      features: ['Crear reclamos', 'Iniciar trámites', 'Ver estado en tiempo real']
    },
    {
      id: 'empleado-tecnico',
      name: 'Carlos López',
      role: 'empleado',
      email: 'carlos.lopez@demo.com',
      label: 'Técnico',
      description: 'Resuelve trabajos en campo con la app móvil',
      icon: Wrench,
      gradient: 'from-[#2aa198] to-[#56cecb]',
      features: ['Tablero de tareas', 'Actualizar estados', 'Subir fotos']
    },
    {
      id: 'empleado-admin',
      name: 'Roberto Fernández',
      role: 'empleado',
      email: 'roberto.fernandez@demo.com',
      label: 'Administrativo',
      description: 'Gestiona trámites y documentación',
      icon: Shield,
      gradient: 'from-[#006699] to-[#0088cc]',
      features: ['Gestión de trámites', 'Revisión de documentos', 'Atención al público']
    }
  ];

  // Login con perfil demo
  const loginWithProfile = async (email: string, role: string) => {
    setLoading(true);
    setLoadingRole(email);
    setError('');

    try {
      console.log('[Demo] Iniciando login con email:', email);

      // Setear información del municipio ANTES del login
      localStorage.setItem('municipio_codigo', 'chacabuco');
      localStorage.setItem('municipio_id', '1');
      localStorage.setItem('municipio_nombre', 'Chacabuco');
      localStorage.setItem('municipio_color', '#0088cc');

      // Hacer login directamente con el email específico
      console.log('[Demo] Ejecutando login...');
      await login(email, 'demo123');

      // Obtener usuario y navegar
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      console.log('[Demo] Usuario autenticado:', user);

      const defaultRoute = getDefaultRoute(user.rol);
      console.log('[Demo] Navegando a:', defaultRoute);

      navigate(defaultRoute, { replace: true });
    } catch (err: unknown) {
      console.error('[Demo] Error en login:', err);
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      setError(error.response?.data?.detail || error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
      setLoadingRole(null);
    }
  };

  const continueAsGuest = () => {
    localStorage.setItem('municipio_codigo', 'chacabuco');
    localStorage.setItem('municipio_id', '1');
    localStorage.setItem('municipio_nombre', 'Chacabuco');
    localStorage.setItem('municipio_color', '#0088cc');
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Header - Glassmorphism como la landing */}
      <header className="fixed top-0 left-0 right-0 z-50" style={{
        backdropFilter: 'blur(20px) saturate(180%)',
        background: 'rgba(255, 255, 255, 0.7)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.5)',
      }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={munifyLogo} alt="Munify" className="h-10 w-auto" />
            <span className="text-2xl font-bold text-slate-800">Munify</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://munify.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:block text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Ver Landing
            </a>
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-5 py-2.5 text-white rounded-lg font-semibold text-sm transition-all shadow-md hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0088cc 0%, #2aa198 100%)' }}
            >
              Iniciar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src={munifyLogo} alt="Munify" className="h-20 w-auto" />
              <h1 className="text-5xl md:text-6xl font-bold text-slate-800">Munify</h1>
            </div>
            <p className="text-xl md:text-2xl text-slate-500 max-w-2xl mx-auto">
              Conectando al gobierno con las necesidades del vecino
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="max-w-md mx-auto mb-8 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          {/* Botones principales */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={continueAsGuest}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-700 font-semibold hover:border-[#0088cc] hover:text-[#0088cc] transition-all disabled:opacity-50"
            >
              <MapPinned className="h-5 w-5" />
              Entrar como Invitado
            </button>
            <button
              onClick={() => navigate('/register')}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-slate-100 rounded-xl text-slate-600 font-semibold hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              Crear Cuenta
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center gap-4 mb-10">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-slate-400 text-sm font-medium px-4">PERFILES DE DEMOSTRACIÓN</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Profile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {demoProfiles.map((profile) => {
              const Icon = profile.icon;
              const isLoading = loadingRole === profile.email;

              return (
                <button
                  key={profile.id}
                  onClick={() => loginWithProfile(profile.email, profile.role)}
                  disabled={loading}
                  className="group relative bg-white border border-slate-200 rounded-2xl p-5 text-left transition-all hover:shadow-xl hover:shadow-slate-200/60 hover:border-[#0088cc]/30 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <div className="relative">
                    {/* Icon & Badge */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${profile.gradient} flex items-center justify-center shadow-lg`}>
                        {isLoading ? (
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        ) : (
                          <Icon className="h-6 w-6 text-white" />
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
                        {profile.label}
                      </span>
                    </div>

                    {/* Name & Description */}
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{profile.name}</h3>
                    <p className="text-sm text-slate-500 mb-4">{profile.description}</p>

                    {/* Features */}
                    <ul className="space-y-1.5">
                      {profile.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-xs text-slate-500">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#2aa198]" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Hover arrow */}
                    <div className={`absolute -bottom-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full bg-gradient-to-br ${profile.gradient} opacity-0 group-hover:opacity-100 transition-all shadow-lg`}>
                      <ArrowRight className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info */}
          <p className="text-center text-slate-400 text-sm mt-10">
            Los perfiles de demo tienen datos precargados para explorar todas las funcionalidades
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>Munify - Sistema de Gestión Municipal Inteligente</span>
          <a href="https://munify.com.ar" target="_blank" rel="noopener noreferrer" className="hover:text-[#0088cc] transition-colors">
            Más información
          </a>
        </div>
      </footer>
    </div>
  );
}
