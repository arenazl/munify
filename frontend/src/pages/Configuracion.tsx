import { useEffect, useMemo, useState, useRef, useCallback, lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import {
  Save, Sparkles, Check, X, MapPin, Loader2, Building2, Upload,
  Palette, ImageIcon, Trash2, SlidersHorizontal, Wallet, ChevronRight,
  Bell, MessageCircle, Users, Wrench, FolderTree, FileText, LayoutDashboard,
  UsersRound, CalendarOff, Landmark, Link2, Activity, FileDown, Tag,
  Briefcase, PiggyBank, Trees, Boxes, MapPinned, Package,
  Banknote, Clock,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { configuracionApi, municipiosApi, modulosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { buildThemeColors } from '../config/themePresets';
import { useAuth } from '../contexts/AuthContext';
import { SettingsShell } from '../components/abmv2/SettingsShell';
import { EmbedProvider } from '../components/abmv2/EmbedContext';
import { QRCarteleria } from '../components/ui/QRCarteleria';
import { AppearanceSettings } from '../components/ui/AppearanceSettings';
import { ModulosToggle } from '../components/tesoreria/ModulosToggle';
import NotificationPreferences from '../components/NotificationPreferences';
import { BRAND } from '../brands';

// Tipos del dashboard de tarjetas (fusion de Ajustes.tsx)
interface SettingCard {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  link: string;
  show: boolean;
}
interface SettingSection {
  id: string;
  title: string;
  items: SettingCard[];
}

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


/* ============================================================
 * Pantallas embebidas en el panel de Configuración.
 *
 * NO se reimplementa ningún ABM: se monta la MISMA página que ya existe en su
 * ruta, con sus datos y sus endpoints reales. Lazy para no engordar el bundle
 * de Configuración con pantallas que quizá no se abran.
 *
 * Un ajuste sin entrada acá cae a la ficha con acceso — así se puede ir
 * enchufando de a una sin romper las demás.
 * ============================================================ */
const PANTALLA_DE_AJUSTE: Record<string, LazyExoticComponent<ComponentType>> = {
  // Personal
  empleados: lazy(() => import('./Empleados')),
  cuadrillas: lazy(() => import('./GestionCuadrillas')),
  ausencias: lazy(() => import('./GestionAusencias')),
  // Atención al vecino
  vecinos: lazy(() => import('./Usuarios')),
  'categorias-reclamo': lazy(() => import('./CategoriasReclamoConfig')),
  'tramites-config': lazy(() => import('./TramitesConfig')),
  sla: lazy(() => import('./SLA')),
  'poi-tipos': lazy(() => import('./POITiposConfig')),
  // Catálogos
  dependencias: lazy(() => import('./DependenciasConfig')),
  'asignacion-dependencias': lazy(() => import('./AsignacionDependencias')),
  zonas: lazy(() => import('./Zonas')),
  'categorias-tramite': lazy(() => import('./CategoriasTramiteConfig')),
  // Inventario
  inventario: lazy(() => import('./Inventario')),
  'categorias-inventario': lazy(() => import('./InventarioCategoriasConfig')),
  // Tesorería (las que tienen pantalla propia; las de `?tab=` viven en
  // ConfiguracionTesoreria y siguen abriéndose por su acceso)
  'tesoreria-contactos': lazy(() => import('./TesoreriaContactos')),
  'tesoreria-saldos': lazy(() => import('./TesoreriaCajas')),
  'tesoreria-tarjetas': lazy(() => import('./TarjetasCredito')),
  // Integraciones
  'whatsapp-config': lazy(() => import('./WhatsAppConfig')),
  'proveedores-pago': lazy(() => import('./ProveedoresPago')),
  // Super Admin
  municipios: lazy(() => import('./Municipios')),
  'dashboard-config': lazy(() => import('./ConfigDashboard')),
  exportar: lazy(() => import('./Exportar')),
};

export default function Configuracion() {
  const {
    theme,
    currentPresetId,
    setPreset,
    currentAccentId,
    setAccent,
    currentSidebarMode,
    setSidebarMode,
    presets,
    accents: acentosDisponibles,
    sidebarOptions,
  } = useTheme();
  const { municipioActual, loadMunicipios, user } = useAuth();
  // Tabs: General (datos muni + branding) / Usuarios / Catalogos / Cobranzas / Tesoreria / Super Admin
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('configuracion_active_tab') || 'general';
    }
    return 'general';
  });
  const setTab = (t: string) => {
    setActiveTab(t);
    try { localStorage.setItem('configuracion_active_tab', t); } catch {}
  };
  // Ajuste elegido dentro del grupo (riel del SettingsShell). null = el primero.
  const [activeItem, setActiveItem] = useState<string | null>(null);
  // Buscador de ajustes: filtra por label y descripción, cruzando todos los grupos.
  const [buscaAjuste, setBuscaAjuste] = useState('');
  // Cada pantalla embebida publica cuántas filas tiene; el riel las muestra.
  // Se van llenando a medida que se visitan — no se piden N endpoints al abrir.
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const reportarTotal = useCallback((slotId: string, total: number) => {
    setConteos(prev => (prev[slotId] === total ? prev : { ...prev, [slotId]: total }));
  }, []);
  const navigate = useNavigate();
  const isAdmin = user?.rol === 'admin';
  const isSupervisor = user?.rol === 'supervisor';
  const isAdminOrSupervisor = isAdmin || isSupervisor;
  const isSuperAdmin = isAdmin && !user?.municipio_id;
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [modified, setModified] = useState<Record<string, boolean>>({});
  const [, setMunicipios] = useState<Municipio[]>([]);
  const [, setConfigMunicipioScope] = useState<Record<string, number | null>>({});
  // Modulos activos del municipio (feature flags) para gatear tiles opt-in (ej: POI).
  const [modulosActivos, setModulosActivos] = useState<string[]>([]);

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
  const [portadaSinFiltro, setPortadaSinFiltro] = useState(municipioActual?.tema_config?.portadaSinFiltro || false);
  const [portadaOpacity, setPortadaOpacity] = useState(municipioActual?.tema_config?.portadaOpacity ?? 1);
  const [cabeceraOpacity, setCabeceraOpacity] = useState(municipioActual?.tema_config?.cabeceraOpacity ?? 0.4);
  const [cabeceraBlur, setCabeceraBlur] = useState(municipioActual?.tema_config?.cabeceraBlur ?? 4);

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
    modulosApi.list()
      .then((r) => {
        const rows = (r.data || []) as Array<{ modulo: string; activo: boolean }>;
        setModulosActivos(rows.filter(m => m.activo).map(m => m.modulo));
      })
      .catch(() => setModulosActivos([]));
  }, []);

  // Actualizar estados de branding cuando cambia el municipio
  useEffect(() => {
    if (municipioActual) {
      setColorPrimario(municipioActual.color_primario || '#3b82f6');
      setColorSecundario(municipioActual.color_secundario || '#1e40af');
      setLogoUrl(municipioActual.logo_url || '');
      setImagenPortadaUrl(municipioActual.imagen_portada || '');
      setPortadaSinFiltro(municipioActual.tema_config?.portadaSinFiltro || false);
      setPortadaOpacity(municipioActual.tema_config?.portadaOpacity ?? 1);
      setCabeceraOpacity(municipioActual.tema_config?.cabeceraOpacity ?? 0.4);
      setCabeceraBlur(municipioActual.tema_config?.cabeceraBlur ?? 4);
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
        // Primero limpiar el archivo seleccionado
        setPortadaFile(null);
        setPortadaPreview(null);

        // Actualizar URL inmediatamente desde la respuesta
        const nuevaUrl = response.data.imagen_portada;
        if (nuevaUrl) {
          setImagenPortadaUrl(nuevaUrl);
        }

        // Recargar municipios para sincronizar todo el estado
        await loadMunicipios();

        toast.success('Imagen de portada actualizada');
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

  // Guardar configuración de portada (filtro + opacidad)
  const handleSavePortadaConfig = async () => {
    if (!municipioActual) return;

    setPortadaLoading(true);
    try {
      const currentConfig = municipioActual.tema_config || {};
      await municipiosApi.updateTema(municipioActual.id, {
        ...currentConfig,
        portadaSinFiltro: portadaSinFiltro,
        portadaOpacity: portadaOpacity,
      });
      await loadMunicipios();
      toast.success('Configuración de portada guardada');
    } catch (error) {
      console.error('Error guardando configuración de portada:', error);
      toast.error('Error al guardar');
    } finally {
      setPortadaLoading(false);
    }
  };

  // Verificar si hay cambios en la configuración de portada
  const hasPortadaConfigChanges =
    portadaSinFiltro !== (municipioActual?.tema_config?.portadaSinFiltro || false) ||
    portadaOpacity !== (municipioActual?.tema_config?.portadaOpacity ?? 1);

  // Verificar si hay cambios en la configuración de cabecera
  const hasCabeceraConfigChanges =
    cabeceraOpacity !== (municipioActual?.tema_config?.cabeceraOpacity ?? 0.4) ||
    cabeceraBlur !== (municipioActual?.tema_config?.cabeceraBlur ?? 4);

  // Guardar configuración de cabecera
  const handleSaveCabeceraConfig = async () => {
    if (!municipioActual) return;

    setPortadaLoading(true);
    try {
      const currentConfig = municipioActual.tema_config || {};
      await municipiosApi.updateTema(municipioActual.id, {
        ...currentConfig,
        cabeceraOpacity: cabeceraOpacity,
        cabeceraBlur: cabeceraBlur,
      });
      await loadMunicipios();
      toast.success('Configuración de cabecera guardada');
    } catch (error) {
      console.error('Error guardando configuración de cabecera:', error);
      toast.error('Error al guardar');
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

  // Apariencia: cada muestra se DERIVA con el mismo motor que pinta la app, con
  // los otros dos ejes en su valor actual — el preview ES lo que se va a ver.
  const bgPresetsMeta = useMemo(
    () =>
      presets.map(t => {
        const c = buildThemeColors(t.id, currentAccentId, currentSidebarMode);
        return { key: t.id, label: t.name, swatch: c.background, chip: c.sidebar };
      }),
    [presets, currentAccentId, currentSidebarMode],
  );
  const accentsMeta = useMemo(
    () =>
      acentosDisponibles.map(a => {
        // El acento "Neutro" no tiene color propio: se resuelve por el modo del
        // tema activo (blanco sobre oscuro, negro sobre claro).
        const c = buildThemeColors(currentPresetId, a.id, currentSidebarMode);
        return { key: a.id, label: a.name, color: c.primary, ink: c.primaryText };
      }),
    [acentosDisponibles, currentPresetId, currentSidebarMode],
  );
  const sidebarMeta = useMemo(
    () =>
      sidebarOptions.map(o => {
        const c = buildThemeColors(currentPresetId, currentAccentId, o.id);
        return { key: o.id, label: o.name, swatch: c.background, chip: c.sidebar };
      }),
    [sidebarOptions, currentPresetId, currentAccentId],
  );

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

  // Tabs visibles segun rol — fusion de Ajustes.tsx + Configuracion.tsx

  // Tarjetas por tab (replica el patron del dashboard de Ajustes)
  const cardSections: SettingSection[] = [
    {
      id: 'usuarios',
      title: 'Usuarios y Empleados',
      items: [
        { id: 'vecinos', label: 'Vecinos', description: 'Padrón de vecinos del municipio', icon: Users, color: '#3b82f6', link: '/gestion/usuarios', show: isAdminOrSupervisor },
        { id: 'empleados', label: 'Empleados', description: 'Administradores, supervisores y empleados', icon: Wrench, color: '#f59e0b', link: '/gestion/empleados', show: isAdminOrSupervisor },
        { id: 'cuadrillas', label: 'Cuadrillas', description: 'Grupos de trabajo y asignaciones', icon: UsersRound, color: '#10b981', link: '/gestion/cuadrillas', show: isAdminOrSupervisor },
        { id: 'ausencias', label: 'Ausencias', description: 'Vacaciones, licencias y permisos', icon: CalendarOff, color: '#ef4444', link: '/gestion/ausencias', show: isAdminOrSupervisor },
      ],
    },
    {
      id: 'catalogos',
      title: 'Catálogos',
      items: [
        { id: 'exportar', label: 'Exportar Reclamos', description: 'Descargá informes CSV de reclamos, trámites y métricas de SLA', icon: FileDown, color: '#10b981', link: '/gestion/exportar', show: isAdminOrSupervisor },
        { id: 'municipios', label: 'Municipios', description: 'Alta, baja y modificación de municipios', icon: Landmark, color: '#ec4899', link: '/gestion/municipios', show: isSuperAdmin },
        { id: 'dependencias', label: 'Dependencias', description: 'Secretarías y direcciones que gestionan reclamos y trámites', icon: Building2, color: '#3b82f6', link: '/gestion/dependencias', show: isAdminOrSupervisor },
        { id: 'asignacion-dependencias', label: 'Asignación', description: 'Asignar categorías y tipos de trámite a dependencias', icon: Link2, color: '#f59e0b', link: '/gestion/asignacion-dependencias', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'categorias-reclamo', label: 'Categorías Reclamo', description: 'Tipos de reclamos del municipio: alumbrado, bacheo, etc', icon: FolderTree, color: '#8b5cf6', link: '/gestion/categorias-reclamo', show: isAdminOrSupervisor },
        { id: 'categorias-tramite', label: 'Categorías Trámite', description: 'Categorías de trámites del municipio: Obras, Comercio, etc', icon: FolderTree, color: '#10b981', link: '/gestion/categorias-tramite', show: isAdminOrSupervisor },
        { id: 'inventario', label: 'Inventario', description: 'Vehículos, herramientas y materiales del municipio', icon: Package, color: '#0ea5e9', link: '/gestion/inventario', show: isAdminOrSupervisor && modulosActivos.includes('inventario') },
        { id: 'categorias-inventario', label: 'Categorías Inventario', description: 'Rubros del inventario: vehículos, herramientas, materiales', icon: Boxes, color: '#3b82f6', link: '/gestion/categorias-inventario', show: isAdminOrSupervisor },
        { id: 'sla', label: 'SLA', description: 'Plazos de respuesta y resolución comprometidos por categoría', icon: Clock, color: '#f59e0b', link: '/gestion/sla', show: isAdminOrSupervisor && modulosActivos.includes('sla') },
        { id: 'poi-tipos', label: 'Tipos de Punto de Interés', description: 'Categorías de puntos en el mapa: hospitales, escuelas, plazas, etc', icon: MapPinned, color: '#ef4444', link: '/gestion/poi-tipos', show: isAdminOrSupervisor && modulosActivos.includes('poi') },
        { id: 'tramites-config', label: 'Tipos de Trámite', description: 'Trámites específicos del municipio (ej: Licencia de Conducir)', icon: FileText, color: '#6366f1', link: '/gestion/tramites-config', show: isAdminOrSupervisor },
        { id: 'zonas', label: 'Zonas', description: 'Barrios y áreas del municipio', icon: MapPin, color: '#06b6d4', link: '/gestion/zonas', show: isAdminOrSupervisor },
        { id: 'importar-padron', label: 'Catálogo de Tasas', description: `Importá el padrón tributario y mapealo al catálogo ${BRAND.name}`, icon: Landmark, color: '#0ea5e9', link: '/gestion/configuracion/importar-padron', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'dashboard-config', label: 'Dashboards', description: 'Personalizá los dashboards por rol', icon: LayoutDashboard, color: '#8b5cf6', link: '/gestion/config-dashboard', show: isAdminOrSupervisor },
      ],
    },
    {
      id: 'cobranzas',
      title: 'Cobranzas',
      items: [
        { id: 'proveedores-pago', label: 'Proveedores de Pago', description: 'Activá GIRE, MercadoPago o MODO e importá el padrón de contribuyentes', icon: Wallet, color: '#0066cc', link: '/gestion/proveedores-pago', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tramites-pago', label: 'Método de cobro por trámite', description: 'Asigná Botón de Pago, Rapipago o Adhesión Débito a cada trámite con costo', icon: FileText, color: '#10b981', link: '/gestion/tramites-config', show: isAdminOrSupervisor && !isSuperAdmin },
      ],
    },
    {
      id: 'tesoreria',
      title: 'Tesorería',
      items: [
        { id: 'tesoreria-conceptos', label: 'Conceptos de gasto', description: 'Lista plana de conceptos disponibles al cargar un gasto', icon: FileText, color: '#3b82f6', link: '/gestion/configuracion/tesoreria?tab=conceptos', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-tipos-empleado', label: 'Tipos de empleado', description: 'Sub-clasificación de empleados: albañil, MMO, arquitecto, jornalizado, etc', icon: UsersRound, color: '#06b6d4', link: '/gestion/configuracion/tesoreria?tab=tipos-empleado', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-cajas', label: 'Cajas / Fondos', description: 'Alta de cajas con su saldo inicial y recargas: FOFINDE, FODEMEP, FOMEP', icon: PiggyBank, color: '#f59e0b', link: '/gestion/configuracion/tesoreria?tab=cajas', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-saldos', label: 'Cajas y Saldos', description: 'Saldo actual de cada caja con sus ingresos y egresos acumulados', icon: Wallet, color: '#f59e0b', link: '/gestion/tesoreria/cajas', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-contactos', label: 'Contactos', description: 'Padrón de personas y proveedores de tesorería', icon: Users, color: '#3b82f6', link: '/gestion/tesoreria/contactos', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-parajes', label: 'Parajes', description: 'Regiones del muni con polígono en el mapa', icon: Trees, color: '#10b981', link: '/gestion/configuracion/tesoreria?tab=parajes', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-proyectos', label: 'Proyectos', description: 'Obras e iniciativas que agrupan gastos (con presupuesto y % imputado)', icon: Briefcase, color: '#10b981', link: '/gestion/configuracion/tesoreria?tab=proyectos', show: isAdminOrSupervisor && !isSuperAdmin },
        { id: 'tesoreria-tarjetas', label: 'Tarjetas', description: 'Tarjetas de crédito con las que se pagan gastos', icon: Banknote, color: '#8b5cf6', link: '/gestion/tarjetas', show: isAdminOrSupervisor && !isSuperAdmin },
      ],
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      items: [
        { id: 'whatsapp-config', label: 'Configuración WhatsApp', description: 'Integración con WhatsApp Business', icon: MessageCircle, color: '#25D366', link: '/gestion/whatsapp', show: isAdminOrSupervisor },
      ],
    },
    {
      id: 'super-admin',
      title: 'Super Admin',
      items: [
        { id: 'audit-logs', label: 'Consola de auditoría', description: 'Logs cross-municipio con filtros por endpoint, latencia y status', icon: Activity, color: '#8b5cf6', link: '/gestion/admin/audit-logs', show: isSuperAdmin },
        { id: 'suscripciones', label: 'Suscripciones', description: 'Municipios suscriptos, plan, estado y próxima fecha de facturación', icon: Building2, color: '#22c55e', link: '/gestion/admin/suscripciones', show: isSuperAdmin },
        { id: 'sidebar-config', label: 'Config sidebar', description: 'Configurar qué items del menú ve cada municipio', icon: SlidersHorizontal, color: '#06b6d4', link: '/gestion/sidebar-config', show: isSuperAdmin },
        { id: 'configuracion-ia', label: 'Configuración de IA', description: 'Activar/desactivar la IA y elegir el modelo de Gemini por municipio', icon: Sparkles, color: '#a855f7', link: '/gestion/configuracion-ia', show: isSuperAdmin },
      ],
    },
  ];


  // ── Reagrupación por FK real (handoff 2026-08-02) ────────────────────────
  // El tab "Catálogos" era un cajón de 15 tarjetas donde convivían un
  // exportador de CSV, un ABM de super admin y un configurador de UI. Los
  // grupos salen del grafo de foreign keys, no del parecido semántico:
  // `categorias_reclamo` es un hub (SLA, escalado, cuadrillas, empleados) y
  // `zonas` es criterio de asignación, no geografía.
  const GRUPO_DE_ITEM: Record<string, string> = {
    empleados: 'personal', cuadrillas: 'personal', ausencias: 'personal',
    'tesoreria-tipos-empleado': 'personal',
    vecinos: 'vecino', 'categorias-reclamo': 'vecino', 'tramites-config': 'vecino',
    sla: 'vecino', 'poi-tipos': 'vecino',
    dependencias: 'catalogos', 'asignacion-dependencias': 'catalogos', zonas: 'catalogos',
    'categorias-tramite': 'catalogos', 'importar-padron': 'catalogos',
    inventario: 'inventario', 'categorias-inventario': 'inventario',
    'whatsapp-config': 'integraciones', 'proveedores-pago': 'integraciones',
    'tramites-pago': 'integraciones',
    municipios: 'super-admin', 'dashboard-config': 'super-admin', exportar: 'super-admin',
  };
  // El grupo General no sale de `cardSections`: son las pantallas propias de
  // esta página. Cada una es un ítem del riel, como en el canvas.
  const AJUSTES_GENERAL = [
    { id: 'identidad', label: 'Identidad', description: 'Nombre, ubicación y el contacto que ve el vecino.' },
    { id: 'portada', label: 'Portada del tablero', description: 'La imagen de fondo del tablero y el filtro de su cabecera.' },
    { id: 'apariencia', label: 'Apariencia', description: 'Tema del panel, color de acento y fondo de la barra lateral. Se guarda por dispositivo y usuario.' },
    { id: 'carteleria', label: 'Cartelería', description: 'El QR para imprimir y pegar en el municipio.' },
    ...(otherConfigs.length > 0 ? [{ id: 'avanzado', label: 'Avanzado', description: 'Otras claves de configuración del sistema.' }] : []),
    ...(isSuperAdmin ? [{ id: 'modulos', label: 'Módulos', description: 'Qué módulos tiene activos este municipio.' }] : []),
  ];

  const GRUPOS: { id: string; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'personal', label: 'Personal' },
    { id: 'vecino', label: 'Atención al vecino' },
    { id: 'catalogos', label: 'Catálogos' },
    { id: 'inventario', label: 'Inventario' },
    { id: 'tesoreria', label: 'Tesorería' },
    { id: 'integraciones', label: 'Integraciones' },
    { id: 'super-admin', label: 'Super Admin' },
  ];

  // Aplana las tarjetas y les asigna grupo. Sin entrada en el mapa, cae al id
  // de su sección de origen (así una tarjeta nueva nunca desaparece).
  const todosLosAjustes = cardSections
    .flatMap(s => s.items.map(i => ({ ...i, grupo: GRUPO_DE_ITEM[i.id] ?? s.id })))
    .filter(i => i.show);

  const q = buscaAjuste.trim().toLowerCase();
  const ajustesFiltrados = q
    ? todosLosAjustes.filter(i =>
        i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    : todosLosAjustes;

  const gruposVisibles = GRUPOS
    .map(g => ({
      ...g,
      count: g.id === 'general' ? undefined : ajustesFiltrados.filter(i => i.grupo === g.id).length,
    }))
    .filter(g => g.id === 'general' || (g.count ?? 0) > 0);

  const ajustesDelGrupo = ajustesFiltrados.filter(i => i.grupo === activeTab);
  const ajusteActivo = ajustesDelGrupo.find(i => i.id === activeItem) ?? ajustesDelGrupo[0];
  const grupoActivo = gruposVisibles.find(g => g.id === activeTab);
  const itemGeneral = AJUSTES_GENERAL.find(i => i.id === activeItem) ?? AJUSTES_GENERAL[0];

  return (
    <SettingsShell
      eyebrow={`CONFIGURACIÓN · ${(BRAND.name || 'MUNICIPIO').toUpperCase()}`}
      title="Cómo está armado el municipio"
      description="Las listas y las reglas que usa toda la app: quién atiende cada cosa, en cuántos días y qué le pide al vecino."
      search={buscaAjuste}
      onSearchChange={setBuscaAjuste}
      groups={gruposVisibles}
      activeGroup={activeTab}
      onGroupChange={(id) => { setTab(id); setActiveItem(null); }}
      railTitle={grupoActivo?.label}
      items={activeTab === 'general'
        ? AJUSTES_GENERAL.map(i => ({ id: i.id, label: i.label }))
        : ajustesDelGrupo.map(i => ({ id: i.id, label: i.label, count: conteos[i.id] }))}
      activeItem={activeTab === 'general' ? itemGeneral.id : ajusteActivo?.id}
      onItemChange={setActiveItem}
      panelTitle={activeTab === 'general' ? itemGeneral.label : (ajusteActivo?.label ?? grupoActivo?.label ?? '')}
      panelNota={activeTab === 'general' ? itemGeneral.description : ajusteActivo?.description}
      primaryAction={activeTab !== 'general' && ajusteActivo
        ? { label: 'Abrir', onClick: () => navigate(ajusteActivo.link) }
        : undefined}
    >
      {/* GENERAL — Datos del Municipio + Filtros + Branding + Apariencia */}
      {activeTab === 'general' && (
        <div className="space-y-6">
      {/* Modulos activables — solo super admin */}
      {itemGeneral.id === 'modulos' && isSuperAdmin && <ModulosToggle />}

      {/* QR fijo de cartelería: acceso directo al muni (/{codigo}) */}
      {itemGeneral.id === 'carteleria' && <QRCarteleria />}

      {/* Sección Datos del Municipio */}
      {itemGeneral.id === 'identidad' && (
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
      )}

      {/* Sección Filtro de Cabecera */}
      {itemGeneral.id === 'portada' && (
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
            <SlidersHorizontal className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>
              Filtro de Cabecera
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Controla la apariencia de la barra superior
            </p>
          </div>
        </div>

        {/* Info del color del filtro (usa color de paleta) */}
        <div
          className="mb-4 p-3 rounded-lg"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: theme.text }}>
                Color del filtro
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                El filtro usa el color de la paleta del municipio
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg border-2"
                style={{
                  backgroundColor: theme.primary,
                  borderColor: theme.border,
                }}
              />
              <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>
                {theme.primary}
              </span>
            </div>
          </div>
        </div>

        {/* Slider de blur de imagen */}
        <div
          className="mb-4 p-3 rounded-lg"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>
                Blur de la imagen
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Desenfoque aplicado a la imagen de fondo
              </p>
            </div>
            <span className="text-sm font-mono" style={{ color: theme.primary }}>
              {cabeceraBlur}px
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={cabeceraBlur}
            onChange={(e) => setCabeceraBlur(parseInt(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${(cabeceraBlur / 20) * 100}%, ${theme.border} ${(cabeceraBlur / 20) * 100}%, ${theme.border} 100%)`,
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: theme.textSecondary }}>Sin blur</span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>Máximo</span>
          </div>
        </div>

        {/* Slider de opacidad del filtro */}
        <div
          className="mb-4 p-3 rounded-lg"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>
                Opacidad del filtro
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Intensidad del filtro de color sobre la imagen
              </p>
            </div>
            <span className="text-sm font-mono" style={{ color: theme.primary }}>
              {Math.round(cabeceraOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={cabeceraOpacity}
            onChange={(e) => setCabeceraOpacity(parseFloat(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${cabeceraOpacity * 100}%, ${theme.border} ${cabeceraOpacity * 100}%, ${theme.border} 100%)`,
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: theme.textSecondary }}>Sin filtro</span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>Máximo</span>
          </div>
        </div>

        {/* Botón guardar */}
        {hasCabeceraConfigChanges && (
          <button
            onClick={handleSaveCabeceraConfig}
            disabled={portadaLoading}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
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
            Guardar configuración
          </button>
        )}
      </div>
      )}

      {/* Sección Imagen de Portada */}
      {itemGeneral.id === 'portada' && (
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
                  style={{ opacity: portadaOpacity }}
                />
                {/* Overlay con gradiente similar al dashboard - solo si NO está sin filtro */}
                {!portadaSinFiltro && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${colorPrimario}cc 0%, ${colorSecundario}99 100%)`,
                    }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className={`text-sm font-medium ${portadaSinFiltro ? '' : 'text-white'}`} style={{ color: portadaSinFiltro ? theme.text : undefined, textShadow: portadaSinFiltro ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}>
                    Vista previa del banner {portadaSinFiltro ? '(sin filtro)' : '(con filtro)'} - {Math.round(portadaOpacity * 100)}%
                  </p>
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

        {/* Toggle para filtro de portada */}
        {(portadaPreview || imagenPortadaUrl) && (
          <div
            className="mb-4 p-3 rounded-lg flex items-center justify-between"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>
                Mostrar sin filtro de color
              </p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Desactiva el overlay de colores sobre la imagen
              </p>
            </div>
            <button
              onClick={() => setPortadaSinFiltro(!portadaSinFiltro)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: portadaSinFiltro ? theme.primary : theme.border,
              }}
            >
              <div
                className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                style={{
                  transform: portadaSinFiltro ? 'translateX(26px)' : 'translateX(4px)',
                }}
              />
            </button>
          </div>
        )}

        {/* Slider de opacidad de la portada */}
        {(portadaPreview || imagenPortadaUrl) && (
          <div
            className="mb-4 p-3 rounded-lg"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  Opacidad de la imagen
                </p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Ajusta qué tanto se ve la imagen sobre el fondo
                </p>
              </div>
              <span className="text-sm font-mono" style={{ color: theme.primary }}>
                {Math.round(portadaOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={portadaOpacity}
              onChange={(e) => setPortadaOpacity(parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${((portadaOpacity - 0.1) / 0.9) * 100}%, ${theme.border} ${((portadaOpacity - 0.1) / 0.9) * 100}%, ${theme.border} 100%)`,
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: theme.textSecondary }}>Sutil</span>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Completa</span>
            </div>
          </div>
        )}

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

        {/* Botón guardar configuración de portada (filtro + opacidad) */}
        {(imagenPortadaUrl || portadaPreview) && (
          <div className="pt-4 mt-4 border-t" style={{ borderColor: theme.border }}>
            <button
              onClick={handleSavePortadaConfig}
              disabled={portadaLoading || !hasPortadaConfigChanges}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background: hasPortadaConfigChanges
                  ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`
                  : theme.backgroundSecondary,
                color: hasPortadaConfigChanges ? '#ffffff' : theme.textSecondary,
              }}
            >
              {portadaLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {portadaLoading ? 'Guardando...' : 'Guardar portada'}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Tabla de otras configuraciones */}
      {itemGeneral.id === 'avanzado' && otherConfigs.length > 0 && (
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

      {/* Apariencia — 3 ejes del tema: fondo, acento y barra lateral */}
      {itemGeneral.id === 'apariencia' && (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Palette className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>
              Apariencia
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Cómo se ve el panel para vos
            </p>
          </div>
        </div>
        <AppearanceSettings
          bgPresets={bgPresetsMeta}
          accents={accentsMeta}
          activeBg={currentPresetId}
          activeAccent={currentAccentId}
          onBgChange={setPreset}
          onAccentChange={setAccent}
          sidebarOptions={sidebarMeta}
          activeSidebar={currentSidebarMode}
          onSidebarChange={key => setSidebarMode(key as typeof currentSidebarMode)}
          footnote="La apariencia se guarda en este dispositivo y para tu usuario: nadie más del municipio ve estos cambios. Lo que sí ven todos —la imagen de portada y el filtro de cabecera— se configura más arriba, en esta misma pestaña."
        />
      </div>
      )}
        </div>
      )}

      {/* Panel del ajuste elegido: la pantalla real embebida si está
          registrada; si no, su ficha con el acceso a la ruta. */}
      {activeTab !== 'general' && (
        ajusteActivo && PANTALLA_DE_AJUSTE[ajusteActivo.id] ? (
          <Suspense fallback={
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
            </div>
          }>
            {(() => {
              const Pantalla = PANTALLA_DE_AJUSTE[ajusteActivo.id];
              return (
                <EmbedProvider slotId={ajusteActivo.id} reportarTotal={reportarTotal}>
                  <Pantalla />
                </EmbedProvider>
              );
            })()}
          </Suspense>
        ) : ajusteActivo ? (
          <Link
            to={ajusteActivo.link}
            className="group flex items-start gap-4 rounded-xl p-5 transition-all hover:shadow-lg"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
              style={{ backgroundColor: `${ajusteActivo.color}20` }}
            >
              <ajusteActivo.icon className="h-6 w-6" style={{ color: ajusteActivo.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold" style={{ color: theme.text }}>{ajusteActivo.label}</h3>
                <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" style={{ color: theme.textSecondary }} />
              </div>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>{ajusteActivo.description}</p>
            </div>
          </Link>
        ) : (
          <p className="text-sm text-center py-8" style={{ color: theme.textSecondary }}>
            {buscaAjuste ? 'Ningún ajuste coincide con la búsqueda.' : 'No hay ajustes disponibles en esta sección.'}
          </p>
        )
      )}
    </SettingsShell>
  );
}
