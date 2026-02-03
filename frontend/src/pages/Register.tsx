import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';
import { User, Mail, Lock, ArrowRight, MapPin } from 'lucide-react';
import { validationSchemas } from '../lib/validations';

export default function Register() {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ nombre: false, email: false, password: false });
  const [municipioNombre, setMunicipioNombre] = useState<string | null>(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  // Verificar que hay municipio seleccionado
  useEffect(() => {
    const municipioId = localStorage.getItem('municipio_id');
    const nombre = localStorage.getItem('municipio_nombre');

    if (!municipioId) {
      // Redirigir a demo si no hay municipio
      navigate('/demo', { replace: true });
      return;
    }

    setMunicipioNombre(nombre);
  }, [navigate]);

  // Validaciones
  const nombreValidation = validationSchemas.register.nombre(formData.nombre);
  const emailValidation = validationSchemas.register.email(formData.email);
  const passwordValidation = validationSchemas.register.password(formData.password);
  const isFormValid = nombreValidation.isValid && emailValidation.isValid && passwordValidation.isValid;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleBlur = (field: 'nombre' | 'email' | 'password') => {
    setTouched(t => ({ ...t, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Separar nombre y apellido (si hay espacio)
      const partes = formData.nombre.trim().split(' ');
      const nombre = partes[0] || '';
      const apellido = partes.slice(1).join(' ') || '-';

      await register({
        email: formData.email,
        password: formData.password,
        nombre,
        apellido,
      });

      // Verificar si el usuario venía de querer crear un reclamo
      const pendingReclamo = localStorage.getItem('pending_reclamo');
      if (pendingReclamo) {
        localStorage.removeItem('pending_reclamo');
        navigate('/nuevo-reclamo');
      } else {
        // Ir al onboarding para configurar PWA y notificaciones
        const onboardingCompleted = localStorage.getItem('onboarding_completed');
        if (onboardingCompleted === 'true') {
          navigate(getDefaultRoute('vecino'));
        } else {
          navigate('/onboarding');
        }
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4">
      <div className="max-w-sm w-full">
        {/* Municipio seleccionado */}
        {municipioNombre && (
          <div className="flex items-center justify-center gap-2 mb-6 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <MapPin className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-blue-300">{municipioNombre}</span>
            <button
              onClick={() => navigate('/demo')}
              className="ml-2 text-xs text-slate-400 hover:text-white underline"
            >
              Cambiar
            </button>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-4">
            <User className="h-8 w-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            Crear cuenta
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Solo necesitamos 3 datos para empezar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Nombre */}
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-300 mb-1">
              Tu nombre
            </label>
            <div className="relative">
              <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${touched.nombre && !nombreValidation.isValid ? 'text-red-400' : 'text-slate-500'}`} />
              <input
                id="nombre"
                name="nombre"
                type="text"
                placeholder="Juan Pérez"
                value={formData.nombre}
                onChange={handleChange}
                onBlur={() => handleBlur('nombre')}
                className={`w-full pl-10 pr-4 py-3 bg-slate-800/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  touched.nombre && !nombreValidation.isValid
                    ? 'border-red-500/50 focus:border-red-500/50'
                    : 'border-slate-700 focus:border-transparent'
                }`}
              />
            </div>
            {touched.nombre && !nombreValidation.isValid && (
              <p className="mt-1 text-xs text-red-400">{nombreValidation.error}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${touched.email && !emailValidation.isValid ? 'text-red-400' : 'text-slate-500'}`} />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
                onBlur={() => handleBlur('email')}
                className={`w-full pl-10 pr-4 py-3 bg-slate-800/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  touched.email && !emailValidation.isValid
                    ? 'border-red-500/50 focus:border-red-500/50'
                    : 'border-slate-700 focus:border-transparent'
                }`}
              />
            </div>
            {touched.email && !emailValidation.isValid && (
              <p className="mt-1 text-xs text-red-400">{emailValidation.error}</p>
            )}
          </div>

          {/* Contraseña */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${touched.password && !passwordValidation.isValid ? 'text-red-400' : 'text-slate-500'}`} />
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={handleChange}
                onBlur={() => handleBlur('password')}
                className={`w-full pl-10 pr-4 py-3 bg-slate-800/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  touched.password && !passwordValidation.isValid
                    ? 'border-red-500/50 focus:border-red-500/50'
                    : 'border-slate-700 focus:border-transparent'
                }`}
              />
            </div>
            {touched.password && !passwordValidation.isValid && (
              <p className="mt-1 text-xs text-red-400">{passwordValidation.error}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Continuar
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>

          {/* Link a login */}
          <p className="text-center text-sm text-slate-400 mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
