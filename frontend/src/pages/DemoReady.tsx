import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Shield, User, ArrowLeft, Building2, Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRouteForUser } from '../config/navigation';
import api from '../lib/api';
import { BrandMark } from '../brands/BrandMark';
import { BRAND } from '../brands';
import DemoPinGate from '../components/DemoPinGate';
// Misma hoja que el generador: es la pantalla siguiente del mismo embudo y
// comparte sus tokens (`.dm-fondo`) para no desincronizar dos paletas.
import './Demo.css';

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
  // QUIÉN está entrando (su email), no "si alguien entra": con un booleano
  // global el spinner se prendía en TODAS las tarjetas al tocar una (doble
  // loading que reportó el dueño, 2026-08-28).
  const [entrando, setEntrando] = useState<string | null>(null);

  // Demo PROTEGIDA por PIN: los botones se ven, pero el quick-login pide la
  // clave numérica y la usa como password real (misma mecánica que Login).
  const [demoProtegido, setDemoProtegido] = useState(false);
  const [pinGateEmail, setPinGateEmail] = useState<string | null>(null);
  const [pinError, setPinError] = useState('');

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
        const ficha = await api.get(`/municipios/public/${codigo}`);
        setDemoProtegido(Boolean(ficha.data?.demo_protegido));
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
  const supervisorUsers = users.filter((u) => u.rol === 'supervisor');
  const empleadoUsers = users.filter((u) => u.rol === 'empleado');
  const vecinoUser = users.find((u) => u.rol === 'vecino');

  const handleQuickLoginByEmail = async (email: string | undefined) => {
    if (!email) return;
    // Demo protegida: la password real es el PIN. Sin PIN en esta sesión,
    // se abre el modal y el login sigue desde confirmarPin.
    let pass = 'demo123';
    if (demoProtegido) {
      const pinGuardado = sessionStorage.getItem(`demo_pin_${codigo}`);
      if (!pinGuardado) {
        setPinError('');
        setPinGateEmail(email);
        return;
      }
      pass = pinGuardado;
    }
    setEntrando(email);
    setError('');
    try {
      await login(email, pass);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRouteForUser(user));
    } catch (err: unknown) {
      if (demoProtegido) {
        sessionStorage.removeItem(`demo_pin_${codigo}`);
        setPinError('PIN incorrecto. Probá de nuevo.');
        setPinGateEmail(email);
      } else {
        const e = err as { response?: { data?: { detail?: string } } };
        setError(e.response?.data?.detail || 'Error ingresando con la cuenta de demo');
      }
      setEntrando(null);
    }
  };

  const confirmarPin = (pin: string) => {
    if (!pinGateEmail) return;
    sessionStorage.setItem(`demo_pin_${codigo}`, pin);
    void handleQuickLoginByEmail(pinGateEmail);
  };

  return (
    <div className="dm-fondo relative overflow-hidden">
      <div className="dm-capa">
      <header className="dm-header">
        <div className="dm-header-caja">
          <div className="dm-marca">
            <BrandMark size={32} variant="content" />
            <span className="dm-marca-nombre">{BRAND.name}</span>
          </div>
          <button onClick={() => navigate('/demo')} className="dm-link-suave">
            <ArrowLeft className="h-3.5 w-3.5" />
            Crear otra demo
          </button>
        </div>
      </header>

      <main className="dm-main dr-centro">
        <div className="dm-shell dr-shell">
          {loading ? (
            <div className="dm-cargando">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Preparando tu demo...</p>
            </div>
          ) : (
            <>
              {/* Hero de entrega */}
              <div className="dr-hero">
                <span className="dm-eyebrow">
                  <span className="dm-pulso" />
                  Demo lista
                </span>
                <h1 className="dm-titulo">{municipioNombre || 'Tu demo'}</h1>
                <p className="dm-bajada">
                  Elegí cómo querés entrar a probar la plataforma
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="dm-error">{error}</div>
              )}

              {/* Admin + Vecino arriba (roles globales) */}
              <div className="dr-duo">
                <button
                  onClick={() => handleQuickLoginByEmail(adminUser?.email)}
                  disabled={entrando !== null || !adminUser}
                  className="dr-rol dr-rol--ink"
                >
                  <span className="dr-rol-ico">
                    <Shield className="h-5 w-5" />
                  </span>
                  <h3 className="dr-rol-tit">Como Admin</h3>
                  <p className="dr-rol-desc">
                    Gestioná reclamos, trámites, dependencias y usuarios
                  </p>
                  {adminUser && (
                    <span className="dr-rol-mail">{adminUser.email}</span>
                  )}
                  {entrando === adminUser?.email && (
                    <span className="dr-rol-velo">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleQuickLoginByEmail(vecinoUser?.email)}
                  disabled={entrando !== null || !vecinoUser}
                  className="dr-rol"
                >
                  <span className="dr-rol-ico">
                    <User className="h-5 w-5" />
                  </span>
                  <h3 className="dr-rol-tit">Como Vecino</h3>
                  <p className="dr-rol-desc">
                    Cargá reclamos y trámites como ciudadano
                  </p>
                  {vecinoUser && (
                    <span className="dr-rol-mail">{vecinoUser.email}</span>
                  )}
                  {entrando === vecinoUser?.email && (
                    <span className="dr-rol-velo">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </span>
                  )}
                </button>
              </div>

              {/* Supervisores por dependencia */}
              {supervisorUsers.length > 0 && (
                <div className="dr-grupo">
                  <div className="dr-grupo-tit">
                    <Building2 className="h-4 w-4" />
                    Supervisores por dependencia
                    <span className="dr-grupo-cuenta">({supervisorUsers.length})</span>
                  </div>
                  <div className="dr-mini-grilla">
                    {supervisorUsers.map((sup) => (
                      <button
                        key={sup.email}
                        onClick={() => handleQuickLoginByEmail(sup.email)}
                        disabled={entrando !== null}
                        className="dr-mini"
                      >
                        <span className="dr-mini-ico">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <span className="dr-mini-txt">
                          <span className="dr-mini-tit">
                            {sup.dependencia_nombre || sup.apellido || 'Dependencia'}
                          </span>
                          <span className="dr-mini-mail">{sup.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empleados de campo (circuito de mis-trabajos / órdenes de trabajo) */}
              {empleadoUsers.length > 0 && (
                <div className="dr-grupo">
                  <div className="dr-grupo-tit">
                    <Wrench className="h-4 w-4" />
                    Empleados de campo
                    <span className="dr-grupo-cuenta">({empleadoUsers.length})</span>
                  </div>
                  <div className="dr-mini-grilla">
                    {empleadoUsers.map((emp) => (
                      <button
                        key={emp.email}
                        onClick={() => handleQuickLoginByEmail(emp.email)}
                        disabled={entrando !== null}
                        className="dr-mini"
                      >
                        <span className="dr-mini-ico">
                          <Wrench className="h-4 w-4" />
                        </span>
                        <span className="dr-mini-txt">
                          <span className="dr-mini-tit">{emp.nombre_completo}</span>
                          <span className="dr-mini-mail">{emp.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="dr-nota">
                Todas las cuentas usan la contraseña <code>demo123</code> —
                podés cerrar sesión y probar otra cuando quieras.
              </p>
            </>
          )}
        </div>
      </main>

      <footer className="dm-pie">
        <p>{BRAND.name} — Demo en vivo</p>
      </footer>
      </div>
      <DemoPinGate
        abierto={pinGateEmail !== null}
        nombreMunicipio={municipioNombre}
        cargando={entrando !== null}
        error={pinError}
        onSubmit={confirmarPin}
        onClose={() => { setPinGateEmail(null); setPinError(''); }}
      />
    </div>
  );
}
