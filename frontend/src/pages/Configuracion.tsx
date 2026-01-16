import { useEffect, useState, useRef } from 'react';
import { Save, Settings, Sparkles, Check, X, MapPin, Loader2, Building2, Upload, Palette, Image, ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { configuracionApi, municipiosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

// Claves que se muestran en la sección especial del Municipio
const MUNICIPIO_KEYS = ['nombre_municipio', 'direccion_municipio', 'latitud_municipio', 'longitud_municipio', 'telefono_contacto'];

// Claves de configuración de registro
const REGISTRO_KEYS = ['skip_email_validation'];

interface Config {
  id: number;
  clave: string;
  valor: string | null;
  descripcion: string | null;
  tipo: string;
  editable: boolean;
  municipio_id: number | null;
}

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
}

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

// Colores predefinidos para branding
const BRAND_COLORS = [
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Celeste', value: '#0ea5e9' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Esmeralda', value: '#10b981' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Gris', value: '#6b7280' },
];

export default function Configuracion() {
  const { theme } = useTheme();
  const { municipioActual, loadMunicipios } = useAuth();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [modified, setModified] = useState<Record<string, boolean>>({});
  const [, setMunicipios] = useState<Municipio[]>([]);
  const [, setConfigMunicipioScope] = useState<Record<string, number | null>>({});

  // Branding states
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [colorPrimario, setColorPrimario] = useState(municipioActual?.color_primario || '#3b82f6');
  const [colorSecundario, setColorSecundario] = useState(municipioActual?.color_secundario || '#1e40af');
  const [logoUrl, setLogoUrl] = useState(municipioActual?.logo_url || '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Imagen de portada states
  const [portadaLoading, setPortadaLoading] = useState(false);
  const [imagenPortadaUrl, setImagenPortadaUrl] = useState(municipioActual?.imagen_portada || '');
  const [portadaFile, setPortadaFile] = useState<File | null>(null);
  const [portadaPreview, setPortadaPreview] = useState<string | null>(null);
  const portadaInputRef = useRef<HTMLInputElement>(null);

  // Estados para autocompletado de municipio (nombre)
  const [municipioSuggestions, setMunicipioSuggestions] = useState<AddressSuggestion[]>([]);
  const [showMunicipioSuggestions, setShowMunicipioSuggestions] = useState(false);
  const [searchingMunicipio, setSearchingMunicipio] = useState(false);
  const municipioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados para autocompletado de dirección
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const addressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchConfigs();
    fetchMunicipios();
  }, []);

  // Actualizar estados de branding cuando cambia el municipio
  useEffect(() => {
    if (municipioActual) {
      setColorPrimario(municipioActual.color_primario || '#3b82f6');
      setColorSecundario(municipioActual.color_secundario || '#1e40af');
      setLogoUrl(municipioActual.logo_url || '');
      setImagenPortadaUrl(municipioActual.imagen_portada || '');
    }
  }, [municipioActual]);

  // Handle logo file selection
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor selecciona una imagen válida');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.error('La imagen no debe superar los 2MB');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle portada file selection
  const handlePortadaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor selecciona una imagen válida');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no debe superar los 5MB');
        return;
      }
      setPortadaFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPortadaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Guardar imagen de portada
  const handleSavePortada = async () => {
    if (!municipioActual || !portadaFile) {
      toast.error('Selecciona una imagen primero');
      return;
    }

    setPortadaLoading(true);
    try {
      const formData = new FormData();
      formData.append('imagen', portadaFile);

      const response = await municipiosApi.updateImagenPortada(municipioActual.id, formData);

      if (response.data) {
        toast.success('Imagen de portada actualizada');
        if (response.data.imagen_portada) {
          setImagenPortadaUrl(response.data.imagen_portada);
        }
        await loadMunicipios();
        setPortadaFile(null);
        setPortadaPreview(null);
      }
    } catch (error) {
      toast.error('Error al guardar imagen de portada');
      console.error('Error:', error);
    } finally {
      setPortadaLoading(false);
    }
  };

  // Eliminar imagen de portada
  const handleDeletePortada = async () => {
    if (!municipioActual) return;

    setPortadaLoading(true);
    try {
      await municipiosApi.deleteImagenPortada(municipioActual.id);
      toast.success('Imagen de portada eliminada');
      setImagenPortadaUrl('');
      await loadMunicipios();
    } catch (error) {
      toast.error('Error al eliminar imagen de portada');
      console.error('Error:', error);
    } finally {
      setPortadaLoading(false);
    }
  };

  // Generar color secundario basado en el primario
  const generateSecondaryColor = (primary: string) => {
    // Oscurecer el color primario para el secundario
    const hex = primary.replace('#', '');
    const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40);
    const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40);
    const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Guardar branding
  const handleSaveBranding = async () => {
    if (!municipioActual) {
      toast.error('No hay municipio seleccionado');
      return;
    }

    setBrandingLoading(true);
    try {
      const formData = new FormData();
      formData.append('color_primario', colorPrimario);
      formData.append('color_secundario', colorSecundario);

      if (logoFile) {
        formData.append('logo', logoFile);
      }

      const response = await municipiosApi.updateBranding(municipioActual.id, formData);

      if (response.data) {
        toast.success('Branding actualizado correctamente');
        // Actualizar logo_url con la respuesta del servidor
        if (response.data.logo_url) {
          setLogoUrl(response.data.logo_url);
        }
        // Recargar municipios para reflejar cambios
        await loadMunicipios();
        setLogoFile(null);
        setLogoPreview(null);
      }
    } catch (error) {
      toast.error('Error al guardar branding');
      console.error('Error:', error);
    } finally {
      setBrandingLoading(false);
    }
  };

  const hasBrandingChanges =
    colorPrimario !== (municipioActual?.color_primario || '#3b82f6') ||
    colorSecundario !== (municipioActual?.color_secundario || '#1e40af') ||
    logoFile !== null;

  const fetchConfigs = async () => {
    try {
      const response = await configuracionApi.getAll();
      setConfigs(response.data);
      const vals: Record<string, string> = {};
      const scopes: Record<string, number | null> = {};
      response.data.forEach((c: Config) => {
        vals[c.clave] = c.valor || '';
        scopes[c.clave] = c.municipio_id;
      });
      setValues(vals);
      setConfigMunicipioScope(scopes);
    } catch (error) {
      toast.error('Error al cargar configuración');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMunicipios = async () => {
    try {
      const response = await municipiosApi.getAll();
      setMunicipios(response.data);
    } catch (error) {
      console.error('Error cargando municipios:', error);
    }
  };

  const handleChange = (clave: string, valor: string) => {
    setValues({ ...values, [clave]: valor });
    const original = configs.find(c => c.clave === clave)?.valor || '';
    setModified({ ...modified, [clave]: valor !== original });
  };

  // Buscar municipios con Nominatim (ciudades/localidades de Argentina)
  const searchMunicipio = async (query: string) => {
    if (query.length < 3) {
      setMunicipioSuggestions([]);
      return;
    }

    setSearchingMunicipio(true);
    try {
      // Buscar ciudades/municipios en Argentina
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Argentina&limit=5&featuretype=city&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMunicipioSuggestions(data);
        setShowMunicipioSuggestions(data.length > 0);
      }
    } catch (error) {
      console.error('Error buscando municipio:', error);
    } finally {
      setSearchingMunicipio(false);
    }
  };

  // Manejar cambio en nombre del municipio con debounce
  const handleMunicipioChange = (valor: string) => {
    handleChange('nombre_municipio', valor);

    if (municipioTimeoutRef.current) {
      clearTimeout(municipioTimeoutRef.current);
    }

    municipioTimeoutRef.current = setTimeout(() => {
      searchMunicipio(valor);
    }, 400);
  };

  // Seleccionar un municipio sugerido
  const selectMunicipio = (suggestion: AddressSuggestion) => {
    // Extraer nombre del municipio (primera parte antes de la coma)
    const parts = suggestion.display_name.split(',');
    const municipioName = parts[0].trim();

    // Simplificar dirección (primeras 3 partes)
    const simplifiedAddress = parts.slice(0, 3).join(',').trim();

    // Actualizar todos los campos del municipio
    setValues(prev => ({
      ...prev,
      nombre_municipio: `Municipalidad de ${municipioName}`,
      direccion_municipio: simplifiedAddress,
      latitud_municipio: suggestion.lat,
      longitud_municipio: suggestion.lon,
    }));

    setModified(prev => ({
      ...prev,
      nombre_municipio: true,
      direccion_municipio: true,
      latitud_municipio: true,
      longitud_municipio: true,
    }));

    setShowMunicipioSuggestions(false);
    setMunicipioSuggestions([]);
  };

  // Buscar direcciones con Nominatim (usando el municipio seleccionado como contexto)
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    setSearchingAddress(true);
    try {
      // Extraer nombre del municipio para contextualizar la búsqueda
      const municipioNombre = values.nombre_municipio?.replace('Municipalidad de ', '') || '';
      const contexto = municipioNombre ? `${municipioNombre}, Argentina` : 'Argentina';

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, ${encodeURIComponent(contexto)}&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAddressSuggestions(data);
        setShowAddressSuggestions(data.length > 0);
      }
    } catch (error) {
      console.error('Error buscando dirección:', error);
    } finally {
      setSearchingAddress(false);
    }
  };

  // Manejar cambio en dirección con debounce
  const handleAddressChange = (valor: string) => {
    handleChange('direccion_municipio', valor);

    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    addressTimeoutRef.current = setTimeout(() => {
      searchAddress(valor);
    }, 400);
  };

  // Seleccionar una dirección sugerida
  const selectAddress = (suggestion: AddressSuggestion) => {
    const parts = suggestion.display_name.split(',');
    const simplifiedAddress = parts.slice(0, 3).join(',').trim();

    // Actualizar dirección
    handleChange('direccion_municipio', simplifiedAddress);

    // Actualizar latitud y longitud
    setValues(prev => ({
      ...prev,
      direccion_municipio: simplifiedAddress,
      latitud_municipio: suggestion.lat,
      longitud_municipio: suggestion.lon
    }));

    // Marcar como modificados
    setModified(prev => ({
      ...prev,
      direccion_municipio: true,
      latitud_municipio: true,
      longitud_municipio: true
    }));

    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
  };

  const handleSave = async (clave: string) => {
    setSaving(clave);
    try {
      await configuracionApi.update(clave, { valor: values[clave] });
      setModified({ ...modified, [clave]: false });
      // Actualizar el valor original en configs
      setConfigs(configs.map(c => c.clave === clave ? { ...c, valor: values[clave] } : c));
      toast.success('Configuración guardada');
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(null);
    }
  };

  // Guardar todos los campos del municipio
  const handleSaveMunicipio = async () => {
    setSaving('municipio');
    try {
      const keysToSave = MUNICIPIO_KEYS.filter(key => modified[key]);
      for (const key of keysToSave) {
        await configuracionApi.update(key, { valor: values[key] });
      }
      // Limpiar modified para las claves guardadas
      const newModified = { ...modified };
      keysToSave.forEach(key => newModified[key] = false);
      setModified(newModified);
      // Actualizar configs
      setConfigs(configs.map(c => MUNICIPIO_KEYS.includes(c.clave) ? { ...c, valor: values[c.clave] } : c));
      toast.success('Datos del municipio guardados');
    } catch (error) {
      toast.error('Error al guardar');
      console.error('Error:', error);
    } finally {
      setSaving(null);
    }
  };

  // Verificar si hay cambios en el municipio
  const hasMunicipioChanges = MUNICIPIO_KEYS.some(key => modified[key]);

  // Filtrar configs para excluir las del municipio y registro en la tabla general
  const otherConfigs = configs.filter(c => !MUNICIPIO_KEYS.includes(c.clave) && !REGISTRO_KEYS.includes(c.clave));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
            style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
          />
          <Sparkles
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse"
            style={{ color: theme.primary }}
          />
        </div>
        <p className="text-sm animate-pulse" style={{ color: theme.textSecondary }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl px-5 py-4"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Settings className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>
              Configuración
            </h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Parámetros del sistema
            </p>
          </div>
        </div>
      </div>

      {/* Sección Datos del Municipio */}
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>
              Datos del Municipio
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Nombre y ubicación de la municipalidad
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Nombre del Municipio con autocompletado */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Nombre del Municipio
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
              <input
                type="text"
                value={values.nombre_municipio || ''}
                onChange={(e) => handleMunicipioChange(e.target.value)}
                onFocus={() => municipioSuggestions.length > 0 && setShowMunicipioSuggestions(true)}
                onBlur={() => setTimeout(() => setShowMunicipioSuggestions(false), 200)}
                placeholder="Buscar municipio..."
                className="w-full rounded-lg pl-10 pr-10 py-3 text-sm transition-all duration-200 focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${modified.nombre_municipio ? '#f59e0b' : theme.border}`,
                }}
              />
              {searchingMunicipio && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.primary }} />
              )}

              {/* Sugerencias de municipio */}
              {showMunicipioSuggestions && municipioSuggestions.length > 0 && (
                <div
                  className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {municipioSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectMunicipio(suggestion)}
                      className="w-full px-4 py-3 text-left text-sm hover:opacity-80 transition-colors flex items-start gap-2"
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'transparent' : theme.backgroundSecondary,
                        color: theme.text,
                      }}
                    >
                      <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                      <span className="line-clamp-2">{suggestion.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dirección del Municipio con autocompletado */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Dirección de la Municipalidad
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
              <input
                type="text"
                value={values.direccion_municipio || ''}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
                onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                placeholder="Buscar dirección..."
                className="w-full rounded-lg pl-10 pr-10 py-3 text-sm transition-all duration-200 focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${modified.direccion_municipio ? '#f59e0b' : theme.border}`,
                }}
              />
              {searchingAddress && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.primary }} />
              )}

              {/* Sugerencias de dirección */}
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div
                  className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                  style={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectAddress(suggestion)}
                      className="w-full px-4 py-3 text-left text-sm hover:opacity-80 transition-colors flex items-start gap-2"
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'transparent' : theme.backgroundSecondary,
                        color: theme.text,
                      }}
                    >
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                      <span className="line-clamp-2">{suggestion.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Teléfono de contacto */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Teléfono de contacto
            </label>
            <input
              type="text"
              value={values.telefono_contacto || ''}
              onChange={(e) => handleChange('telefono_contacto', e.target.value)}
              placeholder="Ej: 0800-123-4567"
              className="w-full rounded-lg px-4 py-3 text-sm transition-all duration-200 focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                border: `1px solid ${modified.telefono_contacto ? '#f59e0b' : theme.border}`,
              }}
            />
          </div>

          {/* Coordenadas (solo lectura, se actualizan al seleccionar dirección) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Latitud
              </label>
              <input
                type="text"
                value={values.latitud_municipio || ''}
                readOnly
                className="w-full rounded-lg px-4 py-2 text-sm opacity-60"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Longitud
              </label>
              <input
                type="text"
                value={values.longitud_municipio || ''}
                readOnly
                className="w-full rounded-lg px-4 py-2 text-sm opacity-60"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
          </div>

          {/* Botón guardar */}
          <div className="pt-2">
            <button
              onClick={handleSaveMunicipio}
              disabled={saving === 'municipio' || !hasMunicipioChanges}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background: hasMunicipioChanges
                  ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
                  : theme.backgroundSecondary,
                color: hasMunicipioChanges ? '#ffffff' : theme.textSecondary,
              }}
            >
              <Save className="h-4 w-4" />
              {saving === 'municipio' ? 'Guardando...' : 'Guardar datos del municipio'}
            </button>
          </div>
        </div>
      </div>

      {/* Sección Branding y Personalización */}
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Palette className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>
              Branding y Personalización
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Logo y colores del municipio
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Logo del Municipio */}
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: theme.text }}>
              Logo del Municipio
            </label>
            <div className="flex items-start gap-4">
              {/* Preview del logo */}
              <div
                className="w-24 h-24 rounded-xl flex items-center justify-center overflow-hidden"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `2px dashed ${theme.border}`,
                }}
              >
                {logoPreview || logoUrl ? (
                  <img
                    src={logoPreview || logoUrl}
                    alt="Logo municipio"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Image className="h-8 w-8" style={{ color: theme.textSecondary }} />
                )}
              </div>

              {/* Botones de upload */}
              <div className="flex-1 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-80"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Subir logo
                </button>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  PNG, JPG o SVG. Máximo 2MB.
                </p>
                {logoFile && (
                  <p className="text-xs" style={{ color: theme.primary }}>
                    Archivo seleccionado: {logoFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Colores del Municipio */}
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: theme.text }}>
              Colores Institucionales
            </label>

            {/* Color primario */}
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
                Color primario
              </p>
              <div className="flex flex-wrap gap-2">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      setColorPrimario(color.value);
                      setColorSecundario(generateSecondaryColor(color.value));
                    }}
                    className="w-8 h-8 rounded-lg transition-all duration-200 hover:scale-110"
                    style={{
                      backgroundColor: color.value,
                      boxShadow: colorPrimario === color.value
                        ? `0 0 0 2px ${theme.card}, 0 0 0 4px ${color.value}`
                        : 'none',
                    }}
                    title={color.name}
                  />
                ))}
                {/* Color personalizado */}
                <div className="relative">
                  <input
                    type="color"
                    value={colorPrimario}
                    onChange={(e) => {
                      setColorPrimario(e.target.value);
                      setColorSecundario(generateSecondaryColor(e.target.value));
                    }}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0"
                    style={{ backgroundColor: colorPrimario }}
                  />
                </div>
              </div>
            </div>

            {/* Preview de colores */}
            <div
              className="p-3 rounded-lg flex items-center gap-3"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${colorPrimario} 0%, ${colorSecundario} 100%)` }}
              >
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  Vista previa
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: colorPrimario }}
                  />
                  <span className="text-xs" style={{ color: theme.textSecondary }}>
                    {colorPrimario}
                  </span>
                  <span
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: colorSecundario }}
                  />
                  <span className="text-xs" style={{ color: theme.textSecondary }}>
                    {colorSecundario}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Botón guardar branding */}
        <div className="pt-4 mt-4 border-t" style={{ borderColor: theme.border }}>
          <button
            onClick={handleSaveBranding}
            disabled={brandingLoading || !hasBrandingChanges}
            className="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{
              background: hasBrandingChanges
                ? `linear-gradient(135deg, ${colorPrimario} 0%, ${colorSecundario} 100%)`
                : theme.backgroundSecondary,
              color: hasBrandingChanges ? '#ffffff' : theme.textSecondary,
            }}
          >
            {brandingLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {brandingLoading ? 'Guardando...' : 'Guardar branding'}
          </button>
        </div>
      </div>

      {/* Sección Imagen de Portada */}
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <ImageIcon className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>
              Imagen de Portada
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Banner del dashboard (separado del logo)
            </p>
          </div>
        </div>

        {/* Preview de la imagen actual */}
        <div className="mb-4">
          <div
            className="relative w-full h-40 rounded-xl overflow-hidden"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `2px dashed ${theme.border}`,
            }}
          >
            {portadaPreview || imagenPortadaUrl ? (
              <>
                <img
                  src={portadaPreview || imagenPortadaUrl}
                  alt="Imagen de portada"
                  className="w-full h-full object-cover"
                />
                {/* Overlay con gradiente similar al dashboard */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${colorPrimario}cc 0%, ${colorSecundario}99 100%)`,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-white text-sm font-medium">Vista previa del banner</p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <ImageIcon className="h-10 w-10" style={{ color: theme.textSecondary }} />
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Sin imagen de portada
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-3">
          <input
            ref={portadaInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePortadaSelect}
            className="hidden"
          />
          <button
            onClick={() => portadaInputRef.current?.click()}
            disabled={portadaLoading}
            className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-80"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          >
            <Upload className="h-4 w-4" />
            Seleccionar imagen
          </button>

          {portadaFile && (
            <button
              onClick={handleSavePortada}
              disabled={portadaLoading}
              className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200"
              style={{
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                color: '#ffffff',
              }}
            >
              {portadaLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          )}

          {imagenPortadaUrl && !portadaFile && (
            <button
              onClick={handleDeletePortada}
              disabled={portadaLoading}
              className="py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-80"
              style={{
                backgroundColor: '#ef444420',
                color: '#ef4444',
                border: '1px solid #ef444440',
              }}
            >
              {portadaLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Eliminar
            </button>
          )}
        </div>

        {portadaFile && (
          <p className="text-xs mt-2" style={{ color: theme.primary }}>
            Archivo seleccionado: {portadaFile.name}
          </p>
        )}

        <p className="text-xs mt-3" style={{ color: theme.textSecondary }}>
          PNG, JPG o WebP. Máximo 5MB. Tamaño recomendado: 1920x600 píxeles.
        </p>
      </div>

      {/* Tabla de otras configuraciones */}
      {otherConfigs.length > 0 && (
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="px-5 py-3" style={{ backgroundColor: theme.backgroundSecondary }}>
          <h3 className="text-sm font-semibold" style={{ color: theme.text }}>Otras configuraciones</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                Parámetro
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                Valor
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider w-32" style={{ color: theme.textSecondary }}>
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: theme.border }}>
            {otherConfigs.map((config, index) => (
              <tr
                key={config.clave}
                className="transition-colors duration-200"
                style={{
                  backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}30`,
                }}
              >
                {/* Parámetro */}
                <td className="px-5 py-4">
                  <div>
                    <p className="font-medium text-sm" style={{ color: theme.text }}>
                      {config.clave}
                    </p>
                    {config.descripcion && (
                      <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                        {config.descripcion}
                      </p>
                    )}
                  </div>
                </td>

                {/* Valor */}
                <td className="px-5 py-4">
                  {config.tipo === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => config.editable && handleChange(config.clave, 'true')}
                        disabled={!config.editable}
                        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-50"
                        style={{
                          backgroundColor: values[config.clave] === 'true' ? '#22c55e' : theme.backgroundSecondary,
                          color: values[config.clave] === 'true' ? 'white' : theme.textSecondary,
                          border: `1px solid ${values[config.clave] === 'true' ? '#22c55e' : theme.border}`,
                        }}
                      >
                        <Check className="h-3 w-3 inline mr-1" />
                        Sí
                      </button>
                      <button
                        onClick={() => config.editable && handleChange(config.clave, 'false')}
                        disabled={!config.editable}
                        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-50"
                        style={{
                          backgroundColor: values[config.clave] === 'false' ? '#ef4444' : theme.backgroundSecondary,
                          color: values[config.clave] === 'false' ? 'white' : theme.textSecondary,
                          border: `1px solid ${values[config.clave] === 'false' ? '#ef4444' : theme.border}`,
                        }}
                      >
                        <X className="h-3 w-3 inline mr-1" />
                        No
                      </button>
                    </div>
                  ) : (
                    <input
                      type={config.tipo === 'number' ? 'number' : 'text'}
                      value={values[config.clave]}
                      onChange={(e) => handleChange(config.clave, e.target.value)}
                      disabled={!config.editable}
                      className="w-full max-w-sm rounded-lg px-3 py-2 text-sm transition-all duration-200 focus:ring-2 focus:outline-none disabled:opacity-50"
                      style={{
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        border: `1px solid ${modified[config.clave] ? '#f59e0b' : theme.border}`,
                      }}
                    />
                  )}
                </td>

                {/* Acción */}
                <td className="px-5 py-4 text-right">
                  {config.editable && (
                    <button
                      onClick={() => handleSave(config.clave)}
                      disabled={saving === config.clave || !modified[config.clave]}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-40"
                      style={{
                        background: modified[config.clave]
                          ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
                          : theme.backgroundSecondary,
                        color: modified[config.clave] ? '#ffffff' : theme.textSecondary,
                      }}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {saving === config.clave ? '...' : 'Guardar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
