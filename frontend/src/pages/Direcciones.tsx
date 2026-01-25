import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, Building2, MapPin, EyeOff, RotateCcw, ChevronDown, Settings2, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { direccionesApi } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMBadge, ABMSheetFooter, ABMTable, ABMTableAction, ABMCardActions } from '../components/ui/ABMPage';
import { MapPicker } from '../components/ui/MapPicker';
import type { Direccion, TipoGestion } from '../types';

// Colores para las direcciones
const DIRECCION_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
];

// Configuración por tipo de gestión
const TIPO_GESTION_CONFIG: Record<TipoGestion, { label: string; color: string; bgColor: string }> = {
  reclamos: { label: 'Reclamos', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
  tramites: { label: 'Tramites', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)' },
  ambos: { label: 'Ambos', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)' },
};

// Genera preview del código automático
function generarCodigoPreview(nombre: string): string {
  if (!nombre.trim()) return '';
  const ignorar = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'a']);
  const palabras = nombre.replace(/[^\w\s]/g, '').split(/\s+/);
  const iniciales = palabras
    .filter(p => !ignorar.has(p.toLowerCase()) && p.length > 1)
    .map(p => p[0].toUpperCase())
    .join('');
  return iniciales.length >= 2 ? `${iniciales}-###` : nombre.slice(0, 3).toUpperCase() + '-###';
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    postcode?: string;
    county?: string;        // Partido
    state_district?: string; // Partido alternativo
    state?: string;         // Provincia
  };
}

export default function Direcciones() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDireccion, setSelectedDireccion] = useState<Direccion | null>(null);
  const [showDeshabilitados, setShowDeshabilitados] = useState(false);

  // Form simplificado: solo nombre y dirección
  const [formData, setFormData] = useState({
    nombre: '',
    direccion: '',
    localidad: '',
    codigo_postal: '',
    latitud: null as number | null,
    longitud: null as number | null,
    tipo_gestion: 'ambos' as TipoGestion,
  });

  // Búsqueda de direcciones
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Datos del municipio para contexto de búsqueda
  const [municipioNombre, setMunicipioNombre] = useState('');

  useEffect(() => {
    fetchDirecciones();
    fetchMunicipioData();
  }, []);

  const fetchMunicipioData = async () => {
    try {
      const municipioId = localStorage.getItem('municipio_id');
      const url = municipioId
        ? `${API_URL}/configuracion/publica/municipio?municipio_id=${municipioId}`
        : `${API_URL}/configuracion/publica/municipio`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // Extraer nombre limpio del municipio
        const nombre = data.nombre_municipio?.replace('Municipalidad de ', '') || '';
        setMunicipioNombre(nombre);
      }
    } catch (error) {
      console.error('Error cargando datos del municipio:', error);
    }
  };

  const fetchDirecciones = async () => {
    try {
      const response = await direccionesApi.getAll();
      setDirecciones(response.data);
    } catch (error) {
      toast.error('Error al cargar direcciones');
    } finally {
      setLoading(false);
    }
  };

  // Búsqueda con Nominatim (usando contexto del municipio)
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSearchingAddress(true);
    try {
      // Usar el municipio como contexto para mejores resultados
      const contexto = municipioNombre
        ? `${municipioNombre}, Buenos Aires, Argentina`
        : 'Buenos Aires, Argentina';

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, ${encodeURIComponent(contexto)}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await response.json();
      setAddressSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (error) {
      console.error('Error buscando dirección:', error);
    } finally {
      setSearchingAddress(false);
    }
  }, [municipioNombre]);

  const handleAddressChange = (value: string) => {
    setFormData(prev => ({ ...prev, direccion: value }));
    if (addressTimeoutRef.current) clearTimeout(addressTimeoutRef.current);
    addressTimeoutRef.current = setTimeout(() => searchAddress(value), 300);
  };

  const selectAddress = (suggestion: NominatimResult) => {
    const addr = suggestion.address;

    // Extraer el número que el usuario escribió en el input
    const userInput = formData.direccion;
    const numberMatch = userInput.match(/(\d+)/);
    const userNumber = numberMatch ? numberMatch[1] : '';

    // Usar el número de Nominatim si existe, sino el que escribió el usuario
    const numero = addr?.house_number || userNumber;

    let direccionFormateada = '';
    if (addr?.road) {
      direccionFormateada = numero ? `${addr.road} ${numero}` : addr.road;
    } else {
      direccionFormateada = suggestion.display_name.split(',')[0];
      if (numero && !direccionFormateada.includes(numero)) {
        direccionFormateada = `${direccionFormateada} ${numero}`;
      }
    }

    const localidad = addr?.city || addr?.town || addr?.village || addr?.suburb || '';
    const partido = addr?.county || addr?.state_district || '';

    setFormData(prev => ({
      ...prev,
      direccion: direccionFormateada,
      localidad: partido ? `${localidad}, ${partido}` : localidad,
      codigo_postal: addr?.postcode || '',
      latitud: parseFloat(suggestion.lat),
      longitud: parseFloat(suggestion.lon),
    }));
    setShowSuggestions(false);
  };

  const openSheet = (direccion: Direccion | null = null) => {
    if (direccion) {
      setFormData({
        nombre: direccion.nombre,
        direccion: direccion.direccion || '',
        localidad: direccion.localidad || '',
        codigo_postal: direccion.codigo_postal || '',
        latitud: direccion.latitud || null,
        longitud: direccion.longitud || null,
        tipo_gestion: direccion.tipo_gestion,
      });
      setSelectedDireccion(direccion);
    } else {
      setFormData({
        nombre: '',
        direccion: '',
        localidad: '',
        codigo_postal: '',
        latitud: null,
        longitud: null,
        tipo_gestion: 'ambos',
      });
      setSelectedDireccion(null);
    }
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setSelectedDireccion(null);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (selectedDireccion) {
        await direccionesApi.update(selectedDireccion.id, formData);
        toast.success('Direccion actualizada');
      } else {
        await direccionesApi.create(formData);
        toast.success('Direccion creada');
      }
      fetchDirecciones();
      closeSheet();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeshabilitar = async (d: Direccion) => {
    try {
      await direccionesApi.update(d.id, { activo: false });
      toast.success(`"${d.nombre}" deshabilitada`);
      fetchDirecciones();
    } catch { toast.error('Error al deshabilitar'); }
  };

  const handleHabilitar = async (d: Direccion) => {
    try {
      await direccionesApi.update(d.id, { activo: true });
      toast.success(`"${d.nombre}" habilitada`);
      fetchDirecciones();
    } catch { toast.error('Error al habilitar'); }
  };

  const filteredDirecciones = direcciones.filter(d =>
    d.nombre.toLowerCase().includes(search.toLowerCase()) ||
    d.codigo?.toLowerCase().includes(search.toLowerCase())
  );
  const direccionesActivas = filteredDirecciones.filter(d => d.activo);
  const direccionesDeshabilitadas = filteredDirecciones.filter(d => !d.activo);

  const codigoPreview = selectedDireccion?.codigo || generarCodigoPreview(formData.nombre);

  const tableColumns = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortValue: (d: Direccion) => d.nombre,
      render: (d: Direccion) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <span className="font-medium">{d.nombre}</span>
            {d.codigo && (
              <span className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.backgroundSecondary }}>
                {d.codigo}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'tipo_gestion',
      header: 'Tipo',
      sortValue: (d: Direccion) => d.tipo_gestion,
      render: (d: Direccion) => {
        const config = TIPO_GESTION_CONFIG[d.tipo_gestion];
        return (
          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: config.bgColor, color: config.color }}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'ubicacion',
      header: 'Ubicacion',
      sortable: false,
      render: (d: Direccion) => (
        <div className="text-sm" style={{ color: theme.textSecondary }}>
          {d.direccion ? (
            <>
              <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {d.direccion}</div>
              {d.localidad && <div className="text-xs">{d.localidad}</div>}
            </>
          ) : '-'}
        </div>
      ),
    },
    {
      key: 'activo',
      header: 'Estado',
      sortValue: (d: Direccion) => d.activo,
      render: (d: Direccion) => <ABMBadge active={d.activo} />,
    },
  ];

  return (
    <ABMPage
      title="Direcciones"
      icon={<Building2 className="h-5 w-5" />}
      backLink="/gestion/ajustes"
      buttonLabel="Nueva Direccion"
      onAdd={() => openSheet()}
      headerActions={
        <button
          onClick={() => navigate('/gestion/direcciones/config')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all hover:scale-105"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          <Settings2 className="h-4 w-4" />
          Configurar Asignaciones
        </button>
      }
      searchPlaceholder="Buscar direcciones..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={filteredDirecciones.length === 0}
      emptyMessage="No se encontraron direcciones"
      sheetOpen={sheetOpen}
      sheetTitle={selectedDireccion ? 'Editar Direccion' : 'Nueva Direccion'}
      sheetDescription={selectedDireccion ? 'Modifica los datos' : 'Completa los datos'}
      onSheetClose={closeSheet}
      tableView={
        <ABMTable
          data={direccionesActivas}
          columns={tableColumns}
          keyExtractor={(d) => d.id}
          onRowClick={(d) => openSheet(d)}
          actions={(d) => (
            <>
              <ABMTableAction icon={<Edit className="h-4 w-4" />} onClick={() => openSheet(d)} title="Editar" />
              <ABMTableAction icon={<EyeOff className="h-4 w-4" />} onClick={() => handleDeshabilitar(d)} title="Deshabilitar" variant="danger" />
            </>
          )}
        />
      }
      disabledSection={
        direccionesDeshabilitadas.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowDeshabilitados(!showDeshabilitados)}
              className="w-full flex items-center justify-between p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}>
                  <EyeOff className="h-5 w-5" style={{ color: '#ef4444' }} />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold" style={{ color: theme.text }}>Direcciones Deshabilitadas</h3>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>{direccionesDeshabilitadas.length} deshabilitada(s)</p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4" style={{ color: theme.textSecondary, transform: showDeshabilitados ? 'rotate(0)' : 'rotate(-90deg)' }} />
            </button>
            {showDeshabilitados && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {direccionesDeshabilitadas.map((d, i) => (
                  <div key={d.id} className="rounded-xl p-4 opacity-75 hover:opacity-100" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center grayscale" style={{ backgroundColor: DIRECCION_COLORS[i % DIRECCION_COLORS.length] }}>
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold" style={{ color: theme.text }}>{d.nombre}</h3>
                          {d.codigo && <p className="text-xs font-mono" style={{ color: theme.textSecondary }}>{d.codigo}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleHabilitar(d)} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button onClick={() => openSheet(d)} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
                          <Edit className="h-4 w-4" style={{ color: theme.textSecondary }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
      sheetFooter={<ABMSheetFooter onCancel={closeSheet} onSave={handleSubmit} saving={saving} />}
      sheetContent={
        <form className="space-y-5">
          {/* Nombre con código automático */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Nombre *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Dpto Catastral"
                className="flex-1 px-4 py-2.5 rounded-lg"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              />
              {codigoPreview && (
                <div className="flex items-center px-3 rounded-lg font-mono text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.primary, border: `1px solid ${theme.border}` }}>
                  {codigoPreview}
                </div>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>El codigo se genera automaticamente</p>
          </div>

          {/* Tipo de gestión */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>Tipo de Gestion</label>
            <div className="grid grid-cols-3 gap-2">
              {(['reclamos', 'tramites', 'ambos'] as TipoGestion[]).map((tipo) => {
                const config = TIPO_GESTION_CONFIG[tipo];
                const isSelected = formData.tipo_gestion === tipo;
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo_gestion: tipo })}
                    className="p-2.5 rounded-lg border-2 transition-all text-center text-sm"
                    style={{
                      borderColor: isSelected ? config.color : theme.border,
                      backgroundColor: isSelected ? config.bgColor : 'transparent',
                      color: isSelected ? config.color : theme.textSecondary,
                    }}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dirección con autocomplete */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              <MapPin className="h-4 w-4 inline mr-1" /> Direccion del Edificio
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.direccion}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Buscar direccion..."
                className="w-full px-4 py-2.5 rounded-lg pr-10"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {searchingAddress ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} /> : <Search className="h-4 w-4" style={{ color: theme.textSecondary }} />}
              </div>
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                  {addressSuggestions.map((s) => (
                    <button
                      key={s.place_id}
                      type="button"
                      onClick={() => selectAddress(s)}
                      className="w-full px-4 py-3 text-left hover:opacity-80 border-b last:border-b-0"
                      style={{ borderColor: theme.border }}
                    >
                      <p className="font-medium text-sm" style={{ color: theme.text }}>{s.display_name.split(',').slice(0, 2).join(', ')}</p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>{s.display_name.split(',').slice(2, 4).join(', ')}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info de localidad y CP */}
            {(formData.localidad || formData.codigo_postal) && (
              <div className="flex gap-4 mt-2 text-sm" style={{ color: theme.textSecondary }}>
                {formData.localidad && <span>{formData.localidad}</span>}
                {formData.codigo_postal && <span>CP: {formData.codigo_postal}</span>}
              </div>
            )}

            {/* Mapa */}
            {(formData.latitud && formData.longitud) && (
              <div className="mt-3">
                <MapPicker
                  value={{ lat: formData.latitud, lng: formData.longitud }}
                  onChange={(coords) => setFormData({ ...formData, latitud: coords.lat, longitud: coords.lng })}
                  height="180px"
                />
              </div>
            )}
          </div>
        </form>
      }
    >
      {/* Cards view */}
      {direccionesActivas.map((d, i) => {
        const dirColor = DIRECCION_COLORS[i % DIRECCION_COLORS.length];
        const tipoConfig = TIPO_GESTION_CONFIG[d.tipo_gestion];
        return (
          <div
            key={d.id}
            onClick={() => openSheet(d)}
            className="group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.15]" style={{ background: `radial-gradient(ellipse at top right, ${dirColor}60 0%, transparent 50%)` }} />
            <div className="relative z-10 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: dirColor }}>
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="ml-4">
                    <p className="font-semibold text-lg" style={{ color: theme.text }}>{d.nombre}</p>
                    {d.codigo && <p className="text-sm font-mono" style={{ color: theme.textSecondary }}>{d.codigo}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: tipoConfig.bgColor, color: tipoConfig.color }}>{tipoConfig.label}</span>
                  <ABMBadge active={d.activo} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs" style={{ color: theme.textSecondary }}>
                  {d.direccion && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {d.direccion}</span>}
                </div>
                <ABMCardActions onEdit={() => openSheet(d)} onDelete={() => handleDeshabilitar(d)} />
              </div>
            </div>
          </div>
        );
      })}
    </ABMPage>
  );
}
