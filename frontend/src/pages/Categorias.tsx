import { useEffect, useState } from 'react';
import { Edit, Trash2, ImageIcon, RefreshCw, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import api, { categoriasApi, imagenesApi, API_BASE_URL } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { Categoria } from '../types';

// Cache de imágenes disponibles
const imageExistsCache: Record<string, string | null> = {};

// Helper para generar URL de imagen local basada en el nombre de la categoría
const getLocalImageUrl = (nombre: string): string | null => {
  // Si ya verificamos esta imagen, retornar del cache
  if (nombre in imageExistsCache) {
    return imageExistsCache[nombre];
  }

  // Convertir nombre a filename seguro (igual que en el backend)
  const safeName = nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '_')
    .trim();

  // El backend guarda como .jpeg
  const url = `${API_BASE_URL}/static/images/categorias/${safeName}.jpeg`;

  // Guardar en cache y retornar
  imageExistsCache[nombre] = url;
  return url;
};

export default function Categorias() {
  const { theme } = useTheme();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null);
  const [formImage, setFormImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: '',
    color: '#3B82F6',
    tiempo_resolucion_estimado: 48,
    prioridad_default: 3
  });
  // Estado para animación staggered (solo la primera vez)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set());
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    fetchCategorias();
  }, []);

  // Verificar si las imágenes existen y descargar si no
  const verificarYDescargarImagenes = async (cats: Categoria[]) => {
    if (cats.length === 0) return;

    // Verificar si ya se descargaron las imágenes para este municipio
    const municipioId = localStorage.getItem('municipio_actual_id');
    const cacheKey = `imagenes_descargadas_${municipioId}`;
    const yaDescargado = localStorage.getItem(cacheKey);

    if (yaDescargado) return; // Ya se intentó descargar

    // Verificar si la primera imagen existe (como muestra)
    const primeraCategoria = cats[0];
    const primeraImagenUrl = getLocalImageUrl(primeraCategoria.nombre);

    if (!primeraImagenUrl) return;

    try {
      const response = await fetch(primeraImagenUrl, { method: 'HEAD' });
      if (response.ok) {
        // La imagen existe, marcar como descargado
        localStorage.setItem(cacheKey, 'true');
        return;
      }
    } catch {
      // Imagen no existe, continuar con la descarga
    }

    // Las imágenes no existen, descargarlas automáticamente
    setDownloadingImages(true);
    toast.info('Descargando imágenes de categorías por primera vez...');

    try {
      const nombres = cats.map(c => c.nombre);
      const res = await api.post('/imagenes/descargar-todas', nombres);
      const { exitosos, fallidos } = res.data;

      if (exitosos > 0) {
        toast.success(`${exitosos} imágenes descargadas`);
        // Limpiar cache para que se recarguen
        Object.keys(imageExistsCache).forEach(key => delete imageExistsCache[key]);
      }
      if (fallidos > 0) {
        toast.warning(`${fallidos} imágenes no encontradas`);
      }

      // Marcar como descargado para no volver a intentar
      localStorage.setItem(cacheKey, 'true');
    } catch (error) {
      console.error('Error descargando imágenes:', error);
    } finally {
      setDownloadingImages(false);
    }
  };

  const fetchCategorias = async () => {
    try {
      const response = await categoriasApi.getAll();
      setCategorias(response.data);
      // Verificar y descargar imágenes si es primera vez
      verificarYDescargarImagenes(response.data);
    } catch (error) {
      toast.error('Error al cargar categorías');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Descargar todas las imágenes de una vez (las guarda en backend/static/images/categorias/)
  const descargarTodasImagenes = async () => {
    if (categorias.length === 0) {
      toast.error('No hay categorías para descargar imágenes');
      return;
    }

    setDownloadingImages(true);
    toast.info('Descargando imágenes de categorías...');

    try {
      const nombres = categorias.map(c => c.nombre);
      const response = await api.post('/imagenes/descargar-todas', nombres);
      const { exitosos, fallidos } = response.data;

      if (exitosos > 0) {
        toast.success(`${exitosos} imágenes descargadas correctamente`);
        // Limpiar cache para que se recarguen
        Object.keys(imageExistsCache).forEach(key => delete imageExistsCache[key]);
      }
      if (fallidos > 0) {
        toast.warning(`${fallidos} imágenes no pudieron descargarse`);
      }
    } catch (error) {
      toast.error('Error al descargar imágenes');
      console.error('Error:', error);
    } finally {
      setDownloadingImages(false);
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
      // Cargar imagen existente (URL local directa)
      setFormImage(getLocalImageUrl(categoria.nombre));
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
      setFormImage(null);
    }
    setSheetOpen(true);
  };

  const buscarImagenIA = async () => {
    if (!formData.nombre.trim()) {
      toast.error('Ingresa un nombre de categoría primero');
      return;
    }

    setLoadingImage(true);
    try {
      const response = await imagenesApi.getCategoria(formData.nombre);
      const imageUrl = imagenesApi.getStaticUrl(response.data.imagen_url);
      if (imageUrl) {
        setFormImage(imageUrl);
        // Actualizar cache
        imageExistsCache[formData.nombre] = imageUrl;
        toast.success('Imagen encontrada');
      } else {
        toast.error('No se encontró imagen para esta categoría');
      }
    } catch {
      toast.error('Error al buscar imagen');
    } finally {
      setLoadingImage(false);
    }
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

  // Efecto para animar cards de a una (staggered) - solo la primera vez que cargan
  useEffect(() => {
    if (loading || categorias.length === 0 || animationDone) return;

    // Animar cada card con delay (una sola vez al cargar)
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    categorias.forEach((cat, index) => {
      const timeout = setTimeout(() => {
        setVisibleCards(prev => new Set([...prev, cat.id]));
      }, 50 + index * 80); // 80ms de delay entre cada card
      timeouts.push(timeout);
    });

    // Marcar animación como completada después de todas las cards
    const finalTimeout = setTimeout(() => {
      setAnimationDone(true);
    }, 50 + categorias.length * 80 + 100);
    timeouts.push(finalTimeout);

    return () => timeouts.forEach(t => clearTimeout(t));
  }, [loading, categorias.length, animationDone]);

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
            <span className="text-white text-sm font-medium opacity-70">
              {c.nombre[0].toUpperCase()}
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
      extraFilters={
        <button
          onClick={descargarTodasImagenes}
          disabled={downloadingImages}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50"
          style={{
            backgroundColor: `${theme.primary}15`,
            color: theme.primary,
            border: `1px solid ${theme.primary}30`,
          }}
          title="Descargar imágenes de Pexels para todas las categorías"
        >
          <Download className={`h-4 w-4 ${downloadingImages ? 'animate-bounce' : ''}`} />
          <span className="hidden sm:inline">
            {downloadingImages ? 'Descargando...' : 'Descargar Imágenes'}
          </span>
        </button>
      }
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
          {/* Preview de imagen con botón IA */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Imagen de la categoría
            </label>
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                height: '140px',
              }}
            >
              {formImage ? (
                <>
                  <img
                    src={formImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, transparent 0%, ${formData.color}40 100%)`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setFormImage(null)}
                    className="absolute top-2 right-2 p-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      color: 'white',
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <ImageIcon className="h-10 w-10" style={{ color: theme.textSecondary, opacity: 0.5 }} />
                  <span className="text-sm" style={{ color: theme.textSecondary }}>
                    Sin imagen
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={buscarImagenIA}
              disabled={loadingImage || !formData.nombre.trim()}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${formData.color}, ${formData.color}CC)`,
                color: 'white',
                boxShadow: `0 4px 14px ${formData.color}40`,
              }}
            >
              {loadingImage ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              {loadingImage ? 'Buscando...' : 'Buscar imagen con IA'}
            </button>
          </div>

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
      {filteredCategorias.map((c) => {
        const categoryColor = c.color || '#3B82F6';
        // Usar URL local directa (sin llamadas API) - la imagen ya está descargada
        const bgImage = getLocalImageUrl(c.nombre);
        // Si la animación terminó, siempre visible. Si no, depende del estado
        const isVisible = animationDone || visibleCards.has(c.id);

        return (
          <div
            key={c.id}
            onClick={() => openSheet(c)}
            className={`group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover transition-all duration-500 ${
              isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
            }`}
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              ['--card-primary' as string]: categoryColor,
            }}
          >
            {/* Imagen de fondo con overlay */}
            {bgImage && (
              <div className="absolute inset-0">
                <img
                  src={bgImage}
                  alt=""
                  className="w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
                />
                {/* Overlay con gradiente del color de la categoría */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${theme.card}F0 0%, ${theme.card}E0 50%, ${categoryColor}30 100%)`,
                  }}
                />
              </div>
            )}

            {/* Fondo con gradiente sutil del color de la categoría (fallback si no hay imagen) */}
            {!bgImage && (
              <div
                className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-500"
                style={{
                  background: `
                    radial-gradient(ellipse at top right, ${categoryColor}60 0%, transparent 50%),
                    radial-gradient(ellipse at bottom left, ${categoryColor}40 0%, transparent 50%)
                  `,
                }}
              />
            )}

            {/* Shine effect on hover */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div
                className="absolute -inset-full opacity-0 group-hover:opacity-100"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${categoryColor}20 50%, transparent 100%)`,
                }}
              />
            </div>

            {/* Contenido */}
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      backgroundColor: categoryColor,
                      boxShadow: `0 4px 14px ${categoryColor}40`,
                    }}
                  >
                    <span className="text-white text-xl font-bold opacity-70">
                      {c.nombre[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="ml-4">
                    <p className="font-semibold text-lg" style={{ color: theme.text }}>{c.nombre}</p>
                    <p className="text-sm" style={{ color: theme.textSecondary }}>
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {c.tiempo_resolucion_estimado}h estimadas
                      </span>
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

              {/* Footer sin separador - contenido hasta abajo */}
              <div className="flex items-center justify-between mt-3">
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    backgroundColor: `${categoryColor}20`,
                    color: categoryColor,
                  }}
                >
                  Prioridad {c.prioridad_default}
                </span>
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
