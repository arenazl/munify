import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Clock, AlertTriangle, FileText, User } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { notificacionesApi } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Notificacion {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
  reclamo_id?: number;
}

interface NotificacionesDropdownProps {
  sidebarMode?: boolean;
  sidebarTextColor?: string;
  sidebarHoverColor?: string;
  sidebarBgHover?: string;
  sidebarWidth?: string;
}

export function NotificacionesDropdown({ sidebarMode, sidebarTextColor, sidebarHoverColor, sidebarBgHover, sidebarWidth }: NotificacionesDropdownProps = {}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch inicial y polling cada 30 segundos
  useEffect(() => {
    fetchNotificaciones();
    fetchCount();

    const interval = setInterval(() => {
      fetchCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotificaciones = async () => {
    setLoading(true);
    try {
      const response = await notificacionesApi.getAll();
      setNotificaciones(response.data.slice(0, 10)); // Últimas 10
    } catch (error) {
      console.error('Error fetching notificaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCount = async () => {
    try {
      const response = await notificacionesApi.getCount();
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('Error fetching count:', error);
    }
  };

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotificaciones();
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await notificacionesApi.marcarLeida(id);
      setNotificaciones(notificaciones.map(n =>
        n.id === id ? { ...n, leida: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleNotificationClick = async (notif: Notificacion) => {
    // Marcar como leída si no lo está
    if (!notif.leida) {
      await markAsRead(notif.id);
    }

    // Cerrar dropdown
    setIsOpen(false);

    // Navegar al reclamo si tiene reclamo_id
    if (notif.reclamo_id) {
      // URL varía según el rol del usuario
      const isGestion = user?.rol === 'supervisor' || user?.rol === 'admin';
      const basePath = isGestion ? '/gestion/reclamos' : '/reclamos';
      navigate(`${basePath}/${notif.reclamo_id}`);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificacionesApi.marcarTodasLeidas();
      setNotificaciones(notificaciones.map(n => ({ ...n, leida: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'nuevo_reclamo':
        return <FileText className="h-4 w-4" />;
      case 'asignacion':
        return <User className="h-4 w-4" />;
      case 'estado_cambio':
        return <Clock className="h-4 w-4" />;
      case 'alerta_sla':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getIconColor = (tipo: string) => {
    switch (tipo) {
      case 'nuevo_reclamo':
        return '#3b82f6';
      case 'asignacion':
        return '#8b5cf6';
      case 'estado_cambio':
        return '#22c55e';
      case 'alerta_sla':
        return '#f59e0b';
      default:
        return theme.primary;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className={`${sidebarMode ? 'p-2 rounded-lg' : 'p-1.5 rounded-md'} transition-all duration-200 hover:scale-105 active:scale-95 relative group`}
        style={{ color: sidebarMode ? sidebarTextColor : theme.textSecondary }}
        onMouseEnter={(e) => {
          if (sidebarMode && sidebarBgHover && sidebarHoverColor) {
            e.currentTarget.style.backgroundColor = sidebarBgHover;
            e.currentTarget.style.color = sidebarHoverColor;
          }
        }}
        onMouseLeave={(e) => {
          if (sidebarMode) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = sidebarTextColor || theme.text;
          }
        }}
      >
        <Bell className={`${sidebarMode ? 'h-5 w-5' : 'h-4 w-4'} ${isOpen ? '' : 'group-hover:animate-wiggle'}`} strokeWidth={sidebarMode ? 2 : 3} />
        {unreadCount > 0 && (
          <span
            className={`absolute ${sidebarMode ? '-top-0.5 -right-0.5 min-w-[16px] h-[16px] text-[9px]' : '-top-1 -right-1 min-w-[14px] h-[14px] text-[8px]'} flex items-center justify-center font-bold text-white rounded-full`}
            style={{ backgroundColor: '#ef4444' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className={`fixed inset-0 ${sidebarMode ? 'z-[60]' : 'z-40'}`}
            onClick={() => setIsOpen(false)}
          />
          <div
            className={`fixed rounded-xl shadow-2xl ${sidebarMode ? 'z-[70] w-80' : 'z-50 left-4 right-4 sm:left-auto sm:right-2 sm:w-96'} overflow-hidden animate-scale-in ${sidebarMode ? 'origin-top-left' : 'origin-top-right'}`}
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              maxHeight: sidebarMode ? 'calc(100vh - 100px)' : '70vh',
              top: sidebarMode ? '180px' : '60px',
              left: sidebarMode ? (sidebarWidth ? `calc(${sidebarWidth} + 8px)` : '200px') : undefined,
            }}
          >
            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" style={{ color: theme.primary }} />
                <span className="font-semibold text-sm" style={{ color: theme.text }}>
                  Notificaciones
                </span>
                {unreadCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                  >
                    {unreadCount} nuevas
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium flex items-center gap-1 transition-colors hover:opacity-80"
                  style={{ color: theme.primary }}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 100px)' }}>
              {loading ? (
                <div className="px-4 py-8 text-center">
                  <div
                    className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent mx-auto"
                    style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
                  />
                </div>
              ) : notificaciones.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-20" style={{ color: theme.textSecondary }} />
                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                    No hay notificaciones
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: theme.border }}>
                  {notificaciones.map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 flex gap-3 transition-colors cursor-pointer ${!notif.leida ? '' : 'opacity-60'}`}
                      style={{
                        backgroundColor: !notif.leida ? `${theme.primary}05` : 'transparent',
                      }}
                      onClick={() => !notif.leida && markAsRead(notif.id)}
                    >
                      {/* Icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: `${getIconColor(notif.tipo)}15`,
                          color: getIconColor(notif.tipo),
                        }}
                      >
                        {getIcon(notif.tipo)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${!notif.leida ? 'font-semibold' : 'font-medium'}`}
                          style={{ color: theme.text }}
                        >
                          {notif.titulo}
                        </p>
                        <p
                          className="text-xs mt-0.5 line-clamp-2"
                          style={{ color: theme.textSecondary }}
                        >
                          {notif.mensaje}
                        </p>
                        <p
                          className="text-[10px] mt-1"
                          style={{ color: theme.textSecondary }}
                        >
                          {formatTime(notif.created_at)}
                        </p>
                      </div>

                      {/* Unread indicator */}
                      {!notif.leida && (
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
                          style={{ backgroundColor: theme.primary }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notificaciones.length > 0 && (
              <div
                className="px-4 py-2 text-center border-t"
                style={{ borderColor: theme.border, backgroundColor: theme.backgroundSecondary }}
              >
                <button
                  onClick={() => {
                    setIsOpen(false);
                    // Navegar a página de notificaciones si existe
                  }}
                  className="text-xs font-medium"
                  style={{ color: theme.primary }}
                >
                  Ver todas las notificaciones
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
