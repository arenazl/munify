import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  MapPin,
  CheckCircle2,
  Loader2,
  Sparkles,
  FolderTree,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  User,
  UserCheck,
  History,
  Camera,
  X as XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { DynamicIcon } from '../ui/DynamicIcon';
import { DireccionAutocomplete } from '../ui/DireccionAutocomplete';
import {
  reclamosApi,
  categoriasReclamoApi,
  clasificacionApi,
  usersApi,
  type VecinoPorDni,
} from '../../lib/api';
import type { CategoriaReclamo } from '../../types';
import { useMostradorContext } from '../mostrador/BannerActuandoComo';

interface SugerenciaIA {
  categoria_id: number;
  categoria_nombre: string;
  confianza?: number;
  score?: number;
  metodo?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback con el reclamo creado al terminar el wizard. */
  onSuccess?: (reclamo: any) => void;
}

interface ReclamoForm {
  categoria_id: number | null;
  tipo_reclamo_id: number | null;
  titulo: string;
  descripcion: string;
  direccion: string;
  latitud: number | null;
  longitud: number | null;
  referencia: string;
  // Datos del solicitante (solo para cuando un empleado/admin carga el
  // reclamo en ventanilla a nombre de un vecino).
  nombre_solicitante: string;
  apellido_solicitante: string;
  dni_solicitante: string;
  email_solicitante: string;
  telefono_solicitante: string;
}

const EMPTY_FORM: ReclamoForm = {
  categoria_id: null,
  tipo_reclamo_id: null,
  titulo: '',
  descripcion: '',
  direccion: '',
  latitud: null,
  longitud: null,
  referencia: '',
  nombre_solicitante: '',
  apellido_solicitante: '',
  dni_solicitante: '',
  email_solicitante: '',
  telefono_solicitante: '',
};

const PRIORIDAD_LABELS: Record<number, string> = {
  1: 'Urgente',
  2: 'Alta',
  3: 'Normal',
  4: 'Baja',
  5: 'Muy baja',
};


/**
 * Wizard de creación de reclamo para vecino logueado.
 *
 * Espejo visual de `CrearSolicitudWizard` (trámites) — **mismo look & feel,
 * mismo WizardModal, mismo patrón de paso 1 con autocomplete + grid**.
 *
 * 4 pasos:
 *
 * 1. **Qué** — elegir tipo de reclamo (autocomplete + grid de categorías +
 *    al click mostrar tipos de esa categoría). Auto-avance al seleccionar.
 * 2. **Dónde** — dirección con `DireccionAutocomplete` + referencia opcional.
 * 3. **Qué pasó** — título (pre-rellenado desde el tipo) + descripción libre.
 * 4. **Confirmar** — resumen visual + botón "Crear reclamo".
 *
 * Asume que el vecino está logueado. Si no lo está, el caller debe redirigir
 * a login antes de abrir el wizard.
 */
export function CrearReclamoWizard({ open, onClose, onSuccess }: Props) {
  const { theme } = useTheme();
  const { municipioActual, user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const ctxMostrador = useMostradorContext();
  // Detectar si el wizard se abre desde el ABM de gestión (empleado/admin
  // cargando en ventanilla) o desde el portal del vecino. En el primer caso
  // hay que pedir los datos del solicitante; en el segundo, el current_user
  // ya es el solicitante.
  const isEmpleado = user && user.rol !== 'vecino';
  // KYC verificado por Didit (nivel 2): DNI/nombre/apellido son read-only
  // porque vienen validados del documento.
  const kycVerificado = user?.rol === 'vecino' && (user?.nivel_verificacion ?? 0) >= 2;

  const [categorias, setCategorias] = useState<CategoriaReclamo[]>([]);

  const [form, setForm] = useState<ReclamoForm>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState('');

  // Foto opcional del problema. Si el vecino adjunta una imagen, se sube a
  // Cloudinary despues de crear el reclamo (etapa='creacion').
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // ============ Estado de la clasificación con IA ============
  const [sugerencias, setSugerencias] = useState<SugerenciaIA[]>([]);
  const [clasificando, setClasificando] = useState(false);
  const [mostrarGridCategorias, setMostrarGridCategorias] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, SugerenciaIA[]>>(new Map());

  // ============ Búsqueda de vecino por DNI (solo modo empleado) ============
  // Mismo patrón que el wizard de trámites: cuando el empleado tipea el DNI,
  // consultamos el backend para ver si el vecino ya existe en el municipio.
  // Si existe, autocompletamos los demás campos y mostramos un banner con
  // sus reclamos previos.
  const [vecinoExistente, setVecinoExistente] = useState<VecinoPorDni | null>(null);
  const [buscandoVecino, setBuscandoVecino] = useState(false);
  const dniSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dniUltimoBuscado = useRef<string>('');

  // ============ Cargar datos al abrir ============

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      try {
        const catsRes = await categoriasReclamoApi.getAll(true);
        if (!cancelled) {
          setCategorias(catsRes.data || []);
        }
      } catch (err) {
        console.error('Error cargando datos del wizard', err);
        if (!cancelled) toast.error('Error cargando categorías de reclamo');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  // Reset al cerrar + precarga con datos del vecino logueado al abrir.
  // Si el vecino ya tiene datos (verificado por Didit o cargados en tramites
  // anteriores), el wizard arranca con todo precargado — no le repreguntamos
  // lo que ya sabemos.
  useEffect(() => {
    if (!open) {
      setStep(0);
      setForm(EMPTY_FORM);
      setSearchTerm('');
      setSugerencias([]);
      setMostrarGridCategorias(false);
      setVecinoExistente(null);
      setFotoFile(null);
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
      setFotoPreview(null);
      dniUltimoBuscado.current = '';
      cacheRef.current.clear();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dniSearchTimeoutRef.current) clearTimeout(dniSearchTimeoutRef.current);
      return;
    }
    // Modo Mostrador: el operador ya identificó al vecino — prellenar con
    // los datos del contexto, NO con los del current_user (que es el operador).
    if (ctxMostrador) {
      setForm(prev => ({
        ...prev,
        nombre_solicitante: prev.nombre_solicitante || ctxMostrador.nombre || '',
        apellido_solicitante: prev.apellido_solicitante || ctxMostrador.apellido || '',
        dni_solicitante: prev.dni_solicitante || ctxMostrador.dni || '',
        email_solicitante: prev.email_solicitante || ctxMostrador.email || '',
        telefono_solicitante: prev.telefono_solicitante || ctxMostrador.telefono || '',
      }));
      return;
    }
    if (user?.rol === 'vecino') {
      // Si el vecino esta verificado por Didit (nivel 2), pisamos los
      // datos filiatorios con los oficiales para evitar que esten stale.
      const kyc = (user.nivel_verificacion ?? 0) >= 2;
      setForm(prev => ({
        ...prev,
        nombre_solicitante: kyc ? (user.nombre || '') : (prev.nombre_solicitante || user.nombre || ''),
        apellido_solicitante: kyc ? (user.apellido || '') : (prev.apellido_solicitante || user.apellido || ''),
        dni_solicitante: kyc ? (user.dni || '') : (prev.dni_solicitante || user.dni || ''),
        email_solicitante: prev.email_solicitante || user.email || '',
        telefono_solicitante: prev.telefono_solicitante || user.telefono || '',
        direccion: prev.direccion || user.direccion || '',
      }));
    }
  }, [open, user, ctxMostrador]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dniSearchTimeoutRef.current) clearTimeout(dniSearchTimeoutRef.current);
    };
  }, []);

  // ============ Búsqueda de vecino por DNI (debounced) ============

  const buscarVecinoPorDni = async (dniRaw: string) => {
    const dniLimpio = dniRaw.replace(/\D/g, '');
    if (dniLimpio.length < 7) {
      setVecinoExistente(null);
      dniUltimoBuscado.current = '';
      return;
    }
    if (dniLimpio === dniUltimoBuscado.current) return;
    dniUltimoBuscado.current = dniLimpio;

    setBuscandoVecino(true);
    try {
      const res = await usersApi.buscarPorDni(dniLimpio);
      const vecino = res.data;
      if (vecino) {
        setVecinoExistente(vecino);
        setForm((prev) => ({
          ...prev,
          nombre_solicitante: prev.nombre_solicitante || vecino.nombre || '',
          apellido_solicitante: prev.apellido_solicitante || vecino.apellido || '',
          email_solicitante: prev.email_solicitante || vecino.email || '',
          telefono_solicitante: prev.telefono_solicitante || vecino.telefono || '',
        }));
        toast.success(`Vecino encontrado: ${vecino.nombre} ${vecino.apellido || ''}`);
      } else {
        setVecinoExistente(null);
      }
    } catch (err) {
      console.error('Error buscando vecino por DNI', err);
      setVecinoExistente(null);
    } finally {
      setBuscandoVecino(false);
    }
  };

  const handleDniChange = (dni: string) => {
    setForm({ ...form, dni_solicitante: dni });
    if (vecinoExistente && dni.replace(/\D/g, '') !== vecinoExistente.dni) {
      setVecinoExistente(null);
    }
    if (dniSearchTimeoutRef.current) clearTimeout(dniSearchTimeoutRef.current);
    dniSearchTimeoutRef.current = setTimeout(() => {
      buscarVecinoPorDni(dni);
    }, 500);
  };

  const categoriaSeleccionada = useMemo(
    () => (form.categoria_id ? categorias.find(c => c.id === form.categoria_id) || null : null),
    [categorias, form.categoria_id],
  );

  // ============ Validación: email del solicitante == email del admin logueado ============
  //
  // El email es la identidad global en `usuarios` (columna unique). Si un
  // admin/supervisor está cargando un reclamo en ventanilla y pone su propio
  // email como solicitante, el backend no puede crear el ghost vecino porque
  // choca con la constraint unique — y además semánticamente no tiene sentido
  // que el admin se cargue un reclamo a sí mismo.
  //
  // Bloqueamos el paso Solicitante mientras haya colisión: banner rojo +
  // `isValid = false` en el step → el botón "Siguiente" queda deshabilitado.
  // No tocamos el DNI: si el DNI no está cargado en DB, el flujo sigue normal.

  const emailPropioColision = useMemo(() => {
    if (!isEmpleado || !user?.email) return false;
    const tipeado = form.email_solicitante.trim().toLowerCase();
    if (!tipeado) return false;
    return tipeado === user.email.trim().toLowerCase();
  }, [isEmpleado, user?.email, form.email_solicitante]);

  // ============ Clasificación IA con debounce ============
  //
  // Cuando el vecino escribe en el textarea, después de 1200ms de pausa
  // mandamos el texto a Groq (llama-3.3-70b-versatile) vía
  // /api/publico/clasificar. Groq devuelve las 3 categorías más probables
  // del municipio con % de confianza. Probado con frases reales como
  // "falla la luz de la esquina" → Iluminación Pública 90%.
  //
  // Cache local por texto exacto para evitar llamadas duplicadas.

  useEffect(() => {
    const texto = searchTerm.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (texto.length < 5 || !municipioActual?.id) {
      setSugerencias([]);
      setClasificando(false);
      return;
    }

    const cached = cacheRef.current.get(texto);
    if (cached) {
      setSugerencias(cached);
      setClasificando(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setClasificando(true);
      try {
        const result = await clasificacionApi.clasificar(texto, municipioActual.id, true);
        // Sólo la mejor sugerencia — si la IA se equivoca, el vecino la
        // corrige desde "Prefiero elegir manualmente" o después en edición.
        const sugs: SugerenciaIA[] = (result?.sugerencias || []).slice(0, 1);
        cacheRef.current.set(texto, sugs);
        setSugerencias(sugs);
        // Auto-seleccionar la categoría recomendada para que el botón
        // "Siguiente" quede habilitado sin que el vecino tenga que hacer
        // click en la card de la sugerencia.
        if (sugs.length > 0) {
          const top = sugs[0];
          setForm(prev => ({
            ...prev,
            categoria_id: top.categoria_id,
            titulo: prev.titulo || texto || top.categoria_nombre,
            descripcion: prev.descripcion || texto,
          }));
        }
      } catch (err) {
        console.error('Error clasificando con IA', err);
        setSugerencias([]);
      } finally {
        setClasificando(false);
      }
    }, 1200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, municipioActual?.id]);

  // ============ Handlers ============

  /**
   * El vecino tocó una sugerencia de la IA. Setea categoria_id, usa el
   * texto que escribió como título inicial, y avanza al paso 2.
   */
  const handleSelectSugerencia = (sug: SugerenciaIA) => {
    setForm(prev => ({
      ...prev,
      categoria_id: sug.categoria_id,
      titulo: prev.titulo || searchTerm.trim() || sug.categoria_nombre,
      descripcion: prev.descripcion || searchTerm.trim(),
    }));
    setStep(1);
  };

  /**
   * Fallback: el vecino prefirió elegir la categoría manualmente desde el
   * grid en vez de usar las sugerencias de la IA.
   */
  const handleSelectCategoriaSinTipo = (c: CategoriaReclamo) => {
    setForm(prev => ({
      ...prev,
      categoria_id: c.id,
      titulo: prev.titulo || searchTerm.trim() || c.nombre,
      descripcion: prev.descripcion || searchTerm.trim(),
    }));
    setStep(1);
  };

  // ============ Guardar ============

  const guardar = async () => {
    if (!form.categoria_id) {
      toast.error('Elegí una categoría');
      return;
    }
    // Modo empleado: validar datos del solicitante
    if (isEmpleado) {
      if (!form.nombre_solicitante.trim() || !form.apellido_solicitante.trim()) {
        toast.error('Nombre y apellido del solicitante son obligatorios');
        return;
      }
      if (!form.dni_solicitante.trim()) {
        toast.error('DNI del solicitante es obligatorio');
        return;
      }
    }
    if (!form.direccion.trim()) {
      toast.error('Indicá la dirección del problema');
      return;
    }
    if (form.titulo.trim().length < 5) {
      toast.error('El título debe tener al menos 5 caracteres');
      return;
    }
    if (form.descripcion.trim().length < 10) {
      toast.error('La descripción debe tener al menos 10 caracteres');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        direccion: form.direccion.trim(),
        latitud: form.latitud ?? undefined,
        longitud: form.longitud ?? undefined,
        referencia: form.referencia.trim() || undefined,
        categoria_id: form.categoria_id,
        prioridad: 3,
      };
      // Si el wizard lo abrió un empleado, mandamos los campos del solicitante
      // para que el backend busque/cree el ghost vecino y use su id como creador
      if (isEmpleado) {
        payload.nombre_solicitante = form.nombre_solicitante.trim();
        payload.apellido_solicitante = form.apellido_solicitante.trim();
        payload.dni_solicitante = form.dni_solicitante.trim();
        payload.email_solicitante = form.email_solicitante.trim() || undefined;
        payload.telefono_solicitante = form.telefono_solicitante.trim() || undefined;
      }
      // Modo Mostrador: vecino ya identificado, mandamos user_id directo. El
      // backend marca canal=ventanilla_asistida y arma el audit trail con
      // operador_user_id + timestamp + RENAPER session si aplica.
      if (ctxMostrador) {
        payload.actuando_como_user_id = ctxMostrador.user_id;
      }
      const res = await reclamosApi.create(payload);
      // Si el vecino adjunto una foto, la subimos ahora. Si falla la foto
      // no rompemos el flow — el reclamo ya se creo bien.
      if (fotoFile) {
        try {
          await reclamosApi.upload(res.data.id, fotoFile, 'creacion');
        } catch (uploadErr) {
          console.error('Error subiendo foto (reclamo creado igual)', uploadErr);
          toast.warning('Reclamo creado, pero no se pudo subir la foto. Agregala después.');
        }
      }
      toast.success('Reclamo creado correctamente', { duration: 4000 });
      onSuccess?.(res.data);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error creando reclamo');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Step 1: ¿Qué querés reportar?
  // ============================================================

  const step1Content = (
    <div className="space-y-4">
      {/* Input de búsqueda en lenguaje natural */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Contanos qué está pasando
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.textSecondary }} />
          <input
            type="text"
            autoFocus
            placeholder='Ej: "no tengo luz en la esquina", "hay un bache en la calle", "basura sin recoger"...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>
        <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: theme.textSecondary }}>
          <Sparkles className="h-3 w-3" />
          Escribí en tus palabras y la IA te sugiere la categoría correcta.
        </p>
      </div>

      {/* Loading inicial de categorías */}
      {loadingData && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
        </div>
      )}

      {/* Estado: clasificando con IA */}
      {!loadingData && clasificando && (
        <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" style={{ color: theme.primary }} />
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Analizando con IA para sugerirte la mejor categoría...
          </p>
        </div>
      )}

      {/* Recomendación única de la IA — ya está auto-seleccionada, el vecino
          puede tocar "Siguiente" o hacer click acá para avanzar. Si la IA se
          equivocó, usa "Prefiero elegir manualmente" más abajo. */}
      {!loadingData && !clasificando && sugerencias.length > 0 && (() => {
        const sug = sugerencias[0];
        const cat = categorias.find(c => c.id === sug.categoria_id);
        const color = cat?.color || theme.primary;
        const icono = cat?.icono || 'AlertCircle';
        return (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: theme.textSecondary }}>
              <Sparkles className="h-3 w-3" />
              Categoría recomendada
            </p>
            <button
              type="button"
              onClick={() => handleSelectSugerencia(sug)}
              className="w-full text-left p-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                backgroundColor: `${color}15`,
                border: `2px solid ${color}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}25` }}
                >
                  <DynamicIcon name={icono} className="h-5 w-5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {sug.categoria_nombre || cat?.nombre || 'Categoría'}
                  </p>
                  <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                    Si está bien, tocá "Siguiente". Si no, elegí manualmente.
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color }} />
              </div>
            </button>
          </div>
        );
      })()}

      {/* Grid de categorías — colapsado por default. Se abre con un toggle
          si el vecino prefiere elegir manualmente en vez de buscar por texto. */}
      {!loadingData && categorias.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarGridCategorias(v => !v)}
            className="flex items-center gap-2 text-xs hover:underline"
            style={{ color: theme.primary }}
          >
            {mostrarGridCategorias ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {mostrarGridCategorias ? 'Ocultar categorías' : 'Prefiero elegir la categoría manualmente'}
          </button>

          {mostrarGridCategorias && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {categorias.map(c => {
                const isSelected = form.categoria_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCategoriaSinTipo(c)}
                    className="flex items-center gap-2 p-3 rounded-xl text-left transition-all duration-200 hover:scale-[1.02]"
                    style={{
                      backgroundColor: isSelected ? `${c.color || theme.primary}20` : theme.backgroundSecondary,
                      border: `2px solid ${isSelected ? (c.color || theme.primary) : 'transparent'}`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${c.color || theme.primary}25` }}
                    >
                      <DynamicIcon name={c.icono || 'Folder'} className="h-4 w-4" style={{ color: c.color || theme.primary }} />
                    </div>
                    <span className="text-xs font-medium truncate" style={{ color: theme.text }}>{c.nombre}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Si ya hay categoría elegida, mostrarla como "actualmente seleccionada" */}
      {categoriaSeleccionada && !searchTerm.trim() && (
        <div
          className="p-3 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: `${categoriaSeleccionada.color || theme.primary}15`,
            border: `2px solid ${categoriaSeleccionada.color || theme.primary}`,
          }}
        >
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color: categoriaSeleccionada.color || theme.primary }} />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              Categoría seleccionada
            </p>
            <p className="text-sm font-medium" style={{ color: theme.text }}>{categoriaSeleccionada.nombre}</p>
          </div>
        </div>
      )}
    </div>
  );

  // ============================================================
  // Step 2: ¿Dónde está el problema?
  // ============================================================

  const step2Content = (
    <div className="space-y-4">
      {/* Card con el tipo elegido */}
      {categoriaSeleccionada && (
        <div
          className="p-3 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: theme.backgroundSecondary,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${categoriaSeleccionada.color || theme.primary}25` }}
          >
            <DynamicIcon name={categoriaSeleccionada.icono || 'AlertCircle'} className="h-5 w-5" style={{ color: categoriaSeleccionada.color || theme.primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              Categoría
            </p>
            <p className="text-sm font-semibold" style={{ color: theme.text }}>
              {categoriaSeleccionada.nombre}
            </p>
          </div>
        </div>
      )}

      {/* Dirección */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
          Ubicación del problema
        </p>

        {/* Chip sugerido: cuando el wizard encontró al vecino por DNI y
            éste tiene un reclamo anterior, ofrecemos su última dirección
            como atajo. Click → llena el input. El admin puede seguir
            tipeando otra distinta si el problema es en otro lado. */}
        {vecinoExistente?.ultimo_reclamo_direccion &&
          vecinoExistente.ultimo_reclamo_direccion !== form.direccion && (
            <button
              type="button"
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  direccion: vecinoExistente.ultimo_reclamo_direccion || '',
                  // Limpiamos lat/lon porque vienen del reclamo anterior y
                  // el DireccionAutocomplete las va a re-geocodificar si el
                  // admin confirma esta dirección desde el dropdown.
                  latitud: null,
                  longitud: null,
                }))
              }
              className="w-full mb-2 p-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-3"
              style={{
                backgroundColor: `${theme.primary}15`,
                border: `1px dashed ${theme.primary}60`,
              }}
            >
              <MapPin className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                  {vecinoExistente.ultimo_reclamo_direccion}
                </p>
                <p className="text-[10px]" style={{ color: theme.textSecondary }}>
                  Dirección del reclamo anterior del vecino — tocá para usarla
                </p>
              </div>
            </button>
          )}

        <DireccionAutocomplete
          label="Dirección"
          required
          value={form.direccion}
          onChange={(direccion, latitud, longitud) =>
            setForm(prev => ({
              ...prev,
              direccion,
              latitud: latitud ?? prev.latitud,
              longitud: longitud ?? prev.longitud,
            }))
          }
          placeholder="Ej: Av. San Martín 1234"
        />
      </div>

      {/* Referencia */}
      <div>
        <label className="block text-xs mb-1" style={{ color: theme.text }}>
          Referencia (opcional)
        </label>
        <input
          type="text"
          placeholder="Ej: frente a la plaza, al lado del kiosco..."
          value={form.referencia}
          onChange={e => setForm({ ...form, referencia: e.target.value })}
          className="w-full px-3 py-2 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
        <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>
          Ayudanos a ubicar el problema si la dirección no es precisa.
        </p>
      </div>
    </div>
  );

  // ============================================================
  // Step 3: Contanos qué pasó
  // ============================================================

  const step3Content = (
    <div className="space-y-4">
      {/* Recordatorio: categoría (siempre) + tipo (si fue elegido) */}
      {categoriaSeleccionada && (
        <div
          className="p-2 rounded-lg text-xs flex items-center gap-2"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.textSecondary,
          }}
        >
          <AlertCircle className="h-3 w-3" style={{ color: categoriaSeleccionada.color || theme.primary }} />
          <span>{categoriaSeleccionada.nombre}</span>
        </div>
      )}

      {/* Título */}
      <div>
        <label className="block text-xs mb-1" style={{ color: theme.text }}>
          Título del reclamo <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.titulo}
          onChange={e => setForm({ ...form, titulo: e.target.value })}
          className="w-full px-3 py-2 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          placeholder="Resumen corto del problema"
        />
        <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>
          Mínimo 5 caracteres ({form.titulo.length})
        </p>
      </div>

      {/* Descripción */}
      <div>
        <label className="block text-xs mb-1" style={{ color: theme.text }}>
          Descripción detallada <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={5}
          placeholder="Contanos con más detalle qué está pasando, desde cuándo, qué tan grave es, etc."
          value={form.descripcion}
          onChange={e => setForm({ ...form, descripcion: e.target.value })}
          className="w-full px-3 py-2 rounded-xl text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
        <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>
          Mínimo 10 caracteres ({form.descripcion.length})
        </p>
      </div>
    </div>
  );

  // ============================================================
  // Step Foto (opcional): sacar o elegir una imagen del problema.
  // ============================================================
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error('La foto pesa más de 10MB');
      return;
    }
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(f);
    setFotoPreview(URL.createObjectURL(f));
  };

  const handleFotoQuitar = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(null);
    setFotoPreview(null);
  };

  const fotoStepContent = (
    <div className="space-y-4">
      <div
        className="p-3 rounded-xl flex items-start gap-2"
        style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
      >
        <Camera className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
        <p className="text-xs" style={{ color: theme.text }}>
          Una imagen ayuda al municipio a entender el problema.
          <span className="block mt-0.5" style={{ color: theme.textSecondary }}>
            Es opcional — podés subirla después también.
          </span>
        </p>
      </div>

      {fotoPreview ? (
        <div className="relative rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
          <img
            src={fotoPreview}
            alt="Foto del reclamo"
            className="w-full object-cover"
            style={{ maxHeight: 360 }}
          />
          <button
            type="button"
            onClick={handleFotoQuitar}
            className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
            aria-label="Quitar foto"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <div
            className="absolute bottom-0 left-0 right-0 px-3 py-1.5 text-xs truncate"
            style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff' }}
          >
            {fotoFile?.name} · {fotoFile ? (fotoFile.size / 1024 / 1024).toFixed(1) : 0} MB
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor="foto-camara"
            className="flex flex-col items-center justify-center p-8 rounded-xl cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}15 0%, ${theme.backgroundSecondary} 80%)`,
              border: `2px dashed ${theme.primary}60`,
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
              style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`, boxShadow: `0 6px 16px ${theme.primary}40` }}
            >
              <Camera className="h-7 w-7 text-white" />
            </div>
            <p className="text-sm font-semibold" style={{ color: theme.text }}>Sacar foto</p>
            <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>Usar cámara del teléfono</p>
          </label>
          <input
            id="foto-camara"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFotoChange}
          />

          <label
            htmlFor="foto-galeria"
            className="flex items-center justify-center gap-2 p-3 rounded-xl cursor-pointer text-sm font-medium transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            Elegir de galería
          </label>
          <input
            id="foto-galeria"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFotoChange}
          />
        </>
      )}
    </div>
  );

  // ============================================================
  // Step 4: Confirmación
  // ============================================================

  const step4Content = (
    <div className="space-y-4">
      {categoriaSeleccionada && (
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: theme.backgroundSecondary,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${categoriaSeleccionada.color || theme.primary}25` }}
            >
              <DynamicIcon name={categoriaSeleccionada.icono || 'AlertCircle'} className="h-5 w-5" style={{ color: categoriaSeleccionada.color || theme.primary }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                Categoría
              </p>
              <p className="text-base font-semibold" style={{ color: theme.text }}>
                {categoriaSeleccionada.nombre}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs" style={{ color: theme.textSecondary }}>
            <div>
              <p className="text-[10px] uppercase">Título</p>
              <p style={{ color: theme.text }}>{form.titulo}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase flex items-center gap-1"><MapPin className="h-3 w-3" /> Dirección</p>
              <p style={{ color: theme.text }}>{form.direccion}</p>
              {form.referencia && (
                <p className="text-[10px] italic">Ref: {form.referencia}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Descripción</p>
              <p style={{ color: theme.text }} className="whitespace-pre-wrap">{form.descripcion}</p>
            </div>
            {fotoPreview && (
              <div>
                <p className="text-[10px] uppercase flex items-center gap-1"><Camera className="h-3 w-3" /> Foto</p>
                <img
                  src={fotoPreview}
                  alt="Vista previa"
                  className="mt-1 rounded-lg w-full object-cover"
                  style={{ maxHeight: 200, border: `1px solid ${theme.border}` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="p-3 rounded-xl flex items-start gap-3"
        style={{
          backgroundColor: '#10b98115',
          border: '1px solid #10b98140',
        }}
      >
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
        <div className="flex-1 text-xs" style={{ color: theme.text }}>
          <p className="font-semibold mb-1">Listo para enviar</p>
          <p style={{ color: theme.textSecondary }}>
            Tu reclamo va a ser asignado automáticamente a la dependencia que gestiona esta categoría.
            Vas a recibir notificaciones sobre el progreso.
          </p>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // Step: Datos del solicitante (SOLO modo empleado en ventanilla)
  // ============================================================
  //
  // Se inserta entre "Dónde" y "Qué pasó" cuando el wizard lo abre un
  // empleado o admin (no un vecino logueado). Replica el patrón del
  // wizard de trámites: input DNI con búsqueda debounced contra
  // `/users/buscar-por-dni`, banner de vecino existente, autocompletado
  // de nombre/apellido/email/teléfono, ghost vecino al guardar.

  const stepSolicitanteContent = (
    <div className="space-y-4">
      {/* Banner de error cuando el admin pone su propio email como solicitante */}
      {emailPropioColision && (
        <div
          className="p-3 rounded-xl flex items-start gap-3"
          style={{
            backgroundColor: '#ef444415',
            border: '1px solid #ef444440',
          }}
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
          <div className="flex-1 text-xs" style={{ color: theme.text }}>
            <p className="font-semibold" style={{ color: '#ef4444' }}>
              Ese email es tuyo
            </p>
            <p className="mt-0.5" style={{ color: theme.textSecondary }}>
              No podés cargarte un reclamo a vos mismo siendo {user?.rol}. Cambiá el email del solicitante por el del vecino real.
            </p>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
          Datos del solicitante
        </p>

        <div>
          <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: theme.text }}>
            DNI <span className="text-red-500">*</span>
            {kycVerificado && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-medium" style={{ color: '#10b981' }}>
                <UserCheck className="h-3 w-3" /> Verificado
              </span>
            )}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="30123456"
              value={form.dni_solicitante}
              onChange={e => handleDniChange(e.target.value)}
              disabled={kycVerificado}
              className="w-full px-3 py-2 pr-10 rounded-xl text-sm disabled:cursor-not-allowed"
              style={{
                backgroundColor: kycVerificado ? theme.border : theme.backgroundSecondary,
                border: `1px solid ${vecinoExistente ? '#10b981' : theme.border}`,
                color: kycVerificado ? theme.textSecondary : theme.text,
                opacity: kycVerificado ? 0.7 : 1,
              }}
            />
            {buscandoVecino && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
            )}
            {!buscandoVecino && vecinoExistente && (
              <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#10b981' }} />
            )}
          </div>
          <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>
            {kycVerificado
              ? 'Datos validados con tu DNI. Si cambió algo, actualizá tu perfil.'
              : 'Si el vecino ya existe en el sistema, autocompletamos sus datos.'}
          </p>
        </div>

        {vecinoExistente && (
          <div
            className="mt-3 p-3 rounded-xl flex items-start gap-3"
            style={{
              backgroundColor: '#10b98115',
              border: '1px solid #10b98140',
            }}
          >
            <UserCheck className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
            <div className="flex-1 text-xs" style={{ color: theme.text }}>
              <p className="font-semibold">
                Vecino existente: {vecinoExistente.nombre} {vecinoExistente.apellido || ''}
              </p>
              <p className="mt-0.5" style={{ color: theme.textSecondary }}>
                Se autocompletaron los datos. Podés editar cualquier campo si cambió.
              </p>
              {vecinoExistente.solicitudes_previas > 0 && (
                <p className="mt-1 flex items-center gap-1" style={{ color: theme.textSecondary }}>
                  <History className="h-3 w-3" />
                  {vecinoExistente.solicitudes_previas} trámite{vecinoExistente.solicitudes_previas !== 1 ? 's' : ''} previo{vecinoExistente.solicitudes_previas !== 1 ? 's' : ''} en este municipio
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.text }}>
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.nombre_solicitante}
              onChange={e => setForm({ ...form, nombre_solicitante: e.target.value })}
              disabled={kycVerificado}
              className="w-full px-3 py-2 rounded-xl text-sm disabled:cursor-not-allowed"
              style={{
                backgroundColor: kycVerificado ? theme.border : theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: kycVerificado ? theme.textSecondary : theme.text,
                opacity: kycVerificado ? 0.7 : 1,
              }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.text }}>
              Apellido <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.apellido_solicitante}
              onChange={e => setForm({ ...form, apellido_solicitante: e.target.value })}
              disabled={kycVerificado}
              className="w-full px-3 py-2 rounded-xl text-sm disabled:cursor-not-allowed"
              style={{
                backgroundColor: kycVerificado ? theme.border : theme.backgroundSecondary,
                border: `1px solid ${theme.border}`,
                color: kycVerificado ? theme.textSecondary : theme.text,
                opacity: kycVerificado ? 0.7 : 1,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.text }}>
              Email
            </label>
            <input
              type="email"
              placeholder="email@ejemplo.com"
              value={form.email_solicitante}
              onChange={e => setForm({ ...form, email_solicitante: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${emailPropioColision ? '#ef4444' : theme.border}`,
                color: theme.text,
              }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.text }}>
              Teléfono
            </label>
            <input
              type="tel"
              placeholder="+54 9 11 ..."
              value={form.telefono_solicitante}
              onChange={e => setForm({ ...form, telefono_solicitante: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // Steps config
  // ============================================================

  const solicitanteStep: WizardStep = {
    id: 'solicitante',
    title: 'Solicitante',
    description: 'Datos del vecino',
    icon: <User className="h-4 w-4" />,
    content: stepSolicitanteContent,
    isValid:
      form.nombre_solicitante.trim().length > 0 &&
      form.apellido_solicitante.trim().length > 0 &&
      form.dni_solicitante.trim().length > 0 &&
      !emailPropioColision,
  };

  const steps: WizardStep[] = [
    {
      id: 'tipo',
      title: 'Qué',
      description: 'Elegí el tipo de reclamo',
      icon: <FolderTree className="h-4 w-4" />,
      content: step1Content,
      isValid: !!form.categoria_id,
    },
    // Solicitante: solo si el wizard lo abrió un empleado/admin
    ...(isEmpleado ? [solicitanteStep] : []),
    {
      id: 'donde',
      title: 'Dónde',
      description: 'Ubicación del problema',
      icon: <MapPin className="h-4 w-4" />,
      content: step2Content,
      isValid: form.direccion.trim().length > 0,
    },
    {
      id: 'que-paso',
      title: 'Qué pasó',
      description: 'Título y descripción',
      icon: <MessageSquare className="h-4 w-4" />,
      content: step3Content,
      isValid:
        form.titulo.trim().length >= 5 &&
        form.descripcion.trim().length >= 10,
    },
    {
      id: 'foto',
      title: 'Foto',
      description: 'Opcional — una imagen del problema',
      icon: <Camera className="h-4 w-4" />,
      content: fotoStepContent,
      isValid: true,  // paso opcional, siempre valido
    },
    {
      id: 'confirmar',
      title: 'Confirmar',
      description: 'Revisá y creá el reclamo',
      icon: <CheckCircle2 className="h-4 w-4" />,
      content: step4Content,
      isValid: !!form.categoria_id,
    },
  ];

  // Modal liviano de confirmación cuando se crea desde el Mostrador.
  const [confirmAbierto, setConfirmAbierto] = useState(false);

  return (
    <>
      <WizardModal
        open={open}
        onClose={onClose}
        title="Nuevo reclamo"
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        onComplete={ctxMostrador ? () => setConfirmAbierto(true) : guardar}
        loading={saving}
        completeLabel="Crear reclamo"
        primaryButtonColor={categoriaSeleccionada?.color}
      />
      {ctxMostrador && confirmAbierto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => setConfirmAbierto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl p-5 max-w-md w-full shadow-2xl"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${categoriaSeleccionada?.color || '#3b82f6'}25`, color: categoriaSeleccionada?.color || '#3b82f6' }}
              >
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                  Modo ventanilla
                </p>
                <p className="text-base font-bold" style={{ color: theme.text }}>
                  ¿Confirmás crear el reclamo?
                </p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              Vas a crear el reclamo a nombre de{' '}
              <span className="font-semibold" style={{ color: theme.text }}>
                {`${ctxMostrador.nombre || ''} ${ctxMostrador.apellido || ''}`.trim() || 'el vecino'}
              </span>
              . Queda registrado con tu usuario como operador.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAbierto(false)}
                disabled={saving}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                style={{ color: theme.text, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmAbierto(false);
                  await guardar();
                }}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: categoriaSeleccionada?.color || '#3b82f6' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Crear reclamo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
