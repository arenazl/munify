import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Bell, MessageCircle, Users, Wrench, ChevronRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationPreferences from '../components/NotificationPreferences';

type Tab = 'preferencias' | 'whatsapp' | 'usuarios' | 'empleados';

export default function Ajustes() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('preferencias');

  const isAdmin = user?.rol === 'admin';
  const isSupervisor = user?.rol === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;

  const tabs: { id: Tab; label: string; icon: typeof Settings; show: boolean; link?: string }[] = [
    { id: 'preferencias', label: 'Notificaciones', icon: Bell, show: true },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, show: isAdminOrSupervisor, link: '/gestion/whatsapp' },
    { id: 'usuarios', label: 'Usuarios', icon: Users, show: isAdminOrSupervisor, link: '/gestion/usuarios' },
    { id: 'empleados', label: 'Empleados', icon: Wrench, show: isAdminOrSupervisor, link: '/gestion/empleados' },
  ];

  const visibleTabs = tabs.filter(t => t.show);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl px-5 py-4"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Settings className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>
              Ajustes
            </h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Preferencias y configuracion del sistema
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        className="flex gap-2 p-1.5 rounded-xl overflow-x-auto"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
            style={{
              backgroundColor: activeTab === tab.id ? theme.card : 'transparent',
              color: activeTab === tab.id ? theme.primary : theme.textSecondary,
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'preferencias' && (
        <NotificationPreferences />
      )}

      {activeTab === 'whatsapp' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#25D36620' }}
            >
              <MessageCircle className="h-8 w-8" style={{ color: '#25D366' }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Configuracion de WhatsApp Business
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Configura la integracion con WhatsApp para enviar notificaciones automaticas a vecinos, empleados y supervisores.
            </p>
            <Link
              to="/gestion/whatsapp"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: '#25D366',
                color: '#ffffff',
              }}
            >
              Ir a Configuracion
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'usuarios' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <Users className="h-8 w-8" style={{ color: theme.primary }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Gestion de Usuarios
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Administra los usuarios del sistema: vecinos, supervisores y administradores.
            </p>
            <Link
              to="/gestion/usuarios"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: theme.primary,
                color: '#ffffff',
              }}
            >
              Ir a Usuarios
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'empleados' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#f59e0b20' }}
            >
              <Wrench className="h-8 w-8" style={{ color: '#f59e0b' }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Gestion de Empleados
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Administra los equipos de trabajo, asigna zonas y especialidades a cada empleado.
            </p>
            <Link
              to="/gestion/empleados"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: '#f59e0b',
                color: '#ffffff',
              }}
            >
              Ir a Empleados
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
