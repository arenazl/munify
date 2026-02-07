import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';
import { Building2, Mail, Lock, Loader2, ArrowLeft, Shield, Users, User, AlertCircle, FileCheck } from 'lucide-react';
import { validationSchemas } from '../lib/validations';
import { API_URL } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError('No se recibió respuesta de Google');
      return;
    }

    setGoogleLoading(true);
    setError('');

    try {
      await loginWithGoogle(credentialResponse.credential);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRoute(user.rol, !!user.dependencia));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Error al iniciar sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Validaciones
  const emailValidation = validationSchemas.login.email(email);
  const passwordValidation = validationSchemas.login.password(password);

  // Leer valores de localStorage con state para forzar re-render
  const [municipioNombre, setMunicipioNombre] = useState<string | null>(null);
  const [municipioCodigo, setMunicipioCodigo] = useState<string | null>(null);
  const [municipioColor, setMunicipioColor] = useState('#3b82f6');

  // Cargar datos del municipio al montar
  useEffect(() => {
    // Limpiar sesión anterior si existe
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    const nombre = localStorage.getItem('municipio_nombre');
    const codigo = localStorage.getItem('municipio_codigo');
    const color = localStorage.getItem('municipio_color');

    if (!codigo || !nombre) {
      // Limpiar todo y redirigir
      localStorage.removeItem('municipio_codigo');
      localStorage.removeItem('municipio_id');
      localStorage.removeItem('municipio_nombre');
      localStorage.removeItem('municipio_color');
      navigate('/bienvenido');
      return;
    }

    setMunicipioNombre(nombre);
    setMunicipioCodigo(codigo);
    setMunicipioColor(color || '#3b82f6');

    // Pre-llenar email si viene desde el botón de supervisor
    const prefilledEmail = localStorage.getItem('prefill_email');
    if (prefilledEmail) {
      setEmail(prefilledEmail);
      localStorage.removeItem('prefill_email'); // Limpiar después de usar
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRoute(user.rol, !!user.dependencia));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Email o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (userEmail: string, userPassword: string) => {
    setEmail(userEmail);
    setPassword(userPassword);
    setError('');
    setLoading(true);

    try {
      await login(userEmail, userPassword);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRoute(user.rol, !!user.dependencia));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  // Configuración visual por rol
  const rolConfig: Record<string, { icon: typeof Shield; color: string; label: string }> = {
    admin: { icon: Shield, color: 'from-red-500 to-rose-600', label: 'Administrador' },
    supervisor: { icon: Users, color: 'from-orange-500 to-amber-600', label: 'Supervisor' },
    vecino: { icon: User, color: 'from-blue-500 to-indigo-600', label: 'Vecino' },
  };

  // Estado para usuarios demo cargados desde la API
  const [demoUsers, setDemoUsers] = useState<Array<{
    email: string;
    nombre: string;
    apellido: string;
    nombre_completo: string;
    rol: string;
  }>>([]);

  // Estado para usuarios de dependencia
  const [dependenciaUsers, setDependenciaUsers] = useState<Array<{
    email: string;
    nombre_dependencia: string;
    color: string | null;
    icono: string | null;
    reclamos_count: number;
    tramites_count: number;
    maneja_reclamos: boolean;
    maneja_tramites: boolean;
  }>>([]);

  // API_URL importado desde lib/api.ts

  // Cargar usuarios demo y dependencia desde la API
  useEffect(() => {
    if (municipioCodigo) {
      // Cargar usuarios demo
      const loadDemoUsers = async () => {
        try {
          const response = await fetch(`${API_URL}/municipios/public/${municipioCodigo}/demo-users`);
          if (response.ok) {
            const users = await response.json();
            setDemoUsers(users);
          }
        } catch (error) {
          console.error('Error al cargar usuarios demo:', error);
        }
      };

      // Cargar usuarios de dependencia
      const loadDependenciaUsers = async () => {
        try {
          const response = await fetch(`${API_URL}/municipios/public/${municipioCodigo}/dependencia-users`);
          if (response.ok) {
            const users = await response.json();
            setDependenciaUsers(users);
          }
        } catch (error) {
          console.error('Error al cargar usuarios dependencia:', error);
        }
      };

      loadDemoUsers();
      loadDependenciaUsers();
    }
  }, [municipioCodigo]);

  // No renderizar hasta que se carguen los datos del municipio
  if (!municipioNombre || !municipioCodigo) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="px-4 py-6">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => navigate('/publico')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            {/* Logo y título */}
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
                style={{ backgroundColor: `${municipioColor}20` }}
              >
                <Building2 className="h-8 w-8" style={{ color: municipioColor }} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">{municipioNombre}</h1>
              <p className="text-slate-400 text-sm">Acceso al sistema</p>
            </div>

            {/* Form Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <div className="relative">
                    <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${touched.email && !emailValidation.isValid ? 'text-red-400' : 'text-slate-500'}`} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouched(t => ({ ...t, email: true }))}
                      className={`w-full pl-12 pr-4 py-3 bg-white/5 border rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${
                        touched.email && !emailValidation.isValid
                          ? 'border-red-500/50 focus:border-red-500/50'
                          : 'border-white/10 focus:border-blue-500/50'
                      }`}
                      placeholder="tu@email.com"
                    />
                  </div>
                  {touched.email && !emailValidation.isValid && (
                    <p className="mt-1 text-xs text-red-400">{emailValidation.error}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Contraseña</label>
                  <div className="relative">
                    <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${touched.password && !passwordValidation.isValid ? 'text-red-400' : 'text-slate-500'}`} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched(t => ({ ...t, password: true }))}
                      className={`w-full pl-12 pr-4 py-3 bg-white/5 border rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${
                        touched.password && !passwordValidation.isValid
                          ? 'border-red-500/50 focus:border-red-500/50'
                          : 'border-white/10 focus:border-blue-500/50'
                      }`}
                      placeholder="Tu contraseña"
                    />
                  </div>
                  {touched.password && !passwordValidation.isValid && (
                    <p className="mt-1 text-xs text-red-400">{passwordValidation.error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !emailValidation.isValid || !passwordValidation.isValid}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Ingresando...
                    </>
                  ) : (
                    'Ingresar'
                  )}
                </button>
              </form>

              {/* Divider - Google */}
              <div className="relative flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-slate-500 text-xs">O</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Google Sign-In */}
              <div className="flex justify-center">
                {googleLoading ? (
                  <div className="flex items-center justify-center gap-2 py-3 px-6 bg-white/10 rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                    <span className="text-white text-sm">Conectando con Google...</span>
                  </div>
                ) : (
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError('Error al conectar con Google')}
                    theme="filled_black"
                    size="large"
                    text="continue_with"
                    shape="rectangular"
                    width={300}
                  />
                )}
              </div>

              {/* Divider */}
              <div className="relative flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-slate-500 text-xs">ACCESO RÁPIDO (DEMO)</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Quick login buttons */}
              <div className="grid grid-cols-2 gap-3">
                {demoUsers.map((user, index) => {
                  const config = rolConfig[user.rol] || rolConfig.vecino;
                  const Icon = config.icon;
                  return (
                    <button
                      key={`${user.rol}-${index}`}
                      type="button"
                      onClick={() => quickLogin(user.email, '123456')}
                      disabled={loading}
                      className={`relative overflow-hidden bg-gradient-to-r ${config.color} text-white py-3 px-4 rounded-xl text-sm font-medium transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] shadow-lg`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <div className="text-left min-w-0">
                          <div className="font-semibold truncate">{user.nombre_completo}</div>
                          <div className="text-[10px] opacity-80">{config.label}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-500 text-center mt-4">
                Los botones de acceso rápido son solo para demostración
              </p>

              {/* Dependencia Users Section - Two Columns */}
              {dependenciaUsers.length > 0 && (
                <>
                  <div className="relative flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-slate-500 text-xs">DEPENDENCIAS</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Columna Reclamos */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Reclamos</span>
                      </div>
                      {dependenciaUsers.filter(d => d.maneja_reclamos).map((dep, index) => (
                        <button
                          key={`dep-rec-${index}`}
                          type="button"
                          onClick={() => quickLogin(dep.email, '123456')}
                          disabled={loading}
                          className="w-full relative overflow-hidden text-white py-2 px-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] shadow-md"
                          style={{
                            background: `linear-gradient(135deg, ${dep.color || '#ef4444'} 0%, ${dep.color || '#ef4444'}cc 100%)`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="text-[11px] font-medium truncate">{dep.nombre_dependencia}</span>
                          </div>
                        </button>
                      ))}
                      {dependenciaUsers.filter(d => d.maneja_reclamos).length === 0 && (
                        <p className="text-[10px] text-slate-500 text-center py-2">Sin dependencias</p>
                      )}
                    </div>

                    {/* Columna Trámites */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileCheck className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Trámites</span>
                      </div>
                      {dependenciaUsers.filter(d => d.maneja_tramites).map((dep, index) => (
                        <button
                          key={`dep-tram-${index}`}
                          type="button"
                          onClick={() => quickLogin(dep.email, '123456')}
                          disabled={loading}
                          className="w-full relative overflow-hidden text-white py-2 px-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] shadow-md"
                          style={{
                            background: `linear-gradient(135deg, ${dep.color || '#3b82f6'} 0%, ${dep.color || '#3b82f6'}cc 100%)`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="text-[11px] font-medium truncate">{dep.nombre_dependencia}</span>
                          </div>
                        </button>
                      ))}
                      {dependenciaUsers.filter(d => d.maneja_tramites).length === 0 && (
                        <p className="text-[10px] text-slate-500 text-center py-2">Sin dependencias</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer link */}
            <div className="text-center mt-6">
              <p className="text-slate-500 text-sm">
                ¿Sos vecino?{' '}
                <button
                  onClick={() => navigate('/nuevo-reclamo')}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Creá tu reclamo
                </button>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
