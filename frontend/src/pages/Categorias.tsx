import { useEffect, useState } from 'react';
import { Edit, ImageIcon, RefreshCw, X, Download, AlertTriangle, CheckCircle, Loader2, EyeOff, RotateCcw, ChevronDown, Tags } from 'lucide-react';
import { toast } from 'sonner';
import api, { categoriasApi, imagenesApi, API_BASE_URL } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { Categoria } from '../types';

// Tipo para la respuesta de validación de duplicados
interface ValidacionDuplicado {
  es_duplicado: boolean;
  similar_a: string | null;
  confianza: 'alta' | 'media' | 'baja';
  sugerencia: string;
}

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
  // Estado para validación de duplicados con IA
  const [validando, setValidando] = useState(false);
  const [validacion, setValidacion] = useState<ValidacionDuplicado | null>(null);
  // Estado para sección de deshabilitados
  const [showDeshabilitados, setShowDeshabilitados] = useState(false);

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

  // Validar duplicado con IA antes de crear
  const validarDuplicado = async (nombre: string) => {
    if (!nombre.trim() || selectedCategoria) {
      // No validar si está vacío o si estamos editando
      setValidacion(null);
      return;
    }

    setValidando(true);
    try {
      const response = await api.post('/chat/validar-duplicado', {
        nombre: nombre.trim(),
        tipo: 'categoria'
      });
      setValidacion(response.data);
    } catch (error) {
      console.error('Error validando duplicado:', error);
      setValidacion(null);
    } finally {
      setValidando(false);
    }
  };

  const openSheet = (categoria: Categoria | null = null) => {
    // Limpiar validación al abrir
    setValidacion(null);
    setValidando(false);

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
    // Si estamos creando y hay un duplicado detectado con confianza alta, advertir
    if (!selectedCategoria && validacion?.es_duplicado && validacion.confianza === 'alta') {
      toast.error(`Ya existe una categoría similar: "${validacion.similar_a}"`);
      return;
    }

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

  // Deshabilitar una categoría (soft delete - pone activo=false)
  const handleDeshabilitar = async (categoria: Categoria) => {
    try {
      await categoriasApi.update(categoria.id, { ...categoria, activo: false });
      toast.success(`"${categoria.nombre}" deshabilitada`);
      fetchCategorias();
    } catch (error) {
      toast.error('Error al deshabilitar');
      console.error('Error:', error);
    }
  };

  // Habilitar una categoría deshabilitada
  const handleHabilitar = async (categoria: Categoria) => {
    try {
      await categoriasApi.update(categoria.id, { ...categoria, activo: true });
      toast.success(`"${categoria.nombre}" habilitada nuevamente`);
      fetchCategorias();
    } catch (error) {
      toast.error('Error al habilitar');
      console.error('Error:', error);
    }
  };

  const filteredCategorias = categorias.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  // Separar categorías activas y deshabilitadas
  const categoriasActivas = filteredCategorias.filter(c => c.activo);
  const categoriasDeshabilitadas = filteredCategorias.filter(c => !c.activo);

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
        <span
          className="block max-w-xs truncate"
          style={{ color: theme.textSecondary }}
          title={c.descripcion || '-'}
        >
          {c.descripcion || '-'}
        </span>
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
      icon={<Tags className="h-5 w-5" />}
      backLink="/gestion/ajustes"
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
          data={categoriasActivas}
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
                icon={<EyeOff className="h-4 w-4" />}
                onClick={() => handleDeshabilitar(c)}
                title="Deshabilitar"
                variant="danger"
              />
            </>
          )}
          renderMobileCard={(c, actionsNode) => (
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Avatar con letra */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: c.color || '#e5e7eb' }}
                >
                  <span className="text-white text-lg font-medium opacity-80">
                    {c.nombre[0].toUpperCase()}
                  </span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm" style={{ color: theme.text }}>
                      {c.nombre}
                    </h3>
                    <ABMBadge active={c.activo} />
                  </div>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: theme.textSecondary }}>
                    {c.descripcion || 'Sin descripción'}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                    <span>⏱ {c.tiempo_resolucion_estimado}h</span>
                    <span>🎯 Prioridad {c.prioridad_default}</span>
                  </div>
                </div>
              </div>
              {/* Acciones */}
              <div className="flex justify-end gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                {actionsNode}
              </div>
            </div>
          )}
        />
      }
      disabledSection={
        categoriasDeshabilitadas.length > 0 && (
          <div className="mt-8">
            {/* Header colapsable */}
            <button
              onClick={() => setShowDeshabilitados(!showDeshabilitados)}
              className="w-full flex items-center justify-between p-4 rounded-xl transition-all hover:opacity-90"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
                >
                  <EyeOff className="h-5 w-5" style={{ color: '#ef4444' }} />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold" style={{ color: theme.text }}>
                    Categorías Deshabilitadas
                  </h3>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                    {categoriasDeshabilitadas.length} categoría{categoriasDeshabilitadas.length !== 1 ? 's' : ''} deshabilitada{categoriasDeshabilitadas.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div
                className="p-2 rounded-lg transition-transform"
                style={{
                  backgroundColor: theme.card,
                  transform: showDeshabilitados ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              >
                <ChevronDown className="h-4 w-4" style={{ color: theme.textSecondary }} />
              </div>
            </button>

            {/* Lista de categorías deshabilitadas */}
            {showDeshabilitados && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoriasDeshabilitadas.map((c) => {
                  const categoryColor = c.color || '#3B82F6';

                  return (
                    <div
                      key={c.id}
                      className="rounded-xl overflow-hidden opacity-75 hover:opacity-100 transition-opacity"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div
                        className="flex items-center justify-between p-4"
                        style={{
                          background: `linear-gradient(135deg, ${categoryColor}10 0%, ${categoryColor}05 100%)`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center grayscale"
                            style={{ backgroundColor: categoryColor }}
                          >
                            <span className="text-white font-bold">{c.nombre[0].toUpperCase()}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold" style={{ color: theme.text }}>
                                {c.nombre}
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-500">
                                Deshabilitada
                              </span>
                            </div>
                            <p className="text-sm" style={{ color: theme.textSecondary }}>
                              {c.tiempo_resolucion_estimado}h estimadas
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Botón habilitar */}
                          <button
                            onClick={() => handleHabilitar(c)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:scale-105"
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                            }}
                            title="Habilitar categoría"
                          >
                            <RotateCcw className="h-4 w-4" />
                            <span className="text-sm font-medium">Habilitar</span>
                          </button>

                          {/* Botón editar */}
                          <button
                            onClick={() => openSheet(c)}
                            className="p-2 rounded-lg transition-colors hover:scale-105"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              color: theme.textSecondary,
                            }}
                            title="Editar categoría"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
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
            onChange={(e) => {
              setFormData({ ...formData, nombre: e.target.value });
              // Limpiar validación al cambiar el nombre
              setValidacion(null);
            }}
            placeholder="Nombre de la categoría"
          />

          <div>
            <ABMTextarea
              label="Descripción"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              onBlur={() => {
                // Validar al perder foco en descripción (después de completar nombre + descripción)
                if (!selectedCategoria && formData.nombre.trim().length >= 2) {
                  validarDuplicado(formData.nombre);
                }
              }}
              placeholder="Descripción de la categoría"
              rows={3}
            />
            {/* Indicador de validación IA - se muestra después de perder foco en descripción */}
            {!selectedCategoria && (
              <div className="mt-2">
                {validando ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verificando con IA si ya existe...</span>
                  </div>
                ) : validacion ? (
                  <div
                    className={`flex items-start gap-2 text-sm p-2 rounded-lg ${
                      validacion.es_duplicado
                        ? 'bg-amber-500/10 border border-amber-500/30'
                        : 'bg-green-500/10 border border-green-500/30'
                    }`}
                  >
                    {validacion.es_duplicado ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={validacion.es_duplicado ? 'text-amber-600' : 'text-green-600'}>
                        {validacion.sugerencia}
                      </p>
                      {validacion.es_duplicado && validacion.similar_a && (
                        <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                          Similar a: <strong>{validacion.similar_a}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

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
      {categoriasActivas.map((c) => {
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
                  onDelete={() => handleDeshabilitar(c)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
