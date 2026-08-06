import { 
  categoriasReclamoApi, 
  poiApi, 
  inventarioApi, 
  dependenciasApi, 
  configuracionApi
} from '../../../lib/api';
import type { FilaCatalogo } from '../panels/PanelCatalogo';
import type { GrupoAsig, TabAsig, FilaAsig } from '../panels/PanelAsignacion';

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

export async function cargarAsignacionReal(): Promise<{
  tabsAsig: TabAsig[];
  haySugerencias: boolean;
  labelSugerencias: string;
  gruposAsig: GrupoAsig[];
  pieAsig: string;
}> {
  const [cRes, dRes] = await Promise.all([
    categoriasReclamoApi.getAll(true),
    dependenciasApi.getCatalogo(),
  ]);

  const cats = (cRes.data || []) as any[];
  const deps = (dRes.data || []) as any[];

  const tabsAsig: TabAsig[] = deps.map((d, i) => ({
    id: String(d.id),
    label: d.nombre,
    n: cats.filter((c) => c.dependencia_defecto_id === d.id).length,
    glifo: 'Building2',
    col: d.color || '#00794F',
    sub: '#98A3A0',
    bd: i === 0 ? 'rgba(13,20,18,0.18)' : 'rgba(13,20,18,0.07)',
    bg: i === 0 ? '#FFFFFF' : '#F6F8F7',
    sombra: 'none',
  }));

  const filasAsig: FilaAsig[] = cats.map((c) => {
    const depAsignada = deps.find((d) => d.id === c.dependencia_defecto_id);
    return {
      id: String(c.id),
      nombre: c.nombre,
      tinte: `${c.color || '#00794F'}15`,
      color: c.color || '#00794F',
      glifo: c.icono || 'Tag',
      uso: c.uso_conteo ?? 0,
      usoCol: '#0D1412',
      usoNota: 'reclamos históricos',
      asignada: !!depAsignada,
      dep: depAsignada ? depAsignada.nombre : undefined,
      depColor: depAsignada ? depAsignada.color || '#00794F' : undefined,
      sinAsignar: !depAsignada,
    };
  });

  const gruposAsig: GrupoAsig[] = [
    {
      id: 'g1',
      titulo: 'Reglas de distribución automática por categoría',
      detalle: `${cats.length} categorías asignadas a dependencias`,
      punto: '#00794F',
      col: '#00794F',
      bg: '#F6F8F7',
      filas: filasAsig,
    },
  ];

  return {
    tabsAsig,
    haySugerencias: true,
    labelSugerencias: 'Reglas automáticas activas',
    gruposAsig,
    pieAsig: `Mostrando ${cats.length} reglas de asignación`,
  };
}

export async function cargarArbolReal(): Promise<any[]> {
  try {
    const { tramitesApi, categoriasTramiteApi, dependenciasApi } = await import('../../../lib/api');
    const [cRes, tRes, dRes] = await Promise.all([
      categoriasTramiteApi.getAll(true),
      tramitesApi.getAll(),
      dependenciasApi ? dependenciasApi.getCatalogo() : Promise.resolve({ data: [] })
    ]);
    const categorias = (cRes.data || []) as any[];
    const tramites = (tRes.data || []) as any[];
    const dependencias = (dRes.data || []) as any[];

    // Build hierarchical tree: Dependencia -> Categoría -> Trámite
    const dependenciasMap = new Map();
    dependencias.forEach(d => {
      dependenciasMap.set(d.id, { ...d, categorias: [] });
    });

    const categoriasSinDependencia: any[] = [];

    categorias.forEach(c => {
      const trs = tramites.filter(t => t.categoria_tramite_id === c.id);
      const catNode = {
        id: c.id,
        nombre: c.nombre,
        activa: c.activo !== false,
        tramites: trs.map(t => ({
          id: t.id,
          nombre: t.nombre,
          glifo: t.icono || c.icono || 'FileText',
          color: c.color || '#3B82F6',
          dias: t.sla_dias || 3,
          costo: t.costo || 0,
          modo: t.online ? 'online' : 'sinturno',
          pago: t.costo ? 'inicio' : 'sin',
          docs: 0,
          checks: 0,
          uso: t.solicitudes_conteo || 0
        }))
      };

      if (c.dependencia_id && dependenciasMap.has(c.dependencia_id)) {
        dependenciasMap.get(c.dependencia_id).categorias.push(catNode);
      } else {
        categoriasSinDependencia.push(catNode);
      }
    });

    const result = Array.from(dependenciasMap.values()).filter(d => d.categorias.length > 0).map(d => ({
      id: d.id,
      nombre: d.nombre,
      tipo: 'dependencia',
      hijos: d.categorias
    }));

    if (categoriasSinDependencia.length > 0) {
      result.push({
        id: 'sin-dep',
        nombre: 'Otras Categorías',
        tipo: 'dependencia',
        hijos: categoriasSinDependencia
      });
    }

    return result;
  } catch (error) {
    console.error("Error loading arbol data:", error);
    return [];
  }
}
