import { useEffect, useState } from 'react';
import { Edit, Trash2, User, Star, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { empleadosApi, zonasApi, categoriasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMSelect, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { Empleado, Zona, Categoria } from '../types';

export default function Empleados() {
  const { theme } = useTheme();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
    dni: '',
    descripcion: '',
    especialidad: '',
    tipo: 'operario' as 'operario' | 'administrativo',
    capacidad_maxima: 10,
    zona_id: '',
    categoria_principal_id: '',
    categoria_ids: [] as number[]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [empleadosRes, zonasRes, categoriasRes] = await Promise.all([
        empleadosApi.getAll(),
        zonasApi.getAll(true),
        categoriasApi.getAll(true)
      ]);
      setEmpleados(empleadosRes.data);
      setZonas(zonasRes.data);
      setCategorias(categoriasRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = (empleado: Empleado | null = null) => {
    if (empleado) {
      setFormData({
        nombre: empleado.nombre,
        apellido: empleado.apellido || '',
        email: '', // No mostramos email en edición
        password: '', // No mostramos password en edición
        telefono: empleado.telefono || '',
        dni: '',
        descripcion: empleado.descripcion || '',
        especialidad: empleado.especialidad || '',
        tipo: (empleado as any).tipo || 'operario',
        capacidad_maxima: empleado.capacidad_maxima,
        zona_id: empleado.zona_id?.toString() || '',
        categoria_principal_id: empleado.categoria_principal_id?.toString() || '',
        categoria_ids: empleado.categorias?.map(c => c.id) || []
      });
      setSelectedEmpleado(empleado);
    } else {
      setFormData({
        nombre: '',
        apellido: '',
        email: '',
        password: '',
        telefono: '',
        dni: '',
        descripcion: '',
        especialidad: '',
        tipo: 'operario',
        capacidad_maxima: 10,
        zona_id: '',
        categoria_principal_id: '',
        categoria_ids: []
      });
      setSelectedEmpleado(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedEmpleado(null);
  };

  const handleSubmit = async () => {
    // Validar email y password solo para nuevo empleado
    if (!selectedEmpleado) {
      if (!formData.email || !formData.password) {
        toast.error('Email y contraseña son requeridos');
        return;
      }
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      nombre: formData.nombre,
      apellido: formData.apellido || null,
      telefono: formData.telefono || null,
      descripcion: formData.descripcion || null,
      especialidad: formData.especialidad || null,
      tipo: formData.tipo,
      capacidad_maxima: formData.capacidad_maxima,
      zona_id: formData.zona_id ? parseInt(formData.zona_id) : null,
      categoria_principal_id: formData.categoria_principal_id ? parseInt(formData.categoria_principal_id) : null,
      categoria_ids: formData.categoria_ids
    };

    // Solo agregar email/password/dni para nuevo empleado
    if (!selectedEmpleado) {
      payload.email = formData.email;
      payload.password = formData.password;
      payload.dni = formData.dni || null;
    }

    try {
      if (selectedEmpleado) {
        await empleadosApi.update(selectedEmpleado.id, payload);
        toast.success('Empleado actualizado correctamente');
      } else {
        await empleadosApi.create(payload);
        toast.success('Empleado creado correctamente');
      }
      fetchData();
      closeSheet();
    } catch (error) {
      toast.error('Error al guardar el empleado');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await empleadosApi.delete(id);
      toast.success('Empleado desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error al desactivar el empleado');
      console.error('Error:', error);
    }
  };

  const toggleCategoria = (categoriaId: number) => {
    setFormData(prev => {
      const ids = prev.categoria_ids.includes(categoriaId)
        ? prev.categoria_ids.filter(id => id !== categoriaId)
        : [...prev.categoria_ids, categoriaId];

      // Si quitamos la categoria principal, limpiarla
      if (!ids.includes(parseInt(prev.categoria_principal_id))) {
        return { ...prev, categoria_ids: ids, categoria_principal_id: '' };
      }
      return { ...prev, categoria_ids: ids };
    });
  };

  const setPrincipal = (categoriaId: number) => {
    // Si no esta seleccionada, agregarla primero
    if (!formData.categoria_ids.includes(categoriaId)) {
      setFormData(prev => ({
        ...prev,
        categoria_ids: [...prev.categoria_ids, categoriaId],
        categoria_principal_id: categoriaId.toString()
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        categoria_principal_id: categoriaId.toString()
      }));
    }
  };

  const filteredEmpleados = empleados.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.apellido?.toLowerCase().includes(search.toLowerCase()) ||
    c.especialidad?.toLowerCase().includes(search.toLowerCase()) ||
    c.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  const getNombreCompleto = (e: Empleado) => {
    if (e.apellido) {
      return `${e.nombre} ${e.apellido}`;
    }
    return e.nombre;
  };

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Empleado',
      sortValue: (c: Empleado) => getNombreCompleto(c),
      render: (c: Empleado) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <User className="h-4 w-4 text-purple-600" />
          </div>
          <span className="font-medium">{getNombreCompleto(c)}</span>
        </div>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      sortValue: (c: Empleado) => (c as any).tipo || 'operario',
      render: (c: Empleado) => {
        const tipo = (c as any).tipo || 'operario';
        const isOperario = tipo === 'operario';
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium"
            style={{
              backgroundColor: isOperario ? '#f59e0b20' : '#3b82f620',
              color: isOperario ? '#f59e0b' : '#3b82f6',
            }}
          >
            {isOperario ? 'Operario' : 'Administrativo'}
          </span>
        );
      },
    },
    {
      key: 'funcion',
      header: 'Función',
      sortValue: (c: Empleado) => c.categoria_principal?.nombre || '',
      render: (c: Empleado) => {
        if (!c.categoria_principal) {
          return <span className="text-xs" style={{ color: theme.textSecondary }}>—</span>;
        }
        const color = c.categoria_principal.color || '#6b7280';
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
            style={{
              backgroundColor: `${color}20`,
              color: color,
            }}
          >
            <Star className="h-3 w-3 fill-current" />
            {c.categoria_principal.nombre}
          </span>
        );
      },
    },
    {
      key: 'especialidades',
      header: 'Especialidades',
      sortValue: (c: Empleado) => c.categorias?.length || 0,
      render: (c: Empleado) => (
        <div className="flex flex-wrap gap-1">
          {c.categorias && c.categorias.length > 0 ? (
            c.categorias.slice(0, 3).map(cat => (
              <span
                key={cat.id}
                className="px-2 py-0.5 text-xs rounded-full text-white"
                style={{ backgroundColor: cat.color || '#6b7280' }}
              >
                {cat.nombre}
              </span>
            ))
          ) : (
            <span style={{ color: theme.textSecondary }}>-</span>
          )}
          {c.categorias && c.categorias.length > 3 && (
            <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: theme.border }}>
              +{c.categorias.length - 3}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'zona',
      header: 'Zona',
      sortValue: (c: Empleado) => {
        const zona = zonas.find(z => z.id === c.zona_id);
        return zona?.nombre || '';
      },
      render: (c: Empleado) => {
        const zona = zonas.find(z => z.id === c.zona_id);
        return zona ? (
          <span className="text-xs" style={{ color: theme.text }}>{zona.nombre}</span>
        ) : (
          <span className="text-xs" style={{ color: theme.textSecondary }}>—</span>
        );
      },
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (c: Empleado) => c.activo,
      render: (c: Empleado) => <ABMBadge active={c.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Empleados"
      backLink="/gestion/ajustes"
      buttonLabel="Nuevo Empleado"
      onAdd={() => openSheet()}
      searchPlaceholder="Buscar empleados..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredEmpleados.length === 0}
      emptyMessage="No se encontraron empleados"
      sheetOpen={sheetOpen}
      sheetTitle={selectedEmpleado ? 'Editar Empleado' : 'Nuevo Empleado'}
      sheetDescription={selectedEmpleado ? 'Modifica los datos del empleado' : 'Completa los datos para crear un nuevo empleado'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={filteredEmpleados}
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
          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Nombre"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre"
            />
            <ABMInput
              label="Apellido"
              value={formData.apellido}
              onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
              placeholder="Apellido"
            />
          </div>

          {/* Campos de acceso - solo para nuevo empleado */}
          {!selectedEmpleado && (
            <>
              <ABMInput
                label="Email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@ejemplo.com"
              />
              <div className="grid grid-cols-2 gap-4">
                <ABMInput
                  label="Contraseña"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Contraseña"
                />
                <ABMInput
                  label="DNI"
                  value={formData.dni}
                  onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                  placeholder="DNI"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Teléfono"
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="Teléfono"
            />
            <ABMSelect
              label="Tipo de Empleado"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'operario' | 'administrativo' })}
              options={[
                { value: 'operario', label: 'Operario (Reclamos)' },
                { value: 'administrativo', label: 'Administrativo (Trámites)' }
              ]}
            />
          </div>

          <ABMTextarea
            label="Descripcion"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Descripcion del empleado"
            rows={2}
          />

          <div className="grid grid-cols-2 gap-4">
            <ABMInput
              label="Capacidad Maxima"
              type="number"
              value={formData.capacidad_maxima}
              onChange={(e) => setFormData({ ...formData, capacidad_maxima: Number(e.target.value) })}
              min={1}
              max={50}
            />
            <ABMSelect
              label="Zona Asignada"
              value={formData.zona_id}
              onChange={(e) => setFormData({ ...formData, zona_id: e.target.value })}
              placeholder="Sin zona asignada"
              options={zonas.map(z => ({ value: z.id, label: z.nombre }))}
            />
          </div>

          {/* Selector de Especialidades (Categorias) */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Especialidades
            </label>
            <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
              Selecciona las categorias que puede atender. Haz clic en la estrella para marcar la principal.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
              {categorias.map(cat => {
                const isSelected = formData.categoria_ids.includes(cat.id);
                const isPrincipal = formData.categoria_principal_id === cat.id.toString();
                return (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                      isSelected ? 'ring-2' : ''
                    }`}
                    style={{
                      backgroundColor: isSelected ? (cat.color ? `${cat.color}20` : theme.border) : theme.card,
                      borderColor: cat.color || theme.border,
                      ['--tw-ring-color' as string]: cat.color || theme.primary
                    }}
                    onClick={() => toggleCategoria(cat.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color || '#6b7280' }}
                      />
                      <span className="text-sm truncate">{cat.nombre}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isSelected && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrincipal(cat.id);
                            }}
                            className={`p-1 rounded transition-colors ${isPrincipal ? 'text-yellow-500' : ''}`}
                            style={{ color: isPrincipal ? '#eab308' : theme.textSecondary }}
                            title={isPrincipal ? 'Categoria principal' : 'Marcar como principal'}
                          >
                            <Star className={`h-4 w-4 ${isPrincipal ? 'fill-current' : ''}`} />
                          </button>
                          <Check className="h-4 w-4 text-green-500" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {formData.categoria_ids.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {formData.categoria_ids.map(id => {
                  const cat = categorias.find(c => c.id === id);
                  if (!cat) return null;
                  const isPrincipal = formData.categoria_principal_id === id.toString();
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full text-white"
                      style={{ backgroundColor: cat.color || '#6b7280' }}
                    >
                      {isPrincipal && <Star className="h-3 w-3 fill-current" />}
                      {cat.nombre}
                      <button
                        type="button"
                        onClick={() => toggleCategoria(id)}
                        className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {selectedEmpleado && selectedEmpleado.miembros && selectedEmpleado.miembros.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Miembros Actuales
              </label>
              <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: theme.backgroundSecondary }}>
                {selectedEmpleado.miembros.map((m) => (
                  <div key={m.id} className="flex items-center text-sm">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mr-2"
                      style={{ backgroundColor: theme.border, color: theme.text }}
                    >
                      {m.nombre[0]}{m.apellido[0]}
                    </div>
                    <span>{m.nombre} {m.apellido}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      }
    >
      {filteredEmpleados.map((c) => {
        // Usar el color de la categoría principal, o un gradiente morado por defecto
        const mainColor = c.categoria_principal?.color || '#8B5CF6';
        const zona = zonas.find(z => z.id === c.zona_id);

        return (
          <div
            key={c.id}
            onClick={() => openSheet(c)}
            className="group relative rounded-2xl p-5 cursor-pointer overflow-hidden abm-card-hover animate-fade-in-up"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              ['--card-primary' as string]: mainColor,
            }}
          >
            {/* Fondo con gradiente sutil del color principal */}
            <div
              className="absolute inset-0 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500"
              style={{
                background: `
                  radial-gradient(ellipse at top left, ${mainColor}50 0%, transparent 50%),
                  radial-gradient(ellipse at bottom right, ${mainColor}30 0%, transparent 50%)
                `,
              }}
            />

            {/* Línea decorativa superior con el color */}
            <div
              className="absolute top-0 left-0 right-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: `linear-gradient(90deg, ${mainColor}, ${mainColor}50, transparent)`,
              }}
            />

            {/* Contenido */}
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {/* Avatar con gradiente */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: `linear-gradient(135deg, ${mainColor}, ${mainColor}CC)`,
                      boxShadow: `0 4px 14px ${mainColor}40`,
                    }}
                  >
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-4">
                    <p className="font-semibold text-lg" style={{ color: theme.text }}>
                      {getNombreCompleto(c)}
                    </p>
                    {c.categoria_principal && (
                      <p className="text-sm flex items-center gap-1.5" style={{ color: mainColor }}>
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {c.categoria_principal.nombre}
                      </p>
                    )}
                  </div>
                </div>
                <ABMBadge active={c.activo} />
              </div>

              {/* Especialidades con chips */}
              {c.categorias && c.categorias.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {c.categorias.map(cat => (
                    <span
                      key={cat.id}
                      className="px-2.5 py-1 text-xs rounded-full font-medium transition-transform duration-200 hover:scale-105"
                      style={{
                        backgroundColor: `${cat.color || '#6b7280'}20`,
                        color: cat.color || '#6b7280',
                        border: `1px solid ${cat.color || '#6b7280'}30`,
                      }}
                    >
                      {cat.nombre}
                    </span>
                  ))}
                </div>
              )}

              {c.descripcion && (
                <p className="text-sm mt-4 line-clamp-2" style={{ color: theme.textSecondary }}>
                  {c.descripcion}
                </p>
              )}

              <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                <div className="flex items-center gap-2">
                  {zona ? (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: `${mainColor}10`,
                        color: theme.textSecondary,
                      }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {zona.nombre}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: theme.textSecondary }}>Sin zona</span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.textSecondary,
                    }}
                  >
                    Cap. {c.capacidad_maxima}
                  </span>
                </div>
                <ABMCardActions
                  onEdit={() => openSheet(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
