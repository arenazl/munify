import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, Palette, Building2, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, themes, ThemeName } from '../contexts/ThemeContext';
import { getNavigation } from '../config/navigation';
import { PageTransition } from './ui/PageTransition';
import { ChatWidget } from './ChatWidget';
import { NotificacionesDropdown } from './NotificacionesDropdown';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [nombreMunicipio, setNombreMunicipio] = useState('Mi Municipio');
  const { user, logout } = useAuth();
  const { theme, themeName, setTheme } = useTheme();
  const location = useLocation();

  // Cargar nombre del municipio desde configuración
  useEffect(() => {
    const fetchNombreMunicipio = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const response = await fetch(`${apiUrl}/configuracion/publica/municipio`);
        if (response.ok) {
          const data = await response.json();
          if (data.nombre_municipio) {
            // Extraer nombre corto (quitar "Municipalidad de ")
            const nombre = data.nombre_municipio.replace('Municipalidad de ', '');
            setNombreMunicipio(nombre);
          }
        }
      } catch (error) {
        console.error('Error cargando nombre del municipio:', error);
      }
    };
    fetchNombreMunicipio();
  }, []);

  if (!user) return null;

  const navigation = getNavigation(user.rol);

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.background }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 shadow-xl transform transition-all duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: theme.sidebar }}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)` }}
            >
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-light tracking-wide" style={{ color: theme.textSecondary }}>Municipalidad</span>
              <span className="text-base font-bold" style={{ color: theme.text }}>{nombreMunicipio}</span>
            </div>
          </div>
          <button
            className="lg:hidden p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
            onClick={() => setSidebarOpen(false)}
            style={{ color: theme.text }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] group relative overflow-hidden"
                style={{
                  backgroundColor: isActive ? theme.primary : 'transparent',
                  color: isActive ? '#ffffff' : theme.textSecondary,
                }}
                onClick={() => setSidebarOpen(false)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = `${theme.primary}15`;
                    e.currentTarget.style.color = theme.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = theme.textSecondary;
                  }
                }}
              >
                {/* Barra lateral animada en hover */}
                <div
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200 ${isActive ? 'h-6 opacity-100' : 'h-0 opacity-0 group-hover:h-4 group-hover:opacity-100'}`}
                  style={{ backgroundColor: isActive ? '#ffffff' : theme.primary }}
                />
                <Icon className={`h-5 w-5 mr-3 transition-all duration-200 ${!isActive ? 'group-hover:scale-110 group-hover:text-primary' : ''}`} style={{ color: !isActive ? undefined : '#ffffff' }} />
                <span className="transition-transform duration-200 group-hover:translate-x-1">{item.name}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

      </div>

      {/* Main content */}
      <div className="lg:pl-64 transition-all duration-300">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 shadow-sm backdrop-blur-md transition-colors duration-300"
          style={{ backgroundColor: `${theme.card}ee` }}
        >
          <div className="flex items-center justify-between h-16 px-4">
            <button
              className="lg:hidden p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
              onClick={() => setSidebarOpen(true)}
              style={{ color: theme.text }}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1 lg:flex-none" />

            <div className="flex items-center space-x-3">
              {/* User info */}
              <div className="hidden sm:flex items-center gap-3 pr-3 border-r" style={{ borderColor: theme.border }}>
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: theme.primary }}
                >
                  {user.nombre[0]}{user.apellido[0]}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium leading-none" style={{ color: theme.text }}>
                    {user.nombre} {user.apellido}
                  </p>
                  <p className="text-xs capitalize mt-0.5" style={{ color: theme.textSecondary }}>
                    {user.rol}
                  </p>
                </div>
              </div>

              {/* Theme selector */}
              <div className="relative">
                <button
                  className="p-2 rounded-full transition-all duration-200 hover:scale-110 hover:rotate-12 active:scale-95"
                  onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                  style={{ color: theme.textSecondary }}
                >
                  <Palette className="h-5 w-5" />
                </button>

                {themeMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setThemeMenuOpen(false)}
                    />
                    <div
                      className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-50 overflow-hidden animate-scale-in origin-top-right"
                      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                    >
                      <div className="py-1">
                        {(Object.keys(themes) as ThemeName[]).map((key, index) => (
                          <button
                            key={key}
                            onClick={() => {
                              setTheme(key);
                              setThemeMenuOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-all duration-200 hover:translate-x-1"
                            style={{
                              color: themeName === key ? theme.primary : theme.text,
                              backgroundColor: themeName === key ? theme.backgroundSecondary : 'transparent',
                              animationDelay: `${index * 50}ms`,
                            }}
                          >
                            <div
                              className="w-5 h-5 rounded-full border-2 transition-transform duration-200 hover:scale-110"
                              style={{
                                backgroundColor: themes[key].background,
                                borderColor: themes[key].primary
                              }}
                            />
                            {themes[key].label}
                            {themeName === key && (
                              <div className="ml-auto">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <NotificacionesDropdown />

              {/* Configuración - solo para admin */}
              {user.rol === 'admin' && (
                <Link
                  to="/configuracion"
                  className="p-2 rounded-full transition-all duration-200 hover:scale-110 hover:rotate-45 active:scale-95"
                  style={{ color: theme.textSecondary }}
                >
                  <Settings className="h-5 w-5" />
                </Link>
              )}

              <button
                onClick={logout}
                className="flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 group"
                style={{ color: theme.text }}
              >
                <LogOut className="h-4 w-4 mr-2 transition-transform duration-200 group-hover:-translate-x-1" />
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* Page content with transition - padding reducido en móvil */}
        <main className="p-3 sm:p-6" style={{ color: theme.text }}>
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Custom CSS for animations and gradients */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
        }

        .animate-slide-in-right {
          animation: slide-in-right 0.4s ease-out;
        }

        .group-hover\\:animate-wiggle:hover {
          animation: wiggle 0.5s ease-in-out;
        }

        /* Gradient utilities for Kanban */
        .gradient-blue-purple {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
        }

        .gradient-orange-red {
          background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
        }

        .gradient-green-cyan {
          background: linear-gradient(135deg, #22c55e 0%, #06b6d4 100%);
        }

        .gradient-title {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #22c55e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gradient-border-blue {
          border-image: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%) 1;
        }

        .gradient-border-orange {
          border-image: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%) 1;
        }

        .gradient-border-green {
          border-image: linear-gradient(135deg, #22c55e 0%, #06b6d4 100%) 1;
        }

        .card-gradient-blue {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border-left: 4px solid transparent;
          border-image: linear-gradient(180deg, #3b82f6 0%, #8b5cf6 100%) 1;
        }

        .card-gradient-orange {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%);
          border-left: 4px solid transparent;
          border-image: linear-gradient(180deg, #f59e0b 0%, #ef4444 100%) 1;
        }

        .card-gradient-green {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%);
          border-left: 4px solid transparent;
          border-image: linear-gradient(180deg, #22c55e 0%, #06b6d4 100%) 1;
        }

        .hover-lift {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .hover-lift:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }

        .gradient-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      {/* Chat Widget con IA */}
      <ChatWidget />
    </div>
  );
}
