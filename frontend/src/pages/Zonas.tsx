import { useEffect, useState } from 'react';
import { Edit, MapPin, Navigation, AlertTriangle, CheckCircle, Loader2, EyeOff, RotateCcw, ChevronDown, Map } from 'lucide-react';
import { toast } from 'sonner';
import api, { zonasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMInput, ABMTextarea, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import type { Zona } from '../types';

// Tipo para la respuesta de validación de duplicados
interface ValidacionDuplicado {
  es_duplicado: boolean;
  similar_a: string | null;
  confianza: 'alta' | 'media' | 'baja';
  sugerencia: string;
}

// Colores para las zonas (se asignan cíclicamente)
const ZONE_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

// Genera URL de imagen estática de mapa basada en coordenadas
const getMapImageUrl = (lat: number | null | undefined, lng: number | null | undefined): string | null => {
  if (!lat || !lng) return null;
  // Usando OpenStreetMap static tiles
  const zoom = 14;
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lng + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return `https://tile.openstreetmap.org/${zoom}/${xtile}/${ytile}.png`;
};

export default function Zonas() {
  const { theme } = useTheme();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedZona, setSelectedZona] = useState<Zona | null>(null);
  // Estado para animación staggered (solo la primera vez)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set());
  const [animationDone, setAnimationDone] = useState(false);
  // Estado para validación de duplicados con IA
  const [validando, setValidando] = useState(false);
  const [validacion, setValidacion] = useState<ValidacionDuplicado | null>(null);
  // Estado para sección de deshabilitados
  const [showDeshabilitados, setShowDeshabilitados] = useState(false);
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
      setVisibleCards(new Set());
    } catch (error) {
      toast.error('Error al cargar zonas');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Validar duplicado con IA antes de crear
  const validarDuplicado = async (nombre: string) => {
    if (!nombre.trim() || selectedZona) {
      setValidacion(null);
      return;
    }

    setValidando(true);
    try {
      const response = await api.post('/chat/validar-duplicado', {
        nombre: nombre.trim(),
        tipo: 'zona'
      });
      setValidacion(response.data);
    } catch (error) {
      console.error('Error validando duplicado:', error);
      setValidacion(null);
    } finally {
      setValidando(false);
    }
  };

  const openSheet = (zona: Zona | null = null) => {
    // Limpiar validación al abrir
    setValidacion(null);
    setValidando(false);

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
    // Si estamos creando y hay un duplicado detectado con confianza alta, advertir
    if (!selectedZona && validacion?.es_duplicado && validacion.confianza === 'alta') {
      toast.error(`Ya existe una zona similar: "${validacion.similar_a}"`);
      return;
    }

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

  // Deshabilitar una zona (soft delete - pone activo=false)
  const handleDeshabilitar = async (zona: Zona) => {
    try {
      await zonasApi.update(zona.id, { ...zona, activo: false });
      toast.success(`"${zona.nombre}" deshabilitada`);
      fetchZonas();
    } catch (error) {
      toast.error('Error al deshabilitar');
      console.error('Error:', error);
    }
  };

  // Habilitar una zona deshabilitada
  const handleHabilitar = async (zona: Zona) => {
    try {
      await zonasApi.update(zona.id, { ...zona, activo: true });
      toast.success(`"${zona.nombre}" habilitada nuevamente`);
      fetchZonas();
    } catch (error) {
      toast.error('Error al habilitar');
      console.error('Error:', error);
    }
  };

  const filteredZonas = zonas.filter(z =>
    z.nombre.toLowerCase().includes(search.toLowerCase()) ||
    z.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    z.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  // Separar zonas activas y deshabilitadas
  const zonasActivas = filteredZonas.filter(z => z.activo);
  const zonasDeshabilitadas = filteredZonas.filter(z => !z.activo);

  // Efecto para animar cards de a una (staggered) - solo la primera vez
  useEffect(() => {
    if (loading || zonas.length === 0 || animationDone) return;

    // Animar cada card con delay (una sola vez al cargar)
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    zonas.forEach((zona, index) => {
      const timeout = setTimeout(() => {
        setVisibleCards(prev => new Set([...prev, zona.id]));
      }, 50 + index * 80);
      timeouts.push(timeout);
    });

    // Marcar animación como completada
    const finalTimeout = setTimeout(() => {
      setAnimationDone(true);
    }, 50 + zonas.length * 80 + 100);
    timeouts.push(finalTimeout);

    return () => timeouts.forEach(t => clearTimeout(t));
  }, [loading, zonas.length, animationDone]);

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
      icon={<Map className="h-5 w-5" />}
      backLink="/gestion/ajustes"
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
          data={zonasActivas}
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
                icon={<EyeOff className="h-4 w-4" />}
                onClick={() => handleDeshabilitar(z)}
                title="Deshabilitar"
                variant="danger"
              />
            </>
          )}
        />
      }
      disabledSection={
        zonasDeshabilitadas.length > 0 && (
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
                    Zonas Deshabilitadas
                  </h3>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                    {zonasDeshabilitadas.length} zona{zonasDeshabilitadas.length !== 1 ? 's' : ''} deshabilitada{zonasDeshabilitadas.length !== 1 ? 's' : ''}
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

            {/* Lista de zonas deshabilitadas */}
            {showDeshabilitados && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {zonasDeshabilitadas.map((z, index) => {
                  const zoneColor = ZONE_COLORS[index % ZONE_COLORS.length];

                  return (
                    <div
                      key={z.id}
                      className="rounded-xl overflow-hidden opacity-75 hover:opacity-100 transition-opacity"
                      style={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div
                        className="flex items-center justify-between p-4"
                        style={{
                          background: `linear-gradient(135deg, ${zoneColor}10 0%, ${zoneColor}05 100%)`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center grayscale"
                            style={{ backgroundColor: zoneColor }}
                          >
                            <MapPin className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold" style={{ color: theme.text }}>
                                {z.nombre}
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-500">
                                Deshabilitada
                              </span>
                            </div>
                            {z.codigo && (
                              <p className="text-sm font-mono" style={{ color: theme.textSecondary }}>
                                {z.codigo}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Botón habilitar */}
                          <button
                            onClick={() => handleHabilitar(z)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:scale-105"
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                            }}
                            title="Habilitar zona"
                          >
                            <RotateCcw className="h-4 w-4" />
                            <span className="text-sm font-medium">Habilitar</span>
                          </button>

                          {/* Botón editar */}
                          <button
                            onClick={() => openSheet(z)}
                            className="p-2 rounded-lg transition-colors hover:scale-105"
                            style={{
                              backgroundColor: theme.backgroundSecondary,
                              color: theme.textSecondary,
                            }}
                            title="Editar zona"
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
          <ABMInput
            label="Nombre"
            required
            value={formData.nombre}
            onChange={(e) => {
              setFormData({ ...formData, nombre: e.target.value });
              setValidacion(null);
            }}
            placeholder="Nombre de la zona"
          />

          <ABMInput
            label="Código"
            value={formData.codigo}
            onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
            placeholder="Ej: Z-CEN, Z-NOR"
          />

          <div>
            <ABMTextarea
              label="Descripción"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              onBlur={() => {
                // Validar al perder foco en descripción
                if (!selectedZona && formData.nombre.trim().length >= 2) {
                  validarDuplicado(formData.nombre);
                }
              }}
              placeholder="Descripción de la zona"
              rows={3}
            />
            {/* Indicador de validación IA */}
            {!selectedZona && (
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
      {zonasActivas.map((z, index) => {
        const zoneColor = ZONE_COLORS[index % ZONE_COLORS.length];
        const mapImage = getMapImageUrl(z.latitud_centro, z.longitud_centro);
        // Si la animación terminó, siempre visible
        const isVisible = animationDone || visibleCards.has(z.id);

        return (
          <div
            key={z.id}
            onClick={() => openSheet(z)}
            className={`group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover transition-all duration-500 ${
              isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
            }`}
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            {/* Imagen de mapa de fondo */}
            {mapImage && (
              <div className="absolute inset-0">
                <img
                  src={mapImage}
                  alt=""
                  className="w-full h-full object-cover opacity-15 group-hover:opacity-25 group-hover:scale-110 transition-all duration-700"
                />
                {/* Overlay con gradiente */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${theme.card}F5 0%, ${theme.card}E8 50%, ${zoneColor}25 100%)`,
                  }}
                />
              </div>
            )}

            {/* Fondo con gradiente sutil (fallback si no hay coordenadas) */}
            {!mapImage && (
              <div
                className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-500"
                style={{
                  background: `
                    radial-gradient(ellipse at top right, ${zoneColor}60 0%, transparent 50%),
                    radial-gradient(ellipse at bottom left, ${zoneColor}40 0%, transparent 50%)
                  `,
                }}
              />
            )}

            {/* Shine effect on hover */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div
                className="absolute -inset-full opacity-0 group-hover:opacity-100"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${zoneColor}15 50%, transparent 100%)`,
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
                      backgroundColor: zoneColor,
                      boxShadow: `0 4px 14px ${zoneColor}40`,
                    }}
                  >
                    <MapPin className="h-5 w-5 text-white" />
                  </div>
                  <div className="ml-4">
                    <p className="font-semibold text-lg" style={{ color: theme.text }}>{z.nombre}</p>
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

              {/* Footer con coordenadas */}
              <div className="flex items-center justify-between mt-3">
                {z.latitud_centro && z.longitud_centro ? (
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1"
                    style={{
                      backgroundColor: `${zoneColor}20`,
                      color: zoneColor,
                    }}
                  >
                    <Navigation className="h-3 w-3" />
                    {z.latitud_centro.toFixed(4)}, {z.longitud_centro.toFixed(4)}
                  </span>
                ) : (
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      backgroundColor: `${theme.textSecondary}15`,
                      color: theme.textSecondary,
                    }}
                  >
                    Sin coordenadas
                  </span>
                )}
                <ABMCardActions
                  onEdit={() => openSheet(z)}
                  onDelete={() => handleDeshabilitar(z)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
