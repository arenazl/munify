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
import PanelQr from './panels/PanelQr';
import CatalogoDelCanvas from '../../components/config/CatalogoDelCanvas';
import AsignacionDelCanvas from '../../components/config/AsignacionDelCanvas';
import ArbolDelCanvas from '../../components/config/ArbolDelCanvas';
import AbmDeConfiguracion from '../../components/config/AbmDeConfiguracion';
import { EmbedProvider } from '../../components/abmv2/EmbedContext';
import { ALTA_DE_AJUSTE } from '../../components/config/altasDeAjuste';
import { MockData } from './data/mockData';
import { ABM_SPEC, DESCRIPCION_AJUSTE } from '../../config/canvasAbmSpec';
// OJO: hay DOS `FilaCatalogo` en el repo — el del spec del canvas
// (`canvasConfigSpec`) y el del panel. `cargarCatalogoReal` devuelve el del
// panel, que es el que va acá. Unificarlos es deuda abierta.
import type { FilaCatalogo } from './panels/PanelCatalogo';
import type { GrupoAsig, TabAsig } from './panels/PanelAsignacion';
import { useTheme } from '../../contexts/ThemeContext';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import { 
  cargarDatosFormularioMuni, 
  guardarDatosFormularioMuni, 
  cargarCatalogoReal, 
  cargarAsignacionReal,
  type DatosFormularioMuni 
} from './data/datosRealesConfig';

export default function Configuracion() {
  const { theme, setPreset, setAccent, alternarModo } = useTheme();
  const { isSuperAdmin } = useSuperAdmin();
  /* El grupo Super Admin (auditoría, suscripciones, config del sidebar) es
     cross-tenant: un admin municipal no tiene nada que hacer ahí y verlo
     invita a tocarlo. Super admin = admin SIN municipio_id. */
  const arbol = useMemo(
    () => MockData.arbol().filter((g: any) => g.id !== 'super' || isSuperAdmin),
    [isSuperAdmin],
  );
  const [searchParams, setSearchParams] = useSearchParams();

  const urlPadre = searchParams.get('tab');
  const urlHijo = searchParams.get('sub');

  const [padreActivo, setPadreActivo] = useState(urlPadre || arbol[0].id);
  const [hijosActivos, setHijosActivos] = useState<Record<string, string>>({
    general: 'muni',
    personal: 'empleados',
    vecino: 'vecinos',
    catalogos: 'dependencias',
    inventario: 'inv',
    tesoreria: 'conceptos',
    integraciones: 'pagos',
    super: 'auditoria'
  });

  // Datos reales controlados
  const [datosMuni, setDatosMuni] = useState<DatosFormularioMuni | null>(null);
  const [savingMuni, setSavingMuni] = useState(false);
  const [catalogoReal, setCatalogoReal] = useState<{ veredicto: string; filas: FilaCatalogo[]; pie: string } | null>(null);
  const [asigReal, setAsigReal] = useState<{ tabsAsig: TabAsig[]; haySugerencias: boolean; labelSugerencias: string; gruposAsig: GrupoAsig[]; pieAsig: string } | null>(null);

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

  // Cargar datos reales según el tab activo
  const cargarPanelReal = useCallback(async () => {
    if (hijoId === 'muni') {
      const data = await cargarDatosFormularioMuni();
      setDatosMuni(data);
    } else if (['tipos-poi', 'cat-inv', 'cat-reclamo'].includes(hijoId)) {
      const catData = await cargarCatalogoReal(hijoId);
      setCatalogoReal(catData);
    } else if (hijoId === 'asignacion') {
      const asigData = await cargarAsignacionReal();
      setAsigReal(asigData);
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
  
  let data: any = null;
  if (tipo === 'abm') {
    // El spec sale de `canvasAbmSpec` (copia tipada del canvas), no del mock:
    // es la misma estructura para las 17 entidades y no arrastra los hex del
    // prototipo. Las FILAS de acá son de muestra; las reales las trae el
    // propio `AbmDeConfiguracion` con `ajusteId`.
    data = ABM_SPEC[hijoId] ?? (MockData.abmSpec ? MockData.abmSpec(hijoId) : null);
  } else if (tipo === 'asignacion') {
    data = asigReal || (MockData.puenteSpec ? MockData.puenteSpec(hijoId) : null);
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
          {tipo === 'form' && (
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
                veloMarca={theme.primary} acento={theme.primary} nombreAcento="Verde Bosque"
                temas={[]} acentos={[]} barras={[]}
                onTemaSelect={(id) => {
                  if (id === 't3') alternarModo();
                  else setPreset(id as any);
                }}
                onAcentoSelect={(id) => setAccent(id as any)}
                onBarraSelect={() => {}}
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

          {tipo === 'catalogo' && data && (
            <CatalogoDelCanvas 
              spec={data} 
              title={hijo.label} 
              eyebrow={hijo.label.toUpperCase()} 
              moduleKey={hijoId} 
            />
          )}

          {tipo === 'asignacion' && (
            <AsignacionDelCanvas 
              title={hijo.label} 
              veredicto={(data as any)?.veredicto || ''} 
            />
          )}

          {tipo === 'abm' && data && (
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
            />
          )}

          {tipo === 'arbol' && data && (
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
