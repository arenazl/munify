import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  User,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Clock,
  CreditCard,
  FolderTree,
  AlertCircle,
  UserCheck,
  History,
  Printer,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { DynamicIcon } from '../ui/DynamicIcon';
import { DireccionAutocomplete } from '../ui/DireccionAutocomplete';
import { tramitesApi, categoriasTramiteApi, usersApi, type VecinoPorDni } from '../../lib/api';
import type { Tramite, CategoriaTramite } from '../../types';
import { useMostradorContext } from '../mostrador/BannerActuandoComo';
import { armarWaMeUrl, mensajeRequisitosTramite, generarPdfRequisitos } from '../../lib/mostradorRequisitos';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se dispara con la solicitud creada al terminar el wizard. */
  onSuccess?: (solicitud: any) => void;
  /** Si viene, el wizard arranca con el trámite pre-seleccionado (deep-link). */
  tramiteInicial?: Tramite | null;
}

interface SolicitudForm {
  tramite_id: number | null;
  nombre_solicitante: string;
  apellido_solicitante: string;
  dni_solicitante: string;
  email_solicitante: string;
  telefono_solicitante: string;
  direccion_solicitante: string;
  asunto: string;
  descripcion: string;
}

const EMPTY_FORM: SolicitudForm = {
  tramite_id: null,
  nombre_solicitante: '',
  apellido_solicitante: '',
  dni_solicitante: '',
  email_solicitante: '',
  telefono_solicitante: '',
  direccion_solicitante: '',
  asunto: '',
  descripcion: '',
};

/**
 * Wizard de creación de solicitud usado por el empleado municipal en
 * ventanilla. 3 pasos simples, sin upload de documentos ni validación de
 * identidad — eso se hace después desde la pantalla de gestión.
 *
 * 1. Elegir trámite (autocomplete client-side + grid de categorías)
 * 2. Datos del solicitante + asunto
 * 3. Confirmación y envío
 *
 * Reemplaza al viejo `TramiteWizard.tsx` (2271 líneas con chat IA, cámara,
 * validación DNI, etc.) que asumía un escenario "vecino online" que no es el
 * real del producto.
 */
export function CrearSolicitudWizard({ open, onClose, onSuccess, tramiteInicial }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const ctxMostrador = useMostradorContext();
  const esVecino = user?.rol === 'vecino';
  const nivelVerif = user?.nivel_verificacion ?? 0;
  // KYC verificado por Didit → DNI/nombre/apellido son read-only.
  const kycVerificado = esVecino && nivelVerif >= 2;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [categorias, setCategorias] = useState<CategoriaTramite[]>([]);
  const [tramites, setTramites] = useState<Tramite[]>([]);

  const [form, setForm] = useState<SolicitudForm>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoriaId, setSelectedCategoriaId] = useState<number | null>(null);

  // Búsqueda de vecino por DNI: cuando el empleado termina de cargar el DNI,
  // consultamos al backend para ver si ya existe un vecino con ese DNI en el
  // municipio actual. Si existe, autocompletamos nombre/apellido/email/tel/
  // dirección y mostramos un banner con la cantidad de solicitudes previas.
  const [vecinoExistente, setVecinoExistente] = useState<VecinoPorDni | null>(null);
  const [buscandoVecino, setBuscandoVecino] = useState(false);
  const dniSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dniUltimoBuscado = useRef<string>('');

  // Cargar categorías y trámites al abrir el wizard
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      try {
        const [catsRes, tramRes] = await Promise.all([
          categoriasTramiteApi.getAll(true),
          tramitesApi.getAll({ activo: true }),
        ]);
        if (!cancelled) {
          setCategorias(catsRes.data || []);
          setTramites(tramRes.data || []);
        }
      } catch (err) {
        console.error('Error cargando datos del wizard', err);
        if (!cancelled) toast.error('Error cargando trámites');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  // Reset al cerrar + precarga con datos del vecino logueado al abrir.
  // Si el vecino ya tiene datos en su perfil (verificado por Didit o tipeados
  // en tramites anteriores), el wizard arranca con todo precargado.
  useEffect(() => {
    if (!open) {
      setStep(0);
      setForm(EMPTY_FORM);
      setSearchTerm('');
      setSelectedCategoriaId(null);
      return;
    }
    // Modo Mostrador: el operador ya identificó al vecino, prellenar todo
    // con los datos del contexto (no del current_user, que es el operador).
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
    if (esVecino && user) {
      setForm(prev => ({
        ...prev,
        nombre_solicitante: prev.nombre_solicitante || user.nombre || '',
        apellido_solicitante: prev.apellido_solicitante || user.apellido || '',
        dni_solicitante: prev.dni_solicitante || user.dni || '',
        email_solicitante: prev.email_solicitante || user.email || '',
        telefono_solicitante: prev.telefono_solicitante || user.telefono || '',
        direccion_solicitante: prev.direccion_solicitante || user.direccion || '',
      }));
    }
  }, [open, esVecino, user, ctxMostrador]);

  // Pre-seleccionar trámite si viene uno inicial
  useEffect(() => {
    if (open && tramiteInicial) {
      setForm(prev => ({ ...prev, tramite_id: tramiteInicial.id }));
    }
  }, [open, tramiteInicial]);

  const tramiteSeleccionado = useMemo(
    () => tramites.find(t => t.id === form.tramite_id) || tramiteInicial || null,
    [tramites, form.tramite_id, tramiteInicial],
  );

  const categoriaDelTramite = useMemo(
    () => (tramiteSeleccionado ? categorias.find(c => c.id === tramiteSeleccionado.categoria_tramite_id) : null),
    [categorias, tramiteSeleccionado],
  );

  // ============ Búsqueda y filtrado client-side ============

  const scoreMatch = (nombre: string, q: string): number => {
    const n = nombre.toLowerCase();
    if (n.startsWith(q)) return n.length; // prefix match
    const idx = n.indexOf(q);
    if (idx >= 0) return 100 + idx; // contains
    return 9999;
  };

  const tramitesFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (q.length >= 2) {
      // Búsqueda: ignorar categoría seleccionada, ordenar por score
      return tramites
        .map(t => ({ t, score: scoreMatch(t.nombre, q) }))
        .filter(x => x.score < 9999 || (t => t.t.descripcion?.toLowerCase().includes(q))(x))
        .sort((a, b) => a.score - b.score)
        .slice(0, 12)
        .map(x => x.t);
    }
    // Sin búsqueda: filtrar por categoría seleccionada
    if (selectedCategoriaId) {
      return tramites.filter(t => t.categoria_tramite_id === selectedCategoriaId);
    }
    return [];
  }, [searchTerm, selectedCategoriaId, tramites]);

  const tramitesPorCategoria = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of tramites) {
      counts[t.categoria_tramite_id] = (counts[t.categoria_tramite_id] || 0) + 1;
    }
    return counts;
  }, [tramites]);

  // ============ Pre-rellenar asunto al seleccionar trámite ============

  // ============ Búsqueda de vecino por DNI ============

  // Cleanup del timeout al desmontar
  useEffect(() => {
    return () => {
      if (dniSearchTimeoutRef.current) clearTimeout(dniSearchTimeoutRef.current);
    };
  }, []);

  // Reset del vecino existente cuando el wizard se cierra
  useEffect(() => {
    if (!open) {
      setVecinoExistente(null);
      dniUltimoBuscado.current = '';
    }
  }, [open]);

  const buscarVecinoPorDni = async (dniRaw: string) => {
    // Normalizar: solo dígitos
    const dniLimpio = dniRaw.replace(/\D/g, '');

    // < 7 dígitos no es DNI válido — limpiar estado y salir
    if (dniLimpio.length < 7) {
      setVecinoExistente(null);
      dniUltimoBuscado.current = '';
      return;
    }

    // Evitar consultar dos veces el mismo DNI
    if (dniLimpio === dniUltimoBuscado.current) return;
    dniUltimoBuscado.current = dniLimpio;

    setBuscandoVecino(true);
    try {
      const res = await usersApi.buscarPorDni(dniLimpio);
      const vecino = res.data;

      if (vecino) {
        setVecinoExistente(vecino);
        // Autocompletar solo los campos que estén vacíos (no pisar lo que
        // el empleado ya escribió a mano — algunos datos cambian, como el
        // teléfono)
        setForm((prev) => ({
          ...prev,
          nombre_solicitante: prev.nombre_solicitante || vecino.nombre || '',
          apellido_solicitante: prev.apellido_solicitante || vecino.apellido || '',
          email_solicitante: prev.email_solicitante || vecino.email || '',
          telefono_solicitante: prev.telefono_solicitante || vecino.telefono || '',
          direccion_solicitante: prev.direccion_solicitante || vecino.direccion || '',
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

    // Si el empleado sigue editando el DNI, limpiar el banner inmediatamente
    // para no mostrar info desactualizada
    if (vecinoExistente && dni.replace(/\D/g, '') !== vecinoExistente.dni) {
      setVecinoExistente(null);
    }

    // Debounce 500ms
    if (dniSearchTimeoutRef.current) clearTimeout(dniSearchTimeoutRef.current);
    dniSearchTimeoutRef.current = setTimeout(() => {
      buscarVecinoPorDni(dni);
    }, 500);
  };

  const handleSelectTramite = (t: Tramite) => {
    setForm(prev => ({
      ...prev,
      tramite_id: t.id,
      asunto: prev.asunto || `Solicitud: ${t.nombre}`,
    }));
    // En modo Mostrador, no avanzamos: mostramos primero los botones de
    // PDF / WhatsApp para mandar requisitos al vecino, y dejamos un
    // "Continuar" explícito.
    if (!ctxMostrador) setStep(1);
  };

  // ============ PDF / WhatsApp de requisitos (modo Mostrador) ============

  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [confirmAbierto, setConfirmAbierto] = useState(false);

  const handlePdfRequisitos = async () => {
    if (!tramiteSeleccionado || !ctxMostrador) return;
    setGenerandoPdf(true);
    try {
      await generarPdfRequisitos(tramiteSeleccionado, {
        nombre: ctxMostrador.nombre,
        apellido: ctxMostrador.apellido,
        dni: ctxMostrador.dni,
      });
    } catch {
      toast.error('No se pudo generar el PDF');
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleWhatsAppRequisitos = () => {
    if (!tramiteSeleccionado || !ctxMostrador) return;
    const tel = ctxMostrador.telefono;
    if (!tel) {
      toast.error('El vecino no tiene teléfono cargado');
      return;
    }
    const mensaje = mensajeRequisitosTramite(tramiteSeleccionado, {
      nombre: ctxMostrador.nombre,
      apellido: ctxMostrador.apellido,
      dni: ctxMostrador.dni,
    });
    const url = armarWaMeUrl(tel, mensaje);
    if (!url) {
      toast.error('Teléfono inválido para WhatsApp');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ============ Guardar ============

  const guardar = async () => {
    if (!form.tramite_id) {
      toast.error('Elegí un trámite');
      return;
    }
    if (!form.nombre_solicitante.trim() || !form.apellido_solicitante.trim()) {
      toast.error('Nombre y apellido son obligatorios');
      return;
    }
    if (!form.dni_solicitante.trim()) {
      toast.error('DNI es obligatorio');
      return;
    }
    if (form.asunto.trim().length < 10) {
      toast.error('El asunto debe tener al menos 10 caracteres');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tramite_id: form.tramite_id,
        asunto: form.asunto.trim(),
        descripcion: form.descripcion.trim() || undefined,
        nombre_solicitante: form.nombre_solicitante.trim(),
        apellido_solicitante: form.apellido_solicitante.trim(),
        dni_solicitante: form.dni_solicitante.trim(),
        email_solicitante: form.email_solicitante.trim() || undefined,
        telefono_solicitante: form.telefono_solicitante.trim() || undefined,
        direccion_solicitante: form.direccion_solicitante.trim() || undefined,
      };
      // Modo Mostrador: mandar referencia al vecino. El audit trail
      // (operador_user_id + canal=ventanilla_asistida + timestamp + RENAPER
      // session si aplica) lo arma el backend.
      if (ctxMostrador) {
        payload.actuando_como_user_id = ctxMostrador.user_id;
      }
      const res = await tramitesApi.createSolicitud(payload);
      toast.success(`Solicitud ${res.data.numero_tramite} creada. Cargá los documentos desde el detalle.`, {
        duration: 6000,
      });
      onSuccess?.(res.data);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error creando solicitud');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Step 1: elegir trámite
  // ============================================================

  // En modo Mostrador, una vez elegido el trámite, el step 1 muestra los
  // requisitos + acciones (PDF / WhatsApp / Continuar). El operador
  // puede mandar los requisitos antes de seguir cargando los datos.
  const step1ContentMostrador = ctxMostrador && tramiteSeleccionado ? (
    <div className="space-y-4">
      <div
        className="p-4 rounded-xl flex items-start gap-3"
        style={{
          backgroundColor: `${categoriaDelTramite?.color || theme.primary}15`,
          border: `2px solid ${categoriaDelTramite?.color || theme.primary}`,
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${categoriaDelTramite?.color || theme.primary}30` }}
        >
          <DynamicIcon name={categoriaDelTramite?.icono || 'FileText'} className="h-6 w-6" style={{ color: categoriaDelTramite?.color || theme.primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
            Trámite elegido
          </p>
          <p className="text-base font-bold" style={{ color: theme.text }}>{tramiteSeleccionado.nombre}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: theme.textSecondary }}>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {tramiteSeleccionado.tiempo_estimado_dias} días</span>
            <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> {tramiteSeleccionado.costo ? `$${tramiteSeleccionado.costo.toLocaleString('es-AR')}` : 'Gratis'}</span>
            {tramiteSeleccionado.documentos_requeridos && tramiteSeleccionado.documentos_requeridos.length > 0 && (
              <span>📋 {tramiteSeleccionado.documentos_requeridos.length} documentos</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setForm(prev => ({ ...prev, tramite_id: null, asunto: '' }))}
          className="text-[11px] underline flex-shrink-0"
          style={{ color: theme.textSecondary }}
        >
          Cambiar
        </button>
      </div>

      {/* Acciones de requisitos: PDF + WhatsApp */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
          ¿Querés mandar los requisitos al vecino antes de continuar?
        </p>
        <p className="text-[11px] mb-3" style={{ color: theme.textSecondary }}>
          Útil si vino sólo a averiguar y no trajo los documentos. Podés imprimirle la lista o mandársela por WhatsApp y seguir cuando vuelva.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handlePdfRequisitos}
            disabled={generandoPdf}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          >
            {generandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Imprimir PDF
          </button>
          <button
            type="button"
            onClick={handleWhatsAppRequisitos}
            disabled={!ctxMostrador.telefono}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: '#25d366' }}
            title={ctxMostrador.telefono ? `Enviar a ${ctxMostrador.telefono}` : 'Falta teléfono del vecino'}
          >
            <MessageSquare className="w-4 h-4" />
            WhatsApp
          </button>
        </div>
        {!ctxMostrador.telefono && (
          <p className="text-[10px] mt-1.5" style={{ color: theme.textSecondary }}>
            El vecino no tiene teléfono cargado. Cargalo en el paso 2 si querés mandarle el comprobante después.
          </p>
        )}
      </div>

      {/* Continuar */}
      <button
        type="button"
        onClick={() => setStep(1)}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95"
        style={{ backgroundColor: categoriaDelTramite?.color || theme.primary }}
      >
        <Sparkles className="w-4 h-4" />
        Continuar a cargar el trámite
      </button>
    </div>
  ) : null;

  const step1Content = step1ContentMostrador ?? (
    <div className="space-y-4">
      {/* Input de búsqueda */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          ¿Qué trámite necesitás?
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: theme.primary }} />
          <input
            type="text"
            autoFocus
            placeholder="Empezá a escribir, ej: licencia, habilitación, catastro..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              if (e.target.value.trim()) setSelectedCategoriaId(null);
            }}
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none focus:ring-2 transition-all"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.primary}40`,
              color: theme.text,
              boxShadow: `0 2px 8px ${theme.primary}15`,
            }}
          />
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: theme.textSecondary }}>
          Buscamos en todos los trámites cargados del municipio. Si no lo encontrás, explorá por categoría abajo.
        </p>
      </div>

      {/* Loading */}
      {loadingData && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
        </div>
      )}

      {/* Resultados de búsqueda */}
      {!loadingData && searchTerm.trim().length >= 2 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
            {tramitesFiltrados.length > 0 ? `${tramitesFiltrados.length} resultados` : 'Sin resultados'}
          </p>
          {tramitesFiltrados.length === 0 ? (
            <div className="p-4 rounded-xl text-center text-sm italic" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
              No encontramos trámites con ese nombre. Probá buscar con otra palabra o elegí una categoría.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tramitesFiltrados.map(t => {
                const cat = categorias.find(c => c.id === t.categoria_tramite_id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTramite(t)}
                    className="w-full text-left p-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${cat?.color || theme.primary}25` }}
                      >
                        <DynamicIcon name={cat?.icono || 'FileText'} className="h-5 w-5" style={{ color: cat?.color || theme.primary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: theme.text }}>{t.nombre}</span>
                          {cat && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${cat.color || theme.primary}20`, color: cat.color || theme.primary }}>
                              {cat.nombre}
                            </span>
                          )}
                        </div>
                        {t.descripcion && (
                          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: theme.textSecondary }}>
                            {t.descripcion}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: theme.textSecondary }}>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {t.tiempo_estimado_dias} días</span>
                          <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> {t.costo ? `$${t.costo}` : 'Gratis'}</span>
                          {t.documentos_requeridos && t.documentos_requeridos.length > 0 && (
                            <span>{t.documentos_requeridos.length} docs requeridos</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Grid de categorías (cuando no hay búsqueda) */}
      {!loadingData && !searchTerm.trim() && !selectedCategoriaId && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
            O elegí una categoría
          </p>
          {categorias.length === 0 ? (
            <div className="p-4 rounded-xl text-center text-sm italic" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
              No hay categorías de trámite cargadas. Creá primero desde "Categorías Trámite".
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categorias.map(c => {
                const count = tramitesPorCategoria[c.id] || 0;
                const catColor = c.color || theme.primary;
                const active = count > 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategoriaId(c.id)}
                    disabled={!active}
                    className="flex items-center gap-2 p-3 rounded-xl text-left transition-all duration-200 hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: active
                        ? `linear-gradient(135deg, ${catColor}22 0%, ${theme.backgroundSecondary} 90%)`
                        : theme.backgroundSecondary,
                      border: `1px solid ${active ? catColor + '50' : theme.border}`,
                      borderLeft: active ? `3px solid ${catColor}` : `1px solid ${theme.border}`,
                      boxShadow: active ? `0 2px 8px ${catColor}15` : 'none',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${catColor} 0%, ${catColor}cc 100%)`,
                        boxShadow: active ? `0 4px 10px ${catColor}40` : 'none',
                      }}
                    >
                      <DynamicIcon name={c.icono || 'Folder'} className="h-5 w-5" style={{ color: 'white' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>{c.nombre}</p>
                      <p className="text-[10px] font-medium" style={{ color: active ? catColor : theme.textSecondary }}>
                        {count} trámite{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lista de trámites de la categoría seleccionada */}
      {!loadingData && !searchTerm.trim() && selectedCategoriaId && (() => {
        const catActual = categorias.find(c => c.id === selectedCategoriaId);
        const catColor = catActual?.color || theme.primary;
        return (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setSelectedCategoriaId(null)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-all hover:scale-105 active:scale-95"
              style={{ color: theme.primary, backgroundColor: `${theme.primary}15` }}
            >
              <ArrowLeft className="h-3 w-3" />
              Volver
            </button>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-lg"
              style={{
                color: catColor,
                backgroundColor: `${catColor}18`,
                border: `1px solid ${catColor}40`,
              }}
            >
              {catActual?.nombre}
            </span>
          </div>
          {tramitesFiltrados.length === 0 ? (
            <div className="p-4 rounded-xl text-center text-sm italic" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
              Esta categoría no tiene trámites cargados.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tramitesFiltrados.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTramite(t)}
                  className="w-full text-left p-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.99]"
                  style={{
                    background: `linear-gradient(135deg, ${catColor}18 0%, ${theme.backgroundSecondary} 70%)`,
                    border: `1px solid ${catColor}40`,
                    borderLeft: `4px solid ${catColor}`,
                    boxShadow: `0 2px 10px ${catColor}10`,
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>{t.nombre}</p>
                  {t.descripcion && (
                    <p className="text-xs mt-0.5 line-clamp-1" style={{ color: theme.textSecondary }}>{t.descripcion}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${catColor}20`, color: catColor }}
                    >
                      <Clock className="h-3 w-3" /> {t.tiempo_estimado_dias} días
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: t.costo ? '#f59e0b20' : '#10b98120',
                        color: t.costo ? '#f59e0b' : '#10b981',
                      }}
                    >
                      <CreditCard className="h-3 w-3" /> {t.costo ? `$${t.costo}` : 'Gratis'}
                    </span>
                    {t.documentos_requeridos && t.documentos_requeridos.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                      >
                        {t.documentos_requeridos.length} docs
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {/* Si ya hay uno elegido, mostrarlo como "actualmente seleccionado" */}
      {tramiteSeleccionado && !searchTerm.trim() && !selectedCategoriaId && (
        <div
          className="p-3 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: `${categoriaDelTramite?.color || theme.primary}15`,
            border: `2px solid ${categoriaDelTramite?.color || theme.primary}`,
          }}
        >
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color: categoriaDelTramite?.color || theme.primary }} />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              Trámite seleccionado
            </p>
            <p className="text-sm font-medium" style={{ color: theme.text }}>{tramiteSeleccionado.nombre}</p>
          </div>
        </div>
      )}
    </div>
  );

  // ============================================================
  // Step 2: Datos del solicitante
  // ============================================================

  const step2Content = (
    <div className="space-y-4">
      {/* Card con el trámite elegido */}
      {tramiteSeleccionado && (
        <div
          className="p-3 rounded-xl flex items-center gap-3"
          style={{
            backgroundColor: theme.backgroundSecondary,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${categoriaDelTramite?.color || theme.primary}25` }}
          >
            <DynamicIcon name={categoriaDelTramite?.icono || 'FileText'} className="h-5 w-5" style={{ color: categoriaDelTramite?.color || theme.primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              {categoriaDelTramite?.nombre}
            </p>
            <p className="text-sm font-semibold" style={{ color: theme.text }}>{tramiteSeleccionado.nombre}</p>
            <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: theme.textSecondary }}>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {tramiteSeleccionado.tiempo_estimado_dias} días</span>
              <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> {tramiteSeleccionado.costo ? `$${tramiteSeleccionado.costo}` : 'Gratis'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Datos del solicitante */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
          Datos del solicitante
        </p>

        {/* DNI primero — su búsqueda dispara el autocompletado del resto */}
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

        {/* Banner de vecino existente */}
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
                Se autocompletaron los datos filiatorios. Podés editar cualquier campo si cambió.
              </p>
              {vecinoExistente.solicitudes_previas > 0 && (
                <p className="mt-1 flex items-center gap-1" style={{ color: theme.textSecondary }}>
                  <History className="h-3 w-3" />
                  {vecinoExistente.solicitudes_previas} solicitud{vecinoExistente.solicitudes_previas !== 1 ? 'es' : ''} previa{vecinoExistente.solicitudes_previas !== 1 ? 's' : ''} en este municipio
                  {vecinoExistente.ultima_solicitud_fecha && (
                    <> — última el {new Date(vecinoExistente.ultima_solicitud_fecha).toLocaleDateString('es-AR')}</>
                  )}
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
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
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

        <div className="mt-3">
          <DireccionAutocomplete
            label="Dirección"
            value={form.direccion_solicitante}
            onChange={(direccion) => setForm({ ...form, direccion_solicitante: direccion })}
            placeholder="Ej: Av. San Martín 1234"
            inputClassName="py-2"
          />
        </div>
      </div>

      {/* Asunto y descripción */}
      <div className="pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.textSecondary }}>
          Asunto del trámite
        </p>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.text }}>
            Asunto <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.asunto}
            onChange={e => setForm({ ...form, asunto: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
          <p className="text-[10px] mt-1" style={{ color: theme.textSecondary }}>
            Mínimo 10 caracteres ({form.asunto.length}/10)
          </p>
        </div>
        <div className="mt-3">
          <label className="block text-xs mb-1" style={{ color: theme.text }}>
            Observaciones (opcional)
          </label>
          <textarea
            rows={3}
            placeholder="Detalle adicional del trámite"
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      </div>
    </div>
  );

  // ============================================================
  // Step 3: Confirmación
  // ============================================================

  const step3Content = (
    <div className="space-y-4">
      {tramiteSeleccionado && (
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
              style={{ backgroundColor: `${categoriaDelTramite?.color || theme.primary}25` }}
            >
              <DynamicIcon name={categoriaDelTramite?.icono || 'FileText'} className="h-5 w-5" style={{ color: categoriaDelTramite?.color || theme.primary }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                {categoriaDelTramite?.nombre}
              </p>
              <p className="text-base font-semibold" style={{ color: theme.text }}>{tramiteSeleccionado.nombre}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: theme.textSecondary }}>
            <div>
              <p className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Solicitante</p>
              <p style={{ color: theme.text }}>{form.nombre_solicitante} {form.apellido_solicitante}</p>
              <p>DNI: {form.dni_solicitante}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Contacto</p>
              {form.email_solicitante && <p>{form.email_solicitante}</p>}
              {form.telefono_solicitante && <p>{form.telefono_solicitante}</p>}
              {!form.email_solicitante && !form.telefono_solicitante && <p className="italic">Sin contacto</p>}
            </div>
            {form.direccion_solicitante && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Dirección</p>
                <p style={{ color: theme.text }}>{form.direccion_solicitante}</p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Asunto</p>
              <p style={{ color: theme.text }}>{form.asunto}</p>
            </div>
            {form.descripcion && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Observaciones</p>
                <p>{form.descripcion}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aviso sobre documentos */}
      {tramiteSeleccionado && tramiteSeleccionado.documentos_requeridos && tramiteSeleccionado.documentos_requeridos.length > 0 && (
        <div
          className="p-3 rounded-xl flex items-start gap-3"
          style={{
            backgroundColor: '#f59e0b15',
            border: '1px solid #f59e0b40',
          }}
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <div className="flex-1 text-xs" style={{ color: theme.text }}>
            <p className="font-semibold mb-1">
              Este trámite requiere {tramiteSeleccionado.documentos_requeridos.length} documento{tramiteSeleccionado.documentos_requeridos.length !== 1 ? 's' : ''}
            </p>
            <p style={{ color: theme.textSecondary }}>
              Los documentos se cargan y verifican después desde la pantalla de gestión del trámite.
              La solicitud no podrá pasar a "En curso" hasta que los documentos obligatorios estén verificados.
            </p>
            <ul className="mt-2 space-y-0.5 ml-4 list-disc">
              {tramiteSeleccionado.documentos_requeridos.map(d => (
                <li key={d.id} style={{ color: theme.textSecondary }}>
                  {d.nombre}
                  {d.obligatorio && <span className="text-[#ef4444]"> *</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );

  // ============================================================
  // Steps config
  // ============================================================

  const steps: WizardStep[] = [
    {
      id: 'tramite',
      title: 'Trámite',
      description: 'Elegí el trámite a solicitar',
      icon: <FolderTree className="h-4 w-4" />,
      content: step1Content,
      isValid: !!form.tramite_id,
    },
    {
      id: 'solicitante',
      title: 'Solicitante',
      description: 'Datos de la persona',
      icon: <User className="h-4 w-4" />,
      content: step2Content,
      isValid:
        form.nombre_solicitante.trim().length > 0 &&
        form.apellido_solicitante.trim().length > 0 &&
        form.dni_solicitante.trim().length > 0 &&
        form.asunto.trim().length >= 10,
    },
    {
      id: 'confirmar',
      title: 'Confirmar',
      description: 'Revisá y creá la solicitud',
      icon: <CheckCircle2 className="h-4 w-4" />,
      content: step3Content,
      isValid: !!form.tramite_id,
    },
  ];

  return (
    <>
      <WizardModal
        open={open}
        onClose={onClose}
        title="Nueva solicitud de trámite"
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        onComplete={ctxMostrador ? () => setConfirmAbierto(true) : guardar}
        loading={saving}
        completeLabel="Crear solicitud"
        primaryButtonColor={categoriaDelTramite?.color}
      />
      {ctxMostrador && (
        <ConfirmCrearVentanilla
          open={confirmAbierto}
          vecinoNombre={`${ctxMostrador.nombre || ''} ${ctxMostrador.apellido || ''}`.trim() || 'el vecino'}
          tramiteNombre={tramiteSeleccionado?.nombre || 'este trámite'}
          loading={saving}
          color={categoriaDelTramite?.color || '#22c55e'}
          onCancel={() => setConfirmAbierto(false)}
          onConfirm={async () => {
            setConfirmAbierto(false);
            await guardar();
          }}
        />
      )}
    </>
  );
}

// ============================================================
// Modal de confirmación al crear desde el Mostrador
// ============================================================
function ConfirmCrearVentanilla({
  open, vecinoNombre, tramiteNombre, loading, color, onCancel, onConfirm,
}: {
  open: boolean;
  vecinoNombre: string;
  tramiteNombre: string;
  loading: boolean;
  color: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { theme } = useTheme();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl p-5 max-w-md w-full shadow-2xl"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}25`, color }}
          >
            <UserCheck className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              Modo ventanilla
            </p>
            <p className="text-base font-bold" style={{ color: theme.text }}>
              ¿Confirmás crear el trámite?
            </p>
          </div>
        </div>
        <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
          Vas a crear <span className="font-semibold" style={{ color: theme.text }}>{tramiteNombre}</span>{' '}
          a nombre de <span className="font-semibold" style={{ color: theme.text }}>{vecinoNombre}</span>.
          Queda registrado con tu usuario como operador.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            style={{ color: theme.text, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Crear trámite
          </button>
        </div>
      </div>
    </div>
  );
}
