/**
 * Asignación · quién atiende cada cosa.
 *
 * Es el cuerpo `tipo: 'asignacion'` de "Configuracion.dc.html" (canvas Claude
 * Design, 2026-08-03), implementado con la pieza del kit `AssignmentPanel`.
 *
 * [2026-08-03] Reescrita. Antes era un tablero de dos columnas con drag & drop
 * (@hello-pangea/dnd): se arrastraba una categoría desde "Disponibles" hasta
 * la tarjeta de una dependencia, los cambios quedaban en un borrador y había
 * que apretar "Guardar" en una barra flotante.
 *
 * Qué cambió y por qué:
 *
 *  - **Se lee al revés.** La pregunta real del municipio es "¿quién atiende
 *    esta categoría?" y no "¿qué le cuelgo a esta dependencia?". La fila pasó
 *    a ser la categoría y el destino un combo. De paso desaparece el problema
 *    de fondo del tablero: con 20 categorías y 11 dependencias, encontrar
 *    dónde soltar exigía scrollear las dos columnas a la vez.
 *
 *  - **Sin borrador.** Cada cambio se guarda solo. El borrador existía porque
 *    arrastrar es impreciso y convenía poder deshacer; con un combo, elegir
 *    ES la decisión. La barra flotante "hay cambios sin guardar" era además
 *    una forma segura de perder trabajo al navegar.
 *
 *  - **Lo que faltaba y ahora está**: buscador, filtro por estado y el número
 *    de lo que falta arriba de todo. El tablero sólo dejaba mirar.
 *
 *  - **Trámites se asignan de a uno.** El modelo persiste trámites concretos
 *    (`MunicipioDependenciaTramite`); el "tipo de trámite" era andamiaje
 *    visual del tablero viejo — el propio código lo aclaraba: "el estado
 *    local `tipos_tramite` se usa solo como helper visual, no se persiste".
 *
 * Se conservan las dos acciones que sí sumaban: auto-asignar con IA (ahora es
 * el CTA del panel) y desasignar todo el lado activo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, FolderKanban, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  categoriasReclamoApi,
  categoriasTramiteApi,
  dependenciasApi,
  tramitesApi,
} from '../lib/api';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { PageHeader } from '../components/abmv2/PageHeader';
import { AssignmentPanel } from '../components/abmv2/AssignmentPanel';
import { useEmbed, useReportarTotal } from '../components/abmv2/useEmbed';
import type { AssignGroup, AssignRow, AssignTarget } from '../components/abmv2/types';

type Lado = 'reclamos' | 'tramites';

interface MunicipioDependencia {
  id: number;
  municipio_id: number;
  dependencia_id: number;
  nombre: string;
  codigo: string;
  tipo_gestion: 'RECLAMO' | 'TRAMITE' | 'AMBOS';
  activo: boolean;
  orden: number;
  color?: string;
  icono?: string;
  categorias?: { id: number; nombre: string }[];
  tramites?: { id: number; nombre: string }[];
}

interface ItemAsignable {
  id: number;
  nombre: string;
  icono?: string;
  color?: string;
}

/** Índice item → dependencia que lo atiende. El modelo permite N:M pero la
 *  operación es 1:1 (una categoría la atiende una dependencia), que es como
 *  ya lo usaba el tablero viejo: al soltarla en otra, la sacaba de la
 *  anterior. */
type Duenio = Record<number, number>;

export default function AsignacionDependencias() {
  const { isSuperAdmin } = useSuperAdmin();
  const { embedded } = useEmbed();

  const [loading, setLoading] = useState(true);
  const [lado, setLado] = useState<Lado>('reclamos');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [limpiando, setLimpiando] = useState(false);
  const [pidiendoLimpieza, setPidiendoLimpieza] = useState(false);

  const [dependencias, setDependencias] = useState<MunicipioDependencia[]>([]);
  const [categorias, setCategorias] = useState<ItemAsignable[]>([]);
  const [tramites, setTramites] = useState<ItemAsignable[]>([]);
  // Dueño actual de cada item, por lado.
  const [duenioCategoria, setDuenioCategoria] = useState<Duenio>({});
  const [duenioTramite, setDuenioTramite] = useState<Duenio>({});

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [depsRes, catsRes, tramitesRes] = await Promise.all([
        dependenciasApi.getMunicipio({ activo: true, include_assignments: true }),
        categoriasReclamoApi.getAll(),
        tramitesApi.getAll(),
      ]);

      const deps: MunicipioDependencia[] = depsRes.data || [];
      setDependencias(deps);
      setCategorias(catsRes.data || []);
      setTramites(tramitesRes.data || []);

      const dc: Duenio = {};
      const dt: Duenio = {};
      for (const dep of deps) {
        (dep.categorias || []).forEach((c) => { dc[c.id] = dep.id; });
        (dep.tramites || []).forEach((t) => { dt[t.id] = dep.id; });
      }
      setDuenioCategoria(dc);
      setDuenioTramite(dt);
    } catch (err) {
      console.error('Error al cargar la asignación:', err);
      toast.error('Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /* --- Derivados ------------------------------------------------------ */

  const esDeReclamos = lado === 'reclamos';
  const items = esDeReclamos ? categorias : tramites;
  const duenios = esDeReclamos ? duenioCategoria : duenioTramite;

  const depsDelLado = useMemo(
    () =>
      dependencias.filter((d) =>
        esDeReclamos
          ? d.tipo_gestion === 'RECLAMO' || d.tipo_gestion === 'AMBOS'
          : d.tipo_gestion === 'TRAMITE' || d.tipo_gestion === 'AMBOS',
      ),
    [dependencias, esDeReclamos],
  );

  const targets: AssignTarget[] = useMemo(
    () => depsDelLado.map((d) => ({ value: String(d.id), label: d.nombre, dotColor: d.color })),
    [depsDelLado],
  );

  const sinAsignarCategorias = categorias.filter((c) => !duenioCategoria[c.id]).length;
  const sinAsignarTramites = tramites.filter((t) => !duenioTramite[t.id]).length;
  const sinAsignar = esDeReclamos ? sinAsignarCategorias : sinAsignarTramites;

  // El riel de Configuración muestra lo que FALTA, no el total: en esta
  // pantalla el número que importa es cuántas quedaron huérfanas.
  useReportarTotal(sinAsignar);

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const asignado = !!duenios[it.id];
      if (filtro === 'sin' && asignado) return false;
      if (filtro === 'con' && !asignado) return false;
      if (!q) return true;
      const dep = asignado ? dependencias.find((d) => d.id === duenios[it.id]) : null;
      return (
        it.nombre.toLowerCase().includes(q) ||
        (dep?.nombre ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, duenios, filtro, search, dependencias]);

  const groups: AssignGroup[] = useMemo(() => {
    const aFila = (it: ItemAsignable): AssignRow => ({
      id: it.id,
      label: it.nombre,
      icon: it.icono ? <DynamicIcon name={it.icono} size={16} strokeWidth={1.9} /> : undefined,
      tileColor: it.color,
      assignedTo: duenios[it.id] ? String(duenios[it.id]) : null,
    });

    const huerfanos = visibles.filter((it) => !duenios[it.id]);
    const cubiertos = visibles.filter((it) => duenios[it.id]);
    const nombre = esDeReclamos ? 'categoría' : 'trámite';

    const gs: AssignGroup[] = [];
    // Lo que falta va PRIMERO: es la única razón para entrar a esta pantalla.
    if (huerfanos.length) {
      gs.push({
        key: 'sin',
        title: 'Sin atender',
        detail:
          huerfanos.length === 1
            ? `1 ${nombre} no le llega a nadie`
            : `${huerfanos.length} ${nombre}s no le llegan a nadie`,
        veredicto: 'advertencia',
        rows: huerfanos.map(aFila),
      });
    }
    if (cubiertos.length) {
      gs.push({
        key: 'con',
        title: 'Con responsable',
        detail: `${cubiertos.length} de ${items.length}`,
        veredicto: 'bueno',
        rows: cubiertos.map(aFila),
      });
    }
    return gs;
  }, [visibles, duenios, esDeReclamos, items.length]);

  /* --- Asignar / quitar ----------------------------------------------- */

  /**
   * Guarda la asignación de UN item. El backend recibe la lista completa de
   * cada dependencia (`asignarCategorias(dep, [ids])`), así que un cambio
   * toca la dependencia nueva y —si el item ya tenía dueño— también la vieja.
   *
   * Optimista con rollback: el combo tiene que responder en el acto, y si el
   * PUT falla se vuelve al estado anterior y se avisa. Mostrar un valor que
   * el backend no tiene es peor que perder el cambio.
   */
  const guardarAsignacion = useCallback(
    async (itemId: number, depNueva: number | null) => {
      const previos = esDeReclamos ? duenioCategoria : duenioTramite;
      const depVieja = previos[itemId] ?? null;
      if (depVieja === depNueva) return;

      const siguientes: Duenio = { ...previos };
      if (depNueva === null) delete siguientes[itemId];
      else siguientes[itemId] = depNueva;

      const aplicar = esDeReclamos ? setDuenioCategoria : setDuenioTramite;
      aplicar(siguientes);

      const idsDe = (depId: number) =>
        Object.entries(siguientes)
          .filter(([, dep]) => dep === depId)
          .map(([id]) => Number(id));

      const guardar = esDeReclamos
        ? dependenciasApi.asignarCategorias
        : dependenciasApi.asignarTramites;

      try {
        const llamadas: Promise<unknown>[] = [];
        if (depNueva !== null) llamadas.push(guardar(depNueva, idsDe(depNueva)));
        if (depVieja !== null) llamadas.push(guardar(depVieja, idsDe(depVieja)));
        await Promise.all(llamadas);
      } catch (err) {
        console.error('Error guardando la asignación:', err);
        aplicar(previos);
        toast.error('No se pudo guardar la asignación');
      }
    },
    [esDeReclamos, duenioCategoria, duenioTramite],
  );

  /* --- Acciones del lado ---------------------------------------------- */

  const autoAsignar = async () => {
    const aviso = toast.loading('Analizando con IA…');
    try {
      if (esDeReclamos) {
        const res = await dependenciasApi.autoAsignarCategoriasIA(
          categorias.map((c) => ({ id: c.id, nombre: c.nombre })),
          depsDelLado.map((d) => ({ id: d.dependencia_id, nombre: d.nombre })),
        );
        toast.dismiss(aviso);
        toast.success(`La IA asignó ${res.data.total} categorías`);
      } else {
        const cats = await categoriasTramiteApi.getAll();
        const res = await dependenciasApi.autoAsignarCategoriasTramiteIA(
          (cats.data || []).map((t: ItemAsignable) => ({ id: t.id, nombre: t.nombre })),
          depsDelLado.map((d) => ({ id: d.dependencia_id, nombre: d.nombre })),
        );
        toast.dismiss(aviso);
        const total = res.data.total_tramites ?? res.data.total_categorias ?? 0;
        toast.success(`La IA asignó ${total} trámites`);
      }
      await cargar();
    } catch (err) {
      toast.dismiss(aviso);
      console.error('Error en auto-asignación:', err);
      toast.error('No se pudo auto-asignar');
    }
  };

  const desasignarTodo = async () => {
    setLimpiando(true);
    try {
      if (esDeReclamos) {
        await dependenciasApi.limpiarAsignacionesCategorias();
      } else {
        // No hay endpoint de limpieza para trámites: se manda la lista vacía
        // por dependencia, que es lo mismo que hacía el guardado del tablero.
        await Promise.all(depsDelLado.map((d) => dependenciasApi.asignarTramites(d.id, [])));
      }
      toast.success(esDeReclamos ? 'Se desasignaron las categorías' : 'Se desasignaron los trámites');
      setPidiendoLimpieza(false);
      await cargar();
    } catch (err) {
      console.error('Error al desasignar:', err);
      toast.error('No se pudo desasignar');
    } finally {
      setLimpiando(false);
    }
  };

  /* --- Guardas (después de TODOS los hooks) --------------------------- */

  if (isSuperAdmin) {
    return (
      <div className="av2-page">
        <div className="av2-nota av2-nota--alerta">
          <AlertCircle className="av2-nota-ico" aria-hidden />
          <span className="av2-nota-txt">
            <span className="av2-nota-eyebrow">Acceso restringido</span>
            Esta pantalla es del municipio: entrá con un usuario de municipio para asignar
            categorías y trámites a sus dependencias.
          </span>
        </div>
      </div>
    );
  }

  const nombreItem = esDeReclamos ? 'categoría' : 'trámite';

  return (
    <div className="av2-page">
      {!embedded && (
        <PageHeader
          eyebrow="Configuración"
          title="Quién atiende cada cosa"
          description="Cada categoría de reclamo y cada trámite le llega a una dependencia. Lo que queda sin asignar no le llega a nadie."
        />
      )}

      <AssignmentPanel
        sides={[
          { id: 'reclamos', label: 'Reclamos', icon: FolderKanban, count: sinAsignarCategorias },
          { id: 'tramites', label: 'Trámites', icon: FileText, count: sinAsignarTramites },
        ]}
        activeSide={lado}
        onSideChange={(id) => {
          setLado(id as Lado);
          setFiltro('todos');
        }}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Buscar ${nombreItem} o dependencia`}
        bulkAction={
          sinAsignar > 0
            ? { label: `Auto-asignar ${sinAsignar} con IA`, icon: Wand2, onClick: autoAsignar }
            : undefined
        }
        filters={[
          { id: 'todos', label: 'Todos', count: items.length },
          { id: 'sin', label: 'Sin asignar', count: sinAsignar, veredicto: 'advertencia' },
          { id: 'con', label: 'Asignados', count: items.length - sinAsignar, veredicto: 'bueno' },
        ]}
        activeFilter={filtro}
        onFilterChange={setFiltro}
        columnLabels={{
          entity: esDeReclamos ? 'Categoría' : 'Trámite',
          target: esDeReclamos ? 'Quién los atiende' : 'Quién lo gestiona',
        }}
        targets={targets}
        groups={groups}
        loading={loading}
        onAssign={(id, value) => guardarAsignacion(Number(id), Number(value))}
        onClear={(id) => guardarAsignacion(Number(id), null)}
        emptyMessage={
          search.trim()
            ? `Ningún ${nombreItem} coincide con "${search.trim()}".`
            : `No hay ${nombreItem}s cargados todavía.`
        }
        footer={{
          left:
            sinAsignar === 0
              ? 'Todo tiene responsable.'
              : `${sinAsignar} sin asignar de ${items.length}`,
          right: `${targets.length} dependencias activas`,
        }}
      />

      {/* Acción destructiva del lado: abajo y con confirmación, no arriba
          junto al CTA. */}
      <div className="av2-asig-acciones-pie">
        <button
          type="button"
          className="av2-btn-secundario"
          onClick={() => setPidiendoLimpieza(true)}
          disabled={loading || items.length === 0}
        >
          <Trash2 size={15} strokeWidth={1.9} />
          Desasignar todo
        </button>
        <button type="button" className="av2-btn-secundario" onClick={cargar} disabled={loading}>
          <RefreshCw size={15} strokeWidth={1.9} />
          Actualizar
        </button>
      </div>

      <ConfirmModal
        isOpen={pidiendoLimpieza}
        onClose={() => setPidiendoLimpieza(false)}
        onConfirm={desasignarTodo}
        loading={limpiando}
        variant="danger"
        title={`Desasignar todos los ${nombreItem}s`}
        message={`Se van a soltar los ${items.length} ${nombreItem}s de sus dependencias. Nadie va a recibir ${
          esDeReclamos ? 'reclamos nuevos' : 'trámites nuevos'
        } hasta que los vuelvas a asignar.`}
        confirmText="Desasignar todo"
      />
    </div>
  );
}
