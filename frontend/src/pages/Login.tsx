import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';
import { Building2, Mail, Lock, Loader2, ArrowLeft, Shield, Users, Wrench, User } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const municipioNombre = localStorage.getItem('municipio_nombre') || 'Mi Municipio';
  const municipioCodigo = localStorage.getItem('municipio_codigo') || 'merlo';
  const municipioColor = localStorage.getItem('municipio_color') || '#3b82f6';

  // Construir dominio de emails basado en el municipio seleccionado
  const domain = `${municipioCodigo}.test.com`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRoute(user.rol));
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
      navigate(getDefaultRoute(user.rol));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const testUsers = [
    {
      email: `admin@${domain}`,
      password: '123456',
      label: 'Administrador',
      icon: Shield,
      color: 'from-red-500 to-rose-600',
      description: 'Control total del sistema'
    },
    {
      email: `supervisor@${domain}`,
      password: '123456',
      label: 'Supervisor',
      icon: Users,
      color: 'from-orange-500 to-amber-600',
      description: 'Asigna y supervisa reclamos'
    },
    {
      email: `cuadrilla@${domain}`,
      password: '123456',
      label: 'Cuadrilla',
      icon: Wrench,
      color: 'from-green-500 to-emerald-600',
      description: 'Resuelve reclamos en campo'
    },
    {
      email: `vecino@${domain}`,
      password: '123456',
      label: 'Vecino',
      icon: User,
      color: 'from-blue-500 to-indigo-600',
      description: 'Crea y sigue sus reclamos'
    },
  ];

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
              <p className="text-slate-400 text-sm">Acceso para empleados municipales</p>
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
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      placeholder={`usuario@${domain}`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      placeholder="Tu contraseña"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50"
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

              {/* Divider */}
              <div className="relative flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-slate-500 text-xs">ACCESO RÁPIDO (DEMO)</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Quick login buttons */}
              <div className="grid grid-cols-2 gap-3">
                {testUsers.map((user, index) => {
                  const Icon = user.icon;
                  return (
                    <button
                      key={`${user.label}-${index}`}
                      type="button"
                      onClick={() => quickLogin(user.email, user.password)}
                      disabled={loading}
                      className={`relative overflow-hidden bg-gradient-to-r ${user.color} text-white py-3 px-4 rounded-xl text-sm font-medium transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] shadow-lg`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <div className="text-left">
                          <div className="font-semibold">{user.label}</div>
                          <div className="text-[10px] opacity-80">{user.description}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-500 text-center mt-4">
                Los botones de acceso rápido son solo para demostración
              </p>
            </div>

            {/* Footer link */}
            <div className="text-center mt-6">
              <p className="text-slate-500 text-sm">
                ¿Sos vecino?{' '}
                <button
                  onClick={() => navigate('/publico')}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Creá tu reclamo sin registrarte
                </button>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
