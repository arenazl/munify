import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, ShieldCheck, Mail, Lock, Phone } from 'lucide-react';
import { authApi } from '../lib/api';
import { getDefaultRoute } from '../config/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Callback de Didit: el vecino ya completo el flow de foto DNI + selfie.
 *
 * 1. Levantamos session_id del query param (o sessionStorage como backup).
 * 2. Mostramos formulario final: email + password + telefono (opcional).
 * 3. POST /auth/didit/register crea User con datos filiatorios verificados.
 * 4. Login automatico + redirect al panel.
 */
export default function RegisterDiditCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fromQuery = searchParams.get('session_id');
    const fromStorage = sessionStorage.getItem('didit_session_id');
    const sid = fromQuery || fromStorage;
    if (!sid) {
      setError('No encontramos tu sesión de verificación. Volvé a empezar.');
      return;
    }
    setSessionId(sid);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await authApi.diditRegister({
        session_id: sessionId,
        email,
        password,
        telefono: telefono || undefined,
      });
      // Guardar token y refrescar user.
      localStorage.setItem('access_token', res.data.access_token);
      sessionStorage.removeItem('didit_session_id');
      await refreshUser();

      const onboardingCompleted = localStorage.getItem('onboarding_completed');
      navigate(onboardingCompleted === 'true' ? getDefaultRoute('vecino') : '/onboarding');
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'No pudimos completar el registro.');
      setSubmitting(false);
    }
  };

  if (!sessionId && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Identidad verificada</h2>
          <p className="mt-2 text-sm text-slate-400">
            Completá con tu email y contraseña para terminar.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {error}
            {error.includes('sesión') && (
              <div className="mt-2">
                <Link to="/register" className="text-red-200 underline">Volver a empezar</Link>
              </div>
            )}
          </div>
        )}

        {sessionId && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Contraseña *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Teléfono (opcional)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+54 9 11 …"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)',
              }}
            >
              {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>

            <p className="text-xs text-slate-500 text-center">
              Tu DNI, nombre y demás datos filiatorios ya quedaron verificados con Didit.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
