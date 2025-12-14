import { useEffect, useState } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { categoriasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { Categoria } from '../types';

export default function Categorias() {
  const { theme } = useTheme();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: '',
    color: '#3B82F6',
    tiempo_resolucion_estimado: 48,
    prioridad_default: 3
  });

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      const response = await categoriasApi.getAll();
      setCategorias(response.data);
    } catch (error) {
      toast.error('Error al cargar categorías');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (categoria: Categoria | null = null) => {
    if (categoria) {
      setFormData({
        nombre: categoria.nombre,
        descripcion: categoria.descripcion || '',
        icono: categoria.icono || '',
        color: categoria.color || '#3B82F6',
        tiempo_resolucion_estimado: categoria.tiempo_resolucion_estimado,
        prioridad_default: categoria.prioridad_default,
      });
      setSelectedCategoria(categoria);
    } else {
      setFormData({
        nombre: '',
        descripcion: '',
        icono: '',
        color: '#3B82F6',
        tiempo_resolucion_estimado: 48,
        prioridad_default: 3
      });
      setSelectedCategoria(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedCategoria(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (selectedCategoria) {
        await categoriasApi.update(selectedCategoria.id, formData);
        toast.success('Categoría actualizada correctamente');
      } else {
        await categoriasApi.create(formData);
        toast.success('Categoría creada correctamente');
      }
      fetchCategorias();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar la categoría');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await categoriasApi.delete(id);
      toast.success('Categoria desactivada');
      fetchCategorias();
    } catch (error) {
      toast.error('Error al desactivar la categoria');
      console.error('Error:', error);
    }
  };

  const filteredCategorias = categorias.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortValue: (c: Categoria) => c.nombre,
      render: (c: Categoria) => (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: c.color || '#e5e7eb' }}
          >
            <span className="text-white text-sm font-medium">
              {c.icono ? c.icono[0].toUpperCase() : c.nombre[0].toUpperCase()}
            </span>
          </div>
          <span className="font-medium">{c.nombre}</span>
        </div>
      ),
    },
    {
      key: 'descripcion',
      header: 'Descripción',
      sortValue: (c: Categoria) => c.descripcion || '',
      render: (c: Categoria) => (
        <span style={{ color: theme.textSecondary }}>{c.descripcion || '-'}</span>
      ),
    },
    {
      key: 'tiempo_resolucion_estimado',
      header: 'Tiempo Est.',
      sortValue: (c: Categoria) => c.tiempo_resolucion_estimado,
      render: (c: Categoria) => `${c.tiempo_resolucion_estimado}h`,
    },
    {
      key: 'prioridad_default',
      header: 'Prioridad',
      sortValue: (c: Categoria) => c.prioridad_default,
      render: (c: Categoria) => c.prioridad_default,
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (c: Categoria) => c.activo,
      render: (c: Categoria) => <ABMBadge active={c.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Categorías"
      buttonLabel="Nueva Categoría"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar categorías..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredCategorias.length === 0}
      emptyMessage="No se encontraron categorías"
      sheetOpen={sheetOpen}
      sheetTitle={selectedCategoria ? 'Editar Categoría' : 'Nueva Categoría'}
      sheetDescription={selectedCategoria ? 'Modifica los datos de la categoría' : 'Completa los datos para crear una nueva categoría'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={filteredCategorias}
          columns={tableColumns}
          keyExtractor={(c) => c.id}
          onRowClick={(c) => openSheet(c)}
          actions={(c) => (
            <>
              <ABMTableAction
                icon={<Edit className="h-4 w-4" />}
                onClick={() => openSheet(c)}
                title="Editar"
              />
              <ABMTableAction
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => handleDelete(c.id)}
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
            placeholder="Nombre de la categoría"
          />

          <ABMTextarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripción de la categoría"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Icono (Lucide)"
              value={formData.icono}
              onChange={(e) => setFormData({ ...formData, icono: e.target.value })}
              placeholder="Ej: Lightbulb"
            />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                Color
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-12 h-10 rounded cursor-pointer"
                  style={{ border: `1px solid ${theme.border}` }}
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="flex-1 rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Tiempo estimado (horas)"
              type="number"
              value={formData.tiempo_resolucion_estimado}
              onChange={(e) => setFormData({ ...formData, tiempo_resolucion_estimado: Number(e.target.value) })}
              min={1}
            />
            <ABMInput
              label="Prioridad (1-5)"
              type="number"
              value={formData.prioridad_default}
              onChange={(e) => setFormData({ ...formData, prioridad_default: Number(e.target.value) })}
              min={1}
              max={5}
            />
          </div>
        </form>
      }
    >
      {filteredCategorias.map((c) => (
        <ABMCard key={c.id} onClick={() => openSheet(c)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: c.color || '#e5e7eb' }}
              >
                <span className="text-white text-lg font-medium">
                  {c.icono ? c.icono[0].toUpperCase() : c.nombre[0].toUpperCase()}
                </span>
              </div>
              <div className="ml-3">
                <p className="font-medium">{c.nombre}</p>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  {c.tiempo_resolucion_estimado}h estimadas
                </p>
              </div>
            </div>
            <ABMBadge active={c.activo} />
          </div>

          {c.descripcion && (
            <p className="text-sm mt-3 line-clamp-2" style={{ color: theme.textSecondary }}>
              {c.descripcion}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              Prioridad: {c.prioridad_default}
            </span>
            <ABMCardActions
              onEdit={() => openSheet(c)}
              onDelete={() => handleDelete(c.id)}
            />
          </div>
        </ABMCard>
      ))}
    </ABMPage>
  );
}
