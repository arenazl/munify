import { useEffect, useState } from 'react';
import { Edit, Trash2, Clock, DollarSign, Star, Link2, FileText, Blocks } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { ServicioTramite } from '../types';

// Iconos disponibles para servicios (organizados por categoría)
const ICONOS_DISPONIBLES = [
  // Documentos y Trámites
  'FileText', 'FileCheck', 'FilePlus', 'FileSearch', 'Files', 'FolderOpen', 'ClipboardList', 'ClipboardCheck',
  // Construcción y Obras
  'HardHat', 'Building', 'Building2', 'Home', 'Hammer', 'Wrench', 'Construction',
  // Comercio y Negocios
  'Store', 'ShoppingBag', 'ShoppingCart', 'Briefcase', 'CreditCard', 'Receipt', 'BadgePercent',
  // Vehículos y Transporte
  'Car', 'Truck', 'Bus', 'Bike', 'ParkingCircle', 'TrafficCone',
  // Naturaleza y Ambiente
  'TreeDeciduous', 'TreePine', 'Leaf', 'Flower2', 'Sun', 'Droplets',
  // Personas y Social
  'Users', 'UserPlus', 'UserCheck', 'Baby', 'Heart', 'HandHeart', 'Accessibility',
  // Salud
  'Stethoscope', 'Pill', 'Syringe', 'Activity', 'HeartPulse',
  // Educación
  'GraduationCap', 'BookOpen', 'School', 'Library',
  // Comunicación
  'Mail', 'Phone', 'MessageSquare', 'Megaphone', 'Bell',
  // Ubicación
  'MapPin', 'Map', 'Compass', 'Navigation',
  // Alertas y Estado
  'AlertTriangle', 'AlertCircle', 'CheckCircle', 'XCircle', 'Info', 'HelpCircle',
  // Tiempo
  'Clock', 'Calendar', 'CalendarDays', 'Timer', 'History',
  // Otros
  'Key', 'Lock', 'Shield', 'Award', 'Star', 'Flag', 'Zap', 'Lightbulb', 'Settings', 'Tool',
  // Animales
  'Dog', 'Cat', 'Bird', 'Fish', 'Bug',
];

function getIcon(iconName?: string, size: string = "h-5 w-5") {
  if (!iconName) return <FileText className={size} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as any)[iconName];
  return Icon ? <Icon className={size} /> : <FileText className={size} />;
}

export default function Servicios() {
  const { theme } = useTheme();
  const [servicios, setServicios] = useState<ServicioTramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedServicio, setSelectedServicio] = useState<ServicioTramite | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: 'FileText',
    color: '#3B82F6',
    requisitos: '',
    documentos_requeridos: '',
    tiempo_estimado_dias: 15,
    costo: '',
    url_externa: '',
    orden: 0,
    favorito: false,
    activo: true
  });

  useEffect(() => {
    fetchServicios();
  }, []);

  const fetchServicios = async () => {
    try {
      const response = await tramitesApi.getServicios({ solo_activos: false });
      setServicios(response.data);
    } catch (error) {
      toast.error('Error al cargar servicios');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (servicio: ServicioTramite | null = null) => {
    if (servicio) {
      setFormData({
        nombre: servicio.nombre,
        descripcion: servicio.descripcion || '',
        icono: servicio.icono || 'FileText',
        color: servicio.color || '#3B82F6',
        requisitos: servicio.requisitos || '',
        documentos_requeridos: servicio.documentos_requeridos || '',
        tiempo_estimado_dias: servicio.tiempo_estimado_dias,
        costo: servicio.costo?.toString() || '',
        url_externa: servicio.url_externa || '',
        orden: servicio.orden,
        favorito: servicio.favorito,
        activo: servicio.activo
      });
      setSelectedServicio(servicio);
    } else {
      setFormData({
        nombre: '',
        descripcion: '',
        icono: 'FileText',
        color: '#3B82F6',
        requisitos: '',
        documentos_requeridos: '',
        tiempo_estimado_dias: 15,
        costo: '',
        url_externa: '',
        orden: 0,
        favorito: false,
        activo: true
      });
      setSelectedServicio(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedServicio(null);
  };

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      const dataToSend = {
        ...formData,
        costo: formData.costo ? parseFloat(formData.costo) : null,
      };

      if (selectedServicio) {
        await tramitesApi.updateServicio(selectedServicio.id, dataToSend);
        toast.success('Servicio actualizado correctamente');
      } else {
        await tramitesApi.createServicio(dataToSend);
        toast.success('Servicio creado correctamente');
      }
      fetchServicios();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar el servicio');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await tramitesApi.deleteServicio(id);
      toast.success('Servicio desactivado');
      fetchServicios();
    } catch (error) {
      toast.error('Error al desactivar el servicio');
      console.error('Error:', error);
    }
  };

  const filteredServicios = servicios.filter(s =>
    s.nombre.toLowerCase().includes(search.toLowerCase()) ||
    s.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortValue: (s: ServicioTramite) => s.nombre,
      render: (s: ServicioTramite) => (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: s.color || '#3B82F6' }}
          >
            <span className="text-white scale-75">{getIcon(s.icono)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{s.nombre}</span>
            {s.favorito && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
          </div>
        </div>
      ),
    },
    {
      key: 'descripcion',
      header: 'Descripción',
      sortValue: (s: ServicioTramite) => s.descripcion || '',
      render: (s: ServicioTramite) => (
        <span style={{ color: theme.textSecondary }} className="line-clamp-1">
          {s.descripcion || '-'}
        </span>
      ),
    },
    {
      key: 'tiempo_estimado_dias',
      header: 'Tiempo',
      sortValue: (s: ServicioTramite) => s.tiempo_estimado_dias,
      render: (s: ServicioTramite) => `${s.tiempo_estimado_dias} días`,
    },
    {
      key: 'costo',
      header: 'Costo',
      sortValue: (s: ServicioTramite) => s.costo || 0,
      render: (s: ServicioTramite) => s.costo ? `$${s.costo.toLocaleString()}` : 'Gratis',
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (s: ServicioTramite) => s.activo,
      render: (s: ServicioTramite) => <ABMBadge active={s.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Servicios de Trámites"
      icon={<Blocks className="h-5 w-5" />}
      buttonLabel="Nuevo Servicio"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar servicios..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredServicios.length === 0}
      emptyMessage="No se encontraron servicios"
      sheetOpen={sheetOpen}
      sheetTitle={selectedServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
      sheetDescription={selectedServicio ? 'Modifica los datos del servicio de trámite' : 'Completa los datos para crear un nuevo servicio de trámite'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={filteredServicios}
          columns={tableColumns}
          keyExtractor={(s) => s.id}
          onRowClick={(s) => openSheet(s)}
          actions={(s) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(s)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(s.id)}
                title="Desactivar"
                variant="danger"
              />
            </>
          )}
        />
      }
      sheetFooter={
        <ABMSheetFooter
          onCancel={closeSheet}
          onSave={handleSubmit}
          saving={saving}
        />
      }
      sheetContent={
        <form className="space-y-4">
          <ABMInput
            label="Nombre"
            required
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Nombre del servicio"
          />

          <ABMTextarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripción del servicio"
            rows={3}
          />

          {/* Selector de icono */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Icono
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
              {ICONOS_DISPONIBLES.map(iconName => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setFormData({ ...formData, icono: iconName })}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    backgroundColor: formData.icono === iconName ? formData.color : theme.card,
                    color: formData.icono === iconName ? '#fff' : theme.textSecondary,
                    border: formData.icono === iconName ? 'none' : `1px solid ${theme.border}`,
                    boxShadow: formData.icono === iconName ? `0 2px 8px ${formData.color}40` : 'none',
                  }}
                  title={iconName}
                >
                  {getIcon(iconName, "h-4 w-4")}
                </button>
              ))}
            </div>
          </div>

          {/* Selector de color */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-12 h-12 rounded-lg cursor-pointer border-0"
              />
              <div
                className="flex-1 h-12 rounded-lg flex items-center justify-center gap-2"
                style={{ backgroundColor: formData.color }}
              >
                <span className="text-white">{getIcon(formData.icono)}</span>
                <span className="text-white font-medium text-sm">Vista previa</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Tiempo estimado (días)"
              type="number"
              value={formData.tiempo_estimado_dias}
              onChange={(e) => setFormData({ ...formData, tiempo_estimado_dias: Number(e.target.value) })}
              min={1}
            />
            <ABMInput
              label="Costo (opcional)"
              type="number"
              value={formData.costo}
              onChange={(e) => setFormData({ ...formData, costo: e.target.value })}
              placeholder="0 = Gratis"
              min={0}
              step={0.01}
            />
          </div>

          <ABMTextarea
            label="Requisitos"
            value={formData.requisitos}
            onChange={(e) => setFormData({ ...formData, requisitos: e.target.value })}
            placeholder="Lista de requisitos para el trámite..."
            rows={3}
          />

          <ABMTextarea
            label="Documentos requeridos"
            value={formData.documentos_requeridos}
            onChange={(e) => setFormData({ ...formData, documentos_requeridos: e.target.value })}
            placeholder="Lista de documentos necesarios..."
            rows={3}
          />

          <ABMInput
            label="URL externa (opcional)"
            value={formData.url_externa}
            onChange={(e) => setFormData({ ...formData, url_externa: e.target.value })}
            placeholder="https://..."
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Orden de visualización"
              type="number"
              value={formData.orden}
              onChange={(e) => setFormData({ ...formData, orden: Number(e.target.value) })}
              min={0}
            />
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.favorito}
                  onChange={(e) => setFormData({ ...formData, favorito: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: theme.textSecondary }}>
                  Favorito (botón rápido)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: theme.textSecondary }}>
                  Activo
                </span>
              </label>
            </div>
          </div>
        </form>
      }
    >
      {/* Vista de cards */}
      {filteredServicios.map((s) => {
        const servicioColor = s.color || '#3B82F6';

        return (
          <div
            key={s.id}
            onClick={() => openSheet(s)}
            className="group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              ['--card-primary' as string]: servicioColor,
            }}
          >
            {/* Fondo con gradiente sutil del color del servicio */}
            <div
              className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-500"
              style={{
                background: `
                  radial-gradient(ellipse at top right, ${servicioColor}60 0%, transparent 50%),
                  radial-gradient(ellipse at bottom left, ${servicioColor}40 0%, transparent 50%)
                `,
              }}
            />

            {/* Contenido */}
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      backgroundColor: servicioColor,
                      boxShadow: `0 4px 14px ${servicioColor}40`,
                    }}
                  >
                    <span className="text-white">{getIcon(s.icono)}</span>
                  </div>
                  <div className="ml-4">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg" style={{ color: theme.text }}>
                        {s.nombre}
                      </p>
                      {s.favorito && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm" style={{ color: theme.textSecondary }}>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {s.tiempo_estimado_dias} días
                      </span>
                      {s.costo ? (
                        <span className="inline-flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          ${s.costo.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-green-600">Gratis</span>
                      )}
                    </div>
                  </div>
                </div>
                <ABMBadge active={s.activo} />
              </div>

              {s.descripcion && (
                <p className="text-sm mt-3 line-clamp-2" style={{ color: theme.textSecondary }}>
                  {s.descripcion}
                </p>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  {s.url_externa && (
                    <a
                      href={s.url_externa}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: `${servicioColor}20`,
                        color: servicioColor,
                      }}
                    >
                      <Link2 className="h-3 w-3" />
                      Link externo
                    </a>
                  )}
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      backgroundColor: `${servicioColor}20`,
                      color: servicioColor,
                    }}
                  >
                    Orden: {s.orden}
                  </span>
                </div>
                <ABMCardActions
                  onEdit={() => openSheet(s)}
                  onDelete={() => handleDelete(s.id)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
