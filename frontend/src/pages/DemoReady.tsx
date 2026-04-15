import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Shield, User, Sparkles, ArrowLeft, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRouteForUser } from '../config/navigation';
import api from '../lib/api';
import munifyLogo from '../assets/munify_logo.png';

/**
 * Pantalla "demo lista" — landing ultra-minimalista a la que redirige
 * `Demo.tsx::handleCrearDemo` después de crear un municipio de demo en vivo.
 *
 * Muestra únicamente los 2 botones de quick-login (Admin / Vecino) del muni
 * recién creado. Sin selector, sin grid, sin iniciar-sesión, sin "o entrá a
 * otro" — es una hoja teatral de entrega: *"armé tu demo, entrá y probá".*
 *
 * Flow:
 *   1. Lee `?muni=<codigo>` de la URL.
 *   2. Llama al endpoint público `/municipios/public/{codigo}/demo-users`
 *      para traer `admin@<codigo>.demo.com` y `vecino@<codigo>.demo.com`.
 *   3. Renderiza los 2 botones. Click → quick-login con `demo123` →
 *      redirect al dashboard correspondiente al rol.
 */

interface DemoUser {
  email: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  rol: string;
  dependencia_nombre?: string;
}

export default function DemoReady() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const codigo = searchParams.get('muni') || '';
  const municipioNombre = (() => {
    // Capitaliza: "san-pedro" → "San Pedro"
    if (!codigo) return '';
    return codigo
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  })();

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  useEffect(() => {
    if (!codigo) {
      setError('No se recibió el código del municipio');
      setLoading(false);
      return;
    }
    const fetchUsers = async () => {
      try {
        const res = await api.get(`/municipios/public/${codigo}/demo-users`);
        setUsers(res.data);
      } catch (err) {
        console.error(err);
        setError('No pudimos cargar los usuarios de demo de ese municipio');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [codigo]);

  const adminUser = users.find((u) => u.rol === 'admin');
  const supervisorUser = users.find((u) => u.rol === 'supervisor');
  const vecinoUser = users.find((u) => u.rol === 'vecino');

  const handleQuickLogin = async (role: 'admin' | 'supervisor' | 'vecino') => {
    const target = role === 'admin' ? adminUser : role === 'supervisor' ? supervisorUser : vecinoUser;
    if (!target) return;
    setQuickLoading(true);
    setError('');
    try {
      await login(target.email, 'demo123');
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRouteForUser(user));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Error ingresando con la cuenta de demo');
      setQuickLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden flex flex-col">
      {/* Glow de fondo */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex-shrink-0 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={munifyLogo} alt="Munify" className="h-9 w-auto" />
            <span className="text-xl font-bold text-white">Munify</span>
          </div>
          <button
            onClick={() => navigate('/demo')}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white font-medium text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Crear otra demo
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-3xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
              <p className="text-slate-400">Preparando tu demo...</p>
            </div>
          ) : (
            <>
              {/* Hero de celebración */}
              <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                    Demo lista
                  </span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
                  {municipioNombre || 'Tu demo'}
                </h1>
                <p className="text-slate-400 text-lg">
                  Elegí cómo querés entrar a probar la plataforma
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm text-center">
                  {error}
                </div>
              )}

              {/* 3 botones: Admin + Supervisor + Vecino */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => handleQuickLogin('admin')}
                  disabled={quickLoading || !adminUser}
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl"
                >
                  <div className="flex flex-col gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white mb-1">Como Admin</h3>
                      <p className="text-xs text-rose-100/90">
                        Gestioná reclamos, trámites, dependencias y usuarios
                      </p>
                      {adminUser && (
                        <p className="text-[10px] text-rose-100/70 font-mono mt-2 truncate">
                          {adminUser.email}
                        </p>
                      )}
                    </div>
                  </div>
                  {quickLoading && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </button>

                <button
                  onClick={() => handleQuickLogin('supervisor')}
                  disabled={quickLoading || !supervisorUser}
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl"
                >
                  <div className="flex flex-col gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white mb-1">Como Supervisor</h3>
                      <p className="text-xs text-amber-100/90">
                        Gestioná los reclamos de tu dependencia
                      </p>
                      {supervisorUser && (
                        <>
                          {supervisorUser.dependencia_nombre && (
                            <p className="text-[11px] text-amber-100/80 font-medium mt-1">
                              {supervisorUser.dependencia_nombre}
                            </p>
                          )}
                          <p className="text-[10px] text-amber-100/70 font-mono mt-1 truncate">
                            {supervisorUser.email}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {quickLoading && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </button>

                <button
                  onClick={() => handleQuickLogin('vecino')}
                  disabled={quickLoading || !vecinoUser}
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl"
                >
                  <div className="flex flex-col gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white mb-1">Como Vecino</h3>
                      <p className="text-xs text-blue-100/90">
                        Cargá reclamos y trámites como ciudadano
                      </p>
                      {vecinoUser && (
                        <p className="text-[10px] text-blue-100/70 font-mono mt-2 truncate">
                          {vecinoUser.email}
                        </p>
                      )}
                    </div>
                  </div>
                  {quickLoading && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </button>
              </div>

              <p className="text-center text-slate-500 text-xs mt-8">
                Las 3 cuentas usan la contraseña <span className="font-mono text-slate-400">demo123</span> —
                podés cerrar sesión y probar otra cuando quieras.
              </p>
            </>
          )}
        </div>
      </main>

      <footer className="relative z-10 flex-shrink-0 py-6 px-6">
        <p className="text-center text-slate-500 text-sm">
          Munify — Demo en vivo
        </p>
      </footer>
    </div>
  );
}
