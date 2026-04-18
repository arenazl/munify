import { useEffect, useState, useMemo } from 'react';
import {
  Pencil, Trash2, Loader2, FileText, FolderTree, Settings,
  ClipboardList, CheckCircle2, Sparkles, Clock, CreditCard,
  ShieldCheck, ScanFace,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { WizardModal, type WizardStep } from '../components/ui/WizardModal';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import PageHint from '../components/ui/PageHint';
import { tramitesApi, categoriasTramiteApi } from '../lib/api';
import {
  DocumentosRequeridosEditor,
  type DocRequeridoDraft,
} from '../components/config/DocumentosRequeridosEditor';
import {
  TramiteAutocompleteInput,
  type TramiteSugerencia,
} from '../components/config/TramiteAutocompleteInput';
import { ChipsDocumentosSugeridos } from '../components/config/ChipsDocumentosSugeridos';
import type { Tramite, CategoriaTramite } from '../types';

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
  documentos_requeridos: DocRequeridoDraft[];
}

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
  documentos_requeridos: [],
};

export default function TramitesConfig() {
  const { theme } = useTheme();
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [categorias, setCategorias] = useState<CategoriaTramite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null);

  // Wizard (alta nueva)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Sheet (edición)
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Tramite | null>(null);

  // Form y guardado compartidos entre alta y edición
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TramiteForm>(EMPTY_FORM);

  const cargar = async () => {
    setLoading(true);
    try {
      const [tramRes, catRes] = await Promise.all([
        tramitesApi.getAll(),
        categoriasTramiteApi.getAll(),
      ]);
      setTramites(tramRes.data);
      setCategorias(catRes.data);
    } catch (err) {
      toast.error('Error cargando trámites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // ============ Apertura de alta (wizard) vs edición (sheet) ============

  const abrirNuevo = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      categoria_tramite_id: categorias[0]?.id ?? null,
    });
    setWizardStep(0);
    setWizardOpen(true);
  };

  const abrirEdit = async (tramite: Tramite) => {
    setEditing(tramite);
    try {
      const res = await tramitesApi.getOne(tramite.id);
      const t = res.data as Tramite;
      setForm({
        categoria_tramite_id: t.categoria_tramite_id,
        nombre: t.nombre,
        descripcion: t.descripcion || '',
        tiempo_estimado_dias: t.tiempo_estimado_dias,
        costo: t.costo != null ? String(t.costo) : '',
        url_externa: t.url_externa || '',
        requiere_validacion_dni: !!t.requiere_validacion_dni,
        requiere_validacion_facial: !!t.requiere_validacion_facial,
        tipo_pago: (t as any).tipo_pago || '',
        momento_pago: (t as any).momento_pago || '',
        documentos_requeridos: (t.documentos_requeridos || []).map(d => ({
          id: d.id,
          nombre: d.nombre,
          descripcion: d.descripcion || '',
          obligatorio: d.obligatorio,
          orden: d.orden,
        })),
      });
      setEditSheetOpen(true);
    } catch (err) {
      toast.error('Error cargando trámite');
    }
  };

  // ============ Guardar (alta desde wizard o edición desde sheet) ============

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
      if (editing) {
        await tramitesApi.update(editing.id, {
          categoria_tramite_id: form.categoria_tramite_id,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          tiempo_estimado_dias: form.tiempo_estimado_dias,
          costo: form.costo ? parseFloat(form.costo) : undefined,
          url_externa: form.url_externa.trim() || undefined,
          requiere_validacion_dni: form.requiere_validacion_dni,
          requiere_validacion_facial: form.requiere_validacion_facial,
          tipo_pago: form.tipo_pago || undefined,
          momento_pago: form.momento_pago || undefined,
        });

        // Sincronizar documentos requeridos
        const idsActuales = new Set(
          form.documentos_requeridos.filter(d => d.id).map(d => d.id!),
        );
        for (const old of editing.documentos_requeridos || []) {
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
            await tramitesApi.addDocumentoRequerido(editing.id, {
              nombre: draft.nombre,
              descripcion: draft.descripcion || undefined,
              obligatorio: draft.obligatorio,
              orden: draft.orden,
            });
          }
        }
        toast.success('Trámite actualizado');
        setEditSheetOpen(false);
      } else {
        await tramitesApi.create({
          categoria_tramite_id: form.categoria_tramite_id,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          tiempo_estimado_dias: form.tiempo_estimado_dias,
          costo: form.costo ? parseFloat(form.costo) : undefined,
          url_externa: form.url_externa.trim() || undefined,
          requiere_validacion_dni: form.requiere_validacion_dni,
          requiere_validacion_facial: form.requiere_validacion_facial,
          tipo_pago: form.tipo_pago || undefined,
          momento_pago: form.momento_pago || undefined,
          documentos_requeridos: form.documentos_requeridos
            .filter(d => d.nombre.trim())
            .map(d => ({
              nombre: d.nombre,
              descripcion: d.descripcion || undefined,
              obligatorio: d.obligatorio,
              orden: d.orden,
            })),
        });
        toast.success('Trámite creado');
        setWizardOpen(false);
      }
      await cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (t: Tramite) => {
    if (!confirm(`¿Eliminar trámite "${t.nombre}"?`)) return;
    try {
      await tramitesApi.delete(t.id);
      toast.success('Trámite eliminado');
      await cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error eliminando');
    }
  };

  const filtrados = tramites.filter(t => {
    if (filtroCategoria && t.categoria_tramite_id !== filtroCategoria) return false;
    if (search && !t.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tramitesPorCat = filtrados.reduce<Record<number, Tramite[]>>((acc, t) => {
    (acc[t.categoria_tramite_id] ||= []).push(t);
    return acc;
  }, {});

  // ============ Steps del wizard ============

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
      {!!form.costo && parseFloat(form.costo) > 0 && (
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
              <select
                value={form.tipo_pago}
                onChange={e => setForm({ ...form, tipo_pago: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
              >
                <option value="">— Elegí un método —</option>
                <option value="boton_pago">Botón de Pago (tarjeta web)</option>
                <option value="rapipago">Rapipago (cupón efectivo)</option>
                <option value="adhesion_debito">Adhesión Débito (CBU)</option>
                <option value="qr">QR Interoperable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Momento de cobro
              </label>
              <select
                value={form.momento_pago}
                onChange={e => setForm({ ...form, momento_pago: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
              >
                <option value="">— Elegí cuándo cobrar —</option>
                <option value="inicio">Al inicio (antes de trabajar)</option>
                <option value="fin">Al final (al retirar)</option>
              </select>
            </div>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
            <strong>Inicio</strong>: el vecino paga primero y la dependencia recién entonces toma el trámite.{' '}
            <strong>Fin</strong>: la dependencia trabaja y el vecino paga al retirar el resultado.
          </p>
        </div>
      )}

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
    <div className="h-full flex flex-col">
      {/* Hint SIEMPRE arriba de todo (consistencia con otras pantallas de settings) */}
      <div className="px-3 sm:px-6 pt-3">
        <PageHint pageId="tramites-config" />
      </div>

      <StickyPageHeader
        backLink="/gestion/ajustes"
        icon={<FileText className="h-5 w-5" />}
        title="Trámites"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar trámite..."
        buttonLabel="Nuevo trámite"
        onButtonClick={abrirNuevo}
        filterPanel={
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFiltroCategoria(null)}
              className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors flex-shrink-0"
              style={{
                backgroundColor: filtroCategoria === null ? theme.primary : theme.backgroundSecondary,
                color: filtroCategoria === null ? '#fff' : theme.text,
              }}
            >
              Todas
            </button>
            {categorias.map(c => (
              <button
                key={c.id}
                onClick={() => setFiltroCategoria(c.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors flex-shrink-0"
                style={{
                  backgroundColor: filtroCategoria === c.id ? c.color || theme.primary : theme.backgroundSecondary,
                  color: filtroCategoria === c.id ? '#fff' : theme.text,
                }}
              >
                <DynamicIcon name={c.icono || 'Folder'} className="h-3 w-3" />
                {c.nombre}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20" style={{ color: theme.textSecondary }}>
            {tramites.length === 0
              ? 'No hay trámites cargados. Hacé click en "Nuevo trámite" para crear el primero.'
              : 'Sin resultados para los filtros aplicados.'}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(tramitesPorCat).map(([catId, lista]) => {
              const cat = categorias.find(c => c.id === Number(catId));
              return (
                <div key={catId}>
                  <div className="flex items-center gap-2 mb-3">
                    {cat?.icono && (
                      <DynamicIcon name={cat.icono} className="h-5 w-5" style={{ color: cat.color || theme.primary }} />
                    )}
                    <h2 className="text-base font-semibold" style={{ color: theme.text }}>
                      {cat?.nombre || 'Sin categoría'}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
                      {lista.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {lista.map(t => (
                      <div
                        key={t.id}
                        className="p-4 rounded-xl flex items-start gap-3 transition-all duration-200 hover:scale-[1.02]"
                        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                            {t.nombre}
                          </h3>
                          {t.descripcion && (
                            <p className="text-xs mt-1 line-clamp-2" style={{ color: theme.textSecondary }}>
                              {t.descripcion}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                            <span>{t.tiempo_estimado_dias} días</span>
                            {t.costo ? <span>${t.costo}</span> : <span>Gratis</span>}
                            {t.documentos_requeridos?.length > 0 && (
                              <span>{t.documentos_requeridos.length} docs</span>
                            )}
                          </div>
                          {/* Badge de método de cobro — solo si tiene costo */}
                          {!!t.costo && t.costo > 0 && (() => {
                            const tp = (t as any).tipo_pago as string | null;
                            const mp = (t as any).momento_pago as string | null;
                            const tipoPagoMeta: Record<string, { label: string; color: string; emoji: string }> = {
                              boton_pago: { label: 'Botón de Pago', color: '#3b82f6', emoji: '💳' },
                              rapipago: { label: 'Rapipago', color: '#ef4444', emoji: '🧾' },
                              adhesion_debito: { label: 'Adhesión Débito', color: '#10b981', emoji: '🔁' },
                              qr: { label: 'QR', color: '#8b5cf6', emoji: '📱' },
                            };
                            const meta = tp ? tipoPagoMeta[tp] : null;
                            if (!meta) {
                              return (
                                <div
                                  className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
                                  style={{ backgroundColor: '#f59e0b15', color: '#f59e0b', border: '1px solid #f59e0b40' }}
                                  title="Tiene costo pero no tiene método de cobro asignado"
                                >
                                  ⚠️ Sin método de cobro
                                </div>
                              );
                            }
                            return (
                              <div
                                className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
                                style={{
                                  backgroundColor: `${meta.color}15`,
                                  color: meta.color,
                                  border: `1px solid ${meta.color}40`,
                                }}
                                title={`Cobra ${mp === 'fin' ? 'al retirar' : 'al iniciar el trámite'}`}
                              >
                                {meta.emoji} {meta.label}
                                {mp && <span className="opacity-70">· {mp === 'fin' ? 'al retirar' : 'al inicio'}</span>}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={() => abrirEdit(t)}
                            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                            style={{ color: theme.textSecondary }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => eliminar(t)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wizard: alta de trámite nuevo */}
      <WizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Nuevo trámite"
        steps={wizardSteps}
        currentStep={wizardStep}
        onStepChange={setWizardStep}
        onComplete={guardar}
        loading={saving}
        completeLabel="Crear trámite"
        primaryButtonColor={selectedCategoria?.color}
      />

      {/* Sheet: edición de trámite existente */}
      <Sheet
        open={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        title="Editar trámite"
        description="Modificá los datos y los documentos requeridos"
        stickyFooter={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditSheetOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
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
            <select
              value={form.categoria_tramite_id ?? ''}
              onChange={e => setForm({ ...form, categoria_tramite_id: Number(e.target.value) || null })}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            >
              <option value="">Seleccionar categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
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
          {!!form.costo && parseFloat(form.costo) > 0 && (
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
                  <select
                    value={form.tipo_pago}
                    onChange={e => setForm({ ...form, tipo_pago: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                  >
                    <option value="">— Elegí un método —</option>
                    <option value="boton_pago">💳 Botón de Pago (tarjeta web)</option>
                    <option value="rapipago">🧾 Rapipago (cupón efectivo)</option>
                    <option value="adhesion_debito">🔁 Adhesión Débito (CBU)</option>
                    <option value="qr">📱 QR Interoperable</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Momento de cobro
                  </label>
                  <select
                    value={form.momento_pago}
                    onChange={e => setForm({ ...form, momento_pago: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                  >
                    <option value="">— Elegí cuándo cobrar —</option>
                    <option value="inicio">Al inicio (antes de trabajar)</option>
                    <option value="fin">Al final (al retirar)</option>
                  </select>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                <strong>Inicio</strong>: el vecino paga primero y la dependencia recién entonces toma el trámite.{' '}
                <strong>Fin</strong>: la dependencia trabaja y el vecino paga al retirar el resultado.
              </p>
            </div>
          )}

          <div className="space-y-2">
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
          </div>

          <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <DocumentosRequeridosEditor
              items={form.documentos_requeridos}
              onChange={(items) => setForm({ ...form, documentos_requeridos: items })}
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
