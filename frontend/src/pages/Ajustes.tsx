import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings, Bell, MessageCircle, Users, Wrench, ChevronRight,
  FolderTree, MapPin, FileText, LayoutDashboard, UsersRound,
  CalendarOff, Clock, Building2, Check
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationPreferences from '../components/NotificationPreferences';

interface SettingCard {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  link: string;
  show: boolean;
}

interface SettingSection {
  id: string;
  title: string;
  items: SettingCard[];
}

export default function Ajustes() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<string>('general');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const isAdmin = user?.rol === 'admin';
  const isSupervisor = user?.rol === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;

  // Recuperar item seleccionado del localStorage
  useEffect(() => {
    const saved = localStorage.getItem('settings_selected_item');
    if (saved) {
      setSelectedItem(saved);
      // También activar la sección correcta
      const savedSection = localStorage.getItem('settings_selected_section');
      if (savedSection) {
        setActiveSection(savedSection);
      }
    }
  }, []);

  const sections: SettingSection[] = [
    {
      id: 'general',
      title: 'General',
      items: [
        {
          id: 'notificaciones',
          label: 'Notificaciones',
          description: 'Configura como recibir alertas y avisos',
          icon: Bell,
          color: '#3b82f6',
          link: '',
          show: true
        },
        {
          id: 'whatsapp',
          label: 'WhatsApp',
          description: 'Integracion con WhatsApp Business',
          icon: MessageCircle,
          color: '#25D366',
          link: '/gestion/whatsapp',
          show: isAdminOrSupervisor
        },
        {
          id: 'dashboard',
          label: 'Dashboard',
          description: 'Personaliza los dashboards por rol',
          icon: LayoutDashboard,
          color: '#8b5cf6',
          link: '/gestion/config-dashboard',
          show: isAdminOrSupervisor
        },
        {
          id: 'branding',
          label: 'Branding',
          description: 'Logo, colores y personalizacion',
          icon: Building2,
          color: '#ec4899',
          link: '/gestion/branding',
          show: isAdmin
        }
      ]
    },
    {
      id: 'usuarios',
      title: 'Usuarios y Empleados',
      items: [
        {
          id: 'usuarios',
          label: 'Usuarios',
          description: 'Vecinos, supervisores y administradores',
          icon: Users,
          color: '#3b82f6',
          link: '/gestion/usuarios',
          show: isAdminOrSupervisor
        },
        {
          id: 'empleados',
          label: 'Empleados',
          description: 'Equipos de trabajo y especialidades',
          icon: Wrench,
          color: '#f59e0b',
          link: '/gestion/empleados',
          show: isAdminOrSupervisor
        },
        {
          id: 'cuadrillas',
          label: 'Cuadrillas',
          description: 'Grupos de trabajo y asignaciones',
          icon: UsersRound,
          color: '#10b981',
          link: '/gestion/cuadrillas',
          show: isAdminOrSupervisor
        },
        {
          id: 'ausencias',
          label: 'Ausencias',
          description: 'Vacaciones, licencias y permisos',
          icon: CalendarOff,
          color: '#ef4444',
          link: '/gestion/ausencias',
          show: isAdminOrSupervisor
        },
        {
          id: 'horarios',
          label: 'Horarios',
          description: 'Turnos y horarios de trabajo',
          icon: Clock,
          color: '#06b6d4',
          link: '/gestion/horarios',
          show: isAdminOrSupervisor
        }
      ]
    },
    {
      id: 'catalogo',
      title: 'Catalogos',
      items: [
        {
          id: 'categorias',
          label: 'Categorias',
          description: 'Tipos de reclamos: alumbrado, bacheo, etc',
          icon: FolderTree,
          color: '#8b5cf6',
          link: '/gestion/categorias',
          show: isAdminOrSupervisor
        },
        {
          id: 'zonas',
          label: 'Zonas',
          description: 'Barrios y areas del municipio',
          icon: MapPin,
          color: '#06b6d4',
          link: '/gestion/zonas',
          show: isAdminOrSupervisor
        },
        {
          id: 'tipos-tramite',
          label: 'Tipos de Tramite',
          description: 'Categorías: Obras, Comercio, etc',
          icon: FolderTree,
          color: '#10b981',
          link: '/gestion/tipos-tramite',
          show: isAdminOrSupervisor
        },
        {
          id: 'tramites-catalogo',
          label: 'Catálogo Trámites',
          description: 'Trámites específicos: permisos, habilitaciones',
          icon: FileText,
          color: '#6366f1',
          link: '/gestion/tramites-catalogo',
          show: isAdminOrSupervisor
        }
      ]
    }
  ];

  const visibleSections = sections.map(section => ({
    ...section,
    items: section.items.filter(item => item.show)
  })).filter(section => section.items.length > 0);

  const sectionTabs = visibleSections.map(s => ({ id: s.id, title: s.title }));

  const currentSection = visibleSections.find(s => s.id === activeSection) || visibleSections[0];

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
              Configuracion del sistema y preferencias
            </p>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div
        className="flex gap-2 p-1.5 rounded-xl overflow-x-auto"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {sectionTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
            style={{
              backgroundColor: activeSection === tab.id ? theme.card : 'transparent',
              color: activeSection === tab.id ? theme.primary : theme.textSecondary,
              boxShadow: activeSection === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>

      {/* Section Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentSection?.items.map(item => {
          // Notificaciones es especial, se muestra inline
          if (item.id === 'notificaciones') {
            return (
              <div
                key={item.id}
                className="md:col-span-2 lg:col-span-3"
              >
                <NotificationPreferences />
              </div>
            );
          }

          const isSelected = selectedItem === item.id;

          return (
            <Link
              key={item.id}
              to={item.link}
              onClick={() => {
                setSelectedItem(item.id);
                localStorage.setItem('settings_selected_item', item.id);
                localStorage.setItem('settings_selected_section', activeSection);
              }}
              className="group relative rounded-xl p-5 transition-all hover:shadow-lg overflow-hidden"
              style={{
                backgroundColor: theme.card,
                border: isSelected ? `2px solid ${item.color}` : `1px solid ${theme.border}`,
                boxShadow: isSelected ? `0 0 0 3px ${item.color}20` : 'none',
              }}
            >
              {/* Linea indicadora lateral cuando esta seleccionado */}
              {isSelected && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: item.color }}
                />
              )}

              {/* Badge de seleccionado */}
              {isSelected && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: item.color }}
                >
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}

              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${item.color}20` }}
                >
                  <item.icon className="h-6 w-6" style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold" style={{ color: isSelected ? item.color : theme.text }}>
                      {item.label}
                    </h3>
                    <ChevronRight
                      className="h-5 w-5 transition-transform group-hover:translate-x-1"
                      style={{ color: isSelected ? item.color : theme.textSecondary }}
                    />
                  </div>
                  <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                    {item.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
