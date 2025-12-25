import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Plus, ClipboardList, User, LogOut } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function MobileLayout() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/app');
  };

  const tabs = [
    { path: '/app', icon: Home, label: 'Inicio', end: true },
    { path: '/app/mis-reclamos', icon: ClipboardList, label: 'Reclamos', end: false },
    { path: '/app/nuevo', icon: Plus, label: 'Nuevo', end: false },
    { path: '/app/perfil', icon: User, label: 'Perfil', end: false },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: theme.card,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <ClipboardList className="h-4 w-4" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: theme.text }}>
              {localStorage.getItem('municipio_nombre') || 'Mi Municipio'}
            </h1>
            {user && (
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Hola, {user.nombre}
              </p>
            )}
          </div>
        </div>

        {user && (
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg transition-colors"
            style={{ color: theme.textSecondary }}
          >
            <LogOut className="h-5 w-5" />
          </button>
        )}
      </header>

      {/* Main Content */}
      <main style={{ paddingTop: '60px', paddingBottom: '70px', minHeight: '100vh' }}>
        <Outlet />
      </main>

      {/* Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          backgroundColor: theme.card,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className="flex flex-col items-center py-1 px-4"
            >
              {({ isActive }) => (
                <>
                  <div
                    className="p-2 rounded-xl"
                    style={{
                      backgroundColor: isActive ? `${theme.primary}15` : 'transparent',
                    }}
                  >
                    <tab.icon
                      className="h-5 w-5"
                      style={{ color: isActive ? theme.primary : theme.textSecondary }}
                    />
                  </div>
                  <span
                    className="text-[10px] mt-0.5 font-medium"
                    style={{ color: isActive ? theme.primary : theme.textSecondary }}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
