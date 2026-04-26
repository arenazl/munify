import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';
import { Camera, MapPin, ShieldCheck, Search, Building2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { authApi, municipiosApi } from '../lib/api';

interface MunicipioPublico {
  id: number;
  nombre: string;
  codigo: string;
  provincia?: string;
  logo_url?: string;
  color_primario?: string;
}

/**
 * Registro con dos caminos:
 *
 *   1. Verificacion con DNI + selfie (Didit) — nivel 2.
 *      Flow: POST /auth/didit/session -> redirect a Didit hosted UI ->
 *      vuelve a /register/didit-callback?session_id=X -> completar email+pass
 *      -> POST /auth/didit/register crea el User con datos filiatorios.
 *
 *   2. Google OAuth — nivel 1 (solo email verificado, sin DNI).
 *      Permite crear reclamos pero para trámites pedira subir a nivel 2.
 *
 * El registro con formulario manual (nombre+DNI+email+pass) se quito: si
 * lo dejabamos como opcion, el 80% lo elegia y el KYC no servia para nada.
 */
export default function Register() {
  const [error, setError] = useState('');
  const [diditLoading, setDiditLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [municipioId, setMunicipioId] = useState<number | null>(null);
  const [municipioNombre, setMunicipioNombre] = useState<string | null>(null);
  const [municipioCodigo, setMunicipioCodigo] = useState<string | null>(null);
  const [municipios, setMunicipios] = useState<MunicipioPublico[]>([]);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Carga muni de localStorage o de query param ?municipio=codigo.
  // Si no hay ninguno, mostramos autocompleta in-page (no redirige a /demo).
  useEffect(() => {
    const idLocal = localStorage.getItem('municipio_id');
    const codeFromUrl = searchParams.get('municipio');

    if (idLocal) {
      setMunicipioId(parseInt(idLocal, 10));
      setMunicipioNombre(localStorage.getItem('municipio_nombre'));
      setMunicipioCodigo(localStorage.getItem('municipio_codigo'));
      return;
    }

    setLoadingMunicipios(true);
    municipiosApi.getPublic()
      .then((r) => {
        const list = (r.data || []) as MunicipioPublico[];
        setMunicipios(list);
        if (codeFromUrl) {
          const match = list.find((m) => m.codigo === codeFromUrl);
          if (match) {
            seleccionarMunicipio(match);
          }
        }
      })
      .catch(() => setMunicipios([]))
      .finally(() => setLoadingMunicipios(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seleccionarMunicipio = (m: MunicipioPublico) => {
    localStorage.setItem('municipio_id', String(m.id));
    localStorage.setItem('municipio_nombre', m.nombre);
    localStorage.setItem('municipio_codigo', m.codigo);
    setMunicipioId(m.id);
    setMunicipioNombre(m.nombre);
    setMunicipioCodigo(m.codigo);
  };

  const cambiarMuni = () => {
    localStorage.removeItem('municipio_id');
    localStorage.removeItem('municipio_nombre');
    localStorage.removeItem('municipio_codigo');
    setMunicipioId(null);
    setMunicipioNombre(null);
    setMunicipioCodigo(null);
  };

  // ===== Didit =====
  const handleDidit = async () => {
    setDiditLoading(true);
    setError('');
    try {
      const res = await authApi.diditSession(municipioCodigo || undefined);
      const { session_id, url } = res.data;
      // Guardamos el session_id para recuperarlo al volver del callback.
      sessionStorage.setItem('didit_session_id', session_id);
      // Redirect a la UI hosted de Didit.
      window.location.href = url;
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'No se pudo iniciar la verificación.');
      setDiditLoading(false);
    }
  };

  // ===== Google =====
  const handleGoogleSuccess = async (tokenResponse: { access_token?: string }) => {
    if (!tokenResponse.access_token) {
      setError('No se recibió respuesta de Google');
      return;
    }
    setGoogleLoading(true);
    setError('');
    try {
      await loginWithGoogle(tokenResponse.access_token);
      const pendingReclamo = localStorage.getItem('pending_reclamo');
      if (pendingReclamo) {
        localStorage.removeItem('pending_reclamo');
        navigate('/nuevo-reclamo');
      } else {
        const onboardingCompleted = localStorage.getItem('onboarding_completed');
        navigate(onboardingCompleted === 'true' ? getDefaultRoute('vecino') : '/onboarding');
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Error al iniciar sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError('Error al conectar con Google'),
    flow: 'implicit',
    prompt: 'select_account',
  });

  const handleGoogleClick = () => {
    googleLogout();
    googleLogin();
  };

  const anyLoading = diditLoading || googleLoading;
  const muniListo = !!municipioId;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4">
      <div className="max-w-sm w-full">
        {municipioNombre ? (
          <div className="flex items-center justify-center gap-2 mb-6 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <MapPin className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-blue-300">{municipioNombre}</span>
            <button
              onClick={cambiarMuni}
              className="ml-2 text-xs text-slate-400 hover:text-white underline"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <MunicipioAutocomplete
            municipios={municipios}
            loading={loadingMunicipios}
            onSelect={seleccionarMunicipio}
          />
        )}

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-4">
            <ShieldCheck className="h-8 w-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Creá tu cuenta</h2>
          <p className="mt-2 text-sm text-slate-400">
            Verificá tu identidad una vez. Usá la app para siempre.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Botón principal: Didit */}
        <button
          type="button"
          onClick={handleDidit}
          disabled={anyLoading || !muniListo}
          className="w-full rounded-2xl p-5 mb-3 text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)',
          }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Camera className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-base">
                {diditLoading ? 'Abriendo verificación…' : 'Verificar con DNI + selfie'}
              </div>
              <div className="text-white/75 text-xs mt-0.5">
                Toma 30 segundos · Recomendado
              </div>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">o para demo</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        {/* Botón secundario: Google */}
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={anyLoading || !muniListo}
          className="w-full rounded-2xl p-4 flex items-center gap-3 bg-white text-slate-900 font-medium transition-all active:scale-[0.98] hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>{googleLoading ? 'Entrando…' : 'Continuar con Google'}</span>
        </button>

        <div className="mt-6 text-center text-xs text-slate-500 leading-relaxed">
          Con Google solo verificamos tu email.<br />
          Para trámites con peso legal, el sistema te pedirá después verificar con DNI.
        </div>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-blue-400 hover:text-blue-300">
            ¿Ya tenés cuenta? Ingresá
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Autocomplete de municipios — el usuario puede tipear el nombre
// y se le sugieren matches. Aparece cuando no hay muni en localStorage.
// ============================================================
function MunicipioAutocomplete({ municipios, loading, onSelect }: {
  municipios: MunicipioPublico[];
  loading: boolean;
  onSelect: (m: MunicipioPublico) => void;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const sugerencias = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return municipios.slice(0, 6);
    const norm = (s: string) => s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, ''); // sin tildes
    const t = norm(term);
    return municipios
      .map((m) => {
        const nombre = norm(m.nombre);
        if (nombre.startsWith(t)) return { m, score: 0 };
        if (nombre.includes(t)) return { m, score: 1 };
        return { m, score: 99 };
      })
      .filter((x) => x.score < 99)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map((x) => x.m);
  }, [municipios, q]);

  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-wider font-semibold mb-2 text-slate-400 flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5" />
        Elegí tu municipio para empezar
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Ej: La Matanza, Chacabuco..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
        />
      </div>

      {loading && (
        <div className="mt-2 text-xs text-slate-500 text-center py-3">Cargando municipios…</div>
      )}

      {(focused || q) && sugerencias.length > 0 && (
        <div className="mt-2 rounded-xl bg-slate-800/80 border border-slate-700 overflow-hidden max-h-72 overflow-y-auto">
          {sugerencias.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(m)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700/50 transition-colors"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: m.color_primario ? `${m.color_primario}30` : '#3b82f630',
                  color: m.color_primario || '#3b82f6',
                }}
              >
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{m.nombre}</p>
                {m.provincia && (
                  <p className="text-[11px] text-slate-400 truncate">{m.provincia}</p>
                )}
              </div>
              <Check className="h-4 w-4 text-blue-400 opacity-0" />
            </button>
          ))}
        </div>
      )}

      {q.length >= 2 && sugerencias.length === 0 && !loading && (
        <p className="mt-2 text-xs text-slate-500 text-center py-2">
          No encontramos un municipio con ese nombre.
        </p>
      )}
    </div>
  );
}
