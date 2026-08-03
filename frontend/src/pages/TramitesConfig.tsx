import { useEffect, useState, useMemo } from 'react';
import {
  Pencil, Trash2, Loader2, FileText, FolderTree, Settings,
  ClipboardList, CheckCircle2, Sparkles, Clock, CreditCard,
  ShieldCheck, ScanFace, Calendar, Users, Globe, CalendarClock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { WizardModal, type WizardStep } from '../components/ui/WizardModal';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import { type HeroFrase, seg } from '../lib/semanticHero';
import { tramitesApi, categoriasTramiteApi, turnosApi, dependenciasApi } from '../lib/api';
import { ModernSelect } from '../components/ui/ModernSelect';
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
import { useReportarTotal } from '../components/abmv2/useEmbed';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { TreeList } from '../components/abmv2/TreeList';
import type { ChipTone, TreeNode } from '../components/abmv2/types';

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

// Badge de "cómo se atiende" en las cards del listado — mismo lenguaje visual
// que Agenda/Horarios para que se lea como una sola unidad (turnero consolidado).
const MODO_ATENCION_META: Record<string, { label: string; icon: typeof Calendar; color: string }> = {
  presencial_con_turno: { label: 'Con turno', icon: Calendar, color: '#3b82f6' },
  presencial_sin_turno: { label: 'Sin turno', icon: Users, color: '#f59e0b' },
  online: { label: 'Online', icon: Globe, color: '#10b981' },
};

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

export default function TramitesConfig() {
  const { theme } = useTheme();
  const [tramites, setTramites] = useState<Tramite[]>([]);
  // Publica el total para el contador del riel de Configuración.
  useReportarTotal(tramites.length);
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

  // Borrado con confirmación (antes era `confirm()` nativo).
  const [aBorrar, setABorrar] = useState<Tramite | null>(null);
  const [borrando, setBorrando] = useState(false);

  // Ramas abiertas del árbol. Se reabren todas al recargar: después de crear
  // o editar, el usuario quiere ver dónde quedó lo que tocó.
  const [ramasAbiertas, setRamasAbiertas] = useState<string[]>([]);

  // Oficinas del muni para el mapeo trámite→dependencia (turnero)
  const [dependencias, setDependencias] = useState<{ id: number; nombre?: string; dependencia?: { nombre?: string } }[]>([]);
  useEffect(() => {
    dependenciasApi.getMunicipio({ activo: true })
      .then(res => setDependencias(res.data || []))
      .catch(() => setDependencias([]));
  }, []);
  const opcionesDependencia = useMemo(() => ([
    { value: '', label: 'Sin oficina asignada (el turnero no puede reservar)' },
    ...dependencias.map(d => ({
      value: String(d.id),
      label: d.dependencia?.nombre || d.nombre || `Oficina ${d.id}`,
    })),
  ]), [dependencias]);

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
      // Oficina que atiende este trámite (mapeo del turnero)
      const depActual = await turnosApi.getDependenciaTramite(tramite.id)
        .then(r => (r.data as { municipio_dependencia_id?: number | null })?.municipio_dependencia_id ?? null)
        .catch(() => null);
      setForm({
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
      setEditSheetOpen(true);
    } catch {
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
          requiere_cenat: form.requiere_cenat,
          monto_cenat_referencia: form.monto_cenat_referencia ? parseFloat(form.monto_cenat_referencia) : undefined,
          requiere_kyc: form.requiere_kyc,
          nivel_kyc_minimo: form.nivel_kyc_minimo ? parseInt(form.nivel_kyc_minimo, 10) : undefined,
          modo_atencion: form.modo_atencion,
          duracion_turno_min: form.duracion_turno_min ? parseInt(form.duracion_turno_min, 10) : undefined,
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
        // Mapeo trámite→oficina (el turnero lo necesita para saber la agenda)
        await turnosApi.setDependenciaTramite(
          editing.id,
          form.dependencia_id ? Number(form.dependencia_id) : null,
        ).catch(() => toast.error('El trámite se guardó pero no se pudo asignar la oficina'));

        toast.success('Trámite actualizado');
        setEditSheetOpen(false);
      } else {
        const creado = await tramitesApi.create({
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
          requiere_kyc: form.requiere_kyc,
          nivel_kyc_minimo: form.nivel_kyc_minimo ? parseInt(form.nivel_kyc_minimo, 10) : undefined,
          modo_atencion: form.modo_atencion,
          duracion_turno_min: form.duracion_turno_min ? parseInt(form.duracion_turno_min, 10) : undefined,
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
        setWizardOpen(false);
      }
      await cargar();
    } catch (err) {
      const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalle || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  /** Borrado con ConfirmModal — `confirm()` nativo está vetado (rompe el
   *  theme y no se puede explicar por qué el trámite no se puede borrar). */
  const eliminar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await tramitesApi.delete(aBorrar.id);
      toast.success('Trámite eliminado');
      setABorrar(null);
      await cargar();
    } catch (err) {
      // El backend explica por qué no se puede borrar ("lo iniciaron 12
      // vecinos"): ese detalle es la respuesta útil, no un error genérico.
      const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalle || 'Error eliminando');
    } finally {
      setBorrando(false);
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

  /* ============================================================
   * Árbol del catálogo (cuerpo `tipo: 'arbol'` del canvas)
   *
   * Antes eran tarjetas agrupadas por categoría: cada trámite ocupaba una
   * caja con cuatro badges y había que scrollear para ver la estructura.
   * Lo que el usuario viene a entender acá es de qué categoría cuelga cada
   * trámite y qué le pide al vecino — eso es un árbol, no una grilla.
   * ============================================================ */

  const formatearCosto = (costo?: number | null) =>
    !costo ? 'Gratis' : `$ ${costo.toLocaleString('es-AR')}`;

  // Las categorías arrancan abiertas: un árbol todo colapsado esconde
  // justamente lo que la pantalla viene a mostrar. Se recalcula en cada
  // recarga para que después de crear o editar se vea dónde quedó.
  useEffect(() => {
    setRamasAbiertas(categorias.map((c) => `cat-${c.id}`));
  }, [categorias]);

  const nodosArbol = useMemo<TreeNode[]>(() => {
    const tonoModo: Record<string, ChipTone> = {
      online: 'green',
      presencial_con_turno: 'blue',
      presencial_sin_turno: 'amber',
    };

    return Object.entries(tramitesPorCat).map(([catId, lista]) => {
      const cat = categorias.find((c) => c.id === Number(catId));
      return {
        id: `cat-${catId}`,
        label: cat?.nombre || 'Sin categoría',
        icon: <DynamicIcon name={cat?.icono || 'Folder'} size={16} strokeWidth={1.9} />,
        tileColor: cat?.color,
        sub: lista.length === 1 ? '1 trámite' : `${lista.length} trámites`,
        children: lista.map((t): TreeNode => {
          const meta = MODO_ATENCION_META[t.modo_atencion || 'online'];
          const docs = t.documentos_requeridos || [];
          return {
            id: `tra-${t.id}`,
            label: t.nombre,
            sub: t.descripcion || undefined,
            chip: meta
              ? { label: meta.label, tone: tonoModo[t.modo_atencion || 'online'] ?? 'gray' }
              : undefined,
            amount: {
              value: formatearCosto(t.costo),
              note:
                t.tiempo_estimado_dias === 1 ? 'en 1 día' : `en ${t.tiempo_estimado_dias} días`,
              // Gratis se lee bien: no es una alerta ni un dato menor.
              veredicto: !t.costo ? 'bueno' : undefined,
            },
            actions: [
              {
                id: 'edit',
                label: 'Editar',
                icon: Pencil,
                onClick: () => abrirEdit(t),
              },
              {
                id: 'del',
                label: 'Eliminar',
                icon: Trash2,
                danger: true,
                onClick: () => setABorrar(t),
              },
            ],
            // El detalle explica QUÉ le pide al vecino: es la información que
            // antes obligaba a abrir el drawer de edición para verla.
            detail: (
              <div className="av2-arbol-req">
                <span className="av2-eyebrow">Documentos que pide</span>
                {docs.length === 0 ? (
                  <p className="av2-arbol-req-vacio">
                    No pide ningún documento: el vecino lo inicia sin adjuntar nada.
                  </p>
                ) : (
                  <ul className="av2-arbol-req-lista">
                    {docs.map((d, i) => (
                      <li key={i}>
                        <FileText size={13} strokeWidth={2} aria-hidden />
                        <span>{d.nombre}</span>
                        <span className="av2-arbol-req-nota">
                          {d.obligatorio === false ? 'opcional' : 'obligatorio'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="av2-arbol-req-pie">
                  <span>
                    {docs.length === 0
                      ? 'Sin requisitos cargados.'
                      : `El vecino tiene que juntar ${docs.length} ${
                          docs.length === 1 ? 'documento' : 'documentos'
                        }.`}
                  </span>
                  <button type="button" className="av2-arbol-req-accion" onClick={() => abrirEdit(t)}>
                    Editar requisitos
                  </button>
                </div>
              </div>
            ),
          };
        }),
      };
    });
    // Las dependencias reales del árbol son los trámites y las categorías.
  }, [tramitesPorCat, categorias]);

  // Hero semántico: frases con datos REALES del catálogo ya cargado.
  // Nota: el listado no trae la oficina asignada por trámite (se consulta
  // recién al editar), así que esa frase no se genera acá.
  const heroFrases = useMemo<HeroFrase[]>(() => {
    if (loading) return [];
    if (tramites.length === 0) {
      return [{
        segmentos: [
          seg('El catálogo está vacío', 'malo'),
          seg(': los vecinos todavía no tienen trámites para iniciar.'),
        ],
        acciones: [{ label: 'Crear el primer trámite', onClick: abrirNuevo, primaria: true }],
      }];
    }
    const conTurno = tramites.filter(t => t.modo_atencion === 'presencial_con_turno').length;
    const conCosto = tramites.filter(t => t.costo != null && t.costo > 0).length;
    return [{
      segmentos: [
        seg(`${tramites.length} ${tramites.length === 1 ? 'trámite' : 'trámites'} en el catálogo`),
        seg(': '),
        seg(`${conTurno} con turno online`),
        seg(' y '),
        seg(`${conCosto} con costo`),
        seg('.'),
      ],
      acciones: [{ label: 'Ver solicitudes', to: '/gestion/tramites', primaria: true }],
    }];
  }, [loading, tramites, abrirNuevo]);

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
              <ModernSelect
                value={form.tipo_pago}
                onChange={(v) => setForm({ ...form, tipo_pago: v })}
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
                onChange={(v) => setForm({ ...form, momento_pago: v })}
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
      {/* Hero semántico SIEMPRE arriba de todo (consistencia con otras pantallas de settings) */}
      <div className="px-3 sm:px-6 pt-3">
        <SemanticHero etiqueta="CATÁLOGO · TRÁMITES" frases={heroFrases} />
      </div>

      <StickyPageHeader
        backLink="/gestion/configuracion"
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
        <TreeList
          nodes={nodosArbol}
          expandedIds={ramasAbiertas}
          onExpandedChange={setRamasAbiertas}
          loading={loading}
          emptyMessage={
            tramites.length === 0
              ? 'No hay trámites cargados. Creá el primero con el botón de arriba.'
              : 'Sin resultados para los filtros aplicados.'
          }
          footer={
            filtrados.length > 0
              ? `${Object.keys(tramitesPorCat).length} ${
                  Object.keys(tramitesPorCat).length === 1 ? 'categoría' : 'categorías'
                } · ${filtrados.length} ${filtrados.length === 1 ? 'trámite' : 'trámites'}`
              : undefined
          }
        />
      </div>

      <ConfirmModal
        isOpen={!!aBorrar}
        onClose={() => setABorrar(null)}
        onConfirm={eliminar}
        loading={borrando}
        variant="danger"
        title="Eliminar trámite"
        message={
          aBorrar
            ? `Se va a eliminar "${aBorrar.nombre}". Si algún vecino ya lo inició, el sistema no va a dejar borrarlo y te lo va a decir.`
            : ''
        }
        confirmText="Eliminar"
      />

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
                  <ModernSelect
                    value={form.tipo_pago}
                    onChange={(v) => setForm({ ...form, tipo_pago: v })}
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
                    onChange={(v) => setForm({ ...form, momento_pago: v })}
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
          )}

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
    </div>
  );
}
