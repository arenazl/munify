import { useEffect, useState } from 'react';
import {
  Building2, Plus, Search, MapPin, Loader2, X,
  ChevronDown, ChevronUp, Map, Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { municipiosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import SettingsHeader from '../components/ui/SettingsHeader';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  latitud: number;
  longitud: number;
  radio_km: number;
  logo_url?: string;
  color_primario: string;
  activo: boolean;
}

interface Barrio {
  id: number;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
  validado: boolean;
}

export default function Municipios() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal de nuevo municipio
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    codigo: '',
    latitud: '',
    longitud: '',
    radio_km: '10',
    color_primario: '#3b82f6'
  });
  const [saving, setSaving] = useState(false);

  // Panel expandido y barrios
  const [expandedMunicipio, setExpandedMunicipio] = useState<number | null>(null);
  const [barriosCache, setBarriosCache] = useState<Record<number, Barrio[]>>({});
  const [loadingBarrios, setLoadingBarrios] = useState<number | null>(null);

  // Generación de direcciones
  const [generatingDirecciones, setGeneratingDirecciones] = useState<number | null>(null);

  useEffect(() => {
    fetchMunicipios();
  }, []);

  // Cargar barrios cuando se expande un municipio
  useEffect(() => {
    if (expandedMunicipio && !barriosCache[expandedMunicipio]) {
      fetchBarrios(expandedMunicipio);
    }
  }, [expandedMunicipio]);

  const fetchMunicipios = async () => {
    try {
      const response = await municipiosApi.getAll();
      setMunicipios(response.data);
    } catch (error) {
      toast.error('Error al cargar municipios');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBarrios = async (municipioId: number) => {
    setLoadingBarrios(municipioId);
    try {
      const response = await municipiosApi.getBarrios(municipioId);

      if (response.data.length === 0) {
        // No tiene barrios, cargarlos con IA
        toast.info('Cargando barrios con IA...');
        const cargarResponse = await municipiosApi.cargarBarrios(municipioId);
        toast.success(cargarResponse.data.message);

        // Obtener los barrios recién cargados
        const barriosResponse = await municipiosApi.getBarrios(municipioId);
        setBarriosCache(prev => ({ ...prev, [municipioId]: barriosResponse.data }));
      } else {
        setBarriosCache(prev => ({ ...prev, [municipioId]: response.data }));
      }
    } catch (error) {
      toast.error('Error al cargar barrios');
      console.error('Error:', error);
    } finally {
      setLoadingBarrios(null);
    }
  };

  // Generar código automático basado en el nombre
  const generarCodigo = (nombre: string) => {
    return nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 10);
  };

  const handleNombreChange = (nombre: string) => {
    setFormData({
      ...formData,
      nombre,
      codigo: generarCodigo(nombre)
    });
  };

  const handleCrearMunicipio = async () => {
    if (!formData.nombre.trim() || !formData.codigo.trim()) {
      toast.error('Nombre y código son requeridos');
      return;
    }

    setSaving(true);
    try {
      const response = await municipiosApi.create({
        nombre: formData.nombre,
        codigo: formData.codigo,
        latitud: parseFloat(formData.latitud) || -34.6,
        longitud: parseFloat(formData.longitud) || -58.4,
        radio_km: parseFloat(formData.radio_km) || 10,
        color_primario: formData.color_primario,
        activo: true
      });

      // Mostrar info del seed
      const seedInfo = response.data.seed_info;
      if (seedInfo) {
        toast.success(
          `Municipio creado con ${seedInfo.usuarios_demo} usuarios demo y ` +
          `${seedInfo.reclamos} reclamos de ejemplo`,
          { duration: 6000 }
        );

        // Mostrar los emails de acceso
        if (seedInfo.emails?.length > 0) {
          toast.info(`Usuarios: ${seedInfo.emails.join(', ')} (pass: demo123)`, { duration: 10000 });
        }
      } else {
        toast.success('Municipio creado');
      }

      setShowModal(false);
      setFormData({
        nombre: '',
        codigo: '',
        latitud: '',
        longitud: '',
        radio_km: '10',
        color_primario: '#3b82f6'
      });
      fetchMunicipios();

      // Expandir el nuevo municipio para ver los barrios
      setExpandedMunicipio(response.data.id);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Error al crear municipio');
    } finally {
      setSaving(false);
    }
  };

  const handleExpandMunicipio = (municipioId: number) => {
    setExpandedMunicipio(expandedMunicipio === municipioId ? null : municipioId);
  };

  const handleGenerarDirecciones = async (municipioId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar que se expanda/contraiga el panel
    setGeneratingDirecciones(municipioId);
    try {
      const response = await municipiosApi.generarDirecciones(municipioId);
      toast.success(response.data.message, { duration: 5000 });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Error al generar direcciones');
    } finally {
      setGeneratingDirecciones(null);
    }
  };

  // Filtrar municipios
  const municipiosFiltrados = municipios.filter(m =>
    m.nombre.toLowerCase().includes(search.toLowerCase()) ||
    m.codigo.toLowerCase().includes(search.toLowerCase())
  );

  // Solo super admin puede ver esta página
  if (user?.municipio_id) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <div className="text-center">
          <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" style={{ color: theme.textSecondary }} />
          <p className="text-lg" style={{ color: theme.text }}>
            Solo Super Admin puede gestionar municipios
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.background }}>
      <SettingsHeader
        title="Gestión de Municipios"
        subtitle="Administra los municipios del sistema"
        icon={Building2}
        backTo="/gestion/ajustes"
      />

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header con búsqueda y botón nuevo */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
            <input
              type="text"
              placeholder="Buscar municipio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: theme.text
              }}
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium"
            style={{ backgroundColor: theme.primary }}
          >
            <Plus className="h-4 w-4" />
            Nuevo Municipio
          </button>
        </div>

        {/* Lista de municipios */}
        <div className="space-y-4">
          {municipiosFiltrados.map(municipio => {
            const barrios = barriosCache[municipio.id] || [];
            const isExpanded = expandedMunicipio === municipio.id;
            const isLoadingBarrios = loadingBarrios === municipio.id;

            return (
              <div
                key={municipio.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`
                }}
              >
                {/* Header del municipio */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => handleExpandMunicipio(municipio.id)}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: municipio.color_primario }}
                    >
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: theme.text }}>
                        {municipio.nombre}
                      </p>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        {municipio.codigo} · Radio: {municipio.radio_km} km
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {barrios.length > 0 && (
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                      >
                        {barrios.length} barrios
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        municipio.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {municipio.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5" style={{ color: theme.textSecondary }} />
                    ) : (
                      <ChevronDown className="h-5 w-5" style={{ color: theme.textSecondary }} />
                    )}
                  </div>
                </div>

                {/* Panel expandido con barrios */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: theme.border }}>
                    <div className="pt-4 space-y-4">
                      {/* Coordenadas */}
                      <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                        <MapPin className="h-4 w-4" />
                        <span>Lat: {municipio.latitud.toFixed(4)}, Lng: {municipio.longitud.toFixed(4)}</span>
                      </div>

                      {/* Botón generar direcciones */}
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => handleGenerarDirecciones(municipio.id, e)}
                          disabled={generatingDirecciones === municipio.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            backgroundColor: theme.primary,
                            color: 'white',
                            opacity: generatingDirecciones === municipio.id ? 0.7 : 1
                          }}
                        >
                          {generatingDirecciones === municipio.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generando...
                            </>
                          ) : (
                            <>
                              <Briefcase className="h-4 w-4" />
                              Generar 6 Direcciones con IA
                            </>
                          )}
                        </button>
                      </div>

                      {/* Barrios */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Map className="h-4 w-4" style={{ color: theme.primary }} />
                          <span className="font-medium" style={{ color: theme.text }}>Barrios</span>
                        </div>

                        {isLoadingBarrios ? (
                          <div className="flex items-center gap-2 py-4">
                            <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.primary }} />
                            <span className="text-sm" style={{ color: theme.textSecondary }}>
                              Cargando barrios con IA...
                            </span>
                          </div>
                        ) : barrios.length > 0 ? (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {barrios.map(barrio => (
                              <div
                                key={barrio.id}
                                className="flex items-center gap-2 p-2 rounded-lg text-sm"
                                style={{
                                  backgroundColor: theme.backgroundSecondary,
                                  border: `1px solid ${theme.border}`
                                }}
                              >
                                <span style={{ color: theme.text }}>{barrio.nombre}</span>
                                {barrio.validado && (
                                  <span title="Con coordenadas">
                                    <MapPin className="h-3 w-3 ml-auto text-green-500" />
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm" style={{ color: theme.textSecondary }}>
                            No hay barrios cargados
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {municipiosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
              <p style={{ color: theme.textSecondary }}>No hay municipios</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo municipio */}
      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: theme.card }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>
                Nuevo Municipio
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                  Nombre
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => handleNombreChange(e.target.value)}
                  placeholder="Ej: Chacabuco"
                  className="w-full px-4 py-2.5 rounded-xl text-sm"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                    color: theme.text
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                  Código <span className="text-xs opacity-60">(auto-generado)</span>
                </label>
                <input
                  type="text"
                  value={formData.codigo}
                  readOnly
                  className="w-full px-4 py-2.5 rounded-xl text-sm cursor-not-allowed"
                  style={{
                    backgroundColor: theme.background,
                    border: `1px solid ${theme.border}`,
                    color: theme.textSecondary
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Latitud
                  </label>
                  <input
                    type="text"
                    value={formData.latitud}
                    onChange={(e) => setFormData({ ...formData, latitud: e.target.value })}
                    placeholder="-34.6"
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Longitud
                  </label>
                  <input
                    type="text"
                    value={formData.longitud}
                    onChange={(e) => setFormData({ ...formData, longitud: e.target.value })}
                    placeholder="-58.4"
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Radio (km)
                  </label>
                  <input
                    type="number"
                    value={formData.radio_km}
                    onChange={(e) => setFormData({ ...formData, radio_km: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                      color: theme.text
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={formData.color_primario}
                    onChange={(e) => setFormData({ ...formData, color_primario: e.target.value })}
                    className="w-full h-10 rounded-xl cursor-pointer"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl font-medium"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearMunicipio}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: theme.primary }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
