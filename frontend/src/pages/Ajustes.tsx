import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Bell, MessageCircle, Users, Wrench, ChevronRight, FolderTree, MapPin, FileText, LayoutDashboard } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationPreferences from '../components/NotificationPreferences';

type Tab = 'preferencias' | 'whatsapp' | 'usuarios' | 'empleados' | 'categorias' | 'zonas' | 'tipos-tramite' | 'dashboard';

export default function Ajustes() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('preferencias');

  const isAdmin = user?.rol === 'admin';
  const isSupervisor = user?.rol === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;

  const tabs: { id: Tab; label: string; icon: typeof Settings; show: boolean }[] = [
    { id: 'preferencias', label: 'Notificaciones', icon: Bell, show: true },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, show: isAdminOrSupervisor },
    { id: 'usuarios', label: 'Usuarios', icon: Users, show: isAdminOrSupervisor },
    { id: 'empleados', label: 'Empleados', icon: Wrench, show: isAdminOrSupervisor },
    { id: 'categorias', label: 'Categorias', icon: FolderTree, show: isAdminOrSupervisor },
    { id: 'zonas', label: 'Zonas', icon: MapPin, show: isAdminOrSupervisor },
    { id: 'tipos-tramite', label: 'Tipos Trámite', icon: FileText, show: isAdminOrSupervisor },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: isAdminOrSupervisor },
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

      {activeTab === 'categorias' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#8b5cf620' }}
            >
              <FolderTree className="h-8 w-8" style={{ color: '#8b5cf6' }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Gestion de Categorias
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Administra las categorias de reclamos: alumbrado, bacheo, limpieza, etc.
            </p>
            <Link
              to="/gestion/categorias"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: '#8b5cf6',
                color: '#ffffff',
              }}
            >
              Ir a Categorias
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'zonas' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#06b6d420' }}
            >
              <MapPin className="h-8 w-8" style={{ color: '#06b6d4' }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Gestion de Zonas
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Administra las zonas y barrios del municipio para asignar empleados.
            </p>
            <Link
              to="/gestion/zonas"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: '#06b6d4',
                color: '#ffffff',
              }}
            >
              Ir a Zonas
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'tipos-tramite' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <FileText className="h-8 w-8" style={{ color: '#10b981' }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Gestion de Tipos de Tramite
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Administra los tipos de tramites disponibles: habilitaciones, permisos, licencias, etc.
            </p>
            <Link
              to="/gestion/tipos-tramite"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: '#10b981',
                color: '#ffffff',
              }}
            >
              Ir a Tipos de Tramite
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="text-center py-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <LayoutDashboard className="h-8 w-8" style={{ color: theme.primary }} />
            </div>
            <h3 className="font-medium mb-2" style={{ color: theme.text }}>
              Configuracion del Dashboard
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: theme.textSecondary }}>
              Personaliza qué componentes ven los vecinos y empleados en sus dashboards.
            </p>
            <Link
              to="/gestion/config-dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:gap-3"
              style={{
                backgroundColor: theme.primary,
                color: '#ffffff',
              }}
            >
              Configurar Dashboard
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
