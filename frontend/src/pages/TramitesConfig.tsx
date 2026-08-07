import { useEffect, useState, useMemo, useCallback } from 'react';
import { Pencil, Trash2, FileText, Calendar, Users, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import { type HeroFrase, seg } from '../lib/semanticHero';
import { tramitesApi, categoriasTramiteApi } from '../lib/api';
import { AltaTramiteWizard, EdicionTramiteSheet } from '../components/config/tramiteFlows';
import type { Tramite, CategoriaTramite } from '../types';
import { useReportarTotal } from '../components/abmv2/useEmbed';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { TreeList } from '../components/abmv2/TreeList';
import type { ChipTone, TreeNode } from '../components/abmv2/types';

// Badge de "cómo se atiende" en las cards del listado — mismo lenguaje visual
// que Agenda/Horarios para que se lea como una sola unidad (turnero consolidado).
const MODO_ATENCION_META: Record<string, { label: string; icon: typeof Calendar; color: string }> = {
  presencial_con_turno: { label: 'Con turno', icon: Calendar, color: '#3b82f6' },
  presencial_sin_turno: { label: 'Sin turno', icon: Users, color: '#f59e0b' },
  online: { label: 'Online', icon: Globe, color: '#10b981' },
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

  // Wizard (alta nueva) y Sheet (edición): la maquinaria vive en
  // components/config/tramiteFlows — acá solo se controla la apertura.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Tramite | null>(null);

  // Borrado con confirmación (antes era `confirm()` nativo).
  const [aBorrar, setABorrar] = useState<Tramite | null>(null);
  const [borrando, setBorrando] = useState(false);

  // Ramas abiertas del árbol. Se reabren todas al recargar: después de crear
  // o editar, el usuario quiere ver dónde quedó lo que tocó.
  const [ramasAbiertas, setRamasAbiertas] = useState<string[]>([]);

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

  const abrirNuevo = useCallback(() => {
    setWizardOpen(true);
  }, []);

  const abrirEdit = (tramite: Tramite) => {
    // El sheet carga el detalle y la oficina asignada por su cuenta:
    // alcanza con pasarle el trámite RAW del listado.
    setEditing(tramite);
    setEditSheetOpen(true);
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

      {/* Wizard: alta de trámite nuevo (maquinaria compartida con Configuración) */}
      <AltaTramiteWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onGuardado={cargar}
      />

      {/* Sheet: edición de trámite existente (maquinaria compartida con Configuración) */}
      <EdicionTramiteSheet
        open={editSheetOpen}
        tramite={editing}
        onClose={() => setEditSheetOpen(false)}
        onGuardado={cargar}
      />
    </div>
  );
}
