import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  Loader2, FolderTree, Settings, ClipboardList, CheckCircle2, Sparkles,
  Clock, CreditCard, ShieldCheck, ScanFace, CalendarClock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from '../ui/Sheet';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { DynamicIcon } from '../ui/DynamicIcon';
import { ModernSelect } from '../ui/ModernSelect';
import { tramitesApi, categoriasTramiteApi, turnosApi, dependenciasApi } from '../../lib/api';
import {
  DocumentosRequeridosEditor,
  type DocRequeridoDraft,
} from './DocumentosRequeridosEditor';
import {
  TramiteAutocompleteInput,
  type TramiteSugerencia,
} from './TramiteAutocompleteInput';
import { ChipsDocumentosSugeridos } from './ChipsDocumentosSugeridos';
import type { Tramite, CategoriaTramite } from '../../types';

/* ============================================================
 * Alta y edición de trámites como piezas REUSABLES.
 *
 * Antes esta maquinaria vivía adentro de TramitesConfig: la pantalla de
 * Configuración (árbol de trámites) necesita abrir el mismo wizard y el
 * mismo sheet, así que se extrajo acá. Cada pieza carga sus propios
 * catálogos (categorías, oficinas) al abrirse — el caller solo controla
 * `open` y recarga su lista en `onGuardado`.
 * ============================================================ */

/** Campos de cobro que el trámite trae del backend pero que el tipo
 *  `Tramite` del front todavía no declara. Se tipan acá en vez de usar
 *  `any`: si mañana se agregan al tipo, esto se borra y nada se rompe. */
type TramiteCobro = { tipo_pago?: string | null; momento_pago?: string | null };

interface TramiteForm {
  categoria_tramite_id: number | null;
  nombre: string;
  descripcion: string;
  tiempo_estimado_dias: number;
  costo: string;
  url_externa: string;
  requiere_validacion_dni: boolean;
  requiere_validacion_facial: boolean;
  tipo_pago: string;        // '' | 'boton_pago' | 'rapipago' | 'adhesion_debito' | 'qr'
  momento_pago: string;     // '' | 'inicio' | 'fin'
  requiere_cenat: boolean;            // Fase 3 — licencias de conducir
  monto_cenat_referencia: string;
  requiere_kyc: boolean;              // Fase 5 — tramites sensibles
  nivel_kyc_minimo: string;           // "" | "1" | "2"
  // Turnero consolidado (fase C): cómo se atiende el trámite
  modo_atencion: string;              // 'online' | 'presencial_con_turno' | 'presencial_sin_turno'
  duracion_turno_min: string;         // duración del slot si lleva turno
  dependencia_id: string;             // oficina que lo atiende ('' = sin mapear)
  documentos_requeridos: DocRequeridoDraft[];
}

const MODOS_ATENCION = [
  { value: 'presencial_con_turno', label: 'Presencial con turno', description: 'El vecino saca turno y el trámite se hace en la oficina' },
  { value: 'presencial_sin_turno', label: 'Presencial por orden de llegada', description: 'Sin turno: solo informa los requisitos para ir' },
  { value: 'online', label: '100% online', description: 'Expediente digital completo, sin ir al municipio' },
];

const EMPTY_FORM: TramiteForm = {
  categoria_tramite_id: null,
  nombre: '',
  descripcion: '',
  tiempo_estimado_dias: 15,
  costo: '',
  url_externa: '',
  requiere_validacion_dni: false,
  requiere_validacion_facial: false,
  tipo_pago: '',
  momento_pago: '',
  requiere_cenat: false,
  monto_cenat_referencia: '',
  requiere_kyc: false,
  nivel_kyc_minimo: '',
  modo_atencion: 'presencial_con_turno',
  duracion_turno_min: '30',
  dependencia_id: '',
  documentos_requeridos: [],
};

/** Campos comunes a create y update. El create NO manda los de CENAT
 *  (histórico del endpoint: solo se editan) y suma documentos_requeridos;
 *  el update suma los de CENAT. Cada caller agrega lo suyo con spread. */
const payloadBase = (form: TramiteForm) => ({
  categoria_tramite_id: form.categoria_tramite_id!,
  nombre: form.nombre.trim(),
  descripcion: form.descripcion.trim() || undefined,
  tiempo_estimado_dias: form.tiempo_estimado_dias,
  costo: form.costo ? parseFloat(form.costo) : undefined,
  url_externa: form.url_externa.trim() || undefined,
  requiere_validacion_dni: form.requiere_validacion_dni,
  requiere_validacion_facial: form.requiere_validacion_facial,
  tipo_pago: form.tipo_pago || undefined,
  momento_pago: form.momento_pago || undefined,
  requiere_kyc: form.requiere_kyc,
  nivel_kyc_minimo: form.nivel_kyc_minimo ? parseInt(form.nivel_kyc_minimo, 10) : undefined,
  modo_atencion: form.modo_atencion,
  duracion_turno_min: form.duracion_turno_min ? parseInt(form.duracion_turno_min, 10) : undefined,
});

/** Mapea el trámite RAW del backend (GET /api/tramites o /tramites/:id)
 *  al form editable. `depActual` viene del turnero (el listado no lo trae). */
const formDesdeTramite = (t: Tramite, depActual: number | null): TramiteForm => ({
  categoria_tramite_id: t.categoria_tramite_id,
  nombre: t.nombre,
  descripcion: t.descripcion || '',
  tiempo_estimado_dias: t.tiempo_estimado_dias,
  costo: t.costo != null ? String(t.costo) : '',
  url_externa: t.url_externa || '',
  requiere_validacion_dni: !!t.requiere_validacion_dni,
  requiere_validacion_facial: !!t.requiere_validacion_facial,
  tipo_pago: (t as TramiteCobro).tipo_pago || '',
  momento_pago: (t as TramiteCobro).momento_pago || '',
  requiere_cenat: !!t.requiere_cenat,
  monto_cenat_referencia: t.monto_cenat_referencia != null ? String(t.monto_cenat_referencia) : '',
  requiere_kyc: !!(t as { requiere_kyc?: boolean }).requiere_kyc,
  nivel_kyc_minimo: (t as { nivel_kyc_minimo?: number }).nivel_kyc_minimo != null
    ? String((t as { nivel_kyc_minimo?: number }).nivel_kyc_minimo)
    : '',
  modo_atencion: (t as { modo_atencion?: string }).modo_atencion || 'online',
  duracion_turno_min: String((t as { duracion_turno_min?: number }).duracion_turno_min ?? 30),
  dependencia_id: depActual != null ? String(depActual) : '',
  documentos_requeridos: (t.documentos_requeridos || []).map(d => ({
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion || '',
    obligatorio: d.obligatorio,
    orden: d.orden,
  })),
});

/** Extrae el detalle que devuelve el backend en un error de guardado
 *  ("lo iniciaron 12 vecinos"): ese texto es la respuesta útil. */
const detalleError = (err: unknown) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;

/** Bloque "Configuración de cobro" — idéntico en el wizard y en el sheet,
 *  por eso vive como pieza interna. Solo aparece si el costo es > 0. */
function BloqueCobro({ form, setForm }: {
  form: TramiteForm;
  setForm: Dispatch<SetStateAction<TramiteForm>>;
}) {
  const { theme } = useTheme();
  if (!form.costo || !(parseFloat(form.costo) > 0)) return null;
  return (
    <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: `${theme.primary}08`, border: `1px solid ${theme.primary}30` }}>
      <p className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.text }}>
        <CreditCard className="h-4 w-4" style={{ color: theme.primary }} />
        Configuración de cobro
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
            Método de pago
          </label>
          <ModernSelect
            value={form.tipo_pago}
            onChange={(v) => setForm(prev => ({ ...prev, tipo_pago: v }))}
            placeholder="Elegí un método"
            options={[
              { value: '', label: '— Elegí un método —' },
              { value: 'boton_pago', label: 'Botón de Pago (tarjeta web)' },
              { value: 'rapipago', label: 'Rapipago (cupón efectivo)' },
              { value: 'adhesion_debito', label: 'Adhesión Débito (CBU)' },
              { value: 'qr', label: 'QR Interoperable' },
            ]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
            Momento de cobro
          </label>
          <ModernSelect
            value={form.momento_pago}
            onChange={(v) => setForm(prev => ({ ...prev, momento_pago: v }))}
            placeholder="Elegí cuándo cobrar"
            options={[
              { value: '', label: '— Elegí cuándo cobrar —' },
              { value: 'inicio', label: 'Al inicio (antes de trabajar)' },
              { value: 'fin', label: 'Al final (al retirar)' },
            ]}
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
        <strong>Inicio</strong>: el vecino paga primero y la dependencia recién entonces toma el trámite.{' '}
        <strong>Fin</strong>: la dependencia trabaja y el vecino paga al retirar el resultado.
      </p>
    </div>
  );
}

/* ============================================================
 * Wizard de ALTA
 * ============================================================ */

export function AltaTramiteWizard({ open, onClose, onGuardado, categoriaInicial }: {
  open: boolean;
  onClose: () => void;
  /** Se llama tras crear OK (el caller recarga su lista). */
  onGuardado: () => void;
  /** Preselecciona la categoría al abrir desde una rama del árbol. */
  categoriaInicial?: number | null;
}) {
  const { theme } = useTheme();
  const [categorias, setCategorias] = useState<CategoriaTramite[]>([]);
  const [wizardStep, setWizardStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TramiteForm>(EMPTY_FORM);

  // Al abrir: form limpio y catálogo de categorías fresco. Si el caller no
  // preseleccionó ninguna (categoriaInicial), arranca en la primera — mismo
  // default que tenía la pantalla de trámites.
  useEffect(() => {
    if (!open) return;
    setWizardStep(0);
    setForm({ ...EMPTY_FORM, categoria_tramite_id: categoriaInicial ?? null });
    categoriasTramiteApi.getAll()
      .then(res => {
        const cats: CategoriaTramite[] = res.data || [];
        setCategorias(cats);
        setForm(prev => prev.categoria_tramite_id == null
          ? { ...prev, categoria_tramite_id: cats[0]?.id ?? null }
          : prev);
      })
      .catch(() => toast.error('Error cargando categorías'));
  }, [open, categoriaInicial]);

  const selectedCategoria = useMemo(
    () => categorias.find(c => c.id === form.categoria_tramite_id),
    [categorias, form.categoria_tramite_id],
  );

  /**
   * Cuando el admin elige una sugerencia del catálogo global, precargamos
   * los campos básicos del form (nombre, descripción, tiempo, costo).
   *
   * NO precargamos los documentos requeridos: se mostrarán como chips
   * sugeridos en el Step 3 (`ChipsDocumentosSugeridos`) para que el admin
   * decida cuáles agregar tocando los chips, uno por uno.
   */
  const handleSelectSugerencia = (sug: TramiteSugerencia) => {
    setForm(prev => ({
      ...prev,
      nombre: sug.nombre,
      descripcion: sug.descripcion || prev.descripcion,
      tiempo_estimado_dias: sug.tiempo_estimado_dias ?? prev.tiempo_estimado_dias,
      costo: sug.costo != null ? String(sug.costo) : prev.costo,
      // No se tocan documentos_requeridos — se sugieren como chips en Step 3
    }));
  };

  /**
   * Agrega un documento a la lista de docs requeridos del form (usado por
   * los chips sugeridos en el Step 3). Si ya existe uno con el mismo nombre
   * (case-insensitive), no lo duplica.
   */
  const agregarDocRequerido = (nombreDoc: string) => {
    setForm(prev => {
      const yaExiste = prev.documentos_requeridos.some(
        d => d.nombre.toLowerCase().trim() === nombreDoc.toLowerCase().trim(),
      );
      if (yaExiste) return prev;
      return {
        ...prev,
        documentos_requeridos: [
          ...prev.documentos_requeridos,
          {
            nombre: nombreDoc,
            descripcion: '',
            obligatorio: true,
            orden: prev.documentos_requeridos.length + 1,
          },
        ],
      };
    });
  };

  const guardar = async () => {
    if (!form.categoria_tramite_id) {
      toast.error('Seleccioná una categoría');
      return;
    }
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const creado = await tramitesApi.create({
        ...payloadBase(form),
        documentos_requeridos: form.documentos_requeridos
          .filter(d => d.nombre.trim())
          .map(d => ({
            nombre: d.nombre,
            descripcion: d.descripcion || undefined,
            obligatorio: d.obligatorio,
            orden: d.orden,
          })),
      });
      // Mapeo trámite→oficina del recién creado
      const nuevoId = (creado.data as { id?: number })?.id;
      if (nuevoId && form.dependencia_id) {
        await turnosApi.setDependenciaTramite(nuevoId, Number(form.dependencia_id))
          .catch(() => toast.error('El trámite se creó pero no se pudo asignar la oficina'));
      }
      toast.success('Trámite creado');
      onClose();
      onGuardado();
    } catch (err) {
      toast.error(detalleError(err) || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const step1Content = (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Categoría <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categorias.map(c => {
            const active = form.categoria_tramite_id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setForm({ ...form, categoria_tramite_id: c.id })}
                className="flex items-center gap-2 p-3 rounded-xl text-left transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: active ? `${c.color || theme.primary}20` : theme.backgroundSecondary,
                  border: `2px solid ${active ? (c.color || theme.primary) : 'transparent'}`,
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${c.color || theme.primary}25` }}
                >
                  <DynamicIcon name={c.icono || 'Folder'} className="h-4 w-4" style={{ color: c.color || theme.primary }} />
                </div>
                <span className="text-xs font-medium" style={{ color: theme.text }}>{c.nombre}</span>
              </button>
            );
          })}
        </div>
        {categorias.length === 0 && (
          <p className="text-sm italic" style={{ color: theme.textSecondary }}>
            No hay categorías de trámite cargadas. Creá primero una en "Categorías Trámite".
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Nombre del trámite <span className="text-red-500">*</span>
        </label>
        <TramiteAutocompleteInput
          value={form.nombre}
          onChange={nombre => setForm({ ...form, nombre })}
          onSelectSugerencia={handleSelectSugerencia}
          placeholder="Empezá a escribir, ej: Licencia de Conducir..."
        />
        <p className="text-[11px] mt-1.5" style={{ color: theme.textSecondary }}>
          Escribí y elegí una sugerencia del catálogo para precargar tiempo, costo y documentos
          requeridos. También podés escribir un trámite propio y seguir sin elegir nada.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          Descripción
        </label>
        <textarea
          rows={3}
          placeholder="Explicá brevemente de qué se trata este trámite"
          value={form.descripcion}
          onChange={e => setForm({ ...form, descripcion: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm resize-none"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>
    </div>
  );

  const step2Content = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: theme.text }}>
            <Clock className="h-4 w-4" style={{ color: theme.textSecondary }} />
            Tiempo estimado (días)
          </label>
          <input
            type="number"
            min={1}
            value={form.tiempo_estimado_dias}
            onChange={e => setForm({ ...form, tiempo_estimado_dias: parseInt(e.target.value) || 1 })}
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2" style={{ color: theme.text }}>
            <CreditCard className="h-4 w-4" style={{ color: theme.textSecondary }} />
            Costo (vacío = gratis)
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.costo}
            onChange={e => setForm({ ...form, costo: e.target.value })}
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
          URL externa (opcional)
        </label>
        <input
          type="text"
          placeholder="https://... (sitio oficial o guía del trámite)"
          value={form.url_externa}
          onChange={e => setForm({ ...form, url_externa: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
        />
      </div>

      {/* Configuración de pago — solo si tiene costo > 0 */}
      <BloqueCobro form={form} setForm={setForm} />

      <div className="space-y-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
        <p className="text-sm font-medium" style={{ color: theme.text }}>
          Validaciones requeridas al solicitar el trámite
        </p>
        <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-black/5" style={{ backgroundColor: theme.backgroundSecondary }}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.requiere_validacion_dni}
            onChange={e => setForm({ ...form, requiere_validacion_dni: e.target.checked })}
          />
          <div className="flex items-start gap-2 flex-1">
            <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>Validación de DNI</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Pedirá foto del DNI frente y dorso al iniciar el trámite</p>
            </div>
          </div>
        </label>
        <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-black/5" style={{ backgroundColor: theme.backgroundSecondary }}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.requiere_validacion_facial}
            onChange={e => setForm({ ...form, requiere_validacion_facial: e.target.checked })}
          />
          <div className="flex items-start gap-2 flex-1">
            <ScanFace className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>Validación facial (selfie)</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Pedirá una selfie para verificar que sea la misma persona del DNI</p>
            </div>
          </div>
        </label>
      </div>
    </div>
  );

  const step3Content = (
    <div className="space-y-3">
      <div className="p-3 rounded-xl flex items-start gap-3" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
        <Sparkles className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
        <p className="text-xs" style={{ color: theme.text }}>
          Listá los documentos que el vecino deberá adjuntar cuando inicie el trámite.
          Los marcados como <strong>obligatorios</strong> deberán estar verificados por un supervisor
          antes de que el trámite pueda pasar de "Recibido" a "En curso".
        </p>
      </div>

      {/* Chips de documentos sugeridos del catalogo global. Priorizan los
          que matchean con el nombre del tramite y los mas frecuentes en el
          rubro de la categoria elegida. No auto-cargan nada — el admin
          decide tocando cada chip. */}
      <ChipsDocumentosSugeridos
        rubro={selectedCategoria?.nombre}
        nombreTramite={form.nombre}
        nombresYaAgregados={form.documentos_requeridos.map(d => d.nombre)}
        onAgregar={agregarDocRequerido}
      />

      <DocumentosRequeridosEditor
        items={form.documentos_requeridos}
        onChange={(items) => setForm({ ...form, documentos_requeridos: items })}
      />
    </div>
  );

  const step4Content = (
    <div className="space-y-4">
      <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
        <div className="flex items-center gap-3 mb-3">
          {selectedCategoria && (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${selectedCategoria.color || theme.primary}25` }}
            >
              <DynamicIcon name={selectedCategoria.icono || 'Folder'} className="h-5 w-5" style={{ color: selectedCategoria.color || theme.primary }} />
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs" style={{ color: theme.textSecondary }}>{selectedCategoria?.nombre || '—'}</p>
            <h3 className="text-base font-semibold" style={{ color: theme.text }}>{form.nombre || 'Sin nombre'}</h3>
          </div>
        </div>
        {form.descripcion && (
          <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>{form.descripcion}</p>
        )}
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: theme.textSecondary }}>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {form.tiempo_estimado_dias} días estimados
          </span>
          <span className="flex items-center gap-1">
            <CreditCard className="h-3.5 w-3.5" />
            {form.costo ? `$${parseFloat(form.costo).toLocaleString('es-AR')}` : 'Gratis'}
          </span>
          {form.requiere_validacion_dni && (
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Valida DNI
            </span>
          )}
          {form.requiere_validacion_facial && (
            <span className="flex items-center gap-1">
              <ScanFace className="h-3.5 w-3.5" />
              Valida rostro
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2" style={{ color: theme.text }}>
          Documentos requeridos ({form.documentos_requeridos.length})
        </p>
        {form.documentos_requeridos.length === 0 ? (
          <p className="text-xs italic" style={{ color: theme.textSecondary }}>
            No definiste documentos requeridos. Podrás agregarlos después editando el trámite.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {form.documentos_requeridos.map((d, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 p-2 rounded-lg text-sm"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: d.obligatorio ? '#10b981' : theme.textSecondary }} />
                <span style={{ color: theme.text }}>{d.nombre || <em>(sin nombre)</em>}</span>
                {d.obligatorio && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                    Obligatorio
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const wizardSteps: WizardStep[] = [
    {
      id: 'basico',
      title: 'Datos básicos',
      description: 'Categoría, nombre y descripción del trámite',
      icon: <FolderTree className="h-4 w-4" />,
      content: step1Content,
      isValid: !!form.categoria_tramite_id && form.nombre.trim().length > 0,
    },
    {
      id: 'config',
      title: 'Configuración',
      description: 'Tiempo, costo y validaciones',
      icon: <Settings className="h-4 w-4" />,
      content: step2Content,
      isValid: form.tiempo_estimado_dias > 0,
    },
    {
      id: 'docs',
      title: 'Documentación',
      description: 'Lista de documentos requeridos',
      icon: <ClipboardList className="h-4 w-4" />,
      content: step3Content,
      isValid: true, // Los documentos son opcionales (se pueden agregar después)
    },
    {
      id: 'confirmacion',
      title: 'Confirmación',
      description: 'Revisá y confirmá el trámite',
      icon: <CheckCircle2 className="h-4 w-4" />,
      content: step4Content,
      isValid: !!form.categoria_tramite_id && form.nombre.trim().length > 0,
    },
  ];

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="Nuevo trámite"
      steps={wizardSteps}
      currentStep={wizardStep}
      onStepChange={setWizardStep}
      onComplete={guardar}
      loading={saving}
      completeLabel="Crear trámite"
      primaryButtonColor={selectedCategoria?.color}
    />
  );
}

/* ============================================================
 * Sheet de EDICIÓN
 * ============================================================ */

export function EdicionTramiteSheet({ open, tramite, onClose, onGuardado }: {
  open: boolean;
  /** El trámite RAW tal como lo devuelve GET /api/tramites (con documentos_requeridos). null = cerrado. */
  tramite: Tramite | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { theme } = useTheme();
  const [categorias, setCategorias] = useState<CategoriaTramite[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TramiteForm>(EMPTY_FORM);

  // Oficinas del muni para el mapeo trámite→dependencia (turnero)
  const [dependencias, setDependencias] = useState<{ id: number; nombre?: string; dependencia?: { nombre?: string } }[]>([]);
  const opcionesDependencia = useMemo(() => ([
    { value: '', label: 'Sin oficina asignada (el turnero no puede reservar)' },
    ...dependencias.map(d => ({
      value: String(d.id),
      label: d.dependencia?.nombre || d.nombre || `Oficina ${d.id}`,
    })),
  ]), [dependencias]);

  // Catálogos al abrir: categorías (para el combo) y oficinas (turnero).
  useEffect(() => {
    if (!open) return;
    categoriasTramiteApi.getAll()
      .then(res => setCategorias(res.data || []))
      .catch(() => toast.error('Error cargando categorías'));
    dependenciasApi.getMunicipio({ activo: true })
      .then(res => setDependencias(res.data || []))
      .catch(() => setDependencias([]));
  }, [open]);

  // Al abrir con un trámite: el form se puebla al toque desde el RAW del
  // listado (ya trae documentos_requeridos) para no mostrar un form vacío,
  // y se refresca con GET /tramites/:id más la oficina asignada — el único
  // dato que el listado no trae.
  useEffect(() => {
    if (!open || !tramite) return;
    setForm(formDesdeTramite(tramite, null));
    let cancelado = false;
    (async () => {
      try {
        const res = await tramitesApi.getOne(tramite.id);
        const t = res.data as Tramite;
        const depActual = await turnosApi.getDependenciaTramite(tramite.id)
          .then(r => (r.data as { municipio_dependencia_id?: number | null })?.municipio_dependencia_id ?? null)
          .catch(() => null);
        if (!cancelado) setForm(formDesdeTramite(t, depActual));
      } catch {
        if (!cancelado) toast.error('Error cargando trámite');
      }
    })();
    return () => { cancelado = true; };
  }, [open, tramite]);

  const guardar = async () => {
    if (!tramite) return;
    if (!form.categoria_tramite_id) {
      toast.error('Seleccioná una categoría');
      return;
    }
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      await tramitesApi.update(tramite.id, {
        ...payloadBase(form),
        requiere_cenat: form.requiere_cenat,
        monto_cenat_referencia: form.monto_cenat_referencia ? parseFloat(form.monto_cenat_referencia) : undefined,
      });

      // Sincronizar documentos requeridos contra los que traía el trámite
      const idsActuales = new Set(
        form.documentos_requeridos.filter(d => d.id).map(d => d.id!),
      );
      for (const old of tramite.documentos_requeridos || []) {
        if (!idsActuales.has(old.id)) {
          await tramitesApi.deleteDocumentoRequerido(old.id);
        }
      }
      for (const draft of form.documentos_requeridos) {
        if (!draft.nombre.trim()) continue;
        if (draft.id) {
          await tramitesApi.updateDocumentoRequerido(draft.id, {
            nombre: draft.nombre,
            descripcion: draft.descripcion || undefined,
            obligatorio: draft.obligatorio,
            orden: draft.orden,
          });
        } else {
          await tramitesApi.addDocumentoRequerido(tramite.id, {
            nombre: draft.nombre,
            descripcion: draft.descripcion || undefined,
            obligatorio: draft.obligatorio,
            orden: draft.orden,
          });
        }
      }
      // Mapeo trámite→oficina (el turnero lo necesita para saber la agenda)
      await turnosApi.setDependenciaTramite(
        tramite.id,
        form.dependencia_id ? Number(form.dependencia_id) : null,
      ).catch(() => toast.error('El trámite se guardó pero no se pudo asignar la oficina'));

      toast.success('Trámite actualizado');
      onClose();
      onGuardado();
    } catch (err) {
      toast.error(detalleError(err) || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open && !!tramite}
      onClose={onClose}
      title="Editar trámite"
      description="Modificá los datos y los documentos requeridos"
      stickyFooter={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: theme.primary, color: 'var(--pl-on-accent)' }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
            Categoría <span className="text-red-500">*</span>
          </label>
          <ModernSelect
            value={form.categoria_tramite_id != null ? String(form.categoria_tramite_id) : ''}
            onChange={(v) => setForm({ ...form, categoria_tramite_id: Number(v) || null })}
            placeholder="Seleccionar categoría"
            options={categorias.map(c => ({ value: String(c.id), label: c.nombre }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
            Nombre del trámite <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
            Descripción
          </label>
          <textarea
            rows={3}
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Tiempo estimado (días)
            </label>
            <input
              type="number"
              min={1}
              value={form.tiempo_estimado_dias}
              onChange={e => setForm({ ...form, tiempo_estimado_dias: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Costo (vacío = gratis)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.costo}
              onChange={e => setForm({ ...form, costo: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
            URL externa (opcional)
          </label>
          <input
            type="text"
            placeholder="https://..."
            value={form.url_externa}
            onChange={e => setForm({ ...form, url_externa: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
          />
        </div>

        {/* Configuración de cobro — solo si tiene costo > 0 */}
        <BloqueCobro form={form} setForm={setForm} />

        <div className="space-y-2">
          {/* Modo de atención (turnero consolidado) */}
          <div className="mb-3">
            <label className="block text-[11px] mb-1 font-semibold uppercase" style={{ color: theme.textSecondary }}>
              Cómo se atiende este trámite
            </label>
            <ModernSelect
              value={form.modo_atencion}
              onChange={(v) => setForm({ ...form, modo_atencion: v })}
              options={MODOS_ATENCION}
            />
            {form.modo_atencion === 'presencial_con_turno' && (
              <div className="mt-2">
                <label className="block text-[11px] mb-1" style={{ color: theme.textSecondary }}>
                  Duración de cada turno (minutos)
                </label>
                <ModernSelect
                  value={form.duracion_turno_min}
                  onChange={(v) => setForm({ ...form, duracion_turno_min: v })}
                  options={[
                    { value: '15', label: '15 minutos' },
                    { value: '30', label: '30 minutos' },
                    { value: '45', label: '45 minutos' },
                    { value: '60', label: '60 minutos' },
                  ]}
                />
              </div>
            )}
            {form.modo_atencion !== 'online' && (
              <div className="mt-2">
                <label className="block text-[11px] mb-1" style={{ color: theme.textSecondary }}>
                  Oficina que lo atiende
                </label>
                <ModernSelect
                  value={form.dependencia_id}
                  onChange={(v) => setForm({ ...form, dependencia_id: v })}
                  options={opcionesDependencia}
                  searchable
                />
                {form.dependencia_id && (
                  <div className="flex items-center gap-2 mt-2">
                    <Link
                      to={`/gestion/configuracion-agenda?dependencia_id=${form.dependencia_id}`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                    >
                      <Clock className="h-3.5 w-3.5" /> Ver horarios
                    </Link>
                    {form.modo_atencion === 'presencial_con_turno' && (
                      <Link
                        to={`/gestion/agenda-turnos?dependencia_id=${form.dependencia_id}`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Ver agenda
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={form.requiere_validacion_dni}
              onChange={e => setForm({ ...form, requiere_validacion_dni: e.target.checked })}
            />
            Requiere validación de DNI (foto frente/dorso)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={form.requiere_validacion_facial}
              onChange={e => setForm({ ...form, requiere_validacion_facial: e.target.checked })}
            />
            Requiere validación facial (selfie)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={form.requiere_cenat}
              onChange={e => setForm({ ...form, requiere_cenat: e.target.checked })}
            />
            Requiere comprobante CENAT (licencias — ANSV)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={form.requiere_kyc}
              onChange={e => setForm({ ...form, requiere_kyc: e.target.checked, nivel_kyc_minimo: e.target.checked && !form.nivel_kyc_minimo ? '2' : form.nivel_kyc_minimo })}
            />
            Requiere verificación biométrica (KYC)
          </label>
          {form.requiere_kyc && (
            <div className="ml-6 mt-1">
              <label className="block text-[11px] mb-1" style={{ color: theme.textSecondary }}>
                Nivel mínimo exigido
              </label>
              <div className="max-w-xs">
                <ModernSelect
                  value={form.nivel_kyc_minimo}
                  onChange={(v) => setForm({ ...form, nivel_kyc_minimo: v })}
                  options={[
                    { value: '1', label: 'Nivel 1 — Email verificado' },
                    { value: '2', label: 'Nivel 2 — DNI + selfie (biometría)' },
                  ]}
                />
              </div>
            </div>
          )}
          {form.requiere_cenat && (
            <div className="ml-6 mt-1">
              <label className="block text-[11px] mb-1" style={{ color: theme.textSecondary }}>
                Monto CENAT de referencia (solo informativo)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.monto_cenat_referencia}
                onChange={e => setForm({ ...form, monto_cenat_referencia: e.target.value })}
                placeholder="Ej: 2500"
                className="w-40 px-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              />
            </div>
          )}
        </div>

        <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
          <DocumentosRequeridosEditor
            items={form.documentos_requeridos}
            onChange={(items) => setForm({ ...form, documentos_requeridos: items })}
          />
        </div>
      </div>
    </Sheet>
  );
}
