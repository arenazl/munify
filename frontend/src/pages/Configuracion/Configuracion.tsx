import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { BRAND } from '../../brands';
import './Configuracion.css';
import MainTabs, { MainTabItem } from './components/MainTabs';
import SidebarTabs, { SidebarTabItem } from './components/SidebarTabs';
import { PantallaDeAjuste } from '../../components/config/PantallaDeAjuste';
import PanelFormulario from './panels/PanelFormulario';
import PanelApariencia from './panels/PanelApariencia';
import type { TemaItem, AcentoItem, BarraItem } from './panels/PanelApariencia';
import PanelQr from './panels/PanelQr';
import CatalogoDelCanvas from '../../components/config/CatalogoDelCanvas';
import AsignacionDelCanvas from '../../components/config/AsignacionDelCanvas';
import ArbolDelCanvas from '../../components/config/ArbolDelCanvas';
import AbmDeConfiguracion from '../../components/config/AbmDeConfiguracion';
import PuenteDeModulo from '../../components/config/PuenteDeModulo';
import DependenciaSheet, { type DependenciaEditable } from '../../components/config/DependenciaSheet';
import DemoDniCard from '../../components/config/DemoDniCard';
import { EmbedProvider } from '../../components/abmv2/EmbedContext';
import InventarioDepositosConfig from '../InventarioDepositosConfig';
import Inventario from '../Inventario';
import ConfiguracionTesoreria from '../ConfiguracionTesoreria';
import TesoreriaContactos from '../TesoreriaContactos';
import TarjetasCredito from '../TarjetasCredito';
import GestionTasas from '../GestionTasas';
import Empleados from '../Empleados';
import { ALTA_DE_AJUSTE } from '../../components/config/altasDeAjuste';
import { MockData } from './data/mockData';
import { ABM_SPEC, DESCRIPCION_AJUSTE } from '../../config/canvasAbmSpec';
// OJO: hay DOS `FilaCatalogo` en el repo — el del spec del canvas
// (`canvasConfigSpec`) y el del panel. `cargarCatalogoReal` devuelve el del
// panel, que es el que va acá. Unificarlos es deuda abierta.
import type { FilaCatalogo } from './panels/PanelCatalogo';
import { useTheme } from '../../contexts/ThemeContext';
import { getBgTheme, resolveAccentColor, sidebarColor, type SidebarMode } from '../../config/themePresets';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import {
  cargarDatosFormularioMuni,
  guardarDatosFormularioMuni,
  cargarCatalogoReal,
  type DatosFormularioMuni
} from './data/datosRealesConfig';
import { dashboardApi, modulosApi } from '../../lib/api';
import { MODULOS } from '../../lib/enums/modulos';

// Grupos de Configuración gateados por los MÓDULOS del municipio: el
// destilde de módulos tiene que valer también acá. Antes el árbol salía
// entero del mock y un muni sólo-tesorería (San Pedro Norte) veía
// Inventario, Reclamos y Trámites igual. Un grupo sin entrada acá es
// transversal y se muestra siempre.
const MODULOS_DEL_GRUPO: Record<string, string[]> = {
  reclamos: ['reclamos'],
  tramites: ['tramites'],
  // `patrimonio` = el viejo `inventario` + `flota`, fusionados el 2026-09-02.
  inventario: ['patrimonio', 'ordenes_trabajo'],
  tesoreria: ['tesoreria', 'sueldos', 'contaduria'],
  personal: ['sueldos', 'ordenes_trabajo', 'reclamos'],
  integraciones: ['pagos'],
};

export default function Configuracion() {
  const {
    theme, setPreset, setAccent,
    currentPresetId, currentAccentId, currentMode,
    currentSidebarMode, setSidebarMode,
    presets, accents, sidebarOptions,
  } = useTheme();
  const { isSuperAdmin } = useSuperAdmin();

  // Filas de municipio_modulos del muni actual. null = todavía sin respuesta
  // (o falló): se muestra el árbol completo, como antes, para no parpadear.
  const [modulosMuni, setModulosMuni] = useState<Map<string, boolean> | null>(null);
  useEffect(() => {
    modulosApi.list()
      .then((r) => setModulosMuni(new Map(
        ((r.data || []) as Array<{ modulo: string; activo: boolean }>)
          .map((m) => [m.modulo, m.activo]),
      )))
      .catch(() => setModulosMuni(null));
  }, []);

  /* El grupo Super Admin (auditoría, suscripciones, config del sidebar) es
     cross-tenant: un admin municipal no tiene nada que hacer ahí y verlo
     invita a tocarlo. Super admin = admin SIN municipio_id. Los grupos de
     módulo respetan el destilde del muni (MODULOS_DEL_GRUPO): fila explícita
     mata semántica; sin fila, opt-out = activo y opt-in (o desconocido,
     una clave que no esté en el catálogo del front) = oculto. */
  const arbol = useMemo(() => {
    const grupos = MockData.arbol().filter((g: { id: string }) => g.id !== 'super' || isSuperAdmin);
    if (!modulosMuni || isSuperAdmin) return grupos;
    const activo = (key: string): boolean => {
      if (modulosMuni.has(key)) return !!modulosMuni.get(key);
      const def = MODULOS.find((m) => m.key === key);
      return def ? !def.optIn : false;
    };
    return grupos.filter((g: { id: string }) => {
      const keys = MODULOS_DEL_GRUPO[g.id];
      return !keys || keys.some(activo);
    });
  }, [isSuperAdmin, modulosMuni]);

  const [searchParams, setSearchParams] = useSearchParams();

  const urlPadre = searchParams.get('tab');
  const urlHijo = searchParams.get('sub');

  const [padreActivo, setPadreActivo] = useState(urlPadre || arbol[0].id);

  // Si el grupo activo desapareció al aplicar el destilde de módulos (ej.
  // entró por URL a un módulo apagado), caer al primero visible.
  useEffect(() => {
    if (arbol.length && !arbol.some((g: { id: string }) => g.id === padreActivo)) {
      setPadreActivo(arbol[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbol]);
  const [hijosActivos, setHijosActivos] = useState<Record<string, string>>({
    general: 'muni',
    municipio: 'dependencias',
    personal: 'empleados',
    reclamos: 'cat-reclamo',
    tramites: 'arbol-tramite',
    inventario: 'inv',
    tesoreria: 'conceptos',
    integraciones: 'pagos',
    super: 'auditoria'
  });

  // Datos reales controlados
  const [datosMuni, setDatosMuni] = useState<DatosFormularioMuni | null>(null);
  const [savingMuni, setSavingMuni] = useState(false);
  const [catalogoReal, setCatalogoReal] = useState<{ veredicto: string; filas: FilaCatalogo[]; pie: string } | null>(null);

  useEffect(() => {
    if (urlPadre && urlPadre !== padreActivo) setPadreActivo(urlPadre);
    if (urlPadre && urlHijo) {
      setHijosActivos(prev => ({ ...prev, [urlPadre]: urlHijo }));
    }
  }, [urlPadre, urlHijo]);

  /* Nada de `.find(...)!` acá: el `!` promete algo que la URL no garantiza.
     `?tab=general&sub=zonas` es un par válido de escribir e imposible de
     resolver (zonas vive en Catálogos), y con el `!` el `hijo.tipo` de abajo
     tiraba la pantalla entera por ErrorBoundary. Ante un par que no cierra se
     cae al primer ajuste del grupo, que siempre existe. */
  const padre = arbol.find(p => p.id === padreActivo) ?? arbol[0];
  const hijo =
    padre.hijos.find(h => h.id === hijosActivos[padre.id]) ?? padre.hijos[0];
  const hijoId = hijo.id;

  /* --- Apariencia: las muestras salen del motor de temas REAL -------------
     Los 6 temas de fondo, TODOS los acentos y los 3 modos de barra vienen de
     `themePresets` vía ThemeContext — mismo catálogo, misma persistencia que
     la luna/sol de la topbar. Nada de listas duplicadas acá. */
  const temasApariencia = useMemo<TemaItem[]>(() => {
    // El panel los acomoda en matriz por (modo, temperatura), asi que acá no
    // hace falta ordenarlos: cada tema sabe en qué casillero va.
    return presets.map((t) => {
      const activa = t.id === currentPresetId;
      const claro = t.modo === 'claro';
      return {
        id: t.id,
        nombre: t.name,
        modo: t.modo,
        temperatura: t.temperatura,
        borde: activa ? theme.primary : 'var(--pl-border)',
        fondoCard: 'var(--pl-surface)',
        lienzo: t.base,
        barra: claro
          ? `color-mix(in srgb, ${t.base} 94%, #0d1412)`
          : `color-mix(in srgb, ${t.base} 90%, #ffffff)`,
        linea: claro ? 'rgba(13,20,18,0.14)' : 'rgba(255,255,255,0.16)',
        peso: activa ? 600 : 500,
        color: activa ? 'var(--pl-text)' : 'var(--pl-text-2)',
        tick: activa ? 1 : 0,
      };
    });
  }, [presets, currentPresetId, theme.primary]);

  const acentosApariencia = useMemo<AcentoItem[]>(
    () =>
      accents.map((a) => {
        const activo = a.id === currentAccentId;
        return {
          id: a.id,
          nombre: a.name,
          hex: resolveAccentColor(a.id, currentMode),
          // El panel usa estos valores como radios del anillo de selección.
          anillo: activo ? '2.5px' : '0px',
          borde: activo ? '4.5px' : '0px',
          tick: activo ? 1 : 0,
        };
      }),
    [accents, currentAccentId, currentMode],
  );

  const barrasApariencia = useMemo<BarraItem[]>(() => {
    const tema = getBgTheme(currentPresetId);
    const acentoColor = resolveAccentColor(currentAccentId, currentMode);
    const claro = tema.modo === 'claro';
    return sidebarOptions.map((m) => {
      const activa = m.id === currentSidebarMode;
      return {
        id: m.id,
        nombre: m.name,
        borde: activa ? theme.primary : 'var(--pl-border)',
        fondoCard: 'var(--pl-surface)',
        lienzo: sidebarColor(tema, acentoColor, m.id as SidebarMode),
        textoAlto: claro ? 'rgba(13,20,18,0.6)' : 'rgba(255,255,255,0.75)',
        textoBajo: claro ? 'rgba(13,20,18,0.25)' : 'rgba(255,255,255,0.3)',
        peso: activa ? 600 : 500,
        color: activa ? 'var(--pl-text)' : 'var(--pl-text-2)',
        tick: activa ? 1 : 0,
      };
    });
  }, [sidebarOptions, currentSidebarMode, currentPresetId, currentAccentId, currentMode, theme.primary]);

  /* --- Buscador de ajustes -----------------------------------------
     Son 40 pantallas repartidas en 8 grupos: sin buscador hay que saber
     de memoria en cuál vive cada cosa. Busca sobre TODOS los grupos, no
     sólo el abierto, que es el caso en el que sirve. */
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const inputBuscar = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (buscadorAbierto) inputBuscar.current?.focus();
  }, [buscadorAbierto]);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscadorAbierto(true);
      }
      if (e.key === 'Escape') setBuscadorAbierto(false);
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, []);

  const resultados = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return [];
    return arbol.flatMap((p: any) =>
      p.hijos
        .filter((h: any) => h.label.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
        .map((h: any) => ({ grupoId: p.id, grupo: p.label, id: h.id, label: h.label })),
    );
  }, [consulta, arbol]);

  /* Datos reales de las pantallas PUENTE (Vecinos, Inventario): un número
     cierto para el veredicto y, si existe, la mini-lista de solo lectura. */
  const [puenteVecinos, setPuenteVecinos] = useState<{ total: number } | null>(null);

  // Cargar datos reales según el tab activo
  const cargarPanelReal = useCallback(async () => {
    if (hijoId === 'muni') {
      const data = await cargarDatosFormularioMuni();
      setDatosMuni(data);
    } else if (['tipos-poi', 'cat-inv', 'cat-reclamo'].includes(hijoId)) {
      const catData = await cargarCatalogoReal(hijoId);
      setCatalogoReal(catData);
    } else if (hijoId === 'vecinos') {
      const res = await dashboardApi.getStats();
      setPuenteVecinos({ total: res.data?.total ?? 0 });
    }
  }, [hijoId]);

  useEffect(() => {
    cargarPanelReal();
  }, [cargarPanelReal]);

  const handleSaveMuni = async (datos: DatosFormularioMuni) => {
    try {
      setSavingMuni(true);
      await guardarDatosFormularioMuni(datos);
      setDatosMuni(datos);
      toast.success('Datos del municipio guardados correctamente');
    } catch {
      toast.error('Error al guardar datos del municipio');
    } finally {
      setSavingMuni(false);
    }
  };

  const handlePadreClick = (id: string) => {
    setPadreActivo(id);
    const hijoDef = hijosActivos[id] || arbol.find(p => p.id === id)?.hijos[0].id;
    setSearchParams({ tab: id, sub: hijoDef || '' }, { replace: true });
  };

  const handleHijoClick = (id: string) => {
    setHijosActivos(prev => ({ ...prev, [padreActivo]: id }));
    setSearchParams({ tab: padreActivo, sub: id }, { replace: true });
  };

  /* Alta del ajuste activo. `recarga` se incrementa al guardar: va como `key`
     del panel, que es la forma más barata de que la pantalla vuelva a pedir
     sus datos sin que este contenedor sepa cómo los trae. */
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [recarga, setRecarga] = useState(0);
  // Dependencia en edición (sheet del ADN: identidad + contacto local).
  const [depEnEdicion, setDepEnEdicion] = useState<DependenciaEditable | null>(null);
  const SheetDeAlta = ALTA_DE_AJUSTE[hijoId];

  /* Contadores del riel. Los del árbol son del prototipo (Dependencias decía
     11 y hay 5). Cada pantalla publica su total REAL por `reportarTotal` en
     cuanto lo carga, y ese gana sobre el número de muestra. */
  const [totales, setTotales] = useState<Record<string, number>>({});
  const reportarTotal = useCallback((slotId: string, total: number) => {
    setTotales((prev) => (prev[slotId] === total ? prev : { ...prev, [slotId]: total }));
  }, []);

  /** Salta a un ajuste de cualquier grupo (lo usa el buscador). */
  const irAlAjuste = (grupoId: string, ajusteId: string) => {
    setPadreActivo(grupoId);
    setHijosActivos(prev => ({ ...prev, [grupoId]: ajusteId }));
    setSearchParams({ tab: grupoId, sub: ajusteId }, { replace: true });
    setBuscadorAbierto(false);
    setConsulta('');
  };

  /**
   * El total que publicó la pantalla, o NADA.
   *
   * A propósito no cae al número del prototipo: "Dependencias 11" cuando hay 5
   * es un dato inventado que se lee como real, y el riel es justo donde se
   * mira de reojo sin entrar. Un hueco no engaña a nadie; el número aparece
   * en cuanto la pantalla carga lo suyo.
   */
  const totalDe = (h: any): number | '' => (totales[h.id] !== undefined ? totales[h.id] : '');

  const mainTabsData: MainTabItem[] = arbol.map(p => ({
    id: p.id,
    label: p.label,
    isActive: p.id === padreActivo,
    n: p.hijos.reduce((sum: number, h: any) => sum + (Number(totalDe(h)) || 0), 0) || ''
  }));

  const sidebarTabsData: SidebarTabItem[] = padre.hijos.map((h: any) => ({
    id: h.id,
    label: h.label,
    isActive: h.id === hijoId,
    n: totalDe(h),
  }));

  const tituloRiel = padre.label.toUpperCase();
  const tipo = hijo.tipo;

  /* PANTALLAS REALES embebidas por ajuste (dueño, 2026-09-02: "dejémosle
     andando los ABM a tesorería"). La promoción del 01-09 dejó al cliente
     productivo sin sus ABMs: el sidebar se los había cedido a Configuración
     ("se llega por el tile") y estos paneles quedaron de SÓLO LECTURA — sin
     alta (ALTA_DE_AJUSTE vacío), sin lápiz (onEditarFila sólo en
     dependencias) y con píldoras sin filtro. Hasta que cada panel tenga su
     edición propia, acá va la pantalla real completa — mismo patrón que
     Inventario y Depósitos. ConfiguracionTesoreria conserva su barra de tabs
     a propósito: Conceptos y Parajes no tienen entrada en este riel. */
  const EMBEBIDO: Record<string, React.ReactNode> = {
    conceptos: <ConfiguracionTesoreria tabInicial="conceptos" />,
    'conceptos-liq': <ConfiguracionTesoreria tabInicial="conceptos-liq" />,
    cajas: <ConfiguracionTesoreria tabInicial="cajas" />,
    retenciones: <ConfiguracionTesoreria tabInicial="retenciones" />,
    parajes: <ConfiguracionTesoreria tabInicial="parajes" />,
    proyectos: <ConfiguracionTesoreria tabInicial="proyectos" />,
    'tipos-empleado': <ConfiguracionTesoreria tabInicial="tipos-empleado" />,
    contactos: <TesoreriaContactos />,
    tarjetas: <TarjetasCredito />,
    tasas: <GestionTasas />,
    empleados: <Empleados />,
  };
  const pantallaEmbebida = EMBEBIDO[hijoId];

  let data: any = null;
  if (tipo === 'abm') {
    // El spec sale de `canvasAbmSpec` (copia tipada del canvas), no del mock:
    // es la misma estructura para las 17 entidades y no arrastra los hex del
    // prototipo. Las FILAS de acá son de muestra; las reales las trae el
    // propio `AbmDeConfiguracion` con `ajusteId`.
    data = ABM_SPEC[hijoId] ?? (MockData.abmSpec ? MockData.abmSpec(hijoId) : null);
  } else if (tipo === 'asignacion') {
    // La pantalla se autoabastece (AsignacionDelCanvas trae sus datos).
    data = null;
  } else if (tipo === 'catalogo') {
    data = catalogoReal || MockData.datosDe(hijoId);
  } else if (tipo === 'arbol') {
    data = MockData.tramites ? MockData.tramites() : null;
  } else {
    data = MockData.datosDe(hijoId);
  }

  return (
    <div className="config-wrapper">
      <div className="config-hero">
        <div className="config-hero-fila">
          <div className="config-hero-texto">
            {/* La marca sale de BRAND (host/ruta), no escrita a mano: con
                "PARAGUAY LIMPIO" fijo, Munify mostraba la marca ajena. */}
            <span className="config-eyebrow">CONFIGURACIÓN · {BRAND.name.toUpperCase()}</span>
            <h1 className="config-titulo">Cómo está armado el municipio</h1>
            <p className="config-bajada">
              Las listas y las reglas que usa toda la app: quién atiende cada cosa, en cuántos días y qué le pide al vecino.
            </p>
          </div>
          {buscadorAbierto ? (
            <div className="config-buscar config-buscar--abierto">
              <Search size={15} strokeWidth={2} aria-hidden />
              <input
                ref={inputBuscar}
                className="config-buscar-input"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Buscar un ajuste…"
                aria-label="Buscar un ajuste"
              />
              <button
                type="button"
                className="config-buscar-cerrar"
                onClick={() => { setBuscadorAbierto(false); setConsulta(''); }}
                aria-label="Cerrar el buscador"
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
              {!!resultados.length && (
                <ul className="config-buscar-lista">
                  {resultados.map((r) => (
                    <li key={`${r.grupoId}-${r.id}`}>
                      <button type="button" onClick={() => irAlAjuste(r.grupoId, r.id)}>
                        <span className="config-buscar-ajuste">{r.label}</span>
                        <span className="config-buscar-grupo">{r.grupo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!!consulta.trim() && !resultados.length && (
                <p className="config-buscar-vacio">Ningún ajuste se llama así.</p>
              )}
            </div>
          ) : (
            <button type="button" className="config-buscar" onClick={() => setBuscadorAbierto(true)}>
              <Search size={15} strokeWidth={2} aria-hidden />
              <span className="config-buscar-texto">Buscar un ajuste</span>
              <span className="config-buscar-atajo">Ctrl K</span>
            </button>
          )}
        </div>
      </div>

      <MainTabs tabs={mainTabsData} onTabClick={handlePadreClick} />

      <div className="config-cuerpo">
        <SidebarTabs tituloRiel={tituloRiel} tabs={sidebarTabsData} onTabClick={handleHijoClick} />

        {/* El panel embebe pantallas COMPLETAS: el provider les avisa que el
            título ya lo puso este contenedor, y les da por dónde publicar su
            total para el contador del riel. */}
        <EmbedProvider slotId={hijoId} reportarTotal={reportarTotal}>
        <div className="config-panel">
          {/* WhatsApp e IA tienen su pantalla completa: puente, no un form
              ajeno (antes las tres pestañas `form` mostraban los datos del
              municipio, que era directamente otro contenido). */}
          {tipo === 'form' && hijoId === 'wa' && (
            <PantallaDeAjuste
              eyebrow={`${padre.label.toUpperCase()} · WHATSAPP`}
              veredicto="La línea de WhatsApp por la que entran reclamos y salen los avisos de estado."
              resaltado="entran reclamos y salen los avisos"
              tono="bueno"
            >
              <PuenteDeModulo
                configuraAca={[
                  { label: 'Categorías de reclamo', nota: 'Lo que el bot le ofrece al vecino', grupoId: 'reclamos', ajusteId: 'cat-reclamo' },
                  { label: 'Asignaciones', nota: 'A quién se deriva lo que entra por WhatsApp', grupoId: 'municipio', ajusteId: 'asignacion' },
                ]}
                viveEn={{
                  titulo: 'Vive en Integraciones',
                  motivo: 'La línea, las plantillas y el estado de la conexión se gestionan en su pantalla completa.',
                  checklist: ['Conectar o rotar la línea', 'Probar el envío de avisos', 'Ver el estado de la conexión'],
                  botonLabel: 'Abrir WhatsApp',
                  ruta: '/gestion/whatsapp',
                }}
                onIrAlAjuste={irAlAjuste}
              />
            </PantallaDeAjuste>
          )}

          {tipo === 'form' && hijoId === 'ia' && (
            <PantallaDeAjuste
              eyebrow={`${padre.label.toUpperCase()} · IA`}
              veredicto="Clasificación automática de reclamos y redacción de respuestas al vecino."
              resaltado="Clasificación automática"
              tono="bueno"
            >
              <PuenteDeModulo
                configuraAca={[
                  { label: 'Categorías de reclamo', nota: 'Las clases entre las que la IA elige', grupoId: 'reclamos', ajusteId: 'cat-reclamo' },
                  { label: 'Asignaciones', nota: 'Las reglas que la IA sugiere completar', grupoId: 'municipio', ajusteId: 'asignacion' },
                ]}
                viveEn={{
                  titulo: 'Vive en Integraciones',
                  motivo: 'El proveedor, el modelo y las pruebas de clasificación se gestionan en su pantalla completa.',
                  checklist: ['Elegir proveedor y modelo', 'Probar la clasificación con un texto real', 'Ver el estado de la conexión'],
                  botonLabel: 'Abrir configuración de IA',
                  ruta: '/gestion/configuracion-ia',
                }}
                onIrAlAjuste={irAlAjuste}
              />
            </PantallaDeAjuste>
          )}

          {tipo === 'form' && hijoId !== 'wa' && hijoId !== 'ia' && (
            <PantallaDeAjuste
              eyebrow={`${padre.label.toUpperCase()} · IDENTIDAD`}
              veredicto={
                datosMuni?.nombrePublico
                  ? `El vecino ve "${datosMuni.nombrePublico}" en la app, y estos son los datos por los que te va a buscar.`
                  : 'Identidad y contacto público del municipio: lo que el vecino ve en la app.'
              }
              resaltado={datosMuni?.nombrePublico ? `"${datosMuni.nombrePublico}"` : undefined}
              tono={datosMuni?.nombrePublico ? 'bueno' : undefined}
            >
              <>
                <PanelFormulario
                  nombreMunicipio={datosMuni?.nombreMunicipio}
                  nombrePublico={datosMuni?.nombrePublico}
                  ruc={datosMuni?.ruc}
                  departamento={datosMuni?.departamento}
                  telefono={datosMuni?.telefono}
                  email={datosMuni?.email}
                  saving={savingMuni}
                  onSave={handleSaveMuni}
                />
                {/* Sólo aparece en municipios demo (el propio card lo decide). */}
                <DemoDniCard />
              </>
            </PantallaDeAjuste>
          )}

          {tipo === 'apariencia' && (
            <PantallaDeAjuste
              eyebrow={`${padre.label.toUpperCase()} · APARIENCIA`}
              veredicto="Claro u oscuro, el fondo y el color de acento. Lo que elijas acá se aplica a toda la app, incluida esta pantalla."
              resaltado="incluida esta pantalla"
              tono="bueno"
            >
              <PanelApariencia
                veloMarca={theme.primary} acento={theme.primary}
                nombreAcento={accents.find((a) => a.id === currentAccentId)?.name ?? ''}
                temas={temasApariencia} acentos={acentosApariencia} barras={barrasApariencia}
                onTemaSelect={setPreset}
                onAcentoSelect={setAccent}
                onBarraSelect={(id) => setSidebarMode(id as SidebarMode)}
              />
            </PantallaDeAjuste>
          )}

          {tipo === 'qr' && (
            <PantallaDeAjuste
              eyebrow={`${padre.label.toUpperCase()} · CARTELERÍA`}
              veredicto="Carteles con QR para pegar en la calle: el vecino escanea y el reclamo entra ya ubicado, sin que tenga que escribir la dirección."
              resaltado="ya ubicado"
              tono="bueno"
            >
              <PanelQr />
            </PantallaDeAjuste>
          )}

          {/* La pantalla real del ajuste, cuando existe: gana sobre el panel
              de sólo lectura del canvas. El key por ajuste es OBLIGATORIO:
              varias entradas del riel montan el MISMO componente con distinto
              `tabInicial` (ConfiguracionTesoreria), y sin key React reconcilia
              en vez de remontar — el usuario clickea "Retenciones" en el riel
              y sigue viendo Cajas. */}
          {pantallaEmbebida && (
            <React.Fragment key={hijoId}>{pantallaEmbebida}</React.Fragment>
          )}

          {tipo === 'catalogo' && !pantallaEmbebida && data && (
            <CatalogoDelCanvas
              spec={data}
              title={hijo.label}
              eyebrow={hijo.label.toUpperCase()}
              moduleKey={hijoId}
            />
          )}

          {tipo === 'asignacion' && (
            <AsignacionDelCanvas title={hijo.label} />
          )}

          {/* Vecinos e Inventario son PUENTES (canvas): el módulo vive en otro
              lado; acá se llega, no se edita. Antes eran ABMs con filas de
              muestra ("Vecinos 3.412" inventado). */}
          {tipo === 'abm' && hijoId === 'vecinos' && (
            <PantallaDeAjuste
              eyebrow={`${padre.label.toUpperCase()} · PADRÓN`}
              veredicto={
                puenteVecinos
                  ? `El padrón vive en Atención al vecino: acá se llega, no se edita. Sus vecinos ya cargaron ${puenteVecinos.total.toLocaleString('es-AR')} reclamos.`
                  : 'El padrón vive en Atención al vecino: acá se llega, no se edita.'
              }
              resaltado={puenteVecinos ? `${puenteVecinos.total.toLocaleString('es-AR')} reclamos` : undefined}
              tono="bueno"
            >
              <PuenteDeModulo
                configuraAca={[
                  { label: 'Categorías de reclamo', nota: 'Lo que el vecino elige al cargar', grupoId: 'reclamos', ajusteId: 'cat-reclamo' },
                  { label: 'Trámites', nota: 'El catálogo con sus prerrequisitos', grupoId: 'tramites', ajusteId: 'arbol-tramite' },
                  { label: 'SLA', nota: 'Los plazos que la app le promete', grupoId: 'reclamos', ajusteId: 'sla' },
                ]}
                viveEn={{
                  titulo: 'Vive en Atención al vecino',
                  motivo: 'El padrón tiene identidad, historial y notificaciones: es operación diaria, no configuración.',
                  checklist: ['Ver el legajo y el historial de cada vecino', 'Validar identidad (KYC)', 'Contactarlo desde la app'],
                  botonLabel: 'Abrir el padrón de vecinos',
                  ruta: '/gestion/usuarios',
                }}
                onIrAlAjuste={irAlAjuste}
              />
            </PantallaDeAjuste>
          )}

          {/* Depósitos: el ABM completo embebido, con alta y edición. Es el
              catálogo que la pantalla venía prometiendo sin que existiera
              (dueño, 2026-08-31). */}
          {tipo === 'abm' && hijoId === 'depositos' && <InventarioDepositosConfig />}

          {/* El CATALOGO, embebido — no un cartel que manda a otra pantalla.
              Es un ABM de ficha: una fila solo cambia si alguien la edita a
              mano, igual que Personal o Cuadrillas, y por eso vive en
              Configuracion y no en el sidebar. Lo que se mueve todos los dias
              —el stock— tiene sus propias pantallas: Movimientos y Compras
              (dueño, 2026-08-31). */}
          {tipo === 'abm' && hijoId === 'inv' && <Inventario />}

          {tipo === 'abm' && !pantallaEmbebida && hijoId !== 'vecinos' && hijoId !== 'inv' && hijoId !== 'depositos' && data && (
            <AbmDeConfiguracion
              key={`${hijoId}-${recarga}`}
              spec={data}
              title={hijo.label}
              moduleKey={hijoId}
              descripcion={DESCRIPCION_AJUSTE[hijoId]}
              // Sin `ajusteId` el componente nunca mira `CABLEADO` y pinta las
              // filas de muestra del canvas. Con él, cada pantalla trae sus
              // datos del municipio sola.
              ajusteId={hijoId}
              // Sin sheet de alta no se dibuja el CTA: mejor sin botón que con
              // un botón que no hace nada.
              onNuevo={SheetDeAlta ? () => setAltaAbierta(true) : undefined}
              // Dependencias edita su ADN (identidad + contacto) con el lápiz.
              onEditarFila={hijoId === 'dependencias'
                ? (fila) => setDepEnEdicion((fila.raw as DependenciaEditable) ?? null)
                : undefined}
            />
          )}

          <DependenciaSheet
            open={depEnEdicion !== null}
            dependencia={depEnEdicion}
            onClose={() => setDepEnEdicion(null)}
            onGuardado={() => setRecarga((r) => r + 1)}
          />

          {tipo === 'arbol' && (
            <ArbolDelCanvas />
          )}

        </div>
        </EmbedProvider>
      </div>

      {SheetDeAlta && (
        <SheetDeAlta
          open={altaAbierta}
          onClose={() => setAltaAbierta(false)}
          onGuardado={() => setRecarga((n) => n + 1)}
        />
      )}
    </div>
  );
}
