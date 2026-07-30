import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRouteForUser } from '../config/navigation';
import { Building2, Mail, Lock, Loader2, ArrowLeft, Shield, Users, User, AlertCircle, FileCheck, Wrench, Sparkles } from 'lucide-react';
import { validationSchemas } from '../lib/validations';
import { API_URL } from '../lib/api';
import { BRAND, IS_WHITE_LABEL } from '../brands';
import { BrandMark } from '../brands/BrandMark';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSuccess = async (tokenResponse: { access_token?: string }) => {
    if (!tokenResponse.access_token) {
      setError('No se recibió respuesta de Google');
      return;
    }

    setGoogleLoading(true);
    setError('');

    try {
      await loginWithGoogle(tokenResponse.access_token);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRouteForUser(user));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Error al iniciar sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Hook de Google Login con prompt para seleccionar cuenta
  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError('Error al conectar con Google'),
    flow: 'implicit',
    prompt: 'select_account', // Siempre muestra selector de cuenta
  });

  const handleGoogleClick = () => {
    // Logout previo para forzar selección de cuenta nueva
    googleLogout();
    googleLogin();
  };

  // Validaciones
  const emailValidation = validationSchemas.login.email(email);
  const passwordValidation = validationSchemas.login.password(password);

  // Leer valores de localStorage con state para forzar re-render
  const [municipioNombre, setMunicipioNombre] = useState<string | null>(null);
  const [municipioCodigo, setMunicipioCodigo] = useState<string | null>(null);
  const [municipioColor, setMunicipioColor] = useState(BRAND.primary);

  // Cargar datos del municipio al montar
  useEffect(() => {
    // Limpiar sesión anterior si existe
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    const nombre = localStorage.getItem('municipio_nombre');
    const codigo = localStorage.getItem('municipio_codigo');
    const color = localStorage.getItem('municipio_color');

    if (!codigo || !nombre) {
      // White-label monolítico: hay un único municipio fijo (el del brand). No
      // mandamos a elegir muni; cargamos el del brand para que el login (split)
      // se muestre con su identidad aunque el municipio aún no esté sembrado.
      if (IS_WHITE_LABEL && BRAND.municipioCodigo) {
        setMunicipioNombre(BRAND.name);
        setMunicipioCodigo(BRAND.municipioCodigo);
        setMunicipioColor(BRAND.primary);
        return;
      }
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
    setMunicipioColor(color || BRAND.primary);

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
      navigate(getDefaultRouteForUser(user));
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
      navigate(getDefaultRouteForUser(user));
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
    empleado: { icon: Wrench, color: 'from-emerald-500 to-teal-600', label: 'Empleado' },
    vecino: { icon: User, color: 'from-blue-500 to-indigo-600', label: 'Vecino' },
  };

  // Estado para usuarios demo cargados desde la API
  const [demoUsers, setDemoUsers] = useState<Array<{
    email: string;
    nombre: string;
    apellido: string;
    nombre_completo: string;
    rol: string;
    dependencia_nombre?: string | null;
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

  // ================= WHITE-LABEL: LOGIN SPLIT =================
  // Hero de marca a la izquierda + panel de acceso (perfiles + email) a la
  // derecha. Identidad propia con el verde del brand. Reusa toda la lógica de
  // auth (handleSubmit, quickLogin, Google) del login estándar.
  if (IS_WHITE_LABEL) {
    const accent = municipioColor;
    const features = [
      { Icon: AlertCircle, t: 'Reportá', s: 'RECLAMOS EN 1 MINUTO' },
      { Icon: Building2, t: 'Seguí', s: 'ESTADO EN TIEMPO REAL' },
      { Icon: FileCheck, t: 'Trámites', s: 'ONLINE, SIN FILAS' },
      { Icon: Wrench, t: 'Resolvé', s: 'CUADRILLAS Y OT' },
    ];
    return (
      <div className="min-h-screen w-full flex flex-col lg:flex-row text-white" style={{ background: '#06130b' }}>
        {/* ===== HERO (izquierda) ===== */}
        <div
          className="relative lg:w-1/2 flex flex-col justify-between gap-10 p-8 sm:p-12 lg:p-16 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #0d2a1a 0%, #071a0f 60%, #06130b 100%)' }}
        >
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-25" style={{ background: accent }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ background: accent }} />

          {/* marca */}
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center ring-1 ring-white/10" style={{ backgroundColor: `${accent}1f` }}>
              <BrandMark size={30} />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold" style={{ fontFamily: BRAND.nameFont }}>{BRAND.name}</div>
              <div className="text-[10px] font-semibold tracking-[0.25em]" style={{ color: accent }}>PLATAFORMA CIUDADANA</div>
            </div>
          </div>

          {/* copy */}
          <div className="relative max-w-lg">
            <div className="text-xs font-bold tracking-[0.25em] mb-4" style={{ color: accent }}>GESTIÓN MUNICIPAL</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.03]" style={{ fontFamily: BRAND.nameFont }}>
              De tu reclamo<br />a la <span style={{ color: accent }}>solución.</span>
            </h1>
            <p className="mt-6 text-base lg:text-lg text-emerald-50/70 leading-relaxed">
              {BRAND.tagline || 'Reclamos, trámites y seguimiento en tiempo real, en una sola plataforma.'}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-8">
              {features.map(({ Icon, t, s }) => (
                <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
                  <Icon className="h-5 w-5 mb-2" style={{ color: accent }} />
                  <div className="font-bold text-sm">{t}</div>
                  <div className="text-[10px] text-emerald-50/45 tracking-wide mt-0.5">{s}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center gap-2 text-[11px] text-emerald-50/40">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: accent }} />
            Sistema operativo · SSL · JWT 24h · 2026 {BRAND.name}
          </div>
        </div>

        {/* ===== PANEL (derecha) ===== */}
        <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16">
          <div className="w-full max-w-md">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6" style={{ backgroundColor: `${accent}1f` }}>
              <Sparkles className="h-6 w-6" style={{ color: accent }} />
            </div>
            <h2 className="text-3xl font-extrabold" style={{ fontFamily: BRAND.nameFont }}>Bienvenido</h2>
            <p className="text-emerald-50/60 mt-1 mb-6">Elegí un perfil para entrar a la demo</p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/25 text-red-300 px-4 py-3 rounded-xl text-sm mb-4">{error}</div>
            )}

            {demoUsers.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] font-semibold tracking-[0.2em] text-emerald-50/40 mb-2.5">ELEGÍ UN PERFIL</div>
                <div className="space-y-2">
                  {demoUsers.map((u, i) => {
                    const cfg = rolConfig[u.rol] || rolConfig.vecino;
                    const Icon = cfg.icon;
                    const titulo = u.rol === 'admin'
                      ? 'Administrador'
                      : u.rol === 'supervisor'
                        ? (u.dependencia_nombre?.replace(/^(Secretar[ií]a|Direcci[oó]n)\s+de\s+/i, '') || 'Supervisor')
                        : (u.nombre_completo || cfg.label);
                    const sub = u.rol === 'admin' ? 'Acceso total'
                      : u.rol === 'supervisor' ? 'Supervisor'
                      : cfg.label;
                    return (
                      <button
                        key={`${u.email}-${i}`}
                        type="button"
                        onClick={() => quickLogin(u.email, 'demo123')}
                        disabled={loading}
                        className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2.5 text-left transition-all disabled:opacity-50"
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}1a` }}>
                          <Icon className="h-4 w-4" style={{ color: accent }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold truncate">{titulo}</div>
                          <div className="text-[11px] text-emerald-50/45 truncate">{sub}</div>
                        </div>
                        <span className="text-emerald-50/30 flex-shrink-0" aria-hidden>→</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] tracking-[0.2em] text-emerald-50/40">O</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={googleLoading}
              className="mt-3 w-full flex items-center justify-center gap-3 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all disabled:opacity-60"
            >
              {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  <span>Continuar con Google</span>
                </>
              )}
            </button>

            <p className="text-center text-emerald-50/40 text-xs mt-6">
              {demoUsers.length > 0 ? 'Acceso de demostración' : 'Acceso'} · {municipioNombre}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: municipioColor }} />
          <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: municipioColor }} />
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
                className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl ring-1 ring-white/10"
                style={{ backgroundColor: `${municipioColor}22` }}
              >
                <BrandMark size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: BRAND.nameFont }}>{municipioNombre}</h1>
              <p className="text-slate-400 text-sm">{BRAND.tagline || 'Acceso al sistema'}</p>
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
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 text-white font-semibold rounded-xl transition-all shadow-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: `linear-gradient(135deg, ${municipioColor}, ${municipioColor}dd)`, boxShadow: `0 10px 25px ${municipioColor}40` }}
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
              <button
                type="button"
                onClick={handleGoogleClick}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed border border-gray-200"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    {/* Google Logo SVG */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Continuar con Google</span>
                  </>
                )}
              </button>

              {/* Acceso rápido demo — SOLO si el muni expone usuarios demo.
                  Clientes productivos (es_demo=False) devuelven lista vacía
                  desde el backend, así que esta sección no se renderiza. */}
              {demoUsers.length > 0 && (
                <>
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
                          onClick={() => quickLogin(user.email, 'demo123')}
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
                </>
              )}

              {/* Dependencia Users Section - Two Columns */}
              {dependenciaUsers.length > 0 && (
                <>
                  <div className="relative flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-slate-500 text-xs">DEPENDENCIAS</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          onClick={() => quickLogin(dep.email, 'demo123')}
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
                          onClick={() => quickLogin(dep.email, 'demo123')}
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
