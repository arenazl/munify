import { useEffect, useState } from 'react';
import { Edit, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { zonasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { Zona } from '../types';

export default function Zonas() {
  const { theme } = useTheme();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedZona, setSelectedZona] = useState<Zona | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    codigo: '',
    descripcion: '',
    latitud_centro: '',
    longitud_centro: ''
  });

  useEffect(() => {
    fetchZonas();
  }, []);

  const fetchZonas = async () => {
    try {
      const response = await zonasApi.getAll();
      setZonas(response.data);
    } catch (error) {
      toast.error('Error al cargar zonas');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (zona: Zona | null = null) => {
    if (zona) {
      setFormData({
        nombre: zona.nombre,
        codigo: zona.codigo || '',
        descripcion: zona.descripcion || '',
        latitud_centro: zona.latitud_centro?.toString() || '',
        longitud_centro: zona.longitud_centro?.toString() || ''
      });
      setSelectedZona(zona);
    } else {
      setFormData({
        nombre: '',
        codigo: '',
        descripcion: '',
        latitud_centro: '',
        longitud_centro: ''
      });
      setSelectedZona(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedZona(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    const payload = {
      nombre: formData.nombre,
      codigo: formData.codigo || null,
      descripcion: formData.descripcion || null,
      latitud_centro: formData.latitud_centro ? parseFloat(formData.latitud_centro) : null,
      longitud_centro: formData.longitud_centro ? parseFloat(formData.longitud_centro) : null
    };

    try {
      if (selectedZona) {
        await zonasApi.update(selectedZona.id, payload);
        toast.success('Zona actualizada correctamente');
      } else {
        await zonasApi.create(payload);
        toast.success('Zona creada correctamente');
      }
      fetchZonas();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar la zona');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await zonasApi.delete(id);
      toast.success('Zona desactivada');
      fetchZonas();
    } catch (error) {
      toast.error('Error al desactivar la zona');
      console.error('Error:', error);
    }
  };

  const filteredZonas = zonas.filter(z =>
    z.nombre.toLowerCase().includes(search.toLowerCase()) ||
    z.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    z.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortValue: (z: Zona) => z.nombre,
      render: (z: Zona) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <MapPin className="h-4 w-4 text-emerald-600" />
          </div>
          <span className="font-medium">{z.nombre}</span>
        </div>
      ),
    },
    {
      key: 'codigo',
      header: 'Código',
      sortValue: (z: Zona) => z.codigo || '',
      render: (z: Zona) => (
        <span className="font-mono" style={{ color: theme.textSecondary }}>{z.codigo || '-'}</span>
      ),
    },
    {
      key: 'descripcion',
      header: 'Descripción',
      sortValue: (z: Zona) => z.descripcion || '',
      render: (z: Zona) => (
        <span style={{ color: theme.textSecondary }}>{z.descripcion || '-'}</span>
      ),
    },
    {
      key: 'coords',
      header: 'Coordenadas',
      sortable: false,
      render: (z: Zona) => (
        <span className="text-xs" style={{ color: theme.textSecondary }}>
          {z.latitud_centro && z.longitud_centro
            ? `${z.latitud_centro.toFixed(4)}, ${z.longitud_centro.toFixed(4)}`
            : '-'}
        </span>
      ),
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (z: Zona) => z.activo,
      render: (z: Zona) => <ABMBadge active={z.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Zonas / Barrios"
      buttonLabel="Nueva Zona"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar zonas..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredZonas.length === 0}
      emptyMessage="No se encontraron zonas"
      sheetOpen={sheetOpen}
      sheetTitle={selectedZona ? 'Editar Zona' : 'Nueva Zona'}
      sheetDescription={selectedZona ? 'Modifica los datos de la zona' : 'Completa los datos para crear una nueva zona'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={filteredZonas}
          columns={tableColumns}
          keyExtractor={(z) => z.id}
          onRowClick={(z) => openSheet(z)}
          actions={(z) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(z)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(z.id)}
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
            placeholder="Nombre de la zona"
          />

          <ABMInput
            label="Código"
            value={formData.codigo}
            onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
            placeholder="Ej: Z-CEN, Z-NOR"
          />

          <ABMTextarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripción de la zona"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Latitud Centro"
              type="number"
              step="any"
              value={formData.latitud_centro}
              onChange={(e) => setFormData({ ...formData, latitud_centro: e.target.value })}
              placeholder="Ej: -34.6037"
            />
            <ABMInput
              label="Longitud Centro"
              type="number"
              step="any"
              value={formData.longitud_centro}
              onChange={(e) => setFormData({ ...formData, longitud_centro: e.target.value })}
              placeholder="Ej: -58.3816"
            />
          </div>
        </form>
      }
    >
      {filteredZonas.map((z) => (
        <ABMCard key={z.id} onClick={() => openSheet(z)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="ml-3">
                <p className="font-medium">{z.nombre}</p>
                {z.codigo && (
                  <p className="text-sm font-mono" style={{ color: theme.textSecondary }}>
                    {z.codigo}
                  </p>
                )}
              </div>
            </div>
            <ABMBadge active={z.activo} />
          </div>

          {z.descripcion && (
            <p className="text-sm mt-3 line-clamp-2" style={{ color: theme.textSecondary }}>
              {z.descripcion}
            </p>
          )}

          {(z.latitud_centro || z.longitud_centro) && (
            <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
              Coords: {z.latitud_centro?.toFixed(4)}, {z.longitud_centro?.toFixed(4)}
            </p>
          )}

          <div className="flex items-center justify-end mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <ABMCardActions
              onEdit={() => openSheet(z)}
              onDelete={() => handleDelete(z.id)}
            />
          </div>
        </ABMCard>
      ))}
    </ABMPage>
  );
}
