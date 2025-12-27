import { useEffect, useState, useMemo } from 'react';
import { Edit, Trash2, Clock, DollarSign, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction } from '../components/ui/ABMPage';
import type { TipoTramite, TramiteCatalogo } from '../types';

// Iconos disponibles para tipos de trámite
const ICONOS_DISPONIBLES = [
  'HardHat', 'Store', 'Car', 'Landmark', 'Map', 'TreeDeciduous', 'Heart',
  'Wrench', 'CalendarDays', 'FileText', 'Users', 'AlertTriangle', 'Building2',
  'Home', 'Briefcase', 'GraduationCap', 'Stethoscope', 'ShoppingCart'
];

function getIcon(iconName?: string) {
  if (!iconName) return <LucideIcons.FileText className="h-5 w-5" />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as any)[iconName];
  return Icon ? <Icon className="h-5 w-5" /> : <LucideIcons.FileText className="h-5 w-5" />;
}

interface TipoConTramites extends TipoTramite {
  tramites: TramiteCatalogo[];
}

export default function TiposTramite() {
  const { theme } = useTheme();

  const [tipos, setTipos] = useState<TipoTramite[]>([]);
  const [tramites, setTramites] = useState<TramiteCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<TipoTramite | null>(null);
  const [expandedTipos, setExpandedTipos] = useState<Set<number>>(new Set());

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    codigo: '',
    icono: 'FileText',
    color: '#6366f1',
    orden: 0,
    activo: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tiposRes, tramitesRes] = await Promise.all([
        tramitesApi.getTipos({ solo_activos: false }),
        tramitesApi.getCatalogo({ solo_activos: false })
      ]);
      setTipos(tiposRes.data);
      setTramites(tramitesRes.data);

      // Expandir tipos que tienen trámites
      const tiposConTramites = new Set<number>();
      tramitesRes.data.forEach((t: TramiteCatalogo) => tiposConTramites.add(t.tipo_tramite_id));
      setExpandedTipos(tiposConTramites);
    } catch (error) {
      toast.error('Error al cargar los datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Agrupar trámites por tipo
  const tiposConTramites = useMemo(() => {
    const tramitesPorTipo = new Map<number, TramiteCatalogo[]>();

    // Filtrar trámites por búsqueda
    const tramitesFiltrados = tramites.filter(t => {
      if (!search) return true;
      return t.nombre.toLowerCase().includes(search.toLowerCase()) ||
        t.descripcion?.toLowerCase().includes(search.toLowerCase());
    });

    // Agrupar por tipo_tramite_id
    tramitesFiltrados.forEach(tramite => {
      const existing = tramitesPorTipo.get(tramite.tipo_tramite_id) || [];
      tramitesPorTipo.set(tramite.tipo_tramite_id, [...existing, tramite]);
    });

    // Filtrar tipos
    const tiposFiltrados = tipos.filter(tipo => {
      if (!search) return true;
      const hasTramitesMatch = tramitesPorTipo.has(tipo.id);
      const matchesSearch = tipo.nombre.toLowerCase().includes(search.toLowerCase()) ||
        tipo.descripcion?.toLowerCase().includes(search.toLowerCase());
      return hasTramitesMatch || matchesSearch;
    });

    // Crear lista de tipos con sus trámites
    const result: TipoConTramites[] = tiposFiltrados.map(tipo => ({
      ...tipo,
      tramites: (tramitesPorTipo.get(tipo.id) || []).sort((a, b) => a.orden - b.orden)
    }));

    return result.sort((a, b) => a.orden - b.orden);
  }, [tipos, tramites, search]);

  const totalTipos = tipos.length;
  const totalTramites = tramites.length;

  const toggleTipo = (tipoId: number) => {
    setExpandedTipos(prev => {
      const next = new Set(prev);
      if (next.has(tipoId)) {
        next.delete(tipoId);
      } else {
        next.add(tipoId);
      }
      return next;
    });
  };

  const openSheet = (tipo: TipoTramite | null = null) => {
    if (tipo) {
      setFormData({
        nombre: tipo.nombre,
        descripcion: tipo.descripcion || '',
        codigo: tipo.codigo || '',
        icono: tipo.icono || 'FileText',
        color: tipo.color || '#6366f1',
        orden: tipo.orden,
        activo: tipo.activo
      });
      setSelectedTipo(tipo);
    } else {
      setFormData({
        nombre: '',
        descripcion: '',
        codigo: '',
        icono: 'FileText',
        color: '#6366f1',
        orden: tipos.length,
        activo: true
      });
      setSelectedTipo(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedTipo(null);
  };

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      if (selectedTipo) {
        await tramitesApi.updateTipo(selectedTipo.id, formData);
        toast.success('Tipo de trámite actualizado');
      } else {
        await tramitesApi.createTipo(formData);
        toast.success('Tipo de trámite creado');
      }
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await tramitesApi.deleteTipo(id);
      toast.success('Tipo de trámite desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error al desactivar');
      console.error('Error:', error);
    }
  };

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortValue: (t: TipoTramite) => t.nombre,
      render: (t: TipoTramite) => (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: t.color || '#6366f1' }}
          >
            <span className="text-white">{getIcon(t.icono)}</span>
          </div>
          <div>
            <span className="font-medium">{t.nombre}</span>
            {t.codigo && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
                {t.codigo}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'tramites',
      header: 'Trámites',
      sortValue: (t: TipoTramite) => tramites.filter(tr => tr.tipo_tramite_id === t.id).length,
      render: (t: TipoTramite) => {
        const count = tramites.filter(tr => tr.tipo_tramite_id === t.id).length;
        return <span>{count} trámites</span>;
      },
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (t: TipoTramite) => t.activo,
      render: (t: TipoTramite) => <ABMBadge active={t.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Tipos de Trámite"
      buttonLabel="Nuevo Tipo"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar tipos o trámites..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={tiposConTramites.length === 0 && tipos.length === 0}
      emptyMessage="No hay tipos de trámite. Creá el primero con el botón + Nuevo Tipo"
      sheetOpen={sheetOpen}
      sheetTitle={selectedTipo ? 'Editar Tipo' : 'Nuevo Tipo de Trámite'}
      sheetDescription={selectedTipo ? 'Modifica los datos del tipo de trámite' : 'Completa los datos para crear una nueva categoría'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={tipos}
          columns={tableColumns}
          keyExtractor={(t) => t.id}
          onRowClick={(t) => openSheet(t)}
          actions={(t) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(t)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(t.id)}
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
            placeholder="Ej: Obras Privadas"
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Código (opcional)"
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              placeholder="Ej: OBRAS"
            />
            <ABMInput
              label="Orden"
              type="number"
              value={formData.orden}
              onChange={(e) => setFormData({ ...formData, orden: Number(e.target.value) })}
              min={0}
            />
          </div>

          <ABMTextarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripción del tipo de trámite"
            rows={2}
          />

          {/* Selector de icono */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Icono
            </label>
            <div className="flex flex-wrap gap-2">
              {ICONOS_DISPONIBLES.map(iconName => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setFormData({ ...formData, icono: iconName })}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: formData.icono === iconName ? formData.color : theme.backgroundSecondary,
                    color: formData.icono === iconName ? '#fff' : theme.textSecondary,
                    border: formData.icono === iconName ? 'none' : `1px solid ${theme.border}`,
                  }}
                >
                  {getIcon(iconName)}
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
                <span className="text-white font-medium">Vista previa</span>
              </div>
            </div>
          </div>

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
        </form>
      }
    >
      {/* Vista agrupada por Tipos */}
      <div className="space-y-4">
        {tiposConTramites.map((tipo) => {
          const isExpanded = expandedTipos.has(tipo.id);
          const tramitesCount = tipo.tramites.length;

          return (
            <div
              key={tipo.id}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              {/* Header del Tipo */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer transition-colors hover:opacity-90"
                style={{
                  background: `linear-gradient(135deg, ${tipo.color}15 0%, ${tipo.color}05 100%)`,
                  borderBottom: isExpanded && tramitesCount > 0 ? `1px solid ${theme.border}` : 'none',
                }}
                onClick={() => toggleTipo(tipo.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: tipo.color || '#6366f1',
                      boxShadow: `0 2px 8px ${tipo.color}40`,
                    }}
                  >
                    <span className="text-white">{getIcon(tipo.icono)}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: theme.text }}>
                      {tipo.nombre}
                    </h3>
                    <p className="text-sm" style={{ color: theme.textSecondary }}>
                      {tramitesCount > 0 ? (
                        <>{tramitesCount} trámite{tramitesCount !== 1 ? 's' : ''}</>
                      ) : (
                        <span className="italic">Sin trámites definidos</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Botón editar tipo */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openSheet(tipo);
                    }}
                    className="p-2 rounded-lg transition-colors hover:scale-105"
                    style={{
                      backgroundColor: `${tipo.color}20`,
                      color: tipo.color,
                    }}
                    title="Editar tipo"
                  >
                    <Edit className="h-4 w-4" />
                  </button>

                  {tramitesCount > 0 && (
                    <div
                      className="p-2 rounded-lg transition-transform"
                      style={{
                        backgroundColor: theme.backgroundSecondary,
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      }}
                    >
                      <ChevronDown className="h-4 w-4" style={{ color: theme.textSecondary }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de Trámites */}
              {isExpanded && tramitesCount > 0 && (
                <div className="divide-y" style={{ borderColor: theme.border }}>
                  {tipo.tramites.map((tramite) => (
                    <div
                      key={tramite.id}
                      className="flex items-center justify-between p-4 transition-colors group"
                      style={{ backgroundColor: theme.card }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = theme.backgroundSecondary;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = theme.card;
                      }}
                    >
                      <div className="flex items-center gap-3 pl-6">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tipo.color }}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: theme.text }}>
                              {tramite.nombre}
                            </span>
                            {!tramite.activo && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                Inactivo
                              </span>
                            )}
                          </div>
                          {tramite.descripcion && (
                            <p className="text-sm line-clamp-1" style={{ color: theme.textSecondary }}>
                              {tramite.descripcion}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {tramite.tiempo_estimado_dias && (
                          <span className="text-sm flex items-center gap-1" style={{ color: theme.textSecondary }}>
                            <Clock className="h-3.5 w-3.5" />
                            {tramite.tiempo_estimado_dias}d
                          </span>
                        )}
                        {tramite.costo != null && tramite.costo > 0 && (
                          <span className="text-sm flex items-center gap-1" style={{ color: theme.textSecondary }}>
                            <DollarSign className="h-3.5 w-3.5" />
                            ${tramite.costo.toLocaleString()}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4" style={{ color: theme.textSecondary }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ABMPage>
  );
}
