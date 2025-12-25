import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { validationSchemas } from '../../lib/validations';

export default function MobileRegister() {
  const { theme } = useTheme();
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ nombre: false, email: false, password: false });

  const nombreValidation = validationSchemas.register.nombre(formData.nombre);
  const emailValidation = validationSchemas.register.email(formData.email);
  const passwordValidation = validationSchemas.register.password(formData.password);
  const isFormValid = nombreValidation.isValid && emailValidation.isValid && passwordValidation.isValid;

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: keyof typeof touched) => {
    setTouched(t => ({ ...t, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setError('');
    setLoading(true);

    try {
      const partes = formData.nombre.trim().split(' ');
      const nombre = partes[0] || '';
      const apellido = partes.slice(1).join(' ') || '-';

      await register({
        email: formData.email,
        password: formData.password,
        nombre,
        apellido,
      });

      navigate('/app');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: theme.background }}
    >
      <header className="p-4">
        <button
          onClick={() => navigate('/app')}
          className="flex items-center gap-2 text-sm"
          style={{ color: theme.textSecondary }}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
      </header>

      <main className="flex-1 flex flex-col justify-center px-6 pb-12">
        <div className="max-w-sm mx-auto w-full">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}15` }}
            >
              <User className="h-8 w-8" style={{ color: theme.primary }} />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>
              Crear Cuenta
            </h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Solo necesitamos 3 datos para empezar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="p-4 rounded-xl text-sm"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                Tu nombre
              </label>
              <div className="relative">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                  style={{ color: touched.nombre && !nombreValidation.isValid ? '#ef4444' : theme.textSecondary }}
                />
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => handleChange('nombre', e.target.value)}
                  onBlur={() => handleBlur('nombre')}
                  placeholder="Juan Pérez"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl focus:ring-2 focus:outline-none transition-all"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${touched.nombre && !nombreValidation.isValid ? '#ef4444' : theme.border}`,
                  }}
                />
              </div>
              {touched.nombre && !nombreValidation.isValid && (
                <p className="mt-1.5 text-xs text-red-500">{nombreValidation.error}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                  style={{ color: touched.email && !emailValidation.isValid ? '#ef4444' : theme.textSecondary }}
                />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  placeholder="tu@email.com"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl focus:ring-2 focus:outline-none transition-all"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${touched.email && !emailValidation.isValid ? '#ef4444' : theme.border}`,
                  }}
                />
              </div>
              {touched.email && !emailValidation.isValid && (
                <p className="mt-1.5 text-xs text-red-500">{emailValidation.error}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                  style={{ color: touched.password && !passwordValidation.isValid ? '#ef4444' : theme.textSecondary }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-12 pr-12 py-3.5 rounded-xl focus:ring-2 focus:outline-none transition-all"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${touched.password && !passwordValidation.isValid ? '#ef4444' : theme.border}`,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: theme.textSecondary }}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {touched.password && !passwordValidation.isValid && (
                <p className="mt-1.5 text-xs text-red-500">{passwordValidation.error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: theme.primary }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Crear Cuenta'
              )}
            </button>
          </form>

          <p className="text-center mt-6 text-sm" style={{ color: theme.textSecondary }}>
            ¿Ya tenés cuenta?{' '}
            <Link to="/app/login" className="font-medium" style={{ color: theme.primary }}>
              Iniciá sesión
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
