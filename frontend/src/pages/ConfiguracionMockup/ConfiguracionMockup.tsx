import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import './ConfiguracionMockup.css';
import MainTabs, { MainTabItem } from './components/MainTabs';
import SidebarTabs, { SidebarTabItem } from './components/SidebarTabs';
import PanelHeader from './components/PanelHeader';
import PanelFormulario from './panels/PanelFormulario';
import PanelApariencia from './panels/PanelApariencia';
import PanelQr from './panels/PanelQr';
import CatalogoDelCanvas from '../../components/config/CatalogoDelCanvas';
import AsignacionDelCanvas from '../../components/config/AsignacionDelCanvas';
import ArbolDelCanvas from '../../components/config/ArbolDelCanvas';
import AbmDeConfiguracion from '../../components/config/AbmDeConfiguracion';
import { MockData } from './data/mockData';
import { ABM_SPEC, DESCRIPCION_AJUSTE } from '../../config/canvasAbmSpec';
// OJO: hay DOS `FilaCatalogo` en el repo — el del spec del canvas
// (`canvasConfigSpec`) y el del panel. `cargarCatalogoReal` devuelve el del
// panel, que es el que va acá. Unificarlos es deuda abierta.
import type { FilaCatalogo } from './panels/PanelCatalogo';
import type { GrupoAsig, TabAsig } from './panels/PanelAsignacion';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  cargarDatosFormularioMuni, 
  guardarDatosFormularioMuni, 
  cargarCatalogoReal, 
  cargarAsignacionReal,
  type DatosFormularioMuni 
} from './data/datosRealesConfig';

export default function ConfiguracionMockup() {
  const { theme, setPreset, setAccent, alternarModo } = useTheme();
  const arbol = MockData.arbol();
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

  const padre = arbol.find(p => p.id === padreActivo)!;
  const hijoId = hijosActivos[padreActivo] || padre.hijos[0].id;
  const hijo = padre.hijos.find(h => h.id === hijoId)!;

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

  const mainTabsData: MainTabItem[] = arbol.map(p => ({
    id: p.id,
    label: p.label,
    isActive: p.id === padreActivo,
    n: p.hijos.reduce((sum: number, h: any) => sum + (h.n ? parseInt(h.n.toString().replace('.', ''), 10) : 0), 0) || ''
  }));

  const sidebarTabsData: SidebarTabItem[] = padre.hijos.map((h: any) => ({
    id: h.id,
    label: h.label,
    isActive: h.id === hijoId,
    n: h.n !== undefined ? parseInt(h.n.toString().replace('.', ''), 10) : ''
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
    <div className="config-mockup-wrapper">
      <div style={{ background: '#F1F4F2', padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap', rowGap: '14px' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.11em', color: '#7A8783' }}>CONFIGURACIÓN · PARAGUAY LIMPIO</span>
            <h1 style={{ margin: '8px 0 0', fontFamily: 'Sora, sans-serif', fontSize: '28px', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#0D1412', textWrap: 'pretty' }}>Cómo está armado el municipio</h1>
            <p style={{ margin: '10px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: '#5B6764', textWrap: 'pretty', maxWidth: '76ch' }}>Las listas y las reglas que usa toda la app: quién atiende cada cosa, en cuántos días y qué le pide al vecino.</p>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '11px', minWidth: '240px', flex: '0 0 auto', marginTop: '22px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA5A1" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 15px' }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span style={{ fontSize: '12.5px', color: '#9AA5A1', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Buscar un ajuste</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9AA5A1', border: '1px solid rgba(13,20,18,0.1)', borderRadius: '5px', padding: '1px 4px', flex: '0 0 auto' }}>⌘K</span>
          </span>
        </div>
      </div>

      <MainTabs tabs={mainTabsData} onTabClick={handlePadreClick} />

      <div style={{ display: 'grid', gridTemplateColumns: '236px minmax(0, 1fr)', gap: '20px', padding: '18px 20px 40px', alignItems: 'start' }}>
        <SidebarTabs tituloRiel={tituloRiel} tabs={sidebarTabsData} onTabClick={handleHijoClick} />

        <div style={{ minWidth: 0 }}>
          {tipo === 'form' && (
            <>
              <PanelHeader titulo={hijo.label} veredicto="Identidad y contacto público del municipio." />
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
            </>
          )}

          {tipo === 'apariencia' && (
            <>
              <PanelHeader titulo="Apariencia y Colores" veredicto="La estética de la aplicación adaptada a la identidad del municipio." />
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
            </>
          )}

          {tipo === 'qr' && (
            <>
              <PanelHeader titulo="Cartelería QR" veredicto="Generá e imprimí carteles con código QR para facilitar la carga de reclamos desde ubicaciones específicas." />
              <PanelQr />
            </>
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
              spec={data}
              title={hijo.label}
              moduleKey={hijoId}
              descripcion={DESCRIPCION_AJUSTE[hijoId]}
              // Sin `ajusteId` el componente nunca mira `CABLEADO` y pinta las
              // filas de muestra del canvas. Con él, cada pantalla trae sus
              // datos del municipio sola.
              ajusteId={hijoId}
            />
          )}

          {tipo === 'arbol' && data && (
            <ArbolDelCanvas />
          )}

        </div>
      </div>
    </div>
  );
}
