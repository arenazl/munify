import { useEffect, useState } from 'react';
import {
  MessageCircle, Send, ToggleLeft, ToggleRight, AlertTriangle,
  CheckCircle, XCircle, Loader2, Bell, RefreshCw, History, BarChart3,
  Phone, Key, Building2, Shield, Zap, FileText, UserCheck, Play,
  ClipboardList, Search, Hash
} from 'lucide-react';
import { toast } from 'sonner';
import { whatsappApi, reclamosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import type { Reclamo } from '../types';
import SettingsHeader from '../components/ui/SettingsHeader';

type Provider = 'meta' | 'twilio';

interface WhatsAppConfig {
  id: number;
  municipio_id: number;
  habilitado: boolean;
  provider: Provider;
  meta_configurado: boolean;
  twilio_configurado: boolean;
  // Notificaciones al usuario
  notificar_reclamo_recibido: boolean;
  notificar_reclamo_asignado: boolean;
  notificar_cambio_estado: boolean;
  notificar_reclamo_resuelto: boolean;
  notificar_comentarios: boolean;
  // Notificaciones al empleado
  notificar_empleado_asignacion: boolean;
  notificar_empleado_nuevo_comentario: boolean;
  notificar_empleado_cambio_prioridad: boolean;
  // Notificaciones al supervisor
  notificar_supervisor_reclamo_nuevo: boolean;
  notificar_supervisor_reclamo_resuelto: boolean;
  notificar_supervisor_reclamo_vencido: boolean;
  created_at: string;
  updated_at: string | null;
}

interface WhatsAppConfigFull extends WhatsAppConfig {
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_business_account_id: string | null;
  meta_webhook_verify_token: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
}

interface WhatsAppLog {
  id: number;
  telefono: string;
  tipo_mensaje: string;
  mensaje: string | null;
  enviado: boolean;
  error: string | null;
  created_at: string;
}

interface WhatsAppStats {
  total_enviados: number;
  total_fallidos: number;
  enviados_hoy: number;
  enviados_semana: number;
  por_tipo: Record<string, number>;
}

export default function WhatsAppConfigPage() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'actions' | 'logs' | 'stats'>('config');

  // Config
  const [config, setConfig] = useState<WhatsAppConfigFull | null>(null);
  const [formData, setFormData] = useState({
    habilitado: false,
    provider: 'meta' as Provider,
    // Meta
    meta_phone_number_id: '',
    meta_access_token: '',
    meta_business_account_id: '',
    meta_webhook_verify_token: '',
    // Twilio
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    // Notificaciones al usuario
    notificar_reclamo_recibido: true,
    notificar_reclamo_asignado: true,
    notificar_cambio_estado: true,
    notificar_reclamo_resuelto: true,
    notificar_comentarios: false,
    // Notificaciones al empleado
    notificar_empleado_asignacion: true,
    notificar_empleado_nuevo_comentario: true,
    notificar_empleado_cambio_prioridad: true,
    // Notificaciones al supervisor
    notificar_supervisor_reclamo_nuevo: true,
    notificar_supervisor_reclamo_resuelto: true,
    notificar_supervisor_reclamo_vencido: true,
  });

  // Test
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');

  // Logs
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Stats
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Actions - Reclamos
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loadingReclamos, setLoadingReclamos] = useState(false);
  const [searchReclamo, setSearchReclamo] = useState('');
  const [sendingAction, setSendingAction] = useState<number | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    } else if (activeTab === 'stats') {
      fetchStats();
    } else if (activeTab === 'actions') {
      fetchReclamos();
    }
  }, [activeTab]);

  const fetchConfig = async () => {
    try {
      // Primero intentamos obtener config pública
      const publicRes = await whatsappApi.getConfig();
      const publicConfig = publicRes.data;

      // Si existe config (id > 0), intentamos obtener la completa
      if (publicConfig.id > 0) {
        try {
          const fullRes = await whatsappApi.getConfigFull();
          setConfig(fullRes.data);
          setFormData({
            habilitado: fullRes.data.habilitado,
            provider: fullRes.data.provider,
            meta_phone_number_id: fullRes.data.meta_phone_number_id || '',
            meta_access_token: fullRes.data.meta_access_token || '',
            meta_business_account_id: fullRes.data.meta_business_account_id || '',
            meta_webhook_verify_token: fullRes.data.meta_webhook_verify_token || '',
            twilio_account_sid: fullRes.data.twilio_account_sid || '',
            twilio_auth_token: fullRes.data.twilio_auth_token || '',
            twilio_phone_number: fullRes.data.twilio_phone_number || '',
            notificar_reclamo_recibido: fullRes.data.notificar_reclamo_recibido,
            notificar_reclamo_asignado: fullRes.data.notificar_reclamo_asignado,
            notificar_cambio_estado: fullRes.data.notificar_cambio_estado,
            notificar_reclamo_resuelto: fullRes.data.notificar_reclamo_resuelto,
            notificar_comentarios: fullRes.data.notificar_comentarios,
            notificar_empleado_asignacion: fullRes.data.notificar_empleado_asignacion ?? true,
            notificar_empleado_nuevo_comentario: fullRes.data.notificar_empleado_nuevo_comentario ?? true,
            notificar_empleado_cambio_prioridad: fullRes.data.notificar_empleado_cambio_prioridad ?? true,
            notificar_supervisor_reclamo_nuevo: fullRes.data.notificar_supervisor_reclamo_nuevo ?? true,
            notificar_supervisor_reclamo_resuelto: fullRes.data.notificar_supervisor_reclamo_resuelto ?? true,
            notificar_supervisor_reclamo_vencido: fullRes.data.notificar_supervisor_reclamo_vencido ?? true,
          });
        } catch {
          // Si falla obtener la completa, usamos la pública
          setFormData(prev => ({
            ...prev,
            habilitado: publicConfig.habilitado,
            provider: publicConfig.provider,
            notificar_reclamo_recibido: publicConfig.notificar_reclamo_recibido,
            notificar_reclamo_asignado: publicConfig.notificar_reclamo_asignado,
            notificar_cambio_estado: publicConfig.notificar_cambio_estado,
            notificar_reclamo_resuelto: publicConfig.notificar_reclamo_resuelto,
            notificar_comentarios: publicConfig.notificar_comentarios,
            notificar_empleado_asignacion: publicConfig.notificar_empleado_asignacion ?? true,
            notificar_empleado_nuevo_comentario: publicConfig.notificar_empleado_nuevo_comentario ?? true,
            notificar_empleado_cambio_prioridad: publicConfig.notificar_empleado_cambio_prioridad ?? true,
            notificar_supervisor_reclamo_nuevo: publicConfig.notificar_supervisor_reclamo_nuevo ?? true,
            notificar_supervisor_reclamo_resuelto: publicConfig.notificar_supervisor_reclamo_resuelto ?? true,
            notificar_supervisor_reclamo_vencido: publicConfig.notificar_supervisor_reclamo_vencido ?? true,
          }));
        }
      }
    } catch (error) {
      console.error('Error cargando config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await whatsappApi.getLogs({ limit: 50 });
      setLogs(res.data);
    } catch (error) {
      console.error('Error cargando logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await whatsappApi.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('Error cargando stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchReclamos = async () => {
    setLoadingReclamos(true);
    try {
      const res = await reclamosApi.getAll();
      setReclamos(res.data);
    } catch (error) {
      console.error('Error cargando reclamos:', error);
    } finally {
      setLoadingReclamos(false);
    }
  };

  const handleNotificarReclamo = async (reclamoId: number, tipo: 'recibido' | 'estado' | 'resuelto') => {
    setSendingAction(reclamoId);
    try {
      let res;
      switch (tipo) {
        case 'recibido':
          res = await whatsappApi.notificarReclamoRecibido(reclamoId);
          break;
        case 'estado':
          res = await whatsappApi.notificarCambioEstado(reclamoId);
          break;
        case 'resuelto':
          res = await whatsappApi.notificarReclamoResuelto(reclamoId);
          break;
      }
      if (res?.data?.success) {
        toast.success('Notificación enviada correctamente');
      } else {
        toast.error(res?.data?.error || 'Error al enviar notificación');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al enviar notificación');
    } finally {
      setSendingAction(null);
    }
  };

  const filteredReclamos = reclamos.filter(r =>
    searchReclamo === '' ||
    r.titulo.toLowerCase().includes(searchReclamo.toLowerCase()) ||
    r.id.toString().includes(searchReclamo) ||
    r.creador?.telefono?.includes(searchReclamo)
  ).slice(0, 20);

  const handleSave = async () => {
    setSaving(true);
    try {
      await whatsappApi.updateConfig(formData);
      toast.success('Configuracion guardada correctamente');
      await fetchConfig();
    } catch (error) {
      toast.error('Error al guardar la configuracion');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPhone) {
      toast.error('Ingresa un numero de telefono');
      return;
    }

    setTesting(true);
    try {
      const res = await whatsappApi.testMessage({
        telefono: testPhone,
        mensaje: testMessage || undefined,
      });

      if (res.data.success) {
        toast.success('Mensaje de prueba enviado');
      } else {
        toast.error(res.data.error || 'Error al enviar mensaje');
      }
    } catch (error) {
      toast.error('Error al enviar mensaje de prueba');
      console.error('Error:', error);
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = (field: keyof typeof formData) => {
    setFormData(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  // Renderizar badge de estado
  const renderStatusBadge = () => {
    if (config?.id && config.id > 0) {
      if (formData.habilitado) {
        return (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-green-500/10 text-green-500">
            <CheckCircle className="h-4 w-4" />
            Activo
          </span>
        );
      } else {
        return (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-yellow-500/10 text-yellow-500">
            <AlertTriangle className="h-4 w-4" />
            Deshabilitado
          </span>
        );
      }
    }
    return (
      <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-500/10 text-gray-500">
        <XCircle className="h-4 w-4" />
        Sin configurar
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <SettingsHeader
        title="Configuración de WhatsApp"
        subtitle="Integra WhatsApp Business para notificaciones"
        icon={MessageCircle}
        iconColor="#25D366"
        showSave={activeTab === 'config'}
        onSave={handleSave}
        saving={saving}
        saveLabel="Guardar configuración"
        statusBadge={renderStatusBadge()}
      />

      {/* Tabs */}
      <div
        className="flex gap-2 p-1 rounded-lg"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {[
          { id: 'config', label: 'Configuración', icon: MessageCircle },
          { id: 'actions', label: 'Acciones', icon: Zap },
          { id: 'logs', label: 'Historial', icon: History },
          { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all"
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
      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* Datos de la Cuenta - Resumen */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5" style={{ color: '#25D366' }} />
              <h3 className="font-medium" style={{ color: theme.text }}>
                Datos de la Cuenta WhatsApp Business
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-4 w-4" style={{ color: theme.textSecondary }} />
                  <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                    Phone Number ID
                  </span>
                </div>
                <p className="font-mono text-sm truncate" style={{ color: theme.text }}>
                  {formData.meta_phone_number_id || '—'}
                </p>
              </div>
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4" style={{ color: theme.textSecondary }} />
                  <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                    Business Account ID
                  </span>
                </div>
                <p className="font-mono text-sm truncate" style={{ color: theme.text }}>
                  {formData.meta_business_account_id || '—'}
                </p>
              </div>
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4" style={{ color: theme.textSecondary }} />
                  <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                    Access Token
                  </span>
                </div>
                <p className="font-mono text-sm truncate" style={{ color: theme.text }}>
                  {formData.meta_access_token ? `${formData.meta_access_token.slice(0, 20)}...` : '—'}
                </p>
              </div>
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4" style={{ color: theme.textSecondary }} />
                  <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                    Webhook Token
                  </span>
                </div>
                <p className="font-mono text-sm truncate" style={{ color: theme.text }}>
                  {formData.meta_webhook_verify_token || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Toggle Habilitado */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium" style={{ color: theme.text }}>
                  Habilitar WhatsApp
                </h3>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Activa las notificaciones por WhatsApp
                </p>
              </div>
              <button
                onClick={() => handleToggle('habilitado')}
                className="transition-colors"
              >
                {formData.habilitado ? (
                  <ToggleRight className="h-8 w-8" style={{ color: '#25D366' }} />
                ) : (
                  <ToggleLeft className="h-8 w-8" style={{ color: theme.textSecondary }} />
                )}
              </button>
            </div>
          </div>

          {/* Proveedor */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-medium mb-4" style={{ color: theme.text }}>
              Proveedor
            </h3>
            <div className="flex gap-4">
              <button
                onClick={() => setFormData(prev => ({ ...prev, provider: 'meta' }))}
                className="flex-1 p-4 rounded-lg border-2 transition-all"
                style={{
                  backgroundColor: formData.provider === 'meta' ? `${theme.primary}10` : theme.backgroundSecondary,
                  borderColor: formData.provider === 'meta' ? theme.primary : theme.border,
                }}
              >
                <div className="text-left">
                  <p className="font-medium" style={{ color: theme.text }}>Meta Cloud API</p>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    API oficial de WhatsApp Business
                  </p>
                </div>
              </button>
              <button
                onClick={() => setFormData(prev => ({ ...prev, provider: 'twilio' }))}
                className="flex-1 p-4 rounded-lg border-2 transition-all"
                style={{
                  backgroundColor: formData.provider === 'twilio' ? `${theme.primary}10` : theme.backgroundSecondary,
                  borderColor: formData.provider === 'twilio' ? theme.primary : theme.border,
                }}
              >
                <div className="text-left">
                  <p className="font-medium" style={{ color: theme.text }}>Twilio</p>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    WhatsApp via Twilio
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Credenciales Meta */}
          {formData.provider === 'meta' && (
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <h3 className="font-medium mb-4" style={{ color: theme.text }}>
                Credenciales Meta Cloud API
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={formData.meta_phone_number_id}
                    onChange={e => setFormData(prev => ({ ...prev, meta_phone_number_id: e.target.value }))}
                    placeholder="Ej: 123456789012345"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Access Token
                  </label>
                  <input
                    type="password"
                    value={formData.meta_access_token}
                    onChange={e => setFormData(prev => ({ ...prev, meta_access_token: e.target.value }))}
                    placeholder="Token de acceso permanente"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Business Account ID (opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.meta_business_account_id}
                    onChange={e => setFormData(prev => ({ ...prev, meta_business_account_id: e.target.value }))}
                    placeholder="ID de cuenta de negocios"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Webhook Verify Token
                  </label>
                  <input
                    type="text"
                    value={formData.meta_webhook_verify_token}
                    onChange={e => setFormData(prev => ({ ...prev, meta_webhook_verify_token: e.target.value }))}
                    placeholder="Token para verificar webhook"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Credenciales Twilio */}
          {formData.provider === 'twilio' && (
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <h3 className="font-medium mb-4" style={{ color: theme.text }}>
                Credenciales Twilio
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Account SID
                  </label>
                  <input
                    type="text"
                    value={formData.twilio_account_sid}
                    onChange={e => setFormData(prev => ({ ...prev, twilio_account_sid: e.target.value }))}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Auth Token
                  </label>
                  <input
                    type="password"
                    value={formData.twilio_auth_token}
                    onChange={e => setFormData(prev => ({ ...prev, twilio_auth_token: e.target.value }))}
                    placeholder="Token de autenticacion"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: theme.textSecondary }}>
                    Numero de WhatsApp
                  </label>
                  <input
                    type="text"
                    value={formData.twilio_phone_number}
                    onChange={e => setFormData(prev => ({ ...prev, twilio_phone_number: e.target.value }))}
                    placeholder="whatsapp:+14155238886"
                    className="w-full rounded-lg px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notificaciones al Usuario (Vecino) */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5" style={{ color: '#3b82f6' }} />
              <h3 className="font-medium" style={{ color: theme.text }}>
                Notificaciones al Vecino
              </h3>
            </div>
            <div className="space-y-3">
              {[
                { key: 'notificar_reclamo_recibido', label: 'Reclamo recibido', desc: 'Al crear un nuevo reclamo' },
                { key: 'notificar_reclamo_asignado', label: 'Reclamo asignado', desc: 'Al asignar a un empleado' },
                { key: 'notificar_cambio_estado', label: 'Cambio de estado', desc: 'Al cambiar estado del reclamo' },
                { key: 'notificar_reclamo_resuelto', label: 'Reclamo resuelto', desc: 'Al marcar como resuelto' },
                { key: 'notificar_comentarios', label: 'Nuevos comentarios', desc: 'Al agregar comentarios' },
              ].map(item => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.text }}>{item.label}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>{item.desc}</p>
                  </div>
                  <button onClick={() => handleToggle(item.key as keyof typeof formData)}>
                    {formData[item.key as keyof typeof formData] ? (
                      <ToggleRight className="h-6 w-6" style={{ color: '#25D366' }} />
                    ) : (
                      <ToggleLeft className="h-6 w-6" style={{ color: theme.textSecondary }} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notificaciones al Empleado */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5" style={{ color: '#f59e0b' }} />
              <h3 className="font-medium" style={{ color: theme.text }}>
                Notificaciones al Empleado
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
                Requiere teléfono en ficha de empleado
              </span>
            </div>
            <div className="space-y-3">
              {[
                { key: 'notificar_empleado_asignacion', label: 'Nueva asignación', desc: 'Cuando le asignan un reclamo' },
                { key: 'notificar_empleado_nuevo_comentario', label: 'Nuevo comentario', desc: 'Cuando el vecino comenta en el reclamo' },
                { key: 'notificar_empleado_cambio_prioridad', label: 'Cambio de prioridad', desc: 'Cuando cambia la prioridad del reclamo' },
              ].map(item => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.text }}>{item.label}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>{item.desc}</p>
                  </div>
                  <button onClick={() => handleToggle(item.key as keyof typeof formData)}>
                    {formData[item.key as keyof typeof formData] ? (
                      <ToggleRight className="h-6 w-6" style={{ color: '#25D366' }} />
                    ) : (
                      <ToggleLeft className="h-6 w-6" style={{ color: theme.textSecondary }} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notificaciones al Supervisor */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5" style={{ color: '#8b5cf6' }} />
              <h3 className="font-medium" style={{ color: theme.text }}>
                Notificaciones al Supervisor
              </h3>
            </div>
            <div className="space-y-3">
              {[
                { key: 'notificar_supervisor_reclamo_nuevo', label: 'Nuevos reclamos', desc: 'Cuando se crea un reclamo en su zona' },
                { key: 'notificar_supervisor_reclamo_resuelto', label: 'Reclamos resueltos', desc: 'Cuando un empleado resuelve un reclamo' },
                { key: 'notificar_supervisor_reclamo_vencido', label: 'SLA vencido', desc: 'Cuando un reclamo excede su tiempo de respuesta' },
              ].map(item => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.text }}>{item.label}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>{item.desc}</p>
                  </div>
                  <button onClick={() => handleToggle(item.key as keyof typeof formData)}>
                    {formData[item.key as keyof typeof formData] ? (
                      <ToggleRight className="h-6 w-6" style={{ color: '#25D366' }} />
                    ) : (
                      <ToggleLeft className="h-6 w-6" style={{ color: theme.textSecondary }} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Test */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-medium mb-4" style={{ color: theme.text }}>
              Enviar mensaje de prueba
            </h3>
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="Numero con codigo de pais (ej: +5491155551234)"
                  className="w-full rounded-lg px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                />
              </div>
              <button
                onClick={handleTest}
                disabled={testing || !testPhone}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50"
                style={{
                  backgroundColor: '#25D366',
                  color: '#ffffff',
                }}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar
              </button>
            </div>
            <input
              type="text"
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              placeholder="Mensaje personalizado (opcional)"
              className="w-full mt-3 rounded-lg px-4 py-2.5 text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === 'actions' && (
        <div className="space-y-6">
          {/* Acciones Rápidas */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5" style={{ color: '#f59e0b' }} />
              <h3 className="font-medium" style={{ color: theme.text }}>
                Acciones Rápidas
              </h3>
            </div>
            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              Selecciona un reclamo para enviar notificaciones manuales por WhatsApp al vecino que lo creó.
            </p>

            {/* Buscador */}
            <div className="relative mb-4">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: theme.textSecondary }}
              />
              <input
                type="text"
                value={searchReclamo}
                onChange={e => setSearchReclamo(e.target.value)}
                placeholder="Buscar por título, ID o teléfono..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>

            {/* Lista de Reclamos */}
            {loadingReclamos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
              </div>
            ) : filteredReclamos.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardList className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
                <p style={{ color: theme.textSecondary }}>No se encontraron reclamos</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReclamos.map(reclamo => (
                  <div
                    key={reclamo.id}
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                          >
                            #{reclamo.id}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium capitalize"
                            style={{
                              backgroundColor: reclamo.estado === 'resuelto' ? '#22c55e20' :
                                reclamo.estado === 'en_proceso' ? '#f59e0b20' :
                                reclamo.estado === 'rechazado' ? '#ef444420' : '#3b82f620',
                              color: reclamo.estado === 'resuelto' ? '#22c55e' :
                                reclamo.estado === 'en_proceso' ? '#f59e0b' :
                                reclamo.estado === 'rechazado' ? '#ef4444' : '#3b82f6',
                            }}
                          >
                            {reclamo.estado.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="font-medium truncate" style={{ color: theme.text }}>
                          {reclamo.titulo}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: theme.textSecondary }}>
                          <span>{reclamo.creador?.nombre || 'Anónimo'}</span>
                          {reclamo.creador?.telefono && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {reclamo.creador.telefono}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleNotificarReclamo(reclamo.id, 'recibido')}
                          disabled={sendingAction === reclamo.id || !reclamo.creador?.telefono}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                          style={{ backgroundColor: '#3b82f620', color: '#3b82f6' }}
                          title="Notificar que el reclamo fue recibido"
                        >
                          {sendingAction === reclamo.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          Recibido
                        </button>
                        <button
                          onClick={() => handleNotificarReclamo(reclamo.id, 'estado')}
                          disabled={sendingAction === reclamo.id || !reclamo.creador?.telefono}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                          style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}
                          title="Notificar cambio de estado"
                        >
                          {sendingAction === reclamo.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          Estado
                        </button>
                        <button
                          onClick={() => handleNotificarReclamo(reclamo.id, 'resuelto')}
                          disabled={sendingAction === reclamo.id || !reclamo.creador?.telefono}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                          style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}
                          title="Notificar que fue resuelto"
                        >
                          {sendingAction === reclamo.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserCheck className="h-3 w-3" />
                          )}
                          Resuelto
                        </button>
                      </div>
                    </div>
                    {!reclamo.creador?.telefono && (
                      <p className="text-xs mt-2 text-yellow-500 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        El vecino no tiene teléfono registrado
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tipos de Notificaciones */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-medium mb-4" style={{ color: theme.text }}>
              Tipos de Notificaciones Disponibles
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#3b82f610', border: '1px solid #3b82f630' }}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5" style={{ color: '#3b82f6' }} />
                  <span className="font-medium" style={{ color: '#3b82f6' }}>Reclamo Recibido</span>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Notifica al vecino que su reclamo fue registrado en el sistema.
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#f59e0b10', border: '1px solid #f59e0b30' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Play className="h-5 w-5" style={{ color: '#f59e0b' }} />
                  <span className="font-medium" style={{ color: '#f59e0b' }}>Cambio de Estado</span>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Informa el nuevo estado del reclamo (asignado, en proceso, etc).
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#22c55e10', border: '1px solid #22c55e30' }}>
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="h-5 w-5" style={{ color: '#22c55e' }} />
                  <span className="font-medium" style={{ color: '#22c55e' }}>Reclamo Resuelto</span>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Confirma que el reclamo fue solucionado y solicita calificación.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: theme.backgroundSecondary }}>
            <h3 className="font-medium" style={{ color: theme.text }}>
              Historial de mensajes
            </h3>
            <button
              onClick={fetchLogs}
              disabled={loadingLogs}
              className="p-2 rounded-lg hover:opacity-80 transition-opacity"
              style={{ backgroundColor: theme.card }}
            >
              <RefreshCw className={`h-4 w-4 ${loadingLogs ? 'animate-spin' : ''}`} style={{ color: theme.textSecondary }} />
            </button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
              <p style={{ color: theme.textSecondary }}>No hay mensajes en el historial</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: theme.border }}>
              {logs.map(log => (
                <div key={log.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm" style={{ color: theme.text }}>
                          {log.telefono}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: log.enviado ? '#22c55e20' : '#ef444420',
                            color: log.enviado ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {log.enviado ? 'Enviado' : 'Fallido'}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                        >
                          {log.tipo_mensaje}
                        </span>
                      </div>
                      {log.mensaje && (
                        <p className="text-sm mt-1 truncate" style={{ color: theme.textSecondary }}>
                          {log.mensaje}
                        </p>
                      )}
                      {log.error && (
                        <p className="text-sm mt-1 text-red-500">
                          Error: {log.error}
                        </p>
                      )}
                    </div>
                    <span className="text-xs whitespace-nowrap" style={{ color: theme.textSecondary }}>
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {loadingStats ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
            </div>
          ) : stats ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total enviados', value: stats.total_enviados, color: '#22c55e' },
                  { label: 'Total fallidos', value: stats.total_fallidos, color: '#ef4444' },
                  { label: 'Enviados hoy', value: stats.enviados_hoy, color: '#3b82f6' },
                  { label: 'Esta semana', value: stats.enviados_semana, color: '#8b5cf6' },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <p className="text-sm" style={{ color: theme.textSecondary }}>{stat.label}</p>
                    <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Por tipo */}
              {Object.keys(stats.por_tipo).length > 0 && (
                <div
                  className="rounded-xl p-5"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <h3 className="font-medium mb-4" style={{ color: theme.text }}>
                    Mensajes por tipo
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(stats.por_tipo).map(([tipo, count]) => (
                      <div
                        key={tipo}
                        className="flex items-center justify-between py-2 px-3 rounded-lg"
                        style={{ backgroundColor: theme.backgroundSecondary }}
                      >
                        <span className="text-sm" style={{ color: theme.text }}>
                          {tipo.replace(/_/g, ' ')}
                        </span>
                        <span className="font-medium" style={{ color: theme.primary }}>
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
              <p style={{ color: theme.textSecondary }}>No hay estadisticas disponibles</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
