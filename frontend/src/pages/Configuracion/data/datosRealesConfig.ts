import { 
  categoriasReclamoApi, 
  poiApi, 
  inventarioApi, 
  dependenciasApi, 
  configuracionApi
} from '../../../lib/api';
import type { FilaCatalogo } from '../panels/PanelCatalogo';

export interface DatosFormularioMuni {
  nombreMunicipio: string;
  nombrePublico: string;
  ruc: string;
  departamento: string;
  telefono: string;
  email: string;
}

export async function cargarDatosFormularioMuni(): Promise<DatosFormularioMuni> {
  try {
    const res = await configuracionApi.getAll();
    const configList = (res.data || []) as Array<{ clave: string; valor: string | null }>;
    const configMap = new Map(configList.map((c) => [c.clave, c.valor || '']));

    return {
      nombreMunicipio: configMap.get('nombre_municipio') || 'Municipalidad de Asunción',
      nombrePublico: configMap.get('nombre_publico') || 'Paraguay Limpio',
      ruc: configMap.get('ruc') || '80016909-1',
      departamento: configMap.get('departamento') || 'Central',
      telefono: configMap.get('telefono_contacto') || '+595 21 664 100',
      email: configMap.get('email_contacto') || 'reclamos@asuncion.gov.py',
    };
  } catch {
    return {
      nombreMunicipio: 'Municipalidad de Asunción',
      nombrePublico: 'Paraguay Limpio',
      ruc: '80016909-1',
      departamento: 'Central',
      telefono: '+595 21 664 100',
      email: 'reclamos@asuncion.gov.py',
    };
  }
}

export async function guardarDatosFormularioMuni(datos: DatosFormularioMuni): Promise<void> {
  await Promise.all([
    configuracionApi.update('nombre_municipio', { valor: datos.nombreMunicipio }),
    configuracionApi.update('nombre_publico', { valor: datos.nombrePublico }),
    configuracionApi.update('ruc', { valor: datos.ruc }),
    configuracionApi.update('departamento', { valor: datos.departamento }),
    configuracionApi.update('telefono_contacto', { valor: datos.telefono }),
    configuracionApi.update('email_contacto', { valor: datos.email }),
  ]);
}

export async function cargarCatalogoReal(hijoId: string): Promise<{ veredicto: string; filas: FilaCatalogo[]; pie: string }> {
  if (hijoId === 'cat-reclamo') {
    const res = await categoriasReclamoApi.getAll(true);
    const list = (res.data || []) as any[];
    const filas: FilaCatalogo[] = list.map((c, i) => ({
      id: String(c.id),
      nombre: c.nombre,
      desc: c.descripcion || undefined,
      colorNombre: c.color || '#00794F',
      tinte: `${c.color || '#00794F'}15`,
      color: c.color || '#00794F',
      glifo: c.icono || 'Tag',
      sla: `${c.sla_dias || 3} días`,
      uso: c.uso_conteo ?? c.reclamos_conteo ?? 0,
      usoCol: '#0D1412',
      usoNota: 'reclamos históricos',
      estado: c.activo !== false ? 'Activo' : 'Desactivado',
      estadoCol: c.activo !== false ? '#00794F' : '#98A3A0',
      pistaBg: c.activo !== false ? '#00B37E' : '#D7DDDC',
      perilla: c.activo !== false ? '#FFFFFF' : '#FFFFFF',
      fondo: '#FFFFFF',
      orden: c.orden ?? i + 1,
    }));
    return {
      veredicto: `${filas.length} categorías activas clasificando el trabajo del municipio.`,
      filas,
      pie: `Mostrando ${filas.length} categorías`,
    };
  }

  if (hijoId === 'tipos-poi') {
    const res = await poiApi.listTipos();
    const list = (res.data || []) as any[];
    const filas: FilaCatalogo[] = list.map((t, i) => ({
      id: String(t.id),
      nombre: t.nombre,
      desc: t.descripcion || undefined,
      colorNombre: t.color || '#3B82F6',
      tinte: `${t.color || '#3B82F6'}15`,
      color: t.color || '#3B82F6',
      glifo: t.icono || 'MapPin',
      uso: t.puntos_conteo ?? 0,
      usoCol: '#0D1412',
      usoNota: 'puntos marcados',
      estado: t.activo !== false ? 'Activo' : 'Desactivado',
      estadoCol: t.activo !== false ? '#00794F' : '#98A3A0',
      pistaBg: t.activo !== false ? '#00B37E' : '#D7DDDC',
      perilla: t.activo !== false ? '#FFFFFF' : '#FFFFFF',
      fondo: '#FFFFFF',
      orden: i + 1,
    }));
    return {
      veredicto: `${filas.length} tipos de punto de interés configurados en el mapa.`,
      filas,
      pie: `Mostrando ${filas.length} tipos de POI`,
    };
  }

  if (hijoId === 'cat-inv') {
    const res = await inventarioApi.listCategorias();
    const list = (res.data || []) as any[];
    const filas: FilaCatalogo[] = list.map((c, i) => ({
      id: String(c.id),
      nombre: c.nombre,
      colorNombre: c.color || '#B4560F',
      tinte: `${c.color || '#B4560F'}15`,
      color: c.color || '#B4560F',
      glifo: c.icono || 'Boxes',
      prioLabel: c.naturaleza === 'activo' ? 'Activo' : 'Consumible',
      uso: c.items_conteo ?? 0,
      usoCol: '#0D1412',
      usoNota: 'ítems en catálogo',
      estado: c.activo !== false ? 'Activo' : 'Desactivado',
      estadoCol: c.activo !== false ? '#00794F' : '#98A3A0',
      pistaBg: c.activo !== false ? '#00B37E' : '#D7DDDC',
      perilla: c.activo !== false ? '#FFFFFF' : '#FFFFFF',
      fondo: '#FFFFFF',
      orden: i + 1,
    }));
    return {
      veredicto: `${filas.length} categorías de inventario entre activos y consumibles.`,
      filas,
      pie: `Mostrando ${filas.length} categorías de inventario`,
    };
  }

  return { veredicto: '', filas: [], pie: '' };
}

/* ============================================================
 * Asignación — quién atiende cada cosa, en los DOS mundos:
 *   reclamos: categoría de reclamo → dependencia (1 nivel)
 *   tramites: categoría de trámite → dependencia (la categoría ARRASTRA
 *             sus tipos: el vínculo real del turnero es por trámite, vía
 *             MunicipioDependenciaTramite)
 * Todo con endpoints existentes; ninguna sugerencia inventada.
 * ============================================================ */

export type ModoAsignacion = 'reclamos' | 'tramites';

export interface FilaAsignacion {
  id: number;
  nombre: string;
  glifo: string;
  color: string;
  uso: number;
  usoNota: string;
  /** muniDep asignada (null = huérfana). En trámites, la dep de sus tipos. */
  depId: number | null;
  depNombre: string | null;
  depColor: string | null;
  /** Trámites: los tipos están repartidos en MÁS de una dependencia. */
  depMixta?: boolean;
  /** Trámites: ids de los tipos que arrastra la categoría. */
  tipoIds?: number[];
}

export interface DepAsignable {
  /** id de MunicipioDependencia (el que usan asignarCategorias / turnos). */
  id: number;
  /** id del catálogo global (el que espera el endpoint de IA). */
  dependenciaId: number;
  nombre: string;
  color: string | null;
  descripcion?: string | null;
  categoriaIds: number[];
}

export interface DatosAsignacion {
  modo: ModoAsignacion;
  filas: FilaAsignacion[];
  deps: DepAsignable[];
  usoTotal: number;
  usoSinAsignar: number;
}

export async function cargarAsignacion(modo: ModoAsignacion): Promise<DatosAsignacion> {
  const { categoriasTramiteApi, tramitesApi } = await import('../../../lib/api');
  const dRes = await dependenciasApi.getMunicipio({ include_assignments: true });
  const depsRaw = (dRes.data || []) as any[];

  const deps: DepAsignable[] = depsRaw.map((d) => ({
    id: d.id,
    dependenciaId: d.dependencia_id,
    nombre: d.nombre,
    color: d.color || null,
    descripcion: d.descripcion || null,
    categoriaIds: (d.categorias || []).map((c: any) => c.id),
  }));

  if (modo === 'reclamos') {
    const cRes = await categoriasReclamoApi.getAll(true);
    const cats = (cRes.data || []) as any[];

    const duenioDe = new Map<number, any>();
    depsRaw.forEach((d) => (d.categorias || []).forEach((c: any) => duenioDe.set(c.id, d)));

    const filas: FilaAsignacion[] = cats.map((c) => {
      const dep = duenioDe.get(c.id);
      return {
        id: c.id,
        nombre: c.nombre,
        glifo: c.icono || 'Tag',
        color: c.color || '#00794F',
        uso: c.en_uso ?? 0,
        usoNota: (c.en_uso ?? 0) === 1 ? 'histórico' : 'históricos',
        depId: dep ? dep.id : null,
        depNombre: dep ? dep.nombre : null,
        depColor: dep ? dep.color || null : null,
      };
    });

    const usoTotal = filas.reduce((a, f) => a + f.uso, 0);
    const usoSinAsignar = filas.filter((f) => !f.depId).reduce((a, f) => a + f.uso, 0);
    return { modo, filas, deps, usoTotal, usoSinAsignar };
  }

  /* Trámites: la fila es la CATEGORÍA de trámite; su dependencia se deriva de
     dónde están sus tipos. Si los tipos se reparten entre varias, se marca
     mixta (se muestra, no se inventa una sola). */
  const [ctRes, tRes] = await Promise.all([
    categoriasTramiteApi.getAll(true),
    tramitesApi.getAll(),
  ]);
  const catsT = (ctRes.data || []) as any[];
  const tramites = (tRes.data || []) as any[];

  const depDeTramite = new Map<number, any>();
  depsRaw.forEach((d) => (d.tramites || []).forEach((t: any) => depDeTramite.set(t.id, d)));

  const filas: FilaAsignacion[] = catsT.map((c) => {
    const tipos = tramites.filter((t) => t.categoria_tramite_id === c.id);
    const depsDeTipos = new Map<number, any>();
    tipos.forEach((t) => {
      const d = depDeTramite.get(t.id);
      if (d) depsDeTipos.set(d.id, d);
    });
    const asignados = tipos.filter((t) => depDeTramite.has(t.id)).length;
    const unica = depsDeTipos.size === 1 && asignados === tipos.length && tipos.length > 0
      ? Array.from(depsDeTipos.values())[0]
      : null;
    const mixta = depsDeTipos.size > 1 || (asignados > 0 && asignados < tipos.length);
    return {
      id: c.id,
      nombre: c.nombre,
      glifo: c.icono || 'Folder',
      color: c.color || '#3B82F6',
      uso: tipos.length,
      usoNota: tipos.length === 1 ? 'tipo' : 'tipos',
      depId: unica ? unica.id : mixta ? Array.from(depsDeTipos.values())[0]?.id ?? null : null,
      depNombre: unica ? unica.nombre : mixta ? 'Varias oficinas' : null,
      depColor: unica ? unica.color || null : null,
      depMixta: mixta,
      tipoIds: tipos.map((t) => t.id),
    };
  });

  const usoTotal = filas.reduce((a, f) => a + f.uso, 0);
  const usoSinAsignar = filas.filter((f) => !f.depId && !f.depMixta).reduce((a, f) => a + f.uso, 0);
  return { modo, filas, deps, usoTotal, usoSinAsignar };
}

export async function cargarArbolReal(): Promise<any[]> {
  try {
    const { tramitesApi, categoriasTramiteApi } = await import('../../../lib/api');
    /* El vínculo dependencia → trámite es REAL y viene por `include_assignments`
       en las dependencias DEL MUNICIPIO (las categorías de trámite no tienen
       dependencia propia — agrupar por ella metía todo en un "Otras Categorías"
       ficticio). El detalle de cada trámite (documentos, modo) sale de
       /api/tramites, que es quien lo trae completo. */
    const [cRes, tRes, dRes] = await Promise.all([
      categoriasTramiteApi.getAll(true),
      tramitesApi.getAll(),
      dependenciasApi.getMunicipio({ include_assignments: true }),
    ]);
    const categorias = (cRes.data || []) as any[];
    const tramites = (tRes.data || []) as any[];
    const dependencias = (dRes.data || []) as any[];

    const catDe = new Map(categorias.map((c) => [c.id, c]));
    const detalleDe = new Map(tramites.map((t) => [t.id, t]));

    const nodoTramite = (t: any) => {
      const cat = catDe.get(t.categoria_tramite_id);
      const modoAtencion = String(t.modo_atencion || '');
      /* "Validaciones" del canvas = los requiere_* del modelo que el vecino
         tiene que pasar (KYC, DNI, facial, CENAT). */
      const validaciones = [t.requiere_kyc, t.requiere_validacion_dni, t.requiere_validacion_facial, t.requiere_cenat]
        .filter(Boolean).length;
      return {
        id: t.id,
        nombre: t.nombre,
        glifo: t.icono || cat?.icono || 'FileText',
        color: cat?.color || '#3B82F6',
        dias: t.tiempo_estimado_dias || 0,
        costo: Number(t.costo) || 0,
        modo: modoAtencion.includes('online') ? 'online' : modoAtencion.includes('con_turno') ? 'turno' : 'sinturno',
        docs: (t.documentos_requeridos || []).length,
        validaciones,
        prerrequisitos: (t.documentos_requeridos || []).map((d: any) => ({
          nombre: d.nombre,
          obligatorio: !!d.obligatorio,
        })),
        /* El objeto crudo de /api/tramites: la edición del árbol lo necesita
           entero (documentos con id, flags de pago/KYC, etc.). */
        raw: t,
      };
    };

    /** Agrupa trámites por su categoría, en el orden del catálogo. */
    const agrupar = (trs: any[]) => {
      const porCat = new Map<number, any>();
      trs.forEach((t) => {
        const cat = catDe.get(t.categoria_tramite_id);
        const clave = cat?.id ?? -1;
        if (!porCat.has(clave)) {
          porCat.set(clave, {
            id: clave,
            nombre: cat?.nombre ?? 'Sin categoría',
            activa: cat?.activo !== false,
            raw: cat ?? null,
            tramites: [],
          });
        }
        porCat.get(clave).tramites.push(nodoTramite(t));
      });
      return Array.from(porCat.values());
    };

    const usados = new Set<number>();
    const result = dependencias
      .filter((d) => (d.tramites || []).length > 0)
      .map((d) => {
        const conDetalle = (d.tramites || []).map((t: any) => {
          usados.add(t.id);
          return detalleDe.get(t.id) || t;
        });
        return { id: d.id, nombre: d.nombre, tipo: 'dependencia', hijos: agrupar(conDetalle) };
      });

    /* Al nodo suelto van (a) trámites que ninguna dependencia atiende y (b)
       categorías SIN trámites — recién creadas, por ejemplo. Sin esto, una
       categoría nueva no aparecía en el árbol y el alta parecía no funcionar. */
    const sueltos = tramites.filter((t) => !usados.has(t.id));
    const catsVisibles = new Set<number>();
    result.forEach((d) => d.hijos.forEach((c: any) => catsVisibles.add(c.id)));
    const extraHijos = agrupar(sueltos);
    extraHijos.forEach((c: any) => catsVisibles.add(c.id));
    const vacias = categorias
      .filter((c) => !catsVisibles.has(c.id))
      .map((c) => ({ id: c.id, nombre: c.nombre, activa: c.activo !== false, raw: c, tramites: [] }));
    if (extraHijos.length > 0 || vacias.length > 0) {
      result.push({
        id: 'sin-dep',
        nombre: 'Sin dependencia asignada',
        tipo: 'dependencia',
        hijos: [...extraHijos, ...vacias],
      });
    }

    return result;
  } catch (error) {
    console.error("Error loading arbol data:", error);
    return [];
  }
}
